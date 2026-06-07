// ─────────────────────────────────────────────────────────────────────────────
// Madison Cricket Club — Apps Script (Code.gs)
// Copy this entire file into your Apps Script editor, replacing all existing code.
// Then: Deploy → Manage deployments → edit → New version → Deploy
// ─────────────────────────────────────────────────────────────────────────────

var SHEET_ID = '10TKIOshCNSzgqcjzc3ug6I8OCvBwylLcHY6gAGGzY_8';

var LIONS_TAB  = 'Game availability & Selection - Madison Lions';
var TIGERS_TAB = 'Game Availability and Selection - Madison Tigers';

var LIONS_CATCH_TAB  = 'Catching Efficiency - Tape T20 ';
var TIGERS_CATCH_TAB = 'Catch Efficiency - Madison Tigers';

var LEATHER_L30_TAB = 'LC_L30_Catches';

var LIONS_GAMES = [
  'FSC', 'Great Maratha', 'Nashville Underdogs', 'Rockvale Risers',
  'Fearless Fighters', 'Cool Spring Titans', 'Franklin Falcons',
  'MCA', 'Shoal Strikers', 'Star Strikers'
];
var TIGERS_GAMES = [
  'Star Strikers', 'Franklin Falcons', 'FSC', 'Great Maratha',
  'Fearless Fighters', 'Afghan Eagles', 'Rockvale Risers',
  'MCA', 'Mumbai Risers', 'Shoals Strikers'
];
var LIONS_PLAYERS = [
  'Sunny(W) ©', 'Chinmay', 'Hardik', 'Manish', 'Mahesh',
  'Mayur R', 'Nikunj', 'Kirtan', 'Satish', 'Ravi',
  'Prakrut', 'Saurabh', 'Amit', 'KP', 'Dyan (N)', 'Jeel', 'Gyan', 'Siddharth', 'Abhinav', 'Murali (sub)'
];
var TIGERS_PLAYERS = [
  'Naren ©', 'Kiran', 'Vamsi', 'Sharath', 'Tiru',
  'Sai Teja', 'Surya', 'Murali (Wk)', 'Suresh', 'Sunny P',
  'GP', 'Mayur L', 'Siva', 'Sahith', 'Prapul', 'Anurag', 'Muni Ch', 'Bhardwaj Samla', 'Sai Patel'
];
var LIONS_GAME_MAP  = { 'Cool Springs Titans': 'Cool Spring Titans', 'Shoals Strikers': 'Shoal Strikers' };
var TIGERS_GAME_MAP = {};

var LIONS_GAME_DATES = {
  'FSC': new Date('2026-03-01'), 'Great Maratha': new Date('2026-03-15'),
  'Nashville Underdogs': new Date('2026-03-29'), 'Rockvale Risers': new Date('2026-04-05'),
  'Fearless Fighters': new Date('2026-04-12'), 'Cool Spring Titans': new Date('2026-05-03'),
  'Franklin Falcons': new Date('2026-05-10'), 'MCA': new Date('2026-05-17'),
  'Shoal Strikers': new Date('2026-05-30'), 'Star Strikers': new Date('2026-06-14')
};
var TIGERS_GAME_DATES = {
  'Star Strikers': new Date('2026-02-28'), 'Franklin Falcons': new Date('2026-03-22'),
  'FSC': new Date('2026-04-05'), 'Great Maratha': new Date('2026-04-12'),
  'Fearless Fighters': new Date('2026-04-19'), 'Afghan Eagles': new Date('2026-04-26'),
  'Rockvale Risers': new Date('2026-05-03'), 'MCA': new Date('2026-05-10'),
  'Mumbai Risers': new Date('2026-06-07'), 'Shoals Strikers': new Date('2026-06-14')
};

function isGamePast(team, sheetGame) {
  var dates = team === 'Lions' ? LIONS_GAME_DATES : TIGERS_GAME_DATES;
  var gameDate = dates[sheetGame];
  if (!gameDate) return false;
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  gameDate.setHours(0, 0, 0, 0);
  return today > gameDate;
}

