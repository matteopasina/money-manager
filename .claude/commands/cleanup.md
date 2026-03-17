Remove dead code, unused variables, and other clutter from the codebase (or the specified area: $ARGUMENTS).

## What this covers

- **Unused imports** — Python (`import X` never referenced) and TypeScript (`import { X }` not used)
- **Unused variables / state** — Python locals never read; React `useState` values set but never consumed
- **Dead code** — unreachable branches, functions never called, commented-out blocks left over from old features
- **Redundant type casts** — `as never`, `as any`, `as object` where proper types exist
- **Stale comments** — `# TODO: fix this` that's been there forever, comments describing deleted logic
- **Empty files / empty `__init__.py`** with no content worth keeping

## Process

1. **Scan** — Launch parallel Explore subagents:
   - Backend agent: scan `backend/` for unused imports (`import X` never referenced), dead functions, unreachable branches, commented-out blocks, stale TODO/FIXME comments
   - Frontend agent: scan `frontend/src/` for unused imports (ESLint `no-unused-vars`/`@typescript-eslint/no-unused-vars`), unused state variables (`useState` set but never read), dead component props, `as never`/`as any` casts, commented-out JSX
   - Each agent reports findings with **file path + line number**

2. **Present** — Show a grouped list of findings:
   ```
   backend/routers/chat.py:14   — unused import: `from typing import List`
   frontend/src/pages/Accounts.tsx:9  — unused state: `setFxRates` set but never read
   ...
   ```
   Ask the user: "Remove all of these? Or select which ones to skip."

3. **Execute** — Remove approved items one file at a time. After each file:
   - Backend: verify no `NameError` / `ImportError` by checking dependent imports
   - Frontend: run `cd frontend && npm run lint` — must stay at zero errors

4. **Verify** — When all removals are done:
   - `cd frontend && npm run build` — clean build
   - `source .venv/bin/activate && python -c "import backend.main"` — backend imports cleanly
   - Report how many items were removed

## Rules
- Do NOT change behaviour — only delete things that are provably unused
- Do NOT remove a symbol just because it looks unused — check all call sites first (grep for it)
- Do NOT remove `__init__.py` files that make a directory a Python package
- If unsure whether something is truly dead, leave it and flag it for the user
- Prefer deleting whole lines over replacing with `pass` or empty blocks
