// Scrapes real dot ball counts from CricClubs ball-by-ball data.
// A dot ball = a valid legal delivery (not a wide or no-ball) on which the batter scores 0 runs.
//
// Usage:
//   node scrape-dotballs.js lions    -- scrape all Lions games
//   node scrape-dotballs.js tigers   -- scrape all Tigers games

const puppeteer = require('puppeteer-extra');
const stealth   = require('puppeteer-extra-plugin-stealth');
puppeteer.use(stealth());

const BASE       = 'https://cricclubs.com/NashvilleCricketLeague';
const CLUB       = '1092658';
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyyvPf-XcHewBNf755D6kW2baY7hHacXuT5ZNAmrGnDy9NELheaLkfEqIZMbTRMZsP_dg/exec';

// ── Match IDs for each team ─────────────────────────────────────────────────
const LIONS_MATCHES = [
  { game: 'FSC',                 matchId: 1675, battingTeam: 'Madison Lions' },
  { game: 'Great Maratha',       matchId: 1703, battingTeam: 'Madison Lions' },
  { game: 'Nashville Underdogs', matchId: 1727, battingTeam: 'Madison Lions' },
  { game: 'Rockvale Risers',     matchId: 1742, battingTeam: 'Madison Lions' },
  // Fearless Fighters (1771) was a walkover — no batting data
  { game: 'Cool Springs Titans', matchId: 1796, battingTeam: 'Madison Lions' },
];

const TIGERS_MATCHES = [
  { game: 'Star Strikers',    matchId: 1669, battingTeam: 'Madison Tigers' },
  { game: 'Franklin Falcons', matchId: 1716, battingTeam: 'Madison Tigers' },
  { game: 'FSC',              matchId: 1734, battingTeam: 'Madison Tigers' },
  { game: 'Great Maratha',    matchId: 1755, battingTeam: 'Madison Tigers' },
  { game: 'Fearless Fighters',matchId: 1768, battingTeam: 'Madison Tigers' },
  { game: 'Afghan Eagles',    matchId: 1783, battingTeam: 'Madison Tigers' },
  { game: 'Rockvale Risers',  matchId: 1799, battingTeam: 'Madison Tigers' },
];

// ── Ball-by-ball abbreviated name → config short name ──────────────────────
// The ballbyball.do page uses abbreviated names: "Chinmay D", "mayur P", etc.
// These map to the short names used in the dashboard.
const LIONS_BBB_NAME_MAP = {
  'Chinmay D':   'Chinmay',
  'Hardik P':    'Hardik',
  'Manish B':    'Manish',
  'Mahesh V':    'Mahesh',
  'mayur P':     'Mayur R',
  'Mayur P':     'Mayur R',
  'Nikunj P':    'Nikunj',
  'Kirtan B':    'Kirtan',
  'Satish P':    'Satish',
  'Ravi S':      'Ravi',
  'Prakrut P':   'Prakrut',
  'Saurabh S':   'Saurabh',
  'Amit K':      'Amit',
  'Siddharth T': 'Siddharth',
  'Dyan P':      'Dyan (N)',
  'Jeel P':      'Jeel',
  'Gyan P':      'Gyan',
  // Sunny has different abbreviations depending on scorecard
  'Sunny P':     'Sunny(W) \u00a9',
  'Sunny W':     'Sunny(W) \u00a9',
};

const TIGERS_BBB_NAME_MAP = {
  'Naren R':     'Naren \u00a9',
  'Kiran R':     'Kiran',
  'Vamshi P':    'Vamsi',
  'Vamsi P':     'Vamsi',
  'Sharath C':              'Sharath',
  'Tiru P':                 'Tiru',
  'Tiru Chowdary P':        'Tiru',
  'Sai T':                  'Sai Teja',
  'Surya L':                'Surya',
  'Murali G':               'Murali (Wk)',
  'Srinivasa M':            'Murali (Wk)',
  'Srinivasa Murali K':     'Murali (Wk)',
  'Srinivasa Murali Krishna Y': 'Murali (Wk)',
  'Saiteja N':              'Sai Teja',
  'Suresh B':               'Suresh',
  'Sunny P':                'Sunny P',
  'Goutham P':              'GP',
  'Mayur L':                'Mayur L',
  'Mayur P':                'Mayur L',
  'Siva K':                 'Siva',
  'Siva Krishna D':         'Siva',
  'SAHITH A':    'Sahith',
  'Sahith A':    'Sahith',
  'Prapul R':    'Prapul',
  'Anurag':      'Anurag',
};