// ─────────────────────────────────────────────────────────────────────────────

function doPost(e) {
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var payload = JSON.parse(e.postData.contents);

  if (payload.action === 'registerMember')    return handleRegisterMember(payload);
  if (payload.action === 'writeTable')        return handleWriteTable(payload);
  if (payload.action === 'saveExtraPlayers')  return handleSaveExtraPlayers(payload);
  if (payload.action === 'saveRemovedPlayers') return handleSaveRemovedPlayers(payload);
  if (payload.team === 'Leather' && payload.game && !payload.type) return handlePostLeatherAvailability(payload);

  var type = payload.type;

  if (type === 'dotballs') {
    var team    = payload.team || 'Lions';
    var game    = payload.game || '';
    var players = payload.dotballs || [];
    var sheetName = 'DotBalls_' + team;
    var sh = ss.getSheetByName(sheetName);
    if (!sh) {
      sh = ss.insertSheet(sheetName);
      sh.appendRow(['Game', 'Player', 'Dots', 'Runs', 'Balls', 'IsOut', 'Timestamp']);
    }
    var data = sh.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === game) sh.deleteRow(i + 1);
    }
    var ts = new Date().toISOString();
    players.forEach(function(p) {
      sh.appendRow([game, p.name, p.dots || 0, p.runs || 0, p.balls || 0, p.isOut ? 'TRUE' : 'FALSE', ts]);
    });
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (type === 'bowlingdots') {
    var team    = payload.team || 'Leather';
    var game    = payload.game || '';
    var bowlers = payload.bowlers || [];
    var sheetName = 'BowlingDots_' + team;
    var sh = ss.getSheetByName(sheetName);
    if (!sh) {
      sh = ss.insertSheet(sheetName);
      sh.appendRow(['Game', 'Player', 'Dots', 'Runs', 'Balls', 'Wickets', 'Wides', 'NoBalls', 'Timestamp']);
    }
    var data = sh.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === game) sh.deleteRow(i + 1);
    }
    var ts = new Date().toISOString();
    bowlers.forEach(function(b) {
      sh.appendRow([game, b.name, b.dots||0, b.runs||0, b.balls||0, b.wickets||0, b.wides||0, b.noballs||0, ts]);
    });
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (type === 'availability') {
    var team  = payload.team;
    var game  = payload.game;
    var name  = payload.name;
    var avail = payload.available;
    var sh = ss.getSheetByName('Availability_' + team);
    if (!sh) {
      sh = ss.insertSheet('Availability_' + team);
      sh.appendRow(['Game', 'Player', 'Available', 'Timestamp']);
    }
    var data = sh.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === game && data[i][1] === name) sh.deleteRow(i + 1);
    }
    sh.appendRow([game, name, avail, new Date().toISOString()]);
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (type === 'selection') {
    var team = payload.team;
    var game = payload.game;
    var xi   = payload.xi || [];
    var sh = ss.getSheetByName('Selection_' + team);
    if (!sh) {
      sh = ss.insertSheet('Selection_' + team);
      sh.appendRow(['Game', 'Player', 'Timestamp']);
    }
    var data = sh.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === game) sh.deleteRow(i + 1);
    }
    var ts = new Date().toISOString();
    xi.forEach(function(name) { sh.appendRow([game, name, ts]); });
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (type === 'catches') {
    if (payload.team === 'Leather') return handleLeatherCatchesPost(payload);
    return handlePostCatches(payload, []);
  }

  if (!type && payload.team && payload.game && payload.players) {
    return handlePostAvailability(payload, []);
  }

  return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unknown type' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────────────────────

