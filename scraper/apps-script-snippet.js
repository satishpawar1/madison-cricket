// ─────────────────────────────────────────────────────────────────
// MEMBER REGISTRATION (for join.html)
// 1. Paste handleRegisterMember() anywhere in your Apps Script file
// 2. Add the routing line inside your existing doPost(), after data is parsed:
//    if (data.action === 'registerMember') return handleRegisterMember(data);
// 3. Re-deploy (Deploy → Manage deployments → update version)
// ─────────────────────────────────────────────────────────────────

function handleRegisterMember(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Members') || ss.insertSheet('Members');
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, 3).setValues([['Timestamp', 'Name', 'Email']]);
  }
  var existing = sh.getLastRow() > 1
    ? sh.getRange(2, 3, sh.getLastRow() - 1, 1).getValues().flat()
    : [];
  if (existing.indexOf(data.email) !== -1) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', message: 'already_registered' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  sh.appendRow([new Date().toISOString(), data.name, data.email]);
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────────
// WRITE TABLE UTILITY
// ─────────────────────────────────────────────────────────────────

function handleWriteTable(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(data.sheetName) || ss.insertSheet(data.sheetName);
  sh.clearContents();
  if (data.headers && data.headers.length) {
    sh.getRange(1, 1, 1, data.headers.length).setValues([data.headers]);
  }
  if (data.rows && data.rows.length) {
    sh.getRange(2, 1, data.rows.length, data.rows[0].length).setValues(data.rows);
  }
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', sheet: data.sheetName }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────────
// PLAYING XI LOG — writes a clean tab that Claude can read
//
// Paste writePlayingXILog() into your Apps Script.
// Then call it inside your existing doPost() handler, right after
// you successfully write the availability/selection grid, e.g.:
//
//   writePlayingXILog(data.team, data.game, data.players);
//
// "data.players" is the array of { name, available, selected } objects
// already sent by tigers.html / lions.html.
// ─────────────────────────────────────────────────────────────────

function writePlayingXILog(team, game, players) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Playing XI Log') || ss.insertSheet('Playing XI Log');

  // Write header row if sheet is empty
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, 4).setValues([['Timestamp', 'Team', 'Game', 'Playing XI']]);
    sh.getRange(1, 1, 1, 4).setFontWeight('bold');
  }

  var selected = players.filter(function(p) { return p.selected === 1; }).map(function(p) { return p.name; });
  var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');

  // Update existing row for this team+game, or append a new one
  var data = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues() : [];
  var rowIndex = -1;
  for (var i = 0; i < data.length; i++) {
    if (data[i][1] === team && data[i][2] === game) { rowIndex = i + 2; break; }
  }
  var row = [timestamp, team, game, selected.join(', ')];
  if (rowIndex > 0) {
    sh.getRange(rowIndex, 1, 1, 4).setValues([row]);
  } else {
    sh.appendRow(row);
  }
}

// ─────────────────────────────────────────────────────────────────
// ALSO ADD these lines inside your existing doPost() function,
// right after the line where `data` is parsed from e.postData.contents
// ─────────────────────────────────────────────────────────────────

// if (data.action === 'writeTable') return handleWriteTable(data);
// After writing availability/selection grid, also call:
// writePlayingXILog(data.team, data.game, data.players);
