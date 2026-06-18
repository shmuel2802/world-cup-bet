const fs = require("fs");
const path = require("path");
const https = require("https");

const DB_PATH = path.join(__dirname, "db.json");

// Check if we have a cloud database URL configured
const CLOUD_DB_URL = process.env.CLOUD_DB_URL;

let inMemoryData = null;
const DEFAULT_ADMIN_PASSWORD_HASH =
  "$2b$10$jRGgvT5uxNcJjwL38z/FA.QF8gW4hKTmzJo6CazrsBuCsA1HRwthS"; // admin123 בפורמט $2b$
// Initialize the database with seed data if it doesn't exist
function getSeedData() {
  const seedData = {
    users: [
      {
        id: "admin-id",
        username: "admin",
        passwordHash: DEFAULT_ADMIN_PASSWORD_HASH,
        isAdmin: true,
        balance: 0,
        winRate: 0,
        totalBets: 0,
      },
    ],
    matches: [],
    bets: [],
    settings: {
      registrationEnabled: true,
      startingBalance: 0,
      footballApiKey: process.env.FOOTBALL_API_KEY || "",
    },
  };
  return seedData;
}

function ensureSystemData(data) {
  if (!data || typeof data !== "object") return getSeedData();

  if (!Array.isArray(data.users)) data.users = [];
  if (!Array.isArray(data.matches)) data.matches = [];
  data.matches = data.matches.map((match) => ({
    ...match,
    currentMinute: match.currentMinute !== undefined ? match.currentMinute : null,
    scorers: match.scorers || [],
  }));
  if (!Array.isArray(data.bets)) data.bets = [];
  if (!Array.isArray(data.worldCupTeams)) data.worldCupTeams = [];
  if (!Array.isArray(data.worldCupPlayers)) data.worldCupPlayers = [];
  if (!Array.isArray(data.longTermPredictions)) data.longTermPredictions = [];
  if (!data.settings || typeof data.settings !== "object") {
    data.settings = {};
  }

  data.settings = {
    ...data.settings,
    registrationEnabled: data.settings.registrationEnabled ?? true,
    startingBalance: 0,
    footballApiKey:
      data.settings.footballApiKey || process.env.FOOTBALL_API_KEY || "",
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
      balance: 0,
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
        typeof existingAdmin.balance === "number" ? existingAdmin.balance : 0,
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
  deleteUser: (userId) => {
    const data = readDb();
    const userIndex = data.users.findIndex((u) => u.id === userId);
    if (userIndex === -1) return false;
    data.users.splice(userIndex, 1);
    data.bets = data.bets.filter((b) => b.userId !== userId);
    data.longTermPredictions = data.longTermPredictions.filter(
      (p) => p.userId !== userId,
    );
    writeDb(data);
    return true;
  },
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

  // New function to update user balance directly
  updateUserBalance: (userId, newBalance) => {
    const data = readDb();
    const user = data.users.find((u) => u.id === userId);
    if (user) {
      user.balance = newBalance;
      writeDb(data);
      return user;
    }
    return null;
  },

  // New function to update user admin status
  updateUserAdminStatus: (userId, isAdmin) => {
    const data = readDb();
    const user = data.users.find((u) => u.id === userId);
    if (user) {
      user.isAdmin = isAdmin;
      writeDb(data);
      return user;
    }
    return null;
  },

  getMatches: () => readDb().matches,
  getMatchById: (id) => readDb().matches.find((m) => m.id === id),
  saveMatch: (match) => {
    const data = readDb();
    const index = data.matches.findIndex((m) => m.id === match.id);
    const updatedMatch = {
      ...match,
      currentMinute: match.currentMinute !== undefined ? match.currentMinute : null,
      scorers: match.scorers || [],
    };
    if (index !== -1) {
      data.matches[index] = updatedMatch;
    } else {
      data.matches.push(updatedMatch);
    }
    writeDb(data);
    return updatedMatch;
  },
  saveMatchesBatch: (matchesArray) => {
    const data = readDb();
    matchesArray.forEach((newMatch) => {
      const index = data.matches.findIndex((m) => m.id === newMatch.id);
      const updatedMatch = {
        ...newMatch,
        currentMinute: newMatch.currentMinute !== undefined ? newMatch.currentMinute : null,
        scorers: newMatch.scorers || [],
      };
      if (index !== -1) {
        data.matches[index] = { ...data.matches[index], ...updatedMatch };
      } else {
        data.matches.push(updatedMatch);
      }
    });
    writeDb(data);
  },
  replaceMatches: (matchesArray) => {
    const data = readDb();
    const existingMatches = data.matches || [];

    // Preserve custom matches (IDs not starting with "real_")
    const customMatches = existingMatches.filter((m) => !m.id.startsWith("real_"));

    // Merge real matches from API
    const updatedRealMatches = (Array.isArray(matchesArray) ? matchesArray : []).map((apiMatch) => {
      const existing = existingMatches.find((m) => m.id === apiMatch.id);
      if (existing) {
        return {
          ...apiMatch,
          // Preserve currentMinute if database has a value and API has null
          currentMinute: (apiMatch.currentMinute !== null && apiMatch.currentMinute !== undefined)
            ? apiMatch.currentMinute
            : (existing.currentMinute !== undefined ? existing.currentMinute : null),
          // Preserve scorers if database has them and API has none
          scorers: (apiMatch.scorers && apiMatch.scorers.length > 0)
            ? apiMatch.scorers
            : (existing.scorers || []),
        };
      }
      return {
        ...apiMatch,
        currentMinute: apiMatch.currentMinute !== undefined ? apiMatch.currentMinute : null,
        scorers: apiMatch.scorers || [],
      };
    });

    data.matches = [...customMatches, ...updatedRealMatches];
    writeDb(data);
    return data.matches;
  },

  getBets: () => readDb().bets,
  // New function to get all users, potentially excluding admin for some views
  getAllUsers: () => readDb().users.filter((u) => !u.isAdmin),
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
  deleteBet: (id) => {
    const data = readDb();
    const index = data.bets.findIndex((b) => b.id === id);
    if (index !== -1) {
      data.bets.splice(index, 1);
      writeDb(data);
      return true;
    }
    return false;
  },

  getWorldCupTeams: () => readDb().worldCupTeams || [],
  saveWorldCupTeamsBatch: (teamsArray) => {
    const data = readDb();
    if (!data.worldCupTeams) data.worldCupTeams = [];
    teamsArray.forEach((newTeam) => {
      const index = data.worldCupTeams.findIndex((t) => t.id === newTeam.id);
      if (index !== -1) {
        data.worldCupTeams[index] = {
          ...data.worldCupTeams[index],
          ...newTeam,
        };
      } else {
        data.worldCupTeams.push(newTeam);
      }
    });
    writeDb(data);
  },

  getWorldCupPlayers: () => readDb().worldCupPlayers || [],
  saveWorldCupPlayersBatch: (playersArray) => {
    const data = readDb();
    if (!data.worldCupPlayers) data.worldCupPlayers = [];
    playersArray.forEach((newPlayer) => {
      const index = data.worldCupPlayers.findIndex(
        (p) => p.id === newPlayer.id,
      );
      if (index !== -1) {
        data.worldCupPlayers[index] = {
          ...data.worldCupPlayers[index],
          ...newPlayer,
        };
      } else {
        data.worldCupPlayers.push(newPlayer);
      }
    });
    writeDb(data);
  },

  getLongTermPredictionByUserId: (userId) => {
    return (
      readDb().longTermPredictions?.find((p) => p.userId === userId) || null
    );
  },
  saveLongTermPrediction: (prediction) => {
    const data = readDb();
    if (!data.longTermPredictions) data.longTermPredictions = [];
    const index = data.longTermPredictions.findIndex(
      (p) => p.userId === prediction.userId,
    );
    if (index !== -1) {
      data.longTermPredictions[index] = prediction;
    } else {
      data.longTermPredictions.push(prediction);
    }
    writeDb(data);
    return prediction;
  },

  getSettings: () => readDb().settings,
  saveSettings: (settings) => {
    const data = readDb();
    data.settings = { ...data.settings, ...settings };
    writeDb(data);
    return data.settings;
  },
};

module.exports = db;
