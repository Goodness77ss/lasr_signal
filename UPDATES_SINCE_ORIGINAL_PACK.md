# LAST SIGNAL: updates since the original specification pack

Prepared 1 November 2026. Implementation reference: commit `f285d1a` on `main`.

This document explains how the current project differs from the original pack of 26 Markdown files: the numbered specifications `00` through `24`, plus `AGENTS.md`. It is a separate change report, not a replacement for those files. The original files remain intact in the parent directory.

The project began as a compact squad tactics game. It now also includes direct first person combat, survival and endless practice, and a separate server controlled salvage mode connected to wallet owned testnet gun NFTs. Several additions were explicitly excluded by the initial scope and were introduced following the owner's requests.

This report distinguishes three things: new product features, original requirements that have now been implemented, and work that remains incomplete. A specification describing a feature is not evidence that it works.

## 1. Comparison at a glance

| Area | Original specification | Current implementation | Nature of the change |
| --- | --- | --- | --- |
| Main interaction | Select squads and issue movement or support orders | Direct movement, mouse look, manual aiming and firing, with automatic squad support | Major scope expansion |
| Camera | Angled overhead view with bounded pan and zoom; no free orbit | Eye level action view, squad follow and command views | Major presentation and control change |
| Visual setting | Ruined communications compound with wet concrete and military equipment | Fictional early 20th century inspired front with mud, timber, sandbags and wooden rifles | Art direction revision |
| Action objectives | Capture three relays and win a bounded match | Relay play remains; untimed survival, repeating waves and wallet salvage provide additional objectives | Multiple mode expansion |
| Weapons | Automatic squad volleys; no manual aim or inventory | Manual rifle and carbine fire, finite ammunition, reloads, pickups and weapon switching | New combat systems |
| Health | No regeneration; squad death permanent | Living friendly squads regenerate after a safe interval; casualties require replacement | Balance and survival change |
| Enemy behavior | Observation limited tactical bot | Shared targeting, wounded target priority, coordinated movement and damage triggered sidesteps | Bot refinement |
| Loot | No inventory or tradable weapons | Enemy gun and ammunition drops; simulated credits in practice; verified collectible rewards in salvage | New progression layer |
| Token utility | Fixed 100 tWIF deposits and capped match spending | Existing escrow plus a separate gun shop, supplies and player gun exchange | Economy expansion |
| NFTs | Explicitly excluded | Actual gun NFTs on Robinhood Chain Testnet, connected to server verified pickups | Major scope expansion |
| Multiplayer | Planned authoritative private rooms | Local authoritative WebSocket service with authenticated funded flow and recovery evidence | Original plan implemented locally |
| Blockchain | Planned local EVM followed by public testnet | Local escrow evidence and actual public token, escrow and NFT deployments | Original plan delivered plus NFT addition |
| Public game hosting | Required when free access is available | Game frontend and service still run locally | Pending |

## 2. First person movement and combat

### What changed

The initial product scope explicitly said there would be no freely walking player avatar or controllable first person shooting. The original rules also said players would not manually aim shots.

Following play feedback, the game gained:

* An eye level camera with a visible procedural weapon.
* Mouse yaw and pitch so the player can look left, right, up and down.
* Direct WASD movement with collision handling and sliding along obstacles.
* Manual aim and hold to fire behavior.
* Pointer lock where supported, with drag based alternatives.
* Reload, pickup and weapon switching actions.
* Onscreen movement and combat controls for narrow layouts.
* Automatic supporting fire from the player's soldiers while the player aims independently.

Movement and fire are validated by the simulation. A browser does not simply declare that an enemy was hit. Aim direction, range, visibility and wall intersections affect whether a shot connects. The close camera no longer needs to sit above nearby buildings to avoid clipping in the same way as the earlier camera.

### Current weapon values

These are implementation values at the referenced revision, not promises of final balance. The simulation runs at 20 ticks per second.

| Property | Service rifle | Field carbine |
| --- | --- | --- |
| Manual shot base damage | 20 | 12 |
| Minimum interval between manual shots | Five ticks, or 0.25 seconds | Three ticks, or 0.15 seconds |
| Magazine capacity | 20 | 30 |
| Gun shop price | 20 mock tWIF | 30 mock tWIF |

