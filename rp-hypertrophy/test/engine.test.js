import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rirForWeek, setChangeFromFeedback, combineSetChanges, createMesocycle,
  generateNextWeek, finishWorkout, weeklySetsPerMuscle, progressLoad,
  currentPosition, DELOAD_RIR,
} from '../src/engine.js';
import { EXERCISES, VOLUME_LANDMARKS } from '../src/exercises.js';

const byName = (name) => EXERCISES.find((e) => e.name === name);

function sampleConfig(weeksTotal = 5) {
  return {
    name: 'Test Meso',
    weeksTotal,
    unit: 'lb',
    days: [
      { name: 'Upper', slots: [{ exerciseId: byName('Barbell Bench Press').id }, { exerciseId: byName('Barbell Row').id }] },
      { name: 'Lower', slots: [{ exerciseId: byName('Back Squat').id }, { exerciseId: byName('Lying Leg Curl').id }] },
    ],
  };
}

function logAllSets(workout, { weight = 100, reps = 10 } = {}) {
  for (const ex of workout.exercises) {
    for (const s of ex.sets) {
      s.weight = ex.targetWeight ?? weight;
      s.reps = ex.targetReps ?? reps;
      s.done = true;
    }
  }
}

test('RIR ramps down to 0 then deloads', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((w) => rirForWeek(w, 5)), [3, 2, 1, 0, DELOAD_RIR]);
  assert.deepEqual([0, 1, 2, 3].map((w) => rirForWeek(w, 4)), [2, 1, 0, DELOAD_RIR]);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((w) => rirForWeek(w, 6)), [4, 3, 2, 1, 0, DELOAD_RIR]);
});

test('set progression matrix follows soreness/pump/workload', () => {
  // never sore, no pump, easy → strong add
  assert.equal(setChangeFromFeedback({ soreness: 0, pump: 0, workload: 0 }), 3);
  // never sore, decent pump, pretty good → +2
  assert.equal(setChangeFromFeedback({ soreness: 0, pump: 1, workload: 1 }), 2);
  // healed a while ago → +1
  assert.equal(setChangeFromFeedback({ soreness: 1, pump: 1, workload: 1 }), 1);
  // healed just in time → hold
  assert.equal(setChangeFromFeedback({ soreness: 2, pump: 2, workload: 1 }), 0);
  // pushed my limits knocks one off
  assert.equal(setChangeFromFeedback({ soreness: 1, pump: 1, workload: 2 }), 0);
  // still sore or too much → back off
  assert.equal(setChangeFromFeedback({ soreness: 3, pump: 2, workload: 1 }), -1);
  assert.equal(setChangeFromFeedback({ soreness: 0, pump: 2, workload: 3 }), -1);
  // missing feedback → hold
  assert.equal(setChangeFromFeedback(undefined), 0);
  assert.equal(setChangeFromFeedback({}), 0);
});

test('combining changes: any back-off wins, otherwise average', () => {
  assert.equal(combineSetChanges([2, -1]), -1);
  assert.equal(combineSetChanges([1, 2]), 2);
  assert.equal(combineSetChanges([0, 1]), 1);
  assert.equal(combineSetChanges([]), 0);
});

test('createMesocycle starts near MEV and week 1 calibrates', () => {
  const meso = createMesocycle(sampleConfig(), 'm1');
  assert.equal(meso.weeks.length, 1);
  const w1 = meso.weeks[0];
  assert.equal(w1.rirTarget, 3);
  const vol = weeklySetsPerMuscle(w1);
  // one chest slot/week → sets = round(MEV 8 / 1) capped at 5
  assert.equal(vol.chest, 5);
  for (const workout of w1.workouts) {
    for (const ex of workout.exercises) {
      assert.equal(ex.targetWeight, null);
      assert.equal(ex.targetReps, null);
    }
  }
});

test('calibration week sets next-week targets from logs', () => {
  const prev = {
    targetWeight: null, targetReps: null, repRange: [5, 10],
    sets: [
      { weight: 135, reps: 10, done: true },
      { weight: 155, reps: 8, done: true },
      { weight: 155, reps: 7, done: true },
    ],
  };
  assert.deepEqual(progressLoad(prev), { targetWeight: 155, targetReps: 7 });
});

test('hitting targets bumps weight ~2.5%, missing holds it', () => {
  const hit = {
    targetWeight: 200, targetReps: 8, repRange: [5, 10],
    sets: [
      { weight: 200, reps: 8, done: true },
      { weight: 200, reps: 9, done: true },
    ],
  };
  assert.deepEqual(progressLoad(hit), { targetWeight: 205, targetReps: 8 });
  const missed = {
    targetWeight: 200, targetReps: 8, repRange: [5, 10],
    sets: [
      { weight: 200, reps: 8, done: true },
      { weight: 200, reps: 6, done: true },
    ],
  };
  assert.deepEqual(progressLoad(missed), { targetWeight: 200, targetReps: 8 });
  const incomplete = {
    targetWeight: 200, targetReps: 8, repRange: [5, 10],
    sets: [
      { weight: 200, reps: 8, done: true },
      { weight: null, reps: null, done: false },
    ],
  };
  assert.deepEqual(progressLoad(incomplete), { targetWeight: 200, targetReps: 8 });
});

