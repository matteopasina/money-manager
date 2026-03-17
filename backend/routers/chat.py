"""
AI Chat endpoint — stateless.
The client sends the full message history; the server runs the LiteLLM
tool-calling loop and returns the assistant reply + updated history.
"""
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime
import database as db

router = APIRouter(prefix="/api/chat", tags=["chat"])

TOOLS = [
    {"type": "function", "function": {
        "name": "get_net_worth_summary",
        "description": "Current net worth total, breakdown by account type, change vs 1M/1Y ago.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    }},
    {"type": "function", "function": {
        "name": "get_account_balances",
        "description": "Latest balance for each account sorted by size.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    }},
    {"type": "function", "function": {
        "name": "get_spending_by_category",
        "description": "Spending broken down by category for the last N months.",
        "parameters": {"type": "object", "properties": {
            "months": {"type": "integer", "description": "Months to look back (default 3)"}
        }, "required": []},
    }},
    {"type": "function", "function": {
        "name": "get_monthly_cash_flow",
        "description": "Income vs expenses per calendar month for the last N months.",
        "parameters": {"type": "object", "properties": {
            "months": {"type": "integer", "description": "Months to look back (default 6)"}
        }, "required": []},
    }},
    {"type": "function", "function": {
        "name": "get_recent_transactions",
        "description": "Recent transactions, optionally filtered by category or account.",
        "parameters": {"type": "object", "properties": {
            "limit": {"type": "integer", "description": "Max rows (default 20)"},
            "category": {"type": "string", "description": "Filter by category"},
            "account": {"type": "string", "description": "Filter by account name substring"},
        }, "required": []},
    }},
    {"type": "function", "function": {
        "name": "get_net_worth_trend",
        "description": "Monthly net worth snapshots for the last N months.",
        "parameters": {"type": "object", "properties": {
            "months": {"type": "integer", "description": "Months to look back (default 12)"}
        }, "required": []},
    }},
]


def _tool_get_net_worth_summary(inputs: dict) -> str:
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


def _tool_get_account_balances(inputs: dict) -> str:
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


def _tool_get_spending_by_category(inputs: dict) -> str:
    import pandas as pd
    from dateutil.relativedelta import relativedelta
    base_currency = db.get_base_currency()
    months = int(inputs.get("months", 3))
    end = datetime.today()
    start = end - relativedelta(months=months)
    df = db.get_transactions_df(start=start.strftime("%Y-%m-%d"), end=end.strftime("%Y-%m-%d"))
    expenses = df[df["amount"] < 0].copy() if not df.empty else df
    if expenses.empty:
        return json.dumps({"categories": [], "total": 0, "period_months": months})
    expenses["amount"] = expenses["amount"].abs()
    total = float(expenses["amount"].sum())
    by_cat = expenses.groupby("category")["amount"].sum().sort_values(ascending=False)
    return json.dumps({"categories": [
        {"category": c, "total": round(float(a), 2), "pct": round(float(a)/total*100, 1)}
        for c, a in by_cat.items()
    ], "total": round(total, 2), "period_months": months, "currency": base_currency})


def _tool_get_monthly_cash_flow(inputs: dict) -> str:
    import pandas as pd
    from dateutil.relativedelta import relativedelta
    base_currency = db.get_base_currency()
    months = int(inputs.get("months", 6))
    end = datetime.today()
    start = end - relativedelta(months=months)
    df = db.get_transactions_df(start=start.strftime("%Y-%m-%d"), end=end.strftime("%Y-%m-%d"))
    if df.empty:
        return json.dumps({"months": []})
    df["date"] = pd.to_datetime(df["date"])
    df["month"] = df["date"].dt.to_period("M").astype(str)
    income = df[df["amount"] > 0].groupby("month")["amount"].sum()
    expenses = df[df["amount"] < 0].groupby("month")["amount"].sum().abs()
    all_months = sorted(set(income.index) | set(expenses.index))
    return json.dumps({"months": [
        {"month": m, "income": round(float(income.get(m, 0)), 2),
         "expenses": round(float(expenses.get(m, 0)), 2),
         "net": round(float(income.get(m, 0)) - float(expenses.get(m, 0)), 2)}
        for m in all_months
    ], "currency": base_currency})


def _tool_get_recent_transactions(inputs: dict) -> str:
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
         "amount": round(float(r["amount"]), 2), "category": r["category"], "account": r["account"]}
        for _, r in df.head(limit).iterrows()
    ]})


def _tool_get_net_worth_trend(inputs: dict) -> str:
    import pandas as pd
    from dateutil.relativedelta import relativedelta
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


_TOOL_HANDLERS: dict = {
    "get_net_worth_summary":    _tool_get_net_worth_summary,
    "get_account_balances":     _tool_get_account_balances,
    "get_spending_by_category": _tool_get_spending_by_category,
    "get_monthly_cash_flow":    _tool_get_monthly_cash_flow,
    "get_recent_transactions":  _tool_get_recent_transactions,
    "get_net_worth_trend":      _tool_get_net_worth_trend,
}


def _run_tool(name: str, inputs: dict) -> str:
    handler = _TOOL_HANDLERS.get(name)
    if handler is None:
        return json.dumps({"error": f"Unknown tool: {name}"})
    try:
        return handler(inputs)
    except Exception as e:
        return json.dumps({"error": str(e)})


class ChatRequest(BaseModel):
    messages: list[dict]   # full OpenAI-format history (no system message)
    model: str
    # api_key is read from app_settings (llm_api_key) — not accepted from the client


@router.post("")
def chat(body: ChatRequest):
    try:
        import litellm
        litellm.suppress_debug_info = True
    except ImportError:
        raise HTTPException(500, "litellm not installed. Run: pip install litellm")

    api_key = db.get_setting("llm_api_key", "")

    system = (
        f"You are a personal finance assistant. Today is {datetime.today().strftime('%Y-%m-%d')}. "
        "You have tools to query the user's financial data. Always call a tool to fetch data before answering. "
        "Be concise: 1-3 short paragraphs or a bullet list. Use the base currency symbol for amounts."
    )
    messages = [{"role": "system", "content": system}] + body.messages

    for _ in range(8):
        kwargs: dict = {"model": body.model, "messages": messages, "tools": TOOLS, "tool_choice": "auto"}
        if api_key:
            kwargs["api_key"] = api_key

        response = litellm.completion(**kwargs)
        choice = response.choices[0]
        msg = choice.message

        if choice.finish_reason == "tool_calls" or msg.tool_calls:
            tool_call_dicts = [
                {"id": tc.id, "type": "function",
                 "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                for tc in msg.tool_calls
            ]
            messages.append({"role": "assistant", "content": msg.content, "tool_calls": tool_call_dicts})
            for tc in msg.tool_calls:
                result = _run_tool(tc.function.name, json.loads(tc.function.arguments or "{}"))
                messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})
        else:
            answer = msg.content or ""
            updated_history = messages[1:]  # drop system
            return {"reply": answer, "messages": updated_history}

    return {"reply": "Sorry, I ran out of tool rounds.", "messages": body.messages}
