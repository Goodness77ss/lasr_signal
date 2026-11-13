# Survival V2 rules

Step 5 revision: survival-2.2.0 enables simulated station eligibility for new practice runs. Protocol remains survival-2 with a distinct canonical rules hash. Old rules 2.0.0 and 2.1.0 remain supported. Capture five and defense three resolve once per key, with 24 units per cycle, 120 station units per run and 200 per rolling identity window. Carried stations require a fresh eligible assault; no passive holding or recapture retries. Simulation cycles derive from cumulative active ticks, not a resettable segment label. This slice uses service wall time for its simulated rolling counter; later funded rules still require chain time and vault reservations. No actual asset is issued. STATION_REWARDS_V2.md defines the exact evidence and limits.

Step 4 revision: new server station runs pin `survival-2.1.0`, including the validated director configuration and its authored spawn zones in the canonical rules hash. The base `survival-2.0.0` configuration remains supported for existing checkpoints and retains its original hash. No active run silently gains assaults. Director cap is three living enemy squads, two assigned attackers per assault, five seconds preparation, first preparation at 25 active seconds and 35 seconds between resolutions and the next attempt. Capacity retries every five seconds. Tier increments each 120 active seconds up to six, changing approaches and existing gun composition without stat scaling. See ASSAULTS_V2.md for exact implementation and device evidence. Financial helpers and disabled economic flags remain unchanged.

Step 2 specification and tested accounting helpers, 1 November 2026. These helpers do not implement custody or automatic transaction submission. V2 uses protocol `survival-2`, rules `survival-2.0.0` and a canonical Keccak hash over configuration, inherited combat rules and the complete map. V1 relay and salvage hashes remain unchanged.

## Configuration and pinning

`packages/sim/src/survival-rules.ts` is the typed source. All entry flags default false. A service may enable station practice without enabling rewards, missions or vault. Clients cannot choose these flags. Every run must store its complete validated immutable rules, protocol and hash; restart must reject unknown or changed identities rather than reinterpret them with current defaults. Runtime flags govern new entry, while an existing run retains its pinned rules and recovery paths. A changed configuration produces a different hash. Economic defaults remain proposals for practice testing.

Three stations capture in five seconds within an inclusive three unit radius. Living suppressed squads contest but cannot progress capture. Multiple squads never accelerate capture. Empty capture decays one tick per tick. Death resolves before capture. Friendly and hostile ownership persist until changed. Legacy relay scoring stays separate; no score threshold ends V2.

Twenty active ticks equal one gameplay second. Combat, difficulty, capture, missions and extraction advance only while authoritative gameplay advances. Legitimate pauses stop those ticks. Chain time never stops. Disconnect grace is sixty wall seconds; after unresolved departure active missions fail and the canonical terminal segment queues. Proven service corruption aborts with deposit recovery rather than invented results. Durable departure resolution and queue implementation belong to later steps.

## Reserve and ledger

Default allocation is a suggested 40 tWIF, selected explicitly from zero through 100. Per segment reserve is 30: 24 reserved for station earnings and six reserved for mission bonuses. A lower actual funded reserve must lower disclosed eligible rewards before entry. One station cycle per economic segment can earn capture five plus defense three at each of three stations. Eligibility requires unique run, cycle, station and kind keys; a carried station needs a new real qualifying defense. No passive reward. First five eligible cycles total at most 120 station tokens. Successful bonuses total at most 30 per run. Aggregate run cap is 150. Renewals never reset these counters.

Funded wallet authorizations have a maximum of 200 earned tWIF in a rolling 86400 chain second window. At a new authorization timestamp T, sum committed authorizations with timestamps strictly greater than T minus 86400 through T inclusive, including reserved outstanding authorizations. No midnight reset. Timeout releases only that segment's unused reservation; settled earnings remain counted until they age out. One funded run per wallet. Onchain enforcement remains Step 12 work.

All token ledger amounts are bigint base units with eighteen decimals. Field credits are a distinct integer asset. The twenty credit allowance cannot fund stakes, mint NFTs, buy listings, transfer or increase token claims.

Let D be deposit, E station earnings, B successful bonuses, S applied supply spending, F failed stakes and L current locked stake. Available funds equal D + E + B minus S minus F minus L. Normal final credit equals D + E + B minus S minus F and requires L = 0. Returning a successful stake removes L; it never increases E or B. Rejected or unapplied supplies have no S entry. Bonus eligibility must fit its own reserved capacity. A future bonus cannot fund acceptance.

