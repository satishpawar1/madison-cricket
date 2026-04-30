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

// Hard kill: if the whole script takes more than 4 minutes, exit with failure
setTimeout(() => {
  console.error('Hard timeout reached (4 min) — exiting');
  process.exit(1);
}, 4 * 60 * 1000);

// Helper: wait up to `ms` for a response matching `matchFn`, navigating to `url`
function fetchPage(page, url, ms, matchFn) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (val) => { if (!done) { done = true; clearTimeout(timer); resolve(val); } };
    const timer = setTimeout(() => {
      console.log('  ⚠ per-page timeout');
      finish(null);
    }, ms);

    page.on('response', async (response) => {
      if (done) return;
      try {
        const result = await matchFn(response);
        if (result !== null) finish(result);
      } catch(e) {}
    });

    page.goto(url, { waitUntil: 'domcontentloaded', timeout: ms })
      .catch(() => {});
  });
}

async function fetchStats() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36');

  const captured = {};
  const PAGE_TIMEOUT = 25000; // 25s per page

  for (const { label, url, match } of PAGES) {
    const isResults = label === 'results' || label === 'results2025';
    console.log(`\nFetching ${label}...`);
    page.removeAllListeners('request');
    page.removeAllListeners('response');

    if (isResults) {
      // For results: intercept the outgoing API request and upgrade size=30 to size=200
      // so we get all matches in a single response without pagination.
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        try {
          const u = req.url();
          if (u.includes(match) && u.includes('size=')) {
            req.continue({ url: u.replace(/size=\d+/, 'size=200') });
          } else {
            req.continue();
          }
        } catch(e) { try { req.continue(); } catch(_) {} }
      });

      const result = await fetchPage(page, url, PAGE_TIMEOUT, async (response) => {
        const u = response.url();
        if (!u.includes(match)) return null;
        const ct = response.headers()['content-type'] || '';
        if (!ct.includes('json')) return null;
        const data = await response.json();
        const inner = data.data || data;
        const completed = inner.completed || [];
        if (!completed.length) return null;
        return completed;
      });

      if (result) {
        captured[label] = result;
        console.log(`  ✓ ${label}: ${result.length} records`);
      } else {
        console.log(`  ✗ ${label}: no data captured`);
      }

      page.removeAllListeners('request');
      await page.setRequestInterception(false).catch(() => {});

    } else {
      const result = await fetchPage(page, url, PAGE_TIMEOUT, async (response) => {
        const u = response.url();
        if (!u.includes(match)) return null;
        const ct = response.headers()['content-type'] || '';
        if (!ct.includes('json')) return null;
        const data = await response.json();
        let arr = data.data || data;
        if ((label === 'standings' || label === 'standings2025') && Array.isArray(arr) && arr[0] && arr[0].teams) {
          arr = arr.flatMap(group => (group.teams || []).map(t => t.team)).filter(Boolean);
        }
        if (!Array.isArray(arr) || arr.length === 0) return null;
        return arr;
      });

      if (result) {
        if (!captured[label] || result.length > captured[label].length) {
          captured[label] = result;
        }
        console.log(`  ✓ ${label}: ${result.length} records`);
      } else {
        console.log(`  ✗ ${label}: no data captured`);
      }
    }
  }

  await browser.close().catch(() => {});

  if (!captured.batting && !captured.bowling) {
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

  const allBattingByTeam = groupByTeam(captured.batting);
  const allBowlingByTeam = groupByTeam(captured.bowling);
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
  const allBattingByTeam2025 = groupByTeam(captured.batting2025);
  const allBowlingByTeam2025 = groupByTeam(captured.bowling2025);
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
      rankings: cleanRankings(filterTeam(captured.rankings || [], 'Lions')),
      batting:  cleanBatting(filterTeam(captured.batting  || [], 'Lions')),
      bowling:  cleanBowling(filterTeam(captured.bowling  || [], 'Lions')),
    },
    tigers: {
      rankings: cleanRankings(filterTeam(captured.rankings || [], 'Tigers')),
      batting:  cleanBatting(filterTeam(captured.batting  || [], 'Tigers')),
      bowling:  cleanBowling(filterTeam(captured.bowling  || [], 'Tigers')),
    },
    combined: {
      rankings: cleanRankings([
        ...filterTeam(captured.rankings || [], 'Lions'),
        ...filterTeam(captured.rankings || [], 'Tigers'),
      ].sort((a, b) => (b.total||0) - (a.total||0))),
    },
    opponents,
    opponents2025,
    standings: cleanStandings(captured.standings || []),
    standings2025: cleanStandings(captured.standings2025 || []),
    results: cleanResults(captured.results || []),
    results2025: cleanResults(captured.results2025 || []),
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
