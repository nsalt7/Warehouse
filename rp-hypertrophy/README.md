# Hypertrophy Coach

A local-first hypertrophy training app with an original, evidence-based
progression engine. Plan a mesocycle, log your sets, answer a 20-second check-in,
and the engine decides next week's volume, loads, and — when needed — your deload.
Everything stays on your device.

**The engine's rule, in one line: performance drives volume up; how you feel can
only hold it or pull it back.** The full literature (volume dose-response,
RIR/failure proximity, autoregulation signals, deload research, load progression)
is cited inline in [`app/engine.js`](app/engine.js); design notes in
[PLAN.md](PLAN.md).

## Run it

Requires Node.js ≥ 18 (only to serve static files — there is no backend).

```sh
node server.js
# → http://localhost:4780
```

Data lives in your browser's localStorage. Use **Data → Export backup** for a
JSON file you can restore on any machine.

## Using it

0. **Onboard** — say where you train (**gym**, **calisthenics** bar park, or
   **home** with no equipment) and flag anything to train around (lower back,
   knees, shoulders, elbows/wrists). Templates auto-swap conflicting movements
   and pickers warn on them. Programming logic, not medical advice.
1. **Plan** — pick a coach-built template for your environment (14 across the
   three modes) or build custom days from a ~90-exercise library. Stretch-
   position exercises are flagged and listed first. In calisthenics/home mode,
   progression runs through **harder variations** (incline push-up → push-up →
   deficit → archer …) and rep climbs instead of plates — same engine, same
   evidence (progressive push-up training matched bench press for strength and
   thickness; citations in the engine). Log added vest weight on every set of a
   movement and it switches to load progression.
   Mid-meso you can **add or remove exercises** from any day (Edit day) —
   changes apply from the current session onward, history stays intact.
2. **Week 1 calibrates** — find working weights for the shown rep range at the
   target RIR. The engine adopts what you actually lift.
3. **Train and check in** — log weight × reps per set (one-tap logging adopts
   your targets), warm-up ramps and a plate calculator handle the bar math,
   the rest timer runs between sets (haptics + a local notification in the iOS
   app), and after each workout you answer three questions per muscle plus an
   optional joint-pain flag. Tap any exercise for its coach's cue, technique
   video search, pinned note, recent history, optional myo-rep/drop-set
   finisher, or an in-place swap.
4. **The engine programs next week** —
   - beat last week on a muscle's exercises → it earns a set (up to a per-muscle
     weekly ceiling and an 8-set per-session cap)
   - flat performance → volume holds; still sore / "too much" / joint pain →
     volume comes back down
   - top of the rep window on every set → the load goes up next week
   - RIR ramps 3 → 1 (isolation may hit failure in the last hard week)
5. **Deload** — the final week runs at half sets and −10% load automatically. If
   your performance regresses two weeks running across several muscles, the
   deload fires **early** — that's overreaching, and digging deeper doesn't grow.
6. **Review** — schedule grid, weekly sets per muscle vs landmarks, best-set
   e1RM table.

## Tests

```sh
npm test          # 20 unit tests covering every engine rule (no deps)
npm run test:e2e  # Playwright: a full mesocycle driven through the real UI
                  # (needs `npm i playwright` once)
```

## Roadmap

The app is deliberately a dependency-free static bundle (`app/`) with storage
behind a tiny interface (`app/store.js`), so packaging it as an iOS app is a
Capacitor/WKWebView wrap rather than a rewrite.
