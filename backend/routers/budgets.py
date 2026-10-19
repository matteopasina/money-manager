"""
Monthly budgets: per-category spending caps with optional rollover.

Spending semantics match the rest of the app: amount < 0, category not in the
transfer set, amounts in base currency via COALESCE(amount_base, amount).
This is the same definition as domain.spending_frame()/domain.base_amount(),
used by finance_tools.py and assistant_tools.py — this router computes it in
SQL rather than pandas, but if the definition changes, change it in both places.
Rollover carry is derived on read from start_month — nothing is stored, so
editing the amount or the rollover flag recomputes history retroactively.
"""
import sqlite3
from datetime import date

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

import database as db
from domain import Budget
from budget_math import shift_month as _shift_month, budget_status as _budget_status

router = APIRouter(prefix="/api/budgets", tags=["budgets"])

# Reserved pseudo-category: a cap on ALL spending (including uncategorized).
# Stored in budgets.category_name like any other; never a real category.
TOTAL_BUDGET = "__total__"


class BudgetIn(BaseModel):
    category_name: str
    monthly_amount: float = Field(gt=0)
    rollover: bool = False
    active: bool = True


# ── Month helpers (plain 'YYYY-MM' strings, no timezone math) ─────────────────

def _current_month() -> str:
    return date.today().strftime("%Y-%m")


def _validate_category(category_name: str) -> None:
    if category_name == TOTAL_BUDGET:
        return  # reserved "All spending" budget — not a real category
    cat = next((c for c in db.get_categories() if c.name == category_name), None)
    if cat is None:
        raise HTTPException(404, f"Category '{category_name}' not found")
    if cat.is_income or cat.is_transfer:
        raise HTTPException(400, "Cannot budget an income/transfer category — budgets are spending caps")


def _spend_for(b: Budget, spend_by_cat: dict[str, dict[str, float]],
               total_spend: dict[str, float]) -> dict[str, float]:
    return total_spend if b.category_name == TOTAL_BUDGET else spend_by_cat.get(b.category_name, {})


