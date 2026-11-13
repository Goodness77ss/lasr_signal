# Journey encounter eligibility

Practice rules 0.7 preserve older saved rule versions and add the following conditions. All conditions require a living leader. Completion creates ten provisional credits; banking is a separate terminal choice. The gate at 66,24 alone grants nothing.

| Template | Required threats | Objective | Alternate approach | Failure and activation |
| --- | --- | --- | --- | --- |
| Road ambush | All three current guards | Survive and clear | Use either side of the road around cover | Death ends run. All guards down opens exit. |
| Crossing | Guards 4 and 5 | Hold 50,24 within radius 3 for 40 uncontested ticks | Approach from either road shoulder; distant guard 6 need not be killed | Living guard within 8 contests. Leaving or contest decays progress one tick. Full hold opens exit. |
| Supply route | Guard 4 | Secure 55,24 within radius 3 for 30 uncontested ticks | Reach from either shoulder after clearing the defender | Nearby survivors contest; distant optional survivors do not block. Decay and death rules match crossing. |

The current flat prototype has no separately generated alternate objective. Alternate routes use shared collision and path queries around existing cover. A required enemy must remain reachable under generated section validation. Optional distant enemies cannot create an unreachable last enemy lock in crossing or supply. Ambush deliberately requires full clearance.

Difficulty changes role composition every three sections, capped at tier four. Three current guards, 100 base health and finite ammo remain bounded. No endless health multiplier or spawning loop exists. Injuries and ammunition persist across transitions, creating supply pressure. Further weapon and archetype progression remains later work.

Checkpoint events include the exact section identity and source. The SQLite source key is unique per run. Repeated tick snapshots containing the same event are accepted; a new event sequence for the same source rejects and rolls back the entire write. Section regeneration cannot reset that durable key.

Evidence: tests/journey-checkpoints.test.ts, journey-review-bot.test.ts, journey-store.test.ts and journey-streaming.test.ts. Seed 5 completes crossing, ambush and supply through ordinary combat commands in the simulation. journey-crossing-objective.png shows corrected short screen instructions and the original procedural amber ring in actual browser practice. Browser sequence review remains in progress. Neither capture nor simulation is public multiplayer or blockchain proof.

Browser closure: journey-three-checkpoints.png now records the completed three encounter sequence, paused at ordinal 3 with 30 provisional practice credits. See tracker for exact test and build results.
