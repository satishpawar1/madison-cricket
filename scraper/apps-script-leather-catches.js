// ─────────────────────────────────────────────────────────────────────────────
// LEATHER CATCHES HANDLER
//
// Stores each game's catch data in a tab named "LC_<game>" (e.g. "LC_Dragons CC").
// Works for both reads (dashboard + log) and writes (log → save).
//
// INSTALLATION — add the three functions below to your Apps Script, then wire
// them in as follows:
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

// All valid Leather L-30 game names (must match MCC_CONFIG.leather.t30Games[].name)
var LEATHER_CATCH_GAMES = ['Dragons CC'];

function leatherCatchTabName_(game) {
  return 'LC_' + game;
}

// ── GET handler ──────────────────────────────────────────────────────────────
// Called for both:
//   ?type=catches&team=Leather&game=Dragons CC   → single-game data for log page
//   ?type=catches&team=Leather                   → aggregate data for dashboard
function handleLeatherCatchesGet(params) {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var game = params.game;

  if (game) {
    // Single-game read
    if (LEATHER_CATCH_GAMES.indexOf(game) === -1) {
      return jsonOut_({ status: 'error', message: 'game not found' });
    }
    var sh = ss.getSheetByName(leatherCatchTabName_(game));
    if (!sh || sh.getLastRow() < 2) {
      return jsonOut_({ status: 'ok', data: [] });
    }
    var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
    var data = rows
      .filter(function(r) { return r[0]; })
      .map(function(r) {
        return { name: String(r[0]), attempted: Number(r[1]), taken: Number(r[2]), dropped: Number(r[3]) };
      });
    return jsonOut_({ status: 'ok', data: data });
  }

  // Aggregate read — merge all game tabs into per-player totals
  var totals = {};
  LEATHER_CATCH_GAMES.forEach(function(g) {
    var sh = ss.getSheetByName(leatherCatchTabName_(g));
    if (!sh || sh.getLastRow() < 2) return;
    var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
    rows.forEach(function(r) {
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
// Called when the catch log page saves: { type:'catches', team:'Leather', game, catches:[...] }
function handleLeatherCatchesPost(data) {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var game = data.game;

  if (!game || LEATHER_CATCH_GAMES.indexOf(game) === -1) {
    return jsonOut_({ status: 'error', message: 'game not found' });
  }

  var tabName = leatherCatchTabName_(game);
  var sh      = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
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
