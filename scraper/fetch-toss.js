/**
 * fetch-toss.js
 *
 * Scrapes toss results for all 2026 completed matches.
 * Approach: the toss text is embedded as JSON inside the viewScorecard.do HTML,
 * in a ball-by-ball "comment" field at over 0 ball 0.
 * Pattern: "comment":"<strong>TeamX won the toss  and elected to bat/field</strong>"
 *
 * Usage:
 *   cd scraper && node fetch-toss.js
 *
 * Output: scraper/toss-results.json
 *   [
 *     { matchId, date, team1, team2, tossWinner, electedTo, tossText },
 *     ...
 *   ]
 */

const puppeteer = require('puppeteer-extra');
const stealth   = require('puppeteer-extra-plugin-stealth');
const fs        = require('fs');
const path      = require('path');

puppeteer.use(stealth());

const RESULTS_URL = 'https://cricclubs.com/NashvilleCricketLeague/viewLeagueResults.do?league=28&clubId=1092658';
const SCORECARD   = (id) => `https://cricclubs.com/NashvilleCricketLeague/viewScorecard.do?matchId=${id}&clubId=1092658`;

// Regex to extract toss from embedded JSON in the page HTML
const TOSS_RE = /<strong>([^<]*won the toss[^<]*)<\/strong>/i;

function parseToss(html) {
  const m = TOSS_RE.exec(html);
  if (!m) return null;
  const raw = m[1].replace(/\s+/g, ' ').trim(); // e.g. "Game Swingers won the toss and elected to bat"

  // Extract who elected to bat/field
  const batM   = /elected to (bat|field|bowl)/i.exec(raw);
  const electedTo = batM ? batM[1].toLowerCase().replace('bowl', 'field') : null;

  // Extract winner: everything before " won the toss"
  const winnerM = /^(.+?)\s+won the toss/i.exec(raw);
  const tossWinner = winnerM ? winnerM[1].trim() : null;

  return { tossWinner, electedTo, tossText: raw };
}

