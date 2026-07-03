// Client-side persistence: everything lives in localStorage under one key, with
// JSON export/import for backup and device migration. Keeping storage behind
// this tiny interface means a future iOS build (Capacitor/WKWebView) can swap in
// native storage without touching the rest of the app.

const KEY = 'hypertrophy-coach:v1';

const EMPTY = () => ({
  version: 2,
  nextId: 1,
  settings: { unit: 'lb', onboarded: false, profile: { environment: 'gym', conditions: [] } },
  mesocycles: [],
});

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY();
    const state = JSON.parse(raw);
    if (!state || typeof state !== 'object' || !Array.isArray(state.mesocycles)) return EMPTY();
    // Backfill fields added since the save was written.
    state.settings = { ...EMPTY().settings, ...state.settings };
    state.settings.profile = { ...EMPTY().settings.profile, ...state.settings.profile };
    return state;
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
    if (json != null) nativePrefs()?.set({ key: KEY, value: json });
  } catch { /* mirror write is best-effort */ }
  return ok;
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
