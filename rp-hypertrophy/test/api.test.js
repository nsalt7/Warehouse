// API integration test: boots the real server on an ephemeral port with a temp
// data dir and walks the full lifecycle over HTTP.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4980 + Math.floor(process.pid % 100);
const BASE = `http://localhost:${PORT}`;
let proc;
let dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-api-test-'));
  proc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), RP_DATA_DIR: dataDir },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`${BASE}/api/bootstrap`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('Server did not start');
});

after(() => {
  proc?.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function call(method, pathName, body) {
  const res = await fetch(BASE + pathName, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

test('full lifecycle over HTTP: create → log → feedback → next week → persistence', async () => {
  const boot = await call('GET', '/api/bootstrap');
  assert.equal(boot.status, 200);
  assert.ok(boot.body.exercises.length > 40);
  assert.ok(boot.body.templates.length >= 4);
  assert.deepEqual(boot.body.mesocycles, []);

  const bench = boot.body.exercises.find((e) => e.name === 'Barbell Bench Press');
  const squat = boot.body.exercises.find((e) => e.name === 'Back Squat');

  const created = await call('POST', '/api/mesocycles', {
    name: 'API Meso',
    weeksTotal: 4,
    unit: 'kg',
    days: [
      { name: 'A', slots: [{ exerciseId: bench.id }] },
      { name: 'B', slots: [{ exerciseId: squat.id }] },
    ],
  });
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal(created.body.weeks.length, 1);
  assert.deepEqual(created.body.position, { weekIndex: 0, dayIndex: 0 });

  // log day 1: 5 chest sets @ 60kg x 10
  const day0 = created.body.weeks[0].workouts[0];
  const logged = await call('PUT', `/api/mesocycles/${id}/workouts/0/0`, {
    exercises: [{ sets: day0.exercises[0].sets.map(() => ({ weight: 60, reps: 10, done: true })) }],
  });
  assert.equal(logged.status, 200);

  const fin0 = await call('POST', `/api/mesocycles/${id}/workouts/0/0/finish`, {
    feedback: { chest: { soreness: 0, pump: 1, workload: 1 } },
  });
  assert.equal(fin0.status, 200);
  assert.equal(fin0.body.weekGenerated, false);
  assert.deepEqual(fin0.body.meso.position, { weekIndex: 0, dayIndex: 1 });

  // log day 2 and finish the week
  const day1 = created.body.weeks[0].workouts[1];
  await call('PUT', `/api/mesocycles/${id}/workouts/0/1`, {
    exercises: [{ sets: day1.exercises[0].sets.map(() => ({ weight: 100, reps: 8, done: true })) }],
  });
  const fin1 = await call('POST', `/api/mesocycles/${id}/workouts/0/1/finish`, {
    feedback: { quads: { soreness: 1, pump: 2, workload: 1 } },
  });
  assert.equal(fin1.body.weekGenerated, true);
  const week2 = fin1.body.meso.weeks[1];
  // chest: soreness 0 → +2 sets; quads: soreness 1 → +1 set
  const w1chest = fin1.body.meso.weeklyVolume[0].chest;
  const w2chest = fin1.body.meso.weeklyVolume[1].chest;
  assert.equal(w2chest, w1chest + 2);
  assert.equal(fin1.body.meso.weeklyVolume[1].quads, fin1.body.meso.weeklyVolume[0].quads + 1);
  // calibration produced targets
  assert.equal(week2.workouts[0].exercises[0].targetWeight, 60);
  assert.equal(week2.workouts[0].exercises[0].targetReps, 10);
  assert.equal(week2.rirTarget, 1);

  // bad shape is rejected
  const bad = await call('PUT', `/api/mesocycles/${id}/workouts/1/0`, { exercises: [] });
  assert.equal(bad.status, 400);

  // persistence: state survives on disk
  const db = JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
  assert.equal(db.mesocycles.length, 1);
  assert.equal(db.mesocycles[0].weeks.length, 2);

  // delete
  const del = await call('DELETE', `/api/mesocycles/${id}`);
  assert.equal(del.status, 200);
  const boot2 = await call('GET', '/api/bootstrap');
  assert.deepEqual(boot2.body.mesocycles, []);
});

test('404s for unknown meso and workout', async () => {
  assert.equal((await call('GET', '/api/mesocycles/999')).status, 404);
  assert.equal((await call('GET', '/api/nope')).status, 404);
});
