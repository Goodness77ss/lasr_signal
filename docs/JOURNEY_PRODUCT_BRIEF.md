# Endless Journey product brief

Status: proposed design. No gameplay or contract change is implemented by this document.

## Player promise

Lead your squad through a changing battlefield. Survive encounters, reach checkpoints, improve your soldiers and decide when to bank rewards. Keep, equip or trade supported collectibles.

## Core loop

Select a squad and loadout. Enter a generated route section. Fight, evade or take an alternate path through its encounter. Collect eligible weapons, supplies and enemy reward drops. Reach the checkpoint alive and complete its encounter condition. Choose supplies and either continue into greater danger or finish at a supported bank. Death or an explicit quit forfeits unbanked round earnings and new unextracted loot under the final approved rules.

Checkpoint eligibility must depend on recorded gameplay. Running back and forth through a marker must never create repeated rewards.

## Hackathon focus

Make Endless Journey the primary demonstration. Retain Classic Relay and Station Survival as existing secondary modes. Do not delete their code or represent them as part of the new prototype before adaptation is verified.

Build a small but genuinely repeatable route generator. Three authored region types and a few strong encounter templates can produce an ongoing journey without requiring an enormous world loaded at once. Describe the result as an endless prototype, with explicit tested limits.

The demonstration should connect gameplay, verified ownership, equipment, experience history and one completed trade. A good combat encounter is a prerequisite for expanding wallet plumbing.

## Existing versus proposed

The existing game has local Endless waves, Classic Relay, server Station Survival, a mode selector, solid scenery, independent look and movement, and weapon collection and trading services. Recent local application verification recorded 193 passing tests. Public wallet transactions were not repeated for that controls revision.

An infinite checkpoint journey, streamed regions, seven collectible soldier classes, soldier experience trading, grenade combat, new gun classes and tradeable medical supplies are proposed work. The current weapon NFT contracts do not automatically provide those features.

## Decisions to confirm before coding their dependent features

1. Does the starter squad contain the player plus two helpers, as today, or a smaller team?
2. Does buying a soldier add an individual to one squad or unlock another independently controlled squad? Recommended: an individual roster member, with a small active team limit.
3. Is soldier death temporary for the run, followed by recovery, or permanent? Recommended: temporary loss of deployment access for that run; preserve wallet ownership.
4. Does experience belong to the soldier token across owners? Recommended: yes, with immutable verified history and separate personal achievements.
5. How much may experience improve combat stats? Recommended: bounded sidegrades, not unlimited power growth.
6. Are the new soldier names and personalities below acceptable as working concepts?
7. Which supplies should be tradeable collectibles, and which should remain ordinary run purchases?
8. For the hackathon, should the journey reward demonstration use practice credits, disposable local chain tokens, or an explicitly funded public testnet budget? Never imply these are interchangeable.

Planning can continue while these are open. Implementation of the dependent policy requires an explicit decision, especially for permanent asset loss and custody.