async function fetchToss() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  );
  // Block ads/trackers to speed up loads
  await page.setRequestInterception(true);
  page.on('request', req => {
    const u = req.url();
    if (/ad\.|doubleclick|googlesyndication|gumgum|freestar|prebid|rubiconproject|3lift|liadm|taboola|outbrain|amazon-adsystem/i.test(u)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  // ── Load existing toss data to skip already-scraped matches ──
  const outPath = path.join(__dirname, 'toss-results.json');
  let existing = [];
  if (fs.existsSync(outPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    } catch(e) {
      console.log('Could not parse existing toss-results.json, starting fresh');
    }
  }
  // Skip any matchId already in the file (with or without toss — abandoned matches
  // won't gain a toss after the fact, so no need to re-check them)
  const alreadyDone = new Set(existing.map(e => e.matchId));
  console.log(`Existing records: ${existing.length} (${alreadyDone.size} matchIds cached)`);

  // ── Step 1: Get all match IDs and team names from the results page ──
  console.log('\nLoading results page...');
  try {
    await page.goto(RESULTS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch(e) {
    console.log('  load warning:', e.message.split('\n')[0]);
  }
  await new Promise(r => setTimeout(r, 3000));

  const matches = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table tr'));
    const seen = new Set();
    return rows.map(row => {
      const link = row.querySelector('a[href*="viewScorecard"]');
      if (!link) return null;
      const href  = link.href;
      const idM   = href.match(/matchId=(\d+)/);
      if (!idM) return null;
      const matchId = idM[1];
      if (seen.has(matchId)) return null;
      seen.add(matchId);

      const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim());
      return { matchId, cells };
    }).filter(Boolean);
  });

  // Fallback: extract from scorecard links directly
  const allLinks = await page.evaluate(() => {
    const seen = new Set();
    return Array.from(document.querySelectorAll('a[href*="viewScorecard"]'))
      .map(a => {
        const m = a.href.match(/matchId=(\d+)/);
        if (!m || seen.has(m[1])) return null;
        seen.add(m[1]);
        // Find surrounding text (parent row) for context
        const row = a.closest('tr');
        const context = row ? row.textContent.replace(/\s+/g, ' ').trim() : '';
        return { matchId: m[1], context };
      })
      .filter(Boolean);
  });

  const allMatchIds = allLinks.length ? allLinks : matches;
  console.log(`Found ${allMatchIds.length} matches on results page`);

  // Filter to only new matches not already in the cache
  const matchIds = allMatchIds.filter(m => !alreadyDone.has(m.matchId));
  console.log(`New matches to scrape: ${matchIds.length} (skipping ${allMatchIds.length - matchIds.length} already done)`);

  // ── Step 2: For each match, fetch scorecard HTML and extract toss ──
  const results = [];

  for (let i = 0; i < matchIds.length; i++) {
    const { matchId, context } = matchIds[i];
    process.stdout.write(`\r[${i + 1}/${matchIds.length}] matchId=${matchId}  `);

    let tossWinner = null, electedTo = null, tossText = null;
    let team1 = null, team2 = null, date = null, resultText = null;

    try {
      try {
        await page.goto(SCORECARD(matchId), { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch(e) {
        // Page often times out due to ad scripts — HTML still loads, so continue
      }
      await new Promise(r => setTimeout(r, 2000));

      const html = await page.content();
      const toss = parseToss(html);
      if (toss) {
        ({ tossWinner, electedTo, tossText } = toss);
      }

      // Extract team names and date from the DOM
      const info = await page.evaluate(() => {
        const text = document.body.innerText || '';
        // Date: MM/DD/YYYY format
        const dateM = text.match(/\d{2}\/\d{2}\/\d{4}/);

        // The scorecard header has: TeamA \n score \n VS \n TeamB \n score
        // Find the two team name headings that surround "VS"
        const allText = text;
        const vsIdx = allText.indexOf('\nVS\n');
        let t1 = null, t2 = null;
        if (vsIdx !== -1) {
          // Text before VS: last non-empty line before VS
          const before = allText.substring(0, vsIdx).trimEnd().split('\n');
          // Walk backward to find the team name (skip score lines like "199/6" and blank lines)
          for (let i = before.length - 1; i >= 0; i--) {
            const line = before[i].trim();
            if (line && !/^\d/.test(line) && line.length > 2 && line.length < 60) {
              t1 = line; break;
            }
          }
          // Text after VS: first non-empty, non-score line
          const after = allText.substring(vsIdx + 4).trimStart().split('\n');
          for (const line of after) {
            const l = line.trim();
            if (l && !/^\d/.test(l) && l.length > 2 && l.length < 60) {
              t2 = l; break;
            }
          }
        }

        return {
          date:  dateM ? dateM[0] : null,
          team1: t1,
          team2: t2,
        };
      });

      // Normalize date to ISO YYYY-MM-DD
      if (info.date) {
        const [mm, dd, yyyy] = info.date.split('/');
        date = `${yyyy}-${mm}-${dd}`;
      }
      team1 = info.team1;
      team2 = info.team2;
      resultText = context ? context.replace(/Scorecard.*$/, '').trim() : null;

    } catch(e) {
      process.stdout.write(` ERROR: ${e.message.split('\n')[0]}`);
    }

    results.push({ matchId, date, team1, team2, resultText, tossWinner, electedTo, tossText });
  }

  console.log('\n');
  await browser.close();

  // ── Merge new results with existing, preserving order (newest first from results page) ──
  // New results go on top; existing cached records appended after
  const existingNotInNew = existing.filter(e => !results.find(r => r.matchId === e.matchId));
  const merged = [...results, ...existingNotInNew];

  // ── Summary of this run ──
  const newFound    = results.filter(r => r.tossText);
  const newNotFound = results.filter(r => !r.tossText);
  console.log(`\n=== THIS RUN: ${newFound.length} new toss found, ${newNotFound.length} no toss (abandoned?) ===`);
  newFound.forEach(r => console.log(`  [${r.matchId}] ${r.date || '?'} — ${r.tossText}`));

  const totalWithToss = merged.filter(r => r.tossText).length;
  console.log(`\nTotal in cache: ${merged.length} matches (${totalWithToss} with toss data)`);

  // Write toss-results.json (raw cache — MM/DD/YYYY dates preserved for readability)
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2));
  console.log(`\nWrote ${merged.length} entries → ${outPath}`);

  // Write toss-data.js for the frontend (dates already ISO from normalization above)
  const jsPath = path.join(__dirname, '..', 'toss-data.js');
  const jsContent = `// Auto-generated by scraper/fetch-toss.js — do not edit manually\n// Contains toss results for all 2026 Tape 20 league matches\nvar TOSS_DATA = ${JSON.stringify(merged, null, 2)};\n`;
  fs.writeFileSync(jsPath, jsContent);
  console.log(`Wrote toss-data.js → ${jsPath}`);

  return results;
}

fetchToss().catch(console.error);
