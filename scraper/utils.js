// Shared utilities for MCC scrapers

const puppeteer = require('puppeteer-extra');
const stealth   = require('puppeteer-extra-plugin-stealth');
puppeteer.use(stealth());

const BASE_URL    = 'https://cricclubs.com/NashvilleCricketLeague';
const CLUB        = '1092658';
const SCRIPT_URL  = 'https://script.google.com/macros/s/AKfycbyyvPf-XcHewBNf755D6kW2baY7hHacXuT5ZNAmrGnDy9NELheaLkfEqIZMbTRMZsP_dg/exec';
const USER_AGENT  = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
const AD_PATTERN  = /ad\.|doubleclick|googlesyndication|gumgum|freestar|prebid|rubiconproject|3lift|liadm|taboola|outbrain|amazon-adsystem/i;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function createBrowser({ headless = true, blockAds = false } = {}) {
  const browser = await puppeteer.launch({
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  if (blockAds) {
    await page.setRequestInterception(true);
    page.on('request', req => AD_PATTERN.test(req.url()) ? req.abort() : req.continue());
  }
  return { browser, page };
}

async function postToSheets(payload) {
  const body = JSON.stringify(payload);
  const res  = await fetch(SCRIPT_URL, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
    redirect: 'follow',
  });
  const text = await res.text();
  try   { return JSON.parse(text); }
  catch { return { status: text.slice(0, 80) }; }
}

async function getFromSheets(params) {
  const qs  = new URLSearchParams(params).toString();
  const res = await fetch(`${SCRIPT_URL}?${qs}`, { redirect: 'follow' });
  return res.json();
}

module.exports = { BASE_URL, CLUB, SCRIPT_URL, sleep, createBrowser, postToSheets, getFromSheets };
