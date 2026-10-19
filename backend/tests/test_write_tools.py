import json

from domain import Category, KeywordRule


def _data(payload: str):
    return json.loads(payload)


def test_create_category_is_duplicate_safe(tmp_db):
    import database as db
    import write_tools

    first = _data(write_tools.create_category({"name": "Subscriptions", "color": "#C97B4A"}))
    second = _data(write_tools.create_category({"name": "subscriptions", "color": "#3F7A55"}))

    assert first["ok"] is True
    assert first["created"] is True
    assert second["ok"] is True
    assert second["created"] is False
    assert len([c for c in db.get_categories() if c.name.lower() == "subscriptions"]) == 1


def test_update_transaction_category_validates_existing_category(tmp_db):
    import database as db
    import write_tools

    category = db.upsert_category(Category(name="Test Groceries", color="#3F7A55"))
    account = db.add_account("Checking", "EUR", "liquid")
    db.insert_transactions([
        {
            "account_id": account.id,
            "date": "2026-07-01",
            "description": "Market",
            "amount": -24,
            "amount_base": -24,
            "category": "Other",
        }
    ])
    tx_id = int(db.get_transactions_df().iloc[0]["id"])

    missing = _data(write_tools.update_transaction_category({
        "transaction_id": tx_id,
        "category_name": "Test Dining",
    }))
    updated = _data(write_tools.update_transaction_category({
        "transaction_id": tx_id,
        "category_name": category.name,
    }))

    assert missing["ok"] is False
    assert "not found" in missing["error"]
    assert updated["ok"] is True
    assert updated["transaction"]["old_category"] == "Other"
    assert updated["transaction"]["new_category"] == "Test Groceries"


def test_create_budget_rejects_income_category(tmp_db):
    import database as db
    import write_tools

    db.upsert_category(Category(name="Test Salary", color="#3F7A55", is_income=True))
    db.upsert_category(Category(name="Test Groceries", color="#B8842B"))

    rejected = _data(write_tools.create_budget({"category_name": "Test Salary", "monthly_amount": 1000}))
    created = _data(write_tools.create_budget({"category_name": "Test Groceries", "monthly_amount": 400}))

    assert rejected["ok"] is False
    assert "income/transfer" in rejected["error"]
    assert created["ok"] is True
    assert created["created"] is True
    assert created["budget"]["category_name"] == "Test Groceries"


def test_keyword_rule_reapply_requires_preview_then_confirm(tmp_db):
    import database as db
    import write_tools

    db.upsert_category(Category(name="Test Entertainment", color="#C97B4A"))
    db.upsert_keyword_rule(KeywordRule(keyword="spotify", category_name="Test Entertainment"))
    account = db.add_account("Checking", "EUR", "liquid")
    db.insert_transactions([
        {
            "account_id": account.id,
            "date": "2026-07-01",
            "description": "Spotify Premium",
            "amount": -10,
            "amount_base": -10,
            "category": "Other",
        }
    ])

    preview = _data(write_tools.preview_reapply_keyword_rules({"limit": 5}))
    blocked = _data(write_tools.reapply_keyword_rules({}))
    applied = _data(write_tools.reapply_keyword_rules({"confirm": True}))

    assert preview["ok"] is True
    assert preview["total_changes"] == 1
    assert preview["sample"][0]["new_category"] == "Test Entertainment"
    assert blocked["ok"] is False
    assert "confirm=true" in blocked["error"]
    assert applied["ok"] is True
    assert applied["updated"] == 1
    assert db.get_transactions_df().iloc[0]["category"] == "Test Entertainment"


def test_keyword_rule_preview_and_reapply_ignore_unmatched_transactions(tmp_db):
    import database as db
    import write_tools

    db.upsert_category(Category(name="Test Shopping", color="#C97B4A"))
    db.upsert_keyword_rule(KeywordRule(keyword="amazon", category_name="Test Shopping"))
    account = db.add_account("Brokerage", "EUR", "stocks")
    db.insert_transactions([
        {
            "account_id": account.id,
            "date": "2026-07-01",
            "description": "BUY 3 ANX @ 10",
            "amount": -30,
            "amount_base": -30,
            "category": "Trade",
        }
    ])

    preview = _data(write_tools.preview_reapply_keyword_rules({"limit": 5}))
    applied = _data(write_tools.reapply_keyword_rules({"confirm": True}))

    assert preview["total_changes"] == 0
    assert applied["updated"] == 0
    assert db.get_transactions_df().iloc[0]["category"] == "Trade"