def _budget_row(b: Budget, spend: dict[str, float],
                colors: dict[str, str], month: str) -> dict:
    is_total = b.category_name == TOTAL_BUDGET
    status = _budget_status(b, spend, month)
    return {
        "id": b.id,
        "category_name": b.category_name,
        "monthly_amount": b.monthly_amount,
        "rollover": b.rollover,
        "start_month": b.start_month,
        "active": b.active,
        "category_color": None if is_total else colors.get(b.category_name),
        "orphaned": False if is_total else b.category_name not in colors,
        **status,
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("")
def list_budgets():
    month = _current_month()
    budgets = db.get_budgets()
    colors = {c.name: c.color for c in db.get_categories()}

    spend_by_cat: dict[str, dict[str, float]] = {}
    total_spend: dict[str, float] = {}
    if budgets:
        earliest = min(b.start_month for b in budgets)
        spend_by_cat = db.get_monthly_spend_by_category(
            start_month=earliest, end_month=month,
            categories=[b.category_name for b in budgets if b.category_name != TOTAL_BUDGET],
        )
        if any(b.category_name == TOTAL_BUDGET for b in budgets):
            total_spend = db.get_monthly_total_spend(start_month=earliest, end_month=month)

    rows = [_budget_row(b, _spend_for(b, spend_by_cat, total_spend), colors, month) for b in budgets]
    # Per-category totals exclude the "All spending" budget — it overlaps every
    # category, so adding it would double-count. It's surfaced separately.
    active = [r for r in rows if r["active"] and r["category_name"] != TOTAL_BUDGET]
    totals = {
        "budgeted":  round(sum(r["monthly_amount"] for r in active), 2),
        "effective": round(sum(r["effective"] for r in active), 2),
        "spent":     round(sum(r["spent"] for r in active), 2),
        "remaining": round(sum(r["remaining"] for r in active), 2),
    }
    total_row = next((r for r in rows if r["category_name"] == TOTAL_BUDGET and r["active"]), None)
    return {"month": month, "currency": db.get_base_currency(),
            "budgets": rows, "totals": totals, "total_budget": total_row}


@router.post("", status_code=201)
def create_budget(body: BudgetIn):
    _validate_category(body.category_name)
    try:
        b = db.upsert_budget(Budget(
            category_name=body.category_name,
            monthly_amount=body.monthly_amount,
            rollover=body.rollover,
            start_month=_current_month(),
            active=body.active,
        ))
    except sqlite3.IntegrityError:
        raise HTTPException(409, f"A budget for '{body.category_name}' already exists")

    month = _current_month()
    colors = {c.name: c.color for c in db.get_categories()}
    if b.category_name == TOTAL_BUDGET:
        spend = db.get_monthly_total_spend(start_month=b.start_month, end_month=month)
    else:
        spend = db.get_monthly_spend_by_category(
            start_month=b.start_month, end_month=month, categories=[b.category_name]).get(b.category_name, {})
    return _budget_row(b, spend, colors, month)


@router.put("/{budget_id}")
def update_budget(budget_id: int, body: BudgetIn):
    existing = next((b for b in db.get_budgets() if b.id == budget_id), None)
    if existing is None:
        raise HTTPException(404, f"Budget {budget_id} not found")
    if body.category_name != existing.category_name:
        _validate_category(body.category_name)
    try:
        db.upsert_budget(Budget(
            id=budget_id,
            category_name=body.category_name,
            monthly_amount=body.monthly_amount,
            rollover=body.rollover,
            start_month=existing.start_month,
            active=body.active,
        ))
    except sqlite3.IntegrityError:
        raise HTTPException(409, f"A budget for '{body.category_name}' already exists")
    return {"ok": True}


@router.delete("/{budget_id}")
def remove_budget(budget_id: int):
    db.delete_budget(budget_id)
    return {"ok": True}


@router.get("/history")
def budget_history(months: int = Query(default=6, ge=1, le=36)):
    current = _current_month()
    month_keys = [_shift_month(current, -(months - 1 - i)) for i in range(months)]
    budgets = db.get_budgets()

    spend_by_cat: dict[str, dict[str, float]] = {}
    total_spend: dict[str, float] = {}
    if budgets:
        earliest = min(min(b.start_month for b in budgets), month_keys[0])
        spend_by_cat = db.get_monthly_spend_by_category(
            start_month=earliest, end_month=current,
            categories=[b.category_name for b in budgets if b.category_name != TOTAL_BUDGET],
        )
        if any(b.category_name == TOTAL_BUDGET for b in budgets):
            total_spend = db.get_monthly_total_spend(start_month=earliest, end_month=current)

    series = []
    for b in budgets:
        spend = _spend_for(b, spend_by_cat, total_spend)
        budget_s: list[float | None] = []
        effective_s: list[float | None] = []
        spent_s: list[float | None] = []
        for m in month_keys:
            if m < b.start_month:
                budget_s.append(None); effective_s.append(None); spent_s.append(None)
                continue
            status = _budget_status(b, spend, m)
            budget_s.append(b.monthly_amount)
            effective_s.append(status["effective"])
            spent_s.append(status["spent"])
        series.append({
            "id": b.id, "category_name": b.category_name,
            "active": b.active, "rollover": b.rollover,
            "budget": budget_s, "effective": effective_s, "spent": spent_s,
        })

    return {"months": month_keys, "currency": db.get_base_currency(), "series": series}


@router.get("/suggest")
def suggest_budgets():
    """Average monthly spend per expense category over the last 6 full months
    (current partial month excluded), for prefilling budget amounts."""
    current = _current_month()
    start = _shift_month(current, -6)
    end   = _shift_month(current, -1)
    spend = db.get_monthly_spend_by_category(start_month=start, end_month=end)

    suggestions = [
        {
            "category_name": cat,
            "avg_monthly_spend": round(sum(by_month.values()) / 6, 2),
            "months_with_data": len(by_month),
        }
        for cat, by_month in spend.items()
    ]
    suggestions.sort(key=lambda s: s["avg_monthly_spend"], reverse=True)
    return {"window_months": 6, "suggestions": suggestions}
