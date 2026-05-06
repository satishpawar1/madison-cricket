# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Madison Cricket Club (MCC) web app — a static site for tracking two club teams (Lions & Tigers) with player stats, game schedules, availability tracking, and opponent scouting.

## Architecture

**No build system.** The frontend is pure vanilla HTML/JS/CSS — no npm, no bundler, no framework. Open HTML files directly in a browser or serve them statically.

**Three data sources loaded via `<script>` tags:**
- `config.js` — exports `MCC_CONFIG`: player rosters, game schedules, Google Apps Script URL. Edit manually when rosters or schedules change.
- `cricclubs-stats.js` — exports `CRICCLUBS_STATS`: auto-generated stats from scraper. Never edit by hand.
- `toss-data.js` — exports `TOSS_DATA`: auto-generated toss results from scraper. Never edit by hand.

**Data flow:**
```
CricClubs API → scraper/fetch-stats.js (Puppeteer) → cricclubs-stats.js
CricClubs API → scraper/fetch-toss.js  (Puppeteer) → toss-data.js + scraper/toss-results.json
CricClubs API → scraper/scrape-dotballs.js          → pushes to Google Sheets via Apps Script
Google Apps Script (Google Sheets) → availability/selection/catches/dotballs → HTML pages (via XHR)
```

**Stats object shape** (`CRICCLUBS_STATS`):
```
{ lastUpdated, lions: { batting, bowling, rankings, results }, tigers: { ... },
  combined: { ... }, opponents: { teamName: { batting, bowling } }, standings, results }
```

## Files Claude Must NOT Read

These files are large auto-generated or debug artifacts. Their shape is documented below — reading the actual files wastes context.

| File | Size | Why to skip |
|------|------|-------------|
| `cricclubs-stats.js` | 314 KB, 13,336 lines | Auto-generated. Shape documented in "Data Shape Reference" below. |
| `toss-data.js` | 13 KB | Auto-generated. Shape: array of `{matchId, date, team1, team2, tossWinner, electedTo}`. |
| `scraper/all-api-calls.json` | 523 KB | Debug instrumentation log — never needed. |
| `scraper/stats-raw.json` | 127 KB | Raw API response cache — never needed. |
| `scraper/package-lock.json` | 57 KB | Lockfile — never edit manually. |

If a task requires knowing what data is available, use the shape docs below — do not open the files.

## CRICCLUBS_STATS Data Shape Reference

Use this instead of reading `cricclubs-stats.js`.

```js
CRICCLUBS_STATS = {
  lastUpdated: "ISO string",
  lions: {
    batting:      [{name, team, matches, innings, notOuts, runs, fours, sixes, fifties, hundreds, highest, strikeRate, average}],
    bowling:      [{name, team, matches, innings, overs, wickets, runs, maidens, bestFigures, wides, noballs, average, economy, strikeRate}],
    rankings:     [{name, team, matches, batting, bowling, fielding, total, mom}],
    results:      [{vs, date, runs, wickets, won, noResult}],
    bowlingGames: [{matchId, game, date, players: [{name, overs, balls, dots, runs, wickets, economy, wides, noballs}]}]
  },
  tigers: { /* same structure as lions */ },
  combined: { rankings: [...] },
  opponents:     { "Team Name": { batting: [...], bowling: [...] } },
  opponents2025: { /* same keyed structure */ },
  standings: [{team, matches, won, lost, noResult, tied, points, nrr}],
  results:   { "Team Name": { games: [...], highestTotal, lowestTotal, averageScore } }
}
```

**Page → Data section mapping:**

| Pages | Sections actually used |
|-------|----------------------|
| `lions-dashboard.html`, `bowling-dots-dashboard.html`, `bowling-extras-dashboard.html` | `lions` only |
| `tigers-dashboard.html` | `tigers` only |
| `index.html`, `game-results.html` | `results` only |
| `stats-leaderboard.html` | `lastUpdated`, `lions`, `tigers`, `combined` |
| `opponent-analysis.html` | `opponents`, `opponents2025`, `standings`, `results` |
| `catch/dotball pages`, `lions.html`, `tigers.html` | None — data from Google Sheets via XHR |

## Running the Scrapers

All scrapers live in `scraper/` and use Puppeteer. Install deps once:

```bash
cd scraper && npm ci
```

| Script | Purpose | Output |
|--------|---------|--------|
| `node fetch-stats.js` | Full season batting/bowling stats | `cricclubs-stats.js` |
| `node fetch-toss.js` | Toss results (incremental — skips already-scraped matches) | `toss-data.js`, `scraper/toss-results.json` |
| `node scrape-dotballs.js lions` | Ball-by-ball dot balls for Lions | Pushes to Google Sheets |
| `node scrape-dotballs.js tigers` | Ball-by-ball dot balls for Tigers | Pushes to Google Sheets |
| `node push-dotballs.js lions` | Seed Sheets with preset Lions dot ball data | Pushes to Google Sheets |
| `node push-historical-catches.js` | Seed Sheets with historical catch data | Pushes to Google Sheets |

