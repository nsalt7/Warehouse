// Pure progression engine — all training logic lives here, no I/O.
// State shapes are documented in PLAN.md.

import { VOLUME_LANDMARKS, getExercise } from './exercises.js';

export const DELOAD_RIR = 4;
export const WEIGHT_INCREMENT = 2.5;

// Feedback scales (indices matter — the engine math uses them):
export const SORENESS = ['Never got sore', 'Healed a while ago', 'Healed just in time', 'Still sore'];
export const PUMP = ['No pump', 'Decent pump', 'Amazing pump'];
export const WORKLOAD = ['Easy', 'Pretty good', 'Pushed my limits', 'Too much'];

export function rirForWeek(weekIndex, weeksTotal) {
  const accumWeeks = weeksTotal - 1; // last week is the deload
  if (weekIndex >= accumWeeks) return DELOAD_RIR;
  return Math.max(0, accumWeeks - 1 - weekIndex);
}

export function roundToIncrement(weight, inc = WEIGHT_INCREMENT) {
  return Math.round(weight / inc) * inc;
}

// Per-session set change for one muscle from its feedback answers.
// soreness 0-3, pump 0-2, workload 0-3. Missing feedback → hold (0).
export function setChangeFromFeedback(fb) {
  if (!fb || fb.soreness == null || fb.workload == null) return 0;
  if (fb.soreness === 3 || fb.workload === 3) return -1;
  let change = 2 - fb.soreness; // never sore → +2, a while ago → +1, just in time → 0
  if (fb.workload === 2) change -= 1;
  if (fb.pump === 0 && fb.workload === 0) change += 1;
  return Math.max(-1, Math.min(3, change));
}

// Combine one muscle's set changes across the week's sessions:
// any back-off signal wins; otherwise round the average.
export function combineSetChanges(changes) {
  if (changes.length === 0) return 0;
  const min = Math.min(...changes);
  if (min < 0) return min;
  return Math.round(changes.reduce((a, b) => a + b, 0) / changes.length);
}

function makeSets(count) {
  return Array.from({ length: count }, () => ({ weight: null, reps: null, done: false }));
}

// config: { name, weeksTotal (4-6), unit, days: [{ name, slots: [{ exerciseId }] }] }
export function createMesocycle(config, id) {
  const days = config.days.map((d, i) => ({
    name: d.name || `Day ${i + 1}`,
    slots: d.slots.map((s) => {
      const ex = getExercise(s.exerciseId);
      if (!ex) throw new Error(`Unknown exercise id ${s.exerciseId}`);
      return { exerciseId: ex.id, muscle: ex.muscle, name: ex.name, repRange: ex.repRange };
    }),
  }));
  if (days.length === 0 || days.some((d) => d.slots.length === 0)) {
    throw new Error('Every training day needs at least one exercise');
  }

  // Weekly slot count per muscle → starting sets per slot so week 1 lands near MEV.
  const slotsPerMuscle = {};
  for (const d of days) for (const s of d.slots) slotsPerMuscle[s.muscle] = (slotsPerMuscle[s.muscle] || 0) + 1;
  const startSets = {};
  for (const [muscle, n] of Object.entries(slotsPerMuscle)) {
    const mev = VOLUME_LANDMARKS[muscle]?.mev ?? 6;
    startSets[muscle] = Math.max(1, Math.min(5, Math.round(mev / n)));
  }

  const meso = {
    id,
    name: config.name || 'Mesocycle',
    weeksTotal: Math.max(4, Math.min(6, config.weeksTotal || 5)),
    unit: config.unit === 'kg' ? 'kg' : 'lb',
    days,
    weeks: [],
    status: 'active',
    createdAt: config.createdAt || null,
  };
  meso.weeks.push(buildWeek(meso, 0, (slot) => ({
    sets: startSets[slot.muscle],
    targetWeight: null, // week 1 calibrates: user finds working weights
    targetReps: null,
  })));
  return meso;
}

function buildWeek(meso, weekIndex, prescribe) {
  return {
    index: weekIndex,
    rirTarget: rirForWeek(weekIndex, meso.weeksTotal),
    isDeload: weekIndex === meso.weeksTotal - 1,
    workouts: meso.days.map((day, di) => ({
      dayIndex: di,
      name: day.name,
      status: 'pending',
      exercises: day.slots.map((slot) => {
        const p = prescribe(slot, di);
        return {
          exerciseId: slot.exerciseId,
          muscle: slot.muscle,
          name: slot.name,
          repRange: slot.repRange,
          targetWeight: p.targetWeight,
          targetReps: p.targetReps,
          sets: makeSets(p.sets),
        };
      }),
      feedback: {},
    })),
  };
}

function doneSets(exercise) {
  return exercise.sets.filter((s) => s.done && s.weight != null && s.reps != null);
}

// Calibration → { weight, reps } from what the user actually did.
function calibrateFromLogs(exercise) {
  const sets = doneSets(exercise);
  if (sets.length === 0) return { weight: null, reps: null };
  const weight = Math.max(...sets.map((s) => s.weight));
  const atWeight = sets.filter((s) => s.weight === weight);
  const reps = Math.min(...atWeight.map((s) => s.reps));
  return { weight, reps };
}

function hitTargets(exercise) {
  const sets = doneSets(exercise);
  if (sets.length === 0 || sets.length < exercise.sets.length) return false;
  return sets.every((s) => s.weight >= exercise.targetWeight && s.reps >= exercise.targetReps);
}

