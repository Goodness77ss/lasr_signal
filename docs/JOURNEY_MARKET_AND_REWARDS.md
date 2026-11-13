# Journey marketplace and reward design

Status: proposed expansion. Preserve the existing gun contracts, ownership records, metadata, recovery data and supported sale routes.

## Catalogue

| Category | Prototype contents | Required distinction |
| --- | --- | --- |
| Existing collectible guns | Service rifle, field carbine and supported shotgun collection | Keep current collection identities and actual network availability |
| New gun proposals | Marksman rifle, support gun and compact sidearm | Each needs implemented combat stats, metadata and a supported collection route before sale |
| Soldier collectibles | Seven archetypes with distinct token instances | Verified ownership, class, experience, furthest checkpoint and deployment status |
| Supplies | Medical kits, grenade packs, ammunition packs and armour repair kits | Finite quantities and exact consumption; do not present an ordinary simulated supply purchase as an NFT |

Recommended structure: separate soldier collection and consumable inventory contracts or clearly separated modules. Decide the token standard and quantity model during architecture work. Do not force new assets into immutable gun token kinds or reuse gun addresses with incompatible ABIs.

## End to end marketplace loop

Connect on an explicitly supported test network. Read actual ownership. Inspect the item, verified history, limitations and price. Review an exact approval and purchase. Wait for confirmed ownership. Add the soldier or gun to the roster. Deploy only supported owned equipment. End the run before listing deployed assets. Another test wallet can purchase the listing and receive the correct asset and history.

Listing quotes must bind collection, token ID, quantity where applicable, seller, price and a listing version. Bind an experience or equipment revision if it can change what the buyer receives. A changed listing requires refresh and review, not silent acceptance. Failed payment or failed delivery must roll back atomically.

## Gun pickups

Keep battlefield weapon pickups. Distinguish temporary run equipment from a recoverable collectible. Picking up a fallen enemy gun must not transfer an unrelated player's wallet asset. Only a supported, verified recovery path may mint or release a new collectible after the required banking outcome. No collectible should be advertised as claimable before its contract and service route exist.

## High ranking enemy WIF drops

Only designated enemy roles may carry eligible drops. A server event binds the enemy, encounter, run, recipient and amount. The enemy must be eligible and defeated once. A consumed drop cannot reappear after reconnect, section recycling or an enemy respawn. Show provisional loot separately from banked or claimable tokens.

For free practice, these drops are simulated WIF credits. An actual wallet claim requires backed test token funds, a verified settlement and a supported claim transaction. Do not debit an actual player's wallet because their fictional enemy avatar was defeated. The token source is an authorised reward pool, not another player's account.

## Infinite progression and finite custody

Infinite checkpoints do not create an infinite token budget. Funded rewards need a bounded, reserved pool; per run and per identity limits; replay prevention; and a clear response when backing is exhausted. Gameplay may continue with clearly labelled practice rewards, but never silently replace a promised chain payout with simulation.

Keep the approved automatic timed settlement direction for funded gameplay. Do not submit a wallet transaction for every footstep, shot, pickup or grenade throw. Checkpoint claims, bank timing, carries, timeout refunds and quit treatment need a written custody policy before a new funded journey goes live.

Existing practice quit forfeits unclaimed round rewards and new unextracted loot. Previously owned NFTs and existing wallet funds remain protected. The deployed funded contracts have their own existing rules; this plan does not change those rules or authorise a new deployment.

## Market exit checks

Use disposable local blockchain accounts first. Prove a soldier purchase, deployment entitlement, verified progress update, listing, second wallet purchase and ownership transfer. Prove a consumable purchase and exactly one consumption, including duplicate requests and restart. Prove a supported gun pickup and collectible recovery. Prove that enemy token drops are backed, uniquely claimed and separate from practice counters. Public testnet proof is a later, explicitly labelled step. No real money or mainnet activity.
