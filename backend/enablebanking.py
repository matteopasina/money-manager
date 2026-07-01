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

import httpx
import jwt
from fastapi import HTTPException

import database as db

BASE = "https://api.enablebanking.com"


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
    r = httpx.get(f"{BASE}{path}", headers=headers(), params=params, timeout=15)
    if not r.is_success:
        raise HTTPException(502, f"Enable Banking {r.status_code}: {r.text}")
    return r.json()


def post(path: str, body: dict):
    r = httpx.post(f"{BASE}{path}", headers=headers(), json=body, timeout=15)
    if not r.is_success:
        raise HTTPException(502, f"Enable Banking {r.status_code}: {r.text}")
    return r.json()
