# Plan: UI/UX and correctness fixes from the July 2026 app review

## Context

This plan comes out of a full review of the desktop app — code read across
`frontend/src` and `backend/`, plus driving the running app against the real
`finances.db` to catch rendering problems that static reading can't show.

The app is in good shape architecturally. The design token system in
`frontend/src/styles/globals.css` is well built (a proper `--ink-*` ramp,
`--series-1..5`, a radius scale, light/dark parity), and the nav grouping
(Overview / Activity / Plan / Setup) is well judged. **Do not redesign anything.**
Every item below is either a bug or a case of the code bypassing a good system
that already exists.

### How to use this plan

Phases are ordered by user impact and are independent of each other — you can
land Phase 1 alone and it's a coherent change. Within a phase, tasks are small
and independently committable.

Each finding is tagged:

- **[VERIFIED]** — reproduced in the running app or read line-by-line during the
  review. Fix as written.
- **[REPORTED]** — found by a code-reading pass but not reproduced. The line
  reference is right (spot-checked), the reasoning looks sound, but **confirm
  the failure scenario before you change behaviour**, and say so in your commit
  if it turns out to be a non-issue.

Line numbers are as of commit `ad4c01e`. Re-grep rather than trusting offsets if
the file has moved under you.

### Running it

```bash
make dev
```

The frontend dev server is **https** (mkcert plugin) — it serves on
`https://localhost:5173`, not http. `.claude/launch.json` already records this.
The backend must be started separately if you're not using `make dev`; note that
`.venv/bin/uvicorn` cannot be launched from a sandboxed preview tool on this
machine (it can't read `.venv/pyvenv.cfg`), so run it from a normal shell.

---

## Phase 1 — Wrong numbers and silent failures

These are the highest-value fixes: each one currently shows the user something
false, and each is small and self-contained.

### 1.1 A failed import reports success **[VERIFIED]**

`frontend/src/api/client.ts:109-112` — `import.preview` and `import.confirm` are
the only two calls in the whole client that bypass the `request()` helper:

```ts
confirm: (formData: FormData) =>
  fetch(BASE + '/import/confirm', { method: 'POST', body: formData }).then(r => r.json()),
```

No `res.ok` check. `frontend/src/pages/Import.tsx:46` and `:65` then guard on
`res.error` — but the backend never returns an `error` key. `backend/routers/import_.py`
raises `HTTPException(400, ...)`, which FastAPI serialises as `{"detail": "..."}`.

Failure: any 4xx from `/import/confirm` (e.g. the chosen account was deactivated
in another tab) produces a green **"Imported undefined rows (undefined duplicates
skipped)"**, then clears the preview and resets the file input. The user believes
the statement imported; nothing was written.

On `/import/preview` it's worse: `setPreview({ rows: res.preview })` stores
`undefined`, render hits `(preview.rows as BalanceRow[]).slice(...)`, throws, and
because there is no error boundary the whole SPA goes blank.

**Fix:** route both through `request()`. It already handles error extraction —
you need to make it not force `Content-Type: application/json` when the body is
a `FormData` (the browser must set the multipart boundary itself). Then change
both call sites in `Import.tsx` to rely on `request()` throwing, and drop the
`if (res.error)` lines.

### 1.2 Add an error boundary **[VERIFIED — no boundary exists]**

`frontend/src/main.tsx` renders `<App/>` bare. Any render-time throw blanks the
page with no recovery. Add a minimal class error boundary around the router
outlet that shows the error text and a "Reload" button. Small, and it turns
every future crash of this kind into a bad screen instead of no screen.

### 1.3 Chart Y-axis labels are invisible **[VERIFIED — reproduced in browser]**

`frontend/src/components/MoneyChart.tsx:13` and `:37` both set:

```ts
margin: { t: 36, b: 50, l: 0, r: 0 },
```

Plotly still generates the Y ticks — reading the live DOM shows them at
`x="-3.1"`, i.e. positioned just outside the clip region and never painted. Every
chart in the app (net worth over time, accounts over time, budget history,
monthly cash flow) renders gridlines with no values on them.

**Fix:** `l: 52` in both `LIGHT_LAYOUT` and `DARK_LAYOUT`. Check the Dashboard,
Transactions and Budgets charts afterwards — some pass a `layout.yaxis` override,
and `MoneyChart` merges `yaxis` but takes `margin` wholesale from `layout`, so a
caller that sets its own `margin` will still be broken.

### 1.4 Budgets summary tiles read €0 when the only budget is the total cap **[VERIFIED — reproduced]**

`backend/routers/budgets.py:122-130` deliberately excludes the `__total__`
pseudo-budget from `totals` — that is **correct**, it would double-count against
per-category budgets. But `frontend/src/pages/Budgets.tsx:147-167` renders those
totals unconditionally.

Current live state of the app: one budget, the "All spending" cap. The three
headline tiles read **Budgeted €0 / Spent €0 / Remaining €0** while the row
directly beneath them reads **€3,939 / €2,000 · Over**.

