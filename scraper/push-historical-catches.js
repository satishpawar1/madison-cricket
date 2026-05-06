// Pushes historical Lions catch data (FSC, Great Maratha) into the Google Sheet
// via the Apps Script endpoint. Run once: node push-historical-catches.js

const { postToSheets } = require('./utils');

const history = {
  'FSC': [
    {name:'Sunny(W) \u00a9', attempted:2, taken:2, dropped:0},
    {name:'Chinmay',         attempted:0, taken:0, dropped:0},
    {name:'Hardik',          attempted:0, taken:0, dropped:0},
    {name:'Manish',          attempted:0, taken:0, dropped:0},
    {name:'Mahesh',          attempted:1, taken:1, dropped:0},
    {name:'Mayur R',         attempted:1, taken:1, dropped:0},
    {name:'Nikunj',          attempted:0, taken:0, dropped:0},
    {name:'Kirtan',          attempted:0, taken:0, dropped:0},
    {name:'Satish',          attempted:1, taken:0, dropped:1},
    {name:'Ravi',            attempted:0, taken:0, dropped:0},
    {name:'Prakrut',         attempted:0, taken:0, dropped:0},
    {name:'Saurabh',         attempted:1, taken:1, dropped:0},
    {name:'Amit',            attempted:0, taken:0, dropped:0},
    {name:'KP',              attempted:0, taken:0, dropped:0},
    {name:'Dyan (N)',        attempted:0, taken:0, dropped:0},
    {name:'Jeel',            attempted:0, taken:0, dropped:0},
    {name:'Gyan',            attempted:0, taken:0, dropped:0}
  ],
  'Great Maratha': [
    {name:'Sunny(W) \u00a9', attempted:5, taken:4, dropped:1},
    {name:'Chinmay',         attempted:1, taken:0, dropped:1},
    {name:'Hardik',          attempted:0, taken:0, dropped:0},
    {name:'Manish',          attempted:1, taken:1, dropped:0},
    {name:'Mahesh',          attempted:0, taken:0, dropped:0},
    {name:'Mayur R',         attempted:0, taken:0, dropped:0},
    {name:'Nikunj',          attempted:0, taken:0, dropped:0},
    {name:'Kirtan',          attempted:0, taken:0, dropped:0},
    {name:'Satish',          attempted:0, taken:0, dropped:0},
    {name:'Ravi',            attempted:1, taken:0, dropped:1},
    {name:'Prakrut',         attempted:0, taken:0, dropped:0},
    {name:'Saurabh',         attempted:0, taken:0, dropped:0},
    {name:'Amit',            attempted:1, taken:1, dropped:0},
    {name:'KP',              attempted:0, taken:0, dropped:0},
    {name:'Dyan (N)',        attempted:1, taken:0, dropped:1},
    {name:'Jeel',            attempted:0, taken:0, dropped:0},
    {name:'Gyan',            attempted:1, taken:1, dropped:0}
  ]
};

async function postGame(game, catches) {
  const j = await postToSheets({ type: 'catches', team: 'Lions', game, catches });
  console.log(`${game}: ${j.status}${j.message ? ' — ' + j.message : ''}`);
}

(async () => {
  for (const [game, catches] of Object.entries(history)) {
    console.log(`Posting ${game}...`);
    await postGame(game, catches);
  }
  console.log('Done.');
})();
