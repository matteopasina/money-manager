import logging
import time
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

import database as db
from adapters.binance import (
    STABLECOINS,
    _map_converts,
    _map_deposits,
    _map_rewards,
    _map_withdrawals,
)
from categoriser import categorise

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/binance", tags=["binance"])


def _make_client():
    try:
        from binance.client import Client
    except ImportError:
        raise HTTPException(
            500,
            "python-binance is not installed. Add it to requirements.txt and rebuild the Docker image.",
        )
    key    = db.get_setting("binance_api_key", "").strip()
    secret = db.get_setting("binance_api_secret", "").strip()
    if not key or not secret:
        raise HTTPException(400, "Set Binance API key and secret in Settings first")
    return Client(key, secret)


def _since_ms(days: int = 90) -> int:
    return int((time.time() - days * 86400) * 1000)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _get_account(account_id: int):
    account = next((a for a in db.get_accounts() if a.id == account_id), None)
    if not account:
        raise HTTPException(400, f"Account {account_id} not found")
    return account


def _safe(client, method: str, **kwargs):
    """Call client.method(**kwargs), returning None if the method doesn't exist or fails."""
    fn = getattr(client, method, None)
    if fn is None:
        logger.warning("Binance: method %s not found on client", method)
        return None
    try:
        return fn(**kwargs)
    except Exception as e:
        logger.warning("Binance API %s failed: %s", method, e)
        return None


@router.post("/sync/transactions")
def sync_transactions(account_id: int = Query(...)):
    client  = _make_client()
    account = _get_account(account_id)
    since   = _since_ms(days=90)
    now     = _now_ms()

    deposits    = _safe(client, "get_deposit_history", startTime=since) or []
    withdrawals = _safe(client, "get_withdraw_history", startTime=since) or []

    convert_resp = _safe(client, "get_convert_trade_history", startTime=since, endTime=now)
    converts = (convert_resp or {}).get("list", [])

    rewards_resp = _safe(client, "get_simple_earn_flexible_rewards_history", startTime=since)
    rewards = (rewards_resp or {}).get("rows", [])

    rules  = db.get_keyword_rules()
    cat_fn = lambda desc, ref: categorise(desc, ref, rules)

    txns = (
        _map_deposits(deposits, account.id, db.get_rate, cat_fn) +
        _map_withdrawals(withdrawals, account.id, db.get_rate, cat_fn) +
        _map_converts(converts, account.id, db.get_rate, cat_fn) +
        _map_rewards(rewards, account.id, db.get_rate, cat_fn)
    )
    rows = [
        {
            "account_id": t.account_id, "date": t.date, "description": t.description,
            "amount": t.amount, "amount_base": t.amount_base, "category": t.category,
            "value_date": t.value_date, "reference": t.reference,
            "balance": t.balance, "notes": t.notes,
        }
        for t in txns
    ]
    inserted, skipped = db.insert_transactions(rows)
    return {"inserted": inserted, "skipped": skipped}


@router.post("/sync/portfolio")
def sync_portfolio(account_id: int = Query(...)):
    client  = _make_client()
    account = _get_account(account_id)

    # Non-zero balances — try sapi/v3/asset/getUserAsset first, fall back to account endpoint
    assets = _safe(client, "get_user_asset", needBtcValuation=False)
    if assets is None:
        acct_data = client.get_account()
        assets = [
            b for b in acct_data.get("balances", [])
            if float(b.get("free", 0)) + float(b.get("locked", 0)) > 0
        ]

    tickers   = {t["symbol"]: float(t["price"]) for t in client.get_all_tickers()}
    btc_usdt  = tickers.get("BTCUSDT", 0.0)
    total_usdt = 0.0

    for asset in assets:
        coin = asset.get("asset", "")
        qty  = float(asset.get("free", 0)) + float(asset.get("locked", 0))
        if qty == 0:
            continue
        if coin in STABLECOINS:
            total_usdt += qty
        elif f"{coin}USDT" in tickers:
            total_usdt += qty * tickers[f"{coin}USDT"]
        elif f"{coin}BTC" in tickers and btc_usdt:
            total_usdt += qty * tickers[f"{coin}BTC"] * btc_usdt
        else:
            logger.warning("Binance: cannot price %s, skipping", coin)

    today    = datetime.utcnow().strftime("%Y-%m-%d")
    rate     = db.get_rate("USDT")
    inserted = db.upsert_balances([(account.id, today, total_usdt, total_usdt * rate)])
    return {"inserted": inserted, "skipped": 0}
