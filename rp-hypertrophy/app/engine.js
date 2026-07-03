// ============================================================================
// Progression engine — "performance-first autoregulation"
// ============================================================================
// Original algorithm (not a clone of any commercial app). Design principle:
//
//   OBJECTIVE PERFORMANCE IS THE ACCELERATOR; SUBJECTIVE FEEDBACK IS ONLY A
//   BRAKE. Volume increases must be earned by measurable progress.
//
// Why this inversion (vs soreness/pump-driven engines):
// - Soreness tracks muscle damage and novelty, not growth: early-phase protein
//   synthesis is spent on repair, and damage is not required for hypertrophy
//   (Damas 2016, J Physiol; Damas 2018, Eur J Appl Physiol). So soreness only
//   ever REDUCES or HOLDS volume here — it never earns an increase.
// - The "pump" has mechanistic-only support as a growth signal (Schoenfeld &
//   Contreras 2014, Strength Cond J; de Freitas 2017) — we log it for the user
//   but give it ZERO weight in decisions.
// - Performance-based autoregulation beats fixed prescriptions (Mann 2010,
//   JSCR — APRE; Helms 2018, Front Physiol — RPE/RIR loading), and a sustained
//   performance decrement is the validated overreaching signal (Bell 2020,
//   J Sports Sci; Meeusen 2013, MSSE — ECSS/ACSM consensus: monitor
//   performance + mood, there is no reliable blood biomarker).
// - Unearned volume is wasted: adding 30-60% more sets gave no extra growth in
//   trained lifters over 8 weeks (Enes 2024, MSSE), while the dose-response
//   does reward more volume when it's productive (Schoenfeld 2017, J Sports
//   Sci; Pelland 2025, Sports Med meta-regression — diminishing returns,
//   negligible marginal benefit approaching ~30 sets/week).
//
// Bodyweight environments (calisthenics / home) run the same engine. The only
// difference is the progression lever: instead of adding plates, topping out a
// rep window advances the movement to its harder variation. That is legitimate
// overload — progressive push-up training matched bench press for strength and
// muscle thickness (Kotarsky 2018, JSCR; Kikuchi & Nakazato 2017, J Exerc Sci
// Fit), effort-matched push-ups matched bench for strength gain (Calatayud
// 2015, JSCR), rep progression equals load progression at matched effort
// (Plotkin 2022, PeerJ), and loads down to ~30% 1RM grow muscle when sets end
// near failure (Schoenfeld 2021, Sports; Lopez 2021, MSSE).
//
// All state is plain JSON and every function is pure, so the whole ruleset is
// unit-testable and ports to a native app unchanged.
// ============================================================================

import { VOLUME_LANDMARKS, getExercise, getExerciseByName } from './exercises.js';

// --------------------------- feedback scales --------------------------------
// Indices matter — the brake logic uses them.
export const SORENESS = ['Never got sore', 'Healed a while ago', 'Healed just in time', 'Still sore now'];
export const WORKLOAD = ['Easy', 'Pretty hard', 'Very hard', 'Too much'];
export const PUMP = ['No pump', 'Decent pump', 'Great pump']; // logged, never programmed from
export const JOINT_PAIN = ['None', 'Mild', 'Painful'];

// Rest-timer defaults (seconds). Longer rest preserves per-set reps and thus
// volume load (Schoenfeld 2016, JSCR: 3 min > 1 min when volume unequated;
// Longo 2022, JSCR: the effect is volume-load-mediated; Singer 2024, Front
// Sports Act Living: >=1-2 min is adequate, small overall effect).
export const REST_SECONDS = { compound: 150, isolation: 90 };

export const DELOAD_RIR = 4;
// Per-session stimulus saturates around ~11 fractional / ~6-8 direct hard sets
// per muscle (Remmert 2025, SportRxiv per-session analyses). Added volume
// beyond the cap must go to another training day.
export const SESSION_SET_CAP = 8;

