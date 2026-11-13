# Endless Journey technical implementation plan

Status: design only. No implementation is authorised by this file. All proposed steps below are NOT STARTED until their exit checks have actual evidence.

Prepared: 3 November 2026.

Repository: `C:/Users/DELL/Documents/LAST_SIGNAL_CODEX_PACK/last_signal`.

Owner direction: build a working checkpoint journey prototype, retain an effectively endless route, add regions with gameplay effects, responsive enemies, grenades, seven soldier archetypes, soldier ownership and experience based trading, more guns and supplies, battlefield gun pickups and eligible high rank enemy WIF drops. Preserve the existing NFT marketplace integration. The owner has requested detailed Markdown planning before coding.

This plan expands [the design pack](JOURNEY_DESIGN_INDEX.md). It does not replace historical implementation and evidence documents. It does not mean the soldier collection, new weapons, journey world or reward claims already exist.

## How to execute this document

1. Complete the steps in dependency order. Do not mark a later system implemented because an earlier mockup mentions it.
2. For each step, create a small reviewable change, run its focused checks and record the actual result.
3. Record design decisions separately from implementation evidence. A proposed number is not an approved production rule.
4. Keep existing uncommitted work and saved state. No reset, clean, overwrite of older projects or unrequested commit.
5. Do not start public chain work until gameplay and disposable local chain proof work.
6. Do not migrate a live run to a different simulation, world generator or reward policy in place.
7. If an exit check fails, fix it before building dependent features. Independent documentation or asset work may continue.
8. Use local practice, local blockchain, public testnet and deployed multiplayer as distinct environment labels.

## Contents

