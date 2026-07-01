import sqlite3
import os
from datetime import datetime, timezone
from typing import Optional

from domain import Account, Balance, Transaction, Category, KeywordRule

DB_PATH = os.environ.get("DB_PATH", "finances.db")

DEFAULT_CATEGORIES = [
    ("Groceries",     "#22c55e", False, False),
    ("Food",          "#f97316", False, False),
    ("Shopping",      "#a78bfa", False, False),
    ("Transport",     "#06b6d4", False, False),
    ("Bills",         "#64748b", False, False),
    ("Housing",       "#8b5cf6", False, False),
    ("Health",        "#ef4444", False, False),
    ("Travel",        "#f59e0b", False, False),
    ("Entertainment", "#ec4899", False, False),
    ("Sport",         "#84cc16", False, False),
    ("Investment",    "#3d8ef8", False, True),   # is_transfer
    ("Income",        "#10d98e", True,  False),  # is_income
    ("Transfer",      "#94a3b8", False, True),   # is_transfer
    ("Other",         "#6b7280", False, False),
]

DEFAULT_SETTINGS = {
    "base_currency": "EUR",
}


# ── Connection ─────────────────────────────────────────────────────────────────

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# ── Init ───────────────────────────────────────────────────────────────────────

def init_db() -> None:
    with get_connection() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS accounts (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                name         TEXT    NOT NULL UNIQUE,
                currency     TEXT    NOT NULL DEFAULT 'EUR',
                account_type TEXT    NOT NULL DEFAULT 'other',
                active       INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS balances (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id     INTEGER NOT NULL REFERENCES accounts(id),
                date           TEXT    NOT NULL,
                amount_native  REAL    NOT NULL,
                amount_base    REAL    NOT NULL,
                UNIQUE(account_id, date)
            );

            CREATE TABLE IF NOT EXISTS fx_rates (
                currency    TEXT PRIMARY KEY,
                rate_to_base REAL NOT NULL,
                updated_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS transactions (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id   INTEGER NOT NULL REFERENCES accounts(id),
                date         TEXT    NOT NULL,
                value_date   TEXT,
                description  TEXT    NOT NULL,
                reference    TEXT,
                amount       REAL    NOT NULL,
                amount_base  REAL,
                balance      REAL,
                notes        TEXT,
                category     TEXT,
                UNIQUE(account_id, date, description, amount)
            );

            CREATE TABLE IF NOT EXISTS categories (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT    NOT NULL UNIQUE,
                color       TEXT    NOT NULL DEFAULT '#6b7280',
                is_income   INTEGER NOT NULL DEFAULT 0,
                is_transfer INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS keyword_rules (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                keyword       TEXT    NOT NULL,
                category_name TEXT    NOT NULL,
                match_field   TEXT    NOT NULL DEFAULT 'any',
                priority      INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS app_settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        """)
        _migrate(conn)
        _seed(conn)


def _migrate(conn: sqlite3.Connection) -> None:
    """Apply additive schema migrations for existing databases."""

    def cols(table: str) -> set:
        return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}

    # categories: add color / is_income / is_transfer if missing
    cat_cols = cols("categories")
    if "color" not in cat_cols:
        conn.execute("ALTER TABLE categories ADD COLUMN color TEXT NOT NULL DEFAULT '#6b7280'")
    if "is_income" not in cat_cols:
        conn.execute("ALTER TABLE categories ADD COLUMN is_income INTEGER NOT NULL DEFAULT 0")
    if "is_transfer" not in cat_cols:
        conn.execute("ALTER TABLE categories ADD COLUMN is_transfer INTEGER NOT NULL DEFAULT 0")

    # accounts: rename 'type' → 'account_type' (old schema used 'type')
    if "type" in cols("accounts") and "account_type" not in cols("accounts"):
        conn.execute("ALTER TABLE accounts RENAME COLUMN type TO account_type")

    # transactions: rename 'movimento' → 'reference' (old BBVA import column name)
    tx_cols = cols("transactions")
    if "movimento" in tx_cols and "reference" not in tx_cols:
        conn.execute("ALTER TABLE transactions RENAME COLUMN movimento TO reference")
    # transactions: add amount_base if missing
    if "amount_base" not in cols("transactions"):
        conn.execute("ALTER TABLE transactions ADD COLUMN amount_base REAL")

    # fx_rates: rename 'rate_to_eur' → 'rate_to_base' (old schema was EUR-specific)
    if "rate_to_eur" in cols("fx_rates") and "rate_to_base" not in cols("fx_rates"):
        conn.execute("ALTER TABLE fx_rates RENAME COLUMN rate_to_eur TO rate_to_base")

    # balances: migrate old 'snapshots' table data (Streamlit-era schema)
    n_balances = conn.execute("SELECT COUNT(*) FROM balances").fetchone()[0]
    has_snapshots = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='snapshots'"
    ).fetchone()
    if n_balances == 0 and has_snapshots:
        conn.execute("""
            INSERT OR IGNORE INTO balances (account_id, date, amount_native, amount_base)
            SELECT account_id, date, amount_original, amount_eur
            FROM snapshots
        """)


def _seed(conn: sqlite3.Connection) -> None:
    for name, color, is_income, is_transfer in DEFAULT_CATEGORIES:
        conn.execute(
            "INSERT OR IGNORE INTO categories (name, color, is_income, is_transfer) VALUES (?, ?, ?, ?)",
            (name, color, int(is_income), int(is_transfer)),
        )
    for key, value in DEFAULT_SETTINGS.items():
        conn.execute(
            "INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)",
            (key, value),
        )


# ── App settings ───────────────────────────────────────────────────────────────

def get_setting(key: str, default: str = "") -> str:
    with get_connection() as conn:
        row = conn.execute("SELECT value FROM app_settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(key: str, value: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )


def get_base_currency() -> str:
    return get_setting("base_currency", "EUR")


# ── FX rates ───────────────────────────────────────────────────────────────────

def get_fx_rates() -> list[sqlite3.Row]:
    with get_connection() as conn:
        return conn.execute("SELECT * FROM fx_rates ORDER BY currency").fetchall()


def upsert_fx_rate(currency: str, rate: float) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO fx_rates (currency, rate_to_base, updated_at)
               VALUES (?, ?, ?)
               ON CONFLICT(currency) DO UPDATE SET rate_to_base = excluded.rate_to_base,
                                                   updated_at   = excluded.updated_at""",
            (currency.upper(), rate, now),
        )


def get_rate(currency: str) -> float:
    base = get_base_currency().upper()
    if currency.upper() == base:
        return 1.0
    with get_connection() as conn:
        row = conn.execute(
            "SELECT rate_to_base FROM fx_rates WHERE currency = ?",
            (currency.upper(),),
        ).fetchone()
    return row["rate_to_base"] if row else 1.0


# ── Accounts ───────────────────────────────────────────────────────────────────

def get_accounts(active_only: bool = False) -> list[Account]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM accounts" + (" WHERE active = 1" if active_only else "") + " ORDER BY account_type, name"
        ).fetchall()
    return [Account(id=r["id"], name=r["name"], currency=r["currency"],
                    account_type=r["account_type"], active=bool(r["active"])) for r in rows]


def add_account(name: str, currency: str, account_type: str) -> Account:
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO accounts (name, currency, account_type) VALUES (?, ?, ?)",
            (name, currency.upper(), account_type),
        )
        return Account(id=cur.lastrowid, name=name, currency=currency.upper(), account_type=account_type)


def update_account(account_id: int, name: str, currency: str, account_type: str, active: bool) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE accounts SET name = ?, currency = ?, account_type = ?, active = ? WHERE id = ?",
            (name, currency.upper(), account_type, int(active), account_id),
        )


