"""
Analytics endpoints for Predictions and Goal Calculator pages.
These do heavier computation (regression, compound simulation) that used to
live inline in Streamlit pages.
"""
from datetime import date
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

import database as db

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _compute_cagr_data(df, tx_df=None) -> dict:
    """
    Given a balances DataFrame (from db.get_balances_df()), compute per-account
    CAGR, aggregate by account_type, and return a weighted portfolio return.
    Returns dict with keys: accounts, by_type, weighted_annual_return_pct.
    Returns empty dict (accounts=[], by_type=[], weighted=0) when data is sparse.

    If tx_df (transactions DataFrame) is provided, applies the Modified Dietz
    method: net cash flows (deposits, salary, expenses) are subtracted from the
    ending balance so the CAGR reflects only organic growth (interest / gains).
    """
    import pandas as pd

    df = df.copy()
    df["date"] = pd.to_datetime(df["date"])

    tx_indexed: dict = {}
    if tx_df is not None and not tx_df.empty:
        tx_copy = tx_df.copy()
        tx_copy["date"] = pd.to_datetime(tx_copy["date"])
        tx_copy["flow"] = tx_copy["amount_base"].fillna(tx_copy["amount"])
        for acc_id, grp_tx in tx_copy.groupby("account_id"):
            tx_indexed[int(acc_id)] = grp_tx

    accounts = []
    for (account_id, account_name, account_type), grp in df.groupby(
        ["account_id", "account", "account_type"]
    ):
        grp = grp.sort_values("date")
        if len(grp) < 2:
            continue
        first, last = grp.iloc[0], grp.iloc[-1]
        days = (last["date"] - first["date"]).days
        if days < 30 or first["amount_base"] <= 0:
            continue
        years = days / 365.25

        # Modified Dietz: subtract net cash flows to isolate organic growth
        net_flows = 0.0
        acc_tx = tx_indexed.get(int(account_id))
        if acc_tx is not None:
            period_tx = acc_tx[
                (acc_tx["date"] >= first["date"]) & (acc_tx["date"] <= last["date"])
            ]
            if not period_tx.empty:
                net_flows = float(period_tx["flow"].sum())

        adjusted_end = float(last["amount_base"]) - net_flows
        if adjusted_end <= 0:
            cagr = 0.0
        else:
            cagr = (adjusted_end / float(first["amount_base"])) ** (1 / years) - 1
        monthly_return_pct = ((1 + cagr) ** (1 / 12) - 1) * 100
        accounts.append({
            "account": account_name,
            "account_type": account_type,
            "current_balance": round(float(last["amount_base"]), 2),
            "annual_return_pct": round(cagr * 100, 1),
            "monthly_return_pct": round(monthly_return_pct, 2),
            "data_points": len(grp),
            "first_date": str(first["date"].date()),
            "latest_date": str(last["date"].date()),
        })

    # Aggregate by account type (weighted by current balance)
    type_map: dict = {}
    for a in accounts:
        t = a["account_type"]
        if t not in type_map:
            type_map[t] = {"total_balance": 0.0, "weighted_return_sum": 0.0}
        type_map[t]["total_balance"] += a["current_balance"]
        type_map[t]["weighted_return_sum"] += a["annual_return_pct"] * a["current_balance"]

    by_type = [
        {
            "account_type": t,
            "total_balance": round(v["total_balance"], 2),
            "annual_return_pct": round(v["weighted_return_sum"] / v["total_balance"], 1)
            if v["total_balance"] > 0 else 0.0,
        }
        for t, v in type_map.items()
    ]
    by_type.sort(key=lambda x: x["total_balance"], reverse=True)

    total_balance = sum(a["current_balance"] for a in accounts)
    if total_balance > 0:
        weighted = sum(a["annual_return_pct"] * a["current_balance"] for a in accounts) / total_balance
    else:
        weighted = 0.0

    return {
        "accounts": sorted(accounts, key=lambda x: x["current_balance"], reverse=True),
        "by_type": by_type,
        "weighted_annual_return_pct": round(weighted, 1),
    }


# ── Per-account CAGR returns ──────────────────────────────────────────────────

@router.get("/account-returns")
def account_returns():
    df = db.get_balances_df()
    if df.empty:
        raise HTTPException(status_code=422, detail="No balance data — add at least one snapshot on the Accounts page")
    tx_df = db.get_transactions_df()
    result = _compute_cagr_data(df, tx_df)
    result["currency"] = db.get_base_currency()
    return result


# ── Net worth regression forecast ─────────────────────────────────────────────

