# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Running the app

```bash
# Start both backend and frontend with one command
make dev
```

This runs:
- **Backend** (FastAPI on :8000): `.venv/bin/uvicorn backend.main:app --reload --reload-dir backend`
- **Frontend** (Vite on :5173): `cd frontend && npm install && npm run dev`

```bash
# Or run separately:

# Backend
source .venv/bin/activate
# --reload-dir backend limits the file watcher to backend/ only (~20 files vs 9500+ in the full project)
uvicorn backend.main:app --reload --reload-dir backend

# Frontend — npm install is safe to re-run; skips if already up to date
cd frontend && npm install && npm run dev

# Production build (outputs to backend/static/dist/, served by FastAPI)
cd frontend && npm run build

# Docker — mount the .key file too: secret settings are encrypted at rest and
# unreadable without it (auto-created next to the DB on first run)
docker build -t money-manager .
docker run -p 8000:8000 -v $(pwd)/finances.db:/app/finances.db -v $(pwd)/finances.db.key:/app/finances.db.key money-manager
```

## Running tests

```bash
# Backend (pytest) — run from repo root
source .venv/bin/activate
pytest backend/tests/ -v

# Single backend test file / test
pytest backend/tests/test_write_tools.py -v
pytest backend/tests/test_write_tools.py::test_create_category -v

# Frontend (vitest)
cd frontend && npm test

# Frontend lint / typecheck
cd frontend && npm run lint
cd frontend && npx tsc -b
```

## Architecture

**Backend**: FastAPI app at `backend/main.py`. SQLite via `backend/database.py`. DB path defaults to `finances.db`, overridable via `DB_PATH` env var. Routers live in `backend/routers/` (one per resource: `accounts`, `balances`, `transactions`, `categories`, `budgets`, `import_`, `sync`, `bbva`, `binance`, `ib`, `revolut`, `settings`, `chat`, `assistant`, `analytics`).

**Frontend**: React 19 + TypeScript + Vite at `frontend/`. API client at `frontend/src/api/client.ts`. Pages in `frontend/src/pages/`. Shared UI components in `frontend/src/components/` (including `LoadingSpinner` and `Alert`). Theme (light/dark) is driven by `frontend/src/theme.ts` + `useTheme.ts`/`ThemeContext.tsx`, not raw CSS media queries.

**Single-process deployment**: `npm run build` outputs to `backend/static/dist/`; FastAPI serves it as static files. One Docker container.

**Finance domain logic is shared, not duplicated per-surface**: `backend/finance_tools.py` (read-only queries: net worth, spending, cash flow, schema, `run_sql`) and `backend/write_tools.py` (guarded mutations: categories, keyword rules, budgets, recategorisation) are the single implementation of "things an assistant can do to your finances." Both the in-app AI chat (`backend/routers/chat.py`) and the standalone MCP server (`backend/mcp_server.py`) wrap these same modules rather than reimplementing logic — when adding a new finance operation for the assistant, add it once in `finance_tools.py`/`write_tools.py` and expose it from both callers. `backend/assistant_tools.py` backs the proactive insights shown in `routers/assistant.py` (surfaced in `FinancialHelper.tsx`), separate from the chat/MCP tool-calling path.

## Key tables

- `accounts` — name, currency, account_type (free-form), active flag
- `balances` — (account_id, date) unique; amount_native + amount_base (in base currency)
- `transactions` — date, description, amount, category, account_id
- `categories` — name, color, is_income, is_transfer
- `keyword_rules` — keyword → category mapping with priority and match_field
- `fx_rates` — currency → rate_to_base (how many base-currency units per 1 foreign unit)
- `app_settings` — key/value store (base_currency defaults to EUR, llm_model, llm_api_key)
- `sync_log` — auto-sync history + cache; the scheduler (`backend/scheduler.py`) syncs each configured integration on startup and every `auto_sync_interval_hours`, skipping any with a success newer than the interval
- `budgets` — per-category monthly spending caps (expense categories only, linked by name); optional rollover carry is derived on read from `start_month`, never stored

## Adapters

Drop a `.py` file in `backend/adapters/` implementing `BaseAdapter` (see `backend/adapters/base.py`). It auto-discovers on startup and appears in the Import UI. Each adapter declares `NAME`, `FILE_TYPES`, and `IMPORTS` (typed as `Literal["transactions", "balances"]`). Built-in adapters: `bbva.py`, `binance.py`, `interactive_brokers.py`, `snapshot_csv.py`.

## AI Chat

Configured via app settings (`llm_model`, `llm_api_key`). Uses LiteLLM so any provider works (e.g. `gemini/gemini-2.0-flash`, `gpt-4o`, `claude-3-5-sonnet-20241022`). The chat endpoint is stateless — client sends full message history each request. The API key is read server-side from `app_settings`; it is never sent by the frontend. Tool calling in `chat.py` dispatches to the `finance_tools`/`write_tools` functions described above, plus a guarded `run_sql` tool (single `SELECT`/`WITH` only, blocks `app_settings`, read-only SQLite connection, 200-row cap).

## MCP server

`backend/mcp_server.py` exposes the same finance/write tools over MCP (stdio) for external AI assistants, independent of the in-app chat. Run with `make mcp` or `python -m backend.mcp_server`; point an MCP client at that stdio command with `DB_PATH` set if the DB isn't in the cwd. The main app should create/migrate the database first — the MCP process only opens it.

## Key constraints

- `upsert_balances` / transaction import use `INSERT OR IGNORE ON CONFLICT` — re-importing is safe (idempotent)
- Do NOT add daily forward-fill/resampling to balance data — it causes stepped lines in charts
- Non-base-currency accounts store both native amount and base-currency equivalent; FX rates are manually maintained in `fx_rates`
- FX rates must be `> 0` — the API enforces this with a Pydantic validator
- `withdrawal_rate_pct` in the FIRE calculator must be `> 0` — validated at the API layer
- Credential settings (`db.SECRET_SETTINGS`: EB private key, Binance secret, IB token, LLM key) are encrypted at rest (Fernet key in `finances.db.key`, 0600) and masked as `__secret__` by `GET /api/settings` — they are write-only from the browser. When adding a new credential setting, add it to `SECRET_SETTINGS` and follow the write-only pattern in Connections.tsx
