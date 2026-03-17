"""
Wide-format snapshot CSV adapter.

Expects a pivot-table CSV where:
- Row 0: blank
- Row 1: date headers (some columns are paired raw+base, others single base-only)
- Rows 2+: one row per account; section header rows (configurable) are skipped

Numbers may use any locale — periods and commas are handled intelligently.
Dates must be parseable by dateutil (e.g. "31/12/2024", "2024-12-31").

This is a generic adapter — it does not assume Italian locale, specific account
names, or any particular column structure beyond the wide-format convention.
"""
from __future__ import annotations

from typing import Callable

import pandas as pd

from adapters.base import BaseAdapter
from domain import Balance

# Row names to skip (section headers / totals rows)
_SKIP_NAMES = {"Totale", "Date", "", "Total", "Cambi", "Liquidi", "Stocks", "Crypto"}


def _parse_amount(s) -> float | None:
    if pd.isna(s):
        return None
    s = str(s).strip().replace("€", "").replace("$", "").replace(" ", "")
    if not s or s.lower() in ("nan", "n/a", "-"):
        return None
    # Italian / European: 1.234,56 → remove periods, swap comma
    if "." in s and "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _parse_date(s: str) -> str | None:
    s = s.strip()
    from dateutil import parser as dateparser
    try:
        return dateparser.parse(s, dayfirst=True).date().isoformat()
    except Exception:
        return None


class SnapshotCSVAdapter(BaseAdapter):
    NAME = "Wide-format Snapshot CSV"
    FILE_TYPES = ["csv"]
    IMPORTS = "balances"

    def parse(
        self,
        filepath: str,
        account_id: int,
        account_currency: str,
        base_currency: str,
        get_rate: Callable[[str], float],
        account_name: str = "",
        skip_names: set[str] | None = None,
    ) -> list[Balance]:
        """
        account_name: if provided, only rows matching this name are imported.
                      If empty, all non-skipped rows are returned (multi-account mode).
        skip_names: additional row names to skip beyond the defaults.
        """
        _skip = _SKIP_NAMES | (skip_names or set())

        raw = pd.read_csv(filepath, header=None, dtype=str)

        # Row 1 is the date header
        date_row = raw.iloc[1]
        headers = [str(x).strip() if pd.notna(x) else "" for x in date_row]

        # Build column map: list of (date_iso, native_col_idx_or_None, base_col_idx)
        column_map: list[tuple[str, int | None, int]] = []

        # First special pair: col 1 = native amount, col 2 = actual date string
        first_date = _parse_date(headers[2]) if len(headers) > 2 else None
        if first_date:
            column_map.append((first_date, 1, 2))

        i = 3
        while i < len(headers):
            h = headers[i]
            if not h:
                i += 1
                continue
            if i + 1 < len(headers) and headers[i + 1] == h:
                date = _parse_date(h)
                if date:
                    column_map.append((date, i, i + 1))
                i += 2
            else:
                date = _parse_date(h)
                if date:
                    column_map.append((date, None, i))
                i += 1

        balances = []
        for row_idx in range(2, len(raw)):
            name_cell = raw.iloc[row_idx, 0]
            if pd.isna(name_cell):
                continue
            row_name = str(name_cell).strip()
            if not row_name or row_name in _skip:
                continue
            if account_name and row_name != account_name:
                continue

            row = raw.iloc[row_idx]
            for date_iso, native_col, base_col in column_map:
                base_val = _parse_amount(row.iloc[base_col])
                if base_val is None or base_val == 0:
                    continue

                if native_col is not None:
                    native_val = _parse_amount(row.iloc[native_col])
                    if native_val is None:
                        native_val = base_val
                else:
                    native_val = base_val

                balances.append(Balance(
                    account_id=account_id,
                    date=date_iso,
                    amount_native=native_val,
                    amount_base=base_val,
                ))

        return balances
