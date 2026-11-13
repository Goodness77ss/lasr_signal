# Journey collectible identities and adapters

Step 22 verified for identity foundations and existing gun compatibility, 10 November 2026. Step 23 separate local soldier collection is next. The forty step goal remains active.

## Identity and immutable builds

`packages/chain/src/journey-assets.ts` defines distinct soldier, gun and consumable asset types. Every chain asset requires a canonical decimal chain ID, a nonzero checksummed collection address and an exact uint256 token ID string. Consumables additionally require a positive uint256 amount string. Numbers, aliases, extra fields and absent chain or collection are rejected.

The canonical token key includes chain, collection and token ID. Amount and declared kind cannot create a second identity for the same token. Registered collection kind must match its adapter. Equal token IDs in two collections are different assets. Local class profiles instead use `development-soldier` identities with `LOCAL_PRACTICE` and `ownedCollectible: false`; the chain asset parser rejects them.

Seven soldier class build identifiers hash their complete current definitions and signature weapon build. Five local Journey weapon build identifiers hash their current simulation definitions. These are separate from the existing collection build hashes: the original rifle's gameplay statistics do not silently become the Journey signature rifle's statistics. Mutable progress has a separate revisioned record type binding its exact soldier asset, cumulative XP, completed checkpoint, policy, rules hash and source. Its structural parser does not verify a signature or chain provenance. Actual verified progress reads and vouchers follow the soldier contract and bank integration steps.

## Checked adapters and capabilities

`apps/server/src/journey-assets.ts` wraps the existing `WeaponCollections` registry. It preserves explicit LEGACY_V1 and SURVIVAL_V2 ABI selection, runtime bytecode hash checks, chain checks and immutable currency, signer and rules checks. The allowlist supports local chain 31337 and the existing configured testnet chain 46630. Actual evidence in this step is disposable local chain only. Existing public deployment manifests were not modified.

Inspection reports the actual current owner, original URI, immutable build and capabilities. Confirmed ownership uses the existing latest and preceding block check. Legacy expected price sales and V2 expected build and nonce sales keep their original contract routes. Unsupported V2 build hashes are rejected before inspection or quoting. Disabled, unknown and wrong chain collections never fall back to the original armory.

Equip and combat ready flags describe the existing salvage equipment route: legacy rifle and carbine remain supported there, while V2 remains outside that route. The separately gated owned weapon lab retains its existing behavior and passes its original combat and transfer checks. Both collections explicitly report `journeyCombatReady: false`. Claim and consume are false for these already minted gun inspections. No soldier or supply contract is registered until it has a verified adapter at its own implementation step.

The public read only endpoint is GET `/weapons/journey-inspect` with exactly `kind`, `chainId`, `collection` and `tokenId` query fields. It reuses existing request limits and error handling. Existing inventory, token, quote, select, equip and recovery routes remain available. Owned Journey loadout admission remains disabled until the later lock and equipment work.

## Actual checks and reproducible evidence

`npm run build` passed strict TypeScript and production build. `npx vitest run --maxWorkers=2 --testTimeout=30000` passed 346 tests across 60 files.

`npx tsx --test --test-concurrency=1 packages/contracts/test/journey-assets.check.ts packages/contracts/test/weapon-catalog.check.ts` passed 11 disposable chain integration tests. Checks include equal IDs across separate collections, actual ABI reads, current and confirmed owners, original metadata, real legacy and V2 sales, disabled collections, declared and RPC chain mismatch, changed onchain bytecode, mismatched immutable currency, signer and rules, and actual read only API requests. Unsupported immutable build rejection uses an explicitly labelled response fixture over real deployed bytecode checks. The existing gun suite also verifies legacy equipment, the owned shotgun lab, external transfer revocation and disk recovery.

`npx tsx packages/contracts/scripts/journey-assets-proof.ts` produced `docs/evidence/journey-assets-proof.json` from a new disposable local chain. Its 18 receipts include original and V2 collection deployment, mock cost approvals, minting, listing and sales. Two tokens numbered 1 retain different collection keys. Confirmed ownership moves to the opposite local wallets while both metadata URIs remain unchanged. Wrong chain and disabled collection requests are rejected. The proof closes its local node and exports no private key or login signature.

No new dependency, soldier NFT, public transaction, real currency purchase, Journey owned equipment, browser marketplace playthrough or human trade is claimed. The existing browser practice launch remains `npm run journey:dev` at `http://127.0.0.1:5180/?mode=journey`.
