"""All surfaces that report 'spending' — the AI chat/MCP tools, the Financial
Helper insights, and the Budgets page — must agree on the same figure for the
same month. This guards against the three of them drifting out of sync again
(see domain.spending_frame / domain.base_amount, the shared definition)."""
import json
from datetime import date

import pytest


@pytest.fixture
def mixed_spending(client):
    import database as db

    db.upsert_fx_rate("USDT", 0.92)
    eur = db.add_account("Checking", "EUR", "liquid").id
    usdt = db.add_account("Crypto", "USDT", "crypto").id
    today = date.today().isoformat()

    db.insert_transactions([
        # Real spending, split across currencies — must be summed in base currency.
        {"account_id": eur, "date": today, "description": "Supermarket",
         "amount": -100, "amount_base": -100, "category": "Groceries"},
        {"account_id": usdt, "date": today, "description": "Crypto card groceries",
         "amount": -20, "amount_base": -18.4, "category": "Groceries"},
        # Not spending: a brokerage trade and an inter-account transfer, both
        # tagged with is_transfer categories. Must be excluded everywhere.
        {"account_id": usdt, "date": today, "description": "Buy BTC",
         "amount": -1000, "amount_base": -920, "category": "Investment"},
        {"account_id": eur, "date": today, "description": "To savings",
         "amount": -50, "amount_base": -50, "category": "Transfer"},
        # Not spending: income.
        {"account_id": eur, "date": today, "description": "Salary",
         "amount": 2000, "amount_base": 2000, "category": "Income"},
    ])
    return {"expected_spend": 118.4}


def test_finance_tools_spending_excludes_transfers(client, mixed_spending):
    import finance_tools
    out = json.loads(finance_tools.get_spending_by_category({"months": 1}))
    assert out["total"] == pytest.approx(mixed_spending["expected_spend"])
    categories = {c["category"] for c in out["categories"]}
    assert categories == {"Groceries"}


def test_assistant_monthly_review_matches(client, mixed_spending):
    import assistant_tools
    out = assistant_tools.monthly_review()
    assert out["summary"]["spending"] == pytest.approx(mixed_spending["expected_spend"])


def test_budgets_page_matches(client, mixed_spending):
    resp = client.post("/api/budgets", json={
        "category_name": "Groceries", "monthly_amount": 500, "rollover": False,
    })
    assert resp.status_code == 201

    resp = client.get("/api/budgets")
    body = resp.json()
    groceries = next(b for b in body["budgets"] if b["category_name"] == "Groceries")
    assert groceries["spent"] == pytest.approx(mixed_spending["expected_spend"])


def test_all_three_surfaces_agree(client, mixed_spending):
    import finance_tools
    import assistant_tools

    chat_total = json.loads(finance_tools.get_spending_by_category({"months": 1}))["total"]
    helper_total = assistant_tools.monthly_review()["summary"]["spending"]

    client.post("/api/budgets", json={
        "category_name": "Groceries", "monthly_amount": 500, "rollover": False,
    })
    budgets_total = client.get("/api/budgets").json()["budgets"][0]["spent"]

    assert chat_total == pytest.approx(helper_total)
    assert helper_total == pytest.approx(budgets_total)
