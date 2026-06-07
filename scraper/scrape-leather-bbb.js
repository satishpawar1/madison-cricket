// Scrapes ball-by-ball data for Madison Leather L-30 2026 games.
// Pushes batting dot balls to DotBalls_Leather sheet (green dots — 0-run legal deliveries).
// Pushes bowling data (dots, wickets, wides, no-balls) to BowlingDots_Leather sheet.
//
// Usage:
//   node scrape-leather-bbb.js           — scrape new games only
//   node scrape-leather-bbb.js --force   — re-scrape all games

const { sleep, createBrowser, postToSheets, getFromSheets } = require('./utils');

const SERIES_RESULTS_URL =
  'https://cricclubs.com/NashvilleCricketLeague/series-list/6N9EKGhzRMPO4PduR8LBYw?tab=results';

const LEATHER_KEYWORD = 'Madison'; // "MTMadison Tigers" on CricClubs

// BBB abbreviated name → roster name (add mappings after first run)
const LEATHER_BBB_NAME_MAP = {};

function mapName(n) {
  const t = (n || '').trim();
  return LEATHER_BBB_NAME_MAP[t] || t;
}

// ── Collect all unique match hashes from the results page ────────────────────
// Opponent name is resolved from the commentary API team names (more reliable).
async function findAllMatchHashes(page) {
  console.log('Loading results page...');
  try {
    await page.goto(SERIES_RESULTS_URL, { waitUntil: 'domcontentloaded', timeout: 40000 });
  } catch(e) {}
  await sleep(4000);

  return page.evaluate(() => {
    const seen = new Set();
    Array.from(document.querySelectorAll('a[href*="/results/"]')).forEach(a => {
      const m = a.href.match(/\/results\/([^?#/]+)/);
      if (m) seen.add(m[1]);
    });
    return [...seen];
  });
}

// ── Intercept commentary API and return raw data ──────────────────────────────
async function fetchCommentary(page, matchHash) {
  const url = `https://cricclubs.com/NashvilleCricketLeague/results/${matchHash}?tab=ball_by_ball`;
  let commentary = null;

  const handler = async (response) => {
    const u = response.url();
    if (!u.includes('core-prod-origin.cricclubs.com')) return;
    if (!(response.headers()['content-type'] || '').includes('json')) return;
    try {
      const data = await response.json();
      if (u.includes('commentary')) commentary = data;
    } catch(e) {}
  };

  page.on('response', handler);
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  } catch(e) {}
  await sleep(5000);
  page.off('response', handler);

  return commentary;
}

// ── Parse all balls in one innings ────────────────────────────────────────────
function parseInnings(innings, mode) {
  // mode = 'batting'  → track striker, count legal dot balls
  // mode = 'bowling'  → track bowler, count dots/wickets/wides/noballs
  if (!innings?.oversMap) return [];
  const stats = {};

  for (const overKey of Object.keys(innings.oversMap)) {
    for (const b of (innings.oversMap[overKey].balls || [])) {
      const bt   = (b.ballType || '').toUpperCase();
      const comm = (b.commentary || '').toLowerCase();
      const rawComm  = b.commentary || '';
      const commLow  = rawComm.toLowerCase();
      const isWide   = bt.includes('WIDE')   || commLow.includes(' wide') || commLow.startsWith('wide');
      const isNoBall = bt.includes('NOBALL') || bt.includes('NO_BALL') || bt.includes('NO BALL')
                     || commLow.includes('no ball') || commLow.includes('noball');
      // Wicket = commentary contains "OUT!" but NOT "RUN OUT" (run-outs don't credit the bowler)
      const isWicket = rawComm.includes('OUT!') && !rawComm.includes('RUN OUT');
      const runs = b.runs || 0;

      if (mode === 'batting') {
        if (isWide || isNoBall) continue; // extras don't count as legal deliveries
        const name = mapName(b.strikerName || '');
        if (!name) continue;
        if (!stats[name]) stats[name] = { dots: 0, balls: 0, runs: 0, isOut: false };
        stats[name].balls++;
        stats[name].runs += runs;
        if (runs === 0) stats[name].dots++;
        if (isWicket) stats[name].isOut = true;
      } else {
        const name = mapName(b.bowlerName || '');
        if (!name) continue;
        if (!stats[name]) stats[name] = { dots: 0, balls: 0, runs: 0, wickets: 0, wides: 0, noballs: 0 };
        if (isWide)   { stats[name].wides++;   continue; }
        if (isNoBall) { stats[name].noballs++; continue; }
        stats[name].balls++;
        stats[name].runs += runs;
        if (runs === 0) stats[name].dots++;
        if (isWicket) stats[name].wickets++;
      }
    }
  }

  return Object.entries(stats).map(([name, s]) => ({ name, ...s }));
}

// ── Scrape one match ──────────────────────────────────────────────────────────
async function scrapeMatch(page, hash) {
  console.log(`\n→ [${hash}]`);
  const commentary = await fetchCommentary(page, hash);

  if (!commentary?.data) {
    console.log('  ⚠ No commentary data found — ball-by-ball may not be entered yet');
    return null;
  }

  const inn1 = commentary.data.innings1Balls;
  const inn2 = commentary.data.innings2Balls;

  if (!inn1 && !inn2) {
    console.log('  ⚠ No innings data in commentary response');
    return null;
  }

  const t1 = inn1?.teamName || '', t2 = inn2?.teamName || '';
  console.log(`  Innings 1: "${t1}" | Innings 2: "${t2}"`);

  const leatherInnings = t1.toLowerCase().includes('madison') ? inn1
    : t2.toLowerCase().includes('madison') ? inn2 : null;
  const oppInnings = leatherInnings === inn1 ? inn2 : inn1;

  if (!leatherInnings) {
    console.log('  ⚠ Not a leather team match — skipping');
    return null;
  }

  const opponentName = (leatherInnings === inn1 ? t2 : t1).trim();
  console.log(`  vs ${opponentName} — leather batting: ${leatherInnings.teamName}`);

  const batting = parseInnings(leatherInnings, 'batting');
  const bowling = oppInnings ? parseInnings(oppInnings, 'bowling') : [];

  console.log(`  Batting (${batting.length} players):`);
  batting.forEach(p =>
    console.log(`    ${p.name.padEnd(20)} ${p.dots}/${p.balls} dots  ${p.runs}r${p.isOut ? '  out' : ''}`)
  );

  console.log(`  Bowling (${bowling.length} bowlers):`);
  bowling.forEach(b =>
    console.log(`    ${b.name.padEnd(20)} ${b.dots}d  ${b.wickets}w  ${b.wides}wd  ${b.noballs}nb  ${b.runs}r`)
  );

  return { opponent: opponentName, batting, bowling };
}

// ── Push to Sheets ────────────────────────────────────────────────────────────
async function pushToSheets(opponent, batting, bowling) {
  if (batting.length) {
    const res = await postToSheets({ type: 'dotballs', team: 'Leather', game: opponent, dotballs: batting });
    console.log(`  → Batting dots: ${res.status}`);
  }
  if (bowling.length) {
    const res = await postToSheets({ type: 'bowlingdots', team: 'Leather', game: opponent, bowlers: bowling });
    console.log(`  → Bowling dots: ${res.status}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const force = process.argv.includes('--force');

  const { browser, page } = await createBrowser();

  const hashes = await findAllMatchHashes(page);
  console.log(`\nFound ${hashes.length} match hash(es) on results page`);

  if (!hashes.length) {
    console.log('No completed matches found yet.');
    await browser.close();
    return;
  }

  // Fetch already-scraped games
  let existingGames = new Set();
  if (!force) {
    try {
      const res = await getFromSheets({ type: 'dotballs', team: 'Leather' });
      existingGames = new Set((res.games || []).map(g => g.game));
    } catch(e) {
      console.log('Could not fetch existing games:', e.message);
    }
  }

  for (const hash of hashes) {
    const result = await scrapeMatch(page, hash);
    if (!result) continue; // not a leather team match
    if (!force && existingGames.has(result.opponent)) {
      console.log(`  → Already in Sheets — skipping (use --force to re-scrape)`);
      continue;
    }
    await pushToSheets(result.opponent, result.batting, result.bowling);
    await sleep(1000);
  }

  await browser.close();
  console.log('\nDone.');
})();
