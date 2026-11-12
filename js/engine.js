// Dust Dynasty Simulation Engine
// Implements 5v5 Ironman rules, 50-yard makeshift park field, 30-yard pass cap, fatigue decay, and post-game injuries

export const FIELD_LENGTH = 50;
export const MIDFIELD = 25;
export const MAX_PASS_DISTANCE = 30;

// Common injury types for the post-game trainer's report
export const INJURY_TABLE = [
  { name: "Scraped Knees & Deep Gravel Burn", duration: 1, severity: "Minor" },
  { name: "Twisted Ankle in Gopher Hole", duration: 1, severity: "Minor" },
  { name: "Bruised Ribs on Hardpan Dirt", duration: 1, severity: "Moderate" },
  { name: "Sprained Ankle on Uneven Turf", duration: 2, severity: "Moderate" },
  { name: "Sprained Wrist Bracing on Hard Dirt", duration: 2, severity: "Moderate" },
  { name: "Pebble Bruise & Charlie Horse", duration: 2, severity: "Moderate" },
  { name: "Stinger from Hard Mud Collision", duration: 3, severity: "Severe" },
  { name: "Hyperextended Elbow on Patchy Field", duration: 2, severity: "Moderate" }
];

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Compute player's fatigued stats for the current drive
export function getFatiguedPlayer(player, driveNumber) {
  // Drives 1-2: light fatigue; 3+: progressive
  const driveFactor = Math.max(0, driveNumber - 1);
  const baseDecay = Math.min(0.35, driveFactor * 0.055);
  // High endurance substantially cushions fatigue
  const enduranceShield = player.endurance / 130; // 99 endurance cushions ~76% of decay
  const actualDecay = Math.max(0, baseDecay * (1 - enduranceShield));

  return {
    ...player,
    decayPercent: Math.round(actualDecay * 100),
    effectiveSpeed: Math.max(20, Math.round(player.speed * (1 - actualDecay))),
    effectiveThrowing: Math.max(20, Math.round(player.throwing * (1 - actualDecay))),
    effectiveHands: Math.max(20, Math.round(player.hands * (1 - actualDecay))),
    effectiveTackling: Math.max(20, Math.round(player.tackling * (1 - actualDecay))),
    effectiveEndurance: player.endurance
  };
}

export class GameEngine {
  constructor(homeTeam, awayTeam, options = {}) {
    this.homeTeam = homeTeam;
    this.awayTeam = awayTeam;
    this.options = options;

    // The 5 active starters (Ironman 5)
    this.homeStarters = homeTeam.starters.slice(0, 5);
    this.awayStarters = awayTeam.starters.slice(0, 5);

    // Coaches
    this.homeCoach = homeTeam.coach;
    this.awayCoach = awayTeam.coach;

    // Game state
    this.quarter = 1;
    this.gameClock = 360; // 360 seconds per half (6 mins) -> 12 min total game
    this.half = 1;
    this.score = { home: 0, away: 0 };
    this.possession = "home"; // "home" or "away"
    this.driveNumber = { home: 1, away: 1 };
    
    // Ball position: 0 to 50 yards (0 = own goal line, 50 = opponent goal line)
    this.yardLine = 5; 
    this.down = 1;
    this.yardsToGain = 20; // from 5 to 25 is 20 yards
    this.firstDownMarker = MIDFIELD; // initially 25, once crossed it becomes 50 (Touchdown)

    this.playLog = [];
    this.gameEvents = [];
    this.boxScore = {
      home: { passYards: 0, rushYards: 0, firstDowns: 0, turnovers: 0, plays: 0, players: {} },
      away: { passYards: 0, rushYards: 0, firstDowns: 0, turnovers: 0, plays: 0, players: {} }
    };

    // Tracking hits/wear for post-game injuries
    this.injuryPits = {};
    [...this.homeStarters, ...this.awayStarters].forEach(p => {
      this.injuryPits[p.id] = { hitsTaken: 0, snaps: 0, player: p };
    });

    // Initialize boxscore player stat cards
    this.initPlayerBoxScores();
    this.isGameOver = false;
    this.pendingPAT = false;
    this.scoringTeamKey = null;
  }

