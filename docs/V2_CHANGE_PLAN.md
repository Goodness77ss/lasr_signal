# V2 implementation register

Step 5 update: new version 2.2.0 practice runs add the simulated station reward ledger. Existing run hashes and all uncommitted work remain preserved. The additive identity and station reward tables were preceded by the verified private backup at .runtime/backups/2026-11-01T203437.788Z-8cb0a5f6-d5da-454f-801e-8b406c8f45f0. Atomic per tick persistence replaces periodic checkpoints only for these new ledger runs. All 99 application tests and strict build pass. Actual browser capture and service restart proof are in STATION_REWARDS_V2.md. Steps 6 through 20 remain incomplete.

Inspected 1 November 2026. Baseline is `f285d1a` on `main`. The workspace root contains the repository at `last_signal` and the expansion at `../LAST_SIGNAL_SURVIVAL_EXPANSION/` relative to that repository. No rebuild or deployment is part of baseline inspection.

## Preserved owner work

At entry README.md, docs/DECISIONS.md, docs/FACTS.md and docs/STATUS.md were modified. UPDATES_SINCE_ORIGINAL_PACK.md and docs/V2_20_STEP_IMPLEMENTATION_PLAN.md were untracked. These changes remain in place. New progress is appended and does not erase earlier reports or evidence. No commit or reset was performed.

## Retain, change and defer

| System | Treatment |
| --- | --- |
| First person controls, rifle, carbine, helpers and procedural battlefield | Retain and reuse |
| Browser practice, training and Endless Front | Retain their current rules and explicit simulated labels |
| Private relay rooms and MatchEscrow | Preserve protocol, rule identity, deposits and refunds |
| Wallet login and authoritative salvage | Retain separate legacy mode and checkpoint verification |
| Standard gun shop, player exchange and GunArmory | Retain addresses, ABIs, IDs, prices and direct burn behavior |
| Main station survival | Add a separate versioned server practice mode before funding |
| Station rewards, supplies and missions | Add authoritative V2 ledgers with separate field credits and bounded reservations |
| V2 custody and welcome grant | Add companion contracts only after the practice loop gate |
| Result submission | Approved automatic timed worker submission, not a second player approval |
| Weapon catalog and history | Later optional steps; deployed GunArmory supports only kinds 0 and 1 |
| Functional upgrades, support gun and additional missions | Deferred behind core loop and recovery gates |
| Public hosting and browser wallet proof | Conditional on actual access and evidence |

## Source inspection

Read repository and expansion instructions, the 20 step plan, migration, configuration, station state, authority, ledger, treasury, lifecycle and build gates. Inspected shared simulation and protocol, salvage service, existing tests, all three Solidity sources, generated ABI identities and deployment manifests. The token exposes a public 100 tWIF hourly faucet and burn, with no owner issuance API. MatchEscrow and GunArmory have immutable currency and signer roles. The vault must be additive. Neither legacy shop burns nor seller proceeds fund V2 reserves.

## Credential and access register

| Access | Observed state | Remaining requirement |
| --- | --- | --- |
| Deployment role | Dedicated ignored Windows DPAPI file exists | Do not print or rotate it during inspection |
| Gameplay settlement signer | Separate ignored DPAPI file exists; service also supports protected mounted file | Preserve immutable deployed signer identity |
| Proof players | Two separate ignored encrypted role files exist | Not evidence of browser wallet signing |
| V2 transaction gas role | Not provisioned | A separate dedicated test gas role at worker implementation |
| Provider credential | Existing ignored environment may contain one | Never print full environment or copy into evidence |
| Public RPC | Fresh HTTP 200, chain ID 0xb626 and block 0x8be204e | Read access only; availability is not an uptime guarantee |
| Public hosting | No authorized deployment account established in this session | Free durable always available service, TLS and protected secrets |
| Browser wallet | No newly verified injected wallet access | Required later for actual browser transaction evidence |
| Extension and eligibility | Owner reports ten additional days | Exact announcement, closing timestamp and mock asset eligibility remain unverified |

