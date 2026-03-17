# Money Manager

A self-hosted personal finance tracker for people with multiple accounts and currencies. Track net worth over time, analyse spending, forecast growth, and plan for financial independence — all from a single container.

![Dashboard](frontend/src/assets/hero.png)

## Features

- **Dashboard** — net worth snapshot, account allocation, recent transactions
- **Transactions** — searchable table with inline category assignment and keyword-based auto-categorisation
- **Predictions** — linear regression forecast + Modified Dietz portfolio return per account type
- **FIRE calculator** — interactive sliders for target, return, contributions, and safe withdrawal rate
- **Multi-currency** — native + base-currency amounts, manually maintained FX rates
- **Import** — extensible adapter system (BBVA Excel, snapshot CSV; add your own)
- **AI chat** — ask questions about your finances; works with any LiteLLM-compatible provider (Claude, GPT-4, Gemini…)

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI, SQLite, Pandas, LiteLLM |
| Frontend | React 19, TypeScript, Vite, Plotly.js, AG Grid |
| Deployment | Single Docker container (Node 22 build → Python 3.13 runtime) |

## Quick start

### Docker (recommended)

```bash
docker build -t money-manager .
docker run -p 8000:8000 -v $(pwd)/finances.db:/app/finances.db money-manager
```

Open [http://localhost:8000](http://localhost:8000).

### Development

```bash
# Backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload --reload-dir backend

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

Frontend dev server runs on port 5173 and proxies `/api` to port 8000.

## Configuration

All settings are stored in the app (Settings → General). Nothing needs to be configured before first run.

| Setting | Default | Description |
|---|---|---|
| `base_currency` | `EUR` | Currency used for net worth totals |
| `llm_model` | — | Model string for AI chat (e.g. `gpt-4o`, `claude-3-5-sonnet-20241022`, `gemini/gemini-2.0-flash`) |
| `llm_api_key` | — | API key for your LLM provider (stored server-side, never sent to the browser) |

One environment variable is available:

```bash
DB_PATH=/data/finances.db  # default: finances.db in the working directory
```

## Importing data

Go to **Import**, choose an adapter, select your file, pick the target account, and upload. Re-importing the same file is safe — duplicates are silently ignored.

### Built-in adapters

| Adapter | File types | Imports |
|---|---|---|
| BBVA (Spain) | `.xlsx`, `.xls` | Transactions |
| Wide-format Snapshot CSV | `.csv` | Balance snapshots |

### Adding your own

Drop a `.py` file in `backend/adapters/` that subclasses `BaseAdapter` (see [`backend/adapters/base.py`](backend/adapters/base.py)). It is auto-discovered on startup with no other changes required.

```python
class MyBankAdapter(BaseAdapter):
    NAME = "My Bank"
    FILE_TYPES = ["csv"]
    IMPORTS: Literal["transactions"] = "transactions"

    def parse(self, filepath, account_id, account_currency, base_currency, get_rate):
        ...  # return List[Transaction]
```

## Auto-categorisation

Define keyword rules in **Categories → Keyword Rules**. Each rule maps a substring to a category, with a configurable match field (`description`, `reference`, or `any`) and priority. Use **Re-apply to all transactions** to retroactively categorise existing data.

## Running tests

```bash
# Backend
source .venv/bin/activate && pytest backend/tests/ -v

# Frontend
cd frontend && npm test
```

## License

MIT
