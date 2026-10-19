from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock

import httpx
import pytest
from fastapi import HTTPException

import database as db
import enablebanking as eb
import scheduler
from routers import bbva, revolut


@pytest.mark.parametrize('bank', [bbva, revolut])
def test_transaction_sync_uses_inclusive_90_days_and_all_pages(tmp_db, monkeypatch, bank):
    account = db.add_account('Test bank', 'EUR', 'liquid')
    provider = bank.__name__.split('.')[-1]
    db.set_setting(f'{provider}_eb_account_uid', 'test-uid')
    calls = []

    def get_page(path, params):
        calls.append(params)
        row = {
            'booking_date': datetime.now(timezone.utc).date().isoformat(),
            'transaction_amount': {'amount': '12', 'currency': account.currency},
            'credit_debit_indicator': 'DBIT',
            'remittance_information': ['First' if 'continuation_key' not in params else 'Second'],
        }
        return {'transactions': [row], 'continuation_key': 'page-2' if 'continuation_key' not in params else None}

    monkeypatch.setattr(bank, '_eb_get', get_page)
    assert bank.sync_transactions(account.id, days=90)['inserted'] == 2
    assert calls[0]['date_from'] == (datetime.now(timezone.utc).date() - timedelta(days=89)).isoformat()
    assert calls[0]['date_to'] == datetime.now(timezone.utc).date().isoformat()
    assert calls[1] == {**calls[0], 'continuation_key': 'page-2'}
    assert bank.sync_transactions(account.id, days=90)['inserted'] == 0


def test_bbva_import_floor_still_prevents_duplicate_historical_imports(tmp_db, monkeypatch):
    account = db.add_account('Test bank', 'EUR', 'liquid')
    today = datetime.now(timezone.utc).date().isoformat()
    db.set_setting('bbva_eb_account_uid', 'test-uid')
    db.set_setting('bbva_eb_tx_date_from', today)
    get_page = Mock(return_value={'transactions': []})
    monkeypatch.setattr(bbva, '_eb_get', get_page)
    bbva.sync_transactions(account.id, days=90)
    assert get_page.call_args.args[1]['date_from'] == today


def test_repeated_continuation_key_fails_instead_of_looping():
    get_page = Mock(return_value={'transactions': [], 'continuation_key': 'same-page'})
    with pytest.raises(HTTPException) as error:
        eb.transactions('uid', '2026-01-01', '2026-01-02', get_page)
    assert error.value.status_code == 502
    assert get_page.call_count == 2


@pytest.mark.parametrize('bank', [bbva, revolut])
def test_later_page_failure_does_not_import_partial_transactions(tmp_db, monkeypatch, bank):
    account = db.add_account('Test bank', 'EUR', 'liquid')
    db.set_setting(f"{bank.__name__.split('.')[-1]}_eb_account_uid", 'test-uid')
    get_page = Mock(side_effect=[{'transactions': [{}], 'continuation_key': 'next'}, HTTPException(503, 'offline')])
    insert = Mock()
    monkeypatch.setattr(bank, '_eb_get', get_page)
    monkeypatch.setattr(db, 'insert_transactions', insert)
    with pytest.raises(HTTPException):
        bank.sync_transactions(account.id, days=90)
    insert.assert_not_called()


@pytest.mark.parametrize('provider', ['bbva', 'revolut'])
def test_status_distinguishes_expired_consent_from_service_errors(tmp_db, provider):
    db.set_setting(f'{provider}_eb_session_id', 'session')
    for code, expected in [('EXPIRED_SESSION', 'expired'), ('CLOSED_SESSION', 'expired'),
                           ('SESSION_DOES_NOT_EXIST', 'expired'), ('ASPSP_TIMEOUT', 'unknown'),
                           ('UNAUTHORIZED_ACCESS', 'unknown')]:
        error = eb.EnableBankingError(httpx.Response(422, json={'error': code, 'message': code}))
        assert eb.session_status(provider, Mock(side_effect=error))['status'] == expected
    active = eb.session_status(provider, Mock(return_value={
        'status': 'AUTHORIZED', 'accounts': ['uid'], 'access': {'valid_until': '2026-12-01T00:00:00Z'},
    }))
    assert active['status'] == 'active'
    assert active['valid_until'] == '2026-12-01T00:00:00Z'


