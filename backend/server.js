const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const db = require("./database");
const FootballApiService = require("./apiService");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET =
  process.env.JWT_SECRET || "world_cup_betting_secret_key_2026_!";

app.use(cors());
app.use(express.json());

const apiService = new FootballApiService(db);

// --- JWT AUTHENTICATION MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token)
    return res.status(401).json({ message: "Token missing. Please log in." });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err)
      return res
        .status(403)
        .json({ message: "Session expired. Please log in again." });
    req.user = user;
    next();
  });
};

// Admin protection middleware
const requireAdmin = (req, res, next) => {
  authenticateToken(req, res, () => {
    const user = db.getUserById(req.user.id);
    if (!user || !user.isAdmin) {
      return res
        .status(403)
        .json({ message: "Access denied. Admin rights required." });
    }
    next();
  });
};

// --- AUTH ROUTES ---

// Register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "Username and password are required." });
    }

    if (username.length < 2) {
      return res
        .status(400)
        .json({ message: "Username must be at least 2 characters." });
    }

    const existingUser = db.getUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ message: "Username is already taken." });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = {
      id: "u_" + Math.random().toString(36).substr(2, 9),
      username: username.trim(),
      passwordHash,
      isAdmin: false,
      balance: db.getSettings().startingBalance || 1000,
      winRate: 0,
      totalBets: 0,
    };

    db.saveUser(newUser);

    const token = jwt.sign(
      { id: newUser.id, username: newUser.username, isAdmin: newUser.isAdmin },
      JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.status(201).json({
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        isAdmin: newUser.isAdmin,
        balance: newUser.balance,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Server error during registration.",
      error: error.message,
    });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "Username and password are required." });
    }

    const user = db.getUserByUsername(username);
    if (!user) {
      return res.status(400).json({ message: "Invalid username or password." });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid username or password." });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, isAdmin: user.isAdmin },
      JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        balance: user.balance,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error during login.", error: error.message });
  }
});

// Get profile
app.get("/api/auth/me", authenticateToken, (req, res) => {
  const user = db.getUserById(req.user.id);
  if (!user) return res.status(404).json({ message: "User not found." });

  res.json({
    id: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    balance: user.balance,
    winRate: user.winRate,
    totalBets: user.totalBets,
  });
});

// --- MATCHES ROUTES ---

// Get all matches with user's bets populated
app.get("/api/matches", authenticateToken, (req, res) => {
  const matches = db.getMatches();
  const userBets = db.getBetsByUserId(req.user.id);

  // Map matches to include the user's bet if it exists
  const matchesWithBets = matches.map((match) => {
    const userBet = userBets.find((b) => b.matchId === match.id);
    return {
      ...match,
      myBet: userBet
        ? {
            id: userBet.id,
            betType: userBet.betType,
            predictedHomeScore: userBet.predictedHomeScore,
            predictedAwayScore: userBet.predictedAwayScore,
            amount: userBet.amount,
            status: userBet.status,
            payout: userBet.payout,
          }
        : null,
    };
  });

  res.json(matchesWithBets);
});

// --- BETS ROUTES ---

// Get all bets for current user
app.get("/api/bets", authenticateToken, (req, res) => {
  const userBets = db.getBetsByUserId(req.user.id);
  const matches = db.getMatches();

  const enrichedBets = userBets.map((bet) => {
    const match = matches.find((m) => m.id === bet.matchId);
    return {
      ...bet,
      match: match
        ? {
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            homeFlag: match.homeFlag,
            awayFlag: match.awayFlag,
            status: match.status,
            homeScore: match.homeScore,
            awayScore: match.awayScore,
            utcDate: match.utcDate,
          }
        : null,
    };
  });

  res.json(enrichedBets);
});

