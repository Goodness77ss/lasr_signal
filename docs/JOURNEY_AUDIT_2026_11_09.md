# Journey repository audit and active goal

Inspected 9 November 2026 against `LAST_SIGNAL_JOURNEY_COMPLETE_DOCS_20261109_074727.zip`. All thirteen Markdown entries match the repository copies exactly before this continuation. Archive SHA256: `22A639E64F311CC883BBD33A736CC11257E87F58AA296D2AD0C26372DD773A0B`.

The owner requested reading the complete pack, checking the code and pursuing its objective. The active goal is the complete forty step Journey plan, preserving existing work. Historical design only notices do not cancel this instruction. The current repository is revision `f285d1a2a4e2f88ffa7c7f9b11b9aea3ad32c284` plus extensive existing uncommitted work; it is not a clean revision or a new project.

## What is present

| Area | Observed code and limits |
| --- | --- |
| Existing modes and Armory | Original local combat, Station Survival, gun collections, markets, funded survival and recovery code remain present. Their historical public receipts were not repeated in this audit. |
| Generated Journey | Seeded section generator, bounded section window, three flat regions and encounter conditions exist in `packages/sim/src/journey`. |
| Actors and combat | One leader and two helpers have individual rifle state, formation, perception, tactics, crouch and dodge. These are free starter actors, not seven collectible classes. |
| Transport and persistence | Separate strict Journey protocol, socket routes, service, SQLite snapshot, command and event journals, and migration 3 checkpoint source uniqueness exist. Tests exercise actual sockets and process crash recovery. |
| Browser | `journey.ts` runs browser local simulation. The separate durable service is tested, but this page is not yet its authoritative network client. Reload resets browser progress. |
| Grenades | Practice 0.9 has finite inventory, shared deterministic flight, wall shielding, friendly fire, observation filtering, AI hazards and original procedural rendering. This continuation checks the remaining lifecycle and browser gaps. |
| Later Journey ownership | No Journey soldier or supply contract, seven class roster, soldier XP journal, deployment lease, soldier sale or Journey funded reward bridge exists yet. Existing gun ownership is not evidence of these systems. |
| Height traversal | Current actors are grounded on a flat plane. Height aware shots and grenades are present; jumping and vaulting are not implemented. |

## Fresh evidence and corrections

Before edits, `npm run build` passed and `npx vitest run --maxWorkers=2 --testTimeout=30000` passed 281 tests across 50 files. These are fresh application checks. Existing chain proofs and old videos retain their historical dates.

Fixed patrol awareness clearing a committed grenade escape route before the guard knew an attacker. A new integrated test keeps the leader outside perception and proves five ticks of actual escape without creating a last known attacker position. Fixed practice 0.9 omitting the existing visible region surfaces and woodland foliage. Added read only grenade diagnostics for browser evidence. No dependency, contract manifest or live database was changed.

Additional recovery checks reject duplicate projectile identity, invalid owner or side, future birth, changed fuse, excessive travel, moving resting state, excess inventory and invalid cooldown. Existing lifecycle checks cover changed command retry, exactly one inventory charge, pause, disconnect and service recreation during the fuse, friendly fire and simultaneous leader and guard blast death without a checkpoint award.

Actual browser controls on practice 0.9 enabled the preview and accepted one throw. A paused snapshot at tick 27 contains one projectile, one throw event and one remaining grenade. After resume, tick 97 contains no projectile and exactly one explosion for the same identity, with inventory still one. Evidence: `docs/evidence/journey-grenade-browser.json`, `journey-grenade-live-fuse.png` and `journey-grenade-resolved.png`. The resolved screenshot shows the post explosion state, not a captured animation frame. This is automated local practice evidence, not multiplayer, a human playtest or a chain claim.

Final check results are recorded in `JOURNEY_IMPLEMENTATION_STATUS.md` after collection.

## Remaining execution order

1. Close Step 16 with its fresh regression and build results.
2. Step 17 includes full jumping and vaulting in the first prototype, explicitly selected by the owner in this chat on 9 November. Implement vertical position and velocity, grounded and landing state, ceiling and swept body collision, slope and step rules, shared traversal links, camera, shots, grenades and recovery. Preserve old pinned flat rules. Require a real obstacle course for player and enemies.
3. Steps 18 through 21 add seven complete class profiles, roster selection, authoritative participation and XP, practice drops and durable banking.
4. Steps 22 through 30 add asset adapters, separate local soldier ownership, expiring consented deployment locks, exact soldier sales, complete new weapon builds, finite supplies, progress bridge and weapon recovery. Use disposable local chains first.
5. Steps 31 through 35 assess funded custody, implement settlement recovery, connect the renderer to authority and extend the unified Armory, then prove gameplay to bank to progress to a second wallet trade.
6. Steps 36 through 40 require long and rendered performance evidence, human feedback, a separately gated public candidate, primary entry switch and a sanitized release with rollback.

Later decisions remain at their own dependency gates: final class tuning, mint source and supply, deployment lock consent and expiry, consumable redemption and unused stock, and funded budgets and banking policy. The jumping answer does not decide these policies. No real money, mainnet or paid services are authorised.

## Launch and rollback

From the `last_signal` repository, run `npm run journey:dev` and open `http://127.0.0.1:5180/?mode=journey`. Port 5180 was already serving this route during this audit and was reused. Ordinary launches leave the experimental Journey entry disabled. Preserve that flag boundary and the original mode routes until the release gates pass. See `JOURNEY_SERVICE.md` for the separate durable service launch.
