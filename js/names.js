// Player generation and names database for Backyard Football Simulator

export const FIRST_NAMES = [
  "Leo", "Maya", "Eli", "Sammy", "Chloe", "Dante", "Zoe", "Marcus",
  "Toby", "Ruby", "Finn", "Nia", "Dexter", "Penny", "Gabe", "Ivy",
  "Nico", "Jada", "Benny", "Sadie", "Axel", "Tessa", "Milo", "Kora",
  "Brody", "Skye", "Jasper", "Piper", "Cole", "Harper", "Cruz", "Willa",
  "Quinn", "Stella", "Rocco", "Gemma", "Otis", "Luna", "Beau", "Hazel",
  "Ziggy", "Daisy", "Knox", "Cleo", "Bodie", "Willow", "Cash", "Freya"
];

export const LAST_NAMES = [
  "Miller", "Castillo", "O'Connor", "Chen", "Novak", "Washington",
  "Kowalski", "Santos", "Dubois", "Kim", "Patel", "Gomez",
  "Fletcher", "Nakamura", "Becker", "Larson", "Morales", "Vance",
  "Sterling", "Rios", "Callahan", "Hawkins", "Mercer", "Brennan",
  "Delgado", "Sinclair", "Holloway", "Abadi", "Lindqvist", "Fontana"
];

export const NICKNAMES = [
  "The Rocket", "Butterfingers", "Tree Trunk", "Lightning", "Tank",
  "Squeak", "Cannon", "Sticky Fingers", "Roadrunner", "Bulldozer",
  "Pocket Knife", "Cheetah", "Big Rig", "Grasshopper", "Pancake",
  "The Anvil", "Whirlwind", "Noodle Arm", "Bumblebee", "Brickhouse"
];

export const ARCHETYPES = [
  { name: "Speed Demon", bias: { speed: 85, throwing: 45, hands: 75, tackling: 50, endurance: 80 } },
  { name: "Gunslinger", bias: { speed: 55, throwing: 88, hands: 60, tackling: 40, endurance: 70 } },
  { name: "Brick Wall", bias: { speed: 45, throwing: 35, hands: 45, tackling: 90, endurance: 75 } },
  { name: "Two-Way Ace", bias: { speed: 78, throwing: 76, hands: 76, tackling: 74, endurance: 78 } },
  { name: "Iron Kid", bias: { speed: 68, throwing: 60, hands: 65, tackling: 70, endurance: 95 } },
  { name: "Glass Cannon", bias: { speed: 90, throwing: 85, hands: 80, tackling: 40, endurance: 45 } },
  { name: "Ball Hawk", bias: { speed: 80, throwing: 50, hands: 86, tackling: 65, endurance: 72 } }
];

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function gaussianNoise(variance = 7) {
  return Math.floor((Math.random() + Math.random() + Math.random() - 1.5) * 2 * variance);
}

function clamp(val, min = 25, max = 99) {
  return Math.max(min, Math.min(max, val));
}

let nextPlayerId = 1;

export function createPlayer(customOverrides = {}) {
  const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  const hasNickname = Math.random() < 0.65;
  const nickname = hasNickname ? NICKNAMES[Math.floor(Math.random() * NICKNAMES.length)] : null;

  const archetype = ARCHETYPES[Math.floor(Math.random() * ARCHETYPES.length)];

  // Stats with archetype bias and random natural variance
  const speed = clamp(archetype.bias.speed + gaussianNoise(8));
  const throwing = clamp(archetype.bias.throwing + gaussianNoise(8));
  const hands = clamp(archetype.bias.hands + gaussianNoise(8));
  const tackling = clamp(archetype.bias.tackling + gaussianNoise(8));
  const endurance = clamp(archetype.bias.endurance + gaussianNoise(8));

  // Height & Weight correlated reasonably with traits
  // Height in inches: 48 (4'0") to 68 (5'8")
  const baseHeight = 52 + Math.floor((speed < 60 ? 5 : 0) + (tackling > 70 ? 4 : 0) + Math.random() * 8);
  const heightInches = Math.max(48, Math.min(68, baseHeight));
  const feet = Math.floor(heightInches / 12);
  const inches = heightInches % 12;

  // Weight in lbs: 65 to 160 lbs
  const baseWeight = 70 + (tackling * 0.6) + ((heightInches - 48) * 2.5) + gaussianNoise(10);
  const weight = Math.max(65, Math.min(165, Math.floor(baseWeight)));

  const overall = Math.round((speed * 0.28) + (throwing * 0.20) + (hands * 0.20) + (tackling * 0.20) + (endurance * 0.12));

  // Dynasty Age: Kids join the neighborhood league between ages 8 and 11
  const age = customOverrides.age || randomBetween(8, 11);
  const yearsRemaining = Math.max(1, 13 - age); // Grows up / aged out at 13

  const player = {
    id: "p_" + (nextPlayerId++),
    firstName,
    lastName,
    nickname,
    fullName: nickname ? `${firstName} "${nickname}" ${lastName}` : `${firstName} ${lastName}`,
    shortName: nickname ? `"${nickname}" ${lastName}` : `${firstName.charAt(0)}. ${lastName}`,
    archetype: archetype.name,
    age,
    yearsRemaining,
    height: `${feet}'${inches}"`,
    heightInches,
    weight,
    speed,
    throwing,
    hands,
    tackling,
    endurance,
    overall,
    // Season state
    injuryWeeksRemaining: 0,
    injuryDescription: null,
    careerStats: {
      passYds: 0,
      passTDs: 0,
      interceptions: 0,
      rushYds: 0,
      rushTDs: 0,
      catches: 0,
      recYds: 0,
      recTDs: 0,
      tackles: 0,
      sacks: 0,
      defInterceptions: 0,
      gamesPlayed: 0
    },
    ...customOverrides
  };

  return player;
}

export function generateProspectPool(count = 60) {
  const pool = [];
  for (let i = 0; i < count; i++) {
    pool.push(createPlayer());
  }
  // Sort by overall descending
  return pool.sort((a, b) => b.overall - a.overall);
}
