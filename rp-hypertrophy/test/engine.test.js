import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as engineNS from '../app/engine.js';
import {
  rirForWeek, loadIncrement, roundLoad, progressExercise, exercisePerf,
  musclePerf, muscleBrake, volumeDelta, createMesocycle, generateNextWeek,
  finishWorkout, currentPosition, weeklySetsPerMuscle, reactiveDeloadDue,
  addExercise, removeExercise, e1rm, nextMesoConfig, SESSION_SET_CAP, DELOAD_RIR,
} from '../app/engine.js';
import {
  EXERCISES, VOLUME_LANDMARKS, exercisesForMuscle, conflictsWith, alternativeFor,
} from '../app/exercises.js';
import { TEMPLATES } from '../app/templates.js';

const byName = (name) => EXERCISES.find((e) => e.name === name);

function sampleConfig(weeksTotal = 5) {
  return {
    name: 'Test Meso',
    weeksTotal,
    unit: 'lb',
    days: [
      { name: 'A', slots: [{ exerciseId: byName('Barbell Bench Press').id }, { exerciseId: byName('Back Squat').id }] },
      { name: 'B', slots: [{ exerciseId: byName('Lat Pulldown').id }, { exerciseId: byName('Seated Leg Curl').id }] },
    ],
  };
}

// Log every set of every exercise. weightFor(exercise) → weight, repsFor → reps.
function logWeek(meso, weekIndex, weightFor, repsFor, feedback = { soreness: 1, workload: 1, pump: 1 }) {
  const week = meso.weeks[weekIndex];
  for (const workout of week.workouts) {
    for (const wex of workout.exercises) {
      for (const s of wex.sets) {
        s.weight = weightFor(wex);
        s.reps = repsFor(wex);
        s.done = true;
      }
    }
    const fb = {};
    for (const wex of workout.exercises) fb[wex.muscle] = { ...feedback };
    finishWorkout(meso, weekIndex, workout.dayIndex, fb);
  }
}

// ---------------------------------------------------------------- RIR ramp

test('RIR schedule: compounds never hit failure, isolation may in the final accumulation week', () => {
  // 5-week meso: 4 accumulation + deload
  assert.deepEqual(
    [0, 1, 2, 3].map((w) => { const r = rirForWeek(w, 5); return [r.compound, r.isolation]; }),
    [[3, 2], [2, 1], [1, 1], [1, 0]],
  );
  const deload = rirForWeek(4, 5);
  assert.equal(deload.isDeload, true);
  assert.equal(deload.compound, DELOAD_RIR);
  // 4-week meso
  assert.deepEqual(
    [0, 1, 2].map((w) => { const r = rirForWeek(w, 4); return [r.compound, r.isolation]; }),
    [[3, 2], [2, 1], [1, 0]],
  );
});

// ------------------------------------------------------------- increments

test('load increments scale by lift type and are capped near 5% of the load', () => {
  const squat = byName('Back Squat');
  const curl = byName('Dumbbell Curl');
  const bench = byName('Barbell Bench Press');
  assert.equal(loadIncrement(squat, 300, 'lb'), 10);  // lower compound
  assert.equal(loadIncrement(squat, 100, 'lb'), 5);   // 5% cap kicks in
  assert.equal(loadIncrement(bench, 200, 'lb'), 5);   // upper compound
  assert.equal(loadIncrement(curl, 30, 'lb'), 2.5);   // isolation micro-step
  assert.equal(loadIncrement(squat, 140, 'kg'), 5);
  assert.equal(roundLoad(102.4, 'lb'), 102.5);
});

// ------------------------------------------------- double progression rules

function makeWex(overrides = {}) {
  return {
    exerciseId: 1, muscle: 'chest', name: 'Barbell Bench Press', type: 'compound',
    region: 'upper', repRange: [6, 10], secondary: [], targetWeight: 200,
    missStreak: 0, prevSets: null, jointPain: 0,
    sets: [
      { weight: 200, reps: 10, done: true },
      { weight: 200, reps: 10, done: true },
    ],
    ...overrides,
  };
}

