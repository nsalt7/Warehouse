// Hypertrophy Coach — UI layer. All training logic lives in engine.js; all
// persistence in store.js. This file only renders state and routes events.

import {
  createMesocycle, finishWorkout, skipWorkout, currentPosition, weeklySetsPerMuscle,
  addExercise, removeExercise, e1rm, nextMesoConfig,
  SORENESS, WORKLOAD, PUMP, JOINT_PAIN, REST_SECONDS,
} from './engine.js';
import {
  MUSCLES, VOLUME_LANDMARKS, ENVIRONMENTS, CONDITIONS,
  exercisesForMuscle, getExercise, conflictsWith, alternativeFor,
} from './exercises.js';
import { TEMPLATES } from './templates.js';
import { loadState, saveState, initStore, newId, exportJSON, parseImport } from './store.js';

await initStore(); // restore from the native mirror before first render (no-op in browsers)

const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');
const restRoot = document.getElementById('rest-root');
const toastEl = document.getElementById('toast');

let state = loadState();
let warnedSave = false;
const persist = () => {
  if (!saveState(state) && !warnedSave) {
    warnedSave = true;
    toast('Could not save — storage may be full. Export a backup now.', 6000);
  }
};
const getMeso = (id) => state.mesocycles.find((m) => m.id === id);
const profile = () => state.settings.profile;

// ------------------------------- utilities ---------------------------------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtW = (w) => (w == null ? '—' : (Math.round(w * 100) / 100).toString());
const envLabel = (id) => ENVIRONMENTS.find((e) => e.id === id)?.label ?? id;
const envPhrase = (id) => ({ gym: 'the gym', calisthenics: 'the bar park', home: 'training at home' }[id] ?? id);

function toast(msg, ms = 3200) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), ms);
}

function confirmModal({ title, body, action = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal" style="max-width:420px" data-testid="confirm-modal">
          <h2>${esc(title)}</h2>
          <p class="muted small" style="margin:8px 0 0">${esc(body)}</p>
          <div class="modal-foot">
            <button class="btn ghost" id="cf-no">Cancel</button>
            <span class="grow"></span>
            <button class="btn ${danger ? 'danger' : 'primary'}" id="cf-yes" data-testid="confirm-yes">${esc(action)}</button>
          </div>
        </div>
      </div>`;
    const close = (v) => { modalRoot.innerHTML = ''; resolve(v); };
    document.getElementById('cf-no').onclick = () => close(false);
    document.getElementById('cf-yes').onclick = () => close(true);
  });
}

// A short two-tone chime for the rest timer (no audio assets needed).
function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain).connect(ctx.destination);
      gain.gain.setValueAtTime(0.08, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.22);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.25);
    });
  } catch { /* audio unavailable — fine */ }
}

// ------------------------------- rest timer ---------------------------------

let restInterval = null;
function startRest(seconds, label) {
  clearInterval(restInterval);
  const total = seconds;
  let left = seconds;
  const CIRC = 2 * Math.PI * 11;
  const render = () => {
    const mm = Math.floor(left / 60);
    const ss = String(left % 60).padStart(2, '0');
    const off = CIRC * (1 - left / total);
    restRoot.innerHTML = `
      <div class="rest-timer" data-testid="rest-timer" title="Tap to dismiss">
        <svg class="ring" viewBox="0 0 26 26">
          <circle cx="13" cy="13" r="11" fill="none" stroke="var(--surface-3)" stroke-width="2.5"/>
          <circle cx="13" cy="13" r="11" fill="none" stroke="var(--accent)" stroke-width="2.5"
            stroke-linecap="round" stroke-dasharray="${CIRC}" stroke-dashoffset="${off}"
            transform="rotate(-90 13 13)"/>
        </svg>
        <div>
          <div class="lbl">Rest · ${esc(label)}</div>
          <div class="t num">${mm}:${ss}</div>
        </div>
      </div>`;
    restRoot.querySelector('.rest-timer').onclick = stopRest;
  };
  render();
  restInterval = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      stopRest();
      chime();
      toast('Rest over — next set.', 2200);
      return;
    }
    render();
  }, 1000);
}
function stopRest() {
  clearInterval(restInterval);
  restInterval = null;
  restRoot.innerHTML = '';
}

// ------------------------------- router -------------------------------------

function markActiveTab() {
  const hash = location.hash || '#/';
  const tab = hash.startsWith('#/history') ? 'nav-history' : hash.startsWith('#/new') ? 'nav-new' : 'nav-home';
  document.querySelectorAll('.tabbar a').forEach((a) => {
    a.classList.toggle('active', a.dataset.testid === tab);
  });
}

function route() {
  stopRest();
  modalRoot.innerHTML = '';
  markActiveTab();
  if (!state.settings.onboarded) return renderOnboarding();
  const hash = location.hash || '#/';
  const mWorkout = hash.match(/^#\/meso\/([^/]+)\/w\/(\d+)\/(\d+)$/);
  const mOverview = hash.match(/^#\/meso\/([^/]+)\/overview$/);
  const mMeso = hash.match(/^#\/meso\/([^/]+)$/);
  const mFrom = hash.match(/^#\/new\/from\/([^/]+)$/);
  if (hash === '#/new') return renderBuilder();
  if (mFrom) return renderBuilder(mFrom[1]);
  if (hash === '#/history') return renderHistory();
  if (mOverview) return withMeso(mOverview[1], (m) => renderOverview(m));
  if (mWorkout) return withMeso(mWorkout[1], (m) => renderWorkout(m, Number(mWorkout[2]), Number(mWorkout[3])));
  if (mMeso) {
    return withMeso(mMeso[1], (m) => {
      const pos = currentPosition(m);
      return pos ? renderWorkout(m, pos.weekIndex, pos.dayIndex) : renderComplete(m);
    });
  }
  return renderDashboard();
}
function withMeso(id, fn) {
  const meso = getMeso(id);
  if (!meso) { location.hash = '#/'; return; }
  fn(meso);
}
window.addEventListener('hashchange', route);

// ------------------------------ onboarding -----------------------------------

function renderOnboarding(editing = false) {
  const draft = {
    environment: profile().environment || 'gym',
    conditions: [...(profile().conditions || [])],
    unit: state.settings.unit || 'lb',
  };

  function render() {
    const body = `
      <p class="eyebrow">${editing ? 'Training profile' : 'Set up'}</p>
      <h2>${editing ? 'Update your profile' : 'Two questions before your first session'}</h2>

      <div class="ob-block">
        <div class="ob-label">Where do you usually train?</div>
        <div class="ob-options" data-testid="ob-env">
          ${ENVIRONMENTS.map((e) => `
            <button class="ob-opt ${draft.environment === e.id ? 'on' : ''}" data-env="${e.id}" data-testid="ob-env-${e.id}">
              <b>${esc(e.label)}</b>
              <span>${esc(e.blurb)}</span>
            </button>`).join('')}
        </div>
        <div class="row" style="margin-top:10px; gap:8px">
          <span class="faint small">Units</span>
          <div class="seg" id="ob-unit">
            ${['lb', 'kg'].map((u) => `<button data-unit="${u}" class="${draft.unit === u ? 'on' : ''}">${u}</button>`).join('')}
          </div>
        </div>
      </div>

      <div class="ob-block">
        <div class="ob-label">Anything to train around?</div>
        <p class="faint small" style="margin:0 0 8px">Movements that stress a flagged area get swapped or warned about.
        This is programming logic, not medical advice — train with your clinician's blessing if something's injured.</p>
        <div class="ob-conditions" data-testid="ob-conditions">
          ${CONDITIONS.map((c) => `
            <button class="ob-cond ${draft.conditions.includes(c.excludes) ? 'on' : ''}" data-cond="${c.excludes}" data-testid="ob-cond-${c.id}">
              ${esc(c.label)}
            </button>`).join('')}
        </div>
      </div>

      <div class="modal-foot">
        ${editing ? '<button class="btn ghost" id="ob-cancel">Cancel</button>' : '<span class="faint small">Change any of this later under Data.</span>'}
        <span class="grow"></span>
        <button class="btn primary" id="ob-done" data-testid="ob-done">${editing ? 'Save profile' : 'Start training'}</button>
      </div>`;

    if (editing) {
      modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal">${body}</div></div>`;
    } else {
      app.innerHTML = `<div class="card hero" style="max-width:560px; margin:24px auto 0; padding:24px 22px" data-testid="onboarding">${body}</div>`;
    }
    const root = editing ? modalRoot : app;
    root.querySelectorAll('[data-env]').forEach((el) => el.addEventListener('click', () => {
      draft.environment = el.dataset.env; render();
    }));
    root.querySelector('#ob-unit').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      draft.unit = b.dataset.unit; render();
    }));
    root.querySelectorAll('[data-cond]').forEach((el) => el.addEventListener('click', () => {
      const c = el.dataset.cond;
      draft.conditions = draft.conditions.includes(c) ? draft.conditions.filter((x) => x !== c) : [...draft.conditions, c];
      render();
    }));
    root.querySelector('#ob-cancel')?.addEventListener('click', () => { modalRoot.innerHTML = ''; });
    root.querySelector('#ob-done').addEventListener('click', () => {
      state.settings.profile = { environment: draft.environment, conditions: draft.conditions };
      state.settings.unit = draft.unit;
      state.settings.onboarded = true;
      persist();
      if (editing) {
        modalRoot.innerHTML = '';
        toast('Profile saved.');
      } else {
        route();
      }
    });
  }
  render();
}