Shared defaults include 80 reserve rounds, a reserve cap of 180, and a 30 tick or 1.5 second reload. Effective damage can change through cover, shield absorption and hero protection. Continuous firing cannot create unlimited ammunition.

### What this does not mean

The authoritative combat unit remains a squad with aggregate health. Three rendered soldiers illustrate it. This is not a complete individual soldier hitbox, physics, inventory or ballistic simulation. The two weapon types have fixed stats; there is no random weapon rarity or attachment crafting system.

Primary sources: `packages/sim/src/index.ts`, `packages/sim/src/rules.ts`, and the battlefield and input modules under `apps/web/src`.

## 3. Survival balance, casualties and regeneration

The original rules explicitly excluded regeneration and ammunition. Both were added to support the requested action focused experience.

The current hero can die. Manual shots damage enemies, enemy damage is visible, and the UI displays health and ammunition. Friendly casualties are also represented: visible men fall as squad health declines, and automatic support becomes weaker as men are lost.

Survival was made more forgiving after the owner reported dying too quickly:

* Incoming hero damage is scaled to one half.
* A ten tick focused fire protection interval prevents every simultaneous attack from dealing full hero damage.
* Living friendly squads regenerate eight HP per second after five seconds without damage.
* Regeneration restores health but does not automatically recreate fallen men.
* Replacement helpers are an explicit supply action, subject to eligibility checks.
* A dead main character ends the action run.

These changes do not make the player immortal. They create room to disengage, reload and recover between engagements. No long term human balance study has been completed.

## 4. Repeating action modes and clearer objectives

The original loop centered on a three minute relay contest and private rematches. The owner later requested less planning and more immediate, repeatable action.

### Current mode separation

| Mode or page | What the player does | Where authority lives | Currency and rewards |
| --- | --- | --- | --- |
| Local practice at `/` | Learn movement and relay orders, fight bots or use the combat drill | Browser simulation | Simulated practice credits only |
| Untimed survival at `/` | Stay alive, shoot enemies, reload and collect drops | Browser simulation | Simulated practice credits and equipment |
| Endless Front at `/` | Clear repeating enemy waves with short recovery breaks | Browser simulation | Simulated WIF rewards and supplies |
| Private relay rooms at `/private.html` | Play a server controlled relay match with another connected client | Local Node service | Unfunded credits, or verified testnet escrow when using the funded flow |
| Wallet salvage at `/armory.html` | Equip an owned gun, fight waves, collect enemy drops, bank and claim collectibles | Local Node service plus public testnet contracts | Actual mock tWIF reads and wallet owned testnet gun NFTs |
| Token and escrow panel at `/testnet.html` | Inspect network, obtain mock tokens, fund and recover supported escrow transactions | Wallet, RPC and service | Actual testnet tokens and receipts |

Removing the timer applies to the action modes. It did not remove the bounded regulation and overtime rules from classic relay multiplayer or the hard refund deadlines from escrow.

### Endless Front additions

Enemy waves repeat with an eight second break after a clear. Difficulty increases within a cap. In local practice, a wave clear awards ten simulated WIF and 20 reserve rounds, with supply choices for ammunition, protection and helpers.

This is a repeatable gameplay loop, not evidence of measured player retention. There are no streak penalties, paid loot boxes or claims of guaranteed earnings.

### Onboarding and navigation fixes

Earlier playtests exposed confusing squad selection, missing relay guidance and a Move button that did not clearly explain its targeting step. The updates added larger squad cards, named relay destinations, stronger world labels, highlighted tutorial targets and direct guidance actions.

Selecting a squad from standby now starts and focuses the guided experience. Cards update without constant DOM replacement that could interrupt clicks. Move targeting shows a persistent ground selection instruction and clears correctly after acceptance, cancellation, loss of the selected squad or the end of the match. Keyboard shortcuts are handled in context rather than treating every mode as having identical controls.

These fixes were checked through actual local browser play, including a guided match result and redeploy. They are usability improvements, not proof that every new player will understand the game without assistance.

