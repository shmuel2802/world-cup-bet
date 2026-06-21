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

let lastExternalSyncTime = 0;

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
      balance: 0,
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
    console.log("LOGIN ATTEMPT");
    console.log("username:", username);
    console.log("user found:", !!user);

    if (user) {
      console.log("hash:", user.passwordHash);
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);

    console.log("password:", password);
    console.log("isMatch:", isMatch);
    if (!user) {
      return res.status(400).json({ message: "Invalid username or password." });
    }

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
  const allBets = db.getBets();

  // Map matches to include the user's bet if it exists
  const matchesWithBets = matches.map((match) => {
    const userBet = userBets.find((b) => b.matchId === match.id);

    // Calculate community distribution
    const matchBets = allBets.filter((b) => b.matchId === match.id);
    const total = matchBets.length;

    let homeCount = 0;
    let drawCount = 0;
    let awayCount = 0;
    let exactCount = 0;

    matchBets.forEach((b) => {
      if (b.betType === "HOME") homeCount++;
      else if (b.betType === "DRAW") drawCount++;
      else if (b.betType === "AWAY") awayCount++;
      else if (b.betType === "EXACT_SCORE") exactCount++;
    });

    const predictionDistribution = {
      total,
      home: total > 0 ? Math.round((homeCount / total) * 100) : 0,
      draw: total > 0 ? Math.round((drawCount / total) * 100) : 0,
      away: total > 0 ? Math.round((awayCount / total) * 100) : 0,
      exact: total > 0 ? Math.round((exactCount / total) * 100) : 0,
    };

    const communityPredictions = matchBets.map((b) => ({
      username: b.username,
      betType: b.betType,
      predictedHomeScore: b.predictedHomeScore,
      predictedAwayScore: b.predictedAwayScore,
      status: b.status,
      isCurrentUser: b.userId === req.user.id,
    }));

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
      predictionDistribution,
      communityPredictions,
    };
  });

  res.json(matchesWithBets);

  // Background sync: at most once every 10 minutes, never blocks the response
  if (Date.now() - lastExternalSyncTime > 10 * 60 * 1000) {
    apiService
      .syncMatches()
      .then(() => {
        lastExternalSyncTime = Date.now();
      })
      .catch((err) => console.error("[Background Sync] Failed:", err));
  }
});

// Get public predictions for a specific match (username + prediction + status only)
app.get("/api/matches/:matchId/predictions", authenticateToken, (req, res) => {
  const { matchId } = req.params;
  const match = db.getMatchById(matchId);
  if (!match) {
    return res.status(404).json({ message: "המשחק לא נמצא." });
  }

  const matchBets = db.getBetsByMatchId(matchId);
  const predictions = matchBets.map((b) => ({
    username: b.username,
    betType: b.betType,
    predictedHomeScore: b.predictedHomeScore,
    predictedAwayScore: b.predictedAwayScore,
    status: b.status,
    isCurrentUser: b.userId === req.user.id,
  }));

  res.json({
    matchId,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    currentMinute:
      match.currentMinute !== undefined ? match.currentMinute : null,
    scorers: match.scorers || [],
    total: predictions.length,
    predictions,
  });
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
  const { matchId, betType, predictedHomeScore, predictedAwayScore } = req.body;
  const userId = req.user.id;

  if (!matchId || !betType) {
    return res.status(400).json({ message: "פרטי ההימור אינם תקינים." });
  }

  const match = db.getMatchById(matchId);
  if (!match) {
    return res.status(404).json({ message: "המשחק לא נמצא." });
  }

  // Check if match already started or finished
  if (match.status !== "SCHEDULED") {
    return res
      .status(400)
      .json({ message: "לא ניתן לשלוח הימור. המשחק כבר החל או הסתיים." });
  }

  const now = new Date();
  if (now >= new Date(match.utcDate)) {
    return res
      .status(400)
      .json({ message: "לא ניתן לשלוח הימור. המשחק כבר משוחק." });
  }

  const user = db.getUserById(userId);

  // Check if user already bet on this match -> if yes, overwrite/update it!
  const userBets = db.getBetsByUserId(userId);
  const existingBet = userBets.find((b) => b.matchId === matchId);
  if (existingBet) {
    existingBet.betType = betType;
    existingBet.predictedHomeScore =
      betType === "EXACT_SCORE" ? parseInt(predictedHomeScore) : null;
    existingBet.predictedAwayScore =
      betType === "EXACT_SCORE" ? parseInt(predictedAwayScore) : null;
    existingBet.createdAt = new Date().toISOString();

    db.saveBet(existingBet);

    return res.status(200).json({
      message: "ההימור עודכן בהצלחה!",
      newBalance: user.balance,
      bet: existingBet,
    });
  }

  // Create Bet (amount is defaulted to 1 for points mechanics compatibility)
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
    amount: 1,
    status: "PENDING",
    payout: 0,
    createdAt: new Date().toISOString(),
  };

  db.saveBet(newBet);

  res.status(201).json({
    message: "ההימור נשמר בהצלחה!",
    newBalance: user.balance,
    bet: newBet,
  });
});

