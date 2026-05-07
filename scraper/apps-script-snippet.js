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
// ALSO ADD this single line inside your existing doPost() function,
// right after the line where `data` is parsed from e.postData.contents
// ─────────────────────────────────────────────────────────────────

// if (data.action === 'writeTable') return handleWriteTable(data);