## 5. Enemy coordination and evasion

The owner asked for enemies that do more than move repeatedly up and down. The bot now uses shared visible target selection, gives priority to nearby wounded opponents, and assigns movement according to the situation.

Implemented behavior includes:

* Focus orders based on authorized observations.
* Retreat decisions for seriously damaged squads in applicable relay play.
* Cover and flanking positions in tactical situations.
* Movement offsets that reduce every squad choosing exactly the same approach.
* A physical sidestep after recent incoming damage, with a cooldown and legal path checks.
* Wave specific movement and attack pacing.

The enemy does not read the player's hidden input to predict a shot. Dodging follows actual incoming damage and available observations. It is bounded game logic, not a learning AI or a guarantee of human level tactics. Cover and relay behavior differ by mode.

## 6. Period battlefield and action feedback

The original setting became a fictional period inspired battlefield while retaining guns and the communications compound layout.

Environment additions include muddy lanes, duckboards, sandbags, ruined brick and plaster, exposed rafters, braced timber doors, crates, barrels, lanterns, wire outside the playable bounds, dead trees, vegetation and burned carts. Flags, smoke, clouds and lamp flicker add movement to the scene.

Soldiers gained cloth uniforms, steel brim helmets, leather equipment, canvas packs and bedrolls. Weapons use wooden stocks and visible bolt details. Combat presentation includes articulated movement, aiming, recoil, muzzle flashes, tracers, casings, impacts, dust, splashes, casualty falls and a sleeve and hand reload motion.

Enemy health bars, damage numbers, pickup markers, finite ammunition and reload feedback make the effect of firing easier to understand. The broader practice presentation includes original synthesized weather, gunshot, movement and command sounds.

The assets remain original procedural prototype geometry and materials. The project has not become photorealistic or a historical simulation. Existing shield and EMP abstractions remain where supported. No commercial game models or screenshots were copied. Asset sources and bundled font licenses are recorded in `docs/ASSET_REGISTER.md` and distributed license files.

## 7. Combined in game armory and NFT ownership

This is the largest addition beyond the initial pack. Tradable weapons and NFT collections were originally excluded. The owner explicitly requested merging ordinary game collectibles with wallet owned testnet assets.

### The player loop

1. Connect a dedicated test wallet and sign the readable login challenge.
2. Obtain free test ETH for network gas and mock tWIF from the token faucet.
3. Buy a starter gun or acquire one from another player.
4. Equip an owned gun NFT and enter server controlled salvage.
5. Fight enemy waves with manual hero control and automatic helpers.
6. Move to a fallen enemy's gun drop and pick it up.
7. End and bank the run, or die with already collected guns preserved.
8. Claim up to three recovered gun collectibles as NFTs.
9. Keep and equip a gun, list it for a chosen tWIF price, or cancel its listing.
10. Start another run.

A kill alone does not mint an NFT. The server must accept the actual pickup. Ordinary local practice kills, screenshots and browser supplied reward values cannot authorize collectibles. A recovered enemy gun creates a new collectible; it never transfers a different player's wallet NFT without permission.

### Token uses

| Use | Price or rule | Destination of tokens |
| --- | --- | --- |
| New service rifle NFT | 20 tWIF | Burned |
| New field carbine NFT | 30 tWIF | Burned |
| 40 reserve bullets | Five tWIF | Burned |
| Shield supply | Five tWIF | Burned |
| Replacement helper | Ten tWIF | Burned |
| Player gun sale | Seller chooses more than zero, up to 1,000 tWIF | Paid directly to the seller |
| Player exchange fee | Zero | No platform fee or royalty |
| Existing relay escrow | Exactly 100 tWIF per participant | Existing bounded settlement and refund rules |

Combat movement, aiming, shooting and reloading do not open wallet prompts. A supply purchase pauses the salvage run so a wallet confirmation does not leave the player fighting unattended.

Supplies are bound to a named run. A confirmed receipt can be applied only once. Failed application can be retried while the run is eligible, but unused purchases cannot be refunded after that run ends. Listing a gun does not guarantee that someone will buy it.

### What is stored where

