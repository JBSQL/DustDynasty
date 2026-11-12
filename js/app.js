// Main Application Orchestrator for Backyard Football Simulator

import { LeagueState } from "./state.js";
import { GameEngine, getFatiguedPlayer } from "./engine.js";
import { autoSetStarters, evaluateTrade } from "./teams.js";

// Initialize or Load League State
let league = LeagueState.load() || new LeagueState();
let currentGameEngine = null;
let selectedInterviewCoach = null;

// Helper: rating color badge
function getRatingBadge(val) {
  if (val >= 85) return `<span class="stat-pill-elite px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">${val}</span>`;
  if (val >= 75) return `<span class="stat-pill-good px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">${val}</span>`;
  if (val >= 65) return `<span class="stat-pill-avg px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">${val}</span>`;
  return `<span class="stat-pill-poor px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">${val}</span>`;
}

// Player Card HTML Generator
function renderPlayerCard(player, isStarter = false, canSwap = false) {
  const isInjured = player.injuryWeeksRemaining > 0;
  return `
    <div class="bg-slate-900 border ${isInjured ? 'border-red-600/70 bg-red-950/30' : isStarter ? 'border-emerald-500/50 bg-emerald-950/10' : 'border-slate-800'} rounded-xl p-3 shadow flex flex-col justify-between relative">
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[10px] font-bold uppercase tracking-wider ${isInjured ? 'text-red-400' : isStarter ? 'text-emerald-400' : 'text-slate-400'}">${player.archetype}</span>
          <span class="text-xs font-black font-mono ${isInjured ? 'text-red-400' : player.overall >= 80 ? 'text-emerald-400' : 'text-amber-400'}">OVR ${player.overall}</span>
        </div>
        <h4 class="text-sm font-bold text-white truncate" title="${player.fullName}">${player.fullName}</h4>
        <div class="text-[11px] text-slate-400 flex gap-2 mt-0.5">
          <span>${player.height}</span>
          <span>•</span>
          <span>${player.weight} lbs</span>
        </div>

        <!-- Injury Alert if any -->
        ${isInjured ? `
          <div class="mt-2 bg-red-900/50 border border-red-500/70 text-red-200 text-[10px] p-2 rounded-lg font-bold space-y-0.5">
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-1 text-red-300"><span>🚑</span> INJURED RESERVE</span>
              <span class="bg-red-950 text-red-200 px-1.5 py-0.2 rounded font-mono">${player.injuryWeeksRemaining} Wk${player.injuryWeeksRemaining > 1 ? 's' : ''} Out</span>
            </div>
            <p class="text-[10px] text-red-300/90 font-normal italic truncate">${player.injuryDescription}</p>
          </div>
        ` : ''}

        <!-- Ratings Grid -->
        <div class="grid grid-cols-5 gap-1 text-center mt-3 pt-2 border-t border-slate-800">
          <div><span class="text-[9px] text-slate-400 block">SPD</span>${getRatingBadge(player.speed)}</div>
          <div><span class="text-[9px] text-slate-400 block">THR</span>${getRatingBadge(player.throwing)}</div>
          <div><span class="text-[9px] text-slate-400 block">HND</span>${getRatingBadge(player.hands)}</div>
          <div><span class="text-[9px] text-slate-400 block">TCK</span>${getRatingBadge(player.tackling)}</div>
          <div><span class="text-[9px] text-slate-400 block">END</span>${getRatingBadge(player.endurance)}</div>
        </div>
      </div>

      <!-- Action Button -->
      ${canSwap ? `
        <div class="mt-3 pt-2 border-t border-slate-800 flex justify-end">
          <button data-action="toggle-starter" data-player-id="${player.id}" ${isInjured ? 'disabled' : ''} class="w-full text-xs font-bold py-1 px-2 rounded ${isStarter ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : isInjured ? 'bg-red-950/40 text-red-400 border border-red-900/50 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white'} transition">
            ${isStarter ? 'Move to Bench' : isInjured ? 'Out with Injury' : 'Promote to Starter'}
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

// DOM Setup & Navigation
function initNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabTarget = tab.dataset.tab;
      switchTab(tabTarget);
    });
  });

  document.getElementById('btn-goto-draft')?.addEventListener('click', () => switchTab('draft'));
  document.getElementById('btn-goto-injury-roster')?.addEventListener('click', () => switchTab('roster'));
  document.querySelector('[data-tab="coaches"]')?.addEventListener('click', () => switchTab('coaches'));

  document.getElementById('btn-reset-season').addEventListener('click', () => {
    if (confirm("Reset the entire league and start a brand new season?")) {
      league = LeagueState.reset();
      refreshAllViews();
      switchTab('draft');
    }
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(section => {
    section.classList.add('hidden');
  });
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.remove('border-rose-500', 'text-white', 'font-semibold');
    tab.classList.add('border-transparent', 'text-slate-400');
  });

  const targetSection = document.getElementById(`tab-${tabId}`);
  if (targetSection) targetSection.classList.remove('hidden');

  const activeNav = document.querySelector(`[data-tab="${tabId}"]`);
  if (activeNav) {
    activeNav.classList.remove('border-transparent', 'text-slate-400');
    activeNav.classList.add('border-rose-500', 'text-white', 'font-semibold');
  }

  // Refresh tab-specific view
  if (tabId === 'owners-box') renderOwnersBox();
  if (tabId === 'roster') renderRosterView();
  if (tabId === 'draft') renderDraftRoom();
  if (tabId === 'coaches') renderCoachingStaff();
  if (tabId === 'trades') renderTradeDesk();
  if (tabId === 'game-day') prepareGameDay();
}