  initPlayerBoxScores() {
    [...this.homeStarters, ...this.awayStarters].forEach(p => {
      const teamKey = this.homeStarters.some(s => s.id === p.id) ? "home" : "away";
      this.boxScore[teamKey].players[p.id] = {
        name: p.shortName,
        fullName: p.fullName,
        passAtt: 0,
        passCmp: 0,
        passYds: 0,
        passTD: 0,
        passInt: 0,
        rushAtt: 0,
        rushYds: 0,
        rushTD: 0,
        targets: 0,
        receptions: 0,
        recYds: 0,
        recTD: 0,
        tackles: 0,
        sacks: 0,
        defInt: 0
      };
    });
  }

  getOffenseTeam() {
    return this.possession === "home" ? this.homeTeam : this.awayTeam;
  }

  getDefenseTeam() {
    return this.possession === "home" ? this.awayTeam : this.homeTeam;
  }

  getOffenseStarters() {
    const list = this.possession === "home" ? this.homeStarters : this.awayStarters;
    const driveNum = this.driveNumber[this.possession];
    return list.map(p => getFatiguedPlayer(p, driveNum));
  }

  getDefenseStarters() {
    const defKey = this.possession === "home" ? "away" : "home";
    const list = defKey === "home" ? this.homeStarters : this.awayStarters;
    const driveNum = this.driveNumber[defKey];
    return list.map(p => getFatiguedPlayer(p, driveNum));
  }

  getOffenseCoach() {
    return this.possession === "home" ? this.homeCoach : this.awayCoach;
  }

  getDefenseCoach() {
    return this.possession === "home" ? this.awayCoach : this.homeCoach;
  }

  // Assign offensive roles among the 5 starters based on strengths
  assignOffenseRoles(offense5) {
    // Best thrower is QB
    const sortedByThrow = [...offense5].sort((a, b) => b.effectiveThrowing - a.effectiveThrowing);
    const qb = sortedByThrow[0];

    const nonQBs = offense5.filter(p => p.id !== qb.id);
    // Fastest non-QB is RB/Slot
    const sortedBySpeed = [...nonQBs].sort((a, b) => b.effectiveSpeed - a.effectiveSpeed);
    const rb = sortedBySpeed[0];

    // Best hands among rest is WR1
    const nonQBRB = nonQBs.filter(p => p.id !== rb.id);
    const sortedByHands = [...nonQBRB].sort((a, b) => b.effectiveHands - a.effectiveHands);
    const wr1 = sortedByHands[0];
    const wr2 = sortedByHands[1];
    const center = sortedByHands[2]; // remaining kid snaps and blocks

    return { qb, rb, wr1, wr2, center };
  }

  assignDefenseRoles(defense5) {
    // Top tackler/weight is Rusher / LB
    const sortedByTackle = [...defense5].sort((a, b) => (b.effectiveTackling + b.weight*0.2) - (a.effectiveTackling + a.weight*0.2));
    const rusher = sortedByTackle[0];
    const middleLB = sortedByTackle[1];

    const coverKids = defense5.filter(p => p.id !== rusher.id && p.id !== middleLB.id);
    // Fastest cover kid is CB1
    const sortedCover = [...coverKids].sort((a, b) => (b.effectiveSpeed + b.effectiveHands) - (a.effectiveSpeed + a.effectiveHands));
    const cb1 = sortedCover[0];
    const cb2 = sortedCover[1];
    const safety = sortedCover[2];

    return { rusher, middleLB, cb1, cb2, safety };
  }

