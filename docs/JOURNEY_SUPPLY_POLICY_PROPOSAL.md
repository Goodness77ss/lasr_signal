# Proposed finite supply policy

Owner decision required before implementation. This proposal covers disposable local development only, with no purchase price or public deployment.

Use a separate ERC1155 collection for unopened packs. One health pack contains three health units, one grenade pack three grenades, one ammunition pack three ammunition units, and one armour repair pack three repair units. Each unit targets exactly one selected living friendly actor. Health restores up to 35 HP, ammunition adds up to one weapon magazine to reserve without exceeding its build cap, and repair restores up to 25 armour without exceeding its class cap. Unsupported armour, full capacity and dead targets reject without charge. Grenade use follows the existing authoritative throw and cooldown rules.

Written state diagram:

WALLET UNOPENED PACK -> exact quantity redemption transaction burns packs -> PENDING CONFIRMATION -> confirmed unique receipt -> OWNED OPENED SERVICE STOCK -> atomic successful gameplay use -> CONSUMED.

An unopened pack can be transferred or sold. An opened pack cannot be sold or transferred. Redemption identifies the recipient owner and pack class in the event. No inventory is granted before two confirmations. A unique chain ID, transaction hash and log index prevents duplicate credit. A disconnected client can recover confirmed redemption by scanning events for its authenticated owner. The journal retains the receipt, block hash and inventory changes across restart.

Deployment authorises use of the owner's shared opened stock; it does not move or destroy that stock. Concurrent runs draw from the same durable balance in one database transaction with the gameplay effect. An unsuccessful action rolls back both. Quit, death, disconnect and lease expiry preserve unused opened stock. Used units remain spent. Previously owned stock is separate from provisional round drops and rewards.

An orphaned pending receipt grants nothing. If a previously confirmed receipt is later orphaned, freeze the affected redemption and further spending for reconciliation; never silently mint replacement stock or reverse already applied combat. This exceptional local recovery state must be visible.

Pack redemption burns the caller's exact quantity directly, without blanket operator approval. A separate sale route must expose any operator approval scope and revocation. Listings and partial fills bind class, quantity, seller, price and revision. Supply contracts, currency and markets remain separate from legacy guns and soldiers.

Approval requested: this lifecycle, ERC1155 unopened packs, three units per pack, the stated effects and caps, persistent opened stock and explicit orphan recovery policy. No supply contract or redemption implementation is authorised by this draft alone.
