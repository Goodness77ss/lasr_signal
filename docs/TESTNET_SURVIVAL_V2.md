# Survival V2 testnet checkpoint

2 November 2026. Step 15 passed its public testnet exit gate. A real browser wallet run approved exactly forty mock units, deposited them, captured five, automatically banked forty five and independently claimed all credit. A second zero deposit browser run earned eight, explicitly accepted the five unit mission, succeeded for three bonus units, closed its actual tab before settlement and independently claimed eleven after automatic worker confirmation. Step 16 may now proceed. Public game hosting and human playtesting are not claimed.

The token is the project's original mock tWIF with no monetary value. It is not an official WIF token. The original escrow, armory collection and exchange remain separate. Two canonical L2 blocks are soft confirmation, not Ethereum finality.

## Delivered evidence

| Requirement | Actual evidence |
| --- | --- |
| Companion deployment and code | evidence/v2-step15-deployment.json records five confirmed transactions and code hashes. The public manifest is apps/web/public/survival-deployment.json. |
| Finite reward and welcome funding | evidence/v2-step15-funding.json records seven transactions using the unchanged mock faucet and exact transfers. No owner mint privilege was assumed. |
| Authoritative funded gameplay | evidence/v2-step15-sdk-run.json records normal server combat through the SDK, eight earned station units, a five unit failed mission stake, automatic settlement of forty three units and an independent claim. This is SDK evidence, not a browser wallet run. |
| Browser preparation | evidence/v2-step15-browser-budget.json records finite welcome pool replenishment and free test gas for the owner approved connected wallet. Personal wallet metadata remains private. |
| Actual browser welcome claim | evidence/v2-step15-browser-welcome.json records a canonical one hundred unit transfer from the finite campaign. |
| Actual browser allocation, station reward and claim | evidence/v2-step15-browser-run.json records allocation 0x66a77f8ff30172b0832ef5afa370f9158af1a6704dd605b284a760f2eb88c9de, automatic forty five unit settlement and canonical independent claim 0x266caef75860cb306ea06e3a677ef4716af88b1f404fb9a34f42f1c479c71ff3. The observed wallet balance became 105 mock units with zero vault custody and liabilities. The tab was open at settlement and no mission was offered in that run. |
| Browser settled ledger | evidence/v2-step15-browser-banked.png is an actual rendered banked result with deposit forty plus station five. It is not human playtest or closed browser evidence. |
| Current chain state | evidence/v2-step15-current-state.json records both public RPC endpoints returning chain 46630, matching code for all four contracts, 81 free reward units, zero welcome units, zero locked liability, zero claim liability and zero vault custody. These are observed reads, not promised future balances. |
| Current regressions | All 163 application cases and nine real local chain worker cases passed. Strict production build and dedicated secret scan are recorded separately in the acceptance checkpoint. |

The browser initially exposed intermittent MetaMask connection errors and an unsupported block number response. MetaMask subsequently saved the provider's /rpc URL on the same chain 46630 and completed the welcome, approval, allocation and claim transactions. One earlier allocation reverted because its authorization expired during approval review; evidence/v2-step15-browser-allocation.json honestly records status zero and zero deposit. The corrected UI obtains its entry authorization after the exact approval completes. No deployed contract was changed.

Server activation initially refused a confirmed allocation during stale chain health. Restore saved run now retries only the server activation for that existing confirmed allocation, without a new approval or deposit. This recovery was exercised by the successful browser run. The owner stopped Computer Use twice, then explicitly authorized resuming the remaining testnet browser checks. The first recording was not exported before its tab closed; only the preserved screenshot and chain evidence are delivered for that run.

## Exact local launch

Run from the repository root in two PowerShell terminals. Existing dependencies and protected role files are required. These commands retain the separate original service and practice preview.

```powershell
$env:SURVIVAL_VAULT_V2='true'
$env:SURVIVAL_STATIONS_V2='true'
$env:PORT='3002'
$env:DATABASE_PATH=Join-Path (Get-Location) '.runtime/survival-public.sqlite'
$env:ALLOWED_ORIGINS='http://127.0.0.1:5175,http://localhost:5175'
npm run server
```

```powershell
$env:LAST_SIGNAL_SERVICE_ORIGIN='http://127.0.0.1:3002'
npm run dev -w @last-signal/web -- --port 5175 --strictPort
```

Funded preview: http://127.0.0.1:5175/survival-funded.html . Free server practice: http://127.0.0.1:5175/survival.html . Service health: http://127.0.0.1:3002/health . These are local URLs using public testnet contracts, not deployed multiplayer.

The shared /health response describes the preserved legacy room service. Read /survival/funded/config for the V2 rules, chain, vault and worker status. The current service snapshot in evidence/v2-step15-service-state.json reports three settled jobs, no pending settlement job, zero invalid checkpoints and publicOperation false.

The default private companion manifest is .runtime/testnet/survival-deployment.json. On Windows the existing separate roles use DPAPI. Never copy a complete environment, decrypted key, signature or database into evidence. An unavailable role or incompatible manifest disables funded mode while retaining free practice.

