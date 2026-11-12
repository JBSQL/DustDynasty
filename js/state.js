// League State, Schedule, Standings, and Season Persistence

import { generateProspectPool } from "./names.js";
import { initializeLeagueTeams, autoSetStarters, aiChooseDraftPick, generateInboundTrade } from "./teams.js";
import { generateCoachMarket } from "./coaches.js";

const STORAGE_KEY = "backyard_football_sim_v1";

export class LeagueState {
  constructor() {
    this.teams = initializeLeagueTeams();
    this.prospectPool = generateProspectPool(60);
    this.coachMarket = generateCoachMarket(5);
    this.draftPickIndex = 0;
    this.draftCompleted = false;
    this.currentWeek = 1;
    this.totalWeeks = 10; // 10 regular season weeks (double round-robin) + Week 11 Bowl Championship
    this.seasonYear = 1;
    this.graduatedHistory = [];
    this.offseasonReport = null;
    this.schedule = [];
    this.inboundTrades = [];
    this.completedGames = [];
    this.seasonOver = false;
    this.leagueNews = [
      "Welcome to Dust Dynasty! 6 neighborhood squads have staked out the makeshift dirt lot for a 10-week double round-robin season.",
      "Rules of the Park Lot: 50-yard makeshift field, five yards and a cloud of dust, 30-yard pass cap, and the Ironman 5 starter lock!"
    ];

    this.initDraft();
    this.generateSchedule();
  }

  getUserTeam() {
    return this.teams.find(t => t.isUser);
  }

  initDraft(customOrder = null) {
    this.draftOrder = [];
    if (customOrder) {
      // Dynasty Rookie Draft: Each team drafts up to fill their 10-man roster
      const maxNeeded = Math.max(...this.teams.map(t => Math.max(0, 10 - t.roster.length)), 1);
      // Track projected roster counts as picks are slotted
      const projectedCount = {};
      this.teams.forEach(t => projectedCount[t.id] = t.roster.length);

      for (let round = 0; round < maxNeeded; round++) {
        const roundOrder = round % 2 === 0 ? [...customOrder] : [...customOrder].reverse();
        roundOrder.forEach(team => {
          if (projectedCount[team.id] < 10) {
            this.draftOrder.push({ round: round + 1, teamId: team.id });
            projectedCount[team.id]++;
          }
        });
      }
    } else {
      // Inaugural Draft: 10 rounds, 6 teams = 60 picks
      for (let round = 0; round < 10; round++) {
        const order = round % 2 === 0 ? [...this.teams] : [...this.teams].reverse();
        order.forEach(team => {
          this.draftOrder.push({ round: round + 1, teamId: team.id });
        });
      }
    }
  }

  getCurrentDraftTurn() {
    if (this.draftPickIndex >= this.draftOrder.length) return null;
    const current = this.draftOrder[this.draftPickIndex];
    const team = this.teams.find(t => t.id === current.teamId);
    return {
      pickNumber: this.draftPickIndex + 1,
      round: current.round,
      team,
      isUserTurn: team.isUser
    };
  }

  makeDraftPick(playerId) {
    const turn = this.getCurrentDraftTurn();
    if (!turn) return null;

    const prospectIdx = this.prospectPool.findIndex(p => p.id === playerId);
    if (prospectIdx === -1) return null;

    const [player] = this.prospectPool.splice(prospectIdx, 1);
    turn.team.roster.push(player);

    const logEntry = `Round ${turn.round}, Pick ${turn.pickNumber}: ${turn.team.name} select ${player.fullName} (${player.archetype}, OVR ${player.overall})`;
    this.leagueNews.unshift(logEntry);

    this.draftPickIndex++;

    if (this.draftPickIndex >= this.draftOrder.length) {
      this.finishDraft();
    }

    return { player, team: turn.team, pickNumber: turn.pickNumber, round: turn.round };
  }

  autoDraftUntilUserOrEnd() {
    const picksMade = [];
    while (this.draftPickIndex < this.draftOrder.length) {
      const turn = this.getCurrentDraftTurn();
      if (turn.isUserTurn) break; // pause for human user

      const bestPick = aiChooseDraftPick(turn.team, this.prospectPool);
      if (!bestPick) break;

      const pickResult = this.makeDraftPick(bestPick.id);
      picksMade.push(pickResult);
    }
    return picksMade;
  }