test('double progression: top of window on all sets triggers a load jump', () => {
  const next = progressExercise(makeWex(), 'lb');
  assert.equal(next.targetWeight, 205);
  assert.equal(next.missStreak, 0);
  assert.deepEqual(next.prevSets, [{ weight: 200, reps: 10 }, { weight: 200, reps: 10 }]);
});

test('double progression: inside the window holds the load (chase reps)', () => {
  const next = progressExercise(makeWex({
    sets: [{ weight: 200, reps: 10, done: true }, { weight: 200, reps: 8, done: true }],
  }), 'lb');
  assert.equal(next.targetWeight, 200);
});

test('double progression: below window bottom twice running drops the load 5%', () => {
  const missed = makeWex({ sets: [{ weight: 200, reps: 5, done: true }, { weight: 200, reps: 5, done: true }] });
  const first = progressExercise(missed, 'lb');
  assert.equal(first.targetWeight, 200);
  assert.equal(first.missStreak, 1);
  const second = progressExercise({ ...missed, missStreak: 1 }, 'lb');
  assert.equal(second.targetWeight, 190);
  assert.equal(second.missStreak, 0);
});

test('calibration week adopts the heaviest logged weight; unlogged work carries forward', () => {
  const cal = progressExercise(makeWex({
    targetWeight: null,
    sets: [{ weight: 135, reps: 10, done: true }, { weight: 155, reps: 8, done: true }],
  }), 'lb');
  assert.equal(cal.targetWeight, 155);
  const skipped = progressExercise(makeWex({ sets: [{ weight: null, reps: null, done: false }] }), 'lb');
  assert.equal(skipped.targetWeight, 200);
});

// ------------------------------------------------------- performance signal

test('exercisePerf judges best-set quality, robust to set-count changes', () => {
  const prev = makeWex();
  assert.equal(exercisePerf(prev, makeWex({ sets: [{ weight: 205, reps: 8, done: true }] })), 1);
  assert.equal(exercisePerf(prev, makeWex({ sets: [{ weight: 200, reps: 9, done: true }, { weight: 200, reps: 9, done: true }, { weight: 200, reps: 9, done: true }] })), -1);
  assert.equal(exercisePerf(prev, makeWex()), 0);
  assert.equal(exercisePerf(prev, makeWex({ sets: [{ weight: null, reps: null, done: false }] })), null);
});

test('volumeDelta: performance accelerates, feedback only brakes', () => {
  assert.equal(volumeDelta(1, false), 1);
  assert.equal(volumeDelta(1, true), 0);   // progressing at high recovery cost → hold
  assert.equal(volumeDelta(0, false), 0);  // unearned volume is never added
  assert.equal(volumeDelta(0, true), 0);
  assert.equal(volumeDelta(-1, false), -1);
  assert.equal(volumeDelta(-1, true), -2); // overreached
});

// ---------------------------------------------------------------- meso flow

test('createMesocycle starts near evidence-based starting volume, week 1 calibrates', () => {
  const meso = createMesocycle(sampleConfig(), 'm1');
  assert.equal(meso.weeks.length, 1);
  const vol = weeklySetsPerMuscle(meso.weeks[0], { fractional: false });
  assert.equal(vol.chest, 5); // one slot, capped at 5 sets/slot
  for (const w of meso.weeks[0].workouts) {
    for (const wex of w.exercises) assert.equal(wex.targetWeight, null);
  }
});

test('fractional volume counts indirect work at 0.5 sets', () => {
  const meso = createMesocycle(sampleConfig(), 'm1');
  const vol = weeklySetsPerMuscle(meso.weeks[0]);
  // bench press gives triceps 0.5 x 5 sets
  assert.equal(vol.triceps, 2.5);
  assert.ok(vol.glutes > 0); // squat spillover
});

