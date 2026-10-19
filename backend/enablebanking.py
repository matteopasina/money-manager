"""
Shared Enable Banking API plumbing, used by both the Revolut and BBVA routers.

Enable Banking is a PSD2 open-banking aggregator with a self-serve "restricted
production" mode: once an application is registered, it can fetch data from
accounts the developer explicitly links themselves — no business/KYB process.
One registered application (one App ID + private key) can connect to many banks;
those shared credentials live in app settings under `enablebanking_*`, while each
bank router keeps its own session/account UID.

Access is read-only (PSD2 AIS): balances and transactions only, never payments.

API docs: https://enablebanking.com/docs/api/reference/
"""
import time
from collections.abc import Callable

import httpx
import jwt
from fastapi import HTTPException

import database as db

BASE = "https://api.enablebanking.com"


class EnableBankingError(HTTPException):
    def __init__(self, response: httpx.Response):
        try:
            payload = response.json()
        except ValueError:
            payload = {}
        if not isinstance(payload, dict):
            payload = {}
        self.error_code = payload.get("error")
        self.upstream_status = response.status_code
        message = payload.get("message") or "The banking service could not complete the request"
        super().__init__(502, f"Enable Banking {response.status_code}: {message}"
                         + (f" ({self.error_code})" if self.error_code else ""))


def headers() -> dict:
    """Build the Authorization header by signing a short-lived RS256 JWT with the
    application's private key (shared across all Enable Banking banks)."""
    app_id = db.get_setting("enablebanking_application_id", "").strip()
    private_key = db.get_setting("enablebanking_private_key", "").strip()
    if not app_id or not private_key:
        raise HTTPException(400, "Set Enable Banking Application ID and Private Key first")

    now = int(time.time())
    try:
        token = jwt.encode(
            {"iss": "enablebanking.com", "aud": "api.enablebanking.com", "iat": now, "exp": now + 3600},
            private_key,
            algorithm="RS256",
            headers={"kid": app_id},
        )
    except Exception as e:
        raise HTTPException(400, f"Could not sign Enable Banking JWT — check the private key format: {e}")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def get(path: str, params: dict | None = None):
    # Reads are safe to retry; authorisation code exchanges below are single-use.
    for attempt in range(3):
        try:
            r = httpx.get(f"{BASE}{path}", headers=headers(), params=params, timeout=15)
        except httpx.RequestError:
            if attempt == 2:
                raise HTTPException(503, "Enable Banking is temporarily unreachable. Try again shortly.") from None
        else:
            if r.status_code not in {408, 429, 500, 502, 503, 504} or attempt == 2:
                break
        time.sleep(0.5 * (attempt + 1))
    if not r.is_success:
        raise EnableBankingError(r)
    return r.json()


def post(path: str, body: dict):
    try:
        r = httpx.post(f"{BASE}{path}", headers=headers(), json=body, timeout=15)
    except httpx.RequestError:
        raise HTTPException(503, "Enable Banking is temporarily unreachable. Try again shortly.") from None
    if not r.is_success:
        raise EnableBankingError(r)
    return r.json()


def session_status(provider: str, get_page: Callable = get) -> dict:
    session_id = db.get_setting(f"{provider}_eb_session_id", "").strip()
    if not session_id:
        return {"status": "not_connected"}
    try:
        data = get_page(f"/sessions/{session_id}")
    except HTTPException as exc:
        # Credentials, rate limits and outages do not prove consent has expired.
        expired = getattr(exc, "error_code", None) in {
            "EXPIRED_SESSION", "CLOSED_SESSION", "SESSION_DOES_NOT_EXIST",
        }
        return {"status": "expired" if expired else "unknown", "message": str(exc.detail)}
    status = data.get("status")
    if status != "AUTHORIZED":
        return {"status": "expired" if status in {"EXPIRED", "CLOSED", "REVOKED"} else "unknown"}
    return {
        "status": "active",
        "valid_until": data.get("access", {}).get("valid_until"),
        "account_uid": db.get_setting(f"{provider}_eb_account_uid", "").strip(),
        "account_count": len(data.get("accounts", [])),
    }


def transactions(uid: str, date_from: str, date_to: str, get_page: Callable = get) -> list[dict]:
    """Fetch the entire inclusive date range before importing any rows."""
    params = {"date_from": date_from, "date_to": date_to}
    rows = []
    seen = set()
    while True:
        data = get_page(f"/accounts/{uid}/transactions", params.copy())
        rows.extend(data.get("transactions", []))
        key = data.get("continuation_key")
        if not key:
            return rows
        if key in seen:
            raise HTTPException(502, "Enable Banking repeated a transactions page. Please retry the sync.")
        seen.add(key)
        params["continuation_key"] = key
