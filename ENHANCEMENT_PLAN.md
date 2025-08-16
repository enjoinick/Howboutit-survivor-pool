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
- [x] Status badges (Alive/Eliminated/Buyback)
- [x] Margin breakdown tooltip
- [ ] Collapsible per-week margins table
- [ ] Game notes on schedule/manager rows
- [ ] Pick lock indicators
- [x] Admin JSON Schema validation
- [x] Admin diff preview
- [x] ESPN fetch retry/backoff
- [x] Stale data banner
- [ ] Throttle + memoize
- [ ] Lazy-load audio + mute toggle

---

## Acceptance Criteria (Feature-level)

- **Status badges**
  - Shows “Alive” (green) if not eliminated; “Eliminated W#” (red) with correct week number if eliminated; “Buyback” (purple) when `mgr.buyback === true`.
  - Badges appear next to manager name in `index.html` manager cards and render consistently on mobile/desktop.

- **Margin breakdown tooltip**
  - Hovering over the “Margin” value shows a multiline tooltip listing each contributing week and the total.
  - Eliminated managers include only wins up to elimination and the elimination-week negative margin exactly once.
  - Tooltip matches the value of `getCumulativeMargin(mgr)`.

- **Collapsible per-week margins table**
  - Expanding a manager row reveals a table with columns: Week, Team, Result (W/L/T), Margin, Running Total.
  - Values use live outcomes where available; ties/early endings are labeled.
  - Table is responsive and does not exceed 300 lines of component code.

- **Game notes on schedule/manager rows**
  - If a game has `notes`, an info icon appears; hover or tap shows the note.
  - Notes surface on both schedule cards and adjacent to the relevant pick in the manager’s list.

- **Pick lock indicators**
  - For the active week, picks are marked “Locked” once their game’s kickoff time has passed (UTC safe).
  - Locked picks are visually distinct (e.g., lock icon + subdued style).

- **Admin JSON Schema validation**
  - On clicking Save in `admin.html`, data is validated; invalid fields produce inline, human-readable errors with field paths.
  - Save is blocked until validation passes.

- **Admin diff preview**
  - Before saving, a unified diff shows additions/removals/changes for `data.json`.
  - User can cancel or confirm. Confirm performs the Gist PATCH.

- **ESPN fetch retry/backoff**
  - On transient failures (network/5xx), retries up to N times with exponential backoff and jitter.
  - After retries, app falls back to stored `gameResults` without console spam; a subtle banner can indicate stale/live fallback.

- **Stale data banner**
  - If `lastUpdated` age exceeds threshold (e.g., 10 minutes during games), show banner: “Data last updated Xm ago”.
  - Banner disappears automatically when fresh data arrives.

- **Throttle + memoize**
  - Manual refresh cannot be spammed (cooldown e.g., 5s). Auto-refresh uses a sane interval.
  - Expensive computations are memoized with stable deps; renders are smooth.

- **Lazy-load audio + mute toggle**
  - Audio assets load only on first interaction or when an easter egg triggers.
  - A global mute toggle persists in `localStorage`.

---

## Technical Design Details

- **Margin breakdown helper** (`index.html`)
  - Function: `getMarginBreakdown(mgr)` returns a newline-joined string: `W{week} {team}: ±{diff}` and `Total: X`.
  - Uses same elimination logic as `getCumulativeMargin(mgr)` to avoid mismatches.

- **Collapsible table** (`index.html`)
  - Add computed array via a new pure helper `buildMarginRows(mgr)`:
    - Row shape: `{ week, team, result, diff, runningTotal, note? }`.
    - Source `result/diff` from live outcomes first, fallback to stored.
  - Render under existing Weekly Picks, behind the current expand toggle.

- **Game notes mapping** (`data.json` → UI)
  - Expect optional `notes` per game in `gameResults.weekN[i].notes`.
  - In schedule cards and manager picks: if a pick’s team matches a game entry with `notes`, show an info icon with tooltip.

- **Pick lock indicators** (`index.html`)
  - Use `computeCalendarState(preseasonSchedule)` for active week.
  - For each pick in active week, compare current UTC time to that game’s kickoff UTC; if past, mark “Locked”.
  - Disable any UI affordance suggesting edit once locked (visual only if no edit controls exist for public view).

