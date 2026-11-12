// Head Coach archetypes, playbooks, personalities, and interview logic

export const COACH_ARCHETYPES = [
  {
    archetype: "Air Raid",
    runRate: 0.28,
    deepPassBias: 0.65,
    fourthDownAggressiveness: 0.65,
    blitzRate: 0.40,
    twoPointPreference: 0.50,
    philosophy: "Throw the ball until their grass turns into dust. No checkdowns if a kid is sprinting down the sideline.",
    favoritePlay: "30-Yard Hail Mary",
    pressQuote: "If we run the ball twice in a row, somebody call the paramedics—I must have passed out."
  },
  {
    archetype: "Ground & Pound",
    runRate: 0.72,
    deepPassBias: 0.15,
    fourthDownAggressiveness: 0.35,
    blitzRate: 0.35,
    twoPointPreference: 0.20,
    philosophy: "Smash mouth park football. Hand the ball off, chew up dirt, and hit them until the streetlights come on.",
    favoritePlay: "Straight Dive Through Mud",
    pressQuote: "Five yards and a cloud of dust. That's real football."
  },
  {
    archetype: "Chaos Blitz",
    runRate: 0.45,
    deepPassBias: 0.50,
    fourthDownAggressiveness: 0.85,
    blitzRate: 0.80,
    twoPointPreference: 0.75,
    philosophy: "Total frenzy. All five kids rush the passer. We either get a sack-fumble or surrender a touchdown.",
    favoritePlay: "All-Out Dog Blitz",
    pressQuote: "Safeties are for cowards. Everyone attacks the ball!"
  },
  {
    archetype: "Analytical Ace",
    runRate: 0.42,
    deepPassBias: 0.40,
    fourthDownAggressiveness: 0.90,
    blitzRate: 0.45,
    twoPointPreference: 0.90,
    philosophy: "The spreadsheet says punting is mathematically giving up. We go for it on 4th & 3 every single time.",
    favoritePlay: "Quick Out at the First Down Marker",
    pressQuote: "Expected points added don't care about your gut feelings."
  },
  {
    archetype: "Bend-Don't-Break",
    runRate: 0.52,
    deepPassBias: 0.25,
    fourthDownAggressiveness: 0.25,
    blitzRate: 0.20,
    twoPointPreference: 0.15,
    philosophy: "Play safe coverage, avoid interceptions, punt on 4th down, and let the other team self-destruct.",
    favoritePlay: "5-Yard Slant & Protect the Ball",
    pressQuote: "Field position wins championships. Never risk the ball in our own half."
  }
];

export const COACH_NAMES = [
  { name: "Coach 'Mad Dog' Miller", title: "Defensive Guru" },
  { name: "Annie 'Rocket' O'Reilly", title: "Offensive Mastermind" },
  { name: "Pete 'Steamroller' Henderson", title: "Park Legend" },
  { name: "Dr. Chloe Chen", title: "Analytics Prodigy" },
  { name: "Benny 'The Gambler' Vance", title: "Riverboat Playcaller" },
  { name: "Coach 'Whispering' Bob", title: "Fundamentals Specialist" },
  { name: "Jada 'Lightning' Washington", title: "Up-Tempo Innovator" },
  { name: "Gabe 'Iron Mike' Novak", title: "Trench Warfare Enthusiast" }
];

let nextCoachId = 1;

export function createCoach(archetypeIndex = null, nameObj = null) {
  const arch = archetypeIndex !== null 
    ? COACH_ARCHETYPES[archetypeIndex % COACH_ARCHETYPES.length] 
    : COACH_ARCHETYPES[Math.floor(Math.random() * COACH_ARCHETYPES.length)];
  
  const chosenName = nameObj || COACH_NAMES[Math.floor(Math.random() * COACH_NAMES.length)];

  return {
    id: "c_" + (nextCoachId++),
    name: chosenName.name,
    title: chosenName.title,
    archetype: arch.archetype,
    runRate: arch.runRate,
    deepPassBias: arch.deepPassBias,
    fourthDownAggressiveness: arch.fourthDownAggressiveness,
    blitzRate: arch.blitzRate,
    twoPointPreference: arch.twoPointPreference,
    philosophy: arch.philosophy,
    favoritePlay: arch.favoritePlay,
    pressQuote: arch.pressQuote,
    reputation: Math.floor(Math.random() * 25) + 70, // 70-95
    wins: 0,
    losses: 0,
    interviewQA: [
      {
        q: "What is your game plan on 4th & 2 near midfield?",
        a: arch.fourthDownAggressiveness > 0.6 
          ? "We're going for it, no question! Punting is for scaredy-cats. Hand the rock off and move the sticks!"
          : "We play the field position game. Pin them deep at their 5-yard line and let our defense swallow them whole."
      },
      {
        q: "How do you handle your Ironman 5 when fatigue sets in on Drive 4?",
        a: "Endurance is mental! You grit your teeth, hydrate with orange slices, and keep sprinting until the final whistle."
      },
      {
        q: "Do you prefer the 1-point conversion or the 2-point gamble?",
        a: arch.twoPointPreference > 0.5 
          ? "Two points, every single time. Put the defense on their heels from the 10-yard line!"
          : "Take the guaranteed point from the 5-yard line. Points are gold in a 50-yard sandbox."
      }
    ]
  };
}

export function generateCoachMarket(count = 4) {
  const coaches = [];
  const usedArchetypes = new Set();
  
  for (let i = 0; i < count; i++) {
    let archIdx = i % COACH_ARCHETYPES.length;
    let nameObj = COACH_NAMES[i % COACH_NAMES.length];
    coaches.push(createCoach(archIdx, nameObj));
  }
  return coaches;
}