The server stores run checkpoints, accepted commands, pickup provenance, reward authorizations and applied supply receipts in SQLite. The contract stores NFT ownership, gun type, drop provenance, used claim identifiers and market listings. Metadata and its original SVG image are generated onchain.

Wallet ownership is checked before a run and polled during it. Ownership polling occurs every four seconds; stale ownership data stops actions after eight seconds. Detected RPC or payment problems pause or invalidate the relevant run rather than substituting practice balances.

The public locker can inspect actual ownership and NFT metadata without connecting a wallet. This read only view does not sign in, spend, play or claim on behalf of the inspected address. Authenticated inventory and market pages use bounded reads of up to 32 NFTs per page.

### Trust and limits

The nonupgradeable GunArmory contract trusts the immutable gameplay signer. Claims bind chain, contract, run, drop, recipient, gun type, rules and expiry. The contract rejects duplicate drop claims but does not independently verify tactics or the server's combat history.

A previously issued valid claim or an already minted NFT cannot be revoked merely because a later reorganization is detected. Two canonical L2 confirmations are not Ethereum finality. There is no independent security audit or established production economy.

## 8. Original networking requirements now implemented

Authoritative networking was in the initial plan; it is not a newly invented scope item. The update is that working local infrastructure and evidence now exist.

The Node service provides private rooms, WebSocket transport, readiness and countdown, command validation, side ownership, spending deduplication, observation filtering, checkpoints and SQLite recovery. Hidden enemy routes, intentions and inventory are removed before transport. Wallet authentication binds funded access to the correct participant.

Spending commands use stable identifiers. Changed replays are rejected, and accepted spending and its durable record are committed together. Disconnect and restart handling pause or recover matches according to the implemented rules. Unrecoverable state does not manufacture a successful result.

Evidence includes two local browser clients completing a conceded match after an actual service restart, and integration tests completing authoritative funded matches. Separate operation drills verify shutdown and database recovery. Those clients ran on the same computer. They are not two external players connected to a publicly hosted service.

The new NFT salvage mode is solo play against bots on the server. It is separate from the two participant relay match. Gun NFTs have not been added as transferable stakes to the existing 100 tWIF escrow.

## 9. Local escrow and public testnet delivery

The initial pack proposed a mock token and escrow. Those proposals now have compiled contracts, tests, deployments and transaction receipts.

### Local EVM

Gate 4 implemented an original 18 decimal TestWIF token and a nonupgradeable MatchEscrow using disposable development accounts. The local proof recorded 31 successful transactions covering funding, settlement, burn, pull claims, unmatched funding refunds, deadline refunds and signed abort recovery.

The escrow still requires exactly 100 mock tokens from each participant. Spending is capped, settlement happens once, and no owner withdrawal of player deposits exists. At the hard deadline settlement stops and full timeout recovery replaces normal spending settlement. Signature tampering, replay, failed transfers and conservation are tested.

### Public Robinhood Chain Testnet

| Item | Actual public value |
| --- | --- |
| Chain ID | 46630, hexadecimal `0xb626` |
| RPC used | `https://rpc.testnet.chain.robinhood.com` |
| Original mock tWIF | `0x510414cA08A84473f8c8FCa77a198eaD4d7cE9d9` |
| MatchEscrow | `0xB5ABb40Ea1746372adb08d7F644Eb2B76774a692` |
| GunArmory | `0x4d9d75e997A7dB3C00bc9abae43Fbec20cb0B3df` |

Free test gas was obtained through the documented BlockVectra faucet using the owner's provider key from ignored environment storage. The API key was removed from the example file and is not committed. Deployment and settlement roles use separate protected credentials. No private key, full environment file or wallet signature belongs in the public evidence.

The earlier funded public proof confirmed 14 receipts. Two dedicated wallets deposited 100 each, completed an authoritative conceded match through the local service, burned four tWIF and claimed 106 and 90. Escrow balance and liability ended at zero.

The armory proof added 11 receipts including deployment. An automated client played actual server combat through the local Vite HTTP and WebSocket proxy, bought a starter carbine and ammunition, collected an enemy drop, minted Service Rifle NFT #2 and sold it to the second wallet for eight tWIF. No kill or loot state was injected.

