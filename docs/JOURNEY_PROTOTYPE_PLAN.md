# Journey prototype implementation stages

Status: planning only. Do not begin coding until the owner asks to proceed. Follow stages in order and record actual evidence before moving on. Existing uncommitted work must remain intact.

This file is the stage summary. Use [the detailed 40 step technical plan](JOURNEY_TECHNICAL_IMPLEMENTATION_PLAN.md) for implementation order, proposed file targets, state models, compatibility boundaries and exact exit checks.

| Stage | Deliverable | Exit check |
| --- | --- | --- |
| 1. Product decisions | Resolve starter squad, active team cap, soldier loss and item ownership rules | Owner decisions recorded; current versus proposed features audited |
| 2. Journey visual proof | One traversable road encounter using existing simulation and original geometry | Local bot encounter works; objective and checkpoint are visible; no wallet required |
| 3. Bounded route generation | Seeded sections, transitions and checkpoint identity | Long traversal keeps memory bounded; every route is navigable; no duplicate completion |
| 4. Three gameplay regions | Outskirts, woodland and highland prototypes with real terrain effects | Movement, visibility, collision and enemy routes agree with the displayed terrain |
| 5. Reactive enemies | Damage awareness, turning, cover, flanking and retreat | Rear attack and lost sight scenarios pass; no omniscient tracking or unreachable enemies |
| 6. Combat additions | One grenade, crouch and limited dodge | Server validates inventory, fuse, blast obstruction, cooldown and matching hit shapes |
| 7. Seven soldier archetypes | Original silhouettes, equipment profiles and behaviour differences | Every role has an observable tradeoff; starter access and active roster cap work locally |
| 8. Authoritative soldier progress | Experience and furthest checkpoint journal | Reconnect, repeat events, edited clients and section revisits cannot duplicate progress |
| 9. Soldier ownership and trades | Separate supported collection and deployment entitlement | Disposable local chain proves purchase, progress, listing and transfer between two wallets |
| 10. Expanded guns and supplies | Implemented gun classes and finite consumables | Combat matches metadata; purchases and consumption are exact and recoverable |
| 11. Pickups and enemy drops | Verified weapon recovery and high rank token drops | No duplicate drop or mint; backing and practice versus chain labels are correct |
| 12. Complete demonstration | Journey to checkpoint to bank to roster to trade | Browser proof, failure recovery, performance review, human playtest and honest limitations recorded |

## Stretch work

Jumping, vaulting, vertical terrain traversal, more regions and deeper personality systems follow the verified core. If jumping is moved into the prototype, allocate explicit work for height aware physics, camera, navigation and shot detection. Do not mark it complete because a visual animation exists.

## Scope discipline

A small repeating set of validated region sections is acceptable for an endless prototype. A finite level should be described as finite. Seven archetypes do not require seven independent artificial intelligence systems. A seller controlled price is sufficient before introducing price suggestions. Preserve Classic and Station Survival as secondary modes rather than rebuilding them alongside Journey.

## Evidence and reporting

For each stage record modified files, commands, tests, screenshots where relevant, actual environment and unresolved limits. Distinguish local practice, disposable local blockchain, public testnet and deployed multiplayer. Keep a ledger of accepted product decisions. No screenshots or simulated balances can stand in for ownership, a chain receipt or multiplayer proof.
