// Client-side persistence: everything lives in localStorage under one key, with
// JSON export/import for backup and device migration. Keeping storage behind
// this tiny interface means a future iOS build (Capacitor/WKWebView) can swap in
// native storage without touching the rest of the app.

import { slugId } from './exercises.js';

const KEY = 'hypertrophy-coach:v1';

const EMPTY = () => ({
  version: 2,
  nextId: 1,
  settings: { unit: 'lb', onboarded: false, profile: { environment: 'gym', conditions: [] } },
  mesocycles: [],
});

// Every state that enters the app — loaded, imported, or restored from the
// native mirror — passes through here. It backfills new fields, migrates old
// shapes, and neutralizes anything that could crash a render or reach
// innerHTML unescaped. Throws only on states too broken to repair.
export function normalizeState(state) {
  if (!state || typeof state !== 'object' || !Array.isArray(state.mesocycles)) {
    throw new Error('That does not look like a Hypertrophy Coach backup.');
  }
  state.settings = { ...EMPTY().settings, ...(state.settings || {}) };
  state.settings.profile = { ...EMPTY().settings.profile, ...(state.settings.profile || {}) };
  if (!Array.isArray(state.settings.profile.conditions)) state.settings.profile.conditions = [];

  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

  state.mesocycles = state.mesocycles.filter((m) => m && typeof m === 'object');
  state.mesocycles.forEach((meso, i) => {
    // ids feed hrefs — force them to a safe shape
    meso.id = String(meso.id ?? `import-${i}`);
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(meso.id)) meso.id = `import-${i}`;
    meso.name = String(meso.name ?? 'Mesocycle');
    meso.days = Array.isArray(meso.days) ? meso.days : [];
    meso.weeks = Array.isArray(meso.weeks) ? meso.weeks : [];
    meso.weeksTotal = num(meso.weeksTotal) ?? Math.max(4, meso.weeks.length);
    meso.status = meso.status === 'complete' ? 'complete' : 'active';
    meso.priorities = meso.priorities && typeof meso.priorities === 'object' ? meso.priorities : {};
    meso.exerciseNotes = meso.exerciseNotes && typeof meso.exerciseNotes === 'object' ? meso.exerciseNotes : {};
    for (const day of meso.days) day.slots = Array.isArray(day?.slots) ? day.slots : [];
    for (const week of meso.weeks) {
      week.workouts = Array.isArray(week?.workouts) ? week.workouts : [];
      week.notes = Array.isArray(week?.notes) ? week.notes : [];
      week.rir = week.rir && typeof week.rir === 'object' ? week.rir : { compound: 2, isolation: 1 };
      for (const workout of week.workouts) {
        workout.exercises = Array.isArray(workout?.exercises) ? workout.exercises : [];
        workout.feedback = workout.feedback && typeof workout.feedback === 'object' ? workout.feedback : {};
        for (const wex of workout.exercises) {
          wex.sets = Array.isArray(wex?.sets) ? wex.sets : [];
          if (!Array.isArray(wex.repRange) || wex.repRange.length !== 2) wex.repRange = [8, 12];
          wex.targetWeight = num(wex.targetWeight);
          // set values reach value="" attributes — numbers or null, never markup
          for (const s of wex.sets) {
            s.weight = num(s?.weight);
            s.reps = num(s?.reps);
            s.done = Boolean(s?.done);
          }
        }
      }
    }
  });

  migrateNumericIds(state);

  // A missing/garbage counter would mint the id "NaN" for every new meso.
  if (!Number.isInteger(state.nextId) || state.nextId < 1) {
    const maxNumeric = Math.max(0, ...state.mesocycles.map((m) => (/^\d+$/.test(m.id) ? Number(m.id) : 0)));
    state.nextId = maxNumeric + 1;
  }
  return state;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY();
    return normalizeState(JSON.parse(raw));
  } catch {
    return EMPTY();
  }
}

// Native mirror: inside the Capacitor shell, every save is also written to the
// iOS Preferences store (UserDefaults-backed), which survives WKWebView
// website-data eviction. In the browser this is a no-op.
function nativePrefs() {
  return globalThis.Capacitor?.Plugins?.Preferences ?? null;
}

// Call once before first render. If the web-layer storage came up empty but a
// native mirror exists (e.g. localStorage was evicted), restore from it.
export async function initStore() {
  const prefs = nativePrefs();
  if (!prefs) return;
  try {
    if (!localStorage.getItem(KEY)) {
      const { value } = await prefs.get({ key: KEY });
      if (value) localStorage.setItem(KEY, value);
    }
  } catch { /* mirror unavailable — localStorage remains the source of truth */ }
}

// Returns false if persisting failed (e.g. storage quota) so the UI can warn.
export function saveState(state) {
  let ok = true;
  let json;
  try {
    json = JSON.stringify(state);
    localStorage.setItem(KEY, json);
  } catch {
    ok = false;
  }
  try {
    const write = nativePrefs()?.set({ key: KEY, value: json ?? '' });
    if (json != null && write?.catch) write.catch(() => { /* mirror is best-effort */ });
  } catch { /* mirror write is best-effort */ }
  return ok;
}

// Saves written before v0.2 stored positional numeric exercise ids; ids are
// now name-derived slugs. Every stored slot/exercise carries its name, so the
// upgrade — including pinned notes keyed by the old ids — is lossless.
function migrateNumericIds(state) {
  for (const meso of state.mesocycles) {
    const nameById = new Map();
    const collect = (obj) => {
      if (obj && typeof obj.exerciseId === 'number' && obj.name) nameById.set(obj.exerciseId, obj.name);
    };
    for (const day of meso.days || []) for (const slot of day.slots || []) collect(slot);
    for (const week of meso.weeks || []) {
      for (const workout of week.workouts || []) for (const wex of workout.exercises || []) collect(wex);
    }
    if (nameById.size === 0 && !Object.keys(meso.exerciseNotes || {}).some((k) => /^\d+$/.test(k))) continue;

    const fix = (obj) => {
      if (obj && typeof obj.exerciseId === 'number' && obj.name) obj.exerciseId = slugId(obj.name);
    };
    for (const day of meso.days || []) for (const slot of day.slots || []) fix(slot);
    for (const week of meso.weeks || []) {
      for (const workout of week.workouts || []) for (const wex of workout.exercises || []) fix(wex);
    }
    if (meso.exerciseNotes) {
      for (const [key, text] of Object.entries(meso.exerciseNotes)) {
        if (!/^\d+$/.test(key)) continue;
        const name = nameById.get(Number(key));
        delete meso.exerciseNotes[key];
        if (name) meso.exerciseNotes[slugId(name)] = text;
      }
    }
  }
}

export function newId(state) {
  return String(state.nextId++);
}

export function exportJSON(state) {
  return JSON.stringify({ app: 'hypertrophy-coach', exportedAt: new Date().toISOString(), state }, null, 2);
}

// Returns the imported state — normalized through the exact same upgrade path
// as loaded state — or throws with a human-readable message.
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const state = data.state ?? data;
  if (!state || typeof state !== 'object' || !Array.isArray(state.mesocycles)) {
    throw new Error('That file does not look like a Hypertrophy Coach backup.');
  }
  return normalizeState(state);
}
