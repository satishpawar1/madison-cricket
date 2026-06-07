const fs   = require('fs');
const path = require('path');
const { sleep, createBrowser } = require('./utils');

const hardTimeout = setTimeout(() => {
  console.error('Hard timeout reached (15 min) — exiting');
  process.exit(1);
}, 15 * 60 * 1000);

const BASE  = 'https://cricclubs.com/NashvilleCricketLeague';
const CLUB  = '1092658';
const LEAGUE_LEATHER_T20_2025 = '20';
const LEAGUE_LEATHER_T20_2024 = '15';

// Candidate IDs to scan for the L-30 2026 league (excludes known IDs: 15,17,20,28)
const L30_CANDIDATES = ['21','22','23','24','25','26','27','29','30','31','32','33','34','35','36'];

// ── Table extractor ──────────────────────────────────────────────────────────
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

// ── Match link extractor for per-game scorecard scraping ─────────────────────
async function extractMatchLinksForTeam(page, url, teamKeyword) {
  console.log(`  Loading match list for "${teamKeyword}"...`);
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
      const team1 = cells[3] || '', team2 = cells[4] || '';
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

// ── Per-game bowling scorecard extractor ─────────────────────────────────────
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
      const wm = s.match(/(\d+)\s*w/i), nm = s.match(/(\d+)\s*nb/i);
      return { wides: wm ? parseInt(wm[1]) : 0, noballs: nm ? parseInt(nm[1]) : 0 };
    }
    const tables = Array.from(document.querySelectorAll('table'));
    const result = [];
    tables.forEach(table => {
      const rows = Array.from(table.rows);
      if (rows.length < 3) return;
      const headers = Array.from((rows[0] || { cells: [] }).cells).map(c => c.textContent.trim().toUpperCase());
      if (!headers.some(h => h === 'BOWLING') || !headers.some(h => h === 'DOT')) return;
      const hi = (key) => { const i = headers.indexOf(key); return i >= 0 ? i + 1 : -1; };
      const nameIdx = hi('BOWLING'), oIdx = hi('O'), dotIdx = hi('DOT'), rIdx = hi('R');
      const wktIdx = hi('W'), econIdx = hi('ECON'), extIdx = headers.lastIndexOf('') + 1;
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
        const ex = extIdx > 0 ? parseExtrasStr(cells[extIdx] || '') : { wides: 0, noballs: 0 };
        bowlers.push({
          name, overs, balls,
          dots:    dotIdx  >= 0 ? (+cells[dotIdx]  || 0) : 0,
          runs:    rIdx    >= 0 ? (+cells[rIdx]     || 0) : 0,
          wickets: wktIdx  >= 0 ? (+cells[wktIdx]   || 0) : 0,
          economy: econIdx >= 0 ? (parseFloat(cells[econIdx]) || null) : null,
          wides: ex.wides, noballs: ex.noballs,
        });
      });
      if (bowlers.length >= 2) result.push(bowlers);
    });
    return result;
  });
}

function findOurBowlingInnings(tables, ourBowlerNames) {
  if (!tables || !tables.length) return null;
  const ours = new Set(ourBowlerNames.map(n => n.toLowerCase().trim().split(/\s+/)[0]));
  let best = null, bestScore = 0;
  for (const table of tables) {
    const score = table.filter(b => ours.has(b.name.toLowerCase().trim().split(/\s+/)[0])).length;
    if (score > bestScore) { bestScore = score; best = table; }
  }
  return bestScore >= 2 ? best : (tables[0] || null);
}