- **Admin JSON Schema** (`admin.html`)
  - Define a client-side JSON Schema (Draft-07+). Key fields:
    - `managers[]`: `{ name: string, teamLabel?: string, picks: [{ week: number, team?: string, result?: 'W'|'L'|'T', margin?: number, manualResult?: boolean }] , buyback?: boolean, lastYearRank?: number }`
    - `gameResults`: `{ [week: string]: [{ homeTeam: string, awayTeam: string, score?: number, oppScore?: number, isWinner?: boolean, isTie?: boolean, state?: 'pre'|'in'|'post', kickoff?: string, notes?: string }] }`
    - `lastUpdated?: string (ISO)`
  - Validate with a lightweight validator (e.g., `ajv` via CDN) and display errors with JSON Pointer paths.

- **Admin diff preview** (`admin.html`)
  - Compute diff between current in-memory JSON and edited JSON using a small diff library (e.g., `diff` CDN) or custom line-by-line JSON stringify with stable sorting.
  - Render unified diff with syntax colors; confirm → PATCH to Gist API; cancel → return to edit.

- **Gist backup**
  - Optional: add `data-YYYYMMDD-HHmm.json` file in same Gist on save (second PATCH) for easy rollback.

- **ESPN fetch retry/backoff** (`index.html`)
  - Wrapper `fetchWithRetry(url, opts)` with params: `retries=5`, `baseDelay=1000ms`, `factor=2`, jitter up to ~250ms.
  - Optional future: cache `ETag`/`Last-Modified` and use conditional requests when supported; on 304, reuse cache.
  - On hard failure, log once (debug mode) and fallback to `gameResults`.

- **Stale data banner** (`index.html`)
  - Compute `ageMs = now - new Date(lastUpdated)`; threshold fixed at 10 minutes.
  - Show a dismissible banner in the header; auto-hide on refresh or when fresh data arrives.

- **Performance**
  - Memoize `orderedManagers`, `winsToDate`, and any derived arrays with `useMemo` and stable deps.
  - Throttle manual refresh button with a timer; disable button during cooldown.
  - Defer audio loading until first play; keep refs but lazy import sources.

---

## JSON Schema (outline)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["managers", "gameResults"],
  "properties": {
    "managers": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "picks"],
        "properties": {
          "name": { "type": "string", "minLength": 1 },
          "teamLabel": { "type": "string" },
          "buyback": { "type": "boolean" },
          "lastYearRank": { "type": "number" },
          "picks": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["week"],
              "properties": {
                "week": { "type": "number", "minimum": 1 },
                "team": { "type": "string" },
                "result": { "type": "string", "enum": ["W", "L", "T"] },
                "margin": { "type": "number" },
                "manualResult": { "type": "boolean" }
              }
            }
          }
        }
      }
    },
    "gameResults": {
      "type": "object",
      "patternProperties": {
        "^week\\d+$": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["homeTeam", "awayTeam"],
            "properties": {
              "homeTeam": { "type": "string" },
              "awayTeam": { "type": "string" },
              "score": { "type": "number" },
              "oppScore": { "type": "number" },
              "isWinner": { "type": "boolean" },
              "isTie": { "type": "boolean" },
              "state": { "type": "string", "enum": ["pre", "in", "post"] },
              "kickoff": { "type": "string", "format": "date-time" },
              "notes": { "type": "string" }
            }
          }
        }
      }
    },
    "lastUpdated": { "type": "string", "format": "date-time" }
  }
}
```

---

## Testing Plan

- **Unit tests** (optional, if we extract helpers):
  - `getCumulativeMargin` scenarios: multiple wins, eliminated with loss week, tie handling.
  - `buildMarginRows` correctness of running total and notes propagation.
  - Pick lock logic across timezones (use fixed Date mocks).

- **Manual QA matrix**:
  - Alive vs eliminated, with and without buyback.
  - Active week in-progress vs posted vs pre.
  - ESPN outage simulation (force fetch failure) → fallback and stale banner.
  - Admin invalid JSON (missing fields, wrong types) → validation messages.
  - Diff preview correctness on add/remove/modify.

---

## Milestones & Estimates

- Phase 1 (UX): 0.5–1 day
- Phase 2 (Admin): 1–1.5 days
- Phase 3 (Reliability): 0.5–1 day
- Phase 4 (Performance): 0.5 day

---

## PR & Release Checklist

- [ ] Feature flags/toggles read from `config.json` where applicable.
- [ ] Screenshots/GIFs of new UI flows (badges, tooltip, notes, diff preview).
- [ ] Validation errors are readable and actionable.
- [ ] Fallback paths don’t spam console in production; debug mode gated.
- [ ] PWA cache version bumped if HTML changes affect cache.
- [ ] Update `README.md` with any new instructions (e.g., schema, admin flow).
- [ ] Post-deploy smoke test on GitHub Pages (load, refresh, banner, picks).
