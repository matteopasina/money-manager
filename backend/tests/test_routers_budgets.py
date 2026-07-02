"""Budget endpoints: CRUD, current-month math, rollover carry, suggestions."""


def month(offset: int) -> str:
    """'YYYY-MM' offset months from the current month (pure int math)."""
    from datetime import date
    today = date.today()
    total = today.year * 12 + (today.month - 1) + offset
    return f"{total // 12:04d}-{total % 12 + 1:02d}"


def day(offset: int) -> str:
    return month(offset) + "-15"


_tx_counter = 0


def add_tx(account_id: int, date: str, amount: float, category: str, amount_base=None):
    """Insert a transaction directly; unique description dodges the dedup constraint."""
    global _tx_counter
    _tx_counter += 1
    import database as db
    db.insert_transactions([{
        "account_id": account_id, "date": date,
        "description": f"tx {_tx_counter} {date} {amount}",
        "amount": amount, "amount_base": amount_base, "category": category,
    }])


def make_account() -> int:
    import database as db
    return db.add_account(f"Test account {_tx_counter}", "EUR", "liquid").id


def backdate_budget(budget_id: int, start_month: str):
    """POST correctly refuses client-set start_month; direct SQL is the test seam."""
    import database as db
    with db.get_connection() as conn:
        conn.execute("UPDATE budgets SET start_month = ? WHERE id = ?", (start_month, budget_id))


def get_budget(client, budget_id: int) -> dict:
    data = client.get("/api/budgets").json()
    return next(b for b in data["budgets"] if b["id"] == budget_id)


# ── CRUD ───────────────────────────────────────────────────────────────────────

def test_list_empty(client):
    data = client.get("/api/budgets").json()
    assert data["month"] == month(0)
    assert data["budgets"] == []
    assert data["totals"] == {"budgeted": 0, "effective": 0, "spent": 0, "remaining": 0}


def test_create_budget(client):
    r = client.post("/api/budgets", json={"category_name": "Groceries", "monthly_amount": 300})
    assert r.status_code == 201
    row = r.json()
    assert row["start_month"] == month(0)
    assert row["spent"] == 0 and row["carry"] == 0
    assert row["effective"] == 300 and row["pct"] == 0.0
    assert row["category_color"] and not row["orphaned"]


def test_create_rejections(client):
    assert client.post("/api/budgets", json={"category_name": "Nope", "monthly_amount": 10}).status_code == 404
    assert client.post("/api/budgets", json={"category_name": "Income", "monthly_amount": 10}).status_code == 400
    assert client.post("/api/budgets", json={"category_name": "Transfer", "monthly_amount": 10}).status_code == 400
    assert client.post("/api/budgets", json={"category_name": "Groceries", "monthly_amount": 0}).status_code == 422
    assert client.post("/api/budgets", json={"category_name": "Groceries", "monthly_amount": 100}).status_code == 201
    assert client.post("/api/budgets", json={"category_name": "Groceries", "monthly_amount": 100}).status_code == 409


def test_update_and_delete(client):
    bid = client.post("/api/budgets", json={"category_name": "Groceries", "monthly_amount": 100}).json()["id"]
    r = client.put(f"/api/budgets/{bid}", json={
        "category_name": "Groceries", "monthly_amount": 250, "rollover": True, "active": False})
    assert r.status_code == 200
    row = get_budget(client, bid)
    assert row["monthly_amount"] == 250 and row["rollover"] and not row["active"]

    assert client.put("/api/budgets/9999", json={
        "category_name": "Groceries", "monthly_amount": 1}).status_code == 404
    assert client.delete(f"/api/budgets/{bid}").json() == {"ok": True}
    assert client.get("/api/budgets").json()["budgets"] == []


# ── Current-month math ─────────────────────────────────────────────────────────

def test_spent_uses_base_amount(client):
    acc = make_account()
    bid = client.post("/api/budgets", json={"category_name": "Groceries", "monthly_amount": 200}).json()["id"]
    add_tx(acc, day(0), -50, "Groceries")                    # no base → falls back to amount
    add_tx(acc, day(0), -100, "Groceries", amount_base=-90)  # base takes precedence
    row = get_budget(client, bid)
    assert row["spent"] == 140.0
    assert row["remaining"] == 60.0
    assert row["pct"] == 70.0


def test_spend_exclusions(client):
    client.post("/api/categories", json={"name": "Trade", "is_transfer": True})
    acc = make_account()
    bid = client.post("/api/budgets", json={"category_name": "Groceries", "monthly_amount": 100}).json()["id"]
    add_tx(acc, day(0), 500, "Income")
    add_tx(acc, day(0), -300, "Transfer")
    add_tx(acc, day(0), -200, "Trade")
    add_tx(acc, day(0), -100, "Investment")
    add_tx(acc, day(0), 30, "Groceries")   # refund: positive amounts never count as spend
    row = get_budget(client, bid)
    assert row["spent"] == 0.0


# ── Rollover ───────────────────────────────────────────────────────────────────

def test_rollover_carry_two_months(client):
    acc = make_account()
    bid = client.post("/api/budgets", json={
        "category_name": "Groceries", "monthly_amount": 100, "rollover": True}).json()["id"]
    backdate_budget(bid, month(-2))
    add_tx(acc, day(-2), -60, "Groceries")
    add_tx(acc, day(-1), -130, "Groceries")
    add_tx(acc, day(0), -20, "Groceries")
    row = get_budget(client, bid)
    assert row["carry"] == 10.0          # (100-60) + (100-130)
    assert row["effective"] == 110.0
    assert row["remaining"] == 90.0


