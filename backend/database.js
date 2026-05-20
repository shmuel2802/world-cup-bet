const fs = require('fs');
const path = require('path');
const https = require('https');

const DB_PATH = path.join(__dirname, 'db.json');

// Check if we have a cloud database URL configured
const CLOUD_DB_URL = process.env.CLOUD_DB_URL;

let inMemoryData = null;

// Initialize the database with seed data if it doesn't exist
function getSeedData() {
  const seedData = {
    users: [
      {
        id: "admin-id",
        username: "admin",
        passwordHash: "$2a$10$tM2e2x18Nis5gB7J8wepd.sZ0.y6vG/yq/FszrL7tK7C4p3zZ0a9u", // admin123
        isAdmin: true,
        balance: 1000,
        winRate: 0,
        totalBets: 0
      },
      {
        id: "player1-id",
        username: "יוסי",
        passwordHash: "$2a$10$tM2e2x18Nis5gB7J8wepd.sZ0.y6vG/yq/FszrL7tK7C4p3zZ0a9u", // admin123
        isAdmin: false,
        balance: 1100,
        winRate: 100,
        totalBets: 1
      },
      {
        id: "player2-id",
        username: "אבי",
        passwordHash: "$2a$10$tM2e2x18Nis5gB7J8wepd.sZ0.y6vG/yq/FszrL7tK7C4p3zZ0a9u", // admin123
        isAdmin: false,
        balance: 950,
        winRate: 0,
        totalBets: 1
      }
    ],
    matches: [
      {
        id: "m_1",
        homeTeam: "ארגנטינה",
        awayTeam: "צרפת",
        homeFlag: "https://flagcdn.com/w160/ar.png",
        awayFlag: "https://flagcdn.com/w160/fr.png",
        status: "SCHEDULED",
        utcDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        homeScore: null,
        awayScore: null,
        stage: "שלב הבתים - בית א'",
        homeOdds: 2.1,
        drawOdds: 3.4,
        awayOdds: 2.9
      },
      {
        id: "m_2",
        homeTeam: "ברזיל",
        awayTeam: "גרמניה",
        homeFlag: "https://flagcdn.com/w160/br.png",
        awayFlag: "https://flagcdn.com/w160/de.png",
        status: "SCHEDULED",
        utcDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        homeScore: null,
        awayScore: null,
        stage: "שלב הבתים - בית א'",
        homeOdds: 1.85,
        drawOdds: 3.6,
        awayOdds: 3.5
      },
      {
        id: "m_3",
        homeTeam: "אנגליה",
        awayTeam: "איטליה",
        homeFlag: "https://flagcdn.com/w160/gb-eng.png",
        awayFlag: "https://flagcdn.com/w160/it.png",
        status: "SCHEDULED",
        utcDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        homeScore: null,
        awayScore: null,
        stage: "שלב הבתים - בית ב'",
        homeOdds: 2.2,
        drawOdds: 3.1,
        awayOdds: 3.0
      },
      {
        id: "m_4",
        homeTeam: "ספרד",
        awayTeam: "פורטוגל",
        homeFlag: "https://flagcdn.com/w160/es.png",
        awayFlag: "https://flagcdn.com/w160/pt.png",
        status: "SCHEDULED",
        utcDate: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        homeScore: null,
        awayScore: null,
        stage: "שלב הבתים - בית ב'",
        homeOdds: 2.3,
        drawOdds: 3.25,
        awayOdds: 2.8
      },
      {
        id: "m_5",
        homeTeam: "הולנד",
        awayTeam: "אורוגוואי",
        homeFlag: "https://flagcdn.com/w160/nl.png",
        awayFlag: "https://flagcdn.com/w160/uy.png",
        status: "FINISHED",
        utcDate: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        homeScore: 3,
        awayScore: 2,
        stage: "משחק ידידות הכנה",
        homeOdds: 2.0,
        drawOdds: 3.3,
        awayOdds: 3.2
      }
    ],
    bets: [
      {
        id: "b_1",
        userId: "player1-id",
        username: "יוסי",
        matchId: "m_5",
        betType: "HOME",
        predictedHomeScore: null,
        predictedAwayScore: null,
        amount: 100,
        status: "WON",
        payout: 200,
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()
      },
      {
        id: "b_2",
        userId: "player2-id",
        username: "אבי",
        matchId: "m_5",
        betType: "EXACT_SCORE",
        predictedHomeScore: 2,
        predictedAwayScore: 1,
        amount: 50,
        status: "LOST",
        payout: 0,
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()
      }
    ],
    settings: {
      registrationEnabled: true,
      startingBalance: 1000,
      footballApiKey: ""
    }
  };
  return seedData;
}

