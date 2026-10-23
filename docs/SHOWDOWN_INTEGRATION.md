# Showdown integration (phase 1)

- Package: pinned `@pkmn/sim@0.10.11` (MIT), from https://github.com/pkmn/ps.
- `src/battle/showdown.js`: 6v6 singles with Showdown's RandomPlayerAI for both sides.
- `tests/sim.test.js`: smoke test. Run `npm install && npm run test:sim`.
- Browser target: bundle the simulator rather than importing directly from a CDN; no browser build yet.
- **Not yet integrated**: GP/CA/PA-to-Showdown stat adapter, custom trainer AI, persistent HP/PP/status between KOF bouts, UI, battle log presentation.
- The current demo passes ordinary IV/EV values into Showdown solely for engine integration testing; this does **not** implement the agreed GP model.
- Test execution has not been verified in this environment; dependency download was unavailable.
