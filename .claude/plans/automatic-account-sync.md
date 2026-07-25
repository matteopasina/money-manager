# Plan: Automatic Account Sync (no more manual "Add Balance")

## Context

The app already has three **live-sync integrations** that pull real data on demand
via "Sync" buttons in Settings:

| Integration | Router | Settings keys | Sync calls |
|---|---|---|---|
| Interactive Brokers | `backend/routers/ib.py` | `ib_token`, `ib_transactions_query_id`, `ib_nav_query_id`, `ib_account_id` | `sync_transactions(account_id)`, `sync_nav(account_id)` |
| Binance | `backend/routers/binance.py` | `binance_api_key`, `binance_api_secret`, `binance_account_id` | `sync_transactions(account_id)`, `sync_portfolio(account_id)` |
| BBVA (Saltedge) | `backend/routers/bbva.py` | `bbva_se_app_id`, `bbva_se_secret`, `bbva_se_customer_id`, `bbva_se_connection_id`, `bbva_se_account_id`, `bbva_account_id` | `sync_transactions(account_id)`, `sync_balances(account_id)` |

Today the user has to open Settings and click each "Sync" button by hand. The
goal is to make this automatic: once credentials are configured, the app pulls
fresh balances/transactions for every connected account on its own, on a
schedule, with **zero manual steps** going forward.

**Not in scope:** Crypto.com has no public API (CSV export only — see
`backend/adapters/cryptocom.py` if it exists, or the IBGuide entry) so it stays
a manual import. This plan only automates the three API-backed integrations.

**Important deployment caveat to flag to the user:** this is a single-process
app (`uvicorn` in one container, per `Dockerfile`/`Makefile`). An in-process
scheduler only fires while that process is running. If the user runs `make dev`
occasionally on their laptop, "automatic" sync only happens during those
sessions — it will NOT fire while the laptop is asleep or the container is
stopped. To get genuine 24/7 "I never think about it again" automation, the
Docker container needs to run on something always-on (a home server, a small
VPS, Fly.io/Railway, etc.). This plan implements the in-app scheduling
correctly regardless, but true hands-off automation also depends on where it's
hosted — call this out to the user, don't silently assume it.

To soften that gap, the plan adds a **startup catch-up check**: every time the
app boots, it checks whether any integration is overdue for a sync (based on
last-run time + configured frequency) and runs it immediately in the
background. Combined with the recurring in-process schedule, this means even
"start it up once a week" usage still gets fresh data automatically.

**Idempotency is already solved.** `insert_transactions` uses
`INSERT OR IGNORE` on `UNIQUE(account_id, date, description, amount)` and
`upsert_balances` uses `ON CONFLICT(account_id, date) DO UPDATE`. Re-running
syncs as often as we like is always safe — no dedup logic needs to be built.

**Known limitation to surface, not solve:** Saltedge/BBVA bank consents expire
under PSD2 (commonly ~90 days) and require the user to re-click "Connect" and
re-authenticate in their browser. Automatic sync will start silently failing
for BBVA once that happens. The plan handles this by recording failures and
showing a clear "needs reconnect" status in Settings rather than failing
silently — but the re-auth step itself can't be automated away (it's a bank
security requirement, not an app limitation).

## Architecture

