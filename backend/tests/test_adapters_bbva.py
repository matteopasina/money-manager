import io
import pytest
import openpyxl
import tempfile
import os


def _make_bbva_xlsx(rows: list[dict]) -> str:
    """Create a minimal BBVA-format Excel file and return its path."""
    wb = openpyxl.Workbook()
    ws = wb.active
    # Row 0: some preamble (to test header detection)
    ws.append(["BBVA", "", "", "", ""])
    # Row 1: header row with Italian column names
    ws.append(["Data", "Data valuta", "Parola chiave", "Movimento", "Importo", "Disponibile"])
    for r in rows:
        ws.append([r["date"], r.get("value_date", ""), r["desc"], r.get("ref", ""),
                   r["amount"], r.get("balance", "")])
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        wb.save(tmp.name)
        return tmp.name


def _get_rate(currency: str) -> float:
    return 1.0


class TestBBVAAdapter:
    def test_parse_basic_transactions(self):
        from adapters.bbva import BBVAAdapter
        path = _make_bbva_xlsx([
            {"date": "01/01/2024", "desc": "Amazon", "amount": -50.0},
            {"date": "02/01/2024", "desc": "Salary", "amount": 2000.0},
        ])
        try:
            adapter = BBVAAdapter()
            txns = adapter.parse(path, account_id=1, account_currency="EUR",
                                 base_currency="EUR", get_rate=_get_rate)
            assert len(txns) == 2
            assert txns[0].description == "Amazon"
            assert txns[0].amount == pytest.approx(-50.0)
            assert txns[1].amount == pytest.approx(2000.0)
        finally:
            os.unlink(path)

    def test_parse_date_format(self):
        from adapters.bbva import BBVAAdapter
        path = _make_bbva_xlsx([{"date": "15/03/2024", "desc": "Test", "amount": -10.0}])
        try:
            adapter = BBVAAdapter()
            txns = adapter.parse(path, account_id=1, account_currency="EUR",
                                 base_currency="EUR", get_rate=_get_rate)
            assert txns[0].date == "2024-03-15"
        finally:
            os.unlink(path)

    def test_parse_skips_row_with_bad_date(self):
        from adapters.bbva import BBVAAdapter
        path = _make_bbva_xlsx([
            {"date": "INVALID_DATE", "desc": "Bad", "amount": -10.0},
            {"date": "01/01/2024", "desc": "Good", "amount": -20.0},
        ])
        try:
            adapter = BBVAAdapter()
            txns = adapter.parse(path, account_id=1, account_currency="EUR",
                                 base_currency="EUR", get_rate=_get_rate)
            assert len(txns) == 1
            assert txns[0].description == "Good"
        finally:
            os.unlink(path)

    def test_detect_returns_true_for_bbva_file(self):
        from adapters.bbva import BBVAAdapter
        path = _make_bbva_xlsx([{"date": "01/01/2024", "desc": "Test", "amount": -10.0}])
        try:
            assert BBVAAdapter().detect(path) is True
        finally:
            os.unlink(path)

    def test_detect_returns_false_for_random_file(self, tmp_path):
        from adapters.bbva import BBVAAdapter
        wb = openpyxl.Workbook()
        wb.active.append(["Hello", "World"])
        path = str(tmp_path / "other.xlsx")
        wb.save(path)
        assert BBVAAdapter().detect(path) is False

    def test_categorise_applied(self):
        from adapters.bbva import BBVAAdapter
        from domain import KeywordRule
        from categoriser import categorise
        path = _make_bbva_xlsx([{"date": "01/01/2024", "desc": "Supermercado", "amount": -30.0}])
        rules = [KeywordRule(id=1, keyword="supermercado", category_name="Groceries",
                             match_field="description", priority=10)]
        try:
            adapter = BBVAAdapter()
            txns = adapter.parse(path, account_id=1, account_currency="EUR",
                                 base_currency="EUR", get_rate=_get_rate,
                                 categorise=lambda d, r: categorise(d, r, rules))
            assert txns[0].category == "Groceries"
        finally:
            os.unlink(path)
