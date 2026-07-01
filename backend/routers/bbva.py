"""
BBVA live sync via Saltedge Account Information API v5.

One-time setup flow:
  1. Create a Saltedge account at saltedge.com/account_information → get App ID + Secret.
  2. Enter them in Settings → BBVA card → Save.
  3. Click "Create customer" (one-time, auto-saves customer_id).
  4. Click "Connect to BBVA" → visit the link → authorise in BBVA's bank portal.
  5. Click "Check status" → connection_id + account list auto-saved.
  6. Sync Transactions / Sync Balance on demand.

Saltedge API docs: https://docs.saltedge.com/account_information/v5/
"""
import logging
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, HTTPException, Query

import database as db
from categoriser import categorise

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/bbva", tags=["bbva"])

_SE_BASE = "https://www.saltedge.com/api/v5"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _headers() -> dict:
    app_id = db.get_setting("bbva_se_app_id", "").strip()
    secret = db.get_setting("bbva_se_secret", "").strip()
    if not app_id or not secret:
        raise HTTPException(400, "Set Saltedge App ID and Secret in Settings first")
    return {"App-id": app_id, "Secret": secret, "Content-Type": "application/json"}


def _se_get(path: str, params: dict | None = None):
    r = httpx.get(f"{_SE_BASE}{path}", headers=_headers(), params=params, timeout=15)
    if not r.is_success:
        raise HTTPException(502, f"Saltedge {r.status_code}: {r.text}")
    return r.json().get("data")


def _se_post(path: str, body: dict):
    r = httpx.post(f"{_SE_BASE}{path}", headers=_headers(), json=body, timeout=15)
    if not r.is_success:
        raise HTTPException(502, f"Saltedge {r.status_code}: {r.text}")
    return r.json().get("data")


def _get_account(account_id: int):
    account = next((a for a in db.get_accounts() if a.id == account_id), None)
    if not account:
        raise HTTPException(400, f"Account {account_id} not found")
    return account


# ── Customer (one-time) ───────────────────────────────────────────────────────

@router.post("/create-customer")
def create_customer():
    """Create a Saltedge customer (one-time). Auto-saves customer_id."""
    existing = db.get_setting("bbva_se_customer_id", "").strip()
    if existing:
        return {"customer_id": existing, "note": "Already created"}

    data = _se_post("/customers", {"data": {"identifier": "money-manager-bbva"}})
    customer_id = data["id"]
    db.set_setting("bbva_se_customer_id", customer_id)
    return {"customer_id": customer_id}


# ── Connect (one-time bank authorisation) ─────────────────────────────────────

@router.post("/connect")
def connect(return_to: str = Query(default="http://localhost:5173/settings")):
    """Create a connect session and return the bank authorisation URL."""
    customer_id = db.get_setting("bbva_se_customer_id", "").strip()
    if not customer_id:
        raise HTTPException(400, "Create a customer first")

    data = _se_post("/connect_sessions/create", {
        "data": {
            "customer_id": customer_id,
            "consent": {
                "scopes": ["account_details", "transactions_details"],
                "from_date": (datetime.utcnow() - timedelta(days=365)).strftime("%Y-%m-%d"),
            },
            "attempt": {"return_to": return_to},
        }
    })
    return {"connect_url": data["connect_url"]}


@router.get("/link-status")
def link_status():
    """List connections for this customer; auto-saves connection_id + se_account_id."""
    customer_id = db.get_setting("bbva_se_customer_id", "").strip()
    if not customer_id:
        return {"status": "no_customer"}

    connections = _se_get("/connections", {"customer_id": customer_id}) or []
    if not connections:
        return {"status": "pending"}

    # Use the first active connection
    conn = next((c for c in connections if c.get("status") == "active"), connections[0])
    connection_id = conn["id"]
    db.set_setting("bbva_se_connection_id", connection_id)

    # Auto-fetch accounts for this connection
    accounts = _se_get("/accounts", {"connection_id": connection_id}) or []
    if accounts:
        db.set_setting("bbva_se_account_id", accounts[0]["id"])

    return {
        "status": conn.get("status"),
        "connection_id": connection_id,
        "accounts": [{"id": a["id"], "name": a.get("name", ""), "currency": a.get("currency_code", "")} for a in accounts],
    }


# ── Sync transactions ─────────────────────────────────────────────────────────

@router.post("/sync/transactions")
def sync_transactions(account_id: int = Query(...), days: int = Query(default=90)):
    account   = _get_account(account_id)
    se_acc_id = db.get_setting("bbva_se_account_id", "").strip()
    if not se_acc_id:
        raise HTTPException(400, "BBVA not linked — connect first in Settings")

    date_from = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
    txns_data = _se_get("/transactions", {"account_id": se_acc_id, "from_date": date_from}) or []

    rules  = db.get_keyword_rules()
    cat_fn = lambda desc, ref: categorise(desc, ref, rules)
    base   = db.get_base_currency().upper()

    rows = []
    for t in txns_data:
        try:
            amount   = float(t.get("amount", 0))
            if amount == 0:
                continue
            currency = (t.get("currency_code") or account.currency).upper()
            rate     = db.get_rate(currency)
            amount_base = amount if currency == base else amount * rate

            desc = (t.get("description") or t.get("extra", {}).get("payee") or "BBVA transaction").strip()
            ref  = str(t.get("id", ""))
            date = t.get("made_on") or t.get("created_at", "")[:10]
            cat  = cat_fn(desc, ref)

            rows.append({
                "account_id": account.id,
                "date": date,
                "value_date": t.get("extra", {}).get("posting_date"),
                "description": desc,
                "reference": ref,
                "amount": amount,
                "amount_base": round(amount_base, 4),
                "category": cat,
                "balance": t.get("extra", {}).get("account_balance_snapshot"),
                "notes": None,
            })
        except Exception as e:
            logger.warning("BBVA: skipping transaction: %s", e)

    inserted, skipped = db.insert_transactions(rows)
    return {"inserted": inserted, "skipped": skipped}


# ── Sync balance ──────────────────────────────────────────────────────────────

@router.post("/sync/balances")
def sync_balances(account_id: int = Query(...)):
    account   = _get_account(account_id)
    se_acc_id = db.get_setting("bbva_se_account_id", "").strip()
    if not se_acc_id:
        raise HTTPException(400, "BBVA not linked — connect first in Settings")

    # Saltedge returns balance inside the account object
    accounts = _se_get("/accounts", {"connection_id": db.get_setting("bbva_se_connection_id", "")}) or []
    se_acc   = next((a for a in accounts if a["id"] == se_acc_id), None)
    if not se_acc:
        raise HTTPException(502, "Account not found in Saltedge response")

    amount   = float(se_acc.get("balance", 0))
    currency = (se_acc.get("currency_code") or account.currency).upper()
    base     = db.get_base_currency().upper()
    rate     = db.get_rate(currency)
    amount_base = amount if currency == base else amount * rate
    today    = datetime.utcnow().strftime("%Y-%m-%d")

    inserted = db.upsert_balances([(account.id, today, amount, round(amount_base, 4))])
    return {"inserted": inserted, "skipped": 0}
