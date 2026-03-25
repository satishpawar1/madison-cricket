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
];

async function fetchStats() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36');

  const captured = {};

  for (const { label, url, match } of PAGES) {
    console.log(`\nFetching ${label}...`);
    page.removeAllListeners('response');

    await new Promise((resolve) => {
      let done = false;
      page.on('response', async (response) => {
        if (done) return;
        const u = response.url();
        if (!u.includes(match)) return;
        const ct = response.headers()['content-type'] || '';
        if (!ct.includes('json')) return;
        try {
          const data = await response.json();
          const arr = data.data || data;
          if (Array.isArray(arr) && arr.length > 0) {
            captured[label] = arr;
            console.log(`  ✓ ${label}: ${arr.length} records`);
            done = true;
            resolve();
          }
        } catch(e) {}
      });

      page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
        .then(() => setTimeout(resolve, 3000))
        .catch(() => resolve());
    });
  }

  await browser.close();

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
    const runsGiven = p.runsGiven || 0;
    return {
      name: p.firstName + ' ' + p.lastName,
      team: p.teamName,
      matches: p.matches,
      innings: p.innings || 0,
      overs: oversDisplay,
      wickets: p.wickets,
      runs: runsGiven,
      maidens: p.maidens || 0,
      bestFigures: (p.maxWickets || 0) + '/-',
      average: p.wickets > 0 ? +(runsGiven / p.wickets).toFixed(1) : null,
      economy: oversDecimal > 0 ? +(runsGiven / oversDecimal).toFixed(2) : null,
      strikeRate: p.wickets > 0 && balls > 0 ? +(balls / p.wickets).toFixed(1) : null,
    };
  }).sort((a, b) => b.wickets - a.wickets);

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
    }
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
}

fetchStats().catch(console.error);
