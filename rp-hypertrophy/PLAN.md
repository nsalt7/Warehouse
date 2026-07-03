# Hypertrophy Coach — research & design

## Part 1: The market reference (RP Hypertrophy app)

The RP Hypertrophy app (Renaissance Periodization, ~$35/month) organizes training
into 4–6 week mesocycles plus a deload, prescribes Reps-In-Reserve (RIR) targets
that ramp toward failure, and autoregulates weekly set counts from post-workout
questions (soreness, pump, workload) against per-muscle volume landmarks
(MEV/MAV/MRV). Its price is carried by three things: the progression algorithm,
~45 expert templates, and RP's brand/coaching content.

Sources: [RP Hypertrophy page](https://rpstrength.com/pages/hypertrophy-app),
[RP: Progressing for Hypertrophy](https://rpstrength.com/blogs/articles/progressing-for-hypertrophy),
[Dr. Muscle review](https://dr-muscle.com/rp-hypertrophy-app-review/).

## Part 2: Our algorithm — performance-first autoregulation

We did a literature review (five research threads: volume dose-response,
proximity to failure, autoregulation signals, deloads/periodization, load
progression) and designed an **original** engine rather than cloning RP's. Full
citations live as comments in `app/engine.js` — kept out of the UI on purpose.

**Design principle: objective performance is the accelerator; subjective
feedback is only a brake.** RP-style engines add sets when you report low
soreness and a weak pump. The evidence says soreness tracks damage/novelty
rather than growth (Damas 2016/2018) and the pump has mechanistic-only support
(Schoenfeld & Contreras 2014), while performance-based autoregulation beats
fixed prescriptions (Mann 2010 APRE; Helms 2018) and a sustained performance
decrement is the validated overreaching signal (Bell 2020; Meeusen 2013
ECSS/ACSM consensus). So here:

1. **Volume is earned.** Each week, per muscle: if ≥50% of its exercises beat
   last week's best set → +1 set (clamped to per-muscle ceilings from the
   dose-response literature); flat → hold (Enes 2024: unearned set inflation
   gives nothing); regression → −1; regression while sore/overworked → −2.
   Soreness, "too much" workload, and joint pain can only hold or cut volume.
2. **RIR ramps 3→1 for compounds; isolation may reach failure only in the final
   accumulation week** (Robinson 2024: closer to failure grows more; Refalo
   2023: actual failure costs 2–3× the fatigue for trivial extra growth).
3. **Double progression** per exercise: chase reps inside a 4-rep window; top of
   the window on all sets → smallest practical load jump (~2.5–5%), reset to the
   window bottom (Plotkin 2022: rep and load progression are equivalent). Two
   weeks below the window bottom → automatic 5% back-off.
4. **Deloads are hybrid**: scheduled as the final week (half sets, −10% load,
   4 RIR, frequency kept — Bell 2023/2024, Coleman 2024, Pancar 2026), and
   triggered **early** if performance regresses two consecutive weeks across 2+
   muscles.
5. **Per-session cap of 8 hard sets/muscle** (per-session stimulus saturates —
   Remmert 2025); indirect work counts 0.5 sets (Baz-Valle framework).
6. **Exercise library is stretch-biased**: lengthened-position variants are
   flagged and ranked first (Maeo 2021/2023; Pedrosa 2022; Kassiano 2023).

## Part 3: Architecture (built for the iOS future)

Fully client-side static app — no server logic, no build step, no dependencies:

```
rp-hypertrophy/
  server.js            # tiny static file server (dev convenience only)
  app/
    index.html         # shell
    style.css          # design system (dark, self-contained, responsive)
    app.js             # UI layer (vanilla JS, hash routing)
    engine.js          # THE algorithm — pure functions, citations in comments
    exercises.js       # ~75 exercises w/ type/region/stretch/indirect metadata
    templates.js       # 10 coach-built templates
    store.js           # localStorage persistence + JSON export/import
  test/engine.test.js  # 20 unit tests over every engine rule (node:test)
  test/e2e.test.js     # Playwright: full mesocycle through the real UI
```

Because everything is static files + localStorage behind a four-function storage
interface, an iOS build is a thin wrap (Capacitor/WKWebView) with native storage
swapped in — no rewrite. `node server.js` → http://localhost:4780 for desktop.

### Feature set beyond the core loop

- Rest timer with chime (2:30 compounds / 1:30 isolation — Schoenfeld 2016,
  Singer 2024), starts when a set is logged.
- "Last week" targets beside every set; one-tap set logging adopts the target.
- Joint-pain flag per exercise feeds the volume brake.
- Best-sets table (Epley e1RM) per exercise; weekly volume vs landmarks with
  tick marks; week × day schedule grid.
- JSON backup/restore for device migration.
