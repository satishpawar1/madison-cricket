// Pushes batting & bowling stats from cricclubs-stats.js into Google Sheets
// so the claude.ai chat can read them via Drive integration.
//
// Run: node push-stats-to-sheets.js
//
// Creates/overwrites four tabs: Lions Batting, Lions Bowling, Tigers Batting, Tigers Bowling
// Also writes a "Stats Last Updated" tab with a timestamp.
//
// PREREQUISITE: In your Apps Script doPost(), add this routing line:
//   if (data.action === 'writeTable') return handleWriteTable(data);

const fs   = require('fs');
const vm   = require('vm');
const path = require('path');
const { postToSheets } = require('./utils');

const statsFile = path.join(__dirname, '..', 'cricclubs-stats.js');
const code = fs.readFileSync(statsFile, 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const S = sandbox.CRICCLUBS_STATS;

async function pushBatting(teamLabel, batting) {
  const headers = ['Player', 'M', 'INN', 'Runs', 'HS', 'Avg', 'SR', '4s', '6s', '50s', '100s'];
  const rows = batting.map(p => [
    p.name,
    p.matches,
    p.innings,
    p.runs,
    p.highest,
    p.average,
    p.strikeRate,
    p.fours,
    p.sixes,
    p.fifties,
    p.hundreds
  ]);
  const res = await postToSheets({ action: 'writeTable', sheetName: `${teamLabel} Batting`, headers, rows });
  console.log(`${teamLabel} Batting →`, res);
}

async function pushBowling(teamLabel, bowling) {
  const headers = ['Player', 'M', 'INN', 'Overs', 'Wkts', 'Runs', 'Avg', 'Econ', 'SR', 'Best', 'Wides', 'NoBalls'];
  const rows = bowling.map(p => [
    p.name,
    p.matches,
    p.innings,
    p.overs,
    p.wickets,
    p.runs,
    p.average,
    p.economy,
    p.strikeRate,
    p.bestFigures,
    p.wides,
    p.noballs
  ]);
  const res = await postToSheets({ action: 'writeTable', sheetName: `${teamLabel} Bowling`, headers, rows });
  console.log(`${teamLabel} Bowling →`, res);
}

async function main() {
  console.log('Stats last updated:', S.lastUpdated);

  await pushBatting('Lions', S.lions.batting);
  await pushBowling('Lions', S.lions.bowling);
  await pushBatting('Tigers', S.tigers.batting);
  await pushBowling('Tigers', S.tigers.bowling);

  // Write a timestamp tab so the chat knows when stats were last synced
  await postToSheets({
    action: 'writeTable',
    sheetName: 'Stats Last Updated',
    headers: ['Field', 'Value'],
    rows: [
      ['CricClubs data as of', S.lastUpdated],
      ['Pushed to sheet at', new Date().toISOString()]
    ]
  });
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
