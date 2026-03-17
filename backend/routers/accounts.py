from fastapi import APIRouter
from pydantic import BaseModel, field_validator
import database as db

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


class AccountIn(BaseModel):
    name: str
    currency: str = "EUR"
    account_type: str = "other"


class AccountUpdate(BaseModel):
    name: str
    currency: str
    account_type: str
    active: bool


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
    return _account_out(db.add_account(body.name, body.currency, body.account_type))


@router.patch("/{account_id}")
def update_account(account_id: int, body: AccountUpdate):
    db.update_account(account_id, body.name, body.currency, body.account_type, body.active)
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
