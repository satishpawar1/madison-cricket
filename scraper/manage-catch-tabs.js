// CLI tool for managing catch tabs directly in Google Sheets.
// No Apps Script needed — run once to initialize or inspect.
//
// Leather L-30 uses a single tab ("LC_L30_Catches") for all games.
//
// Usage:
//   node manage-catch-tabs.js init-leather    → ensure LC_L30_Catches tab exists
//   node manage-catch-tabs.js list            → list all catch-related tabs
//   node manage-catch-tabs.js delete <tab>    → delete a tab by exact name

const { ensureTab, listTabs, getSheets, SPREADSHEET_ID } = require('./sheets-client');

const LEATHER_L30_TAB   = 'LC_L30_Catches';
const LEATHER_L30_HDRS  = ['Game', 'Player', 'Attempted', 'Taken', 'Dropped'];

async function initLeather() {
  await ensureTab(LEATHER_L30_TAB, LEATHER_L30_HDRS);
  console.log(`Done. "${LEATHER_L30_TAB}" is ready — one tab for all L-30 games.`);
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

async function deleteTab(name) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = res.data.sheets.find(s => s.properties.title === name);
  if (!sheet) { console.log(`Tab "${name}" not found.`); return; }
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{ deleteSheet: { sheetId: sheet.properties.sheetId } }] },
  });
  console.log(`Deleted tab: ${name}`);
}

const [,, cmd, ...args] = process.argv;
if (cmd === 'init-leather') {
  initLeather().catch(err => { console.error(err.message); process.exit(1); });
} else if (cmd === 'list') {
  list().catch(err => { console.error(err.message); process.exit(1); });
} else if (cmd === 'delete') {
  if (!args[0]) { console.error('Usage: node manage-catch-tabs.js delete <tab-name>'); process.exit(1); }
  deleteTab(args[0]).catch(err => { console.error(err.message); process.exit(1); });
} else {
  console.error('Commands: init-leather   |   list   |   delete <tab-name>');
  process.exit(1);
}
