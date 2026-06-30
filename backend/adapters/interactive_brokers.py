import logging
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Callable, Optional

from adapters.base import BaseAdapter
from domain import Balance, Transaction

logger = logging.getLogger(__name__)


def _parse_ib_date(s: str) -> str:
    """Handles both '20240101' and '20240101;093000' formats."""
    return datetime.strptime(s[:8], "%Y%m%d").strftime("%Y-%m-%d")


class IBTransactionsAdapter(BaseAdapter):
    NAME = "Interactive Brokers (Transactions)"
    FILE_TYPES = ["xml"]
    IMPORTS = "transactions"

    def parse(
        self,
        filepath: str,
        account_id: int,
        account_currency: str,
        base_currency: str,
        get_rate: Callable[[str], float],
        categorise: Optional[Callable[[str, str], str]] = None,
    ) -> list[Transaction]:
        tree = ET.parse(filepath)
        root = tree.getroot()
        txns: list[Transaction] = []

        for ct in root.iter("CashTransaction"):
            try:
                amount = float(ct.get("amount", 0))
                if amount == 0:
                    continue
                currency = ct.get("currency", account_currency)
                rate = get_rate(currency)
                desc = ct.get("description", "")
                ref  = ct.get("type", "")
                date = _parse_ib_date(ct.get("dateTime", ""))
                cat  = categorise(desc, ref) if categorise else None
                txns.append(Transaction(
                    account_id=account_id, date=date, description=desc,
                    amount=amount, amount_base=amount * rate,
                    reference=ref, category=cat,
                ))
            except Exception as e:
                logger.warning("IB: skipping CashTransaction row: %s", e)

        for tr in root.iter("Trade"):
            try:
                net = float(tr.get("netCash", 0))
                if net == 0:
                    continue
                currency = tr.get("currency", account_currency)
                rate   = get_rate(currency)
                symbol = tr.get("symbol", "")
                qty    = tr.get("quantity", "")
                price  = tr.get("tradePrice", "")
                action = tr.get("buySell", "")
                desc   = f"{action} {qty} {symbol} @ {price}"
                date   = _parse_ib_date(tr.get("tradeDate", ""))
                cat    = categorise(desc, symbol) if categorise else None
                txns.append(Transaction(
                    account_id=account_id, date=date, description=desc,
                    amount=net, amount_base=net * rate,
                    reference=symbol, category=cat,
                ))
            except Exception as e:
                logger.warning("IB: skipping Trade row: %s", e)

        return txns

    def detect(self, filepath: str) -> bool:
        try:
            return ET.parse(filepath).getroot().tag == "FlexQueryResponse"
        except Exception:
            return False


class IBBalancesAdapter(BaseAdapter):
    NAME = "Interactive Brokers (NAV)"
    FILE_TYPES = ["xml"]
    IMPORTS = "balances"

    def parse(
        self,
        filepath: str,
        account_id: int,
        account_currency: str,
        base_currency: str,
        get_rate: Callable[[str], float],
    ) -> list[Balance]:
        tree = ET.parse(filepath)
        root = tree.getroot()
        balances: list[Balance] = []

        # "Net Asset Value (NAV) in Base" section — current IB UI label
        # (previously "Equity Summary by Report Date in Base Currency")
        # IB may use either element name depending on account/version.
        for tag, amount_attr in [
            ("EquitySummaryByReportDateInBase", "total"),
            ("NetAssetValue", "total"),
        ]:
            for eq in root.iter(tag):
                try:
                    total = float(eq.get(amount_attr, 0))
                    date  = eq.get("reportDate", "")
                    if not date or total == 0:
                        continue
                    balances.append(Balance(
                        account_id=account_id,
                        date=_parse_ib_date(date),
                        amount_native=total,
                        amount_base=total,
                    ))
                except Exception as e:
                    logger.warning("IB NAV: skipping %s row: %s", tag, e)

        # "Change in NAV" section — endingNAV field
        for el in root.iter("ChangeInNAV"):
            try:
                total = float(el.get("endingNAV", 0))
                date  = el.get("reportDate", "")
                if not date or total == 0:
                    continue
                balances.append(Balance(
                    account_id=account_id,
                    date=_parse_ib_date(date),
                    amount_native=total,
                    amount_base=total,
                ))
            except Exception as e:
                logger.warning("IB NAV: skipping ChangeInNAV row: %s", e)

        # Deduplicate by date (keep first occurrence per date)
        seen: set[str] = set()
        unique: list[Balance] = []
        for b in balances:
            if b.date not in seen:
                seen.add(b.date)
                unique.append(b)
        balances = unique

        # Last-resort fallback: sum open positions
        if not balances:
            by_date: dict[str, float] = {}
            for pos in root.iter("OpenPosition"):
                try:
                    date = _parse_ib_date(pos.get("reportDate", ""))
                    val  = float(pos.get("positionValue", 0))
                    by_date[date] = by_date.get(date, 0) + val
                except Exception:
                    pass
            for date, total in sorted(by_date.items()):
                rate = get_rate(account_currency)
                balances.append(Balance(
                    account_id=account_id, date=date,
                    amount_native=total, amount_base=total * rate,
                ))

        return balances

    def detect(self, filepath: str) -> bool:
        try:
            return ET.parse(filepath).getroot().tag == "FlexQueryResponse"
        except Exception:
            return False
