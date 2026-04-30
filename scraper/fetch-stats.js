const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const PAGES = [
  {
    label: 'rankings',
    url: 'https://cricclubs.com/NashvilleCricketLeague/statistics/rankings-records?year=2026&leagueId=Pj7NL8S3pXOPdIPaHDwboQ&matchType=all&series=WfZbUYmZkdi9WXyOM_8S1A&seriesName=2026+-+Tape+20',
    match: 'getPlayerRankings'
  },
  {
    label: 'batting',
    url: 'https://cricclubs.com/NashvilleCricketLeague/statistics/batting-records?filter=Most+Runs&year=2026&leagueId=Pj7NL8S3pXOPdIPaHDwboQ&matchType=All&series=WfZbUYmZkdi9WXyOM_8S1A&seriesName=2026+-+Tape+20',
    match: 'getBattingStats'
  },
  {
    label: 'bowling',
    url: 'https://cricclubs.com/NashvilleCricketLeague/statistics/bowling-records?filter=Most+Wickets&year=2026&leagueId=Pj7NL8S3pXOPdIPaHDwboQ&matchType=All&series=WfZbUYmZkdi9WXyOM_8S1A&seriesName=2026+-+Tape+20',
    match: 'getBowlingStats'
  },
  {
    label: 'results',
    url: 'https://cricclubs.com/NashvilleCricketLeague/results?leagueId=Pj7NL8S3pXOPdIPaHDwboQ&year=2026&series=WfZbUYmZkdi9WXyOM_8S1A&seriesName=2026+-+Tape+20',
    match: 'WfZbUYmZkdi9WXyOM_8S1A/matches',
  },
  {
    label: 'standings',
    url: 'https://cricclubs.com/NashvilleCricketLeague/points-table?leagueId=Pj7NL8S3pXOPdIPaHDwboQ&year=2026&series=WfZbUYmZkdi9WXyOM_8S1A&seriesName=2026+-+Tape+20',
    match: 'getPointsTable',
  },
  {
    label: 'standings2025',
    url: 'https://cricclubs.com/NashvilleCricketLeague/points-table?leagueId=Pj7NL8S3pXOPdIPaHDwboQ&year=2025&series=jzSTpzuunaGCjZKzp83FqA&seriesName=2025+-+Tape+20',
    match: 'getPointsTable',
  },
  {
    label: 'batting2025',
    url: 'https://cricclubs.com/NashvilleCricketLeague/statistics/batting-records?filter=Most+Runs&year=2025&leagueId=Pj7NL8S3pXOPdIPaHDwboQ&matchType=All&series=jzSTpzuunaGCjZKzp83FqA&seriesName=2025+-+Tape+20',
    match: 'getBattingStats'
  },
  {
    label: 'bowling2025',
    url: 'https://cricclubs.com/NashvilleCricketLeague/statistics/bowling-records?filter=Most+Wickets&year=2025&leagueId=Pj7NL8S3pXOPdIPaHDwboQ&matchType=All&series=jzSTpzuunaGCjZKzp83FqA&seriesName=2025+-+Tape+20',
    match: 'getBowlingStats'
  },
  {
    label: 'results2025',
    url: 'https://cricclubs.com/NashvilleCricketLeague/results?leagueId=Pj7NL8S3pXOPdIPaHDwboQ&year=2025&series=jzSTpzuunaGCjZKzp83FqA&seriesName=2025+-+Tape+20',
    match: 'jzSTpzuunaGCjZKzp83FqA/matches',
  },
];

// Hard kill: if the whole script takes more than 5 minutes, exit with failure
setTimeout(() => {
  console.error('Hard timeout reached (5 min) — exiting');
  process.exit(1);
}, 5 * 60 * 1000);

const LEAGUE_ID  = 'Pj7NL8S3pXOPdIPaHDwboQ';
const S2026      = 'WfZbUYmZkdi9WXyOM_8S1A';
const S2025      = 'jzSTpzuunaGCjZKzp83FqA';
const API        = 'https://core-prod-origin.cricclubs.com/core/public/league';
const SERIES_API = 'https://core-prod-origin.cricclubs.com/core/public/series';