  // Execute one complete play
  stepPlay() {
    if (this.isGameOver) return null;

    // If a touchdown occurred on the previous play, this play resolves the PAT
    if (this.pendingPAT) {
      return this.resolvePAT();
    }

    const offCoach = this.getOffenseCoach();
    const defCoach = this.getDefenseCoach();
    const offStarters = this.getOffenseStarters();
    const defStarters = this.getDefenseStarters();

    const offRoles = this.assignOffenseRoles(offStarters);
    const defRoles = this.assignDefenseRoles(defStarters);

    // Track snaps
    [...offStarters, ...defStarters].forEach(p => {
      if (this.injuryPits[p.id]) this.injuryPits[p.id].snaps++;
    });

    // 4th Down Decision
    if (this.down === 4) {
      const decision = this.decideFourthDown(offCoach);
      if (decision === "PUNT") {
        return this.executePunt();
      }
    }

    // Call Play: Run vs Pass
    let isRun = Math.random() < offCoach.runRate;
    // Situational adjustment: 3rd & long (> 8 yds) tilts towards pass
    if (this.down >= 3 && this.yardsToGain > 7) {
      isRun = Math.random() < 0.20;
    }
    // Goal line (inside 4 yds) tilts towards run
    if (FIELD_LENGTH - this.yardLine <= 4) {
      isRun = Math.random() < (offCoach.runRate + 0.25);
    }

    // Defensive play call: Blitz vs Coverage
    const isBlitz = Math.random() < defCoach.blitzRate;

    let playResult;
    if (isRun) {
      playResult = this.resolveRunPlay(offRoles, defRoles, isBlitz);
    } else {
      playResult = this.resolvePassPlay(offRoles, defRoles, isBlitz, offCoach.deepPassBias);
    }

    // Update play clocks and records
    this.recordPlay(playResult);
    return playResult;
  }

  decideFourthDown(coach) {
    const yardsLeft = this.yardsToGain;
    const fieldPos = this.yardLine;

    // In enemy territory (past 30 yds) or short yardage (<= 2 yds)
    if (fieldPos >= 30 || yardsLeft <= 2) {
      if (Math.random() < (coach.fourthDownAggressiveness + 0.2)) {
        return "GO";
      }
    }

    // Trailing in 4th quarter
    const offScore = this.score[this.possession];
    const defScore = this.score[this.possession === "home" ? "away" : "home"];
    if (this.quarter === 4 && offScore < defScore) {
      return "GO";
    }

    // Coach base aggressiveness
    if (Math.random() < (coach.fourthDownAggressiveness * 0.4)) {
      return "GO";
    }

    return "PUNT";
  }

  executePunt() {
    const puntingTeam = this.possession;
    const puntDesc = `[4th & ${this.yardsToGain}] ${this.getOffenseTeam().name} elects to PUNT! The ball spirals downfield and pins the opponent at their 5-yard line.`;
    
    // Flip possession; opponent starts at their 5-yard line
    this.flipPossession(5);

    const event = {
      type: "PUNT",
      possession: puntingTeam,
      yardLine: this.yardLine,
      yardsGained: 0,
      description: puntDesc,
      score: { ...this.score },
      down: this.down,
      yardsToGain: this.yardsToGain,
      quarter: this.quarter,
      gameClock: this.gameClock
    };

    this.playLog.unshift(event);
    this.drainClock(15);
    return event;
  }