// ------------------------------- dashboard ----------------------------------

function weekDots(meso) {
  const pos = currentPosition(meso);
  return `<div class="week-dots">${Array.from({ length: meso.weeksTotal }, (_, i) => {
    const cls = pos == null || i < (pos?.weekIndex ?? meso.weeksTotal) ? 'done' : (i === pos.weekIndex ? 'now' : '');
    return `<span class="dot ${cls}"></span>`;
  }).join('')}</div>`;
}

function renderDashboard() {
  const active = state.mesocycles.filter((m) => m.status === 'active');
  const done = state.mesocycles.filter((m) => m.status === 'complete');
  const current = active[active.length - 1];

  if (state.mesocycles.length === 0) {
    app.innerHTML = `
      <div class="card hero empty-hero" data-testid="empty-state">
        <div class="art">
          <svg width="56" height="56" viewBox="0 0 32 32" aria-hidden="true">
            <rect x="2" y="12" width="4" height="8" rx="1.5" fill="var(--accent)"/>
            <rect x="7" y="9" width="4" height="14" rx="1.5" fill="var(--accent)"/>
            <rect x="12" y="14.5" width="8" height="3" rx="1.5" fill="var(--accent)"/>
            <rect x="21" y="9" width="4" height="14" rx="1.5" fill="var(--accent)"/>
            <rect x="26" y="12" width="4" height="8" rx="1.5" fill="var(--accent)"/>
          </svg>
        </div>
        <h1>No mesocycle on the books</h1>
        <p class="muted" style="margin:10px auto 0; max-width:420px">Pick a program built for ${envPhrase(profile().environment)},
        log your sets, and the engine handles the rest: volume, loads, and the deload.</p>
        <ul class="feature-list">
          <li>Sets rise only when your logged performance earns them</li>
          <li>Soreness and joint pain pull volume back before you dig a hole</li>
          <li>Regress two weeks running and the deload comes to you early</li>
        </ul>
        <div style="margin-top:24px">
          <a class="btn primary" href="#/new" data-testid="new-meso">Plan a mesocycle</a>
        </div>
      </div>`;
    return;
  }

  app.innerHTML = `
    <div class="page-head row spread">
      <h1>Mesocycles</h1>
      <a class="btn primary sm" href="#/new" data-testid="new-meso">+ New</a>
    </div>
    ${current ? heroCard(current) : ''}
    ${active.filter((m) => m !== current).map(smallCard).join('')}
    ${done.length ? `<div class="section"><h2>Completed</h2></div>${done.map(smallCard).join('')}` : ''}
  `;
}

function heroCard(meso) {
  const pos = currentPosition(meso);
  const week = meso.weeks[pos.weekIndex];
  const workout = week.workouts[pos.dayIndex];
  return `
    <a class="card hero" href="#/meso/${meso.id}" data-testid="meso-card">
      <p class="eyebrow">Current mesocycle</p>
      <div class="row spread">
        <h2 style="font-size:20px">${esc(meso.name)}</h2>
        ${week.isDeload ? '<span class="chip warn">Deload</span>' : `<span class="chip accent">Week ${pos.weekIndex + 1} of ${meso.weeksTotal}</span>`}
      </div>
      ${weekDots(meso)}
      <div class="row spread" style="margin-top:12px">
        <span class="muted small">Next: <b style="color:var(--ink)">${esc(workout.name)}</b> · ${envLabel(meso.environment)} · ${meso.days.length} days/week</span>
        <span class="btn primary sm">Continue</span>
      </div>
    </a>`;
}

function smallCard(meso) {
  const pos = currentPosition(meso);
  return `
    <a class="card" href="#/meso/${meso.id}" data-testid="meso-card">
      <div class="row spread">
        <div>
          <b>${esc(meso.name)}</b>
          <div class="faint small">${envLabel(meso.environment)} · ${meso.weeksTotal} weeks · ${meso.days.length} days/week</div>
        </div>
        ${meso.status === 'complete'
          ? '<span class="chip good">Complete</span>'
          : `<span class="chip">W${pos.weekIndex + 1} · D${pos.dayIndex + 1}</span>`}
      </div>
    </a>`;
}

// ------------------------------- builder ------------------------------------

// Option label with a caution note when the movement stresses a flagged area.
function exOptionLabel(exercise) {
  const flags = conflictsWith(exercise, profile().conditions);
  const parts = [exercise.name];
  if (exercise.lengthened) parts.push('· stretch');
  if (flags.length) parts.push(`· caution: ${flags.map((f) => CONDITIONS.find((c) => c.excludes === f)?.label.split(' ')[0].toLowerCase() || f).join(', ')}`);
  return parts.join(' ');
}

