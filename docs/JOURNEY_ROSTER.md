# Journey roster and loadout management

Step 19 verified for local practice, 10 November 2026. The forty step goal remains active. Step 20 participation and experience journals is next.

The preparation screen offers three free rifle entitlements and seven clearly labelled local development profiles. Choose one leader and zero, one or two helpers. Each selection shows health, armour, role, signature weapon and finite supplies. Invalid selections retain the form for correction. Owned guns remain separate through the existing Armory link; Journey does not claim wallet ownership or offer a purchase during combat.

## Admission and pinned loadouts

Explicit practice 0.12 pins roster rules, catalogue revisions, actor identities, class and signature equipment in a canonical hashed snapshot. Default starter entry remains 0.10 and the earlier class drill remains 0.11. Optional helpers preserve stable actor IDs. The simulation, strict protocol and authoritative service reject missing leaders, duplicate soldiers, unsupported equipment, unavailable or stale catalogue entries and altered snapshot bindings.

The service checks catalogue availability again after asynchronous hashing and immediately before creating the durable run. Subsequent local catalogue changes cannot alter the accepted run or its recovered roster. Disabled and sold entries are injected catalogue fixtures in tests. These checks do not establish NFT ownership or actual sale eligibility; collectible adapters and deployment locks remain later steps.

Roster integration also exposed a prior class transition defect: portal validation capped all health at 100 and rejected a healthy Rook with 120 HP. It now uses each actor's pinned health limit, preserving the default 100 cap for legacy callers. The regression proves Rook can continue with health and roster intact.

## Actual verification

`npm run build` passed strict TypeScript and the production build. `npx vitest run --maxWorkers=2 --testTimeout=30000` passed 324 tests across 57 files. `git diff --check` passed. No dependency was added.

Resolver and integration cases cover empty, solo, gapped helper, starter and full class rosters; duplicates, stale revisions, disabled or sold entries, incompatible equipment, altered snapshots, catalogue races, continued sections and service recovery. Actual Fastify and WebSocket checks admitted Rook and Imani, rejected duplicate selection and a mismatched resume version, and replayed one shot without spending ammunition twice.

Actual local browser checks recovered from duplicate Rook selection, deployed Rook, Kestrel and Imani with their expected health, and deployed a leader without helpers. Evidence:

* `evidence/journey-roster-duplicate.png`
* `evidence/journey-roster-full-team.png`
* `evidence/journey-roster-solo.png`
* `evidence/journey-roster-browser.json`, captured read only from the actual solo canvas roster snapshot.

The browser page remains a local simulation that resets on reload. The durable authoritative service is verified separately through socket tests. Renderer and service integration remains Step 33. No NFT sale, chain read, public multiplayer, human playtest or banked experience is claimed.

Run `npm run journey:dev` from the repository and open `http://127.0.0.1:5180/?mode=journey`. Choose the squad, click DEPLOY SELECTED SQUAD, then RESUME.