async function fetchExtrasGames(page, matchesUrl, teamKeyword, knownBowlerNames, existingGames) {
  const existingById = {};
  (existingGames || []).forEach(g => { if (g.matchId) existingById[g.matchId] = g; });
  const matches = await extractMatchLinksForTeam(page, matchesUrl, teamKeyword);
  console.log(`  "${teamKeyword}": ${matches.length} completed games found`);
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

// ── Column parsers ────────────────────────────────────────────────────────────
function parseBatting(table) {
  // "#","Player","Team","Mat","Ins","No","Runs","Balls","Avg","Sr","Hs",
  // "100's","75's","50's","25's","0","6's","4's"
  if (!table) return [];
  return table.rows
    .filter(r => r.length >= 10 && /^\d+$/.test(r[0]) && r[1])
    .map(r => ({
      name:       r[1],
      team:       r[2],
      matches:    +r[3]  || 0,
      innings:    +r[4]  || 0,
      notOuts:    +r[5]  || 0,
      runs:       +r[6]  || 0,
      balls:      +r[7]  || 0,
      average:    parseFloat(r[8])  || 0,
      strikeRate: parseFloat(r[9])  || 0,
      highest:    r[10] || '0',
      hundreds:   +r[11] || 0,
      fifties:    +r[13] || 0,
      sixes:      +r[16] || 0,
      fours:      +r[17] || 0,
    }))
    .sort((a, b) => b.runs - a.runs);
}

function parseBowling(table) {
  // "#","Player","Team","Mat","Inns","Overs","Runs","Wkts","BBf","Mdns","Dots",
  // "Econ","Ave","SR","Hat-trick","4W","5W","Wides","Nb"
  if (!table) return [];
  return table.rows
    .filter(r => r.length >= 10 && /^\d+$/.test(r[0]) && r[1])
    .map(r => {
      const bbfRaw = (r[8] || '').replace(/\s/g, '');
      const bbfParts = bbfRaw.split('/');
      const bestFigures = bbfParts.length === 2 ? bbfParts[1] + '/' + bbfParts[0] : bbfRaw;
      return {
        name:        r[1],
        team:        r[2],
        matches:     +r[3]  || 0,
        innings:     +r[4]  || 0,
        overs:       r[5]   || '0',
        runs:        +r[6]  || 0,
        wickets:     +r[7]  || 0,
        bestFigures,
        maidens:     +r[9]  || 0,
        economy:     parseFloat(r[11]) || null,
        average:     parseFloat(r[12]) || null,
        strikeRate:  parseFloat(r[13]) || null,
        hattricks:   +r[14] || 0,
        fourWickets: +r[15] || 0,
        fiveWickets: +r[16] || 0,
      };
    })
    .sort((a, b) => b.wickets - a.wickets);
}

function parseStandings(table) {
  // "#","TEAM","MAT","WON","LOST","N/R","TIE","PTS","WIN%","NET RR","FOR","AGAINST"
  if (!table) return [];
  return table.rows
    .filter(r => r.length >= 9 && /^\d+$/.test(r[0]))
    .map(r => ({
      team:     r[1],
      matches:  +r[2] || 0,
      won:      +r[3] || 0,
      lost:     +r[4] || 0,
      noResult: +r[5] || 0,
      tied:     +r[6] || 0,
      points:   +r[7] || 0,
      nrr:      parseFloat(r[9]) || 0,
    }))
    .sort((a, b) => b.points - a.points || b.nrr - a.nrr);
}

function parseMatches(table) {
  // "#","Match Type","Date","Team One","Team Two","Result","Scores Summary","Points"
  if (!table) return {};
  const byTeam = {};
  table.rows
    .filter(r => r.length >= 7)
    .forEach(r => {
      const dateStr = r[2];
      if (!dateStr || !/\d{2}\/\d{2}\/\d{4}/.test(dateStr)) return;
      const t1 = r[3], t2 = r[4], resultText = r[5] || '', summary = r[6] || '';
      const [mm, dd, yyyy] = dateStr.split('/');
      const date = `${yyyy}-${mm}-${dd}`;
      const isAbandoned = /abandoned|no result/i.test(resultText);

      function parseTeamScore(teamName, text) {
        const escaped = teamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const m = new RegExp(escaped + ':\\s*(\\d+)/(\\d+)\\(([\\d.]+)\\)').exec(text);
        if (!m) return { runs: 0, wickets: 0, overs: '0' };
        return { runs: +m[1], wickets: +m[2], overs: m[3] };
      }

      const s1 = parseTeamScore(t1, summary), s2 = parseTeamScore(t2, summary);
      [t1, t2].forEach(team => {
        const isT1 = team === t1;
        const scored = isT1 ? s1 : s2, conceded = isT1 ? s2 : s1;
        let won = false, noResult = false;
        if (isAbandoned) {
          noResult = true;
        } else {
          won = scored.runs > conceded.runs
            || (resultText.toLowerCase().includes(team.toLowerCase()) && !resultText.toLowerCase().includes('lost'));
        }
        if (!byTeam[team]) byTeam[team] = [];
        byTeam[team].push({
          opponent: isT1 ? t2 : t1, date,
          runsScored: scored.runs, wickets: scored.wickets, overs: scored.overs,
          runsConceded: conceded.runs, won, noResult,
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
      lowestTotal:  scores.length ? Math.min(...scores) : 0,
      averageScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
    };
  });
  return result;
}

// ── Discover L-30 2026 league ID ─────────────────────────────────────────────
// Checks candidate IDs against standings/batting pages looking for "Madison" or "Leather" teams.
// Caches the found ID in leather-stats.js to skip discovery on subsequent runs.
async function discoverL30LeagueId(page, savedId) {
  if (savedId) {
    console.log(`  Using cached L-30 league ID: ${savedId}`);
    return savedId;
  }
  console.log(`  Scanning ${L30_CANDIDATES.length} candidate IDs...`);
  for (const id of L30_CANDIDATES) {
    try {
      await page.goto(`${BASE}/viewPointsTable.do?clubId=${CLUB}&league=${id}`,
        { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch(e) { await sleep(500); continue; }
    await sleep(1500);
    const found = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return /leather|madison/i.test(text) && /\bpts\b|\bpoints\b|\bwon\b/i.test(text);
    });
    if (found) {
      console.log(`  ✓ Found L-30 league at ID ${id} (standings match)`);
      return id;
    }
  }
  // Fallback: check batting tables
  for (const id of L30_CANDIDATES) {
    const table = await extractTable(page, `${BASE}/viewLeagueBatting.do?league=${id}&clubId=${CLUB}`, 8);
    if (table && table.rows.some(r => /leather|madison/i.test(r.join(' ')))) {
      console.log(`  ✓ Found L-30 league at ID ${id} (batting match)`);
      return id;
    }
  }
  console.log('  ⚠ Could not auto-discover L-30 league ID');
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function fetchLeatherStats() {
  // Load existing leather-stats.js for incremental extras and cached league ID
  let existingL30Extras = [];
  let savedL30LeagueId  = null;
  try {
    const outPath = path.join(__dirname, '..', 'leather-stats.js');
    const existing = fs.readFileSync(outPath, 'utf8');
    const m = existing.match(/var LEATHER_STATS\s*=\s*(\{[\s\S]*\});?\s*$/);
    if (m) {
      const parsed = JSON.parse(m[1]);
      const t30 = parsed.t30_2026 || {};
      existingL30Extras = (t30.leather && t30.leather.bowlingGames) || [];
      savedL30LeagueId  = t30.leagueId || null;
      console.log(`Loaded existing: ${existingL30Extras.length} L-30 bowling games cached`);
    }
  } catch(e) {
    console.log('No existing leather-stats.js — starting fresh');
  }

  console.log('Launching browser (stealth mode)...');
  const { browser, page } = await createBrowser();

  // ── Discover L-30 league ID ──────────────────────────────────────────────
  console.log('\n=== L-30 2026 League ID ===');
  const l30LeagueId = await discoverL30LeagueId(page, savedL30LeagueId);

  // ── L-30 2026 Stats ──────────────────────────────────────────────────────
  let l30Batting = [], l30Bowling = [], l30Standings = [], l30Results = {}, l30BowlingGames = [];

  if (l30LeagueId) {
    console.log(`\n=== 2026 L-30 (league=${l30LeagueId}) ===`);

    const batting2026Table = await extractTable(page,
      `${BASE}/viewLeagueBatting.do?league=${l30LeagueId}&clubId=${CLUB}`, 8);
    console.log(`  batting: ${batting2026Table ? batting2026Table.rows.length : 0} rows`);

    const bowling2026Table = await extractTable(page,
      `${BASE}/viewLeagueBowling.do?league=${l30LeagueId}&clubId=${CLUB}`, 8);
    console.log(`  bowling: ${bowling2026Table ? bowling2026Table.rows.length : 0} rows`);

    const standings2026Table = await extractTable(page,
      `${BASE}/viewPointsTable.do?clubId=${CLUB}&league=${l30LeagueId}`, 3);
    console.log(`  standings: ${standings2026Table ? standings2026Table.rows.length : 0} rows`);

    const matches2026Table = await extractTable(page,
      `${BASE}/listMatches.do?clubId=${CLUB}&league=${l30LeagueId}`, 7);
    console.log(`  matches: ${matches2026Table ? matches2026Table.rows.length : 0} rows`);

    l30Batting   = parseBatting(batting2026Table);
    l30Bowling   = parseBowling(bowling2026Table);
    l30Standings = parseStandings(standings2026Table);
    l30Results   = parseMatches(matches2026Table);

    const allTeams = [...new Set([...l30Batting.map(p => p.team), ...l30Bowling.map(p => p.team)])].filter(Boolean);
    console.log(`  Teams found: ${allTeams.join(', ')}`);

    // Per-game bowling extras (incremental — skips already-scraped games)
    console.log('\n=== L-30 Bowling Extras (per-game scorecards) ===');
    const matchesUrl    = `${BASE}/listMatches.do?clubId=${CLUB}&league=${l30LeagueId}`;
    const isLeather     = (p) => p.team && /leather|madison/i.test(p.team);
    const leatherBowlerNames = l30Bowling.filter(isLeather).map(p => p.name);
    // Use team keyword that matches our team name on CricClubs
    const ourTeamKeyword = allTeams.find(t => /leather|madison/i.test(t)) || 'Madison';
    l30BowlingGames = await fetchExtrasGames(page, matchesUrl, ourTeamKeyword, leatherBowlerNames, existingL30Extras);
    console.log(`  L-30 bowling games: ${l30BowlingGames.length} total (new + cached)`);
  } else {
    l30BowlingGames = existingL30Extras; // preserve cached data
    console.log('\n⚠ Skipping L-30 scrape — league ID not found. Preserving cached extras.');
  }

  // ── 2025 Leather T-20 ────────────────────────────────────────────────────
  console.log('\n=== 2025 Leather T-20 (league=20) ===');
  const batting2025Table = await extractTable(page,
    `${BASE}/viewLeagueBatting.do?league=${LEAGUE_LEATHER_T20_2025}&clubId=${CLUB}`, 8);
  console.log(`  batting: ${batting2025Table ? batting2025Table.rows.length : 0} rows`);
  const bowling2025Table = await extractTable(page,
    `${BASE}/viewLeagueBowling.do?league=${LEAGUE_LEATHER_T20_2025}&clubId=${CLUB}`, 8);
  console.log(`  bowling: ${bowling2025Table ? bowling2025Table.rows.length : 0} rows`);

  // ── 2024 Leather T-20 ────────────────────────────────────────────────────
  console.log('\n=== 2024 Leather T-20 (league=15) ===');
  const batting2024Table = await extractTable(page,
    `${BASE}/viewLeagueBatting.do?league=${LEAGUE_LEATHER_T20_2024}&clubId=${CLUB}`, 8);
  console.log(`  batting: ${batting2024Table ? batting2024Table.rows.length : 0} rows`);
  const bowling2024Table = await extractTable(page,
    `${BASE}/viewLeagueBowling.do?league=${LEAGUE_LEATHER_T20_2024}&clubId=${CLUB}`, 8);
  console.log(`  bowling: ${bowling2024Table ? bowling2024Table.rows.length : 0} rows`);

  await browser.close().catch(() => {});

  // ── Parse T-20 tables ────────────────────────────────────────────────────
  const batting2025 = parseBatting(batting2025Table);
  const bowling2025 = parseBowling(bowling2025Table);
  const batting2024 = parseBatting(batting2024Table);
  const bowling2024 = parseBowling(bowling2024Table);

  // ── Partition L-30 data: leather team vs opponents ───────────────────────
  const isLeather   = (p) => p.team && /leather|madison/i.test(p.team);
  const leatherBat  = l30Batting.filter(isLeather);
  const leatherBowl = l30Bowling.filter(isLeather);

  const allTeams = [...new Set([...l30Batting.map(p => p.team), ...l30Bowling.map(p => p.team)])].filter(Boolean);
  const opponents = {};
  allTeams.filter(t => !/leather|madison/i.test(t)).forEach(team => {
    opponents[team] = {
      batting: l30Batting.filter(p => p.team === team),
      bowling: l30Bowling.filter(p => p.team === team),
    };
  });

  // ── Build output ─────────────────────────────────────────────────────────
  const out = {
    lastUpdated: new Date().toISOString(),
    t30_2026: {
      leagueId: l30LeagueId,
      leather: {
        batting:      leatherBat,
        bowling:      leatherBowl,
        bowlingGames: l30BowlingGames,
      },
      opponents,
      standings: l30Standings,
      results:   l30Results,
    },
    t20_2025: { batting: batting2025, bowling: bowling2025 },
    t20_2024: { batting: batting2024, bowling: bowling2024 },
  };

  const outPath = path.join(__dirname, '..', 'leather-stats.js');
  fs.writeFileSync(outPath, [
    '// Auto-generated by fetch-leather-stats.js — do not edit manually',
    `// Last updated: ${out.lastUpdated}`,
    `var LEATHER_STATS = ${JSON.stringify(out, null, 2)};`,
  ].join('\n'), 'utf8');
  console.log(`\n✓ Wrote ${outPath}`);

  if (leatherBat.length) {
    console.log('\n🔴 L-30 Batting (top 5):');
    leatherBat.slice(0, 5).forEach((p, i) =>
      console.log(`  ${i+1}. ${p.name} [${p.team}] — ${p.runs} runs | Avg: ${p.average} | SR: ${p.strikeRate}`));
  }
  if (leatherBowl.length) {
    console.log('\n🔴 L-30 Bowling (top 5):');
    leatherBowl.slice(0, 5).forEach((p, i) =>
      console.log(`  ${i+1}. ${p.name} [${p.team}] — ${p.wickets} wkts | Econ: ${p.economy}`));
  }
  const t = p => p.team && p.team.includes('Tigers');
  console.log(`\n  2025 Tigers: ${batting2025.filter(t).length} batters, ${bowling2025.filter(t).length} bowlers`);
  console.log(`  2024 Tigers: ${batting2024.filter(t).length} batters, ${bowling2024.filter(t).length} bowlers`);

  clearTimeout(hardTimeout);
}

fetchLeatherStats().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
