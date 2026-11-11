// Teams, AI GM logic, Snake Draft mechanics, and Trade AI

import { createPlayer, generateProspectPool } from "./names.js";
import { createCoach, COACH_NAMES } from "./coaches.js";

export const LEAGUE_TEAMS = [
  {
    id: "team_user",
    name: "Cul-de-sac Crushers",
    short: "CRUSH",
    color: "#e11d48", // Rose Red
    accent: "#ffe4e6",
    emoji: "🔨",
    isUser: true,
    gmName: "You (Owner)",
    philosophy: "Winning the cul-de-sac at all costs"
  },
  {
    id: "team_treehouse",
    name: "Treehouse Titans",
    short: "TITAN",
    color: "#16a34a", // Forest Green
    accent: "#dcfce7",
    emoji: "🌲",
    isUser: false,
    gmName: "Spike Jenkins",
    gmStyle: "Loves speed demons and trick plays"
  },
  {
    id: "team_mudpuddle",
    name: "Mud Puddle Marauders",
    short: "MUD",
    color: "#b45309", // Earth Amber
    accent: "#fef3c7",
    emoji: "🐗",
    isUser: false,
    gmName: "Grizz McKale",
    gmStyle: "Values weight, tackling, and bruised shins"
  },
  {
    id: "team_sandbox",
    name: "Sandbox Strikers",
    short: "SAND",
    color: "#0284c7", // Sky Blue
    accent: "#e0f2fe",
    emoji: "🏖️",
    isUser: false,
    gmName: "Penny Vance",
    gmStyle: "Analytical, hoarders of endurance freaks"
  },
  {
    id: "team_sidewalk",
    name: "Sidewalk Scrappers",
    short: "SCRAP",
    color: "#7c3aed", // Electric Purple
    accent: "#f3e8ff",
    emoji: "⚡",
    isUser: false,
    gmName: "Axel Rios",
    gmStyle: "Aggressive blitz lovers and risk takers"
  },
  {
    id: "team_blitzers",
    name: "Backyard Blitzers",
    short: "BLITZ",
    color: "#ea580c", // Fiery Orange
    accent: "#ffedd5",
    emoji: "🔥",
    isUser: false,
    gmName: "Coach Carmelo",
    gmStyle: "Balanced two-way squad builder"
  }
];

export function initializeLeagueTeams() {
  return LEAGUE_TEAMS.map((t, idx) => ({
    ...t,
    coach: createCoach(idx, COACH_NAMES[idx % COACH_NAMES.length]),
    roster: [],
    starters: [], // exact 5 players chosen for the Ironman 5
    record: { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 }
  }));
}

// Auto-select the top 5 healthy players as the Ironman 5
export function autoSetStarters(team) {
  const healthy = team.roster.filter(p => p.injuryWeeksRemaining <= 0);
  // Sort healthy players by overall rating
  const sorted = [...healthy].sort((a, b) => b.overall - a.overall);
  team.starters = sorted.slice(0, 5);
  return team.starters;
}

// AI Draft Logic: picks best available or positional need
export function aiChooseDraftPick(team, availableProspects) {
  if (availableProspects.length === 0) return null;

  const currentRoster = team.roster;
  const hasQB = currentRoster.some(p => p.throwing >= 70);
  const hasSpeedster = currentRoster.some(p => p.speed >= 80);
  const hasTackler = currentRoster.some(p => p.tackling >= 75);

  // If missing a passer, prioritize throwing
  if (!hasQB && currentRoster.length < 5) {
    const bestThrower = [...availableProspects].sort((a, b) => b.throwing - a.throwing)[0];
    if (bestThrower && bestThrower.throwing >= 68) return bestThrower;
  }

  // If missing a speedster, prioritize speed
  if (!hasSpeedster && currentRoster.length < 6) {
    const fastest = [...availableProspects].sort((a, b) => b.speed - a.speed)[0];
    if (fastest && fastest.speed >= 75) return fastest;
  }

  // If missing a tackler, prioritize tackling
  if (!hasTackler && currentRoster.length < 7) {
    const bestTackler = [...availableProspects].sort((a, b) => b.tackling - a.tackling)[0];
    if (bestTackler && bestTackler.tackling >= 70) return bestTackler;
  }

  // Default: Best overall player available with endurance tie-breaker
  return [...availableProspects].sort((a, b) => (b.overall * 0.8 + b.endurance * 0.2) - (a.overall * 0.8 + a.endurance * 0.2))[0];
}

// Evaluate trade proposal from user to AI team
export function evaluateTrade(aiTeam, offeredPlayer, requestedPlayer) {
  const valueOffered = offeredPlayer.overall + (offeredPlayer.endurance * 0.15) - (offeredPlayer.injuryWeeksRemaining * 10);
  const valueRequested = requestedPlayer.overall + (requestedPlayer.endurance * 0.15) - (requestedPlayer.injuryWeeksRemaining * 10);

  const diff = valueOffered - valueRequested;

  if (diff >= 3) {
    return {
      accepted: true,
      message: `"${aiTeam.gmName}: Deal! ${offeredPlayer.shortName} gives our squad exactly what we've been missing. Take good care of ${requestedPlayer.shortName}!"`
    };
  } else if (diff >= -2) {
    return {
      accepted: true,
      message: `"${aiTeam.gmName}: Hmm... you drive a hard bargain, but I like the upside. Let's do it! Paperwork signed."`
    };
  } else {
    return {
      accepted: false,
      message: `"${aiTeam.gmName}: Are you kidding me? ${requestedPlayer.shortName} is the cornerstone of our playground! ${offeredPlayer.shortName} doesn't cut it. Sweeten the pot or no deal."`
    };
  }
}

// Generate an inbound trade proposal from an AI GM to the User
export function generateInboundTrade(userTeam, aiTeam) {
  if (userTeam.roster.length < 6 || aiTeam.roster.length < 6) return null;

  // AI looks for a player on user's team who is strong where AI is weak
  const userTargets = userTeam.roster.filter(p => p.injuryWeeksRemaining <= 0);
  const aiOffers = aiTeam.roster.filter(p => p.injuryWeeksRemaining <= 0);

  if (userTargets.length === 0 || aiOffers.length === 0) return null;

  // Pick an interesting target
  const target = userTargets[Math.floor(Math.random() * userTargets.length)];
  // AI offers a player with roughly comparable overall
  const offer = aiOffers.reduce((best, curr) => {
    return Math.abs(curr.overall - target.overall) < Math.abs(best.overall - target.overall) ? curr : best;
  }, aiOffers[0]);

  if (offer.id === target.id) return null;

  const pitchTemplates = [
    `"Word on the blacktop is you need more depth. We'll give you ${offer.fullName} (${offer.archetype}, OVR ${offer.overall}) in exchange for ${target.fullName} (${target.archetype}, OVR ${target.overall}). What do you say?"`,
    `"Hey GM, our coach is begging for a kid with ${target.fullName}'s skillset. We're willing to part with our stud ${offer.fullName} to make it happen today."`,
    `"Trade alert from the Treehouse! We're putting ${offer.fullName} on the trade block. Send us ${target.fullName} and the trade is locked."`
  ];

  return {
    id: "trade_" + Date.now() + "_" + Math.floor(Math.random()*1000),
    fromTeam: aiTeam,
    toTeam: userTeam,
    offering: offer,
    requesting: target,
    message: pitchTemplates[Math.floor(Math.random() * pitchTemplates.length)],
    status: "PENDING"
  };
}