function mapBBBName(abbr, nameMap) {
  const trimmed = abbr.trim();
  if (nameMap[trimmed]) return nameMap[trimmed];
  // Case-insensitive exact match
  const lower = trimmed.toLowerCase();
  for (const [k, v] of Object.entries(nameMap)) {
    if (k.toLowerCase() === lower) return v;
  }
  // No fuzzy fallback — return as-is to avoid merging players who share a first name
  return trimmed;
}

// ── Scrape real dot balls from ballbyball.do page ───────────────────────────
async function scrapeBallByBall(page, matchId, battingTeam, nameMap) {
  const url = `${BASE}/ballbyball.do?matchId=${matchId}&clubId=${CLUB}`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  } catch(e) {}
  await new Promise(r => setTimeout(r, 3000));

  // Find which tab corresponds to the batting team and click it
  const tabClicked = await page.evaluate((battingTeam) => {
    const links = Array.from(document.querySelectorAll('a[data-toggle="tab"]'));
    for (const a of links) {
      if (a.textContent.trim() === battingTeam) {
        a.click();
        return a.getAttribute('href'); // e.g. "#ballByBallTeam1"
      }
    }
    return null;
  }, battingTeam);

  if (!tabClicked) {
    console.log(`   ⚠ Could not find tab for "${battingTeam}"`);
    return null;
  }

  await new Promise(r => setTimeout(r, 500));

  // Get innings text from the tab content div
  const divId = tabClicked.replace('#', '');
  const inningsText = await page.evaluate((divId) => {
    const el = document.getElementById(divId);
    return el ? el.innerText : null;
  }, divId);

  if (!inningsText) {
    console.log(`   ⚠ No content in div #${divId}`);
    return null;
  }

  // ── Parse ball-by-ball lines ───────────────────────────────────────────────
  // Each delivery appears as a line: "BowlerAbbr to BatterAbbr, N run(s)"
  // Wides:    "BowlerAbbr to BatterAbbr WIDE"
  // No balls: "BowlerAbbr to BatterAbbr, N runs FOUR NO BALL" etc.
  // Wickets:  "BowlerAbbr to BatterAbbr OUT! ..."  — still a legal delivery

  const playerStats = {};
  const dismissals = {};

  const lines = inningsText.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Skip wides entirely — they don't count as legal deliveries
    if (/\bWIDE\b/i.test(line) || /\bwide\b/i.test(line)) continue;

    // Match a valid delivery: "Bowler to Batter, N run(s)"
    const deliveryMatch = line.match(/^.+\s+to\s+(.+?),\s+(\d+)\s+runs?/i);
    if (deliveryMatch) {
      const batterAbbr = deliveryMatch[1].trim();
      const runs       = parseInt(deliveryMatch[2], 10);

      // Skip no-balls — they don't count as legal deliveries to the batter
      if (/NO\s*BALL/i.test(line)) continue;

      const name = mapBBBName(batterAbbr, nameMap);
      if (!playerStats[name]) playerStats[name] = { dots: 0, balls: 0, runs: 0 };
      playerStats[name].balls++;
      playerStats[name].runs += runs;
      if (runs === 0) playerStats[name].dots++;
      continue;
    }

    // Wicket line: "Bowler to Batter OUT! ..."
    const wicketMatch = line.match(/^.+\s+to\s+(.+?)\s+OUT!/i);
    if (wicketMatch) {
      const batterAbbr = wicketMatch[1].trim();
      const name = mapBBBName(batterAbbr, nameMap);
      dismissals[name] = true;
      // The wicket ball itself is counted in the dismissal text line below — don't double count
      // The actual dot/run is captured via the "N run" line above for the same over.ball
      // Actually OUT! lines in this format DON'T have run info, so count as 0-run delivery
      if (!playerStats[name]) playerStats[name] = { dots: 0, balls: 0, runs: 0 };
      playerStats[name].balls++;
      playerStats[name].dots++;
    }
  }

  // Build result array
  return Object.entries(playerStats).map(([name, s]) => ({
    name,
    dots: s.dots,
    runs: s.runs,
    balls: s.balls,
    isOut: !!dismissals[name],
  }));
}