// Place a bet
app.post("/api/bets", authenticateToken, (req, res) => {
  const { matchId, betType, amount, predictedHomeScore, predictedAwayScore } =
    req.body;
  const userId = req.user.id;

  if (!matchId || !betType || !amount || amount <= 0) {
    return res
      .status(400)
      .json({ message: "Invalid bet details. Amount must be greater than 0." });
  }

  const match = db.getMatchById(matchId);
  if (!match) {
    return res.status(404).json({ message: "Match not found." });
  }

  // Check if match already started or finished
  if (match.status !== "SCHEDULED") {
    return res.status(400).json({
      message: "Cannot place bets. The match has already started or finished.",
    });
  }

  const now = new Date();
  if (now >= new Date(match.utcDate)) {
    return res
      .status(400)
      .json({ message: "Cannot place bets. The match is already in play." });
  }

  const user = db.getUserById(userId);
  if (user.balance < amount) {
    return res
      .status(400)
      .json({ message: "Insufficient balance. Place a smaller bet!" });
  }

  // Check if user already bet on this match
  const userBets = db.getBetsByUserId(userId);
  const existingBet = userBets.find((b) => b.matchId === matchId);
  if (existingBet) {
    return res
      .status(400)
      .json({ message: "You have already placed a bet on this match." });
  }

  // Deduct balance
  user.balance -= amount;
  db.saveUser(user);

  // Create Bet
  const newBet = {
    id: "b_" + Math.random().toString(36).substr(2, 9),
    userId,
    username: user.username,
    matchId,
    betType,
    predictedHomeScore:
      betType === "EXACT_SCORE" ? parseInt(predictedHomeScore) : null,
    predictedAwayScore:
      betType === "EXACT_SCORE" ? parseInt(predictedAwayScore) : null,
    amount: parseInt(amount),
    status: "PENDING",
    payout: 0,
    createdAt: new Date().toISOString(),
  };

  db.saveBet(newBet);

  res.status(201).json({
    message: "Bet placed successfully!",
    newBalance: user.balance,
    bet: newBet,
  });
});

// Update an existing bet before the match starts
app.put("/api/bets/:betId", authenticateToken, (req, res) => {
  const { betId } = req.params;
  const { betType, amount, predictedHomeScore, predictedAwayScore } = req.body;
  const userId = req.user.id;

  if (!betType || !amount || amount <= 0) {
    return res
      .status(400)
      .json({ message: "Invalid bet update details. Amount must be greater than 0." });
  }

  const existingBet = db.getBetById(betId);
  if (!existingBet || existingBet.userId !== userId) {
    return res.status(404).json({ message: "Bet not found." });
  }

  const match = db.getMatchById(existingBet.matchId);
  if (!match) {
    return res.status(404).json({ message: "Match not found." });
  }

  if (match.status !== "SCHEDULED" || new Date() >= new Date(match.utcDate)) {
    return res.status(400).json({
      message: "Cannot update bet. The match has already started or finished.",
    });
  }

  const user = db.getUserById(userId);
  const amountDelta = parseInt(amount, 10) - existingBet.amount;

  if (amountDelta > 0 && user.balance < amountDelta) {
    return res
      .status(400)
      .json({ message: "Insufficient balance to increase the bet amount." });
  }

  const updatedBet = {
    ...existingBet,
    betType,
    amount: parseInt(amount, 10),
    predictedHomeScore: betType === "EXACT_SCORE" ? parseInt(predictedHomeScore) : null,
    predictedAwayScore: betType === "EXACT_SCORE" ? parseInt(predictedAwayScore) : null,
    updatedAt: new Date().toISOString(),
  };

  user.balance -= amountDelta;
  db.saveUser(user);
  db.saveBet(updatedBet);

  res.json({
    message: "Bet updated successfully!",
    newBalance: user.balance,
    bet: updatedBet,
  });
});

// --- LEADERBOARD ROUTE ---

app.get("/api/leaderboard", authenticateToken, (req, res) => {
  const users = db.getUsers();

  // Sort users by balance descending, then winRate descending
  const rankedUsers = users
    .map((u) => ({
      id: u.id,
      username: u.username,
      balance: u.balance,
      winRate: u.winRate,
      totalBets: u.totalBets,
      isAdmin: u.isAdmin,
    }))
    .sort((a, b) => b.balance - a.balance || b.winRate - a.winRate);

  res.json(rankedUsers);
});

app.get("/api/settings", authenticateToken, (req, res) => {
  res.json(db.getSettings());
});

app.get("/api/predictions/options", authenticateToken, (req, res) => {
  res.json({
    teams: db.getTeams(),
    players: db.getPlayers(),
  });
});

app.get("/api/predictions", authenticateToken, (req, res) => {
  const prediction = db.getPredictionByUserId(req.user.id);
  res.json(prediction || { winnerTeam: null, topScorer: null });
});

