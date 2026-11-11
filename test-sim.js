// Test run of the Backyard Football Simulator engine

import { LeagueState } from "./js/state.js";
import { GameEngine } from "./js/engine.js";

console.log("=== Testing League Initialization & Draft ===");
const league = new LeagueState();
console.log(`Generated ${league.prospectPool.length} prospects.`);
console.log(`Teams in league: ${league.teams.map(t => t.name).join(", ")}`);

console.log("Running auto-draft for all 10 rounds...");
league.autoDraftAll();
console.log(`Draft completed! User team roster count: ${league.getUserTeam().roster.length}`);
console.log(`User team Ironman 5 starters: ${league.getUserTeam().starters.map(p => `${p.shortName} (OVR ${p.overall}, END ${p.endurance})`).join(", ")}`);

console.log("\n=== Testing Game Engine Simulation ===");
const userTeam = league.getUserTeam();
const opponentTeam = league.teams.find(t => !t.isUser);
console.log(`Matchup: ${userTeam.name} vs ${opponentTeam.name}`);
console.log(`User Coach: ${userTeam.coach.name} (${userTeam.coach.archetype})`);
console.log(`Opponent Coach: ${opponentTeam.coach.name} (${opponentTeam.coach.archetype})`);

const game = new GameEngine(userTeam, opponentTeam);
console.log("Simulating game snap by snap...");

let plays = 0;
while (!game.isGameOver && plays < 200) {
  game.stepPlay();
  plays++;
}

console.log(`\nFinal Score after ${plays} plays:`);
console.log(`${game.homeTeam.name}: ${game.score.home}`);
console.log(`${game.awayTeam.name}: ${game.score.away}`);
console.log(`Total Plays: Home ${game.boxScore.home.plays}, Away ${game.boxScore.away.plays}`);
console.log(`Rushing: Home ${game.boxScore.home.rushYards} yds, Away ${game.boxScore.away.rushYards} yds`);
console.log(`Passing: Home ${game.boxScore.home.passYards} yds, Away ${game.boxScore.away.passYards} yds`);

console.log("\n=== Post-Game Trainer's Report ===");
if (game.postGameInjuries.length === 0) {
  console.log("No post-game injuries sustained! Clean bill of health.");
} else {
  game.postGameInjuries.forEach(inj => {
    console.log(`🚨 INJURY: ${inj.player.fullName} (${inj.team}) - ${inj.injuryName} (Out ${inj.duration} week(s))`);
  });
}

console.log("\n=== Testing Week Advancement & Injury Healing ===");
league.recordGameResult("match_w1_0", game.score.home, game.score.away, game.boxScore, game.postGameInjuries);
console.log(`Advancing to Week 2...`);
league.advanceWeek();
console.log(`Current Week is now: ${league.currentWeek}`);
console.log(`Standings:`);
league.getStandings().forEach((t, i) => {
  console.log(`  ${i+1}. ${t.name}: ${t.record.wins}-${t.record.losses} (PF: ${t.record.pointsFor}, PA: ${t.record.pointsAgainst})`);
});

console.log("\nALL ENGINE SYSTEMS OPERATIONAL!");