  autoDraftAll() {
    const picksMade = [];
    while (this.draftPickIndex < this.draftOrder.length) {
      const turn = this.getCurrentDraftTurn();
      const bestPick = turn.isUserTurn
        ? this.prospectPool[0] // user auto-drafts top overall
        : aiChooseDraftPick(turn.team, this.prospectPool);

      if (!bestPick) break;
      const pickResult = this.makeDraftPick(bestPick.id);
      picksMade.push(pickResult);
    }
    return picksMade;
  }

  finishDraft() {
    this.draftCompleted = true;
    // Set initial Ironman 5 for each team
    this.teams.forEach(team => {
      autoSetStarters(team);
    });
    this.leagueNews.unshift("The 10-Round Draft is officially complete! GMs are locking in their Ironman 5 starters for Week 1.");
    this.save();
  }

  generateSchedule() {
    // 6-team double round-robin schedule for 10 regular season weeks
    const t = [...this.teams];
    const n = t.length;
    this.schedule = [];

    // First 5 rounds (Round-robin)
    const teamIndices = [0, 1, 2, 3, 4, 5];
    for (let round = 0; round < n - 1; round++) {
      const matchups = [];
      for (let i = 0; i < n / 2; i++) {
        const homeIdx = teamIndices[i];
        const awayIdx = teamIndices[n - 1 - i];
        matchups.push({
          id: `match_w${round + 1}_${i}`,
          homeId: t[homeIdx].id,
          awayId: t[awayIdx].id,
          homeScore: null,
          awayScore: null,
          played: false
        });
      }
      this.schedule.push({ week: round + 1, matchups });
      // Rotate indices, keeping 0 fixed
      teamIndices.splice(1, 0, teamIndices.pop());
    }

    // Second 5 rounds (Weeks 6-10: Reverse home/away for the rematch)
    for (let round = 0; round < n - 1; round++) {
      const firstHalfWeek = this.schedule[round];
      const weekNumber = round + 6;
      const matchups = firstHalfWeek.matchups.map((m, idx) => ({
        id: `match_w${weekNumber}_${idx}`,
        homeId: m.awayId,
        awayId: m.homeId,
        homeScore: null,
        awayScore: null,
        played: false
      }));
      this.schedule.push({ week: weekNumber, matchups });
    }

    // Week 11: Championship & Consolation Bowls
    this.schedule.push({
      week: 11,
      isPlayoffs: true,
      matchups: [
        { id: "match_w11_champ", title: "Dust Bowl Championship", homeId: null, awayId: null, played: false },
        { id: "match_w11_bronze", title: "Mud Cup (3rd Place)", homeId: null, awayId: null, played: false },
        { id: "match_w11_toilet", title: "Sandlot Consolation (5th Place)", homeId: null, awayId: null, played: false }
      ]
    });
  }

  getCurrentWeekMatchups() {
    const weekData = this.schedule.find(s => s.week === this.currentWeek);
    if (!weekData) return [];

    // In week 11 (playoffs), resolve seeds if not yet resolved
    if (weekData.isPlayoffs && !weekData.matchups[0].homeId) {
      const standings = this.getStandings();
      weekData.matchups[0].homeId = standings[0].id;
      weekData.matchups[0].awayId = standings[1].id;
      weekData.matchups[1].homeId = standings[2].id;
      weekData.matchups[1].awayId = standings[3].id;
      weekData.matchups[2].homeId = standings[4].id;
      weekData.matchups[2].awayId = standings[5].id;
    }

    return weekData.matchups.map(m => ({
      ...m,
      homeTeam: this.teams.find(t => t.id === m.homeId),
      awayTeam: this.teams.find(t => t.id === m.awayId)
    }));
  }

