// ─────────────────────────────────────────────────────────────────────────────
// Madison Cricket Club — Central Config
// This is the ONLY file you need to update for any configuration changes.
// After editing, upload just this one file to GitHub.
// ─────────────────────────────────────────────────────────────────────────────

const MCC_CONFIG = {

  // ── Apps Script URL ────────────────────────────────────────────────────────
  // Only update this if you create a NEW Apps Script deployment.
  // Normal redeployments (new version) keep the same URL.
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyyvPf-XcHewBNf755D6kW2baY7hHacXuT5ZNAmrGnDy9NELheaLkfEqIZMbTRMZsP_dg/exec',

  // ── Lions ──────────────────────────────────────────────────────────────────
  lions: {
    players: [
      'Sunny(W) \u00a9', 'Chinmay', 'Hardik', 'Manish', 'Mahesh',
      'Mayur R', 'Nikunj', 'Kirtan', 'Satish', 'Ravi',
      'Prakrut', 'Saurabh', 'Amit', 'KP', 'Dyan (N)', 'Jeel', 'Gyan'
    ],
    games: [
      { name: 'FSC',                opponent: 'FSC',                day: 'Sunday',   date: 'March 1st',     time: '9:30 AM',  warmup: '8:30 AM',  ground: 'FCF2', gameDate: '2026-03-01' },
      { name: 'Great Maratha',      opponent: 'Great Maratha',      day: 'Sunday',   date: 'March 15th',    time: '1:00 PM',  warmup: '12:00 PM', ground: 'FCF2', gameDate: '2026-03-15' },
      { name: 'Nashville Underdogs',opponent: 'Nashville Underdogs',day: 'Sunday',   date: 'March 29th',    time: '1:00 PM',  warmup: '12:00 PM', ground: 'FCF2', gameDate: '2026-03-29' },
      { name: 'Rockvale Risers',    opponent: 'Rockvale Risers',    day: 'Sunday',   date: 'April 5th',     time: '3:00 PM',  warmup: '2:00 PM',  ground: 'FCF2', gameDate: '2026-04-05' },
      { name: 'Fearless Fighters',  opponent: 'Fearless Fighters',  day: 'Sunday',   date: 'April 12th',    time: '8:30 AM',  warmup: '7:30 AM',  ground: 'FCF2', gameDate: '2026-04-12' },
      { name: 'Cool Springs Titans',opponent: 'Cool Springs Titans',day: 'Sunday',   date: 'May 3rd',       time: '11:30 AM', warmup: '10:30 AM', ground: 'FCF1', gameDate: '2026-05-03' },
      { name: 'Franklin Falcons',   opponent: 'Franklin Falcons',   day: 'Sunday',   date: 'May 10th',      time: '3:00 PM',  warmup: '2:00 PM',  ground: 'FCF1', gameDate: '2026-05-10' },
      { name: 'MCA',                opponent: 'MCA',                day: 'Sunday',   date: 'May 17th',      time: '3:00 PM',  warmup: '2:00 PM',  ground: 'FCF2', gameDate: '2026-05-17' },
      { name: 'Shoals Strikers',    opponent: 'Shoals Strikers',    day: 'Saturday', date: 'May 30th',      time: '11:30 AM', warmup: '10:30 AM', ground: 'FCF2', gameDate: '2026-05-30' },
      { name: 'Star Strikers',      opponent: 'Star Strikers',      day: 'Sunday',   date: 'June 14th',     time: '11:30 AM', warmup: '10:30 AM', ground: 'FCF2', gameDate: '2026-06-14' }
    ],
    // Sheet game name overrides (tracker name → Google Sheet tab name)
    gameNameMap: {
      'Cool Springs Titans': 'Cool Spring Titans',
      'Shoals Strikers':     'Shoal Strikers'
    },
    closers: [
      "Let's keep the momentum going and get another win. See you all there! \uD83E\uDD81\uD83C\uDFCF",
      "Come on Lions \u2014 let's hunt! \uD83E\uDD81\uD83D\uDD25",
      "Back yourselves, play hard, and let's bring it home. Good luck! \uD83C\uDFC6",
      "One team, one goal. Let's go Lions! \uD83E\uDD81",
      "Time to roar! Let's get the win \uD83E\uDD81\uD83C\uDFCF\uD83D\uDCAA"
    ],
    // Pre-loaded availability data for completed games
    catchData: [
      {name:'Sunny(W) ©', att:7, tak:6},
      {name:'Chinmay',    att:1, tak:0},
      {name:'Hardik',     att:0, tak:0},
      {name:'Manish',     att:1, tak:1},
      {name:'Mahesh',     att:1, tak:1},
      {name:'Mayur R',    att:1, tak:1},
      {name:'Satish',     att:1, tak:0},
      {name:'Ravi',       att:1, tak:0},
      {name:'Prakrut',    att:0, tak:0},
      {name:'Saurabh',    att:1, tak:1},
      {name:'Amit',       att:1, tak:1},
      {name:'KP',         att:0, tak:0},
      {name:'Dyan (N)',   att:1, tak:0},
      {name:'Jeel',       att:0, tak:0},
      {name:'Kirtan',     att:0, tak:0},
      {name:'Gyan',       att:1, tak:1}
    ],
    preloaded: {
      'FSC':          { av: ['Sunny(W) \u00a9','Chinmay','Hardik','Manish','Mahesh','Mayur R','Nikunj','Kirtan','Satish','Ravi','Prakrut','Saurabh','Amit','KP','Dyan (N)','Jeel'], sel: ['Sunny(W) \u00a9','Chinmay','Hardik','Manish','Mahesh','Mayur R','Nikunj','Kirtan','Satish','Ravi','Saurabh','Amit'] },
      'Great Maratha':{ av: ['Sunny(W) \u00a9','Chinmay','Hardik','Manish','Mahesh','Mayur R','Kirtan','Ravi','Amit','Dyan (N)','Gyan'], sel: ['Sunny(W) \u00a9','Chinmay','Hardik','Manish','Mayur R','Kirtan','Ravi','Amit','Dyan (N)','Gyan'] }
    }
  },

  // ── Tigers ─────────────────────────────────────────────────────────────────
  tigers: {
    players: [
      'Naren \u00a9', 'Kiran', 'Vamsi', 'Sharath', 'Tiru',
      'Sai Teja', 'Surya', 'Murali (Wk)', 'Suresh', 'Sunny P',
      'GP', 'Mayur L', 'Siva', 'Sahith', 'Prapul', 'Anurag'
    ],
    games: [
      { name: 'Star Strikers',    opponent: 'Star Strikers',    day: 'Saturday', date: 'February 28th', time: '9:30 AM',  warmup: '8:30 AM',  ground: 'FCF2', gameDate: '2026-02-28' },
      { name: 'Franklin Falcons', opponent: 'Franklin Falcons', day: 'Sunday',   date: 'March 22nd',    time: '1:00 PM',  warmup: '12:00 PM', ground: 'FCF1', gameDate: '2026-03-22' },
      { name: 'FSC',              opponent: 'FSC',              day: 'Sunday',   date: 'April 5th',     time: '8:30 AM',  warmup: '7:30 AM',  ground: 'FCF1', gameDate: '2026-04-05' },
      { name: 'Great Maratha',    opponent: 'Great Maratha',    day: 'Sunday',   date: 'April 12th',    time: '3:00 PM',  warmup: '2:00 PM',  ground: 'FCF2', gameDate: '2026-04-12' },
      { name: 'Fearless Fighters',opponent: 'Fearless Fighters',day: 'Sunday',   date: 'April 19th',    time: '11:30 AM', warmup: '10:30 AM', ground: 'FCF1', gameDate: '2026-04-19' },
      { name: 'Afghan Eagles',    opponent: 'Afghan Eagles',    day: 'Sunday',   date: 'April 26th',    time: '11:30 AM', warmup: '10:30 AM', ground: 'FCF1', gameDate: '2026-04-26' },
      { name: 'Rockvale Risers',  opponent: 'Rockvale Risers',  day: 'Sunday',   date: 'May 3rd',       time: '3:00 PM',  warmup: '2:00 PM',  ground: 'FCF2', gameDate: '2026-05-03' },
      { name: 'MCA',              opponent: 'MCA',              day: 'Sunday',   date: 'May 10th',      time: '11:30 AM', warmup: '10:30 AM', ground: 'FCF2', gameDate: '2026-05-10' },
      { name: 'Mumbai Risers',    opponent: 'Mumbai Risers',    day: 'Sunday',   date: 'June 7th',      time: '3:00 PM',  warmup: '2:00 PM',  ground: 'FCF2', gameDate: '2026-06-07' },
      { name: 'Shoals Strikers',  opponent: 'Shoals Strikers',  day: 'Sunday',   date: 'June 14th',     time: '11:30 AM', warmup: '10:30 AM', ground: 'FCF1', gameDate: '2026-06-14' }
    ],
    gameNameMap: {},
    closers: [
      "Let's go out there and make it count. Come on Tigers! \uD83D\uDC2F\uD83C\uDFC6",
      "Back yourselves, play hard, and let's bring home the win. See you all there! \uD83C\uDFCF\uD83D\uDD25",
      "Believe in the team. Let's hunt \uD83D\uDC2F",
      "One team, one goal \u2014 let's get the win! Good luck Tigers! \uD83C\uDFC6",
      "Time to roar! Let's go Tigers \uD83D\uDC2F\uD83C\uDFCF"
    ],
    preloaded: {
      'Star Strikers':    { av: ['Naren \u00a9','Kiran','Vamsi','Sharath','Tiru','Surya','Murali (Wk)','Suresh','GP','Mayur L','Siva','Sahith'],    sel: ['Naren \u00a9','Kiran','Vamsi','Sharath','Tiru','Surya','Murali (Wk)','Suresh','GP','Mayur L','Siva','Sahith'] },
      'Franklin Falcons': { av: ['Naren \u00a9','Kiran','Vamsi','Tiru','Surya','Murali (Wk)','Suresh','Sunny P','Mayur L','Siva','Sahith'], sel: ['Naren \u00a9','Kiran','Vamsi','Tiru','Surya','Murali (Wk)','Suresh','Sunny P','Mayur L','Siva','Sahith'] }
    }
  }
};