// ── Fetch already-scraped game names from Sheets ───────────────────────────
async function fetchExistingGames(teamLabel) {
  try {
    const res  = await fetch(`${SCRIPT_URL}?type=dotballs&team=${teamLabel}`, { redirect: 'follow' });
    const json = await res.json();
    return new Set((json.games || []).map(g => g.game));
  } catch (e) {
    console.log(`  ⚠ Could not fetch existing games: ${e.message}`);
    return new Set();
  }
}

// ── Push game data to Apps Script ───────────────────────────────────────────
async function pushGame(teamLabel, game, dotballs) {
  const body = JSON.stringify({ type: 'dotballs', team: teamLabel, game, dotballs });
  try {
    const res  = await fetch(SCRIPT_URL, { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, redirect: 'follow' });
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      console.log(`    → Sheets: ${j.status}`);
    } catch {
      console.log(`    → Sheets: ${text.slice(0, 80)}`);
    }
  } catch (e) {
    console.log(`    → Sheets ERROR: ${e.message}`);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
(async () => {
  const args     = process.argv.slice(2);
  const arg      = (args.find(a => a === 'lions' || a === 'tigers') || '').toLowerCase();
  const force    = args.includes('--force');

  if (arg !== 'lions' && arg !== 'tigers') {
    console.log('Usage: node scrape-dotballs.js lions|tigers [--force]');
    console.log('  --force  Re-scrape and overwrite games already in Sheets');
    process.exit(1);
  }

  const matches   = arg === 'lions' ? LIONS_MATCHES    : TIGERS_MATCHES;
  const teamLabel = arg === 'lions' ? 'Lions'          : 'Tigers';
  const nameMap   = arg === 'lions' ? LIONS_BBB_NAME_MAP : TIGERS_BBB_NAME_MAP;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36');

  const existingGames = await fetchExistingGames(teamLabel);
  const newMatches = force ? matches : matches.filter(m => !existingGames.has(m.game));

  if (newMatches.length === 0) {
    console.log(`\nAll ${teamLabel} games already in Sheets — nothing to scrape.\n`);
    await browser.close();
    return;
  }

  const skipped = matches.length - newMatches.length;
  console.log(`\nScraping ${teamLabel} — ${newMatches.length} game(s)${force ? ' (force mode)' : ` (${skipped} already in Sheets)`}:\n`);

  for (const { game, matchId, battingTeam } of newMatches) {
    console.log(`📋 ${game} (matchId=${matchId})`);
    const players = await scrapeBallByBall(page, matchId, battingTeam, nameMap);

    if (!players || players.length === 0) {
      console.log(`   ⚠ No ball-by-ball data found — skipping`);
      continue;
    }

    players.forEach(p => {
      const dotPct = p.balls > 0 ? Math.round(p.dots / p.balls * 100) : 0;
      console.log(`   ${p.name.padEnd(18)} B=${String(p.balls).padStart(3)}  R=${String(p.runs).padStart(3)}  dots=${String(p.dots).padStart(3)}  (${dotPct}%)  ${p.isOut ? 'out' : 'not out'}`);
    });

    await pushGame(teamLabel, game, players);
    await new Promise(r => setTimeout(r, 600));
  }

  await browser.close();
  console.log('\n✓ Done. Refresh dotball-dashboard.html to verify.\n');
})();