// --------------------------- RIR prescription -------------------------------
// Hypertrophy improves as sets approach failure, with the useful zone at 0-3
// RIR (Robinson 2024, Sports Med meta-regression). Actually reaching momentary
// failure adds only trivial extra growth (ES ~0.12-0.19) at 2-3x the acute
// fatigue cost (Refalo 2023, Sports Med meta; Refalo 2023 velocity-loss study;
// Morán-Navarro 2017, EJAP — 24-48 h slower recovery), so failure (0 RIR) is
// reserved for ISOLATION lifts in the final accumulation week only. Self-
// reported RIR is accurate to ~1 rep only within 0-5 RIR (Zourdos 2016, JSCR;
// Hackett 2017, PeerJ), so working sets never sit above 4 RIR.
export function rirForWeek(weekIndex, weeksTotal) {
  const accumWeeks = weeksTotal - 1; // final week is the deload
  if (weekIndex >= accumWeeks) return { compound: DELOAD_RIR, isolation: DELOAD_RIR, isDeload: true };
  const i = weekIndex + 1; // 1-based accumulation week
  const compound = Math.max(1, 4 - i); // 3, 2, 1, 1, ...
  const isolation = i === accumWeeks ? 0 : Math.max(1, compound - 1);
  return { compound, isolation, isDeload: false };
}

// --------------------------- load increments --------------------------------
// Double progression: chase reps inside the window, then take the smallest
// practical load jump (~2.5-5% of the working load, capped at 5% so a jump
// never exits the rep window). Rep- and load-progression are equally effective
// at matched effort (Plotkin 2022, PeerJ); increment sizes are field
// convention.
export function loadIncrement(exercise, weight, unit) {
  const kg = unit === 'kg';
  const smallest = kg ? 1.25 : 2.5;
  const base = exercise.type === 'compound'
    ? (exercise.region === 'lower' ? (kg ? 5 : 10) : (kg ? 2.5 : 5))
    : smallest;
  if (!weight || weight <= 0) return base;
  const fivePct = Math.max(smallest, Math.round((weight * 0.05) / smallest) * smallest);
  return Math.min(base, fivePct);
}

export function roundLoad(weight, unit) {
  const step = unit === 'kg' ? 1.25 : 2.5;
  return Math.round(weight / step) * step;
}

// ------------------------ per-exercise progression --------------------------

function doneSets(wex) {
  // Bodyweight sets are valid with no external load logged.
  return wex.sets.filter((s) => s.done && s.reps != null && (s.weight != null || wex.bodyweight));
}

function bestSet(wex) {
  const sets = doneSets(wex);
  if (sets.length === 0) return null;
  const w = (s) => s.weight ?? 0;
  const top = Math.max(...sets.map(w));
  const reps = Math.max(...sets.filter((s) => w(s) === top).map((s) => s.reps));
  return { weight: top, reps };
}

