// ─────────────────────────────────────────────────────────────────────────────
// LEATHER CATCHES HANDLER  (single tab for the entire L-30 tournament)
//
// All catch data lives in one tab: "LC_L30_Catches"
// Columns: Game | Player | Attempted | Taken | Dropped
//
// This means zero setup for new games — just save from the catch log and the
// row appears automatically. No per-game tabs, no code changes ever.
//
// INSTALLATION — add the two functions below to your Apps Script, then wire
// them in:
//
//   Inside doGet(), in the block that handles type === 'catches':
//     if (e.parameter.team === 'Leather') return handleLeatherCatchesGet(e.parameter);
//
//   Inside doPost(), in the block that handles data.type === 'catches':
//     if (data.team === 'Leather') return handleLeatherCatchesPost(data);
//
//   (add both lines BEFORE the existing Lions/Tigers catch logic)
//
// Then re-deploy: Deploy → Manage deployments → edit → New version → Deploy.
// ─────────────────────────────────────────────────────────────────────────────

var LEATHER_L30_TAB = 'LC_L30_Catches';

function getLeatherL30Sheet_(ss) {
  var sh = ss.getSheetByName(LEATHER_L30_TAB);
  if (!sh) {
    sh = ss.insertSheet(LEATHER_L30_TAB);
    sh.getRange(1, 1, 1, 5).setValues([['Game', 'Player', 'Attempted', 'Taken', 'Dropped']]);
  }
  return sh;
}

// ── GET handler ──────────────────────────────────────────────────────────────
// ?type=catches&team=Leather&game=Dragons CC  → single-game rows for log page
// ?type=catches&team=Leather                 → aggregate per player (dashboard)
function handleLeatherCatchesGet(params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = getLeatherL30Sheet_(ss);
  var game = params.game;

  if (sh.getLastRow() < 2) return jsonOut_({ status: 'ok', data: [] });

  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();

  if (game) {
    // Single-game: return only rows matching this game
    var data = rows
      .filter(function(r) { return String(r[0]) === game && r[1]; })
      .map(function(r) {
        return { name: String(r[1]), attempted: Number(r[2]), taken: Number(r[3]), dropped: Number(r[4]) };
      });
    return jsonOut_({ status: 'ok', data: data });
  }

  // Aggregate: sum per player across all games
  var totals = {};
  rows.forEach(function(r) {
    var name = String(r[1]);
    if (!name) return;
    if (!totals[name]) totals[name] = { name: name, attempted: 0, taken: 0, dropped: 0 };
    totals[name].attempted += Number(r[2]);
    totals[name].taken     += Number(r[3]);
    totals[name].dropped   += Number(r[4]);
  });
  return jsonOut_({ status: 'ok', data: Object.values(totals) });
}

// ── POST handler ─────────────────────────────────────────────────────────────
// { type:'catches', team:'Leather', game, catches:[{name, attempted, taken, dropped}] }
// Replaces all rows for this game (upsert by game name), leaves other games intact.
function handleLeatherCatchesPost(data) {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var game = data.game;
  if (!game) return jsonOut_({ status: 'error', message: 'game name required' });

  var sh   = getLeatherL30Sheet_(ss);
  var last = sh.getLastRow();

  // Delete existing rows for this game (scan bottom-up to avoid index shifting)
  if (last >= 2) {
    var existing = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = existing.length - 1; i >= 0; i--) {
      if (String(existing[i][0]) === game) sh.deleteRow(i + 2);
    }
  }

  // Append new rows for this game
  var catches = data.catches || [];
  if (catches.length) {
    var newRows = catches.map(function(c) {
      return [game, c.name, c.attempted || 0, c.taken || 0, c.dropped || 0];
    });
    sh.getRange(sh.getLastRow() + 1, 1, newRows.length, 5).setValues(newRows);
  }

  return jsonOut_({ status: 'ok' });
}

// ── Shared JSON response helper ───────────────────────────────────────────────
function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
