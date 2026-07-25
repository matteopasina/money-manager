"""Deterministic finance assistant analyses.

These helpers are intentionally model-free: they produce auditable facts,
evidence rows, and suggested actions that the UI or LLM can explain.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import date
from typing import Any

import database as db
import domain

TOTAL_BUDGET = "__total__"
UNCATEGORIZED = {None, "", "Other"}


def _is_missing(value: Any) -> bool:
    if value is None:
        return True
    try:
        return bool(value != value)
    except Exception:
        return False


def _json_value(value: Any) -> Any:
    if _is_missing(value):
        return None
    if hasattr(value, "item"):
        return value.item()
    return value


def _is_uncategorized(value: Any) -> bool:
    return _is_missing(value) or value in UNCATEGORIZED


def _month_shift(month: str, offset: int) -> str:
    y, m = int(month[:4]), int(month[5:7])
    total = y * 12 + (m - 1) + offset
    return f"{total // 12:04d}-{total % 12 + 1:02d}"


def _merchant_key(description: str) -> str:
    text = description.lower()
    text = re.sub(r"\b\d{2,}\b", " ", text)
    text = re.sub(r"[^a-z0-9à-ÿ]+", " ", text, flags=re.IGNORECASE)
    words = [
        w for w in text.split()
        if len(w) > 2 and w not in {"pos", "card", "payment", "online", "sepa", "transfer"}
    ]
    return " ".join(words[:4]) or description.lower().strip()[:40]


def _evidence_row(row) -> dict[str, Any]:
    return {
        "id": _json_value(row["id"]),
        "date": _json_value(row["date"]),
        "description": _json_value(row["description"]),
        "amount": _json_value(row["amount"]),
        "amount_base": _json_value(row["amount_base"]),
        "category": _json_value(row["category"]),
        "account": _json_value(row["account"]),
        "account_id": _json_value(row["account_id"]),
    }


def _rule_category_for(text: str) -> str | None:
    haystack = text.lower()
    for rule in db.get_keyword_rules():
        if rule.keyword.lower() in haystack:
            return rule.category_name
    return None


def _historical_category_for(merchant: str) -> str | None:
    counts: Counter[str] = Counter()
    tx = db.get_transactions_df()
    if tx.empty:
        return None
    for _, row in tx.iterrows():
        cat = row["category"]
        if _is_uncategorized(cat):
            continue
        if _merchant_key(str(row["description"])) == merchant:
            counts[str(cat)] += 1
    return counts.most_common(1)[0][0] if counts else None


def find_uncategorized_transactions(limit: int = 80) -> dict[str, Any]:
    currency = db.get_base_currency()
    tx = db.get_transactions_df()
    if tx.empty:
        return {"currency": currency, "total": 0, "groups": []}

    rows = []
    for _, row in tx.iterrows():
        if _is_uncategorized(row["category"]):
            rows.append(row)
        if len(rows) >= limit:
            break

    groups_by_key: dict[str, list[Any]] = defaultdict(list)
    for row in rows:
        groups_by_key[_merchant_key(str(row["description"]))].append(row)

    groups = []
    for merchant, group_rows in groups_by_key.items():
        total = round(sum(abs(domain.base_amount(r)) for r in group_rows if domain.base_amount(r) < 0), 2)
        sample = str(group_rows[0]["description"])
        suggested_category = _rule_category_for(sample) or _historical_category_for(merchant)
        actions = []
        if suggested_category:
            actions.append({
                "type": "create_keyword_rule",
                "label": f"Create rule: {merchant} -> {suggested_category}",
                "payload": {
                    "keyword": merchant,
                    "category_name": suggested_category,
                    "match_field": "description",
                    "priority": 0,
                },
            })
        groups.append({
            "merchant": merchant,
            "count": len(group_rows),
            "total_spend": total,
            "suggested_category": suggested_category,
            "evidence": [_evidence_row(r) for r in group_rows[:6]],
            "actions": actions,
        })

    groups.sort(key=lambda g: (g["count"], g["total_spend"]), reverse=True)
    return {"currency": currency, "total": len(rows), "groups": groups}


def suggest_keyword_rules(limit: int = 12) -> dict[str, Any]:
    cleanup = find_uncategorized_transactions(limit=200)
    suggestions = []
    for group in cleanup["groups"]:
        if not group["suggested_category"]:
            continue
        suggestions.append({
            "keyword": group["merchant"],
            "category_name": group["suggested_category"],
            "match_field": "description",
            "priority": 0,
            "evidence_count": group["count"],
            "evidence": group["evidence"],
            "action": group["actions"][0] if group["actions"] else None,
        })
        if len(suggestions) >= limit:
            break
    return {"currency": cleanup["currency"], "suggestions": suggestions}


def budget_risk_report(month: str | None = None) -> dict[str, Any]:
    month = month or date.today().strftime("%Y-%m")
    currency = db.get_base_currency()
    budgets = [b for b in db.get_budgets() if b.active and b.category_name != TOTAL_BUDGET]
    spend = db.get_monthly_spend_by_category(
        start_month=month,
        end_month=month,
        categories=[b.category_name for b in budgets],
    )
    risks = []
    for budget in budgets:
        spent = round(float(spend.get(budget.category_name, {}).get(month, 0)), 2)
        pct = round(spent / budget.monthly_amount * 100, 1) if budget.monthly_amount > 0 else None
        if pct is not None and pct >= 70:
            risks.append({
                "category_name": budget.category_name,
                "spent": spent,
                "monthly_amount": budget.monthly_amount,
                "remaining": round(budget.monthly_amount - spent, 2),
                "pct": pct,
                "severity": "over" if pct >= 100 else "high" if pct >= 85 else "watch",
                "action": {
                    "type": "review_budget",
                    "label": f"Review {budget.category_name} transactions",
                    "payload": {"category_name": budget.category_name, "month": month},
                },
            })
    risks.sort(key=lambda r: r["pct"], reverse=True)
    return {"month": month, "currency": currency, "risks": risks}


def _latest_transaction_month() -> str:
    tx = db.get_transactions_df()
    if tx.empty:
        return date.today().strftime("%Y-%m")
    return max(str(d)[:7] for d in tx["date"].tolist())


def monthly_review(month: str | None = None) -> dict[str, Any]:
    month = month or _latest_transaction_month()
    prev_month = _month_shift(month, -1)
    currency = db.get_base_currency()
    categories = db.get_categories()
    excluded = {c.name for c in categories if c.is_transfer}
    income_cats = {c.name for c in categories if c.is_income}

    tx = db.get_transactions_df(start=prev_month + "-01")
    rows = [] if tx.empty else [row for _, row in tx.iterrows()]

    def tx_month(row) -> str:
        return str(row["date"])[:7]

    def spend_for(target_month: str) -> list[Any]:
        return [
            r for r in rows
            if tx_month(r) == target_month and domain.base_amount(r) < 0 and r["category"] not in excluded
        ]

    def income_for(target_month: str) -> list[Any]:
        return [
            r for r in rows
            if tx_month(r) == target_month and domain.base_amount(r) > 0 and r["category"] not in excluded
        ]

    current_spend_rows = spend_for(month)
    prev_spend_rows = spend_for(prev_month)
    current_income = round(sum(domain.base_amount(r) for r in income_for(month)), 2)
    current_spending = round(sum(-domain.base_amount(r) for r in current_spend_rows), 2)
    prev_spending = round(sum(-domain.base_amount(r) for r in prev_spend_rows), 2)
    net_cash_flow = round(current_income - current_spending, 2)
    savings_rate = round(net_cash_flow / current_income * 100, 1) if current_income > 0 else None

    by_cat: dict[str, float] = defaultdict(float)
    prev_by_cat: dict[str, float] = defaultdict(float)
    for row in current_spend_rows:
        by_cat[row["category"] or "Uncategorized"] += -domain.base_amount(row)
    for row in prev_spend_rows:
        prev_by_cat[row["category"] or "Uncategorized"] += -domain.base_amount(row)
    top_categories = [
        {"category": cat, "spent": round(value, 2)}
        for cat, value in sorted(by_cat.items(), key=lambda item: item[1], reverse=True)[:5]
    ]
    category_changes = [
        {
            "category": cat,
            "current": round(by_cat.get(cat, 0), 2),
            "previous": round(prev_by_cat.get(cat, 0), 2),
            "change": round(by_cat.get(cat, 0) - prev_by_cat.get(cat, 0), 2),
        }
        for cat in sorted(set(by_cat) | set(prev_by_cat), key=lambda c: by_cat.get(c, 0) - prev_by_cat.get(c, 0), reverse=True)
    ][:5]

    cleanup = find_uncategorized_transactions(limit=50)
    budget_risks = budget_risk_report(month)

    sections = []
    if top_categories:
        sections.append({
            "title": "Top spending categories",
            "body": f"{top_categories[0]['category']} is the largest category this month.",
            "severity": "info",
            "evidence": top_categories,
            "actions": [{
                "type": "drilldown_category",
                "label": f"Show {top_categories[0]['category']} transactions",
                "payload": {"category_name": top_categories[0]["category"], "month": month},
            }],
        })
    if category_changes and category_changes[0]["change"] > 0:
        sections.append({
            "title": "Spending increase to review",
            "body": f"{category_changes[0]['category']} is up by {currency} {category_changes[0]['change']:,.0f} versus {prev_month}.",
            "severity": "warning" if category_changes[0]["change"] > 200 else "info",
            "evidence": category_changes[:3],
            "actions": [],
        })
    if budget_risks["risks"]:
        sections.append({
            "title": "Budget pressure",
            "body": f"{len(budget_risks['risks'])} budget category needs attention.",
            "severity": "warning",
            "evidence": budget_risks["risks"][:3],
            "actions": [r["action"] for r in budget_risks["risks"][:3]],
        })
    if cleanup["total"]:
        sections.append({
            "title": "Cleanup queue",
            "body": f"{cleanup['total']} transactions are uncategorized or marked Other.",
            "severity": "warning" if cleanup["total"] >= 10 else "info",
            "evidence": cleanup["groups"][:3],
            "actions": [a for g in cleanup["groups"][:3] for a in g["actions"][:1]],
        })

    return {
        "period": month,
        "currency": currency,
        "summary": {
            "income": current_income,
            "spending": current_spending,
            "previous_spending": prev_spending,
            "net_cash_flow": net_cash_flow,
            "savings_rate": savings_rate,
        },
        "top_categories": top_categories,
        "category_changes": category_changes,
        "budget_risks": budget_risks["risks"],
        "cleanup": {"total": cleanup["total"], "groups": cleanup["groups"][:5]},
        "sections": sections,
        "guardrail": "Educational analysis only, not investment advice.",
    }
