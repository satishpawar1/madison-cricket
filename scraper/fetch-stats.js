const fs   = require('fs');
const path = require('path');
const { sleep, createBrowser } = require('./utils');

// Hard kill: if the whole script takes more than 6 minutes, exit with failure
setTimeout(() => {
  console.error('Hard timeout reached (6 min) — exiting');
  process.exit(1);
}, 6 * 60 * 1000);

const BASE = 'https://cricclubs.com/NashvilleCricketLeague';
const CLUB = '1092658';

// Games where CricClubs has the wrong player registered; correct attribution post-fetch.
// Each entry transfers bowling stats from `fromName` to `toName` for a specific matchId.
const BOWLING_GAME_CORRECTIONS = [
  {
    matchId:  '1703',
    fromName: 'Saurabh Sheth',
    toName:   'Siddharth Chaudhary',
    team:     'Madison Lions',
    innings: 1, balls: 18, overs: '3.0', wickets: 2, runs: 6,
    wides: 3, noballs: 0, maidens: 0
  }
];

function applyBowlingCorrections(bowlingArr, rankingsArr) {
  BOWLING_GAME_CORRECTIONS.forEach(c => {
    const fromIdx = bowlingArr.findIndex(p => p.name === c.fromName && p.team === c.team);
    if (fromIdx !== -1) {
      const p = bowlingArr[fromIdx];
      const fromParts = (p.overs || '0').split('.');
      const fromBalls = parseInt(fromParts[0]) * 6 + (parseInt(fromParts[1]) || 0);
      const newBalls  = fromBalls - c.balls;
      const newOvers  = Math.floor(newBalls / 6) + '.' + (newBalls % 6);
      const newWkts   = (p.wickets || 0) - c.wickets;
      const newRuns   = (p.runs    || 0) - c.runs;
      p.matches    = Math.max(0, (p.matches  || 0) - 1);
      p.innings    = Math.max(0, (p.innings  || 0) - c.innings);
      p.overs      = newOvers;
      p.wickets    = newWkts;
      p.runs       = newRuns;
      p.wides      = Math.max(0, (p.wides   || 0) - c.wides);
      p.noballs    = Math.max(0, (p.noballs  || 0) - c.noballs);
      p.maidens    = Math.max(0, (p.maidens  || 0) - c.maidens);
      p.average    = newWkts > 0 ? newRuns / newWkts : null;
      p.economy    = newBalls > 0 ? parseFloat((newRuns / (newBalls / 6)).toFixed(2)) : null;
      p.strikeRate = newWkts > 0 ? parseFloat((newBalls / newWkts).toFixed(2)) : null;
      if (newWkts === 0) p.bestFigures = '0/' + newRuns;
    }

    const toExists = bowlingArr.find(p => p.name === c.toName && p.team === c.team);
    if (!toExists) {
      bowlingArr.push({
        name:        c.toName,
        team:        c.team,
        matches:     1,
        innings:     c.innings,
        overs:       c.overs,
        wickets:     c.wickets,
        runs:        c.runs,
        maidens:     c.maidens,
        bestFigures: c.wickets + '/' + c.runs,
        hattricks:   0, fourWickets: 0, fiveWickets: 0,
        wides:       c.wides,
        noballs:     c.noballs,
        average:     c.wickets > 0 ? c.runs / c.wickets : null,
        economy:     parseFloat((c.runs / parseFloat(c.overs)).toFixed(2)),
        strikeRate:  c.wickets > 0 ? parseFloat((c.balls / c.wickets).toFixed(2)) : null,
      });
      bowlingArr.sort((a, b) => (b.wickets || 0) - (a.wickets || 0));
    }

    const fromRank = rankingsArr.find(r => r.name === c.fromName);
    const toRankExists = rankingsArr.find(r => r.name === c.toName);
    if (fromRank) {
      const bpts = fromRank.bowling || 0;
      fromRank.bowling = 0;
      fromRank.matches = Math.max(0, (fromRank.matches || 0) - 1);
      fromRank.total   = (fromRank.batting || 0) + (fromRank.fielding || 0);
      if (!toRankExists) {
        rankingsArr.push({
          name: c.toName, team: c.team,
          matches: 1, batting: 0, bowling: bpts, fielding: 0, total: bpts, mom: 0
        });
      }
    }
  });
}

// Old JSP interface league IDs:
const LEAGUE_2026 = '28'; // 2026 - Tape 20
// 2025 Tape T20 tournament — uses viewLeagueBatting.do / viewLeagueBowling.do with league=17
const LEAGUE_2025_T20 = '17';