function renderBuilder(fromMesoId = null) {
  const source = fromMesoId ? getMeso(fromMesoId) : null;
  const draft = source
    ? { ...nextMesoConfig(source), templateId: null }
    : {
        name: '',
        weeksTotal: 5,
        unit: state.settings.unit || 'lb',
        environment: profile().environment || 'gym',
        days: [{ name: 'Day 1', slots: [] }],
        startVolumes: null,
        priorities: {},
        templateId: null,
      };
  draft.priorities = draft.priorities || {};

  function invalidDay() {
    return draft.days.findIndex((d) => d.slots.length === 0);
  }

  function render() {
    const templates = TEMPLATES.filter((t) => t.environment === draft.environment);
    app.innerHTML = `
      <div class="page-head">
        <p class="eyebrow">Plan</p>
        <div class="row spread">
          <h1>New mesocycle</h1>
          <div class="seg" id="env-seg" data-testid="env-seg">
            ${ENVIRONMENTS.map((e) => `<button data-env="${e.id}" class="${draft.environment === e.id ? 'on' : ''}" data-testid="env-${e.id}">${esc(e.label)}</button>`).join('')}
          </div>
        </div>
        <p class="faint small" style="margin:8px 0 0">${esc(ENVIRONMENTS.find((e) => e.id === draft.environment)?.blurb || '')}</p>
        ${source ? `<div class="banner info" data-testid="continue-banner"><span><strong>Continuing from “${esc(source.name)}”.</strong>
          Same program, including any variation upgrades. Each muscle restarts just below its last peak volume —
          resume under the fatigue ceiling, then re-earn the climb.</span></div>` : ''}
      </div>

      <div class="section" style="margin-top:6px">
        <h2>Start from a program</h2>
        <p class="section-sub">Built for ${envPhrase(draft.environment)} — pick one, then tweak anything below.
        ${profile().conditions.length ? 'Movements that clash with your profile get swapped automatically.' : ''}</p>
        <div class="template-grid">
          ${templates.map((t) => `
            <div class="card template-card ${draft.templateId === t.id ? 'selected' : ''}" data-template="${t.id}" data-testid="template-${t.id}">
              <div class="row spread"><b>${esc(t.name)}</b></div>
              <div class="desc">${esc(t.description)}</div>
              <div class="meta">${esc(t.level)} · ${t.days.length} days/wk · ${t.weeksTotal} weeks</div>
            </div>`).join('')}
        </div>
      </div>

      <div class="section">
        <h2>Details</h2>
        <div class="card" style="margin-top:10px">
          <div class="row" style="gap:14px">
            <input type="text" class="field grow" id="meso-name" placeholder="Name this mesocycle" value="${esc(draft.name)}" data-testid="meso-name">
            <div class="seg" id="weeks-seg" data-testid="meso-weeks">
              ${[4, 5, 6].map((w) => `<button data-weeks="${w}" class="${draft.weeksTotal === w ? 'on' : ''}">${w} wk</button>`).join('')}
            </div>
            <div class="seg" id="unit-seg">
              ${['lb', 'kg'].map((u) => `<button data-unit="${u}" class="${draft.unit === u ? 'on' : ''}">${u}</button>`).join('')}
            </div>
          </div>
          <p class="faint small" style="margin:10px 0 0">The final week is always a deload. Week 1 finds your working weights.</p>
        </div>
      </div>

      <div class="section">
        <h2>Training days</h2>
        <p class="section-sub">You pick the movements; the engine owns set counts. Stretch-position exercises are listed first.</p>
        <div id="days"></div>
        <button class="btn sm" id="add-day" data-testid="add-day" style="margin-top:10px">+ Add a day</button>
      </div>

      <div class="section" id="focus-section"></div>

      <div class="sticky-bar"><div class="inner">
        <span class="muted small grow" id="builder-status"></span>
        <button class="btn primary" id="create" data-testid="create-meso">Create mesocycle</button>
      </div></div>
    `;

    const daysEl = document.getElementById('days');
    daysEl.innerHTML = draft.days.map((d, di) => `
      <div class="day-editor" data-testid="day-editor">
        <div class="row spread" style="margin-bottom:4px">
          <input type="text" class="field" value="${esc(d.name)}" data-day-name="${di}" style="width:170px; padding:6px 10px">
          ${draft.days.length > 1 ? `<button class="btn ghost sm" data-del-day="${di}">Remove day</button>` : ''}
        </div>
        ${d.slots.length === 0 ? '<p class="faint small" style="margin:6px 0">Empty — add an exercise below.</p>' : ''}
        ${d.slots.map((s, si) => {
          const exercise = getExercise(s.exerciseId);
          const flags = conflictsWith(exercise, profile().conditions);
          return `<div class="slot-row">
            <span class="chip muscle">${esc(exercise.muscle)}</span>
            <span class="grow">${esc(exercise.name)}${exercise.lengthened ? ' <span class="faint small">· stretch</span>' : ''}
              ${flags.length ? '<span class="chip warn" style="margin-left:6px">check joints</span>' : ''}</span>
            <button class="x" data-del-slot="${di}:${si}" title="Remove">×</button>
          </div>`;
        }).join('')}
        <div class="add-exercise">
          <select class="field" data-muscle-pick="${di}" data-testid="muscle-pick-${di}">
            <option value="">Muscle group…</option>
            ${MUSCLES.map((m) => `<option value="${m}">${cap(m)}</option>`).join('')}
          </select>
          <select class="field grow" data-ex-pick="${di}" data-testid="ex-pick-${di}" disabled><option value="">Exercise…</option></select>
          <button class="btn sm" data-add-slot="${di}" data-testid="add-slot-${di}" disabled>Add</button>
        </div>
      </div>`).join('');

    // Muscle focus: grow (engine climbs volume) vs maintain (holds a small,
    // size-retaining dose — Bickel 2011). Only muscles actually in the plan.
    const musclesInDraft = [...new Set(draft.days.flatMap((d) => d.slots.map((s) => getExercise(s.exerciseId).muscle)))];
    const focusEl = document.getElementById('focus-section');
    focusEl.innerHTML = musclesInDraft.length === 0 ? '' : `
      <h2>Muscle focus</h2>
      <p class="section-sub">Maintained muscles keep a small dose that preserves size — the recovery budget goes to the ones you're growing.</p>
      <div class="card" data-testid="focus-panel">
        ${musclesInDraft.map((m) => `
          <div class="row spread" style="padding:5px 0">
            <span class="chip muscle">${esc(m)}</span>
            <div class="seg">
              <button data-prio="${m}:grow" data-testid="prio-${m}-grow" class="${(draft.priorities[m] ?? 'grow') === 'grow' ? 'on' : ''}">Grow</button>
              <button data-prio="${m}:maintain" data-testid="prio-${m}-maintain" class="${draft.priorities[m] === 'maintain' ? 'on' : ''}">Maintain</button>
            </div>
          </div>`).join('')}
      </div>`;
    focusEl.querySelectorAll('[data-prio]').forEach((el) => el.addEventListener('click', () => {
      const [m, p] = el.dataset.prio.split(':');
      if (p === 'grow') delete draft.priorities[m];
      else draft.priorities[m] = 'maintain';
      render();
    }));

    const bad = invalidDay();
    const totalSlots = draft.days.reduce((a, d) => a + d.slots.length, 0);
    const statusEl = document.getElementById('builder-status');
    const createBtn = document.getElementById('create');
    if (bad !== -1) {
      statusEl.textContent = totalSlots === 0
        ? 'Pick a program above, or add exercises to Day 1.'
        : `“${draft.days[bad].name}” is empty — add an exercise or remove the day.`;
      createBtn.disabled = true;
    } else {
      statusEl.textContent = `${draft.days.length} ${draft.days.length === 1 ? 'day' : 'days'} · ${totalSlots} exercises · ${envLabel(draft.environment)}`;
      createBtn.disabled = false;
    }

    // events
    document.getElementById('env-seg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.env === draft.environment) return;
      draft.environment = b.dataset.env;
      draft.templateId = null;
      const dropped = [];
      for (const d of draft.days) {
        d.slots = d.slots.filter((s) => {
          const ok = getExercise(s.exerciseId).envs.includes(draft.environment);
          if (!ok) dropped.push(getExercise(s.exerciseId).name);
          return ok;
        });
      }
      render();
      if (dropped.length) toast(`Removed ${dropped.length} ${dropped.length === 1 ? 'movement' : 'movements'} not available in ${envLabel(draft.environment)}.`, 4200);
    }));
    document.querySelectorAll('[data-template]').forEach((el) => el.addEventListener('click', () => {
      const t = TEMPLATES.find((x) => x.id === el.dataset.template);
      draft.templateId = t.id;
      draft.name = draft.name || t.name;
      draft.weeksTotal = t.weeksTotal;
      draft.startVolumes = null; // a fresh template starts at the landmarks
      draft.continuedFrom = null;
      draft.priorities = { ...(t.priorities || {}) };
      // Auto-swap movements that clash with the user's profile.
      let swapped = 0;
      draft.days = t.days.map((d) => ({
        name: d.name,
        slots: d.slots.map((s) => {
          const def = getExercise(s.exerciseId);
          if (conflictsWith(def, profile().conditions).length) {
            const alt = alternativeFor(def, profile().conditions, draft.environment);
            if (alt) { swapped += 1; return { exerciseId: alt.id }; }
          }
          return { exerciseId: s.exerciseId };
        }),
      }));
      render();
      document.getElementById('days').scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast(swapped
        ? `Loaded ${t.name}. Swapped ${swapped} ${swapped === 1 ? 'movement' : 'movements'} to fit your profile.`
        : `Loaded ${t.name}. Adjust freely, then create.`, 4200);
    }));
    document.getElementById('meso-name').addEventListener('input', (e) => { draft.name = e.target.value; });
    document.getElementById('weeks-seg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      draft.weeksTotal = Number(b.dataset.weeks); render();
    }));
    document.getElementById('unit-seg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      draft.unit = b.dataset.unit; render();
    }));
    document.getElementById('add-day').addEventListener('click', () => {
      draft.days.push({ name: `Day ${draft.days.length + 1}`, slots: [] }); render();
    });
    daysEl.querySelectorAll('[data-day-name]').forEach((el) => el.addEventListener('input', () => {
      draft.days[Number(el.dataset.dayName)].name = el.value;
    }));
    daysEl.querySelectorAll('[data-del-day]').forEach((el) => el.addEventListener('click', () => {
      draft.days.splice(Number(el.dataset.delDay), 1); render();
    }));
    daysEl.querySelectorAll('[data-del-slot]').forEach((el) => el.addEventListener('click', () => {
      const [di, si] = el.dataset.delSlot.split(':').map(Number);
      draft.days[di].slots.splice(si, 1); render();
    }));
    daysEl.querySelectorAll('[data-muscle-pick]').forEach((el) => el.addEventListener('change', () => {
      const di = Number(el.dataset.musclePick);
      const exSel = daysEl.querySelector(`[data-ex-pick="${di}"]`);
      const addBtn = daysEl.querySelector(`[data-add-slot="${di}"]`);
      const list = exercisesForMuscle(el.value, draft.environment);
      exSel.innerHTML = '<option value="">Exercise…</option>' +
        list.map((x) => `<option value="${x.id}">${esc(exOptionLabel(x))}</option>`).join('');
      exSel.disabled = list.length === 0;
      addBtn.disabled = true;
      exSel.onchange = () => { addBtn.disabled = !exSel.value; };
    }));
    daysEl.querySelectorAll('[data-add-slot]').forEach((el) => el.addEventListener('click', () => {
      const di = Number(el.dataset.addSlot);
      const exSel = daysEl.querySelector(`[data-ex-pick="${di}"]`);
      if (!exSel.value) return;
      draft.days[di].slots.push({ exerciseId: exSel.value });
      render();
    }));
    createBtn.addEventListener('click', () => {
      try {
        const meso = createMesocycle(draft, newId(state));
        meso.createdAt = new Date().toISOString();
        state.settings.unit = draft.unit;
        state.mesocycles.push(meso);
        persist();
        toast('Mesocycle created. Week 1 finds your working weights.');
        location.hash = `#/meso/${meso.id}`;
      } catch (err) {
        toast(err.message, 4200);
      }
    });
  }
  render();
}