// -------------------------------------------------------------
// TAB 1: OWNER'S BOX
// -------------------------------------------------------------
function renderOwnersBox() {
  const userTeam = league.getUserTeam();
  document.getElementById('header-team-name').textContent = userTeam.name;
  document.getElementById('header-team-emoji').textContent = userTeam.emoji;
  document.getElementById('header-team-record').textContent = `${userTeam.record.wins}-${userTeam.record.losses}`;
  
  const weekLabel = league.seasonOver
    ? "Season Over"
    : league.currentWeek === 11
      ? "Bowl Week"
      : `Week ${league.currentWeek} / ${league.totalWeeks}`;
  document.getElementById('header-week').textContent = weekLabel;

  // Draft Banner visibility
  const draftBanner = document.getElementById('draft-alert-banner');
  const draftBadge = document.getElementById('draft-tab-badge');
  if (!league.draftCompleted) {
    draftBanner?.classList.remove('hidden');
    draftBadge?.classList.remove('hidden');
  } else {
    draftBanner?.classList.add('hidden');
    draftBadge?.classList.add('hidden');
  }

  // Trade badge
  const tradeBadge = document.getElementById('trade-tab-badge');
  if (league.inboundTrades.length > 0) {
    tradeBadge.textContent = league.inboundTrades.length;
    tradeBadge.classList.remove('hidden');
  } else {
    tradeBadge.classList.add('hidden');
  }

  // Injury Banner and Navigation Badge
  const userInjured = userTeam.roster.filter(p => p.injuryWeeksRemaining > 0);
  const injuryBanner = document.getElementById('injury-alert-banner');
  const injuryTabBadge = document.getElementById('injury-tab-badge');

  if (userInjured.length > 0) {
    if (injuryBanner) {
      injuryBanner.classList.remove('hidden');
      document.getElementById('injury-alert-title').textContent = `Trainer's Room Alert: ${userInjured.length} Player${userInjured.length > 1 ? 's' : ''} Sidelined`;
      document.getElementById('injury-alert-text').textContent = userInjured.map(p => `${p.shortName} (${p.injuryDescription}, ${p.injuryWeeksRemaining}w out)`).join(" • ");
    }
    if (injuryTabBadge) {
      injuryTabBadge.textContent = `${userInjured.length} Injured`;
      injuryTabBadge.classList.remove('hidden');
    }
  } else {
    if (injuryBanner) injuryBanner.classList.add('hidden');
    if (injuryTabBadge) injuryTabBadge.classList.add('hidden');
  }

  // Next Matchup
  const matchups = league.getCurrentWeekMatchups();
  const userMatchup = matchups.find(m => m.homeId === userTeam.id || m.awayId === userTeam.id) || matchups[0];

  if (league.seasonOver) {
    document.getElementById('dash-week-num').textContent = "Season Final";
    document.getElementById('dash-matchup-rule').textContent = "Season Complete";
    document.getElementById('dash-coach-hint').textContent = "The season has concluded! Click ↺ Reset in the header anytime to begin a new campaign.";
    document.getElementById('btn-play-game-live').disabled = true;
    document.getElementById('btn-quick-sim-game').disabled = true;
  } else if (userMatchup) {
    document.getElementById('btn-play-game-live').disabled = false;
    document.getElementById('btn-quick-sim-game').disabled = false;
    document.getElementById('dash-week-num').textContent = league.currentWeek === 11 ? "Bowl Week" : league.currentWeek;
    document.getElementById('dash-home-name').textContent = userMatchup.homeTeam.name;
    document.getElementById('dash-home-icon').textContent = userMatchup.homeTeam.emoji;
    document.getElementById('dash-home-coach').textContent = `Coach: ${userMatchup.homeTeam.coach.name}`;
    const homeOvr = Math.round(userMatchup.homeTeam.starters.reduce((acc, p) => acc + p.overall, 0) / (userMatchup.homeTeam.starters.length || 1));
    document.getElementById('dash-home-ovr').textContent = `Ironman 5 OVR: ${homeOvr || 75}`;

    document.getElementById('dash-away-name').textContent = userMatchup.awayTeam.name;
    document.getElementById('dash-away-icon').textContent = userMatchup.awayTeam.emoji;
    document.getElementById('dash-away-coach').textContent = `Coach: ${userMatchup.awayTeam.coach.name}`;
    const awayOvr = Math.round(userMatchup.awayTeam.starters.reduce((acc, p) => acc + p.overall, 0) / (userMatchup.awayTeam.starters.length || 1));
    document.getElementById('dash-away-ovr').textContent = `Ironman 5 OVR: ${awayOvr || 75}`;

    document.getElementById('dash-coach-hint').textContent = `${userTeam.coach.name}'s ${userTeam.coach.archetype} scheme is locked in.`;
  }

  // Coach widget
  const coach = userTeam.coach;
  document.getElementById('dash-coach-name').textContent = coach.name;
  document.getElementById('dash-coach-scheme').textContent = coach.archetype;
  document.getElementById('dash-coach-quote').textContent = `"${coach.pressQuote}"`;
  document.getElementById('dash-coach-runpass').textContent = `${Math.round((1 - coach.runRate) * 100)}% Pass / ${Math.round(coach.runRate * 100)}% Run`;
  document.getElementById('dash-coach-4th').textContent = coach.fourthDownAggressiveness > 0.6 ? 'Aggressive' : 'Conservative';
  document.getElementById('dash-coach-pat').textContent = coach.twoPointPreference > 0.5 ? 'Gamble 2-Pt' : 'Safe 1-Pt';

  // Standings table
  const standings = league.getStandings();
  const tableBody = document.getElementById('standings-table-body');
  tableBody.innerHTML = standings.map((t, idx) => {
    const isUser = t.isUser;
    const diff = t.record.pointsFor - t.record.pointsAgainst;
    const diffSign = diff > 0 ? `+${diff}` : `${diff}`;
    return `
      <tr class="${isUser ? 'bg-rose-950/20 font-semibold text-white' : 'hover:bg-slate-800/40'}">
        <td class="py-2.5 px-3 font-mono">${idx + 1}</td>
        <td class="py-2.5 px-3 flex items-center gap-2">
          <span>${t.emoji}</span>
          <span class="truncate">${t.name}</span>
          ${isUser ? '<span class="text-[9px] bg-rose-500 text-white px-1.5 py-0.2 rounded font-bold">YOU</span>' : ''}
        </td>
        <td class="py-2.5 px-3 text-center font-mono font-bold">${t.record.wins}</td>
        <td class="py-2.5 px-3 text-center font-mono text-slate-400">${t.record.losses}</td>
        <td class="py-2.5 px-3 text-center font-mono">${t.record.pointsFor}</td>
        <td class="py-2.5 px-3 text-center font-mono">${t.record.pointsAgainst}</td>
        <td class="py-2.5 px-3 text-center font-mono ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-slate-400'}">${diffSign}</td>
      </tr>
    `;
  }).join('');

  // News Feed
  const newsFeed = document.getElementById('league-news-feed');
  newsFeed.innerHTML = league.leagueNews.map(item => `
    <div class="p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-xl leading-relaxed text-slate-300">
      ${item}
    </div>
  `).join('');

  // Quick Action Buttons
  document.getElementById('btn-play-game-live').onclick = () => {
    switchTab('game-day');
  };
  document.getElementById('btn-quick-sim-game').onclick = () => {
    prepareGameDay();
    if (currentGameEngine) {
      currentGameEngine.simToEnd();
      handleGameOver();
    }
  };
}

