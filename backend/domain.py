from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class Account:
    name: str
    currency: str
    account_type: str        # free-form: "liquid", "stocks", "pension", anything
    active: bool = True
    id: int | None = None


@dataclass
class Balance:
    account_id: int
    date: str                # ISO YYYY-MM-DD
    amount_native: float     # in account's own currency
    amount_base: float       # in app base currency
    id: int | None = None


@dataclass
class Transaction:
    account_id: int
    date: str                # ISO YYYY-MM-DD
    description: str
    amount: float            # signed, in account currency (negative = expense)
    amount_base: float       # in app base currency
    category: str | None = None
    value_date: str | None = None
    reference: str | None = None   # bank-specific type code (formerly 'movimento')
    balance: float | None = None   # running account balance after this tx
    notes: str | None = None
    id: int | None = None


@dataclass
class Category:
    name: str
    color: str = "#6b7280"
    is_income: bool = False
    is_transfer: bool = False    # if True, excluded from spend calculations
    id: int | None = None


@dataclass
class KeywordRule:
    keyword: str             # lowercase; matched with 'in description/reference'
    category_name: str
    match_field: str = "any" # "description", "reference", or "any"
    priority: int = 0        # higher = evaluated first
    id: int | None = None
