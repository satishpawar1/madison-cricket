// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: Add all four functions anywhere in Code.gs (e.g. before keepAlive)
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

function handleGetRemovedPlayers(e) {
  var team = e.parameter.team;
  if (!team) return jsonResponse({ status: 'error', message: 'Missing team' });
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName('Roster_Removed_' + team);
  if (!sh) return jsonResponse({ status: 'ok', players: [] });
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return jsonResponse({ status: 'ok', players: [] });
  var players = sh.getRange(2, 1, lastRow - 1, 1).getValues()
    .map(function(r) { return r[0]; }).filter(Boolean);
  return jsonResponse({ status: 'ok', players: players });
}

function handleSaveRemovedPlayers(data) {
  var team = data.team;
  var players = data.players || [];
  if (!team) return jsonResponse({ status: 'error', message: 'Missing team' });
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheetName = 'Roster_Removed_' + team;
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
// STEP 2: In doGet — add these two lines just before:  if (!type && team && game)
// ─────────────────────────────────────────────────────────────────────────────

  if (params.action === 'getExtraPlayers')   return handleGetExtraPlayers(e);
  if (params.action === 'getRemovedPlayers') return handleGetRemovedPlayers(e);


// ─────────────────────────────────────────────────────────────────────────────
// STEP 3: In doPost — add these two lines just after the writeTable check
// ─────────────────────────────────────────────────────────────────────────────

  if (payload.action === 'saveExtraPlayers')   return handleSaveExtraPlayers(payload);
  if (payload.action === 'saveRemovedPlayers') return handleSaveRemovedPlayers(payload);


// ─────────────────────────────────────────────────────────────────────────────
// STEP 4: In handlePostAvailability — add this block just before the
//         updateGamesPlayed(...) call to save extra players' availability
// ─────────────────────────────────────────────────────────────────────────────

  var extras = players.filter(function(p) { return playerList.indexOf(p.name) === -1; });
  if (extras.length > 0) {
    var extraAvailSheet = ss.getSheetByName('ExtraAvail_' + team)
      || ss.insertSheet('ExtraAvail_' + team);
    if (extraAvailSheet.getLastRow() === 0)
      extraAvailSheet.getRange(1,1,1,4).setValues([['Game','Player','Available','Selected']]);
    var ead = extraAvailSheet.getDataRange().getValues();
    for (var ei = ead.length - 1; ei >= 1; ei--) {
      if (ead[ei][0] === sheetGame) extraAvailSheet.deleteRow(ei + 1);
    }
    extras.forEach(function(p) {
      extraAvailSheet.appendRow([sheetGame, p.name, p.available, p.selected]);
    });
  }


// ─────────────────────────────────────────────────────────────────────────────
// STEP 5: In handleGetAvailability — add this block just before the final
//         return jsonResponse(...) to also return extra players' availability
// ─────────────────────────────────────────────────────────────────────────────

  var extraAvailSheet = ss.getSheetByName('ExtraAvail_' + team);
  if (extraAvailSheet && extraAvailSheet.getLastRow() > 1) {
    var ead = extraAvailSheet.getRange(2, 1, extraAvailSheet.getLastRow() - 1, 4).getValues();
    ead.forEach(function(row) {
      if (row[0] === sheetGame)
        result.push({ name: row[1], available: row[2] || 0, selected: row[3] || 0 });
    });
  }


// ─────────────────────────────────────────────────────────────────────────────
// STEP 6: Deploy → Manage deployments → Edit → New version → Deploy
// ─────────────────────────────────────────────────────────────────────────────
