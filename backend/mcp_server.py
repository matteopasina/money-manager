"""MCP server for querying and safely updating Money Manager data.

Run with:
    python -m backend.mcp_server

Clients usually launch it over stdio and can set DB_PATH to point at a
specific finances.db file.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# Match backend/main.py: allow running from the project root.
sys.path.insert(0, str(Path(__file__).parent))

import finance_tools
import write_tools
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("money-manager")


def _json_result(payload: str) -> dict:
    return json.loads(payload)


@mcp.tool()
def get_net_worth_summary() -> dict:
    """Current net worth total, breakdown by account type, and 1M/1Y change."""
    return _json_result(finance_tools.get_net_worth_summary({}))


@mcp.tool()
def get_account_balances() -> dict:
    """Latest balance for each account sorted by base-currency value."""
    return _json_result(finance_tools.get_account_balances({}))


@mcp.tool()
def get_spending_by_category(months: int = 3) -> dict:
    """Spending by category for the last N months."""
    return _json_result(finance_tools.get_spending_by_category({"months": months}))


@mcp.tool()
def get_monthly_cash_flow(months: int = 6) -> dict:
    """Income, expenses, and net cash flow per calendar month."""
    return _json_result(finance_tools.get_monthly_cash_flow({"months": months}))


@mcp.tool()
def get_recent_transactions(limit: int = 20, category: str = "", account: str = "") -> dict:
    """Recent transactions, optionally filtered by category or account substring."""
    inputs = {"limit": limit}
    if category:
        inputs["category"] = category
    if account:
        inputs["account"] = account
    return _json_result(finance_tools.get_recent_transactions(inputs))


@mcp.tool()
def get_net_worth_trend(months: int = 12) -> dict:
    """Monthly net worth snapshots for the last N months."""
    return _json_result(finance_tools.get_net_worth_trend({"months": months}))


@mcp.tool()
def get_schema() -> dict:
    """SQLite schema for queryable tables, excluding app_settings/secrets."""
    return _json_result(finance_tools.get_schema({}))


@mcp.tool()
def run_sql(query: str) -> dict:
    """Run one read-only SELECT/WITH query. Results are capped at 200 rows."""
    return _json_result(finance_tools.run_sql({"query": query}))


@mcp.tool()
def create_category(name: str, color: str = "#6b7280", is_income: bool = False, is_transfer: bool = False) -> dict:
    """Create a category if it does not already exist."""
    return _json_result(write_tools.create_category({
        "name": name,
        "color": color,
        "is_income": is_income,
        "is_transfer": is_transfer,
    }))


@mcp.tool()
def create_keyword_rule(keyword: str, category_name: str, match_field: str = "any", priority: int = 0) -> dict:
    """Create a keyword-to-category rule after the user asks for it."""
    return _json_result(write_tools.create_keyword_rule({
        "keyword": keyword,
        "category_name": category_name,
        "match_field": match_field,
        "priority": priority,
    }))


@mcp.tool()
def update_transaction_category(transaction_id: int, category_name: str) -> dict:
    """Set one transaction's category after the user asks for it."""
    return _json_result(write_tools.update_transaction_category({
        "transaction_id": transaction_id,
        "category_name": category_name,
    }))


@mcp.tool()
def create_budget(category_name: str, monthly_amount: float, rollover: bool = False, active: bool = True) -> dict:
    """Create a monthly budget for an existing expense category."""
    return _json_result(write_tools.create_budget({
        "category_name": category_name,
        "monthly_amount": monthly_amount,
        "rollover": rollover,
        "active": active,
    }))


@mcp.tool()
def preview_reapply_keyword_rules(limit: int = 20) -> dict:
    """Preview transaction category changes before reapplying keyword rules."""
    return _json_result(write_tools.preview_reapply_keyword_rules({"limit": limit}))


@mcp.tool()
def reapply_keyword_rules(confirm: bool = False) -> dict:
    """Reapply keyword rules to all transactions only after preview approval."""
    return _json_result(write_tools.reapply_keyword_rules({"confirm": confirm}))


if __name__ == "__main__":
    mcp.run()
