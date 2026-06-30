import os
import time
import tempfile
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET

from fastapi import APIRouter, HTTPException, Query

import database as db
from adapters.interactive_brokers import IBTransactionsAdapter, IBBalancesAdapter
from categoriser import categorise

router = APIRouter(prefix="/api/ib", tags=["ib"])

_SEND_URL = "https://ndcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest"


def _fetch_flex_xml(token: str, query_id: str) -> str:
    """Call IB Flex Query API and return the XML statement string.

    Polls until the statement is ready (IB typically takes 1-5 seconds).
    """
    req_url = f"{_SEND_URL}?t={token}&q={query_id}&v=3"
    try:
        with urllib.request.urlopen(req_url, timeout=30) as r:
            body = r.read().decode()
    except urllib.error.URLError as e:
        raise HTTPException(502, f"Could not reach IB API: {e}")

    root = ET.fromstring(body)
    if root.findtext("Status") != "Success":
        err = root.findtext("ErrorMessage") or "Unknown IB error"
        raise HTTPException(400, f"IB API: {err}")

    ref_code = root.findtext("ReferenceCode")
    get_base = root.findtext("Url")
    if not ref_code or not get_base:
        raise HTTPException(502, "IB API returned an unexpected response format")

    poll_url = f"{get_base}?q={ref_code}&t={token}&v=3"
    for attempt in range(12):
        time.sleep(1 if attempt == 0 else 2)
        try:
            with urllib.request.urlopen(poll_url, timeout=30) as r:
                body = r.read().decode()
        except urllib.error.URLError as e:
            raise HTTPException(502, f"Could not fetch IB statement: {e}")

        root = ET.fromstring(body)
        if root.tag == "FlexQueryResponse":
            return body

        if root.findtext("ErrorCode") == "1019":
            continue  # "Statement generation in progress" — retry

        err = root.findtext("ErrorMessage") or body[:300]
        raise HTTPException(400, f"IB fetch error: {err}")

    raise HTTPException(504, "IB statement generation timed out after 25 seconds")


def _get_account(account_id: int):
    account = next((a for a in db.get_accounts() if a.id == account_id), None)
    if not account:
        raise HTTPException(400, f"Account {account_id} not found")
    return account


def _write_temp_xml(content: str) -> str:
    with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False) as f:
        f.write(content)
        return f.name


@router.post("/sync/transactions")
def sync_transactions(account_id: int = Query(...)):
    token    = db.get_setting("ib_token", "").strip()
    query_id = db.get_setting("ib_transactions_query_id", "").strip()
    if not token or not query_id:
        raise HTTPException(400, "Set IB token and transactions query ID in Settings first")

    xml_content = _fetch_flex_xml(token, query_id)
    account = _get_account(account_id)
    base_currency = db.get_base_currency()

    tmp = _write_temp_xml(xml_content)
    try:
        rules = db.get_keyword_rules()
        def cat_fn(desc, ref):
            return categorise(desc, ref, rules)

        txns = IBTransactionsAdapter().parse(
            tmp, account.id, account.currency, base_currency, db.get_rate, categorise=cat_fn
        )
        rows = [
            {
                "account_id": r.account_id, "date": r.date, "description": r.description,
                "amount": r.amount, "amount_base": r.amount_base, "category": r.category,
                "value_date": r.value_date, "reference": r.reference,
                "balance": r.balance, "notes": r.notes,
            }
            for r in txns
        ]
        inserted, skipped = db.insert_transactions(rows)
        return {"inserted": inserted, "skipped": skipped}
    finally:
        os.unlink(tmp)


@router.post("/sync/nav")
def sync_nav(account_id: int = Query(...)):
    token    = db.get_setting("ib_token", "").strip()
    query_id = db.get_setting("ib_nav_query_id", "").strip()
    if not token or not query_id:
        raise HTTPException(400, "Set IB token and NAV query ID in Settings first")

    xml_content = _fetch_flex_xml(token, query_id)
    account = _get_account(account_id)
    base_currency = db.get_base_currency()

    tmp = _write_temp_xml(xml_content)
    try:
        balances = IBBalancesAdapter().parse(
            tmp, account.id, account.currency, base_currency, db.get_rate
        )
        tuples = [(r.account_id, r.date, r.amount_native, r.amount_base) for r in balances]
        inserted = db.upsert_balances(tuples)
        return {"inserted": inserted, "skipped": 0}
    finally:
        os.unlink(tmp)
