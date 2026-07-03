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
// All state shapes are plain JSON (documented in PLAN.md); every function here
// is pure so the whole ruleset is unit-testable and portable to a native app.
// ============================================================================

import { VOLUME_LANDMARKS, getExercise } from './exercises.js';

// --------------------------- feedback scales --------------------------------
// Indices matter — the engine's brake logic uses them.
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
// per muscle (Remmert 2025, SportRxiv; long-rest per-session analyses). Added
// volume beyond the cap must go to another training day.
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
// Rep-based and load-based progression are equally effective when effort is
// matched (Plotkin 2022, PeerJ), and hypertrophy is load-independent across
// ~30-85%+ 1RM near failure (Schoenfeld 2021, Sports; Lopez 2021, MSSE), so we
// use double progression: add reps inside the window, then the smallest
// practical load jump. Increment sizes are field convention (~2.5-5% of the
// working load), capped at 5% so a jump never exits the rep window.
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
  return wex.sets.filter((s) => s.done && s.weight != null && s.reps != null);
}

function bestSet(sets) {
  if (sets.length === 0) return null;
  const top = Math.max(...sets.map((s) => s.weight));
  const reps = Math.max(...sets.filter((s) => s.weight === top).map((s) => s.reps));
  return { weight: top, reps };
}

// Double progression for one exercise slot, from its previous-week instance.
// Returns { targetWeight, missStreak, prevSets } for the next week's instance.
export function progressExercise(prevWex, unit) {
  const done = doneSets(prevWex);
  const [repLo, repHi] = prevWex.repRange;

  if (done.length === 0) {
    // Nothing logged — carry state forward unchanged rather than guessing.
    return { targetWeight: prevWex.targetWeight, missStreak: prevWex.missStreak || 0, prevSets: prevWex.prevSets || null };
  }
  const snapshot = done.map((s) => ({ weight: s.weight, reps: s.reps }));

  if (prevWex.targetWeight == null) {
    // Calibration week: adopt the heaviest weight the user actually worked with.
    return { targetWeight: Math.max(...done.map((s) => s.weight)), missStreak: 0, prevSets: snapshot };
  }

  const atTarget = done.filter((s) => s.weight >= prevWex.targetWeight);
  const allSetsDone = done.length >= prevWex.sets.length;
  // Add-load trigger: top of the rep window on ALL prescribed sets at the
  // target load (Plotkin 2022 — reps until window top, then smallest jump).
  if (allSetsDone && atTarget.length === done.length && done.every((s) => s.reps >= repHi)) {
    const inc = loadIncrement(prevWex, prevWex.targetWeight, unit);
    return { targetWeight: roundLoad(prevWex.targetWeight + inc, unit), missStreak: 0, prevSets: snapshot };
  }
  // Auto-reset: below the window bottom two sessions running → drop the load
  // 5% and rebuild (APRE-style down-adjustment — Mann 2010, JSCR).
  const missedBottom = atTarget.length > 0 && Math.min(...atTarget.map((s) => s.reps)) < repLo;
  const missStreak = missedBottom ? (prevWex.missStreak || 0) + 1 : 0;
  if (missStreak >= 2) {
    return { targetWeight: roundLoad(prevWex.targetWeight * 0.95, unit), missStreak: 0, prevSets: snapshot };
  }
  return { targetWeight: prevWex.targetWeight, missStreak, prevSets: snapshot };
}

