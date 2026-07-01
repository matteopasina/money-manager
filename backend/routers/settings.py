from fastapi import APIRouter
from pydantic import BaseModel
import database as db

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingUpdate(BaseModel):
    value: str


@router.get("")
def get_all_settings():
    """Return all settings, with secret values masked.

    Secrets (API keys, tokens, private keys) are write-only through this API:
    the frontend only ever sees the SECRET_MASK placeholder (meaning "a value
    is saved"), never the value itself. Sync/chat endpoints read the real
    values server-side via db.get_setting().
    """
    with db.get_connection() as conn:
        rows = conn.execute("SELECT key, value FROM app_settings").fetchall()
    return {
        r["key"]: (db.SECRET_MASK if r["key"] in db.SECRET_SETTINGS and r["value"] else r["value"])
        for r in rows
    }


@router.put("/{key}")
def update_setting(key: str, body: SettingUpdate):
    # Ignore writes of the mask placeholder — it means "unchanged". This keeps
    # save-all flows from clobbering a stored secret with the mask string.
    if key in db.SECRET_SETTINGS and body.value == db.SECRET_MASK:
        return {"ok": True, "unchanged": True}
    db.set_setting(key, body.value)
    return {"ok": True}