- **`backend/scheduler.py`** (new) — `APScheduler` `BackgroundScheduler`
  (thread-based, so blocking network I/O in the sync calls doesn't block
  FastAPI's asyncio event loop). Exposes `run_all_syncs(force=False)` which,
  for each of the three integrations:
  1. Checks whether credentials + a destination account are configured
     (skip with a "not configured" status if not).
  2. Checks whether it's actually due — `now - last_run_at >= frequency`
     (skipped unless `force=True`, which `POST /api/sync/run-now` uses).
  3. Calls the existing router functions **directly as plain Python
     functions** (FastAPI's `@router.post(...)` decorator registers the route
     but returns the original function unchanged, so e.g.
     `ib.sync_transactions(account_id=5)` is a completely normal call —
     no HTTP round-trip needed).
  4. Wraps each integration in `try/except` so one failure (e.g. expired BBVA
     consent) never blocks the other two, and records the outcome via
     `db.record_sync(...)`.
  - A `threading.Lock` guards `run_all_syncs` so a manual "Sync now" click
    can't overlap with the scheduled run and hit SQLite write contention.
  - `init_scheduler()` is called from FastAPI's startup event: starts the
    `BackgroundScheduler` with one `CronTrigger` (default: daily at 06:00
    server time) calling `run_all_syncs()`, and schedules one immediate
    one-off `run_all_syncs()` a few seconds after boot for the startup
    catch-up behavior described above.
  - `shutdown_scheduler()` called from FastAPI's shutdown event
    (`scheduler.shutdown(wait=False)`).

- **`backend/routers/sync.py`** (new) — two endpoints:
  - `GET /api/sync/status` — returns global enabled/frequency settings plus
    per-integration `{name, configured, last_run_at, last_status, last_message}`.
  - `POST /api/sync/run-now` — calls `run_all_syncs(force=True)` synchronously
    (FastAPI runs sync `def` handlers in its threadpool, so this doesn't block
    the event loop) and returns the refreshed status payload.

## Files to create

### `backend/scheduler.py`
- `_DUE(frequency: str) -> timedelta` — maps `"daily"→1d`, `"weekly"→7d`,
  `"monthly"→30d`.
- `_should_run(integration: str, frequency: str, force: bool) -> bool` — reads
  `db.get_last_sync(integration)`, compares `ran_at` against `_DUE(frequency)`.
- `_run_ib(account_id)`, `_run_binance(account_id)`, `_run_bbva(account_id)` —
  each calls the two relevant router functions, builds a combined message
  string (e.g. `"Transactions: 3 inserted, 0 skipped. NAV: 1 inserted."`),
  and returns it (or raises, caught by the caller).
- `run_all_syncs(force: bool = False) -> dict` — the orchestrator described
  above; returns the same shape `GET /api/sync/status` returns, so
  `POST /api/sync/run-now` can reuse it directly.
- `init_scheduler()` / `shutdown_scheduler()` — lifecycle hooks.
- Module-level `logging.getLogger(__name__)`, matching the existing pattern in
  `binance.py`/`bbva.py`.

### `backend/routers/sync.py`
- `router = APIRouter(prefix="/api/sync", tags=["sync"])`
- `GET /status` — assembles status from `db.get_setting("auto_sync_enabled", ...)`,
  `db.get_setting("auto_sync_frequency", "daily")`, and `db.get_last_sync(...)`
  per integration (Interactive Brokers / Binance / BBVA), including whether
  each is `configured` (same "are the settings non-empty" check used in each
  router's own `_make_client`/`_creds`/`_headers` helper).
- `POST /run-now` — calls `scheduler.run_all_syncs(force=True)`.
- `PUT /settings` — body `{enabled: bool, frequency: "daily"|"weekly"|"monthly"}`,
  writes `auto_sync_enabled` / `auto_sync_frequency` via `db.set_setting`.
  (The scheduler's cron tick always fires daily regardless — `enabled` and
  `frequency` are read inside `run_all_syncs` to decide whether to actually do
  anything, so toggling this setting takes effect on the very next tick with
  no need to reschedule the APScheduler job itself.)

## Files to modify

### `backend/database.py`
- Add to `init_db()`'s `executescript`:
  ```sql
  CREATE TABLE IF NOT EXISTS sync_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      integration TEXT    NOT NULL,
      account_id  INTEGER,
      status      TEXT    NOT NULL,   -- 'success' | 'error' | 'skipped'
      message     TEXT,
      ran_at      TEXT    NOT NULL
  );
  ```
- Add `DEFAULT_SETTINGS["auto_sync_enabled"] = "true"` and
  `DEFAULT_SETTINGS["auto_sync_frequency"] = "daily"`.
- New functions:
  - `record_sync(integration: str, account_id: int | None, status: str, message: str) -> None`
    — inserts a row with `ran_at = datetime.now(timezone.utc).isoformat()`.
  - `get_last_sync(integration: str) -> sqlite3.Row | None` — most recent row
    for that integration (`ORDER BY ran_at DESC LIMIT 1`).
  - `get_sync_history(limit: int = 20) -> list[sqlite3.Row]` — recent rows
    across all integrations, for a small audit list in Settings if useful.

### `backend/main.py`
- Import `sync` router and `scheduler` module.
- `app.include_router(sync.router)`.
- In the existing `@app.on_event("startup")` handler, after `db.init_db()`,
  call `scheduler.init_scheduler()`.
- Add `@app.on_event("shutdown")` calling `scheduler.shutdown_scheduler()`.

### `requirements.txt`
- Add `APScheduler==3.10.4`.

### `frontend/src/api/client.ts`
- New `sync` section:
  ```typescript
  sync: {
    status: () => request<SyncStatus>('/sync/status'),
    runNow: () => request<SyncStatus>('/sync/run-now', { method: 'POST' }),
    updateSettings: (enabled: boolean, frequency: string) =>
      request<void>('/sync/settings', { method: 'PUT', body: JSON.stringify({ enabled, frequency }) }),
  },
  ```
  plus a `SyncStatus` / `SyncIntegrationStatus` type export.

### `frontend/src/pages/Settings.tsx`
- New **"Automatic Sync"** card, placed above the per-integration cards
  (IB / Binance / BBVA) since it's the umbrella control for all of them:
  - Enabled toggle + frequency `<select>` (Daily / Weekly / Monthly), saved
    via `api.sync.updateSettings`.
  - "Sync now" button calling `api.sync.runNow()`, disabled while in flight,
    showing a spinner/result message (reuses the existing `msg` state pattern
    already used throughout this file).
  - A small status list, one row per integration: name, a colored dot
    (green = success, red = error, grey = not configured), relative
    last-synced time (e.g. "2 hours ago"), and the last message — so an
    expired BBVA consent surfaces clearly instead of silently going stale.
  - Loaded via `useEffect` calling `api.sync.status()` on mount (and after
    "Sync now" completes).

## Task checklist

- [ ] `backend/database.py`: add `sync_log` table to `init_db()`, add
      `auto_sync_enabled`/`auto_sync_frequency` to `DEFAULT_SETTINGS`, add
      `record_sync`, `get_last_sync`, `get_sync_history`
- [ ] `requirements.txt`: add `APScheduler==3.10.4`, `pip install` it locally
- [ ] `backend/scheduler.py`: implement `_should_run`, `_run_ib`,
      `_run_binance`, `_run_bbva`, `run_all_syncs`, `init_scheduler`,
      `shutdown_scheduler`, with the overlap-guarding `threading.Lock`
- [ ] `backend/routers/sync.py`: implement `GET /status`, `POST /run-now`,
      `PUT /settings`
- [ ] `backend/main.py`: register `sync.router`, call `scheduler.init_scheduler()`
      on startup and `scheduler.shutdown_scheduler()` on shutdown
- [ ] `frontend/src/api/client.ts`: add `sync` client section + types
- [ ] `frontend/src/pages/Settings.tsx`: add the "Automatic Sync" card
      (toggle, frequency select, sync-now button, per-integration status list)
- [ ] Manual end-to-end test (see Verification)
- [ ] `pytest backend/tests/` still green; add a focused test for
      `_should_run`'s due-date math and for `run_all_syncs` skipping
      unconfigured integrations (mock `db.get_setting` / the three `_run_*`
      functions so the test doesn't hit real APIs)

## Verification

1. `pip install -r requirements.txt` (picks up APScheduler), `make dev`.
2. Confirm at least one integration (e.g. Binance, since it needs no bank
   consent) is configured in Settings as today.
3. Hit `GET /api/sync/status` — confirm it lists all three integrations, with
   Binance `configured: true` and the others `configured: false` if unset.
4. Click **"Sync now"** in the new card — confirm it calls
   `POST /api/sync/run-now`, the Binance row updates to
   `last_status: "success"` with a real `last_run_at`, and a balance/transaction
   actually lands in the DB (check Dashboard or Manage Balances).
5. Restart the backend process (simulating the "app wasn't running" gap) and
   confirm the **startup catch-up** fires within a few seconds — check
   `sync_log` for a fresh row without clicking anything.
6. Temporarily break a credential (e.g. blank out `binance_api_secret`) and
   re-run — confirm `run_all_syncs` records an `error` status with a useful
   message instead of crashing, and the other integrations still run.
7. `pytest backend/tests/ -v` passes, including the new scheduler test(s).