  recordGameResult(matchupId, homeScore, awayScore, boxScore, postGameInjuries = []) {
    const weekData = this.schedule.find(s => s.week === this.currentWeek);
    if (!weekData) return;

    const matchup = weekData.matchups.find(m => m.id === matchupId);
    if (!matchup || matchup.played) return;

    matchup.homeScore = homeScore;
    matchup.awayScore = awayScore;
    matchup.played = true;

    const homeTeam = this.teams.find(t => t.id === matchup.homeId);
    const awayTeam = this.teams.find(t => t.id === matchup.awayId);

    // Update records
    homeTeam.record.pointsFor += homeScore;
    homeTeam.record.pointsAgainst += awayScore;
    awayTeam.record.pointsFor += awayScore;
    awayTeam.record.pointsAgainst += homeScore;

    if (homeScore > awayScore) {
      homeTeam.record.wins++;
      homeTeam.coach.wins++;
      awayTeam.record.losses++;
      awayTeam.coach.losses++;
    } else if (awayScore > homeScore) {
      awayTeam.record.wins++;
      awayTeam.coach.wins++;
      homeTeam.record.losses++;
      homeTeam.coach.losses++;
    } else {
      homeTeam.record.ties++;
      awayTeam.record.ties++;
    }

    this.completedGames.push({
      week: this.currentWeek,
      matchupId,
      homeTeam: { ...homeTeam },
      awayTeam: { ...awayTeam },
      homeScore,
      awayScore,
      boxScore,
      injuries: postGameInjuries
    });

    this.save();
  }

  advanceWeek() {
    if (this.seasonOver) return;

    // Check if we just completed Week 11 (the Championship Bowl week)
    if (this.currentWeek >= 11) {
      this.seasonOver = true;
      const champGame = this.schedule.find(s => s.week === 11)?.matchups[0];
      let champName = "The Champions";
      if (champGame && champGame.played) {
        champName = champGame.homeScore > champGame.awayScore
          ? this.teams.find(t => t.id === champGame.homeId)?.name
          : this.teams.find(t => t.id === champGame.awayId)?.name;
      }
      this.leagueNews.unshift(`🏆 SEASON FINALE: ${champName} hoist the Dust Bowl Trophy! Congratulations on an epic 10-week season!`);
      this.save();
      return;
    }

    // 1. Reduce remaining injury weeks for all players
    const healedPlayers = [];
    this.teams.forEach(team => {
      team.roster.forEach(player => {
        if (player.injuryWeeksRemaining > 0) {
          player.injuryWeeksRemaining--;
          if (player.injuryWeeksRemaining === 0) {
            healedPlayers.push(`${player.fullName} (${team.name})`);
            player.injuryDescription = null;
          }
        }
      });
      // Auto-validate starters (ensure no injured players or players not on roster are in active 5)
      this.validateTeamStarters(team);
    });

    if (healedPlayers.length > 0) {
      this.leagueNews.unshift(`Injury Update: ${healedPlayers.join(", ")} has been cleared by trainers to return to action!`);
    }

    // 2. Chance of random AI GM proposing an inbound trade to user (only during regular season)
    if (this.currentWeek < 10) {
      const userTeam = this.getUserTeam();
      if (Math.random() < 0.65) {
        const otherTeams = this.teams.filter(t => !t.isUser);
        const randomAI = otherTeams[Math.floor(Math.random() * otherTeams.length)];
        const tradeProposal = generateInboundTrade(userTeam, randomAI);
        if (tradeProposal) {
          this.inboundTrades.unshift(tradeProposal);
          this.leagueNews.unshift(`TRADE OFFER: ${randomAI.name} has submitted a formal trade proposal to your front office!`);
        }
      }
    }

    this.currentWeek++;
    this.save();
  }

  validateTeamStarters(team) {
    if (!team) return;
    team.starters = team.starters || [];
    team.roster = team.roster || [];

    // Ensure starters only contain healthy players who are ACTUALLY on this team's roster
    team.starters = team.starters.filter(p =>
      team.roster.some(r => r.id === p.id) &&
      p.injuryWeeksRemaining <= 0
    );

    // If fewer than 5, pull best healthy bench players from current roster
    if (team.starters.length < 5) {
      const healthyBench = team.roster.filter(p =>
        p.injuryWeeksRemaining <= 0 &&
        !team.starters.some(s => s.id === p.id)
      );
      const needed = 5 - team.starters.length;
      team.starters.push(...healthyBench.sort((a, b) => b.overall - a.overall).slice(0, needed));
    }
  }

