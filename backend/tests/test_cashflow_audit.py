import json
from datetime import date
from unittest.mock import patch

import pytest
from dateutil.relativedelta import relativedelta

import database as db
import assistant_tools
import finance_tools
from domain import KeywordRule


def add_tx(account, day, amount, category=None, base=None, description='Example', reference=''):
    db.insert_transactions([{'account_id': account, 'date': day, 'amount': amount,
                             'amount_base': amount if base is None else base,
                             'category': category, 'description': description, 'reference': reference}])


def test_all_spending_surfaces_agree_with_funding_trades_taxes_uncategorized_and_future(client):
    bank = db.add_account('Bank', 'EUR', 'liquid').id
    broker = db.add_account('Broker', 'EUR', 'stocks').id
    today = date.today().isoformat()
    for acc, value, category, description in [
        (bank, 2000, 'Income', 'Salary'), (bank, -5000, 'Investment', 'Funding'),
        (broker, 5000, 'Transfer', 'Funding received'), (broker, -4000, 'Trade', 'Buy ETF'),
        (broker, 1000, 'Trade', 'Sell ETF'), (broker, 20, 'Dividends', 'Dividend'),
        (broker, -3, 'Dividends', 'Withholding'), (bank, -800, 'Housing', 'Rent'),
        (bank, -10, None, 'Unknown'), (bank, 30, 'Shopping', 'Refund'),
    ]:
        add_tx(acc, today, value, category, description=description)
    add_tx(bank, (date.today() + relativedelta(days=2)).isoformat(), -999, 'Housing', description='Future')
    expected_spend = 813
    total = db.get_monthly_total_spend()[today[:7]]
    per_category = db.get_monthly_spend_by_category()
    chat = json.loads(finance_tools.get_spending_by_category({'months': 1}))
    monthly = json.loads(finance_tools.get_monthly_cash_flow({'months': 1}))['months'][-1]
    review = assistant_tools.monthly_review(today[:7])
    client.post('/api/budgets', json={'category_name': '__total__', 'monthly_amount': 1000})
    budget = client.get('/api/budgets').json()['total_budget']
    assert total == chat['total'] == monthly['expenses'] == review['summary']['spending'] == budget['spent'] == expected_spend
    assert per_category['Dividends'][today[:7]] == 3
    assert sum(row['total'] for row in chat['categories']) == expected_spend
    assert monthly['income'] == review['summary']['income'] == 2050
    from routers.assistant import _fallback_insights
    assert any('spending is €813' in row.body for row in _fallback_insights())


def test_zero_base_currency_amount_is_not_spending(client):
    acc = db.add_account('FX', 'USD', 'liquid').id
    add_tx(acc, date.today().isoformat(), -100, 'Groceries', base=0)
    assert db.get_monthly_total_spend() == {}
    assert db.get_monthly_spend_by_category() == {}


def test_projection_averages_use_same_completed_months_and_base_currency(client):
    acc = db.add_account('FX', 'USD', 'liquid').id
    start = date.today().replace(day=1) - relativedelta(months=3)
    for shift in (0, 2):
        day = (start + relativedelta(months=shift)).isoformat()
        add_tx(acc, day, 1000, 'Income', base=900)
        add_tx(acc, day, -100, None, base=-90, description='Uncategorized spend')
        add_tx(acc, day, -10000, 'Investment', base=-9000, description='Transfer')
    add_tx(acc, date.today().isoformat(), 100000, 'Income', description='Partial month')
    result = db.get_transaction_cash_flow_averages()
    assert result == {'income': 600, 'income_median': 900, 'spending': 60, 'months': 3}
    assert db.get_transaction_monthly_spend() == 60
    assert db.get_transaction_avg_income() == (600, 900)


def test_returns_use_external_funding_and_time_weights_not_trade_cash(client):
    from routers.analytics import _compute_cagr_data
    acc = db.add_account('Broker', 'EUR', 'stocks').id
    db.upsert_balances([(acc, '2025-01-01', 10000, 10000), (acc, '2026-01-01', 18000, 18000)])
    add_tx(acc, '2025-01-01', 10000, 'Transfer', description='Opening deposit already in snapshot')
    add_tx(acc, '2025-07-02', 5000, 'Transfer', description='Midyear funding')
    add_tx(acc, '2025-07-03', -5000, 'Trade', description='Purchase')
    add_tx(acc, '2025-10-01', 2000, 'Trade', description='Sale')
    add_tx(acc, '2025-10-02', 50, 'Dividends', description='Dividend')
    add_tx(acc, '2025-10-02', -5, 'Dividends', description='Tax')
    result = _compute_cagr_data(db.get_balances_df(), db.get_transactions_df())
    assert result['accounts'][0]['annual_return_pct'] == pytest.approx(24.0, abs=0.1)


