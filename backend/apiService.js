const axios = require("axios");

// Fetch real football matches from Football-Data.org if key is provided, or simulate updates
class FootballApiService {
  constructor(db) {
    this.db = db;
  }

  // Fetch or update match data
  async syncMatches() {
    const settings = this.db.getSettings();
    const apiKey = process.env.FOOTBALL_API_KEY || settings.footballApiKey;

    if (!apiKey) {
      console.log("No Football API Key configured. Skipping matches sync.");
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

      // Extract unique teams from externalMatches
      const teamsMap = new Map();
      externalMatches.forEach((m) => {
        if (m.homeTeam && m.homeTeam.id) {
          teamsMap.set(m.homeTeam.id, m.homeTeam);
        }
        if (m.awayTeam && m.awayTeam.id) {
          teamsMap.set(m.awayTeam.id, m.awayTeam);
        }
      });

      const teamsArray = Array.from(teamsMap.values()).map((t) => ({
        id: t.id,
        name: t.name || t.shortName || "TBD",
        tla: t.tla || "",
        crest: t.crest || "",
        flag: t.crest || "", // compatibility
      }));

      // Batch save teams into worldCupTeams
      this.db.saveWorldCupTeamsBatch(teamsArray);

      // Trigger player squads sync in background
      const teamIds = Array.from(teamsMap.keys());
      this.syncPlayerSquads(teamIds, apiKey).catch((err) => {
        console.error("Background player squads sync failed:", err.message);
      });

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
      this.syncScorers().catch((err) =>
        console.error("Auto scorers sync failed:", err.message),
      );
      return true;
    } catch (error) {
      console.error("Error syncing with Football API:", error.message);
      return false;
    }
  }

  // Asynchronously fetch player squads for the unique team IDs with 6 seconds delay between requests
  async syncPlayerSquads(teamIds, apiKey) {
    console.log(
      `Starting background sync of player squads for ${teamIds.length} teams...`,
    );
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    for (let i = 0; i < teamIds.length; i++) {
      const teamId = teamIds[i];
      console.log(
        `[Squad Sync] Fetching squad for team ID ${teamId} (${i + 1}/${teamIds.length})...`,
      );

      try {
        const response = await axios.get(
          `https://api.football-data.org/v4/teams/${teamId}`,
          {
            headers: { "X-Auth-Token": apiKey },
          },
        );

        const squad = response.data.squad;
        if (squad && squad.length) {
          const players = squad.map((p) => ({
            id: p.id
              ? `p_${p.id}`
              : "p_" + Math.random().toString(36).substr(2, 9),
            name: p.name,
            position: p.position || "Unknown",
            dateOfBirth: p.dateOfBirth || "",
            team_id: teamId,
          }));

          this.db.saveWorldCupPlayersBatch(players);
          console.log(
            `[Squad Sync] Successfully synced ${players.length} players for team ID ${teamId} ✅`,
          );
        } else {
          console.log(`[Squad Sync] No squad found for team ID ${teamId}.`);
        }
      } catch (error) {
        console.error(
          `[Squad Sync] Failed to sync squad for team ID ${teamId}:`,
          error.message,
        );
      }

      // 6 seconds delay to respect rate limit (10 requests/minute)
      if (i < teamIds.length - 1) {
        await delay(6000);
      }
    }

    console.log("Background player squads sync completed! ⚽✅");
  }

  // Fetch live top scorers from external API and update goals count for players
  async syncScorers() {
    const settings = this.db.getSettings();
    const apiKey = process.env.FOOTBALL_API_KEY || settings.footballApiKey;

    if (!apiKey) {
      console.log("No Football API Key configured. Skipping scorers sync.");
      return false;
    }

    try {
      console.log("Syncing tournament top scorers from external API...");
      const response = await axios.get(
        "https://api.football-data.org/v4/competitions/WC/scorers",
        {
          headers: { "X-Auth-Token": apiKey },
        },
      );

      const scorers = response.data.scorers;
      if (!scorers || !scorers.length) return false;

      const playersWithGoals = scorers.map((s) => ({
        id: `p_${s.player.id}`,
        name: s.player.name,
        position: s.player.position || "Unknown",
        dateOfBirth: s.player.dateOfBirth || "",
        team_id: s.team.id,
        goals: s.goals,
        assists: s.assists || 0,
        playedMatches: s.playedMatches || 0,
      }));

      this.db.saveWorldCupPlayersBatch(playersWithGoals);
      console.log(
        `[Scorers Sync] Successfully synced ${playersWithGoals.length} scorers from API ✅`,
      );
      return true;
    } catch (error) {
      console.error(
        "[Scorers Sync] Error syncing scorers with Football API:",
        error.message,
      );
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

      // 1. קביעת התוצאה האמיתית של המשחק
      let realOutcome = "DRAW";
      if (homeScore > awayScore) realOutcome = "HOME";
      if (homeScore < awayScore) realOutcome = "AWAY";

      // 2. קביעת מה המשתמש ניחש בפועל (עבור הימור מדויק) כדי לבדוק כיוון
      let predictedOutcome = null;
      if (bet.betType === "EXACT_SCORE") {
        if (bet.predictedHomeScore > bet.predictedAwayScore)
          predictedOutcome = "HOME";
        else if (bet.predictedHomeScore < bet.predictedAwayScore)
          predictedOutcome = "AWAY";
        else predictedOutcome = "DRAW";
      } else {
        predictedOutcome = bet.betType; // HOME, DRAW, או AWAY רגיל
      }

      let won = false;
      let pointsEarned = 0;

      // 3. חישוב הניקוד לפי הלוגיקה החדשה
      if (bet.betType === "EXACT_SCORE") {
        // מקרה א': פגיעה בול בתוצאה המדויקת
        if (
          bet.predictedHomeScore === homeScore &&
          bet.predictedAwayScore === awayScore
        ) {
          won = true;
          pointsEarned = 5; // בול! 5 נקודות
        }
        // מקרה ב': פספס את התוצאה המדויקת, אבל צדק בכיוון (ניצחון בית / חוץ / תיקו)
        else if (predictedOutcome === realOutcome) {
          won = true;
          pointsEarned = 1; // נקודת ניחומים בלבד (לא יותר!)
        }
      } else {
        // הימורים רגילים (HOME, DRAW, AWAY) - מי שלא ניסה להמר על תוצאה מדויקת
        if (bet.betType === realOutcome) {
          won = true;
          pointsEarned = 2; // פגיעה בתוצאה רגילה מקבלת 2 נקודות
        }
      }

      // 4. עדכון סטטוס ההימור והנקודות במערכת
      bet.status = won ? "WON" : "LOST";
      bet.payout = pointsEarned;
      updatedBets = true;

      // עדכון מאזן הנקודות של המשתמש
      if (won) {
        user.balance += pointsEarned;
      }

      // עדכון סטטיסטיקות משתמש
      const userBets = bets.filter((b) => b.userId === user.id);
      const settledBets = userBets.filter((b) => b.status !== "PENDING");
      const wonBets = settledBets.filter((b) => b.status === "WON");

      user.totalBets = settledBets.length;
      user.winRate =
        settledBets.length > 0
          ? Math.round((wonBets.length / settledBets.length) * 100)
          : 0;

      // שמירה לבסיס הנתונים
      this.db.saveUser(user);
      this.db.saveBet(bet);
    });

    return updatedBets;
  }
}

module.exports = FootballApiService;
