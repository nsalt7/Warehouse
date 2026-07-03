// End-to-end browser test: drives the real UI through a complete mesocycle —
// build a custom meso, log every week, answer check-ins, and verify the engine's
// decisions (calibration, earned volume, deload) through what the UI shows and
// what lands in localStorage.
//
// Run: npm i playwright (once), then `npm run test:e2e`.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4881;
const BASE = `http://localhost:${PORT}`;
const server = spawn(process.execPath, ['server.js'], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'inherit',
});

let failed = false;
const step = (msg) => console.log(`  ✓ ${msg}`);
function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

const readState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('hypertrophy-coach:v1')));

try {
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }

  const sysChromium = ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser']
    .find((p) => fs.existsSync(p));
  const browser = await chromium.launch(sysChromium ? { executablePath: sysChromium } : {});
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  page.on('pageerror', (e) => { throw e; });

  // ---- onboarding ----
  await page.goto(BASE);
  await page.waitForSelector('[data-testid="onboarding"]');
  await page.click('[data-testid="ob-env-gym"]');
  await page.click('[data-testid="ob-done"]');
  await page.waitForSelector('[data-testid="empty-state"]');
  step('onboarding: environment chosen, lands on empty dashboard');

  // ---- build a custom 4-week meso: 2 days, 1 exercise each ----
  await page.click('[data-testid="new-meso"]');
  await page.waitForSelector('[data-testid="meso-name"]');
  await page.fill('[data-testid="meso-name"]', 'E2E Meso');
  await page.click('[data-testid="meso-weeks"] [data-weeks="4"]');

  await page.selectOption('[data-testid="muscle-pick-0"]', 'chest');
  await page.selectOption('[data-testid="ex-pick-0"]', { label: 'Dumbbell Bench Press · stretch' });
  await page.click('[data-testid="add-slot-0"]');
  await page.click('[data-testid="add-day"]');
  await page.selectOption('[data-testid="muscle-pick-1"]', 'quads');
  await page.selectOption('[data-testid="ex-pick-1"]', { label: 'Back Squat · stretch' });
  await page.click('[data-testid="add-slot-1"]');

  // muscle focus panel: grow/maintain toggles per muscle in the plan
  await page.waitForSelector('[data-testid="focus-panel"]');
  await page.click('[data-testid="prio-chest-maintain"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="prio-chest-maintain"]').classList.contains('on'));
  await page.click('[data-testid="prio-chest-grow"]'); // back to grow for the rest of the flow
  step('muscle focus: grow/maintain toggles work in the builder');

  await page.click('[data-testid="create-meso"]');
  await page.waitForSelector('[data-testid="workout-title"]');
  step('custom mesocycle created via the builder');

  // ---- exercise detail sheet: coach cue + pinned note ----
  await page.click('[data-testid="ex-info-0"]');
  await page.waitForSelector('[data-testid="exercise-sheet"]');
  const cue = await page.textContent('[data-testid="coach-cue"]');
  assert(cue.length > 15, 'coach cue present');
  await page.fill('[data-testid="ex-note"]', 'Seat at 4, deep stretch');
  await page.click('[data-testid="ex-save"]');
  await page.waitForSelector('[data-testid="note-pin-0"]');
  const pin = await page.textContent('[data-testid="note-pin-0"]');
  assert(pin.includes('Seat at 4'), 'pinned note shows on the exercise card');
  step('exercise sheet: coach cue shown, note pinned to the card');

  const rir1 = await page.textContent('[data-testid="rir-chip"]');
  assert(rir1.includes('3 RIR'), `week 1 compounds at 3 RIR, got "${rir1}"`);

  // ---- helper: log the visible workout and submit the check-in ----
  async function logWorkout({ weight, reps, feedback = { soreness: 1, workload: 1, pump: 1 } }) {
    await page.waitForSelector('[data-testid="workout-title"]');
    const nEx = await page.locator('[data-testid="exercise-card"]').count();
    for (let ei = 0; ei < nEx; ei++) {
      let si = 0;
      while (await page.locator(`[data-testid="weight-${ei}-${si}"]`).count()) {
        await page.fill(`[data-testid="weight-${ei}-${si}"]`, String(weight));
        await page.fill(`[data-testid="reps-${ei}-${si}"]`, String(reps));
        await page.click(`[data-testid="done-${ei}-${si}"]`);
        si++;
      }
    }
    await page.click('[data-testid="finish-workout"]');
    await page.waitForSelector('[data-testid="feedback-modal"]');
    const muscles = await page.$$eval('.fb-muscle', (els) => els.map((e) => e.dataset.testid.slice(3)));
    for (const m of muscles) {
      await page.click(`[data-testid="fb-${m}-soreness-${feedback.soreness}"]`);
      await page.click(`[data-testid="fb-${m}-workload-${feedback.workload}"]`);
      await page.click(`[data-testid="fb-${m}-pump-${feedback.pump}"]`);
    }
    assert(!(await page.locator('[data-testid="fb-submit"]').isDisabled()), 'check-in submit enables');
    await page.click('[data-testid="fb-submit"]');
    await page.waitForSelector('[data-testid="feedback-modal"]', { state: 'detached' });
  }

  // ---- week 1 (calibration) ----
  // rest timer appears after logging a set, dismissible by tap
  await page.fill('[data-testid="weight-0-0"]', '100');
  await page.fill('[data-testid="reps-0-0"]', '10');
  await page.click('[data-testid="done-0-0"]');
  await page.waitForSelector('[data-testid="rest-timer"]');
  step('rest timer starts when a set is logged');
  await page.click('[data-testid="rest-timer"]');
  await page.waitForSelector('[data-testid="rest-timer"]', { state: 'detached' });

  // manual set add/remove
  const before = await page.locator('[data-testid^="weight-0-"]').count();
  await page.click('[data-testid="add-set-0"]');
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid^="weight-0-"]').length === n + 1, before);
  step('manually added a set mid-workout');

  // ---- mid-meso program editing ----
  await page.click('[data-testid="edit-program"]');
  await page.waitForSelector('[data-testid="program-editor"]');
  await page.selectOption('[data-testid="pe-muscle"]', 'biceps');
  await page.selectOption('[data-testid="pe-ex"]', { label: 'Incline Dumbbell Curl · stretch' });
  await page.click('[data-testid="pe-add"]');
  await page.waitForSelector('[data-testid="rm-ex-1"]');
  await page.click('[data-testid="pe-done"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="exercise-card"]').length === 2);
  let midState = await readState(page);
  const addedWex = midState.mesocycles[0].weeks[0].workouts[0].exercises[1];
  assert(addedWex.name === 'Incline Dumbbell Curl' && addedWex.sets.length === 2, 'added exercise enters at 2 sets');
  step('program editor: exercise added mid-meso at 2 calibration sets');

  await page.click('[data-testid="edit-program"]');
  await page.waitForSelector('[data-testid="program-editor"]');
  await page.click('[data-testid="rm-ex-1"]');
  await page.click('[data-testid="pe-done"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="exercise-card"]').length === 1);
  step('program editor: exercise removed again');

  await logWorkout({ weight: 100, reps: 10 });   // day 1
  await logWorkout({ weight: 100, reps: 10 });   // day 2 → week 2 generated

  let s = await readState(page);
  let meso = s.mesocycles[0];
  assert(meso.weeks.length === 2, 'week 2 generated');
  const w1chest = meso.weeks[0].workouts[0].exercises[0].sets.length;
  const w2chest = meso.weeks[1].workouts[0].exercises[0].sets.length;
  assert(w2chest === w1chest, `no comparison yet → volume holds (${w1chest} → ${w2chest})`);
  assert(meso.weeks[1].workouts[0].exercises[0].targetWeight === 100, 'calibration adopted 100 as the working weight');
  step('week 2: volume held (not yet earned), weights calibrated from week 1 logs');

  // UI shows the calibrated target and last-week reference
  await page.waitForSelector('[data-testid="workout-title"]');
  const rir2 = await page.textContent('[data-testid="rir-chip"]');
  assert(rir2.includes('2 RIR'), `week 2 compounds at 2 RIR, got "${rir2}"`);
  const ph = await page.getAttribute('[data-testid="weight-0-0"]', 'placeholder');
  assert(ph === '100', `weight placeholder shows target, got "${ph}"`);
  const lastCol = await page.textContent('.set-last');
  assert(lastCol.includes('100 × 10'), `last-week column shows prior set, got "${lastCol}"`);
  step('week 2 UI: RIR dropped, target + last-week reference visible');

  // ---- week 2: beat week 1 → volume is earned ----
  await logWorkout({ weight: 105, reps: 10 });
  await logWorkout({ weight: 105, reps: 10 });
  s = await readState(page);
  meso = s.mesocycles[0];
  assert(meso.weeks.length === 3, 'week 3 generated');
  const w3chest = meso.weeks[2].workouts[0].exercises[0].sets.length;
  assert(w3chest === w2chest + 1, `performance earned +1 set (${w2chest} → ${w3chest})`);
  assert(meso.weeks[1].perf.chest === 1 && meso.weeks[1].perf.quads === 1, 'perf recorded as +1');
  step('week 3: +1 set per muscle, earned by beating week 2');

  // ---- week 3 (last accumulation) ----
  await logWorkout({ weight: 105, reps: 10 });
  await logWorkout({ weight: 105, reps: 10 });
  s = await readState(page);
  meso = s.mesocycles[0];
  const deload = meso.weeks[3];
  assert(deload.isDeload, 'week 4 is the deload');
  const dChest = deload.workouts[0].exercises[0];
  assert(dChest.sets.length === Math.ceil(w3chest / 2), `deload halves sets (${w3chest} → ${dChest.sets.length})`);
  const w3target = meso.weeks[2].workouts[0].exercises[0].targetWeight;
  assert(dChest.targetWeight < w3target, `deload load cut (${w3target} → ${dChest.targetWeight})`);
  await page.waitForSelector('[data-testid="deload-chip"]');
  step('deload week generated: half sets, reduced load, UI flags it');

  // ---- overview mid-deload ----
  await page.click('[data-testid="to-overview"]');
  await page.waitForSelector('[data-testid="schedule-grid"]');
  const grid = await page.textContent('[data-testid="schedule-grid"]');
  assert((grid.match(/✓/g) || []).length === 6, 'schedule shows 6 done workouts');
  await page.waitForSelector('[data-testid="volume-panel"]');
  await page.waitForSelector('[data-testid="pr-table"]');
  const pr = await page.textContent('[data-testid="pr-table"]');
  assert(pr.includes('Dumbbell Bench Press') && pr.includes('140'), `PR table shows e1RM (105×10 → 140), got: ${pr.slice(0, 120)}`);
  step('overview: schedule grid, volume bars, and PR table all render');

  // delete flow opens a confirm and cancel keeps the meso
  await page.click('[data-testid="delete-meso"]');
  await page.waitForSelector('[data-testid="confirm-modal"]');
  await page.click('#cf-no');
  step('delete asks for confirmation; cancel is safe');

  // ---- finish the deload → meso completes ----
  await page.click('[data-testid="back-to-workout"]');
  await logWorkout({ weight: 90, reps: 5 });
  await logWorkout({ weight: 90, reps: 5 });
  await page.waitForSelector('[data-testid="meso-complete"]');
  s = await readState(page);
  assert(s.mesocycles[0].status === 'complete', 'meso marked complete in storage');
  step('deload finished → mesocycle complete screen');

  // ---- data survives reload; dashboard shows completed meso ----
  await page.goto(`${BASE}/#/`);
  await page.reload();
  await page.waitForSelector('[data-testid="meso-card"]');
  const card = await page.textContent('[data-testid="meso-card"]');
  assert(card.includes('E2E Meso') && card.includes('Complete'), 'dashboard lists the completed meso after reload');
  step('state persists across reload (localStorage)');

  // ---- history tab: trend chart, all-time PRs, recent sessions ----
  await page.click('[data-testid="nav-history"]');
  await page.waitForSelector('[data-testid="trend-card"]');
  const trendText = await page.textContent('[data-testid="trend-card"]');
  assert(trendText.includes('Dumbbell Bench Press') || trendText.includes('Back Squat'), 'trend chart shows a tracked exercise');
  assert((await page.locator('[data-testid="trend-card"] svg polyline').count()) === 1, 'trend renders a line');
  const allTime = await page.textContent('[data-testid="alltime-prs"]');
  assert(allTime.includes('Dumbbell Bench Press') && allTime.includes('E2E Meso'), 'all-time PRs span mesocycles');
  const recentRows = await page.locator('[data-testid="recent-sessions"] a').count();
  assert(recentRows >= 8, `recent sessions listed (${recentRows})`);
  step('history tab: trend chart, all-time bests, recent sessions');

  // ---- next-block continuity: restart just below the last peak ----
  await page.goto(`${BASE}/#/meso/${(await readState(page)).mesocycles[0].id}`);
  await page.waitForSelector('[data-testid="continue-meso"]');
  await page.click('[data-testid="continue-meso"]');
  await page.waitForSelector('[data-testid="continue-banner"]');
  await page.click('[data-testid="create-meso"]');
  await page.waitForSelector('[data-testid="workout-title"]');
  s = await readState(page);
  const nextMeso = s.mesocycles[1];
  assert(nextMeso.name.includes('next block'), 'continuation meso named after its source');
  // chest peaked at w3chest sets; the next block starts 2 below (floor 1/slot)
  const nextChest = nextMeso.weeks[0].workouts[0].exercises[0].sets.length;
  assert(nextChest === Math.max(1, w3chest - 2), `next block restarts below peak (${w3chest} → ${nextChest})`);
  assert(nextMeso.weeks[0].workouts[0].exercises[0].targetWeight === null, 'new block recalibrates weights');
  step('next block: program carried over, volume restarts below peak');

  // ---- profile conditions swap template movements ----
  await page.click('[data-testid="nav-data"]');
  await page.click('[data-testid="do-profile"]');
  await page.click('[data-testid="ob-cond-knee"]');
  await page.click('[data-testid="ob-done"]');
  await page.goto(`${BASE}/#/new`);
  await page.waitForSelector('[data-testid="template-full-body-3x"]');
  await page.click('[data-testid="template-full-body-3x"]');
  await page.waitForSelector('[data-testid="day-editor"]');
  const daysText = await page.textContent('#days');
  assert(!daysText.includes('Back Squat'), 'knee-stressing Back Squat was swapped out');
  assert(daysText.includes('Leg Press'), 'a knee-friendly alternative took its place');
  step('flagged knee issues auto-swap conflicting template movements');

  // ---- calisthenics environment filters templates and exercises ----
  await page.click('[data-testid="env-calisthenics"]');
  await page.waitForSelector('[data-testid="template-bar-park-full-body-3x"]');
  assert((await page.locator('[data-testid="template-full-body-3x"]').count()) === 0, 'gym templates hidden at the bar park');
  await page.selectOption('[data-testid="muscle-pick-0"]', 'chest');
  const chestOptions = await page.$$eval('[data-testid="ex-pick-0"] option', (els) => els.map((o) => o.textContent));
  assert(chestOptions.some((o) => o.includes('Push-Up')), 'bodyweight chest work offered');
  assert(!chestOptions.some((o) => o.includes('Barbell Bench Press')), 'no barbells at the bar park');
  step('calisthenics mode: templates and exercise picker filtered correctly');

  await browser.close();
  console.log('\nE2E: all steps passed ✅');
} catch (err) {
  failed = true;
  console.error('\nE2E FAILED ❌');
  console.error(err);
} finally {
  server.kill();
  process.exit(failed ? 1 : 0);
}
