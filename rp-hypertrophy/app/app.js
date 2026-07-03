// Hypertrophy Coach — UI layer. All training logic lives in engine.js; all
// persistence in store.js. This file only renders state and routes events.

import {
  createMesocycle, finishWorkout, currentPosition, weeklySetsPerMuscle,
  e1rm, SORENESS, WORKLOAD, PUMP, JOINT_PAIN, REST_SECONDS,
} from './engine.js';
import { EXERCISES, MUSCLES, VOLUME_LANDMARKS, exercisesForMuscle, getExercise } from './exercises.js';
import { TEMPLATES } from './templates.js';
import { loadState, saveState, newId, exportJSON, parseImport } from './store.js';

const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');
const restRoot = document.getElementById('rest-root');
const toastEl = document.getElementById('toast');

let state = loadState();
const persist = () => saveState(state);
const getMeso = (id) => state.mesocycles.find((m) => m.id === id);

// ------------------------------- utilities ---------------------------------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtW = (w) => (w == null ? '—' : (Math.round(w * 100) / 100).toString());

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
      toast('Rest done — next set 💪', 2500);
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

function route() {
  stopRest();
  modalRoot.innerHTML = '';
  const hash = location.hash || '#/';
  const mWorkout = hash.match(/^#\/meso\/([^/]+)\/w\/(\d+)\/(\d+)$/);
  const mOverview = hash.match(/^#\/meso\/([^/]+)\/overview$/);
  const mMeso = hash.match(/^#\/meso\/([^/]+)$/);
  if (hash === '#/new') return renderBuilder();
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
            <rect x="2" y="12" width="4" height="8" rx="1.5" fill="#e5484d"/>
            <rect x="7" y="9" width="4" height="14" rx="1.5" fill="#e5484d"/>
            <rect x="12" y="14.5" width="8" height="3" rx="1.5" fill="#edeff3"/>
            <rect x="21" y="9" width="4" height="14" rx="1.5" fill="#e5484d"/>
            <rect x="26" y="12" width="4" height="8" rx="1.5" fill="#e5484d"/>
          </svg>
        </div>
        <h1>Train. Log. Grow.</h1>
        <p class="muted" style="margin:10px auto 0; max-width:420px">Plan a mesocycle, log your sets, and let an
        evidence-based engine decide next week's volume and loads.</p>
        <ul class="feature-list">
          <li>Volume rises only when your performance earns it</li>
          <li>Soreness and joint pain pull volume back before you dig a hole</li>
          <li>Deloads are scheduled — and triggered early if you're overreached</li>
        </ul>
        <div style="margin-top:24px">
          <a class="btn primary" href="#/new" data-testid="new-meso">Plan your first mesocycle</a>
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
        <span class="muted small">Next up: <b style="color:var(--ink)">${esc(workout.name)}</b> · ${meso.days.length} days/week · ${esc(meso.unit)}</span>
        <span class="btn primary sm">Continue →</span>
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
          <div class="faint small">${meso.weeksTotal} weeks · ${meso.days.length} days/week</div>
        </div>
        ${meso.status === 'complete'
          ? '<span class="chip good">Complete</span>'
          : `<span class="chip">W${pos.weekIndex + 1} · D${pos.dayIndex + 1}</span>`}
      </div>
    </a>`;
}

// ------------------------------- builder ------------------------------------

function renderBuilder() {
  const draft = { name: '', weeksTotal: 5, unit: state.settings.unit || 'lb', days: [{ name: 'Day 1', slots: [] }], templateId: null };

  function render() {
    app.innerHTML = `
      <div class="page-head">
        <p class="eyebrow">Plan</p>
        <h1>New mesocycle</h1>
      </div>

      <div class="section" style="margin-top:6px">
        <h2>Start from a program</h2>
        <p class="section-sub">Coach-built templates — pick one, then tweak anything below.</p>
        <div class="template-grid">
          ${TEMPLATES.map((t) => `
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
        <p class="section-sub">Sets per exercise are chosen by the engine — you pick the movements. Stretch-position exercises are listed first.</p>
        <div id="days"></div>
        <button class="btn sm" id="add-day" data-testid="add-day" style="margin-top:10px">+ Add a day</button>
      </div>

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
        ${d.slots.map((s, si) => {
          const exercise = getExercise(s.exerciseId);
          return `<div class="slot-row">
            <span class="chip muscle">${esc(exercise.muscle)}</span>
            <span class="grow">${esc(exercise.name)}${exercise.lengthened ? ' <span class="faint small">· stretch</span>' : ''}</span>
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

    const totalSlots = draft.days.reduce((a, d) => a + d.slots.length, 0);
    document.getElementById('builder-status').textContent =
      totalSlots === 0 ? 'Add at least one exercise per day' : `${draft.days.length} days · ${totalSlots} exercises`;

    // events
    document.querySelectorAll('[data-template]').forEach((el) => el.addEventListener('click', () => {
      const t = TEMPLATES.find((x) => x.id === el.dataset.template);
      draft.templateId = t.id;
      draft.name = draft.name || t.name;
      draft.weeksTotal = t.weeksTotal;
      draft.days = t.days.map((d) => ({ name: d.name, slots: d.slots.map((s) => ({ ...s })) }));
      render();
      document.getElementById('days').scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast(`Loaded “${t.name}” — adjust freely, then create`);
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
      const list = exercisesForMuscle(el.value);
      exSel.innerHTML = '<option value="">Exercise…</option>' +
        list.map((x) => `<option value="${x.id}">${esc(x.name)}${x.lengthened ? ' · stretch' : ''}</option>`).join('');
      exSel.disabled = list.length === 0;
      addBtn.disabled = true;
      exSel.onchange = () => { addBtn.disabled = !exSel.value; };
    }));
    daysEl.querySelectorAll('[data-add-slot]').forEach((el) => el.addEventListener('click', () => {
      const di = Number(el.dataset.addSlot);
      const exSel = daysEl.querySelector(`[data-ex-pick="${di}"]`);
      if (!exSel.value) return;
      draft.days[di].slots.push({ exerciseId: Number(exSel.value) });
      render();
    }));
    document.getElementById('create').addEventListener('click', () => {
      try {
        const meso = createMesocycle(draft, newId(state));
        meso.createdAt = new Date().toISOString();
        state.settings.unit = draft.unit;
        state.mesocycles.push(meso);
        persist();
        toast('Mesocycle created — week 1 calibrates your working weights');
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
    if (wex.targetWeight == null) {
      return `Find a weight for <b>${lo}–${hi} reps</b> leaving <b>${rir} in the tank</b>`;
    }
    return `<b>${wex.sets.length} × ${fmtW(wex.targetWeight)} ${meso.unit}</b> · ${lo}–${hi} reps · ${rir} RIR`;
  };

  app.innerHTML = `
    <div class="workout-head">
      <p class="eyebrow"><a href="#/meso/${meso.id}/overview" data-testid="to-overview">${esc(meso.name)} · overview</a></p>
      <h1 data-testid="workout-title">Week ${weekIndex + 1} · ${esc(workout.name)}</h1>
      <div class="chips">${headChips(meso, week)}
        ${done ? '<span class="chip good">Logged ✓</span>' : ''}
      </div>
      ${isCalibration ? `<div class="banner info"><span>🎯</span><span><strong>Calibration week.</strong>
        Work up to a weight you could lift for the shown reps with the target left in reserve. The engine
        takes it from there.</span></div>` : ''}
      ${week.isDeload ? `<div class="banner warn"><span>🌤️</span><span><strong>Deload.</strong> Half the sets,
        −10% load, everything easy. Recovery is the point — don't push these sets.</span></div>` : ''}
      ${meso.reactiveDeload && week.isDeload ? `<div class="banner warn"><span>📉</span><span>This deload fired
        <strong>early</strong>: your performance regressed two weeks running across several muscles — the
        validated sign of overreaching. Back off now, grow later.</span></div>` : ''}
    </div>

    ${workout.exercises.map((wex, ei) => `
      <div class="card ex-card" data-testid="exercise-card">
        <div class="ex-head">
          <div>
            <h3>${esc(wex.name)}</h3>
            <p class="ex-target">${targetLine(wex)}</p>
          </div>
          <span class="chip muscle">${esc(wex.muscle)}</span>
        </div>
        <table class="set-table">
          <thead><tr>
            <th>Set</th><th>${esc(meso.unit)}</th><th>Reps</th>${hasPrev ? '<th>Last</th>' : ''}<th></th>
          </tr></thead>
          <tbody>
            ${wex.sets.map((s, si) => `
              <tr class="${s.done ? 'done-row' : ''}">
                <td class="set-num num">${si + 1}</td>
                <td><input type="number" inputmode="decimal" step="0.5" min="0" class="field"
                  placeholder="${wex.targetWeight != null ? fmtW(wex.targetWeight) : '—'}"
                  value="${s.weight ?? ''}" data-set="${ei}:${si}:weight" data-testid="weight-${ei}-${si}"></td>
                <td><input type="number" inputmode="numeric" step="1" min="0" class="field"
                  placeholder="${wex.repRange[0]}–${wex.repRange[1]}"
                  value="${s.reps ?? ''}" data-set="${ei}:${si}:reps" data-testid="reps-${ei}-${si}"></td>
                ${hasPrev ? `<td class="set-last">${wex.prevSets?.[si] ? `${fmtW(wex.prevSets[si].weight)} × ${wex.prevSets[si].reps}` : '—'}</td>` : ''}
                <td><button class="logbtn ${s.done ? 'on' : ''}" data-log="${ei}:${si}" data-testid="done-${ei}-${si}" title="Log set">
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
      <button class="btn primary" id="finish" data-testid="finish-workout" ${done ? 'disabled' : ''}>
        ${done ? 'Workout logged ✓' : 'Finish workout'}
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
  document.getElementById('finish')?.addEventListener('click', () => {
    if (workout.status === 'done') return;
    stopRest();
    openFeedback(meso, weekIndex, dayIndex, workout);
  });
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
    const result = finishWorkout(meso, weekIndex, dayIndex, answers);
    persist();
    modalRoot.innerHTML = '';
    if (result.mesoComplete) toast('Mesocycle complete 🎉');
    else if (result.reactiveDeload) toast('Fatigue detected — an early deload was scheduled 📉', 5000);
    else if (result.weekGenerated) toast(`Week ${meso.weeks.length} is ready — built from your performance 💪`, 4200);
    else toast('Workout saved ✓');
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
          if (!s.done || s.weight == null || s.reps == null) continue;
          const score = e1rm(s.weight, s.reps);
          const prev = best.get(wex.name);
          if (!prev || score > prev.e1rm) best.set(wex.name, { e1rm: score, weight: s.weight, reps: s.reps, week: week.index + 1 });
        }
      }
    }
  }
  return [...best.entries()].sort((a, b) => b[1].e1rm - a[1].e1rm);
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
          ${pos ? `Week ${pos.weekIndex + 1} · Day ${pos.dayIndex + 1} →` : 'Complete ✓'}
        </a>
      </div>
      <div class="chips row" style="margin-top:8px">${headChips(meso, latest)}
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
            <span class="vol-label">${esc(m)}</span>
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
      <p class="section-sub">Estimated 1RM (Epley) from your logged sets — deload sets excluded.</p>
      <div class="card scroll-x">
        <table class="data-table" data-testid="pr-table">
          <tr><th>Exercise</th><th class="r">Best set</th><th class="r">est. 1RM</th><th class="r">Week</th></tr>
          ${prs.slice(0, 12).map(([name, p]) => `<tr>
            <td>${esc(name)}</td>
            <td class="r">${fmtW(p.weight)} ${meso.unit} × ${p.reps}</td>
            <td class="r"><b>${p.e1rm}</b></td>
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

// ------------------------------ complete -------------------------------------

function renderComplete(meso) {
  app.innerHTML = `
    <div class="card hero" data-testid="meso-complete" style="text-align:center; padding:40px 24px">
      <p class="eyebrow">Mesocycle complete</p>
      <h1>That's a wrap on ${esc(meso.name)} 🎉</h1>
      <p class="muted" style="max-width:440px; margin:12px auto 0">Deload done, fatigue paid off. Start the next
      meso a touch below this one's peak volume and let the engine re-earn the climb — keep the exercises that
      moved well and swap anything that bothered your joints.</p>
      <div class="row" style="justify-content:center; margin-top:22px">
        <a class="btn primary" href="#/new">Plan the next mesocycle</a>
        <a class="btn" href="#/meso/${meso.id}/overview">Review results</a>
      </div>
    </div>`;
}

// ------------------------------ data menu ------------------------------------

document.getElementById('nav-data').addEventListener('click', () => {
  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" style="max-width:420px">
        <p class="eyebrow">Your data</p>
        <h2>Backup & restore</h2>
        <p class="muted small" style="margin:8px 0 16px">Everything lives on this device. Export a JSON backup to
        move to another machine or keep your history safe.</p>
        <div class="row">
          <button class="btn" id="do-export" data-testid="do-export">Export backup</button>
          <button class="btn" id="do-import">Import backup…</button>
          <span class="grow"></span>
          <button class="btn ghost" id="data-close">Close</button>
        </div>
      </div>
    </div>`;
  document.getElementById('data-close').onclick = () => { modalRoot.innerHTML = ''; };
  document.getElementById('do-export').onclick = () => {
    const blob = new Blob([exportJSON(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hypertrophy-coach-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    modalRoot.innerHTML = '';
    toast('Backup downloaded');
  };
  document.getElementById('do-import').onclick = () => document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    state = parseImport(await file.text());
    persist();
    modalRoot.innerHTML = '';
    toast('Backup restored');
    location.hash = '#/';
    route();
  } catch (err) {
    toast(err.message, 4500);
  }
  e.target.value = '';
});

// ----------------------------------------------------------------------------

route();
