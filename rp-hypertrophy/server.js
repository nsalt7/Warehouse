// RP Hypertrophy local rebuild — zero-dependency server.
// Run: node server.js   →   http://localhost:4780

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './src/store.js';
import { EXERCISES, VOLUME_LANDMARKS, MUSCLES } from './src/exercises.js';
import { TEMPLATES } from './src/templates.js';
import {
  createMesocycle, finishWorkout, currentPosition, weeklySetsPerMuscle,
  SORENESS, PUMP, WORKLOAD,
} from './src/engine.js';

const PORT = Number(process.env.PORT || 4780);
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const store = new Store();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 5e6) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function mesoSummary(m) {
  return {
    id: m.id, name: m.name, weeksTotal: m.weeksTotal, unit: m.unit,
    daysPerWeek: m.days.length, status: m.status,
    weeksGenerated: m.weeks.length, position: currentPosition(m),
  };
}

function mesoDetail(m) {
  return {
    ...m,
    position: currentPosition(m),
    weeklyVolume: m.weeks.map((w) => weeklySetsPerMuscle(w)),
  };
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

  if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
    return json(res, 200, {
      exercises: EXERCISES,
      templates: TEMPLATES,
      landmarks: VOLUME_LANDMARKS,
      muscles: MUSCLES,
      scales: { soreness: SORENESS, pump: PUMP, workload: WORKLOAD },
      mesocycles: store.state.mesocycles.map(mesoSummary),
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/mesocycles') {
    const config = await readBody(req);
    const meso = createMesocycle(config, store.newId());
    meso.createdAt = new Date().toISOString();
    store.state.mesocycles.push(meso);
    store.save();
    return json(res, 201, mesoDetail(meso));
  }

  if (parts[0] === 'api' && parts[1] === 'mesocycles' && parts[2]) {
    const meso = store.getMeso(parts[2]);
    if (!meso) return json(res, 404, { error: 'Mesocycle not found' });

    if (req.method === 'GET' && parts.length === 3) {
      return json(res, 200, mesoDetail(meso));
    }
    if (req.method === 'DELETE' && parts.length === 3) {
      store.state.mesocycles = store.state.mesocycles.filter((m) => m.id !== meso.id);
      store.save();
      return json(res, 200, { ok: true });
    }

    // /api/mesocycles/:id/workouts/:week/:day[/finish]
    if (parts[3] === 'workouts' && parts[4] != null && parts[5] != null) {
      const week = meso.weeks[Number(parts[4])];
      const workout = week?.workouts[Number(parts[5])];
      if (!workout) return json(res, 404, { error: 'Workout not found' });

      if (req.method === 'PUT' && parts.length === 6) {
        // Save logged sets: body { exercises: [{ sets: [{weight, reps, done}] }] }
        const body = await readBody(req);
        if (!Array.isArray(body.exercises) || body.exercises.length !== workout.exercises.length) {
          return json(res, 400, { error: 'exercises must match workout shape' });
        }
        workout.exercises.forEach((ex, i) => {
          const sets = body.exercises[i].sets;
          if (!Array.isArray(sets) || sets.length < 1) throw new Error('Each exercise needs at least one set');
          ex.sets = sets.map((s) => ({
            weight: s.weight == null || s.weight === '' ? null : Number(s.weight),
            reps: s.reps == null || s.reps === '' ? null : Number(s.reps),
            done: Boolean(s.done),
          }));
        });
        store.save();
        return json(res, 200, mesoDetail(meso));
      }

      if (req.method === 'POST' && parts[6] === 'finish') {
        const body = await readBody(req);
        const result = finishWorkout(meso, Number(parts[4]), Number(parts[5]), body.feedback || {});
        store.save();
        return json(res, 200, { ...result, meso: mesoDetail(meso) });
      }
    }
  }

  return json(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, url) {
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(PUBLIC_DIR, file);
  if (!full.startsWith(PUBLIC_DIR) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (err) {
    return json(res, 400, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`RP Hypertrophy (local) running at http://localhost:${PORT}`);
});
