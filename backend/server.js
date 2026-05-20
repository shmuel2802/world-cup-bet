const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const db = require('./database');
const FootballApiService = require('./apiService');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'world_cup_betting_secret_key_2026_!';

app.use(cors());
app.use(express.json());

const apiService = new FootballApiService(db);

// --- JWT AUTHENTICATION MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Token missing. Please log in.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Session expired. Please log in again.' });
    req.user = user;
    next();
  });
};

// Admin protection middleware
const requireAdmin = (req, res, next) => {
  authenticateToken(req, res, () => {
    const user = db.getUserById(req.user.id);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ message: 'Access denied. Admin rights required.' });
    }
    next();
  });
};

// --- AUTH ROUTES ---

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    if (username.length < 2) {
      return res.status(400).json({ message: 'Username must be at least 2 characters.' });
    }

    const existingUser = db.getUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({ message: 'Username is already taken.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = {
      id: 'u_' + Math.random().toString(36).substr(2, 9),
      username: username.trim(),
      passwordHash,
      isAdmin: false,
      balance: db.getSettings().startingBalance || 1000,
      winRate: 0,
      totalBets: 0
    };

    db.saveUser(newUser);

    const token = jwt.sign(
      { id: newUser.id, username: newUser.username, isAdmin: newUser.isAdmin },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        isAdmin: newUser.isAdmin,
        balance: newUser.balance
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error during registration.', error: error.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    const user = db.getUserByUsername(username);
    if (!user) {
      return res.status(400).json({ message: 'Invalid username or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid username or password.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, isAdmin: user.isAdmin },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        balance: user.balance
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error during login.', error: error.message });
  }
});

// Get profile
app.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = db.getUserById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found.' });

  res.json({
    id: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    balance: user.balance,
    winRate: user.winRate,
    totalBets: user.totalBets
  });
});


// --- MATCHES ROUTES ---

// Get all matches with user's bets populated
app.get('/api/matches', authenticateToken, (req, res) => {
  const matches = db.getMatches();
  const userBets = db.getBetsByUserId(req.user.id);

  // Map matches to include the user's bet if it exists
  const matchesWithBets = matches.map(match => {
    const userBet = userBets.find(b => b.matchId === match.id);
    return {
      ...match,
      myBet: userBet ? {
        id: userBet.id,
        betType: userBet.betType,
        predictedHomeScore: userBet.predictedHomeScore,
        predictedAwayScore: userBet.predictedAwayScore,
        amount: userBet.amount,
        status: userBet.status,
        payout: userBet.payout
      } : null
    };
  });

  res.json(matchesWithBets);
});


// --- BETS ROUTES ---

// Get all bets for current user
app.get('/api/bets', authenticateToken, (req, res) => {
  const userBets = db.getBetsByUserId(req.user.id);
  const matches = db.getMatches();

  const enrichedBets = userBets.map(bet => {
    const match = matches.find(m => m.id === bet.matchId);
    return {
      ...bet,
      match: match ? {
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeFlag: match.homeFlag,
        awayFlag: match.awayFlag,
        status: match.status,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        utcDate: match.utcDate
      } : null
    };
  });

  res.json(enrichedBets);
});

// Place a bet
app.post('/api/bets', authenticateToken, (req, res) => {
  const { matchId, betType, amount, predictedHomeScore, predictedAwayScore } = req.body;
  const userId = req.user.id;

  if (!matchId || !betType || !amount || amount <= 0) {
    return res.status(400).json({ message: 'Invalid bet details. Amount must be greater than 0.' });
  }

  const match = db.getMatchById(matchId);
  if (!match) {
    return res.status(404).json({ message: 'Match not found.' });
  }

  // Check if match already started or finished
  if (match.status !== 'SCHEDULED') {
    return res.status(400).json({ message: 'Cannot place bets. The match has already started or finished.' });
  }

  const now = new Date();
  if (now >= new Date(match.utcDate)) {
    return res.status(400).json({ message: 'Cannot place bets. The match is already in play.' });
  }

  const user = db.getUserById(userId);
  if (user.balance < amount) {
    return res.status(400).json({ message: 'Insufficient balance. Place a smaller bet!' });
  }

  // Check if user already bet on this match
  const userBets = db.getBetsByUserId(userId);
  const existingBet = userBets.find(b => b.matchId === matchId);
  if (existingBet) {
    return res.status(400).json({ message: 'You have already placed a bet on this match.' });
  }

  // Deduct balance
  user.balance -= amount;
  db.saveUser(user);

  // Create Bet
  const newBet = {
    id: 'b_' + Math.random().toString(36).substr(2, 9),
    userId,
    username: user.username,
    matchId,
    betType,
    predictedHomeScore: betType === 'EXACT_SCORE' ? parseInt(predictedHomeScore) : null,
    predictedAwayScore: betType === 'EXACT_SCORE' ? parseInt(predictedAwayScore) : null,
    amount: parseInt(amount),
    status: 'PENDING',
    payout: 0,
    createdAt: new Date().toISOString()
  };

  db.saveBet(newBet);

  res.status(201).json({
    message: 'Bet placed successfully!',
    newBalance: user.balance,
    bet: newBet
  });
});