Official RPC documentation confirms chain 46630 and warns that public endpoints are rate limited: [Robinhood connection guide](https://docs.robinhood.com/chain/connecting/). The current public endpoint was tested without a secret. Do not assume archive availability.

Hosting discovery started during Step 1. [Render free service documentation](https://render.com/docs/free) describes idle suspension and lost local files on restart. That free service cannot satisfy the current SQLite plus durable settlement worker design. A free static frontend does not provide the Node worker. No account was created, subscription purchased or deployment claimed. Local work continues.

## Database backup and migration procedure

Run `node scripts/backup-database.mjs` from this repository before any schema migration. It uses the [Node 24 SQLite online backup API](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html#sqlitebackupsourceDb-path-options), including committed WAL data. It never copies only the live main file. Snapshot and restored copy stay under ignored `.runtime/backups/`. They contain private sessions and authorizations and must not be published.

The fresh baseline backup at `.runtime/backups/2026-11-01T200244.175Z-ac0db041-2122-48f7-a72f-02a527513c6f/` passed integrity checks. Restore comparison verified schema and complete row digests for ten tables, then tested a writable transaction and rollback on the restored copy. Original live records were not migrated. This proves copy restoration, not an operational service recovery or chain reconciliation drill.

Before migration, stop new entry and gracefully stop the service, create another verified snapshot, retain the source revision and protected signer separately, then apply additive schema changes transactionally. Roll back only while no new financial actions exist; reconcile chain state before resuming. Never restore a private backup over the live database as a test.

## Fresh baseline checks

Node 24.16.0 and npm 11.13.0. Existing npm workspace and lockfile retained. No dependencies changed.

| Command | Fresh result |
| --- | --- |
| `npm test -- --maxWorkers=1 --testTimeout=20000` | PASS, 53 application tests |
| `npm run build` | PASS, strict TypeScript and Vite 8.3.5 production build |
| `npm run chain:test` | PASS, 26 disposable local EVM cases |
| `npm run armory:test` | PASS, six NFT contract cases and two salvage integration scenarios |
| `npm run testnet:test` | PASS, two local funded integration scenarios despite command name |
| `node scripts/backup-database.mjs` | PASS, snapshot integrity and restored copy |

Earlier public receipts and browser evidence remain historical. No public transaction, faucet request or new multiplayer proof was performed for Step 1.

## Step gates

Step 1 passed its inspection, fresh baseline, backup and access register checks. Step 2 passed eight focused rules cases and strict production build after correcting readonly test fixtures and a test import caught by TypeScript. Step 3 then passed seven station and server cases, actual browser capture and contest, and strict build. Full application regression passed 68 cases. The WAL backup fixture and dedicated secret scan also passed. See V2_ACCEPTANCE.md. Steps 4 through 20 remain incomplete. Automatic settlement remains approved design until vault and durable worker checks actually pass.

Step 3 migration creates only survival_practice_runs and survival_practice_commands when explicitly enabled. Legacy tables are untouched. Tokens are stored as hashes in practice checkpoints, while the browser keeps its opaque reconnect credential in its own session storage. Run and command checkpoints never create a chain claim. Practice stores every accepted command, explicit pause and disconnect immediately, with periodic gameplay checkpoints each second. Up to one second of combat progress can be lost on an abrupt crash. A later economic mode needs stronger atomic reward and order persistence before funding.

Step 4 passed twelve new director tests, all 80 application tests, strict build and actual browser assault review. No schema change was necessary. Rules survival-2.1.0 include the director, while survival-2.0.0 checkpoints stay supported unchanged. New assault and capture transitions save immediately. A fresh twelve table backup and copy restore passed at .runtime/backups/2026-11-01T202055.102Z-a061edc5-6301-43ae-89c1-38029dfe0378 before the work. ASSAULTS_V2.md records device evidence and the three enemy cap. Steps 5 through 20 remain incomplete.
