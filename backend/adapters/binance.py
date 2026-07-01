import json
import logging
from datetime import datetime
from typing import Callable, Optional

from adapters.base import BaseAdapter
from domain import Balance, Transaction

logger = logging.getLogger(__name__)

STABLECOINS = {"USDT", "USDC", "BUSD", "DAI", "FDUSD", "TUSD", "USDP"}


def _ms_to_date(ts) -> str:
    """Convert a Binance timestamp (ms int, numeric string, or datetime string) to YYYY-MM-DD."""
    if isinstance(ts, str):
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
            try:
                return datetime.strptime(ts, fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
        ts = int(ts)  # numeric string like "1637112797000"
    return datetime.utcfromtimestamp(int(ts) / 1000).strftime("%Y-%m-%d")


def _map_deposits(
    rows: list,
    account_id: int,
    get_rate: Callable[[str], float],
    categorise: Optional[Callable] = None,
) -> list[Transaction]:
    txns = []
    for row in rows:
        try:
            amount = float(row.get("amount", 0))
            if amount == 0:
                continue
            coin = row.get("coin", "")
            date = _ms_to_date(row["insertTime"])
            desc = f"Deposit {coin}"
            ref  = row.get("txId", "")
            rate = get_rate(coin)
            cat  = categorise(desc, ref) if categorise else None
            txns.append(Transaction(
                account_id=account_id, date=date, description=desc,
                amount=amount, amount_base=amount * rate,
                reference=ref, category=cat,
            ))
        except Exception as e:
            logger.warning("Binance: skipping deposit row: %s", e)
    return txns


def _map_withdrawals(
    rows: list,
    account_id: int,
    get_rate: Callable[[str], float],
    categorise: Optional[Callable] = None,
) -> list[Transaction]:
    txns = []
    for row in rows:
        try:
            amount = float(row.get("amount", 0))
            if amount == 0:
                continue
            coin = row.get("coin", "")
            date = _ms_to_date(row.get("applyTime", row.get("completeTime", 0)))
            desc = f"Withdrawal {coin}"
            ref  = row.get("txId", "")
            rate = get_rate(coin)
            cat  = categorise(desc, ref) if categorise else None
            txns.append(Transaction(
                account_id=account_id, date=date, description=desc,
                amount=-amount, amount_base=-amount * rate,
                reference=ref, category=cat,
            ))
        except Exception as e:
            logger.warning("Binance: skipping withdrawal row: %s", e)
    return txns


def _map_converts(
    rows: list,
    account_id: int,
    get_rate: Callable[[str], float],
    categorise: Optional[Callable] = None,
) -> list[Transaction]:
    txns = []
    for row in rows:
        try:
            from_amount = float(row.get("fromAmount", 0))
            if from_amount == 0:
                continue
            from_asset = row.get("fromAsset", "")
            to_asset   = row.get("toAsset", "")
            date = _ms_to_date(row["createTime"])
            desc = f"Convert {from_amount} {from_asset} → {to_asset}"
            ref  = row.get("orderId", "")
            rate = get_rate(from_asset)
            cat  = categorise(desc, ref) if categorise else None
            txns.append(Transaction(
                account_id=account_id, date=date, description=desc,
                amount=-from_amount, amount_base=-from_amount * rate,
                reference=ref, category=cat,
            ))
        except Exception as e:
            logger.warning("Binance: skipping convert row: %s", e)
    return txns


def _map_rewards(
    rows: list,
    account_id: int,
    get_rate: Callable[[str], float],
    categorise: Optional[Callable] = None,
) -> list[Transaction]:
    txns = []
    for row in rows:
        try:
            amount = float(row.get("rewards", row.get("amount", 0)))
            if amount == 0:
                continue
            asset = row.get("asset", "")
            date  = _ms_to_date(row.get("time", row.get("createTime", 0)))
            desc  = f"Earn reward {asset}"
            ref   = row.get("projectId", "")
            rate  = get_rate(asset)
            cat   = categorise(desc, ref) if categorise else None
            txns.append(Transaction(
                account_id=account_id, date=date, description=desc,
                amount=amount, amount_base=amount * rate,
                reference=ref, category=cat,
            ))
        except Exception as e:
            logger.warning("Binance: skipping reward row: %s", e)
    return txns


class BinanceTransactionsAdapter(BaseAdapter):
    NAME = "Binance (Transactions)"
    FILE_TYPES = ["json"]
    IMPORTS = "transactions"

    def parse(self, filepath, account_id, account_currency, base_currency, get_rate, categorise=None):
        with open(filepath) as f:
            data = json.load(f)
        return (
            _map_deposits(data.get("deposits", []), account_id, get_rate, categorise) +
            _map_withdrawals(data.get("withdrawals", []), account_id, get_rate, categorise) +
            _map_converts(data.get("converts", []), account_id, get_rate, categorise) +
            _map_rewards(data.get("rewards", []), account_id, get_rate, categorise)
        )

    def detect(self, filepath: str) -> bool:
        try:
            with open(filepath) as f:
                data = json.load(f)
            return any(k in data for k in ("deposits", "withdrawals", "converts", "rewards"))
        except Exception:
            return False


class BinancePortfolioAdapter(BaseAdapter):
    NAME = "Binance (Portfolio)"
    FILE_TYPES = ["json"]
    IMPORTS = "balances"

    def parse(self, filepath, account_id, account_currency, base_currency, get_rate):
        with open(filepath) as f:
            data = json.load(f)
        total_usdt = float(data.get("total_usdt", 0))
        date = data.get("date", datetime.utcnow().strftime("%Y-%m-%d"))
        rate = get_rate("USDT")
        return [Balance(
            account_id=account_id,
            date=date,
            amount_native=total_usdt,
            amount_base=total_usdt * rate,
        )]

    def detect(self, filepath: str) -> bool:
        try:
            with open(filepath) as f:
                data = json.load(f)
            return "total_usdt" in data and "date" in data
        except Exception:
            return False
