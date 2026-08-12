# Howboutit-survivor-pool

2026 NFL Preseason Survivor Pool Tracker

## Overview

Single-page React app (vanilla React via `<script>` in `index.html`) hosted on GitHub Pages. It tracks preseason picks, live scores, cumulative margins, eliminations, and fantasy draft order. The companion `admin.html` page manages picks and can persist them to a GitHub Gist.

## 2026 Season

- The active pool covers official preseason Weeks 1-3, August 13-29, 2026. The standalone Hall of Fame Game is excluded.
- `data.json` is reset for the ten returning managers. Their `lastYearRank` values are the final 2025 pool order and serve as the last tiebreaker.
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

## Data and Persistence

- Public reads use the configured GitHub Gist only when it matches the active season; otherwise they fall back to `data.json`.
- Admin writes require a Gist token stored in the browser. This client-side setup is acceptable for this private league tool but should not be treated as secure.
- Optional public auto-persist includes the season, managers, game results, and update timestamp. It remains disabled until the Gist already contains 2026 data.
- Fantasy ADP is configured for 2026 in `config.json`.

## Local Development

1. Start a local web server in the repository (for example, `python -m http.server 8000`).
2. Open `http://localhost:8000/` for the public site.
3. Open `http://localhost:8000/admin.html` for administration.
4. There is no build step.

Browser state:

- `localStorage.gistId` and `localStorage.gistToken` configure Gist saves.
- `localStorage.autoPersistEnabled` toggles automatic live-result saves.
- `localStorage.mutedAudio` persists the global mute setting.
- The default admin password for a new browser is `survivor2026`; change it after first login.

## Notes

- Times are displayed in Eastern Time.
- Ties contribute zero and do not eliminate a manager.
- Draft order is based on survival, cumulative margin, active/elimination-week margin, then the prior year's finish.
