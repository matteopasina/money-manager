def test_assistant_insights_empty(client):
    resp = client.get("/api/assistant/insights")
    assert resp.status_code == 200
    data = resp.json()
    assert data["insights"] == []
    assert data["ai_enabled"] is False


def test_assistant_insights_returns_fallbacks(client):
    import database as db

    acc = db.add_account("Checking", "EUR", "liquid").id
    db.upsert_balances([(acc, "2026-07-01", 5000, 5000)])
    db.insert_transactions([
        {"account_id": acc, "date": "2026-06-01", "description": "Groceries", "amount": -120, "amount_base": -120, "category": "Groceries"},
        {"account_id": acc, "date": "2026-06-02", "description": "Salary", "amount": 2500, "amount_base": 2500, "category": "Income"},
        {"account_id": acc, "date": "2026-06-03", "description": "Unknown", "amount": -15, "amount_base": -15, "category": "Other"},
        {"account_id": acc, "date": "2026-06-04", "description": "Unknown 2", "amount": -15, "amount_base": -15, "category": "Other"},
        {"account_id": acc, "date": "2026-06-05", "description": "Unknown 3", "amount": -15, "amount_base": -15, "category": "Other"},
        {"account_id": acc, "date": "2026-06-06", "description": "Unknown 4", "amount": -15, "amount_base": -15, "category": "Other"},
        {"account_id": acc, "date": "2026-06-07", "description": "Unknown 5", "amount": -15, "amount_base": -15, "category": "Other"},
    ])

    resp = client.get("/api/assistant/insights")
    assert resp.status_code == 200
    insights = resp.json()["insights"]
    assert len(insights) >= 2
    assert all({"title", "body", "severity", "action_label", "action_prompt"} <= set(i) for i in insights)


def test_cleanup_groups_uncategorized_with_rule_suggestion(client):
    import database as db
    from domain import KeywordRule

    acc = db.add_account("Checking", "EUR", "liquid").id
    db.upsert_keyword_rule(KeywordRule(keyword="spotify", category_name="Entertainment"))
    db.insert_transactions([
        {"account_id": acc, "date": "2026-07-01", "description": "Spotify Premium", "amount": -10, "amount_base": -10, "category": "Other"},
        {"account_id": acc, "date": "2026-07-02", "description": "Spotify Family", "amount": -16, "amount_base": -16, "category": None},
        {"account_id": acc, "date": "2026-07-03", "description": "Salary", "amount": 2000, "amount_base": 2000, "category": "Income"},
    ])

    resp = client.get("/api/assistant/cleanup")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert data["groups"][0]["suggested_category"] == "Entertainment"
    assert data["groups"][0]["actions"][0]["type"] == "create_keyword_rule"


def test_cleanup_serializes_missing_amount_base(client):
    import database as db

    acc = db.add_account("Checking", "EUR", "liquid").id
    db.insert_transactions([
        {"account_id": acc, "date": "2026-07-01", "description": "Cash withdrawal", "amount": -100, "amount_base": None, "category": "Other"},
        {"account_id": acc, "date": "2026-07-02", "description": "Mystery income", "amount": 25, "amount_base": None, "category": None},
    ])

    resp = client.get("/api/assistant/cleanup")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert any(tx["amount_base"] is None for group in data["groups"] for tx in group["evidence"])


def test_monthly_review_returns_structured_sections(client):
    import database as db

    acc = db.add_account("Checking", "EUR", "liquid").id
    db.insert_transactions([
        {"account_id": acc, "date": "2026-06-01", "description": "Groceries old", "amount": -80, "amount_base": -80, "category": "Groceries"},
        {"account_id": acc, "date": "2026-07-01", "description": "Salary", "amount": 2500, "amount_base": 2500, "category": "Income"},
        {"account_id": acc, "date": "2026-07-02", "description": "Groceries", "amount": -220, "amount_base": -220, "category": "Groceries"},
        {"account_id": acc, "date": "2026-07-03", "description": "Unknown", "amount": -20, "amount_base": -20, "category": "Other"},
    ])

    resp = client.get("/api/assistant/review?month=2026-07")
    assert resp.status_code == 200
    data = resp.json()
    assert data["period"] == "2026-07"
    assert data["summary"]["income"] == 2500
    assert data["summary"]["spending"] == 240
    assert data["top_categories"][0]["category"] == "Groceries"
    assert data["sections"]
