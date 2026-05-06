'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ── Parse auto-generated data files ──────────────────────────────────────────

function parseJsVar(file, varName) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const m = src.match(new RegExp(`var ${varName}\\s*=\\s*([\\s\\S]*?);?\\s*$`));
  if (!m) throw new Error(`Could not parse ${varName} from ${file}`);
  return JSON.parse(m[1]);
}

const STATS = parseJsVar('cricclubs-stats.js', 'CRICCLUBS_STATS');
const TOSS  = parseJsVar('toss-data.js',       'TOSS_DATA');

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoToDate(iso) {
  // YYYY-MM-DD → comparable string (already comparable as string)
  return iso;
}

function findToss(date, teamName) {
  return TOSS.find(t => t.date === date &&
    (t.team1.includes(teamName) || t.team2.includes(teamName)));
}

function fmtScore(runs, wickets, overs) {
  const w = (wickets != null && wickets < 10) ? `/${wickets}` : '';
  const o = overs ? ` (${overs} ov)` : '';
  return `${runs}${w}${o}`;
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ── Per-team match data extraction ───────────────────────────────────────────

function getTeamData(teamKey, cricclubsName) {
  const teamStats  = STATS[teamKey];
  const resultsMap = STATS.results || {};
  const teamResults = resultsMap[cricclubsName];

  // Most recent game from results (sorted ascending → last entry = most recent)
  const playedGames = (teamResults && teamResults.games) || [];
  const latestGame  = playedGames.length
    ? playedGames.slice().sort((a, b) => b.date.localeCompare(a.date))[0]
    : null;

  if (!latestGame) return null;

  // Opponent scorecard (their batting = our bowling perspective)
  const oppResults  = resultsMap[latestGame.opponent] || {};
  const oppGame     = (oppResults.games || []).find(g => g.opponent === cricclubsName);

  // Bowling game entry for this match
  const bowlingGames = teamStats.bowlingGames || [];
  const bowlingEntry = bowlingGames
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .find(bg => bg.date === latestGame.date ||
                bg.game.toLowerCase() === latestGame.opponent.toLowerCase());

  // Toss + Player of the Match
  const shortName = teamKey === 'lions' ? 'Madison Lions' : 'Madison Tigers';
  const toss = findToss(latestGame.date, shortName);

  // Bowling highlights
  let bowlingHighlights = null;
  if (bowlingEntry && bowlingEntry.players && bowlingEntry.players.length) {
    const players = bowlingEntry.players;
    const totalBalls = players.reduce((s, p) => s + (p.balls || 0), 0);
    const totalDots  = players.reduce((s, p) => s + (p.dots || 0), 0);
    const totalWides = players.reduce((s, p) => s + (p.wides || 0), 0);
    const totalNB    = players.reduce((s, p) => s + (p.noballs || 0), 0);

    const best = players
      .filter(p => p.balls > 0)
      .sort((a, b) => {
        if (b.wickets !== a.wickets) return b.wickets - a.wickets;
        return (a.economy || 99) - (b.economy || 99);
      })[0];

    bowlingHighlights = { best, totalBalls, totalDots, totalWides, totalNB };
  }

  // Season leaders
  const topBatter = (teamStats.batting || [])[0] || null;
  const topBowler = (teamStats.bowling || [])[0] || null;

  return { latestGame, oppGame, toss, bowlingHighlights, topBatter, topBowler };
}

// ── Standings ─────────────────────────────────────────────────────────────────

function getStandings() {
  const all = STATS.standings || [];
  const lions  = all.find(s => s.team === 'Madison Lions');
  const tigers = all.find(s => s.team === 'Madison Tigers');
  return { lions, tigers };
}

// ── HTML rendering ────────────────────────────────────────────────────────────

function renderTeamSection(label, emoji, color, data) {
  if (!data) {
    return `
    <div class="team-section">
      <h2 style="color:${color}">${emoji} ${label}</h2>
      <p class="muted">No games played yet this season.</p>
    </div>`;
  }

  const { latestGame, oppGame, toss, bowlingHighlights, topBatter, topBowler } = data;

  const resultText  = latestGame.noResult ? 'No Result' : (latestGame.won ? 'Won' : 'Lost');
  const resultClass = latestGame.noResult ? 'nr' : (latestGame.won ? 'won' : 'lost');

  const mccScore = fmtScore(latestGame.runsScored, latestGame.wickets, latestGame.overs);
  const oppScore = oppGame
    ? fmtScore(oppGame.runsScored, oppGame.wickets, oppGame.overs)
    : (latestGame.runsConceded != null ? `${latestGame.runsConceded}` : '—');

  const gameDate = new Date(latestGame.date + 'T00:00:00');
  const dateStr  = gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  let tossLine = '';
  if (toss) {
    const winner = toss.tossWinner.replace('Madison Lions', 'Lions').replace('Madison Tigers', 'Tigers');
    tossLine = `<div class="info-row"><span class="info-label">Toss</span><span>${winner} won, elected to ${capitalize(toss.electedTo)}</span></div>`;
    if (toss.playerOfMatch) {
      tossLine += `<div class="info-row"><span class="info-label">POTM</span><span><strong>${toss.playerOfMatch}</strong></span></div>`;
    }
  }

  let bowlingSection = '';
  if (bowlingHighlights) {
    const { best, totalWides, totalNB } = bowlingHighlights;
    const bestLine = best
      ? `<strong>${best.name}</strong> — ${best.wickets}/${best.runs} (${best.overs} ov), Econ ${(best.economy || 0).toFixed(1)}`
      : '—';
    bowlingSection = `
      <div class="section-title">Bowling Highlights</div>
      <div class="info-row"><span class="info-label">Best</span><span>${bestLine}</span></div>
      <div class="info-row"><span class="info-label">Extras</span><span>${totalWides}w ${totalNB}nb</span></div>`;
  } else {
    bowlingSection = `<div class="muted" style="margin-top:0.5rem">Bowling breakdown pending scorecard upload.</div>`;
  }

  const batterLine = topBatter
    ? `<strong>${topBatter.name}</strong> — ${topBatter.runs} runs | Avg ${topBatter.average} | SR ${topBatter.strikeRate} | HS ${topBatter.highest}`
    : '—';
  const bowlerLine = topBowler
    ? `<strong>${topBowler.name}</strong> — ${topBowler.wickets} wkts | Econ ${topBowler.economy} | Best ${topBowler.bestFigures}`
    : '—';

  return `
    <div class="team-section">
      <h2 style="color:${color}">${emoji} ${label} <span class="vs-label">vs ${latestGame.opponent}</span></h2>
      <div class="date-line">${dateStr}</div>

      <div class="result-badge result-${resultClass}">${resultText}</div>

      <div class="scores">
        <div class="score-row">
          <span class="score-team">${label}</span>
          <span class="score-num">${mccScore}</span>
        </div>
        <div class="score-row">
          <span class="score-team">${latestGame.opponent}</span>
          <span class="score-num">${oppScore}</span>
        </div>
      </div>

      ${tossLine}

      ${bowlingSection}

      <div class="section-title" style="margin-top:1rem">Season Leaders</div>
      <div class="info-row"><span class="info-label">Batting</span><span>${batterLine}</span></div>
      <div class="info-row"><span class="info-label">Bowling</span><span>${bowlerLine}</span></div>
    </div>`;
}

function renderStandingsSection(standings) {
  const { lions, tigers } = standings;

  function row(s, emoji, color) {
    if (!s) return `<tr><td>${emoji}</td><td colspan="6" class="muted">—</td></tr>`;
    const name = s.team.replace('Madison ', '');
    return `<tr>
      <td style="color:${color};font-weight:700">${emoji} ${name}</td>
      <td>${s.matches}</td>
      <td>${s.won}</td>
      <td>${s.lost}</td>
      <td>${s.points}</td>
      <td>${s.nrr != null ? (s.nrr >= 0 ? '+' : '') + Number(s.nrr).toFixed(3) : '—'}</td>
    </tr>`;
  }

  return `
    <div class="standings-section">
      <div class="section-title">League Standings</div>
      <table class="standings-table">
        <thead><tr><th>Team</th><th>P</th><th>W</th><th>L</th><th>Pts</th><th>NRR</th></tr></thead>
        <tbody>
          ${row(lions,  '🦁', '#1A56B0')}
          ${row(tigers, '🐯', '#C05000')}
        </tbody>
      </table>
    </div>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const lionsData  = getTeamData('lions',  'Madison Lions');
const tigersData = getTeamData('tigers', 'Madison Tigers');
const standings  = getStandings();

const updatedAt = STATS.lastUpdated
  ? new Date(STATS.lastUpdated).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
  : 'unknown';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta property="og:title" content="MCC Match Summary">
<meta property="og:description" content="Latest Lions &amp; Tigers match results and stats">
<title>MCC Match Summary</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F3F4F6; color: #111827; }
  .container { max-width: 640px; margin: 0 auto; padding: 1rem; }
  header { background: #0C3A7A; color: #fff; padding: 1rem; border-radius: 10px; margin-bottom: 1rem; text-align: center; }
  header h1 { font-size: 1.25rem; font-weight: 700; }
  header p  { font-size: 0.8rem; opacity: 0.75; margin-top: 0.25rem; }
  .team-section { background: #fff; border-radius: 10px; padding: 1rem; margin-bottom: 1rem; box-shadow: 0 1px 4px rgba(0,0,0,0.07); }
  h2 { font-size: 1.1rem; font-weight: 700; display: flex; align-items: baseline; gap: 0.5rem; flex-wrap: wrap; }
  .vs-label { font-size: 0.85rem; font-weight: 400; color: #6B7280; }
  .date-line { font-size: 0.8rem; color: #6B7280; margin: 0.25rem 0 0.75rem; }
  .result-badge { display: inline-block; padding: 0.2rem 0.75rem; border-radius: 999px; font-size: 0.8rem; font-weight: 700; margin-bottom: 0.75rem; }
  .result-won  { background: #E2F5EE; color: #0F5C43; }
  .result-lost { background: #FEE2E2; color: #991B1B; }
  .result-nr   { background: #FEF3C7; color: #92400E; }
  .scores { margin-bottom: 0.75rem; }
  .score-row { display: flex; justify-content: space-between; padding: 0.3rem 0; border-bottom: 1px solid #F3F4F6; font-size: 0.9rem; }
  .score-team { color: #374151; }
  .score-num  { font-weight: 700; font-variant-numeric: tabular-nums; }
  .section-title { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9CA3AF; margin: 0.75rem 0 0.4rem; }
  .info-row { display: flex; gap: 0.5rem; font-size: 0.85rem; padding: 0.2rem 0; align-items: baseline; }
  .info-label { flex-shrink: 0; width: 80px; font-size: 0.75rem; color: #9CA3AF; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  .muted { font-size: 0.8rem; color: #9CA3AF; }
  .standings-section { background: #fff; border-radius: 10px; padding: 1rem; margin-bottom: 1rem; box-shadow: 0 1px 4px rgba(0,0,0,0.07); }
  .standings-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 0.5rem; }
  .standings-table th { text-align: left; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: #9CA3AF; padding: 0.25rem 0.4rem; }
  .standings-table td { padding: 0.35rem 0.4rem; border-top: 1px solid #F3F4F6; }
  .dashboard-link { display: block; text-align: center; background: #0C3A7A; color: #fff; padding: 0.75rem 1rem; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 0.9rem; margin-bottom: 1rem; }
  .dashboard-link:hover { background: #1A56B0; }
  footer { text-align: center; font-size: 0.75rem; color: #9CA3AF; padding-bottom: 1.5rem; }
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>Madison Cricket Club</h1>
    <p>Match Summary · Stats updated ${updatedAt}</p>
  </header>

  ${renderTeamSection('Lions', '🦁', '#1A56B0', lionsData)}
  ${renderTeamSection('Tigers', '🐯', '#C05000', tigersData)}
  ${renderStandingsSection(standings)}

  <a class="dashboard-link" href="https://satishpawar1.github.io/madison-cricket/">Full Stats Dashboard &rarr;</a>

  <footer>Auto-generated · Madison Cricket Club 2026</footer>
</div>
</body>
</html>`;

const outPath = path.join(ROOT, 'latest-match-summary.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log(`Written: ${outPath}`);