// ------------------------------- workout ------------------------------------

function headChips(meso, week) {
  if (week.isDeload) {
    return `<span class="chip warn" data-testid="deload-chip">Deload week</span>`;
  }
  return `
    <span class="chip accent" data-testid="rir-chip">Compounds @ ${week.rir.compound} RIR</span>
    <span class="chip accent">Isolation @ ${week.rir.isolation} RIR</span>`;
}

function renderWorkout(meso, weekIndex, dayIndex) {
  const week = meso.weeks[weekIndex];
  const workout = week?.workouts[dayIndex];
  if (!workout) { location.hash = `#/meso/${meso.id}`; return; }
  const isCalibration = weekIndex === 0;
  const done = workout.status === 'done';
  const hasPrev = workout.exercises.some((e) => e.prevSets?.length);

  const targetLine = (wex) => {
    const rir = week.rir[wex.type] ?? week.rir.isolation;
    const [lo, hi] = wex.repRange;
    if (wex.bodyweight && wex.targetWeight == null) {
      return `<b>${wex.sets.length} × ${lo}–${hi} reps</b> · bodyweight · ${rir} RIR`;
    }
    if (wex.targetWeight == null) {
      return `Find a weight for <b>${lo}–${hi} reps</b> leaving <b>${rir} in reserve</b>`;
    }
    return `<b>${wex.sets.length} × ${fmtW(wex.targetWeight)} ${meso.unit}</b> · ${lo}–${hi} reps · ${rir} RIR`;
  };

  app.innerHTML = `
    <div class="workout-head">
      <p class="eyebrow"><a href="#/meso/${meso.id}/overview" data-testid="to-overview">${esc(meso.name)} · overview</a></p>
      <div class="row spread">
        <h1 data-testid="workout-title">Week ${weekIndex + 1} · ${esc(workout.name)}</h1>
        <button class="btn ghost sm" id="edit-program" data-testid="edit-program">Edit day</button>
      </div>
      <div class="chips">${headChips(meso, week)}
        ${done ? '<span class="chip good">Logged</span>' : ''}
      </div>
      ${week.notes?.length ? week.notes.map((n) => `<div class="banner info" data-testid="week-note"><strong>Progression:</strong>&nbsp;${esc(n)}</div>`).join('') : ''}
      ${isCalibration ? `<div class="banner info"><span><strong>Calibration week.</strong>
        Work up to a weight you could lift for the shown reps with the target left in reserve. The engine
        takes it from there.</span></div>` : ''}
      ${week.isDeload ? `<div class="banner warn"><span><strong>Deload.</strong> Half the sets,
        lighter loads, nothing near failure. Recovery is the point of this week.</span></div>` : ''}
      ${meso.reactiveDeload && week.isDeload ? `<div class="banner warn"><span>This deload fired
        <strong>early</strong>: performance regressed two weeks running across several muscles — the
        validated sign of overreaching. Back off now, grow after.</span></div>` : ''}
    </div>

    ${workout.exercises.map((wex, ei) => `
      <div class="card ex-card" data-testid="exercise-card">
        <div class="ex-head">
          <div>
            <h3><button class="ex-name" data-ex-info="${ei}" data-testid="ex-info-${ei}">${esc(wex.name)} <span class="faint">›</span></button></h3>
            <p class="ex-target">${targetLine(wex)}</p>
          </div>
          <span class="chip muscle">${esc(wex.muscle)}</span>
        </div>
        ${meso.exerciseNotes?.[wex.exerciseId] ? `<div class="note-pin" data-testid="note-pin-${ei}">${esc(meso.exerciseNotes[wex.exerciseId])}</div>` : ''}
        <table class="set-table">
          <thead><tr>
            <th>Set</th><th>${wex.bodyweight ? `+${esc(meso.unit)}` : esc(meso.unit)}</th><th>Reps</th>${hasPrev ? '<th>Last</th>' : ''}<th></th>
          </tr></thead>
          <tbody>
            ${wex.sets.map((s, si) => `
              <tr class="${s.done ? 'done-row' : ''}">
                <td class="set-num num">${si + 1}</td>
                <td><input type="number" inputmode="decimal" step="0.5" min="0" class="field"
                  placeholder="${wex.bodyweight && wex.targetWeight == null ? 'BW' : wex.targetWeight != null ? fmtW(wex.targetWeight) : '—'}"
                  aria-label="${esc(wex.name)} set ${si + 1} weight"
                  value="${s.weight ?? ''}" data-set="${ei}:${si}:weight" data-testid="weight-${ei}-${si}"></td>
                <td><input type="number" inputmode="numeric" step="1" min="0" class="field"
                  placeholder="${wex.repRange[0]}–${wex.repRange[1]}"
                  aria-label="${esc(wex.name)} set ${si + 1} reps"
                  value="${s.reps ?? ''}" data-set="${ei}:${si}:reps" data-testid="reps-${ei}-${si}"></td>
                ${hasPrev ? `<td class="set-last">${wex.prevSets?.[si] ? `${wex.prevSets[si].weight == null ? 'BW' : fmtW(wex.prevSets[si].weight)} × ${wex.prevSets[si].reps}` : '—'}</td>` : ''}
                <td><button class="logbtn ${s.done ? 'on' : ''}" data-log="${ei}:${si}" data-testid="done-${ei}-${si}" title="Log set" aria-label="Log ${esc(wex.name)} set ${si + 1}">
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 7.5L5.5 11L12 3.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button></td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div class="ex-foot">
          <button class="btn ghost sm" data-add-set="${ei}" data-testid="add-set-${ei}">+ set</button>
          <button class="btn ghost sm" data-rm-set="${ei}" ${wex.sets.length <= 1 ? 'disabled' : ''}>− set</button>
          <div class="pain-seg row" style="gap:7px">
            <span class="pain-label">Joints</span>
            <div class="seg">
              ${JOINT_PAIN.map((label, i) => `<button data-pain="${ei}:${i}" class="${(wex.jointPain || 0) === i ? 'on' : ''}" title="${esc(label)}">${esc(label)}</button>`).join('')}
            </div>
          </div>
        </div>
      </div>`).join('')}

    <div class="sticky-bar"><div class="inner">
      <span class="muted small grow num" id="set-progress"></span>
      ${done ? '' : '<button class="btn ghost sm" id="skip-workout" data-testid="skip-workout">Skip</button>'}
      <button class="btn primary" id="finish" data-testid="finish-workout" ${done ? 'disabled' : ''}>
        ${done ? (workout.skipped ? 'Skipped' : 'Workout logged') : 'Finish workout'}
      </button>
    </div></div>
  `;

  const refreshProgress = () => {
    const total = workout.exercises.reduce((a, e) => a + e.sets.length, 0);
    const logged = workout.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
    document.getElementById('set-progress').textContent = `${logged} / ${total} sets logged`;
  };
  refreshProgress();

  app.querySelectorAll('[data-set]').forEach((el) => el.addEventListener('input', () => {
    const [ei, si, field] = el.dataset.set.split(':');
    workout.exercises[Number(ei)].sets[Number(si)][field] = el.value === '' ? null : Number(el.value);
    persist();
  }));
  app.querySelectorAll('[data-log]').forEach((el) => el.addEventListener('click', () => {
    const [ei, si] = el.dataset.log.split(':').map(Number);
    const wex = workout.exercises[ei];
    const set = wex.sets[si];
    // Logging with empty fields adopts the prescribed target — one-tap logging.
    if (!set.done) {
      if (set.weight == null && wex.targetWeight != null) set.weight = wex.targetWeight;
      if (set.reps == null && wex.prevSets?.[si]?.reps != null) set.reps = wex.prevSets[si].reps;
    }
    set.done = !set.done;
    persist();
    renderWorkout(meso, weekIndex, dayIndex);
    if (set.done && workout.status !== 'done') {
      startRest(REST_SECONDS[wex.type] ?? 120, wex.type === 'compound' ? 'compound' : 'isolation');
    }
  }));
  app.querySelectorAll('[data-add-set]').forEach((el) => el.addEventListener('click', () => {
    workout.exercises[Number(el.dataset.addSet)].sets.push({ weight: null, reps: null, done: false });
    persist();
    renderWorkout(meso, weekIndex, dayIndex);
  }));
  app.querySelectorAll('[data-rm-set]').forEach((el) => el.addEventListener('click', () => {
    const sets = workout.exercises[Number(el.dataset.rmSet)].sets;
    if (sets.length > 1) sets.pop();
    persist();
    renderWorkout(meso, weekIndex, dayIndex);
  }));
  app.querySelectorAll('[data-pain]').forEach((el) => el.addEventListener('click', () => {
    const [ei, level] = el.dataset.pain.split(':').map(Number);
    workout.exercises[ei].jointPain = level;
    persist();
    renderWorkout(meso, weekIndex, dayIndex);
  }));
  app.querySelectorAll('[data-ex-info]').forEach((el) => el.addEventListener('click', () => {
    openExerciseSheet(meso, weekIndex, dayIndex, workout.exercises[Number(el.dataset.exInfo)]);
  }));
  document.getElementById('edit-program').addEventListener('click', () => {
    openProgramEditor(meso, weekIndex, dayIndex);
  });
  document.getElementById('skip-workout')?.addEventListener('click', async () => {
    const ok = await confirmModal({
      title: 'Skip this workout?',
      body: 'It closes with nothing logged. Prescriptions carry forward unchanged, and the week can still complete.',
      action: 'Skip workout',
      danger: false,
    });
    if (!ok) return;
    const result = skipWorkout(meso, weekIndex, dayIndex, new Date().toISOString());
    persist();
    if (result.mesoComplete) toast('Mesocycle complete.');
    else if (result.weekGenerated) toast(`Week ${meso.weeks.length} is ready.`);
    else toast('Workout skipped.');
    location.hash = `#/meso/${meso.id}`;
    route();
  });
  document.getElementById('finish')?.addEventListener('click', () => {
    if (workout.status === 'done') return;
    stopRest();
    openFeedback(meso, weekIndex, dayIndex, workout);
  });
}