// --- LEADERBOARD ROUTE ---

app.get('/api/leaderboard', authenticateToken, (req, res) => {
  const users = db.getUsers();
  
  // Sort users by balance descending, then winRate descending
  const rankedUsers = users
    .map(u => ({
      id: u.id,
      username: u.username,
      balance: u.balance,
      winRate: u.winRate,
      totalBets: u.totalBets,
      isAdmin: u.isAdmin
    }))
    .sort((a, b) => b.balance - a.balance || b.winRate - a.winRate);

  res.json(rankedUsers);
});


// --- ADMIN ROUTES ---

// Sync matches (fetch from API / run simulation)
app.post('/api/admin/sync', requireAdmin, async (req, res) => {
  try {
    const updated = await apiService.syncMatches();
    res.json({
      message: updated ? 'Matches and bets updated successfully!' : 'Matches are up to date.',
      matches: db.getMatches()
    });
  } catch (error) {
    res.status(500).json({ message: 'Sync failed.', error: error.message });
  }
});

// Manually update match score (perfect for testing match payouts!)
app.post('/api/admin/match', requireAdmin, (req, res) => {
  const { matchId, homeScore, awayScore, status } = req.body;

  if (!matchId || status === undefined) {
    return res.status(400).json({ message: 'Match ID and status are required.' });
  }

  const match = db.getMatchById(matchId);
  if (!match) return res.status(404).json({ message: 'Match not found.' });

  match.status = status; // SCHEDULED, LIVE, FINISHED
  match.homeScore = homeScore !== null && homeScore !== undefined ? parseInt(homeScore) : null;
  match.awayScore = awayScore !== null && awayScore !== undefined ? parseInt(awayScore) : null;

  db.saveMatch(match);

  // If match finished, resolve bets
  if (status === 'FINISHED') {
    apiService.resolveFinishedBets();
  }

  res.json({
    message: 'Match updated successfully!',
    match,
    leaderboard: db.getUsers().map(u => ({ username: u.username, balance: u.balance }))
  });
});

// Update user balance (give money/coins)
app.post('/api/admin/user-balance', requireAdmin, (req, res) => {
  const { userId, amount } = req.body;

  if (!userId || amount === undefined) {
    return res.status(400).json({ message: 'User ID and amount are required.' });
  }

  const user = db.getUserById(userId);
  if (!user) return res.status(404).json({ message: 'User not found.' });

  user.balance = parseInt(amount);
  db.saveUser(user);

  res.json({
    message: `Updated balance for ${user.username} to ${user.balance}`,
    user: { id: user.id, username: user.username, balance: user.balance }
  });
});

// Add mock/custom match
app.post('/api/admin/add-match', requireAdmin, (req, res) => {
  const { homeTeam, awayTeam, homeFlag, awayFlag, utcDate, stage, homeOdds, drawOdds, awayOdds } = req.body;

  if (!homeTeam || !awayTeam) {
    return res.status(400).json({ message: 'Home and away teams are required.' });
  }

  const newMatch = {
    id: 'm_' + Math.random().toString(36).substr(2, 9),
    homeTeam,
    awayTeam,
    homeFlag: homeFlag || 'https://flagcdn.com/w160/un.png',
    awayFlag: awayFlag || 'https://flagcdn.com/w160/un.png',
    status: 'SCHEDULED',
    utcDate: utcDate || new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    homeScore: null,
    awayScore: null,
    stage: stage || 'שלב הבתים',
    homeOdds: parseFloat(homeOdds) || 2.0,
    drawOdds: parseFloat(drawOdds) || 3.0,
    awayOdds: parseFloat(awayOdds) || 2.5
  };

  db.saveMatch(newMatch);

  res.status(201).json({
    message: 'Match added successfully!',
    match: newMatch
  });
});


// Start server and run initial sync simulation
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  db.getMatches(); // trigger seed load
  console.log('Database seeded and ready.');
});
