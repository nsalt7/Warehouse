# Runbook — things only you can do

Everything in this file needs either a Mac, an Apple account, or a business
decision. The repo side is done: the iOS project exists (`ios/`), icons are
generated, and `npm run ios:sync` copies the web app into it.

## 0. Quick QA on your iPhone (no Mac needed, do this first)

1. On your computer: `node server.js`
2. On your iPhone (same wifi): open `http://<computer-ip>:4780` in Safari
3. Share → **Add to Home Screen** → launches fullscreen with the app icon
4. Run a real session at the calisthenics park. Things worth kicking:
   - miss your last-week numbers on purpose → volume should hold, not climb
   - flag a joint mid-week → watch the brake
   - top a push-up rep window → next week should offer the harder variation

## 1. One-time Apple setup (~1 hour + up to 48h waiting)

1. **Apple Developer Program**: enroll at developer.apple.com — $99/year.
   Enrollment approval can take up to 48 hours.
2. **A Mac with Xcode 16+** (borrowed is fine; an M-series MacBook Air is plenty).
3. On the Mac: install Node 18+, clone the repo, then:
   ```sh
   cd rp-hypertrophy
   npm install
   npm run ios:sync     # copies app/ into the iOS project
   npm run ios:open     # opens Xcode (no CocoaPods needed — Capacitor 8 uses SPM)
   ```
4. In Xcode: select the **App** target → *Signing & Capabilities* → set your
   Team, keep bundle id `com.nathansalt.hypertrophycoach` (or change it —
   also change it in `capacitor.config.json` then re-run `ios:sync`).
5. Plug in your iPhone → press ▶. That's the app, native, on your phone.

## 2. TestFlight (when you want testers)

1. App Store Connect → *My Apps* → **+** → New App (name below, bundle id above).
2. Xcode: *Product → Archive* → *Distribute App → App Store Connect*.
3. In App Store Connect, add yourself + friends as internal testers.
4. Repeat archive/upload for each new build (`npm run ios:sync` first if the
   web app changed).

## 3. App Store release checklist

- **Name**: "Hypertrophy Coach" may collide with existing apps — check App
  Store Connect name availability early; have 2-3 backups. Do NOT use "RP",
  "Renaissance Periodization", or athlete names anywhere (trademarks).
- **Privacy**: the app collects nothing and has no network calls — the privacy
  "nutrition label" is all *Data Not Collected*, and no privacy-policy server
  is strictly required, but App Store review likes a URL: a one-page static
  site ("all data stays on your device") is enough.
- **Health disclaimer**: review sometimes flags fitness apps — the onboarding
  already carries the "not medical advice" line; keep it.
- **Screenshots**: 6.9" and 6.5" iPhone sizes required. Run the app in the
  Xcode simulator and screenshot the workout, check-in, overview, and history
  screens (the dark-mode variants look best on the store).
- **Age rating**: 4+. **Category**: Health & Fitness.
- **Pricing**: free while you dogfood. If you later charge, competitor
  anchoring is $59.99/mo — a one-time price or cheap subscription undercuts
  hard. In-app purchases would need StoreKit wiring (a future code round).

## 4. Decisions parked (deliberately)

- **Accounts/sync**: v1 is local-first with JSON backup/restore — no accounts,
  no server, nothing to breach. When multi-device sync matters, the clean path
  is **CloudKit** via a Capacitor plugin (Apple-native, free, no Sign-in-with-
  Apple obligations because there's no third-party login). Revisit only when
  users ask for it.
- ~~Haptics/notifications~~ **shipped**: set-logging taps and rest-timer
  completion use native haptics, and the rest timer schedules a local
  notification so it fires even with the phone locked (iOS will ask for
  notification permission the first time a rest starts).
- **Set types (myoreps/drop sets)**: parked pending evidence review (they
  mainly save time at equal growth).

## 5. Routine: shipping an update

```sh
# after any change to app/ on any machine:
npm test && npm run test:e2e   # engine + browser suites
# on the Mac:
npm run ios:sync && npm run ios:open   # then Archive → upload
```
