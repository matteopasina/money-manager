from __future__ import annotations
from dataclasses import dataclass


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


@dataclass
class Budget:
    category_name: str       # links by name, like keyword_rules (no FK cascade)
    monthly_amount: float    # base currency
    rollover: bool = False   # unused budget carries into later months
    start_month: str = ""    # 'YYYY-MM', set server-side at creation; anchors rollover accrual
    active: bool = True
    id: int | None = None


def base_amount(row) -> float:
    """A transaction's amount in base currency, falling back to the native
    amount when amount_base wasn't computed (e.g. rows predating FX support).

    `row` is anything supporting `[]` lookup by column name — a pandas Series
    (from db.get_transactions_df().iterrows()) or a sqlite3.Row.
    """
    import pandas as pd
    value = row["amount_base"]
    return float(row["amount"]) if value is None or pd.isna(value) else float(value)


def spending_frame(df, categories):
    """`df` narrowed to real spending: expense rows only, in base currency,
    with transfer categories (account moves, brokerage trades) excluded.

    `df` is a transactions DataFrame as returned by db.get_transactions_df()
    (must have amount, amount_base, category columns). `categories` is the
    list of Category rows from db.get_categories(), used to resolve which
    category names are transfers. Returns a DataFrame with `amount_base`
    coalesced onto `amount` and flipped positive; empty input passes through.
    """
    if df.empty:
        return df
    excluded = {c.name for c in categories if c.is_transfer}
    out = df.copy()
    out["amount_base"] = out["amount_base"].where(out["amount_base"].notna(), out["amount"])
    out = out[(out["amount_base"] < 0) & (~out["category"].isin(excluded))]
    out["amount_base"] = out["amount_base"].abs()
    return out
