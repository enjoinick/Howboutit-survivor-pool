# Howboutit-survivor-pool

2026 NFL Preseason Survivor Pool Tracker

## Overview

Single-page React app (vanilla React via `<script>` in `index.html`) hosted on GitHub Pages. It tracks preseason picks, live scores, cumulative margins, eliminations, and fantasy draft order. The public page includes an honor-system weekly pick queue, while the companion `admin.html` page manages overrides and persists data to a GitHub Gist.

## 2026 Season

- The active pool covers official preseason Weeks 1-3, August 13-29, 2026. The standalone Hall of Fame Game is excluded.
- `data.json` contains the ten 2026 managers. Their unique `lastYearRank` values (1 is best) are the agreed 2025 tiebreak order.
- The final 2025 Gist snapshot is preserved in `data-2025.json`.
- Active data must contain `"season": 2026`. Until the configured Gist is updated for 2026, both pages ignore its 2025 data and safely use the repository's starter `data.json`.
- After deployment, open `admin.html` and use **Save to Gist** once to initialize the Gist for 2026. Gist revision history preserves the prior version as an additional backup.

## Current Features

- Manual refresh is throttled to 15 seconds.
- Draft ordering and elimination calculations are memoized.
- ESPN preseason scores refresh every two minutes with retry/backoff.
- Picks lock at their explicit Eastern Time kickoff.
- Audio assets lazy-load and a global mute preference persists in `localStorage`.
- The admin validates data and previews changes before saving to the Gist.
- The public queue shows only the next eligible manager, validates the active week and deadline, and advances after one accepted pick.

## Data and Persistence

- Public reads use the configured GitHub Gist only when it matches the active season; otherwise they fall back to `data.json`.
- The public site never receives or stores a GitHub token. Pick submissions go to a Cloudflare Durable Object that serializes turns and writes to the Gist with a server-side secret.
- Admin writes require a short-lived Gist-only token. The token is kept only in the open admin tab, is never written to `localStorage`, and is cleared after a successful save.
- The admin validates unique manager names, unique tiebreak ranks from 1 through the manager count, and duplicate team picks before saving.
- `data.json.pickQueue` controls the enabled state, active week, explicit turn order, and weekly deadlines. The admin can open/close the queue and advance its active week.
- Fantasy ADP is configured for 2026 in `config.json`.

## Local Development

1. Start a local web server in the repository (for example, `python -m http.server 8000`).
2. Open `http://localhost:8000/` for the public site.
3. Open `http://localhost:8000/admin.html` for administration.
4. There is no build step.

Browser state:

- `localStorage.gistId` stores the non-secret Gist identifier.
- `localStorage.mutedAudio` persists the global mute setting.
- The default admin password for a new browser is `survivor2026`; change it after first login.

The admin password is a local convenience lock, not server-side authentication. The GitHub token is the write credential and should be narrowly scoped, short-lived, and revoked after the pool ends.

## Pick Queue Worker

The Worker lives in `worker/` and uses one SQLite-backed Durable Object to serialize submissions. Deploy it from that directory with Wrangler, then set the `GIST_TOKEN` secret to a token with Gists write permission. `GIST_ID`, allowed browser origins, and the season are non-secret Wrangler variables.

There is intentionally no manager login. Anyone with the pool URL can act for the manager whose turn is displayed, so the queue enforces order and data rules but relies on the league's honor system for identity.

## Notes

- Times are displayed in Eastern Time.
- Ties contribute zero and do not eliminate a manager.
- Draft order is based on survival, cumulative margin, active/elimination-week margin, then the prior year's finish.
