import pytest


def test_fire_rejects_zero_withdrawal_rate(client):
    resp = client.post("/api/analytics/fire", json={
        "target_amount": 1000000,
        "withdrawal_rate_pct": 0,
    })
    assert resp.status_code == 422


def test_fire_rejects_negative_withdrawal_rate(client):
    resp = client.post("/api/analytics/fire", json={
        "target_amount": 1000000,
        "withdrawal_rate_pct": -1,
    })
    assert resp.status_code == 422


def test_fire_returns_error_when_no_data(client):
    resp = client.post("/api/analytics/fire", json={"target_amount": 1000000})
    assert resp.status_code == 422


def test_fire_projection_with_data(client):
    # Seed an account and balance
    acc = client.post("/api/accounts", json={"name": "Test", "currency": "EUR", "account_type": "liquid"}).json()
    client.post("/api/balances", json={
        "account_id": acc["id"], "date": "2024-01-01",
        "amount_native": 50000, "amount_base": 50000,
    })
    resp = client.post("/api/analytics/fire", json={
        "target_amount": 1000000,
        "annual_return_pct": 7.0,
        "monthly_contribution": 500,
        "withdrawal_rate_pct": 4.0,
        "monthly_expenses": 2000,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "current_nw" in data
    assert data["current_nw"] == pytest.approx(50000)
    assert data["fire_number"] > 0
    assert len(data["projection"]) > 0


def test_forecast_returns_error_when_no_data(client):
    resp = client.get("/api/analytics/forecast")
    assert resp.status_code == 422
