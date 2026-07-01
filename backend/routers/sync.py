from fastapi import APIRouter
from pydantic import BaseModel, field_validator

import database as db
import scheduler

router = APIRouter(prefix="/api/sync", tags=["sync"])


def _status_payload() -> dict:
    integrations = []
    for iid, name, configured, _runner in scheduler.INTEGRATIONS:
        last = db.get_last_sync(iid)
        last_success = db.get_last_sync(iid, status="success")
        integrations.append({
            "id": iid,
            "name": name,
            "configured": configured(),
            "last_status": last["status"] if last else None,
            "last_message": last["message"] if last else None,
            "last_run_at": last["ran_at"] if last else None,
            "last_success_at": last_success["ran_at"] if last_success else None,
            "due": configured() and scheduler._is_due(iid),
        })
    return {
        "enabled": db.get_setting("auto_sync_enabled", "true") == "true",
        "interval_hours": float(db.get_setting("auto_sync_interval_hours", "24")),
        "integrations": integrations,
    }


@router.get("/status")
def get_status():
    return _status_payload()


@router.post("/run-now")
def run_now():
    """Force-sync all configured integrations, bypassing the interval cache."""
    results = scheduler.run_all_syncs(force=True)
    payload = _status_payload()
    payload["results"] = results
    return payload


class SyncSettings(BaseModel):
    enabled: bool
    interval_hours: float

    @field_validator("interval_hours")
    @classmethod
    def positive(cls, v: float) -> float:
        if v < 1:
            raise ValueError("interval_hours must be >= 1")
        return v


@router.put("/settings")
def update_settings(body: SyncSettings):
    db.set_setting("auto_sync_enabled", "true" if body.enabled else "false")
    db.set_setting("auto_sync_interval_hours", str(body.interval_hours))
    return {"ok": True}