The GitHub Actions workflow (`.github/workflows/update-stats.yml`) triggers manually and runs `fetch-stats.js` + `fetch-toss.js`, then auto-commits changed files.

If scraper fields stop populating, check `scraper/explore-endpoints.js` to inspect current CricClubs API field names.

## Pages & Their Roles

| Page | Purpose |
|------|---------|
| `index.html` | Schedule hub — reads `MCC_CONFIG` games + `CRICCLUBS_STATS.results` for Won/Lost badges |
| `lions.html` / `tigers.html` | Player availability & XI selection (persists via Google Apps Script) |
| `lions-dashboard.html` / `tigers-dashboard.html` | Per-player batting/bowling/ranking stats + game breakdown |
| `lions-catch-log.html` / `tigers-catch-log.html` | Log catch attempts per game |
| `lions-catch-dashboard.html` / `tigers-catch-dashboard.html` | Fielding efficiency rankings |
| `lions-dotball-log.html` / `tigers-dotball-log.html` | Log dot balls per game (reads from Google Sheets) |
| `dotball-dashboard.html` | Batting dot ball % rankings across both teams |
| `bowling-dots-dashboard.html` | Bowling dot ball stats per bowler per game |
| `bowling-extras-dashboard.html` | Bowling extras (wides/no-balls) from match scorecards |
| `stats-leaderboard.html` | Combined Lions+Tigers league-wide rankings |
| `opponent-analysis.html` | Scout opponents — strength, main batters/bowlers, standings, results |
| `game-results.html` | 2026 season results overview |

## Key Logic

**`config.js`** — The source of truth for:
- `MCC_CONFIG.lions.players` / `MCC_CONFIG.tigers.players` — player roster arrays
- `MCC_CONFIG.lions.games` / `MCC_CONFIG.tigers.games` — game schedule objects (date, time, ground, opponent, `gameDate` in ISO format, optional `cricclubsTeam` for opponent matching)
- `MCC_CONFIG.lions.gameNameMap` / `MCC_CONFIG.tigers.gameNameMap` — maps config opponent names to Google Sheet tab names when they differ
- `MCC_CONFIG.SCRIPT_URL` — Google Apps Script endpoint for all read/write operations on availability/selection/catches/dotballs

**`scrape-dotballs.js`** — Match IDs and team name maps are hardcoded per season. When new games are played, add the `matchId` to `LIONS_MATCHES` or `TIGERS_MATCHES` and map any abbreviated ball-by-ball player names in `LIONS_BBB_NAME_MAP` / `TIGERS_BBB_NAME_MAP`.

**Opponent matching** — `opponent-analysis.html` maps config game opponent names to CricClubs team names for stat lookups.

**Main bowler filter** — requires avg 2+ overs per innings bowled, plus economy ≤7 OR average <10.

**Main batter filter** — requires avg 30+, strike rate 100+.

## Adding a New Season / Updating Rosters

1. Edit `config.js`: update `players` arrays and `games` arrays for each team.
2. Re-run `fetch-stats.js` and `fetch-toss.js` after season games are recorded on CricClubs.
3. Update `LEAGUE_*` constants in `fetch-stats.js` and `fetch-toss.js` if the CricClubs league ID changes.
4. Update match ID lists in `scrape-dotballs.js` as new games complete.
5. No HTML page changes needed unless the stats object structure changes.

## Common Task Recipes

**Add a new match to dot-ball scraper:**
1. Add `{ game: 'OpponentName', matchId: NNNN, battingTeam: 'Madison Lions' }` to `LIONS_MATCHES` or `TIGERS_MATCHES` in `scraper/scrape-dotballs.js`
2. Add any new player name abbreviations to `LIONS_BBB_NAME_MAP` / `TIGERS_BBB_NAME_MAP`
3. `cd scraper && node scrape-dotballs.js lions` (or tigers)

**Add a player to the roster:**
Edit `config.js` → `MCC_CONFIG.lions.players` or `.tigers.players` (string arrays).

**Add/update a game in the schedule:**
Edit `config.js` → `MCC_CONFIG.lions.games`. Required fields: `{ name, opponent, day, date, time, warmup, ground, gameDate }`. Optional: `cricclubsTeam` when the CricClubs team name differs from `opponent`.

**Run stats update locally:**
`cd scraper && node fetch-stats.js` — writes `cricclubs-stats.js`
`cd scraper && node fetch-toss.js` — writes `toss-data.js` + `scraper/toss-results.json`

**Trigger GitHub Actions stats update:**
`gh workflow run update-stats.yml`

**Debug scraper field changes:**
`cd scraper && node explore-endpoints.js` — inspects current CricClubs API field names.

**Edit a Lions/Tigers page pair:**
Treat the Lions page as the canonical template. Read only the Lions version, apply the edit, then mirror it to the Tigers version without re-reading it. The only intentional differences between pairs are: header gradient colors (`#1A56B0`/`#0C3A7A` Lions vs `#C05000`/`#7A3200` Tigers), team name strings, and `MCC_CONFIG.lions` vs `MCC_CONFIG.tigers` references.