def test_bank_balance_still_updates_after_transactions_failure():
    bank = SimpleNamespace(sync_transactions=Mock(side_effect=HTTPException(502, 'period invalid')),
                           sync_balances=Mock(return_value={'inserted': 1}))
    with pytest.raises(HTTPException) as error:
        scheduler._run_bank(bank, 1)
    bank.sync_balances.assert_called_once_with(account_id=1)
    assert 'Balance: 1 imported' in error.value.detail
    assert 'period invalid' in error.value.detail


def test_get_retries_temporary_errors_but_not_expired_sessions(monkeypatch):
    monkeypatch.setattr(eb, 'headers', lambda: {})
    monkeypatch.setattr(eb.time, 'sleep', lambda _: None)
    get = Mock(side_effect=[httpx.ConnectError('offline'), httpx.Response(503), httpx.Response(200, json={'ok': True})])
    monkeypatch.setattr(eb.httpx, 'get', get)
    assert eb.get('/aspsps') == {'ok': True}
    assert get.call_count == 3
    get = Mock(return_value=httpx.Response(422, json={'error': 'EXPIRED_SESSION'}))
    monkeypatch.setattr(eb.httpx, 'get', get)
    with pytest.raises(eb.EnableBankingError):
        eb.get('/sessions/test')
    assert get.call_count == 1


def test_single_use_code_exchange_is_never_retried(monkeypatch):
    monkeypatch.setattr(eb, 'headers', lambda: {})
    post = Mock(side_effect=httpx.ReadTimeout('timeout'))
    monkeypatch.setattr(eb.httpx, 'post', post)
    with pytest.raises(HTTPException) as error:
        eb.post('/sessions', {'code': 'single-use'})
    assert error.value.status_code == 503
    post.assert_called_once()


def test_ib_retries_report_generation_errors_but_not_expired_tokens(monkeypatch):
    from routers import ib
    monkeypatch.setattr(ib.time, 'sleep', lambda _: None)
    fetch = Mock(side_effect=[HTTPException(503, 'temporary'), '<FlexQueryResponse/>'])
    monkeypatch.setattr(ib, '_fetch_flex_xml_once', fetch)
    assert ib._fetch_flex_xml('token', 'query') == '<FlexQueryResponse/>'
    assert fetch.call_count == 2
    fetch = Mock(side_effect=HTTPException(400, 'expired'))
    monkeypatch.setattr(ib, '_fetch_flex_xml_once', fetch)
    with pytest.raises(HTTPException):
        ib._fetch_flex_xml('token', 'query')
    fetch.assert_called_once()


@pytest.mark.parametrize('code,expected', [('1001', 503), ('1009', 503), ('1012', 400), ('1015', 400)])
def test_ib_error_classification(code, expected):
    import xml.etree.ElementTree as ET
    from routers import ib
    with pytest.raises(HTTPException) as error:
        ib._raise_flex_error(ET.fromstring(f'<Response><ErrorCode>{code}</ErrorCode></Response>'))
    assert error.value.status_code == expected
    if code in {'1012', '1015'}:
        assert 'Replace the Flex Web Service token' in error.value.detail


def test_ib_uses_documented_endpoints_and_accepts_lowercase_url(monkeypatch):
    import io
    from routers import ib
    monkeypatch.setattr(ib.time, 'sleep', lambda _: None)
    open_url = Mock(side_effect=[
        io.BytesIO(b'<Response><Status>Success</Status><ReferenceCode>ref</ReferenceCode>'
                   b'<url>https://ndcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement</url></Response>'),
        io.BytesIO(b'<FlexQueryResponse/>'),
    ])
    monkeypatch.setattr(ib.urllib.request, 'urlopen', open_url)
    assert ib._fetch_flex_xml_once('test-token', 'test-query') == '<FlexQueryResponse/>'
    assert '/AccountManagement/FlexWebService/SendRequest?' in open_url.call_args_list[0].args[0]
    assert '/AccountManagement/FlexWebService/GetStatement?' in open_url.call_args_list[1].args[0]