The shop and ammunition purchases burned 35 tWIF. At the recorded current check the two proof wallets held 79 and 82, total supply was 161, and escrow balance and liability were zero. These are recorded observations, not balances guaranteed to stay unchanged.

Actual mint receipt:

https://explorer.testnet.chain.robinhood.com/tx/0x3b734dfc0bdae3e392f0589d3688f3a7f4953d2bb8e1b42eeb26847805489edf

Actual sale receipt:

https://explorer.testnet.chain.robinhood.com/tx/0x3efb0f4be310ba6405c7aaa8ae5ef7c4a4027b24023a4576b8c2db47ee886982

The fresh combined check reread all 25 receipts, matched canonical block hashes, checked deployed code and read current ownership and balances. The official RPC subsequently stopped serving historical state at the original proof blocks. Original accounting reports were preserved. Archive dependent verification now fails honestly; the separate receipt and current state recheck works without claiming to reconstruct unavailable historical balances.

All chain assets are valueless test assets. They are not official WIF, not redeemable and not mainnet assets. Test ETH remains necessary for gas even when gameplay purchases use tWIF. Mock token faucet access is 100 per wallet per hour and is not Sybil resistance.

## 10. Polish, accessibility, performance and evidence

The original pack required actual runtime review rather than attractive still images alone. The implementation now has browser playthroughs, screenshots, a local combat video and measurements.

Delivered work includes reduced motion and effects fixes, persistent audio mute in practice, visible focus outlines, labeled controls, text alongside health and damage colors, graphics loss recovery, loading failure feedback and mode labeled local canvas capture. A silent combat clip of approximately 20 seconds was saved and reopened for playback verification.

Desktop review and a 390 by 844 phone viewport were inspected. In the armory review, the page did not overflow and visible buttons measured at least 44 pixels high. NFT screenshots show actual public metadata and ownership, not a fabricated connected wallet. Physical phone combat, simultaneous touch actions, screen reader gameplay and injected wallet prompts remain unverified.

Rendering was measured on the owner's Dell laptop with an Intel Core i7 6600U, Intel HD Graphics 520 and 16 GiB RAM. Static scenery batching reduced sampled draw calls from approximately 706 to 438 and geometry count from 1,309 to 740. Sampled frame cadence fell from 51.16 to 39.56 FPS and approximate JavaScript heap increased. These samples came from different combat moments on a multitasking machine; no FPS or memory improvement is claimed.

The renderer bundle was split for caching and loading. This does not establish lower total transfer or faster gameplay. The armory entry measured 37.35 kB before gzip in the recorded production build and loads combat rendering separately. No new salvage FPS profile has been completed. The salvage page currently lacks audio and the full practice effects settings panel.

## 11. Latest verification snapshot

At the referenced implementation revision, 89 distinct tests passed:

| Test group | Passing cases | Coverage examples |
| --- | --- | --- |
| Application, simulation and operation | 53 | Combat, controls, room authority, auth boundaries, recovery and transport validation |
| Existing escrow contracts | 26 | Signatures, deposits, settlement, burn, rounding, deadlines, failed transfers and conservation |
| Funded integration | Two | Two authenticated participants, authoritative result, settlement and funding reorganization handling |
| Gun NFT contracts | Six | Shop burns, claims, replay, expiry, market payment, transfers and delivery rollback |
| Salvage integration | Two | Actual combat pickup, receipt deduplication, restart, RPC loss, payment reorganization and corrupt checkpoints |

Two application cases first exceeded the default five second timeout. A serial rerun with a twenty second test limit passed all 53. Strict TypeScript checking, production build, Git diff checks and a dedicated wallet/provider secret scan passed. Tests are evidence for the scenarios exercised, not an independent security audit.

Useful commands from the repository root:

```powershell
npm test -- --maxWorkers=1 --testTimeout=20000
npm run chain:test
npm run testnet:test
npm run armory:test
npm run build
node --import tsx packages/contracts/scripts/commerce-recheck.ts
node --env-file=.env --import tsx packages/contracts/scripts/check-secrets.ts
```

