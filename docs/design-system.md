# FUOCO design system

FUOCO is a personal finance workspace. Its interface should help someone answer three questions: what do I have, where did my money go, and what needs attention?

The direction follows the October 19 concept: ivory surfaces, forest green, restrained ember accents and clear financial figures. Preserve the FUOCO logo. Newsreader is used for display headings and the large portfolio/month figures; Hanken Grotesk remains the UI and data face. The signature is a conserved river of money beside a short list of actionable priorities. Avoid duplicate metrics and decorative charts without values.

## Source of truth

- `frontend/src/styles/tokens.css`: primitive → semantic → component tokens, including both themes.
- `frontend/src/styles/globals.css`: shared controls, page structure, and dashboard layouts.
- `frontend/src/styles/home.css`: home card presentation and responsive composition.
- `frontend/src/styles/workspace.css`: navigation, URL-backed section layouts and embedded forms.
- `frontend/src/navigation/config.ts`: primary navigation, local sections and legacy destinations.
- `frontend/src/pages/home/layout.ts`: card ordering, column and mobile position.
- `/design-system`: live component reference, rendered with the actual app styles. Open directly; it is intentionally absent from the everyday navigation.
- `frontend/src/utils/chartPalette.ts`: categorical colors for Plotly, whose inputs require concrete color values. Keep these aligned with the palette when changing colors.

Use `var(--ink)` and other semantic tokens in components. Raw colors belong in the primitive palette. Use component tokens when a particular control must vary independently. Legacy semantic names remain supported so existing pages adopt the system without a rewrite. Older page-specific inline styles remain candidates for gradual migration.

## Palette and themes

| Role | Light | Dark | Token |
|---|---|---|---|
| Canvas | `#F4F1E8` | `#1B1812` | `--bg` |
| Surface | `#FBF8F1` | `#242019` | `--bg-card` |
| Primary text | `#172C26` | `#F4EEE2` | `--ink` |
| Supporting text | `#716653` | `#B5A68B` | `--ink-faint` |
| Ember accent | `#E76A32` | `#ED976D` | `--accent` |
| Link text | `#A94319` | `#ED976D` | `--link` |
| Positive | `#3F7A55` | `#6FA887` | `--gain` |
| Negative | `#BE4A33` | `#D9745A` | `--loss` |

Ember chart series and the darker light-theme link color are separate roles. Accent orange is not a small-text color on ivory. The net-worth hero keeps a dark background and light text in both themes through `--hero-*` tokens. Do not apply inverse page text colors to a permanently dark surface. Decorative borders and chart series are not substitutes for readable labels.

## Type, spacing, and shape

Hanken Grotesk serves body and utility roles; `--font-display` selects Newsreader with a Georgia fallback for editorial titles and large figures. For finance data, use `--font-data` and `font-variant-numeric: tabular-nums`. This keeps numbers aligned without introducing another font dependency.

| Role | Token | Size |
|---|---|---|
| Supporting text | `--text-xs` | 12 px |
| Compact label | `--text-sm` | 13 px |
| Body | `--text-base` | 14 px; 1.5 line height |
| Section heading | `--text-lg` | 17 px |
| Secondary figure | `--text-xl` | 24 px |
| Page title | `--text-title` | 32 px |
| Portfolio figure | `--text-display` | Responsive 38–68 px |

Spacing uses a 4 px base: `--space-1/2/3/4/5/6/8/10` = 4/8/12/16/20/24/32/40 px. Prefer 8–12 px between related items, 16–24 px inside cards, and 24–32 px between sections. Standard cards use a 20 px radius; controls use 11 px; small metric tiles use 16 px. Avoid shadows except for the portfolio panel and overlays.

## Components

