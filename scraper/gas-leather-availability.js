// ─────────────────────────────────────────────────────────────────────────────
// LEATHER TEAM — Availability support for Apps Script
// Fixes: "Error: Game not found: Dragons CC"
//
// DO THIS IN CODE.GS:
//   1. Paste BLOCK A (the two functions) anywhere — e.g. at the very bottom
//   2. Paste BLOCK B (one line) inside doGet, right after getRemovedPlayers line
//   3. Paste BLOCK C (one line) inside doPost, right after saveRemovedPlayers line
//   4. Redeploy: Deploy → Manage deployments → Edit → New version → Deploy
// ─────────────────────────────────────────────────────────────────────────────


// ══════════════════════════════════════════════════════════════════════════════
// BLOCK A — Paste these two complete functions anywhere in Code.gs
// ══════════════════════════════════════════════════════════════════════════════

function handleGetLeatherAvailability(e) {
  var game = e.parameter.game;
  if (!game) return jsonResponse({ status: 'error', message: 'Missing game' });
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName('ExtraAvail_Leather');
  var result = [];
  if (sh && sh.getLastRow() > 1) {
    var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
    rows.forEach(function(row) {
      if (String(row[0]) === game)
        result.push({ name: row[1], available: Number(row[2]) || 0, selected: Number(row[3]) || 0 });
    });
  }
  return jsonResponse({ status: 'ok', data: result });
}

function handlePostLeatherAvailability(data) {
  var game = data.game;
  var players = data.players || [];
  if (!game) return jsonResponse({ status: 'error', message: 'Missing game' });
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName('ExtraAvail_Leather');
  if (!sh) {
    sh = ss.insertSheet('ExtraAvail_Leather');
    sh.getRange(1, 1, 1, 4).setValues([['Game', 'Player', 'Available', 'Selected']]);
  }
  var lastRow = sh.getLastRow();
  if (lastRow > 1) {
    var rows = sh.getRange(2, 1, lastRow - 1, 4).getValues();
    for (var i = rows.length - 1; i >= 0; i--) {
      if (String(rows[i][0]) === game) sh.deleteRow(i + 2);
    }
  }
  players.forEach(function(p) {
    sh.appendRow([game, p.name, p.available ? 1 : 0, p.selected ? 1 : 0]);
  });
  return jsonResponse({ status: 'ok' });
}


// ══════════════════════════════════════════════════════════════════════════════
// BLOCK B — Inside doGet, find this existing line:
//
//   if (params.action === 'getRemovedPlayers') return handleGetRemovedPlayers(e);
//
// Paste the line below IMMEDIATELY AFTER it:
// ══════════════════════════════════════════════════════════════════════════════

//   if (team === 'Leather' && e.parameter.game) return handleGetLeatherAvailability(e);


// ══════════════════════════════════════════════════════════════════════════════
// BLOCK C — Inside doPost, find this existing line:
//
//   if (payload.action === 'saveRemovedPlayers') return handleSaveRemovedPlayers(payload);
//
// Paste the line below IMMEDIATELY AFTER it:
// ══════════════════════════════════════════════════════════════════════════════

//   if (payload.team === 'Leather' && payload.game && !payload.type) return handlePostLeatherAvailability(payload);
