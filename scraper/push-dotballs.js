// Pushes dot ball PRESET data to Google Sheets via the Apps Script endpoint.
// Run once per team to seed Sheets with historical game data:
//   node push-dotballs.js lions
//   node push-dotballs.js tigers

const { SCRIPT_URL, sleep, postToSheets } = require('./utils');

// ── Lions dot ball data (all games played through April 12, 2026) ──────────
const LIONS = {
  'FSC': [
    { name: 'Hardik',           dots: 1,  runs: 0,  balls: 1,  isOut: true  },
    { name: 'Chinmay',          dots: 4,  runs: 23, balls: 13, isOut: false },
    { name: 'Mayur R',          dots: 0,  runs: 13, balls: 5,  isOut: false },
  ],
  'Great Maratha': [
    { name: 'Mayur R',          dots: 12, runs: 18, balls: 24, isOut: true  },
    { name: 'Chinmay',          dots: 10, runs: 9,  balls: 18, isOut: true  },
    { name: 'Manish',           dots: 2,  runs: 0,  balls: 2,  isOut: true  },
    { name: 'Sunny(W) \u00a9', dots: 4,  runs: 2,  balls: 6,  isOut: true  },
    { name: 'Kirtan',           dots: 3,  runs: 3,  balls: 6,  isOut: true  },
    { name: 'Hardik',           dots: 11, runs: 16, balls: 19, isOut: false },
    { name: 'Amit',             dots: 4,  runs: 7,  balls: 10, isOut: false },
  ],
  'Rockvale Risers': [
    { name: 'Chinmay',          dots: 2,  runs: 15, balls: 6,  isOut: true  },
    { name: 'Hardik',           dots: 13, runs: 72, balls: 39, isOut: true  },
    { name: 'Sunny(W) \u00a9', dots: 2,  runs: 6,  balls: 5,  isOut: true  },
    { name: 'Mahesh',           dots: 2,  runs: 29, balls: 13, isOut: true  },
    { name: 'Manish',           dots: 5,  runs: 54, balls: 26, isOut: true  },
    { name: 'Satish',           dots: 3,  runs: 21, balls: 14, isOut: true  },
    { name: 'Mayur R',          dots: 4,  runs: 16, balls: 11, isOut: false },
    { name: 'Kirtan',           dots: 2,  runs: 9,  balls: 6,  isOut: false },
  ],
  'Nashville Underdogs': [
    { name: 'Mayur R',          dots: 4,  runs: 7,  balls: 7,  isOut: true  },
    { name: 'Hardik',           dots: 1,  runs: 0,  balls: 1,  isOut: true  },
    { name: 'Chinmay',          dots: 15, runs: 28, balls: 26, isOut: true  },
    { name: 'Sunny(W) \u00a9', dots: 9,  runs: 27, balls: 23, isOut: true  },
    { name: 'Mahesh',           dots: 1,  runs: 2,  balls: 2,  isOut: true  },
    { name: 'Nikunj',           dots: 5,  runs: 0,  balls: 5,  isOut: true  },
    { name: 'Amit',             dots: 3,  runs: 1,  balls: 4,  isOut: true  },
    { name: 'Manish',           dots: 6,  runs: 5,  balls: 8,  isOut: true  },
    { name: 'Prakrut',          dots: 11, runs: 10, balls: 15, isOut: true  },
    { name: 'Kirtan',           dots: 11, runs: 13, balls: 16, isOut: true  },
    { name: 'Satish',           dots: 6,  runs: 17, balls: 13, isOut: false },
  ],
  // Fearless Fighters (4/12) was a walkover — no batting data needed
};

// ── Tigers dot ball data (games played through April 26, 2026) ─────────────
// FSC (4/5), Great Maratha (4/12), Fearless Fighters (4/19), Afghan Eagles (4/26)
// → Ball-by-ball data not available; add manually below once known:
const TIGERS = {
  'Star Strikers': [
    { name: 'Kiran',            dots: 6,  runs: 5,  balls: 11, isOut: true  },
    { name: 'Vamshi',           dots: 2,  runs: 3,  balls: 5,  isOut: true  },
    { name: 'Sharath',          dots: 10, runs: 22, balls: 22, isOut: true  },
    { name: 'Naren',            dots: 8,  runs: 6,  balls: 12, isOut: true  },
    { name: 'Surya',            dots: 2,  runs: 21, balls: 11, isOut: true  },
    { name: 'Suresh',           dots: 4,  runs: 7,  balls: 9,  isOut: false },
    { name: 'Sunny P',          dots: 1,  runs: 5,  balls: 4,  isOut: false },
  ],
  'Franklin Falcons': [
    { name: 'Surya',            dots: 1,  runs: 15, balls: 6,  isOut: true  },
    { name: 'Kiran',            dots: 0,  runs: 113,balls: 48, isOut: false },
    { name: 'Vamshi',           dots: 0,  runs: 37, balls: 17, isOut: false },
    { name: 'Naren',            dots: 3,  runs: 50, balls: 19, isOut: false },
  ],
  // TODO: FSC (4/5), Great Maratha (4/12), Fearless Fighters (4/19), Afghan Eagles (4/26)
  // Enter via tigers-dotball-log.html or add data here and re-run this script
};

async function pushGame(team, teamLabel, game, players) {
  try {
    const j = await postToSheets({ type: 'dotballs', team: teamLabel, game, dotballs: players });
    console.log(`  ${game}: ${j.status}`);
  } catch (e) {
    console.log(`  ${game}: ERROR — ${e.message}`);
  }
}

(async () => {
  const arg = (process.argv[2] || '').toLowerCase();
  if (arg !== 'lions' && arg !== 'tigers') {
    console.log('Usage: node push-dotballs.js lions|tigers');
    process.exit(1);
  }

  const data  = arg === 'lions' ? LIONS  : TIGERS;
  const label = arg === 'lions' ? 'Lions' : 'Tigers';
  console.log(`Pushing ${label} dot ball data to Sheets...`);

  for (const [game, players] of Object.entries(data)) {
    if (game.startsWith('//') || game === 'TODO') continue;
    process.stdout.write(`  ${game}... `);
    await pushGame(arg, label, game, players);
    await sleep(500); // avoid rate-limiting
  }

  console.log('\nDone. Refresh dotball-dashboard.html to verify.');
})();