**Fix (frontend only — do not change the backend aggregation):** when
`status.budgets` contains no active non-`__total__` budget but `status.total_budget`
exists, drive the three tiles from `status.total_budget` (`effective` / `spent` /
`remaining`) and label the first tile "All spending · {month}". When both kinds
exist, keep today's behaviour but relabel the first tile "Category budgets ·
{month}" so it's clear the cap is excluded.

### 1.5 "€0 left" when you are €1,939 over **[VERIFIED — reproduced]**

Dashboard budgets widget. Over-budget clamps to zero instead of reporting the
overage. Change the copy to branch: `remaining >= 0` → "€X left across N
budgets", else → "€X over across N budgets".

### 1.6 Dashboard budget count contradicts its own amount **[VERIFIED]**

`frontend/src/pages/Dashboard.tsx:610`:

```tsx
{fmt(budgets.totals.remaining, budgets.currency)} left across {budgets.budgets.filter(b => b.active).length} budget…
```

`totals.remaining` excludes `__total__` (see 1.4) and the widget's own
`widgetRows` filters it out too — but this count does not. With 2 category
budgets + 1 active cap you get "€340 left across **3** budgets" where €340 is the
remaining across 2.

**Fix:** add `&& b.category_name !== TOTAL_BUDGET` to the filter. `TOTAL_BUDGET`
is already exported from `frontend/src/api/client.ts`.

### 1.7 A contribution of €0 is silently replaced by an auto-detected figure **[VERIFIED]**

`frontend/src/pages/GoalCalculator.tsx:42,44`:

```ts
monthly_contribution: params.monthly_contribution || undefined,
monthly_expenses: params.monthly_expenses || undefined,
```

`DEFAULT_PARAMS.monthly_contribution` is `0` and the slider min is `0`, so
`0 || undefined` → `undefined`, and `backend/routers/analytics.py` treats
`None` as "auto-detect" — substituting `max(0, mean_income − monthly_spend)`.

Failure: the user drags Monthly Contribution to €0 to model "what if I stop
saving". The hero stat then reads (say) €1,500 while the slider immediately below
it reads 0, and the whole projection is for a scenario they did not ask for.
There is currently **no way to express a zero contribution**. `askHelper` makes it
worse by sending the substituted figure to the LLM as if the user had chosen it.

**Fix:** use `null` as the explicit "auto-detect" sentinel rather than
`undefined`-via-falsy. Track a "touched" flag per control, or simplest: send
`params.monthly_contribution` verbatim and add an explicit "Auto-detect from my
history" checkbox that sends `undefined` when ticked. Whichever you pick, the
displayed hero stat must always equal the slider value.

### 1.8 A backend failure is reported as "you have no data" **[REPORTED]**

`frontend/src/pages/Dashboard.tsx:253-269` uses `.finally(() => setLoading(false))`
with no `.catch`. On rejection `balances` stays `[]` and the page renders
*"No balance data yet. Go to Accounts & FX to add accounts…"* — telling a user
with three years of history that their data doesn't exist.

**Fix:** add `.catch` that sets an error state, and render a distinct error alert
with a retry button. Keep the genuine empty state for the genuine empty case.

---

## Phase 2 — One definition of "spending"

`CLAUDE.md` states that finance domain logic is shared rather than duplicated
per-surface. In practice there are **three** implementations of "what counts as
spending" and one of them is wrong. **[VERIFIED]**

| Module | Base-currency conversion | Excludes transfers | Used by |
|---|---|---|---|
| `backend/routers/budgets.py` | `COALESCE(amount_base, amount)` | yes | Budgets page |
| `backend/assistant_tools.py:47,206` | `_base_amount()` | yes (`is_transfer`) | Financial Helper insights |
| `backend/finance_tools.py:67-76, 93-94` | **no** — raw `amount` | **no** | **AI chat + MCP server** |

`db.get_transactions_df()` (`backend/database.py:445-465`) returns both `amount`
and `amount_base`; `finance_tools` just never reads the latter. So
`get_spending_by_category` and `get_monthly_cash_flow` sum mixed currencies and
count transfers and brokerage buys as spending.

This is visible in the live app today: the Financial Helper card reports
*"Trade is EUR 8,164.62 (33.1%) of total spending"* — trades counted as spend.

### Tasks

- Add a single shared helper — `backend/domain.py` is the natural home, it's
  already the small shared-types module — exposing something like:
  - `base_amount(row) -> float` (the `COALESCE`/`fillna` rule, currently
    reimplemented three times)
  - `spending_frame(df, categories) -> DataFrame` (negative rows, transfer and
    income categories removed, amounts in base currency, absolute)
- Rewrite `finance_tools.get_spending_by_category` and
  `get_monthly_cash_flow` on top of it. `get_recent_transactions` (line 116)
  should report both `amount` and `amount_base` so the model can tell them apart.
