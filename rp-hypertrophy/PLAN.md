# Hypertrophy Coach — research & design

## Part 1: The market reference (RP Hypertrophy app)

The RP Hypertrophy app (Renaissance Periodization; App Store pricing as of
mid-2026: **$59.99/month or $499.99/year**) organizes training into 4–6 week
mesocycles plus a deload, prescribes Reps-In-Reserve (RIR) targets that ramp
toward failure, and autoregulates weekly set counts from post-workout questions
(soreness, pump, workload-as-volume) against per-muscle volume landmarks
(MEV/MAV/MRV). From its App Store screenshots, the paid feature set is: the
progression algorithm; 100+ templates (incl. athlete-designed and bodypart
specialization); 300+ exercises with grip/angle variants; 250+ technique videos
with per-exercise pinned notes and history; per-muscle grow/maintain selection;
muscle-group weekly-set stats; set types (regular/myorep/myorep-match); and
per-exercise joint-pain feedback. Our check-in questions turned out to mirror
theirs almost word-for-word, independently derived from the same literature.

Feature-gap status in this app: grow/maintain ✅ (evidence-based: Bickel 2011),
pinned notes ✅, per-exercise coach cues ✅ (our answer to technique videos),
exercise detail + history ✅, muscle weekly-set stats ✅, variant-rich library
partially (≈90 vs 300+), set types (myoreps etc.) not yet — deliberately, until
the evidence case is made.

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
7. **Three training environments, one engine.** Gym progresses load;
   calisthenics (bar park) and home (equipment-free) progress through harder
   variation chains and rep climbs — legitimate overload (Kotarsky 2018 JSCR;
   Calatayud 2015 JSCR; Kikuchi & Nakazato 2017; Plotkin 2022; Schoenfeld 2021
   low-load evidence). Logging external load (vest/belt) on all sets graduates
   a movement to weighted double progression.
8. **Profile-aware programming.** Onboarding captures training environment and
   musculoskeletal constraints (lower back / knee / shoulder / elbow-wrist).
   Exercises carry stress tags; templates auto-swap conflicts to same-muscle,
   same-environment alternatives and pickers warn inline. Framed as programming
   metadata, explicitly not medical advice.
9. **Mid-meso program edits.** Exercises can be added (enter at 2 calibration
   sets) or removed per day while a meso runs; week-over-week matching is by
   exercise identity, not slot position, so history and progression survive
   edits and variation swaps.

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

## Part 4: Release plan (v0.2 — iOS-ready release candidate)

**Packaging decision:** Capacitor. The app is dependency-free static files, so
Capacitor wraps it losslessly in a native WKWebView shell with a plugin bridge;
alternatives were considered and rejected for v1 (React Native/Expo = rewrite;
Tauri iOS = immature; PWA-only = no App Store). Capacitor 8 uses Swift Package
Manager, so there is no CocoaPods step. The `ios/` project is committed;
`npm run ios:sync && npm run ios:open` on a Mac is the whole build loop
(see RUNBOOK.md).

**User management decision:** none in v1, on purpose. Local-first storage
(localStorage + a native Preferences mirror inside the shell + JSON
backup/restore) means no accounts, no server, an all-green App Store privacy
label, and nothing to maintain. The documented upgrade path when multi-device
sync is demanded: CloudKit through a Capacitor plugin — Apple-native, free, and
avoids Sign-in-with-Apple obligations since there is no third-party login.

**Hardening shipped with this round:** slug-based exercise IDs (saved data
survives library edits — positional IDs were a data-corruption bug waiting to
ship), skip-workout flow, storage-failure warnings, native-storage restore
path, PWA manifest + generated icon set, accessibility labels on the logging
grid, and a ~160-exercise library (agent-drafted, test-validated).

Remaining before App Store submission (all user-side, see RUNBOOK.md): Apple
Developer enrollment, a Mac build + on-device QA pass, store listing assets,
and a final name check.

### Feature set beyond the core loop

- Rest timer with chime (2:30 compounds / 1:30 isolation — Schoenfeld 2016,
  Singer 2024), starts when a set is logged.
- "Last week" targets beside every set; one-tap set logging adopts the target.
- Joint-pain flag per exercise feeds the volume brake.
- Best-sets table (Epley e1RM) per exercise; weekly volume vs landmarks with
  tick marks; week × day schedule grid.
- JSON backup/restore for device migration.
