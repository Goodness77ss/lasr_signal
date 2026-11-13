# Simulated station reward eligibility

Step 5, 1 November 2026. New server station runs pin rules `survival-2.2.0`. All values here are simulated whole practice units following the proposed tWIF reward quantities. They are not ERC20 base units, wallet reads, actual tokens, transferable assets, NFT rewards or chain claims. There is no vault or automatic settlement worker. Existing 2.0.0 and 2.1.0 runs keep their original rules and do not gain a ledger.

## Eligibility

A first qualifying capture earns five simulated units. A qualifying defense earns three. A unique run, cycle, station and reward kind key can resolve once. The service obtains ownership changes from authoritative simulation, not a browser StationCaptured message. Losing and recapturing a station never grants another capture reward under the same key. A cap denied eligibility attempt also consumes that key, so recapture cannot retry it after a budget becomes available.

Each cycle is one interval of 6000 active run ticks, or 300 active seconds. Tick zero through 5999 belongs to cycle one; tick 6000 starts cycle two. Pauses stop active ticks. Cycle boundaries in this slice do not bank funds, renew custody, refill ammunition or change gameplay. Those economic checkpoint features remain later work. Five reward cycles allow at most 24 station units each and 120 per run. Endless survival continues after eligibility is exhausted. The total reward cap of 150 also bounds the station path, but no mission bonus exists yet.

At a cycle boundary, friendly stations are marked carried. They never receive passive capture emission. Their new cycle capture key requires defeating a fresh qualifying assault that started in that cycle. Losing and recapturing carried ground does not replace that requirement. The same qualifying defense can consume its separate capture five and defense three keys, for at most eight units at that station.

A defense needs two real director assigned attackers with legal spawn origins and initial routes, an assigned enemy entering the ten unit engagement zone, and actual player damage or authorized defending presence. The assigned attackers must be defeated, and the station must have remained friendly continuously from assault activation for at least twenty active seconds. Suppressed living enemies remain unresolved. Unrelated kills do not count. If the attackers die before twenty seconds, the ownership hold continues until the boundary. Ownership loss, invalid routes, stalls, ordinary death or a missing tick invalidates the pending defense. An old completed assault cannot pay again in a later cycle.

The canonical ownership and pending defense proof state advances every tick. It does not depend on the renderer's bounded event history. Recent damage events can establish an assigned attacker's final engagement on its death tick. Combat death resolves before reward evaluation. Already recorded simulated earnings remain in history after death; no new eligibility is evaluated after terminal state.

## Identity and rolling budgets

The rolling allowance is 200 simulated station units in the last 86400 wall seconds, with events strictly newer than the window cutoff included. Exact cutoff events expire. This local simulation uses the service clock and refuses backwards clock movement. It is not an onchain timestamp or funded wallet authorization. Future funded caps still require chain based reservations and vault enforcement.

Free practice receives a server issued opaque practice identity. The browser normally keeps that token in localStorage and reuses it across new runs. The database stores its hash. Clearing browser storage, changing browsers or racing first anonymous entry can create another identity; this is not a person or wallet limit and is not presented as one. No device fingerprint is collected.

Optionally, check Use existing wallet login for simulated cap before starting. This reuses the existing origin scoped wallet login verifier. The server derives the wallet scope from the verified session, never a client supplied wallet address. All sessions and runs for that wallet share the same simulated rolling counter. Invalid wallet sessions fail; they do not silently become wallet scoped practice. No new login signature, approval, transfer or chain call is required by this station page. Actual browser wallet signing remains unverified; the existing WalletAuth adapter is exercised in tests with a disposable in memory wallet.

The rolling counter is read inside the same SQLite write transaction that inserts each eligible event. A second run cannot consume an earlier available balance after another run exhausts it. New runs reset their own cycle and run allowances, while their identity allowance remains shared. Future mission bonuses must share the combined rolling authorization budget when introduced; this Step 5 table currently contains station events only.

## Persistence and recovery

The additive schema creates survival_practice_identities and survival_station_rewards, plus a scope and time index. The reward table has a primary key over run, cycle, station and kind. It stores the canonical event, simulated integer quantity, identity scope and service timestamp. It does not store wallet signatures or private keys. The ignored database backup and restored copy passed before schema work at .runtime/backups/2026-11-01T203437.788Z-8cb0a5f6-d5da-454f-801e-8b406c8f45f0.

For a new ledger run, simulation, director, proof state, eligibility attempts, reward inserts and checkpoint commit together each tick. A failed checkpoint rolls back the reward row and restores the prior in memory tick before pausing. Delivery occurs after commit, so a broken socket cannot undo an already committed ledger. Reconnect and restart verify every stored reward payload against the checkpoint before restoring it. Missing or inconsistent records refuse recovery instead of inventing a fresh balance. Legacy modes retain their existing persistence behavior.

The full event history has at most thirty successful station keys per run. It is independent of the director's bounded diagnostic history. Pending defense proof is kept only until resolution or invalidation. The browser receives the current total, current cycle key status, eligibility or cap reasons, rolling allowance and eight recent display entries. Those recent entries are a UI window, not the full durable history.

## Actual verification

All 99 application cases pass, including nineteen new reward and recovery cases. The new cases cover exact capture and defense values, unique keys, recapture rejection, carried ownership, no passive holding, invalid evidence, living attackers, uninterrupted ownership, death ordering, old assault reuse, five cycle and run limits, shared identity limits, exact rolling cutoff, backwards clock safety, authenticated wallet scoping, actual director combat, rollback, corrupt journal recovery and restart. Strict production build also passed.

Actual browser play routed the starter to A and recorded one five unit capture. At 38 active seconds the run was paused with 75 HP, A contested and three enemies alive. The expanded panel showed five of 120 units, one capture entry, no defense entry and 195 remaining anonymous identity units. The actual service process was stopped and restarted, then RECONNECT restored the same paused run and exactly the same one capture. Images: evidence/v2-reward-capture.png and evidence/v2-reward-restarted.png.

The three unit defense path was verified through actual deterministic simulation combat and eligibility tests, not a new browser defense video. No public chain transaction, funded reward, token balance read, NFT mint, browser wallet prompt, physical phone play or new FPS measurement is claimed. The earlier Step 4 performance sample belongs to rules 2.1.0, before this per tick ledger persistence change.

## Launch

From last_signal, start separate PowerShell terminals:

```powershell
$env:SURVIVAL_STATIONS_V2='true'
npm run server
```

```powershell
npm run dev -w @last-signal/web -- --port 5174 --strictPort
```

Open http://127.0.0.1:5174/survival.html and START PRACTICE for a new 2.2.0 run. Capture A, then open SIMULATED STATION REWARDS. Old runs still show their original ledger disabled state. Health, ammunition and station ownership remain ordinary server gameplay. Step 6's field allowance, Step 7's run spending and later funding remain incomplete.