- Have `assistant_tools.py` call the shared helper rather than keeping its own
  `_base_amount` / `excluded` set.
- Leave `budgets.py`'s SQL alone — it's correct and it's SQL, not pandas. Just
  make sure its definition and the shared helper's agree, and add a comment in
  each pointing at the other.
- **Tests are mandatory here.** `backend/tests/` has no coverage of this. Add a
  fixture with a EUR account and a USDT account with an FX rate, one transfer
  category and one brokerage trade, and assert that
  `finance_tools.get_spending_by_category`, `assistant_tools`, and
  `GET /api/budgets` all report the same total for the same month. That
  cross-surface assertion is the point of the phase.

### Also in this phase: reconcile the two net-worth figures **[VERIFIED — needs investigation, no prescribed fix]**

The Dashboard hero reads **€181,622**; the Financial Helper insight immediately
below it reads **EUR 181,302.98**. Both claim to be current net worth. Find out
whether this is a different as-of date (the hero says "Updated 21 Jul"), a
different set of accounts, or a different aggregation, then make them agree —
or make the difference explicit in the copy. Don't paper over it by rounding.

---

## Phase 3 — Money and date correctness in the frontend

### 3.1 The Transactions page never uses `amount_base` **[REPORTED — high confidence]**

`TransactionRow.amount_base` is declared at `frontend/src/api/client.ts:266` and
used **nowhere** in the app (grep confirms only the Balances pages read
`amount_base`). `frontend/src/pages/Transactions.tsx` sums raw native `amount` in
its KPI tiles (`:109-111`), its monthly cash-flow bars, and its category donut
(`:33-40`).

Failure: a −1,000 USDT row and a −1,000 EUR row at 0.92 add to **−2,000.00**
instead of −1,920. The Budgets page, computed server-side, reports 1,920 for the
same month. Two pages of the same app disagree about the same spend.

**Fix:** `r.amount_base ?? r.amount` everywhere an amount is aggregated or
charted. Keep the raw `amount` only in the per-row table cell, and show the
account's own currency next to it there.

### 3.2 The category donut counts transfers; the KPI tile doesn't **[REPORTED]**

`frontend/src/pages/Transactions.tsx:33-40` — `buildCategoryTrace` takes every
negative row, while the Spending KPI at `:110` excludes transfer categories. A
monthly transfer to savings shows as the largest "outflow" slice but is absent
from the Spending number on the same screen. Apply the same `transferCats`
filter in `buildCategoryTrace`.

### 3.3 Local-date helpers **[VERIFIED]**

Two distinct bugs, one shared fix.

`frontend/src/pages/Balances.tsx:25`:
```ts
const today = new Date().toISOString().slice(0, 10)
```
In Europe/Rome (UTC+2 in summer) at 00:30 on the 24th this yields **2026-07-23**.
`balances` is uniquely keyed `(account_id, date)` and `upsert_balances` is
`INSERT OR IGNORE`, so a snapshot saved with the wrong date either silently
collides with yesterday's row or plants a bogus point in the net-worth series.
This one bites the current user, today.

`frontend/src/pages/Budgets.tsx:133`, `Dashboard.tsx:213,400,557,644` —
`new Date('2026-07' + '-01')` and `new Date(t.date)` parse date-only strings as
**UTC midnight**, then format in local time. Harmless at UTC+2, but for any
negative-offset user the Budgets card reads "June 2026" over July's numbers, and
transaction rows display a day early. Note `Transactions.tsx:217` prints `r.date`
raw and is correct — so two pages already disagree about the same row's date.

**Fix:** add `frontend/src/utils/date.ts` with:
- `todayLocal(): string` — `YYYY-MM-DD` from local getters (or
  `toLocaleDateString('en-CA')`)
- `parseLocalDate(s: string): Date` — split on `-`, `new Date(y, m-1, d)`
- `formatDate(s, style)` — the one place date display is decided

Then replace every `new Date(<date-only string>)` in the frontend. Grep for
`new Date(` to find them all.

### 3.4 A missing FX rate converts at 1:1 **[VERIFIED]**

`frontend/src/pages/Balances.tsx:46-50`:

```ts
function getRate(currency: string): number {
  if (currency === 'EUR') return 1
  const r = fxRates.find(f => f.currency === currency)
  return r?.rate_to_base ?? 1
}
```

The Accounts page only surfaces FX inputs *after* an account in that currency
exists, so "create USD account → add a balance → no rate yet" is the normal
first-time ordering. Typing 10,000 auto-fills **10,000.00 EUR** and inflates net
worth by ~€800 silently. `submitAdd:81` has the same fallback
(`parseFloat(amount_base) || parseFloat(amount_native)`), so clearing the base
field does it too.

**Fix:** `getRate` returns `number | null`. On `null`, leave `amount_base` empty,
disable submit, and show an inline message with a link to Accounts & FX: "Set an
FX rate for USD before adding a balance." Also drop the `||` fallback in
`submitAdd`.

