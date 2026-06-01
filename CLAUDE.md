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

# Docker
docker build -t money-manager .
docker run -p 8000:8000 -v $(pwd)/finances.db:/app/finances.db money-manager
```

## Running tests

```bash
# Backend (pytest) — run from repo root
source .venv/bin/activate
pytest backend/tests/ -v

# Frontend (vitest)
cd frontend && npm test
```

## Architecture

**Backend**: FastAPI app at `backend/main.py`. SQLite via `backend/database.py`. DB path defaults to `finances.db`, overridable via `DB_PATH` env var.

**Frontend**: React 19 + TypeScript + Vite at `frontend/`. API client at `frontend/src/api/client.ts`. Pages in `frontend/src/pages/`. Shared UI components in `frontend/src/components/` (including `LoadingSpinner` and `Alert`).

**Single-process deployment**: `npm run build` outputs to `backend/static/dist/`; FastAPI serves it as static files. One Docker container.

## Key tables

- `accounts` — name, currency, account_type (free-form), active flag
- `balances` — (account_id, date) unique; amount_native + amount_base (in base currency)
- `transactions` — date, description, amount, category, account_id
- `categories` — name, color, is_income, is_transfer
- `keyword_rules` — keyword → category mapping with priority and match_field
- `fx_rates` — currency → rate_to_base (how many base-currency units per 1 foreign unit)
- `app_settings` — key/value store (base_currency defaults to EUR, llm_model, llm_api_key)

## Adapters

Drop a `.py` file in `backend/adapters/` implementing `BaseAdapter` (see `backend/adapters/base.py`). It auto-discovers on startup and appears in the Import UI. Each adapter declares `NAME`, `FILE_TYPES`, and `IMPORTS` (typed as `Literal["transactions", "balances"]`).

## AI Chat

Configured via app settings (`llm_model`, `llm_api_key`). Uses LiteLLM so any provider works (e.g. `gemini/gemini-2.0-flash`, `gpt-4o`, `claude-3-5-sonnet-20241022`). The chat endpoint is stateless — client sends full message history each request. The API key is read server-side from `app_settings`; it is never sent by the frontend.

## Key constraints

- `upsert_balances` / transaction import use `INSERT OR IGNORE ON CONFLICT` — re-importing is safe (idempotent)
- Do NOT add daily forward-fill/resampling to balance data — it causes stepped lines in charts
- Non-base-currency accounts store both native amount and base-currency equivalent; FX rates are manually maintained in `fx_rates`
- FX rates must be `> 0` — the API enforces this with a Pydantic validator
- `withdrawal_rate_pct` in the FIRE calculator must be `> 0` — validated at the API layer