test('volume rises only when performance improves, and set targets respect the weekly cap', () => {
  const meso = createMesocycle(sampleConfig(6), 'm1');
  // Week 1 (calibration): 100 lb x 10 everywhere.
  logWeek(meso, 0, () => 100, () => 10);
  assert.equal(meso.weeks.length, 2);
  const v1 = weeklySetsPerMuscle(meso.weeks[0], { fractional: false });
  const v2 = weeklySetsPerMuscle(meso.weeks[1], { fractional: false });
  // No week-over-week comparison yet → no earned volume → hold.
  assert.deepEqual(v2, v1);
  // Week 2: all exercises progressed (heavier bests) → perf +1 → week 3 adds sets.
  logWeek(meso, 1, (wex) => wex.targetWeight + 5, () => 10);
  const v3 = weeklySetsPerMuscle(meso.weeks[2], { fractional: false });
  for (const m of Object.keys(v1)) {
    assert.equal(v3[m], v2[m] + 1, `${m} earned exactly +1 set`);
    assert.ok(v3[m] <= VOLUME_LANDMARKS[m].maxVolume);
  }
  assert.deepEqual(meso.weeks[1].perf, { chest: 1, quads: 1, back: 1, hamstrings: 1 });
});

test('the brake holds volume even when performance improves', () => {
  const meso = createMesocycle(sampleConfig(6), 'm1');
  logWeek(meso, 0, () => 100, () => 10);
  // progressed, but "too much" workload → hold
  logWeek(meso, 1, (wex) => wex.targetWeight + 5, () => 10, { soreness: 1, workload: 3, pump: 1 });
  const v2 = weeklySetsPerMuscle(meso.weeks[1], { fractional: false });
  const v3 = weeklySetsPerMuscle(meso.weeks[2], { fractional: false });
  assert.deepEqual(v3, v2);
});

test('regression cuts volume; regression + brake cuts it harder', () => {
  const meso = createMesocycle(sampleConfig(6), 'm1');
  logWeek(meso, 0, () => 100, () => 10);
  logWeek(meso, 1, () => 100, () => 10); // flat
  // Week 3: everything regresses AND still sore → -2 per muscle
  logWeek(meso, 2, () => 90, () => 8, { soreness: 3, workload: 2, pump: 1 });
  const v3 = weeklySetsPerMuscle(meso.weeks[2], { fractional: false });
  const v4 = weeklySetsPerMuscle(meso.weeks[3], { fractional: false });
  for (const m of Object.keys(v3)) {
    assert.equal(v4[m], Math.max(1, v3[m] - 2), m);
  }
});

test('two consecutive regressing weeks on 2+ muscles trigger a reactive deload', () => {
  const meso = createMesocycle(sampleConfig(6), 'm1');
  logWeek(meso, 0, () => 100, () => 10);
  logWeek(meso, 1, () => 100, () => 10);
  logWeek(meso, 2, () => 90, () => 8);   // regression week 1
  assert.equal(meso.reactiveDeload, false);
  logWeek(meso, 3, () => 80, () => 6);   // regression week 2 → deload fires
  assert.equal(meso.reactiveDeload, true);
  const deload = meso.weeks[meso.weeks.length - 1];
  assert.equal(deload.isDeload, true);
  assert.equal(meso.weeksTotal, deload.index + 1); // meso ends early
});

test('scheduled deload halves sets, cuts load 10%, keeps frequency; finishing it completes the meso', () => {
  const meso = createMesocycle(sampleConfig(4), 'm1');
  logWeek(meso, 0, () => 100, () => 10);
  logWeek(meso, 1, (wex) => wex.targetWeight, () => 10);
  logWeek(meso, 2, (wex) => wex.targetWeight, () => 10);
  const deload = meso.weeks[3];
  assert.equal(deload.isDeload, true);
  assert.equal(deload.workouts.length, meso.days.length); // frequency kept
  deload.workouts.forEach((w, di) => {
    w.exercises.forEach((wex, ei) => {
      const prev = meso.weeks[2].workouts[di].exercises[ei];
      assert.equal(wex.sets.length, Math.max(1, Math.ceil(prev.sets.length / 2)));
      assert.equal(wex.targetWeight, roundLoad(prev.targetWeight * 0.9, 'lb'));
    });
  });
  logWeek(meso, 3, (wex) => wex.targetWeight, () => 5);
  assert.equal(meso.status, 'complete');
  assert.equal(currentPosition(meso), null);
});