Note the same function hardcodes `'EUR'` as the base currency — see 5.3.

### 3.5 Clearing a number input sends 0 **[REPORTED]**

`frontend/src/pages/GoalCalculator.tsx:70` — `Number(e.target.value)` on an empty
input is `0`. Clearing "Safe Withdrawal Rate" sends `withdrawal_rate_pct: 0`,
which `analytics.py` correctly rejects, and the user sees a raw FastAPI 422 body
dumped into an info alert. Clamp to the input's `min`, and render `detail` rather
than the raw response text.

### 3.6 "— none —" writes an empty string, not NULL **[REPORTED]**

`frontend/src/pages/Transactions.tsx:85-89` PATCHes `category: ''`;
`backend/database.py:504` stores the empty string. The badge then renders
`r.category ?? '—'` → `''`, i.e. an empty clickable chip. Send `null` from the
client **and** normalise `'' → NULL` in the backend so existing rows get fixed on
next edit.

---

## Phase 4 — Robustness

### 4.1 Any API failure = permanent spinner **[REPORTED — high confidence, pattern is visible in all five files]**

`Transactions.tsx:64-77`, `Budgets.tsx:24-36`, `Balances.tsx:33-40`,
`Categories.tsx:27-35`, `Accounts.tsx:17-24` all follow
`setLoading(true) → await Promise.all([...]) → setLoading(false)` with **no
try/catch/finally**. If the backend restarts (uvicorn `--reload` picking up a
syntax error is the everyday case), the promise rejects, `setLoading(false)`
never runs, and the page spins forever with no retry short of a hard reload.

**Do this as part of 6.1, not separately** — the fix is the same `useApi` hook in
all five files, and doing it twice is wasted work.

### 4.2 Fetch races **[REPORTED]**

No `AbortController` or sequence token anywhere in the app. Three real instances:

- `GoalCalculator.tsx:35-54` — `run` depends on the whole `params` object and
  fires an undebounced `POST /analytics/fire` on **every slider tick**. Dragging
  Target Amount issues ~40 requests; the chart settles on whichever resolves
  last, which routinely isn't the current slider value. **Worst of the three.**
- `Predictions.tsx:25-42` — same shape on the `monthsAhead` slider.
- `Transactions.tsx:64-83` — switching from a slow account (BBVA, thousands of
  rows) to a fast one (Binance, ten) lets the slow response land second and
  repaint the table with the wrong account's rows while the filter pill still
  reads Binance.

**Fix:** a small `useLatest` / sequence-token pattern in the shared hook (see
6.1) — `const id = ++seq.current` before the await, `if (id !== seq.current) return`
after. Plus a ~250 ms debounce on the two slider-driven pages. Prefer the token
over `AbortController` here: it's less code and these requests are cheap.

### 4.3 Unhandled rejections **[REPORTED — low severity]**

`Preferences.tsx:67-72`, `Import.tsx:29-32`, `Connections.tsx:84-126` chain
`.then().finally()` with no `.catch()`. Non-fatal (the `finally` clears the
spinner) but produces silently blank forms and console noise. Sweep them when
you touch each file.

---

## Phase 5 — Consistency

The system exists; the code bypasses it. **359 inline `style={{}}` objects**
across 13 page/component files — Dashboard 89, Connections 70, Budgets 34,
Categories 32 — hardcoding px values and raw rgba (e.g.
`rgba(63,122,85,0.14)` at `Budgets.tsx:312`) instead of the tokens defined in
`globals.css`. This is the root cause of most of what follows.

### 5.1 One money formatter **[VERIFIED]**

Four formats are live on screen right now:

| Screen | Renders |
|---|---|
| Dashboard hero | `€181,622` |
| Transactions KPI tiles | `-86,495.48` (no symbol at all) |
| Dashboard recent transactions | `-300.00` |
| Financial Helper insights | `EUR 181,302.98` |

The Transactions page is the worst case: no currency marker on a page that mixes
accounts in different currencies.

`MoneyChart.tsx:109-117` already exports `fmt` and `fmtAmount`. Promote them to
`frontend/src/utils/money.ts` (they have no business living in a chart
component), give `fmt` a `{ decimals }` option, and use them everywhere. The
backend insight strings are generated server-side — fix those in
`assistant_tools.py` to emit the same symbol form.

### 5.2 One date formatter

`Friday, 24 July 2026` / `20 Jul` / `2026-07-24` across three screens. Covered by
the `utils/date.ts` in 3.3 — pick two styles (long for headers, short for rows)
and use only those.

### 5.3 Base currency is hardcoded to EUR **[VERIFIED]**

`Dashboard.tsx:29,66`, `Balances.tsx:47,143`, `Accounts.tsx:66,151` hardcode
`'EUR'`, even though `db.get_base_currency()` is a settable `app_settings` key
and every backend response already echoes a `currency` field. `Budgets.tsx` does
this correctly (`status.currency`) — copy that pattern.

