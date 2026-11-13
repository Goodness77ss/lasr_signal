# Step 16 collection compatibility

Status: PASS_LOCAL, 2 November 2026. Public deployment of the new collection and shotgun combat are not claimed. Step 15 public browser wallet proof remains separate.

SurvivalGunCollection is additive. Original GunArmory source, ABI, class meanings, metadata, shop and exchange are unchanged. New issuance supports rifle and carbine under their original meanings plus class two, Trench Shotgun. Prices are twenty, thirty and thirty five mock units, burned exactly. Sales pay their seller and deliver the NFT atomically. There is no privileged mint or withdrawal route.

Assets require collection address and canonical token ID. Registry reads verify chain, bytecode, currency, signer and immutable policy. Catalog pages contain at most thirty two items. Authenticated loadouts persist collection and token ID with a checksum and recheck ownership. Legacy checkpoints are verified before interpreting a missing collection field under the original configured collection. Original rifle and carbine equipment remains available. New collection equipment remains unavailable pending Step 17.

V2 sales bind price, build hash and listing nonce. Cancellation, relisting and external transfers invalidate old terms, even at an unchanged price. Original sales retain their actual expected price route. The browser selects the correct ABI and checks configured chain and account before each write. Changed terms after approval require a fresh review.

Recovery requires a canonical server extraction checkpoint and confirmed automatic vault settlement. The signer verifies lifecycle history, owner, frozen result hash and canonical receipt. Source IDs pin destination collection, proof and actual gameplay rules. Claims bind recipient, collection, chain, run, class, source, build and expiry with at most three items and replay protection. The separate immutable NFT policy avoids falsely signing new gameplay under old V1 rules. Already issued signatures cannot be revoked after a deep chain reorganization. Two L2 confirmations are not Ethereum finality. Tests use explicitly authored disposable pickup positions followed by actual lifecycle validation, extraction, settlement and minting. They are not natural combat footage.

The shotgun collectible build binds thirty total damage, sixteen shot ticks, six magazine rounds, forty four reload ticks, eight unit range and thirty degree cone. These terms await combat implementation.

Enable explicitly with SURVIVAL_WEAPONS_V2=true and WEAPON_COLLECTION_DEPLOYMENT_FILE pointing to a verified manifest. Invalid V2 configuration leaves the legacy collection available. Catalog, loadout, equipment and recovery routes use /weapons. The page is /weapons.html. No public new collection deployment exists.

Actual checks:

```powershell
npm run survival:weapons:test
npm test -- --maxWorkers=1 --testTimeout=20000
npm run armory:test
npm run build
npx tsx packages/contracts/scripts/check-secrets.ts
npx tsx packages/contracts/scripts/weapon-compatibility-proof.ts
```

Seven collection EVM cases, five catalog integration cases, four extraction recovery cases and three identity cases passed. The complete application suite passed 169 cases; eight original armory and salvage cases passed. Strict production build and dedicated secret scan passed. The final unknown class assertion was checked again independently.

The compatibility proof uses disposable EVM port 18573 and service 3003. Twenty three actual receipts cover original and new trades, unchanged original metadata, old rifle and carbine equipment and exact supply conservation. Evidence: evidence/v2-step16-local-compatibility.json. Browser reads showed the actual original carbine, separate shotgun and twelve unit V2 listing with build and nonce one. Desktop and phone captures are evidence/v2-step16-browser-desktop.png and evidence/v2-step16-browser-phone.png. A 390 by 844 viewport provided 375 CSS pixels with no horizontal overflow. Unauthenticated write controls were disabled. Browser reads are not browser transaction proof.

Leave the proof running, then launch the local page in another terminal:

```powershell
$env:LAST_SIGNAL_SERVICE_ORIGIN='http://127.0.0.1:3003'
npm run dev -w @last-signal/web -- --port 5176 --strictPort
```

Open http://127.0.0.1:5176/weapons.html. Every invocation creates fresh local addresses and an isolated runtime database; read its report for current addresses. Public wallet roles are never loaded.

Contract compilation writes only changed contents. A repeat compilation preserved the ABI timestamp, preventing unrelated Vite reloads during browser review. Original contract sources, ABIs and lockfile have no diff. Versions remain OpenZeppelin Contracts 5.6.1, ethers 6.17.0 and solc 0.8.38; no dependency was added. Official references: https://docs.openzeppelin.com/contracts/5.x/api/token/erc721 and https://docs.openzeppelin.com/contracts/5.x/api/utils.