function doGet(e) {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var params = e.parameter;
  var type   = params.type;
  var team   = params.team || 'Lions';
  var game   = params.game || '';

  if (type === 'dotballs') {
    var sheetName = 'DotBalls_' + team;
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return ContentService.createTextOutput(JSON.stringify({ status: 'ok', games: [] }))
      .setMimeType(ContentService.MimeType.JSON);
    var rows = sh.getDataRange().getValues();
    var gamesMap = {}, gamesOrder = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      var g = r[0];
      if (game && g !== game) continue;
      if (!gamesMap[g]) { gamesMap[g] = []; gamesOrder.push(g); }
      gamesMap[g].push({ name: r[1], dots: Number(r[2]) || 0, runs: Number(r[3]) || 0, balls: Number(r[4]) || 0, isOut: r[5] === 'TRUE' });
    }
    var games = gamesOrder.map(function(g) { return { game: g, players: gamesMap[g] }; });
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok', games: games }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (type === 'bowlingdots') {
    var sheetName = 'BowlingDots_' + team;
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return ContentService.createTextOutput(JSON.stringify({ status: 'ok', games: [] }))
      .setMimeType(ContentService.MimeType.JSON);
    var rows = sh.getDataRange().getValues();
    var gamesMap = {}, gamesOrder = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      var g = r[0];
      if (game && g !== game) continue;
      if (!gamesMap[g]) { gamesMap[g] = []; gamesOrder.push(g); }
      gamesMap[g].push({ name: r[1], dots: Number(r[2])||0, runs: Number(r[3])||0, balls: Number(r[4])||0, wickets: Number(r[5])||0, wides: Number(r[6])||0, noballs: Number(r[7])||0 });
    }
    var games = gamesOrder.map(function(g) { return { game: g, players: gamesMap[g] }; });
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok', games: games }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (type === 'availability') {
    var sh = ss.getSheetByName('Availability_' + team);
    if (!sh) return ContentService.createTextOutput(JSON.stringify({ status: 'ok', data: [] }))
      .setMimeType(ContentService.MimeType.JSON);
    var rows = sh.getDataRange().getValues();
    var data = [];
    for (var i = 1; i < rows.length; i++) {
      if (!game || rows[i][0] === game) data.push({ game: rows[i][0], name: rows[i][1], available: rows[i][2] });
    }
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok', data: data }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (type === 'selection') {
    var sh = ss.getSheetByName('Selection_' + team);
    if (!sh) return ContentService.createTextOutput(JSON.stringify({ status: 'ok', data: [] }))
      .setMimeType(ContentService.MimeType.JSON);
    var rows = sh.getDataRange().getValues();
    var data = [];
    for (var i = 1; i < rows.length; i++) {
      if (!game || rows[i][0] === game) data.push({ game: rows[i][0], name: rows[i][1] });
    }
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok', data: data }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (type === 'catches') {
    if (e.parameter.team === 'Leather') return handleLeatherCatchesGet(e.parameter);
    return handleGetCatches(e);
  }

  if (params.action === 'getExtraPlayers')   return handleGetExtraPlayers(e);
  if (params.action === 'getRemovedPlayers') return handleGetRemovedPlayers(e);
  if (team === 'Leather' && e.parameter.game) return handleGetLeatherAvailability(e);

  if (!type && team && game) return handleGetAvailability(e);

  return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unknown type' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────────────────────