Supply burn is floor(S times 1000 / 10000) in base units. Treasury receives remaining S, failed stakes and unused reserve. For reserve R, custody identity is D + R = player credit + burn + recycled treasury. This only describes V2: old shop burns and marketplace seller payments remain unchanged.

| Scenario | D | E | B | S | F | Final player credit |
| --- | --- | --- | --- | --- | --- | --- |
| Worked funded segment | 40 | 24 | 6 | 15 | 5 | 50 |
| Zero personal deposit | 0 | 5 | 0 | 0 | 0 | 5 |
| Successful five stake mission after first capture | 40 | 5 | 3 | 0 | 0 | 48 |
| Failed five stake mission after first capture | 40 | 5 | 0 | 0 | 5 | 40 |
| Infrastructure abort or hard timeout | 40 | cancelled | cancelled | cancelled | cancelled | 40 |

For the first row reserve is 30, custody 70, burn 1.5, treasury 18.5 and player credit 50. For success the five stake unlock is already contained in 48, not added again. Abort and timeout recover the full unsettled deposit, cancel unresolved spending and provisional rewards, release reserve and preserve earlier settled claims. A valid submitted result and timeout race is resolved by the vault's single finalization, not a browser choice. Already settled amounts cannot be clawed back.

## Automatic submission and deadlines

The earliest applicable gameplay, terminal, departure or chain safety condition begins closing. The dedicated worker pays test gas and submits the bounded canonical server signed result. Any holder of that valid result may also submit. The contract records credit for its stored player, never an arbitrary sender. The player does not approve a loss result. Initial allocation, top ups, mission acceptance and market actions still require explicit consent. Pull claims stay independently available.

| Boundary | Behavior |
| --- | --- |
| Active tick 5999 | Segment may remain open if no earlier trigger |
| Active tick 6000 | Pause economic actions and begin checkpoint closure |
| Valid death, extraction or surrender | Queue terminal closure immediately |
| Disconnection before sixty wall seconds | Pause gameplay, chain clock continues |
| Disconnection at sixty wall seconds | Resolve departure and queue result |
| Chain activation plus 600 seconds | Begin safety close even if active ticks paused |
| Before activation plus 900 seconds | Valid unexpired result may finalize |
| Exactly activation plus 900 seconds and later | Result rejected; full timeout recovery available |
| Submission pending or retrying | No new economic actions; show actual persisted state |

Timeout takes precedence over a late terminal event. Proposed settlement margin is sixty seconds minimum. Healthy operation closes at ten chain minutes, leaving five minutes before timeout. No clock guarantees RPC inclusion. No public automatic operation claim is valid until an always available durable worker is actually running and verified.

Only Hold the Signal is in initial scope: five stake, three bonus, twenty second offer window, at least ninety active seconds before first offer and 120 seconds between offers. One active mission. Sixty second duration includes at most five seconds preparation and thirty seconds holding after assault arrival. A full offer plus mission must fit within remaining active segment time and leave strictly more than sixty chain seconds before hard timeout. Revalidate at acceptance. Do not turn a scheduling overlap into player failure; suppress the offer or abort and unlock. Combat death precedes objectives; completion precedes expiry on the final eligible tick.

## Renewal consent

Default is bank and stop economic funding. An explicit selection may authorize a bounded carry amount from this segment's newly settled credit only, to the same run and currency. Vault enforcement must cap it by stored consent and actual credit; excess becomes pull claim. Never sweep older claims or wallet balances. Revocation affects future renewals. Missing permission, reserve or worker gas banks the segment and offers unfunded continuation or explicit fresh allocation. Gameplay health, ammunition, difficulty, stations and cumulative caps do not reset at a checkpoint. This is the required later contract behavior, not a claim that a vault exists now.

## Evidence

`tests/survival-v2-rules.test.ts` covers validation, immutable pinning, canonical hashing, preserved salvage identity, split reserve bounds, successful stake accounting, zero deposit, field asset rejection, base unit conservation, exact close boundaries, disconnect grace and offer time fit. `npm run build` must pass before Step 3. No new receipts, public deployment or worker evidence is implied by these tests.
