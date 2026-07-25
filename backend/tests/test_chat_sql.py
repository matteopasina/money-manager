"""Guardrails for the AI assistant's read-only run_sql tool."""
import json


def _run(query: str) -> dict:
    import finance_tools
    return json.loads(finance_tools.run_sql({"query": query}))


def _seed(client):
    """A couple of accounts + transactions so SELECTs return rows."""
    import database as db
    acc = db.add_account("Checking", "EUR", "liquid").id
    db.insert_transactions([
        {"account_id": acc, "date": "2026-06-01", "description": "Rent", "amount": -800, "amount_base": -800, "category": "Housing"},
        {"account_id": acc, "date": "2026-06-02", "description": "Salary", "amount": 2000, "amount_base": 2000, "category": "Income"},
    ])
    return acc


def test_select_returns_rows(client):
    _seed(client)
    out = _run("SELECT category, SUM(amount) AS total FROM transactions GROUP BY category ORDER BY category")
    assert "error" not in out
    assert out["columns"] == ["category", "total"]
    by_cat = {r["category"]: r["total"] for r in out["rows"]}
    assert by_cat["Housing"] == -800 and by_cat["Income"] == 2000


def test_with_cte_allowed(client):
    _seed(client)
    out = _run("WITH e AS (SELECT amount FROM transactions WHERE amount < 0) SELECT SUM(amount) AS spent FROM e")
    assert "error" not in out
    assert out["rows"][0]["spent"] == -800


def test_writes_rejected(client):
    _seed(client)
    for q in [
        "UPDATE transactions SET category='X'",
        "DELETE FROM transactions",
        "INSERT INTO categories(name) VALUES ('x')",
        "DROP TABLE transactions",
    ]:
        assert "error" in _run(q), q
    # nothing was mutated
    assert _run("SELECT COUNT(*) AS n FROM transactions")["rows"][0]["n"] == 2


def test_secrets_table_blocked(client):
    assert "not accessible" in _run("SELECT * FROM app_settings")["error"]
    assert "not accessible" in _run("SELECT value FROM app_settings WHERE key='llm_api_key'")["error"]


def test_multiple_statements_rejected(client):
    assert "single statement" in _run("SELECT 1; DROP TABLE transactions")["error"]


def test_pragma_and_attach_rejected(client):
    assert "error" in _run("PRAGMA table_info(transactions)")
    assert "error" in _run("ATTACH DATABASE 'x.db' AS x")


def test_row_cap(client):
    import database as db
    acc = db.add_account("Bulk", "EUR", "liquid").id
    db.insert_transactions([
        {"account_id": acc, "date": "2026-06-01", "description": f"tx{i}", "amount": -float(i + 1), "amount_base": -float(i + 1), "category": "Food"}
        for i in range(250)
    ])
    out = _run("SELECT * FROM transactions")
    assert out["row_count"] == 200
    assert out["truncated"] is True


def test_get_schema_excludes_secrets(client):
    import finance_tools
    out = json.loads(finance_tools.get_schema({}))
    names = {t["name"] for t in out["tables"]}
    assert "transactions" in names and "budgets" in names
    assert "app_settings" not in names
