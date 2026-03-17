from fastapi import APIRouter
from pydantic import BaseModel
import database as db

router = APIRouter(prefix="/api/balances", tags=["balances"])


class BalanceIn(BaseModel):
    account_id: int
    date: str
    amount_native: float
    amount_base: float


class BalanceUpdate(BaseModel):
    amount_native: float
    amount_base: float


@router.get("")
def list_balances():
    df = db.get_balances_df()
    if df.empty:
        return []
    df["date"] = df["date"].astype(str)
    return df.to_dict(orient="records")


@router.post("", status_code=201)
def create_balance(body: BalanceIn):
    inserted = db.upsert_balances([(body.account_id, body.date, body.amount_native, body.amount_base)])
    return {"inserted": inserted}


@router.post("/batch", status_code=201)
def create_balances_batch(rows: list[BalanceIn]):
    tuples = [(r.account_id, r.date, r.amount_native, r.amount_base) for r in rows]
    inserted = db.upsert_balances(tuples)
    return {"inserted": inserted}


@router.put("/{balance_id}")
def update_balance(balance_id: int, body: BalanceUpdate):
    db.update_balance(balance_id, body.amount_native, body.amount_base)
    return {"ok": True}


@router.delete("/{balance_id}")
def delete_balance(balance_id: int):
    db.delete_balance(balance_id)
    return {"ok": True}
