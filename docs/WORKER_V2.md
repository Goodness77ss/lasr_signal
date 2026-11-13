# Local automatic settlement worker

Step 13 passed locally on 2 November 2026. Step 10 human playtest and foreground performance evidence remain deferred by the owner. No public worker, public V2 deployment or browser wallet signing is claimed.

## Authoritative source

FundedSurvival is an opt in local service using the existing combat, station, assault, field support, supply, mission and extraction functions. It pins survival 2.7.0, the actual vault, token, treasury, rules, runtime code hashes and three distinct deployment, gameplay signing and gas roles. The transport accepts only local chain 31337. The existing survival page remains free server practice under 2.6.0. Supplying explicit funded service options to buildServer enables separate authenticated routes; no existing run or simulated balance becomes funded.

Entry is signed only when worker, gas, chain and reserve checks pass. The player explicitly approves the exact token allowance and opens the allocation. The service checks the onchain player, suballocations and canonical confirmed opening receipt before creating gameplay. Wallet login and exact origin checks protect funded entry, status, pause, mission consent and controls. There is no client submitted reward or result route. Orders are deduplicated and journaled with their outcomes.

Mission acceptance requires a server permit followed by a real player transaction. Gameplay pauses while receipt confirmation is pending. Chain log reconciliation discovers a mined consent even if the browser closes before reporting its receipt. Unused expired permits eventually release the wait. Each accepted mission maps to its exact onchain index. Closing waits for any outstanding consent to be reconciled. Accepted stakes resolve through the existing authoritative mission rules.

## Durable monetary boundary

The earliest active checkpoint, terminal event, disconnect departure or chain wall safety trigger freezes economic commands. Gameplay state and the immutable canonical result are stored in the same SQLite transaction. The queue uses prepared, signed, submitted, confirming, settled, retrying and recovery required states. The authorization is persisted before a gas transaction is built. Signed gas transaction bytes, nonce and hash are persisted before broadcast. These sensitive records stay in the private runtime database. Public status and evidence contain only hashes and state, never authorizations, transaction bytes or keys.

The worker checks the contract finalization before every attempt. It verifies canonical receipts, matching finalization digest and the configured confirmation count before reporting settled. A one minute fenced lease serializes each dedicated gas wallet. A crashed process leaves that lease until expiry, so takeover waits instead of concurrently spending the same nonce. A retry rebroadcasts identical bytes or increases the price at the same nonce for the same logical job. It will not use a consumed nonce with unknown provenance or let another job replace an unresolved nonce.

RPC, identity, insufficient gas, expired authorization, corrupted journal, changed allocation and unknown finalization have explicit safe states. New funded entry stops when health is inadequate. Recovery required jobs need operator reconciliation and are not automatically reauthorized. The independent contract timeout and player claims remain available. Error responses suppress provider transaction payloads.

After a confirmed carry renewal, only the new onchain allocation and current accounting segment change. Health, ammunition, field credits, combat tick, difficulty, prior station eligibility and supply cooldowns remain. Earlier claims stay in the vault. Default carry permission is zero. Current service support pauses a banked run rather than exposing a later explicit continuation UI. The contract continuation path was verified in Step 12.

## Top up race correction

Integration found that requiring exact equality between signed and current deposit let a player invalidate a known failed stake by adding a deposit after closure. The local vault now treats the signed deposit as a lower bound. Deposits can only increase within the same allocation, and credit is always computed from the full current stored deposit. The signed station earnings, spending, accepted mission masks, failure, segment and sequence remain binding. A later top up cannot erase a known charge. Altering the signed amount still invalidates its signature; a signed amount above custody is rejected. Twenty three vault cases passed after this correction, and the 35 receipt Step 12 proof was regenerated with the new runtime code hash. No public deployed contract was altered.

Confirmed active top ups are read into the funded accounting snapshot. Whole units are usable by the current supply catalog. Any fractional deposit remainder remains in custody and is included in contract settlement or timeout credit; it is not rounded away.

## Actual evidence

Six local chain integration cases passed: accepted mission departure without a connected player, restart after actual broadcast, the racing top up, empty test gas and RPC failure, a real pending transaction replacement, and wall safety carry preserving the observed combat state. Thirteen application worker cases cover durable boundaries, immutable replay, lease fencing, confirmations, orphaned receipts, corrupt records and recovery states. The full 159 case application suite and strict production build passed.

evidence/v2-step13-local-worker.json contains twenty confirmed local receipts and actual browser WebSocket connection and closure events. The proof uses an explicitly authored combat fixture and SDK local wallet transactions for entry and consent. The browser connected through the production funded route with an active mission and five locked units, then its tab was actually closed. After sixty separately advanced wall and chain seconds, the server recorded departure and one failed stake. A child worker persisted and broadcast the settlement, exited at the broadcast boundary, and a new process waited for lease expiry and confirmed the same job from disk. Exactly one gas transaction finalized it. No additional player transaction approved settlement. The recorded player independently claimed thirty five units afterward. The final player ninety five plus treasury two hundred five equal the original three hundred token supply; vault and reservation balances are zero.

evidence/v2-step13-browser-connected.png shows the actual connected local proof browser. It does not show a natural human mission, browser wallet signing or foreground combat performance. The disposable chain and proof HTTP service stop after completion. Any public operation needs Step 15 evidence and an always running service.

## Commands

Run `npm run survival:worker:test` for the six real local chain cases. Run `npx vitest run tests/survival-worker.test.ts --maxWorkers=1` for the thirteen queue cases. Run `npm run survival:worker:proof` for the interactive local browser closure proof. Open the printed loopback URL, connect only the proof tab, then close that tab. Allow a minute for the deliberately crashed worker lease to expire. Each command uses a disposable local chain; existing nodes and practice sessions are preserved.

The worker uses installed ethers 6.17.0 with no new dependency. Offline transaction signing and provider receipt queries were checked against the official [wallet documentation](https://docs.ethers.org/v6/api/wallet/) and [provider documentation](https://docs.ethers.org/v6/api/providers/). Node remains 24.16.0 and solc remains 0.8.38. A fresh private online database backup and restored copy passed before adding this schema.

## Remaining limits

This is bounded gameplay signer attestation, not a trustless proof of combat. An interrupted active service checkpoint is conservatively aborted after chain verification; uncommitted provisional effects are canceled and the full current deposit is recoverable. A verified prepared canonical job survives restart instead of being rewritten as an abort. The full outage refund tradeoff can cancel a known but not yet finalized failure. Adverse case and property verification is Step 14. Public deployment, the complete browser wallet flow and public service availability are separate gates. Free practice remains enabled without custody.