function handlePostAvailability(data, log) {
  var team    = data.team;
  var game    = data.game;
  var players = data.players;
  log.push('Availability - Team: ' + team + ', Game: ' + game);

  var gameMap   = team === 'Lions' ? LIONS_GAME_MAP : TIGERS_GAME_MAP;
  var sheetGame = gameMap[game] || game;

  if (isGamePast(team, sheetGame)) {
    return jsonResponse({ status: 'error', message: 'Game is in the past and locked.', log: log });
  }

  var ss      = SpreadsheetApp.openById(SHEET_ID);
  var tabName = team === 'Lions' ? LIONS_TAB : TIGERS_TAB;
  var sheet   = ss.getSheetByName(tabName);
  if (!sheet) return jsonResponse({ status: 'error', message: 'Tab not found: ' + tabName, log: log });

  var games      = team === 'Lions' ? LIONS_GAMES   : TIGERS_GAMES;
  var playerList = team === 'Lions' ? LIONS_PLAYERS : TIGERS_PLAYERS;
  var gameIdx    = games.indexOf(sheetGame);
  if (gameIdx === -1) return jsonResponse({ status: 'error', message: 'Game not found: ' + sheetGame, log: log });

  var availCol = 2 + gameIdx * 2;
  var selCol   = availCol + 1;
  var written  = 0;

  players.forEach(function(p) {
    var rowIdx = playerList.indexOf(p.name);
    if (rowIdx === -1) return;
    sheet.getRange(rowIdx + 6, availCol).setValue(p.available);
    sheet.getRange(rowIdx + 6, selCol).setValue(p.selected);
    written++;
  });

  var extras = players.filter(function(p) { return playerList.indexOf(p.name) === -1; });
  if (extras.length > 0) {
    var extraAvailSheet = ss.getSheetByName('ExtraAvail_' + team) || ss.insertSheet('ExtraAvail_' + team);
    if (extraAvailSheet.getLastRow() === 0)
      extraAvailSheet.getRange(1, 1, 1, 4).setValues([['Game', 'Player', 'Available', 'Selected']]);
    var ead = extraAvailSheet.getDataRange().getValues();
    for (var ei = ead.length - 1; ei >= 1; ei--) {
      if (ead[ei][0] === sheetGame) extraAvailSheet.deleteRow(ei + 1);
    }
    extras.forEach(function(p) {
      extraAvailSheet.appendRow([sheetGame, p.name, p.available, p.selected]);
    });
  }

  updateGamesPlayed(sheet, games, playerList);
  logSubmission(ss, team, game, 'availability', written);
  try { writePlayingXILog(ss, team, sheetGame); } catch(err) { Logger.log('PlayingXI error: ' + err); }
  return jsonResponse({ status: 'ok', message: game + ' (' + team + ') recorded. ' + written + ' players written.', log: log });
}

function handlePostCatches(data, log) {
  var team    = data.team;
  var game    = data.game;
  var catches = data.catches;
  log.push('Catches - Team: ' + team + ', Game: ' + game);

  var ss      = SpreadsheetApp.openById(SHEET_ID);
  var tabName = team === 'Lions' ? LIONS_CATCH_TAB : TIGERS_CATCH_TAB;
  var sheet   = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    setupCatchSheet(sheet, team);
  }

  var games      = team === 'Lions' ? LIONS_GAMES   : TIGERS_GAMES;
  var playerList = team === 'Lions' ? LIONS_PLAYERS : TIGERS_PLAYERS;
  var gameMap    = team === 'Lions' ? LIONS_GAME_MAP : TIGERS_GAME_MAP;
  var sheetGame  = gameMap[game] || game;
  var gameIdx    = games.indexOf(sheetGame);
  if (gameIdx === -1) gameIdx = games.indexOf(game);
  if (gameIdx === -1) return jsonResponse({ status: 'error', message: 'Game not found: ' + game, log: log });

  var attCol  = 2 + gameIdx * 3;
  var takCol  = attCol + 1;
  var dropCol = attCol + 2;

  catches.forEach(function(c) {
    var rowIdx = playerList.indexOf(c.name);
    if (rowIdx === -1) return;
    var row = rowIdx + 3;
    sheet.getRange(row, attCol).setValue(c.attempted);
    sheet.getRange(row, takCol).setValue(c.taken);
    sheet.getRange(row, dropCol).setValue(c.dropped);
  });

  logSubmission(ss, team, game, 'catches', catches.length);
  return jsonResponse({ status: 'ok', message: 'Catches saved for ' + game + ' (' + team + ').', log: log });
}

