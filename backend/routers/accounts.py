import sqlite3

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
import database as db

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


class AccountIn(BaseModel):
    name: str
    currency: str = "EUR"
    account_type: str = "other"

    @field_validator("name", "currency", "account_type")
    @classmethod
    def field_must_not_be_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("must not be blank")
        return v


class AccountUpdate(BaseModel):
    name: str | None = None
    currency: str | None = None
    account_type: str | None = None
    active: bool | None = None


class FxRateIn(BaseModel):
    rate: float

    @field_validator("rate")
    @classmethod
    def rate_must_be_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("rate must be greater than 0")
        return v


def _account_out(a) -> dict:
    return {"id": a.id, "name": a.name, "currency": a.currency,
            "account_type": a.account_type, "active": a.active}


@router.get("")
def list_accounts(active_only: bool = False):
    return [_account_out(a) for a in db.get_accounts(active_only=active_only)]


@router.post("", status_code=201)
def create_account(body: AccountIn):
    try:
        return _account_out(db.add_account(body.name, body.currency, body.account_type))
    except sqlite3.IntegrityError as exc:
        if "accounts.name" in str(exc):
            raise HTTPException(status_code=409, detail="Account name already exists") from exc
        raise


@router.patch("/{account_id}")
def update_account(account_id: int, body: AccountUpdate):
    current = next((a for a in db.get_accounts() if a.id == account_id), None)
    if current is None:
        raise HTTPException(status_code=404, detail="Account not found")

    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    db.update_account(
        account_id,
        changes.get("name", current.name),
        changes.get("currency", current.currency),
        changes.get("account_type", current.account_type),
        changes.get("active", current.active),
    )
    return {"ok": True}


@router.get("/fx-rates")
def list_fx_rates():
    rates = db.get_fx_rates()
    return [{"currency": r["currency"], "rate_to_base": r["rate_to_base"],
             "updated_at": r["updated_at"]} for r in rates]


@router.put("/fx-rates/{currency}")
def upsert_fx_rate(currency: str, body: FxRateIn):
    db.upsert_fx_rate(currency, body.rate)
    return {"ok": True}
