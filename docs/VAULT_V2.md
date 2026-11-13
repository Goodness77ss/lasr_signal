# Local SurvivalRunVault

Step 12 passed locally on 2 November 2026. The owner deferred the missing human playtest and foreground performance checks from Step 10 and authorized continuation. Gameplay tuning remains provisional. The additive vault is implemented and tested locally. Funded browser entry, a durable submission worker and V2 public deployment are not implemented by this step.

## Identity and consent

The vault pins original currency, finite treasury, gameplay signer and rules hash at deployment. EIP712 domain LAST SIGNAL SurvivalRunVault version 2 binds chain and contract. Entry, mission permit and result structs bind player, currency, run, segment, sequence, rules and expiry, with the relevant ledger or allocation terms. Public TypeScript types and the contract digest functions agree in tests. Existing token, MatchEscrow, GunArmory, V1 hashes and deployments remain unchanged.

Provisional local funded rules are survival-2.7.0. The ordinary server practice service continues using survival-2.6.0 and rejects funded rules instead of pretending that simulated balances have custody. No existing run silently gains funding.

Only the recorded player can open an entry or top up. Deposits are zero through one hundred mock units; zero deposit requires actual treasury backing. The selected reward suballocations are at most 24 station units and six bonus units and must fit free capacity. Initial deposits and top ups require exact available token allowance and exact balance changes. Top ups do not extend the deadline. Entry nonces, permanent run identity and one active funded run per wallet prevent duplicate allocation.

## Missions and exact credit

Mission acceptance is an explicit player transaction with a bounded server permit, not an automatic result approval. It locks the ability to charge one five unit stake, while reserving the three unit bonus from that segment's existing allocation. A mission cannot fund its own acceptance from its future bonus. At most two missions can be accepted in a segment, matching the upper bound of the current offer schedule. Previous mission resolutions and observed ledger floors cannot be revised when accepting another mission.

Results resolve every accepted mission by its acceptance index into mutually exclusive success, failure or service abort masks. Bonus must equal three times accepted successes, failed stake five times accepted failures. Unaccepted bonuses or failed stakes are rejected. Returning a successful stake is not new income. These bounds do not prove tactical truth; the gameplay signer remains trusted for combat evidence within the onchain limits.

For a normal result the contract computes credit = stored deposit + station earnings + successful bonus minus applied spending minus failed stakes. It does not accept a caller selected recipient or payout. Treasury transfers only actual earned rewards to the vault and releases unused backing. Applied supplies burn floor(spending / 10) in base units; remaining spending and failed stakes recycle to the fixed treasury. Exact burn and transfer checks reject fake burns or failed transfers without erasing obligations.

## Claims and renewal

Any holder of a valid result may submit it, including a separate gas wallet. A known failed stake needs no second player signature. This contract capability does not itself implement the Step 13 automatic worker.

Credit is a pull claim for the recorded player. Claim state updates before transfer and restores atomically if the transfer fails. Prior claim balances remain independent of new allocations and timeout recovery.

Default carry permission is zero. The player may explicitly select a cap no greater than one hundred and revoke it for future renewals. At a checkpoint, carry is at most that cap and this segment's newly settled credit. Earlier claims and unrelated wallet funds cannot be swept. Excess becomes a pull claim. If new reward capacity, cumulative capacity or rolling capacity is unavailable, the valid checkpoint banks instead of reverting. A later explicit allocation can reopen the same nonterminal run at the next segment, preserving cumulative totals and identity. Partial checkpoints can pass five economic segments; the actual reward limits, not the number of partial closures, remain binding.

The contract has no health, ammunition or difficulty reset. Gameplay continuation must preserve those values when Step 13 integrates canonical segment lifecycle. A token checkpoint does not extract collectible loot.

## Clocks and limits

Chain activation fixes a nine hundred second deadline. Valid results require current time strictly before both signed expiry and stored deadline. At the exact hard boundary, any caller can recover the full unsettled deposit to the player's claim and release reward backing. Provisional earnings, spending and mission consequences are canceled on this full timeout policy; old settled claims remain. Infrastructure abort has the same full current deposit protection. Healthy mission abort is separately represented by a zero charge mission mask while retaining validated ordinary segment earnings.

Chain age of at least three hundred seconds is a necessary checkpoint condition; the server must additionally prove three hundred active gameplay seconds or the earlier wall safety trigger. Mission acceptance needs at least ninety chain seconds and enough chain room for its duration before the ten minute safety close. These checks do not replace the authoritative active clock.

Cumulative station earnings are capped at 120 and successful bonus at thirty per run. Funded wallet capacity is at most two hundred per rolling 86400 chain seconds. Authorization time means the chain activation time when backing becomes committed. Settled earnings remain counted while activation time is strictly greater than now minus 86400. Outstanding reservations remain counted even when old until resolved or timed out. No midnight reset occurs. The bounded history holds up to 256 unexpired earning authorizations; at capacity new funded entry and renewal stop while claims and current settlement remain available.

## Step 13 integration correction

A top up after canonical signing no longer invalidates known charges. The signed deposit is a lower bound on the current stored deposit, which can only increase before settlement. Credit always includes the full current deposit. Earnings, spending, accepted mission masks and failed stakes remain signed and bounded. The twenty three vault cases and 35 receipt proof were rerun for this final source. See WORKER_V2.md for the discovered race and actual funded worker integration. Historical descriptions below of the worker being future work refer to the Step 12 boundary.

## Verification and remaining work

Twenty three local contract cases passed. They cover exact approvals and zero deposit, independent result submission, EIP712 digest and replay domains, explicit mission consent, future bonus rejection, exact success and failure, supply burn and rounding, top ups, default bank, bounded carry, old claims, revocation, reserve exhaustion fallback, later explicit continuation, cumulative caps over checkpoints, the exact rolling boundary with old pending reservations, signed expiry, hard timeout, infrastructure abort, fake burn and failed claim retry. The 146 case application regression and strict build also passed before the final partial checkpoint cap clarification; the latest contract suite includes that clarification. No funded run is enabled in the practice server.

The final source proof passed with 35 confirmed local receipts for extraction, supply burn, explicit mission success and failure, bounded renewal, revocation, independent claims and exact deadline recovery. The final strict build and publishable file secret scan passed. The proof file is evidence/v2-step12-local-vault.json, with actual local addresses, code hashes and receipts. Scripted result submission is not evidence of a durable worker or a browser wallet interaction.

Run `npm run survival:vault:test` and `npm run survival:vault:proof` from last_signal. Each uses its own disposable local chain and stops it afterward. Practice remains available using `$env:SURVIVAL_STATIONS_V2='true'; npm run server` and `npm run dev -w @last-signal/web -- --port 5174 --strictPort` in separate terminals at http://127.0.0.1:5174/survival.html.