// --------------------------- exercise detail sheet ---------------------------

function openExerciseSheet(meso, weekIndex, dayIndex, wex) {
  const def = getExercise(wex.exerciseId);
  meso.exerciseNotes ||= {};
  const note = meso.exerciseNotes[wex.exerciseId] || '';
  const recent = exerciseSeries(wex.name).slice(-5).reverse();
  const priority = meso.priorities?.[wex.muscle];

  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" data-testid="exercise-sheet">
        <h2>${esc(wex.name)}</h2>
        <div class="row" style="margin-top:8px">
          <span class="chip muscle">${esc(wex.muscle)}</span>
          <span class="chip">${esc(def?.equipment ?? '')}</span>
          ${def?.lengthened ? '<span class="chip accent">stretch-biased</span>' : ''}
          ${priority === 'maintain' ? '<span class="chip warn">maintaining</span>' : ''}
        </div>
        ${def?.cue ? `
          <p class="eyebrow" style="margin-top:16px">Coach's cue</p>
          <p class="muted small" style="margin:2px 0 0" data-testid="coach-cue">${esc(def.cue)}</p>` : ''}
        <p class="eyebrow" style="margin-top:16px">Your note</p>
        <textarea class="field" id="ex-note" data-testid="ex-note" rows="2" placeholder="Seat height, grip width, what to fix next time…"
          style="width:100%; resize:vertical; margin-top:4px">${esc(note)}</textarea>
        ${recent.length ? `
          <p class="eyebrow" style="margin-top:16px">Recent sessions</p>
          <table class="data-table" style="margin-top:2px">
            ${recent.map((p) => `<tr>
              <td>${p.label}</td>
              <td class="r">${p.bw ? `BW × ${p.reps}` : `${fmtW(p.weight)} ${meso.unit} × ${p.reps}`}</td>
              <td class="r"><b>${p.value}</b>${p.bw ? ' reps' : ''}</td>
            </tr>`).join('')}
          </table>` : ''}
        <div class="modal-foot">
          <button class="btn ghost" id="ex-close">Close</button>
          <span class="grow"></span>
          <button class="btn primary" id="ex-save" data-testid="ex-save">Save note</button>
        </div>
      </div>
    </div>`;

  document.getElementById('ex-close').onclick = () => { modalRoot.innerHTML = ''; };
  document.getElementById('ex-save').onclick = () => {
    const text = document.getElementById('ex-note').value.trim();
    if (text) meso.exerciseNotes[wex.exerciseId] = text;
    else delete meso.exerciseNotes[wex.exerciseId];
    persist();
    modalRoot.innerHTML = '';
    renderWorkout(meso, weekIndex, dayIndex);
  };
}

// ------------------------- mid-meso program editor ---------------------------

function openProgramEditor(meso, weekIndex, dayIndex) {
  const day = meso.days[dayIndex];

  function render() {
    modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal" data-testid="program-editor">
          <p class="eyebrow">Edit program</p>
          <h2>${esc(day.name)}</h2>
          <p class="muted small" style="margin:6px 0 12px">Changes apply from this week's session onward.
          Logged workouts stay as they were. New movements start at 2 sets and calibrate.</p>
          ${day.slots.map((s, si) => `
            <div class="slot-row">
              <span class="chip muscle">${esc(s.muscle)}</span>
              <span class="grow">${esc(s.name)}</span>
              <button class="x" data-rm-ex="${si}" data-testid="rm-ex-${si}" title="Remove from program" ${day.slots.length <= 1 ? 'disabled' : ''}>×</button>
            </div>`).join('')}
          <div class="add-exercise">
            <select class="field" id="pe-muscle" data-testid="pe-muscle">
              <option value="">Muscle group…</option>
              ${MUSCLES.map((m) => `<option value="${m}">${cap(m)}</option>`).join('')}
            </select>
            <select class="field grow" id="pe-ex" data-testid="pe-ex" disabled><option value="">Exercise…</option></select>
            <button class="btn sm" id="pe-add" data-testid="pe-add" disabled>Add</button>
          </div>
          <div class="modal-foot">
            <span class="grow"></span>
            <button class="btn primary" id="pe-done" data-testid="pe-done">Done</button>
          </div>
        </div>
      </div>`;

    modalRoot.querySelectorAll('[data-rm-ex]').forEach((el) => el.addEventListener('click', () => {
      try {
        const removed = removeExercise(meso, dayIndex, Number(el.dataset.rmEx));
        persist();
        toast(`${removed.name} removed from ${day.name}.`);
        render();
      } catch (err) {
        toast(err.message, 4200);
      }
    }));
    const muscleSel = document.getElementById('pe-muscle');
    const exSel = document.getElementById('pe-ex');
    const addBtn = document.getElementById('pe-add');
    muscleSel.addEventListener('change', () => {
      const list = exercisesForMuscle(muscleSel.value, meso.environment);
      exSel.innerHTML = '<option value="">Exercise…</option>' +
        list.map((x) => `<option value="${x.id}">${esc(exOptionLabel(x))}</option>`).join('');
      exSel.disabled = list.length === 0;
      addBtn.disabled = true;
      exSel.onchange = () => { addBtn.disabled = !exSel.value; };
    });
    addBtn.addEventListener('click', () => {
      const def = addExercise(meso, dayIndex, exSel.value);
      persist();
      toast(`${def.name} added to ${day.name}.`);
      render();
    });
    document.getElementById('pe-done').addEventListener('click', () => {
      modalRoot.innerHTML = '';
      renderWorkout(meso, weekIndex, dayIndex);
    });
  }
  render();
}

