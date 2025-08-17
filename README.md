# Howboutit-survivor-pool
NFL Preseason Survivor Pool Tracker

## Overview
Single-page React app (vanilla React via `<script>` in `index.html`) hosted on GitHub Pages. Tracks a preseason NFL survivor pool with live scores, draft-order logic, manager cards, and an admin panel (`admin.html`) for data edits (persisted to a GitHub Gist).

## Performance & UX Enhancements (2025 Q3)

• **Manual Refresh Throttling**
  - The toolbar and stale banner refresh buttons are throttled to 15 seconds.
  - When on cooldown, the button is disabled and shows a countdown in the tooltip/label.

• **Memoized Derived Computations**
  - Draft ordering and elimination ranking are memoized via `useMemo` and reused across the UI.
  - The Stats Overview counts use `orderedManagers` (which includes `eliminationWeek`) to avoid recomputation.

• **Audio Lazy-Load + Global Mute**
  - Easter egg audio assets now load lazily (`preload="none"`).
  - A global mute toggle in the toolbar controls all easter-eggs and persists to `localStorage`.
  - Local storage key: `mutedAudio` = `"true" | "false"`.

## Data & Persistence
• Public reads from this repo’s `data.json` or a configured GitHub Gist.
• Admin writes from `admin.html` to the configured Gist (token stored client-side; low security acceptable for this project).
• Live NFL scores via ESPN public scoreboard API.

## Local Development
1) Open `index.html` in a local server (or use GitHub Pages). No build step required.
2) Optional: open `admin.html` to edit managers/results and save to your Gist.
3) Environment/state
   - `localStorage.gistId` and `localStorage.gistToken` for admin saves.
   - `localStorage.autoPersistEnabled` toggles auto-save of live state.
   - `localStorage.mutedAudio` persists the global mute toggle.

## Notes
• The per-manager margins table includes a Running Total that sums decided games (W/L); ties contribute 0 and are displayed as 0.
• Times shown are Eastern Time; kickoff lock indicators are derived from live state where possible, with ET as fallback.
