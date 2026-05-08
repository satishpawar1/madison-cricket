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
// WRITE TABLE UTILITY  (used by push-stats-to-sheets.js)
// Add this routing line inside your existing doPost(), after data is parsed:
//   if (data.action === 'writeTable') return handleWriteTable(data);
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
// PLAYING XI LOG
//
// STEP 1: Replace any existing writePlayingXILog() in your script
//         with the function below.
//
// STEP 2: In handlePostAvailability(), replace the call line with:
//
//   try { writePlayingXILog(ss, team, sheetGame); } catch(err) { Logger.log('PlayingXI error: ' + err); }
//
// NOTE: This version reads selected players directly from the sheet
// (not from the payload) to avoid serialization issues.
// ─────────────────────────────────────────────────────────────────

function writePlayingXILog(ss, team, sheetGame) {
  var games      = team === 'Lions' ? LIONS_GAMES   : TIGERS_GAMES;
  var playerList = team === 'Lions' ? LIONS_PLAYERS : TIGERS_PLAYERS;
  var sheet      = ss.getSheetByName(team === 'Lions' ? LIONS_TAB : TIGERS_TAB);
  var gameIdx    = games.indexOf(sheetGame);
  if (!sheet || gameIdx === -1) return;

  var selCol = 2 + gameIdx * 2 + 1;
  var selectedNames = [];
  for (var i = 0; i < playerList.length; i++) {
    if (Number(sheet.getRange(i + 6, selCol).getValue()) === 1) {
      selectedNames.push(playerList[i]);
    }
  }

  // Include selected extra players
  var extraSheet = ss.getSheetByName('ExtraAvail_' + team);
  if (extraSheet && extraSheet.getLastRow() > 1) {
    var extraData = extraSheet.getRange(2, 1, extraSheet.getLastRow() - 1, 4).getValues();
    for (var j = 0; j < extraData.length; j++) {
      if (extraData[j][0] === sheetGame && Number(extraData[j][3]) === 1) {
        selectedNames.push(String(extraData[j][1]));
      }
    }
  }

  var sh = ss.getSheetByName('Playing XI Log');
  if (!sh) {
    sh = ss.insertSheet('Playing XI Log');
    sh.appendRow(['Timestamp', 'Team', 'Game', 'Playing XI']);
  }

  var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  var lastRow = sh.getLastRow();
  if (lastRow > 1) {
    var rows = sh.getRange(2, 1, lastRow - 1, 4).getValues();
    for (var k = 0; k < rows.length; k++) {
      if (rows[k][1] === team && rows[k][2] === sheetGame) {
        sh.getRange(k + 2, 1, 1, 4).setValues([[timestamp, team, sheetGame, selectedNames.join(', ')]]);
        return;
      }
    }
  }
  sh.appendRow([timestamp, team, sheetGame, selectedNames.join(', ')]);
}