test('per-session set cap: added volume stops when every session is saturated', () => {
  // One chest slot on one day: cap should stop growth at SESSION_SET_CAP.
  const meso = createMesocycle({
    name: 'Cap', weeksTotal: 6, unit: 'lb',
    days: [{ name: 'A', slots: [{ exerciseId: byName('Barbell Bench Press').id }, { exerciseId: byName('Back Squat').id }] }],
  }, 'm1');
  for (let w = 0; w < 4; w++) {
    logWeek(meso, w, (wex) => (wex.targetWeight ?? 100) + 5, () => 10);
  }
  for (const week of meso.weeks) {
    const chestOnDay = week.workouts[0].exercises.filter((e) => e.muscle === 'chest')
      .reduce((a, e) => a + e.sets.length, 0);
    assert.ok(chestOnDay <= SESSION_SET_CAP, `week ${week.index}: ${chestOnDay} <= ${SESSION_SET_CAP}`);
  }
});

test('muscleBrake fires on joint pain across half the muscle exercises', () => {
  const meso = createMesocycle(sampleConfig(), 'm1');
  const week = meso.weeks[0];
  week.workouts[0].exercises[0].jointPain = 2; // chest's only exercise
  assert.equal(muscleBrake(week, 'chest'), true);
  assert.equal(muscleBrake(week, 'quads'), false);
});

// ----------------------------------------------------------------- misc

test('every template resolves and creates a valid mesocycle', () => {
  for (const t of TEMPLATES) {
    const meso = createMesocycle({ name: t.name, weeksTotal: t.weeksTotal, unit: 'lb', days: t.days }, 't');
    assert.ok(meso.weeks[0].workouts.length === t.days.length, t.id);
    // starting volume never exceeds the per-session cap on any day
    for (const w of meso.weeks[0].workouts) {
      const perMuscle = {};
      for (const e of w.exercises) perMuscle[e.muscle] = (perMuscle[e.muscle] || 0) + e.sets.length;
      for (const [m, sets] of Object.entries(perMuscle)) {
        assert.ok(sets <= SESSION_SET_CAP, `${t.id} ${w.name} ${m}: ${sets}`);
      }
    }
  }
});

test('lengthened-biased exercises rank first within a muscle', () => {
  const chest = exercisesForMuscle('chest');
  assert.equal(chest[0].lengthened, true);
});

test('e1rm math', () => {
  assert.equal(e1rm(200, 10), 267);
  assert.equal(e1rm(null, 5), null);
});

// ------------------------------------------------- bodyweight progression

function makeBWWex(name, overrides = {}) {
  const def = byName(name);
  return {
    exerciseId: def.id, muscle: def.muscle, name: def.name, type: def.type,
    region: def.region, repRange: def.repRange, secondary: def.secondary,
    bodyweight: true, targetWeight: null, missStreak: 0, prevSets: null, jointPain: 0,
    sets: [], ...overrides,
  };
}

test('bodyweight: topping the window advances to the harder variation', () => {
  const pushUp = makeBWWex('Push-Up', {
    sets: [{ weight: null, reps: 15, done: true }, { weight: null, reps: 15, done: true }],
  });
  const p = progressExercise(pushUp, 'lb', 'calisthenics');
  assert.equal(p.swapTo, byName('Deficit Push-Up').id);
  assert.deepEqual(p.repRange, byName('Deficit Push-Up').repRange);
});

test('bodyweight: end of the chain extends the rep window instead (cap 30)', () => {
  const archer = makeBWWex('Archer Push-Up', {
    sets: [{ weight: null, reps: 12, done: true }, { weight: null, reps: 12, done: true }],
  });
  const p = progressExercise(archer, 'lb', 'home');
  assert.equal(p.swapTo, undefined);
  assert.deepEqual(p.repRange, [8, 14]); // [6,12] shifted +2
});

test('bodyweight: chain does not advance into an unavailable environment', () => {
  // Elevated Pike Push-Up → Wall Handstand Push-Up is home/calisthenics only,
  // so it should still advance there but a gym-only variation never would.
  const pullUp = makeBWWex('Pull-Up', {
    sets: [{ weight: null, reps: 10, done: true }],
  });
  // Archer Pull-Up is calisthenics-only: advancing is fine at the bar park...
  assert.equal(progressExercise(pullUp, 'lb', 'calisthenics').swapTo, byName('Archer Pull-Up').id);
  // ...but in the gym the engine extends reps instead of prescribing it.
  const inGym = progressExercise(pullUp, 'lb', 'gym');
  assert.equal(inGym.swapTo, undefined);
  assert.deepEqual(inGym.repRange, [7, 12]);
});

