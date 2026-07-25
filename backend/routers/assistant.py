"""AI-oriented helper endpoints for proactive finance guidance."""
from __future__ import annotations

import json
from datetime import date, datetime
from typing import Literal

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter
from pydantic import BaseModel

import database as db
import assistant_tools
import finance_tools

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


class Insight(BaseModel):
    title: str
    body: str
    severity: Literal["info", "good", "warning"] = "info"
    action_label: str | None = None
    action_prompt: str | None = None


# Matches the frontend's Intl.NumberFormat('en-GB', {style: 'currency', ...})
# output for the common currencies — symbol immediately before the number, no
# space, thousands-separated. Falls back to the ISO code for anything else,
# same as Intl does for currencies without a well-known symbol.
_CURRENCY_SYMBOLS = {"EUR": "€", "USD": "$", "GBP": "£", "JPY": "¥"}


def _money(value: float, currency: str) -> str:
    sign = "-" if value < 0 else ""
    symbol = _CURRENCY_SYMBOLS.get(currency, f"{currency} ")
    return f"{sign}{symbol}{abs(value):,.0f}"


def _fallback_insights() -> list[Insight]:
    import pandas as pd

    currency = db.get_base_currency()
    insights: list[Insight] = []

    balances = db.get_balances_df()
    if not balances.empty:
        balances["date"] = pd.to_datetime(balances["date"])
        latest = balances.sort_values("date").groupby("account_id").last().reset_index()
        total = float(latest["amount_base"].sum())
        liquid = float(latest[latest["account_type"] == "liquid"]["amount_base"].sum())
        liquid_pct = (liquid / total * 100) if total else 0
        label = "Cash buffer looks healthy" if liquid_pct >= 15 else "Cash buffer is relatively thin"
        severity: Literal["info", "good", "warning"] = "good" if liquid_pct >= 15 else "warning"
        insights.append(Insight(
            title=label,
            body=f"Liquid accounts hold {_money(liquid, currency)}, about {liquid_pct:.0f}% of your latest net worth.",
            severity=severity,
            action_label="Ask about liquidity",
            action_prompt="Review my cash buffer and explain whether my liquid allocation looks reasonable.",
        ))

    tx = db.get_transactions_df()
    cats = db.get_categories()
    transfer_cats = {c.name for c in cats if c.is_transfer}
    income_cats = {c.name for c in cats if c.is_income}
    if not tx.empty:
        tx["date_dt"] = pd.to_datetime(tx["date"])
        amount = tx["amount_base"].fillna(tx["amount"])
        tx["base_amount"] = amount
        start = datetime.today() - relativedelta(days=90)
        recent = tx[tx["date_dt"] >= start].copy()
        spending = recent[(recent["base_amount"] < 0) & ~recent["category"].fillna("").isin(transfer_cats)]
        if not spending.empty:
            by_cat = spending.assign(spend=-spending["base_amount"]).groupby("category")["spend"].sum().sort_values(ascending=False)
            top_cat = str(by_cat.index[0] or "Uncategorized")
            top_value = float(by_cat.iloc[0])
            insights.append(Insight(
                title=f"{top_cat} leads recent spending",
                body=f"Over the last 90 days, {top_cat} accounts for {_money(top_value, currency)} of spending.",
                severity="info",
                action_label="Drill into spending",
                action_prompt=f"Show me what drove {top_cat} spending over the last 90 days.",
            ))

        uncategorized = tx[tx["category"].isna() | (tx["category"] == "") | (tx["category"] == "Other")]
        if len(uncategorized) >= 5:
            insights.append(Insight(
                title="Categorization needs a pass",
                body=f"{len(uncategorized)} transactions are uncategorized or marked Other. Cleaning them up will improve budgets and cash-flow analysis.",
                severity="warning",
                action_label="Plan cleanup",
                action_prompt="Find my uncategorized and Other transactions and suggest how to categorize them.",
            ))

        current_month = date.today().strftime("%Y-%m")
        current_rows = tx[tx["date"].str.startswith(current_month)]
        current_income = float(current_rows[
            (current_rows["base_amount"] > 0) & ~current_rows["category"].fillna("").isin(transfer_cats)
        ]["base_amount"].sum())
        current_spend = float(-current_rows[
            (current_rows["base_amount"] < 0) & ~current_rows["category"].fillna("").isin(transfer_cats | income_cats)
        ]["base_amount"].sum())
        if current_income > 0:
            savings_rate = (current_income - current_spend) / current_income * 100
            insights.append(Insight(
                title="This month is cash-flow positive" if savings_rate >= 0 else "This month is running negative",
                body=f"Month-to-date income is {_money(current_income, currency)} and spending is {_money(current_spend, currency)}, a {savings_rate:.0f}% savings rate.",
                severity="good" if savings_rate >= 20 else "warning" if savings_rate < 0 else "info",
                action_label="Explain cash flow",
                action_prompt="Explain this month's cash flow and the biggest levers I can adjust.",
            ))

    budgets = db.get_budgets()
    if budgets:
        month = date.today().strftime("%Y-%m")
        spend_by_cat = db.get_monthly_spend_by_category(
            start_month=month,
            end_month=month,
            categories=[b.category_name for b in budgets if b.category_name != "__total__"],
        )
        risky = []
        for budget in budgets:
            if not budget.active or budget.category_name == "__total__":
                continue
            spent = spend_by_cat.get(budget.category_name, {}).get(month, 0)
            if budget.monthly_amount > 0 and spent / budget.monthly_amount >= 0.8:
                risky.append((budget.category_name, spent, budget.monthly_amount))
        if risky:
            name, spent, cap = sorted(risky, key=lambda r: r[1] / r[2], reverse=True)[0]
            insights.append(Insight(
                title=f"{name} budget is heating up",
                body=f"{name} is at {_money(spent, currency)} of {_money(cap, currency)} for the month.",
                severity="warning",
                action_label="Review budget",
                action_prompt=f"Review my {name} budget and show the transactions behind it.",
            ))

    return insights[:5]