// Next-week prescription for one exercise from its previous-week instance.
// Returns { targetWeight, missStreak, prevSets, repRange, swapTo? }.
export function progressExercise(prevWex, unit, environment = 'gym') {
  const done = doneSets(prevWex);
  const [repLo, repHi] = prevWex.repRange;
  const carry = {
    targetWeight: prevWex.targetWeight,
    missStreak: prevWex.missStreak || 0,
    prevSets: prevWex.prevSets || null,
    repRange: prevWex.repRange,
  };
  if (done.length === 0) return carry; // nothing logged — don't guess
  const snapshot = done.map((s) => ({ weight: s.weight, reps: s.reps }));
  const allSetsDone = done.length >= prevWex.sets.length;

  // ---- bodyweight path: variation chains instead of plates ----
  if (prevWex.bodyweight && prevWex.targetWeight == null) {
    const loaded = done.filter((s) => (s.weight ?? 0) > 0);
    if (allSetsDone && loaded.length === done.length && loaded.length > 0) {
      // External load (vest/belt) on every prescribed set — graduate to the
      // standard weighted double progression. Partial sessions don't qualify.
      return { ...carry, targetWeight: Math.max(...loaded.map((s) => s.weight)), missStreak: 0, prevSets: snapshot };
    }
    if (allSetsDone && done.every((s) => s.reps >= repHi)) {
      const def = getExercise(prevWex.exerciseId);
      const harder = def?.next ? getExerciseByName(def.next) : null;
      if (harder && harder.envs.includes(environment)) {
        // Movement mastered → advance the chain (Kotarsky 2018; Plotkin 2022).
        return { targetWeight: null, missStreak: 0, prevSets: null, repRange: harder.repRange, swapTo: harder.id };
      }
      if (repHi < 30) {
        // End of the chain: keep earning reps — still growth territory while
        // sets end near failure (Schoenfeld 2021: effective to ~30 reps).
        return { ...carry, repRange: [repLo + 2, Math.min(30, repHi + 2)], missStreak: 0, prevSets: snapshot };
      }
    }
    return { ...carry, missStreak: 0, prevSets: snapshot };
  }

  // ---- weighted path ----
  if (prevWex.targetWeight == null) {
    // Calibration week: adopt the heaviest weight the user actually worked with.
    return { ...carry, targetWeight: Math.max(...done.map((s) => s.weight)), missStreak: 0, prevSets: snapshot };
  }
  const target = prevWex.targetWeight;
  const atTarget = done.filter((s) => s.weight >= target);

  // Every set below the prescription: the user re-anchored reality for us.
  // One week is a bad day; two running adopts the weight actually being used
  // (APRE-style down-adjustment — Mann 2010, JSCR).
  if (atTarget.length === 0) {
    const missStreak = (prevWex.missStreak || 0) + 1;
    if (missStreak >= 2) {
      return { ...carry, targetWeight: roundLoad(Math.max(...done.map((s) => s.weight)), unit), missStreak: 0, prevSets: snapshot };
    }
    return { ...carry, missStreak, prevSets: snapshot };
  }

  if (allSetsDone && atTarget.length === done.length && done.every((s) => s.reps >= repHi)) {
    // Base the jump on what was actually lifted, not the stale prescription —
    // out-performing the plan must never read as regression next week.
    const base = Math.max(target, ...atTarget.map((s) => s.weight));
    const inc = loadIncrement(prevWex, base, unit);
    return { ...carry, targetWeight: roundLoad(base + inc, unit), missStreak: 0, prevSets: snapshot };
  }

  // Misses are judged only on sets near the prescribed load — an optional
  // heavy top set above target must not poison the streak. Below the window
  // bottom two sessions running → drop the load 5% and rebuild (Mann 2010).
  const nearTarget = atTarget.filter((s) => s.weight <= target * 1.05 + 1e-9);
  const judged = nearTarget.length > 0 ? nearTarget : atTarget;
  const missedBottom = Math.min(...judged.map((s) => s.reps)) < repLo;
  const missStreak = missedBottom ? (prevWex.missStreak || 0) + 1 : 0;
  if (missStreak >= 2) {
    return { ...carry, targetWeight: roundLoad(target * 0.95, unit), missStreak: 0, prevSets: snapshot };
  }
  return { ...carry, missStreak, prevSets: snapshot };
}

// Perf comparison for one exercise across weeks: judged on best-set quality
// (top weight, then reps at that weight) so it is robust to set-count changes.
export function exercisePerf(prevWex, currWex) {
  const prev = bestSet(prevWex);
  const curr = bestSet(currWex);
  if (!prev || !curr) return null;
  if (curr.weight > prev.weight || (curr.weight === prev.weight && curr.reps > prev.reps)) return 1;
  if (curr.weight < prev.weight || (curr.weight === prev.weight && curr.reps < prev.reps)) return -1;
  return 0;
}

// ------------------------ weekly volume accounting ---------------------------

// Hard-set volume per muscle. Indirect work counts 0.5 (fractional-set
// convention — Baz-Valle 2019/2022 set-counting framework).
export function weeklySetsPerMuscle(week, { fractional = true } = {}) {
  const totals = {};
  for (const w of week.workouts) {
    for (const e of w.exercises) {
      totals[e.muscle] = (totals[e.muscle] || 0) + e.sets.length;
      if (fractional) {
        for (const m of e.secondary || []) totals[m] = (totals[m] || 0) + e.sets.length * 0.5;
      }
    }
  }
  for (const m of Object.keys(totals)) totals[m] = Math.round(totals[m] * 2) / 2;
  return totals;
}

