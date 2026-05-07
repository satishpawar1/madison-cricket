'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const { postToSheets } = require('./utils');

const ROOT = path.join(__dirname, '..');

function loadJS(filename, varName) {
  const code = fs.readFileSync(path.join(ROOT, filename), 'utf8');
  const ctx  = {};
  vm.runInNewContext(code, ctx);
  return ctx[varName];
}

async function writeTable(sheetName, headers, rows) {
  console.log(`  Writing ${rows.length} rows → "${sheetName}"...`);
  const result = await postToSheets({ action: 'writeTable', sheetName, headers, rows });
  console.log(`    ${JSON.stringify(result)}`);
}

const safe = (val, fallback = '') => val == null ? fallback : val;

async function main() {
  console.log('Loading data...');
  const stats  = loadJS('cricclubs-stats.js', 'CRICCLUBS_STATS');
  const config = loadJS('config.js', 'MCC_CONFIG');
  const toss   = JSON.parse(fs.readFileSync(path.join(__dirname, 'toss-results.json'), 'utf8'));

  console.log('Exporting to Google Sheets...\n');

  // Lions Batting
  await writeTable('Lions Batting',
    ['Name','Matches','Innings','Not Outs','Runs','Highest','Average','Strike Rate','4s','6s','50s','100s'],
    stats.lions.batting.map(p => [
      safe(p.name), safe(p.matches,0), safe(p.innings,0), safe(p.notOuts,0),
      safe(p.runs,0), safe(p.highest), safe(p.average), safe(p.strikeRate),
      safe(p.fours,0), safe(p.sixes,0), safe(p.fifties,0), safe(p.hundreds,0)
    ])
  );

  // Lions Bowling
  await writeTable('Lions Bowling',
    ['Name','Matches','Innings','Overs','Wickets','Runs','Maidens','Best','Average','Economy','Strike Rate','Wides','No Balls'],
    stats.lions.bowling.map(p => [
      safe(p.name), safe(p.matches,0), safe(p.innings,0), safe(p.overs),
      safe(p.wickets,0), safe(p.runs,0), safe(p.maidens,0), safe(p.bestFigures),
      safe(p.average), safe(p.economy), safe(p.strikeRate),
      safe(p.wides,0), safe(p.noballs,0)
    ])
  );

  // Lions Rankings
  await writeTable('Lions Rankings',
    ['Name','Matches','Batting Points','Bowling Points','Fielding Points','Total','Man of Match'],
    stats.lions.rankings.map(p => [
      safe(p.name), safe(p.matches,0), safe(p.batting), safe(p.bowling),
      safe(p.fielding), safe(p.total), safe(p.mom,0)
    ])
  );

  // Tigers Batting
  await writeTable('Tigers Batting',
    ['Name','Matches','Innings','Not Outs','Runs','Highest','Average','Strike Rate','4s','6s','50s','100s'],
    stats.tigers.batting.map(p => [
      safe(p.name), safe(p.matches,0), safe(p.innings,0), safe(p.notOuts,0),
      safe(p.runs,0), safe(p.highest), safe(p.average), safe(p.strikeRate),
      safe(p.fours,0), safe(p.sixes,0), safe(p.fifties,0), safe(p.hundreds,0)
    ])
  );

  // Tigers Bowling
  await writeTable('Tigers Bowling',
    ['Name','Matches','Innings','Overs','Wickets','Runs','Maidens','Best','Average','Economy','Strike Rate','Wides','No Balls'],
    stats.tigers.bowling.map(p => [
      safe(p.name), safe(p.matches,0), safe(p.innings,0), safe(p.overs),
      safe(p.wickets,0), safe(p.runs,0), safe(p.maidens,0), safe(p.bestFigures),
      safe(p.average), safe(p.economy), safe(p.strikeRate),
      safe(p.wides,0), safe(p.noballs,0)
    ])
  );

  // Tigers Rankings
  await writeTable('Tigers Rankings',
    ['Name','Matches','Batting Points','Bowling Points','Fielding Points','Total','Man of Match'],
    stats.tigers.rankings.map(p => [
      safe(p.name), safe(p.matches,0), safe(p.batting), safe(p.bowling),
      safe(p.fielding), safe(p.total), safe(p.mom,0)
    ])
  );

  // League Standings
  await writeTable('Standings',
    ['Team','Matches','Won','Lost','No Result','Tied','Points','NRR'],
    (stats.standings || []).map(s => [
      safe(s.team), safe(s.matches,0), safe(s.won,0), safe(s.lost,0),
      safe(s.noResult,0), safe(s.tied,0), safe(s.points,0), safe(s.nrr)
    ])
  );

  // Toss Results & Player of Match
  await writeTable('Toss & Results',
    ['Match ID','Date','Team 1','Team 2','Toss Winner','Elected To','Player of Match',
     'Top Scorer','Runs','Balls','4s','6s','Strike Rate','How Out'],
    toss.map(m => [
      safe(m.matchId), safe(m.date), safe(m.team1), safe(m.team2),
      safe(m.tossWinner), safe(m.electedTo), safe(m.playerOfMatch),
      m.topScorer ? safe(m.topScorer.name)      : '',
      m.topScorer ? safe(m.topScorer.runs,   0) : '',
      m.topScorer ? safe(m.topScorer.balls,  0) : '',
      m.topScorer ? safe(m.topScorer.fours,  0) : '',
      m.topScorer ? safe(m.topScorer.sixes,  0) : '',
      m.topScorer ? safe(m.topScorer.strikeRate) : '',
      m.topScorer ? safe(m.topScorer.howOut)  : '',
    ])
  );

  // Combined schedule (Lions + Tigers), sorted by game date
  const scheduleRows = [];
  for (const g of config.lions.games) {
    scheduleRows.push(['Lions', safe(g.opponent), safe(g.date), safe(g.day),
      safe(g.time), safe(g.warmup), safe(g.ground), safe(g.gameDate)]);
  }
  for (const g of config.tigers.games) {
    scheduleRows.push(['Tigers', safe(g.opponent), safe(g.date), safe(g.day),
      safe(g.time), safe(g.warmup), safe(g.ground), safe(g.gameDate)]);
  }
  scheduleRows.sort((a, b) => (a[7] || '').localeCompare(b[7] || ''));
  await writeTable('Schedule',
    ['Team','Opponent','Date','Day','Time','Warmup','Ground','Game Date (ISO)'],
    scheduleRows
  );

  // Opponent Analysis — use 2025 data if available, fall back to combined
  const oppSource = stats.opponents2025 || stats.opponents || {};
  const oppRows   = [];
  for (const [teamName, data] of Object.entries(oppSource)) {
    const batters = (data.batting || [])
      .filter(b => parseFloat(b.average) >= 30 && parseFloat(b.strikeRate) >= 100)
      .slice(0, 3)
      .map(b => `${b.name} (avg:${b.average}, sr:${b.strikeRate})`)
      .join('; ');
    const bowlers = (data.bowling || [])
      .filter(b => parseFloat(b.economy) <= 7 || parseFloat(b.average) < 10)
      .slice(0, 3)
      .map(b => `${b.name} (econ:${b.economy}, wkts:${b.wickets})`)
      .join('; ');
    oppRows.push([
      teamName,
      batters  || '—',
      bowlers  || '—',
      (data.batting  || []).length,
      (data.bowling  || []).length,
    ]);
  }
  await writeTable('Opponent Analysis',
    ['Opponent','Main Batters (avg≥30, sr≥100)','Main Bowlers (econ≤7 or avg<10)','Batter Records','Bowler Records'],
    oppRows
  );

  console.log('\nDone — all 10 tabs written.');
}

main().catch(err => { console.error(err); process.exit(1); });