  resolveRunPlay(off, def, isBlitz) {
    const isQbKeeper = Math.random() < 0.15;
    const runner = isQbKeeper ? off.qb : off.rb;
    const blocker = off.center;
    const primaryTackler = isBlitz ? def.rusher : def.middleLB;

    // Track hit on runner
    if (this.injuryPits[runner.id]) this.injuryPits[runner.id].hitsTaken++;

    // Comparative math: Runner speed/agility + blocker vs Tackler shed/tackle
    const runnerScore = runner.effectiveSpeed * 0.6 + runner.weight * 0.2 + blocker.effectiveTackling * 0.2 + randomFloat(-15, 15);
    const defenseScore = primaryTackler.effectiveTackling * 0.6 + primaryTackler.weight * 0.2 + (isBlitz ? 10 : 0) + randomFloat(-15, 15);

    const diff = runnerScore - defenseScore;

    let yards = 0;
    let desc = "";
    let isFumble = false;

    // Determine specific run concept
    const concept = isQbKeeper ? "QB_KEEPER" : (Math.random() < 0.5 ? "HB_DIVE" : "OUTSIDE_SWEEP");
    const defConcept = isBlitz ? "BANZAI_BLITZ" : "STACK_BOX";

    if (diff < -20) {
      // Stuffed behind line of scrimmage
      yards = -randomInt(1, 3);
      desc = `${primaryTackler.shortName} bursts through the mud and stuffs ${runner.shortName} in the backfield for a loss of ${Math.abs(yards)}!`;
    } else if (diff < 0) {
      // Short gain
      yards = randomInt(1, 3);
      desc = `${runner.shortName} plows forward between tackles for ${yards} yard${yards > 1 ? 's' : ''}, stopped by ${primaryTackler.shortName}.`;
    } else if (diff < 20) {
      // Good run
      yards = randomInt(4, 9);
      desc = `${runner.shortName} hits the outside lane with a nifty cut for a ${yards}-yard pickup!`;
    } else {
      // Breakaway run
      yards = randomInt(10, 24);
      desc = `EXPLOSIVE PLAY! ${runner.shortName} shakes off ${primaryTackler.shortName} with blistering speed for ${yards} yards!`;
    }

    // Fumble chance on heavy tackle (0.8%)
    if (primaryTackler.effectiveTackling > 80 && Math.random() < 0.015) {
      isFumble = true;
      desc += ` FUMBLE! The ball popped loose and recovered by the defense!`;
    }

    // Box score update
    const offBox = this.boxScore[this.possession].players[runner.id];
    offBox.rushAtt++;
    offBox.rushYds += yards;

    const defBox = this.boxScore[this.possession === "home" ? "away" : "home"].players[primaryTackler.id];
    defBox.tackles++;

    return {
      playType: "RUN",
      concept,
      defConcept,
      startYardLine: this.yardLine,
      yardsGained: yards,
      description: desc,
      ballCarrier: runner,
      tackler: primaryTackler,
      isFumble,
      isTurnover: isFumble,
      isSack: false,
      isComplete: true
    };
  }