// -------------------------------------------------------------
// TAB 2: ROSTER & IRONMAN 5
// -------------------------------------------------------------
function renderRosterView() {
  const userTeam = league.getUserTeam();
  const startersGrid = document.getElementById('roster-starters-grid');
  const benchGrid = document.getElementById('roster-bench-grid');
  const irSection = document.getElementById('roster-ir-section');
  const irGrid = document.getElementById('roster-ir-grid');

  const starters = userTeam.starters;
  const healthyBench = userTeam.roster.filter(p => !starters.some(s => s.id === p.id) && p.injuryWeeksRemaining <= 0);
  const injuredReserve = userTeam.roster.filter(p => p.injuryWeeksRemaining > 0);

  document.getElementById('starters-count').textContent = starters.length;
  document.getElementById('bench-count').textContent = healthyBench.length;

  startersGrid.innerHTML = starters.length > 0
    ? starters.map(p => renderPlayerCard(p, true, true)).join('')
    : '<div class="col-span-5 text-center py-6 text-slate-500 italic">No starters locked in. Click Auto-Set Best 5 or promote bench kids!</div>';

  benchGrid.innerHTML = healthyBench.length > 0
    ? healthyBench.map(p => renderPlayerCard(p, false, true)).join('')
    : '<div class="col-span-5 text-center py-6 text-slate-500 italic">No healthy bench reserves available.</div>';

  // Render Injured Reserve Section
  if (injuredReserve.length > 0) {
    irSection?.classList.remove('hidden');
    document.getElementById('ir-count').textContent = injuredReserve.length;
    irGrid.innerHTML = injuredReserve.map(p => renderPlayerCard(p, false, false)).join('');
  } else {
    irSection?.classList.add('hidden');
  }

  // Update nav tab badge
  const injuryTabBadge = document.getElementById('injury-tab-badge');
  if (injuryTabBadge) {
    if (injuredReserve.length > 0) {
      injuryTabBadge.textContent = `${injuredReserve.length} Injured`;
      injuryTabBadge.classList.remove('hidden');
    } else {
      injuryTabBadge.classList.add('hidden');
    }
  }

  // Attach Starter/Bench Toggle listeners
  document.querySelectorAll('[data-action="toggle-starter"]').forEach(btn => {
    btn.onclick = (e) => {
      const playerId = e.target.dataset.playerId;
      toggleStarter(playerId);
    };
  });

  document.getElementById('btn-auto-starters').onclick = () => {
    autoSetStarters(userTeam);
    league.save();
    renderRosterView();
  };
}

function toggleStarter(playerId) {
  const userTeam = league.getUserTeam();
  const isCurrentlyStarter = userTeam.starters.some(p => p.id === playerId);

  if (isCurrentlyStarter) {
    userTeam.starters = userTeam.starters.filter(p => p.id !== playerId);
  } else {
    if (userTeam.starters.length >= 5) {
      alert("You already have 5 Ironman starters selected! Move a starter to the bench before adding another.");
      return;
    }
    const playerToAdd = userTeam.roster.find(p => p.id === playerId);
    if (playerToAdd.injuryWeeksRemaining > 0) {
      alert("This player is currently injured and cannot suit up!");
      return;
    }
    userTeam.starters.push(playerToAdd);
  }

  league.save();
  renderRosterView();
}

