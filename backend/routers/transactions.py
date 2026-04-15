import json
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
import database as db

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


class CategoryUpdate(BaseModel):
    category: str


@router.get("")
def list_transactions(
    account_id: Optional[int] = Query(None),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
):
    df = db.get_transactions_df(account_id=account_id, start=start, end=end)
    if df.empty:
        return []
    df["date"] = df["date"].astype(str)
    df["value_date"] = df["value_date"].where(df["value_date"].notna(), None)
    return JSONResponse(content=json.loads(df.to_json(orient="records")))


@router.patch("/{transaction_id}/category")
def update_category(transaction_id: int, body: CategoryUpdate):
    db.update_transaction_category(transaction_id, body.category)
    return {"ok": True}


@router.get("/monthly-spend")
def monthly_spend(months: int = 6):
    return {"monthly_spend": db.get_transaction_monthly_spend(months)}


@router.get("/avg-income")
def avg_income():
    mean, median = db.get_transaction_avg_income()
    return {"mean": mean, "median": median}
