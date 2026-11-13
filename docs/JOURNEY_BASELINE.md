# Journey baseline

Inspected 3 November 2026. Repository: `last_signal` inside the supplied pack. Both applicable AGENTS.md files were read before editing. There were 273 modified or untracked entries at the initial inspection. No reset, clean, commit or overwrite of another project was performed. A subsequent private worktree inventory is saved in `.runtime/journey/worktree-inventory.txt`; it includes the initial Journey slice and is not represented as a pristine baseline snapshot.

## Observed implementation

Node 24.16.0 and npm 11.13.0. Existing npm workspaces and package lock retained. TypeScript 7.0.2 with strict mode, Vite 8.3.5, Three 0.187.0, ethers 6.17.0 and Vitest 5.0.5 are the installed project versions. No dependency was added or upgraded.

`startup.ts` routes local Endless and Classic to `main.ts`, Station Survival to `stations.ts`, and private play to `private.ts`. The landing mode cards remain unchanged. Original Armory, testnet recovery, funded survival and weapon lab entries remain separate. The old simulation aggregates a squad at one position and uses a fixed 48 by 32 map. Its 1.5 render scale is presentation, not world streaming.

Existing public deployment manifest files are `apps/web/public/testnet-deployment.json`, `armory-deployment.json` and `survival-deployment.json`. Their existing chain configuration and collection identities are retained. No public RPC operation or transaction is part of this baseline pass. Disposable tests explicitly use chain 31337. Historical public evidence remains dated historical evidence.

## Actual fresh checks

| Command | Observed result |
| --- | --- |
| `npm run build` | Strict typecheck and production build pass before Journey edits |
| `npx vitest run --maxWorkers=2` | 25 files, 193 tests pass before Journey edits |
| `npm run armory:test` | Eight disposable local EVM cases pass, including original sales, failed delivery, gameplay recovery and restart |
| `npm run survival:weapons:test` | Seventeen disposable local EVM cases pass, including both collections, ownership, listing revisions, equipment and recovery |
| `node scripts/backup-database.mjs .runtime/rooms.sqlite` | Online SQLite backup, integrity check and restore pass |
| `node scripts/backup-database.mjs .runtime/survival-public.sqlite` | Online SQLite backup, integrity check and restore pass |
| `node --test scripts/backup-database.check.mjs` | Committed WAL backup and restoration case passes |

Private backup directories are `.runtime/backups/2026-11-03T115849.671Z-d46d4304-d9f1-4aa3-839f-78a95978d0bd` and `.runtime/backups/2026-11-03T115849.987Z-b37420f2-f66b-41ea-b169-b857d85c6185`. Their SQLite snapshots, restored copies and verification reports remain ignored. No database rows or session credentials were exported into publishable evidence.

The existing browser Endless route was opened and its actual local wave started successfully during inspection. Existing simulation regressions include deterministic full bot matches. Fresh original bot footage is `docs/evidence/journey-baseline-local-bot.webm`, captured through the existing recorder with its adjacent capture JSON. It records 20.0557 wall seconds of LOCAL PRACTICE COMBAT DRILL with no interruption. Chrome decoded it at 960 by 540 with ready state 4 and no media error. This is not a performance benchmark. A separate Journey local combat check is recorded in `tests/journey-encounter.test.ts`. None is multiplayer evidence.

Initial source revision was `f285d1a2a4e2f88ffa7c7f9b11b9aea3ad32c284` plus the existing uncommitted changes. Public manifest SHA256 values observed before editing their surroundings: armory `71D2075902D1BE92DE66476BE9DB04D57F24B03BF1E7B2FAD8C19BCFDD06D50D`; survival `2917688025420CB1665AA2D1DFDC18758BB1B6D1D344EE4D7E957AFB26CEDA39`; testnet `76C6C18DD67215621AA093AC367AF8F89E3992C222C872F6271115AB0C2B5E43`. No manifest was edited.

## Launch

Existing free practice service: `npm run server` with `SURVIVAL_STATIONS_V2=true` when Station Survival is required. Existing web: `npm run dev -w @last-signal/web -- --port 5174 --strictPort`. Loopback web and service were already listening at ports 5174 and 3001 during inspection. Their processes were not stopped or replaced.

Journey development: `npm run journey:dev`, then `http://127.0.0.1:5180/?mode=journey`. This dedicated launch selects Vite mode `journey`. Alternatively set `VITE_JOURNEY_ENABLED=true` explicitly for a chosen development or build command. Ordinary launches keep Journey entry disabled. The first slice is entirely browser local and does not use a server, wallet or blockchain.