// ── Helper: extract match links + meta from listMatches page for a given team keyword ──
async function extractMatchLinksForTeam(page, url, teamKeyword) {
  console.log(`  Loading match list for ${teamKeyword}...`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  } catch(e) {
    console.log(`  ⚠ load warning: ${e.message.split('\n')[0]}`);
  }
  await sleep(3000);

  return page.evaluate((keyword) => {
    const rows = Array.from(document.querySelectorAll('table tr'));
    const results = [];
    for (const row of rows) {
      const cells = Array.from(row.cells).map(c => c.textContent.trim());
      if (cells.length < 6) continue;
      const team1 = cells[3] || '';
      const team2 = cells[4] || '';
      if (!team1.includes(keyword) && !team2.includes(keyword)) continue;
      const result = cells[5] || '';
      if (!result || result.length < 2) continue;
      const links = Array.from(row.querySelectorAll('a[href*="viewScorecard"]'));
      if (!links.length) continue;
      const href = links[0].href || '';
      const m = href.match(/matchId=(\d+)/);
      if (!m) continue;
      results.push({
        matchId: m[1],
        opponent: (team1.includes(keyword) ? team2 : team1).trim(),
        date: cells[2] || '',
      });
    }
    return results;
  }, teamKeyword);
}

// ── Helper: extract all bowling tables from a scorecard page ──
// CricClubs scorecard bowling table format:
//   Headers: ["Bowling","O","M","Dot","R","W","Econ",""]   (8 cols)
//   Data row: ["", name, overs, maidens, dots, runs, wkts, econ, extrasStr]  (9 cells, leading empty)
//   extrasStr format: "(7 w1 nb)" = 7 wides, 1 no-ball
async function extractScorecardBowlingTables(page, matchId) {
  const url = `${BASE}/viewScorecard.do?matchId=${matchId}&clubId=${CLUB}`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch(e) {
    console.log(`  ⚠ scorecard load warning (matchId=${matchId}): ${e.message.split('\n')[0]}`);
  }
  await sleep(3000);

  return page.evaluate(() => {
    function parseExtrasStr(str) {
      const s = (str || '').replace(/\s+/g, ' ').trim();
      // Format: "(Nw Mnb)" — number before 'w' = wides, number before 'nb' = no-balls
      const wm = s.match(/(\d+)\s*w/i);
      const nm = s.match(/(\d+)\s*nb/i);
      return {
        wides:   wm ? parseInt(wm[1]) : 0,
        noballs: nm ? parseInt(nm[1]) : 0,
      };
    }

    const tables = Array.from(document.querySelectorAll('table'));
    const result = [];

    tables.forEach(table => {
      const rows = Array.from(table.rows);
      if (rows.length < 3) return;
      const headers = Array.from((rows[0] || { cells: [] }).cells)
        .map(c => c.textContent.trim().toUpperCase());

      // Identify CricClubs scorecard bowling table by "BOWLING" + "DOT" headers
      if (!headers.some(h => h === 'BOWLING') || !headers.some(h => h === 'DOT')) return;

      // Data rows have one extra leading empty cell → data index = header index + 1
      const hi = (key) => {
        const i = headers.indexOf(key);
        return i >= 0 ? i + 1 : -1;
      };
      const nameIdx = hi('BOWLING'); // always 1
      const oIdx    = hi('O');
      const dotIdx  = hi('DOT');
      const rIdx    = hi('R');
      const wktIdx  = hi('W');
      const econIdx = hi('ECON');
      const extIdx  = headers.lastIndexOf('') + 1; // last column (extras string)

      const bowlers = [];
      rows.slice(1).forEach(row => {
        const cells = Array.from(row.cells).map(c => c.textContent.trim());
        if (cells.length < 5) return;
        const name = nameIdx >= 0 ? (cells[nameIdx] || '').replace(/\s+/g, ' ').trim() : '';
        if (!name || /extras|total|yet to bat/i.test(name)) return;
        if (/^[\d\-\s*()]+$/.test(name)) return;

        const overs = oIdx >= 0 ? (cells[oIdx] || '0') : '0';
        const parts = overs.split('.');
        const balls = parseInt(parts[0] || 0) * 6 + (parseInt(parts[1] || 0) || 0);
        const ex    = extIdx > 0 ? parseExtrasStr(cells[extIdx] || '') : { wides: 0, noballs: 0 };

        bowlers.push({
          name,
          overs,
          balls,
          dots:    dotIdx  >= 0 ? (+cells[dotIdx]  || 0) : 0,
          runs:    rIdx    >= 0 ? (+cells[rIdx]     || 0) : 0,
          wickets: wktIdx  >= 0 ? (+cells[wktIdx]   || 0) : 0,
          economy: econIdx >= 0 ? (parseFloat(cells[econIdx]) || null) : null,
          wides:   ex.wides,
          noballs: ex.noballs,
        });
      });

      if (bowlers.length >= 2) result.push(bowlers);
    });

    return result;
  });
}