// Cancel a bet
app.delete("/api/bets/:betId", authenticateToken, (req, res) => {
  const { betId } = req.params;
  const userId = req.user.id;

  const bets = db.getBets();
  const bet = bets.find((b) => b.id === betId);
  if (!bet) {
    return res.status(404).json({ message: "ההימור לא נמצא." });
  }

  if (bet.userId !== userId) {
    return res.status(403).json({ message: "אין לך הרשאה לבטל הימור זה." });
  }

  const match = db.getMatchById(bet.matchId);
  if (!match) {
    return res.status(404).json({ message: "המשחק לא נמצא." });
  }

  // Only allow canceling if match hasn't started yet
  if (match.status !== "SCHEDULED") {
    return res
      .status(400)
      .json({ message: "לא ניתן לבטל הימור על משחק שהתחיל או הסתיים." });
  }

  const now = new Date();
  if (now >= new Date(match.utcDate)) {
    return res
      .status(400)
      .json({ message: "לא ניתן לבטל הימור לאחר שעת התחלת המשחק." });
  }

  // Delete bet
  const success = db.deleteBet(betId);
  if (success) {
    res.json({ message: "ההימור בוטל בהצלחה!" });
  } else {
    res.status(500).json({ message: "שגיאה במחיקת ההימור ממסד הנתונים." });
  }
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

// --- TEAMS & PLAYERS ROUTES ---

// Get all world cup teams
app.get("/api/teams", authenticateToken, (req, res) => {
  const teams = db.getWorldCupTeams();
  res.json(teams);
});

// Get all world cup players
app.get("/api/players", authenticateToken, (req, res) => {
  const players = db.getWorldCupPlayers();
  res.json(players);
});

// --- LONG-TERM TOURNAMENT PREDICTIONS ROUTES ---

// Get current user's long-term predictions
app.get("/api/predictions/long-term", authenticateToken, (req, res) => {
  const prediction = db.getLongTermPredictionByUserId(req.user.id);
  res.json(
    prediction || {
      userId: req.user.id,
      winnerTeamId: null,
      topScorerPlayerId: null,
    },
  );
});

// Save or update user's long-term predictions
app.post("/api/predictions/long-term", authenticateToken, (req, res) => {
  const { winnerTeamId, topScorerPlayerId } = req.body;
  const userId = req.user.id;

  // Strict deadline check: June 11, 2026, at 19:00 UTC
  const KICKOFF_DATE = new Date("2026-06-11T19:00:00Z");
  const now = new Date();

  if (now > KICKOFF_DATE) {
    return res.status(400).json({
      message:
        "הניחושים ננעלו! לא ניתן לשלוח ניחושים ארוכי טווח לאחר תחילת הטורניר.",
    });
  }

  if (!winnerTeamId || !topScorerPlayerId) {
    return res
      .status(400)
      .json({ message: "אנא בחר מנצחת טורניר ומלך שערים." });
  }

  // Verify team exists
  const teams = db.getWorldCupTeams();
  const teamExists = teams.some((t) => String(t.id) === String(winnerTeamId));
  if (!teamExists) {
    return res.status(400).json({ message: "נבחרת זו אינה קיימת במערכת." });
  }

  // Verify player exists
  const players = db.getWorldCupPlayers();
  const playerExists = players.some(
    (p) => String(p.id) === String(topScorerPlayerId),
  );
  if (!playerExists) {
    return res.status(400).json({ message: "שחקן זה אינו קיים במערכת." });
  }

  const prediction = {
    userId,
    winnerTeamId,
    topScorerPlayerId,
    updatedAt: new Date().toISOString(),
  };

  db.saveLongTermPrediction(prediction);

  res.json({
    message: "הניחושים ארוכי הטווח שלך נשמרו בהצלחה! 🏆⚽",
    prediction,
  });
});

// --- ADMIN ROUTES ---

// Sync matches from live external API
app.post("/api/admin/sync", requireAdmin, async (req, res) => {
  try {
    const updated = await apiService.syncMatches();
    res.json({
      message: updated
        ? "Matches and bets updated successfully!"
        : "No updates fetched from the matches provider.",
      matches: db.getMatches(),
    });
  } catch (error) {
    res.status(500).json({ message: "Sync failed.", error: error.message });
  }
});

// Manually update match score (perfect for testing match payouts!)
app.post("/api/admin/match", requireAdmin, (req, res) => {
  const { matchId, homeScore, awayScore, status, currentMinute, scorers } =
    req.body;

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

  if (currentMinute !== undefined) {
    match.currentMinute =
      currentMinute !== null ? parseInt(currentMinute) : null;
  }
  if (scorers !== undefined) {
    match.scorers = Array.isArray(scorers) ? scorers : [];
  }

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

// Get all users (admin only)
app.get("/api/admin/users", requireAdmin, (req, res) => {
  const users = db.getUsers().map(({ passwordHash, ...user }) => user);
  res.json(users);
});

// Delete a user (admin only)
app.delete("/api/admin/users/:userId", requireAdmin, (req, res) => {
  const { userId } = req.params;
  if (req.user.id === userId) {
    return res.status(400).json({ message: "Cannot delete yourself." });
  }
  const success = db.deleteUser(userId);
  if (success) {
    res.json({ message: "User deleted successfully." });
  } else {
    res
      .status(404)
      .json({ message: "User not found or could not be deleted." });
  }
});

// Update user balance (admin only)
app.put("/api/admin/users/:userId/balance", requireAdmin, (req, res) => {
  const { userId } = req.params;
  const { balance } = req.body;

  if (balance === undefined || isNaN(parseInt(balance))) {
    return res.status(400).json({ message: "Invalid balance amount." });
  }

  const updatedUser = db.updateUserBalance(userId, parseInt(balance));
  if (updatedUser) {
    const { passwordHash, ...safeUser } = updatedUser;
    res.json({
      message: "User points balance updated successfully.",
      user: safeUser,
    });
  } else {
    res.status(404).json({ message: "User not found." });
  }
});

// Update user admin status (admin only)
app.put("/api/admin/users/:userId/admin-status", requireAdmin, (req, res) => {
  const { userId } = req.params;
  const { isAdmin } = req.body;

  if (isAdmin === undefined || typeof isAdmin !== "boolean") {
    return res.status(400).json({ message: "Invalid admin status." });
  }

  if (req.user.id === userId && isAdmin === false) {
    return res
      .status(400)
      .json({ message: "Cannot revoke your own admin status." });
  }

  const updatedUser = db.updateUserAdminStatus(userId, isAdmin);
  if (updatedUser) {
    const { passwordHash, ...safeUser } = updatedUser;
    res.json({
      message: "User admin status updated successfully.",
      user: safeUser,
    });
  } else {
    res.status(404).json({ message: "User not found." });
  }
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
    currentMinute: null,
    scorers: [],
  };

  db.saveMatch(newMatch);

  res.status(201).json({
    message: "Match added successfully!",
    match: newMatch,
  });
});

// Start server and run initial sync
// Start server and run initial sync
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  db.getMatches(); // trigger seed load
  console.log("Database seeded and ready.");

  // אכיפת סטטוס אדמין קבוע עבור החשבון "שמואל" בכל עליית שרת כדי שלא יידרס בענן
  try {
    const users = db.getUsers();
    const myUser = users.find((u) => u.username === "שמואל");

    if (myUser) {
      myUser.isAdmin = true;
      db.saveUser(myUser); // שמירה ישירה שמאלצת את הזיכרון והענן להתעדכן ב-true
      console.log(
        `[Admin Setup] Successfully enforced isAdmin=true for account: ${myUser.username} ✅`,
      );
    } else {
      console.log(
        "[Admin Setup] Warning: User 'שמואל' not found in database yet.",
      );
    }
  } catch (e) {
    console.error("[Admin Setup] Failed to enforce admin setup:", e.message);
  }

  // Initial sync on startup to pull latest real matches/scores
  console.log("Running initial matches and bets sync on startup...");
  apiService
    .syncMatches()
    .catch((err) => console.error("Initial startup sync failed:", err.message));

  // Background auto-sync interval every 4 minutes (completely automated!)
  const AUTO_SYNC_INTERVAL = 4 * 60 * 1000;
  setInterval(async () => {
    try {
      console.log("Running automatic background sync of matches and bets...");
      await apiService.syncMatches();
    } catch (err) {
      console.error("Automatic background sync failed:", err.message);
    }
  }, AUTO_SYNC_INTERVAL);
});
