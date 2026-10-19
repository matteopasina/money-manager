"""Quantity-based MSFT valuations; public requests never include holdings data."""
import json
import math
import threading
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

import database as db

KEY = 'msft_positions'
LOCK = threading.RLock()


def positions():
    return json.loads(db.get_setting(KEY, '{}'))


def configured():
    active = {a.id for a in db.get_accounts(active_only=True)}
    return any(int(i) in active for i in positions())


def save_quantity(account_id, quantity):
    with LOCK:
        data = positions()
        data[str(account_id)] = {'quantity': quantity, 'valuation': None}
        db.set_setting(KEY, json.dumps(data))


def _fetch(url):
    with urlopen(Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=15) as response:
        return json.load(response)


def _positive(value):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise ValueError('Invalid market price or exchange rate')
    return number


def market_data(currencies):
    meta = _fetch('https://query1.finance.yahoo.com/v8/finance/chart/MSFT?interval=1d&range=5d')['chart']['result'][0]['meta']
    if meta['symbol'] != 'MSFT' or meta['currency'] != 'USD':
        raise ValueError('Unexpected instrument or quote currency')
    price = _positive(meta['regularMarketPrice'])
    quote_time = datetime.fromtimestamp(meta['regularMarketTime'], timezone.utc)
    now = datetime.now(timezone.utc)
    if not -300 <= (now - quote_time).total_seconds() <= 7 * 86400:
        raise ValueError('MSFT quote is stale or has a future timestamp')
    rates, fx_date = {'USD': 1.0}, quote_time.date().isoformat()
    foreign = sorted(set(currencies) - {'USD'})
    if foreign:
        result = _fetch('https://api.frankfurter.dev/v1/latest?' + urlencode({'base': 'USD', 'symbols': ','.join(foreign)}))
        fx_date = result['date']
        age = (now.date() - datetime.fromisoformat(fx_date).date()).days
        if result['base'] != 'USD' or not 0 <= age <= 7:
            raise ValueError('Invalid or stale exchange rate')
        rates.update({currency: _positive(result['rates'][currency]) for currency in foreign})
    return price, quote_time.isoformat(), rates, fx_date


def sync():
    with LOCK:
        data = positions()
        accounts = {a.id: a for a in db.get_accounts(active_only=True) if str(a.id) in data}
        if not accounts:
            return 'No active MSFT positions configured.'
        base = db.get_base_currency()
        price, quoted_at, rates, fx_date = market_data([base, *(a.currency for a in accounts.values())])
        now = datetime.now(timezone.utc)
        today = now.astimezone(ZoneInfo('Europe/Rome')).date().isoformat()
        # All public data is validated before writing any snapshot.
        with db.get_connection() as conn:
            for account_id, account in accounts.items():
                position = data[str(account_id)]
                usd = position['quantity'] * price
                native, value = round(usd * rates[account.currency], 2), round(usd * rates[base], 2)
                conn.execute('''INSERT INTO balances(account_id,date,amount_native,amount_base) VALUES(?,?,?,?)
                    ON CONFLICT(account_id,date) DO UPDATE SET amount_native=excluded.amount_native,amount_base=excluded.amount_base''',
                    (account_id, today, native, value))
                position['valuation'] = dict(price_usd=price, quoted_at=quoted_at, fx_date=fx_date,
                    usd_to_base=rates[base], base_currency=base, amount_base=value,
                    updated_at=now.isoformat(), source='Yahoo Finance / Frankfurter')
            conn.execute('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
                         (KEY, json.dumps(data)))
        return f'MSFT valuations updated for {len(accounts)} accounts.'
