import pytest
import sqlite3


def test_init_db_migrates_legacy_accounts_columns(monkeypatch, tmp_path):
    db_file = str(tmp_path / "legacy.db")
    with sqlite3.connect(db_file) as conn:
        conn.execute("""
            CREATE TABLE accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                currency TEXT NOT NULL DEFAULT 'EUR'
            )
        """)
        conn.execute("INSERT INTO accounts (name, currency) VALUES ('Legacy', 'EUR')")

    import database as db
    monkeypatch.setattr(db, "DB_PATH", db_file)
    db.init_db()

    account = db.get_accounts()[0]
    assert account.name == "Legacy"
    assert account.account_type == "other"
    assert account.active is True


def test_init_db_removes_legacy_account_type_check(monkeypatch, tmp_path):
    db_file = str(tmp_path / "legacy_check.db")
    with sqlite3.connect(db_file) as conn:
        conn.execute("""
            CREATE TABLE accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                currency TEXT NOT NULL DEFAULT 'EUR',
                account_type TEXT NOT NULL CHECK(account_type IN ('liquid', 'stocks', 'crypto')),
                active INTEGER NOT NULL DEFAULT 1
            )
        """)
        conn.execute(
            "INSERT INTO accounts (name, currency, account_type) VALUES ('Fon.Te.', 'EUR', 'stocks')"
        )

    import database as db
    monkeypatch.setattr(db, "DB_PATH", db_file)
    db.init_db()
    db.update_account(1, "Fon.Te.", "EUR", "pension", True)

    account = db.get_accounts()[0]
    assert account.account_type == "pension"


def test_list_accounts_empty(client):
    resp = client.get("/api/accounts")
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_account(client):
    resp = client.post("/api/accounts", json={"name": "Checking", "currency": "EUR", "account_type": "liquid"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Checking"
    assert data["currency"] == "EUR"
    assert data["active"] is True


def test_create_account_duplicate_name_returns_409(client):
    body = {"name": "Checking", "currency": "EUR", "account_type": "liquid"}
    assert client.post("/api/accounts", json=body).status_code == 201
    resp = client.post("/api/accounts", json=body)
    assert resp.status_code == 409
    assert resp.json()["detail"] == "Account name already exists"


def test_list_accounts_after_create(client):
    client.post("/api/accounts", json={"name": "Checking", "currency": "EUR", "account_type": "liquid"})
    resp = client.get("/api/accounts")
    assert len(resp.json()) == 1


def test_update_account(client):
    created = client.post("/api/accounts", json={"name": "Old", "currency": "EUR", "account_type": "liquid"}).json()
    resp = client.patch(f"/api/accounts/{created['id']}", json={
        "name": "New", "currency": "USD", "account_type": "stocks", "active": False,
    })
    assert resp.status_code == 200
    updated = client.get("/api/accounts").json()[0]
    assert updated["name"] == "New"
    assert updated["active"] is False


def test_patch_account_active_only(client):
    created = client.post("/api/accounts", json={"name": "Checking", "currency": "EUR", "account_type": "liquid"}).json()
    resp = client.patch(f"/api/accounts/{created['id']}", json={"active": False})
    assert resp.status_code == 200
    updated = client.get("/api/accounts").json()[0]
    assert updated == {
        "id": created["id"],
        "name": "Checking",
        "currency": "EUR",
        "account_type": "liquid",
        "active": False,
    }


def test_patch_account_not_found(client):
    resp = client.patch("/api/accounts/999", json={"active": False})
    assert resp.status_code == 404


def test_upsert_fx_rate_valid(client):
    resp = client.put("/api/accounts/fx-rates/USD", json={"rate": 0.92})
    assert resp.status_code == 200
    rates = client.get("/api/accounts/fx-rates").json()
    usd = next(r for r in rates if r["currency"] == "USD")
    assert usd["rate_to_base"] == pytest.approx(0.92)


def test_upsert_fx_rate_zero_rejected(client):
    resp = client.put("/api/accounts/fx-rates/USD", json={"rate": 0})
    assert resp.status_code == 422


def test_upsert_fx_rate_negative_rejected(client):
    resp = client.put("/api/accounts/fx-rates/USD", json={"rate": -1.5})
    assert resp.status_code == 422
