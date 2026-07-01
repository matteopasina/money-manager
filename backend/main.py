import sys
from pathlib import Path

# Ensure backend/ is on the Python path when run from project root
sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import database as db
from routers import accounts, balances, transactions, categories, import_, settings, analytics, chat, ib, binance, bbva

app = FastAPI(title="Money Manager API")

# Allow Vite dev server to talk to this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all routers
app.include_router(accounts.router)
app.include_router(balances.router)
app.include_router(transactions.router)
app.include_router(categories.router)
app.include_router(import_.router)
app.include_router(settings.router)
app.include_router(analytics.router)
app.include_router(chat.router)
app.include_router(ib.router)
app.include_router(binance.router)
app.include_router(bbva.router)

# Initialise DB on startup
@app.on_event("startup")
def startup():
    db.init_db()


# Serve React SPA in production (after `npm run build`)
_STATIC = Path(__file__).parent / "static" / "dist"
if _STATIC.exists():
    app.mount("/assets", StaticFiles(directory=str(_STATIC / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        index = _STATIC / "index.html"
        return FileResponse(str(index))