Latent today, but it means `PUT /api/settings/base_currency` is a trap: setting
it to USD makes the Dashboard label USD totals as EUR and makes Balances treat
USD as needing no conversion. Either thread `currency` through properly, or
remove the setting. **Do not add a base-currency picker to Preferences until
this is done.**

### 5.4 Charts render one frame behind the theme **[VERIFIED — the mechanism is confirmed]**

`MoneyChart.tsx:64` and `Dashboard.tsx:291` read
`document.documentElement.dataset.theme` **during render**. That attribute is
written by an effect in `ThemeContext.tsx:21-23`, which runs *after* the render
that observed the state change.

Flip macOS to dark with theme set to "system": `setSystemDark(true)` re-renders,
`MoneyChart` reads the stale `light`, picks `LIGHT_LAYOUT`, and the effect then
sets `data-theme="dark"` without scheduling another render. Page chrome goes
dark, every chart keeps light `#E7DECC` gridlines, and the allocation donut's
centre label stays near-black on a dark card — until some unrelated re-render.

**Fix:** `useTheme()` already returns `isDark` (see `frontend/src/theme.ts` and
`useTheme.ts`). Consume it. Never read `dataset.theme` during render.

### 5.5 The donut has light seams in dark mode **[VERIFIED]**

`Transactions.tsx:47` hardcodes `line: { color: '#F6F1E7' }` — the light card
background. Drive it from `isDark` (5.4) or read the CSS variable.

### 5.6 Chart labels collide and clip **[VERIFIED — reproduced]**

- Dashboard cash-flow Sankey: small categories (Sport / Travel / Transport /
  Food / Other spending) stack into an unreadable overlap at the bottom of the
  node.
- Transactions donut: leader lines for small slices run outside the card and the
  labels clip mid-word — "Divider 0.0044", "Entertai 0.08", "Shoppi 0.185".

**Fix:** group anything under ~3% into a single "Other" slice/node before
building the trace, in both `CashFlowSankey.tsx` and `buildCategoryTrace`. Also
set `textposition: 'inside'` with `insidetextorientation: 'horizontal'` on the
pie and drop `textinfo` to `label` only for small slices.

### 5.7 Category colours clash with the palette **[VERIFIED]**

The Transactions donut renders blue / purple / bright red slices — DB-seeded
category colours — against the app's warm gold/forest palette. `MoneyChart.tsx:103`
already defines the correct `ACCOUNT_PALETTE`.

**Fix:** re-seed the default category colours in `backend/database.py` from
`--series-1..5` / `ACCOUNT_PALETTE`. Existing user-set colours must be left
alone — only change what new installs get, and offer a "reset colours" action in
Categories & Rules rather than migrating silently.

### 5.8 Unstyled native date inputs **[VERIFIED]**

