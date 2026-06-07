// ─────────────────────────────────────────────────────────────────────────────
// LEATHER CATCHES HANDLER  (generic — no hardcoded game list, never needs editing)
//
// Stores each game's catch data in a tab named "LC_<game>" (e.g. "LC_Dragons CC").
// Auto-creates the tab on first save, so no Apps Script changes are needed for
// new games.
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

// ── GET handler ──────────────────────────────────────────────────────────────
// ?type=catches&team=Leather&game=Dragons CC  → single-game data for log page
// ?type=catches&team=Leather                 → aggregate across all LC_* tabs
function handleLeatherCatchesGet(params) {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var game = params.game;

  if (game) {
    var sh = ss.getSheetByName('LC_' + game);
    if (!sh || sh.getLastRow() < 2) return jsonOut_({ status: 'ok', data: [] });
    var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
    var data = rows
      .filter(function(r) { return r[0]; })
      .map(function(r) {
        return { name: String(r[0]), attempted: Number(r[1]), taken: Number(r[2]), dropped: Number(r[3]) };
      });
    return jsonOut_({ status: 'ok', data: data });
  }

  // Aggregate: scan all LC_* tabs and sum per player
  var allSheets = ss.getSheets();
  var totals = {};
  allSheets.forEach(function(sh) {
    if (sh.getName().indexOf('LC_') !== 0) return;
    if (sh.getLastRow() < 2) return;
    sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(function(r) {
      var name = String(r[0]);
      if (!name) return;
      if (!totals[name]) totals[name] = { name: name, attempted: 0, taken: 0, dropped: 0 };
      totals[name].attempted += Number(r[1]);
      totals[name].taken     += Number(r[2]);
      totals[name].dropped   += Number(r[3]);
    });
  });
  return jsonOut_({ status: 'ok', data: Object.values(totals) });
}

// ── POST handler ─────────────────────────────────────────────────────────────
// { type:'catches', team:'Leather', game, catches:[{name, attempted, taken, dropped}] }
function handleLeatherCatchesPost(data) {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var game = data.game;
  if (!game) return jsonOut_({ status: 'error', message: 'game name required' });

  var sh = ss.getSheetByName('LC_' + game) || ss.insertSheet('LC_' + game);
  sh.clearContents();
  sh.getRange(1, 1, 1, 4).setValues([['Player', 'Attempted', 'Taken', 'Dropped']]);

  var catches = data.catches || [];
  if (catches.length) {
    var rows = catches.map(function(c) {
      return [c.name, c.attempted || 0, c.taken || 0, c.dropped || 0];
    });
    sh.getRange(2, 1, rows.length, 4).setValues(rows);
  }
  return jsonOut_({ status: 'ok' });
}

// ── Shared JSON response helper ───────────────────────────────────────────────
function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
