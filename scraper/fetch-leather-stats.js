const fs   = require('fs');
const path = require('path');
const { sleep, createBrowser } = require('./utils');

const hardTimeout = setTimeout(() => {
  console.error('Hard timeout reached (10 min) — exiting');
  process.exit(1);
}, 10 * 60 * 1000);

const BASE  = 'https://cricclubs.com/NashvilleCricketLeague';
const CLUB  = '1092658';
const LEAGUE_LEATHER_T20_2025 = '20';
const LEAGUE_LEATHER_T20_2024 = '15';

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

function parseBatting(table) {
  // viewLeagueBatting.do (league=20) has NO Group column:
  // "#", "Player", "Team", "Mat", "Ins", "No", "Runs", "Balls",
  // "Avg", "Sr", "Hs", "100's", "75's", "50's", "25's", "0", "6's", "4's"
  // r[0]=#, r[1]=name, r[2]=team, r[3]=mat, r[4]=ins, r[5]=no, r[6]=runs,
  // r[7]=balls, r[8]=avg, r[9]=sr, r[10]=hs, r[11]=100s, r[12]=75s,
  // r[13]=50s, r[14]=25s, r[15]=ducks, r[16]=6s, r[17]=4s
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
  // viewLeagueBowling.do (league=20) has NO Group column:
  // "#", "Player", "Team", "Mat", "Inns", "Overs", "Runs", "Wkts",
  // "BBf", "Mdns", "Dots", "Econ", "Ave", "SR", "Hat-trick", "4W", "5W", "Wides", "Nb"
  // r[0]=#, r[1]=name, r[2]=team, r[3]=mat, r[4]=inns, r[5]=overs,
  // r[6]=runs, r[7]=wkts, r[8]=bbf, r[9]=mdns, r[10]=dots,
  // r[11]=econ, r[12]=avg, r[13]=sr, r[14]=hat, r[15]=4w, r[16]=5w, r[17]=wides, r[18]=nb
  if (!table) return [];
  return table.rows
    .filter(r => r.length >= 10 && /^\d+$/.test(r[0]) && r[1])
    .map(r => {
      const bbfRaw = (r[8] || '').replace(/\s/g, '');
      const bbfParts = bbfRaw.split('/');
      const bestFigures = bbfParts.length === 2
        ? bbfParts[1] + '/' + bbfParts[0]
        : bbfRaw;
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

async function fetchLeatherStats() {
  console.log('Launching browser (stealth mode)...');
  const { browser, page } = await createBrowser();

  console.log('\n=== 2025 Leather T-20 (league=20) ===');
  const batting2025Table = await extractTable(page,
    `${BASE}/viewLeagueBatting.do?league=${LEAGUE_LEATHER_T20_2025}&clubId=${CLUB}`, 8);
  console.log(`  batting: ${batting2025Table ? batting2025Table.rows.length : 0} rows`);
  const bowling2025Table = await extractTable(page,
    `${BASE}/viewLeagueBowling.do?league=${LEAGUE_LEATHER_T20_2025}&clubId=${CLUB}`, 8);
  console.log(`  bowling: ${bowling2025Table ? bowling2025Table.rows.length : 0} rows`);

  console.log('\n=== 2024 Leather T-20 (league=15) ===');
  const batting2024Table = await extractTable(page,
    `${BASE}/viewLeagueBatting.do?league=${LEAGUE_LEATHER_T20_2024}&clubId=${CLUB}`, 8);
  console.log(`  batting: ${batting2024Table ? batting2024Table.rows.length : 0} rows`);
  const bowling2024Table = await extractTable(page,
    `${BASE}/viewLeagueBowling.do?league=${LEAGUE_LEATHER_T20_2024}&clubId=${CLUB}`, 8);
  console.log(`  bowling: ${bowling2024Table ? bowling2024Table.rows.length : 0} rows`);

  await browser.close().catch(() => {});

  const batting2025 = parseBatting(batting2025Table);
  const bowling2025 = parseBowling(bowling2025Table);
  const batting2024 = parseBatting(batting2024Table);
  const bowling2024 = parseBowling(bowling2024Table);

  console.log(`\nParsed 2025: ${batting2025.length} batters, ${bowling2025.length} bowlers`);
  console.log(`Parsed 2024: ${batting2024.length} batters, ${bowling2024.length} bowlers`);

  const out = {
    lastUpdated: new Date().toISOString(),
    t20_2025: { batting: batting2025, bowling: bowling2025 },
    t20_2024: { batting: batting2024, bowling: bowling2024 },
  };

  const outPath = path.join(__dirname, '..', 'leather-stats.js');
  const content = [
    '// Auto-generated by fetch-leather-stats.js — do not edit manually',
    `// Last updated: ${out.lastUpdated}`,
    `var LEATHER_STATS = ${JSON.stringify(out, null, 2)};`,
  ].join('\n');

  fs.writeFileSync(outPath, content, 'utf8');
  console.log(`\nWrote ${outPath}`);
  const t = p => p.team && p.team.includes('Tigers');
  console.log(`  2025 Madison Tigers: ${batting2025.filter(t).length} batters, ${bowling2025.filter(t).length} bowlers`);
  console.log(`  2024 Madison Tigers: ${batting2024.filter(t).length} batters, ${bowling2024.filter(t).length} bowlers`);
  clearTimeout(hardTimeout);
}

fetchLeatherStats().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
