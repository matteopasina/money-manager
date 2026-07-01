"""
Revolut live sync via the Enable Banking API.

Enable Banking is a PSD2 open-banking aggregator with a self-serve "restricted
production" mode: once an application is registered, it can fetch data from
accounts the developer explicitly links themselves — no business/KYB process
required. This is the account-info equivalent of what GoCardless used to offer
before it closed to new signups, and what Saltedge requires a business account
for.

One-time setup flow:
  1. Register an application at enablebanking.com/cp (Production environment,
     "Generate in the browser" key option). Save the Application ID and the
     downloaded private key.
  2. Enter both in Connections -> Revolut -> Save.
  3. Look up the exact Revolut institution entry for your country, select it.
  4. Click "Connect to Revolut" -> authorise in the browser -> redirected back
     with a `code` param, which the frontend exchanges automatically.
  5. Sync Transactions / Sync Balance on demand.

Enable Banking API docs: https://enablebanking.com/docs/api/reference/
"""
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query

import database as db
import enablebanking as eb
from categoriser import categorise

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/revolut", tags=["revolut"])

# Shared Enable Banking plumbing (JWT auth + HTTP), used by Revolut and BBVA alike.
_eb_get = eb.get
_eb_post = eb.post


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_account(account_id: int):
    account = next((a for a in db.get_accounts() if a.id == account_id), None)
    if not account:
        raise HTTPException(400, f"Account {account_id} not found")
    return account


# ── Institution lookup ─────────────────────────────────────────────────────────

@router.get("/aspsps")
def list_aspsps(country: str = Query(default="LT"), search: str = Query(default="revolut")):
    """Look up the exact Revolut ASPSP entry for a given country."""
    data = _eb_get("/aspsps", {"country": country.upper()})
    aspsps = data.get("aspsps", [])
    matches = [a for a in aspsps if search.lower() in a.get("name", "").lower()]
    return [{"name": a["name"], "country": a["country"]} for a in matches]


# ── Connect (bank authorisation) ────────────────────────────────────────────────

@router.post("/connect")
def connect(redirect_uri: str = Query(default="https://localhost:5173/connections")):
    aspsp_name    = db.get_setting("revolut_eb_aspsp_name", "").strip()
    aspsp_country = db.get_setting("revolut_eb_aspsp_country", "").strip()
    if not aspsp_name or not aspsp_country:
        raise HTTPException(400, "Look up and save the Revolut institution first")

    valid_until = (datetime.utcnow() + timedelta(days=180)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    data = _eb_post("/auth", {
        "aspsp": {"name": aspsp_name, "country": aspsp_country},
        "access": {"valid_until": valid_until},
        "state": "revolut",
        "redirect_url": redirect_uri,
        "psu_type": "personal",
    })
    return {"url": data["url"]}


@router.post("/exchange-code")
def exchange_code(code: str = Query(...)):
    """Called by the frontend after the bank redirects back with ?code=...&state=revolut."""
    data = _eb_post("/sessions", {"code": code})
    session_id = data["session_id"]
    accounts = data.get("accounts", [])

    db.set_setting("revolut_eb_session_id", session_id)
    if accounts:
        db.set_setting("revolut_eb_account_uid", accounts[0]["uid"])

    return {
        "session_id": session_id,
        "accounts": [
            {"uid": a["uid"], "name": a.get("name", ""), "currency": a.get("currency", "")}
            for a in accounts
        ],
    }


@router.get("/link-status")
def link_status():
    session_id = db.get_setting("revolut_eb_session_id", "").strip()
    if not session_id:
        return {"status": "not_connected"}
    try:
        data = _eb_get(f"/sessions/{session_id}")
    except HTTPException:
        return {"status": "expired"}
    # GET /sessions/{id} returns `accounts` as a list of UID strings and
    # `accounts_data` as objects (uid + hashes, no name/currency). Report the
    # status and the UID currently wired up for syncing.
    if data.get("status") != "AUTHORIZED":
        return {"status": "expired"}
    return {
        "status": "active",
        "account_uid": db.get_setting("revolut_eb_account_uid", "").strip(),
        "account_count": len(data.get("accounts", [])),
    }


# ── Sync transactions ─────────────────────────────────────────────────────────

@router.post("/sync/transactions")
def sync_transactions(account_id: int = Query(...), days: int = Query(default=90)):
    account = _get_account(account_id)
    uid = db.get_setting("revolut_eb_account_uid", "").strip()
    if not uid:
        raise HTTPException(400, "Revolut not linked — connect first in Connections")

    date_from = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
    data = _eb_get(f"/accounts/{uid}/transactions", {"date_from": date_from})
    txns_data = data.get("transactions", [])

    rules  = db.get_keyword_rules()
    cat_fn = lambda desc, ref: categorise(desc, ref, rules)
    base   = db.get_base_currency().upper()

    rows = []
    for t in txns_data:
        try:
            amt_obj = t.get("transaction_amount", {})
            amount  = float(amt_obj.get("amount", 0))
            if amount == 0:
                continue
            if t.get("credit_debit_indicator") == "DBIT":
                amount = -amount

            currency = (amt_obj.get("currency") or account.currency).upper()
            rate     = db.get_rate(currency)
            amount_base = amount if currency == base else amount * rate

            desc = " ".join(t.get("remittance_information") or []).strip() or "Revolut transaction"
            ref  = t.get("entry_reference") or t.get("transaction_id") or ""
            date = t.get("booking_date") or (t.get("transaction_date") or "")[:10]
            cat  = cat_fn(desc, ref)

            rows.append({
                "account_id": account.id,
                "date": date,
                "value_date": t.get("value_date"),
                "description": desc,
                "reference": ref,
                "amount": amount,
                "amount_base": round(amount_base, 4),
                "category": cat,
                "balance": None,
                "notes": None,
            })
        except Exception as e:
            logger.warning("Revolut: skipping transaction: %s", e)

    inserted, skipped = db.insert_transactions(rows)
    return {"inserted": inserted, "skipped": skipped}


# ── Sync balance ──────────────────────────────────────────────────────────────

@router.post("/sync/balances")
def sync_balances(account_id: int = Query(...)):
    account = _get_account(account_id)
    uid = db.get_setting("revolut_eb_account_uid", "").strip()
    if not uid:
        raise HTTPException(400, "Revolut not linked — connect first in Connections")

    data = _eb_get(f"/accounts/{uid}/balances")
    balances = data.get("balances", [])
    if not balances:
        raise HTTPException(502, "No balance returned by Enable Banking")

    bal = next((b for b in balances if b.get("balance_type") == "CLBD"), balances[0])
    amount   = float(bal["balance_amount"]["amount"])
    currency = (bal["balance_amount"].get("currency") or account.currency).upper()
    base     = db.get_base_currency().upper()
    rate     = db.get_rate(currency)
    amount_base = amount if currency == base else amount * rate
    today    = datetime.utcnow().strftime("%Y-%m-%d")

    inserted = db.upsert_balances([(account.id, today, amount, round(amount_base, 4))])
    return {"inserted": inserted, "skipped": 0}
