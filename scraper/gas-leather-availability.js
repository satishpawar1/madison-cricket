// ─────────────────────────────────────────────────────────────────────────────
// LEATHER TEAM — Availability support for Apps Script
//
// The availability save fails with "Game not found: Dragons CC" because
// handlePostAvailability / handleGetAvailability only handle Lions and Tigers.
//
// APPLY IN 3 STEPS:
//   1. Open Apps Script: script.google.com → open Code.gs
//   2. Add the two functions below anywhere in Code.gs
//   3. Add the two routing lines into doGet and doPost (see markers below)
//   4. Redeploy: Deploy → Manage deployments → Edit → New version → Deploy
//
// No Google Sheet tab needed — data is stored in auto-created ExtraAvail_Leather
// ─────────────────────────────────────────────────────────────────────────────


// ── ADD these two functions anywhere in Code.gs ───────────────────────────────

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
  // Delete existing rows for this game
  var lastRow = sh.getLastRow();
  if (lastRow > 1) {
    var rows = sh.getRange(2, 1, lastRow - 1, 4).getValues();
    for (var i = rows.length - 1; i >= 0; i--) {
      if (String(rows[i][0]) === game) sh.deleteRow(i + 2);
    }
  }
  // Write new rows
  players.forEach(function(p) {
    sh.appendRow([game, p.name, p.available ? 1 : 0, p.selected ? 1 : 0]);
  });
  return jsonResponse({ status: 'ok' });
}


// ── In doGet — add this line just before the existing:  if (!type && team && game) ──

//   if (team === 'Leather' && e.parameter.game) return handleGetLeatherAvailability(e);


// ── In doPost — add this line just after the writeTable check ─────────────────

//   if (payload.team === 'Leather' && !payload.type && payload.game) return handlePostLeatherAvailability(payload);


// ── STEP 4: Redeploy ──────────────────────────────────────────────────────────
//   Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy
// ─────────────────────────────────────────────────────────────────────────────
