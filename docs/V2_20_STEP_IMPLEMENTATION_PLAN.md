# LAST SIGNAL expansion: 20 step implementation plan

Prepared 1 November 2026. Planning baseline: commit `f285d1a`. Status: PLAN ONLY. No expansion feature is marked implemented by this document.

The owner reports that the hackathon has been extended by ten days. Use those ten additional days as a working window, not a verified calendar deadline. Record the exact revised closing date, time zone, announcement and mock token eligibility when available. Do not change the existing game merely to match an assumed deadline.

The objective is an action focused endless station survival game: fight, capture, defend, resupply, optionally accept a mission, and extract. Retain the existing first person controls, automatic helpers, practice, standard shop, player exchange and older relay mode.

## Decisions that guide all 20 steps

### Automatic settlement replaces player submitted settlement

The owner chose time based automatic result submission. In V2, the player does not have to approve the result transaction after losing a mission. A durable service worker submits a bounded server signed result using a dedicated test gas wallet. Any other caller holding that valid result may submit it too. The contract credits the recorded player, never the transaction sender chosen as an arbitrary recipient.

The player still explicitly approves initial token allocation, optional top ups, mission acceptance and marketplace actions. Automation does not authorize arbitrary transfers from their wallet. Pull claims remain independently available; automatic result submission does not imply automatic wallet withdrawals or NFT sale signatures.