  resolvePassPlay(off, def, isBlitz, deepBias) {
    const qb = off.qb;
    const targetWR = Math.random() < 0.60 ? off.wr1 : off.wr2;
    const coverageDB = targetWR.id === off.wr1.id ? def.cb1 : def.cb2;
    const rusher = def.rusher;

    // Sack calculation: Rusher speed vs Blocker pass pro
    const passRushScore = rusher.effectiveSpeed * 0.5 + rusher.effectiveTackling * 0.5 + (isBlitz ? 15 : 0) + randomFloat(-10, 15);
    const passProScore = off.center.effectiveTackling * 0.7 + off.center.weight * 0.3 + randomFloat(-10, 15);

    const defConcept = isBlitz ? "BANZAI_BLITZ" : (Math.random() < 0.5 ? "MAN_COVERAGE" : "COVER_2_ZONE");

    if (passRushScore - passProScore > 26) {
      // SACK!
      const sackYards = -randomInt(3, 7);
      if (this.injuryPits[qb.id]) this.injuryPits[qb.id].hitsTaken += 2;
      
      const qbBox = this.boxScore[this.possession].players[qb.id];
      qbBox.rushYds += sackYards; // statistical loss
      const rushBox = this.boxScore[this.possession === "home" ? "away" : "home"].players[rusher.id];
      rushBox.sacks++;
      rushBox.tackles++;

      return {
        playType: "PASS",
        concept: "DROPBACK_PASS",
        defConcept,
        startYardLine: this.yardLine,
        yardsGained: sackYards,
        description: `SACK! ${rusher.shortName} screams off the edge and crushes ${qb.shortName} before he can release the ball (${sackYards} yds)!`,
        ballCarrier: qb,
        tackler: rusher,
        targetReceiver: targetWR,
        isSack: true,
        isComplete: false,
        isTurnover: false
      };
    }

    // Determine target depth (strictly capped at 30 yards maximum)
    let depthType = "SHORT";
    let targetDistance = randomInt(4, 9);
    let concept = Math.random() < 0.6 ? "QUICK_SLANTS" : "WR_SCREEN";
    const deepRoll = Math.random();

    if (deepRoll < deepBias * 0.45) {
      depthType = "DEEP";
      concept = "FOUR_VERTS";
      targetDistance = Math.min(MAX_PASS_DISTANCE, randomInt(18, 30));
    } else if (deepRoll < (deepBias * 0.75 + 0.35)) {
      depthType = "MEDIUM";
      concept = "OUT_ROUTES";
      targetDistance = randomInt(10, 17);
    }

    // Cannot throw further than opponent's endzone (FIELD_LENGTH - yardLine)
    const yardsToEndZone = FIELD_LENGTH - this.yardLine;
    if (targetDistance > yardsToEndZone) {
      targetDistance = yardsToEndZone;
    }

    // QB Accuracy & Separation math
    const qbAccuracy = qb.effectiveThrowing + randomFloat(-15, 15);
    const separation = (targetWR.effectiveSpeed * 0.6 + targetWR.effectiveHands * 0.4) 
                     - (coverageDB.effectiveSpeed * 0.6 + coverageDB.effectiveHands * 0.4) 
                     + randomFloat(-20, 20);

    const passDifficulty = depthType === "DEEP" ? 30 : (depthType === "MEDIUM" ? 15 : 0);
    const throwQuality = qbAccuracy + separation - passDifficulty;

    const qbBox = this.boxScore[this.possession].players[qb.id];
    const wrBox = this.boxScore[this.possession].players[targetWR.id];
    const dbBox = this.boxScore[this.possession === "home" ? "away" : "home"].players[coverageDB.id];

    qbBox.passAtt++;
    wrBox.targets++;

    // Interception Check
    if (throwQuality < -28 && coverageDB.effectiveHands > 50) {
      qbBox.passInt++;
      dbBox.defInt++;
      return {
        playType: "PASS",
        concept,
        defConcept,
        startYardLine: this.yardLine,
        yardsGained: 0,
        description: `INTERCEPTED! ${qb.shortName} forced a dangerous throw into double coverage and ${coverageDB.shortName} picks it off!`,
        ballCarrier: qb,
        tackler: coverageDB,
        targetReceiver: targetWR,
        isTurnover: true,
        isInterception: true,
        isComplete: false
      };
    }

    // Incompletion Check
    if (throwQuality < 0) {
      let reason = "thrown just out of reach";
      if (separation < -10) {
        reason = `batted down by ${coverageDB.shortName}`;
      } else if (targetWR.effectiveHands < 60 && Math.random() < 0.4) {
        reason = `dropped right through ${targetWR.shortName}'s hands!`;
      }
      return {
        playType: "PASS",
        concept,
        defConcept,
        startYardLine: this.yardLine,
        yardsGained: 0,
        description: `Incomplete. ${qb.shortName}'s pass intended for ${targetWR.shortName} was ${reason}.`,
        ballCarrier: qb,
        targetReceiver: targetWR,
        isTurnover: false,
        isComplete: false
      };
    }

    // Complete Pass!
    let yac = 0; // yards after catch
    if (targetWR.effectiveSpeed > coverageDB.effectiveSpeed) {
      yac = randomInt(1, Math.min(10, Math.max(1, FIELD_LENGTH - (this.yardLine + targetDistance))));
    }

    const totalGain = Math.min(yardsToEndZone, targetDistance + yac);
    qbBox.passCmp++;
    qbBox.passYds += totalGain;
    wrBox.receptions++;
    wrBox.recYds += totalGain;
    dbBox.tackles++;

    if (this.injuryPits[targetWR.id]) this.injuryPits[targetWR.id].hitsTaken++;

    const desc = depthType === "DEEP"
      ? `DEEP STRIKE! ${qb.shortName} unloads a ${targetDistance}-yard missile to ${targetWR.shortName} down the sideline (+${totalGain} yds)!`
      : `Complete! ${qb.shortName} fires to ${targetWR.shortName} across the middle for a gain of ${totalGain} yards.`;

    return {
      playType: "PASS",
      concept,
      defConcept,
      startYardLine: this.yardLine,
      yardsGained: totalGain,
      targetDistance,
      yac,
      description: desc,
      ballCarrier: targetWR,
      tackler: coverageDB,
      targetReceiver: targetWR,
      isTurnover: false,
      isComplete: true,
      passer: qb,
      receiver: targetWR
    };
  }