// -------------------------------------------------------------
// TAB 3: DRAFT ROOM (10-Round Snake Draft)
// -------------------------------------------------------------
function renderDraftRoom() {
  const turn = league.getCurrentDraftTurn();
  const draftPill = document.getElementById('draft-status-pill');
  const draftTurnLabel = document.getElementById('draft-turn-label');
  const prospectCount = document.getElementById('prospect-count');

  prospectCount.textContent = league.prospectPool.length;

  if (league.draftCompleted || !turn) {
    draftPill.textContent = "Draft Complete";
    draftPill.className = "text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-bold";
    draftTurnLabel.textContent = "All 10 rounds complete! Rosters are locked.";
    document.getElementById('btn-auto-draft-user').disabled = true;
    document.getElementById('btn-auto-draft-all').disabled = true;
  } else {
    draftPill.textContent = `Round ${turn.round} • Pick ${turn.pickNumber} / 60`;
    draftTurnLabel.innerHTML = `On The Clock: <span class="font-bold text-white">${turn.team.name}</span> ${turn.isUserTurn ? '<span class="text-xs bg-rose-500 text-white px-2 py-0.5 rounded font-bold ml-2">YOUR TURN</span>' : ''}`;
  }

  // Render prospect cards
  renderProspectGrid();

  // Auto Draft Controls
  document.getElementById('btn-auto-draft-user').onclick = () => {
    league.autoDraftUntilUserOrEnd();
    league.save();
    renderDraftRoom();
    renderOwnersBox();
  };

  document.getElementById('btn-auto-draft-all').onclick = () => {
    league.autoDraftAll();
    league.save();
    renderDraftRoom();
    renderOwnersBox();
    alert("Draft Complete! Your 10-player roster and Ironman 5 starters are locked in.");
    switchTab('roster');
  };

  document.getElementById('draft-sort-select').onchange = () => {
    renderProspectGrid();
  };
}

function renderProspectGrid() {
  const grid = document.getElementById('prospects-grid');
  const sortKey = document.getElementById('draft-sort-select').value;
  const turn = league.getCurrentDraftTurn();
  const isUserTurn = turn && turn.isUserTurn;

  const sortedPool = [...league.prospectPool].sort((a, b) => b[sortKey] - a[sortKey]);

  grid.innerHTML = sortedPool.map(player => `
    <div class="bg-slate-950 border border-slate-800 rounded-xl p-3 shadow hover:border-slate-700 transition flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between mb-1">
          <span class="text-[10px] font-bold uppercase tracking-wider text-amber-400">${player.archetype}</span>
          <span class="text-xs font-black font-mono text-emerald-400">OVR ${player.overall}</span>
        </div>
        <h4 class="text-sm font-bold text-white truncate">${player.fullName}</h4>
        <div class="text-[11px] text-slate-400 flex gap-2 mt-0.5">
          <span>${player.height}</span>
          <span>•</span>
          <span>${player.weight} lbs</span>
        </div>

        <div class="grid grid-cols-5 gap-1 text-center mt-3 pt-2 border-t border-slate-800">
          <div><span class="text-[9px] text-slate-400 block">SPD</span>${getRatingBadge(player.speed)}</div>
          <div><span class="text-[9px] text-slate-400 block">THR</span>${getRatingBadge(player.throwing)}</div>
          <div><span class="text-[9px] text-slate-400 block">HND</span>${getRatingBadge(player.hands)}</div>
          <div><span class="text-[9px] text-slate-400 block">TCK</span>${getRatingBadge(player.tackling)}</div>
          <div><span class="text-[9px] text-slate-400 block">END</span>${getRatingBadge(player.endurance)}</div>
        </div>
      </div>

      <div class="mt-3 pt-2 border-t border-slate-800">
        <button data-action="draft-player" data-player-id="${player.id}" ${!isUserTurn ? 'disabled' : ''} class="w-full text-xs font-bold py-1.5 px-3 rounded ${isUserTurn ? 'bg-amber-500 hover:bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-600 cursor-not-allowed'} transition shadow">
          ${isUserTurn ? 'Draft This Prospect' : 'Waiting for Turn'}
        </button>
      </div>
    </div>
  `).join('');

  // Draft player click
  document.querySelectorAll('[data-action="draft-player"]').forEach(btn => {
    btn.onclick = (e) => {
      const pId = e.target.dataset.playerId;
      league.makeDraftPick(pId);
      // Let AI make picks until next user turn or finish
      league.autoDraftUntilUserOrEnd();
      league.save();
      renderDraftRoom();
      renderOwnersBox();
    };
  });
}

