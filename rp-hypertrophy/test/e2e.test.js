// End-to-end browser test: drives the real UI through a full user journey —
// create a meso from a template, log week 1, answer feedback, verify week 2 is
// generated with progressed sets and calibrated weights.
//
// Run: npm i playwright (once), then `npm run test:e2e`.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4880;
const BASE = `http://localhost:${PORT}`;

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-e2e-'));
const server = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), RP_DATA_DIR: dataDir },
  stdio: 'inherit',
});

let failed = false;
const step = (msg) => console.log(`  ✓ ${msg}`);
function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

try {
  // wait for server
  for (let i = 0; i < 50; i++) {
    try { await fetch(`${BASE}/api/bootstrap`); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }

  // Use a system/pre-installed Chromium when Playwright's own download is absent.
  const sysChromium = ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser']
    .find((p) => fs.existsSync(p));
  const browser = await chromium.launch(
    process.env.PW_EXECUTABLE || sysChromium ? { executablePath: process.env.PW_EXECUTABLE || sysChromium } : {},
  );
  const page = await browser.newPage();
  page.on('pageerror', (e) => { throw e; });

  // --- dashboard: empty state ---
  await page.goto(BASE);
  await page.waitForSelector('[data-testid="empty-state"]');
  step('dashboard shows empty state');

  // --- builder: create from template ---
  await page.click('[data-testid="new-meso"]');
  await page.waitForSelector('[data-testid="template-full-body-3x"]');
  await page.click('[data-testid="template-full-body-3x"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="day-editor"]').length === 3);
  step('template loads 3 days into the builder');

  await page.fill('[data-testid="meso-name"]', 'E2E Meso');
  await page.selectOption('[data-testid="meso-weeks"]', '4');
  await page.click('[data-testid="create-meso"]');
  await page.waitForSelector('[data-testid="workout-title"]');
  const rir = await page.textContent('[data-testid="rir-chip"]');
  assert(rir.includes('2 RIR'), `week 1 of a 4-week meso should be 2 RIR, got "${rir}"`);
  step('mesocycle created; week 1 shows correct RIR target');

  // --- log all 3 workouts of week 1 with feedback ---
  const boot = await (await fetch(`${BASE}/api/bootstrap`)).json();
  const mesoId = boot.mesocycles[0].id;

  for (let day = 0; day < 3; day++) {
    await page.waitForSelector('[data-testid="workout-title"]');
    const nCards = await page.locator('[data-testid="exercise-card"]').count();
    assert(nCards >= 4, `workout should have several exercises, got ${nCards}`);

    // fill every set of every exercise
    for (let ei = 0; ei < nCards; ei++) {
      let si = 0;
      while (await page.locator(`[data-testid="weight-${ei}-${si}"]`).count()) {
        await page.fill(`[data-testid="weight-${ei}-${si}"]`, '100');
        await page.fill(`[data-testid="reps-${ei}-${si}"]`, '10');
        await page.check(`[data-testid="done-${ei}-${si}"]`);
        si++;
      }
      assert(si >= 1, 'exercise has at least one set');
    }

    // add + remove a set on the first exercise (manual set editing)
    if (day === 0) {
      const before = await page.locator('[data-testid^="weight-0-"]').count();
      await page.click('[data-testid="add-set-0"]');
      await page.waitForFunction((n) => document.querySelectorAll('[data-testid^="weight-0-"]').length === n + 1, before);
      await page.fill(`[data-testid="weight-0-${before}"]`, '100');
      await page.fill(`[data-testid="reps-0-${before}"]`, '10');
      await page.check(`[data-testid="done-0-${before}"]`);
      step('manually added a set mid-workout');
    }

    await page.click('[data-testid="finish-workout"]');
    await page.waitForSelector('[data-testid="feedback-modal"]');

    // answer all questions: never sore / no pump / easy → strong volume add signal
    const muscles = await page.$$eval('[data-testid^="fb-"][class="fb-muscle"]', (els) => els.map((e) => e.dataset.testid.slice(3)));
    for (const m of muscles) {
      await page.click(`[data-testid="fb-${m}-soreness-0"]`);
      await page.click(`[data-testid="fb-${m}-pump-0"]`);
      await page.click(`[data-testid="fb-${m}-workload-0"]`);
    }
    const disabled = await page.locator('[data-testid="fb-submit"]').isDisabled();
    assert(!disabled, 'submit enables once all questions are answered');
    await page.click('[data-testid="fb-submit"]');
    await page.waitForSelector('[data-testid="feedback-modal"]', { state: 'detached' });
    step(`day ${day + 1} logged with feedback`);
  }

  // --- week 2 must exist with progression applied ---
  const meso = await (await fetch(`${BASE}/api/mesocycles/${mesoId}`)).json();
  assert(meso.weeks.length === 2, `week 2 should be generated, have ${meso.weeks.length}`);
  assert(meso.weeks[1].rirTarget === 1, 'week 2 of a 4-week meso is 1 RIR');
  const v1 = meso.weeklyVolume[0];
  const v2 = meso.weeklyVolume[1];
  for (const m of Object.keys(v1)) {
    assert(v2[m] >= v1[m], `${m} volume should not shrink after easy feedback (${v1[m]} → ${v2[m]})`);
  }
  assert(Object.values(v2).some((sets, i) => sets > Object.values(v1)[i]), 'at least one muscle gained sets');
  const ex0 = meso.weeks[1].workouts[0].exercises[0];
  assert(ex0.targetWeight === 100, `calibration should set 100 as target, got ${ex0.targetWeight}`);
  assert(ex0.targetReps === 10, `calibration should set 10 reps target, got ${ex0.targetReps}`);
  step('week 2 auto-generated: sets progressed, weights calibrated, RIR dropped');

  // --- UI shows week 2 and the overview ---
  await page.goto(`${BASE}/#/meso/${mesoId}`);
  await page.waitForSelector('[data-testid="workout-title"]');
  const rir2 = await page.textContent('[data-testid="rir-chip"]');
  assert(rir2.includes('1 RIR'), `UI should show week 2 at 1 RIR, got "${rir2}"`);
  const placeholder = await page.getAttribute('[data-testid="weight-0-0"]', 'placeholder');
  assert(placeholder === '100', 'weight input placeholder shows the target weight');

  await page.click('[data-testid="to-overview"]');
  await page.waitForSelector('[data-testid="schedule-grid"]');
  const gridText = await page.textContent('[data-testid="schedule-grid"]');
  assert((gridText.match(/✓/g) || []).length === 3, 'schedule grid shows 3 completed workouts');
  await page.waitForSelector('[data-testid="volume-panel"]');
  step('overview shows schedule grid and volume panel');

  await browser.close();
  console.log('\nE2E: all steps passed ✅');
} catch (err) {
  failed = true;
  console.error('\nE2E FAILED ❌');
  console.error(err);
} finally {
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
