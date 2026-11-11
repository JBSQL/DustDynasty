# Backyard Football Simulator (5v5 Ironman GM)

A lightweight, arcade-flavored micro-fantasy sports simulator and GM sandbox inspired by *Backyard Sports*, *Football Manager*, and fantasy football.

You don't call the plays—you're the General Manager sitting in the Owner's Box. You draft a squad of 10 fictional kids, hire an AI Head Coach with distinct playcalling tendencies, trade with rival AI GMs, and manage fatigue and post-game injuries across a 5-week season.

---

## 🏈 Core Rules & Mechanics

1. **50-Yard Field & Starting Position:**
   - Field is exactly 50 yards (0 to 50).
   - No kickoffs: every drive starts at the offense's 5-yard line.
2. **Passing Cap:**
   - Absolute maximum passing throw distance is **30 yards**.
3. **Downs & Advancing:**
   - 4 downs to cross midfield (25-yard marker).
   - Crossing midfield awards a fresh 4 downs to score (Touchdown at 50).
4. **4th Down:**
   - Coaches can go for it (risk turnover on downs at the spot) or declare a Punt (pins the opponent at their 5-yard line).
5. **Scoring:**
   - Touchdown = 6 points. No field goals.
   - Point After Touchdown (PAT): Coach chooses either a **1-point conversion play from the 5-yard line** or a **2-point conversion play from the 10-yard line**.
6. **The "Ironman 5" Starter Lock:**
   - You draft 10 kids onto your squad.
   - You select 5 active starters to play both offense and defense for the entire game.
   - **No mid-game substitutions:** The 5 kids who start at kickoff finish the game.
7. **In-Game Fatigue vs. Post-Game Injuries:**
   - **Endurance:** As drives progress into the 3rd and 4th quarters, player performance degrades based on their Endurance rating.
   - **Injuries only materialize AFTER the game:** During the game, hits and snaps accumulate wear. At the final whistle, the Trainer's Room evaluates the rolls. Any injuries sideline players for 1–3 weeks, forcing you to start kids from your bench in subsequent games.
8. **The Coaching Carousel:**
   - AI Head Coaches have distinct playcalling archetypes (*Air Raid*, *Ground & Pound*, *Chaos Blitz*, *Analytical Ace*, *Bend-Don't-Break*).
   - If your coach is misusing your roster or losing games, you can **fire them** and interview candidates in the front office.

---

## 🚀 How to Run the Prototype

To launch the web prototype locally, run either of the following from this folder:

### Option A: Python HTTP Server (Zero Install)
```powershell
python -m http.server 8080
```
Then open your browser to: [http://localhost:8080](http://localhost:8080)

### Option B: Node / npx
```powershell
npx serve .
```

### Option C: Run Automated Headless Simulation Test
```powershell
node test-sim.js
```

---

## 📂 Project Structure
- [`index.html`](file:///C:/Users/johnj/.gemini/antigravity/scratch/backyard-football-sim/index.html) - Main dashboard with Owner's Box, Live Field, Draft Room, Roster, Coaching Staff, and Trade Desk.
- [`js/engine.js`](file:///C:/Users/johnj/.gemini/antigravity/scratch/backyard-football-sim/js/engine.js) - Pure simulation math engine (50-yd field, 30-yd pass limit, fatigue decay curve, post-game injury generator).
- [`js/state.js`](file:///C:/Users/johnj/.gemini/antigravity/scratch/backyard-football-sim/js/state.js) - League state, 6-team schedule, standings, draft flow, and local storage persistence.
- [`js/names.js`](file:///C:/Users/johnj/.gemini/antigravity/scratch/backyard-football-sim/js/names.js) - Prospect pool generator (height, weight, speed, throwing, hands, tackling, endurance, archetypes).
- [`js/coaches.js`](file:///C:/Users/johnj/.gemini/antigravity/scratch/backyard-football-sim/js/coaches.js) - Head coach archetypes, play tendencies, press quotes, and interview dialogue system.
- [`js/teams.js`](file:///C:/Users/johnj/.gemini/antigravity/scratch/backyard-football-sim/js/teams.js) - League franchises, AI GM draft logic, and trade negotiation engine.
- [`js/app.js`](file:///C:/Users/johnj/.gemini/antigravity/scratch/backyard-football-sim/js/app.js) - Interactive UI manager and visual field renderer.
- [`css/style.css`](file:///C:/Users/johnj/.gemini/antigravity/scratch/backyard-football-sim/css/style.css) - Yard markers, field turf styling, and scoreboard glows.