function setupCatchSheet(sheet, team) {
  var games      = team === 'Lions' ? LIONS_GAMES   : TIGERS_GAMES;
  var playerList = team === 'Lions' ? LIONS_PLAYERS : TIGERS_PLAYERS;

  sheet.getRange(1, 1).setValue('Player');
  games.forEach(function(g, i) {
    var col = 2 + i * 3;
    sheet.getRange(1, col).setValue(g);
    sheet.getRange(1, col, 1, 3).merge();
  });

  sheet.getRange(2, 1).setValue('Player');
  games.forEach(function(g, i) {
    var col = 2 + i * 3;
    sheet.getRange(2, col).setValue('Attempted');
    sheet.getRange(2, col + 1).setValue('Taken');
    sheet.getRange(2, col + 2).setValue('Dropped');
  });

  playerList.forEach(function(name, i) {
    sheet.getRange(i + 3, 1).setValue(name);
  });

  sheet.setFrozenRows(2);
  sheet.setFrozenColumns(1);
}

function handleGetAvailability(e) {
  var team = e.parameter.team;
  var game = e.parameter.game;
  if (!team || !game) return jsonResponse({ status: 'error', message: 'Missing team or game' });

  var gameMap   = team === 'Lions' ? LIONS_GAME_MAP : TIGERS_GAME_MAP;
  var sheetGame = gameMap[game] || game;
  var ss        = SpreadsheetApp.openById(SHEET_ID);
  var sheet     = ss.getSheetByName(team === 'Lions' ? LIONS_TAB : TIGERS_TAB);
  if (!sheet) return jsonResponse({ status: 'ok', data: [] });

  var games      = team === 'Lions' ? LIONS_GAMES   : TIGERS_GAMES;
  var playerList = team === 'Lions' ? LIONS_PLAYERS : TIGERS_PLAYERS;
  var gameIdx    = games.indexOf(sheetGame);
  if (gameIdx === -1) return jsonResponse({ status: 'ok', data: [] });

  var availCol = 2 + gameIdx * 2;
  var selCol   = availCol + 1;
  var result   = playerList.map(function(name, i) {
    return {
      name:      name,
      available: sheet.getRange(i + 6, availCol).getValue() || 0,
      selected:  sheet.getRange(i + 6, selCol).getValue()   || 0
    };
  });

  var extraAvailSheet = ss.getSheetByName('ExtraAvail_' + team);
  if (extraAvailSheet && extraAvailSheet.getLastRow() > 1) {
    var ead = extraAvailSheet.getRange(2, 1, extraAvailSheet.getLastRow() - 1, 4).getValues();
    ead.forEach(function(row) {
      if (row[0] === sheetGame)
        result.push({ name: row[1], available: row[2] || 0, selected: row[3] || 0 });
    });
  }
  return jsonResponse({ status: 'ok', data: result });
}

function handleGetCatches(e) {
  var team = e.parameter.team;
  var game = e.parameter.game;
  if (!team) return jsonResponse({ status: 'error', message: 'Missing team' });

  var ss      = SpreadsheetApp.openById(SHEET_ID);
  var tabName = team === 'Lions' ? LIONS_CATCH_TAB : TIGERS_CATCH_TAB;
  var sheet   = ss.getSheetByName(tabName);
  if (!sheet) return jsonResponse({ status: 'ok', data: [], message: 'Catch sheet not found' });

  var games      = team === 'Lions' ? LIONS_GAMES   : TIGERS_GAMES;
  var playerList = team === 'Lions' ? LIONS_PLAYERS : TIGERS_PLAYERS;
  var gameMap    = team === 'Lions' ? LIONS_GAME_MAP : TIGERS_GAME_MAP;

  var totalCols = 2 + games.length * 3;
  var lastRow   = sheet.getLastRow();
  if (lastRow < 3) return jsonResponse({ status: 'ok', data: [] });

  var allValues = sheet.getRange(1, 1, lastRow, totalCols).getValues();

  function getForGame(gameIdx) {
    return playerList.map(function(name, i) {
      var row    = allValues[i + 2];
      if (!row) return { name: name, att: 0, tak: 0 };
      var attCol = 1 + gameIdx * 3;
      return { name: name, att: parseFloat(row[attCol]) || 0, tak: parseFloat(row[attCol + 1]) || 0 };
    });
  }

  if (game) {
    var sheetGame = gameMap[game] || game;
    var gameIdx   = games.indexOf(sheetGame);
    if (gameIdx === -1) gameIdx = games.indexOf(game);
    if (gameIdx === -1) return jsonResponse({ status: 'ok', data: [] });
    return jsonResponse({ status: 'ok', data: getForGame(gameIdx) });
  }

  var result = playerList.map(function(name, i) {
    var row = allValues[i + 2];
    if (!row) return { name: name, att: 0, tak: 0 };
    var totalAtt = 0, totalTak = 0;
    games.forEach(function(g, gi) {
      var attCol = 1 + gi * 3;
      totalAtt += parseFloat(row[attCol])     || 0;
      totalTak += parseFloat(row[attCol + 1]) || 0;
    });
    return { name: name, att: totalAtt, tak: totalTak };
  });
  return jsonResponse({ status: 'ok', data: result });
}