test('bodyweight: loading every set (vest) graduates to weighted progression', () => {
  const dips = makeBWWex('Bar Dip', {
    sets: [{ weight: 25, reps: 10, done: true }, { weight: 25, reps: 9, done: true }],
  });
  const p = progressExercise(dips, 'lb', 'calisthenics');
  assert.equal(p.targetWeight, 25);
});

test('a calisthenics meso swaps mastered movements at week generation', () => {
  const meso = createMesocycle({
    name: 'Bars', weeksTotal: 4, unit: 'lb', environment: 'calisthenics',
    days: [{ name: 'Bars', slots: [{ exerciseId: byName('Push-Up').id }, { exerciseId: byName('Pull-Up').id }] }],
  }, 'm1');
  assert.equal(meso.environment, 'calisthenics');
  const w1 = meso.weeks[0];
  for (const wex of w1.workouts[0].exercises) {
    for (const s of wex.sets) { s.weight = null; s.reps = wex.repRange[1]; s.done = true; }
  }
  finishWorkout(meso, 0, 0, { chest: { soreness: 1, workload: 1, pump: 1 }, back: { soreness: 1, workload: 1, pump: 1 } });
  const w2 = meso.weeks[1];
  assert.equal(w2.workouts[0].exercises[0].name, 'Deficit Push-Up');
  assert.equal(w2.workouts[0].exercises[1].name, 'Archer Pull-Up');
  assert.equal(w2.notes.length, 2);
  assert.equal(meso.days[0].slots[0].name, 'Deficit Push-Up'); // program updated too
});

// ------------------------------------------------- mid-meso program edits

test('addExercise applies to the pending week at 2 sets; removeExercise guards the last slot', () => {
  const meso = createMesocycle(sampleConfig(5), 'm1');
  const curl = byName('Dumbbell Curl');
  addExercise(meso, 0, curl.id);
  assert.equal(meso.days[0].slots.length, 3);
  const workout = meso.weeks[0].workouts[0];
  assert.equal(workout.exercises.length, 3);
  assert.equal(workout.exercises[2].sets.length, 2);
  assert.equal(workout.exercises[2].targetWeight, null);

  removeExercise(meso, 0, 2);
  assert.equal(meso.days[0].slots.length, 2);
  assert.equal(workout.exercises.length, 2);

  removeExercise(meso, 0, 0);
  assert.throws(() => removeExercise(meso, 0, 0), /at least one exercise/);
});

test('week generation survives a mid-meso add: matching is by exercise, not index', () => {
  const meso = createMesocycle(sampleConfig(5), 'm1');
  logWeek(meso, 0, () => 100, () => 10);
  // Insert a new movement mid-meso, then finish week 2 beating week 1.
  addExercise(meso, 0, byName('Dumbbell Curl').id);
  logWeek(meso, 1, (wex) => (wex.targetWeight ?? 30) + 5, () => 10);
  const w3 = meso.weeks[2];
  // The added exercise is still in the program and calibrated from its logs.
  const curl = w3.workouts[0].exercises.find((e) => e.name === 'Dumbbell Curl');
  assert.ok(curl, 'added exercise persists into generated weeks');
  assert.equal(curl.targetWeight, 35);
  // The pre-existing exercises still progressed on earned performance.
  assert.equal(meso.weeks[1].perf.chest, 1);
});

// ------------------------------------------------- conditions & alternatives

test('conflictsWith and alternativeFor respect flagged conditions', () => {
  const squat = byName('Back Squat');
  assert.deepEqual(conflictsWith(squat, ['spine', 'knee']), ['spine', 'knee']);
  assert.deepEqual(conflictsWith(squat, []), []);
  const alt = alternativeFor(squat, ['spine'], 'gym');
  assert.ok(alt, 'an alternative exists');
  assert.equal(alt.muscle, 'quads');
  assert.ok(!alt.stress.includes('spine'), `${alt.name} must not stress the spine`);
  assert.equal(alt.type, 'compound'); // prefers matching movement type
});

