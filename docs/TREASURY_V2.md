# Finite treasury and campaign grant

Step 11 passed locally on 2 November 2026, following the owner's explicit deferral of the outstanding Step 10 human playtest and foreground performance checks. Those checks remain unverified. This step adds local contracts only. It does not enable funded station play, deploy public companions or implement the automatic settlement worker.

## Currency and funding

The original TestWIF source has an hourly public faucet of one hundred mock tWIF and no administrator mint function. It remains unchanged. The local proof funds the new companions with actual faucet issued tokens and explicit bounded approvals and transfers. No asset purchase, mainnet transaction, paid service or replacement token identity is involved. A campaign grant transfers existing tokens; it does not mint another supply.

## Reward backing

SurvivalTreasury holds finite reward capacity. Its immutable token and deployment binder are constructor parameters. The binder can attach one consumer contract with a matching token, once. It cannot rotate that consumer or withdraw pool funds. Before public funding, the bound consumer must be verified as the intended vault. Trust in this initial binding is explicit.

Only the bound consumer can reserve or resolve a unique segment key. A reservation names a player and at most thirty token units. Free capacity equals actual token custody minus all outstanding reservations. Two reservations cannot consume the same backing. Each player has a reservedFor total for inspection. These are allocated reward obligations, not wallet balances or withdrawable player credits.

Resolution closes a key once, releases unused backing and transfers only actual reward use to the fixed consumer address. There is no caller selected payout address. Failed transfers roll back state. Reward use, donations and recycled inflows are distinguishable. Only the bound consumer can label an inflow recycled. totalFunded is cumulative inflow including recycling, not net treasury wealth. Actual balance and freeCapacity remain authoritative. Existing shop burns and player seller proceeds are not treated as funding.

The Step 12 vault will hold deposits and pull claim liabilities and compute exact player credit. It is not implemented by the Step 11 consumer harness. The harness lives in test source and is deliberately labeled test only. It must not be deployed as a production or testnet game vault.

## Welcome campaign

SurvivalWelcomeGrant tracks named campaigns in one canonical distributor for its immutable currency. Each campaign has a separately allocated finite pool. A wallet signs its own claim transaction and receives one hundred existing mock token units once per campaign. Duplicate claims, including competing calls from two connections, cannot pay twice. An empty or failed claim does not consume eligibility. Campaigns cannot borrow one another's assigned budget.

The campaign administrator can create a new named campaign and assign only unallocated direct donations. Existing campaign budgets cannot be withdrawn or moved. A new campaign is explicitly another campaign, not a claim that the recipient is a new human. Multiple wallets may receive grants. Eligibility is scoped to distributor address and campaign ID, not to all future deployments or a unique person. The existing hourly faucet remains separate.

Incoming and outgoing transfers require exact observed token balance changes. Short or false incoming transfers cannot create capacity. Failed outgoing transfers cannot close a reservation or consume welcome eligibility. Both contracts use the already installed OpenZeppelin SafeERC20 and ReentrancyGuard. No dependency migration is required.

## Verification

Twelve new cases passed on a disposable local EVM with chain ID 31337. They cover empty capacity, segment bounds, shared capacity exhaustion, per player backing, duplicate keys and resolution, unused release, authorized recycling, one consumer binding, exact grants, separate faucet cooldown, competing duplicate claims, campaign budget isolation, unallocated donations, short and false transfers, failed payouts and reentrancy from a contract wallet. Strict TypeScript checking passed.

The actual local receipt proof passed with 22 confirmed receipts on chain 31337. Two simultaneous thirty unit reservations exhausted the sixty unit reward pool and rejected oversubscription. Actual campaign claim transferred one hundred tokens, duplicate and empty claims failed, one reservation used eight, the other released all thirty, and the test consumer returned five. Final reward pool custody and free capacity were 57, the test consumer held three, wallet A held 140 and wallet B one hundred. All 300 faucet issued tokens were accounted for with no mint privilege or burn. The consumer is explicitly a test harness, not the Step 12 vault. See evidence/v2-step11-local-treasury.json, compiled with solc 0.8.38+commit.1835d247 on Node v24.16.0.

All 26 existing escrow cases and all eight armory and salvage cases passed afterward. Strict TypeScript and production build passed. Local proof receipts are not public testnet receipts, and browser practice amounts remain explicitly simulated. The service still reports rewards false and settlementWorker false. No existing contract source, deployed address or V1 rules identity was changed.

## Commands

From last_signal, run `npm run survival:treasury:test` for the twelve cases and `npm run survival:treasury:proof` for the disposable local receipt proof. The proof starts its own local node and stops it afterward. Existing launch commands for practice remain unchanged. Compiler and runtime versions are recorded in the proof artifact. Existing package versions are solc 0.8.38, OpenZeppelin contracts 5.6.1, ethers 6.17.0 and Hardhat 3.21.2.
