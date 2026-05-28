const fs = require("fs");
const path = require("path");
const https = require("https");

const DB_PATH = path.join(__dirname, "db.json");

// Check if we have a cloud database URL configured
const CLOUD_DB_URL = process.env.CLOUD_DB_URL;

let inMemoryData = null;
const DEFAULT_ADMIN_PASSWORD_HASH =
  "$2b$10$iR2ouc9cGsSEWpU7qBVX1e/Ptl5Q4IMFLiVSZ8rNdyiP7O9KgkTZ."; // admin123
const DEFAULT_BET_SETTINGS = {
  registrationEnabled: true,
  startingBalance: 1000,
  betMin: 10,
  betMax: 500,
  quickAmounts: [50, 100, 200, 500],
  footballApiKey:
    process.env.FOOTBALL_API_KEY || process.env.API_FOOTBALL_API_KEY || "",
};

const DEFAULT_WORLD_CUP_TEAMS = [
  {
    id: "argentina",
    name: "Argentina",
    flag: "https://flagcdn.com/w160/ar.png",
  },
  { id: "brazil", name: "Brazil", flag: "https://flagcdn.com/w160/br.png" },
  { id: "france", name: "France", flag: "https://flagcdn.com/w160/fr.png" },
  {
    id: "england",
    name: "England",
    flag: "https://flagcdn.com/w160/gb-eng.png",
  },
  { id: "portugal", name: "Portugal", flag: "https://flagcdn.com/w160/pt.png" },
  { id: "spain", name: "Spain", flag: "https://flagcdn.com/w160/es.png" },
  { id: "belgium", name: "Belgium", flag: "https://flagcdn.com/w160/be.png" },
  {
    id: "netherlands",
    name: "Netherlands",
    flag: "https://flagcdn.com/w160/nl.png",
  },
  { id: "croatia", name: "Croatia", flag: "https://flagcdn.com/w160/hr.png" },
  { id: "morocco", name: "Morocco", flag: "https://flagcdn.com/w160/ma.png" },
  { id: "japan", name: "Japan", flag: "https://flagcdn.com/w160/jp.png" },
  { id: "usa", name: "USA", flag: "https://flagcdn.com/w160/us.png" },
  {
    id: "australia",
    name: "Australia",
    flag: "https://flagcdn.com/w160/au.png",
  },
  { id: "senegal", name: "Senegal", flag: "https://flagcdn.com/w160/sn.png" },
];

const DEFAULT_WORLD_CUP_PLAYERS = [
  { id: "messi", name: "Lionel Messi", team: "Argentina", position: "Forward" },
  {
    id: "lautaro",
    name: "Lautaro Martínez",
    team: "Argentina",
    position: "Forward",
  },
  {
    id: "depaul",
    name: "Rodrigo De Paul",
    team: "Argentina",
    position: "Midfielder",
  },
  { id: "neymar", name: "Neymar Jr.", team: "Brazil", position: "Forward" },
  {
    id: "vinicius",
    name: "Vinícius Júnior",
    team: "Brazil",
    position: "Forward",
  },
  { id: "casemiro", name: "Casemiro", team: "Brazil", position: "Midfielder" },
  { id: "mbappe", name: "Kylian Mbappé", team: "France", position: "Forward" },
  {
    id: "griezmann",
    name: "Antoine Griezmann",
    team: "France",
    position: "Forward",
  },
  { id: "pogba", name: "Paul Pogba", team: "France", position: "Midfielder" },
  { id: "kane", name: "Harry Kane", team: "England", position: "Forward" },
  {
    id: "sterling",
    name: "Raheem Sterling",
    team: "England",
    position: "Forward",
  },
  { id: "stones", name: "John Stones", team: "England", position: "Defender" },
  {
    id: "ronaldo",
    name: "Cristiano Ronaldo",
    team: "Portugal",
    position: "Forward",
  },
  {
    id: "bruno",
    name: "Bruno Fernandes",
    team: "Portugal",
    position: "Midfielder",
  },
  {
    id: "bernardo",
    name: "Bernardo Silva",
    team: "Portugal",
    position: "Midfielder",
  },
  { id: "ferran", name: "Ferran Torres", team: "Spain", position: "Forward" },
  { id: "pedri", name: "Pedri", team: "Spain", position: "Midfielder" },
  {
    id: "debruyne",
    name: "Kevin De Bruyne",
    team: "Belgium",
    position: "Midfielder",
  },
  { id: "hazard", name: "Eden Hazard", team: "Belgium", position: "Forward" },
  { id: "lukaku", name: "Romelu Lukaku", team: "Belgium", position: "Forward" },
  {
    id: "depay",
    name: "Memphis Depay",
    team: "Netherlands",
    position: "Forward",
  },
  {
    id: "vandijk",
    name: "Virgil van Dijk",
    team: "Netherlands",
    position: "Defender",
  },
  {
    id: "modric",
    name: "Luka Modrić",
    team: "Croatia",
    position: "Midfielder",
  },
  {
    id: "hakimi",
    name: "Achraf Hakimi",
    team: "Morocco",
    position: "Defender",
  },
  { id: "saka", name: "Bukayo Saka", team: "England", position: "Forward" },
  { id: "kubo", name: "Takefusa Kubo", team: "Japan", position: "Midfielder" },
  {
    id: "pulisic",
    name: "Christian Pulisic",
    team: "USA",
    position: "Forward",
  },
  {
    id: "leckie",
    name: "Mathew Leckie",
    team: "Australia",
    position: "Forward",
  },
  { id: "mane", name: "Sadio Mané", team: "Senegal", position: "Forward" },
];

