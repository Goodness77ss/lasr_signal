# Unified Armory

3 November 2026. The gun locker, collection shop, player exchange, salvage recoveries and classic wallet desk now share `/armory.html`. The old `/weapons.html` and `/testnet.html` addresses redirect to its locker and wallet sections. Query strings are retained. This is an interface integration of the existing services, not a replacement game or a new deployment.

## Player experience

My guns shows ownership and equipment. Shop shows fixed prices. Player market shows actual listings. Wallet & claims holds balances, recovered guns, classic match settlement and timeout refunds. One wallet connection serves all sections. Detailed contract records, original NFT artwork, hashes and transaction links remain available through Details. Exact token approvals, listing price and build checks, two confirmation requirements and saved recovery storage retain their existing behavior.

Free practice remains separate from wallet ownership. No practice credit becomes a token. The newer shotgun collection is not configured on the current public service, so its shop card has no purchase button or invented price. Its displayed combat numbers come from the simulation catalog. Only supported guns expose salvage equipment. Funded Survival uses a separate vault and its existing run recovery screen, linked from Wallet & claims.

## Code

`armory-hub.ts` mounts the three existing controllers as modules and owns navigation and wallet login. `armory-runtime.ts` shares the wallet identity and an operation lock. Account and network changes invalidate the connection. Fresh account, network and expiry checks guard submissions. The original storage keys for match recovery, pending supplies and weapon transactions are retained. Wallet reads and saved classic refund actions can connect without a successful game login; buying and trading require game authentication. Existing deployment identity checks still apply.

The original controllers are retained in `armory-module.ts`, `weapons-module.ts` and `testnet-module.ts`. Their entry files delegate to the unified page or its redirects. Salvage still uses the existing server simulation and lazily loaded battlefield. Switching back to a tab requests a pause. Contract source, deployed addresses, immutable metadata and automatic Survival settlement policy were not changed.

## Artwork and prompts

Tool: built in `image_gen.imagegen`. Three separate original image generations, transparent background, no supplied third party reference. These are catalog illustrations, not new gameplay models or changes to the immutable token image. Saved assets:

| Asset | Project path |
| --- | --- |
| Service rifle | `apps/web/public/art/weapons/service-rifle-v1.png` |
| Field carbine | `apps/web/public/art/weapons/field-carbine-v1.png` |
| Trench shotgun | `apps/web/public/art/weapons/trench-shotgun-v1.png` |

Each prompt uses this text with its subject inserted:

> Use case: stylized-concept. Asset type: transparent weapon inventory illustration for the original indie game LAST SIGNAL. Create one original fictional [SUBJECT]. Premium hand-painted realistic 3D game inventory render with crisp material detail, weathered yet well-kept walnut and steel, warm sand rim lighting. Entire single weapon visible in a horizontal side / slight three-quarter profile, butt stock to the left and muzzle to the right, centered with generous transparent margins, no cropping, no hands or people, no props. Consistent restrained cinematic military-survival game style for an olive, charcoal and warm parchment interface. Transparent background with clean edges, no scene, no text, no branding, no watermark, no copied real manufacturer or commercial game design. Art is a catalog illustration, not a screenshot or an in-game model.

Subjects:

1. `long service rifle, long slender barrel with iron sights, full warm walnut stock and blued steel receiver, restrained brass fastenings, no scope`
2. `compact field carbine, noticeably shorter barrel and stock, walnut foregrip, dark steel receiver, distinct curved small magazine, no scope`
3. `sturdy trench shotgun, short wide barrel, walnut pump foregrip and full walnut stock, dark matte steel receiver, distinctive vented barrel shroud, no scope`

## Verification

Production build and TypeScript checks pass. Existing application tests: 173 pass. New shared wallet tests: 4 pass, covering account and network changes, expiry, mainnet rejection and cross section operation locking. Existing disposable local blockchain collection, market and recovery tests: 17 pass. These verify real local contract operations, not public wallet purchases through the redesigned UI.

Browser review used the actual local service, without mocked balances or listings. Verified desktop shop, 390 pixel phone layout, all three generated images loaded, no horizontal overflow, disconnected purchase and claim buttons disabled, section switching and both legacy redirects. Evidence is in `docs/evidence/armory-hub-*.png`. The current service supplies actual public testnet catalog reads. Browser signing, buying, selling and salvage combat through this new layout have not been repeated in this revision; earlier proofs remain historical evidence. No personal wallet transaction was submitted.

## Local launch

From the repository root, use `npm run server` and `npm run dev -w @last-signal/web -- --port 5174` in separate terminals, with the existing local service environment. Vite proxies `/api` to port 3001 by default. The running preview is `http://127.0.0.1:5174/armory.html`. A static build by itself does not provide the game service or blockchain access.
