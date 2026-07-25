"""Read-only finance query tools shared by AI chat and MCP."""
from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime
from typing import Any

import database as db
import domain

_SQL_BLOCKED_TABLES = {"app_settings"}
_SQL_MAX_ROWS = 200


def get_net_worth_summary(inputs: dict[str, Any] | None = None) -> str:
    import pandas as pd

    base_currency = db.get_base_currency()
    df = db.get_balances_df()
    if df.empty:
        return json.dumps({"error": "No balance data"})
    df["date"] = pd.to_datetime(df["date"])
    latest = df.sort_values("date").groupby("account_id").last().reset_index()
    total = float(latest["amount_base"].sum())
    by_type = {k: round(float(v), 2) for k, v in latest.groupby("account_type")["amount_base"].sum().items()}
    today = df["date"].max()

    def _nw_at(target):
        sub = df[df["date"] <= target]
        return float(sub.sort_values("date").groupby("account_id").last()["amount_base"].sum()) if not sub.empty else None

    nw_1m = _nw_at(today - pd.DateOffset(months=1))
    nw_1y = _nw_at(today - pd.DateOffset(years=1))
    return json.dumps({
        "total": round(total, 2), "currency": base_currency, "by_type": by_type,
        "change_1_month": round(total - nw_1m, 2) if nw_1m is not None else None,
        "change_1_year": round(total - nw_1y, 2) if nw_1y is not None else None,
    })


def get_account_balances(inputs: dict[str, Any] | None = None) -> str:
    import pandas as pd

    base_currency = db.get_base_currency()
    df = db.get_balances_df()
    if df.empty:
        return json.dumps({"accounts": []})
    df["date"] = pd.to_datetime(df["date"])
    latest = df.sort_values("date").groupby("account_id").last().reset_index()
    rows = [{"account": r["account"], "type": r["account_type"], "currency": r["currency"],
             "amount_base": round(float(r["amount_base"]), 2), "as_of": str(r["date"].date())}
            for _, r in latest.sort_values("amount_base", ascending=False).iterrows()]
    return json.dumps({"accounts": rows, "currency": base_currency})


def get_spending_by_category(inputs: dict[str, Any] | None = None) -> str:
    from dateutil.relativedelta import relativedelta

    inputs = inputs or {}
    base_currency = db.get_base_currency()
    months = int(inputs.get("months", 3))
    end = datetime.today()
    start = end - relativedelta(months=months)
    df = db.get_transactions_df(start=start.strftime("%Y-%m-%d"), end=end.strftime("%Y-%m-%d"))
    expenses = domain.spending_frame(df, db.get_categories())
    if expenses.empty:
        return json.dumps({"categories": [], "total": 0, "period_months": months})
    total = float(expenses["amount_base"].sum())
    by_cat = expenses.groupby("category")["amount_base"].sum().sort_values(ascending=False)
    return json.dumps({"categories": [
        {"category": c, "total": round(float(a), 2), "pct": round(float(a) / total * 100, 1)}
        for c, a in by_cat.items()
    ], "total": round(total, 2), "period_months": months, "currency": base_currency})


def get_monthly_cash_flow(inputs: dict[str, Any] | None = None) -> str:
    import pandas as pd
    from dateutil.relativedelta import relativedelta

    inputs = inputs or {}
    base_currency = db.get_base_currency()
    months = int(inputs.get("months", 6))
    end = datetime.today()
    start = end - relativedelta(months=months)
    df = db.get_transactions_df(start=start.strftime("%Y-%m-%d"), end=end.strftime("%Y-%m-%d"))
    if df.empty:
        return json.dumps({"months": []})
    categories = db.get_categories()
    excluded = {c.name for c in categories if c.is_transfer}
    df = df[~df["category"].isin(excluded)].copy()
    df["amount_base"] = df["amount_base"].where(df["amount_base"].notna(), df["amount"])
    df["date"] = pd.to_datetime(df["date"])
    df["month"] = df["date"].dt.to_period("M").astype(str)
    income = df[df["amount_base"] > 0].groupby("month")["amount_base"].sum()
    expenses = df[df["amount_base"] < 0].groupby("month")["amount_base"].sum().abs()
    all_months = sorted(set(income.index) | set(expenses.index))
    return json.dumps({"months": [
        {"month": m, "income": round(float(income.get(m, 0)), 2),
         "expenses": round(float(expenses.get(m, 0)), 2),
         "net": round(float(income.get(m, 0)) - float(expenses.get(m, 0)), 2)}
        for m in all_months
    ], "currency": base_currency})


