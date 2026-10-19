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
import finance_tools
import write_tools

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
    {"type": "function", "function": {
        "name": "get_schema",
        "description": "Return the SQLite schema (CREATE TABLE statements) for every queryable table. "
                       "Call this before run_sql to learn the exact table and column names.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    }},
    {"type": "function", "function": {
        "name": "run_sql",
        "description": (
            "Run a read-only SQL query against the finance database for anything the other tools "
            "don't cover. Rules: a single SELECT (or WITH…SELECT) statement only — no INSERT/UPDATE/"
            "DELETE/PRAGMA/ATTACH. Key tables: transactions(date, description, amount, amount_base, "
            "category, account_id), accounts(id, name, currency, account_type), balances(account_id, "
            "date, amount_native, amount_base), categories(name, is_income, is_transfer), budgets, "
            "fx_rates. Spending = amount < 0; amounts in base currency use COALESCE(amount_base, amount). "
            "Call get_schema first if unsure about columns. Results are capped at 200 rows."
        ),
        "parameters": {"type": "object", "properties": {
            "query": {"type": "string", "description": "A single read-only SELECT statement"}
        }, "required": ["query"]},
    }},
    {"type": "function", "function": {
        "name": "create_category",
        "description": (
            "WRITE: Create a new category only after the user explicitly asks for or approves it. "
            "If a matching category already exists, returns it without creating a duplicate."
        ),
        "parameters": {"type": "object", "properties": {
            "name": {"type": "string", "description": "Category name"},
            "color": {"type": "string", "description": "Hex color, e.g. #6b7280"},
            "is_income": {"type": "boolean", "description": "Whether this category is income"},
            "is_transfer": {"type": "boolean", "description": "Whether this category is a transfer/excluded category"},
        }, "required": ["name"]},
    }},
    {"type": "function", "function": {
        "name": "create_keyword_rule",
        "description": (
            "WRITE: Create a keyword rule only after the user explicitly asks for or approves it. "
            "The category must already exist."
        ),
        "parameters": {"type": "object", "properties": {
            "keyword": {"type": "string", "description": "Keyword to match in transaction text"},
            "category_name": {"type": "string", "description": "Existing category name"},
            "match_field": {"type": "string", "enum": ["description", "reference", "any"], "description": "Field to match"},
            "priority": {"type": "integer", "description": "Higher priority rules run first"},
        }, "required": ["keyword", "category_name"]},
    }},
    {"type": "function", "function": {
        "name": "update_transaction_category",
        "description": "WRITE: Update one transaction category only after the user explicitly asks for or approves it.",
        "parameters": {"type": "object", "properties": {
            "transaction_id": {"type": "integer", "description": "Transaction id"},
            "category_name": {"type": "string", "description": "Existing category name"},
        }, "required": ["transaction_id", "category_name"]},
    }},
    {"type": "function", "function": {
        "name": "create_budget",
        "description": (
            "WRITE: Create a monthly budget only after the user explicitly asks for or approves it. "
            "Category must be an existing expense category, or __total__ for all spending."
        ),
        "parameters": {"type": "object", "properties": {
            "category_name": {"type": "string", "description": "Existing expense category name or __total__"},
            "monthly_amount": {"type": "number", "description": "Budget amount in base currency, greater than 0"},
            "rollover": {"type": "boolean", "description": "Whether unused budget rolls over"},
            "active": {"type": "boolean", "description": "Whether budget is active"},
        }, "required": ["category_name", "monthly_amount"]},
    }},
    {"type": "function", "function": {
        "name": "preview_reapply_keyword_rules",
        "description": "Preview category changes from matching keyword rules. Unmatched transactions keep their existing category.",
        "parameters": {"type": "object", "properties": {
            "limit": {"type": "integer", "description": "Maximum sample rows to return"},
        }, "required": []},
    }},
    {"type": "function", "function": {
        "name": "reapply_keyword_rules",
        "description": (
            "WRITE: Apply matching keyword rules only after showing preview_reapply_keyword_rules "
            "and receiving explicit user approval. Unmatched transactions keep their existing category. "
            "Must pass confirm=true."
        ),
        "parameters": {"type": "object", "properties": {
            "confirm": {"type": "boolean", "description": "Must be true after explicit user approval"},
        }, "required": ["confirm"]},
    }},
]


_TOOL_HANDLERS: dict = {
    "get_net_worth_summary":    finance_tools.get_net_worth_summary,
    "get_account_balances":     finance_tools.get_account_balances,
    "get_spending_by_category": finance_tools.get_spending_by_category,
    "get_monthly_cash_flow":    finance_tools.get_monthly_cash_flow,
    "get_recent_transactions":  finance_tools.get_recent_transactions,
    "get_net_worth_trend":      finance_tools.get_net_worth_trend,
    "get_schema":               finance_tools.get_schema,
    "run_sql":                  finance_tools.run_sql,
    "create_category":          write_tools.create_category,
    "create_keyword_rule":      write_tools.create_keyword_rule,
    "update_transaction_category": write_tools.update_transaction_category,
    "create_budget":            write_tools.create_budget,
    "preview_reapply_keyword_rules": write_tools.preview_reapply_keyword_rules,
    "reapply_keyword_rules":    write_tools.reapply_keyword_rules,
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
    page_context: str = ""  # current page data injected by the frontend
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
        "Prefer the specific tools (net worth, balances, spending, cash flow, transactions, trend) for common "
        "questions. For anything they don't cover, use run_sql with a read-only SELECT — call get_schema first "
        "if you're unsure of the exact table or column names. "
        "Some tools can write data. Never call a WRITE tool unless the user explicitly asks you to make that "
        "change or has approved a specific proposed change. For bulk recategorization, always preview first. "
        "Be concise: 1-3 short paragraphs or a bullet list. Use the base currency symbol for amounts."
    )
    if body.page_context:
        system += f"\n\nThe user is currently viewing this page data:\n{body.page_context}"
    messages = [{"role": "system", "content": system}] + body.messages

    for _ in range(8):
        kwargs: dict = {"model": body.model, "messages": messages, "tools": TOOLS, "tool_choice": "auto"}
        # Luna models default to reasoning_effort="medium", but OpenAI's Chat
        # Completions endpoint does not support function tools with reasoning
        # enabled for these models. Keep this compatibility override scoped to
        # Luna; LiteLLM's Responses API supports reasoning with tools.
        if body.model.rsplit("/", 1)[-1] in {"gpt-5.6-luna", "gpt-6-luna"}:
            kwargs["reasoning_effort"] = "none"
            # Older LiteLLM metadata omits reasoning_effort for GPT-6 Luna
            # and tool_choice for GPT-5.6 Luna. Keep both explicit tool-loop
            # parameters through validation rather than dropping them globally.
            kwargs["allowed_openai_params"] = ["reasoning_effort", "tool_choice"]
        if api_key:
            kwargs["api_key"] = api_key

        try:
            response = litellm.completion(**kwargs)
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))
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