  recordPlay(result) {
    const offenseTeamKey = this.possession;
    const teamBox = this.boxScore[offenseTeamKey];
    teamBox.plays++;

    if (result.playType === "RUN") teamBox.rushYards += result.yardsGained;
    if (result.playType === "PASS" && result.isComplete) teamBox.passYards += result.yardsGained;

    // Advance yardline
    this.yardLine += result.yardsGained;
    // Bound check: cannot go behind own 1 yard line
    if (this.yardLine < 1) this.yardLine = 1;

    // Check for Turnover
    if (result.isTurnover) {
      teamBox.turnovers++;
      this.playLog.unshift({
        ...result,
        score: { ...this.score },
        down: this.down,
        yardsToGain: this.yardsToGain,
        yardLine: this.yardLine,
        quarter: this.quarter,
        gameClock: this.gameClock
      });
      // Turnover on downs / INT / Fumble: Opponent takes over at current spot (flipped from their perspective)
      const opponentSpot = FIELD_LENGTH - this.yardLine;
      this.flipPossession(Math.max(1, Math.min(49, opponentSpot)));
      this.drainClock(randomInt(20, 35));
      return;
    }

    // Check for Touchdown! (Reached or passed 50 yards)
    if (this.yardLine >= FIELD_LENGTH) {
      this.score[offenseTeamKey] += 6;
      result.isTouchdown = true;
      result.description += ` TOUCHDOWN ${this.getOffenseTeam().name}!!!`;

      // Update player TD stats
      if (result.playType === "RUN") {
        this.boxScore[offenseTeamKey].players[result.ballCarrier.id].rushTD++;
      } else if (result.playType === "PASS") {
        this.boxScore[offenseTeamKey].players[result.passer.id].passTD++;
        this.boxScore[offenseTeamKey].players[result.receiver.id].recTD++;
      }

      this.playLog.unshift({
        ...result,
        score: { ...this.score },
        down: this.down,
        yardsToGain: 0,
        yardLine: 50,
        quarter: this.quarter,
        gameClock: this.gameClock
      });

      // Set pending PAT so the next user play execution resolves the extra point attempt
      this.pendingPAT = true;
      this.scoringTeamKey = offenseTeamKey;
      this.yardLine = 50; // Ball placed at goal line for PAT setup
      return;
    }

    // Check First Down Progression
    // Rule: Crossing 25 grants fresh 4 downs to score (target 50)
    let achievedFirstDown = false;
    if (this.firstDownMarker === MIDFIELD && this.yardLine >= MIDFIELD) {
      // Awarded fresh 4 downs to score!
      achievedFirstDown = true;
      this.firstDownMarker = FIELD_LENGTH;
      this.down = 1;
      this.yardsToGain = FIELD_LENGTH - this.yardLine;
      result.description += ` [FIRST DOWN! Crosses Midfield to the ${this.yardLine}!]`;
      teamBox.firstDowns++;
    } else {
      // Did they pick up normal yards to gain?
      this.yardsToGain -= result.yardsGained;
      if (this.yardsToGain <= 0) {
        achievedFirstDown = true;
        this.down = 1;
        this.yardsToGain = this.firstDownMarker - this.yardLine;
        result.description += ` [FIRST DOWN at the ${this.yardLine}!]`;
        teamBox.firstDowns++;
      } else {
        this.down++;
      }
    }

    // Check Turnover on Downs if 4th down failed
    if (this.down > 4) {
      teamBox.turnovers++;
      result.description += ` [TURNOVER ON DOWNS! Stopped short on 4th down!]`;
      this.playLog.unshift({
        ...result,
        score: { ...this.score },
        down: 4,
        yardsToGain: this.yardsToGain,
        yardLine: this.yardLine,
        quarter: this.quarter,
        gameClock: this.gameClock
      });

      const opponentSpot = FIELD_LENGTH - this.yardLine;
      this.flipPossession(Math.max(1, Math.min(49, opponentSpot)));
      this.drainClock(25);
      return;
    }

    this.playLog.unshift({
      ...result,
      score: { ...this.score },
      down: this.down,
      yardsToGain: this.yardsToGain,
      yardLine: this.yardLine,
      quarter: this.quarter,
      gameClock: this.gameClock
    });

    this.drainClock(randomInt(20, 35));
  }

