const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const BASE = 'https://cricclubs.com/NashvilleCricketLeague';
const CLUB = '1092658';

async function explore() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

  // ── Scan viewLeague.do across a range of IDs, looking for Lions/Tigers ──
  console.log('=== Scanning viewLeague.do for Lions/Tigers ===');
  for (let id = 20; id <= 35; id++) {
    try {
      await page.goto(`${BASE}/viewLeague.do?league=${id}&clubId=${CLUB}`,
        { waitUntil: 'domcontentloaded', timeout: 10000 });
    } catch(e) { process.stdout.write(`${id}:err `); continue; }
    await new Promise(r => setTimeout(r, 1000));

    const info = await page.evaluate(() => {
      const allText = document.body.innerText;
      const hasLions = allText.includes('Lions') || allText.includes('Madison');
      const tables = Array.from(document.querySelectorAll('table'));
      const best = tables.map(t => ({ rows: t.rows.length, text: t.innerText.slice(0,100) }))
        .sort((a,b) => b.rows - a.rows)[0];
      return {
        hasLions,
        title: document.title.slice(0,60),
        topTeams: Array.from(document.querySelectorAll('table tr td:nth-child(2)'))
          .slice(0,5).map(c => c.textContent.trim()).filter(Boolean)
      };
    });

    if (info.hasLions) {
      console.log(`\n✅ league=${id} HAS LIONS/MADISON: "${info.title}"`);
      console.log('   Teams:', info.topTeams.join(', '));
    } else if (info.topTeams.length > 0) {
      process.stdout.write(`${id}:${info.topTeams[0].slice(0,8)} `);
    } else {
      process.stdout.write(`${id}:empty `);
    }
  }
  console.log('\n');

  // ── Also scan viewPointsTable.do with league= (not leagueId=) for Lions/Tigers ──
  console.log('=== Scanning viewPointsTable.do?league= for Lions/Tigers ===');
  for (let id = 20; id <= 35; id++) {
    try {
      await page.goto(`${BASE}/viewPointsTable.do?league=${id}&clubId=${CLUB}`,
        { waitUntil: 'domcontentloaded', timeout: 10000 });
    } catch(e) { process.stdout.write(`${id}:err `); continue; }
    await new Promise(r => setTimeout(r, 1000));

    const info = await page.evaluate(() => {
      const allText = document.body.innerText;
      const hasLions = allText.includes('Lions') || allText.includes('Madison');
      return {
        hasLions,
        teams: Array.from(document.querySelectorAll('table tr')).slice(1,5)
          .map(r => Array.from(r.cells).map(c => c.textContent.trim()).slice(1,2).join(''))
          .filter(Boolean)
      };
    });

    if (info.hasLions) {
      console.log(`\n✅ league=${id}: HAS LIONS/MADISON`);
      console.log('   Teams:', info.teams.join(', '));
    } else {
      process.stdout.write(`${id}:${info.teams[0] ? info.teams[0].slice(0,6) : 'empty'} `);
    }
  }
  console.log('\n');

  // ── Check battingRecords.do with leagueId= (old param) for IDs 20–35 ──
  console.log('=== Scanning battingRecords.do?leagueId= for Lions/Tigers ===');
  for (let id = 20; id <= 35; id++) {
    try {
      await page.goto(`${BASE}/battingRecords.do?clubId=${CLUB}&leagueId=${id}`,
        { waitUntil: 'domcontentloaded', timeout: 10000 });
    } catch(e) { process.stdout.write(`${id}:err `); continue; }
    await new Promise(r => setTimeout(r, 1000));

    const info = await page.evaluate(() => {
      const allText = document.body.innerText;
      const hasLions = allText.includes('Lions') || allText.includes('Madison');
      const tables = Array.from(document.querySelectorAll('table'));
      const best = tables.map(t => t.rows.length).sort((a,b) => b-a)[0] || 0;
      return { hasLions, rows: best, title: document.title.slice(0,50) };
    });

    if (info.hasLions || info.rows > 2) {
      console.log(`\n✅ leagueId=${id}: ${info.rows} rows "${info.title}" hasLions:${info.hasLions}`);
    } else {
      process.stdout.write(`${id}:${info.rows}r `);
    }
  }
  console.log('\n');

  await browser.close();
}

explore().catch(console.error);