// Match each of this week's exercises to its previous-week instance by
// exerciseId within the same day (consuming duplicates in order), so that
// mid-meso adds, removals, and variation swaps never derail progression.
function matchPrev(prevWeek, dayIndex, exerciseId, used) {
  const workout = prevWeek?.workouts[dayIndex];
  if (!workout) return null;
  const idx = workout.exercises.findIndex((e, i) => !used.has(i) && e.exerciseId === exerciseId);
  if (idx === -1) return null;
  used.add(idx);
  return workout.exercises[idx];
}

// --------------------- weekly volume decision (per muscle) -------------------

// Muscle-level performance trend: +1 if >=50% of the muscle's exercises
// progressed, -1 if >=50% regressed, else 0 (performance-first — Mann 2010;
// Bell 2020 performance-decrement signal).
export function musclePerf(prevWeek, week) {
  const byMuscle = {};
  week.workouts.forEach((workout, di) => {
    const used = new Set();
    workout.exercises.forEach((wex) => {
      const prevWex = matchPrev(prevWeek, di, wex.exerciseId, used);
      if (!prevWex) return;
      const p = exercisePerf(prevWex, wex);
      if (p == null) return;
      (byMuscle[wex.muscle] ||= []).push(p);
    });
  });
  const perf = {};
  for (const [muscle, arr] of Object.entries(byMuscle)) {
    const up = arr.filter((p) => p === 1).length / arr.length;
    const down = arr.filter((p) => p === -1).length / arr.length;
    perf[muscle] = down >= 0.5 ? -1 : up >= 0.5 ? 1 : 0;
  }
  return perf;
}

// Recovery brake from subjective inputs. Fires on: still-sore at the next
// session (persistent soreness = unpaid recovery cost — Damas 2016/2018),
// "too much" workload (near-maximal perceived effort is valid near failure —
// Zourdos 2016), or joint pain on at least half the muscle's exercises.
// NOTE the asymmetry: these can only hold or cut volume, never raise it.
export function muscleBrake(week, muscle) {
  let painCount = 0;
  let exCount = 0;
  for (const w of week.workouts) {
    const fb = w.feedback?.[muscle];
    if (fb && (fb.soreness === 3 || fb.workload === 3)) return true;
    for (const e of w.exercises) {
      if (e.muscle !== muscle) continue;
      exCount += 1;
      if ((e.jointPain || 0) >= 2) painCount += 1;
    }
  }
  return exCount > 0 && painCount / exCount >= 0.5;
}

// The decision table (priority: performance > brake > hold):
//   perf -1 & brake  → -2 sets   (overreached: validated decrement + high cost)
//   perf -1          → -1 set
//   perf  0          →  0        (volume that isn't earned isn't added — Enes 2024)
//   perf +1 & brake  →  0        (progressing, but at high recovery cost)
//   perf +1          → +1 set    (earned; dose-response rewards it — Schoenfeld
//                                 2017, Pelland 2025; +1/week rate is convention)
// A muscle set to 'maintain' never gains volume — muscle is retained on a
// fraction of its building dose (Bickel 2011, MSSE: as little as 1/9 of the
// training volume maintained size in young adults for 32 weeks), so
// maintenance work stays cheap and the recovery budget goes to growth muscles.
export function volumeDelta(perf, brake, priority = 'grow') {
  if (perf === -1) return brake ? -2 : -1;
  if (priority === 'maintain') return 0;
  if (perf === 1 && !brake) return 1;
  return 0;
}

// ------------------------------ construction --------------------------------

function makeSets(count) {
  return Array.from({ length: count }, () => ({ weight: null, reps: null, done: false }));
}

function slotFrom(def) {
  const { id: exerciseId, muscle, name, type, region, repRange, secondary, equipment } = def;
  return { exerciseId, muscle, name, type, region, repRange, secondary, equipment, bodyweight: equipment === 'bodyweight' };
}