// -------------------------------------------------------------
// TAB 4: GAME DAY SIMULATOR
// -------------------------------------------------------------
function prepareGameDay() {
  const userTeam = league.getUserTeam();
  const matchups = league.getCurrentWeekMatchups();
  const userMatchup = matchups.find(m => m.homeId === userTeam.id || m.awayId === userTeam.id) || matchups[0];

  if (!userMatchup) return;

  // Validate that both teams have 5 starters
  league.validateTeamStarters(userMatchup.homeTeam);
  league.validateTeamStarters(userMatchup.awayTeam);

  currentGameEngine = new GameEngine(userMatchup.homeTeam, userMatchup.awayTeam);
  updateGameDayView();

  // Control button bindings
  document.getElementById('btn-step-play').onclick = () => {
    if (!currentGameEngine || currentGameEngine.isGameOver) return;
    currentGameEngine.stepPlay();
    updateGameDayView();
    if (currentGameEngine.isGameOver) handleGameOver();
  };

  document.getElementById('btn-sim-drive').onclick = () => {
    if (!currentGameEngine || currentGameEngine.isGameOver) return;
    const startingPossession = currentGameEngine.possession;
    let guard = 0;
    while (!currentGameEngine.isGameOver && currentGameEngine.possession === startingPossession && guard < 25) {
      currentGameEngine.stepPlay();
      guard++;
    }
    updateGameDayView();
    if (currentGameEngine.isGameOver) handleGameOver();
  };

  document.getElementById('btn-sim-full-game').onclick = () => {
    if (!currentGameEngine || currentGameEngine.isGameOver) return;
    currentGameEngine.simToEnd();
    updateGameDayView();
    handleGameOver();
  };
}

function updateGameDayView() {
  if (!currentGameEngine) return;

  const eng = currentGameEngine;
  document.getElementById('sim-home-name').textContent = eng.homeTeam.name;
  document.getElementById('sim-home-emoji').textContent = eng.homeTeam.emoji;
  document.getElementById('sim-home-score').textContent = eng.score.home;

  document.getElementById('sim-away-name').textContent = eng.awayTeam.name;
  document.getElementById('sim-away-emoji').textContent = eng.awayTeam.emoji;
  document.getElementById('sim-away-score').textContent = eng.score.away;

  // Clock format
  const mins = Math.floor(eng.gameClock / 60);
  const secs = (eng.gameClock % 60).toString().padStart(2, '0');
  document.getElementById('sim-quarter-clock').textContent = `Q${eng.quarter} • ${mins}:${secs}`;

  const offTeam = eng.getOffenseTeam();
  const nextPlayBtn = document.getElementById('btn-step-play');

  if (eng.pendingPAT) {
    document.getElementById('sim-down-dist').textContent = `🏈 EXTRA POINT ATTEMPT (${offTeam.short})`;
    if (nextPlayBtn) nextPlayBtn.innerHTML = `Play Extra Point 🎯`;
  } else {
    document.getElementById('sim-down-dist').textContent = `${eng.down}${getOrdinal(eng.down)} & ${eng.yardsToGain} at ${eng.yardLine}-yd line (${offTeam.short})`;
    if (nextPlayBtn) nextPlayBtn.innerHTML = `Next Play ▶`;
  }

  // Visual Field Update
  // Field ranges from 0 to 50 yards. Endzones take 8% on left and right. 
  // Playable grass is 84% wide (from 8% to 92%).
  // yardLine 0 = 8%, yardLine 50 = 92%
  const percentPos = 8 + (eng.yardLine / 50) * 84;
  const firstDownPercent = 8 + (eng.firstDownMarker / 50) * 84;

  const ballEl = document.getElementById('field-ball');
  const losEl = document.getElementById('field-los');
  const markerEl = document.getElementById('field-marker');

  if (ballEl) ballEl.style.left = `${percentPos}%`;
  if (losEl) losEl.style.left = `${percentPos}%`;
  if (markerEl) markerEl.style.left = `${firstDownPercent}%`;

  // Coach Callout
  const coach = eng.getOffenseCoach();
  const latestPlay = eng.playLog[0];
  document.getElementById('sim-coach-call').textContent = latestPlay ? latestPlay.description : `${coach.name} dials up the game plan...`;

  // Play Ticker
  const ticker = document.getElementById('sim-play-ticker');
  ticker.innerHTML = eng.playLog.slice(0, 30).map(p => `
    <div class="p-2 rounded-lg bg-slate-950/70 border border-slate-800 flex items-start gap-2">
      <span class="font-mono text-amber-400 font-bold shrink-0">[Q${p.quarter || '1'}]</span>
      <span class="text-slate-200">${p.description}</span>
    </div>
  `).join('');

  // Ironman Fatigue list
  const fatigueList = document.getElementById('sim-fatigue-list');
  const offStarters = eng.getOffenseStarters();
  fatigueList.innerHTML = offStarters.map(p => {
    const staminaRemaining = Math.max(10, 100 - p.decayPercent);
    const staminaColor = staminaRemaining > 85 ? 'bg-emerald-500' : staminaRemaining > 70 ? 'bg-amber-500' : 'bg-red-500';
    return `
      <div class="p-2 rounded-lg bg-slate-950/80 border border-slate-800/80 text-[11px]">
        <div class="flex justify-between items-center mb-1">
          <span class="font-bold text-white">${p.shortName}</span>
          <span class="font-mono text-slate-400">Drive #${eng.driveNumber[eng.possession]}</span>
        </div>
        <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
          <div class="${staminaColor} h-1.5 rounded-full transition-all duration-300" style="width: ${staminaRemaining}%"></div>
        </div>
        <div class="flex justify-between text-[9px] text-slate-400 mt-1">
          <span>Stamina: ${staminaRemaining}%</span>
          <span>Eff. SPD: ${p.effectiveSpeed} | THR: ${p.effectiveThrowing}</span>
        </div>
      </div>
    `;
  }).join('');
}

function getOrdinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function handleGameOver() {
  if (!currentGameEngine) return;
  const eng = currentGameEngine;

  // Record game in league state
  const matchups = league.getCurrentWeekMatchups();
  const userTeam = league.getUserTeam();
  const currentMatchup = matchups.find(m => m.homeId === userTeam.id || m.awayId === userTeam.id) || matchups[0];

  league.recordGameResult(
    currentMatchup.id,
    eng.score.home,
    eng.score.away,
    eng.boxScore,
    eng.postGameInjuries
  );

  // Auto sim the other AI vs AI matchups for this week
  matchups.forEach(m => {
    if (!m.played) {
      const aiGame = new GameEngine(m.homeTeam, m.awayTeam);
      aiGame.simToEnd();
      league.recordGameResult(m.id, aiGame.score.home, aiGame.score.away, aiGame.boxScore, aiGame.postGameInjuries);
    }
  });

  // Display Post-Game Trainer's Report Modal
  showPostGameModal(eng);
}

function showPostGameModal(eng) {
  const modal = document.getElementById('postgame-modal');
  document.getElementById('modal-home-team').textContent = eng.homeTeam.name;
  document.getElementById('modal-home-score').textContent = eng.score.home;
  document.getElementById('modal-away-team').textContent = eng.awayTeam.name;
  document.getElementById('modal-away-score').textContent = eng.score.away;

  const injuryBox = document.getElementById('modal-injuries-container');
  if (eng.postGameInjuries && eng.postGameInjuries.length > 0) {
    injuryBox.innerHTML = eng.postGameInjuries.map(inj => `
      <div class="p-3 bg-red-950/40 border border-red-500/50 rounded-xl flex items-center justify-between text-xs">
        <div>
          <span class="font-bold text-red-200">${inj.player.fullName} (${inj.team})</span>
          <p class="text-red-300/80 text-[11px]">${inj.injuryName}</p>
        </div>
        <span class="bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded font-bold font-mono">
          Out ${inj.duration} Wk${inj.duration > 1 ? 's' : ''}
        </span>
      </div>
    `).join('');
  } else {
    injuryBox.innerHTML = `
      <div class="p-3 bg-emerald-950/30 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs text-center font-semibold">
        ✨ Clean bill of health! No injuries were sustained during this matchup.
      </div>
    `;
  }

  modal.classList.remove('hidden');

  document.getElementById('btn-close-postgame').onclick = () => modal.classList.add('hidden');
  document.getElementById('btn-continue-season').onclick = () => {
    modal.classList.add('hidden');
    league.advanceWeek();
    refreshAllViews();
    switchTab('owners-box');
  };
}

// -------------------------------------------------------------
// TAB 5: COACHING STAFF
// -------------------------------------------------------------
function renderCoachingStaff() {
  const userTeam = league.getUserTeam();
  const coach = userTeam.coach;

  const dossier = document.getElementById('current-coach-dossier');
  dossier.innerHTML = `
    <div class="space-y-2">
      <span class="text-xs font-bold text-amber-400 uppercase tracking-wider">${coach.title}</span>
      <h3 class="text-xl font-black text-white">${coach.name}</h3>
      <p class="text-xs text-slate-300 leading-relaxed">${coach.philosophy}</p>
      <div class="text-xs bg-slate-900 border border-slate-800 p-2.5 rounded-lg text-slate-400 italic">
        "${coach.pressQuote}"
      </div>
    </div>

    <div class="space-y-3 text-xs">
      <h4 class="font-bold text-slate-300 uppercase tracking-wider">Play Calling Tendencies</h4>
      <div>
        <div class="flex justify-between mb-1"><span>Pass vs Run Balance</span><span class="font-mono text-emerald-400">${Math.round((1-coach.runRate)*100)}% Pass / ${Math.round(coach.runRate*100)}% Run</span></div>
        <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
          <div class="bg-blue-500 h-2" style="width: ${(1-coach.runRate)*100}%"></div>
        </div>
      </div>
      <div>
        <div class="flex justify-between mb-1"><span>4th Down Aggression</span><span class="font-mono text-amber-400">${Math.round(coach.fourthDownAggressiveness*100)}%</span></div>
        <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
          <div class="bg-amber-500 h-2" style="width: ${coach.fourthDownAggressiveness*100}%"></div>
        </div>
      </div>
      <div>
        <div class="flex justify-between mb-1"><span>Defensive Blitz Frequency</span><span class="font-mono text-rose-400">${Math.round(coach.blitzRate*100)}%</span></div>
        <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
          <div class="bg-rose-500 h-2" style="width: ${coach.blitzRate*100}%"></div>
        </div>
      </div>
    </div>

    <div class="space-y-3 text-xs bg-slate-900 border border-slate-800 p-3 rounded-lg flex flex-col justify-between">
      <div>
        <h4 class="font-bold text-slate-300 uppercase tracking-wider mb-2">Scheme Details</h4>
        <div class="space-y-1.5 text-slate-400">
          <p><span class="text-slate-200 font-semibold">Archetype:</span> ${coach.archetype}</p>
          <p><span class="text-slate-200 font-semibold">Signature Play:</span> ${coach.favoritePlay}</p>
          <p><span class="text-slate-200 font-semibold">Record:</span> ${coach.wins}W - ${coach.losses}L</p>
        </div>
      </div>
      <div class="text-[11px] text-slate-500">
        Firing this coach costs $0 (backyard rules) and immediately sends them into the free agent pool.
      </div>
    </div>
  `;

  document.getElementById('btn-fire-coach').onclick = () => {
    if (confirm(`Are you sure you want to fire ${coach.name}? You will need to hire a replacement from the coach market immediately.`)) {
      alert(`${coach.name} cleaned out their locker room desk! Select a replacement below.`);
      // Coach market refreshed
      renderCoachingStaff();
    }
  };

  // Render Coach Candidates
  const grid = document.getElementById('coach-candidates-grid');
  grid.innerHTML = league.coachMarket.map(candidate => `
    <div class="bg-slate-950 border border-slate-800 rounded-xl p-4 shadow flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-bold text-purple-400">${candidate.archetype}</span>
          <span class="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded">Rep: ${candidate.reputation}</span>
        </div>
        <h4 class="text-base font-bold text-white">${candidate.name}</h4>
        <p class="text-xs text-slate-400 mt-1 italic">"${candidate.pressQuote}"</p>

        <div class="mt-3 space-y-1 text-xs text-slate-400">
          <div class="flex justify-between"><span>Pass Ratio:</span><span class="font-mono text-slate-200">${Math.round((1-candidate.runRate)*100)}%</span></div>
          <div class="flex justify-between"><span>4th Down:</span><span class="font-mono text-amber-400">${Math.round(candidate.fourthDownAggressiveness*100)}%</span></div>
        </div>
      </div>

      <div class="mt-4 pt-3 border-t border-slate-800 flex gap-2">
        <button data-action="interview-coach" data-coach-id="${candidate.id}" class="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold py-1.5 rounded-lg border border-slate-700 transition">
          Interview
        </button>
        <button data-action="hire-coach" data-coach-id="${candidate.id}" class="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-1.5 rounded-lg transition shadow">
          Hire Coach
        </button>
      </div>
    </div>
  `).join('');

  // Interview click
  document.querySelectorAll('[data-action="interview-coach"]').forEach(btn => {
    btn.onclick = (e) => {
      const cId = e.target.dataset.coachId;
      selectedInterviewCoach = league.coachMarket.find(c => c.id === cId);
      openInterviewModal(selectedInterviewCoach);
    };
  });

  // Hire click
  document.querySelectorAll('[data-action="hire-coach"]').forEach(btn => {
    btn.onclick = (e) => {
      const cId = e.target.dataset.coachId;
      const targetCoach = league.coachMarket.find(c => c.id === cId);
      league.hireCoach(targetCoach);
      renderCoachingStaff();
      renderOwnersBox();
      alert(`Hired ${targetCoach.name}! They will call plays for your upcoming games.`);
    };
  });
}

