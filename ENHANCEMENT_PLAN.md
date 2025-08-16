# Survivor Pool – Enhancement Plan (Q3 2025)

Author: Cascade (AI)
Date: 2025-08-16
Scope: UX, Robustness, Admin safety, Performance. Excludes accessibility and email notifications per request.

## Goals
- Improve clarity and trust in scoring (margins, eliminations, notes).
- Increase robustness to external API issues (ESPN fetch resiliency).
- Make admin updates safer (validate & preview diffs before saving to Gist).
- Small performance polish (memoization, throttling), with minimal disruption.

## Out-of-Scope
- Accessibility-specific work (ARIA, keyboard nav, contrast tuning).
- Email-based notifications. (Client notifications/webhooks remain optional.)

## Architecture Context
- Frontend: Single-page React app embedded in `index.html` (Tailwind CSS, Chart.js).
- Admin: `admin.html` writing to GitHub Gist (`data.json`) as source of truth.
- Data: `data.json` with `managers`, `gameResults`, etc. Live scores via ESPN.
- PWA: `sw.js` (network-first for HTML; cache busting handled).

## Enhancements

1) UX
- Status badges on manager rows: "Alive", "Eliminated (W#)", and optional "Buyback".
- Margin clarity: hover tooltip breakdown week-by-week; elimination loss (negative) included.
- Collapsible per-week margins table under each manager row.
- Display tie/early-ending notes from `gameResults` on schedule and manager rows.
- Pick lock indicators (based on kickoff) to show locked vs editable picks.

2) Admin Safety
- Pre-save validation against JSON Schema for `data.json` structure (managers, picks, gameResults).
- Diff preview prior to saving to Gist to show exactly what changes.
- Optional timestamped backup snapshot (e.g., `data-YYYY-MM-DDTHHmm.json`).

3) Reliability
- ESPN fetch retry with exponential backoff + graceful fallback to stored `gameResults`.
- Stale data indicator banner using `lastUpdated` (e.g., "Data last updated 12m ago").

4) Performance
- Memoize expensive derived values (e.g., `computeDraftOrderLive`) with stable deps.
- Throttle manual refresh and any auto-refresh interval to prevent burst calls.
- Lazy-load audio assets with a mute toggle.

## Implementation Plan (Phased)

Phase 1 – UX (Quick Wins)
- Add badges near manager name using `deriveElimination(mgr)` and buyback flags.
- Add margin breakdown tooltip; new helper `getMarginBreakdown(mgr)`.
- Ensure `getCumulativeMargin(mgr)` includes elimination loss (already fixed).

Phase 2 – Admin Safety
- JSON Schema + validate on Save in `admin.html` with readable inline errors.
- Diff preview before PATCH to Gist; highlight additions/removals.
- Optional timestamped backup file in the same Gist (or separate file locally).

Phase 3 – Reliability & Indicators
- ESPN fetch with retry/backoff; use `ETag/Last-Modified` if available.
- Stale data ribbon based on `lastUpdated` vs current time.

Phase 4 – Performance Polish
- Throttle refresh; memoize computations; defer audio loading.

## Data & Logic Notes
- `getCumulativeMargin(mgr)` now sums wins and includes elimination-week negative margin (fix for Week 2 cases like Chris/Josh).
- Breakdown should include: week, team, outcome (W/L/T), margin diff, cumulative tally.
- Notes sourced from `data.json -> gameResults.weekN[i].notes` where applicable.

## Testing
- Add unit tests (optional) by extracting pure helpers to a JS module (e.g., `/lib/logic.js`):
  - `deriveElimination`, `getWeekMargin`, `getCumulativeMargin`, `getMarginBreakdown`.
- Manual validation matrix:
  - Alive with multiple wins.
  - Eliminated in Week 2 (includes negative margin subtraction).
  - Tie and early-ended game visibility.
  - Admin save validation failure and diff preview correctness.

## Rollout
- Feature-gate new UI in small steps; ensure no blocking regressions.
- After QA, publish to GitHub Pages (same repo). Gist remains source of truth.

## GitHub Fork/Branching
- Preferred: GitHub fork for isolated work; otherwise feature branch.
- Required info to fork: GitHub username and whether `gh` CLI is available.
- Suggested naming: `survivor-pool-enhancements-2025Q3`.

## Risks & Mitigations
- ESPN API changes/outages → stronger fallback and stale banner.
- Admin errors → pre-save validation + diff preview + backups.
- UI complexity → keep components small, memoize, and guard interactions.

## Task Checklist
- [ ] Status badges (Alive/Eliminated/Buyback)
- [ ] Margin breakdown tooltip
- [ ] Collapsible per-week margins table
- [ ] Game notes on schedule/manager rows
- [ ] Pick lock indicators
- [ ] Admin JSON Schema validation
- [ ] Admin diff preview
- [ ] ESPN fetch retry/backoff
- [ ] Stale data banner
- [ ] Throttle + memoize
- [ ] Lazy-load audio + mute toggle