- [A. Current repository and constraints](#a-current-repository-and-constraints)
- [B. Proposed architecture](#b-proposed-architecture)
- [C. Rules that must remain true](#c-rules-that-must-remain-true)
- [D. Detailed implementation sequence](#d-detailed-implementation-sequence)
- [E. Data and message contracts](#e-data-and-message-contracts)
- [F. Verification and release](#f-verification-and-release)
- [G. Owner input and completion records](#g-owner-input-and-completion-records)

## A. Current repository and constraints

### A1. Stack observed during this documentation task

These are observed versions, not a request to upgrade them:

| Component | Observed version or implementation |
| --- | --- |
| Runtime | Node v24.16.0 |
| Package manager | npm 11.13.0, existing npm workspaces |
| TypeScript | 7.0.2, strict mode in the repository |
| Frontend | Vite 8.3.5 |
| Renderer | Three 0.187.0 |
| Wallet client | ethers 6.17.0 |
| Application tests | Vitest 5.0.5 |
| Server | Existing Fastify application with WebSockets |
| Durable storage | Existing node:sqlite DatabaseSync storage |
| Contracts | Solidity compiler package 0.8.38 |
| Contract library | OpenZeppelin contracts 5.6.1 |
| Local chain tooling | Hardhat 3.21.2 and existing tsx contract checks |

Reuse the lockfile. If a new dependency becomes necessary, inspect current official documentation and record the exact version and reason at implementation is everythitime. This documentation task adds no dependency.

### A2. Existing files to build from

| Existing area | Current files | Intended treatment |
| --- | --- | --- |
| Mode selection | `apps/web/src/startup.ts`, `landing.ts`, `landing.css` | Keep mode selection; route Endless to Journey only after its playable gate |
| Original local game | `apps/web/src/main.ts` | Preserve existing local Endless and Classic as fallback paths during development |
| Shared simulation | `packages/sim/src/index.ts`, `rules.ts` | Reuse combat concepts; introduce explicit Journey world and entity interfaces |
| Station practice | `apps/server/src/survival.ts`, `packages/sim/src/survival.ts` | Reuse lifecycle and service patterns; do not silently convert Station Survival into Journey |
| Existing enemy logic | `botCommands` in simulation and `assault-director.ts` | Existing focus, cover, evasion and assault logic are real starting points, not absent features |
| Transport | `packages/protocol/src/index.ts`, `apps/server/src/app.ts` | Add a separate strict Journey protocol and route |
| Rendering | `scene.ts`, `old-front.ts`, `soldier.ts`, `field-camera.ts`, `combat-fx.ts` | Extract reusable builders and preserve existing renderer behaviour through adapters |
| Player controls | `main.ts`, `stations.ts`, `station-presentation.ts`, `field-camera.ts` | Preserve independent look and movement; wire new commands through one Journey input layer |
| Practice accounting | `run-economy.ts`, `run-lifecycle.ts`, server reward and reservation stores | Reuse durable transaction patterns; version new Journey policy explicitly |
| Funded custody | Existing treasury, vault, settlement worker and transport modules | Preserve deployed rules; evaluate compatibility before any new funded integration |
| Armory | `armory-hub.ts`, `weapons-module.ts`, `armory-module.ts`, `testnet-module.ts` | Add catalogue adapters; preserve original gun and recovery routes |
| Weapon services | `weapon-catalog.ts`, `weapon-collections.ts`, `weapon-recovery.ts` | Reuse verification patterns; separate new asset identities from existing gun collections |
| Existing contracts | GunArmory, SurvivalGunCollection, TestWIF and existing custody contracts | Do not mutate deployed metadata, reinterpret token IDs or replace addresses |

### A3. Constraints that make this more than a map reskin

1. The existing authoritative `Squad` contains one position, health value, weapon and member count. Three rendered figures are not three independent NFT soldiers. Individual soldier ownership needs real individual actor state.
2. The current map uses a fixed 48 by 32 logical area. Its recent 1.5 horizontal rendering scale makes a wider presentation; it does not provide infinite sections or independent terrain data.
3. `parseClient` currently validates move targets against fixed bounds and limits client packets to 2048 bytes. Globally widening this parser would change existing modes and attack surfaces.
4. Collision and navigation use authored global map geometry. A streamed world needs a world interface passed into these systems rather than mutating the global map while another room uses it.
5. Rifle shots are currently resolved as hitscan. An enemy cannot dodge a bullet after that hit has already been resolved. Anticipatory movement and reaction to a missed or completed shot must be distinct.
6. Current validated weapon classes are rifle, carbine and shotgun, with actual network availability varying by collection. New soldier classes, marksman rifles, support guns and supplies do not become supported through new UI cards alone.
7. Existing signed rules and contract deployments must retain their meaning. Journey must have new versioned rules and capability declarations.
8. Latest recorded application verification before this planning task was 193 passing checks. That is historical evidence, not a new test run for this document.

## B. Proposed architecture

### B1. Authoritative boundary

The browser sends intentions. The server decides movement, collision, damage, grenade outcomes, pickups, checkpoint completion, experience and reward eligibility. The browser renders approved state and may interpolate between snapshots. It must not submit an amount of earned WIF or experience and have the server accept it.

The chain decides collectible ownership, supported transfers, payment, token quantities and claim replay prevention. It does not pretend to verify the entire battle. Any gameplay signer remains an explicit trust boundary.

### B2. Proposed module layout

All names in this table are future targets. They are not claims that these files already exist.

| Proposed module | Responsibility |
| --- | --- |
| `packages/sim/src/journey/types.ts` | Run, actor, section, checkpoint and event types |
| `packages/sim/src/journey/rules.ts` | Pinned rules, budgets, capacities and version |
| `packages/sim/src/journey/world.ts` | World queries and coordinate conventions |
| `packages/sim/src/journey/generator.ts` | Seeded section construction and validation |
| `packages/sim/src/journey/navigation.ts` | Per section walkability and portal navigation |
| `packages/sim/src/journey/actors.ts` | Individual soldiers, equipment and formations |
| `packages/sim/src/journey/awareness.ts` | Perception, suspicion and threat memory |
| `packages/sim/src/journey/tactics.ts` | Role decisions, cover, flank and retreat |
| `packages/sim/src/journey/combat.ts` | Weapon resolution and target shapes |
| `packages/sim/src/journey/grenades.ts` | Throws, fuse simulation and explosions |
| `packages/sim/src/journey/checkpoints.ts` | Encounter conditions and completion |
| `packages/sim/src/journey/progression.ts` | Participation, experience and rank |
| `packages/sim/src/journey/loot.ts` | Pickups, enemy drops and provenance |
| `packages/sim/src/journey/lifecycle.ts` | Start, bank, quit, death and disconnect |
| `packages/protocol/src/journey.ts` | Strict Journey messages and validation |
| `apps/server/src/journey-service.ts` | Connections, command ownership and ticking |
| `apps/server/src/journey-store.ts` | Migrations, snapshots, journals and recovery |
| `apps/server/src/journey-assets.ts` | Verified ownership and deployment entitlements |
| `apps/server/src/journey-rewards.ts` | Reward reservations and bank outbox |
| `apps/web/src/journey.ts` | Journey client controller and reconnect |
| `apps/web/src/journey-scene.ts` | Streamed scene adapter using original builders |
| `apps/web/src/journey-input.ts` | Keyboard, pointer and touch commands |
| `apps/web/src/journey-hud.ts` | Route, squad, inventory and banking UI |
| `packages/chain/src/journey-assets.ts` | Asset identity, domain and voucher helpers |
| `packages/contracts/src/JourneySoldiers.sol` | Proposed separate soldier NFT collection |
| `packages/contracts/src/JourneySupplies.sol` | Proposed finite quantity collectible supplies |
| `packages/contracts/src/JourneyWeapons.sol` | Proposed additional supported gun classes |

Do not automatically create every file in one commit. Introduce modules when their step needs them. The new simulation can reuse pure utilities from the old one; avoid copying the entire application into a second unrelated project.

### B3. Prototype boundaries

Recommended starting targets, subject to product and performance review:

- Three region families: ruined outskirts, wet woodland and rocky highlands.
- Seven soldier archetypes, with multiple possible token instances per archetype.
- One free starter squad. Exact initial size and active roster cap require approval.
- One controllable leader and individually simulated helpers as the first control model.
- Three encounter templates before increasing variety.
- One grenade type first.
- Crouch and a limited dodge before true jumping and vaulting.
- At most three nearby sections rendered during the first streaming prototype.
- A bounded enemy population, with difficulty increasing through tactics and combinations.
- Practice first, disposable local chain next, funded public testnet only after separate gates.

Infinite means sections can continue to be generated. It does not mean infinite active geometry, infinite enemies, unlimited numerical precision or an unlimited token treasury.

## C. Rules that must remain true

1. Asset identity is `(chainId, collection, tokenId)`, never token ID alone.
2. A free starter entitlement is not a sellable NFT.
3. Owning an NFT in the background does not earn experience unless that soldier actually participates in the run.
4. One soldier cannot be deployed into two active runs simultaneously.
5. Transfer or sale removes the previous owner's deployment rights.
6. Selling a soldier must not silently transfer a separately owned gun.
7. No command grants arbitrary health, experience, rank, inventory, checkpoint number or reward amount.
8. A checkpoint, drop, consumption, progress voucher or claim can take effect at most once.
9. Round earnings, owned supplies, previously claimed tokens and previously owned NFTs are separate ledgers.
10. Quitting forfeits new unbanked rewards and provisional loot according to the approved policy. It does not silently burn previously owned NFTs or wallet deposits.
11. An infinite journey cannot promise unbacked wallet claims.
12. No wallet transaction interrupts every shot, footstep or grenade throw.
13. A failed payment or NFT delivery cannot leave a partially completed sale.
14. A regenerated section cannot respawn a previously consumed reward source.
15. Every collision query, shot and terrain effect uses the same pinned world definition.
16. Recovery never changes an old run to the newest rules behind the player's back.
17. Practice counters never appear as chain read balances.
18. Existing gun collections, metadata and recovery keys retain their current meaning.

## D. Detailed implementation sequence

### Step 01. Freeze the product decisions and acceptance scenario

Purpose: avoid implementing mutually incompatible ideas about soldiers, death and rewards.

Actions:

1. Review the questions in JOURNEY_PRODUCT_BRIEF.md with the owner.
2. Record starter squad size, maximum active soldiers, leader death behaviour, replacement policy and whether extra squads are independently controllable.
3. Confirm that soldier ownership survives death and quit, unless the owner explicitly chooses a different asset loss policy after seeing its consequences.
4. Confirm that seven means seven archetypes, not seven total minted soldiers.
5. Choose whether XP yields cosmetic rank, bounded stat changes or role unlocks. Write maximum benefits.
6. Decide whether a signature gun is a default gameplay loadout or a separately transferable NFT. Recommended: default loadout plus separately owned collectible equipment.
7. Choose practice, local chain and public testnet demonstration boundaries. Decide bank timing and reward loss rules separately for each.
8. Define a complete demonstration: select roster, travel, respond to an ambush, reach a checkpoint, bank, inspect verified progress and complete a second wallet trade.

Files: update design briefs and a new `docs/JOURNEY_DECISIONS.md` with decision IDs and explicit owner answers.

Exit check: no ambiguous permanent asset loss, initial roster or reward funding rule remains in the first playable slice. Unresolved stretch work is listed and excluded from that slice.

### Step 02. Capture the existing baseline without losing work

Actions:

1. Inspect all applicable AGENTS.md files and `git status --short`.
2. Inventory modified and untracked source files before editing. Never use a clean working tree as an assumed prerequisite.
3. Record current mode routes, contract manifests, chain IDs and capabilities without exporting secrets or full environment files.
4. Back up the live SQLite database using the repository's supported database backup workflow. Preserve its journal consistency; do not copy an actively written database blindly.
5. Run application typecheck, build and the relevant existing simulation and collection tests. Keep public network dependent checks distinct.
6. Record a local bot match and existing gun ownership and trade behaviour as separate kinds of evidence.

Files: `docs/JOURNEY_BASELINE.md`, evidence directory and private runtime backups.

Exit check: the current game is launchable, existing failures are recorded, the database can be restored and the original uncommitted work is intact.

### Step 03. Introduce a separate versioned Journey ruleset

Actions:

1. Define a Journey mode identifier, protocol identifier, generator version and rules version.
2. Separate tunable gameplay values from immutable asset build definitions and economic policy values.
3. Use integer ticks for cooldowns and integer smallest units for tokens. Do not use floating point currency.
4. Validate rules on startup: nonnegative costs, sensible cooldowns, maximum actors, maximum active sections and bounded experience rewards.
5. Hash the complete rules that affect eligibility, rather than only a display version string.
6. Store the exact rules snapshot and hash with each run. Unknown rules should prevent new entry and retain read only recovery information.
7. Add `JOURNEY_ENABLED` as a proposed development flag; leave old modes enabled independently.

Files: proposed simulation rules/types, protocol module, server capability config and decisions.

Tests: malformed rules, changed version, inconsistent hash, incompatible resume and legacy mode startup.

Exit check: Journey can be enabled or disabled without changing an existing contract manifest or silently upgrading a saved run.

### Step 04. Define the world interface and coordinate boundary

Actions:

1. Introduce a `WorldQuery` interface for bounds, solid volumes, walkability, segment tests, shot intersections, terrain samples and portals.
2. Adapt the current fixed map to that interface and regression test it before introducing streamed sections.
3. Give Journey section identity and local coordinates separate fields. Do not accept an enormous absolute coordinate in a legacy move packet.
4. Recommended Journey convention: one local unit represents one world metre. A prototype section can represent 72 by 48 metres, matching the recent visible field scale. This is a proposed new simulation convention, not the old 48 by 32 coordinate space.
5. Keep the legacy 1.5 render scale conversion behind its existing adapter. Never apply it twice to new Journey coordinates.
6. Define where Y is ground elevation, where actor feet sit and how camera eye height is calculated.
7. Define stable conversions for screen picking, minimap positions, shot directions, formation offsets and origin rebasing.

Tests: screen to world to screen round trip, boundary movement, shot alignment and old mode camera regression.

Exit check: the same obstacle blocks navigation, bodies, camera entry and the appropriate shot rays in a single section.

### Step 05. Build one playable journey section before generation

Actions:

1. Author one road encounter using original geometry and the world interface.
2. Include a clear spawn, two approaches, solid cover and a visible exit checkpoint.
3. Reuse existing movement, independent look and rifle feedback through an adapter.
4. Keep the first section in local practice, without wallet dependencies.
5. Add a temporary Journey debug route guarded by its feature flag. Do not replace the landing page's working Endless entry yet.
6. Render a destination marker with distance, squad health and provisional reward count. Label provisional counters as practice values.

Tests: local bot encounter, accessible checkpoint, no wall clipping, no view direction regression and no unexpected token UI.

Exit check: a person can enter, move, shoot, survive and reach a clearly understood destination. Save an actual local gameplay screenshot or recording.

### Step 06. Build the seeded section generator

Actions:

1. Pin a deterministic PRNG algorithm. Seed its streams from run seed, generator version, section ordinal and subsystem name.
2. Keep scenery randomness separate from encounter and loot randomness so adding a rock does not change reward outcomes.
3. Select an authored section template, orient its portals, place geometry and generate a traversability graph.
4. Validate at least one legal entrance to exit route, actor clearance, safe spawn locations and accessible rewards.
5. Retry generation a bounded number of times. Fall back to a known valid template if validation fails.
6. Encode section ordinals as decimal strings or another exact representation on the wire. Do not let long progression silently exceed JavaScript safe integers.
7. Define a documented upper representation limit, such as the later contract's uint64 checkpoint range. Call the prototype effectively endless rather than mathematically infinite.

Tests: identical seed produces identical content, different seeds yield controlled variation, failed generation uses a safe fallback and invalid geometry never reaches the client.

Exit check: thousands of generated sections pass connectivity and spawn validation without loading them all at once.

### Step 07. Implement section transitions and bounded streaming

Actions:

1. Keep the current section and a small adjacent window active. Initially use previous, current and next sections.
2. Prefetch the next section before the player reaches its portal.
3. Transition only after the server validates entry into the portal and encounter completion requirements.
4. Move the whole deployed roster across atomically. Define an explicit policy for a helper still in combat or separated from the leader.
5. Rebase render coordinates close to the current section to preserve numerical precision.
6. Retire distant meshes, navigation caches, enemies, audio and visual effects. Dispose GPU resources and event listeners.
7. Keep only a compact progress summary in active memory. Durable reward and experience history may grow with play; do not falsely claim constant database size.
8. Do not regenerate consumed loot when the player revisits a section.

Tests: forward crossing, attempted backtracking, repeated portal requests, delayed section delivery, missing helper, reconnect during transition and memory plateau during a long traversal.

Exit check: the player can continue through repeated generated sections while active memory and entity counts stay bounded.

### Step 08. Add strict Journey transport validation

Actions:

1. Add a separate `/journey` WebSocket route in the server, proxied through the existing `/api` setup.
2. Add an HTTP capability endpoint for mode availability and supported rules. Do not publish protected roles or keys.
3. Define strict start, resume, command, acknowledgement and snapshot messages.
4. Validate keys, types, finite coordinates, local bounds, section identity, IDs, actor ownership and rule versions.
5. Keep client messages small. Give larger server snapshots a separate explicit size budget. Do not blindly reuse or globally increase the legacy 2048 byte client limit.
6. Reject arbitrary reward, health, experience and balance fields. Reject stale commands aimed at a retired section.
7. Rate limit per connection, run and command category. Use sequence and command IDs for retries and deduplication.
8. Filter observations according to player visibility rather than sending all hidden enemies to the browser.

Tests: malformed JSON, extra keys, huge packets, invalid section, wrong actor, stale sequence, replay with changed payload, denied origin and connection flooding.

Exit check: an untrusted client cannot move another roster, spawn assets or manufacture progress by editing a packet.

### Step 09. Create the authoritative Journey service and durable journal

Actions:

1. Add a separate service class rather than overloading the existing station session with unrelated fields.
2. Use a fixed simulation tick and separate wall time deadlines. Publish which timers pause.
3. Store run metadata, pinned rules, generator state, actor state, encounter state, loot, inventory reservations and a command journal.
4. Apply a command and all resulting economic effects in one SQLite transaction. Send success only after commit.
5. Deduplicate by `(runId, commandId)`. The same ID with a different payload must fail.
6. Keep a bounded in memory event ring for rendering and durable events for reward and progress attribution.
7. Recover from a consistent snapshot plus journal position. Reject corrupted or incompatible state without inventing a reward voucher.
8. Handle disconnect and service restart explicitly. A service restart is not automatically a player quit.

Tests: crash before commit, after commit before acknowledgement, duplicate command, disk failure, corrupted snapshot, lost socket and restart recovery.

Exit check: one section and its inventory can survive a real service restart without duplication or an incorrect terminal outcome.

### Step 10. Introduce individual soldier actor state

Actions:

1. Define an actor per participating soldier with stable actor ID, optional asset identity, class, health, armour, weapon, ammunition, pose, abilities and role state.
2. Keep a separate squad container for formation and team orders. Do not attach seven NFTs to the old aggregate `members` number and call them independently simulated soldiers.
3. Preserve a leader control model for the first prototype. Define whether leader death ends the run or allows selecting a living helper in Step 01.
4. Give each actor body clearance, target geometry, navigation state and death or downed state.
5. Implement formation following without placing helpers inside buildings. Reachable fallback slots should replace overlapping decorative figures.
6. Define maximum separation and a recovery path for stuck helpers. Do not silently teleport a living soldier through a defended wall.
7. Keep ownership and run participation distinct: a free actor has an entitlement record, while an NFT actor has a verified asset reference.

Tests: independent damage and ammunition, formation around a corner, one helper dying, squad limits, unreachable slots and old aggregate mode regression.

Exit check: each displayed Journey soldier corresponds to a real actor whose participation and survival can be attributed correctly.

### Step 11. Add region terrain samples and movement effects

Actions:

1. Define region and surface identifiers with movement, visibility, sound and supply modifiers.
2. Implement outskirts as the baseline, woodland with visible mud and vegetation zones, and highlands initially as flat connected rocky cuts.
3. Apply movement modifiers in the server simulation, including diagonal movement and dodge limits.
4. Add deterministic terrain transitions. Clamp or blend boundaries to avoid speed oscillation at an edge.
5. Distinguish vegetation that obscures observation from a solid trunk that blocks bodies and shots.
6. Render ground materials and cues that explain why movement or visibility changes.
7. Preserve collision definitions as gameplay data, not arbitrary visual meshes.

Tests: identical traversal under identical inputs, region boundary behaviour, blocked trunks, vegetation observation rules and no hidden speed bonus through diagonal input.

Exit check: at least two terrain types visibly and measurably affect gameplay, and all three region families are traversable.

### Step 12. Add enemy perception and threat memory

Actions:

1. Track visual observations, hearing events, incoming damage direction and witnessed ally losses per enemy.
2. Sample vision using distance, field of view, terrain visibility and line of sight. Damage can alert an enemy even when the attacker was behind it.
3. Hearing supplies a suspected region, not perfect knowledge through walls.
4. Store the last known threat position, confidence and expiry tick.
5. Rotate toward a suspected threat with a bounded turn speed and reaction delay. These are tunable gameplay values, not claims about human reaction science.
6. Share limited alerts within a squad using an explicit range or communication rule.
7. On lost sight, investigate the last known location and then search or return to assignment.

Tests: fire from behind, silent unseen approach, wall obstruction, distant gunfire, lost sight, misleading old threat memory and ally alerts.

Exit check: shooting enemies from behind causes an observable response while hidden player positions remain undisclosed.

### Step 13. Add tactical enemy decisions and coordinated roles

Actions:

1. Use an inspectable state machine or utility selector with states such as patrol, alerted, seek cover, suppress, flank, reload, retreat and search.
2. Start with rifle defender, flanker and support roles. Reuse and improve existing focus, cover and evasion logic where it fits.
3. Score only reachable cover using threat direction, exposure, travel cost and teammate occupancy.
4. Assign different approach sides so all enemies do not select the same point.
5. Introduce commitment windows and hysteresis so enemies do not switch decisions every tick.
6. React to ammunition, armour, health, separation and grenade danger using only known information.
7. Stagger thinking across actors. Do not run a full path search for every actor every frame.

Tests: blocked cover, two flankers, low ammunition, low health retreat, target loss, repeated pressure and a stuck path recovery.

Exit check: a rear attack, frontal suppression and cover flank produce distinct, readable responses without omniscience or constant movement jitter.

### Step 14. Add checkpoint encounter conditions and progression

Actions:

1. Define encounter templates with explicit eligibility: ambush survived, crossing opened or defended position completed.
2. Each template specifies required threats, alternate routes, failure rules and checkpoint activation.
3. Require alive and eligible participation at the exit. Merely crossing the marker must not be sufficient.
4. Record `CheckpointCompleted` exactly once for the run and checkpoint ordinal.
5. Increase difficulty through tiered compositions, awareness, approach angles and supply pressure before increasing raw population.
6. Bound active enemies and numerical stat multipliers. A long run must not create unmanageable health values or unbounded spawning.
7. Keep the bank decision separate from checkpoint completion. Show what is provisional and what is secured.

Tests: bypassed encounter, repeated crossing, retreat and reentry, unreachable last enemy, simultaneous last kill and player death, and difficulty cap behaviour.

Exit check: three different encounters can be completed in sequence, with exactly one recorded checkpoint event per valid completion.

### Step 15. Implement crouch and dodge as actual simulation states

Actions:

1. Add explicit pose and ability state to individual actors.
2. Crouching changes eye height, shot target shape and movement speed together.
3. Check head clearance before standing. Do not allow the standing model or camera to rise into a low ceiling.
4. Dodge uses a bounded path, cooldown and stamina or other approved limitation.
5. Sweep the body along the entire dodge, rather than checking only its endpoint.
6. Decide whether any invulnerability exists. Recommended first version has none; success comes from moving out of the line of fire.
7. Give enemies the same relevant collision and pose constraints.
8. Preserve independent looking while moving, including backward movement and touch controls.

Tests: crouch behind low cover, stand under an obstruction, dodge into a wall, diagonal dodge, cooldown replay and hit registration during pose transitions.

Exit check: hit shapes and visual poses agree, and neither player nor enemy can evade through solid geometry.

### Step 16. Implement the first grenade end to end

Actions:

1. Define a fragmentation grenade item with inventory cost, throw speed, fuse, maximum throw distance, blast radius and falloff.
2. Validate the throw origin, aim, owned deployed quantity and cooldown on the server.
3. Decrement the deployed quantity exactly once when the throw is accepted.
4. Simulate an actual projectile with height and gravity. Sweep its trajectory against world collision to prevent tunneling.
5. Specify bounce and rest behaviour. Begin with simple deterministic behaviour rather than an unbounded physics dependency.
6. On fuse expiry, calculate damage by distance and blast obstruction. Decide friendly fire before shipping.
7. Produce throw, bounce and explosion events. Render the visible projectile, arc preview and warning cue from shared parameters.
8. Teach enemies to react after they perceive the grenade, not before it is thrown.

Tests: zero inventory, changed retry payload, repeated command, blocked throw, wall shielding, fuse during pause, simultaneous death, friendly fire and reconnect during a live fuse.

Exit check: one verified grenade throw consumes one unit and has the same collision and explosion outcome in replay.

### Step 17. Add real height traversal only if it remains in scope

This is an explicit gate, not permission to silently remove the owner's jumping request.

Actions:

1. Decide whether jumping and vaulting are required for the first demonstration or scheduled after it.
2. If required, extend actors with vertical velocity, grounded state, stance height and landing state.
3. Add ground elevation queries, slope rules, ceiling collision and maximum step height.
4. Validate the swept vertical body during ascent and descent.
5. Add navigation links for permitted vaults and jumps. Enemies must use the same traversal constraints.
6. Update camera height, shot intersections, grenade interactions and fall damage if approved.
7. Ensure a section cannot generate a mandatory jump that a deployed archetype cannot perform.

Tests: low vault, blocked ceiling, landing on an edge, repeated jump requests, invalid midair dodge, fall recovery and network correction.

Exit check: a real height changing obstacle course works for player and enemies. If deferred, the release clearly states that jumping and true vertical terrain are pending.

### Step 18. Add the seven soldier archetypes as data

Actions:

1. Translate Mara, Kestrel, Rook, Imani, Flint, Vale and Beck from JOURNEY_SOLDIERS.md into versioned class definitions.
2. Separate base class data from unique token instance progress and per run state.
3. Define bounded health, armour, movement, reload, perception and ability differences.
4. Implement personality through observable priorities and concise original voice or text lines. Do not add an unneeded language model dependency.
5. Give each class an original silhouette, armour treatment and supported weapon loadout.
6. Label any asset or ability that is still a placeholder. Record provenance and licences.
7. Do not sell a class whose signature weapon or ability is not implemented.

Tests: all class definitions validate, each role has a tradeoff, unsupported equipment fails and stat bounds hold at maximum rank.

Exit check: seven distinct data profiles and their visible roles work in local practice without claiming that a soldier NFT deployment already exists.

### Step 19. Build roster and squad management before adding chain writes

Actions:

1. Create a roster view with free starter entitlements and clearly labelled local development assets.
2. Let the player choose the leader and helpers within the approved active team limit.
3. Validate duplicate actors, unsupported classes, incompatible equipment and unavailable soldiers.
4. Show defaults separately from independently owned guns.
5. Show each soldier's health role, ability, armour and available inventory using short labels and icons.
6. Keep purchase and trading controls outside active combat.
7. Create a loadout snapshot when entering a run so later catalogue edits cannot change a live encounter.

Tests: empty roster, starter only, full team, duplicate asset, changed catalogue and sold or disabled asset.

Exit check: a player can deploy a valid team, understand each role and recover from an invalid selection without a wallet transaction.

### Step 20. Implement authoritative participation and experience journals

Actions:

1. Record roster membership at entry and relevant deployment changes under the approved rules.
2. Define eligible contributions, minimum participation and per checkpoint XP caps.
3. Generate XP from server events only. Do not reward every unverified client kill notification.
4. Record experience events with unique source IDs and the soldier asset identity or free entitlement identity.
5. Advance furthest completed checkpoint only after a verified completion. Use completed checkpoints, not camera distance or a submitted coordinate.
6. Attribute history to the token while retaining separate account achievements.
7. Define a progression rules version so records from different difficulty systems are not falsely presented as identical accomplishments.
8. Do not issue an onchain progress voucher until the agreed bank or settlement gate.

Tests: late roster insertion, dead or absent member, duplicate event, replayed checkpoint, run restart, two simultaneous runs and seller versus buyer account attribution.

Exit check: the same journey journal always produces the same bounded XP and furthest checkpoint updates.

### Step 21. Build practice rewards, high rank drops and banking

Actions:

1. Define high rank enemy roles and eligible drop tables in pinned rules.
2. Bind a token drop to its enemy, encounter, section, run and first eligible defeat.
3. Keep drop creation, pickup and banking as separate states. A visible bag is not a wallet claim.
4. Prevent regeneration, replay and reconnection from recreating a consumed drop.
5. Maintain separate provisional checkpoint rewards, enemy drops, owned inventory and banked results.
6. For practice, label all WIF values as simulated credits.
7. On bank, commit a terminal or segment record according to the approved continue after bank policy.
8. On explicit quit, forfeit new unbanked round rewards and provisional loot once. Preserve previously owned assets and already completed claims.
9. Preserve reward cap history so quitting cannot reset an allowance.

Tests: high rank versus ordinary enemy, double death event, simultaneous pickup, bank interruption, quit during a mission, replayed bank and disconnect at the deadline.

Exit check: the entire practice journey loop works and its reward ledger survives restart before any chain reward is advertised.

### Step 22. Define collectible identities, immutable builds and capability adapters

Actions:

1. Create discriminated asset types for soldiers, guns and consumables.
2. Require chain, collection, token ID and, for quantities, a positive integer amount.
3. Define immutable soldier class and weapon build identifiers. Keep mutable verified progress in separate revisioned records.
4. Add catalogue capabilities such as inspect, equip, list, claim, consume and combat ready.
5. Preserve existing gun adapters and ABI selection. Never infer a collection from a token number.
6. Specify supported chains and verify code hashes and immutable contract configuration.
7. Reject an unsupported gun class or soldier collection even if a wallet reports a token with the same numeric ID.

Tests: equal IDs across collections, wrong chain, changed bytecode, mismatched currency, unsupported build and disabled collection.

Exit check: original guns still inspect and trade correctly while local development Journey assets are explicitly separate.

### Step 23. Implement a separate soldier NFT collection on a disposable local chain

Actions:

1. Design JourneySoldiers as a separate ERC721 collection with immutable class and provenance, owner enumeration where needed, and an explicit progress revision.
2. Choose a bounded mint supply policy and test token purchase or authorised mint source. Prices remain product decisions, not invented deployment facts.
3. Add complete metadata that distinguishes class, verified history and gameplay availability.
4. Define EIP712 progress vouchers binding chain, collection, token, owner, run or bank source, rules version, progress nonce, cumulative XP, furthest checkpoint and expiry.
5. Require a valid designated gameplay signer, correct current owner and monotonic progress. Reject replay and backwards updates.
6. Use existing OpenZeppelin patterns and checks, effects and interactions. Do not write a substitute NFT standard.
7. Extend the compiler's explicit ABI export list for new contracts. Do not overwrite an old ABI under a new implementation name.
8. Generate a new local deployment manifest. Do not modify the existing public manifest or claim a public transaction.

Tests: mint authorisation, class bounds, owner queries, URI correctness, wrong domain, wrong owner, stale nonce, expired voucher, signature replay and monotonic progress.

Exit check: a disposable local wallet owns a real soldier NFT and can verify its class and accepted progress on the local chain.

### Step 24. Add deployment locks and ownership revalidation

Actions:

1. Select a lock policy before contract integration. Recommended first version locks a deployed soldier against sale and transfer while its run is active, with an explicit expiry and recovery path.
2. Require owner consent to the run lease and bind the exact asset and maximum duration.
3. Enforce the lock in the collection transfer path if the design promises transfer blocking. A server UI flag alone cannot prevent an external wallet transfer.
4. If unrestricted transfers are chosen instead, revalidate ownership and immediately revoke old run access. Document the different player experience.
5. Ensure locks cannot last forever if the service disappears. Test the exact expiry boundary and independent unlock path.
6. Prevent two services from issuing conflicting deployments for the same asset. Use durable uniqueness and onchain lease identity where applicable.
7. Recheck ownership before XP updates, sale settlement and recovered asset delivery.

Tests: transfer while deployed, second run attempt, expiry, service crash, release replay, stale progress after sale and external transfer followed by return.

Exit check: no soldier is usable by two owners or two active runs, and a failed service cannot hold it indefinitely.

### Step 25. Add soldier listings and sales with experience aware terms

Actions:

1. Begin with fixed price listings using the existing marketplace pattern where practical. An integrated collection market is acceptable for the first version; a universal external marketplace is not required.
2. Let sellers choose asking prices. Display experience and furthest checkpoint as verified information, not guaranteed value.
3. Bind each quote to asset, seller, price, listing nonce and progress revision.
4. If progress changes after listing, either invalidate the listing or require the buyer to review new terms. Do not silently fill a quote for a different revision.
5. Use exact test token allowances, including existing stale allowance reset handling.
6. In one successful purchase, pay the correct seller, transfer the correct asset and invalidate the listing. Revert all effects if payment or delivery fails.
7. Preserve token history across sale and keep the buyer's account achievements separate.
8. Include cancel, refresh, pending, rejected and replaced transaction states.

Tests: own listing purchase, wrong seller, stale price, same price relisting, progress change, active lease, failed ERC20 payment, rejected NFT receiver and transaction replacement.

Exit check: wallet A lists a progressed soldier, wallet B purchases it, ownership changes once and both wallets see correct history and balances.

### Step 26. Add additional gun classes through complete adapters

Actions:

1. Select the first new gun after the existing rifle, carbine and shotgun. Recommended order: marksman rifle, support gun, then sidearm.
2. Define the real weapon build: damage, interval, range, magazine, reserve, reload, recoil or spread, armour interaction and supported abilities.
3. Implement the build in simulation before enabling its shop entry.
4. Add original procedural geometry, animations, audio and catalogue illustration with provenance.
5. Add a separate compatible collection or extension design that does not reinterpret immutable old gun types.
6. Bind sale, equipment and recovery vouchers to the exact build.
7. Update class signature loadouts only when that weapon is actually supported.
8. Preserve old onchain SVG metadata and let new Armory art remain a presentation layer.

Tests: cadence, ammunition, reload, obstruction, damage bounds, ownership access, unsupported builds and old gun regression.

Exit check: each newly purchasable gun has matching implemented combat, metadata, contract identity and ownership enforcement.

### Step 27. Design finite consumable collectibles and their use lifecycle

Actions:

1. Choose health kit, grenade pack, ammunition pack and armour repair kit definitions and stack sizes.
2. Decide the token standard. ERC1155 is a candidate for stackable unopened packs; it is not an approved dependency or deployed feature yet.
3. Decide when a token is consumed and what happens to unused contents. Do not allow a pack to remain tradable after its contents have been granted.
4. Recommended prototype option: burn an unopened pack to redeem a fixed amount of owned, nontransferable service inventory. Remaining opened contents persist as owned inventory; only deployed use consumes them. Explain this clearly before the burn.
5. Alternative: escrow units for a run and settle used quantities later. This needs a separate offline and timeout policy; it must not reuse the existing full token refund rules without analysis.
6. Keep any selected design separate from round rewards. Quitting should not silently destroy undeployed, previously owned inventory.
7. Avoid broad wallet permissions where a scoped sale or redemption path can be implemented. If the chosen standard requires operator approval, show its real scope and support revocation.
8. Do not automatically choose a custody policy merely to avoid a difficult recovery case.

Exit check: the owner approves a written state diagram from wallet pack through redemption, deployment, use, quit and recovery before implementation proceeds.

### Step 28. Implement supply trading, redemption and exact consumption

Actions:

1. Add the separate supply collection and market route selected in Step 27.
2. Quotes bind item class, quantity, seller, unit price, total, listing nonce and expiry or revision.
3. For partial fills, decrement available quantity atomically and invalidate stale quotes appropriately.
4. Verify a confirmed pack redemption before granting service inventory. Use `(chainId, transactionHash, logIndex)` uniqueness.
5. Keep pending confirmations separate from spendable stock. Handle orphaned receipts before they authorise durable rewards.
6. In a single database transaction, consume one owned unit and apply its gameplay effect or reject without charging.
7. Block heal above the approved health limit, restore to a dead actor if unsupported, grenade duplication and simultaneous consumption from two runs.
8. Retain a recovery path for a confirmed redemption if the server was unavailable when it happened.

Tests: zero quantity, partial fill, out of stock, duplicate receipt, reorg, disconnected redemption, double use, failed heal, full ammunition and failed persistence.

Exit check: two wallets can trade a pack, its owner can redeem it once, and its contents are consumed exactly once by actual gameplay.

### Step 29. Bridge banked soldier progress to onchain records

Actions:

1. At a verified bank, derive cumulative progress from the durable participation journal.
2. Recheck current ownership, run lease, accepted rules and prior progress nonce.
3. Prepare a signed progress voucher and write its source and outbox record transactionally.
4. Permit submission by the approved wallet or service relayer according to the agreed permission model. There should be no wallet prompt per kill.
5. Verify the resulting event and confirmations before showing the progress as confirmed onchain.
6. Preserve an unsubmitted voucher or recoverable outbox state after restart. Do not generate two contradictory updates for the same nonce.
7. Reject a voucher for an old owner after a sale, unless an explicit contract policy safely pins it before transfer.
8. Label pending progression separately from the last confirmed market revision.

Tests: crash between signing and submission, duplicate submission, old owner, lease expiry, competing bank events, orphaned receipt and late listing.

Exit check: verified participation leads to one correct progress update that remains visible after sale and restart.

### Step 30. Implement collectible weapon recovery from Journey pickups

Actions:

1. Preserve temporary battlefield equipment pickups regardless of whether a collectible recovery route is enabled.
2. Mark eligible newly recovered collectibles with a unique source and exact supported gun build.
3. Commit successful bank or extraction before issuing any mint authority.
4. Bind claims to recipient, run, source, destination collection, chain, rules, build and expiry.
5. Reject death, quit, missing checkpoint backing and unextracted items under the approved policy.
6. Deduplicate sources across retries and collection registry changes. Once issued, pin the destination collection.
7. Keep existing salvage and V2 recovery routes operational through their original adapters.
8. Never take another user's already owned NFT because an enemy avatar dropped a visually similar gun.

Tests: changed recipient, class substitution, equal token IDs, duplicate source, expiry boundary, quit, reorg and registry change after voucher issuance.

Exit check: a real Journey bank can authorise one supported collectible recovery on a disposable local chain, with all negative cases rejected.

### Step 31. Connect funded Journey rewards only after practice is complete

Actions:

1. Write a custody compatibility assessment for the existing treasury and vault. Existing deployment hashes and settlement meanings cannot be changed in place.
2. Define reward source, reservation cap, bank timing, segment boundaries, carried funds, stakes, timeout and quit treatment.
3. Separate a player's existing deposit from new earned rewards. Do not describe both as money that is lost on quit unless that exact policy is approved and implemented.
4. Reserve backing before promising an eligible checkpoint or high rank drop payout.
5. If backing is unavailable, disable funded entry or explicitly offer practice. Never silently substitute simulated earnings for a promised chain reward.
6. Preserve the approved automatic timed settlement direction. Use a durable outbox and the existing worker model where compatible.
7. Decide whether a bank ends a funded segment and opens a new allocation for continued travel. Do not imply an unbounded series of claims against one fixed allocation.
8. Choose a new companion contract deployment only if the existing vault cannot express the approved policy. Leave existing users' recovery available.

Tests: exhausted pool, concurrent reservations, duplicate drop, quit, death, deadline, service failure, worker restart, stale ownership and exact accounting conservation.

Exit check: a disposable local blockchain run has fully backed rewards, automatic settlement and independently recoverable claim or timeout behaviour.

### Step 32. Harden the settlement and claim recovery path

Actions:

1. Reserve an idempotent settlement source before broadcasting a transaction.
2. Record submitted, replaced, confirmed and orphaned transaction states without inventing a hash.
3. Reconcile source events, reserved amounts, consumed stakes, payouts and refunds.
4. Require appropriate confirmations and document their limits. Two testnet confirmations are not Ethereum finality.
5. Keep wallet claims, allowance revocation and supported timeout recovery available from verified deployment metadata if the game service is offline.
6. Handle wallet account and network changes by invalidating cached authority, not by changing the run's recorded recipient.
7. Recover pending soldier progress, pack redemption and weapon claims through their own source IDs. A single generic retry button must not submit unrelated payments again.

Tests: service killed after broadcast, transaction replacement, stale nonce, cancelled wallet request, offline game service, full timeout and reorg after a soft confirmation.

Exit check: recovery does not charge twice, grant twice or strand an asset behind an unavailable game server indefinitely.

### Step 33. Integrate the Journey renderer and player UI

Actions:

1. Build the Journey scene adapter using original environment builders, shared effects and individual soldier rigs.
2. Load and dispose section geometry through a keyed scene registry. Avoid recreating the renderer for every checkpoint.
3. Keep formation rendering and camera follow aligned with authoritative actor state and rebased coordinates.
4. Add concise UI for next checkpoint, region condition, roster health, grenade count, selected gun, provisional earnings and bank status.
5. Use icons and clear numbers rather than long gameplay paragraphs. Put advanced rules and contract records behind Details.
6. Provide visible states for reload, crouch, dodge cooldown, throw preparation, injury, lost connection and inventory rejection.
7. Keep original artwork provenance. Concept illustrations must not be offered as proof of implemented combat graphics.
8. Validate keyboard, pointer lock fallback, right drag and touch movement with independent look.

Tests: camera after section transition, all input release paths, pause, modal controls, lost graphics context, reduced motion and small screen layout.

Exit check: a player can understand and complete the journey loop without reading a technical explanation.

### Step 34. Extend the Armory to soldiers, guns and supplies

Actions:

1. Add clear catalogue tabs or filters without creating unrelated duplicate wallet pages.
2. A soldier card shows class, verified XP, furthest checkpoint, asking price, ownership and deployment status.
3. A gun card shows its implemented build and equipment compatibility.
4. A supply card shows wallet quantity, opened service inventory separately, exact purchase quantity and consume rules.
5. Hide or disable unsupported actions with a short truthful reason. No invented stock, transaction activity or balances.
6. Preserve the shared wallet identity and operation lock. Refresh authoritative ownership after confirmation.
7. Keep original collection details, immutable artwork, transaction history and recovery tools accessible.
8. Ensure sale inspection distinguishes token history from the connected player's personal achievements.

Tests: disconnected browsing, mixed collections, sold asset refresh, disabled class, active lease, stale listing, insufficient quantity and pending purchase recovery.

Exit check: a player can buy, equip, inspect, list and recover supported new assets through one coherent Armory without breaking old guns.

### Step 35. Prove the complete disposable local chain loop

Actions:

1. Start a disposable chain using the existing fixture patterns and a dedicated test database.
2. Deploy new contracts without replacing any original collection address.
3. Use wallet A to acquire a supported soldier and gun, deploy them, complete a checkpoint and bank.
4. Apply verified progress and demonstrate any supported collectible recovery.
5. Open and use a supply pack, showing exact inventory before and after.
6. List the progressed soldier and purchase it from wallet B.
7. Verify balances, owner, progress, listing invalidation and old owner's lost deployment rights using actual chain reads.
8. Repeat relevant failures: rejected delivery, changed price, transfer race, stale voucher and interrupted service.

Exit check: save actual receipts, source event references, sanitized ledger evidence and browser proof. Clearly label it local blockchain.

### Step 36. Run long journey, adversarial and performance checks

Actions:

1. Traverse a large deterministic section sequence automatically, such as a proposed initial target of 10000 generated sections, without rendering all of them.
2. Run a smaller representative rendered journey in the foreground browser. Simulation speed alone is not rendering performance evidence.
3. Track tick time, active actor count, active section count, mesh and texture counts, heap trend, snapshot size and reconciliation failures.
4. Establish hardware specific targets before treating a number as a release requirement. At 20 simulation ticks per second, the entire tick budget is 50 ms; leave operational headroom rather than using it all.
5. Fuzz command validation and generate randomized sequences of pickup, consume, bank, quit, reconnect and transfer.
6. Check resource disposal, route cache invalidation, origin rebasing and exact section ordinals over long progression.
7. Test an unavailable pool and a disabled collection during an ongoing practice run.

Exit check: memory stays bounded for active content, no duplicate reward or experience source is found and the target machine remains playable within recorded limits.

### Step 37. Conduct a focused human playtest

Actions:

1. Ask the owner to play a short journey without coaching every action.
2. Observe whether the objective, terrain effect, enemy response and bank decision are understood.
3. Ask specifically about movement while looking, grenade aiming, squad awareness, fairness of rear attack reactions and checkpoint variety.
4. Ask whether classes feel different and whether marketplace ownership and supply consumption are understandable.
5. Record confusion, bugs and unfair situations separately from preference changes.
6. Fix the highest impact issues and repeat only the affected scenarios.

Exit check: the owner confirms the gameplay loop is enjoyable enough to demonstrate. Automated tests cannot satisfy this human feedback gate.

### Step 38. Prepare a new public testnet candidate only if access is ready

Actions:

1. Verify current official network configuration and testnet documentation at deployment time. Do not rely on old assumptions about endpoints or faucets.
2. Use dedicated project roles and free test gas. No real money, mainnet, token purchases or paid subscription.
3. Verify asset ownership and signing roles before any transaction. Ask only if ownership or required access is ambiguous.
4. Deploy new companions with recorded code hashes, rules hashes and constructor values.
5. Run a bounded public demonstration of ownership, purchase, progression, sale and claim recovery.
6. Record actual receipts and distinguish soft confirmations from finality.
7. If testnet access fails, retain the local chain demonstration and report the public step incomplete. A failed faucet must not block local work.

Exit check: public proof is actually complete or explicitly excluded from the release. Never relabel local receipts as public evidence.

### Step 39. Switch the main Endless entry to the verified Journey prototype

Actions:

1. Confirm all required gameplay, recovery and market gates are satisfied for the demonstrated environment.
2. Change the Endless landing card objective to the checkpoint journey and point it to the new mode.
3. Keep Classic and Station Survival under existing or clearly marked secondary entries. Preserve direct recovery URLs.
4. Retain the old local Endless route behind an explicit fallback while the new version is evaluated.
5. Route Operations Quit through Journey's authoritative terminal action and confirmation. It must wait for durable acknowledgement before returning home.
6. Prevent mode switching from bypassing the quit policy. Keep ordinary connection loss and service restart distinct from confirmed quit.
7. Advertise only implemented soldier, weapon, region and movement abilities.

Tests: all mode links, paused and countdown quit, cancel, server unavailable, stale run, mobile navigation and original Armory links.

Exit check: the home screen reliably enters the demonstrated version and every exit has a clear, correct reward consequence.

### Step 40. Package the release and preserve rollback

Actions:

1. Record the actual source revision or worktree state, build commands, dependency versions and migration version.
2. Produce sanitized evidence for gameplay, local chain and any public testnet work separately.
3. Back up the database using a supported consistent workflow and test restoration into a disposable environment.
4. Keep old contract manifests and recovery adapters. Do not remove them to make the new UI look simpler.
5. Scan publishable files and the browser build for dedicated secrets. Do not publish database files, private environment files, signatures or protected key stores.
6. Update README, STATUS, FACTS, DECISIONS and ASSET_REGISTER with actual implemented scope and limitations.
7. Document how to disable new Journey entry while leaving recovery and existing modes operational.
8. Prepare a short demo script and a known failure recovery script. Do not rely on a perfect uninterrupted live session.

Exit check: another person can launch the prototype, understand what is real, restore a test backup and follow the ownership to gameplay to trade demonstration.

## E. Data and message contracts

The following are design sketches, not production code or final API promises.

### E1. Core data boundaries

| Record | Important fields | Source of authority |
| --- | --- | --- |
| JourneyRun | run ID, owner/session scope, seed, rules hash, protocol, generator version, lifecycle state | Server |
| SectionRef | generator version, exact ordinal, template, region, entrance and exit portals | Deterministic generation plus server |
| Actor | actor ID, squad ID, optional asset identity, class, local position, health, armour, pose, equipment, ammunition, ability timers | Server |
| RosterAsset | chain, collection, token, class, current owner, deployment lease, progress revision | Verified chain state and service lease |
| CheckpointRecord | run, ordinal, encounter ID, completion event, participants, reward source | Durable server journal |
| ExperienceEvent | source ID, asset identity, run, checkpoint, contribution, amount, rules version | Server journal, later confirmed progress voucher |
| Drop | source ID, enemy ID, class, amount/build, eligible recipient, provisional/picked/banked/claimed state | Server and claim contract where applicable |
| OwnedStock | wallet scope, item class, confirmed redemption sources, quantity, reserved quantity | Confirmed receipt plus transactional service inventory |
| Listing | chain, collection, token/item, quantity, seller, price, nonce, progress/build revision | Contract |
| SettlementSource | run/segment, reservations, terminal record, exact amounts, outbox state, receipt state | Service journal and custody contract |

Never use a browser display label, generated image filename or soldier nickname as the authoritative asset key.

### E2. Suggested run state machine

```text
PREPARING -> ACTIVE -> CHECKPOINT_REACHED -> ACTIVE
                   -> BANKING -> BANKED
                   -> QUITTING -> QUIT
                   -> DEAD
                   -> DISCONNECTED -> ACTIVE or DEPARTED
                   -> SERVICE_ABORTED
```

Define terminality and whether a successful bank opens a new run segment before implementation. A service abort should not be disguised as player surrender. A checkpoint reached event should not itself imply a banked wallet payout.

### E3. Suggested asset and consumable state machines

```text
Soldier:
OWNED -> DEPLOYMENT_RESERVED -> DEPLOYED -> RELEASED
OWNED -> LISTED -> SOLD or CANCELLED
DEPLOYED -> DOWNED_FOR_RUN -> RELEASED

Unopened supply pack, if the redemption design is selected:
WALLET_OWNED -> LISTED -> SOLD
WALLET_OWNED -> REDEMPTION_PENDING -> CONFIRMED_BURN
CONFIRMED_BURN -> OWNED_SERVICE_STOCK -> RESERVED_FOR_RUN
RESERVED_FOR_RUN -> CONSUMED or RETURNED_TO_OWNED_STOCK

New recovered gun:
PROVISIONAL -> PICKED_UP -> BANKED -> CLAIMABLE -> CLAIMED
PROVISIONAL/PICKED_UP -> LOST
```

Every transition needs one source ID, an allowed actor and a recovery rule. A state must not simultaneously be available for sale and already consumed.

### E4. Proposed SQLite additions

Use versioned, additive migrations. Table names are provisional.

| Table | Key or uniqueness | Purpose |
| --- | --- | --- |
| journey_runs | primary key run ID | Pinned run state and revision |
| journey_commands | unique run ID + command ID | Durable acknowledgements and changed replay rejection |
| journey_events | unique run ID + event sequence | Authoritative progression and eligibility events |
| journey_checkpoints | unique run ID + checkpoint ordinal | One completion per checkpoint |
| journey_roster | unique active asset lease where applicable | Run participation and deployment ownership |
| journey_xp_events | unique asset identity + source event | No duplicate experience |
| journey_drops | unique source drop ID | Pickup and claim lifecycle |
| journey_receipts | unique chain + transaction hash + log index | No duplicate redemption or ownership event grant |
| journey_stock | unique wallet scope + item definition | Owned and reserved opened supply quantities |
| journey_consumptions | unique run ID + command ID + item | Exact inventory charge and effect |
| journey_outbox | unique semantic source ID | Progress, claim and settlement submission recovery |
| journey_migrations | unique version | Database schema history |

Large checkpoint ordinals should not be sorted lexicographically as arbitrary decimal text. Choose an exact database representation and ordering strategy. Do not exceed SQLite integer or JavaScript integer limits silently.

An acknowledgement must describe committed state. Do not grant XP or consume stock in memory, send success and only then attempt to persist it.

### E5. Proposed transport messages

Client intentions:

- Start with mode, version, supported roster references and authenticated or practice identity.
- Resume with run identity and the appropriate session credential.
- Move with actor/squad reference, section reference and bounded local target.
- Drive with normalized local directional intent.
- Aim/fire with bounded direction and selected supported weapon.
- Change pose, dodge, prepare throw or throw grenade with valid inventory context.
- Pick up an existing visible source, request checkpoint activation, bank or explicitly quit.

Server responses:

- Session and pinned capability information.
- Acknowledgement containing command ID, success, reason and committed order.
- Bounded visible actor and nearby section snapshots.
- Approved combat, inventory, checkpoint and progression events.
- Pending versus confirmed asset and claim states.
- Explicit resume failure or unsupported rules response.

No start message accepts an arbitrary deposit as already paid. No pickup message accepts an arbitrary reward amount. No progress message trusts a client supplied XP total.

### E6. Ownership, signature and quote checks

Before a write or entitlement grant:

1. Match the actual connected account to the recorded principal.
2. Verify the configured allowlisted chain.
3. Verify collection code and relevant immutable configuration.
4. Resolve the exact asset identity and current owner or quantity.
5. Verify current deployment lease and supported build.
6. Verify nonce, expiry, source event and signed domain where applicable.
7. Bind current price, quantity and progress revision for purchases.
8. Recheck after confirmation before updating displayed authority.

Smart contract wallet support must be explicitly scoped. The existing message signature login is not automatically proof that ERC1271 contract signatures are supported. Do not advertise unsupported wallet types.

## F. Verification and release

### F1. Existing commands available now

Run from the repository root. These commands exist in the inspected package scripts:

```powershell
npm run typecheck
npm run build
npx vitest run --maxWorkers=2
npm run chain:compile
npm run chain:test
npm run armory:test
npm run survival:weapons:test
npm run survival:accounting:test
npm run survival:worker:test
```

Choose checks appropriate to the changed slice. Do not run every long proof after a copy edit. Unit and local service tests should be isolated from public deployment discovery using explicit test configuration, not by deleting real manifests or key stores.

### F2. Proposed new checks

These are targets to create during implementation, not commands that exist today:

- Journey generation and traversability tests.
- Long progression and resource disposal tests.
- Individual actor, formation and class balance tests.
- Perception, rear attack and fair search tests.
- Crouch, dodge, grenade and optional jump collision tests.
- Checkpoint, drop and experience replay tests.
- Durable command, inventory and terminal recovery tests.
- Soldier ownership, lease, progress and market local chain checks.
- Supply trading, redemption and exact consumption checks.
- Funded reward reservation, settlement and recovery checks.
- Browser input, Armory workflow and mode exit evidence.

Use existing tsx local contract fixture patterns and unique test ports. Do not attach tests to a live wallet or the real practice database by accident.

### F3. Failure matrix

| Failure | Required result |
| --- | --- |
| Client claims a checkpoint directly | Server rejects without a valid encounter and completion event |
| Same checkpoint crossed twice | One completion and one eligible reward source |
| Same soldier deployed twice | Second deployment rejected or existing valid lease resumed |
| Soldier sold after stale UI read | Old owner cannot deploy, progress or transfer it again |
| XP voucher replay | No second update |
| Listing changed during approval | Refresh and review required; no purchase under silently changed terms |
| Wallet rejects payment | No item transfer or gameplay entitlement |
| Receiver rejects NFT delivery | Payment and listing changes revert |
| Grenade command repeated | One inventory charge and one projectile |
| Medical effect rejected | No inventory charge |
| Service fails after pack burn | Confirmed redemption remains recoverable once |
| Server crashes after command commit | Retry returns committed acknowledgement |
| Generator yields an invalid section | Bounded retry or safe fallback, never a broken required route |
| Player quits | New unbanked rewards and provisional loot forfeit once under the approved policy |
| Service restarts | Restore pinned state; do not pretend the owner chose to quit |
| Reward backing exhausted | No unbacked funded entry or false wallet promise |
| Chain receipt is orphaned | Reconcile pending authority; never mint a second replacement by guesswork |
| Renderer loses its context | Visible recovery, input release and explicit resume behaviour |

### F4. Environment ladder

| Environment | What it proves | What it does not prove |
| --- | --- | --- |
| Local simulation | Deterministic gameplay and rule tests | Browser input, multiplayer or wallet settlement |
| Local server practice | Authoritative gameplay, persistence and reconnect | Actual token backing or public availability |
| Disposable local blockchain | Real contract state, ownership, payments and failure atomicity | Public network reliability or external deployment |
| Public testnet | Actual supported test network transactions | Real money value, mainnet readiness or audited security |
| Public game deployment | External browser and service operation | Correct gameplay or custody unless the other gates also pass |

### F5. Release evidence bundle

Include a current source/build identification, pinned rules, generator seed examples, sanitized test outputs, local bot recording, browser screenshots, performance traces, accepted human feedback, local chain receipts, any separate public receipts, migrations, rollback instructions and original asset provenance.

Do not include private keys, provider keys, wallet login tokens, signatures, personal information, complete environment files or private database exports in publishable evidence.

## G. Owner input and completion records

### G1. Human input schedule

| When | Required input |
| --- | --- |
| Before Step 01 completes | Starter squad size, active team cap, leader/death rules, signature equipment and prototype reward environment |
| Before final class tuning | Accept or revise the seven characters and intended strengths |
| Before Step 17 | Confirm whether jumping and height traversal are required for the first prototype |
| Before Step 23 deployment design | Soldier supply policy, purchase source and progression effects |
| Before Step 27 implementation | Consumable token, redemption, unused stock and timeout policy |
| Before funded integration | Reward budget, bank timing, carries, quit/death treatment and contract compatibility |
| At human playtest | Fairness, difficulty, control feel, clarity and enjoyment feedback |
| Before public testnet work if needed | Dedicated account ownership and any missing external access |
| Before presentation | Confirm the exact feature and environment claims being shown |

Documentation, independent local tests and reversible preparation can continue while an external access question is pending. Do not ask the owner to approve imaginary transactions or paste a private key.

### G2. Step completion record template

```text
Step:
Status: NOT STARTED / IN PROGRESS / VERIFIED / BLOCKED
Product decisions used:
Files changed:
Environment:
Actual commands run:
Observed results:
Negative cases checked:
Evidence paths:
Compatibility and migration result:
Remaining limits:
Reason the next dependent step may proceed:
```

### G3. Smallest complete prototype

The first complete Journey prototype should contain an actually repeating bounded route generator, three recognisable regions with implemented effects, at least three encounter types, responsive enemies, original individual soldier actors, one grenade type, crouch and dodge, seven approved class profiles, a clear checkpoint and bank loop, verified soldier experience, one working soldier trade, at least one implemented new gun, one finite supply consumption path and a truthful supported weapon recovery path.

If jumping, additional weapons, all supply categories or public testnet integration are incomplete, state that explicitly. Do not turn them into completed claims because they appear in this plan.

The final objective is a coherent journey from gameplay to verified progress to ownership and trade. Every step above exists to make that loop playable, testable and recoverable without discarding the existing project.
