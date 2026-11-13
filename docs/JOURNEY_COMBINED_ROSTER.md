# Combined owned roster

Added 11 November 2026. Frontend bundle compilation succeeds. New combat, wallet admission and chain acceptance have not been tested at the owner's request.

Rules `journey-practice-0.18.0` combine owned soldier classes, optional collectible gun overrides, opened supplies and battlefield weapon recovery. Previous pinned rules remain available. Fresh demo launches deploy a separate soldier collection pinned to 0.18; existing 0.16 collection addresses are preserved and retain their signature-only roster flow.

Owned roster preparation now has optional gun IDs for each deployed slot. Empty slots use signature weapons. The draft records the collection, exact owner, rules version, run, credential, gun identity, supported build and ownership nonce before requesting leases. The server independently checks soldier classes and exact run leases, gun ownership/build/nonce and the original session owner. Soldier deployment, gun reservation, roster and progress identity enter the same SQLite writer transaction. Changed input after a lost first reply cannot create a different admission under the same identity.

The combined start packet has a bounded 4096-byte limit for up to three soldiers and three guns. Other Journey messages retain their 2048-byte parser limit. The shared socket ceiling is 4096, with the original mode parsers retaining their own limits. Combined resume remains authenticated and preserves pinned equipment and roster hashes.

New battlefield weapons use their own ammunition, cadence and reload limits even when held by the free leader. Entry collectibles and class entitlements are unchanged. Banked recovery staging still requires the actual marked pickup, terminal bank and checkpoint backing.

The current managed demo reached service and frontend ready with a newly deployed 0.18 soldier collection. This proves startup only. Step 35 still needs the complete ordinary combat, bank, progress application, recovery, supply and two-wallet sale demonstration.

## Shared Armory gun trading

The Journey Armory now mounts local gun review, listing, cancellation, purchase and allowance revocation. It checks collection/currency bytecode and immutable identities, exact supported builds, seller/price/listing revision and the current wallet. Currency approval is the exact reviewed amount; an existing different allowance resets to zero first. Listing a deployed gun changes its ownership epoch and stops that equipment session. Pending requests are retained per wallet and collection, and a submitted or replacement receipt must match the original sender and nonce before it can clear the pending operation. Changed transaction data is reported as superseding the original request, not as a successful gun purchase. New source is unverified; Steps 26 and 28 remain deferred.
