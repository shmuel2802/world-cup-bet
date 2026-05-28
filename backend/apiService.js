const axios = require("axios");

// Fetch real football matches from Football-Data.org if key is provided, or simulate updates
class FootballApiService {
  constructor(db) {
    this.db = db;
  }

  // Fetch or update match data
  async syncMatches() {
    const settings = this.db.getSettings();
    const apiKey =
      process.env.FOOTBALL_API_KEY ||
      process.env.API_FOOTBALL_API_KEY ||
      settings.footballApiKey;

    if (!apiKey) {
      console.log(
        "No Football API Key configured. Skipping matches sync. Set FOOTBALL_API_KEY or API_FOOTBALL_API_KEY.",
      );
      return false;
    }

    try {
      // In a real environment, we would query the World Cup matches:
      // HTTP GET api.football-data.org/v4/competitions/WC/matches
      const response = await axios.get(
        "https://api.football-data.org/v4/competitions/WC/matches",
        {
          headers: { "X-Auth-Token": apiKey },
        },
      );

      const externalMatches = response.data.matches;
      if (!externalMatches || !externalMatches.length) return false;

      const formattedMatches = externalMatches.map((m) => {
        const homeTla = (m.homeTeam?.tla || "un").toLowerCase().slice(0, 2);
        const awayTla = (m.awayTeam?.tla || "un").toLowerCase().slice(0, 2);

        // Map API response to our database schema
        return {
          id: `real_${m.id}`,
          homeTeam: m.homeTeam?.name || m.homeTeam?.shortName || "TBD",
          awayTeam: m.awayTeam?.name || m.awayTeam?.shortName || "TBD",
          homeFlag:
            m.homeTeam?.crest || `https://flagcdn.com/w160/${homeTla}.png`,
          awayFlag:
            m.awayTeam?.crest || `https://flagcdn.com/w160/${awayTla}.png`,
          status: this.mapStatus(m.status),
          utcDate: m.utcDate,
          homeScore:
            m.score?.fullTime?.home !== null &&
            m.score?.fullTime?.home !== undefined
              ? m.score.fullTime.home
              : null,
          awayScore:
            m.score?.fullTime?.away !== null &&
            m.score?.fullTime?.away !== undefined
              ? m.score.fullTime.away
              : null,
          stage: this.translateStage(m.stage),
          homeOdds: 2.0, // Odds would be generated or constant since free APIs don't usually provide odds
          drawOdds: 3.2,
          awayOdds: 2.8,
        };
      });

      this.db.replaceMatches(formattedMatches);
      this.resolveFinishedBets();
      return true;
    } catch (error) {
      console.error("Error syncing with Football API:", error.message);
      return false;
    }
  }

  // Maps external status to our status: SCHEDULED, LIVE, FINISHED
  mapStatus(externalStatus) {
    switch (externalStatus) {
      case "TIMED":
      case "SCHEDULED":
        return "SCHEDULED";
      case "IN_PLAY":
      case "PAUSED":
      case "LIVE":
        return "LIVE";
      case "FINISHED":
      case "AWARDED":
        return "FINISHED";
      default:
        return "SCHEDULED";
    }
  }

  // Translate stages to friendly Hebrew
  translateStage(stage) {
    const stages = {
      GROUP_STAGE: "שלב הבתים",
      ROUND_OF_16: "שמינית הגמר",
      LAST_16: "שמינית הגמר",
      QUARTER_FINALS: "רבע הגמר",
      SEMI_FINALS: "חצי הגמר",
      FINAL: "הגמר הגדול",
      THIRD_PLACE: "הקרב על המקום השלישי",
    };
    return stages[stage] || "מונדיאל";
  }

  // Process all bets for matches that are FINISHED but bets are still PENDING
  resolveFinishedBets() {
    const bets = this.db.getBets();
    const matches = this.db.getMatches();
    const users = this.db.getUsers();

    let updatedBets = false;

    bets.forEach((bet) => {
      if (bet.status !== "PENDING") return;

      const match = matches.find((m) => m.id === bet.matchId);
      if (!match || match.status !== "FINISHED") return;

      const user = users.find((u) => u.id === bet.userId);
      if (!user) return;

      const homeScore = match.homeScore;
      const awayScore = match.awayScore;

      // Determine real outcome
      let realOutcome = "DRAW";
      if (homeScore > awayScore) realOutcome = "HOME";
      if (homeScore < awayScore) realOutcome = "AWAY";

      let won = false;
      let multiplier = 1;

      if (bet.betType === "EXACT_SCORE") {
        // Exact score prediction
        if (
          bet.predictedHomeScore === homeScore &&
          bet.predictedAwayScore === awayScore
        ) {
          won = true;
          multiplier = 5; // x5 multiplier for exact score!
        }
      } else {
        // Outcome prediction (HOME, DRAW, AWAY)
        if (bet.betType === realOutcome) {
          won = true;
          multiplier = 2; // x2 multiplier for correct match outcome!
        }
      }

      // Update bet status
      bet.status = won ? "WON" : "LOST";
      bet.payout = won ? bet.amount * multiplier : 0;
      updatedBets = true;

      // Update user wallet balance
      if (won) {
        user.balance += bet.payout;
      }

      // Update user stats
      const userBets = bets.filter((b) => b.userId === user.id);
      const settledBets = userBets.filter((b) => b.status !== "PENDING");
      const wonBets = settledBets.filter((b) => b.status === "WON");

      user.totalBets = settledBets.length;
      user.winRate =
        settledBets.length > 0
          ? Math.round((wonBets.length / settledBets.length) * 100)
          : 0;

      // Save user updates back to DB array (db will save it all together)
      this.db.saveUser(user);
      this.db.saveBet(bet);
    });

    return updatedBets;
  }
}

module.exports = FootballApiService;
