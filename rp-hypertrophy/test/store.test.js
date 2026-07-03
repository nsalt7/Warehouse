import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseImport, newId } from '../app/store.js';

test('import repairs a missing nextId so new ids are never "NaN"', () => {
  const state = parseImport(JSON.stringify({ mesocycles: [] }));
  assert.equal(newId(state), '1');
  assert.equal(newId(state), '2');
  const state2 = parseImport(JSON.stringify({ mesocycles: [{ id: '7', name: 'x', weeks: [], days: [] }] }));
  assert.equal(newId(state2), '8');
});

test('import sanitizes hostile mesocycle ids and set values (stored-XSS vectors)', () => {
  const hostile = {
    mesocycles: [{
      id: '"><img src=x onerror=alert(1)>',
      name: 'x',
      status: 'complete',
      weeksTotal: 5,
      days: [],
      weeks: [{
        workouts: [{
          exercises: [{ exerciseId: 'push-up', name: 'Push-Up', repRange: 'nope',
            sets: [{ weight: '"><svg onload=1>', reps: '9', done: 1 }] }],
        }],
      }],
    }],
  };
  const state = parseImport(JSON.stringify(hostile));
  const meso = state.mesocycles[0];
  assert.match(meso.id, /^[a-zA-Z0-9_-]+$/);
  const set = meso.weeks[0].workouts[0].exercises[0].sets[0];
  assert.equal(set.weight, null); // markup string coerced away
  assert.equal(set.reps, 9);      // numeric string kept as a number
  assert.equal(set.done, true);
  assert.deepEqual(meso.weeks[0].workouts[0].exercises[0].repRange, [8, 12]);
});

test('import normalizes structurally broken mesocycles instead of bricking the app', () => {
  const state = parseImport(JSON.stringify({ mesocycles: [{ id: '1', name: 'x', status: 'active' }] }));
  const meso = state.mesocycles[0];
  assert.deepEqual(meso.weeks, []);
  assert.deepEqual(meso.days, []);
  assert.equal(typeof meso.weeksTotal, 'number');
  assert.deepEqual(meso.priorities, {});
  assert.deepEqual(meso.exerciseNotes, {});
  // settings/profile deep-merged even when absent
  assert.deepEqual(state.settings.profile.conditions, []);
});

test('numeric-id migration rewrites ids AND recovers pinned notes', () => {
  const old = {
    mesocycles: [{
      id: '1', name: 'Old', status: 'active', weeksTotal: 5,
      days: [{ name: 'A', slots: [{ exerciseId: 12, name: 'Push-Up' }] }],
      weeks: [{ workouts: [{ dayIndex: 0, status: 'done', exercises: [{ exerciseId: 12, name: 'Push-Up', repRange: [8, 15], sets: [] }] }] }],
      exerciseNotes: { 12: 'elbows in — left shoulder grumbles when they flare' },
    }],
  };
  const state = parseImport(JSON.stringify(old));
  const meso = state.mesocycles[0];
  assert.equal(meso.days[0].slots[0].exerciseId, 'push-up');
  assert.equal(meso.weeks[0].workouts[0].exercises[0].exerciseId, 'push-up');
  assert.equal(meso.exerciseNotes['push-up'], 'elbows in — left shoulder grumbles when they flare');
  assert.equal(meso.exerciseNotes[12], undefined);
});