function slotToWex(slot, prescription) {
  return {
    exerciseId: slot.exerciseId,
    muscle: slot.muscle,
    name: slot.name,
    type: slot.type,
    region: slot.region,
    repRange: prescription.repRange ?? slot.repRange,
    secondary: slot.secondary,
    bodyweight: slot.bodyweight,
    targetWeight: prescription.targetWeight ?? null,
    missStreak: prescription.missStreak ?? 0,
    prevSets: prescription.prevSets ?? null,
    jointPain: 0,
    sets: makeSets(prescription.sets),
  };
}

function buildWeek(meso, weekIndex, isDeload, prescribe) {
  const rir = isDeload ? { compound: DELOAD_RIR, isolation: DELOAD_RIR } : rirForWeek(weekIndex, meso.weeksTotal);
  return {
    index: weekIndex,
    isDeload,
    rir: { compound: rir.compound, isolation: rir.isolation },
    perf: null, // filled when the following week is generated
    notes: [],
    workouts: meso.days.map((day, di) => ({
      dayIndex: di,
      name: day.name,
      status: 'pending',
      exercises: day.slots.map((slot, ei) => slotToWex(slot, prescribe(slot, di, ei))),
      feedback: {},
    })),
  };
}

// config: { name, weeksTotal 4-6, unit, environment, days: [{ name, slots: [{ exerciseId }] }] }
export function createMesocycle(config, id) {
  const days = (config.days || []).map((d, i) => ({
    name: (d.name || '').trim() || `Day ${i + 1}`,
    slots: d.slots.map((s) => {
      const def = getExercise(s.exerciseId);
      if (!def) throw new Error(`Unknown exercise id ${s.exerciseId}`);
      return slotFrom(def);
    }),
  }));
  if (days.length === 0) throw new Error('Add at least one training day');
  const emptyDay = days.findIndex((d) => d.slots.length === 0);
  if (emptyDay !== -1) throw new Error(`${days[emptyDay].name} has no exercises yet`);
  for (const d of days) {
    const perMuscle = {};
    for (const s of d.slots) perMuscle[s.muscle] = (perMuscle[s.muscle] || 0) + 1;
    for (const [m, n] of Object.entries(perMuscle)) {
      if (n > SESSION_SET_CAP) throw new Error(`${d.name} has ${n} ${m} exercises — the per-session stimulus cap is ${SESSION_SET_CAP}; spread them across days`);
    }
  }

  // Week 1 starts each muscle near its evidence-based starting volume
  // (Schoenfeld 2017; Baz-Valle 2022 — see VOLUME_LANDMARKS), split across
  // that muscle's slots, honoring the per-session cap.
  const slotsPerMuscle = {};
  for (const d of days) for (const s of d.slots) slotsPerMuscle[s.muscle] = (slotsPerMuscle[s.muscle] || 0) + 1;
  const priorities = config.priorities || {};
  const perSlot = {};
  for (const [muscle, n] of Object.entries(slotsPerMuscle)) {
    // config.startVolumes lets a follow-up meso restart just below its last
    // peak instead of at the generic landmark (see nextMesoConfig); those
    // values already reflect any maintenance reduction, so the maintenance
    // divisor only applies to landmark-derived starts.
    let start = config.startVolumes?.[muscle];
    if (start == null) {
      start = VOLUME_LANDMARKS[muscle]?.startVolume ?? 8;
      // Maintenance dose ≈ one third of the building dose (Bickel 2011, MSSE —
      // even 1/9 maintained size in young adults; 1/3 is the conservative pick).
      if (priorities[muscle] === 'maintain') start = Math.max(2, Math.ceil(start / 3));
    }
    perSlot[muscle] = Math.max(priorities[muscle] === 'maintain' ? 1 : 2, Math.min(5, Math.round(start / n)));
  }
  // Per-session cap at creation too (Remmert 2025): if one day stacks several
  // slots of a muscle, trim the largest until the day fits.
  const startSets = days.map((d) => d.slots.map((s) => perSlot[s.muscle]));
  days.forEach((d, di) => {
    const byMuscle = {};
    d.slots.forEach((s, si) => (byMuscle[s.muscle] ||= []).push(si));
    for (const idxs of Object.values(byMuscle)) {
      let guard = 32;
      while (idxs.reduce((a, si) => a + startSets[di][si], 0) > SESSION_SET_CAP && guard-- > 0) {
        const largest = idxs.reduce((a, si) => (startSets[di][si] > startSets[di][a] ? si : a), idxs[0]);
        if (startSets[di][largest] <= 1) break;
        startSets[di][largest] -= 1;
      }
    }
  });

  const meso = {
    id,
    name: (config.name || '').trim() || 'Mesocycle',
    weeksTotal: Math.max(4, Math.min(6, config.weeksTotal || 5)),
    unit: config.unit === 'kg' ? 'kg' : 'lb',
    environment: ['gym', 'calisthenics', 'home'].includes(config.environment) ? config.environment : 'gym',
    priorities,
    exerciseNotes: {},
    days,
    weeks: [],
    status: 'active',
    reactiveDeload: false,
    createdAt: config.createdAt || null,
  };
  meso.weeks.push(buildWeek(meso, 0, false, (slot, di, ei) => ({ sets: startSets[di][ei], targetWeight: null })));
  return meso;
}