test('finishing a full week generates the next week with progressed sets', () => {
  const meso = createMesocycle(sampleConfig(), 'm1');
  const w1 = meso.weeks[0];
  const startVol = weeklySetsPerMuscle(w1);

  // easy week: never sore, no pump, easy for every muscle
  for (const workout of w1.workouts) {
    logAllSets(workout, { weight: 100, reps: 10 });
    const fb = {};
    for (const ex of workout.exercises) fb[ex.muscle] = { soreness: 0, pump: 0, workload: 0 };
    const res = finishWorkout(meso, 0, workout.dayIndex, fb);
    if (workout.dayIndex === w1.workouts.length - 1) assert.equal(res.weekGenerated, true);
  }

  assert.equal(meso.weeks.length, 2);
  const w2 = meso.weeks[1];
  assert.equal(w2.rirTarget, 2);
  const vol2 = weeklySetsPerMuscle(w2);
  for (const m of Object.keys(startVol)) {
    assert.ok(vol2[m] > startVol[m], `${m} should gain sets (${startVol[m]} → ${vol2[m]})`);
    assert.ok(vol2[m] <= VOLUME_LANDMARKS[m].mrv, `${m} must stay ≤ MRV`);
  }
  // calibration produced weight targets for week 2
  for (const workout of w2.workouts) {
    for (const ex of workout.exercises) {
      assert.equal(ex.targetWeight, 100);
      assert.equal(ex.targetReps, 10);
    }
  }
});

test('"still sore" backs volume off but never below 1 set per slot', () => {
  const meso = createMesocycle(sampleConfig(), 'm1');
  const w1 = meso.weeks[0];
  for (const workout of w1.workouts) {
    logAllSets(workout);
    const fb = {};
    for (const ex of workout.exercises) fb[ex.muscle] = { soreness: 3, pump: 2, workload: 3 };
    finishWorkout(meso, 0, workout.dayIndex, fb);
  }
  const vol1 = weeklySetsPerMuscle(meso.weeks[0]);
  const vol2 = weeklySetsPerMuscle(meso.weeks[1]);
  for (const m of Object.keys(vol1)) {
    assert.equal(vol2[m], Math.max(1, vol1[m] - 1), m);
  }
});

test('volume is capped at MRV over many easy weeks, then deload halves week-1 sets', () => {
  const meso = createMesocycle(sampleConfig(6), 'm1');
  for (let wk = 0; wk < meso.weeksTotal - 1; wk++) {
    const week = meso.weeks[wk];
    for (const workout of week.workouts) {
      logAllSets(workout);
      const fb = {};
      for (const ex of workout.exercises) fb[ex.muscle] = { soreness: 0, pump: 0, workload: 0 };
      finishWorkout(meso, wk, workout.dayIndex, fb);
    }
    const nextVol = weeklySetsPerMuscle(meso.weeks[meso.weeks.length - 1]);
    for (const [m, sets] of Object.entries(nextVol)) {
      assert.ok(sets <= VOLUME_LANDMARKS[m].mrv, `${m} ${sets} ≤ MRV`);
    }
  }
  const deload = meso.weeks[meso.weeksTotal - 1];
  assert.equal(deload.isDeload, true);
  assert.equal(deload.rirTarget, DELOAD_RIR);
  const w1Vol = weeklySetsPerMuscle(meso.weeks[0]);
  const dVol = weeklySetsPerMuscle(deload);
  for (const m of Object.keys(w1Vol)) {
    assert.equal(dVol[m], Math.ceil(w1Vol[m] / 2) * 1, m); // one slot per muscle in sample config
  }
  // deload load ≈ 55% of progressed weight
  const ex = deload.workouts[0].exercises[0];
  assert.ok(ex.targetWeight < 100 * 0.7, 'deload weight is reduced');

  // finishing the deload completes the meso
  for (const workout of deload.workouts) {
    logAllSets(workout);
    const res = finishWorkout(meso, deload.index, workout.dayIndex, {});
    if (workout.dayIndex === deload.workouts.length - 1) assert.equal(res.mesoComplete, true);
  }
  assert.equal(meso.status, 'complete');
  assert.equal(currentPosition(meso), null);
});

test('currentPosition walks through pending workouts in order', () => {
  const meso = createMesocycle(sampleConfig(), 'm1');
  assert.deepEqual(currentPosition(meso), { weekIndex: 0, dayIndex: 0 });
  logAllSets(meso.weeks[0].workouts[0]);
  finishWorkout(meso, 0, 0, {});
  assert.deepEqual(currentPosition(meso), { weekIndex: 0, dayIndex: 1 });
});