test('every template only uses exercises available in its environment', () => {
  for (const t of TEMPLATES) {
    for (const d of t.days) {
      for (const s of d.slots) {
        const def = EXERCISES.find((e) => e.id === s.exerciseId);
        assert.ok(def.envs.includes(t.environment), `${t.id}: ${def.name} not available in ${t.environment}`);
      }
    }
  }
});

test('finishWorkout stamps the finish time when provided', () => {
  const meso = createMesocycle(sampleConfig(5), 'm1');
  logAllAndFinish: {
    const workout = meso.weeks[0].workouts[0];
    for (const wex of workout.exercises) for (const s of wex.sets) { s.weight = 100; s.reps = 10; s.done = true; }
    finishWorkout(meso, 0, 0, {}, '2026-07-03T10:00:00.000Z');
    assert.equal(workout.finishedAt, '2026-07-03T10:00:00.000Z');
  }
  assert.equal(meso.weeks[0].workouts[1].finishedAt, undefined);
});

test('nextMesoConfig: same program, each muscle restarts 2 below its peak', () => {
  const meso = createMesocycle({ ...sampleConfig(6), unit: 'kg' }, 'm1');
  logWeek(meso, 0, () => 100, () => 10);
  logWeek(meso, 1, (wex) => wex.targetWeight + 5, () => 10); // earned +1 everywhere
  const peakChest = weeklySetsPerMuscle(meso.weeks[2], { fractional: false }).chest;

  const config = nextMesoConfig(meso);
  assert.equal(config.unit, 'kg');
  assert.equal(config.environment, 'gym');
  assert.equal(config.continuedFrom, 'm1');
  assert.equal(config.days.length, meso.days.length);
  assert.equal(config.startVolumes.chest, peakChest - 2);
  assert.ok(config.startVolumes.chest >= 1);

  // and createMesocycle honors the override
  const next = createMesocycle(config, 'm2');
  const vol = weeklySetsPerMuscle(next.weeks[0], { fractional: false });
  assert.equal(vol.chest, peakChest - 2);
  // fresh calibration: new block, new working weights
  assert.equal(next.weeks[0].workouts[0].exercises[0].targetWeight, null);
});

test('nextMesoConfig never floors below one set per slot', () => {
  const meso = createMesocycle(sampleConfig(4), 'm1');
  // no logging at all — peaks are just the starting sets
  const config = nextMesoConfig(meso);
  for (const [m, sets] of Object.entries(config.startVolumes)) {
    assert.ok(sets >= 1, `${m}: ${sets}`);
  }
});

test('maintain priority: starts at ~1/3 dose and never earns volume', () => {
  const grow = createMesocycle(sampleConfig(6), 'g');
  const maintain = createMesocycle({ ...sampleConfig(6), priorities: { chest: 'maintain' } }, 'm');
  const vGrow = weeklySetsPerMuscle(grow.weeks[0], { fractional: false });
  const vMaint = weeklySetsPerMuscle(maintain.weeks[0], { fractional: false });
  assert.ok(vMaint.chest < vGrow.chest, `maintenance starts lower (${vMaint.chest} < ${vGrow.chest})`);
  assert.equal(vMaint.quads, vGrow.quads, 'other muscles unaffected');

  // two easy, progressing weeks: grow muscles earn +1, maintained chest holds
  logWeek(maintain, 0, () => 100, () => 10);
  logWeek(maintain, 1, (wex) => wex.targetWeight + 5, () => 10);
  const v3 = weeklySetsPerMuscle(maintain.weeks[2], { fractional: false });
  assert.equal(v3.chest, vMaint.chest, 'maintained muscle held its dose');
  assert.equal(v3.quads, vMaint.quads + 1, 'growing muscle still earned a set');
  // the brake still cuts a maintained muscle
  assert.equal(volumeDelta(-1, false, 'maintain'), -1);
  assert.equal(volumeDelta(1, false, 'maintain'), 0);
});