// ----------------------- mid-meso program edits ------------------------------
// Users can reshape the program while it runs. Edits apply to the current
// pending week immediately and to every generated week after (generation reads
// meso.days). Logged history is never rewritten.

export function addExercise(meso, dayIndex, exerciseId) {
  const def = getExercise(exerciseId);
  if (!def) throw new Error('Unknown exercise');
  const slot = slotFrom(def);
  meso.days[dayIndex].slots.push(slot);
  const week = meso.weeks[meso.weeks.length - 1];
  const workout = week.workouts[dayIndex];
  if (workout && workout.status !== 'done') {
    // New work enters at 2 sets and calibrates — it has no history to earn more.
    workout.exercises.push(slotToWex(slot, { sets: 2, targetWeight: null }));
  }
  return def;
}

export function removeExercise(meso, dayIndex, slotIndex) {
  const day = meso.days[dayIndex];
  if (!day || !day.slots[slotIndex]) throw new Error('No such exercise');
  if (day.slots.length <= 1) throw new Error('A training day needs at least one exercise');
  // Match the Nth occurrence positionally so duplicate movements in one day
  // remove the intended instance, not the first one found.
  const occurrence = day.slots.slice(0, slotIndex)
    .filter((s) => s.exerciseId === day.slots[slotIndex].exerciseId).length;
  const [slot] = day.slots.splice(slotIndex, 1);
  const week = meso.weeks[meso.weeks.length - 1];
  const workout = week.workouts[dayIndex];
  if (workout && workout.status !== 'done') {
    let seen = 0;
    const i = workout.exercises.findIndex((e) => e.exerciseId === slot.exerciseId && seen++ === occurrence);
    if (i >= 0) workout.exercises.splice(i, 1);
  }
  return slot;
}

// -------------------------- next-week generation -----------------------------

// Reactive deload trigger: performance regressed for 2 consecutive weeks on 2+
// of the same muscles (sustained decrement is THE validated overreaching
// signal — Bell 2020; Meeusen 2013). Fires the deload early and ends the meso.
export function reactiveDeloadDue(meso) {
  if (meso.weeks.length < 3) return false; // needs two week-over-week comparisons
  const last = meso.weeks[meso.weeks.length - 1];
  const before = meso.weeks[meso.weeks.length - 2];
  if (!last.perf || !before.perf) return false;
  const regressedTwice = Object.keys(last.perf)
    .filter((m) => last.perf[m] === -1 && before.perf[m] === -1);
  return regressedTwice.length >= 2;
}

