# Local accounting and recovery evidence

Step 14 passed locally on 2 November 2026. This is local verification, not an audit or a public V2 release. The owner deferred Step 10 human and foreground performance evidence; those checks remain unverified.

## Accounting properties

Twenty four deterministic mixed ledgers were executed on a real disposable local EVM. Cases varied whole and fractional deposits, station earnings, zero through two explicitly accepted missions, success, failure, service abort, supply spending, base unit burn rounding, older independent claims and a top up after canonical signing. Each case checked exact credit, ten percent burn rounded down in base units, treasury recycling, custody equal to obligations, aggregate claims and total token conservation. Replayed settlement and claims were rejected. These cases use isolated EVM snapshots that are reverted between samples; they are not presented as a current public transaction history.

Seven distinct local wallets submitted competing zero deposit reward allocations into one finite two hundred unit treasury in the same mined block. Six reservations totaling one hundred eighty succeeded; one transaction reverted because only twenty units remained. All six allocations later released their backing through actual hard timeout transactions. No reservation depended on another player's deposit or future shop proceeds.

Two hundred fifty six separate one base unit earning authorizations exercised the entire bounded history. Existing claims remained payable, unused reservations were released, and the next funded authorization was rejected. At the exact rolling expiry boundary an authorization was admitted again. This tests the storage bound separately from the two hundred whole unit wallet limit tested in Step 12. No calendar midnight reset is used.

## Recovery boundaries

Eight new real chain cases passed. They cover a rollback before canonical preparation commits, restart with signed bytes saved before the first broadcast, an orphan before the required confirmations, a deeper rollback after published confirmation, corrupt gameplay and canonical checkpoints, a verified active service interruption, a failure while journaling an applied supply and a deleted gameplay row.

A preconfirmation orphan is reconciled and the identical transaction can be rebroadcast. A previously published confirmed result that loses canonical confirmation is moved to recovery required. New funded entry stops and the associated run cannot keep playing from an unbacked state. The worker audits completed jobs in bounded batches, so a deep reorganization may be detected on a later poll rather than immediately. The independent contract timeout remains available. The two block confirmation policy is a local soft confirmation policy, not irreversible finality.

Supply application and charge journal failure rolls back the combat effect, charge and command acknowledgement together and pauses the run for recovery. Initial gameplay activation now has a permanent separate activation marker committed with its first checkpoint. A missing gameplay row cannot reuse an old allocation to receive fresh health, ammunition or field credit. Recovery uses the contract instead of starting the run again.

Corrupt records never produce a new result signature. A verified prepared canonical result survives a restart unchanged. An interrupted active allocation that has no committed result conservatively aborts after chain verification and returns the full current deposit, canceling current provisional earnings, spending and mission consequences. This full outage protection can erase an unfinalized known failure during a genuine service outage. Healthy departure with a valid committed result does not require another player approval. Earlier settled claims remain independent under both policies.

## Receipt proof and regressions

The final contract source has actual deployments and thirty five confirmed local receipts in evidence/v2-step12-local-vault.json. They cover extraction, supply burn, accepted success and failure, carry, revocation, independent claims and exact hard timeout. evidence/v2-step13-local-worker.json adds twenty confirmed local receipts with actual browser closure, a real worker process crash after broadcast, disk recovery and an independent claim. Both reports include actual addresses, code hashes and balances. These are separate disposable chains; their balances are never combined into one chain claim. The evidence files were checked again for successful status and conservation.

Fresh legacy regressions passed: twenty six escrow cases, eight armory and salvage cases, and two wallet funded server integration cases on disposable local chains. The original three contract sources, original generated ABIs and lockfile have no content diff. All 161 application cases and strict production build passed. Funded HTTP authority checks reject missing login, wrong origin, extra financial fields and client submitted results. The publishable file secret scan passed.

## Commands and evidence interpretation

Run `npm run survival:accounting:test` for the accounting and recovery files. The recorded accounting checks used `npx tsx --test packages/contracts/test/survival-accounting.check.ts` for the twenty four samples and history boundary, followed by `npx tsx --test --test-name-pattern="seven simultaneous" packages/contracts/test/survival-accounting.check.ts` after correcting an out of range local test account. All three cases then had passing evidence. The final eight recovery cases passed with `npx tsx --test packages/contracts/test/survival-recovery.check.ts`.

Other fresh commands were `npm run chain:test`, `npm run armory:test`, `npm run testnet:test`, `npm test -- --maxWorkers=1 --testTimeout=20000` and `npm run build`. The script name testnet:test is historical; these two integration cases use a disposable local EVM and do not prove a public V2 deployment.

No new dependency, external asset, public contract, paid service or mainnet transaction was introduced by this step. Step 15 must separately verify public companion deployments, free gas and actual browser wallet operation. Public worker uptime and hosting remain unproven.
