const puppeteer = require('puppeteer-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(stealth());

// Hard kill: if the whole script takes more than 6 minutes, exit with failure
setTimeout(() => {
  console.error('Hard timeout reached (6 min) — exiting');
  process.exit(1);
}, 6 * 60 * 1000);

const BASE = 'https://cricclubs.com/NashvilleCricketLeague';
const CLUB = '1092658';

// Old JSP interface league IDs:
const LEAGUE_2026 = '28'; // 2026 - Tape 20
const LEAGUE_2025 = '26'; // 2025 - Tape 20 (TBD — updated after checking)

// ── Helper: extract table rows from the page's largest table ──
async function extractTable(page, url, minCols = 4) {
  console.log(`  Loading ${url.split('?')[0].split('/').pop()}...`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  } catch(e) {
    console.log(`  ⚠ load warning: ${e.message.split('\n')[0]}`);
  }
  await new Promise(r => setTimeout(r, 3000));

  return page.evaluate((minCols) => {
    const tables = Array.from(document.querySelectorAll('table'));
    // Find the table with the most rows that has enough columns
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
  console.log('Launching browser (stealth mode)...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36');

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

  // ── 2025 Season ──
  console.log('\n=== 2025 Season ===');

  const batting2025Table = await extractTable(page,
    `${BASE}/battingRecords.do?clubId=${CLUB}&leagueId=${LEAGUE_2025}`);
  console.log(`  batting: ${batting2025Table ? batting2025Table.rows.length : 0} rows`);

  const bowling2025Table = await extractTable(page,
    `${BASE}/bowlingRecords.do?clubId=${CLUB}&leagueId=${LEAGUE_2025}`);
  console.log(`  bowling: ${bowling2025Table ? bowling2025Table.rows.length : 0} rows`);

  const rankings2025Table = await extractTable(page,
    `${BASE}/playerRankings.do?clubId=${CLUB}&leagueId=${LEAGUE_2025}`);
  console.log(`  rankings: ${rankings2025Table ? rankings2025Table.rows.length : 0} rows`);

  const standings2025Table = await extractTable(page,
    `${BASE}/viewPointsTable.do?clubId=${CLUB}&leagueId=${LEAGUE_2025}`);
  console.log(`  standings: ${standings2025Table ? standings2025Table.rows.length : 0} rows`);

  const matches2025Table = await extractTable(page,
    `${BASE}/listMatches.do?clubId=${CLUB}&leagueId=${LEAGUE_2025}`, 7);
  console.log(`  matches: ${matches2025Table ? matches2025Table.rows.length : 0} rows`);

  await browser.close().catch(() => {});

  // ── Parse all tables ──
  const batting   = parseBatting(batting2026Table);
  const bowling   = parseBowling(bowling2026Table);
  const rankings  = parseRankings(rankings2026Table);
  const standings = parseStandings(standings2026Table);
  const results   = parseMatches(matches2026Table);

  const batting2025   = parseBatting(batting2025Table);
  const bowling2025   = parseBowling(bowling2025Table);
  const rankings2025  = parseRankings(rankings2025Table);
  const standings2025 = parseStandings(standings2025Table);
  const results2025   = parseMatches(matches2025Table);

  if (!batting.length && !bowling.length) {
    console.error('\nFailed to capture 2026 batting/bowling data.');
    process.exit(1);
  }

  // ── Filter helpers ──
  const filterTeam = (arr, keyword) =>
    arr.filter(p => p.team && p.team.includes(keyword));

  const groupByTeam = (arr) => {
    const map = {};
    arr.forEach(p => {
      const team = p.team || 'Unknown';
      if (!map[team]) map[team] = [];
      map[team].push(p);
    });
    return map;
  };

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

  // ── Opponent stats for 2025 ──
  const battingByTeam2025 = groupByTeam(batting2025);
  const bowlingByTeam2025 = groupByTeam(bowling2025);
  const allTeams2025 = [...new Set([...Object.keys(battingByTeam2025), ...Object.keys(bowlingByTeam2025)])]
    .filter(t => !t.includes('Lions') && !t.includes('Tigers'))
    .sort();

  const opponents2025 = {};
  allTeams2025.forEach(team => {
    opponents2025[team] = {
      batting: battingByTeam2025[team] || [],
      bowling: bowlingByTeam2025[team] || [],
    };
  });

  const output = {
    lastUpdated: new Date().toISOString(),
    lions: {
      rankings: filterTeam(rankings, 'Lions'),
      batting:  filterTeam(batting,  'Lions'),
      bowling:  filterTeam(bowling,  'Lions'),
    },
    tigers: {
      rankings: filterTeam(rankings, 'Tigers'),
      batting:  filterTeam(batting,  'Tigers'),
      bowling:  filterTeam(bowling,  'Tigers'),
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
    results2025,
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