  resolvePAT() {
    const coach = this.getOffenseCoach();
    const offTeam = this.getOffenseTeam();
    const offenseTeamKey = this.scoringTeamKey || this.possession;
    // Decision: 1 point from the 5, or 2 points from the 10
    const goForTwo = Math.random() < coach.twoPointPreference;
    let patResult;

    // PAT is spotted at 5 yards out (45-yd line) or 10 yards out (40-yd line)
    const patStartYard = goForTwo ? 40 : 45;

    if (goForTwo) {
      // 2-point play from 10-yard line
      const successChance = 0.44 + (coach.twoPointPreference * 0.08);
      const converted = Math.random() < successChance;
      if (converted) {
        this.score[offenseTeamKey] += 2;
        patResult = {
          type: "PAT",
          playType: "PAT",
          concept: "TWO_PT_CONVERSION",
          defConcept: "GOALLINE_STAND",
          startYardLine: patStartYard,
          yardsGained: 10,
          description: `2-POINT CONVERSION SUCCESSFUL! ${offTeam.name} punches it into the endzone from 10 yards out! (+2)`,
          score: { ...this.score },
          converted: true,
          points: 2
        };
      } else {
        patResult = {
          type: "PAT",
          playType: "PAT",
          concept: "TWO_PT_CONVERSION",
          defConcept: "GOALLINE_STAND",
          startYardLine: patStartYard,
          yardsGained: 6,
          description: `2-POINT CONVERSION FAILED! ${offTeam.name} stopped short of the goal line.`,
          score: { ...this.score },
          converted: false,
          points: 0
        };
      }
    } else {
      // 1-point play from 5-yard line
      const successChance = 0.78;
      const converted = Math.random() < successChance;
      if (converted) {
        this.score[offenseTeamKey] += 1;
        patResult = {
          type: "PAT",
          playType: "PAT",
          concept: "ONE_PT_CONVERSION",
          defConcept: "GOALLINE_STAND",
          startYardLine: patStartYard,
          yardsGained: 5,
          description: `1-POINT CONVERSION GOOD! Quick strike into the endzone from the 5-yard line! (+1)`,
          score: { ...this.score },
          converted: true,
          points: 1
        };
      } else {
        patResult = {
          type: "PAT",
          playType: "PAT",
          concept: "ONE_PT_CONVERSION",
          defConcept: "GOALLINE_STAND",
          startYardLine: patStartYard,
          yardsGained: 0,
          description: `1-POINT CONVERSION MISSED! Pass sails out of the back of the endzone.`,
          score: { ...this.score },
          converted: false,
          points: 0
        };
      }
    }

    this.playLog.unshift(patResult);

    // Reset pending PAT flag
    this.pendingPAT = false;
    this.scoringTeamKey = null;

    // After TD and PAT, other team gets ball at own 5-yard line (no kickoffs)
    this.flipPossession(5);
    this.drainClock(30);

    return patResult;
  }