| Component | Contract |
|---|---|
| Primary button | One main action per task, 44 px high, explicit verb; `--button-primary-bg/text`. |
| Secondary button | Supporting action; surface background, visible border. |
| Destructive button | Explicit action name; stable red background and white text in both themes. |
| Compact button | 32 px desktop height; do not use for a mobile primary action. |
| Field | Visible label, local helper/error text; invalid fields use `aria-invalid` and `aria-describedby`. Mobile text is at least 16 px to avoid input zoom. |
| Card | `--card-padding`, surface background, border, heading, optional description and action. Avoid clickable containers with nested controls. |
| Financial metric | Label, currency, amount, comparison period. Em dash for unavailable data; zero only for a recorded value. |
| SectionLayout | URL-backed local section links plus Outlet; one page title, up to three local sections. |
| Home composition | Cards receive values/callbacks, never call APIs. Reorder using `pages/home/layout.ts`. |
| Money river | Income + absorbed liquidity = spending + surplus. Negative values never become negative ribbon widths. Text values remain visible on mobile. |
| Category breakdown | Descending amounts, visible values and shares, bars for relative size; group remaining categories transparently. |
| Navigation drawer | Move focus in on open; trap Tab, close on Escape, restore trigger focus; background is inert. |

All interactive controls need a visible focus indicator. Disabled controls use native `disabled`, reduced opacity, and no hover action. Loading controls retain their labels and expose busy state where applicable. Motion uses 120–200 ms and respects reduced-motion preferences.

## Financial data rules

1. Aggregate in the configured base currency. Preserve native currency in individual transaction rows. Legacy rows without an FX conversion follow the existing native-amount fallback.
2. Exclude category-flagged transfers from income and spending. Outgoing account transfers do not prove investment contributions or savings.
3. Savings rate is `(money in − spending) / money in`. With no money in, show an em dash.
4. Compare a current month to the same elapsed days of the previous month, capped at that month's last day. Past months compare full months. Explain that imported months may be incomplete.
5. Net worth uses each account's latest snapshot. Show the range of snapshot dates. First snapshots do not count as gains in the previous-snapshot comparison.
6. Balance changes include deposits and withdrawals; do not label them investment returns.
7. Show YTD only when a snapshot on or before January 1 provides a baseline.
8. Charts aggregate on recorded snapshot dates only; never add daily forward-fill or resampling.
9. Positive-balance allocation excludes negative groups from the bar and labels them separately in the list. Avoid percentages divided by zero or negative net worth.
10. Empty, loading, and failed requests are distinct states. Optional helper/budget failures must not hide core dashboard data.

## Responsive behavior

- Navigation becomes a drawer at 920 px.
- Home columns become a mobile stack at 760 px; month first, then portfolio and priorities. Legacy detail grids stack at 1200 px.
- At 600 px, forms stack and recent transactions prioritize description, account, and amount. The money river becomes a compact textual/bar summary on mobile.
- Use `minmax(0, 1fr)` in data grids, `min-width: 0` for children, and local horizontal scrolling for wide tables.
- Check 390, 768, 1024, and 1440 px widths in both themes. Test keyboard navigation and reduced motion.

## Adding or changing UI

Choose a semantic role before choosing a color. Reuse shared classes and tokens, add the example to `/design-system` when introducing a new reusable pattern, and verify its normal, focus, disabled, empty, loading, and error states as applicable. Keep implementation details out of everyday product flows.

## Frontend boundaries

API transport stays in `src/api/client.ts`. Data loading and view-model composition stay in hooks (`pages/home/useHomeData.ts`, `useHomeExtras.ts`, `hooks/usePortfolioData.ts`). Existing pure financial transforms stay in `pages/dashboard/data.ts` and `utils/cashFlow.ts`; changing a palette or moving a card never requires changing them or the backend. Cards accept typed props and callbacks. No new backend endpoint, database schema or financial forecast was introduced for this UI.

Historical cash-flow detail is available in Movimenti; portfolio histories and allocation live in Patrimonio. Local sections use paths rather than component-only tab state. Old paths redirect while preserving query, hash and navigation state, including bank callback parameters.
