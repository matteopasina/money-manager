"""
Automatic account sync.

A daemon thread runs a first check shortly after startup ("sync on app start"),
then re-checks periodically. Each integration only actually syncs when it is
*due*: `now - last successful sync >= auto_sync_interval_hours`. The sync_log
table is the cache — restarting the app within the interval finds a fresh
success entry and skips the network calls entirely.

Settings (app_settings):
  auto_sync_enabled         "true" | "false"
  auto_sync_interval_hours  e.g. "24"

The runners call the per-integration router functions directly (FastAPI's
decorators return the original functions unchanged, so these are plain calls —
no HTTP round-trip). One integration failing (e.g. an expired bank consent)
never blocks the others; the failure is recorded and shown in Connections.
"""
import logging
import threading
from datetime import datetime, timedelta, timezone

import database as db

logger = logging.getLogger(__name__)

_TICK_SECONDS = 30 * 60  # re-check every 30 min; the due-check keeps this cheap
_STARTUP_DELAY_SECONDS = 10

_lock = threading.Lock()   # a manual "Sync now" must not overlap the timer tick
_stop = threading.Event()
_thread: threading.Thread | None = None


# ── Per-integration runners ────────────────────────────────────────────────────

def _int_setting(key: str) -> int | None:
    raw = db.get_setting(key, "").strip()
    return int(raw) if raw.isdigit() else None


def _ib_configured() -> bool:
    return all([
        db.get_setting("ib_token", "").strip(),
        db.get_setting("ib_transactions_query_id", "").strip(),
        db.get_setting("ib_nav_query_id", "").strip(),
        _int_setting("ib_account_id"),
    ])


def _run_ib() -> str:
    from routers import ib
    acc = _int_setting("ib_account_id")
    t = ib.sync_transactions(account_id=acc)
    n = ib.sync_nav(account_id=acc)
    return f"Transactions: {t['inserted']} new. NAV: {n['inserted']} new."


def _binance_configured() -> bool:
    return all([
        db.get_setting("binance_api_key", "").strip(),
        db.get_setting("binance_api_secret", "").strip(),
        _int_setting("binance_account_id"),
    ])


def _run_binance() -> str:
    from routers import binance
    acc = _int_setting("binance_account_id")
    t = binance.sync_transactions(account_id=acc)
    p = binance.sync_portfolio(account_id=acc)
    return f"Transactions: {t['inserted']} new. Portfolio: {p['inserted']} snapshot."


def _eb_configured() -> bool:
    return all([
        db.get_setting("enablebanking_application_id", "").strip(),
        db.get_setting("enablebanking_private_key", "").strip(),
    ])


def _revolut_configured() -> bool:
    return _eb_configured() and bool(
        db.get_setting("revolut_eb_account_uid", "").strip()
    ) and _int_setting("revolut_account_id") is not None


def _run_revolut() -> str:
    from routers import revolut
    acc = _int_setting("revolut_account_id")
    # days must be passed explicitly: direct calls skip FastAPI's Query-default resolution
    t = revolut.sync_transactions(account_id=acc, days=90)
    b = revolut.sync_balances(account_id=acc)
    return f"Transactions: {t['inserted']} new. Balance: {b['inserted']} snapshot."


def _bbva_configured() -> bool:
    return _eb_configured() and bool(
        db.get_setting("bbva_eb_account_uid", "").strip()
    ) and _int_setting("bbva_account_id") is not None


def _run_bbva() -> str:
    from routers import bbva
    acc = _int_setting("bbva_account_id")
    t = bbva.sync_transactions(account_id=acc, days=90)
    b = bbva.sync_balances(account_id=acc)
    return f"Transactions: {t['inserted']} new. Balance: {b['inserted']} snapshot."


INTEGRATIONS = [
    # (id, display name, configured?, runner)
    ("ib",      "Interactive Brokers", _ib_configured,      _run_ib),
    ("binance", "Binance",             _binance_configured, _run_binance),
    ("revolut", "Revolut",             _revolut_configured, _run_revolut),
    ("bbva",    "BBVA",                _bbva_configured,    _run_bbva),
]


# ── Orchestration ──────────────────────────────────────────────────────────────

def _interval() -> timedelta:
    try:
        hours = float(db.get_setting("auto_sync_interval_hours", "24"))
    except ValueError:
        hours = 24.0
    return timedelta(hours=max(hours, 1.0))


def _is_due(integration_id: str) -> bool:
    last = db.get_last_sync(integration_id, status="success")
    if last is None:
        return True
    ran_at = datetime.fromisoformat(last["ran_at"])
    return datetime.now(timezone.utc) - ran_at >= _interval()


def run_all_syncs(force: bool = False) -> list[dict]:
    """Sync every configured integration that is due (or all, when forced).

    Returns per-integration results; also persisted to sync_log so the next
    startup can treat a recent success as "cached" and skip the calls.
    """
    enabled = db.get_setting("auto_sync_enabled", "true") == "true"
    results = []
    with _lock:
        for iid, name, configured, runner in INTEGRATIONS:
            if not configured():
                results.append({"id": iid, "name": name, "result": "not_configured"})
                continue
            if not force and (not enabled or not _is_due(iid)):
                results.append({"id": iid, "name": name, "result": "up_to_date"})
                continue
            try:
                message = runner()
                db.record_sync(iid, "success", message)
                results.append({"id": iid, "name": name, "result": "success", "message": message})
                logger.info("Auto-sync %s: %s", iid, message)
            except Exception as e:
                detail = getattr(e, "detail", None) or str(e)
                db.record_sync(iid, "error", str(detail)[:300])
                results.append({"id": iid, "name": name, "result": "error", "message": str(detail)[:300]})
                logger.warning("Auto-sync %s failed: %s", iid, detail)
    return results


def _loop() -> None:
    if _stop.wait(_STARTUP_DELAY_SECONDS):  # startup catch-up, slightly delayed
        return
    while True:
        try:
            run_all_syncs()
        except Exception:
            logger.exception("Auto-sync tick failed")
        if _stop.wait(_TICK_SECONDS):
            return


def init_scheduler() -> None:
    global _thread
    if _thread is not None and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(target=_loop, name="auto-sync", daemon=True)
    _thread.start()


def shutdown_scheduler() -> None:
    _stop.set()