// ─────────────────────────────────────────────────────────────────────────────
// Leather catches — single tab for entire L-30 tournament

function getLeatherL30Sheet_(ss) {
  var sh = ss.getSheetByName(LEATHER_L30_TAB);
  if (!sh) {
    sh = ss.insertSheet(LEATHER_L30_TAB);
    sh.getRange(1, 1, 1, 5).setValues([['Game', 'Player', 'Attempted', 'Taken', 'Dropped']]);
  }
  return sh;
}

function handleLeatherCatchesGet(params) {
  var ss   = SpreadsheetApp.openById(SHEET_ID);
  var sh   = getLeatherL30Sheet_(ss);
  var game = params.game;
  if (sh.getLastRow() < 2) return jsonResponse({ status: 'ok', data: [] });
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
  if (game) {
    var data = rows
      .filter(function(r) { return String(r[0]) === game && r[1]; })
      .map(function(r) {
        return { name: String(r[1]), attempted: Number(r[2]), taken: Number(r[3]), dropped: Number(r[4]) };
      });
    return jsonResponse({ status: 'ok', data: data });
  }
  var totals = {};
  rows.forEach(function(r) {
    var name = String(r[1]);
    if (!name) return;
    if (!totals[name]) totals[name] = { name: name, attempted: 0, taken: 0, dropped: 0 };
    totals[name].attempted += Number(r[2]);
    totals[name].taken     += Number(r[3]);
    totals[name].dropped   += Number(r[4]);
  });
  return jsonResponse({ status: 'ok', data: Object.values(totals) });
}

