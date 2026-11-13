# V2 plan criteria review

Reviewed 2 November 2026, Africa/Lagos. Overall verdict: the full 20 step plan has not been completed. The core station game and automatic settlement have substantial implementation and evidence. Human review, optional weapon integration and the final release package remain incomplete.

## Scope and evidence standard

The root V2_20_STEP_IMPLEMENTATION_PLAN.md and docs/V2_20_STEP_IMPLEMENTATION_PLAN.md have identical SHA256 FCD9D6ABBC80692571B5A40CC3F74BF80F786A0262603F5345DB4DEBB33D670B. This review uses that plan, including its permitted scope cuts and conditional hosting fallback. The older packs provide context rather than replacing the plan's automatic settlement decision.

The public file inventory initially contained 399 files, including 93 Markdown documents and 122 TypeScript, Solidity and JavaScript source files. A content scan read 314 text files and parsed the JSON files without errors. Dependencies, generated builds, Git internals, private runtime databases and environment secrets were excluded from that inventory. Relevant implementation, tests, configuration, evidence and status documents were then traced against the plan. Three saved desktop, responsive and banked screenshots were visually inspected. This review did not replay every video, perform a new browser playthrough or obtain human feedback.

The workspace changed during review. New Step 16 source and tests appeared, and the acceptance register changed Step 15 to PASS_PUBLIC_TESTNET. Findings describe observed files and completed checks, not a permanently frozen revision. HEAD remained f285d1a2a4e2f88ffa7c7f9b11b9aea3ad32c284 on main, with extensive modified and untracked implementation. No implementation source was edited by this review. Build and contract commands generate their usual outputs.

## Criteria matrix