def get_recent_transactions(inputs: dict[str, Any] | None = None) -> str:
    inputs = inputs or {}
    limit = int(inputs.get("limit", 20))
    df = db.get_transactions_df()
    if df.empty:
        return json.dumps({"transactions": []})
    if inputs.get("category"):
        df = df[df["category"].str.lower() == inputs["category"].lower()]
    if inputs.get("account"):
        df = df[df["account"].str.lower().str.contains(inputs["account"].lower(), na=False)]
    return json.dumps({"transactions": [
        {"date": r["date"], "description": r["description"],
         "amount": round(float(r["amount"]), 2), "amount_base": round(domain.base_amount(r), 2),
         "category": r["category"], "account": r["account"]}
        for _, r in df.head(limit).iterrows()
    ]})


def get_net_worth_trend(inputs: dict[str, Any] | None = None) -> str:
    import pandas as pd
    from dateutil.relativedelta import relativedelta

    inputs = inputs or {}
    base_currency = db.get_base_currency()
    months = int(inputs.get("months", 12))
    df = db.get_balances_df()
    if df.empty:
        return json.dumps({"trend": []})
    df["date"] = pd.to_datetime(df["date"])
    cutoff = datetime.today() - relativedelta(months=months)
    df = df[df["date"] >= cutoff]
    df["month"] = df["date"].dt.to_period("M").astype(str)
    trend = [
        {"month": m, "net_worth": round(float(
            df[df["month"] == m].sort_values("date").groupby("account_id").last()["amount_base"].sum()
        ), 2)}
        for m in sorted(df["month"].unique())
    ]
    return json.dumps({"trend": trend, "currency": base_currency})


def get_schema(inputs: dict[str, Any] | None = None) -> str:
    with db.get_connection() as conn:
        rows = conn.execute(
            "SELECT name, sql FROM sqlite_master WHERE type='table' "
            "AND name NOT IN ('app_settings', 'sqlite_sequence') ORDER BY name"
        ).fetchall()
    return json.dumps({"tables": [{"name": r["name"], "sql": r["sql"]} for r in rows]})


def run_sql(inputs: dict[str, Any] | None = None) -> str:
    """Execute a read-only, single-statement SELECT against the finance DB."""
    inputs = inputs or {}
    query = (inputs.get("query") or "").strip().rstrip(";").strip()
    if not query:
        return json.dumps({"error": "Empty query"})
    if ";" in query:
        return json.dumps({"error": "Only a single statement is allowed"})
    low = query.lower()
    if not (low.startswith("select") or low.startswith("with")):
        return json.dumps({"error": "Only SELECT queries are allowed (read-only)"})
    for table in _SQL_BLOCKED_TABLES:
        if re.search(rf"\b{re.escape(table)}\b", low):
            return json.dumps({"error": f"The {table} table is not accessible"})

    try:
        conn = sqlite3.connect(f"file:{db.DB_PATH}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA query_only = ON")
        try:
            cur = conn.execute(query)
            fetched = cur.fetchmany(_SQL_MAX_ROWS + 1)
            columns = [d[0] for d in cur.description] if cur.description else []
        finally:
            conn.close()
    except sqlite3.Error as e:
        return json.dumps({"error": f"SQL error: {e}"})

    truncated = len(fetched) > _SQL_MAX_ROWS
    rows = [dict(r) for r in fetched[:_SQL_MAX_ROWS]]
    return json.dumps({"columns": columns, "rows": rows, "row_count": len(rows),
                       "truncated": truncated}, default=str)


TOOL_HANDLERS = {
    "get_net_worth_summary": get_net_worth_summary,
    "get_account_balances": get_account_balances,
    "get_spending_by_category": get_spending_by_category,
    "get_monthly_cash_flow": get_monthly_cash_flow,
    "get_recent_transactions": get_recent_transactions,
    "get_net_worth_trend": get_net_worth_trend,
    "get_schema": get_schema,
    "run_sql": run_sql,
}


def run_tool(name: str, inputs: dict[str, Any] | None = None) -> str:
    handler = TOOL_HANDLERS.get(name)
    if handler is None:
        return json.dumps({"error": f"Unknown tool: {name}"})
    try:
        return handler(inputs or {})
    except Exception as e:
        return json.dumps({"error": str(e)})