// Initialize the database with seed data if it doesn't exist
function getSeedData() {
  const seedData = {
    users: [
      {
        id: "admin-id",
        username: "admin",
        passwordHash:
          "$2a$10$tM2e2x18Nis5gB7J8wepd.sZ0.y6vG/yq/FszrL7tK7C4p3zZ0a9u", // admin123
        isAdmin: true,
        balance: 1000,
        winRate: 0,
        totalBets: 0,
      },
      {
        id: "player1-id",
        username: "יוסי",
        passwordHash:
          "$2a$10$tM2e2x18Nis5gB7J8wepd.sZ0.y6vG/yq/FszrL7tK7C4p3zZ0a9u", // admin123
        isAdmin: false,
        balance: 1100,
        winRate: 100,
        totalBets: 1,
      },
      {
        id: "player2-id",
        username: "אבי",
        passwordHash:
          "$2a$10$tM2e2x18Nis5gB7J8wepd.sZ0.y6vG/yq/FszrL7tK7C4p3zZ0a9u", // admin123
        isAdmin: false,
        balance: 950,
        winRate: 0,
        totalBets: 1,
      },
    ],
    matches: [],
    bets: [],
    settings: {
      ...DEFAULT_BET_SETTINGS,
    },
    worldCupTeams: DEFAULT_WORLD_CUP_TEAMS,
    worldCupPlayers: DEFAULT_WORLD_CUP_PLAYERS,
    predictions: [],
  };
  return seedData;
}

