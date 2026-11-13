# Journey participation and cosmetic experience

Step 20 verified for the local durable journal, 10 November 2026. The full goal remains active. Step 21 practice drops and banking is next.

## Rules and admission

New roster practice 0.12 runs record their exact entry roster and attribution identities in the same transaction as run creation. Later roster insertion or replacement is rejected. Earlier runs remain supported without retroactively inventing participation.

Progression policy `journey-progress-1` is separate from the complete pinned simulation rules hash. Queries preserve both identifiers, so results from different simulation rules are not combined. Experience is cosmetic, with no combat bonus.

The reversible practice policy requires 20 contributing server ticks in a section. A contributing tick means actual living movement, or living presence within three metres of an objective while its verified hold progress increases. Commands, submitted destinations, idle time, paused simulation and client kill notifications do not create contribution. Counts saturate at 20. At verified completion, the member must still be alive and within ten metres of the leader. Each eligible member receives ten XP at most once for that run and checkpoint source.

Every experience row binds the run, unique checkpoint source, actor, immutable attribution identity, admitting account, policy and rules hash. Checkpoint history stores completed ordinals as exact decimal strings; distance never advances it. The account completion history remains separate from the member XP history. Totals use integer arithmetic and decimal strings.

## Durable boundaries

Migration 4 adds entry, participation, experience and account checkpoint tables. Tick or command updates commit these records with the run snapshot, event archive and acknowledgement. Revision checks prevent repeated ticks; unique keys prevent repeated awards. An XP write rejection rolls back the completion and checkpoint source too. No chain voucher is produced. Published progress is explicitly cosmetic and provisional until later bank policy is applied.

The anonymous practice service scopes free entitlements and local development identities to its authenticated run. It does not yet merge separate anonymous runs into a permanent player account. A trusted server admission interface can supply stable account and token identities, tested independently of ownership. The service protocol accepts neither account replacement nor token attribution from clients. Actual collectible inspection, authenticated account adapters, ownership transfer and deployment locks remain Steps 22 through 25. Seller and buyer attribution tests use trusted fixtures, not wallet transactions.

## Actual evidence

`npm run build` passed strict typecheck and production build. `npx vitest run --maxWorkers=2 --testTimeout=30000` passed 331 tests across 58 files. `git diff --check` passed.

Seven focused progression tests cover ordinary simulated combat through a completed checkpoint and reopening the database; bounded contribution; idle, brief, dead and distant members; late and absent roster members; stale ticks; duplicate sources; rejected XP writes; independent simultaneous runs; trusted seller versus buyer attribution; rules separation; command replay; and older untracked runs. Actual Fastify and WebSocket checks publish the selected roster's zero XP summary, reject a fabricated kill and XP action, and preserve progress on resume and shot replay. These socket checks do not claim a complete networked XP earning playthrough.

Run `npx tsx scripts/journey-progress-proof.ts` to reproduce the deterministic evidence. It uses ordinary simulation actions, without editing health, inventory, objective progress or rewards. Seed 5 reached its first checkpoint at tick 304, awarding ten XP to each starter. Replaying the same authoritative states into an independent journal and reopening the saved SQLite database yielded identical summaries. Output is `docs/evidence/journey-progress-proof.json`. The database is disposable and no wallet credentials are exported.

The browser remains a separate local simulation and does not display this durable XP journal yet. Renderer and service integration remains Step 33. Existing browser launch is `npm run journey:dev` at `http://127.0.0.1:5180/?mode=journey`. No public multiplayer, token transfer, onchain progress or human playtest is claimed.