// ── Helper: find which bowling table belongs to our team ──
function findOurBowlingInnings(tables, ourBowlerNames) {
  if (!tables || !tables.length) return null;
  // Build set of first-name tokens for our known bowlers
  const ours = new Set(ourBowlerNames.map(n => n.toLowerCase().trim().split(/\s+/)[0]));
  let best = null, bestScore = 0;
  for (const table of tables) {
    const score = table.filter(b => {
      const first = b.name.toLowerCase().trim().split(/\s+/)[0];
      return ours.has(first);
    }).length;
    if (score > bestScore) { bestScore = score; best = table; }
  }
  // Accept if at least 2 of our known bowlers appear in the table
  return bestScore >= 2 ? best : (tables[0] || null);
}

// ── Helper: fetch per-game extras for a team ──
async function fetchExtrasGames(page, matchesUrl, teamKeyword, knownBowlerNames, existingGames) {
  // Index existing data by matchId so we can skip re-scraping
  const existingById = {};
  (existingGames || []).forEach(g => { if (g.matchId) existingById[g.matchId] = g; });

  const matches = await extractMatchLinksForTeam(page, matchesUrl, teamKeyword);
  console.log(`  ${teamKeyword}: ${matches.length} completed games found`);
  const extrasGames = [];
  for (const match of matches) {
    if (existingById[match.matchId]) {
      console.log(`  → Skipping vs ${match.opponent} (matchId=${match.matchId}) — already scraped`);
      extrasGames.push(existingById[match.matchId]);
      continue;
    }
    process.stdout.write(`  → Scraping vs ${match.opponent} (matchId=${match.matchId})... `);
    const tables = await extractScorecardBowlingTables(page, match.matchId);
    const innings = findOurBowlingInnings(tables, knownBowlerNames);
    if (innings && innings.length) {
      extrasGames.push({ matchId: match.matchId, game: match.opponent, date: match.date, players: innings });
      console.log(`${innings.length} bowlers`);
    } else {
      console.log('no bowling data found');
    }
    await sleep(800);
  }
  return extrasGames;
}