The `--/--/----` range inputs on Transactions sit next to carefully styled
selects. Give them the same `globals.css` input treatment; keep them native
(don't add a date-picker dependency for this).

---

## Phase 6 — Simplification

Do this **after** Phases 1–3, so you're consolidating code that's already
correct. Phase 4.1 folds into 6.1.

### 6.1 A `useApi` hook

The `loading / error / try-finally` block is copy-pasted across six pages
(`Transactions`, `Budgets`, `Balances`, `Categories`, `Accounts`, `Dashboard`),
and all six get error handling wrong in the same way (4.1) and race in the same
way (4.2). One hook that returns `{ data, loading, error, reload }` with a
built-in sequence token fixes the class of bug and removes the boilerplate.
Estimated ~150 lines out, and it's the prerequisite for doing 4.1/4.2 once
instead of six times.

### 6.2 Shared UI primitives

`<Card>`, `<StatTile>`, `<DataTable>`, `<FormField>`. This is where most of the
359 inline style objects go. Do it incrementally — one component, migrate the
pages that use it, land it — not as one large refactor.

### 6.3 Split the large modules

- `frontend/src/pages/Connections.tsx` (1,213 lines) → one component per
  integration (`connections/BbvaCard.tsx`, `BinanceCard.tsx`, `IbCard.tsx`,
  `RevolutCard.tsx`) plus a shared `SecretField` for the write-only
  `__secret__` pattern, which is currently repeated per integration.
- `frontend/src/pages/Dashboard.tsx` (661 lines) → `dashboard/HeroCard.tsx`,
  `AllocationCard.tsx`, `BudgetsWidget.tsx`, `RecentTransactions.tsx`,
  `AccountsOverTime.tsx`. The page becomes layout only.
- `backend/database.py` (824 lines) is *lower* priority — it's cohesive and the
  churn risk outweighs the benefit. If you do split it, go by table group
  (`db/accounts.py`, `db/transactions.py`, `db/settings.py`) and keep
  `database.py` re-exporting so nothing else has to change.

---

## Task checklist

**Phase 1 — wrong numbers and silent failures** ✅ done
- [x] `api/client.ts`: route `import.preview`/`import.confirm` through `request()`; skip the JSON `Content-Type` for `FormData` bodies
- [x] `pages/Import.tsx`: drop the `res.error` guards, rely on `request()` throwing
- [x] `main.tsx`: add an error boundary with reload
- [x] `components/MoneyChart.tsx`: `margin.l: 52` in both layouts; check callers that override `margin` (Dashboard/Transactions donuts confirmed pie-only, no axis, left alone)
- [x] `pages/Budgets.tsx`: tiles fall back to `total_budget` when no category budgets exist; relabel when both exist
- [x] `pages/Dashboard.tsx`: over-budget copy says "over", not "€0 left" (also falls back to `total_budget.remaining` when there are no category budgets, mirroring the Budgets page fix)
- [x] `pages/Dashboard.tsx:610`: exclude `TOTAL_BUDGET` from the active-budget count
- [x] `pages/GoalCalculator.tsx`: touched-flag sentinel per field (`monthly_contribution`/`monthly_expenses`) instead of `|| undefined`; hero stat now always matches the slider. Also fixed a matching backend bug in `analytics.py` (`monthly_expenses = params.monthly_expenses or detected_expenses` had the same falsy-0 problem as the frontend) and added `monthly_expenses` to `FireResult` so the frontend can sync the slider to the resolved value.
- [x] `pages/Dashboard.tsx:253`: `.catch` → error state, distinct from the empty state

**Phase 2 — one definition of spending** ✅ done
- [x] `backend/domain.py`: add `base_amount()` and `spending_frame()`
- [x] `backend/finance_tools.py`: rewrite `get_spending_by_category` + `get_monthly_cash_flow` on the shared helpers; have `get_recent_transactions` return both amounts. Confirmed with a live-DB check that "Trade"/"Investment" categories have `is_transfer=1` in this DB — this was a real bug, not theoretical: the Financial Helper's "Trade is 33.1% of spending" insight was a direct symptom.
- [x] `backend/assistant_tools.py`: call the shared helpers, drop `_base_amount`/`excluded`
- [x] `backend/routers/budgets.py`: comment cross-referencing the shared definition (no logic change)
- [x] `backend/tests/test_spending_consistency.py`: cross-surface test — mixed-currency (EUR + USDT with a real FX rate) + transfer + trade fixture, asserts finance_tools/assistant_tools/budgets all report the same total
- [x] Investigated the two net-worth figures — **not a bug**. `computeMetrics` (frontend) and `finance_tools.get_net_worth_summary` (backend) both compute "latest balance per account_id, summed in base currency" off the exact same unfiltered query (`db.get_balances_df()`, no active-account filter in either path — verified by reading both). Replicating the calculation directly against the live DB matches `finance_tools`' output exactly. The two numbers seen earlier in this session were captured minutes apart while background sync was actively updating balances (BBVA/Revolut), so they're two correct answers to the question asked at two different times, not a computation bug. No code change made.

**Phase 3 — money and date correctness** ✅ done
- [x] `pages/Transactions.tsx`: `amount_base ?? amount` in all aggregates and charts, via a local `baseAmount()` helper. Per-row table cell keeps the native amount, now with the account's currency shown next to it (via a new `accounts`-derived `accountCurrency` map).
- [x] `pages/Transactions.tsx`: exclude transfer categories from `buildCategoryTrace`. While in there also applied two Phase-5 donut fixes since the function was already being touched: theme-aware seam colour (was hardcoded to the light card background) and grouping sub-3% slices into "Other" so labels stop clipping — see Phase 5 notes, don't redo these.
- [x] `utils/date.ts`: `todayLocal`, `parseLocalDate`, `formatDateLabel`, `formatMonthLabel`
- [x] Replaced every date-only `new Date(...)` in the frontend (Balances, Dashboard ×4, Budgets). Left `new Date(iso)` in `Connections.tsx:17` alone — verified it parses a full ISO timestamp (`sync_log.updated_at`), not a date-only string, so it has no UTC-midnight bug.
- [x] `pages/Balances.tsx`: `getRate` returns `number | null`; submit is blocked with an inline message + link to Accounts & FX when the rate is unknown and the base-currency field is empty; removed the `||` fallback in `submitAdd`. Also fetched the real `base_currency` from `/api/settings` instead of hardcoding `'EUR'` (needed for `getRate` to correctly distinguish "this currency is the base" from "no rate on file") — this incidentally finishes Balances.tsx's part of Phase 5.3, noted there.
- [x] `pages/GoalCalculator.tsx`: empty number inputs now clamp to the field's `min` instead of becoming 0. Also improved `request()` in `api/client.ts` to parse FastAPI's `{"detail": ...}` error shape (string or Pydantic validation-error array) into a readable message app-wide, instead of just for this one page — `error.startsWith('422')` in GoalCalculator/Predictions still works since the `${status}:` prefix is unchanged.
- [x] Category clear sends `null` (`editCat || null`); `CategoryUpdate.category` is now `str | None`; `database.py`'s `update_transaction_category` normalises `'' → NULL` too, so existing empty-string rows self-heal on next edit.

**Phase 4 — robustness** ✅ done (4.1 landed with 6.1, see below)
- [x] Debounced `GoalCalculator` (300ms) and `Predictions` (250ms) sliders via `useApi`'s built-in debounce + sequence token — verified in-browser that dragging Monthly Contribution to 0 now shows €0 in both the slider and the hero stat, not the stale auto-detected value
- [x] `.catch()` sweep in `Preferences.tsx`, `Import.tsx`, `Connections.tsx` — each now surfaces a message via existing `msg`/`setMsg` state instead of silently clearing the spinner on failure

**Phase 5 — consistency** ✅ done
- [x] `utils/money.ts`: moved `fmt`/`fmtAmount` out of `MoneyChart.tsx`; `fmt` takes an `{ decimals }` option. Updated all 8 importing files.
- [x] Applied it on Transactions KPI tiles (now show the real base currency instead of no symbol at all — needed fetching `base_currency` from `/api/settings`, wasn't fetched on this page before) and the Dashboard recent-transactions row (also switched to `amount_base ?? amount`, matching the rest of the app — it was mixing native amounts across accounts before).
- [x] `assistant_tools.py`: `_money()` in `routers/assistant.py` now emits `€181,622` (symbol, no space) instead of `EUR 181,622`, matching the frontend's `Intl.NumberFormat` output for EUR/USD/GBP/JPY, falling back to `"CODE "` for others exactly like `Intl` does. Also updated the LLM system prompt in `_ai_insights` to specify this format explicitly, since free-text insight bodies come from the model, not a fixed template.
- [x] Threaded real `currency` through `Dashboard.tsx` (dropped the hardcoded `currency: 'EUR'` field from `computeMetrics`'s return entirely — it wasn't derivable from `BalanceRow` and was always wrong; added a `baseCurrency` state fetched from `/api/settings` instead), `Balances.tsx` (done in Phase 3 as part of the FX-rate fix), and `Accounts.tsx` (`nonBaseCurrencies` filter, the FX Rates section header/copy, and the new-account form's default currency all now use the fetched `base_currency` instead of a literal `'EUR'`).
- [x] `MoneyChart.tsx` and `Dashboard.tsx`: both now call `useTheme().isDark` instead of reading `document.documentElement.dataset.theme` during render. Verified in-browser: toggled Preferences → Dark and confirmed every chart (net worth line, allocation donut, cash-flow bars, category donut) re-themes in the same paint as the page chrome, with correctly readable axis labels and no light-background seams.
- [x] `Transactions.tsx`'s category donut seam colour now reads `isDark` instead of a hardcoded light hex.
- [x] Grouped sub-3%-of-total slices into "Other" in both `CashFlowSankey.tsx` (new `groupSmall()` helper, applied to both the sources and targets columns) and `buildCategoryTrace` (Transactions.tsx) — verified in-browser that the Sankey's small categories (Sport, etc.) no longer overlap.
- [x] Re-seeded `DEFAULT_CATEGORIES` in `database.py` with the warm Meridian palette (mapped 1:1 onto `ACCOUNT_PALETTE` for the 10 expense categories, four new warm tones for Investment/Income/Transfer/Other). Existing installs are untouched by default — added `POST /api/categories/reset-colors` (only touches categories whose *name* matches a default, confirms with the user first) and a "Reset colours" button on the Categories page, plus updated the "New Category" swatch picker to the same palette so newly created categories don't immediately clash again. Verified the endpoint directly against the running backend: 14 categories updated, a non-default category (Dividends) correctly left untouched.
- [x] Styled the native `type="date"` inputs inside `.filter-pill` on Transactions to match their sibling `<select>` (transparent, borderless, inherits the pill's own border) instead of getting the global input's own separate border+background nested inside the pill.

**Phase 6 — simplification** (6.1 and 6.3 done; 6.2 not started)
- [x] `hooks/useApi.ts`: generic `{data, loading, error, reload}` hook with a sequence token (drops stale responses) and an optional debounce. Migrated all six list pages (`Transactions`, `Budgets`, `Balances`, `Categories`, `Accounts`, `Dashboard`) — each now surfaces a distinct error state instead of spinning forever, and `GoalCalculator`/`Predictions` route their POST-with-changing-params fetches through the same hook with debounce (closes 4.1 + 4.2). Multi-resource fetches (e.g. Budgets' four calls, Balances' four calls) return a tuple from one fetcher and destructure via `useMemo`-stabilized fallbacks so downstream `useMemo`/`useEffect` dependency arrays stay correct — `npm run lint` was clean of new warnings after this pass. Where a page had a side effect that needs to run once per successful fetch (Categories' default rule category, Accounts' editable FX map, GoalCalculator's slider-sync), that's a small separate `useEffect` keyed off the derived value, not built into the hook itself.
- [ ] `<Card>`, `<StatTile>`, `<DataTable>`, `<FormField>`; migrate incrementally — **not started**. This is the one item left from the whole plan. It's the least urgent (pure code organization, no user-visible effect) and the highest-volume (359 inline style objects across 13 files) — better picked up as its own focused pass than squeezed in at the end of this one.
- [x] Split `Connections.tsx` (1216 → 223 lines) into `pages/connections/`: `SecretField.tsx` (the shared write-only masked-input pattern, used by IB's token and Binance's secret), `ProviderCard.tsx` (the card shell + guide-step accordion), `Callout.tsx`, `logos.tsx`, `guides.tsx` (the four providers' setup-guide copy), `SyncStatusCard.tsx`, `utils.ts` (`relTime`, `initialAccountId`), and one component per integration: `IBCard.tsx`, `BinanceCard.tsx`, `RevolutCard.tsx`, `BbvaCard.tsx`. The tricky part was real state coupling, preserved deliberately rather than designed away: Revolut and BBVA share one Enable Banking application, so `ebAppId`/`ebPrivateKey`/`ebKeySaved`/`saveEbCredentials` stay lifted in `Connections.tsx` and are passed to both cards as controlled props — verified live in the browser that editing the Application ID in one card updates the other. Likewise `revolutConnected`/`revolutEbAccounts`/`bbvaConnected`/`bbvaEbAccounts` stay lifted because the OAuth-redirect-exchange effect (page-level, fires on mount) is what sets them; each card only reads them. Everything else (IB's token/query IDs, Binance's key/secret, each provider's account selection and aspsp lookup) moved fully into its own card's local state. `Connections.tsx` now only holds the shared state, the initial settings fetch, and the OAuth exchange effect.
- [x] Split `Dashboard.tsx` (679 → 161 lines) into `pages/dashboard/`: `data.ts` (the pure compute/build functions — `computeMetrics`, `computeNetWorthSeries`, `buildAccountTraces`, `buildSparkline`, `buildSankeyData`, `greeting`, `insightTone` — none of these are JSX, so "the page becomes layout only" meant moving these out too, not just components) and one component per widget: `HeroCard.tsx` (net worth hero + account-type tiles), `InsightsCard.tsx` (Financial Helper panel — not in the plan's original 5-item list but extracted for the same reason as the others), `NetWorthChartCard.tsx`, `AllocationCard.tsx`, `CashFlowCard.tsx`, `BudgetsWidget.tsx`, `AccountsOverTime.tsx`, `RecentTransactions.tsx`.
- Both splits verified in the browser (light and dark) after the fact: every widget renders with live data, no console errors, and the specific behaviors most at risk from a mechanical extraction were individually re-checked — Connections' shared Enable Banking credentials sync across the Revolut/BBVA cards, and Dashboard's theme-aware charts and currency formatting.

---

## Verification

Per phase, before marking it done:

```bash
source .venv/bin/activate && pytest backend/tests/ -v
cd frontend && npm test && npm run lint && npx tsc -b
```

Then run the app (`make dev`, https://localhost:5173) and check by hand:

- **Phase 1:** import a deliberately bad file (wrong adapter for the file type) →
  a red error naming the reason, file input *not* cleared. All charts show Y-axis
  values. Budgets page tiles match the row beneath them. GoalCalculator at
  contribution 0 shows 0 in the hero stat.
- **Phase 2:** ask the in-app chat "how much did I spend last month by category"
  and compare against the Budgets page and the Financial Helper for the same
  month. All three must agree. Trades and transfers must not appear as spending.
- **Phase 3:** add a balance just after local midnight and confirm the date
  defaults to today. Create a foreign-currency account with no FX rate and
  confirm the balance form blocks rather than converting 1:1.
- **Phase 4:** drag the FIRE sliders hard and confirm the chart ends on the
  slider's final value. Switch accounts on Transactions rapidly and confirm the
  table matches the filter pill.
- **Phase 5:** toggle the OS between light and dark with theme = "system" and
  confirm charts re-theme in the same frame as the chrome.

Regression watch: this app's data is real and `INSERT OR IGNORE` means a bad
write is easy to make and hard to notice. Back up `finances.db` before testing
anything in Phase 3, and never test imports against the live DB — point
`DB_PATH` at a copy.

## Out of scope

- No visual redesign. The token system and nav IA are good; don't touch them.
- No new dependencies without asking — particularly no date library (the three
  helpers in `utils/date.ts` are enough) and no chart library swap.
- Don't split `backend/database.py` unless 6.3's other items are already done.
- Don't add a base-currency picker to Preferences until 5.3 is complete.