  flipPossession(newStartingYard = 5) {
    this.possession = this.possession === "home" ? "away" : "home";
    this.driveNumber[this.possession]++;
    this.yardLine = newStartingYard;
    this.down = 1;
    this.firstDownMarker = this.yardLine < MIDFIELD ? MIDFIELD : FIELD_LENGTH;
    this.yardsToGain = this.firstDownMarker - this.yardLine;
  }

  drainClock(seconds) {
    this.gameClock -= seconds;
    if (this.gameClock <= 0) {
      if (this.quarter === 1) {
        this.quarter = 2;
        this.gameClock = 360;
      } else if (this.quarter === 2) {
        this.quarter = 3;
        this.half = 2;
        this.gameClock = 360;
        // 2nd half possession starts at own 5 for away team
        this.yardLine = 5;
        this.down = 1;
        this.firstDownMarker = MIDFIELD;
        this.yardsToGain = MIDFIELD - 5;
      } else if (this.quarter === 3) {
        this.quarter = 4;
        this.gameClock = 360;
      } else if (this.quarter >= 4) {
        // Game Over! (or sudden death tiebreaker)
        if (this.score.home === this.score.away) {
          // Backyard OT: First to score wins
          this.quarter = "OT";
          this.gameClock = 180;
        } else {
          this.finishGame();
        }
      }
    }
  }

  finishGame() {
    this.isGameOver = true;
    this.postGameInjuries = this.calculatePostGameInjuries();
    this.applyCareerStats();
  }

  // Calculate post-game injuries that ONLY materialize after the final whistle!
  calculatePostGameInjuries() {
    const injuryReport = [];

    Object.values(this.injuryPits).forEach(pit => {
      const player = pit.player;
      // Base risk: 1.5% + (hitsTaken * 0.8%) + (snaps * 0.05%)
      // Endurance reduces injury risk by up to 60%
      const rawRisk = 0.015 + (pit.hitsTaken * 0.009) + (pit.snaps * 0.0006);
      const enduranceProtection = player.endurance / 160; // high endurance cuts risk heavily
      const finalRisk = Math.max(0.005, rawRisk * (1 - enduranceProtection));

      if (Math.random() < finalRisk) {
        const injury = INJURY_TABLE[Math.floor(Math.random() * INJURY_TABLE.length)];
        player.injuryWeeksRemaining = injury.duration;
        player.injuryDescription = injury.name;

        injuryReport.push({
          player,
          team: this.homeStarters.some(s => s.id === player.id) ? this.homeTeam.name : this.awayTeam.name,
          injuryName: injury.name,
          duration: injury.duration,
          severity: injury.severity
        });
      }
    });

    return injuryReport;
  }

  applyCareerStats() {
    // Add game boxscore stats into player career totals
    ["home", "away"].forEach(teamKey => {
      const players = this.boxScore[teamKey].players;
      Object.keys(players).forEach(pId => {
        const stat = players[pId];
        const playerObj = [...this.homeStarters, ...this.awayStarters].find(p => p.id === pId);
        if (playerObj && playerObj.careerStats) {
          playerObj.careerStats.gamesPlayed++;
          playerObj.careerStats.passYds += stat.passYds;
          playerObj.careerStats.passTDs += stat.passTD;
          playerObj.careerStats.interceptions += stat.passInt;
          playerObj.careerStats.rushYds += stat.rushYds;
          playerObj.careerStats.rushTDs += stat.rushTD;
          playerObj.careerStats.catches += stat.receptions;
          playerObj.careerStats.recYds += stat.recYds;
          playerObj.careerStats.recTDs += stat.recTD;
          playerObj.careerStats.tackles += stat.tackles;
          playerObj.careerStats.sacks += stat.sacks;
          playerObj.careerStats.defInterceptions += stat.defInt;
        }
      });
    });
  }

  // Fast-forward simulate remaining game
  simToEnd() {
    let loopGuard = 0;
    while (!this.isGameOver && loopGuard < 400) {
      this.stepPlay();
      loopGuard++;
    }
    if (!this.isGameOver) {
      this.finishGame();
    }
    return this;
  }
}