// All API endpoints to call (from within the page's JS context)
const API_CALLS = [
  { label: 'rankings',    url: `${API}/getPlayerRankings?clubId=${LEAGUE_ID}&seriesId=${S2026}&matchType=&year=2026` },
  { label: 'batting',     url: `${API}/getBattingStats?clubId=${LEAGUE_ID}&seriesId=${S2026}&matchType=All&year=2026` },
  { label: 'bowling',     url: `${API}/getBowlingStats?clubId=${LEAGUE_ID}&seriesId=${S2026}&matchType=All&year=2026` },
  { label: 'standings',   url: `${API}/getPointsTable?clubId=${LEAGUE_ID}&seriesId=${S2026}&year=2026` },
  { label: 'results',     url: `${SERIES_API}/${S2026}/matches?clubId=${LEAGUE_ID}&size=200` },
  { label: 'batting2025', url: `${API}/getBattingStats?clubId=${LEAGUE_ID}&seriesId=${S2025}&matchType=All&year=2025` },
  { label: 'bowling2025', url: `${API}/getBowlingStats?clubId=${LEAGUE_ID}&seriesId=${S2025}&matchType=All&year=2025` },
  { label: 'standings2025', url: `${API}/getPointsTable?clubId=${LEAGUE_ID}&seriesId=${S2025}&year=2025` },
  { label: 'results2025',   url: `${SERIES_API}/${S2025}/matches?clubId=${LEAGUE_ID}&size=200` },
  { label: 'rankings2025',  url: `${API}/getPlayerRankings?clubId=${LEAGUE_ID}&seriesId=${S2025}&matchType=&year=2025` },
];