export function generateNextWeek(meso) {
  const prevWeek = meso.weeks[meso.weeks.length - 1];
  const weekIndex = prevWeek.index + 1;
  if (weekIndex >= meso.weeksTotal) throw new Error('Mesocycle is already complete');

  // Record the finished week's performance trend before deciding anything.
  const weekBefore = meso.weeks.length >= 2 ? meso.weeks[meso.weeks.length - 2] : null;
  prevWeek.perf = weekBefore ? musclePerf(weekBefore, prevWeek) : {};

  let isDeload = weekIndex === meso.weeksTotal - 1;
  if (!isDeload && reactiveDeloadDue(meso)) {
    isDeload = true;
    meso.reactiveDeload = true;
    meso.weeksTotal = weekIndex + 1; // deload now; the meso ends a week early
  }

  const notes = [];

  // Per-slot: previous instance (matched by exerciseId), load prescription,
  // and any variation-chain swap. Swaps mutate meso.days so they persist.
  const matched = meso.days.map((day, di) => {
    const used = new Set();
    return day.slots.map((slot) => matchPrev(prevWeek, di, slot.exerciseId, used));
  });
  const prescriptions = meso.days.map((day, di) => day.slots.map((slot, ei) => {
    const prevWex = matched[di][ei];
    if (!prevWex) return { targetWeight: null, missStreak: 0, prevSets: null, repRange: slot.repRange };
    let p = progressExercise(prevWex, meso.unit, meso.environment);
    if (p.swapTo && isDeload) {
      // A deload keeps the pattern and cuts effort — never introduce a harder,
      // never-practiced variation here. The advance re-earns itself next block.
      p = { targetWeight: prevWex.targetWeight, missStreak: 0, prevSets: null, repRange: prevWex.repRange };
    } else if (p.swapTo) {
      const harder = getExercise(p.swapTo);
      notes.push(`${slot.name} mastered — advancing to ${harder.name}.`);
      Object.assign(slot, slotFrom(harder));
      p = { targetWeight: null, missStreak: 0, prevSets: null, repRange: harder.repRange };
    }
    if (isDeload) {
      // Deload from the load actually used last week — a progression bump has
      // no place in a fatigue-dissipation week.
      const base = prevWex.targetWeight ?? p.targetWeight;
      p.targetWeight = base != null ? roundLoad(base * 0.9, meso.unit) : null;
      p.missStreak = 0;
    }
    return p;
  }));

  // Set counts: start from the matched previous sets (2 for brand-new slots).
  const baseSets = meso.days.map((day, di) => day.slots.map((slot, ei) => matched[di][ei]?.sets.length ?? 2));

  let setsBySlot;
  if (isDeload) {
    // Deload = one microcycle at half the sets and -10% load / 4 RIR, keeping
    // frequency and exercise selection (Bell 2023 Delphi — cut effort, keep the
    // pattern; Bell 2024 survey; Coleman 2024 — full rest costs some strength;
    // Pancar 2026 — reduced-volume deload preserves both).
    setsBySlot = baseSets.map((day) => day.map((n) => Math.max(1, Math.ceil(n / 2))));
  } else {
    const slotRefs = [];
    meso.days.forEach((day, di) => day.slots.forEach((slot, ei) => {
      slotRefs.push({ di, ei, muscle: slot.muscle, sets: baseSets[di][ei] });
    }));
    const current = {};
    for (const r of slotRefs) current[r.muscle] = (current[r.muscle] || 0) + r.sets;
    const slotsPerMuscle = {};
    for (const r of slotRefs) slotsPerMuscle[r.muscle] = (slotsPerMuscle[r.muscle] || 0) + 1;
    const daySets = (muscle, di) => slotRefs.filter((r) => r.muscle === muscle && r.di === di).reduce((a, r) => a + r.sets, 0);

    for (const [muscle, sets] of Object.entries(current)) {
      const delta = volumeDelta(prevWeek.perf[muscle] ?? 0, muscleBrake(prevWeek, muscle), meso.priorities?.[muscle]);
      const cap = VOLUME_LANDMARKS[muscle]?.maxVolume ?? 20;
      const target = Math.max(slotsPerMuscle[muscle], Math.min(cap, sets + delta));
      const slots = slotRefs.filter((r) => r.muscle === muscle);
      let total = sets;
      let guard = 64;
      while (total < target && guard-- > 0) {
        const open = slots.filter((r) => daySets(muscle, r.di) < SESSION_SET_CAP).sort((a, b) => a.sets - b.sets);
        if (open.length === 0) break; // every session at cap — volume saturates
        open[0].sets += 1;
        total += 1;
      }
      while (total > target && guard-- > 0) {
        const shrinkable = slots.filter((r) => r.sets > 1).sort((a, b) => b.sets - a.sets);
        if (shrinkable.length === 0) break;
        shrinkable[0].sets -= 1;
        total -= 1;
      }
    }
    setsBySlot = baseSets.map((day) => day.slice());
    for (const r of slotRefs) setsBySlot[r.di][r.ei] = r.sets;
  }

  const week = buildWeek(meso, weekIndex, isDeload, (slot, di, ei) => ({
    sets: setsBySlot[di][ei],
    ...prescriptions[di][ei],
  }));
  week.notes = notes;
  meso.weeks.push(week);
  return week;
}

