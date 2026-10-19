.PHONY: dev mcp install-hooks

dev:
	.venv/bin/uvicorn backend.main:app --reload --reload-dir backend & cd frontend && npm install && npm run dev

mcp:
	.venv/bin/python -m backend.mcp_server

install-hooks:
	git config core.hooksPath .githooks
	@echo "Pre-commit secret scanning enabled. Install the scanner with: brew install gitleaks"
