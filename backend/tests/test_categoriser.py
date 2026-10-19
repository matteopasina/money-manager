import pytest
from domain import KeywordRule
from categoriser import categorise, matching_category, recategorise_all


def _rule(id, keyword, category, field="any", priority=10):
    return KeywordRule(id=id, keyword=keyword, category_name=category,
                       match_field=field, priority=priority)


def test_categorise_matches_description():
    rules = [_rule(1, "amazon", "Shopping")]
    assert categorise("Amazon purchase", "", rules) == "Shopping"


def test_categorise_case_insensitive():
    rules = [_rule(1, "amazon", "Shopping")]
    assert categorise("AMAZON PRIME", "", rules) == "Shopping"


def test_categorise_fallback_to_other():
    assert categorise("unknown vendor", "", []) == "Other"
    assert matching_category("unknown vendor", "", []) is None


def test_categorise_by_reference_field():
    rules = [_rule(1, "ref123", "Bills", field="reference")]
    assert categorise("random description", "REF123", rules) == "Bills"


def test_categorise_by_description_field_ignores_reference():
    rules = [_rule(1, "amazon", "Shopping", field="description")]
    # keyword in reference only — should NOT match
    assert categorise("unrelated", "amazon ref", rules) == "Other"


def test_categorise_priority_wins():
    rules = sorted([
        _rule(1, "amazon", "Shopping", priority=10),
        _rule(2, "amazon", "Other", priority=1),
    ], key=lambda r: r.priority, reverse=True)
    assert categorise("amazon", "", rules) == "Shopping"


def test_recategorise_all_updates_transactions(tmp_db):
    import database as db
    acc = db.add_account("Test", "EUR", "liquid")
    db.insert_transactions([{
        "account_id": acc.id, "date": "2024-01-01", "description": "amazon purchase",
        "amount": -10.0, "amount_base": -10.0, "category": None,
        "value_date": None, "reference": "", "balance": None, "notes": None,
    }])
    rules = [_rule(1, "amazon", "Shopping")]
    count = recategorise_all(rules)
    assert count == 1
    df = db.get_transactions_df()
    assert df.iloc[0]["category"] == "Shopping"


def test_recategorise_all_preserves_unmatched_adapter_and_manual_categories(tmp_db):
    import database as db
    acc = db.add_account("Test", "EUR", "liquid")
    db.insert_transactions([
        {
            "account_id": acc.id, "date": "2024-01-01", "description": "BUY 3 ANX @ 10",
            "amount": -30.0, "amount_base": -30.0, "category": "Trade",
        },
        {
            "account_id": acc.id, "date": "2024-01-02", "description": "Local merchant",
            "amount": -10.0, "amount_base": -10.0, "category": "Food",
        },
    ])

    assert recategorise_all([_rule(1, "amazon", "Shopping")]) == 0
    assert set(db.get_transactions_df()["category"]) == {"Trade", "Food"}


def test_recategorise_all_counts_only_rows_that_change(tmp_db):
    import database as db
    acc = db.add_account("Test", "EUR", "liquid")
    db.insert_transactions([
        {
            "account_id": acc.id, "date": "2024-01-01", "description": "Amazon one",
            "amount": -10.0, "amount_base": -10.0, "category": "Other",
        },
        {
            "account_id": acc.id, "date": "2024-01-02", "description": "Amazon two",
            "amount": -20.0, "amount_base": -20.0, "category": "Shopping",
        },
    ])

    assert recategorise_all([_rule(1, "amazon", "Shopping")]) == 1