The current state check submits no transaction. The secret scan requires the existing protected local test setup and prints no keys. Do not rerun deployment or proof scripts merely to inspect the delivered result.

## 12. What remains incomplete

| Item | Current limit or required work |
| --- | --- |
| Public frontend and game service | No verified public game URLs; no hosting account or deployment access available |
| External multiplayer | No two external clients completing a publicly hosted match |
| Hosted durability and recovery | Local SQLite and recovery evidence exist; remote persistent disk, TLS operation and restart drills still need a host |
| Browser wallet transactions | SDK proof is real; signing and purchasing through an injected browser wallet still need a user wallet playthrough |
| Physical phone play | Responsive viewport reviewed; actual phone input, audio and wallet behavior still need testing |
| Independent security review | Not completed |
| Long session performance and load | No leak freedom, sustained capacity or universal FPS claim |
| Final art and audio | Procedural prototype assets remain; salvage audio and settings need further work |
| Archive accounting reproduction | The free official RPC no longer serves the old proof state; original snapshots and current receipt checks remain available |
| Hackathon mock token eligibility | Unconfirmed without organizer evidence |
| Human balance and retention | No substantial playtest study or measured retention claim |

There is no mainnet deployment, token purchase, cash out, real money marketplace, guaranteed resale value, official WIF integration, crafting economy, ranked season or unrestricted open world.

## 13. How to run and what the owner needs next

From `C:\Users\DELL\Documents\LAST_SIGNAL_CODEX_PACK\last_signal`, use separate terminals:

```powershell
npm run server
```

```powershell
npm run dev -w @last-signal/web -- --port 5174 --strictPort
```

| Local URL | Purpose |
| --- | --- |
| `http://127.0.0.1:5174/` | Free practice and action modes |
| `http://127.0.0.1:5174/private.html` | Private server controlled relay rooms |
| `http://127.0.0.1:5174/testnet.html` | Token, network and escrow controls |
| `http://127.0.0.1:5174/armory.html` | Gun locker, shop, salvage and player exchange |
| `http://127.0.0.1:3001/health` | Local service health |

For the next personal wallet playthrough, the owner needs a browser with an EVM wallet and a dedicated testnet account with free test ETH. A public wallet address is sufficient for funding assistance. Never send a seed phrase or private key. The current in app browser has no injected wallet, so it supports public locker inspection but cannot sign in or transact.

Public release then needs an available free host that supports a Node WebSocket service, TLS, explicit origins, secret storage and persistent database storage. A static frontend host alone cannot run authoritative multiplayer. After deployment, verify two external clients, a full match, recovery behavior and real wallet flows before claiming public operation.

## 14. Detailed evidence index

| Subject | Repository document or artifact |
| --- | --- |
| Current combined armory | `docs/ARMORY.md` |
| Current status and historical revision notes | `docs/STATUS.md` |
| Decisions and implementation choices | `docs/DECISIONS.md` |
| External and local facts | `docs/FACTS.md` |
| Original local escrow proof | `docs/ESCROW.md`, `docs/evidence/local-chain-receipts.json` |
| Public funded match | `docs/TESTNET_RESULT.md`, `docs/evidence/testnet-verified.json` |
| NFT deployment and combat trade | `docs/evidence/armory-deployment.json`, `armory-proof.json`, `armory-verified.json` |
| Fresh combined receipt and current state check | `docs/evidence/commerce-current.json` |
| Actual NFT and phone screenshots | `docs/evidence/armory-nft-desktop.png`, `armory-nft-phone.png`, `armory-phone.png` |
| Performance, footage and polish | `docs/POLISH.md`, `docs/evidence/gate6-local-combat.webm` |
| Asset provenance and licenses | `docs/ASSET_REGISTER.md`, `apps/web/public/licenses/` |
| Operation and remaining gates | `docs/OPERATION.md`, `docs/NEXT_STAGES.md` |
| Current acceptance evidence | `docs/ACCEPTANCE.md`, `docs/PROOF.md` |

The original specifications explain the starting intent. This report explains the delivered differences as of the referenced revision. Later code or documentation may supersede its exact balances, measurements and test counts.
