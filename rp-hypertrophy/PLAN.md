# RP Hypertrophy — Local Rebuild Plan

## Part 1: How the RP Hypertrophy app works (research summary)

The RP Hypertrophy app (Renaissance Periodization, led by Dr. Mike Israetel) is a
bodybuilding training planner built around three ideas:

### 1. Mesocycle structure

- Training is organized into **mesocycles**: 4–6 weeks of *accumulation* followed by a
  **deload** week.
- The user picks days per week (2–6), assigns muscle groups to each day, and picks
  exercises for each muscle group (from a library or ~45 templates).
- Effort is prescribed as **Reps In Reserve (RIR)** and ramps down over the meso:
  e.g. a 5-week meso runs 3 RIR → 2 RIR → 1 RIR → 0 RIR → deload. Volume (sets),
  weight, and reps trend up while RIR trends down, so the weeks get progressively harder.
- The deload week cuts sets roughly in half and drops loads/reps so fatigue dissipates
  before the next meso.

### 2. Volume landmarks (MEV / MAV / MRV)

Each muscle group has per-week set-count landmarks from RP's published tables:

- **MEV** (Minimum Effective Volume) — where a meso starts (~week 1).
- **MAV** (Maximum Adaptive Volume) — the productive middle zone.
- **MRV** (Maximum Recoverable Volume) — the ceiling; the app won't push you past it.

A meso starts each muscle near MEV and uses feedback to climb toward (but not past) MRV
by the final accumulation week.

### 3. Autoregulation via feedback

This is the app's signature feature. Around each workout the app asks short questions
per muscle group and feeds the answers into a set-progression algorithm:

- **Soreness** (recovery check for the muscle since it was last trained):
  *Never got sore / Healed a while ago / Healed just in time / Still sore*.
- **Pump** (after finishing that muscle's exercises): *No pump / Decent pump / Amazing pump*.
- **Workload** (perceived difficulty for that muscle): *Easy / Pretty good / Pushed my
  limits / Too much*.
- **Joint pain** per exercise (used to suggest swapping exercises).

The algorithm, roughly: low soreness + weak pump + easy workload → **add 1–3 sets** next
week (you're under-stimulated and recovering fine); healed just in time / pushed limits →
**hold sets**; still sore or "too much" → **remove a set / back off** (you've exceeded
recovery). Set counts are clamped between MEV and MRV.

**Load/rep progression** is simpler: if you hit your rep targets at the prescribed RIR,
the next week nudges weight up (~2–2.5%, rounded to real plate increments) and/or adds a
rep, consistent with the falling RIR target.

Other core UX: log weight × reps per set with checkmarks, manually add/remove sets
mid-workout, swap exercises, see weekly volume per muscle, and auto-generate each new
week from the previous week's data.

Sources: [RP Hypertrophy official page](https://rpstrength.com/pages/hypertrophy-app),
[RP: Progressing for Hypertrophy](https://rpstrength.com/blogs/articles/progressing-for-hypertrophy),
[Dr. Muscle review](https://dr-muscle.com/rp-hypertrophy-app-review/),
[Dr. Muscle strength review](https://dr-muscle.com/rp-hypertrophy-app-for-strength-training-expert-review/).

## Part 2: Rebuild plan (local app)

### Goals (core features, v1)

1. **Mesocycle builder** — name, length (4–6 weeks incl. deload), days/week, per-day
   muscle groups + exercises from a built-in library.
2. **Workout logging** — today's workout with per-set weight/reps entry, RIR target
   banner, add/remove sets, mark sets done.
3. **Feedback + autoregulation** — per-muscle soreness/pump/workload questions when a
   workout is finished; set-progression matrix decides next week's set counts (clamped
   MEV→MRV); load progression bumps weight when targets are hit.
4. **Automatic week generation** — finishing the last workout of a week generates the
   next week (or the deload, with halved sets and reduced load/reps).
5. **Overview** — meso dashboard: week × day grid, weekly sets per muscle vs landmarks.

Out of scope for v1: accounts, templates gallery, videos, exercise swap suggestions,
rest timers, charts/analytics beyond weekly volume.

### Architecture

Local-first, zero runtime dependencies — runs with nothing but Node.js (≥18):

```
rp-hypertrophy/
  server.js            # node:http — static file server + JSON REST API
  src/engine.js        # pure progression engine (all training logic, no I/O)
  src/exercises.js     # built-in exercise library + muscle volume landmarks
  src/store.js         # JSON-file persistence (data/db.json, gitignored)
  public/index.html    # single-page app shell
  public/app.js        # vanilla JS SPA (views: dashboard, builder, workout, overview)
  public/style.css
  test/engine.test.js  # node:test unit tests for the engine
  test/e2e.test.js     # Playwright end-to-end test (dev-only dependency)
```

- **Engine is pure** (state in → new state out) so every progression rule is unit-testable.
- **API**: `GET /api/state`, `GET /api/exercises`, `POST /api/mesocycles`,
  `PUT /api/mesocycles/:id/workouts/:week/:day` (save sets),
  `POST /api/mesocycles/:id/workouts/:week/:day/finish` (feedback → progression →
  next-week generation), `DELETE /api/mesocycles/:id`.
- **Run**: `node server.js` → http://localhost:4780.

### Engine rules (v1 implementation of RP's logic)

- **RIR ramp**: accumulation weeks count down to 0 RIR in the final accumulation week
  (5-week meso → 3,2,1,0; 6-week → 4,3,2,1,0); deload ≈ 4+ RIR.
- **Set progression** per muscle per week, from feedback
  (soreness 0–3, pump 0–2, workload 0–3):
  - soreness = 3 (*still sore*) or workload = 3 (*too much*) → **−1 set**
  - otherwise start from `2 − soreness` (never sore → +2, healed a while ago → +1,
    healed just in time → +0), then −1 if workload = *pushed my limits*, +1 if pump =
    *none* and workload = *easy*; clamp change to [−1, +3]; clamp weekly sets to
    [MEV, MRV]. Extra/removed sets are distributed across that muscle's exercises.
- **Load progression** per exercise: week 1 is a calibration week (user finds working
  weights). Afterwards, if every set hit its rep target → +2.5% weight (rounded to
  0.5 lb/kg step, min +2.5 units of 2.5) next week; else keep weight and chase reps.
  Rep target = last week's achieved reps (+1 on weight-hold weeks).
- **Deload**: half of week-1 sets (min 1/exercise), ~55% of final-week load, half reps.
- **Missing feedback** defaults to "hold" (no set change) so skipping questions is safe.

### Volume landmarks used (sets/week, from RP's published guides)

| Muscle | MEV | MRV | | Muscle | MEV | MRV |
|---|---|---|---|---|---|---|
| Chest | 8 | 22 | | Shoulders (delts) | 8 | 26 |
| Back | 10 | 25 | | Biceps | 8 | 20 |
| Quads | 8 | 20 | | Triceps | 6 | 18 |
| Hamstrings | 4 | 16 | | Calves | 8 | 16 |
| Glutes | 4 | 16 | | Abs | 6 | 16 |
| Traps | 4 | 12 | | Forearms | 4 | 12 |

### Build & test sequence

1. Engine + exercise library, with unit tests (`node --test`).
2. Server + persistence + API.
3. Frontend SPA.
4. Playwright e2e: build meso → log week 1 → submit feedback → assert week 2 exists
   with progressed sets/weights → fast-forward to deload and assert halved volume.
5. Iterate until unit + e2e are green.
