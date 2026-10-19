"""
BBVA (Italy) live sync via the Enable Banking API.

Same open-banking aggregator and shared application credentials as the Revolut
integration (see backend/enablebanking.py) — only the institution (BBVA) and the
per-bank session/account UID differ. Access is read-only (PSD2 AIS).

One-time setup flow:
  1. Register an Enable Banking application (shared with Revolut) and link your
     BBVA account in the Enable Banking control panel / via the connect flow.
  2. In Connections -> BBVA: look up the BBVA institution for country IT, select
     it, Save, then "Connect to BBVA" -> authorise -> redirected back with a
     `code`, exchanged automatically by the frontend.
  3. Sync Transactions / Sync Balance on demand.

Enable Banking API docs: https://enablebanking.com/docs/api/reference/
"""
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query

import database as db
import enablebanking as eb
from categoriser import categorise

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/bbva", tags=["bbva"])

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
def list_aspsps(country: str = Query(default="IT"), search: str = Query(default="bbva")):
    """Look up the exact BBVA ASPSP entry for a given country."""
    data = _eb_get("/aspsps", {"country": country.upper()})
    aspsps = data.get("aspsps", [])
    matches = [a for a in aspsps if search.lower() in a.get("name", "").lower()]
    return [{"name": a["name"], "country": a["country"]} for a in matches]


# ── Connect (bank authorisation) ────────────────────────────────────────────────

@router.post("/connect")
def connect(redirect_uri: str = Query(default="https://localhost:5173/connections")):
    aspsp_name    = db.get_setting("bbva_eb_aspsp_name", "").strip()
    aspsp_country = db.get_setting("bbva_eb_aspsp_country", "").strip()
    if not aspsp_name or not aspsp_country:
        raise HTTPException(400, "Look up and save the BBVA institution first")

    valid_until = (datetime.now(timezone.utc) + timedelta(days=180)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    data = _eb_post("/auth", {
        "aspsp": {"name": aspsp_name, "country": aspsp_country},
        "access": {"valid_until": valid_until},
        "state": "bbva",
        "redirect_url": redirect_uri,
        "psu_type": "personal",
    })
    return {"url": data["url"]}


@router.post("/exchange-code")
def exchange_code(code: str = Query(...)):
    """Called by the frontend after the bank redirects back with ?code=...&state=bbva."""
    data = _eb_post("/sessions", {"code": code})
    session_id = data["session_id"]
    accounts = data.get("accounts", [])

    db.set_setting("bbva_eb_session_id", session_id)
    if accounts:
        db.set_setting("bbva_eb_account_uid", accounts[0]["uid"])

    return {
        "session_id": session_id,
        "accounts": [
            {"uid": a["uid"], "name": a.get("name", ""), "currency": a.get("currency", "")}
            for a in accounts
        ],
    }


@router.get("/link-status")
def link_status():
    return eb.session_status("bbva", get_page=_eb_get)


# ── Sync transactions ─────────────────────────────────────────────────────────

@router.post("/sync/transactions")
def sync_transactions(account_id: int = Query(...), days: int = Query(default=90, ge=1, le=90)):
    account = _get_account(account_id)
    uid = db.get_setting("bbva_eb_account_uid", "").strip()
    if not uid:
        raise HTTPException(400, "BBVA not linked — connect first in Connections")

    # Both endpoints are inclusive: 90 days means today plus 89 earlier days.
    today = datetime.now(timezone.utc).date()
    date_from = (today - timedelta(days=days - 1)).isoformat()
    # Floor: Enable Banking sends Spanish descriptions while the historical
    # Excel imports were Italian, so the same transaction dodges the
    # (date, description, amount) dedup key. Never re-fetch the Excel-covered
    # period or every overlapping transaction would come back duplicated.
    floor = db.get_setting("bbva_eb_tx_date_from", "").strip()
    if floor and floor > date_from:
        date_from = floor
    if date_from > today.isoformat():
        raise HTTPException(400, "The configured transaction start date is in the future")
    txns_data = eb.transactions(uid, date_from, today.isoformat(), get_page=_eb_get)

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

            desc = " ".join(t.get("remittance_information") or []).strip() or "BBVA transaction"
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
            logger.warning("BBVA: skipping transaction: %s", e)

    inserted, skipped = db.insert_transactions(rows)
    return {"inserted": inserted, "skipped": skipped}


# ── Sync balance ──────────────────────────────────────────────────────────────

@router.post("/sync/balances")
def sync_balances(account_id: int = Query(...)):
    account = _get_account(account_id)
    uid = db.get_setting("bbva_eb_account_uid", "").strip()
    if not uid:
        raise HTTPException(400, "BBVA not linked — connect first in Connections")

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
    today    = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    inserted = db.upsert_balances([(account.id, today, amount, round(amount_base, 4))])
    return {"inserted": inserted, "skipped": 0}