// Next-week load prescription for one exercise, from its previous-week instance.
export function progressLoad(prevExercise) {
  if (prevExercise.targetWeight == null) {
    const cal = calibrateFromLogs(prevExercise);
    if (cal.weight == null) return { targetWeight: null, targetReps: null }; // never logged: calibrate again
    const [lo, hi] = prevExercise.repRange;
    return { targetWeight: cal.weight, targetReps: Math.max(lo, Math.min(hi, cal.reps)) };
  }
  if (hitTargets(prevExercise)) {
    const bump = Math.max(WEIGHT_INCREMENT, roundToIncrement(prevExercise.targetWeight * 0.025));
    return { targetWeight: prevExercise.targetWeight + bump, targetReps: prevExercise.targetReps };
  }
  return { targetWeight: prevExercise.targetWeight, targetReps: prevExercise.targetReps };
}

// Weekly set totals per muscle for a given week.
export function weeklySetsPerMuscle(week) {
  const totals = {};
  for (const w of week.workouts) {
    for (const e of w.exercises) totals[e.muscle] = (totals[e.muscle] || 0) + e.sets.length;
  }
  return totals;
}

// Decide next week's set count per muscle from this week's feedback, clamped to MRV
// (and never below 1 set per slot).
export function nextWeekMuscleSets(week, slotsPerMuscle) {
  const current = weeklySetsPerMuscle(week);
  const changesByMuscle = {};
  for (const w of week.workouts) {
    const musclesInWorkout = new Set(w.exercises.map((e) => e.muscle));
    for (const m of musclesInWorkout) {
      (changesByMuscle[m] ||= []).push(setChangeFromFeedback(w.feedback?.[m]));
    }
  }
  const next = {};
  for (const [muscle, sets] of Object.entries(current)) {
    const change = combineSetChanges(changesByMuscle[muscle] || []);
    const mrv = VOLUME_LANDMARKS[muscle]?.mrv ?? 20;
    const floor = slotsPerMuscle[muscle]; // at least 1 set per exercise slot
    next[muscle] = Math.max(floor, Math.min(mrv, sets + change));
  }
  return next;
}

// Distribute a muscle's weekly set total across its slots as evenly as possible,
// starting from the previous week's distribution.
function distributeSets(prevWeek, muscleTargets) {
  // slotRefs: [{ dayIndex, exIndex, muscle, sets }]
  const slotRefs = [];
  prevWeek.workouts.forEach((w) => {
    w.exercises.forEach((e, ei) => {
      slotRefs.push({ dayIndex: w.dayIndex, exIndex: ei, muscle: e.muscle, sets: e.sets.length });
    });
  });
  for (const muscle of Object.keys(muscleTargets)) {
    const slots = slotRefs.filter((s) => s.muscle === muscle);
    let total = slots.reduce((a, s) => a + s.sets, 0);
    const target = muscleTargets[muscle];
    while (total < target) {
      slots.sort((a, b) => a.sets - b.sets);
      slots[0].sets += 1;
      total += 1;
    }
    while (total > target) {
      slots.sort((a, b) => b.sets - a.sets);
      if (slots[0].sets <= 1) break;
      slots[0].sets -= 1;
      total -= 1;
    }
  }
  const bySlot = {};
  for (const s of slotRefs) bySlot[`${s.dayIndex}:${s.exIndex}`] = s.sets;
  return bySlot;
}

export function generateNextWeek(meso) {
  const prevWeek = meso.weeks[meso.weeks.length - 1];
  const weekIndex = prevWeek.index + 1;
  if (weekIndex >= meso.weeksTotal) throw new Error('Mesocycle is already complete');

  const slotsPerMuscle = {};
  for (const d of meso.days) for (const s of d.slots) slotsPerMuscle[s.muscle] = (slotsPerMuscle[s.muscle] || 0) + 1;

  const isDeload = weekIndex === meso.weeksTotal - 1;
  const week1 = meso.weeks[0];

  let setsBySlot;
  if (isDeload) {
    setsBySlot = {};
    week1.workouts.forEach((w) => {
      w.exercises.forEach((e, ei) => {
        setsBySlot[`${w.dayIndex}:${ei}`] = Math.max(1, Math.ceil(e.sets.length / 2));
      });
    });
  } else {
    setsBySlot = distributeSets(prevWeek, nextWeekMuscleSets(prevWeek, slotsPerMuscle));
  }

  const week = buildWeek(meso, weekIndex, (slot, dayIndex) => {
    const exIndex = meso.days[dayIndex].slots.indexOf(slot);
    const prevEx = prevWeek.workouts[dayIndex].exercises[exIndex];
    const load = progressLoad(prevEx);
    if (isDeload) {
      return {
        sets: setsBySlot[`${dayIndex}:${exIndex}`],
        targetWeight: load.targetWeight != null ? roundToIncrement(load.targetWeight * 0.55) : null,
        targetReps: load.targetReps != null ? Math.max(1, Math.ceil(load.targetReps / 2)) : null,
      };
    }
    return { sets: setsBySlot[`${dayIndex}:${exIndex}`], ...load };
  });
  meso.weeks.push(week);
  return week;
}

// Mark a workout finished with per-muscle feedback; generate the next week when the
// current week is fully done. Returns { weekGenerated, mesoComplete }.
export function finishWorkout(meso, weekIndex, dayIndex, feedback) {
  const week = meso.weeks[weekIndex];
  if (!week) throw new Error('No such week');
  const workout = week.workouts[dayIndex];
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
  return { weekGenerated, mesoComplete };
}

// The next pending workout, scanning in order.
export function currentPosition(meso) {
  for (const week of meso.weeks) {
    for (const w of week.workouts) {
      if (w.status !== 'done') return { weekIndex: week.index, dayIndex: w.dayIndex };
    }
  }
  return null;
}
