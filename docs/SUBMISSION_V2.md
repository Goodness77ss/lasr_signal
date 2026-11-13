# LAST SIGNAL V2 submission

2 November 2026. The numbered implementation pass is complete within the scope recorded in V2_ACCEPTANCE.md. Steps 1 through 9 and 11 through 16 have their recorded gates. Step 10 human playtest remains deferred by the owner. Step 17 ships an isolated local weapon lab, Step 18 ships minimal extraction provenance with functional upgrades deferred, and Step 19 uses the plan's local operation and deployment handoff alternative. Public game hosting remains unavailable. No feature is inferred from its presence in the original plan.

## What works

Server station practice supports capture, actual assaults, bounded simulated rewards, free field support, run supplies, explicit optional missions, extraction and departure outcomes. Existing local practice, original armory and legacy multiplayer remain separate. Funded survival uses finite testnet backing, exact approvals, explicit allocations and mission consent, durable automatic worker settlement and independent pull claims or hard timeout refunds. The actual browser tab was closed before a worker settlement; its receipt and later independent claim are recorded.

The second weapon collection, catalog, collection specific loadouts, sale routes and canonical extraction recovery pass local EVM integration. Original rifle and carbine equipment, metadata and trade remain intact. The shotgun fires in an isolated server lab with free practice or verified local NFT ownership; its range, wall tests, shared damage cap, falloff, cadence and ammunition conservation are checked. It is not available in funded survival missions. The service record describes the extraction from which a recovered NFT originated, not invented later achievements.

## Evidence map

| Requirement | Actual evidence and mode |
| --- | --- |
| Successful mission | evidence/v2-step15-browser-mission-consent.json, v2-step15-before-browser-close.json and v2-step15-browser-mission.webm; actual public testnet browser mission, automated combat |
| Failed mission | evidence/v2-step15-sdk-run.json; public testnet SDK combat, five unit failed stake, 43 unit automatic settlement and claim |
| Closed browser automatic settlement | evidence/v2-step15-actual-browser-closed.json; actual tab absent before preparation, confirmed eleven unit settlement |
| Independent reward claim | evidence/v2-step15-browser-final-claim.json; actual browser claim, zero final vault custody and liabilities |
| Timeout recovery | evidence/v2-step12-local-vault.json, fullTimeoutRecovery; real disposable local chain exact deadline refund, not public timeout proof |
| Reorganization, crash and backup recovery | ACCOUNTING_V2.md, WORKER_V2.md and their local receipt reports |
| Two collections and actual supported sales | evidence/v2-step16-local-compatibility.json; 23 local receipts, original equipment and metadata, separate collection IDs and routes |
| Shotgun and comparable device sample | SHOTGUN_V2.md, v2-step17-shotgun.webm and rifle and shotgun performance JSON; authored automated target practice on Intel HD 520 |
| Extraction provenance | evidence/v2-step18-history.json; authored local extraction, actual NFT mint and transfer, one repeated milestone and unchanged metadata |
| Operational recovery | evidence/gate6-operation.json and OPERATION_V2.md; actual two loopback clients, restored live database backups, no public hosting claim |
| Final chain and queue reconciliation | evidence/v2-step15-current-state.json and v2-step20-reconciliation.json; matching code on two RPC providers, three settled jobs, no active or pending work |
| Desktop and phone | evidence/v2-step16-browser-desktop.png, v2-step16-browser-phone.png, v2-step20-desktop.png and v2-step20-phone.png; actual browser captures, 375 CSS pixel phone content with no horizontal overflow |

## Verification and reproducible launch

The final application run passed all 173 cases. Final collection service and recovery verification passed ten real local EVM integration cases. Seven contract collection cases and eight original armory and salvage cases passed earlier in this implementation pass. The latest strict TypeScript production build, dedicated secret scan, online WAL backup test and actual operation restart drill passed. Other vault, escrow, worker and adverse recovery suites retain their dated reports rather than being represented as newly rerun here. Original contract sources, original ABIs and package lock retain no diff. Dependencies were not migrated.

From this repository, the base local commands are:

```powershell
npm ci
$env:SURVIVAL_STATIONS_V2='true'
npm run server
```

In a second terminal:

```powershell
npm run dev -w @last-signal/web -- --port 5174 --strictPort
```

Open http://127.0.0.1:5174/survival.html for local server practice. Existing funded preview remains http://127.0.0.1:5175/survival-funded.html using public testnet contracts through a local service. The weapon lab is running at http://127.0.0.1:5177/weapon-lab.html. Exact separate service and proxy launch commands are in TESTNET_SURVIVAL_V2.md and SHOTGUN_V2.md. Reproduce the isolated collection proof with WEAPON_COLLECTIONS_V2.md. Its disposable proof service was stopped after evidence capture to release resources; port 5176 is not currently a working collection backend.

The archive contains source, the existing lockfile, documentation and public evidence, with a per file SHA256 manifest and base revision. Work remains uncommitted on the existing branch; no reset, stash or commit was performed. The archive excludes private runtime data, role files, sessions, full environments, installed dependencies and generated builds. Run npm ci and npm run build after extraction. Reproduction of funded signing requires the original protected roles and private durable database; they are intentionally absent from the archive.

## Remaining limits

The token is original mock tWIF, with no monetary value and no official WIF claim. No mainnet, purchases, paid services or real money were used. The signer remains a trusted server authority; contracts and this code are not independently audited. Two L2 blocks are soft confirmation, not Ethereum finality. An already issued NFT authorization cannot be revoked after a deep reorganization.

Current worker free test gas is insufficient, so new funded allocations are disabled. Finite reward backing has 81 mock units and the welcome campaign is exhausted. All observed player claims and vault liabilities are zero. These are observations, not future funding promises. No faucet request or token transfer is hidden in the final checks.

No durable public host, public TLS or two external V2 wallet runs is verified. Public multiplayer is not claimed. Human playtest, sustained phone gameplay and broader device support remain unverified. Functional upgrades, the support gun, funded shotgun missions and public deployment of the new NFT collection are deferred. Competition deadline, sponsor eligibility and official token acceptance remain unconfirmed. Original procedural prototype asset provenance and licenses are recorded in ASSET_REGISTER.md.