// Synchronous HTTPS get request to load database on startup (if cloud is configured)
function loadCloudDbSync() {
  if (!CLOUD_DB_URL) return null;
  
  console.log("Attempting to load persistent database from Cloud URL...");
  
  // Note: Since Node 18+, we can use synchrounous-like behavior or load on startup in a block.
  // To avoid blocking, we do a quick synchronous check or run a worker.
  // Actually, standard practice in Node.js for loading cloud config at startup is a simple request.
  // Since we want this to be extremely robust, we use a simple child_process or a blocking request, or we just do it asynchronously and buffer requests until loaded.
  // However, a simple execSync curl command is extremely robust and 100% synchronous on Windows and Linux!
  try {
    const execSync = require('child_process').execSync;
    const response = execSync(`curl -s "${CLOUD_DB_URL}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(response);
    if (parsed && parsed.users && parsed.matches) {
      console.log("Successfully loaded database from Cloud! ✅");
      return parsed;
    }
  } catch (error) {
    console.error("Failed to load DB from Cloud, falling back to local file:", error.message);
  }
  return null;
}

// Asynchronously save database to the cloud in the background (does not block the Express response!)
function saveCloudDbAsync(data) {
  if (!CLOUD_DB_URL) return;
  
  const payload = JSON.stringify(data);
  const parsedUrl = new URL(CLOUD_DB_URL);
  
  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || 443,
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'PUT', // standard for updating full JSON in Firebase/REST
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const req = https.request(options, (res) => {
    res.on('data', () => {}); // consume response
    res.on('end', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log("Cloud Database backup synced successfully! ☁️✅");
      } else {
        console.error(`Failed to sync Cloud Database: Status Code ${res.statusCode}`);
      }
    });
  });

  req.on('error', (e) => {
    console.error("Error backing up database to the cloud:", e.message);
  });

  req.write(payload);
  req.end();
}

function initDb() {
  if (inMemoryData) return;

  // Try to load from cloud first
  const cloudData = loadCloudDbSync();
  if (cloudData) {
    inMemoryData = cloudData;
    // Write a local copy as backup
    fs.writeFileSync(DB_PATH, JSON.stringify(inMemoryData, null, 2), 'utf8');
    return;
  }

  // Fallback to local file
  if (fs.existsSync(DB_PATH)) {
    try {
      const fileData = fs.readFileSync(DB_PATH, 'utf8');
      inMemoryData = JSON.parse(fileData);
      console.log("Loaded database from local db.json. 📂");
      return;
    } catch (e) {
      console.error("Error reading local db.json, generating seed data.");
    }
  }

  // Fallback to seeds
  inMemoryData = getSeedData();
  fs.writeFileSync(DB_PATH, JSON.stringify(inMemoryData, null, 2), 'utf8');
  console.log("Created new local db.json with seed data. 🌱");
}

// Read database contents
function readDb() {
  initDb();
  return inMemoryData;
}

// Write data to database
function writeDb(data) {
  inMemoryData = data;
  // Save locally as backup
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  // Sync to cloud asynchronously
  saveCloudDbAsync(data);
}

// Query helper functions
const db = {
  getUsers: () => readDb().users,
  getUserById: (id) => readDb().users.find(u => u.id === id),
  getUserByUsername: (username) => readDb().users.find(u => u.username.toLowerCase() === username.toLowerCase()),
  saveUser: (user) => {
    const data = readDb();
    const index = data.users.findIndex(u => u.id === user.id);
    if (index !== -1) {
      data.users[index] = user;
    } else {
      data.users.push(user);
    }
    writeDb(data);
    return user;
  },

  getMatches: () => readDb().matches,
  getMatchById: (id) => readDb().matches.find(m => m.id === id),
  saveMatch: (match) => {
    const data = readDb();
    const index = data.matches.findIndex(m => m.id === match.id);
    if (index !== -1) {
      data.matches[index] = match;
    } else {
      data.matches.push(match);
    }
    writeDb(data);
    return match;
  },
  saveMatchesBatch: (matchesArray) => {
    const data = readDb();
    matchesArray.forEach(newMatch => {
      const index = data.matches.findIndex(m => m.id === newMatch.id);
      if (index !== -1) {
        data.matches[index] = { ...data.matches[index], ...newMatch };
      } else {
        data.matches.push(newMatch);
      }
    });
    writeDb(data);
  },

  getBets: () => readDb().bets,
  getBetsByUserId: (userId) => readDb().bets.filter(b => b.userId === userId),
  getBetsByMatchId: (matchId) => readDb().bets.filter(b => b.matchId === matchId),
  saveBet: (bet) => {
    const data = readDb();
    const index = data.bets.findIndex(b => b.id === bet.id);
    if (index !== -1) {
      data.bets[index] = bet;
    } else {
      data.bets.push(bet);
    }
    writeDb(data);
    return bet;
  },

  getSettings: () => readDb().settings,
  saveSettings: (settings) => {
    const data = readDb();
    data.settings = { ...data.settings, ...settings };
    writeDb(data);
    return data.settings;
  }
};

module.exports = db;
