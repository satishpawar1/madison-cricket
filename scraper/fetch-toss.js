/**
 * fetch-toss.js
 *
 * Scrapes toss results and Player of the Match for all 2026 completed matches.
 * Approach: the toss text is embedded as JSON inside the viewScorecard.do HTML,
 * in a ball-by-ball "comment" field at over 0 ball 0.
 * Pattern: "comment":"<strong>TeamX won the toss  and elected to bat/field</strong>"
 * Player of the Match appears in the scorecard page DOM below the toss.
 *
 * Usage:
 *   cd scraper && node fetch-toss.js
 *
 * Output: scraper/toss-results.json
 *   [
 *     { matchId, date, team1, team2, tossWinner, electedTo, tossText, playerOfMatch },
 *     ...
 *   ]
 */

const fs   = require('fs');
const path = require('path');
const { sleep, createBrowser } = require('./utils');

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
  const { browser, page } = await createBrowser({ blockAds: true });

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
  // Skip matchIds that already have playerOfMatch scraped (undefined = not yet attempted)
  const alreadyDone = new Set(existing.filter(e => e.playerOfMatch !== undefined).map(e => e.matchId));
  console.log(`Existing records: ${existing.length} (${alreadyDone.size} fully scraped, rest will re-scrape for POTM)`);

  // ── Step 1: Get all match IDs and team names from the results page ──
  console.log('\nLoading results page...');
  try {
    await page.goto(RESULTS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch(e) {
    console.log('  load warning:', e.message.split('\n')[0]);
  }
  await sleep(3000);

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
    let team1 = null, team2 = null, date = null, resultText = null, playerOfMatch = null, topScorer = null;

    try {
      try {
        await page.goto(SCORECARD(matchId), { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch(e) {
        // Page often times out due to ad scripts — HTML still loads, so continue
      }
      await sleep(2000);

      const html = await page.content();
      const toss = parseToss(html);
      if (toss) {
        ({ tossWinner, electedTo, tossText } = toss);
      }

      // Extract team names and date from the header (before clicking any tabs)
      const headerInfo = await page.evaluate(() => {
        const text = document.body.innerText || '';
        const dateM = text.match(/\d{2}\/\d{2}\/\d{4}/);
        const vsIdx = text.indexOf('\nVS\n');
        let t1 = null, t2 = null;
        if (vsIdx !== -1) {
          const before = text.substring(0, vsIdx).trimEnd().split('\n');
          for (let i = before.length - 1; i >= 0; i--) {
            const line = before[i].trim();
            if (line && !/^\d/.test(line) && line.length > 2 && line.length < 60) { t1 = line; break; }
          }
          const after = text.substring(vsIdx + 4).trimStart().split('\n');
          for (const line of after) {
            const l = line.trim();
            if (l && !/^\d/.test(l) && l.length > 2 && l.length < 60) { t2 = l; break; }
          }
        }
        return { date: dateM ? dateM[0] : null, team1: t1, team2: t2 };
      });

      // Click the MCC team's batting tab to load their innings
      const mccTeamName = (headerInfo.team1 && /madison/i.test(headerInfo.team1)) ? headerInfo.team1
                        : (headerInfo.team2 && /madison/i.test(headerInfo.team2)) ? headerInfo.team2
                        : null;

      if (mccTeamName) {
        await page.evaluate((teamName) => {
          const childTabs = document.querySelectorAll('.child-tabs a');
          const mccTab = Array.from(childTabs).find(a => a.textContent.trim().toLowerCase() === teamName.toLowerCase());
          if (mccTab) mccTab.click();
        }, mccTeamName);
        await sleep(2000);

        // Parse MCC team batting from the innings section
        topScorer = await page.evaluate((teamName) => {
          const text = document.body.innerText || '';
          const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
          const inningsLabel = teamName + ' innings';
          const start = lines.findIndex(l => l.toLowerCase() === inningsLabel.toLowerCase());
          if (start === -1) return null;

          // Lines after header "R\tB\t4s\t6s\tSR" until "Extras"
          let headerIdx = -1;
          for (let i = start; i < Math.min(start + 5, lines.length); i++) {
            if (/^R\s/.test(lines[i]) || lines[i].startsWith('R\t')) { headerIdx = i; break; }
          }
          if (headerIdx === -1) return null;

          const batters = [];
          let i = headerIdx + 1;
          while (i < lines.length) {
            const nameLine = lines[i];
            if (/^extras$/i.test(nameLine) || /^bowling/i.test(nameLine)) break;
            const howOut  = lines[i + 1] || '';
            const stats   = lines[i + 2] || '';
            const parts   = stats.split('\t');
            if (parts.length >= 5 && /^\d+$/.test(parts[0])) {
              // Strip trailing number (jersey number) from player name
              const name = nameLine.replace(/\s+\d+$/, '').trim();
              const runs = parseInt(parts[0], 10);
              batters.push({ name, runs, balls: parseInt(parts[1], 10) || 0, fours: parseInt(parts[2], 10) || 0, sixes: parseInt(parts[3], 10) || 0, strikeRate: parts[4], howOut: howOut.replace(/[()]/g, '').trim() });
              i += 3;
            } else {
              i++;
            }
          }
          if (!batters.length) return null;
          return batters.sort((a, b) => b.runs - a.runs)[0];
        }, mccTeamName);
      }

      // Click the Info tab to load POTM and match details via AJAX
      await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('a[data-toggle="tab"]'));
        const info = tabs.find(t => /info/i.test(t.textContent));
        if (info) info.click();
      });
      await sleep(3000);

      // Extract POTM from the Info tab panel (#tab0default)
      const info = await page.evaluate(() => {
        let playerOfMatch = null;
        const infoPanel = document.getElementById('tab0default');
        if (infoPanel) {
          const infoText = infoPanel.innerText || '';
          const potmM = infoText.match(/player of the match[:\t\s]+([^\n]+)/i);
          if (potmM) playerOfMatch = potmM[1].trim().replace(/\s+/g, ' ') || null;
        }
        return { playerOfMatch };
      });

      // Normalize date to ISO YYYY-MM-DD
      if (headerInfo.date) {
        const [mm, dd, yyyy] = headerInfo.date.split('/');
        date = `${yyyy}-${mm}-${dd}`;
      }
      team1 = headerInfo.team1;
      team2 = headerInfo.team2;
      playerOfMatch = info.playerOfMatch || null;
      resultText = context ? context.replace(/Scorecard.*$/, '').trim() : null;

    } catch(e) {
      process.stdout.write(` ERROR: ${e.message.split('\n')[0]}`);
    }

    results.push({ matchId, date, team1, team2, resultText, tossWinner, electedTo, tossText, playerOfMatch, topScorer });
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