test('priorities carry into the next block without double-reducing volume', () => {
  const meso = createMesocycle({ ...sampleConfig(5), priorities: { chest: 'maintain' } }, 'm1');
  const startChest = weeklySetsPerMuscle(meso.weeks[0], { fractional: false }).chest;
  const config = nextMesoConfig(meso);
  assert.equal(config.priorities.chest, 'maintain');
  const next = createMesocycle(config, 'm2');
  const nextChest = weeklySetsPerMuscle(next.weeks[0], { fractional: false }).chest;
  // startVolumes already reflect the maintenance dose; no second ÷3
  assert.equal(nextChest, Math.max(1, startChest - 2) < 1 ? 1 : Math.max(1, startChest - 2), `${startChest} → ${nextChest}`);
});

test('every exercise ships with a coaching cue', () => {
  const missing = EXERCISES.filter((e) => !e.cue || e.cue.length < 15).map((e) => e.name);
  assert.deepEqual(missing, []);
});

test('library integrity: unique slug ids, valid enums, resolvable chains, home is equipment-free', () => {
  assert.ok(EXERCISES.length >= 150, `library size ${EXERCISES.length}`);
  const ids = new Set();
  const MUSCLE_SET = new Set(['chest', 'back', 'quads', 'hamstrings', 'glutes', 'shoulders', 'biceps', 'triceps', 'calves', 'abs', 'traps', 'forearms']);
  for (const e of EXERCISES) {
    assert.match(e.id, /^[a-z0-9-]+$/, e.name);
    assert.ok(!ids.has(e.id), `duplicate id ${e.id}`);
    ids.add(e.id);
    assert.ok(MUSCLE_SET.has(e.muscle), `${e.name}: muscle ${e.muscle}`);
    for (const s of e.secondary) assert.ok(MUSCLE_SET.has(s), `${e.name}: secondary ${s}`);
    assert.ok(['compound', 'isolation'].includes(e.type) && ['upper', 'lower'].includes(e.region), e.name);
    assert.ok(Array.isArray(e.repRange) && e.repRange[0] < e.repRange[1], e.name);
    assert.ok(e.envs.length > 0 && e.envs.every((v) => ['gym', 'calisthenics', 'home'].includes(v)), e.name);
    if (e.envs.includes('home')) assert.equal(e.equipment, 'bodyweight', e.name);
    if (e.next) {
      const target = EXERCISES.find((x) => x.name === e.next);
      assert.ok(target, `${e.name} → ${e.next}`);
      assert.ok(target.envs.some((v) => e.envs.includes(v)), `${e.name} → ${e.next} shares no environment`);
    }
  }
});

test('skipWorkout closes the day, carries prescriptions, and the week still completes', () => {
  const meso = createMesocycle(sampleConfig(5), 'm1');
  logWeek(meso, 0, () => 100, () => 10); // week 1 done normally
  const w2 = meso.weeks[1];
  const targetBefore = w2.workouts[0].exercises[0].targetWeight;
  const { skipWorkout } = engineNS;
  skipWorkout(meso, 1, 0, '2026-07-03T10:00:00.000Z');
  assert.equal(w2.workouts[0].status, 'done');
  assert.equal(w2.workouts[0].skipped, true);
  // finish the other day normally → week 3 generates
  const other = w2.workouts[1];
  for (const wex of other.exercises) for (const s of wex.sets) { s.weight = wex.targetWeight; s.reps = 10; s.done = true; }
  finishWorkout(meso, 1, 1, {});
  assert.equal(meso.weeks.length, 3);
  // the skipped day's exercise carried its prescription forward unchanged
  assert.equal(meso.weeks[2].workouts[0].exercises[0].targetWeight, targetBefore);
});

test('environment filtering: home picker never offers gym machinery', () => {
  for (const m of ['chest', 'back', 'quads', 'hamstrings', 'glutes', 'shoulders']) {
    const list = exercisesForMuscle(m, 'home');
    assert.ok(list.length > 0, `${m} has home options`);
    for (const e of list) assert.equal(e.equipment, 'bodyweight', `${e.name} is equipment-free`);
  }
});