def _ai_insights(fallback: list[Insight]) -> list[Insight] | None:
    model = db.get_setting("llm_model", "")
    api_key = db.get_setting("llm_api_key", "")
    if not model:
        return None

    try:
        import litellm
        litellm.suppress_debug_info = True
        context = {
            "net_worth": json.loads(finance_tools.get_net_worth_summary({})),
            "balances": json.loads(finance_tools.get_account_balances({})),
            "spending": json.loads(finance_tools.get_spending_by_category({"months": 3})),
            "cash_flow": json.loads(finance_tools.get_monthly_cash_flow({"months": 4})),
            "trend": json.loads(finance_tools.get_net_worth_trend({"months": 6})),
            "fallback_insights": [i.model_dump() for i in fallback],
        }
        messages = [
            {"role": "system", "content": (
                "You are a concise personal finance helper. Return only JSON with an 'insights' array. "
                "Create 3-5 practical insights from the provided finance data. Each insight needs title, body, "
                "severity ('info', 'good', or 'warning'), action_label, and action_prompt. Do not invent numbers. "
                "Format every amount as a currency symbol immediately before the number with thousands "
                "separators and no decimals, e.g. €181,622 or $4,887 — never 'EUR 181,622.00' or 'EUR 181622'."
            )},
            {"role": "user", "content": json.dumps(context, default=str)},
        ]
        kwargs: dict = {"model": model, "messages": messages, "response_format": {"type": "json_object"}}
        if api_key:
            kwargs["api_key"] = api_key
        response = litellm.completion(**kwargs)
        content = response.choices[0].message.content or "{}"
        data = json.loads(content)
        return [Insight(**item) for item in data.get("insights", [])][:5]
    except Exception:
        return None


@router.get("/insights")
def dashboard_insights():
    fallback = _fallback_insights()
    insights = _ai_insights(fallback) or fallback
    return {
        "insights": [i.model_dump() for i in insights],
        "generated_at": datetime.now().isoformat(),
        "ai_enabled": bool(db.get_setting("llm_model", "")),
    }


@router.get("/cleanup")
def cleanup_queue(limit: int = 80):
    return assistant_tools.find_uncategorized_transactions(limit=limit)


@router.get("/keyword-rule-suggestions")
def keyword_rule_suggestions(limit: int = 12):
    return assistant_tools.suggest_keyword_rules(limit=limit)


@router.get("/budget-risks")
def budget_risks(month: str | None = None):
    return assistant_tools.budget_risk_report(month=month)


@router.get("/review")
def monthly_review(month: str | None = None):
    return assistant_tools.monthly_review(month=month)