function handleLeatherCatchesPost(data) {
  var ss   = SpreadsheetApp.openById(SHEET_ID);
  var game = data.game;
  if (!game) return jsonResponse({ status: 'error', message: 'game name required' });
  var sh   = getLeatherL30Sheet_(ss);
  var last = sh.getLastRow();
  if (last >= 2) {
    var existing = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = existing.length - 1; i >= 0; i--) {
      if (String(existing[i][0]) === game) sh.deleteRow(i + 2);
    }
  }
  var catches = data.catches || [];
  if (catches.length) {
    var newRows = catches.map(function(c) {
      return [game, c.name, c.attempted || 0, c.taken || 0, c.dropped || 0];
    });
    sh.getRange(sh.getLastRow() + 1, 1, newRows.length, 5).setValues(newRows);
  }
  return jsonResponse({ status: 'ok' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Leather availability

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
  var game    = data.game;
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

// ─────────────────────────────────────────────────────────────────────────────
// Roster management

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
  var team    = data.team;
  var players = data.players || [];
  if (!team) return jsonResponse({ status: 'error', message: 'Missing team' });
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName('Roster_' + team);
  if (!sh) { sh = ss.insertSheet('Roster_' + team); sh.getRange(1, 1).setValue('Player'); }
  var lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, 1).clearContent();
  if (players.length > 0) sh.getRange(2, 1, players.length, 1).setValues(players.map(function(p) { return [p]; }));
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
  var team    = data.team;
  var players = data.players || [];
  if (!team) return jsonResponse({ status: 'error', message: 'Missing team' });
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName('Roster_Removed_' + team);
  if (!sh) { sh = ss.insertSheet('Roster_Removed_' + team); sh.getRange(1, 1).setValue('Player'); }
  var lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, 1).clearContent();
  if (players.length > 0) sh.getRange(2, 1, players.length, 1).setValues(players.map(function(p) { return [p]; }));
  return jsonResponse({ status: 'ok' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities

function handleRegisterMember(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Members') || ss.insertSheet('Members');
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, 3).setValues([['Timestamp', 'Name', 'Email']]);
  var existing = sh.getLastRow() > 1 ? sh.getRange(2, 3, sh.getLastRow() - 1, 1).getValues().flat() : [];
  if (existing.indexOf(data.email) !== -1)
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok', message: 'already_registered' })).setMimeType(ContentService.MimeType.JSON);
  sh.appendRow([new Date().toISOString(), data.name, data.email]);
  return ContentService.createTextOutput(JSON.stringify({ status: 'ok' })).setMimeType(ContentService.MimeType.JSON);
}

function handleWriteTable(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(data.sheetName) || ss.insertSheet(data.sheetName);
  sh.clearContents();
  if (data.headers && data.headers.length) sh.getRange(1, 1, 1, data.headers.length).setValues([data.headers]);
  if (data.rows && data.rows.length) sh.getRange(2, 1, data.rows.length, data.rows[0].length).setValues(data.rows);
  return ContentService.createTextOutput(JSON.stringify({ status: 'ok', sheet: data.sheetName })).setMimeType(ContentService.MimeType.JSON);
}

function updateGamesPlayed(sheet, games, playerList) {
  var completed = 0;
  games.forEach(function(g, i) {
    var col  = 2 + i * 2;
    var vals = sheet.getRange(6, col, playerList.length, 1).getValues().flat();
    if (vals.some(function(v) { return v !== '' && v !== null; })) completed++;
  });
  sheet.getRange(2, 2).setValue(completed);
}

function logSubmission(ss, team, game, type, count) {
  var log = ss.getSheetByName('Log');
  if (!log) {
    log = ss.insertSheet('Log');
    log.getRange(1, 1, 1, 5).setValues([['Timestamp', 'Team', 'Game', 'Type', 'Count']]);
  }
  log.appendRow([new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }), team, game, type, count]);
}

function writePlayingXILog(ss, team, sheetGame) {
  var games      = team === 'Lions' ? LIONS_GAMES   : TIGERS_GAMES;
  var playerList = team === 'Lions' ? LIONS_PLAYERS : TIGERS_PLAYERS;
  var sheet      = ss.getSheetByName(team === 'Lions' ? LIONS_TAB : TIGERS_TAB);
  var gameIdx    = games.indexOf(sheetGame);
  if (!sheet || gameIdx === -1) return;

  var selCol = 2 + gameIdx * 2 + 1;
  var selectedNames = [];
  for (var i = 0; i < playerList.length; i++) {
    if (Number(sheet.getRange(i + 6, selCol).getValue()) === 1) selectedNames.push(playerList[i]);
  }

  var extraSheet = ss.getSheetByName('ExtraAvail_' + team);
  if (extraSheet && extraSheet.getLastRow() > 1) {
    var extraData = extraSheet.getRange(2, 1, extraSheet.getLastRow() - 1, 4).getValues();
    for (var j = 0; j < extraData.length; j++) {
      if (extraData[j][0] === sheetGame && Number(extraData[j][3]) === 1) selectedNames.push(String(extraData[j][1]));
    }
  }

  var sh = ss.getSheetByName('Playing XI Log');
  if (!sh) { sh = ss.insertSheet('Playing XI Log'); sh.appendRow(['Timestamp', 'Team', 'Game', 'Playing XI']); }

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

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function keepAlive() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  ss.getName();
}