function ensureSystemData(data) {
  if (!data || typeof data !== "object") return getSeedData();

  if (!Array.isArray(data.users)) data.users = [];
  if (!Array.isArray(data.matches)) data.matches = [];
  if (!Array.isArray(data.bets)) data.bets = [];
  if (!Array.isArray(data.worldCupTeams))
    data.worldCupTeams = DEFAULT_WORLD_CUP_TEAMS;
  if (!Array.isArray(data.worldCupPlayers))
    data.worldCupPlayers = DEFAULT_WORLD_CUP_PLAYERS;
  if (!Array.isArray(data.predictions)) data.predictions = [];
  if (!data.settings || typeof data.settings !== "object") {
    data.settings = {};
  }

  data.settings = {
    ...DEFAULT_BET_SETTINGS,
    ...data.settings,
  };

  const hasAdmin = data.users.some(
    (u) =>
      typeof u?.username === "string" && u.username.toLowerCase() === "admin",
  );

  if (!hasAdmin) {
    data.users.push({
      id: "admin-id",
      username: "admin",
      passwordHash: DEFAULT_ADMIN_PASSWORD_HASH, // admin123
      isAdmin: true,
      balance: 1000,
      winRate: 0,
      totalBets: 0,
    });
  } else {
    const adminIndex = data.users.findIndex(
      (u) =>
        typeof u?.username === "string" && u.username.toLowerCase() === "admin",
    );
    const existingAdmin = data.users[adminIndex] || {};
    data.users[adminIndex] = {
      id: existingAdmin.id || "admin-id",
      username: "admin",
      passwordHash: DEFAULT_ADMIN_PASSWORD_HASH, // admin123
      isAdmin: true,
      balance:
        typeof existingAdmin.balance === "number"
          ? existingAdmin.balance
          : 1000,
      winRate:
        typeof existingAdmin.winRate === "number" ? existingAdmin.winRate : 0,
      totalBets:
        typeof existingAdmin.totalBets === "number"
          ? existingAdmin.totalBets
          : 0,
    };
  }

  return data;
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
    const execSync = require("child_process").execSync;
    const response = execSync(`curl -s "${CLOUD_DB_URL}"`, {
      encoding: "utf8",
    });
    const parsed = JSON.parse(response);
    if (parsed && parsed.users && parsed.matches) {
      console.log("Successfully loaded database from Cloud! ✅");
      return parsed;
    }
  } catch (error) {
    console.error(
      "Failed to load DB from Cloud, falling back to local file:",
      error.message,
    );
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
    method: "PUT", // standard for updating full JSON in Firebase/REST
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    },
  };

  const req = https.request(options, (res) => {
    res.on("data", () => {}); // consume response
    res.on("end", () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log("Cloud Database backup synced successfully! ☁️✅");
      } else {
        console.error(
          `Failed to sync Cloud Database: Status Code ${res.statusCode}`,
        );
      }
    });
  });

  req.on("error", (e) => {
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
    inMemoryData = ensureSystemData(cloudData);
    // Write a local copy as backup
    fs.writeFileSync(DB_PATH, JSON.stringify(inMemoryData, null, 2), "utf8");
    return;
  }

  // Fallback to local file
  if (fs.existsSync(DB_PATH)) {
    try {
      const fileData = fs.readFileSync(DB_PATH, "utf8");
      inMemoryData = ensureSystemData(JSON.parse(fileData));
      console.log("Loaded database from local db.json. 📂");
      return;
    } catch (e) {
      console.error("Error reading local db.json, generating seed data.");
    }
  }

  // Fallback to seeds
  inMemoryData = ensureSystemData(getSeedData());
  fs.writeFileSync(DB_PATH, JSON.stringify(inMemoryData, null, 2), "utf8");
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
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
  // Sync to cloud asynchronously
  saveCloudDbAsync(data);
}

// Query helper functions
const db = {
  getUsers: () => readDb().users,
  getUserById: (id) => readDb().users.find((u) => u.id === id),
  getUserByUsername: (username) =>
    readDb().users.find(
      (u) => u.username.toLowerCase() === username.toLowerCase(),
    ),
  saveUser: (user) => {
    const data = readDb();
    const index = data.users.findIndex((u) => u.id === user.id);
    if (index !== -1) {
      data.users[index] = user;
    } else {
      data.users.push(user);
    }
    writeDb(data);
    return user;
  },

  deleteUser: (userId) => {
    const data = readDb();
    const index = data.users.findIndex((u) => u.id === userId);
    if (index === -1) return false;

    data.users.splice(index, 1);
    data.bets = data.bets.filter((b) => b.userId !== userId);
    data.predictions = data.predictions.filter((p) => p.userId !== userId);
    writeDb(data);
    return true;
  },

  getMatches: () => readDb().matches,
  getMatchById: (id) => readDb().matches.find((m) => m.id === id),
  saveMatch: (match) => {
    const data = readDb();
    const index = data.matches.findIndex((m) => m.id === match.id);
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
    matchesArray.forEach((newMatch) => {
      const index = data.matches.findIndex((m) => m.id === newMatch.id);
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
  getBetsByUserId: (userId) => readDb().bets.filter((b) => b.userId === userId),
  getBetsByMatchId: (matchId) =>
    readDb().bets.filter((b) => b.matchId === matchId),
  saveBet: (bet) => {
    const data = readDb();
    const index = data.bets.findIndex((b) => b.id === bet.id);
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
  },

  getTeams: () => readDb().worldCupTeams,
  getPlayers: () => readDb().worldCupPlayers,
  getPredictions: () => readDb().predictions,
  getPredictionByUserId: (userId) =>
    readDb().predictions.find((p) => p.userId === userId),
  savePrediction: (prediction) => {
    const data = readDb();
    const index = data.predictions.findIndex(
      (p) => p.userId === prediction.userId,
    );
    if (index !== -1) {
      data.predictions[index] = {
        ...data.predictions[index],
        ...prediction,
        updatedAt: new Date().toISOString(),
      };
    } else {
      data.predictions.push({
        ...prediction,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    writeDb(data);
    return prediction;
  },
  readDb: () => readDb(),
};

module.exports = db;
