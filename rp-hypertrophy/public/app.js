// Hypertrophy Coach (local) — vanilla JS SPA.

const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');
const toastEl = document.getElementById('toast');

let BOOT = null; // { exercises, templates, landmarks, muscles, scales, mesocycles }

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.add('hidden'), 3500);
}

// ---------- router ----------

async function route() {
  BOOT = await api('/api/bootstrap');
  const hash = location.hash || '#/';
  const m = hash.match(/^#\/meso\/([^/]+)(\/overview)?$/);
  try {
    if (hash === '#/' || hash === '') renderDashboard();
    else if (hash === '#/new') renderBuilder();
    else if (m) await renderMeso(m[1], Boolean(m[2]));
    else renderDashboard();
  } catch (err) {
    app.innerHTML = `<div class="card"><strong>Error:</strong> ${esc(err.message)}</div>`;
  }
}
window.addEventListener('hashchange', route);

// ---------- dashboard ----------

function renderDashboard() {
  const mesos = BOOT.mesocycles;
  app.innerHTML = `
    <h1>Mesocycles</h1>
    <p class="muted">Plan a mesocycle, log workouts, answer the recovery questions, and the app
    autoregulates next week's sets and weights.</p>
    ${mesos.length === 0 ? '<div class="card muted" data-testid="empty-state">No mesocycles yet — create your first one.</div>' : ''}
    ${mesos.map((m) => `
      <a class="card clickable" href="#/meso/${m.id}" data-testid="meso-card">
        <div class="row spread">
          <div>
            <strong>${esc(m.name)}</strong>
            <div class="muted small">${m.weeksTotal} weeks · ${m.daysPerWeek} days/week · ${m.unit}</div>
          </div>
          <div>
            ${m.status === 'complete'
              ? '<span class="chip done">Complete ✓</span>'
              : m.position
                ? `<span class="chip">Week ${m.position.weekIndex + 1}, Day ${m.position.dayIndex + 1}</span>`
                : ''}
          </div>
        </div>
      </a>`).join('')}
    <a class="btn primary" href="#/new" data-testid="new-meso">+ New Mesocycle</a>
  `;
}

// ---------- builder ----------

function renderBuilder() {
  const draft = { name: '', weeksTotal: 5, unit: 'lb', days: [{ name: 'Day 1', slots: [] }] };

  function render() {
    app.innerHTML = `
      <h1>New Mesocycle</h1>
      <h2>Start from a template</h2>
      <div class="template-grid">
        ${BOOT.templates.map((t) => `
          <div class="card clickable" data-template="${t.id}" data-testid="template-${t.id}">
            <strong>${esc(t.name)}</strong>
            <div class="muted small">${esc(t.description)}</div>
            <div class="small" style="margin-top:6px">${t.weeksTotal} weeks · ${t.days.length} days/week</div>
          </div>`).join('')}
      </div>
      <h2>Or build your own</h2>
      <div class="card">
        <div class="row" style="margin-bottom:12px">
          <input type="text" id="meso-name" class="grow" placeholder="Mesocycle name" value="${esc(draft.name)}" data-testid="meso-name">
          <select id="meso-weeks" data-testid="meso-weeks">
            ${[4, 5, 6].map((w) => `<option value="${w}" ${draft.weeksTotal === w ? 'selected' : ''}>${w} weeks (incl. deload)</option>`).join('')}
          </select>
          <select id="meso-unit">
            <option value="lb" ${draft.unit === 'lb' ? 'selected' : ''}>lb</option>
            <option value="kg" ${draft.unit === 'kg' ? 'selected' : ''}>kg</option>
          </select>
        </div>
        <div id="days"></div>
        <div class="row">
          <button class="btn" id="add-day" data-testid="add-day">+ Add day</button>
          <span class="grow"></span>
          <button class="btn primary" id="create" data-testid="create-meso">Create mesocycle</button>
        </div>
      </div>
    `;

    const daysEl = document.getElementById('days');
    daysEl.innerHTML = draft.days.map((d, di) => `
      <div class="day-editor" data-testid="day-editor">
        <div class="row spread" style="margin-bottom:6px">
          <input type="text" value="${esc(d.name)}" data-day-name="${di}" style="width:180px">
          <button class="btn small danger" data-del-day="${di}">Remove day</button>
        </div>
        ${d.slots.map((s, si) => {
          const ex = BOOT.exercises.find((e) => e.id === s.exerciseId);
          return `<div class="slot-row">
            <span class="chip muscle">${esc(ex.muscle)}</span>
            <span class="grow">${esc(ex.name)}</span>
            <button class="btn small danger" data-del-slot="${di}:${si}">×</button>
          </div>`;
        }).join('')}
        <div class="slot-row">
          <select data-muscle-pick="${di}" data-testid="muscle-pick-${di}">
            <option value="">Muscle…</option>
            ${BOOT.muscles.map((m) => `<option value="${m}">${cap(m)}</option>`).join('')}
          </select>
          <select data-ex-pick="${di}" data-testid="ex-pick-${di}" disabled><option value="">Exercise…</option></select>
          <button class="btn small" data-add-slot="${di}" data-testid="add-slot-${di}" disabled>Add</button>
        </div>
      </div>`).join('');

    document.querySelectorAll('[data-template]').forEach((el) => el.addEventListener('click', () => {
      const t = BOOT.templates.find((x) => x.id === el.dataset.template);
      draft.name = t.name;
      draft.weeksTotal = t.weeksTotal;
      draft.days = t.days.map((d) => ({ name: d.name, slots: d.slots.map((s) => ({ ...s })) }));
      render();
      toast(`Template loaded: ${t.name} — tweak it or hit Create`);
    }));

    document.getElementById('meso-name').addEventListener('input', (e) => { draft.name = e.target.value; });
    document.getElementById('meso-weeks').addEventListener('change', (e) => { draft.weeksTotal = Number(e.target.value); });
    document.getElementById('meso-unit').addEventListener('change', (e) => { draft.unit = e.target.value; });
    document.getElementById('add-day').addEventListener('click', () => {
      draft.days.push({ name: `Day ${draft.days.length + 1}`, slots: [] });
      render();
    });
    daysEl.querySelectorAll('[data-day-name]').forEach((el) => el.addEventListener('input', (e) => {
      draft.days[Number(el.dataset.dayName)].name = e.target.value;
    }));
    daysEl.querySelectorAll('[data-del-day]').forEach((el) => el.addEventListener('click', () => {
      draft.days.splice(Number(el.dataset.delDay), 1);
      render();
    }));
    daysEl.querySelectorAll('[data-del-slot]').forEach((el) => el.addEventListener('click', () => {
      const [di, si] = el.dataset.delSlot.split(':').map(Number);
      draft.days[di].slots.splice(si, 1);
      render();
    }));
    daysEl.querySelectorAll('[data-muscle-pick]').forEach((el) => el.addEventListener('change', () => {
      const di = Number(el.dataset.musclePick);
      const exSel = daysEl.querySelector(`[data-ex-pick="${di}"]`);
      const addBtn = daysEl.querySelector(`[data-add-slot="${di}"]`);
      const list = BOOT.exercises.filter((e) => e.muscle === el.value);
      exSel.innerHTML = '<option value="">Exercise…</option>' + list.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join('');
      exSel.disabled = list.length === 0;
      addBtn.disabled = true;
      exSel.addEventListener('change', () => { addBtn.disabled = !exSel.value; }, { once: false });
    }));
    daysEl.querySelectorAll('[data-add-slot]').forEach((el) => el.addEventListener('click', () => {
      const di = Number(el.dataset.addSlot);
      const exSel = daysEl.querySelector(`[data-ex-pick="${di}"]`);
      if (!exSel.value) return;
      draft.days[di].slots.push({ exerciseId: Number(exSel.value) });
      render();
    }));
    document.getElementById('create').addEventListener('click', async () => {
      try {
        const meso = await api('/api/mesocycles', { method: 'POST', body: draft });
        toast('Mesocycle created — week 1 is a calibration week, find your working weights');
        location.hash = `#/meso/${meso.id}`;
      } catch (err) {
        toast(`Error: ${err.message}`);
      }
    });
  }
  render();
}

// ---------- meso: workout + overview ----------

async function renderMeso(id, overview) {
  const meso = await api(`/api/mesocycles/${id}`);
  if (overview) return renderOverview(meso);
  const pos = meso.position;
  if (!pos) return renderComplete(meso);
  renderWorkout(meso, pos.weekIndex, pos.dayIndex);
}

function headerHtml(meso, week) {
  return `
    <div class="week-banner">
      <strong>${esc(meso.name)}</strong>
      <span class="chip">Week ${week.index + 1} of ${meso.weeksTotal}</span>
      ${week.isDeload
        ? '<span class="chip deload">DELOAD — take it easy</span>'
        : `<span class="chip rir" data-testid="rir-chip">${week.rirTarget} RIR target</span>`}
      <span class="grow"></span>
      <a class="btn small" href="#/meso/${meso.id}/overview" data-testid="to-overview">Overview</a>
      <a class="btn small" href="#/">All mesos</a>
    </div>`;
}

function renderWorkout(meso, weekIndex, dayIndex) {
  const week = meso.weeks[weekIndex];
  const workout = week.workouts[dayIndex];
  const isCalibration = weekIndex === 0;

  function targetLine(ex) {
    const unit = meso.unit;
    if (ex.targetWeight == null) {
      return isCalibration
        ? `Calibration: find a weight you could do ${ex.repRange[0]}–${ex.repRange[1]} reps with at ${week.rirTarget} RIR`
        : 'No data from last week — log what you can';
    }
    return `Target: ${ex.sets.length} × ${ex.targetWeight} ${unit} × ${ex.targetReps}+ reps @ ${week.rirTarget} RIR`;
  }

  app.innerHTML = `
    ${headerHtml(meso, week)}
    <h1 data-testid="workout-title">${esc(workout.name)}</h1>
    <p class="muted small">${workout.status === 'done' ? 'This workout is already logged.' : 'Log weight and reps, tick each set as you finish it.'}</p>
    ${workout.exercises.map((ex, ei) => `
      <div class="card exercise-card" data-testid="exercise-card">
        <div class="row spread">
          <h3>${esc(ex.name)}</h3>
          <span class="chip muscle">${esc(ex.muscle)}</span>
        </div>
        <div class="target-line">${targetLine(ex)}</div>
        <div data-sets="${ei}">
          ${ex.sets.map((s, si) => `
            <div class="set-row ${s.done ? 'done-row' : ''}">
              <span class="set-num">Set ${si + 1}</span>
              <input type="number" step="0.5" min="0" placeholder="${ex.targetWeight ?? 'wt'}" value="${s.weight ?? ''}"
                data-set="${ei}:${si}:weight" data-testid="weight-${ei}-${si}"> ${meso.unit}
              <input type="number" step="1" min="0" placeholder="${ex.targetReps ?? 'reps'}" value="${s.reps ?? ''}"
                data-set="${ei}:${si}:reps" data-testid="reps-${ei}-${si}"> reps
              <input type="checkbox" ${s.done ? 'checked' : ''} data-set="${ei}:${si}:done" data-testid="done-${ei}-${si}" title="Set done">
            </div>`).join('')}
        </div>
        <div class="row">
          <button class="btn small" data-add-set="${ei}" data-testid="add-set-${ei}">+ set</button>
          <button class="btn small" data-rm-set="${ei}" ${ex.sets.length <= 1 ? 'disabled' : ''}>− set</button>
        </div>
      </div>`).join('')}
    <div class="row">
      <button class="btn primary" id="finish" data-testid="finish-workout" ${workout.status === 'done' ? 'disabled' : ''}>
        ${workout.status === 'done' ? 'Workout logged ✓' : 'Finish workout'}
      </button>
    </div>
  `;

  let saveTimer = null;
  async function save(immediate = false) {
    clearTimeout(saveTimer);
    const doSave = async () => {
      await api(`/api/mesocycles/${meso.id}/workouts/${weekIndex}/${dayIndex}`, {
        method: 'PUT',
        body: { exercises: workout.exercises.map((ex) => ({ sets: ex.sets })) },
      });
    };
    if (immediate) return doSave();
    saveTimer = setTimeout(() => doSave().catch((e) => toast(`Save failed: ${e.message}`)), 350);
  }

  app.querySelectorAll('[data-set]').forEach((el) => {
    el.addEventListener('input', () => {
      const [ei, si, field] = el.dataset.set.split(':');
      const set = workout.exercises[Number(ei)].sets[Number(si)];
      if (field === 'done') set.done = el.checked;
      else set[field] = el.value === '' ? null : Number(el.value);
      save();
    });
  });
  app.querySelectorAll('[data-add-set]').forEach((el) => el.addEventListener('click', async () => {
    workout.exercises[Number(el.dataset.addSet)].sets.push({ weight: null, reps: null, done: false });
    await save(true);
    renderWorkout(meso, weekIndex, dayIndex);
  }));
  app.querySelectorAll('[data-rm-set]').forEach((el) => el.addEventListener('click', async () => {
    const sets = workout.exercises[Number(el.dataset.rmSet)].sets;
    if (sets.length > 1) sets.pop();
    await save(true);
    renderWorkout(meso, weekIndex, dayIndex);
  }));

  document.getElementById('finish').addEventListener('click', async () => {
    await save(true);
    openFeedbackModal(meso, weekIndex, dayIndex, workout);
  });
}

function openFeedbackModal(meso, weekIndex, dayIndex, workout) {
  const muscles = [...new Set(workout.exercises.map((e) => e.muscle))];
  const answers = {}; // muscle -> {soreness, pump, workload}
  const questions = [
    { key: 'soreness', label: 'How sore did this muscle get after its last session?', scale: BOOT.scales.soreness },
    { key: 'pump', label: 'How was the pump today?', scale: BOOT.scales.pump },
    { key: 'workload', label: 'How hard was today\'s work for this muscle?', scale: BOOT.scales.workload },
  ];

  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" data-testid="feedback-modal">
        <h2 style="margin-top:0">How did it go?</h2>
        <p class="muted small">Your answers drive next week's set counts (RP-style autoregulation).</p>
        ${muscles.map((m) => `
          <div class="fb-muscle" data-testid="fb-${m}">
            <strong>${cap(m)}</strong>
            ${questions.map((q) => `
              <div class="fb-question">
                <div class="small muted">${q.label}</div>
                <div class="fb-options">
                  ${q.scale.map((opt, i) => `<button data-fb="${m}:${q.key}:${i}" data-testid="fb-${m}-${q.key}-${i}">${esc(opt)}</button>`).join('')}
                </div>
              </div>`).join('')}
          </div>`).join('')}
        <div class="row" style="margin-top:16px">
          <button class="btn" id="fb-cancel">Cancel</button>
          <span class="grow"></span>
          <button class="btn primary" id="fb-submit" data-testid="fb-submit" disabled>Submit & finish</button>
        </div>
      </div>
    </div>`;

  const submitBtn = document.getElementById('fb-submit');
  function updateSubmit() {
    const complete = muscles.every((m) => answers[m] && ['soreness', 'pump', 'workload'].every((k) => answers[m][k] != null));
    submitBtn.disabled = !complete;
  }
  modalRoot.querySelectorAll('[data-fb]').forEach((el) => el.addEventListener('click', () => {
    const [m, key, i] = el.dataset.fb.split(':');
    (answers[m] ||= {})[key] = Number(i);
    modalRoot.querySelectorAll(`[data-fb^="${m}:${key}:"]`).forEach((b) => b.classList.remove('selected'));
    el.classList.add('selected');
    updateSubmit();
  }));
  document.getElementById('fb-cancel').addEventListener('click', () => { modalRoot.innerHTML = ''; });
  submitBtn.addEventListener('click', async () => {
    try {
      const res = await api(`/api/mesocycles/${meso.id}/workouts/${weekIndex}/${dayIndex}/finish`, {
        method: 'POST',
        body: { feedback: answers },
      });
      modalRoot.innerHTML = '';
      if (res.mesoComplete) toast('Mesocycle complete! 🎉');
      else if (res.weekGenerated) toast(`Week ${res.meso.weeks.length} generated from your feedback 💪`);
      else toast('Workout logged ✓');
      BOOT = await api('/api/bootstrap');
      await renderMeso(meso.id, false);
    } catch (err) {
      toast(`Error: ${err.message}`);
    }
  });
}

function renderOverview(meso) {
  const week = meso.weeks[meso.weeks.length - 1];
  const landmarks = BOOT.landmarks;
  const muscles = Object.keys(meso.weeklyVolume[meso.weeklyVolume.length - 1] || {});
  const pos = meso.position;

  app.innerHTML = `
    ${headerHtml(meso, week)}
    <h1>Overview</h1>
    <h2>Schedule</h2>
    <div class="card" style="overflow-x:auto">
      <table class="grid-table" data-testid="schedule-grid">
        <tr><th></th>${meso.days.map((d) => `<th>${esc(d.name)}</th>`).join('')}</tr>
        ${Array.from({ length: meso.weeksTotal }, (_, wi) => {
          const w = meso.weeks[wi];
          return `<tr>
            <th>W${wi + 1}${wi === meso.weeksTotal - 1 ? ' (deload)' : w ? ` · ${w.rirTarget} RIR` : ''}</th>
            ${meso.days.map((_, di) => {
              if (!w) return '<td class="cell-pending">—</td>';
              const wo = w.workouts[di];
              const isCurrent = pos && pos.weekIndex === wi && pos.dayIndex === di;
              return `<td class="${wo.status === 'done' ? 'cell-done' : 'cell-pending'} ${isCurrent ? 'cell-current' : ''}">
                ${wo.status === 'done' ? '✓' : (w ? `<a href="#/meso/${meso.id}" class="muted">·</a>` : '—')}
              </td>`;
            }).join('')}
          </tr>`;
        }).join('')}
      </table>
    </div>
    <h2>Weekly sets per muscle (latest week vs landmarks)</h2>
    <div class="card" data-testid="volume-panel">
      ${muscles.map((m) => {
        const sets = meso.weeklyVolume[meso.weeklyVolume.length - 1][m];
        const { mev, mrv } = landmarks[m] || { mev: 0, mrv: 20 };
        const pct = Math.min(100, (sets / mrv) * 100);
        return `<div class="vol-row">
          <span class="chip muscle">${esc(m)}</span>
          <div class="vol-bar-track"><div class="vol-bar ${week.isDeload ? 'deload' : ''}" style="width:${pct}%"></div></div>
          <span class="small muted">${sets} sets (MEV ${mev} / MRV ${mrv})</span>
        </div>`;
      }).join('')}
    </div>
    <h2>Volume by week</h2>
    <div class="card" style="overflow-x:auto">
      <table class="grid-table">
        <tr><th>Muscle</th>${meso.weeks.map((w) => `<th>W${w.index + 1}</th>`).join('')}</tr>
        ${muscles.map((m) => `<tr><th style="text-transform:capitalize">${esc(m)}</th>
          ${meso.weeks.map((w, wi) => `<td>${meso.weeklyVolume[wi][m] ?? 0}</td>`).join('')}</tr>`).join('')}
      </table>
    </div>
    <div class="row" style="margin-top:16px">
      <a class="btn primary" href="#/meso/${meso.id}" data-testid="back-to-workout">
        ${pos ? `Go to Week ${pos.weekIndex + 1}, Day ${pos.dayIndex + 1}` : 'Meso complete'}
      </a>
      <span class="grow"></span>
      <button class="btn danger" id="delete-meso">Delete mesocycle</button>
    </div>
  `;

  document.getElementById('delete-meso').addEventListener('click', async () => {
    if (!confirm(`Delete "${meso.name}" and all its logged data?`)) return;
    await api(`/api/mesocycles/${meso.id}`, { method: 'DELETE' });
    location.hash = '#/';
  });
}

function renderComplete(meso) {
  app.innerHTML = `
    ${headerHtml(meso, meso.weeks[meso.weeks.length - 1])}
    <div class="card" data-testid="meso-complete">
      <h1>Mesocycle complete 🎉</h1>
      <p class="muted">All ${meso.weeksTotal} weeks are logged, deload included. Take stock, then start the next meso —
      a good default is to carry over the exercises that gave you the best pumps and least joint pain.</p>
      <div class="row">
        <a class="btn primary" href="#/new">Start next mesocycle</a>
        <a class="btn" href="#/meso/${meso.id}/overview">View overview</a>
      </div>
    </div>
  `;
}

route();