function openInterviewModal(coach) {
  const modal = document.getElementById('coach-interview-modal');
  document.getElementById('interview-coach-name').textContent = coach.name;

  const qaBox = document.getElementById('interview-qa-container');
  qaBox.innerHTML = coach.interviewQA.map(item => `
    <div class="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
      <p class="font-semibold text-amber-400">GM: "${item.q}"</p>
      <p class="text-slate-300 italic pl-3 border-l-2 border-slate-700">${coach.name}: "${item.a}"</p>
    </div>
  `).join('');

  modal.classList.remove('hidden');

  document.getElementById('btn-close-interview').onclick = () => modal.classList.add('hidden');
  document.getElementById('btn-cancel-interview').onclick = () => modal.classList.add('hidden');
  document.getElementById('btn-hire-interviewed-coach').onclick = () => {
    modal.classList.add('hidden');
    league.hireCoach(coach);
    renderCoachingStaff();
    renderOwnersBox();
  };
}

// -------------------------------------------------------------
// TAB 6: TRADE DESK
// -------------------------------------------------------------
function renderTradeDesk() {
  const userTeam = league.getUserTeam();
  const inboundList = document.getElementById('inbound-trades-list');

  // Inbound offers
  if (league.inboundTrades.length === 0) {
    inboundList.innerHTML = '<div class="text-xs text-slate-500 italic p-4 text-center">No inbound trade offers at the moment. Advance weeks or submit your own proposal below!</div>';
  } else {
    inboundList.innerHTML = league.inboundTrades.map(trade => `
      <div class="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-amber-400">${trade.fromTeam.name} Front Office</span>
          <span class="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded font-mono">Offer Pending</span>
        </div>
        <p class="text-xs text-slate-300 italic">${trade.message}</p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-800">
          <div class="p-2 bg-slate-900 rounded border border-slate-800">
            <span class="text-emerald-400 font-bold block mb-1">YOU RECEIVE:</span>
            <div class="font-bold text-white">${trade.offering.fullName}</div>
            <div class="text-slate-400 text-[11px]">${trade.offering.archetype} • OVR ${trade.offering.overall} • SPD ${trade.offering.speed} • END ${trade.offering.endurance}</div>
          </div>
          <div class="p-2 bg-slate-900 rounded border border-slate-800">
            <span class="text-rose-400 font-bold block mb-1">YOU SEND:</span>
            <div class="font-bold text-white">${trade.requesting.fullName}</div>
            <div class="text-slate-400 text-[11px]">${trade.requesting.archetype} • OVR ${trade.requesting.overall} • SPD ${trade.requesting.speed} • END ${trade.requesting.endurance}</div>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button data-action="decline-trade" data-trade-id="${trade.id}" class="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold px-4 py-1.5 rounded-lg border border-slate-700">Decline</button>
          <button data-action="accept-trade" data-trade-id="${trade.id}" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-1.5 rounded-lg shadow">Accept Deal</button>
        </div>
      </div>
    `).join('');
  }

  // Bind inbound accept / decline
  document.querySelectorAll('[data-action="accept-trade"]').forEach(btn => {
    btn.onclick = (e) => {
      const tId = e.target.dataset.tradeId;
      executeTrade(tId, true);
    };
  });
  document.querySelectorAll('[data-action="decline-trade"]').forEach(btn => {
    btn.onclick = (e) => {
      const tId = e.target.dataset.tradeId;
      executeTrade(tId, false);
    };
  });

  // Outbound Trade Dropdowns
  const targetSelect = document.getElementById('trade-target-team');
  const myPlayerSelect = document.getElementById('trade-my-player');
  const theirPlayerSelect = document.getElementById('trade-their-player');

  const otherTeams = league.teams.filter(t => !t.isUser);
  targetSelect.innerHTML = otherTeams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

  myPlayerSelect.innerHTML = userTeam.roster.map(p => `<option value="${p.id}">${p.fullName} (OVR ${p.overall}, ${p.archetype})</option>`).join('');

  const updateTheirDropdown = () => {
    const selectedTeamId = targetSelect.value;
    const team = league.teams.find(t => t.id === selectedTeamId);
    if (team) {
      theirPlayerSelect.innerHTML = team.roster.map(p => `<option value="${p.id}">${p.fullName} (OVR ${p.overall}, ${p.archetype})</option>`).join('');
    }
  };

  targetSelect.onchange = updateTheirDropdown;
  updateTheirDropdown();

  // Outbound submit
  document.getElementById('btn-submit-trade-proposal').onclick = () => {
    const targetTeam = league.teams.find(t => t.id === targetSelect.value);
    const myPlayer = userTeam.roster.find(p => p.id === myPlayerSelect.value);
    const theirPlayer = targetTeam.roster.find(p => p.id === theirPlayerSelect.value);

    if (!myPlayer || !theirPlayer) return;

    const evaluation = evaluateTrade(targetTeam, myPlayer, theirPlayer);
    const responseBox = document.getElementById('trade-response-box');
    responseBox.classList.remove('hidden');

    if (evaluation.accepted) {
      responseBox.className = "mt-4 p-4 rounded-xl border border-emerald-500/40 bg-emerald-950/20 text-emerald-300 text-xs";
      responseBox.innerHTML = `<strong>DEAL ACCEPTED!</strong><br>${evaluation.message}`;

      // Swap players in rosters
      userTeam.roster = userTeam.roster.filter(p => p.id !== myPlayer.id);
      targetTeam.roster = targetTeam.roster.filter(p => p.id !== theirPlayer.id);
      userTeam.roster.push(theirPlayer);
      targetTeam.roster.push(myPlayer);

      // Clean up starters so traded player is removed if they were starting
      userTeam.starters = (userTeam.starters || []).filter(p => p.id !== myPlayer.id);
      targetTeam.starters = (targetTeam.starters || []).filter(p => p.id !== theirPlayer.id);

      league.validateTeamStarters(userTeam);
      league.validateTeamStarters(targetTeam);
      league.leagueNews.unshift(`BLOCKBUSTER TRADE: ${userTeam.name} send ${myPlayer.fullName} to ${targetTeam.name} in exchange for ${theirPlayer.fullName}!`);
      league.save();
      refreshAllViews();
      renderTradeDesk();
    } else {
      responseBox.className = "mt-4 p-4 rounded-xl border border-red-500/40 bg-red-950/20 text-red-300 text-xs";
      responseBox.innerHTML = `<strong>PROPOSAL REJECTED:</strong><br>${evaluation.message}`;
    }
  };
}

