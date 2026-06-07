require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.CRICKET_SPREADSHEET_ID;

function getSheets() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// Returns list of existing tab names in the spreadsheet
async function listTabs() {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  return res.data.sheets.map(s => s.properties.title);
}

// Creates a tab with headers if it doesn't already exist; no-op if it does
async function ensureTab(tabName, headers) {
  const tabs = await listTabs();
  const sheets = getSheets();

  if (!tabs.includes(tabName)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tabName } } }],
      },
    });
    console.log(`Created tab: ${tabName}`);
  } else {
    console.log(`Tab already exists: ${tabName}`);
  }

  if (headers && headers.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tabName}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
  }
}

// Reads all data rows from a tab (skips header row); returns raw 2D array
async function readTabRaw(tabName) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${tabName}'!A:Z`,
  });
  const rows = res.data.values || [];
  return rows.slice(1); // skip header
}

// Overwrites a tab: clears it, writes headers, then writes data rows
async function writeTab(tabName, headers, rows) {
  const sheets = getSheets();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${tabName}'!A:Z`,
  });
  const allRows = [headers, ...rows];
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${tabName}'!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: allRows },
  });
}

module.exports = { SPREADSHEET_ID, getSheets, listTabs, ensureTab, readTabRaw, writeTab };