## Verified browser gate

The zero deposit browser mission evidence is v2-step15-browser-mission-consent.json, v2-step15-before-browser-close.json, v2-step15-actual-browser-closed.json and v2-step15-browser-final-claim.json. The actual tab was closed and absent before any result job was prepared. The worker mined the result after the sixty second departure grace with no second player approval. Its canonical hash is 0xb186f6fcf2d1228070a952b2d18cc5d09ace3b7f66477b3a54c02ed79da7bf68. The separate eleven unit claim is 0x356f722490a3325c53f7752ba9ce72793ff49fed796c446de29c3f383eee5cac. Final observed wallet mock balance was 116, with zero claimable credit, zero vault custody and zero locked or claim liabilities.

v2-step15-browser-mission.webm is the actual silent 279.9 second canvas capture. Its capture metadata reports only PUBLIC_TESTNET_AUTOMATED_BROWSER_REVIEW and no interruption. Chrome decoded the saved 960 by 540 video without an error; its visible mode label and real battlefield were inspected. The video SHA256 is DFFCF7654B8B3806D12757DECBACA299E67EBCED94EACD193E76348BF2C51AB7. It contains no desktop, microphone or wallet capture. It does not pass the deferred human or foreground rendering performance gate.

The final source passed all 166 application cases, nine local worker integration cases, eight recovery cases, strict production build and the dedicated secret scan. The worker later reported insufficient test gas and disabled new allocations while the independent confirmed claim still completed. Welcome funding was exhausted by the legitimate hundred unit browser claim. These finite budgets require an explicit future free test funding operation before more funded entry; no balance is simulated.

The following procedure describes the path that was exercised, for later reproduction rather than a new outstanding Step 15 gate.

Use only the owner approved Chrome account and chain 46630. Reinspect the live wallet before changing its custom testnet RPC. The verified alternate endpoint is https://robinhood-testnet.drpc.org . Keep the testnet chain ID, currency and explorer unchanged. Mainnet is unsupported.

Complete the real wallet path: login, finite welcome claim if eligible, exact approval, explicit allocation, station reward, explicit optional mission consent, automatic worker settlement while the browser is closed, then independent claim or timeout recovery. Preserve submitted transaction hashes before any retry. Do not automatically retry spending or reload an active run to fix unrelated UI issues. Save only mode labeled game evidence without personal wallet contents.

Wallet writes require successful chain reads no older than forty five seconds. Wallet reads refresh at thirty second intervals while service status continues to refresh every eight seconds. Manual refresh and transaction completion force a fresh read. Refreshes share one in flight operation. Read failure displays unavailable values and disables chain transaction controls. The actual browser allocation and claim exercised this flow. Final strict production build and dedicated secret scan passed after these changes.

Public testnet completed job audits now start a new sweep at most every thirty seconds, processing at most eight records per poll and finishing each sweep before delaying again. Pending jobs still run every poll. Startup audits immediately; failed reads, incomplete searches and lost leases do not skip records or schedule an incomplete sweep as finished. The funded service uses the worker's successful identity verification rather than repeating the same code checks immediately. Sixteen focused worker cases, nine real local worker cases and eight recovery cases passed after this change. This reduces RPC work; a measured improvement to live gameplay cadence is still being checked.

## Read only reconciliation

```powershell
node scripts/inspect-survival-testnet.mjs
```

This command reads both endpoints and updates the current state evidence. It loads no protected roles and submits no transaction. It exits unsuccessfully on chain or code mismatch, unavailable reads, or vault liabilities exceeding custody. It is not a replacement for browser proof or a security audit.

## Operation handoff

No authorized free durable host is available. The local worker and database recovery tests do not establish TLS, persistent hosted storage, uptime or two external client runs. See OPERATION.md for the prepared proxy and host requirements. For V2, mount both the gameplay signing role and a distinct gas role, retain the exact deployment manifest and database, and never run two independent restored databases against the same gas account.

Linux configuration uses SETTLEMENT_KEY_FILE for the existing gameplay role, SURVIVAL_GAS_KEY_FILE for the distinct V2 gas role and SURVIVAL_DEPLOYMENT_FILE for the V2 manifest. Key file paths must be absolute; files must be protected and mounted separately from source and frontend assets. PUBLIC_OPERATION still requires explicit HTTPS origins, persistent storage confirmation and TLS termination. The prepared Docker and proxy files are not verified deployed infrastructure.

Before an operational restore, stop new allocations and the original process, create a private online SQLite backup, restore to an isolated file, verify integrity, reconcile pending jobs and canonical receipts, then start exactly one writer. The nine worker integration cases include a pending job backup and restoration, retained frozen gameplay, reconnect and exactly one settlement. Actual hosted restart and external wallet evidence remain outstanding.

Step 16 collection compatibility and the Step 17 weapon lab now have local evidence. Step 18 implements extraction provenance only; functional upgrades remain deferred. Public hosting is unavailable. The final release index records exact scope and verification.