| Step | Verdict | Evidence and remaining qualification |
| --- | --- | --- |
| 1 Baseline and constraints | Supported | V2_CHANGE_PLAN.md records the baseline, retained systems, access register and private backup restoration. Existing npm workspace, tracked lockfile and strict TypeScript are present. Exact extension announcement and mock token eligibility remain unconfirmed, as disclosed. |
| 2 Rules and invariants | Supported | survival-rules.ts contains distinct rules revisions, immutable pinning, separate field credits, bounded deposits, split reservations and explicit timing. Rules tests and strict compilation pass. RULES_V2.md contains accounting and boundary examples. |
| 3 Server station practice | Supported | survival.ts and the practice service implement capture, contest, suppression and combat before capture. Stations have separate procedural silhouettes. Exact radius, decay and death timing tests exist; saved capture and contest evidence is present. |
| 4 Assaults and difficulty | Supported with measurement limits | assault-director.ts implements stable IDs, route and spawn checks, preparation, population caps, stalls and active time difficulty. Twelve director tests cover these boundaries. The recorded 58.67 FPS sample changes from three to two enemies; it supports that observed scene, not a sustained constant load guarantee. |
| 5 Station eligibility | Supported | station-rewards.ts and station-reward-store.ts enforce unique eligibility keys, real assigned defense, carried station rules, caps and durable journals. Recovery, recapture, passive holding and spoof rejection tests exist. Practice quantities remain labeled simulated. |
| 6 Free starter | Supported | field-support.ts grants twenty field credits, bounded ammunition and medical support. Starter capture and exact ammunition purchase evidence exist. No free NFT is minted on restart and field credits cannot become claims or stakes. |
| 7 Supplies and HUD | Engineering criteria supported; human exit criterion unverified | run-economy.ts, supply-orders.ts and authoritative commands separate payment assets, apply once and charge only accepted orders. Tests cover rejected orders, replay, restart and rollback. The plan also asks whether a player can explain run funds versus wallet settlement. No recorded human comprehension check was found. |
| 8 Optional mission | Functional criteria supported; balance remains provisional | Hold the Signal has explicit offer, decline, consent, stake lock, success, failure and abort behavior. Mission tests cover exact ticks and future bonus rejection. Saved browser success and failure evidence exists. The five to three ratio is documented, but human completion rate and attractiveness have not been established. |
| 9 Outcomes and disconnect | Supported | run-lifecycle.ts implements the eight second bank, cancellation, provisional loot loss and terminal accounting. Lifecycle tests and saved extraction, death, reconnect and actual closed tab evidence exist. |
| 10 Whole loop gate | Not met; deferred | ACTION_LOOP_REVIEW_V2.md explicitly records owner deferral of the human playtest and usable foreground performance check. The automated loop video and reconciled six unit result are real evidence, but do not satisfy those missing checks. Configuration remains provisional. |
| 11 Treasury and welcome grant | Supported locally | SurvivalTreasury.sol and SurvivalWelcomeGrant.sol implement finite backing, one consumer, campaign scoped claims and exact transfers. Twelve fresh local cases passed. The local proof records 22 receipts; separate public companion evidence also exists. |
| 12 Run vault | Implemented with local evidence | SurvivalRunVault.sol enforces bounded allocation, typed signatures, mission masks, computed credit, supply burn, one active funded run, rolling and run caps, pull claims, bounded carry and exact timeout. The saved proof records 35 local receipts. See fresh verification below. |
| 13 Automatic worker | Supported locally | survival-settlements.ts journals authorization, transaction bytes and hashes before broadcast, reconciles receipts and nonces, replaces at the same nonce and disables entry on poor health. Nine fresh real local chain integration cases passed, including failure without a connected player, restart, gas failure and restored pending settlement. Public closed browser evidence also exists. |
| 14 Adverse accounting and recovery | Supported locally | Eleven fresh cases passed: three accounting cases, including 24 mixed samples and the 256 entry history bound, plus eight recovery cases. These exercise competing reservations, rollback, orphaned receipts, deep reorganization, corruption and missing gameplay records. Full outage refunds can cancel provisional consequences, as disclosed. |
| 15 Public testnet companions | Supported by saved browser evidence and fresh receipt reads | Public manifests and receipts exist. One browser run allocated forty and claimed forty five. A second zero deposit run consented to a five unit mission, earned eight plus three, closed its tab before worker settlement and independently claimed eleven. Fresh read only RPC checks confirmed successful canonical consent, settlement and claim receipts to the expected vault on chain 46630. This is public chain settlement through a local game service. |
| 16 Second collection compatibility | In progress; not met | New SurvivalGunCollection.sol and weapon-assets.ts establish a separate collection and collection plus token ID identity. New tests are present. The inspected armory service still uses one GunArmory deployment and token ID only run identity; the browser armory still reads the legacy ABI. Complete catalog, ownership, equip, recovery and exchange integration has not been demonstrated. |
| 17 Shotgun | Not met | The new collection has shotgun metadata and build terms, but the inspected simulation Weapon union and WEAPONS catalog still contain rifle and carbine only. No completed authoritative cone damage implementation, wall and range proof, footage or matched performance evidence was found. Metadata is not a playable weapon. |
| 18 Service record and upgrade | Not met; optional | No completed collection scoped extraction service record or functional attachment system was found. A fixed build hash and listing nonce in the new collection do not establish extraction milestones or an upgrade system. |
| 19 Public operation | Public branch unverified; local fallback substantially supported | No authorized durable public host, verified public URLs or external wallet run proof is supplied. Local origin controls, health, bounded queue, shutdown and backup recovery exist, with a deployment handoff in OPERATION.md and TESTNET_SURVIVAL_V2.md. The plan explicitly permits this local evidence and honest handoff when access is blocked. Public hosting is conditional, not an unconditional reason to reject the local release. |
| 20 Freeze and submission | Not met | Feature work is still changing, current and historical status paragraphs conflict, final desktop and phone review for the release revision is not established, and there is no reconciled final submission package declaring included and deferred scope. Existing mission, closed browser, claim and local timeout evidence provides much of the material, but scattered evidence does not complete the freeze and handoff gate. |

The new weapon-collection.check.ts cases were inspected but were not executed by this review. Successful compilation and the three passing weapon asset identity tests do not close Step 16's integration gate.

## Important evidence correction

Earlier during this review, V2_ACCEPTANCE.md still marked Step 15 IN_PROGRESS. Newer evidence already contradicted that label. The register was subsequently updated to PASS_PUBLIC_TESTNET while the review continued. The newer browser proof should be retained as delivered evidence rather than repeated unnecessarily.

The relevant files are:

* evidence/v2-step15-browser-run.json: forty deposited, five earned and forty five independently claimed.
* evidence/v2-step15-browser-mission-consent.json: explicit five unit consent from an eight unit earned balance, with no deposit and no future bonus funding its own stake.
* evidence/v2-step15-before-browser-close.json: successful mission, eight station units and three bonus units, with no prepared settlement before closure.
* evidence/v2-step15-actual-browser-closed.json: observed absent tab, departure grace, automatic confirmed settlement and no player result approval.
* evidence/v2-step15-browser-final-claim.json: eleven independently claimed, with zero observed custody and liabilities at that historical reconciliation.

