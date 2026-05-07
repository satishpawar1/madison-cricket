// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: Add these two functions anywhere in Code.gs (e.g. before keepAlive)
// ─────────────────────────────────────────────────────────────────────────────

function handleGetExtraPlayers(e) {
  var team = e.parameter.team;
  if (!team) return jsonResponse({ status: 'error', message: 'Missing team' });
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName('Roster_' + team);
  if (!sh) return jsonResponse({ status: 'ok', players: [] });
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return jsonResponse({ status: 'ok', players: [] });
  var players = sh.getRange(2, 1, lastRow - 1, 1).getValues()
    .map(function(r) { return r[0]; }).filter(Boolean);
  return jsonResponse({ status: 'ok', players: players });
}

function handleSaveExtraPlayers(data) {
  var team = data.team;
  var players = data.players || [];
  if (!team) return jsonResponse({ status: 'error', message: 'Missing team' });
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheetName = 'Roster_' + team;
  var sh = ss.getSheetByName(sheetName);
  if (!sh) { sh = ss.insertSheet(sheetName); sh.getRange(1, 1).setValue('Player'); }
  var lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, 1).clearContent();
  if (players.length > 0) {
    sh.getRange(2, 1, players.length, 1).setValues(players.map(function(p) { return [p]; }));
  }
  return jsonResponse({ status: 'ok' });
}


// ─────────────────────────────────────────────────────────────────────────────
// STEP 2: In doGet — add this line just before:  if (!type && team && game)
// ─────────────────────────────────────────────────────────────────────────────

  if (params.action === 'getExtraPlayers') return handleGetExtraPlayers(e);


// ─────────────────────────────────────────────────────────────────────────────
// STEP 3: In doPost — add this line just after the writeTable check
// ─────────────────────────────────────────────────────────────────────────────

  if (payload.action === 'saveExtraPlayers') return handleSaveExtraPlayers(payload);


// ─────────────────────────────────────────────────────────────────────────────
// STEP 4: Deploy → Manage deployments → Edit → New version → Deploy
// ─────────────────────────────────────────────────────────────────────────────
