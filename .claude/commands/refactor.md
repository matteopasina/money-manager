Refactor the codebase (or the specified area: $ARGUMENTS) for improved quality, maintainability, and consistency.

## Process

1. **Audit** — Launch parallel Explore subagents to analyse the target area:
   - Backend agent: scan `backend/` for SRP violations (functions doing too much), raw SQL outside `database.py`, missing abstractions, dead code, duplicate logic, long parameter lists
   - Frontend agent: scan `frontend/src/` for duplicate JSX/component patterns, components with too many responsibilities, prop drilling that should be context/composition, unused state, missing memoisation
   - Each agent reports findings with file paths and line numbers

2. **Plan** — Present a numbered list of proposed refactors, each with:
   - What changes and why (which principle it violates: SRP, DRY, OCP, DIP, etc.)
   - Risk level: **safe** (pure rename/extract) vs **behaviour-affecting** (restructure)
   - Files touched
   Ask the user to approve, reject, or adjust each item before proceeding.

3. **Execute** — Apply approved refactors one at a time. After each:
   - Confirm no import errors or type errors
   - Run `cd frontend && npm run lint` after frontend changes
   - Commit only when the user asks

4. **Verify** — When all refactors are done:
   - Backend: `source .venv/bin/activate && uvicorn backend.main:app --reload --reload-dir backend` — no startup errors
   - Frontend: `cd frontend && npm run build` — clean build, zero lint errors
   - Summarise what changed and what was intentionally left untouched

## Rules
- Do NOT change observable behaviour — same inputs → same outputs.
- Do NOT add features, new dependencies, or config options.
- Do NOT add docstrings, comments, or type annotations to code you didn't otherwise touch.
- Prefer small reviewable diffs over sweeping rewrites.
- If a refactor is risky or ambiguous, ask before doing it.
