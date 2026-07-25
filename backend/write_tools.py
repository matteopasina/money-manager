"""Guarded write tools shared by AI chat and MCP.

These functions mutate finance data, so they validate inputs and return
auditable JSON payloads describing exactly what changed.
"""
from __future__ import annotations

import json
import re
import sqlite3
from datetime import date
from typing import Any

import database as db
from categoriser import categorise, recategorise_all
from domain import Budget, Category, KeywordRule

TOTAL_BUDGET = "__total__"
_HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
_MATCH_FIELDS = {"description", "reference", "any"}


def _ok(payload: dict[str, Any]) -> str:
    return json.dumps({"ok": True, **payload}, default=str)


def _error(message: str) -> str:
    return json.dumps({"ok": False, "error": message})


def _current_month() -> str:
    return date.today().strftime("%Y-%m")


def _category_by_name(name: str) -> Category | None:
    normalized = name.strip()
    return next((c for c in db.get_categories() if c.name.lower() == normalized.lower()), None)


def _category_payload(cat: Category) -> dict[str, Any]:
    return {
        "id": cat.id,
        "name": cat.name,
        "color": cat.color,
        "is_income": cat.is_income,
        "is_transfer": cat.is_transfer,
    }


def _rule_payload(rule: KeywordRule) -> dict[str, Any]:
    return {
        "id": rule.id,
        "keyword": rule.keyword,
        "category_name": rule.category_name,
        "match_field": rule.match_field,
        "priority": rule.priority,
    }


def _budget_payload(budget: Budget) -> dict[str, Any]:
    return {
        "id": budget.id,
        "category_name": budget.category_name,
        "monthly_amount": budget.monthly_amount,
        "rollover": budget.rollover,
        "start_month": budget.start_month,
        "active": budget.active,
    }


def create_category(inputs: dict[str, Any] | None = None) -> str:
    inputs = inputs or {}
    name = str(inputs.get("name") or "").strip()
    color = str(inputs.get("color") or "#6b7280").strip()
    is_income = bool(inputs.get("is_income", False))
    is_transfer = bool(inputs.get("is_transfer", False))

    if not name:
        return _error("Category name is required")
    if not _HEX_COLOR_RE.match(color):
        return _error("Color must be a hex value like #6b7280")
    existing = _category_by_name(name)
    if existing:
        return _ok({"created": False, "category": _category_payload(existing)})

    try:
        cat = db.upsert_category(Category(
            name=name,
            color=color,
            is_income=is_income,
            is_transfer=is_transfer,
        ))
    except sqlite3.IntegrityError:
        return _error(f"Category '{name}' already exists")
    return _ok({"created": True, "category": _category_payload(cat)})


def create_keyword_rule(inputs: dict[str, Any] | None = None) -> str:
    inputs = inputs or {}
    keyword = str(inputs.get("keyword") or "").strip().lower()
    category_name = str(inputs.get("category_name") or "").strip()
    match_field = str(inputs.get("match_field") or "any").strip()
    priority = int(inputs.get("priority", 0))

    if not keyword:
        return _error("Keyword is required")
    category = _category_by_name(category_name)
    if category is None:
        return _error(f"Category '{category_name}' not found")
    if match_field not in _MATCH_FIELDS:
        return _error("match_field must be description, reference, or any")

    existing = next(
        (
            r for r in db.get_keyword_rules()
            if r.keyword == keyword and r.category_name == category.name and r.match_field == match_field
        ),
        None,
    )
    if existing:
        return _ok({"created": False, "rule": _rule_payload(existing)})

    try:
        rule = db.upsert_keyword_rule(KeywordRule(
            keyword=keyword,
            category_name=category.name,
            match_field=match_field,
            priority=priority,
        ))
    except sqlite3.IntegrityError:
        return _error("A conflicting keyword rule already exists")
    return _ok({"created": True, "rule": _rule_payload(rule)})