  getStandings() {
    return [...this.teams].sort((a, b) => {
      // Wins
      if (b.record.wins !== a.record.wins) return b.record.wins - a.record.wins;
      // Point Differential
      const diffB = b.record.pointsFor - b.record.pointsAgainst;
      const diffA = a.record.pointsFor - a.record.pointsAgainst;
      if (diffB !== diffA) return diffB - diffA;
      // Points Scored
      return b.record.pointsFor - a.record.pointsFor;
    });
  }

  // Calculate reverse standings draft order (worst team picks #1)
  getReverseStandingsDraftOrder() {
    return [...this.getStandings()].reverse();
  }

  // Generate offseason transition report: age kids, identify graduates, compute draft order
  prepareOffseasonReport() {
    const draftOrder = this.getReverseStandingsDraftOrder();
    const graduates = [];

    this.teams.forEach(team => {
      team.roster.forEach(player => {
        const nextAge = (player.age || 10) + 1;
        if (nextAge >= 13) {
          graduates.push({
            player: { ...player },
            team: team.name,
            teamId: team.id,
            finalAge: nextAge
          });
        }
      });
    });

    this.offseasonReport = {
      graduates,
      draftOrderTeams: draftOrder.map((t, idx) => ({ pick: idx + 1, team: t })),
      fromYear: this.seasonYear,
      toYear: this.seasonYear + 1
    };

    return this.offseasonReport;
  }

  // Advance the dynasty into the next season!
  startNextDynastySeason() {
    this.seasonYear++;
    const graduates = [];

    // 1. Calculate draft order from PREVIOUS season's final standings (worst picks first)
    const reverseOrder = this.getReverseStandingsDraftOrder();

    // 2. Age players and remove graduates (age 13+)
    this.teams.forEach(team => {
      // Heal all injuries over the summer
      team.roster.forEach(player => {
        player.injuryWeeksRemaining = 0;
        player.injuryDescription = null;
        player.age = (player.age || 10) + 1;
        player.yearsRemaining = Math.max(0, 13 - player.age);
      });

      const agedOut = team.roster.filter(p => p.age >= 13);
      agedOut.forEach(p => {
        graduates.push({ ...p, teamName: team.name });
      });

      // Keep only kids younger than 13
      team.roster = team.roster.filter(p => p.age < 13);
      team.starters = (team.starters || []).filter(p => p.age < 13);

      // Reset team season win/loss records for the new year
      team.record = { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 };
    });

    this.graduatedHistory.push(...graduates);

    // 3. Replenish rookie prospect pool with fresh young prospects (ages 8 to 11)
    this.prospectPool = generateProspectPool(35);

    // 4. Reset draft state
    this.draftPickIndex = 0;
    this.draftCompleted = false;
    this.currentWeek = 1;
    this.seasonOver = false;
    this.inboundTrades = [];
    this.completedGames = [];

    // 5. Build dynamic rookie draft order (teams pick until 10-player rosters are filled)
    this.initDraft(reverseOrder);

    // 6. Generate fresh 10-week schedule + Week 11 Championship Bowls
    this.generateSchedule();

    const topPickTeam = reverseOrder[0];
    this.leagueNews.unshift(`SEASON ${this.seasonYear} KICKOFF: The park lot opens for a new campaign! ${graduates.length} kids aged out or moved away. ${topPickTeam.name} holds the #1 overall pick!`);
    this.save();
  }

  hireCoach(newCoach) {
    const userTeam = this.getUserTeam();
    const oldCoach = userTeam.coach;
    userTeam.coach = newCoach;

    // Remove newCoach from market, replace with fresh candidate
    this.coachMarket = this.coachMarket.filter(c => c.id !== newCoach.id);
    this.coachMarket.push(oldCoach);

    this.leagueNews.unshift(`HEAD COACH CAROUSEL: ${userTeam.name} officially announce the hiring of ${newCoach.name}! "${newCoach.pressQuote}"`);
    this.save();
  }

  save() {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this));
      }
    } catch (e) {
      console.warn("Storage save failed", e);
    }
  }

  static load() {
    try {
      if (typeof localStorage === "undefined") return null;
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return null;
      const parsed = JSON.parse(data);
      const state = new LeagueState();
      Object.assign(state, parsed);
      return state;
    } catch (e) {
      console.warn("Storage load failed", e);
      return null;
    }
  }

  static reset() {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
    return new LeagueState();
  }
}
