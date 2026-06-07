// Pushes historical Lions catch data directly to Google Sheets (no Apps Script).
// Run once: node push-historical-catches.js

const { ensureTab, writeTab } = require('./sheets-client');

const CATCH_HEADERS = ['Player', 'Attempted', 'Taken', 'Dropped'];

function tabName(game) { return `Catches_Lions_${game}`; }

const history = {
  'FSC': [
    {name:'Sunny(W) ©', attempted:2, taken:2, dropped:0},
    {name:'Chinmay',     attempted:0, taken:0, dropped:0},
    {name:'Hardik',      attempted:0, taken:0, dropped:0},
    {name:'Manish',      attempted:0, taken:0, dropped:0},
    {name:'Mahesh',      attempted:1, taken:1, dropped:0},
    {name:'Mayur R',     attempted:1, taken:1, dropped:0},
    {name:'Nikunj',      attempted:0, taken:0, dropped:0},
    {name:'Kirtan',      attempted:0, taken:0, dropped:0},
    {name:'Satish',      attempted:1, taken:0, dropped:1},
    {name:'Ravi',        attempted:0, taken:0, dropped:0},
    {name:'Prakrut',     attempted:0, taken:0, dropped:0},
    {name:'Saurabh',     attempted:1, taken:1, dropped:0},
    {name:'Amit',        attempted:0, taken:0, dropped:0},
    {name:'KP',          attempted:0, taken:0, dropped:0},
    {name:'Dhyan (N)',   attempted:0, taken:0, dropped:0},
    {name:'Jeel',        attempted:0, taken:0, dropped:0},
    {name:'Gyan',        attempted:0, taken:0, dropped:0},
  ],
  'Great Maratha': [
    {name:'Sunny(W) ©', attempted:5, taken:4, dropped:1},
    {name:'Chinmay',     attempted:1, taken:0, dropped:1},
    {name:'Hardik',      attempted:0, taken:0, dropped:0},
    {name:'Manish',      attempted:1, taken:1, dropped:0},
    {name:'Mahesh',      attempted:0, taken:0, dropped:0},
    {name:'Mayur R',     attempted:0, taken:0, dropped:0},
    {name:'Nikunj',      attempted:0, taken:0, dropped:0},
    {name:'Kirtan',      attempted:0, taken:0, dropped:0},
    {name:'Satish',      attempted:0, taken:0, dropped:0},
    {name:'Ravi',        attempted:1, taken:0, dropped:1},
    {name:'Prakrut',     attempted:0, taken:0, dropped:0},
    {name:'Saurabh',     attempted:0, taken:0, dropped:0},
    {name:'Amit',        attempted:1, taken:1, dropped:0},
    {name:'KP',          attempted:0, taken:0, dropped:0},
    {name:'Dhyan (N)',   attempted:1, taken:0, dropped:1},
    {name:'Jeel',        attempted:0, taken:0, dropped:0},
    {name:'Gyan',        attempted:1, taken:1, dropped:0},
  ],
};

(async () => {
  for (const [game, catches] of Object.entries(history)) {
    const tab = tabName(game);
    const rows = catches.map(c => [c.name, c.attempted, c.taken, c.dropped]);
    await ensureTab(tab, CATCH_HEADERS);
    await writeTab(tab, CATCH_HEADERS, rows);
    console.log(`${game} → ${tab}: ok`);
  }
  console.log('Done.');
})();