def update_transaction_category(inputs: dict[str, Any] | None = None) -> str:
    inputs = inputs or {}
    try:
        transaction_id = int(inputs.get("transaction_id"))
    except (TypeError, ValueError):
        return _error("transaction_id must be an integer")
    category_name = str(inputs.get("category_name") or "").strip()
    category = _category_by_name(category_name)
    if category is None:
        return _error(f"Category '{category_name}' not found")

    with db.get_connection() as conn:
        row = conn.execute(
            "SELECT id, date, description, amount, category FROM transactions WHERE id = ?",
            (transaction_id,),
        ).fetchone()
    if row is None:
        return _error(f"Transaction {transaction_id} not found")

    old_category = row["category"]
    db.update_transaction_category(transaction_id, category.name)
    return _ok({
        "transaction": {
            "id": row["id"],
            "date": row["date"],
            "description": row["description"],
            "amount": row["amount"],
            "old_category": old_category,
            "new_category": category.name,
        }
    })


def create_budget(inputs: dict[str, Any] | None = None) -> str:
    inputs = inputs or {}
    category_name = str(inputs.get("category_name") or "").strip()
    try:
        monthly_amount = float(inputs.get("monthly_amount"))
    except (TypeError, ValueError):
        return _error("monthly_amount must be a number greater than 0")
    rollover = bool(inputs.get("rollover", False))
    active = bool(inputs.get("active", True))

    if monthly_amount <= 0:
        return _error("monthly_amount must be greater than 0")
    if category_name == TOTAL_BUDGET:
        category_for_budget = TOTAL_BUDGET
    else:
        category = _category_by_name(category_name)
        if category is None:
            return _error(f"Category '{category_name}' not found")
        if category.is_income or category.is_transfer:
            return _error("Cannot budget an income/transfer category")
        category_for_budget = category.name

    existing = next((b for b in db.get_budgets() if b.category_name == category_for_budget), None)
    if existing:
        return _ok({"created": False, "budget": _budget_payload(existing)})

    try:
        budget = db.upsert_budget(Budget(
            category_name=category_for_budget,
            monthly_amount=monthly_amount,
            rollover=rollover,
            start_month=_current_month(),
            active=active,
        ))
    except sqlite3.IntegrityError:
        return _error(f"A budget for '{category_for_budget}' already exists")
    return _ok({"created": True, "budget": _budget_payload(budget)})


def preview_reapply_keyword_rules(inputs: dict[str, Any] | None = None) -> str:
    inputs = inputs or {}
    limit = max(1, min(int(inputs.get("limit", 20)), 100))
    rules = db.get_keyword_rules()
    changes = []
    with db.get_connection() as conn:
        rows = conn.execute(
            "SELECT id, date, description, reference, amount, category FROM transactions ORDER BY date DESC, id DESC"
        ).fetchall()

    for row in rows:
        new_category = categorise(row["description"], row["reference"] or "", rules)
        if new_category != row["category"]:
            changes.append({
                "id": row["id"],
                "date": row["date"],
                "description": row["description"],
                "amount": row["amount"],
                "old_category": row["category"],
                "new_category": new_category,
            })

    return _ok({
        "total_changes": len(changes),
        "sample": changes[:limit],
        "truncated": len(changes) > limit,
    })


def reapply_keyword_rules(inputs: dict[str, Any] | None = None) -> str:
    inputs = inputs or {}
    if inputs.get("confirm") is not True:
        return _error("Set confirm=true only after the user approves the preview")
    count = recategorise_all(db.get_keyword_rules())
    return _ok({"updated": count})


TOOL_HANDLERS = {
    "create_category": create_category,
    "create_keyword_rule": create_keyword_rule,
    "update_transaction_category": update_transaction_category,
    "create_budget": create_budget,
    "preview_reapply_keyword_rules": preview_reapply_keyword_rules,
    "reapply_keyword_rules": reapply_keyword_rules,
}


def run_tool(name: str, inputs: dict[str, Any] | None = None) -> str:
    handler = TOOL_HANDLERS.get(name)
    if handler is None:
        return _error(f"Unknown write tool: {name}")
    try:
        return handler(inputs or {})
    except Exception as e:
        return _error(str(e))
