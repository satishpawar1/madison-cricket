// CLI tool for creating catch tabs directly in Google Sheets.
// No Apps Script needed — runs once per new game.
//
// Usage:
//   node manage-catch-tabs.js create "Dragons CC" Leather
//   node manage-catch-tabs.js create "Cool Springs Titans" Lions
//   node manage-catch-tabs.js list

const { ensureTab, listTabs } = require('./sheets-client');

const CATCH_HEADERS = ['Player', 'Attempted', 'Taken', 'Dropped'];

function tabName(game, team) {
  if (team === 'Leather') return `LC_${game}`;
  if (team === 'Lions')   return `Catches_Lions_${game}`;
  if (team === 'Tigers')  return `Catches_Tigers_${game}`;
  throw new Error(`Unknown team: ${team}`);
}

async function create(game, team) {
  if (!game || !team) {
    console.error('Usage: node manage-catch-tabs.js create "<game>" <Lions|Tigers|Leather>');
    process.exit(1);
  }
  const name = tabName(game, team);
  await ensureTab(name, CATCH_HEADERS);
  console.log(`Done. Tab "${name}" is ready in the sheet.`);
}

async function list() {
  const tabs = await listTabs();
  const catchTabs = tabs.filter(t => t.startsWith('LC_') || t.startsWith('Catches_'));
  if (!catchTabs.length) {
    console.log('No catch tabs found.');
  } else {
    console.log('Catch tabs:');
    catchTabs.forEach(t => console.log(' ', t));
  }
}

const [,, cmd, ...args] = process.argv;
if (cmd === 'create') {
  create(args[0], args[1]).catch(err => { console.error(err.message); process.exit(1); });
} else if (cmd === 'list') {
  list().catch(err => { console.error(err.message); process.exit(1); });
} else {
  console.error('Commands: create "<game>" <team>   |   list');
  process.exit(1);
}