Fresh reads of mission consent 0x2e386abdd9d89a58652dec301b6eccebc80b00996dcf9d8955eeaddde20d5344, settlement 0xb186f6fcf2d1228070a952b2d18cc5d09ace3b7f66477b3a54c02ed79da7bf68 and claim 0x356f722490a3325c53f7752ba9ce72793ff49fed796c446de29c3f383eee5cac returned status 1 and canonical block hashes from the alternate public RPC. A receipt proves chain execution; the saved browser observations supply the browser closure context.

The 16.88 active ticks per wall second diagnostic in evidence/v2-step15-active-tick-cadence.json is explicitly not rendering FPS. It cannot close the missing Step 10 foreground performance gate.

## Fresh verification

Completed checks during this review:

* npm test -- --maxWorkers=1 --testTimeout=60000: 166 application cases passed on the initial source snapshot. A subsequent full run passed 169 cases across twenty files, including the new weapon asset identity tests.
* npm run build: strict TypeScript and production bundle passed, including a later rerun after the new collection exports appeared.
* npm run survival:worker:test: nine local integration cases passed.
* npm run survival:accounting:test: all eleven cases passed, including eight recovery cases.
* npm run survival:treasury:test: all twelve cases passed.
* npm run survival:vault:test: all 23 cases passed on the corrected source.
* npm run chain:test: all 26 legacy escrow cases passed.
* npm run armory:test: all eight legacy armory and salvage cases passed.
* npm run testnet:test: both wallet server integration cases passed on disposable local chains. Despite the command name, this run did not submit a public testnet transaction.
* node --test scripts/backup-database.check.mjs: the WAL restoration case passed.
* node --env-file=.env --import tsx packages/contracts/scripts/check-secrets.ts: dedicated secret scan passed. This is the existing targeted scanner, not a comprehensive privacy or security audit.
* npm run chain:compile: passed on the corrected collection source.
* git diff --check: no whitespace error was returned. Git emitted normal LF to CRLF conversion warnings.

A vault suite attempt failed in its shared setup after a concurrently added SurvivalGunCollection.sol contained comma separated local declarations at line 53. All 23 vault cases were blocked by that compiler setup error; this was not 23 independently demonstrated vault logic failures. The source was corrected during review, standalone compilation passed and the complete vault suite then passed all 23 cases. The transient failure is retained here for an accurate test history and is not reported as a remaining syntax error.

Fresh runtime versions were Node v24.16.0 and npm 11.13.0. No dependency installation or migration was performed.

The final passing application run contained 169 cases. The seven local contract and chain integration suites above contained 91 cases in total. The separate backup fixture also passed. Only read only public RPC calls were made by this review; no public transaction, deployment, wallet approval or faucet request was submitted.

## What is needed to close the plan

1. Finish the human starter playtest, comprehension check and a usable foreground assault performance sample, or retain an explicit release exception without calling Step 10 passed.
2. Finish Steps 16 and 17 only if they remain in release scope. Otherwise explicitly defer them. Step 18 is optional and can also be deferred. The plan prioritizes trustworthy settlement over these additions.
3. For Step 19, either demonstrate an actual durable public deployment and the required external runs, or accept and package the permitted local operation handoff with its access limitation.
4. Stop feature work for a named source snapshot, rerun its relevant checks, reconcile manifests and outstanding obligations, inspect final desktop and phone flows and assemble Step 20 evidence. Replace ambiguous current status claims with one current register while retaining historical reports as history.
5. Keep the exact closing timestamp and mock token eligibility unconfirmed until actual organizer evidence is available. No paid service, mainnet or official WIF claim follows from this review.

## Local launch

Free server practice, from last_signal in one PowerShell terminal:

```powershell
$env:SURVIVAL_STATIONS_V2='true'
npm run server
```

In another terminal:

```powershell
npm run dev -w @last-signal/web -- --port 5174 --strictPort
```

Game: http://127.0.0.1:5174/survival.html . Service health: http://127.0.0.1:3001/health . These are local addresses and were not a new live browser playthrough in this review. Funded local preview launch, requiring the existing protected roles and manifest, is documented in TESTNET_SURVIVAL_V2.md at http://127.0.0.1:5175/survival-funded.html . There is no verified public game URL.