@router.get("/forecast")
def forecast(months_ahead: int = 12):
    import numpy as np
    import pandas as pd
    from dateutil.relativedelta import relativedelta
    df = db.get_balances_df()
    if df.empty or len(df) < 2:
        raise HTTPException(status_code=422, detail="Not enough balance data for forecasting (need at least 2 monthly snapshots)")

    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date")

    # Accounts snapshot at different frequencies (e.g. IB daily, others monthly).
    # Naively summing every row in a calendar month double/under-counts — instead,
    # take each account's latest known balance per month and forward-fill gaps,
    # then sum across accounts (same approach as the Dashboard net-worth chart).
    df["month"] = df["date"].dt.to_period("M")
    months = sorted(df["month"].unique())
    pivot = df.pivot_table(index="month", columns="account_id", values="amount_base", aggfunc="last")
    pivot = pivot.reindex(months).ffill().fillna(0)
    monthly = pd.DataFrame({
        "date": [m.to_timestamp() for m in pivot.index],
        "amount_base": pivot.sum(axis=1).values,
    })

    x = np.arange(len(monthly))
    y = monthly["amount_base"].values
    coeffs = np.polyfit(x, y, 1)
    slope, intercept = coeffs

    future_x = np.arange(len(monthly), len(monthly) + months_ahead)
    future_dates = [monthly["date"].iloc[-1] + relativedelta(months=i+1) for i in range(months_ahead)]

    return {
        "historical": [
            {"date": str(r["date"].date()), "amount": round(float(r["amount_base"]), 2)}
            for _, r in monthly.iterrows()
        ],
        "forecast": [
            {"date": str(d.date()), "amount": round(float(slope * xi + intercept), 2)}
            for d, xi in zip(future_dates, future_x)
        ],
        "monthly_growth": round(float(slope), 2),
        "currency": db.get_base_currency(),
    }


# ── FIRE / goal calculator ─────────────────────────────────────────────────────

class FireParams(BaseModel):
    target_amount: float
    annual_return_pct: float = 7.0
    monthly_contribution: float | None = None
    withdrawal_rate_pct: float = 4.0
    monthly_expenses: float | None = None

    @field_validator("withdrawal_rate_pct")
    @classmethod
    def withdrawal_rate_must_be_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("withdrawal_rate_pct must be greater than 0")
        return v


@router.post("/fire")
def fire_projection(params: FireParams):
    import pandas as pd
    from dateutil.relativedelta import relativedelta
    df = db.get_balances_df()
    if df.empty:
        raise HTTPException(status_code=422, detail="No balance data — add at least one snapshot on the Accounts page")

    df["date"] = pd.to_datetime(df["date"])
    current_nw = float(df.sort_values("date").groupby("account_id").last()["amount_base"].sum())

    monthly_return = params.annual_return_pct / 100 / 12
    monthly_contrib = params.monthly_contribution
    if monthly_contrib is None:
        mean_income, _ = db.get_transaction_avg_income()
        monthly_spend = db.get_transaction_monthly_spend()
        monthly_contrib = max(0.0, mean_income - monthly_spend)

    # Project forward until target reached or 600 months
    balance = current_nw
    projection = []
    target_month = None
    for i in range(600):
        balance = balance * (1 + monthly_return) + monthly_contrib
        d = date.today() + relativedelta(months=i+1)
        projection.append({"date": d.isoformat(), "amount": round(balance, 2)})
        if target_month is None and balance >= params.target_amount:
            target_month = i + 1

    detected_expenses = db.get_transaction_monthly_spend()
    monthly_expenses = params.monthly_expenses or detected_expenses
    fire_number = monthly_expenses * 12 / (params.withdrawal_rate_pct / 100)

    # Detected values — shown in UI so user can understand the auto-calculation
    detected_income, _ = db.get_transaction_avg_income()
    cagr_data = _compute_cagr_data(df, db.get_transactions_df())
    detected_return_pct = cagr_data["weighted_annual_return_pct"] or None

    return {
        "current_nw": round(current_nw, 2),
        "monthly_contribution": round(monthly_contrib, 2),
        "fire_number": round(fire_number, 2),
        "target_amount": params.target_amount,
        "months_to_target": target_month,
        "years_to_target": round(target_month / 12, 1) if target_month else None,
        "projection": projection[:240],  # max 20 years in response
        "currency": db.get_base_currency(),
        # Auto-detected from transaction/balance history (informational, for UI display)
        "detected_income": round(detected_income, 2),
        "detected_expenses": round(detected_expenses, 2),
        "detected_return_pct": detected_return_pct,
    }