// ------------------------------ feedback -------------------------------------

function openFeedback(meso, weekIndex, dayIndex, workout) {
  const muscles = [...new Set(workout.exercises.map((e) => e.muscle))];
  const answers = {};
  const QUESTIONS = [
    { key: 'soreness', q: 'How sore did it get after last time?', scale: SORENESS },
    { key: 'workload', q: 'How hard was today’s work for it?', scale: WORKLOAD },
    { key: 'pump', q: 'Pump today?', scale: PUMP },
  ];

  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" data-testid="feedback-modal">
        <p class="eyebrow">Check-in</p>
        <h2>How did that go?</h2>
        ${muscles.map((m) => `
          <div class="fb-muscle" data-testid="fb-${m}">
            <h3>${cap(m)}</h3>
            ${QUESTIONS.map((qq) => `
              <div class="fb-q">
                <div class="q">${qq.q}</div>
                <div class="fb-opts">
                  ${qq.scale.map((opt, i) => `<button data-fb="${m}:${qq.key}:${i}" data-testid="fb-${m}-${qq.key}-${i}">${esc(opt)}</button>`).join('')}
                </div>
              </div>`).join('')}
          </div>`).join('')}
        <p class="modal-note">Performance drives your volume up; these answers can only hold it or pull it back.
        Pump is recorded for your log but never changes the plan.</p>
        <div class="modal-foot">
          <button class="btn ghost" id="fb-cancel">Back</button>
          <span class="grow"></span>
          <button class="btn primary" id="fb-submit" data-testid="fb-submit" disabled>Save workout</button>
        </div>
      </div>
    </div>`;

  const submitBtn = document.getElementById('fb-submit');
  const refresh = () => {
    submitBtn.disabled = !muscles.every((m) => answers[m] && QUESTIONS.every((q) => answers[m][q.key] != null));
  };
  modalRoot.querySelectorAll('[data-fb]').forEach((el) => el.addEventListener('click', () => {
    const [m, key, i] = el.dataset.fb.split(':');
    (answers[m] ||= {})[key] = Number(i);
    modalRoot.querySelectorAll(`[data-fb^="${m}:${key}:"]`).forEach((b) => b.classList.remove('on'));
    el.classList.add('on');
    refresh();
  }));
  document.getElementById('fb-cancel').addEventListener('click', () => { modalRoot.innerHTML = ''; });
  submitBtn.addEventListener('click', () => {
    const result = finishWorkout(meso, weekIndex, dayIndex, answers, new Date().toISOString());
    persist();
    modalRoot.innerHTML = '';
    if (result.mesoComplete) toast('Mesocycle complete.');
    else if (result.reactiveDeload) toast('Fatigue signals detected — an early deload has been scheduled.', 5000);
    else if (result.weekGenerated) toast(`Week ${meso.weeks.length} is ready, built from your numbers.`, 4200);
    else toast('Workout saved.');
    location.hash = `#/meso/${meso.id}`;
    route();
  });
}

// ------------------------------ overview -------------------------------------

function collectPRs(meso) {
  const best = new Map();
  for (const week of meso.weeks) {
    if (week.isDeload) continue;
    for (const w of week.workouts) {
      for (const wex of w.exercises) {
        for (const s of wex.sets) {
          if (!s.done || s.reps == null) continue;
          const weight = s.weight ?? (wex.bodyweight ? 0 : null);
          if (weight == null) continue;
          const score = wex.bodyweight && weight === 0 ? s.reps : e1rm(weight, s.reps);
          const prev = best.get(wex.name);
          if (!prev || score > prev.score) {
            best.set(wex.name, { score, weight, reps: s.reps, week: week.index + 1, bodyweight: wex.bodyweight && weight === 0 });
          }
        }
      }
    }
  }
  return [...best.entries()].sort((a, b) => b[1].score - a[1].score);
}

