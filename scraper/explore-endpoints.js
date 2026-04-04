const puppeteer = require('puppeteer');
const fs = require('fs');

const PAGES = [
  'https://cricclubs.com/NashvilleCricketLeague/results?leagueId=Pj7NL8S3pXOPdIPaHDwboQ&year=2025&series=jzSTpzuunaGCjZKzp83FqA&seriesName=2025+-+Tape+20',
];

async function explore() {
  const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36');

  for (const url of PAGES) {
    console.log(`\n========== ${url} ==========`);

    page.removeAllListeners('response');
    page.on('response', async (response) => {
      const u = response.url();
      if (!u.includes('core-prod-origin.cricclubs.com')) return;
      const ct = response.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      try {
        const data = await response.json();
        const endpoint = u.split('?')[0].split('/').slice(-2).join('/');
        const arr = Array.isArray(data) ? data : (data.data || data.completed || []);
        const count = Array.isArray(arr) ? arr.length : (typeof data === 'object' ? JSON.stringify(data).slice(0,200) : '?');
        console.log(`\n📡 FULL URL: ${u}`);
        console.log(`   Records: ${count}`);
        if (typeof data === 'object' && !Array.isArray(data)) console.log(`   Top-level keys: ${Object.keys(data).join(', ')}`);
        if (Array.isArray(arr) && arr[0]) console.log(`   Fields: ${Object.keys(arr[0]).join(', ')}`);
      } catch(e) {}
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    // Scroll to bottom repeatedly to trigger pagination
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  await browser.close();
}

explore().catch(console.error);
