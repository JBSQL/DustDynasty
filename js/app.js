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
        <div class="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
          <span>${player.height}</span>
          <span>•</span>
          <span>${player.weight} lbs</span>
          <span>•</span>
          <span class="text-amber-300 font-semibold">Age ${player.age || 10}</span>
          <span class="text-[10px] text-slate-500 font-mono">(${player.yearsRemaining !== undefined ? player.yearsRemaining : Math.max(1, 13 - (player.age || 10))}y left)</span>
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

let aiDraftTimer = null;

function clearAIDraftTimer() {
  if (aiDraftTimer) {
    clearTimeout(aiDraftTimer);
    aiDraftTimer = null;
  }
}

function switchTab(tabId) {
  clearAIDraftTimer();
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

  // Year badge in header
  const yearBadge = document.getElementById('header-year');
  if (yearBadge) yearBadge.textContent = `Year ${league.seasonYear || 1}`;

  // Next Matchup
  const matchups = league.getCurrentWeekMatchups();
  const userMatchup = matchups.find(m => m.homeId === userTeam.id || m.awayId === userTeam.id) || matchups[0];

  const playLiveBtn = document.getElementById('btn-play-game-live');
  const quickSimBtn = document.getElementById('btn-quick-sim-game');
  const offseasonBtn = document.getElementById('btn-advance-offseason');

  if (league.seasonOver) {
    document.getElementById('dash-week-num').textContent = "Season Final";
    document.getElementById('dash-matchup-rule').textContent = "Season Complete";
    document.getElementById('dash-coach-hint').textContent = "The season has concluded! Review the standings and advance to the Offseason Draft.";
    if (playLiveBtn) playLiveBtn.classList.add('hidden');
    if (quickSimBtn) quickSimBtn.classList.add('hidden');
    if (offseasonBtn) {
      offseasonBtn.classList.remove('hidden');
      offseasonBtn.onclick = () => openOffseasonModal();
    }
  } else if (userMatchup) {
    if (playLiveBtn) {
      playLiveBtn.classList.remove('hidden');
      playLiveBtn.disabled = false;
    }
    if (quickSimBtn) {
      quickSimBtn.classList.remove('hidden');
      quickSimBtn.disabled = false;
    }
    if (offseasonBtn) offseasonBtn.classList.add('hidden');

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
// TAB 3: DRAFT ROOM (Inaugural Snake Draft & Dynasty Rookie Drafts)
// -------------------------------------------------------------
function renderDraftRoom() {
  clearAIDraftTimer();
  const turn = league.getCurrentDraftTurn();
  const draftTitle = document.getElementById('draft-header-title');
  const draftPill = document.getElementById('draft-status-pill');
  const draftTurnLabel = document.getElementById('draft-turn-label');
  const prospectCount = document.getElementById('prospect-count');
  const banner = document.getElementById('draft-status-banner');

  if (draftTitle) {
    draftTitle.textContent = league.seasonYear === 1
      ? "10-ROUND INAUGURAL DRAFT"
      : `SEASON ${league.seasonYear} ROOKIE DRAFT`;
  }

  prospectCount.textContent = league.prospectPool.length;

  if (league.draftCompleted || !turn) {
    draftPill.textContent = "Draft Complete";
    draftPill.className = "text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-lg font-bold";
    draftTurnLabel.innerHTML = `All picks complete! Roster and Ironman 5 starters are locked in.`;
    document.getElementById('btn-auto-draft-user').disabled = true;
    document.getElementById('btn-auto-draft-all').disabled = true;

    if (banner) {
      banner.className = "rounded-xl p-4 border border-emerald-500/40 bg-emerald-950/40 flex flex-wrap items-center justify-between gap-3";
      banner.innerHTML = `
        <div class="flex items-center gap-3">
          <span class="text-2xl">🎉</span>
          <div>
            <h4 class="text-sm font-bold text-white">Draft Complete for Season ${league.seasonYear}!</h4>
            <p class="text-xs text-emerald-300/80">All 6 neighborhood squads have locked their 10-player rosters and Ironman 5 starters.</p>
          </div>
        </div>
        <div class="flex gap-2">
          <button id="btn-banner-go-roster" class="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg border border-slate-700 transition">
            View Starting 5 & Roster
          </button>
          <button id="btn-banner-go-schedule" class="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-lg shadow transition">
            Proceed to Week 1 Kickoff →
          </button>
        </div>
      `;
      banner.classList.remove('hidden');
      document.getElementById('btn-banner-go-roster')?.addEventListener('click', () => switchTab('roster'));
      document.getElementById('btn-banner-go-schedule')?.addEventListener('click', () => switchTab('owners-box'));
    }

    renderProspectGrid();
    return;
  }

  document.getElementById('btn-auto-draft-user').disabled = false;
  document.getElementById('btn-auto-draft-all').disabled = false;

  draftPill.textContent = `Round ${turn.round} • Pick ${turn.pickNumber} / ${league.draftOrder.length}`;

  const nextUserPick = league.getUserNextPick();
  const userHasFuturePick = nextUserPick !== null;

  if (turn.isUserTurn) {
    clearAIDraftTimer();
    draftTurnLabel.innerHTML = `On The Clock: <span class="font-bold text-rose-400">${turn.team.name}</span> <span class="text-xs bg-rose-500 text-white px-2 py-0.5 rounded font-bold ml-2 animate-pulse">🚨 YOUR TURN ON THE CLOCK</span>`;

    if (banner) {
      banner.className = "rounded-xl p-3.5 border border-rose-500/50 bg-rose-950/30 flex items-center justify-between gap-3";
      banner.innerHTML = `
        <div class="flex items-center gap-2.5">
          <span class="text-xl">🎯</span>
          <div>
            <span class="text-xs font-bold text-white block">You are On the Clock! (Pick #${turn.pickNumber})</span>
            <span class="text-[11px] text-slate-400">Choose a prospect below or sort by attribute to reinforce your squad.</span>
          </div>
        </div>
        <span class="text-xs text-rose-300 font-mono font-bold">Pick #${turn.pickNumber}</span>
      `;
      banner.classList.remove('hidden');
    }
  } else {
    // AI turn
    const userNotice = userHasFuturePick
      ? `(Your next pick: #${nextUserPick})`
      : `(Your 10-player squad is full!)`;
    draftTurnLabel.innerHTML = `On The Clock: <span class="font-bold text-white">${turn.team.name}</span> <span class="text-xs text-amber-300 ml-2 font-mono">${userNotice}</span>`;

    if (banner) {
      banner.className = "rounded-xl p-3 border border-amber-500/40 bg-amber-950/30 flex flex-wrap items-center justify-between gap-3";
      banner.innerHTML = `
        <div class="flex items-center gap-2.5">
          <span class="animate-spin text-lg">⏳</span>
          <div>
            <span class="text-xs font-bold text-amber-300 block">${turn.team.name} are on the clock...</span>
            <span class="text-[11px] text-slate-400">${userHasFuturePick ? `Drafting automatically. Your pick is #${nextUserPick}.` : 'Your squad has all 10 roster spots filled.'}</span>
          </div>
        </div>
        <div class="flex gap-2">
          ${userHasFuturePick ? `
            <button id="btn-banner-sim-user" class="bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold px-3 py-1.5 rounded-lg transition shadow">
              ⚡ Skip to My Turn (Pick #${nextUserPick})
            </button>
          ` : `
            <button id="btn-banner-sim-all" class="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition shadow">
              ⚡ Finish Remaining AI Picks
            </button>
          `}
        </div>
      `;
      banner.classList.remove('hidden');
      document.getElementById('btn-banner-sim-user')?.addEventListener('click', () => {
        clearAIDraftTimer();
        league.autoDraftUntilUserOrEnd();
        league.save();
        renderDraftRoom();
        renderOwnersBox();
      });
      document.getElementById('btn-banner-sim-all')?.addEventListener('click', () => {
        clearAIDraftTimer();
        league.autoDraftAll();
        league.save();
        renderDraftRoom();
        renderOwnersBox();
      });
    }

    // Auto-advance this AI pick after 700ms so the user watches the draft unfold live
    aiDraftTimer = setTimeout(() => {
      const pick = league.advanceOneAIPick();
      if (pick) {
        renderDraftRoom();
        renderOwnersBox();
      }
    }, 700);
  }

  // Render prospect cards
  renderProspectGrid();

  // Auto Draft Controls
  document.getElementById('btn-auto-draft-user').onclick = () => {
    clearAIDraftTimer();
    league.autoDraftUntilUserOrEnd();
    league.save();
    renderDraftRoom();
    renderOwnersBox();
  };

  document.getElementById('btn-auto-draft-all').onclick = () => {
    clearAIDraftTimer();
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
        <div class="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
          <span>${player.height}</span>
          <span>•</span>
          <span>${player.weight} lbs</span>
          <span>•</span>
          <span class="text-amber-300 font-semibold">Age ${player.age || 9}</span>
          <span class="text-[10px] text-slate-500 font-mono">(${player.yearsRemaining !== undefined ? player.yearsRemaining : Math.max(1, 13 - (player.age || 9))}y left)</span>
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
      clearAIDraftTimer();
      const pId = e.target.dataset.playerId;
      league.makeDraftPick(pId);
      league.save();
      renderDraftRoom();
      renderOwnersBox();
    };
  });
}

// -------------------------------------------------------------
// TAB 4: GAME DAY SIMULATOR
// -------------------------------------------------------------
let isPlayAnimating = false;

function executePlayWithAnimation() {
  if (!currentGameEngine || currentGameEngine.isGameOver || isPlayAnimating) return;

  const eng = currentGameEngine;
  isPlayAnimating = true;

  const stepBtn = document.getElementById('btn-step-play');
  const simDriveBtn = document.getElementById('btn-sim-drive');
  const simGameBtn = document.getElementById('btn-sim-full-game');

  if (stepBtn) {
    stepBtn.disabled = true;
    stepBtn.innerHTML = `Running Play... ⏱️`;
    stepBtn.classList.add('opacity-60', 'cursor-not-allowed');
  }
  if (simDriveBtn) simDriveBtn.disabled = true;
  if (simGameBtn) simGameBtn.disabled = true;

  // 1. Step the play in the engine
  const playResult = eng.stepPlay();

  // 2. Play the route & ball animation sequence
  animatePlayOnField(eng, playResult, () => {
    isPlayAnimating = false;
    if (stepBtn) {
      stepBtn.disabled = false;
      stepBtn.innerHTML = eng.pendingPAT ? `Play Extra Point 🎯` : `Next Play ▶`;
      stepBtn.classList.remove('opacity-60', 'cursor-not-allowed');
    }
    if (simDriveBtn) simDriveBtn.disabled = false;
    if (simGameBtn) simGameBtn.disabled = false;

    // Refresh view for next play line of scrimmage
    updateGameDayView();
    if (eng.isGameOver) handleGameOver();
  });
}

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
    if (!currentGameEngine || currentGameEngine.isGameOver || isPlayAnimating) return;
    executePlayWithAnimation();
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
  const defTeam = eng.getDefenseTeam();
  const nextPlayBtn = document.getElementById('btn-step-play');
  const downDistEl = document.getElementById('sim-down-dist');

  // Format field position: OWN X vs OPP Y
  const yard = eng.yardLine;
  const fieldSpotDesc = yard <= 25 ? `OWN ${yard}` : `OPP ${50 - yard}`;
  const targetDesc = eng.firstDownMarker === 25 ? "Line to Gain: MIDFIELD (25)" : "Line to Gain: GOAL LINE (50)";

  if (eng.pendingPAT) {
    const isTwo = eng.pendingPATGoForTwo;
    const patLabel = isTwo ? "🎯 2-POINT CONVERSION" : "🎯 EXTRA POINT (1-PT)";
    const patSpot = isTwo ? "from the 10-yd line" : "from the 5-yd line";
    if (downDistEl) {
      downDistEl.innerHTML = `<span class="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded font-mono font-black">${patLabel}</span> <span class="text-slate-300 ml-1.5">${patSpot}</span>`;
    }
    if (nextPlayBtn) nextPlayBtn.innerHTML = `Play Extra Point 🎯`;
  } else {
    const downColor = eng.down === 4 ? "text-rose-400 bg-rose-950/60 border-rose-600/60" : (eng.down === 3 ? "text-amber-400 bg-amber-950/60 border-amber-600/60" : "text-emerald-400 bg-emerald-950/60 border-emerald-600/60");
    if (downDistEl) {
      downDistEl.innerHTML = `
        <span class="px-2 py-0.5 rounded border font-mono font-black ${downColor}">
          ${eng.down}${getOrdinal(eng.down)} & ${eng.yardsToGain}
        </span>
        <span class="text-slate-300 font-semibold ml-1.5">at ${fieldSpotDesc}</span>
        <span class="text-[10px] text-slate-400 font-normal ml-1">(${targetDesc})</span>
      `;
    }
    if (nextPlayBtn) nextPlayBtn.innerHTML = `Next Play ▶`;
  }

  // Dynamic Endzone Banners (Approach A: Left is Home, Right is Away)
  const homeEndzone = document.getElementById('endzone-home-banner');
  const awayEndzone = document.getElementById('endzone-away-banner');
  if (homeEndzone) {
    homeEndzone.textContent = eng.homeTeam.short || eng.homeTeam.name.substring(0, 8).toUpperCase();
    homeEndzone.style.background = `linear-gradient(135deg, ${eng.homeTeam.color || '#e11d48'}, #0f172a)`;
  }
  if (awayEndzone) {
    awayEndzone.textContent = eng.awayTeam.short || eng.awayTeam.name.substring(0, 8).toUpperCase();
    awayEndzone.style.background = `linear-gradient(135deg, ${eng.awayTeam.color || '#16a34a'}, #0f172a)`;
  }

  // Possession Bar & Direction Indicator
  const isHomePoss = eng.possession === "home";
  const possTeam = isHomePoss ? eng.homeTeam : eng.awayTeam;
  const defendingTeam = isHomePoss ? eng.awayTeam : eng.homeTeam;
  const possTeamNameEl = document.getElementById('sim-possession-team-name');
  const possArrowEl = document.getElementById('sim-possession-arrow');
  const targetDescEl = document.getElementById('sim-field-target-desc');

  if (possTeamNameEl) possTeamNameEl.textContent = `${possTeam.emoji} ${possTeam.name}`;
  if (possArrowEl) {
    if (isHomePoss) {
      possArrowEl.innerHTML = `DRIVING ➔`;
      possArrowEl.className = "text-emerald-400 font-mono text-sm font-bold animate-pulse";
    } else {
      possArrowEl.innerHTML = `◀ DRIVING`;
      possArrowEl.className = "text-amber-400 font-mono text-sm font-bold animate-pulse";
    }
  }
  if (targetDescEl) {
    targetDescEl.textContent = isHomePoss 
      ? `Attacking: Right Endzone (${defendingTeam.short})`
      : `Attacking: Left Endzone (${defendingTeam.short})`;
  }

  // Visual Field Update
  // Home drives Left-to-Right (0 to 50); Away drives Right-to-Left (0 to 50)
  const effectiveYard = eng.pendingPAT ? 45 : eng.yardLine;
  const percentPos = yardToPercent(effectiveYard, eng.possession);
  const firstDownPercent = yardToPercent(eng.firstDownMarker, eng.possession);

  const ballEl = document.getElementById('field-ball');
  const losEl = document.getElementById('field-los');
  const markerEl = document.getElementById('field-marker');

  if (ballEl) {
    ballEl.style.left = `${percentPos}%`;
    ballEl.style.top = `50%`;
  }
  if (losEl) losEl.style.left = `${percentPos}%`;
  if (markerEl) markerEl.style.left = `${firstDownPercent}%`;

  // Render Chalkboard Routes & Player Dots
  renderFieldPlayChalkboard(eng);

  // Coach Callout & Concept Badges
  const coach = eng.getOffenseCoach();
  const latestPlay = eng.playLog[0];
  const offBadge = document.getElementById('sim-play-concept-badge');
  const defBadge = document.getElementById('sim-def-concept-badge');

  if (latestPlay && latestPlay.concept) {
    if (offBadge) {
      offBadge.textContent = `OFF: ${formatConceptName(latestPlay.concept)}`;
      offBadge.classList.remove('hidden');
    }
    if (defBadge && latestPlay.defConcept) {
      defBadge.textContent = `DEF: ${formatConceptName(latestPlay.defConcept)}`;
      defBadge.classList.remove('hidden');
    }
  } else {
    if (offBadge) offBadge.classList.add('hidden');
    if (defBadge) defBadge.classList.add('hidden');
  }

  document.getElementById('sim-coach-call').textContent = latestPlay ? latestPlay.description : `${coach.name} dials up the game plan...`;

  // Play Ticker with rich possession & down badges
  const ticker = document.getElementById('sim-play-ticker');
  ticker.innerHTML = eng.playLog.slice(0, 35).map(p => {
    // Resolve team badge info
    const offTeam = p.offenseTeam || (p.possession === "home" ? eng.homeTeam : eng.awayTeam);
    const teamColor = offTeam.color || "#0284c7";
    const teamShort = offTeam.short || "TEAM";
    const teamEmoji = offTeam.emoji || "🏈";

    // Down & Distance or PAT pill
    let downBadge = "";
    if (p.type === "PAT" || p.playType === "PAT") {
      const isGood = p.converted;
      downBadge = `<span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${isGood ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/50' : 'bg-rose-950 text-rose-300 border border-rose-600/50'}">PAT (${p.points ? '+' + p.points : 'MISSED'})</span>`;
    } else if (p.down) {
      const downStr = `${p.down}${getOrdinal(p.down)} & ${p.yardsToGain || p.distance || 0}`;
      const downColor = p.down === 4 ? "bg-rose-950/80 text-rose-300 border-rose-700/60" : (p.down === 3 ? "bg-amber-950/80 text-amber-300 border-amber-700/60" : "bg-slate-800 text-slate-300 border-slate-700");
      downBadge = `<span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${downColor}">${downStr}</span>`;
    }

    // Yardage indicator
    let yardagePill = "";
    if (p.isTouchdown) {
      yardagePill = `<span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-black bg-yellow-500 text-slate-950 shadow-sm animate-pulse">TOUCHDOWN</span>`;
    } else if (p.isTurnover || p.isInterception || p.isFumble) {
      yardagePill = `<span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-black bg-rose-600 text-white shadow-sm">TURNOVER</span>`;
    } else if (p.isSack) {
      yardagePill = `<span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-800">${p.yardsGained} YDS (SACK)</span>`;
    } else if (p.yardsGained != null && p.playType !== "PAT") {
      const gainColor = p.yardsGained > 0 ? "text-emerald-400 bg-emerald-950/40 border-emerald-800/40" : (p.yardsGained < 0 ? "text-rose-400 bg-rose-950/40 border-rose-800/40" : "text-slate-400 bg-slate-800/40 border-slate-700");
      const sign = p.yardsGained > 0 ? "+" : "";
      yardagePill = `<span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border ${gainColor}">${sign}${p.yardsGained} YDS</span>`;
    }

    return `
      <div class="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/90 shadow-sm space-y-1 hover:border-slate-700 transition">
        <div class="flex items-center justify-between text-[11px] gap-2">
          <div class="flex items-center gap-1.5">
            <!-- Team Badge -->
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black text-white shadow-xs" style="background: ${teamColor};">
              <span>${teamEmoji}</span>
              <span>${teamShort}</span>
            </span>
            <!-- Down Badge -->
            ${downBadge}
            <span class="text-slate-500 font-mono text-[10px]">Q${p.quarter || '1'}</span>
          </div>
          <!-- Outcome Tag -->
          ${yardagePill}
        </div>
        <div class="text-xs text-slate-200 leading-relaxed pl-0.5">
          ${p.description}
        </div>
      </div>
    `;
  }).join('');

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

function formatConceptName(name) {
  if (!name) return "";
  return name.replace(/_/g, ' ');
}

// Convert yard line (0 to 50) to field percentage (8% to 92%)
// When Home possesses: 0 = 8% (own goal), 50 = 92% (opponent goal) -> drives left-to-right (dir = +1)
// When Away possesses: 0 = 92% (own goal), 50 = 8% (opponent goal) -> drives right-to-left (dir = -1)
function yardToPercent(yard, possession = "home") {
  const clamped = Math.max(0, Math.min(50, yard));
  if (possession === "home") {
    return 8 + (clamped / 50) * 84;
  } else {
    return 92 - (clamped / 50) * 84;
  }
}

function renderFieldPlayChalkboard(eng) {
  const container = document.getElementById('field-players-container');
  const svgGroup = document.getElementById('field-chalk-routes');
  if (!container || !svgGroup) return;

  const isHomePoss = eng.possession === "home";
  const dir = isHomePoss ? 1 : -1;

  // Colors
  const offTeam = isHomePoss ? eng.homeTeam : eng.awayTeam;
  const defTeam = isHomePoss ? eng.awayTeam : eng.homeTeam;
  const offColor = offTeam.color || "#0284c7";
  const defColor = defTeam.color || "#dc2626";

  // If a PAT is pending, line of scrimmage is spotted 5 yards out (45) or 10 yards out (40)
  const currentYard = eng.yardLine;
  const losPercent = yardToPercent(currentYard, eng.possession);

  // Get current roles
  const offStarters = eng.getOffenseStarters();
  const defStarters = eng.getDefenseStarters();
  const offRoles = eng.assignOffenseRoles(offStarters);
  const defRoles = eng.assignDefenseRoles(defStarters);

  const latestPlay = eng.playLog[0];
  const patConcept = eng.pendingPATGoForTwo ? "TWO_PT_CONVERSION" : "ONE_PT_CONVERSION";
  const concept = eng.pendingPAT ? patConcept : (latestPlay ? latestPlay.concept : "PRO_SET");
  const defConcept = eng.pendingPAT ? "GOALLINE_STAND" : (latestPlay ? latestPlay.defConcept : "BASE_4_1");
  const yardsGained = latestPlay ? (latestPlay.yardsGained || 0) : 0;
  const isPass = latestPlay && latestPlay.playType === "PASS";

  // Base Formation coordinates (% from left, % from top)
  // dir = +1 (Home, Left-to-Right), dir = -1 (Away, Right-to-Left)
  const offensePositions = {
    c:   { role: 'C',   x: losPercent - (0.5 * dir), y: 50, label: 'C',  player: offRoles.center },
    qb:  { role: 'QB',  x: losPercent - (4.0 * dir), y: 50, label: 'QB', player: offRoles.qb },
    rb:  { role: 'RB',  x: losPercent - (6.0 * dir), y: 64, label: 'RB', player: offRoles.rb },
    wr1: { role: 'WR1', x: losPercent - (0.8 * dir), y: 18, label: 'W1', player: offRoles.wr1 },
    wr2: { role: 'WR2', x: losPercent - (0.8 * dir), y: 82, label: 'W2', player: offRoles.wr2 }
  };

  const defensePositions = {
    rush: { role: 'RUSH', x: losPercent + (1.5 * dir), y: 47, label: 'DE', player: defRoles.rusher },
    mlb:  { role: 'MLB',  x: losPercent + (3.0 * dir), y: 55, label: 'LB', player: defRoles.middleLB },
    cb1:  { role: 'CB1',  x: losPercent + (2.5 * dir), y: 20, label: 'CB', player: defRoles.cb1 },
    cb2:  { role: 'CB2',  x: losPercent + (2.5 * dir), y: 80, label: 'CB', player: defRoles.cb2 },
    fs:   { role: 'FS',   x: losPercent + (4.5 * dir), y: 50, label: 'S',  player: defRoles.safety }
  };

  // Clamp defense & offense positions to stay on field (5% to 95%)
  Object.values(offensePositions).forEach(p => { p.x = Math.max(5, Math.min(95, p.x)); });
  Object.values(defensePositions).forEach(p => { p.x = Math.max(5, Math.min(95, p.x)); });

  // Chalk Routes SVG generation based on the concept
  let routesMarkup = "";

  // Helper to draw SVG path with arrow marker
  const makePath = (d, marker = 'arrow-offense', stroke = offColor, dash = '3 3') => {
    return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="2" stroke-dasharray="${dash}" marker-end="url(#${marker})" opacity="0.85"/>`;
  };

  // Target coordinates for routes
  const xWR1 = losPercent;
  const xWR2 = losPercent;

  if (concept === "QUICK_SLANTS") {
    // WR1 cuts down and in, WR2 cuts up and in
    const slantX = Math.max(5, Math.min(95, losPercent + (7 * dir)));
    routesMarkup += makePath(`M ${xWR1}% 18% L ${slantX}% 35%`, 'arrow-offense', offColor);
    routesMarkup += makePath(`M ${xWR2}% 82% L ${slantX}% 65%`, 'arrow-offense', offColor);
    routesMarkup += makePath(`M ${offensePositions.rb.x}% 64% L ${Math.max(5, Math.min(95, losPercent + (2 * dir)))}% 55%`, 'arrow-run', '#facc15');
  } else if (concept === "FOUR_VERTS") {
    // Deep streaks down the sidelines
    const deepX = Math.max(5, Math.min(95, losPercent + (22 * dir)));
    routesMarkup += makePath(`M ${xWR1}% 18% L ${deepX}% 15%`, 'arrow-offense', offColor);
    routesMarkup += makePath(`M ${xWR2}% 82% L ${deepX}% 85%`, 'arrow-offense', offColor);
    routesMarkup += makePath(`M ${offensePositions.rb.x}% 64% L ${Math.max(5, Math.min(95, losPercent + (8 * dir)))}% 45%`, 'arrow-offense', offColor);
  } else if (concept === "OUT_ROUTES") {
    // Out route towards sideline
    const outX = Math.max(5, Math.min(95, losPercent + (10 * dir)));
    routesMarkup += makePath(`M ${xWR1}% 18% L ${outX}% 18% L ${outX}% 8%`, 'arrow-offense', offColor);
    routesMarkup += makePath(`M ${xWR2}% 82% L ${outX}% 82% L ${outX}% 92%`, 'arrow-offense', offColor);
  } else if (concept === "WR_SCREEN") {
    // WR1 screens back, Center seals
    routesMarkup += makePath(`M ${xWR1}% 18% L ${Math.max(5, Math.min(95, losPercent - (2 * dir)))}% 25%`, 'arrow-offense', offColor);
    routesMarkup += makePath(`M ${offensePositions.c.x}% 50% L ${losPercent}% 30%`, 'arrow-run', '#facc15');
  } else if (concept === "HB_DIVE") {
    // RB plunges between Center and Tackle
    const runEndX = Math.max(5, Math.min(95, losPercent + (Math.max(3, yardsGained * 1.5) * dir)));
    routesMarkup += makePath(`M ${offensePositions.rb.x}% 64% L ${losPercent}% 50% L ${runEndX}% 50%`, 'arrow-run', '#facc15', 'none');
  } else if (concept === "OUTSIDE_SWEEP") {
    // RB sweeps outside
    const sweepY = Math.random() < 0.5 ? 20 : 80;
    const runEndX = Math.max(5, Math.min(95, losPercent + (Math.max(3, yardsGained * 1.5) * dir)));
    routesMarkup += makePath(`M ${offensePositions.rb.x}% 64% Q ${losPercent - (2 * dir)}% ${sweepY}% ${runEndX}% ${sweepY}%`, 'arrow-run', '#facc15', 'none');
  } else if (concept === "ONE_PT_CONVERSION") {
    // Slant directly into the target endzone
    const targetGoalX = isHomePoss ? 95 : 5;
    routesMarkup += makePath(`M ${xWR1}% 18% L ${targetGoalX}% 35%`, 'arrow-offense', offColor);
    routesMarkup += makePath(`M ${xWR2}% 82% L ${targetGoalX}% 65%`, 'arrow-offense', offColor);
  } else if (concept === "TWO_PT_CONVERSION") {
    // Goal line plunge / smash into target endzone
    const targetGoalX = isHomePoss ? 95 : 5;
    routesMarkup += makePath(`M ${offensePositions.rb.x}% 64% L ${losPercent}% 50% L ${targetGoalX}% 50%`, 'arrow-run', '#facc15', 'none');
    routesMarkup += makePath(`M ${xWR1}% 18% L ${targetGoalX}% 20%`, 'arrow-offense', offColor);
  } else {
    // Default Pro-set routes
    const standardX = Math.max(5, Math.min(95, losPercent + (8 * dir)));
    routesMarkup += makePath(`M ${xWR1}% 18% L ${standardX}% 22%`, 'arrow-offense', offColor);
    routesMarkup += makePath(`M ${xWR2}% 82% L ${standardX}% 78%`, 'arrow-offense', offColor);
  }

  // Defensive Assignments / Pressure
  if (defConcept === "BANZAI_BLITZ") {
    // Rusher and LB both charge QB
    routesMarkup += makePath(`M ${defensePositions.rush.x}% ${defensePositions.rush.y}% L ${offensePositions.qb.x + (1 * dir)}% 48%`, 'arrow-defense', defColor, '2 2');
    routesMarkup += makePath(`M ${defensePositions.mlb.x}% ${defensePositions.mlb.y}% L ${offensePositions.qb.x + (1 * dir)}% 53%`, 'arrow-defense', defColor, '2 2');
  } else {
    // Rusher rushes, CBs shadow
    routesMarkup += makePath(`M ${defensePositions.rush.x}% ${defensePositions.rush.y}% L ${offensePositions.qb.x + (1.5 * dir)}% 50%`, 'arrow-defense', defColor, '2 2');
    routesMarkup += makePath(`M ${defensePositions.cb1.x}% 20% L ${offensePositions.wr1.x + (4 * dir)}% 20%`, 'arrow-defense', defColor, '2 2');
    routesMarkup += makePath(`M ${defensePositions.cb2.x}% 80% L ${offensePositions.wr2.x + (4 * dir)}% 80%`, 'arrow-defense', defColor, '2 2');
  }

  svgGroup.innerHTML = routesMarkup;

  // Render 10 Player Dots with Team Jersey Colors
  let dotsHtml = "";
  
  // Offense
  Object.entries(offensePositions).forEach(([key, pos]) => {
    const isBallCarrier = latestPlay && latestPlay.ballCarrier && latestPlay.ballCarrier.id === pos.player.id;
    dotsHtml += `
      <div id="player-dot-${key}" class="field-player-dot player-offense ${isBallCarrier ? 'ball-carrier' : ''}" 
           style="left: ${pos.x}%; top: ${pos.y}%; background: ${offColor}; border: 2px solid #ffffff;" 
           title="${pos.player.name} (${pos.role}) - ${offTeam.name}">
        ${pos.label}
      </div>
    `;
  });

  // Defense
  Object.entries(defensePositions).forEach(([key, pos]) => {
    const isTackler = latestPlay && latestPlay.tackler && latestPlay.tackler.id === pos.player.id;
    dotsHtml += `
      <div id="player-dot-${key}" class="field-player-dot player-defense ${isTackler ? 'tackler' : ''}" 
           style="left: ${pos.x}%; top: ${pos.y}%; background: ${defColor}; border: 2px solid rgba(255,255,255,0.4);" 
           title="${pos.player.name} (${pos.role}) - ${defTeam.name}">
        ${pos.label}
      </div>
    `;
  });

  container.innerHTML = dotsHtml;
}

// Animate the actual snap, route progression, pass delivery/run cut, and tackle
function animatePlayOnField(eng, playResult, onComplete) {
  if (!playResult) {
    onComplete();
    return;
  }

  const ballEl = document.getElementById('field-ball');
  const coachCallEl = document.getElementById('sim-coach-call');
  const offBadge = document.getElementById('sim-play-concept-badge');
  const defBadge = document.getElementById('sim-def-concept-badge');

  if (offBadge && playResult.concept) {
    offBadge.textContent = `OFF: ${formatConceptName(playResult.concept)}`;
    offBadge.classList.remove('hidden');
  }
  if (defBadge && playResult.defConcept) {
    defBadge.textContent = `DEF: ${formatConceptName(playResult.defConcept)}`;
    defBadge.classList.remove('hidden');
  }

  // Determine direction based on who actually ran the play (playResult.possessionKey)
  // rather than eng.possession (which flips immediately on PATs or Turnovers)
  const playPossKey = playResult.possessionKey || eng.possession;
  const isHomePoss = playPossKey === "home";
  const dir = isHomePoss ? 1 : -1;

  const snapYard = playResult.startYardLine != null ? playResult.startYardLine : eng.yardLine;
  const snapPercent = yardToPercent(snapYard, playPossKey);
  const yardsGained = playResult.yardsGained || 0;
  const endYard = Math.max(0, Math.min(50, snapYard + yardsGained));
  const endPercent = yardToPercent(endYard, playPossKey);

  // Set call text immediately
  if (coachCallEl) coachCallEl.textContent = `Snap! ${playResult.description}`;

  // Grab player elements
  const dotC = document.getElementById('player-dot-c');
  const dotQB = document.getElementById('player-dot-qb');
  const dotRB = document.getElementById('player-dot-rb');
  const dotWR1 = document.getElementById('player-dot-wr1');
  const dotWR2 = document.getElementById('player-dot-wr2');
  const dotRush = document.getElementById('player-dot-rush');
  const dotMLB = document.getElementById('player-dot-mlb');
  const dotCB1 = document.getElementById('player-dot-cb1');
  const dotCB2 = document.getElementById('player-dot-cb2');
  const dotFS = document.getElementById('player-dot-fs');

  // STEP 1: SNAP (QB steps back, ball moves to QB, receivers break, rushers surge)
  if (ballEl && dotQB) {
    ballEl.style.left = `${snapPercent - (4 * dir)}%`;
    ballEl.style.top = `50%`;
  }

  // Small delay so pre-snap positions register before moving
  setTimeout(() => {
    // Stage 1 Movement: Routes unfold
    if (dotRush) {
      dotRush.style.left = `${snapPercent - (2 * dir)}%`;
      dotRush.style.top = `48%`;
    }
    if (playResult.defConcept === "BANZAI_BLITZ" && dotMLB) {
      dotMLB.style.left = `${snapPercent - (3 * dir)}%`;
      dotMLB.style.top = `52%`;
    }

    if (playResult.concept === "QUICK_SLANTS") {
      if (dotWR1) { dotWR1.style.left = `${snapPercent + (6 * dir)}%`; dotWR1.style.top = `35%`; }
      if (dotWR2) { dotWR2.style.left = `${snapPercent + (6 * dir)}%`; dotWR2.style.top = `65%`; }
      if (dotCB1) { dotCB1.style.left = `${snapPercent + (7 * dir)}%`; dotCB1.style.top = `33%`; }
      if (dotCB2) { dotCB2.style.left = `${snapPercent + (7 * dir)}%`; dotCB2.style.top = `67%`; }
    } else if (playResult.concept === "FOUR_VERTS") {
      if (dotWR1) { dotWR1.style.left = `${Math.max(5, Math.min(95, snapPercent + (18 * dir)))}%`; dotWR1.style.top = `15%`; }
      if (dotWR2) { dotWR2.style.left = `${Math.max(5, Math.min(95, snapPercent + (18 * dir)))}%`; dotWR2.style.top = `85%`; }
      if (dotCB1) { dotCB1.style.left = `${Math.max(5, Math.min(95, snapPercent + (17 * dir)))}%`; dotCB1.style.top = `17%`; }
      if (dotCB2) { dotCB2.style.left = `${Math.max(5, Math.min(95, snapPercent + (17 * dir)))}%`; dotCB2.style.top = `83%`; }
    } else if (playResult.concept === "HB_DIVE" || playResult.concept === "OUTSIDE_SWEEP") {
      const isSweep = playResult.concept === "OUTSIDE_SWEEP";
      const targetY = isSweep ? 25 : 50;

      if (dotRB) {
        dotRB.style.left = `${endPercent}%`;
        dotRB.style.top = `${targetY}%`;
      }
      if (ballEl) {
        ballEl.style.left = `${endPercent}%`;
        ballEl.style.top = `${targetY}%`;
      }
      // Defensive tackler pursues with clear horizontal offset behind runner
      if (dotMLB) {
        dotMLB.style.left = `${Math.max(5, Math.min(95, endPercent + (3.5 * dir)))}%`;
        dotMLB.style.top = `${targetY + 4}%`;
      }
    } else if (playResult.playType === "PASS" && playResult.isSack) {
      if (dotRush && dotQB) {
        dotQB.style.left = `${endPercent}%`;
        dotQB.style.top = `50%`;
        dotRush.style.left = `${Math.max(5, Math.min(95, endPercent + (3 * dir)))}%`;
        dotRush.style.top = `46%`;
      }
      if (ballEl) ballEl.style.left = `${endPercent}%`;
    }

    // STEP 2: PASS RELEASE & TACKLE (fires after 650ms)
    setTimeout(() => {
      if (playResult.playType === "PAT") {
        const isTwoPt = playResult.concept === "TWO_PT_CONVERSION";
        const converted = playResult.converted;
        
        // Target is deep across the target goal line (95% for Home, 5% for Away) if converted
        const finishX = isHomePoss ? (converted ? 95 : 91) : (converted ? 5 : 9);

        if (isTwoPt) {
          // RB plunges across goal line
          if (dotRB) { dotRB.style.left = `${finishX}%`; dotRB.style.top = `50%`; }
          if (ballEl) { ballEl.style.left = `${finishX}%`; ballEl.style.top = `50%`; }
          if (dotMLB) { dotMLB.style.left = `${Math.max(3, Math.min(97, finishX + (2.5 * dir)))}%`; dotMLB.style.top = `52%`; }
        } else {
          // 1-PT quick strike to WR1 in the endzone
          if (dotWR1) { dotWR1.style.left = `${finishX}%`; dotWR1.style.top = `35%`; }
          if (ballEl) { ballEl.style.left = `${finishX}%`; ballEl.style.top = `35%`; }
          if (dotCB1) { dotCB1.style.left = `${Math.max(3, Math.min(97, finishX + (2.5 * dir)))}%`; dotCB1.style.top = `40%`; }
        }
      } else if (playResult.playType === "PASS" && !playResult.isSack) {
        const isDeep = playResult.concept === "FOUR_VERTS";
        const recTargetY = isDeep ? 18 : 35;

        // Ball flies to the receiver dot
        if (ballEl) {
          ballEl.style.left = `${endPercent}%`;
          ballEl.style.top = `${recTargetY}%`;
        }

        // Receiver reaches catch point
        if (dotWR1) {
          dotWR1.style.left = `${endPercent}%`;
          dotWR1.style.top = `${recTargetY}%`;
        }

        // Defensive back closes in but maintains trailing offset behind receiver
        if (dotCB1) {
          if (playResult.isInterception) {
            // On interception, DB undercuts in FRONT of the receiver
            dotCB1.style.left = `${Math.max(5, Math.min(95, endPercent - (2.5 * dir)))}%`;
            dotCB1.style.top = `${recTargetY}%`;
            if (ballEl) ballEl.style.left = `${Math.max(5, Math.min(95, endPercent - (2.5 * dir)))}%`;
          } else {
            // On completion or tackle, defender trails BEHIND receiver
            dotCB1.style.left = `${Math.max(5, Math.min(95, endPercent + (3.5 * dir)))}%`;
            dotCB1.style.top = `${recTargetY + 5}%`;
          }
        }
      }

      // STEP 3: PLAY CONCLUDES & WHISTLE (fires after 1100ms)
      setTimeout(() => {
        onComplete();
      }, 700);

    }, 650);

  }, 100);
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

  const userTeam = league.getUserTeam();
  const injuryBox = document.getElementById('modal-injuries-container');
  if (eng.postGameInjuries && eng.postGameInjuries.length > 0) {
    injuryBox.innerHTML = eng.postGameInjuries.map(inj => {
      const isUserPlayer = userTeam.roster.some(p => p.id === inj.player.id);
      return `
        <div class="p-3 ${isUserPlayer ? 'bg-red-950/60 border-red-500 ring-1 ring-red-500/50' : 'bg-slate-950 border-slate-800'} border rounded-xl flex items-center justify-between text-xs">
          <div>
            <div class="flex items-center gap-1.5">
              <span class="font-bold text-white">${inj.player.fullName}</span>
              <span class="text-[10px] px-1.5 py-0.2 rounded font-semibold ${isUserPlayer ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-300'}">
                ${isUserPlayer ? 'YOUR SQUAD' : inj.team}
              </span>
            </div>
            <p class="text-red-300/80 text-[11px] mt-0.5">${inj.injuryName}</p>
          </div>
          <span class="bg-red-500/20 text-red-400 border border-red-500/30 px-2.5 py-1 rounded-lg font-bold font-mono shrink-0">
            Out ${inj.duration} Wk${inj.duration > 1 ? 's' : ''}
          </span>
        </div>
      `;
    }).join('');
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

// -------------------------------------------------------------
// TAB: OFFSEASON MODAL & DYNASTY TRANSITION
// -------------------------------------------------------------
function openOffseasonModal() {
  const modal = document.getElementById('offseason-modal');
  if (!modal) return;

  const report = league.prepareOffseasonReport();

  // 1. Populate Graduates List
  const gradList = document.getElementById('offseason-grad-list');
  const gradCount = document.getElementById('offseason-grad-count');
  gradCount.textContent = `${report.graduates.length} Kid${report.graduates.length === 1 ? '' : 's'}`;

  if (report.graduates.length === 0) {
    gradList.innerHTML = `<div class="p-3 bg-slate-900 rounded text-slate-400 italic text-center">No kids aged out or moved away this season! All players return for another campaign.</div>`;
  } else {
    gradList.innerHTML = report.graduates.map(g => {
      const isUser = g.teamId === league.getUserTeam().id;
      return `
        <div class="p-2 bg-slate-900 rounded border ${isUser ? 'border-rose-500/60 bg-rose-950/20' : 'border-slate-800'} flex items-center justify-between">
          <div>
            <span class="font-bold text-white">${g.player.fullName}</span>
            <span class="text-[10px] text-slate-400 block">${g.player.archetype} • OVR ${g.player.overall} • ${g.team}</span>
          </div>
          <span class="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] px-2 py-0.5 rounded font-mono font-bold">
            Aged Out / Moved 🚚
          </span>
        </div>
      `;
    }).join('');
  }

  // 2. Populate Draft Order List (Reverse Standings)
  const draftOrderList = document.getElementById('offseason-draft-order-list');
  draftOrderList.innerHTML = report.draftOrderTeams.map(item => {
    const isUser = item.team.isUser;
    return `
      <div class="p-2.5 bg-slate-900 rounded border ${isUser ? 'border-purple-500/60 bg-purple-950/20' : 'border-slate-800'} flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold text-purple-400">Pick #${item.pick}</span>
          <span class="text-white text-xs font-semibold">${item.team.emoji} ${item.team.name}</span>
          ${isUser ? '<span class="text-[9px] bg-purple-500 text-white px-1.5 py-0.2 rounded font-bold">YOU</span>' : ''}
        </div>
        <span class="text-slate-400 text-xs">${item.team.record.wins}-${item.team.record.losses}</span>
      </div>
    `;
  }).join('');

  modal.classList.remove('hidden');

  // Close modal bindings
  document.getElementById('btn-close-offseason').onclick = () => modal.classList.add('hidden');

  // Start new season draft
  document.getElementById('btn-start-new-season-draft').onclick = () => {
    modal.classList.add('hidden');
    league.startNextDynastySeason();
    refreshAllViews();
    if (league.draftCompleted) {
      alert(`Season ${league.seasonYear} Kickoff! All squads retained full rosters. Ready for Week 1!`);
      switchTab('owners-box');
    } else {
      switchTab('draft');
    }
  };
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