function renderOverview(meso) {
  const latest = meso.weeks[meso.weeks.length - 1];
  const vol = weeklySetsPerMuscle(latest);
  const muscles = Object.keys(vol).sort((a, b) => vol[b] - vol[a]);
  const pos = currentPosition(meso);
  const prs = collectPRs(meso);
  const maxCap = Math.max(...muscles.map((m) => VOLUME_LANDMARKS[m]?.maxVolume ?? 20));

  app.innerHTML = `
    <div class="page-head">
      <p class="eyebrow"><a href="#/">Mesocycles</a></p>
      <div class="row spread">
        <h1>${esc(meso.name)}</h1>
        <a class="btn primary sm" href="#/meso/${meso.id}" data-testid="back-to-workout">
          ${pos ? `Week ${pos.weekIndex + 1} · Day ${pos.dayIndex + 1}` : 'Complete'}
        </a>
      </div>
      <div class="chips row" style="margin-top:8px">${headChips(meso, latest)}
        <span class="chip">${envLabel(meso.environment)}</span>
        ${meso.reactiveDeload ? '<span class="chip warn">Ended early — reactive deload</span>' : ''}
      </div>
    </div>

    <div class="section">
      <h2>Schedule</h2>
      <div class="card scroll-x" style="margin-top:10px">
        <table class="sched" data-testid="schedule-grid">
          <tr><th class="rowhead"></th>${meso.days.map((d) => `<th>${esc(d.name)}</th>`).join('')}</tr>
          ${Array.from({ length: meso.weeksTotal }, (_, wi) => {
            const w = meso.weeks[wi];
            return `<tr>
              <th class="rowhead">W${wi + 1}${wi === meso.weeksTotal - 1 ? ' · deload' : ''}</th>
              ${meso.days.map((_, di) => {
                if (!w) return '<td><span class="cell">·</span></td>';
                const wo = w.workouts[di];
                if (!wo) return '<td><span class="cell">·</span></td>';
                const isNow = pos && pos.weekIndex === wi && pos.dayIndex === di;
                const cls = wo.status === 'done' ? 'done' : isNow ? 'now' : '';
                const label = wo.status === 'done' ? '✓' : isNow ? '●' : '·';
                return `<td><a class="cell ${cls}" href="#/meso/${meso.id}/w/${wi}/${di}" title="Week ${wi + 1}, ${esc(wo.name)}">${label}</a></td>`;
              }).join('')}
            </tr>`;
          }).join('')}
        </table>
      </div>
    </div>

    <div class="section">
      <h2>Weekly volume by muscle</h2>
      <p class="section-sub">Hard sets in the current week — indirect work counts half. Ticks mark the starting volume and this engine's ceiling.</p>
      <div class="card" data-testid="volume-panel">
        ${muscles.map((m) => {
          const lm = VOLUME_LANDMARKS[m] || { startVolume: 8, maxVolume: 20 };
          const pct = Math.min(100, (vol[m] / maxCap) * 100);
          return `<div class="vol-row">
            <span class="vol-label">${esc(m)}${meso.priorities?.[m] === 'maintain' ? ' <span class="chip warn" style="font-size:10px; padding:1px 6px">maint</span>' : ''}</span>
            <div class="vol-track">
              <div class="vol-fill" style="width:${pct}%"></div>
              <span class="vol-tick" style="left:${(lm.startVolume / maxCap) * 100}%" title="start ${lm.startVolume}"></span>
              <span class="vol-tick" style="left:${(lm.maxVolume / maxCap) * 100}%" title="max ${lm.maxVolume}"></span>
            </div>
            <span class="vol-val num">${vol[m]} sets</span>
          </div>`;
        }).join('')}
        <div class="legend"><span><span class="k"></span>ticks: start volume / weekly ceiling</span></div>
      </div>
    </div>

    <div class="section">
      <h2>Volume by week</h2>
      <div class="card scroll-x" style="margin-top:10px">
        <table class="data-table fit">
          <tr><th>Muscle</th>${meso.weeks.map((w) => `<th class="r">W${w.index + 1}${w.isDeload ? '·D' : ''}</th>`).join('')}</tr>
          ${muscles.map((m) => `<tr>
            <td style="text-transform:capitalize">${esc(m)}</td>
            ${meso.weeks.map((w) => `<td class="r">${weeklySetsPerMuscle(w)[m] ?? 0}</td>`).join('')}
          </tr>`).join('')}
        </table>
      </div>
    </div>

    ${prs.length ? `
    <div class="section">
      <h2>Best sets</h2>
      <p class="section-sub">Weighted lifts score by estimated 1RM (Epley); pure bodyweight movements by best reps. Deload sets excluded.</p>
      <div class="card scroll-x">
        <table class="data-table" data-testid="pr-table">
          <tr><th>Exercise</th><th class="r">Best set</th><th class="r">Score</th><th class="r">Week</th></tr>
          ${prs.slice(0, 12).map(([name, p]) => `<tr>
            <td>${esc(name)}</td>
            <td class="r">${p.bodyweight ? `BW × ${p.reps}` : `${fmtW(p.weight)} ${meso.unit} × ${p.reps}`}</td>
            <td class="r"><b>${p.score}</b>${p.bodyweight ? ' reps' : ''}</td>
            <td class="r">W${p.week}</td>
          </tr>`).join('')}
        </table>
      </div>
    </div>` : ''}

    <div class="section">
      <div class="row spread">
        <span class="faint small">Created ${meso.createdAt ? new Date(meso.createdAt).toLocaleDateString() : '—'}</span>
        <button class="btn ghost sm danger" id="delete-meso" data-testid="delete-meso">Delete mesocycle</button>
      </div>
    </div>
  `;

  document.getElementById('delete-meso').addEventListener('click', async () => {
    const ok = await confirmModal({
      title: `Delete “${meso.name}”?`,
      body: 'All logged workouts in this mesocycle will be permanently removed. Export a backup first if unsure.',
    });
    if (!ok) return;
    state.mesocycles = state.mesocycles.filter((m) => m.id !== meso.id);
    persist();
    location.hash = '#/';
  });
}

// ------------------------------ history --------------------------------------

// Every finished workout across all mesocycles, in training order.
function allSessions() {
  const out = [];
  for (const meso of state.mesocycles) {
    for (const week of meso.weeks) {
      for (const workout of week.workouts) {
        if (workout.status === 'done') out.push({ meso, week, workout });
      }
    }
  }
  return out;
}

function setScore(wex, s) {
  if (!s.done || s.reps == null) return null;
  const weight = s.weight ?? (wex.bodyweight ? 0 : null);
  if (weight == null) return null;
  return wex.bodyweight && weight === 0
    ? { value: s.reps, bw: true, weight: 0, reps: s.reps }
    : { value: e1rm(weight, s.reps), bw: false, weight, reps: s.reps };
}

// Best score per session for one exercise, deloads excluded (trend, not slog).
function exerciseSeries(name) {
  const points = [];
  for (const { meso, week, workout } of allSessions()) {
    if (week.isDeload) continue;
    for (const wex of workout.exercises) {
      if (wex.name !== name) continue;
      let best = null;
      for (const s of wex.sets) {
        const sc = setScore(wex, s);
        if (sc && (!best || sc.value > best.value)) best = sc;
      }
      if (best) points.push({ ...best, label: `${esc(meso.name)} · W${week.index + 1}`, short: `W${week.index + 1}` });
    }
  }
  return points;
}