// Perf comparison for one exercise across weeks: judged on best-set quality
// (top weight, then reps at that weight) so it is robust to set-count changes.
export function exercisePerf(prevWex, currWex) {
  const prev = bestSet(doneSets(prevWex));
  const curr = bestSet(doneSets(currWex));
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

function directSetsPerMuscle(week) {
  return weeklySetsPerMuscle(week, { fractional: false });
}

// --------------------- weekly volume decision (per muscle) -------------------

// Muscle-level performance trend: +1 if >=50% of the muscle's direct exercises
// progressed, -1 if >=50% regressed, else 0 (performance-first — Mann 2010;
// Bell 2020 performance-decrement signal).
export function musclePerf(prevWeek, week) {
  const byMuscle = {};
  week.workouts.forEach((workout, di) => {
    workout.exercises.forEach((wex, ei) => {
      const prevWex = prevWeek?.workouts[di]?.exercises[ei];
      if (!prevWex || prevWex.exerciseId !== wex.exerciseId) return;
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
export function volumeDelta(perf, brake) {
  if (perf === -1) return brake ? -2 : -1;
  if (perf === 1 && !brake) return 1;
  return 0;
}

// ------------------------------ construction --------------------------------

function makeSets(count) {
  return Array.from({ length: count }, () => ({ weight: null, reps: null, done: false }));
}

function slotToWex(slot, prescription) {
  return {
    exerciseId: slot.exerciseId,
    muscle: slot.muscle,
    name: slot.name,
    type: slot.type,
    region: slot.region,
    repRange: slot.repRange,
    secondary: slot.secondary,
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
    workouts: meso.days.map((day, di) => ({
      dayIndex: di,
      name: day.name,
      status: 'pending',
      exercises: day.slots.map((slot, ei) => slotToWex(slot, prescribe(slot, di, ei))),
      feedback: {},
    })),
  };
}

// config: { name, weeksTotal 4-6, unit, days: [{ name, slots: [{ exerciseId }] }] }
export function createMesocycle(config, id) {
  const days = (config.days || []).map((d, i) => ({
    name: (d.name || '').trim() || `Day ${i + 1}`,
    slots: d.slots.map((s) => {
      const found = getExercise(s.exerciseId);
      if (!found) throw new Error(`Unknown exercise id ${s.exerciseId}`);
      const { id: exerciseId, muscle, name, type, region, repRange, secondary } = found;
      return { exerciseId, muscle, name, type, region, repRange, secondary };
    }),
  }));
  if (days.length === 0 || days.some((d) => d.slots.length === 0)) {
    throw new Error('Every training day needs at least one exercise');
  }

  // Week 1 starts each muscle near its evidence-based starting volume
  // (Schoenfeld 2017; Baz-Valle 2022 — see VOLUME_LANDMARKS), split across
  // that muscle's direct slots, honoring the per-session cap.
  const slotsPerMuscle = {};
  for (const d of days) for (const s of d.slots) slotsPerMuscle[s.muscle] = (slotsPerMuscle[s.muscle] || 0) + 1;
  const perSlot = {};
  for (const [muscle, n] of Object.entries(slotsPerMuscle)) {
    const start = VOLUME_LANDMARKS[muscle]?.startVolume ?? 8;
    perSlot[muscle] = Math.max(2, Math.min(5, Math.round(start / n)));
  }
  // Enforce the per-session cap at creation too (Remmert 2025): when one day
  // holds several slots for a muscle, trim the largest slots until the day fits.
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
    days,
    weeks: [],
    status: 'active',
    reactiveDeload: false,
    createdAt: config.createdAt || null,
  };
  meso.weeks.push(buildWeek(meso, 0, false, (slot, dayIndex, exIndex) => ({ sets: startSets[dayIndex][exIndex], targetWeight: null })));
  return meso;
}

// -------------------------- next-week generation -----------------------------

// Distribute per-muscle weekly set targets across slots as evenly as possible,
// never exceeding SESSION_SET_CAP direct sets per muscle per day (Remmert
// 2025 — per-session stimulus saturation).
function distributeSets(prevWeek, muscleTargets) {
  const slotRefs = [];
  prevWeek.workouts.forEach((w) => {
    w.exercises.forEach((e, ei) => {
      slotRefs.push({ dayIndex: w.dayIndex, exIndex: ei, muscle: e.muscle, sets: e.sets.length });
    });
  });
  const daySets = (muscle, dayIndex) =>
    slotRefs.filter((s) => s.muscle === muscle && s.dayIndex === dayIndex).reduce((a, s) => a + s.sets, 0);

  for (const [muscle, target] of Object.entries(muscleTargets)) {
    const slots = slotRefs.filter((s) => s.muscle === muscle);
    let total = slots.reduce((a, s) => a + s.sets, 0);
    let guard = 64;
    while (total < target && guard-- > 0) {
      const candidates = slots
        .filter((s) => daySets(muscle, s.dayIndex) < SESSION_SET_CAP)
        .sort((a, b) => a.sets - b.sets);
      if (candidates.length === 0) break; // all sessions at cap — volume saturates
      candidates[0].sets += 1;
      total += 1;
    }
    while (total > target && guard-- > 0) {
      const candidates = slots.filter((s) => s.sets > 1).sort((a, b) => b.sets - a.sets);
      if (candidates.length === 0) break;
      candidates[0].sets -= 1;
      total -= 1;
    }
  }
  const bySlot = {};
  for (const s of slotRefs) bySlot[`${s.dayIndex}:${s.exIndex}`] = s.sets;
  return bySlot;
}

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

  let setsBySlot;
  if (isDeload) {
    // Deload = one microcycle at half the sets and -10% load / 4 RIR, keeping
    // frequency and exercise selection (Bell 2023 Delphi — cut effort, keep the
    // pattern; Bell 2024 survey — ~6-day deloads, sets cut, frequency kept;
    // Coleman 2024 — full rest costs some strength; Pancar 2026 — reduced-
    // volume deload preserves both).
    setsBySlot = {};
    prevWeek.workouts.forEach((w) => {
      w.exercises.forEach((e, ei) => {
        setsBySlot[`${w.dayIndex}:${ei}`] = Math.max(1, Math.ceil(e.sets.length / 2));
      });
    });
  } else {
    const current = directSetsPerMuscle(prevWeek);
    const slotsPerMuscle = {};
    for (const d of meso.days) for (const s of d.slots) slotsPerMuscle[s.muscle] = (slotsPerMuscle[s.muscle] || 0) + 1;
    const targets = {};
    for (const [muscle, sets] of Object.entries(current)) {
      const delta = volumeDelta(prevWeek.perf[muscle] ?? 0, muscleBrake(prevWeek, muscle));
      const cap = VOLUME_LANDMARKS[muscle]?.maxVolume ?? 20;
      targets[muscle] = Math.max(slotsPerMuscle[muscle], Math.min(cap, sets + delta));
    }
    setsBySlot = distributeSets(prevWeek, targets);
  }

  const week = buildWeek(meso, weekIndex, isDeload, (slot, dayIndex, exIndex) => {
    const prevWex = prevWeek.workouts[dayIndex].exercises[exIndex];
    const p = progressExercise(prevWex, meso.unit);
    if (isDeload) {
      // Deload from the load actually used in the last accumulation week — a
      // progression bump has no place in a fatigue-dissipation week.
      const base = prevWex.targetWeight ?? p.targetWeight;
      p.targetWeight = base != null ? roundLoad(base * 0.9, meso.unit) : null;
      p.missStreak = 0;
    }
    return { sets: setsBySlot[`${dayIndex}:${exIndex}`], ...p };
  });
  meso.weeks.push(week);
  return week;
}

// ------------------------------ workout flow ---------------------------------

export function finishWorkout(meso, weekIndex, dayIndex, feedback) {
  const week = meso.weeks[weekIndex];
  const workout = week?.workouts[dayIndex];
  if (!workout) throw new Error('No such workout');
  workout.status = 'done';
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
