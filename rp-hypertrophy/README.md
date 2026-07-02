# Hypertrophy Coach (local)

A local-first rebuild of the core features of the **RP Hypertrophy** app: mesocycle
planning, RIR-ramped workout logging, and RP-style autoregulation — your
soreness / pump / workload answers drive next week's set counts, and hitting rep
targets drives the weight progression. All data stays on your machine in a JSON file.

See [PLAN.md](PLAN.md) for the research summary and design.

## Run it

Requires Node.js ≥ 18. No dependencies to install.

```sh
node server.js
# → http://localhost:4780
```

Your training data is stored in `data/db.json` (gitignored). Back it up by copying the file.

## How to use it

1. **Create a mesocycle** — pick one of the built-in templates (Full Body, Upper/Lower,
   PPL, Glute Emphasis) or build your own: choose 4–6 weeks, training days, and
   exercises per day from the built-in library. Week 1 starts each muscle near its
   MEV (minimum effective volume).
2. **Week 1 is calibration** — find working weights you could lift for the shown rep
   range at the week's RIR target, and log weight × reps for each set.
3. **Finish each workout** and answer the questions per muscle (soreness since last
   session, pump, workload). When the week's last workout is done, next week is
   generated automatically:
   - recovering easily + weak pump → sets are added (capped at MRV)
   - barely recovering → sets hold
   - still sore / "too much" → sets are pulled back
   - hit all rep targets → weight goes up ~2.5% (rounded to 2.5)
   - RIR target drops each week (3 → 2 → 1 → 0)
4. **Deload** — the final week auto-generates with half the sets and light loads.
5. **Overview page** — week × day schedule grid and weekly sets per muscle vs
   MEV/MRV landmarks.

## Tests

```sh
npm test          # engine + API tests (node:test, no deps)
npm run test:e2e  # browser end-to-end test (needs `npm i playwright` once)
```
