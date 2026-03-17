"""
BBVA (Spain) — XLSX transaction export adapter.

BBVA exports are Excel files with an Italian-language header row containing
columns like "Data", "Parola chiave", "Importo", "Disponibile", etc.
This adapter detects the header row by scanning for those keywords, maps
the columns, and returns a list of Transaction domain objects.

Categorisation is NOT performed here — the caller should pass a categorise
function if auto-categorisation is desired.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Callable, Optional

import pandas as pd

logger = logging.getLogger(__name__)

from adapters.base import BaseAdapter
from domain import Transaction, Balance


class BBVAAdapter(BaseAdapter):
    NAME = "BBVA (Spain)"
    FILE_TYPES = ["xlsx", "xls"]
    IMPORTS = "transactions"

    # Italian column keywords used to detect the header row
    _HEADER_KEYWORDS = {"data", "movimento", "importo", "disponibile", "parola chiave", "osservazioni"}

    def parse(
        self,
        filepath: str,
        account_id: int,
        account_currency: str,
        base_currency: str,
        get_rate: Callable[[str], float],
        categorise: Optional[Callable[[str, str], str]] = None,
    ) -> list[Transaction]:
        raw = pd.read_excel(filepath, header=None, engine="openpyxl")

        # Locate header row
        header_row = None
        for i, row in raw.iterrows():
            row_vals = {str(v).strip().lower() for v in row if pd.notna(v)}
            if len(row_vals & self._HEADER_KEYWORDS) >= 2:
                header_row = i
                break

        if header_row is None:
            raise ValueError(
                f"Could not find BBVA header row. First rows:\n{raw.head(6).to_string()}"
            )

        df = pd.read_excel(filepath, header=header_row, engine="openpyxl")
        df = df.dropna(how="all")

        # Map columns
        col_map = {}
        for col in df.columns:
            c = str(col).strip().lower()
            if "data valuta" in c:
                col_map[col] = "value_date"
            elif c == "data":
                col_map[col] = "date"
            elif "parola chiave" in c:
                col_map[col] = "description"
            elif "movimento" in c:
                col_map[col] = "reference"
            elif "importo" in c:
                col_map[col] = "amount"
            elif "disponibile" in c:
                col_map[col] = "balance"
            elif "osservazioni" in c:
                col_map[col] = "notes"

        df = df.rename(columns=col_map)

        required = {"date", "description", "amount"}
        missing = required - set(df.columns)
        if missing:
            raise ValueError(f"Required columns not found: {missing}. Got: {list(df.columns)}")

        df = df[df["date"].notna() & df["amount"].notna()].copy()

        def _parse_date(val) -> str | None:
            try:
                return pd.to_datetime(val, dayfirst=True).strftime("%Y-%m-%d")
            except Exception:
                logger.warning("Could not parse date value %r — row will be skipped", val)
                return None

        df["date"] = df["date"].apply(_parse_date)
        df = df[df["date"].notna()].copy()  # drop rows with unparseable dates
        if "value_date" in df.columns:
            df["value_date"] = df["value_date"].apply(lambda v: _parse_date(v) if pd.notna(v) else None)
        else:
            df["value_date"] = None

        df["description"] = df["description"].fillna("").astype(str).str.strip()
        df["reference"] = df.get("reference", pd.Series([""] * len(df))).fillna("").astype(str).str.strip()
        df["notes"] = df.get("notes", pd.Series([None] * len(df))).where(
            df.get("notes", pd.Series([None] * len(df))).notna(), None
        )
        df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
        df["balance"] = pd.to_numeric(df.get("balance", pd.Series([None] * len(df))), errors="coerce")
        df = df[df["amount"].notna() & (df["description"] != "")]

        rate = get_rate(account_currency)
        transactions = []
        for _, row in df.iterrows():
            amount = float(row["amount"])
            ref = row.get("reference") or None
            category = categorise(row["description"], ref or "") if categorise else None
            transactions.append(Transaction(
                account_id=account_id,
                date=row["date"],
                description=row["description"],
                amount=amount,
                amount_base=round(amount * rate, 4),
                category=category,
                value_date=row.get("value_date") or None,
                reference=ref,
                balance=float(row["balance"]) if pd.notna(row.get("balance")) else None,
                notes=row.get("notes") or None,
            ))

        return transactions

    def detect(self, filepath: str) -> bool:
        try:
            raw = pd.read_excel(filepath, header=None, engine="openpyxl", nrows=10)
            for _, row in raw.iterrows():
                vals = {str(v).strip().lower() for v in row if pd.notna(v)}
                if len(vals & self._HEADER_KEYWORDS) >= 3:
                    return True
        except Exception as e:
            import warnings
            warnings.warn(f"BBVAAdapter.detect failed for {filepath!r}: {e}")
        return False
