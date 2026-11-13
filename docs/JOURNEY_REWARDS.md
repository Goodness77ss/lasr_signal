# Journey practice drops and banking

Step 21 verified for local practice, 10 November 2026. The full goal remains active. Step 22 collectible identities and adapters is next. This file records local practice and disposable SQLite evidence only.

## Pinned practice policy

Explicit practice 0.13 adds `journey-rewards-1` to the complete rules hash. Selected squad preparation uses these rules; earlier 0.10, 0.11 and 0.12 entries remain supported. Every third section, including ordinal zero, designates guard 6 as a veteran with 120 health. Other guards remain ordinary with 100 health. Veteran marking and the loot bag use original temporary procedural geometry.

Only a veteran defeated by a friendly weapon or grenade creates a five credit practice drop. Its source binds the enemy, encounter and section; the durable key additionally binds the run. Ordinary guards produce no credit bag. Practice checkpoint rewards cap at 100 credits per run and created drops cap at 50. Created allowance is retained even if a bag is abandoned or the run is forfeited. A new run has its own explicit allowance; no account wide or financial reward budget is claimed for anonymous practice.

Creation, pickup and banking are separate states. The living leader must approach within two metres with a clear line to pick up a bag. Duplicate pickup cannot pay again. An uncollected bag is abandoned when leaving its section; picked loot carries forward separately from checkpoint credits. Retired section sources remain in SQLite. Neither state grants owned inventory or wallet value.

Banking follows the approved terminal practice policy. At a completed checkpoint, BANK & FINISH commits checkpoint and collected loot credits, clears provisional counters and ends the run. Quit or death forfeits new unbanked rewards once. Previously owned assets and prior wallet claims are outside this journal and are not modified. Practice has no wall clock deadline: disconnect preserves its saved state. Funded timeout, account budgets and settlement policies remain Step 31 decisions.

## Durable journal

Migration 5 adds reward allowances, immutable source identities and one terminal record per run. They commit with the existing snapshot, command acknowledgement, checkpoint journal and XP journal. Rejected terminal writes roll back the entire bank. Command replay returns the stored acknowledgement; new duplicate pickup or bank commands have no effect. Banked XP summary is identified separately and still produces no chain voucher.

The service advertises the distinct 0.13 capability and publishes the authorized run's reward totals. Drop positions are filtered through friendly range and obstruction checks in server observations. Clients may submit a drop ID, never its amount, rank or reward. The browser remains a separate local simulation until Step 33.

## Actual evidence

`npx tsx scripts/journey-rewards-proof.ts` drove ordinary combat, pickup, checkpoint completion and banking without granting health, inventory or rewards. It banked 15 simulated credits at tick 305, comprising ten checkpoint credits and five loot credits. Reopening the disposable SQLite file preserved the run, sources and terminal result; replay returned the same bank acknowledgement. Actual output is `docs/evidence/journey-rewards-proof.json`.

The actual browser's REVIEW PRACTICE LOOT AND BANK entry used ordinary combat and pickup, paused with five provisional loot credits, then reached the checkpoint. RESUME and the ordinary BANK & FINISH button produced 15 banked practice credits and disabled further bank and continue actions. Evidence is `evidence/journey-loot-browser.json`, `journey-loot-picked.png` and `journey-loot-banked.png`. The image is browser local practice, not durable multiplayer or chain proof.

Focused checks cover veteran versus ordinary defeat, first source creation, duplicate death, repeated pickup, obstruction and height, leader death, cap saturation, abandoned sections, equipment preservation, competing service pickups, rejected bank writes, replay, untimed disconnect and resume, and strict client amount rejection. Actual socket checks cover 0.13 admission, capability advertisement and rejection of submitted loot values. Fixtures isolating cap accounting or attribution are explicitly labelled in tests.

Full regression passed 342 tests across 59 files. Final review then corrected elevated death drops being projected into the ground: bags retain the enemy's defeat height, pickup uses three dimensional reach and obstruction, and the renderer uses that height. A new height fixture verifies recovery above a low barrier and rejects a bag beyond reach. The final focused command `npx vitest run tests/journey-rewards.test.ts tests/journey-progress.test.ts tests/journey-application-socket.test.ts tests/journey-boundary.test.ts --maxWorkers=2 --testTimeout=30000` passed 25 tests. Final `npm run build` passed strict TypeScript and production build, and the reward proof was regenerated successfully. The browser captures show the ground level flow before that final height correction; elevated pickup is covered by the focused simulation fixture, not a browser vault claim.

Run `npm run journey:dev` and open `http://127.0.0.1:5180/?mode=journey`. Choose a squad, approach a bag and use PICK UP DROP or F, then reach a completed checkpoint and BANK & FINISH. The labelled automated review entry is available for reproducible local inspection. No chain reward, token transfer, public multiplayer or human playtest is claimed.
