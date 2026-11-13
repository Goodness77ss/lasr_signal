# Local finite supplies

J12 approves the written lifecycle in JOURNEY_SUPPLY_POLICY_PROPOSAL.md. Step 27 is complete. Step 28 remains in progress.

JourneySupplies is a separate local chain ERC1155 collection. Four unopened pack classes each redeem for three units. Owner redemption burns exact packs without operator approval. The separate market supports fixed unit prices, partial fills, expiry and revision checked quotes. External balance changes invalidate listings. Operator approval covers the whole collection and can be revoked in the preview controls.

JourneySupplyReceipts checks local chain, runtime bytecode, policy identity, canonical receipt and exact redemption event. The journal waits for two confirmations and credits each chain, transaction and log source once. Authenticated recovery derives the owner from the session. Opened stock is not transferable. Confirmed orphan detection freezes stock without deleting historical balances. RPC failure stops reconciliation.

Practice 0.15 pins supply effects and mutable armour separately from immutable class builds. A successful action debits a unit and persists its effect in one SQLite transaction. Replay preserves the first acknowledgement. Failed effect or persistence spends nothing. Earlier runs retain their rules. Health restores up to 35 within actor capacity, ammunition up to a magazine within admitted reserve capacity, owned grenades use the ordinary throw checks, and repair restores up to 25 within class armour capacity. Each damaging hit wears one armour point under 0.15 only.

Preview source includes wallet burn disclosure, two confirmation handling, pending and replacement hash recovery, opened stock controls and expandable trading. These controls still require rendered browser verification. The old running fixture must not be mistaken for a newly deployed supply environment.

Commands from the repository root:

* npm run journey:local starts a fresh disposable local environment and writes ignored manifests.
* npm run journey:dev serves the browser preview.
* npx tsx packages/contracts/scripts/journey-development.ts --check verifies a separate disposable environment on port 18590 and closes it.
* npx tsx --test packages/contracts/test/journey-supplies.check.ts checks actual local trading, redemption, canonical recovery, reorg and replacement handling.
* npx tsx --test packages/contracts/test/journey-supply-e2e.check.ts checks the combined chain to gameplay and restart path.

No public deployment, purchase price, browser extension signing proof or human playtest is claimed. Authored fixture issuance is separate from earned loot.