app.post("/api/predictions", authenticateToken, (req, res) => {
  const { winnerTeam, topScorer } = req.body;
  const predictionLockDate = new Date("2026-06-11T00:00:00Z");

  if (new Date() >= predictionLockDate) {
    return res.status(403).json({
      message: "ניחושים נעולים מאז 11.6.26. לא ניתן לשנות את המניחושים.",
    });
  }

  if (!winnerTeam || !topScorer) {
    return res
      .status(400)
      .json({ message: "Winner team and top scorer must be selected." });
  }

  const updatedPrediction = db.savePrediction({
    userId: req.user.id,
    winnerTeam,
    topScorer,
    payoutMultiplier: 10,
  });

  res.json({
    message: "Prediction saved successfully!",
    prediction: updatedPrediction,

app.get("/api/admin/users", requireAdmin, (req, res) => {
  const users = db.getUsers().map((u) => ({
    id: u.id,
    username: u.username,
    balance: u.balance,
    winRate: u.winRate,
    totalBets: u.totalBets,
    isAdmin: u.isAdmin,
  }));
  res.json(users);
});

app.post("/api/admin/bet-settings", requireAdmin, (req, res) => {
  const { betMin, betMax, quickAmounts } = req.body;
  if (
    betMin === undefined ||
    betMax === undefined ||
    !Array.isArray(quickAmounts)
  ) {
    return res
      .status(400)
      .json({ message: "betMin, betMax and quickAmounts are required." });
  }

  const settings = db.saveSettings({
    betMin: parseInt(betMin, 10),
    betMax: parseInt(betMax, 10),
    quickAmounts: quickAmounts
      .map((value) => parseInt(value, 10))
      .filter((value) => !Number.isNaN(value) && value > 0),
  });

  res.json({ message: "Bet settings updated successfully!", settings });
});

// --- ADMIN ROUTES ---

// Sync matches from live external API
app.post("/api/admin/sync", requireAdmin, async (req, res) => {
  try {
    const manualScorers = Array.isArray(req.body?.manualScorers)
      ? req.body.manualScorers
      : [];

    const syncResult = await apiService.syncMatches({ manualScorers });
    if (!syncResult) {
      return res.status(500).json({
        message:
          "Could not sync matches. Check your FOOTBALL_API_KEY or the external API availability.",
      });
    }

    res.json({
      message: syncResult.success
        ? `Sync completed: ${syncResult.syncedMatches} matches and ${syncResult.scoredEntries} scorer records processed.`
        : "No updates fetched from the matches provider.",
      result: syncResult,
      matches: db.getMatches(),
      topScorers: db.getTopScorers(),
    });
  } catch (error) {
    res.status(500).json({ message: "Sync failed.", error: error.message });
  }
});

// Manually update match score (perfect for testing match payouts!)
app.post("/api/admin/match", requireAdmin, (req, res) => {
  const { matchId, homeScore, awayScore, status } = req.body;

  if (!matchId || status === undefined) {
    return res
      .status(400)
      .json({ message: "Match ID and status are required." });
  }

  const match = db.getMatchById(matchId);
  if (!match) return res.status(404).json({ message: "Match not found." });

  match.status = status; // SCHEDULED, LIVE, FINISHED
  match.homeScore =
    homeScore !== null && homeScore !== undefined ? parseInt(homeScore) : null;
  match.awayScore =
    awayScore !== null && awayScore !== undefined ? parseInt(awayScore) : null;

  db.saveMatch(match);

  // If match finished, resolve bets
  if (status === "FINISHED") {
    apiService.resolveFinishedBets();
  }

  res.json({
    message: "Match updated successfully!",
    match,
    leaderboard: db
      .getUsers()
      .map((u) => ({ username: u.username, balance: u.balance })),
  });
});

// Update user balance (give money/coins)
app.post("/api/admin/user-balance", requireAdmin, (req, res) => {
  const { userId, amount } = req.body;

  if (!userId || amount === undefined) {
    return res
      .status(400)
      .json({ message: "User ID and amount are required." });
  }

  const user = db.getUserById(userId);
  if (!user) return res.status(404).json({ message: "User not found." });

  user.balance = parseInt(amount);
  db.saveUser(user);

  res.json({
    message: `Updated balance for ${user.username} to ${user.balance}`,
    user: { id: user.id, username: user.username, balance: user.balance },
  });
});

// Delete a user (admin only)
app.delete("/api/admin/users/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  const currentUser = db.getUserById(req.user.id);
  const targetUser = db.getUserById(id);

  if (!targetUser) {
    return res.status(404).json({ message: "User not found." });
  }

  if (targetUser.isAdmin) {
    return res.status(403).json({ message: "Cannot delete admin accounts." });
  }

  if (currentUser && currentUser.id === targetUser.id) {
    return res
      .status(400)
      .json({ message: "Cannot delete your own admin account." });
  }

  const removed = db.deleteUser(id);
  if (!removed) {
    return res.status(500).json({ message: "Failed to delete user." });
  }

  res.json({ message: `User ${targetUser.username} deleted successfully.` });
});

// Add mock/custom match
app.post("/api/admin/add-match", requireAdmin, (req, res) => {
  const {
    homeTeam,
    awayTeam,
    homeFlag,
    awayFlag,
    utcDate,
    stage,
    homeOdds,
    drawOdds,
    awayOdds,
  } = req.body;

  if (!homeTeam || !awayTeam) {
    return res
      .status(400)
      .json({ message: "Home and away teams are required." });
  }

  const newMatch = {
    id: "m_" + Math.random().toString(36).substr(2, 9),
    homeTeam,
    awayTeam,
    homeFlag: homeFlag || "https://flagcdn.com/w160/un.png",
    awayFlag: awayFlag || "https://flagcdn.com/w160/un.png",
    status: "SCHEDULED",
    utcDate:
      utcDate || new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    homeScore: null,
    awayScore: null,
    stage: stage || "שלב הבתים",
    homeOdds: parseFloat(homeOdds) || 2.0,
    drawOdds: parseFloat(drawOdds) || 3.0,
    awayOdds: parseFloat(awayOdds) || 2.5,
    source: "custom",
  };

  db.saveMatch(newMatch);

  res.status(201).json({
    message: "Match added successfully!",
    match: newMatch,
  });
});

// --- WORLD CUP DATA ROUTES ---

// Get all World Cup teams
app.get("/api/world-cup/teams", authenticateToken, (req, res) => {
  const data = db.readDb();
  res.json(data.worldCupTeams || []);
});

// Get all World Cup players
app.get("/api/world-cup/players", authenticateToken, (req, res) => {
  const data = db.readDb();
  res.json(data.players || []);
});

// Get current top scorers
app.get("/api/world-cup/top-scorers", authenticateToken, (req, res) => {
  res.json(db.getTopScorers() || []);
});

// Sync matches from external API (admin only)
app.get("/api/matches/sync", requireAdmin, async (req, res) => {
  try {
    const synced = await apiService.syncMatches();
    if (synced && synced.success) {
      const matches = db.getMatches();
      return res.json({
        message: "Matches synced successfully from API",
        matchCount: matches.length,
        matches: matches,
      });
    } else {
      return res.status(400).json({
        message: "Could not sync matches. API key may not be configured.",
      });
    }
  } catch (error) {
    console.error("Error syncing matches:", error.message);
    res.status(500).json({ message: "Error syncing matches from API" });
  }
});

// Update match odds/payouts (admin only)
app.patch("/api/admin/matches/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  const { homeOdds, drawOdds, awayOdds } = req.body;

  const match = db.getMatchById(id);
  if (!match) {
    return res.status(404).json({ message: "Match not found." });
  }

  if (homeOdds !== undefined) match.homeOdds = parseFloat(homeOdds);
  if (drawOdds !== undefined) match.drawOdds = parseFloat(drawOdds);
  if (awayOdds !== undefined) match.awayOdds = parseFloat(awayOdds);

  db.saveMatch(match);

  res.json({
    message: "Match odds updated successfully",
    match: match,
  });
});

// Start server and run initial sync
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ World Cup Bet Server is LIVE on port ${PORT}`);
  console.log(`📡 Listening on all interfaces (0.0.0.0:${PORT})`);
  db.getMatches(); // trigger seed load
  console.log("🗄️ Database seeded and ready.");

  // Initial sync on startup to pull latest real matches/scores
  console.log("🔄 Running initial matches and bets sync on startup...");
  apiService
    .syncMatches()
    .catch((err) => console.error("Initial startup sync failed:", err.message));

  // Background auto-sync interval every 30 minutes (completely automated!)
  const AUTO_SYNC_INTERVAL = 30 * 60 * 1000;
  setInterval(async () => {
    try {
      console.log(
        "🔄 Running automatic background sync of matches and bets...",
      );
      await apiService.syncMatches();
    } catch (err) {
      console.error("Automatic background sync failed:", err.message);
    }
  }, AUTO_SYNC_INTERVAL);

  const LIVE_POLL_INTERVAL = 3 * 60 * 1000;
  setInterval(async () => {
    const hasLiveMatch = db
      .getMatches()
      .some((match) => match.status === "LIVE");
    if (!hasLiveMatch) return;

    try {
      console.log("⏱️ Live game detected. Polling API for updated scores...");
      await apiService.syncMatches();
    } catch (err) {
      console.error("Live poll sync failed:", err.message);
    }
  }, LIVE_POLL_INTERVAL);
});
