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
    this.totalWeeks = 5; // 5 regular season weeks + Championship
    this.schedule = [];
    this.inboundTrades = [];
    this.completedGames = [];
    this.leagueNews = [
      "Welcome to the Backyard Football League! 6 squads have converged on the cul-de-sac for the inaugural 5v5 season.",
      "Commissioners announce the official rules: 50-yard field, no kickoffs, 30-yard pass cap, and the Ironman 5 starter lock!"
    ];

    this.initDraft();
    this.generateSchedule();
  }

  getUserTeam() {
    return this.teams.find(t => t.isUser);
  }

  initDraft() {
    // 10 rounds, 6 teams = 60 total picks
    this.draftOrder = [];
    for (let round = 0; round < 10; round++) {
      const order = round % 2 === 0 ? [...this.teams] : [...this.teams].reverse();
      order.forEach(team => {
        this.draftOrder.push({ round: round + 1, teamId: team.id });
      });
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
    // 6-team round-robin schedule for 5 regular season weeks
    const t = [...this.teams];
    const n = t.length;
    this.schedule = [];

    // Round-robin pairing
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

    // Week 6: Championship & Consolation Bowl
    this.schedule.push({
      week: 6,
      isPlayoffs: true,
      matchups: [
        { id: "match_w6_champ", title: "Backyard Bowl Championship", homeId: null, awayId: null, played: false },
        { id: "match_w6_bronze", title: "Mud Cup (3rd Place)", homeId: null, awayId: null, played: false },
        { id: "match_w6_toilet", title: "Sandbox Toilet Bowl (5th Place)", homeId: null, awayId: null, played: false }
      ]
    });
  }

  getCurrentWeekMatchups() {
    const weekData = this.schedule.find(s => s.week === this.currentWeek);
    if (!weekData) return [];

    // In week 6 (playoffs), resolve seeds if not yet resolved
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
    if (!matchup) return;

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
      // Auto-validate starters (ensure no injured players are in active 5)
      this.validateTeamStarters(team);
    });

    if (healedPlayers.length > 0) {
      this.leagueNews.unshift(`Injury Update: ${healedPlayers.join(", ")} has been cleared by trainers to return to action!`);
    }

    // 2. Chance of random AI GM proposing an inbound trade to user
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

    this.currentWeek++;
    this.save();
  }

  validateTeamStarters(team) {
    // Remove injured players from starters
    team.starters = team.starters.filter(p => p.injuryWeeksRemaining <= 0);
    // If fewer than 5, pull best healthy bench players
    if (team.starters.length < 5) {
      const healthyBench = team.roster.filter(p => p.injuryWeeksRemaining <= 0 && !team.starters.some(s => s.id === p.id));
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