function trendChart(points, unit) {
  const W = 560, H = 170, L = 42, R = 12, T = 14, B = 26;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max(1, (hi - lo) * 0.15);
  const yMin = Math.max(0, lo - pad), yMax = hi + pad;
  const x = (i) => L + (points.length === 1 ? (W - L - R) / 2 : (i / (points.length - 1)) * (W - L - R));
  const y = (v) => T + (1 - (v - yMin) / (yMax - yMin)) * (H - T - B);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const suffix = points[0]?.bw ? ' reps' : ` ${unit}`;
  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%; height:auto" role="img" aria-label="Progress trend">
      <line x1="${L}" y1="${y(lo)}" x2="${W - R}" y2="${y(lo)}" stroke="var(--line)" stroke-width="1"/>
      <line x1="${L}" y1="${y(hi)}" x2="${W - R}" y2="${y(hi)}" stroke="var(--line)" stroke-width="1"/>
      <text x="${L - 6}" y="${y(lo) + 4}" text-anchor="end" font-size="11" fill="var(--ink-3)">${lo}</text>
      <text x="${L - 6}" y="${y(hi) + 4}" text-anchor="end" font-size="11" fill="var(--ink-3)">${hi}</text>
      <polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3.5" fill="var(--accent)" stroke="var(--card)" stroke-width="1.5"><title>${p.label}: ${p.bw ? '' : `${fmtW(p.weight)} ${unit} × `}${p.reps}${p.bw ? ' reps' : ''} → ${p.value}${suffix}</title></circle>`).join('')}
      <text x="${L}" y="${H - 8}" font-size="11" fill="var(--ink-3)">${points[0].short}</text>
      <text x="${W - R}" y="${H - 8}" text-anchor="end" font-size="11" fill="var(--ink-3)">${points[points.length - 1].short}</text>
    </svg>`;
}

function renderHistory(selectedName = null) {
  const sessions = allSessions();
  if (sessions.length === 0) {
    app.innerHTML = `
      <div class="page-head"><h1>History</h1></div>
      <div class="card" data-testid="history-empty" style="text-align:center; padding:36px 20px">
        <p class="muted" style="margin:0">Nothing logged yet. Your best sets and progress
        charts appear here after your first finished workout.</p>
      </div>`;
    return;
  }

  // exercises with enough sessions to chart
  const counts = new Map();
  for (const { week, workout } of sessions) {
    if (week.isDeload) continue;
    for (const wex of workout.exercises) {
      if (wex.sets.some((s) => s.done && s.reps != null)) counts.set(wex.name, (counts.get(wex.name) || 0) + 1);
    }
  }
  const chartable = [...counts.entries()].filter(([, n]) => n >= 2).map(([n]) => n).sort();
  const selected = chartable.includes(selectedName) ? selectedName : chartable[0];
  const unit = state.mesocycles[state.mesocycles.length - 1]?.unit ?? 'lb';
  const series = selected ? exerciseSeries(selected) : [];

  // all-time best set per exercise
  const best = new Map();
  for (const { meso, week, workout } of sessions) {
    if (week.isDeload) continue;
    for (const wex of workout.exercises) {
      for (const s of wex.sets) {
        const sc = setScore(wex, s);
        if (!sc) continue;
        const prev = best.get(wex.name);
        if (!prev || sc.value > prev.value) best.set(wex.name, { ...sc, mesoName: meso.name, week: week.index + 1 });
      }
    }
  }
  const prs = [...best.entries()].sort((a, b) => b[1].value - a[1].value);
  const recent = sessions.slice(-12).reverse();

  app.innerHTML = `
    <div class="page-head"><h1>History</h1>
      <p class="muted small" style="margin:6px 0 0">${sessions.length} sessions across ${state.mesocycles.length} ${state.mesocycles.length === 1 ? 'mesocycle' : 'mesocycles'}.</p>
    </div>

    ${selected ? `
    <div class="section" style="margin-top:10px">
      <h2>Progress</h2>
      <div class="card" data-testid="trend-card">
        <div class="row" style="margin-bottom:8px">
          <select class="field grow" id="trend-pick" data-testid="trend-pick" style="max-width:280px">
            ${chartable.map((n) => `<option ${n === selected ? 'selected' : ''}>${esc(n)}</option>`).join('')}
          </select>
        </div>
        ${trendChart(series, unit)}
        <p class="faint small" style="margin:6px 0 0">Best set per session — ${series[0]?.bw ? 'reps (bodyweight)' : 'estimated 1RM (Epley)'}. Deload weeks excluded.</p>
      </div>
    </div>` : ''}

    <div class="section">
      <h2>All-time best sets</h2>
      <div class="card scroll-x">
        <table class="data-table" data-testid="alltime-prs">
          <tr><th>Exercise</th><th class="r">Best set</th><th class="r">Score</th><th class="r">Meso</th></tr>
          ${prs.slice(0, 15).map(([name, p]) => `<tr>
            <td>${esc(name)}</td>
            <td class="r">${p.bw ? `BW × ${p.reps}` : `${fmtW(p.weight)} ${unit} × ${p.reps}`}</td>
            <td class="r"><b>${p.value}</b>${p.bw ? ' reps' : ''}</td>
            <td class="r">${esc(p.mesoName)} · W${p.week}</td>
          </tr>`).join('')}
        </table>
      </div>
    </div>

    <div class="section">
      <h2>Recent sessions</h2>
      <div class="card" style="padding:6px 16px" data-testid="recent-sessions">
        ${recent.map(({ meso, week, workout }) => `
          <a class="slot-row" href="#/meso/${meso.id}/w/${week.index}/${workout.dayIndex}">
            <div class="grow">
              <b class="small">${esc(workout.name)}</b>
              <div class="faint small">${esc(meso.name)} · Week ${week.index + 1}${week.isDeload ? ' · deload' : ''}</div>
            </div>
            <span class="faint small num">${workout.finishedAt ? new Date(workout.finishedAt).toLocaleDateString() : ''}</span>
            <span class="faint">›</span>
          </a>`).join('')}
      </div>
    </div>
  `;

  document.getElementById('trend-pick')?.addEventListener('change', (e) => renderHistory(e.target.value));
}

// ------------------------------ complete -------------------------------------

function renderComplete(meso) {
  app.innerHTML = `
    <div class="card hero" data-testid="meso-complete" style="text-align:center; padding:40px 24px">
      <p class="eyebrow">Mesocycle complete</p>
      <h1>${esc(meso.name)} — done.</h1>
      <p class="muted" style="max-width:440px; margin:12px auto 0">Deload finished, fatigue paid down. Start the
      next meso a touch below this one's peak volume and let the engine re-earn the climb. Keep what moved well;
      swap anything that argued with your joints.</p>
      <div class="row" style="justify-content:center; margin-top:22px">
        <a class="btn primary" href="#/new/from/${meso.id}" data-testid="continue-meso">Start the next block</a>
        <a class="btn" href="#/meso/${meso.id}/overview">Review results</a>
      </div>
    </div>`;
}

// ------------------------------ data menu ------------------------------------

document.getElementById('nav-data').addEventListener('click', () => {
  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" style="max-width:440px">
        <p class="eyebrow">Your data</p>
        <h2>Backup, restore, profile</h2>
        <p class="muted small" style="margin:8px 0 16px">Everything lives on this device — nothing is collected or
        sent anywhere. Export a JSON backup to move machines or keep history safe.</p>
        <div class="row">
          <button class="btn" id="do-export" data-testid="do-export">Export backup</button>
          <button class="btn" id="do-import">Import backup…</button>
          <button class="btn" id="do-profile" data-testid="do-profile">Training profile…</button>
          <span class="grow"></span>
          <button class="btn ghost" id="data-close">Close</button>
        </div>
        <p class="faint small" style="margin:14px 0 0">Hypertrophy Coach v0.2.0 · training guidance, not medical advice.</p>
      </div>
    </div>`;
  document.getElementById('data-close').onclick = () => { modalRoot.innerHTML = ''; };
  document.getElementById('do-profile').onclick = () => renderOnboarding(true);
  document.getElementById('do-export').onclick = () => {
    const blob = new Blob([exportJSON(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hypertrophy-coach-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    modalRoot.innerHTML = '';
    toast('Backup downloaded.');
  };
  document.getElementById('do-import').onclick = () => document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    state = parseImport(await file.text());
    state.settings = { onboarded: true, unit: 'lb', profile: { environment: 'gym', conditions: [] }, ...state.settings };
    persist();
    modalRoot.innerHTML = '';
    toast('Backup restored.');
    location.hash = '#/';
    route();
  } catch (err) {
    toast(err.message, 4500);
  }
  e.target.value = '';
});

// ----------------------------------------------------------------------------

route();
