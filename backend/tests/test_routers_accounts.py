import pytest


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
