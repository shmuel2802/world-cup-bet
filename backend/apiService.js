const axios = require("axios");

// Fetch real football matches from Football-Data.org if key is provided, or simulate updates
class FootballApiService {
  constructor(db) {
    this.db = db;
  }

  // Fetch or update match data
  async syncMatches(options = {}) {
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
      const [matchesResponse, teamsResponse] = await Promise.all([
        axios.get("https://api.football-data.org/v4/competitions/WC/matches", {
          headers: { "X-Auth-Token": apiKey },
        }),
        axios.get("https://api.football-data.org/v4/competitions/WC/teams", {
          headers: { "X-Auth-Token": apiKey },
        }),
      ]);

      const externalMatches = matchesResponse.data.matches;
      const externalTeams = teamsResponse?.data?.teams || [];

      const matchTeams = new Map();
      if (Array.isArray(externalMatches)) {
        externalMatches.forEach((m) => {
          [m.homeTeam, m.awayTeam].forEach((team) => {
            const teamRecord = this.mapTeamRecord(team);
            if (teamRecord) {
              matchTeams.set(teamRecord.id, teamRecord);
            }
          });
        });
      }

      if (matchTeams.size) {
        this.db.saveTeamsBatch([...matchTeams.values()]);
      }

      if (Array.isArray(externalTeams) && externalTeams.length) {
        const apiTeams = externalTeams
          .map((team) => this.mapTeamRecord(team))
          .filter(Boolean);
        this.db.saveTeamsBatch(apiTeams);
      }

      if (!externalMatches || !externalMatches.length) return false;

      const existingMatches = this.db.getMatches();
      const existingMatchById = new Map(
        existingMatches.map((match) => [match.id, match]),
      );

      const scorerUpdates = [];
      const formattedMatches = externalMatches.map((m) => {
        const matchId = `real_${m.id}`;
        const previousMatch = existingMatchById.get(matchId);
        const homeTla = (m.homeTeam?.tla || "un").toLowerCase().slice(0, 2);
        const awayTla = (m.awayTeam?.tla || "un").toLowerCase().slice(0, 2);

        const mappedMatch = {
          id: matchId,
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
              : (m.score?.halfTime?.home ?? null),
          awayScore:
            m.score?.fullTime?.away !== null &&
            m.score?.fullTime?.away !== undefined
              ? m.score.fullTime.away
              : (m.score?.halfTime?.away ?? null),
          stage: this.translateStage(m.stage),
          homeOdds: 2.0,
          drawOdds: 3.2,
          awayOdds: 2.8,
          source: "football-data",
          scorerSyncFingerprint: this.buildMatchSyncFingerprint(m),
        };

        const mergedMatch = previousMatch
          ? { ...previousMatch, ...mappedMatch }
          : mappedMatch;

        const shouldProcessScorers =
          !previousMatch ||
          previousMatch.scorerSyncFingerprint !==
            mergedMatch.scorerSyncFingerprint;

        if (shouldProcessScorers) {
          const apiScorers = this.extractScorers(m);
          if (apiScorers.length) {
            scorerUpdates.push(
              ...apiScorers.map((entry) => ({
                ...entry,
                matchId,
                teamName: entry.teamName || entry.team || mergedMatch.homeTeam,
              })),
            );
          } else if (Array.isArray(options.manualScorers)) {
            scorerUpdates.push(
              ...options.manualScorers.filter(
                (entry) => entry.matchId === matchId,
              ),
            );
          } else {
            scorerUpdates.push(
              ...this.buildFallbackScorers(mergedMatch, previousMatch),
            );
          }
        }

        return mergedMatch;
      });

      this.db.replaceMatches(formattedMatches);
      const uniqueTeamIds = Array.from(matchTeams.values()).map((team) =>
        team.id.replace(/^team_/, ""),
      );
      const squadPlayersSynced = await this.syncTeamSquads(
        uniqueTeamIds,
        apiKey,
      );

      if (scorerUpdates.length) {
        this.updatePlayersFromScorers(scorerUpdates);
      }
      this.refreshTopScorers();
      this.resolveFinishedBets();

      return {
        success: true,
        syncedMatches: formattedMatches.length,
        scoredEntries: scorerUpdates.length,
        syncedPlayers: squadPlayersSynced.length,
      };
    } catch (error) {
      console.error("Error syncing with Football API:", error.message);
      return false;
    }
  }

  extractScorers(match) {
    const rawScorers =
      match.scorers ||
      match.goals ||
      match.goalScorers ||
      match.scorer ||
      match.score?.scorers ||
      [];

    const flattenScorers = (payload) => {
      if (!payload) return [];
      if (Array.isArray(payload)) return payload;
      if (typeof payload === "object") {
        if (Array.isArray(payload.home) || Array.isArray(payload.away)) {
          return [...(payload.home || []), ...(payload.away || [])];
        }
        return [payload];
      }
      return [];
    };

    const items = flattenScorers(rawScorers);
    return items
      .map((entry) => {
        if (!entry) return null;
        const playerName =
          entry.player?.name ||
          entry.name ||
          entry.playerName ||
          entry.scorer ||
          entry.person?.name;
        const teamName =
          entry.team?.name || entry.teamName || entry.team || entry.side;
        const goals =
          typeof entry.goals === "number"
            ? entry.goals
            : typeof entry.goalCount === "number"
              ? entry.goalCount
              : 1;

        if (!playerName) return null;
        return {
          playerId: entry.player?.id
            ? `p_${entry.player.id}`
            : this.normalizePlayerId(playerName),
          playerName,
          teamName: teamName || "Unknown",
          goals,
        };
      })
      .filter(Boolean);
  }

  normalizePlayerId(name) {
    return `p_${name
      .toString()
      .toLowerCase()
      .trim()
      .replace(/[\s\W]+/g, "_")}`;
  }

  buildMatchSyncFingerprint(match) {
    const home = match.score?.fullTime?.home ?? match.homeScore ?? "null";
    const away = match.score?.fullTime?.away ?? match.awayScore ?? "null";
    const scorerList = this.extractScorers(match)
      .map((entry) => `${entry.playerName}:${entry.teamName}:${entry.goals}`)
      .sort()
      .join("|");
    return `${match.id || "unknown"}:${home}-${away}:${match.status || ""}:${scorerList}`;
  }

  mapTeamRecord(team) {
    if (!team || typeof team.id === "undefined" || team.id === null)
      return null;
    const tla = (team.tla || team.shortName || team.name || "")
      .toString()
      .trim();
    return {
      id: `team_${team.id}`,
      team_id: `team_${team.id}`,
      name: team.name || team.shortName || "TBD",
      tla,
      crest: team.crest || team.crestUrl || team.logo || team.crestUrl || null,
    };
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async syncTeamSquads(teamIds, apiKey) {
    if (!Array.isArray(teamIds) || !teamIds.length) return [];

    const syncedPlayers = [];
    for (let i = 0; i < teamIds.length; i += 1) {
      const teamId = teamIds[i];
      try {
        const teamResponse = await axios.get(
          `https://api.football-data.org/v4/teams/${teamId}`,
          {
            headers: { "X-Auth-Token": apiKey },
          },
        );

        const teamData = teamResponse.data;
        const teamRecord = this.mapTeamRecord(teamData);
        if (teamRecord) {
          this.db.saveTeam(teamRecord);
        }

        const squad = Array.isArray(teamData.squad) ? teamData.squad : [];
        const players = squad
          .map((player) => {
            const playerName = player.name || player.fullName || "Unknown";
            const playerId = player.id
              ? `player_${player.id}`
              : this.normalizePlayerId(`${playerName}_${teamId}`);
            return {
              id: playerId,
              name: playerName,
              position: player.position || "Unknown",
              dateOfBirth: player.dateOfBirth || null,
              team: teamRecord?.name || teamData.name || "Unknown",
              team_id: teamRecord?.id || `team_${teamId}`,
              goals_scored: 0,
            };
          })
          .filter((entry) => entry.id && entry.name);

        if (players.length) {
          this.db.savePlayersBatch(players);
          syncedPlayers.push(...players);
        }
      } catch (error) {
        console.error(`Error syncing squad for team ${teamId}:`, error.message);
      }

      if (i < teamIds.length - 1) {
        await this.delay(6000);
      }
    }

    return syncedPlayers;
  }

  buildFallbackScorers(formattedMatch, previousMatch) {
    const homeDelta = this.computeGoalDelta(
      formattedMatch.homeScore,
      previousMatch?.homeScore,
    );
    const awayDelta = this.computeGoalDelta(
      formattedMatch.awayScore,
      previousMatch?.awayScore,
    );

    return [
      ...this.simulateTeamGoals(
        formattedMatch.homeTeam,
        homeDelta,
        formattedMatch.id,
      ),
      ...this.simulateTeamGoals(
        formattedMatch.awayTeam,
        awayDelta,
        formattedMatch.id,
      ),
    ];
  }

  computeGoalDelta(current, previous) {
    if (current === null || current === undefined) return 0;
    if (previous === null || previous === undefined) return current;
    return Math.max(0, current - previous);
  }

  simulateTeamGoals(teamName, goals, matchId) {
    if (!goals || goals <= 0) return [];
    const teamPlayers = this.db
      .getPlayers()
      .filter((player) =>
        player.team
          ?.toLowerCase()
          .includes(teamName?.toLowerCase().substring(0, 3)),
      );
    const candidates = teamPlayers.length
      ? teamPlayers
      : this.db.getPlayers().slice(0, 5);

    if (!candidates.length) return [];
    const simulated = [];
    for (let i = 0; i < goals; i += 1) {
      const player = candidates[i % candidates.length];
      simulated.push({
        matchId,
        playerId: player.id,
        playerName: player.name,
        teamName: player.team,
        increment: 1,
        fallback: true,
      });
    }
    return simulated;
  }

  updatePlayersFromScorers(entries) {
    entries.forEach((entry) => {
      const existing = this.db.getPlayerById(entry.playerId);
      const player = existing
        ? { ...existing }
        : {
            id: entry.playerId,
            name: entry.playerName,
            team: entry.teamName || "Unknown",
            goals_scored: 0,
          };

      const currentGoals = Number(player.goals_scored) || 0;
      if (typeof entry.goals === "number") {
        player.goals_scored = Math.max(currentGoals, entry.goals);
      } else if (typeof entry.increment === "number") {
        player.goals_scored = currentGoals + entry.increment;
      } else {
        player.goals_scored = currentGoals + 1;
      }

      this.db.savePlayer(player);
    });
  }

  refreshTopScorers() {
    const players = this.db
      .getPlayers()
      .slice()
      .sort(
        (a, b) =>
          b.goals_scored - a.goals_scored || a.name.localeCompare(b.name),
      );
    const topScorers = players.filter((p) => p.goals_scored > 0).slice(0, 15);
    this.db.setTopScorers(topScorers);
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
