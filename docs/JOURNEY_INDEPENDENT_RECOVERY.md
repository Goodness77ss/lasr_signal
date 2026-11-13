# Independent Journey recovery

Implemented 11 November 2026. The Journey production bundle was generated with `npm run build -w @last-signal/web -- --mode journey`. No tests, type checks, browser review or chain integration runs were performed for these changes.

Open `/journey-recovery.html`. This page does not fetch game API endpoints. It needs the hosted static files, an injected wallet and the disposable local chain RPC.

## Funded reservation

Use the saved public reward-pool manifest, or paste `reward-pool-deployment.json` from the private local launch directory. The manifest contains public addresses and bytecode hashes only. Enter the exact 32-character run identity from the owned roster draft. Connect the same wallet on chain 31337 and review the recipient, contract identity, chain time, deadline and current paid amount. After expiry, RELEASE EXPIRED RESERVATION calls the pool's permissionless timeout directly. This pays no unbanked reward and releases the backing. REVOKE POOL CURRENCY ALLOWANCE sets the exact verified pool's currency allowance to zero. Normal funded entry does not require a player currency allowance or deposit.

## Weapon claims

Armory claim review saves the already-issued claim in this browser session for the recorded recipient. The independent page can load it without the service, verify its EIP712 signature, bytecode, rules, recipient and exact build, then submit it before expiry. Previously prepared JSON can also be pasted. Signatures stay in runtime/session data and must not be committed to the repository or submission evidence.

Expired sources may be renewed through the service into their original pinned destination; the old voucher is archived privately. Renewal preserves source, recipient, run, kind, build and recovery rules. A consumed source cannot mint again in the same contract. Registry changes cannot redirect an issued source.

## Receipts and changes

The independent page accepts a submitted or replacement hash and checks the canonical receipt and exact source event after two confirmations. Wallet account/network changes clear cached authority and require a new review. Receipt recovery sends no transaction. Two local confirmations are not finality.

## Worker durability

The server records a unique owner/run/destination intent before signing or broadcasting an allocation. Its worker revisits pending intents, attaches confirmed reservations even after a lost first reply and applies normal timeout handling. Reserved identities cannot be reused as practice. Terminal confirmed/timed-out records are revisited; missing canonical source events change the state to ORPHANED and clear displayed confirmed payouts rather than silently allocating a second reward.

Remaining gates: adversarial proof of concurrency, replacement and restart; automatic reconciliation of orphaned terminal allocations; safe cancellation of an allocation intent that never acquired backing; rendered wallet flows; independent soldier-progress and pack-redemption UI while offline. Existing original recovery routes remain available. Step 32 is incomplete.

## Prepared soldier progress and pack receipts

Added 11 November. The progress panel now has a separate PREPARE PROGRESS FOR REVIEW action. It retains the issued voucher, signature and public collection metadata in the recipient's browser session before submission. The independent page can load that update, inspect current source usage and authority, apply it through the checked progress wallet, or inspect a source-bound submitted/replacement receipt after two canonical confirmations. Applying progress and confirming it to the service are separate steps; the same transaction hash can be reconciled when the service returns.

The independent page can also load a saved pack redemption and inspect its exact owner/class/quantity/policy receipt through the existing checked SupplyWallet. It provides the transaction/log proof for later stock reconciliation. It never burns a new pack or invents service stock. Saved public supply metadata can revoke approval to the pinned pack market directly.

Corrected the browser manifest chain ID normalization for soldier, progress and supply adapters. New service configuration uses numeric chain IDs for these wallet manifests; browser constructors also normalize older string-valued configuration.

These new flows are source implementations with a generated frontend bundle, without new tests, strict type checks or browser/chain acceptance. Remaining gates include automatic orphaned funded settlement reconciliation, safe cancellation of a never-backed intent and the complete combined demonstration.

## Unsigned allocation cancellation and canonical source reconciliation

Added 11 November. Cancellation and transaction signing use the same serialized worker queue. An owner can cancel only a pending intent with no signed broadcast record, no confirmed allocation and no admitted gameplay run. The final chain read must show no allocation. Cancellation is recorded transactionally and queued opening requests recheck that record before signing or storing authority. Signed or broadcast requests cannot be cancelled through this path; they retain independent timeout recovery.

The LOCAL REWARDS panel exposes allocation/settlement refresh, original-source reconciliation and unsigned cancellation. Successful cancellation can return the same owner's unadmitted draft to practice with its existing exact run leases. A cancelled identity stays bound to the original owner. The client resets a pending admission only after the service confirms cancellation and only if no run snapshot was observed.

Canonical terminal records are revisited. Lost confirmations clear displayed confirmed payouts. If the original allocation is still canonical with the same recipient and deadline, reconciliation restores its original terminal outbox and retransmits the same recorded signed transaction. It does not open a second allocation. If the allocation itself vanished or its pinned terms changed, it stays explicitly uncertain rather than extending the deadline or promising new backing. A different canonical settlement is marked as a mismatch. Public recovery status returns actual transaction hashes, nonce records and bounded source history, never signed raw transaction data.

One run's settlement failure no longer aborts settlement processing for later runs. Nonce replacement that consumed the original service transaction still needs independent timeout or further operator reconciliation; no replacement hash or fresh payout transaction is invented. The new schema is JourneyStore migration 9 plus conditional funded worker tables. These changes remain unverified by tests or chain acceptance.