// ── Helper: extract table rows from the page's largest table ──
async function extractTable(page, url, minCols = 4) {
  console.log(`  Loading ${url.split('?')[0].split('/').pop()}...`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  } catch(e) {
    console.log(`  ⚠ load warning: ${e.message.split('\n')[0]}`);
  }
  await sleep(3000);

  return page.evaluate((minCols) => {
    const tables = Array.from(document.querySelectorAll('table'));
    const best = tables
      .map(t => {
        const rows = Array.from(t.rows);
        if (!rows[0] || rows[0].cells.length < minCols) return null;
        return {
          headers: Array.from(rows[0].cells).map(c => c.textContent.trim()),
          rows: rows.slice(1).map(r => Array.from(r.cells).map(c => c.textContent.trim())),
          rowCount: rows.length
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.rowCount - a.rowCount)[0];
    return best || null;
  }, minCols);
}

// ── Helper: extract ALL matching tables (used for multi-group standings) ──
async function extractAllTables(page, url, minCols = 4) {
  console.log(`  Loading ${url.split('?')[0].split('/').pop()} (all tables)...`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  } catch(e) {
    console.log(`  ⚠ load warning: ${e.message.split('\n')[0]}`);
  }
  await sleep(3000);

  return page.evaluate((minCols) => {
    const tables = Array.from(document.querySelectorAll('table'));
    return tables
      .map(t => {
        const rows = Array.from(t.rows);
        if (!rows[0] || rows[0].cells.length < minCols) return null;
        return {
          headers: Array.from(rows[0].cells).map(c => c.textContent.trim()),
          rows: rows.slice(1).map(r => Array.from(r.cells).map(c => c.textContent.trim())),
          rowCount: rows.length
        };
      })
      .filter(Boolean);
  }, minCols);
}

// ── Column parsers ──

function parseBatting(table) {
  // Headers: "#", "Player", "Team", "Mat", "Inns", "NO", "Runs", "4's", "6's", "50's", "100's", "HS", "SR", "Avg", "Points"
  if (!table) return [];
  return table.rows
    .filter(r => r.length >= 9 && /^\d+$/.test(r[0]))
    .map(r => ({
      name: r[1],
      team: r[2],
      matches: +r[3] || 0,
      innings: +r[4] || 0,
      notOuts: +r[5] || 0,
      runs: +r[6] || 0,
      fours: +r[7] || 0,
      sixes: +r[8] || 0,
      fifties: +r[9] || 0,
      hundreds: +r[10] || 0,
      highest: r[11] || '0',
      strikeRate: parseFloat(r[12]) || 0,
      average: parseFloat(r[13]) || 0,
    }))
    .sort((a, b) => b.runs - a.runs);
}

function parseBowling(table) {
  // Headers: "#", "Player", "Team", "Mat", "Inns", "Overs", "Runs", "Wkts", "BBF", "Mdns", "dots", "Econ", "Avg", "SR", "Hat-trick", "4w", "5w", ...
  if (!table) return [];
  return table.rows
    .filter(r => r.length >= 8 && /^\d+$/.test(r[0]))
    .map(r => {
      // Convert "18.1" overs → display format unchanged; also derive balls
      const overs = r[5] || '0';
      const [overInt, ballPart] = overs.split('.');
      const balls = parseInt(overInt) * 6 + (parseInt(ballPart) || 0);

      // BBF format in old interface is "runsGiven/ wickets" e.g. "26/ 4" → normalize to "wickets/runs" e.g. "4/26"
      const bbfRaw = (r[8] || '').replace(/\s/g, '');
      const bbfParts = bbfRaw.split('/');
      const bestFigures = bbfParts.length === 2
        ? bbfParts[1] + '/' + bbfParts[0]
        : bbfRaw;

      return {
        name: r[1],
        team: r[2],
        matches: +r[3] || 0,
        innings: +r[4] || 0,
        overs,
        wickets: +r[7] || 0,
        runs: +r[6] || 0,
        maidens: +r[9] || 0,
        bestFigures,
        hattricks: +r[14] || 0,
        fourWickets: +r[15] || 0,
        fiveWickets: +r[16] || 0,
        wides:   +r[17] || 0,
        noballs: +r[18] || 0,
        average: parseFloat(r[12]) || null,
        economy: parseFloat(r[11]) || null,
        strikeRate: parseFloat(r[13]) || null,
      };
    })
    .sort((a, b) => b.wickets - a.wickets);
}

function parseRankings(table) {
  // Headers: "#", "Player", "Team", "Matches", "Batting", "Bowling", "Fielding", "Other", "MOM #", "Total"
  if (!table) return [];
  return table.rows
    .filter(r => r.length >= 9 && /^\d+$/.test(r[0]))
    .map(r => ({
      name: r[1],
      team: r[2],
      matches: +r[3] || 0,
      batting: +r[4] || 0,
      bowling: +r[5] || 0,
      fielding: +r[6] || 0,
      total: +r[9] || 0,
      mom: +r[8] || 0,
    }))
    .sort((a, b) => b.total - a.total);
}

function parse2025Standings(tables) {
  // viewLeaguePointstable.do has two group tables, each with headers:
  // "#", "TEAM", "MAT", "WON", "LOST", "N/R", "TIE", "PTS", "WIN %", "NET RR", "FOR", "AGAINST"
  // r[0]=#, r[1]=team, r[2]=mat, r[3]=won, r[4]=lost, r[5]=nr, r[6]=tie, r[7]=pts, r[8]=win%, r[9]=nrr
  if (!tables || !tables.length) return [];
  const all = [];
  tables.forEach(table => {
    if (!table || !table.rows) return;
    table.rows
      .filter(r => r.length >= 9 && /^\d+$/.test(r[0]) && r[1])
      .forEach(r => {
        all.push({
          team: r[1],
          matches:  +r[2] || 0,
          won:      +r[3] || 0,
          lost:     +r[4] || 0,
          noResult: +r[5] || 0,
          tied:     +r[6] || 0,
          points:   +r[7] || 0,
          nrr:      parseFloat(r[9]) || 0,
        });
      });
  });
  return all.sort((a, b) => b.points - a.points || b.nrr - a.nrr);
}

function parse2025Batting(table) {
  // Headers: "#", "Player", "Group", "Team", "Mat", "Ins", "No", "Runs", "Balls",
  //          "Avg", "Sr", "Hs", "100's", "75's", "50's", "25's", "0", "6's", "4's"
  // r[0]=#, r[1]=name, r[2]=group, r[3]=team, r[4]=mat, r[5]=ins, r[6]=no, r[7]=runs,
  // r[8]=balls, r[9]=avg, r[10]=sr, r[11]=hs, r[12]=100s, r[13]=75s, r[14]=50s, r[15]=25s,
  // r[16]=ducks, r[17]=6s, r[18]=4s
  if (!table) return [];
  return table.rows
    .filter(r => r.length >= 10 && /^\d+$/.test(r[0]) && r[1])
    .map(r => ({
      name: r[1],
      team2025: r[3],
      matches: +r[4] || 0,
      innings: +r[5] || 0,
      notOuts: +r[6] || 0,
      runs: +r[7] || 0,
      balls: +r[8] || 0,
      average: parseFloat(r[9]) || 0,
      strikeRate: parseFloat(r[10]) || 0,
      highest: r[11] || '0',
      hundreds: +r[12] || 0,
      fifties: +r[14] || 0,
      sixes: +r[17] || 0,
      fours: +r[18] || 0,
    }))
    .sort((a, b) => b.runs - a.runs);
}

function parse2025Bowling(table) {
  // Headers: "#", "Player", "Group", "Team", "Mat", "Inns", "Overs", "Runs", "Wkts",
  //          "BBf", "Mdns", "Dots", "Econ", "Ave", "SR", "Hat-trick", "4W", "5W", "Wides", "Nb"
  // r[0]=#, r[1]=name, r[2]=group, r[3]=team, r[4]=mat, r[5]=inns, r[6]=overs,
  // r[7]=runs, r[8]=wkts, r[9]=bbf, r[10]=mdns, r[11]=dots, r[12]=econ, r[13]=avg,
  // r[14]=sr, r[15]=hat, r[16]=4w, r[17]=5w, r[18]=wides, r[19]=nb
  if (!table) return [];
  return table.rows
    .filter(r => r.length >= 10 && /^\d+$/.test(r[0]) && r[1])
    .map(r => {
      // BBf format "30/ 5" → normalize to "5/30"
      const bbfRaw = (r[9] || '').replace(/\s/g, '');
      const bbfParts = bbfRaw.split('/');
      const bestFigures = bbfParts.length === 2
        ? bbfParts[1] + '/' + bbfParts[0]
        : bbfRaw;
      return {
        name: r[1],
        team2025: r[3],
        matches: +r[4] || 0,
        innings: +r[5] || 0,
        overs: r[6] || '0',
        runs: +r[7] || 0,
        wickets: +r[8] || 0,
        bestFigures,
        maidens: +r[10] || 0,
        economy: parseFloat(r[12]) || null,
        average: parseFloat(r[13]) || null,
        strikeRate: parseFloat(r[14]) || null,
        hattricks: +r[15] || 0,
        fourWickets: +r[16] || 0,
        fiveWickets: +r[17] || 0,
      };
    })
    .sort((a, b) => b.wickets - a.wickets);
}

// ── Filter helpers (module-level so available before browser.close()) ──
const filterTeam = (arr, keyword) =>
  arr.filter(p => p.team && p.team.includes(keyword));

// Build a case-insensitive name → record lookup map
function buildNameMap(records) {
  const map = {};
  records.forEach(r => {
    map[r.name.toLowerCase().trim()] = r;
  });
  return map;
}

// Look up a player by name (case-insensitive, trims whitespace)
function lookupByName(name, map) {
  return map[name.toLowerCase().trim()] || null;
}

function parseStandings(table) {
  // Headers: "#", "TEAM", "MAT", "WON", "LOST", "N/R", "TIE", "PTS", "WIN %", "NET RR", "FOR", "AGAINST"
  if (!table) return [];
  return table.rows
    .filter(r => r.length >= 9 && /^\d+$/.test(r[0]))
    .map(r => ({
      team: r[1],
      matches: +r[2] || 0,
      won: +r[3] || 0,
      lost: +r[4] || 0,
      noResult: +r[5] || 0,
      tied: +r[6] || 0,
      points: +r[7] || 0,
      nrr: parseFloat(r[9]) || 0,
    }))
    .sort((a, b) => b.points - a.points || b.nrr - a.nrr);
}

function parseMatches(table) {
  // Headers: "#", "Match Type", "Date", "Team One", "Team two", "Result", "Scores Summary", "Points"
  // OR: "SNO", "MATCH TYPE", "DATE", "Team ONE", "TEAM TWO", "RESULT", "SCORE SUMMARY"
  if (!table) return {};
  const byTeam = {};

  table.rows
    .filter(r => r.length >= 7)
    .forEach(r => {
      // Figure out column positions based on header detection
      const dateStr = r[2];
      if (!dateStr || !/\d{2}\/\d{2}\/\d{4}/.test(dateStr)) return;

      const t1 = r[3];
      const t2 = r[4];
      const resultText = r[5] || '';
      const summary = r[6] || '';

      // Parse date: MM/DD/YYYY → YYYY-MM-DD
      const [mm, dd, yyyy] = dateStr.split('/');
      const date = `${yyyy}-${mm}-${dd}`;

      // Determine winner from result text
      const isAbandoned = /abandoned|no result/i.test(resultText);

      // Parse score summary: "TeamOne: runs/wkts(overs)TeamTwo: runs/wkts(overs)"
      function parseTeamScore(teamName, text) {
        const escaped = teamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const m = new RegExp(escaped + ':\\s*(\\d+)/(\\d+)\\(([\\d.]+)\\)').exec(text);
        if (!m) return { runs: 0, wickets: 0, overs: '0' };
        return { runs: +m[1], wickets: +m[2], overs: m[3] };
      }

      const s1 = parseTeamScore(t1, summary);
      const s2 = parseTeamScore(t2, summary);

      [t1, t2].forEach(team => {
        const isT1 = team === t1;
        const scored = isT1 ? s1 : s2;
        const conceded = isT1 ? s2 : s1;

        let won = false, noResult = false;
        if (isAbandoned) {
          noResult = true;
        } else {
          won = scored.runs > conceded.runs
            || (resultText.toLowerCase().includes(team.toLowerCase()) && !resultText.toLowerCase().includes('lost'));
        }

        if (!byTeam[team]) byTeam[team] = [];
        byTeam[team].push({
          opponent: isT1 ? t2 : t1,
          date,
          runsScored: scored.runs,
          wickets: scored.wickets,
          overs: scored.overs,
          runsConceded: conceded.runs,
          won,
          noResult,
        });
      });
    });

  const result = {};
  Object.keys(byTeam).forEach(team => {
    const games = byTeam[team].sort((a, b) => a.date.localeCompare(b.date));
    const scores = games.map(g => g.runsScored).filter(s => s > 0);
    result[team] = {
      games,
      highestTotal: scores.length ? Math.max(...scores) : 0,
      lowestTotal: scores.length ? Math.min(...scores) : 0,
      averageScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
    };
  });
  return result;
}

async function fetchStats() {
  // Load existing cricclubs-stats.js to seed incremental extras data
  let existingLionsExtras = [], existingTigersExtras = [];
  try {
    const outPath = path.join(__dirname, '..', 'cricclubs-stats.js');
    const existing = fs.readFileSync(outPath, 'utf8');
    // Extract the JSON blob after "var CRICCLUBS_STATS = "
    const m = existing.match(/var CRICCLUBS_STATS\s*=\s*(\{[\s\S]*\});?\s*$/);
    if (m) {
      const parsed = JSON.parse(m[1]);
      existingLionsExtras  = (parsed.lions  && (parsed.lions.bowlingGames  || parsed.lions.extrasGames))  || [];
      existingTigersExtras = (parsed.tigers && (parsed.tigers.bowlingGames || parsed.tigers.extrasGames)) || [];
      console.log(`Loaded existing extras: ${existingLionsExtras.length} Lions, ${existingTigersExtras.length} Tigers games`);
    }
  } catch(e) {
    console.log('No existing extras data found — will scrape all completed games');
  }

  console.log('Launching browser (stealth mode)...');
  const { browser, page } = await createBrowser();

  // ── 2026 Season ──
  console.log('\n=== 2026 Season ===');

  const batting2026Table = await extractTable(page,
    `${BASE}/battingRecords.do?clubId=${CLUB}&leagueId=${LEAGUE_2026}`);
  console.log(`  batting: ${batting2026Table ? batting2026Table.rows.length : 0} rows`);

  const bowling2026Table = await extractTable(page,
    `${BASE}/bowlingRecords.do?clubId=${CLUB}&leagueId=${LEAGUE_2026}`);
  console.log(`  bowling: ${bowling2026Table ? bowling2026Table.rows.length : 0} rows`);

  const rankings2026Table = await extractTable(page,
    `${BASE}/playerRankings.do?clubId=${CLUB}&leagueId=${LEAGUE_2026}`);
  console.log(`  rankings: ${rankings2026Table ? rankings2026Table.rows.length : 0} rows`);

  const standings2026Table = await extractTable(page,
    `${BASE}/viewPointsTable.do?clubId=${CLUB}&leagueId=${LEAGUE_2026}`);
  console.log(`  standings: ${standings2026Table ? standings2026Table.rows.length : 0} rows`);

  const matches2026Table = await extractTable(page,
    `${BASE}/listMatches.do?clubId=${CLUB}&leagueId=${LEAGUE_2026}`, 7);
  console.log(`  matches: ${matches2026Table ? matches2026Table.rows.length : 0} rows`);

  // ── 2025 Tape T20 Tournament (league=17) — all-player lookup ──
  console.log('\n=== 2025 Tape T20 (league=17) ===');

  const batting2025Table = await extractTable(page,
    `${BASE}/viewLeagueBatting.do?league=${LEAGUE_2025_T20}&clubId=${CLUB}`, 8);
  console.log(`  batting: ${batting2025Table ? batting2025Table.rows.length : 0} rows`);

  const bowling2025Table = await extractTable(page,
    `${BASE}/viewLeagueBowling.do?league=${LEAGUE_2025_T20}&clubId=${CLUB}`, 8);
  console.log(`  bowling: ${bowling2025Table ? bowling2025Table.rows.length : 0} rows`);

  const standings2025Tables = await extractAllTables(page,
    `${BASE}/viewLeaguePointstable.do?league=${LEAGUE_2025_T20}&clubId=${CLUB}`, 10);
  console.log(`  standings: ${standings2025Tables.length} tables`);

  // ── Parse all tables (browser still open — needed for scorecard scraping below) ──
  const batting   = parseBatting(batting2026Table);
  const bowling   = parseBowling(bowling2026Table);
  const rankings  = parseRankings(rankings2026Table);
  const standings = parseStandings(standings2026Table);
  const results   = parseMatches(matches2026Table);

  const allBatting2025  = parse2025Batting(batting2025Table);
  const allBowling2025  = parse2025Bowling(bowling2025Table);
  const standings2025   = parse2025Standings(standings2025Tables);
  console.log(`  standings2025: ${standings2025.length} teams`);

  // ── League-wide 2026 ranks (all teams in batting/bowling arrays) ──
  const allBatSorted = [...batting].sort((a, b) => (b.runs || 0) - (a.runs || 0));
  const batRankByName = {};
  allBatSorted.forEach((p, i) => { batRankByName[p.name] = i + 1; });

  const allBowlSorted = [...bowling].sort((a, b) => (b.wickets || 0) - (a.wickets || 0));
  const bowlRankByName = {};
  allBowlSorted.forEach((p, i) => { bowlRankByName[p.name] = i + 1; });

  const withBatRank  = (arr) => arr.map(p => ({ ...p, leagueBatRank:  batRankByName[p.name]  || null }));
  const withBowlRank = (arr) => arr.map(p => ({ ...p, leagueBowlRank: bowlRankByName[p.name] || null }));

  // ── Scrape per-game bowling extras from individual scorecards ──
  console.log('\n=== Bowling Extras (per game scorecard scraping) ===');
  const matchesUrl = `${BASE}/listMatches.do?clubId=${CLUB}&leagueId=${LEAGUE_2026}`;
  const lionsBowlerNames  = filterTeam(bowling, 'Lions').map(p => p.name);
  const tigersBowlerNames = filterTeam(bowling, 'Tigers').map(p => p.name);
  const lionsExtrasGames  = await fetchExtrasGames(page, matchesUrl, 'Lions',  lionsBowlerNames,  existingLionsExtras);
  const tigersExtrasGames = await fetchExtrasGames(page, matchesUrl, 'Tigers', tigersBowlerNames, existingTigersExtras);
  console.log(`  Lions extras games: ${lionsExtrasGames.length} total (new + cached)`);
  console.log(`  Tigers extras games: ${tigersExtrasGames.length} total (new + cached)`);

  await browser.close().catch(() => {});

  if (!batting.length && !bowling.length) {
    console.error('\nFailed to capture 2026 batting/bowling data.');
    process.exit(1);
  }

  const groupByTeam = (arr) => {
    const map = {};
    arr.forEach(p => {
      const team = p.team || 'Unknown';
      if (!map[team]) map[team] = [];
      map[team].push(p);
    });
    return map;
  };

  // ── 2025 name-keyed lookup maps ──
  const battingMap2025 = buildNameMap(allBatting2025);
  const bowlingMap2025 = buildNameMap(allBowling2025);
  console.log(`\n2025 lookup maps: ${Object.keys(battingMap2025).length} batters, ${Object.keys(bowlingMap2025).length} bowlers`);

  // Cross-reference: given a list of 2026 players (with .name), return their 2025 records
  function crossRef2025(players2026, map2025) {
    const found = [];
    players2026.forEach(p => {
      const rec = lookupByName(p.name, map2025);
      if (rec) found.push(rec);
    });
    return found.sort((a, b) => (b.runs || b.wickets || 0) - (a.runs || a.wickets || 0));
  }

  // ── Opponent stats for 2026 ──
  const battingByTeam = groupByTeam(batting);
  const bowlingByTeam = groupByTeam(bowling);
  const allTeams2026 = [...new Set([...Object.keys(battingByTeam), ...Object.keys(bowlingByTeam)])]
    .filter(t => !t.includes('Lions') && !t.includes('Tigers'))
    .sort();

  const opponents = {};
  allTeams2026.forEach(team => {
    opponents[team] = {
      batting: battingByTeam[team] || [],
      bowling: bowlingByTeam[team] || [],
    };
  });

  // ── Opponent 2025 cross-reference ──
  // For each 2026 opponent team's players, look up their 2025 stats by name
  const opponents2025 = {};
  allTeams2026.forEach(team => {
    const players2026bat = battingByTeam[team] || [];
    const players2026bowl = bowlingByTeam[team] || [];
    // Union of unique player names from batting + bowling
    const allPlayerNames = [...new Set([
      ...players2026bat.map(p => p.name),
      ...players2026bowl.map(p => p.name),
    ])].map(name => ({ name }));

    opponents2025[team] = {
      batting: crossRef2025(allPlayerNames, battingMap2025),
      bowling: crossRef2025(allPlayerNames, bowlingMap2025),
    };
  });

  // ── Lions/Tigers 2025 cross-reference ──
  const lionsBatters2026  = filterTeam(batting, 'Lions');
  const lionsBosters2026  = filterTeam(bowling, 'Lions');
  const tigersBatters2026 = filterTeam(batting, 'Tigers');
  const tigersBosters2026 = filterTeam(bowling, 'Tigers');

  // All unique Lions/Tigers player names (from batting + bowling)
  const lionsPlayers   = [...new Set([...lionsBatters2026, ...lionsBosters2026].map(p => p.name))].map(n => ({ name: n }));
  const tigersPlayers  = [...new Set([...tigersBatters2026, ...tigersBosters2026].map(p => p.name))].map(n => ({ name: n }));

  const lionsBatting2025  = crossRef2025(lionsPlayers,  battingMap2025);
  const lionsBowling2025  = crossRef2025(lionsPlayers,  bowlingMap2025);
  const tigersBatting2025 = crossRef2025(tigersPlayers, battingMap2025);
  const tigersBowling2025 = crossRef2025(tigersPlayers, bowlingMap2025);

  console.log(`\nLions 2025 cross-ref: ${lionsBatting2025.length} batters, ${lionsBowling2025.length} bowlers`);
  console.log(`Tigers 2025 cross-ref: ${tigersBatting2025.length} batters, ${tigersBowling2025.length} bowlers`);

  applyBowlingCorrections(lionsBosters2026, rankings);

  const output = {
    lastUpdated: new Date().toISOString(),
    lions: {
      rankings: filterTeam(rankings, 'Lions'),
      batting:  withBatRank(lionsBatters2026),
      bowling:  withBowlRank(lionsBosters2026),
      batting2025: lionsBatting2025,
      bowling2025: lionsBowling2025,
      bowlingGames: lionsExtrasGames,
    },
    tigers: {
      rankings: filterTeam(rankings, 'Tigers'),
      batting:  withBatRank(tigersBatters2026),
      bowling:  withBowlRank(tigersBosters2026),
      batting2025: tigersBatting2025,
      bowling2025: tigersBowling2025,
      bowlingGames: tigersExtrasGames,
    },
    combined: {
      rankings: [
        ...filterTeam(rankings, 'Lions'),
        ...filterTeam(rankings, 'Tigers'),
      ].sort((a, b) => (b.total || 0) - (a.total || 0)),
    },
    opponents,
    opponents2025,
    standings,
    standings2025,
    results,
  };

  const jsContent = `// Auto-generated by fetch-stats.js — do not edit manually
// Last updated: ${new Date().toLocaleString()}
var CRICCLUBS_STATS = ${JSON.stringify(output, null, 2)};
`;

  const outPath = path.join(__dirname, '..', 'cricclubs-stats.js');
  fs.writeFileSync(outPath, jsContent);
  console.log(`\n✓ Saved to cricclubs-stats.js`);

  console.log('\n🦁 LIONS BATTING (top 5):');
  output.lions.batting.slice(0, 5).forEach((p, i) =>
    console.log(`  ${i+1}. ${p.name} — ${p.runs} runs | Avg: ${p.average} | SR: ${p.strikeRate} | HS: ${p.highest}`));

  console.log('\n🦁 LIONS BOWLING (top 5):');
  output.lions.bowling.slice(0, 5).forEach((p, i) =>
    console.log(`  ${i+1}. ${p.name} — ${p.wickets} wkts | Econ: ${p.economy} | Avg: ${p.average}`));

  console.log('\n🐯 TIGERS BATTING (top 5):');
  output.tigers.batting.slice(0, 5).forEach((p, i) =>
    console.log(`  ${i+1}. ${p.name} — ${p.runs} runs | Avg: ${p.average} | SR: ${p.strikeRate} | HS: ${p.highest}`));

  console.log('\n🐯 TIGERS BOWLING (top 5):');
  output.tigers.bowling.slice(0, 5).forEach((p, i) =>
    console.log(`  ${i+1}. ${p.name} — ${p.wickets} wkts | Econ: ${p.economy} | Avg: ${p.average}`));

  process.exit(0);
}

fetchStats().catch((err) => { console.error(err); process.exit(1); });
