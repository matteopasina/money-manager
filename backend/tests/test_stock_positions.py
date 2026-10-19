import math
import pytest
from datetime import datetime, timezone
import database as db
import stock_positions as stocks


def test_valuation_preserves_history_and_converts_native_and_base(client, monkeypatch):
    a = db.add_account('Example Broker EUR', 'EUR', 'stocks').id
    b = db.add_account('Example Broker USD', 'USD', 'stocks').id
    db.upsert_balances([(a, '2026-01-01', 100, 100)])
    assert client.put(f'/api/stock-positions/{a}', json={'quantity': 12.5}).status_code == 200
    assert client.put(f'/api/stock-positions/{b}', json={'quantity': 3.25}).status_code == 200
    monkeypatch.setattr(stocks, 'market_data', lambda currencies: (500, '2026-10-16T20:00:00+00:00', {'EUR': .9, 'USD': 1}, '2026-10-16'))
    assert client.post('/api/stock-positions/sync').status_code == 200
    assert client.post('/api/stock-positions/sync').status_code == 200
    with db.get_connection() as c:
        rows = [tuple(r) for r in c.execute('select account_id,date,amount_native,amount_base from balances order by date,account_id')]
    assert len(rows) == 3  # repeated sync replaces the same day's valuation
    assert rows[0] == (a, '2026-01-01', 100, 100)
    assert rows[1][2:] == (5625, 5625)
    assert rows[2][2:] == (1625, 1462.5)
    assert client.get('/api/stock-positions').json()[1]['quantity'] == 3.25
    before = rows
    monkeypatch.setattr(stocks, 'market_data', lambda currencies: (_ for _ in ()).throw(ValueError('Provider unavailable')))
    assert client.post('/api/stock-positions/sync').status_code == 502
    with db.get_connection() as c:
        assert [tuple(r) for r in c.execute('select account_id,date,amount_native,amount_base from balances order by date,account_id')] == before


def test_position_validation(client):
    a = db.add_account('Bank', 'EUR', 'liquid').id
    assert client.put('/api/stock-positions/99999', json={'quantity': 1}).status_code == 404
    assert client.put(f'/api/stock-positions/{a}', json={'quantity': 1}).status_code == 422
    assert client.put(f'/api/stock-positions/{a}', json={'quantity': -1}).status_code == 422
    with pytest.raises(ValueError):
        stocks._positive(math.nan)


def test_market_data_rejects_wrong_currency_and_stale_quote(tmp_db, monkeypatch):
    meta = {'symbol': 'MSFT', 'currency': 'EUR', 'regularMarketPrice': 500, 'regularMarketTime': datetime.now(timezone.utc).timestamp()}
    monkeypatch.setattr(stocks, '_fetch', lambda url: {'chart': {'result': [{'meta': meta}]}})
    with pytest.raises(ValueError, match='currency'):
        stocks.market_data(['EUR'])
    meta.update(currency='USD', regularMarketTime=0)
    with pytest.raises(ValueError, match='stale'):
        stocks.market_data(['EUR'])
