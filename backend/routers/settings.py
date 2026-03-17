from fastapi import APIRouter
from pydantic import BaseModel
import database as db

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingUpdate(BaseModel):
    value: str


@router.get("")
def get_all_settings():
    with db.get_connection() as conn:
        rows = conn.execute("SELECT key, value FROM app_settings").fetchall()
    return {r["key"]: r["value"] for r in rows}


@router.put("/{key}")
def update_setting(key: str, body: SettingUpdate):
    db.set_setting(key, body.value)
    return {"ok": True}