function executeTrade(tradeId, accept) {
  const trade = league.inboundTrades.find(t => t.id === tradeId);
  if (!trade) return;

  if (accept) {
    const userTeam = league.getUserTeam();
    // Resolve otherTeam from league.teams by ID to avoid stale reference
    const otherTeam = league.teams.find(t => t.id === trade.fromTeam.id) || trade.fromTeam;

    userTeam.roster = userTeam.roster.filter(p => p.id !== trade.requesting.id);
    otherTeam.roster = otherTeam.roster.filter(p => p.id !== trade.offering.id);
    userTeam.roster.push(trade.offering);
    otherTeam.roster.push(trade.requesting);

    // Clean up starters so traded player is removed if they were starting
    userTeam.starters = (userTeam.starters || []).filter(p => p.id !== trade.requesting.id);
    otherTeam.starters = (otherTeam.starters || []).filter(p => p.id !== trade.offering.id);

    league.validateTeamStarters(userTeam);
    league.validateTeamStarters(otherTeam);
    league.leagueNews.unshift(`TRADE ACCEPTED: ${userTeam.name} acquired ${trade.offering.fullName} from ${otherTeam.name} for ${trade.requesting.fullName}!`);
    alert(`Trade Complete! ${trade.offering.fullName} has joined your squad.`);
  }

  league.inboundTrades = league.inboundTrades.filter(t => t.id !== tradeId);
  league.save();
  refreshAllViews();
  renderTradeDesk();
}

function refreshAllViews() {
  renderOwnersBox();
  renderRosterView();
}

// App Initialization
window.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  refreshAllViews();
  // If draft is pending, default to draft tab
  if (!league.draftCompleted) {
    switchTab('draft');
  } else {
    switchTab('owners-box');
  }
});
