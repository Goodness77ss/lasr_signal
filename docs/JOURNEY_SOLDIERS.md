# Soldiers and progression

Current implementation, 10 November 2026: Step 23 has a separate real local ERC721 collection, JourneySoldiers, and a checked read only adapter. J10 approves 70 local development soldiers, at most 10 per class, minted by the deployment authority with no purchase price. The disposable proof deployed those exact caps, minted 16 tokens across all seven classes, rejected an eleventh Mara and an unauthorized mint, accepted a signed progress fixture once and transferred the progressed token to a second local wallet. Nineteen successful local receipts and the checked before and after states are in evidence/journey-soldiers-proof.json. The new manifest is evidence/journey-soldiers-local-deployment.json. The proof closes its node; those addresses are not a running deployment. Step 23 is VERIFIED within this local scope. Full regression passed 347 application tests in 61 files, twenty local chain integration checks across the soldier, asset and existing weapon catalog suites, and the strict production build.

The collection uses OpenZeppelin ERC721Enumerable, EIP712, ECDSA and ReentrancyGuard. Class, signature build and provenance have no setters. Metadata separates immutable build from progress revision, cumulative cosmetic XP, completed checkpoint flag and bank source. A fresh token has no completed checkpoint, distinct from having completed checkpoint zero. Its original procedural SVG is temporary local development art. The ABI is exported under its own JourneySoldiers name. Existing collection implementations and public manifests are not replaced.

Progress vouchers bind chain and collection through the EIP712 domain and bind token, current owner, unique bank source, rules hash, policy, nonce, cumulative XP, furthest checkpoint, completion flag and expiry through the signed fields. Acceptance requires the current owner and designated gameplay signer, rejects equality at expiry, replay and backwards progress, and advances revision once. Transfers advance the progress nonce even when a token returns to an earlier owner. Token history survives transfer; account achievements remain separate. The authored proof voucher tests this contract boundary. Automatic simulation bank to chain progress is Step 29, not proved here.

The local SoldierCollections adapter checks RPC chain, deployed bytecode hash, immutable configuration, all seven class builds, token owner and onchain progress. Confirmed ownership additionally checks the prior block. Explicit buildServer journeySoldiers configuration enables read only inspection through /weapons/journey-inspect with kind=soldier, chainId, collection and tokenId. No environment flag silently enables a soldier deployment. Owned Journey combat, leases and soldier trading remain disabled pending their respective steps.

Reproduce from the repository root with `npx tsx packages/contracts/scripts/journey-soldiers-proof.ts`. Integration checks run with `npx tsx --test packages/contracts/test/journey-soldiers.check.ts`. The proof uses loopback port 18579 and the checks use 18578. No keys or voucher signatures are exported. No public chain, actual wallet user interaction, paid purchase or banked gameplay bridge is claimed.

Historical design proposals follow. Current approved working concepts are J09 and local mint policy is J10. Numerical stats and temporary art remain prototype content. This collection is implemented and proved on a disposable local chain only.

## Seven proposed archetypes

| Character | Role and personality | Armour and signature weapon | Tradeoff |
| --- | --- | --- | --- |
| Mara, the Anchor | Calm squad leader who holds formation | Balanced field jacket, reinforced vest, service rifle | Reliable generalist without specialist bonuses |
| Kestrel, the Scout | Observant, cautious and quick to report threats | Light armour, compact carbine | Faster movement and observation, lower protection |
| Rook, the Bulwark | Protective and reluctant to abandon allies | Heavy armour, support gun | Greater protection, slower movement and reload |
| Imani, the Medic | Patient, focused on keeping the team alive | Medical webbing, light vest, defensive carbine | Limited treatment charges, weaker offensive specialisation |
| Flint, the Grenadier | Aggressive but careful about throw placement | Blast vest, rifle and limited fragmentation grenades | Strong area pressure, scarce ammunition and cooldowns |
| Vale, the Marksman | Deliberate and independent | Camouflaged field coat, marksman rifle | Long range, slower firing and poor close pressure |
| Beck, the Ranger | Practical scavenger who finds a route through trouble | Utility armour, close range shotgun | Better supply handling, short effective weapon reach |

These are archetypes that can have multiple token instances. Supply limits, recruitment prices and rarity are still design decisions. Personalities should influence observable behaviour and concise character dialogue, without creating an unsupported promise of conversational AI.

## Ownership and deployment

Keep a free starter squad available for practice. A starter entitlement is not a sellable NFT. Additional collectible soldiers can enter an owned roster after verified purchase or transfer. Only owned, supported and available roster members may deploy. A proposed active team cap of four is for review, not an implemented limit.

Define whether a signature weapon is permanently included with a soldier, a temporary default loadout or a separately owned gun. Recommended: a clearly labelled default gameplay loadout, with collectible gun equipment handled separately. Selling a soldier must not silently transfer an independently owned gun.

An active soldier cannot simultaneously be deployed into two live runs. Listing and transfer behaviour must be explicit: recommended first version requires ending the run before listing. External transfers must remove the old owner's deployment rights. A sale cannot copy a soldier into both wallets.

## Experience and journey history

Record only authoritative events: completed checkpoint, verified furthest checkpoint, successful bank, supported role contribution and eligible combat encounter. Attribute progress to the participating soldier asset, not merely to an account that owns it in the background.

Use unique run event IDs to prevent duplicate experience on reconnect or replay. Bound experience per event and rate of advancement. No browser supplied experience, edited save or screenshot can authorise onchain progress.

Furthest checkpoint and experience remain attached to the soldier when sold. Player account achievements should remain separate. Preserve the original history rather than pretending that a new buyer personally completed the old owner's journey.

## Prices

The seller chooses an asking price. Experience, class and verified journey record help buyers assess it. A suggested price may be added later, but it must be labelled as a suggestion, never a guaranteed market value or return. Do not automatically increase the sale price after a battle without fresh seller approval.

## Acceptance checks

Verify ownership on deployment, list, purchase and transfer. Reject stale price or experience terms. Test equal token IDs from different collections, changed owners, active deployment locks, duplicate experience events and restart recovery. Confirm that a sold soldier's verified history survives and that prior account achievements are not reassigned.