def test_rollover_zero_tx_months_full_accrual(client):
    bid = client.post("/api/budgets", json={
        "category_name": "Groceries", "monthly_amount": 100, "rollover": True}).json()["id"]
    backdate_budget(bid, month(-2))
    row = get_budget(client, bid)
    assert row["carry"] == 200.0


def test_rollover_off_ignores_history(client):
    acc = make_account()
    bid = client.post("/api/budgets", json={"category_name": "Groceries", "monthly_amount": 100}).json()["id"]
    backdate_budget(bid, month(-2))
    add_tx(acc, day(-1), -130, "Groceries")
    row = get_budget(client, bid)
    assert row["carry"] == 0.0 and row["effective"] == 100.0


def test_fresh_budget_ignores_older_transactions(client):
    acc = make_account()
    add_tx(acc, day(-3), -500, "Groceries")   # before the budget existed
    bid = client.post("/api/budgets", json={
        "category_name": "Groceries", "monthly_amount": 100, "rollover": True}).json()["id"]
    row = get_budget(client, bid)
    assert row["carry"] == 0.0                # accrual starts at start_month


def test_negative_carry_effective_nonpositive(client):
    acc = make_account()
    bid = client.post("/api/budgets", json={
        "category_name": "Groceries", "monthly_amount": 50, "rollover": True}).json()["id"]
    backdate_budget(bid, month(-1))
    add_tx(acc, day(-1), -200, "Groceries")
    row = get_budget(client, bid)
    assert row["carry"] == -150.0
    assert row["effective"] == -100.0
    assert row["pct"] is None
    assert row["remaining"] < 0


# ── History & suggestions ──────────────────────────────────────────────────────

def test_history_shape(client):
    acc = make_account()
    bid = client.post("/api/budgets", json={"category_name": "Groceries", "monthly_amount": 100}).json()["id"]
    backdate_budget(bid, month(-1))
    add_tx(acc, day(-1), -40, "Groceries")
    data = client.get("/api/budgets/history?months=4").json()
    assert data["months"] == [month(-3), month(-2), month(-1), month(0)]
    s = next(x for x in data["series"] if x["id"] == bid)
    assert s["budget"][:2] == [None, None]     # before start_month
    assert s["budget"][2] == 100
    assert s["spent"][2] == 40.0


def test_suggest_average(client):
    acc = make_account()
    add_tx(acc, day(-1), -120, "Groceries")
    add_tx(acc, day(-3), -60, "Groceries")
    add_tx(acc, day(0), -999, "Groceries")   # current partial month must be ignored
    add_tx(acc, day(-1), 500, "Income")      # income never suggested
    data = client.get("/api/budgets/suggest").json()
    sug = {s["category_name"]: s for s in data["suggestions"]}
    assert sug["Groceries"]["avg_monthly_spend"] == 30.0   # 180 / 6
    assert sug["Groceries"]["months_with_data"] == 2
    assert "Income" not in sug and "Transfer" not in sug


def test_total_budget_counts_all_spending(client):
    """The '__total__' budget caps all spending, including uncategorized rows
    that per-category budgets deliberately ignore."""
    acc = make_account()
    r = client.post("/api/budgets", json={"category_name": "__total__", "monthly_amount": 1000})
    assert r.status_code == 201
    add_tx(acc, day(0), -200, "Groceries")
    add_tx(acc, day(0), -150, None)          # uncategorized — total must catch it
    add_tx(acc, day(0), -100, "Investment")  # transfer/investment still excluded
    add_tx(acc, day(0), 500, "Income")       # income never counts
    data = client.get("/api/budgets").json()
    total = data["total_budget"]
    assert total["spent"] == 350.0           # 200 + 150, not the investment/income
    assert total["category_name"] == "__total__"
    # Overlapping per-category budgets are NOT double-counted in the summary totals
    assert data["totals"]["spent"] == 0.0    # no per-category budgets exist


def test_total_budget_excluded_from_category_totals(client):
    client.post("/api/budgets", json={"category_name": "__total__", "monthly_amount": 1000})
    client.post("/api/budgets", json={"category_name": "Groceries", "monthly_amount": 200})
    data = client.get("/api/budgets").json()
    assert data["totals"]["budgeted"] == 200        # total cap not summed in
    assert data["total_budget"]["monthly_amount"] == 1000
    assert len(data["budgets"]) == 2


def test_total_budget_singleton(client):
    assert client.post("/api/budgets", json={"category_name": "__total__", "monthly_amount": 1000}).status_code == 201
    assert client.post("/api/budgets", json={"category_name": "__total__", "monthly_amount": 500}).status_code == 409


def test_inactive_excluded_from_totals(client):
    b1 = client.post("/api/budgets", json={"category_name": "Groceries", "monthly_amount": 100}).json()["id"]
    client.post("/api/budgets", json={"category_name": "Food", "monthly_amount": 50})
    client.put(f"/api/budgets/{b1}", json={
        "category_name": "Groceries", "monthly_amount": 100, "rollover": False, "active": False})
    data = client.get("/api/budgets").json()
    assert data["totals"]["budgeted"] == 50
    assert len(data["budgets"]) == 2
    assert any(not b["active"] for b in data["budgets"])
