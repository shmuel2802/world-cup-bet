const https = require('https');

const CLOUD_DB_URL = "https://world-cup-bet-3cd2c-default-rtdb.firebaseio.com/data/matches.json";

const realMatches = [
  {
    id: "m_1",
    homeTeam: "מקסיקו",
    awayTeam: "קולומביה",
    homeFlag: "https://flagcdn.com/w160/mx.png",
    awayFlag: "https://flagcdn.com/w160/co.png",
    status: "SCHEDULED",
    utcDate: "2026-06-11T22:00:00Z",
    homeScore: null,
    awayScore: null,
    stage: "שלב הבתים - בית א' (משחק הפתיחה)",
    homeOdds: 2.1,
    drawOdds: 3.2,
    awayOdds: 3.1
  },
  {
    id: "m_2",
    homeTeam: "קנדה",
    awayTeam: "אלג'יריה",
    homeFlag: "https://flagcdn.com/w160/ca.png",
    awayFlag: "https://flagcdn.com/w160/dz.png",
    status: "SCHEDULED",
    utcDate: "2026-06-12T19:00:00Z",
    homeScore: null,
    awayScore: null,
    stage: "שלב הבתים - בית ב'",
    homeOdds: 1.9,
    drawOdds: 3.4,
    awayOdds: 3.6
  },
  {
    id: "m_3",
    homeTeam: "ארצות הברית",
    awayTeam: "יפן",
    homeFlag: "https://flagcdn.com/w160/us.png",
    awayFlag: "https://flagcdn.com/w160/jp.png",
    status: "SCHEDULED",
    utcDate: "2026-06-12T23:00:00Z",
    homeScore: null,
    awayScore: null,
    stage: "שלב הבתים - בית ד'",
    homeOdds: 1.8,
    drawOdds: 3.5,
    awayOdds: 3.9
  },
  {
    id: "m_4",
    homeTeam: "ארגנטינה",
    awayTeam: "צרפת",
    homeFlag: "https://flagcdn.com/w160/ar.png",
    awayFlag: "https://flagcdn.com/w160/fr.png",
    status: "SCHEDULED",
    utcDate: "2026-06-13T21:00:00Z",
    homeScore: null,
    awayScore: null,
    stage: "שלב הבתים - בית ג' (משחק ענק)",
    homeOdds: 2.2,
    drawOdds: 3.1,
    awayOdds: 2.9
  },
  {
    id: "m_5",
    homeTeam: "ברזיל",
    awayTeam: "גרמניה",
    homeFlag: "https://flagcdn.com/w160/br.png",
    awayFlag: "https://flagcdn.com/w160/de.png",
    status: "SCHEDULED",
    utcDate: "2026-06-14T18:00:00Z",
    homeScore: null,
    awayScore: null,
    stage: "שלב הבתים - בית ה' (קלאסיקו עולמי)",
    homeOdds: 2.0,
    drawOdds: 3.3,
    awayOdds: 3.2
  },
  {
    id: "m_6",
    homeTeam: "ספרד",
    awayTeam: "קרואטיה",
    homeFlag: "https://flagcdn.com/w160/es.png",
    awayFlag: "https://flagcdn.com/w160/hr.png",
    status: "SCHEDULED",
    utcDate: "2026-06-14T21:00:00Z",
    homeScore: null,
    awayScore: null,
    stage: "שלב הבתים - בית ו'",
    homeOdds: 1.75,
    drawOdds: 3.5,
    awayOdds: 4.2
  },
  {
    id: "m_7",
    homeTeam: "אנגליה",
    awayTeam: "אורוגוואי",
    homeFlag: "https://flagcdn.com/w160/gb-eng.png",
    awayFlag: "https://flagcdn.com/w160/uy.png",
    status: "SCHEDULED",
    utcDate: "2026-06-15T19:00:00Z",
    homeScore: null,
    awayScore: null,
    stage: "שלב הבתים - בית ז'",
    homeOdds: 1.85,
    drawOdds: 3.3,
    awayOdds: 3.8
  },
  {
    id: "m_8",
    homeTeam: "פורטוגל",
    awayTeam: "בלגיה",
    homeFlag: "https://flagcdn.com/w160/pt.png",
    awayFlag: "https://flagcdn.com/w160/be.png",
    status: "SCHEDULED",
    utcDate: "2026-06-15T22:00:00Z",
    homeScore: null,
    awayScore: null,
    stage: "שלב הבתים - בית ח'",
    homeOdds: 2.1,
    drawOdds: 3.2,
    awayOdds: 3.0
  }
];

const payload = JSON.stringify(realMatches);
const parsedUrl = new URL(CLOUD_DB_URL);

const options = {
  hostname: parsedUrl.hostname,
  port: 443,
  path: parsedUrl.pathname + parsedUrl.search,
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

console.log("Updating live Firebase database with official 2026 World Cup opening matches...");

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log("Firebase matches updated successfully! ✅");
      process.exit(0);
    } else {
      console.error(`Failed to update Firebase matches: Status ${res.statusCode}`, body);
      process.exit(1);
    }
  });
});

req.on('error', (e) => {
  console.error("Error connecting to Firebase:", e.message);
  process.exit(1);
});

req.write(payload);
req.end();
