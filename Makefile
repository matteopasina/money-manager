.PHONY: dev

dev:
	.venv/bin/uvicorn backend.main:app --reload --reload-dir backend & cd frontend && npm install && npm run dev
