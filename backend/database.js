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
    matches: [],
    bets: [],
    settings: {
      registrationEnabled: true,
      startingBalance: 1000,
      footballApiKey: process.env.FOOTBALL_API_KEY || ""
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
  replaceMatches: (matchesArray) => {
    const data = readDb();
    data.matches = Array.isArray(matchesArray) ? matchesArray : [];
    writeDb(data);
    return data.matches;
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
