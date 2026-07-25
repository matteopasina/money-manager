.PHONY: dev mcp

dev:
	.venv/bin/uvicorn backend.main:app --reload --reload-dir backend & cd frontend && npm install && npm run dev

mcp:
	.venv/bin/python -m backend.mcp_server