// ------------------------------ workout flow ---------------------------------

export function finishWorkout(meso, weekIndex, dayIndex, feedback, finishedAt = null, { skipped = false } = {}) {
  const week = meso.weeks[weekIndex];
  const workout = week?.workouts[dayIndex];
  if (!workout) throw new Error('No such workout');
  workout.status = 'done';
  workout.skipped = skipped;
  workout.finishedAt = finishedAt;
  workout.feedback = feedback || {};

  const weekDone = week.workouts.every((w) => w.status === 'done');
  let weekGenerated = false;
  let mesoComplete = false;
  if (weekDone && week.index === meso.weeks.length - 1) {
    if (week.index < meso.weeksTotal - 1) {
      generateNextWeek(meso);
      weekGenerated = true;
    } else {
      meso.status = 'complete';
      mesoComplete = true;
    }
  }
  return { weekGenerated, mesoComplete, reactiveDeload: meso.reactiveDeload && weekGenerated && meso.weeks[meso.weeks.length - 1].isDeload };
}

// Life happens: a skipped workout closes the day with nothing logged. Unlogged
// exercises carry their prescriptions forward unchanged (see progressExercise),
// missing feedback defaults to "hold", and the week can still complete.
export function skipWorkout(meso, weekIndex, dayIndex, finishedAt = null) {
  return finishWorkout(meso, weekIndex, dayIndex, {}, finishedAt, { skipped: true });
}

export function currentPosition(meso) {
  for (const week of meso.weeks) {
    for (const w of week.workouts) {
      if (w.status !== 'done') return { weekIndex: week.index, dayIndex: w.dayIndex };
    }
  }
  return null;
}

// Epley estimated 1RM — used for the exercise PR/history view only, never for
// prescriptions (estimation error is too high to program from).
export function e1rm(weight, reps) {
  if (weight == null || reps == null || reps <= 0) return null;
  return Math.round(weight * (1 + reps / 30));
}

// ------------------------- next-meso continuity ------------------------------

// Builder config for the block after a finished meso. The program (including
// any variation swaps the engine made) carries over, and each muscle restarts
// at max(slot count, its peak accumulation volume - 2 sets) rather than the
// generic landmark: resume below the fatigued peak and re-earn the climb
// (resensitization logic per the deload literature — Bell 2023/2024; fatigue
// rationale from Pelland 2025; the -2 offset is convention).
export function nextMesoConfig(meso) {
  const peak = {};
  for (const week of meso.weeks) {
    if (week.isDeload) continue;
    const vol = weeklySetsPerMuscle(week, { fractional: false });
    for (const [m, sets] of Object.entries(vol)) peak[m] = Math.max(peak[m] || 0, sets);
  }
  const slotsPerMuscle = {};
  for (const d of meso.days) for (const s of d.slots) slotsPerMuscle[s.muscle] = (slotsPerMuscle[s.muscle] || 0) + 1;
  const startVolumes = {};
  for (const [m, sets] of Object.entries(peak)) {
    startVolumes[m] = Math.max(slotsPerMuscle[m] ?? 1, sets - 2);
  }
  return {
    name: `${meso.name} — next block`,
    weeksTotal: meso.weeksTotal >= 5 ? meso.weeksTotal : 5,
    unit: meso.unit,
    environment: meso.environment,
    days: meso.days.map((d) => ({ name: d.name, slots: d.slots.map((s) => ({ exerciseId: s.exerciseId })) })),
    startVolumes,
    priorities: { ...(meso.priorities || {}) },
    continuedFrom: meso.id,
  };
}