def test_net_worth_trend_carries_older_accounts_into_lookback(client):
    a = db.add_account('Slow', 'EUR', 'pension').id
    b = db.add_account('Frequent', 'EUR', 'liquid').id
    today = date.today().replace(day=1)
    db.upsert_balances([(a, str(today - relativedelta(months=13)), 100, 100),
                       (b, str(today - relativedelta(months=2)), 50, 50),
                       (b, str(today - relativedelta(months=1)), 60, 60)])
    trend = json.loads(finance_tools.get_net_worth_trend({'months': 3}))['trend']
    assert [row['net_worth'] for row in trend] == [150, 160]


def test_forecast_rejects_two_snapshots_in_same_month(client):
    acc = db.add_account('Bank', 'EUR', 'liquid').id
    db.upsert_balances([(acc, '2025-01-01', 100, 100), (acc, '2025-01-15', 110, 110)])
    assert client.get('/api/analytics/forecast').status_code == 422


def test_goal_already_reached_is_zero_months(client):
    acc = db.add_account('Bank', 'EUR', 'liquid').id
    db.upsert_balances([(acc, '2025-01-01', 10000, 10000)])
    result = client.post('/api/analytics/fire', json={'target_amount': 5000, 'monthly_contribution': 0}).json()
    assert result['months_to_target'] == result['years_to_target'] == 0


def test_cleanup_loads_history_once_and_respects_rule_field(client):
    acc = db.add_account('Bank', 'EUR', 'liquid').id
    add_tx(acc, '2025-01-01', -1, 'Groceries', description='Market')
    add_tx(acc, '2025-01-02', -2, None, description='Market')
    add_tx(acc, '2025-01-03', -3, None, description='Different merchant')
    db.upsert_keyword_rule(KeywordRule('market', 'Income', match_field='reference'))
    with patch.object(db, 'get_transactions_df', wraps=db.get_transactions_df) as history:
        groups = assistant_tools.find_uncategorized_transactions()['groups']
    assert history.call_count == 1
    market = next(g for g in groups if g['merchant'] == 'market')
    assert market['suggested_category'] == 'Groceries'


def test_category_rename_preserves_excluded_transfers_and_rules(client):
    acc = db.add_account('Bank', 'EUR', 'liquid').id
    category = next(c for c in db.get_categories() if c.name == 'Transfer')
    add_tx(acc, date.today().isoformat(), -1000, 'Transfer')
    db.upsert_keyword_rule(KeywordRule('to savings', 'Transfer'))
    response = client.put(f'/api/categories/{category.id}', json={'name': 'Own accounts', 'is_transfer': True})
    assert response.status_code == 200
    assert db.get_transactions_df().iloc[0]['category'] == 'Own accounts'
    assert db.get_keyword_rules()[0].category_name == 'Own accounts'
    assert db.get_monthly_total_spend() == {}


@pytest.mark.parametrize('body', [{'keyword': ' ', 'category_name': 'Food'},
                                  {'keyword': 'food', 'category_name': 'Food', 'match_field': 'typo'}])
def test_invalid_rules_do_not_match_every_transaction(client, body):
    assert client.post('/api/categories/rules', json=body).status_code == 422


def test_duplicate_category_returns_conflict(client):
    assert client.post('/api/categories', json={'name': 'Trade', 'is_transfer': True}).status_code == 409


def test_merchant_rules_cannot_reclassify_structural_trades(client, tmp_path):
    from adapters.interactive_brokers import IBTransactionsAdapter
    from categoriser import recategorise_all
    report = tmp_path / 'report.xml'
    report.write_text('<FlexQueryResponse><Trade netCash="-100" currency="EUR" symbol="SHOP" quantity="1" tradePrice="100" buySell="BUY" tradeDate="20250101"/></FlexQueryResponse>')
    result = IBTransactionsAdapter().parse(str(report), 1, 'EUR', 'EUR', lambda _: 1, lambda *_: 'Shopping')
    assert result[0].category == 'Trade'
    acc = db.add_account('Broker', 'EUR', 'stocks').id
    add_tx(acc, '2025-01-01', -100, 'Trade', description='BUY SHOP')
    assert recategorise_all([KeywordRule('buy', 'Shopping')]) == 0


def test_rollover_budget_risks_use_same_effective_budget_as_page(client):
    from domain import Budget
    acc = db.add_account('Bank', 'EUR', 'liquid').id
    month = date.today().strftime('%Y-%m')
    previous = str(date.today().replace(day=1) - relativedelta(months=1))
    db.upsert_budget(Budget('Groceries', 100, rollover=True, start_month=previous[:7]))
    add_tx(acc, date.today().isoformat(), -80, 'Groceries')
    assert client.get('/api/budgets').json()['budgets'][0]['effective'] == 200
    assert assistant_tools.budget_risk_report(month)['risks'] == []


def test_forecast_counts_calendar_gaps_as_months(client):
    acc = db.add_account('Bank', 'EUR', 'liquid').id
    db.upsert_balances([(acc, '2025-01-01', 100, 100), (acc, '2025-03-01', 300, 300)])
    result = client.get('/api/analytics/forecast').json()
    assert len(result['historical']) == 3
    assert result['monthly_growth'] == 100