# ── Balances ───────────────────────────────────────────────────────────────────

def get_balances_df():
    import pandas as pd
    with get_connection() as conn:
        return pd.read_sql_query(
            """SELECT b.id, b.date, b.amount_native, b.amount_base,
                      a.id AS account_id, a.name AS account, a.currency, a.account_type
               FROM balances b
               JOIN accounts a ON a.id = b.account_id
               ORDER BY b.date""",
            conn,
        )


def upsert_balances(rows: list[tuple[int, str, float, float]]) -> int:
    """rows: [(account_id, date, amount_native, amount_base), ...]"""
    inserted = 0
    with get_connection() as conn:
        for account_id, date, amount_native, amount_base in rows:
            cur = conn.execute(
                """INSERT INTO balances (account_id, date, amount_native, amount_base)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(account_id, date) DO UPDATE
                       SET amount_native = excluded.amount_native,
                           amount_base   = excluded.amount_base""",
                (account_id, date, amount_native, amount_base),
            )
            inserted += cur.rowcount
    return inserted


def update_balance(balance_id: int, amount_native: float, amount_base: float) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE balances SET amount_native = ?, amount_base = ? WHERE id = ?",
            (amount_native, amount_base, balance_id),
        )


def delete_balance(balance_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM balances WHERE id = ?", (balance_id,))


def has_balances() -> bool:
    with get_connection() as conn:
        return conn.execute("SELECT COUNT(*) AS n FROM balances").fetchone()["n"] > 0


# ── Transactions ───────────────────────────────────────────────────────────────

def get_transactions_df(
    account_id: Optional[int] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
):
    import pandas as pd
    conditions, params = [], []
    if account_id is not None:
        conditions.append("t.account_id = ?"); params.append(account_id)
    if start:
        conditions.append("t.date >= ?"); params.append(start)
    if end:
        conditions.append("t.date <= ?"); params.append(end)
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    with get_connection() as conn:
        return pd.read_sql_query(
            f"""SELECT t.id, t.date, t.value_date, t.description, t.reference,
                       t.amount, t.amount_base, t.balance, t.notes, t.category,
                       a.name AS account, a.id AS account_id
                FROM transactions t
                JOIN accounts a ON a.id = t.account_id
                {where}
                ORDER BY t.date DESC, t.id DESC""",
            conn, params=params,
        )


def insert_transactions(rows: list[dict]) -> tuple[int, int]:
    """Insert transactions. Each dict must have: account_id, date, description, amount.
    Optional: value_date, reference, amount_base, balance, notes, category."""
    inserted = skipped = 0
    with get_connection() as conn:
        for r in rows:
            cur = conn.execute(
                """INSERT OR IGNORE INTO transactions
                   (account_id, date, value_date, description, reference,
                    amount, amount_base, balance, notes, category)
                   VALUES (:account_id, :date, :value_date, :description, :reference,
                           :amount, :amount_base, :balance, :notes, :category)""",
                {
                    "account_id": r["account_id"],
                    "date": r["date"],
                    "value_date": r.get("value_date"),
                    "description": r["description"],
                    "reference": r.get("reference"),
                    "amount": r["amount"],
                    "amount_base": r.get("amount_base"),
                    "balance": r.get("balance"),
                    "notes": r.get("notes"),
                    "category": r.get("category"),
                },
            )
            if cur.rowcount:
                inserted += 1
            else:
                skipped += 1
    return inserted, skipped


def update_transaction_category(transaction_id: int, category: str) -> None:
    with get_connection() as conn:
        conn.execute("UPDATE transactions SET category = ? WHERE id = ?", (category, transaction_id))


def has_transactions() -> bool:
    with get_connection() as conn:
        return conn.execute("SELECT COUNT(*) AS n FROM transactions").fetchone()["n"] > 0


# ── Categories ─────────────────────────────────────────────────────────────────

def get_categories() -> list[Category]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM categories ORDER BY name").fetchall()
    return [Category(id=r["id"], name=r["name"], color=r["color"],
                     is_income=bool(r["is_income"]), is_transfer=bool(r["is_transfer"])) for r in rows]


def upsert_category(cat: Category) -> Category:
    with get_connection() as conn:
        if cat.id:
            conn.execute(
                "UPDATE categories SET name=?, color=?, is_income=?, is_transfer=? WHERE id=?",
                (cat.name, cat.color, int(cat.is_income), int(cat.is_transfer), cat.id),
            )
            return cat
        else:
            cur = conn.execute(
                "INSERT INTO categories (name, color, is_income, is_transfer) VALUES (?, ?, ?, ?)",
                (cat.name, cat.color, int(cat.is_income), int(cat.is_transfer)),
            )
            return Category(id=cur.lastrowid, name=cat.name, color=cat.color,
                            is_income=cat.is_income, is_transfer=cat.is_transfer)


def delete_category(category_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM categories WHERE id = ?", (category_id,))


# ── Keyword rules ──────────────────────────────────────────────────────────────

def get_keyword_rules() -> list[KeywordRule]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM keyword_rules ORDER BY priority DESC, keyword"
        ).fetchall()
    return [KeywordRule(id=r["id"], keyword=r["keyword"], category_name=r["category_name"],
                        match_field=r["match_field"], priority=r["priority"]) for r in rows]


def upsert_keyword_rule(rule: KeywordRule) -> KeywordRule:
    with get_connection() as conn:
        if rule.id:
            conn.execute(
                "UPDATE keyword_rules SET keyword=?, category_name=?, match_field=?, priority=? WHERE id=?",
                (rule.keyword.lower(), rule.category_name, rule.match_field, rule.priority, rule.id),
            )
            return rule
        else:
            cur = conn.execute(
                "INSERT INTO keyword_rules (keyword, category_name, match_field, priority) VALUES (?, ?, ?, ?)",
                (rule.keyword.lower(), rule.category_name, rule.match_field, rule.priority),
            )
            return KeywordRule(id=cur.lastrowid, keyword=rule.keyword.lower(),
                               category_name=rule.category_name, match_field=rule.match_field,
                               priority=rule.priority)


def delete_keyword_rule(rule_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM keyword_rules WHERE id = ?", (rule_id,))


_DEFAULT_RULES: list[tuple[str, str, str, int]] = [
    # Food
    ("ristorante",  "Food", "description", 0),
    ("osteria",     "Food", "description", 0),
    ("trattoria",   "Food", "description", 0),
    ("pizzeria",    "Food", "description", 0),
    ("braceria",    "Food", "description", 0),
    ("rifugio",     "Food", "description", 0),
    ("grill",       "Food", "description", 0),
    ("kfc",         "Food", "description", 0),
    ("mcdonald",    "Food", "description", 0),
    ("burger",      "Food", "description", 0),
    ("buonissimo",  "Food", "description", 0),
    # Groceries
    ("mercadona",   "Groceries", "description", 0),
    ("lidl",        "Groceries", "description", 0),
    ("esselunga",   "Groceries", "description", 0),
    ("carrefour",   "Groceries", "description", 0),
    ("conad",       "Groceries", "description", 0),
    ("eurospin",    "Groceries", "description", 0),
    ("aldi",        "Groceries", "description", 0),
    ("mercasosa",   "Groceries", "description", 0),
    # Transport
    ("repsol",      "Transport", "description", 0),
    ("agip",        "Transport", "description", 0),
    # Sport
    ("decathlon",   "Sport", "description", 0),
    ("playtomic",   "Sport", "description", 0),
    ("palestra",    "Sport", "description", 0),
    ("piscina",     "Sport", "description", 0),
    ("rightfeeling","Sport", "description", 0),
    ("federcons",   "Sport", "description", 0),
    ("ski stop",    "Sport", "description", 0),
    # Travel
    ("hotel",       "Travel", "description", 0),
    ("booking",     "Travel", "description", 0),
    ("airbnb",      "Travel", "description", 0),
    ("trenitalia",  "Travel", "description", 0),
    ("ryanair",     "Travel", "description", 0),
    ("easyjet",     "Travel", "description", 0),
    ("funivia",     "Sport", "description", 0),
    ("funivie",     "Sport", "description", 0),
    # Entertainment
    ("netflix",     "Entertainment", "description", 0),
    ("spotify",     "Entertainment", "description", 0),
    ("prime video", "Entertainment", "description", 0),
    ("disney",      "Entertainment", "description", 0),
    ("starplex",    "Entertainment", "description", 0),
    ("cinema",      "Entertainment", "description", 0),
    # Health
    ("farmacia",    "Health", "description", 0),
    ("clinicsport", "Health", "description", 0),
    # Bills
    ("enel",        "Bills", "description", 0),
    ("vodafone",    "Bills", "description", 0),
    ("fastweb",     "Bills", "description", 0),
    ("addebito american express", "Bills", "description", 0),
    ("wind tre",    "Bills", "description", 0),
    ("iliad",       "Bills", "description", 0),
    # Shopping
    ("amazon",      "Shopping", "description", 0),
    ("zara",        "Shopping", "description", 0),
    # Transfers between own accounts (not real income/spend)
    ("deposits/withdrawals", "Transfer", "reference", 0),
]


def seed_keyword_rules_defaults() -> tuple[int, int]:
    """Insert default keyword rules, skipping keywords that already exist."""
    inserted = skipped = 0
    with get_connection() as conn:
        existing = {row[0].lower() for row in conn.execute("SELECT keyword FROM keyword_rules").fetchall()}
        for keyword, category_name, match_field, priority in _DEFAULT_RULES:
            if keyword.lower() in existing:
                skipped += 1
            else:
                conn.execute(
                    "INSERT INTO keyword_rules (keyword, category_name, match_field, priority) VALUES (?, ?, ?, ?)",
                    (keyword, category_name, match_field, priority),
                )
                inserted += 1
    return inserted, skipped


# ── Analytics helpers (used by Predictions / Goal Calculator) ──────────────────

def get_transfer_category_names() -> set[str]:
    """Returns names of all categories marked as income or transfer (excluded from spend)."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT name FROM categories WHERE is_income = 1 OR is_transfer = 1"
        ).fetchall()
    return {r["name"] for r in rows}


def get_transaction_monthly_spend(months: int = 6) -> float:
    import pandas as pd
    excluded = get_transfer_category_names()
    placeholders = ",".join("?" * len(excluded)) if excluded else "''"
    with get_connection() as conn:
        df = pd.read_sql_query(
            f"""SELECT date, amount FROM transactions
                WHERE {"category NOT IN (" + placeholders + ") AND " if excluded else ""}amount < 0
                ORDER BY date DESC""",
            conn, params=list(excluded) if excluded else [],
        )
    if df.empty:
        return 0.0
    df["date"] = pd.to_datetime(df["date"])
    df["month"] = df["date"].dt.to_period("M").astype(str)
    monthly = df.groupby("month")["amount"].sum().abs()
    return float(monthly.iloc[-months:].mean()) if len(monthly) >= 1 else 0.0


def get_transaction_avg_income() -> tuple[float, float]:
    import pandas as pd
    with get_connection() as conn:
        income_cats = conn.execute(
            "SELECT name FROM categories WHERE is_income = 1"
        ).fetchall()
    if not income_cats:
        return 0.0, 0.0
    names = [r["name"] for r in income_cats]
    placeholders = ",".join("?" * len(names))
    with get_connection() as conn:
        df = pd.read_sql_query(
            f"SELECT date, amount FROM transactions WHERE category IN ({placeholders}) AND amount > 0",
            conn, params=names,
        )
    if df.empty:
        return 0.0, 0.0
    df["date"] = pd.to_datetime(df["date"])
    df["month"] = df["date"].dt.to_period("M").astype(str)
    monthly = df.groupby("month")["amount"].sum()
    return float(monthly.mean()), float(monthly.median())