Smart contracts execute in response to transactions. Reaching a timestamp does not make a contract submit itself. This plan uses an application worker, not a paid automation subscription. An always available public service is required before claiming public automatic operation. References: [Ethereum contract execution](https://ethereum.org/developers/docs/smart-contracts/anatomy/) and [transaction relaying infrastructure](https://docs.openzeppelin.com/relayer). These explain the mechanism, not a requirement to add another dependency.

### Proposed initial timing

| Event | Proposed behavior |
| --- | --- |
| Normal checkpoint | Close the economic segment after 300 active gameplay seconds |
| Early terminal event | Queue settlement immediately after validated death, extraction or resolved surrender |
| Disconnect | Pause for a bounded published grace; then resolve departure and queue settlement even if the browser stays closed |
| Wall clock safety trigger | Begin closing no later than ten chain minutes from activation, leaving five minutes before timeout |
| Hard deadline | Settlement allowed strictly before 15 chain minutes; timeout recovery available at or after it |
| Pending transaction | Stop new economic actions and display actual submission or reconciliation state |
| Failed automation | Retry within the safety window; preserve independent timeout recovery rather than promise guaranteed execution |

The earliest applicable close condition wins. Gameplay clocks stop during legitimate pauses, but chain deadlines continue. Do not accept a mission unless its duration, preparation and settlement margin fit both the active segment and wall clock envelope. At a scheduled boundary, do not convert a mission into a failure solely because the system needs a checkpoint: prevent that overlap or abort and unlock it under the disclosed policy.

These values are initial proposals requiring local tests and measured confirmation behavior, not immutable product promises.

### What automation fixes and what it cannot fix

A player cannot erase a known failed stake by declining a result signature, refusing a wallet confirmation or closing the browser while a healthy worker is able to submit the canonical result. Settlement jobs live independently of the browser.

Complete service, signer, RPC or gas failure can still prevent timely settlement. Full timeout recovery deliberately favors player deposit safety in that case, and can cancel unresolved spending or provisional rewards under the published abort policy. Automation reduces the avoidance opportunity; it does not create a trustless proof of combat or eliminate infrastructure risk. If that residual policy is unacceptable, pause funded release and redesign before deployment.

### Allocation and renewal

Use one explicit initial allocation, suggested 40 tWIF with a maximum of 100. No unlimited approval. At entry, offer a clear choice between ending at a checkpoint or continuing the same run with a bounded amount of its settled balance. Default to no automatic carry forward unless the player selects it.

Carry forward must be enforced by the vault, capped by the selected amount, restricted to the same run and currency, and revocable for future renewals. Excess credits go to pull claims. It must never sweep unrelated wallet balances or previously banked claims. If permission, reserve or gas is unavailable, bank the segment and offer unfunded continuation or an explicit new allocation. Renewals preserve the gameplay state and cumulative reward caps.

### Delivery rules

Keep deployed contracts immutable and preserve their old interfaces and refunds. Use separate V2 rules and hashes. No mainnet, token purchases or paid service requirement. All chain assets remain original valueless mock tWIF and test NFTs. Existing evidence stays intact. Every step ends with a working build and checks appropriate to that change; broad regression runs happen at integration gates.

## Step 1. Freeze the baseline and confirm delivery constraints

**Build:** inspect the actual branch, instructions, protected credential roles, deployment manifests, current contracts and tests. Record retained, changed and deferred systems in `docs/V2_CHANGE_PLAN.md`. Preserve the owner's uncommitted update report and README work. Back up the ignored database and test restore a copy before schema migration. Record exact extension evidence if supplied. Begin checking available free hosting and RPC access now, in parallel with local development.

**Exit evidence:** baseline commit, actual relevant test results, build result, migration backup procedure and an access register. Distinguish historical passing tests from fresh runs.

**Depends on:** nothing. No deployments or faucet requests are needed for inspection.

## Step 2. Finalize V2 rules, clocks and economic invariants

**Build:** one typed V2 configuration with feature flags and a distinct rules hash. Define gameplay ticks, mission time, segment boundaries, chain timeout, automatic submission and loss policies. Specify run allocation and carry forward consent. Pin each run to its original rules. Preserve V1 shared constants and deployed identity checks.

Define exact accounting: player credit equals deposit plus earned station rewards plus successful bonuses minus applied spending and failed stakes. Unlocking a successful stake is not new income. Field credits never become tokens. Reserve station and mission reward capacity separately within the total segment allocation. Do not advertise 24 station rewards plus bonuses if the allocated capacity cannot cover them.

**Exit evidence:** `docs/RULES_V2.md`, ledger examples, boundary table, protocol version and tests for configuration validation. No unresolved interpretation of who submits, who pays gas or what timeout returns.

**Depends on:** step 1.

## Step 3. Make stations playable in server practice

**Build:** a new server practice mode using the existing movement and first person combat. Three stations have neutral, friendly and hostile ownership, capture progress and contested state. Death resolves before capture eligibility. Preserve legacy relay scoring separately; no score threshold ends V2.

Give stations distinct silhouettes and clear world labels. Explain the immediate objective in one sentence. Keep the first implementation free of wallet requirements.

**Exit evidence:** actual browser play captures a station, contests another and shows correct suppression or capture failure feedback. Tests cover capture timing, decay, boundary positions and death on the capture tick.

**Depends on:** step 2.

## Step 4. Add bounded station assaults and difficulty

**Build:** an assault director with stable assault IDs, legal spawn zones, visible preparation, route checks and capped pressure. Start with existing enemies and a conservative measured population limit. Increase composition and coordination before multiplying every stat. Tie station defense evidence to real assigned attackers.

Use active gameplay time for difficulty. Wallet wealth and spending must not affect hidden difficulty. At capacity, delay spawns and record the reason rather than creating invisible enemies.

**Exit evidence:** captured stations receive actual attacks; all stations lost still permits recovery; stuck attackers are detected; frame and tick samples establish a safe initial cap on the owner's device.

**Depends on:** step 3.

## Step 5. Implement station reward eligibility without chain claims

**Build:** a simulated reward ledger with unique run, cycle, station and reward kind keys. Start with capture five and defense three as proposed defaults. Reject repeated recapture rewards. A carried station earns a new cycle reward only through the specified real defense conditions. Preserve reward history across restart and reconnect.

Enforce cycle, run and wallet budgets without resetting them at segment renewal. Show why a station is capped. In practice all amounts remain explicitly simulated.

**Exit evidence:** tests prove one capture and one defense reward per eligible key, real assault participation, no passive holding emission, no reconnect farming and no client submitted reward events.

**Depends on:** steps 3 and 4.

## Step 6. Deliver the free starter and field allowance

**Build:** a nontradable starter rifle entitlement and 20 field credits per run. Basic ammunition and limited medical support use credits with explicit effects and cooldowns. Provide bounded gameplay ammunition drops. Keep regeneration and casualty replacement rules understandable.

Do not mint a free gun NFT for every restart. A zero deposit player can play; funded token rewards additionally require reserved treasury capacity and the necessary chain transaction gas.

**Exit evidence:** an ordinary starter playthrough reaches and captures a station without premium purchases. Tests prove credits cannot fund stakes, mint NFTs, pay listings or become wallet balances.

**Depends on:** step 5.

## Step 7. Add exact supply orders and a simple combat economy HUD

**Build:** authoritative orders with stable IDs and an explicit payment asset. Field credits and run tWIF use separate ledgers. V2 supplies debit the run ledger, while legacy direct wallet receipts remain limited to the old mode. No double payment path.

Show health, ammunition, station objectives and available run funds during battle. Expand pending rewards, locked stake and field credits on demand. Show full accounting at bank. Rejected or never applied V2 supply orders are not charged.

**Exit evidence:** accepted order applies and debits once; rejected order does neither; restart preserves order status; player can explain spendable run funds versus pending wallet settlement.

**Depends on:** steps 5 and 6.

## Step 8. Ship one optional mission template

**Build:** Hold the Signal only. Validate a legal assault, time envelope and available stake before offering. Explicit acceptance locks funds once. Declining costs nothing. Success unlocks the stake and adds only the reserved bonus; failure consumes the stake once. Service abort differs from ordinary failure.

Start with the proposed five stake and three bonus, then record completion rates. The initial ratio requires success above 62.5 percent for positive expected token return before other costs. Tune from play evidence rather than assume larger stakes are more attractive.

**Exit evidence:** visible offer, decline, acceptance, success, failure and exact tick tests. No impossible objective, automatic acceptance or mission funded by its own future bonus.

**Depends on:** step 7.

## Step 9. Implement extraction, death and disconnect outcomes

**Build:** a reachable eight second extraction channel with contest, damage and movement cancellation. Preserve previously owned NFTs. V2 unextracted new loot is lost on death; legacy casual salvage retains its existing rules. Validated station earnings and completed bonuses remain eligible after ordinary death. Active missions fail on ordinary death or resolved surrender.

Persist bounded disconnect grace and terminal reasons. Distinguish a browser departure from a proven service failure; uncertain corrupt state uses the documented safe refund path. A checkpoint does not heal, refill, reset difficulty or automatically extract NFT loot.

**Exit evidence:** actual successful extraction and ordinary death, a reconnect recovery, a closed browser terminal resolution and tests for final tick outcome order.

**Depends on:** step 8.

## Step 10. Validate the whole action loop before contracts

**Build:** a complete server practice slice: start, capture, defend, resupply, mission, death or extraction and reconciled results. Inspect desktop and phone views and collect a small human playtest. Profile comparable station assault scenes, not unrelated moments.

Simplify confusing reward labels and avoid excessive popups. Retain the working standard shop, exchange and original modes. Freeze the first economic and gameplay configuration only after this review.

**Exit evidence:** real loop footage, observed starter and mission outcomes, ledger reports, relevant regressions, strict build and device measurements. If this loop is not enjoyable or understandable, fix it before expanding chain custody.

**Depends on:** steps 3 through 9. This is the first major delivery gate.

## Step 11. Implement finite treasury and welcome grant locally

**Build:** additive funded custody and a once per campaign welcome distributor using the existing token where compatible. No assumed owner mint privilege: the current token has an hourly public faucet, not an admin issuance API. Use permitted existing mock tokens to fund the demo pool; do not purchase assets or conceal new token identity.

Track free capacity, reserved capacity and player obligations. The hourly test faucet remains separately labeled. A welcome grant is once per campaign, not proof that a person has never received tokens. Empty pools disable new funded allocations while practice remains usable.

**Exit evidence:** local funded grants and reservations, duplicate rejection, empty pool behavior and conservation. Existing shop burns and seller proceeds are never counted as available treasury revenue.

**Depends on:** steps 2 and 10.

## Step 12. Implement the additive SurvivalRunVault locally

**Build:** zero or bounded player deposits, reserved rewards, signed segment results, computed credits, ten percent supply revenue burn, treasury recycling, one finalization, pull claims and full hard timeout recovery. Enforce station and bonus allocations, one funded run per wallet and cumulative reward limits onchain for funded payouts. Define the rolling window precisely; do not approximate a rolling cap with a resettable daily label.

Accept valid results from a permitted transaction submitter without requiring the player's second approval. Bind all values to chain, contract, currency, wallet, run, segment, rules, sequence, outcome and expiry. Restrict carry forward to the stored consent and cap, with no arbitrary claim balance sweep.

**Exit evidence:** local deposits and reservations, zero deposit reward path, normal settlement, supply burn, claims, bounded renewal and exact deadline refunds. Old escrow and GunArmory behavior remain unchanged.

**Depends on:** step 11.

## Step 13. Build the automatic settlement worker

**Build:** a durable queue driven by the earliest time or terminal trigger. Persist canonical segment state and authorization before broadcasting. Use separate deployment, gameplay signing and transaction gas roles. A minimal worker can use the existing RPC library; add a relayer dependency only if justified.

Jobs move through prepared, signed, submitted, confirming, settled, retrying or recovery required states. Journal submitted hashes before waiting. Reconcile actual nonce and receipt state after restart, handle replacement transactions without making a second logical settlement, and verify the current contract state before retrying.

Monitor free test gas and estimated costs. Stop new funded entry when the gas safety budget or worker health is inadequate. Player disconnection must not delete a job. Claims always go to the contract recorded player.

**Exit evidence:** a lost mission settles with the browser closed and no second wallet approval. Restart after broadcast does not double settle. Insufficient gas and RPC failure produce explicit safe states instead of fabricated success.

**Depends on:** step 12.

## Step 14. Prove accounting and recovery on the local chain

**Build:** adversarial and property tests across deposits, station rewards, stakes, spending, reserves, claims, renewal and burn rounding. Exercise crashes before and after every monetary boundary. Simulate chain deadline progression separately from active gameplay time.

Test altered signatures, cross domain replay, duplicate claims, failed transfers, two concurrent reservations, wallet cap oversubscription, refused player submission, paused browser, service outage, orphaned receipts and corrupted checkpoints. Prove accepted obligations do not exceed custody. Document the residual full outage refund tradeoff.

**Exit evidence:** actual local deployment and receipts for success, failure settlement, extraction, burn, claim, renewal and timeout. Relevant old tests and build pass. No testnet V2 deployment before this gate passes.

**Depends on:** steps 11 through 13.

## Step 15. Deploy only the necessary testnet companions

**Build:** recheck official network information, actual chain ID, token identity, code, free gas and reserve balances. Deploy versioned V2 contracts using free access only. Record actual receipts and code reads. Keep original addresses, NFTs, evidence and refunds available.

Exercise the real browser wallet path: exact approval, explicit allocation, funded station reward, optional mission, automatic settlement and independent claim or refund. Show provisional, submitted, settled and claimed separately. Verify worker submission while the browser is closed. Do not present SDK automation as the browser wallet test.

**Exit evidence:** real companion addresses, nonempty code, confirmed receipts, actual balances and at least one browser wallet run. If wallet access or free gas is unavailable, mark that proof blocked and retain the local slice. Archive access is not assumed; preserve receipt and state snapshots when observed.

**Depends on:** step 14.

## Step 16. Make the armory compatible with a second weapon collection

**Build:** define assets by collection address and token ID. The existing GunArmory cannot mint a third class, so use a separate versioned contract for new guns. Adapt ownership reads, catalog, loadouts, recovery claims and exchange routes to both collections. Preserve class meanings and the old collection's tokenURI.

Choose and test a minimal V2 sale path with expected price and build terms. Never claim the old marketplace can sell an unsupported collection merely because the UI shows it. Source any new dependency from supported official documentation at implementation time.

**Exit evidence:** old rifle and carbine NFTs still equip and trade; a new collection item can be read and traded through its actual supported route; cross collection ID collisions and stale listings are rejected.

**Depends on:** step 15. Can be deferred if core reward work consumes the window.

## Step 17. Add one distinct shotgun and measure it

**Build:** the trench shotgun in server practice first, then the new collection. Implement a bounded close range cone with a total damage cap, finite ammunition, clear falloff, cooldown and reload feedback. Cosmetic pellets do not multiply full damage. Keep the starter weapon viable.

Measure frame cadence, tick duration, effects and draw calls in matched scenes. Reuse materials and pool effects. Do not add the support gun before this weapon's behavior and performance are accepted.

**Exit evidence:** server hit validation, range and wall tests, no ammo creation through switching, actual weapon footage and comparable device measurements. Chain ownership is exercised if step 16 ships.

**Depends on:** steps 10 and 16 for tradable issuance; gameplay prototype can precede step 16.

## Step 18. Add a minimal service record, then one optional upgrade

**Build:** verified extraction milestones for a collection and token ID. First present a truthful service record. If time remains, implement one attachment with a visible tradeoff, an owner check and replay protected achievement evidence. Existing tokenURI remains unchanged if the registry is separate.

Version the loadout used by missions and sales. A buyer must receive the build shown in the listing. If existing sale terms cannot bind a mutable attachment, disable upgrade mutation while listed through an enforceable compatible mechanism or defer functional upgrades. A UI warning alone is insufficient.

**Exit evidence:** repeated events do not duplicate history, external ownership transfer ends old use, exact stats match the preview, and stale build purchases fail. If these checks do not fit, ship history only and mark upgrades deferred.

**Depends on:** steps 16 and 17. Optional release scope.

## Step 19. Validate operation and public access if available

**Build:** run the authoritative service and settlement worker with health and version information, TLS, explicit allowed origins, durable database storage, protected secrets, bounded queue behavior and graceful shutdown. Monitor reserve and gas availability. Test backup restoration and reconnect while a settlement is pending.

Use free infrastructure only after checking current limits. A static frontend cannot host the Node service. Begin access work in step 1; do not wait until this step to discover a missing account. Hosting remains conditional on actual access, not an assumed feature of the extension.

**Exit evidence:** verified public URLs and two external wallets independently completing V2 solo runs if deployed. A public multiplayer claim additionally requires two external clients finishing the same legacy multiplayer match. If access is blocked, provide local operation evidence and an honest deployment handoff instead.

**Depends on:** steps 13 through 15; optional weapon systems are not prerequisites.

## Step 20. Freeze, verify and produce the submission evidence

**Build:** stop feature additions, run appropriate regression suites and strict production build, scan publishable files for dedicated secrets, inspect final desktop and phone flows, and record actual mode labeled gameplay. Reconcile deployment manifests, receipts, versions, reserve balances, claims and outstanding jobs.

Update README, STATUS, FACTS, DECISIONS, ASSET_REGISTER, acceptance matrix and exact launch instructions. Package one successful mission, one failed mission, automatic submission with a closed browser, reward claim and timeout recovery evidence. Explain mock token identity, signer trust, device limits and incomplete access or eligibility checks.

**Exit evidence:** reviewable code revision, actual commands and results, original asset licenses, honest feature checklist, real footage and a submission package matching what is implemented. No public hosting, audit or official WIF claim without its evidence.

**Depends on:** every included step. Deferred features are explicitly listed rather than quietly marked complete.

## Suggested use of the ten additional days

This is a target allocation, not a guaranteed estimate. Start dates depend on the confirmed deadline. Tasks advance on exit evidence, not simply because a day ends.

| Day | Primary steps | Checkpoint |
| --- | --- | --- |
| 1 | 1 and 2 | Baseline, settlement policy and V2 boundaries agreed; access work started |
| 2 | 3 and 4 | Playable station capture and actual assaults |
| 3 | 5 and 6 | Reward eligibility and zero token route |
| 4 | 7 and 8 | Supplies and one optional mission |
| 5 | 9 and 10 | Complete browser practice loop and initial playtest |
| 6 | 11 and 12 | Local funded reserve and vault |
| 7 | 13 and 14 | Automatic submission and local adverse case proof |
| 8 | 15 | Actual testnet and browser wallet proof; use remaining time for collection compatibility |
| 9 | 16 and 17 if core passes | One new tradable weapon; otherwise recovery and UI fixes |
| 10 | 19 and 20 | Operation evidence, regression fixes and submission freeze |

Step 18 is deliberately optional and has no protected day. Hosting setup and access discovery run alongside the schedule. Do not consume final verification time to force every numbered step into the release.

## Scope cuts and stop gates

The release priority is the complete station loop and trustworthy automatic accounting. If behind, cut functional upgrades first, then detailed history, the shotgun collection, extra mission templates, the support gun and new market filters. The existing standard shop and exchange remain available.

Do not cut conservation, exact approval bounds, server authority, free practice, safe refunds, reward deduplication, confirmation checks or honest labels. If the vault or automatic worker fails its evidence gate, release the new station mode as clearly labeled server practice with the existing proven armory, rather than attach unverified token rewards.

## Known access needs

The planning work needs no new secrets. Later testnet browser proof needs a dedicated wallet browser and free test gas. Only public addresses are needed in chat for funding assistance. Public hosting requires actual authorized account access. The extension announcement and sponsor rules are needed to confirm the exact final submission time and mock token eligibility.

## Relationship to the supplied expansion pack

This plan implements the direction in `../LAST_SIGNAL_SURVIVAL_EXPANSION/` while revising its player submitted settlement assumption to the owner's automatic timed submission choice. It also adds explicit migration work for immutable weapon classes and V1 rules hashes, bounded renewal consent, a realistic scope cut ladder and an operational worker requirement. The original proposal remains unchanged as planning history.