async function fetchStats() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36');

  // Navigate to CricClubs once to establish cookies/session
  console.log('Establishing session...');
  await page.goto(
    `https://cricclubs.com/NashvilleCricketLeague/statistics/rankings-records?year=2026&leagueId=${LEAGUE_ID}&series=${S2026}`,
    { waitUntil: 'domcontentloaded', timeout: 30000 }
  ).catch(e => console.log('  page load warning:', e.message));
  await new Promise(r => setTimeout(r, 2000));

  // Make each API call directly from the page's JS context.
  // This uses whatever cookies/session the page established, bypassing
  // the React app's rendering entirely.
  const captured = {};
  for (const { label, url } of API_CALLS) {
    console.log(`\nFetching ${label}...`);
    try {
      const raw = await page.evaluate(async (apiUrl) => {
        try {
          const r = await fetch(apiUrl, { credentials: 'include' });
          const text = await r.text();
          return { status: r.status, text };
        } catch(e) {
          return { error: e.message };
        }
      }, url);

      if (raw.error) {
        console.log(`  ✗ ${label}: fetch error — ${raw.error}`);
        continue;
      }
      if (raw.status !== 200) {
        console.log(`  ✗ ${label}: HTTP ${raw.status} — ${raw.text.substring(0, 100)}`);
        continue;
      }

      const data = JSON.parse(raw.text);
      captured[label] = data;
      const count = Array.isArray(data.data) ? data.data.length
        : data.completed ? data.completed.length : '?';
      console.log(`  ✓ ${label}: ${count} records`);
    } catch(e) {
      console.log(`  ✗ ${label}: ${e.message}`);
    }
  }

  await browser.close().catch(() => {});

  // Unpack the raw API responses into the expected shapes
  const getRaw = (label) => {
    const d = captured[label];
    if (!d) return [];
    const arr = d.data || d.completed || [];
    // Standings response: array of groups, each with a .teams array — flatten
    if ((label === 'standings' || label === 'standings2025') && Array.isArray(arr) && arr[0] && arr[0].teams) {
      return arr.flatMap(group => (group.teams || []).map(t => t.team)).filter(Boolean);
    }
    return arr;
  };

  const batting   = getRaw('batting');
  const bowling   = getRaw('bowling');
  const rankings  = getRaw('rankings');
  const standings = getRaw('standings');
  const results   = getRaw('results');
  const batting2025   = getRaw('batting2025');
  const bowling2025   = getRaw('bowling2025');
  const rankings2025  = getRaw('rankings2025');
  const standings2025 = getRaw('standings2025');
  const results2025   = getRaw('results2025');

  if (!batting.length && !bowling.length) {
    console.error('Failed to capture batting/bowling data.');
    process.exit(1);
  }

  // Helper to filter by team
  const filterTeam = (arr, teamKeyword) =>
    (arr || []).filter(p => p.teamName && p.teamName.includes(teamKeyword));

  // ── Batting: compute average & strike rate ──
  const cleanBatting = (players) => players.map(p => ({
    name: p.firstName + ' ' + p.lastName,
    team: p.teamName,
    matches: p.matches,
    innings: p.innings,
    runs: p.runsScored,
    balls: p.ballsFaced,
    notOuts: p.notOuts,
    highest: p.highestScore,
    fours: p.fours,
    sixes: p.sixers,
    fifties: p.fifties,
    hundreds: p.hundreds,
    average: p.innings - p.notOuts > 0
      ? +(p.runsScored / (p.innings - p.notOuts)).toFixed(1) : p.runsScored,
    strikeRate: p.ballsFaced > 0
      ? +(p.runsScored / p.ballsFaced * 100).toFixed(1) : 0,
  })).sort((a, b) => b.runs - a.runs);

  // ── Bowling: compute average, economy, strike rate ──
  const cleanBowling = (players) => players.map(p => {
    const balls = p.balls || 0;
    const oversDisplay = Math.floor(balls / 6) + (balls % 6 ? '.' + (balls % 6) : '');
    const oversDecimal = balls / 6;
    const totalRuns = p.runs || 0;
    return {
      name: p.firstName + ' ' + p.lastName,
      team: p.teamName,
      matches: p.matches,
      innings: p.innings || 0,
      overs: oversDisplay,
      wickets: p.wickets,
      runs: totalRuns,
      maidens: p.maidens || 0,
      bestFigures: (p.maxWickets || 0) + '/' + (p.runsGiven != null ? p.runsGiven : '-'),
      hattricks: p.hattricks || 0,
      fiveWickets: p.fiveWickets || 0,
      fourWickets: p.fourWickets || 0,
      average: p.wickets > 0 ? +(totalRuns / p.wickets).toFixed(1) : null,
      economy: oversDecimal > 0 ? +(totalRuns / oversDecimal).toFixed(2) : null,
      strikeRate: p.wickets > 0 && balls > 0 ? +(balls / p.wickets).toFixed(1) : null,
    };
  }).sort((a, b) => b.wickets - a.wickets);

  // ── Standings ──
  const cleanStandings = (teams) => teams.map(t => ({
    team: t.teamName,
    matches: t.matches || 0,
    won: t.won || 0,
    lost: t.lost || 0,
    tied: t.tied || 0,
    noResult: t.noResult || 0,
    points: t.points || 0,
    nrr: t.netRunRate ? +t.netRunRate.toFixed(3) : 0,
  })).sort((a, b) => b.points - a.points || b.nrr - a.nrr);

  // ── Rankings ──
  const cleanRankings = (players) => players.map(p => ({
    name: p.firstName + ' ' + p.lastName,
    team: p.teamName,
    matches: p.matchesPlayed,
    batting: p.battingPoints,
    bowling: p.bowlingPoints,
    fielding: p.fieldingPoints,
    total: p.total,
    mom: p.mom,
  })).sort((a, b) => b.total - a.total);

  // ── Match results: score summary per team ──
  const cleanResults = (matches) => {
    const byTeam = {};
    matches.forEach(m => {
      const ss = m.scoreSummary;
      if (!ss) return;
      const t1 = m.teamOne && m.teamOne.name;
      const t2 = m.teamTwo && m.teamTwo.name;
      if (!t1 || !t2) return;
      const date = m.matchDateTime ? m.matchDateTime.split('T')[0] : '';

      const resultText = (ss.result || '').trim();
      const isAbandoned = /abandoned/i.test(resultText);
      const isForfeited = /forfeited/i.test(resultText);
      const isDL        = /d\/l|duckworth/i.test(resultText);

      [t1, t2].forEach(team => {
        const isT1 = team === t1;
        const runsScored    = isT1 ? ss.teamOneScore1 : ss.teamTwoScore1;
        const wickets       = isT1 ? ss.teamOneWicketsLost1 : ss.teamTwoWicketsLost1;
        const balls         = isT1 ? ss.teamOneBallsPlayed1 : ss.teamTwoBallsPlayed1;
        const runsConceded  = isT1 ? ss.teamTwoScore1 : ss.teamOneScore1;
        const overs         = Math.floor(balls / 6) + (balls % 6 ? '.' + (balls % 6) : '');

        let won = false, noResult = false;
        if (isAbandoned) {
          noResult = true;
        } else if (isForfeited) {
          won = resultText.toLowerCase().includes(team.toLowerCase());
        } else {
          won = runsScored > runsConceded || (isDL && resultText.toLowerCase().includes(team.toLowerCase()));
        }

        if (!byTeam[team]) byTeam[team] = [];
        byTeam[team].push({ opponent: isT1 ? t2 : t1, date, runsScored, wickets, overs, runsConceded, won, noResult });
      });
    });

    const result = {};
    Object.keys(byTeam).forEach(team => {
      const games = byTeam[team];
      const scores = games.map(g => g.runsScored);
      result[team] = {
        games: games.sort((a, b) => a.date.localeCompare(b.date)),
        highestTotal: Math.max.apply(null, scores),
        lowestTotal:  Math.min.apply(null, scores),
        averageScore: Math.round(scores.reduce((s, r) => s + r, 0) / scores.length),
      };
    });
    return result;
  };

  // ── Group all-teams batting/bowling by teamName (for opponent analysis) ──
  const groupByTeam = (arr) => {
    const map = {};
    (arr || []).forEach(p => {
      const team = p.teamName || 'Unknown';
      if (!map[team]) map[team] = [];
      map[team].push(p);
    });
    return map;
  };

  const allBattingByTeam = groupByTeam(batting);
  const allBowlingByTeam = groupByTeam(bowling);
  const allTeams = [...new Set([
    ...Object.keys(allBattingByTeam),
    ...Object.keys(allBowlingByTeam),
  ])].filter(t => !t.includes('Lions') && !t.includes('Tigers')).sort();

  const opponents = {};
  allTeams.forEach(team => {
    opponents[team] = {
      batting: cleanBatting(allBattingByTeam[team] || []),
      bowling: cleanBowling(allBowlingByTeam[team] || []),
    };
  });

  // 2025 opponents
  const allBattingByTeam2025 = groupByTeam(batting2025);
  const allBowlingByTeam2025 = groupByTeam(bowling2025);
  const allTeams2025 = [...new Set([
    ...Object.keys(allBattingByTeam2025),
    ...Object.keys(allBowlingByTeam2025),
  ])].filter(t => !t.includes('Lions') && !t.includes('Tigers')).sort();

  const opponents2025 = {};
  allTeams2025.forEach(team => {
    opponents2025[team] = {
      batting: cleanBatting(allBattingByTeam2025[team] || []),
      bowling: cleanBowling(allBowlingByTeam2025[team] || []),
    };
  });

  const output = {
    lastUpdated: new Date().toISOString(),
    lions: {
      rankings: cleanRankings(filterTeam(rankings, 'Lions')),
      batting:  cleanBatting(filterTeam(batting,  'Lions')),
      bowling:  cleanBowling(filterTeam(bowling,  'Lions')),
    },
    tigers: {
      rankings: cleanRankings(filterTeam(rankings, 'Tigers')),
      batting:  cleanBatting(filterTeam(batting,  'Tigers')),
      bowling:  cleanBowling(filterTeam(bowling,  'Tigers')),
    },
    combined: {
      rankings: cleanRankings([
        ...filterTeam(rankings, 'Lions'),
        ...filterTeam(rankings, 'Tigers'),
      ].sort((a, b) => (b.total||0) - (a.total||0))),
    },
    opponents,
    opponents2025,
    standings: cleanStandings(standings),
    standings2025: cleanStandings(standings2025),
    results: cleanResults(results),
    results2025: cleanResults(results2025),
  };

  const jsContent = `// Auto-generated by fetch-stats.js — do not edit manually
// Last updated: ${new Date().toLocaleString()}
var CRICCLUBS_STATS = ${JSON.stringify(output, null, 2)};
`;

  const outPath = path.join(__dirname, '..', 'cricclubs-stats.js');
  fs.writeFileSync(outPath, jsContent);
  console.log(`\n✓ Saved to cricclubs-stats.js`);

  // Print preview
  console.log('\n🦁 LIONS BATTING (top 5):');
  output.lions.batting.slice(0,5).forEach((p,i) =>
    console.log(`  ${i+1}. ${p.name} — ${p.runs} runs | Avg: ${p.average} | SR: ${p.strikeRate} | HS: ${p.highest}`));

  console.log('\n🦁 LIONS BOWLING (top 5):');
  output.lions.bowling.slice(0,5).forEach((p,i) =>
    console.log(`  ${i+1}. ${p.name} — ${p.wickets} wkts | Econ: ${p.economy} | Avg: ${p.average} | Best: ${p.bestFigures}`));

  console.log('\n🐯 TIGERS BATTING (top 5):');
  output.tigers.batting.slice(0,5).forEach((p,i) =>
    console.log(`  ${i+1}. ${p.name} — ${p.runs} runs | Avg: ${p.average} | SR: ${p.strikeRate} | HS: ${p.highest}`));

  console.log('\n🐯 TIGERS BOWLING (top 5):');
  output.tigers.bowling.slice(0,5).forEach((p,i) =>
    console.log(`  ${i+1}. ${p.name} — ${p.wickets} wkts | Econ: ${p.economy} | Avg: ${p.average} | Best: ${p.bestFigures}`));

  process.exit(0);
}

fetchStats().catch((err) => { console.error(err); process.exit(1); });
