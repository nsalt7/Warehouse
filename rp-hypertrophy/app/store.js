// Client-side persistence: everything lives in localStorage under one key, with
// JSON export/import for backup and device migration. Keeping storage behind
// this tiny interface means a future iOS build (Capacitor/WKWebView) can swap in
// native storage without touching the rest of the app.

const KEY = 'hypertrophy-coach:v1';

const EMPTY = () => ({ version: 1, nextId: 1, settings: { unit: 'lb' }, mesocycles: [] });

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY();
    const state = JSON.parse(raw);
    if (!state || typeof state !== 'object' || !Array.isArray(state.mesocycles)) return EMPTY();
    return state;
  } catch {
    return EMPTY();
  }
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function newId(state) {
  return String(state.nextId++);
}

export function exportJSON(state) {
  return JSON.stringify({ app: 'hypertrophy-coach', exportedAt: new Date().toISOString(), state }, null, 2);
}

// Returns the imported state, or throws with a human-readable message.
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const state = data.state ?? data;
  if (!state || !Array.isArray(state.mesocycles)) {
    throw new Error('That file does not look like a Hypertrophy Coach backup.');
  }
  return state;
}
