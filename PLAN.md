# NFL Survivor Pool Website Improvement Plan

Author: Cascade (AI)
Created: 2025-08-07

## Context
- Simple static site to track an NFL preseason survivor pool.
- Admin edits `data.json` via `admin.html`. Public display is `index.html`.
- No backend; security is not a priority for this one-time use.

## Objectives
1) Improve reliability of data edits (avoid unintended reverts).
2) Enforce basic survivor rule (no duplicate team per manager, if enabled).
3) Ensure accurate margin/draft-order logic on the public page.
4) Improve UX/accessibility (labels, aria, button states, small guidance text).

## Scope
- Files: `admin.html`, `index.html`.
- Data: `data.json` (download/import flow for persistence on static hosting).

## Tasks
- [ ] Admin: Remove forced reloads after edits that overwrite local changes.
- [ ] Admin: Add cache-busting to `fetch('data.json')` to avoid stale cache.
- [ ] Admin: Prevent duplicate team picks per manager (disable already-used options and validate on change).
- [ ] Admin: Add import JSON button and an "Unsaved changes" indicator (set when edits occur, clear on download).
- [ ] Admin: Accessibility polish (modal roles/ESC close, aria-live notifications, labels/ids for inputs).
- [ ] Admin: Optional utility buttons (Copy JSON to clipboard).
- [ ] Index: Use stored `pick.margin` for totals; only sum where `result === 'W'`.
- [ ] Index: Disable refresh button while refreshing; add aria-labels for icon-only buttons.
- [ ] Index: Add concise legend for W/L and tiebreakers; add timezone note in schedule.
- [ ] Index: Optional: backoff polling when no live games.

## Implementation Order
1) Reliability: Admin forced reload removal + cache-busting.
2) Rule enforcement: Duplicate team prevention.
3) Public accuracy: Margin total calculation and UI feedback on refresh.
4) UX/Accessibility: aria labels, modal improvements, small guidance text.
5) Persistence UX: Import JSON + unsaved changes indicator.

## Acceptance Criteria
- Admin edits persist in memory without being overwritten by auto reloads.
- Admin loads latest `data.json` (cache-busted).
- Selecting a team already used by the same manager in another week is blocked/disabled.
- Index totals match saved margins; no double-counting from live recompute.
- Refresh button disabled during fetch; icon-only buttons have `aria-label`.
- Visible short legend on index explains W/L and draft order tiebreakers; schedule notes timezone.

## Rollback Plan
- If changes cause issues, revert to previous commit or undo sections in a single file (changes are localized, minimal risk).

## Notes
- Since this is static hosting, saving server-side will fail; download/import is the reliable path.
- For future reuse, consider a tiny backend or GitHub Pages + PR-based JSON updates.
