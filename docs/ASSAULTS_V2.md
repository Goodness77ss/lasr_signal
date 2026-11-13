# Bounded station assaults

Step 4 implementation, 1 November 2026. New station practice runs use rules `survival-2.1.0`. Existing `survival-2.0.0` runs retain their static defender and original rules hash. Deployed relay and salvage contracts, rules and identities are unchanged. This mode remains local server practice with no token or NFT reward.

## Director behavior

The typed director configuration is part of the pinned V2 rules and its canonical hash. It permits at most three living enemy squads, including the original C defender. Each new assault assigns exactly two existing weapon class squads. It begins after 25 active gameplay seconds with five seconds of preparation. A subsequent assault can prepare 35 seconds after resolution if two safe slots exist. Capacity or route failure delays for five active seconds and records the reason. No invisible enemy or skipped combat stands in for capacity.

Four authored eastern spawn zones require legal coordinates, collision clearance, at least ten units from the hero and a complete navigable route to the target. Safety is checked again at activation. A changed approach gets a fresh five second warning. The HUD announces the station, east approach and preparation countdown. The first prototype does not add directional audio.

Friendly stations have priority. Among equal priorities, targets rotate by the persistent assault sequence. Neutral ground remains available when all friendly stations are lost. Losing all stations does not end the run or alter health. Living attackers can capture and hold a station through the same station rules the player uses. Surviving guards count against the cap after their assault captures its target; the director waits for capacity rather than silently deleting them.

Threat is one plus the integer active seconds divided by 120, capped at six. Tier two splits approach routes. Tier three adds an existing carbine to the second attacker. Further tiers retain those bounded variants. There are no armored enemies, extra stat multipliers, hidden wealth inputs or improvements to enemy aim in this slice. Enemy HP, damage, movement and visibility retain the inspected combat baseline.

## Evidence and persistence

Each assault has a run scoped monotonic ID, target, preparation and start ticks, member IDs, entry into the ten unit engagement zone, actual friendly participation and ownership timing. Deaths from unrelated enemies cannot resolve that assault. Capturing a station requires a real capture event after activation, not a station that was already hostile. These records do not award anything; Step 5 must still implement and test reward eligibility and deduplication.

An attacker that makes no positional progress for ten seconds outside capture range and outside its recent damage window is flagged as stalled and gets a route retry. Such an assault loses its route eligibility. After thirty seconds without progress, the stuck attacker is removed without loot. No qualifying defense is invented. Completed director history is bounded to 32 entries; IDs never reset or reuse. Future financial reward history must have its own durable unique records and cannot rely on this bounded diagnostic list.

The service saves assault and capture transitions, accepted commands, pause and disconnect immediately, with periodic gameplay checkpoints each second. Director state and pinned configuration are stored in the existing practice checkpoint, not a new financial table. Restart verifies the hash and journal count and resumes paused. Existing Step 3 checkpoints never gain a director. A private online backup and restore check passed before this change.

## Checks and limits

`tests/assault-director.test.ts` covers warning boundaries, safe routes, cap backpressure, changed approach warnings, actual attackers capturing friendly ground, all stations lost recovery, assigned casualties, stable IDs, stall detection, stat bounds, wealth independence, deterministic serialization, configuration bounds, legacy recovery and prepared assault restart. Twelve new cases pass, alongside the fifteen existing V2 cases. Strict build passed before browser review.

## Actual browser and device evidence

A normal starter run captured A before the first assault. At 26 active seconds the HUD displayed Incoming assault on A from the east and four seconds remaining. The two assigned enemies spawned at thirty seconds, advanced along their routes and contested A. The HUD showed three living enemy squads including the original C defender. At forty active seconds actual combat had reduced player health to 69 while A was contested. The unattended player eventually died at 59 active seconds. No hit, kill, ownership or enemy state was injected for this browser review.

Images: evidence/v2-assault-start.png and evidence/v2-assault-contested.png. The start image shows the actual three squad advance after preparation; the warning was observed in the browser tree and preceding screenshot but is not the saved start image. The completed JSON report is evidence/v2-assault-performance.json.

| Measurement | Actual sample |
| --- | --- |
| Device | Intel HD Graphics 520, Windows, ANGLE Direct3D11 |
| Viewport | 1280 by 720 |
| Render buffer | 1581 by 517 |
| Effects and motion | Effects on, reduced motion off |
| Duration and frames | 15.0155 seconds, 881 visible frames |
| Frame cadence | 58.67 FPS average, p95 frame interval 16.8 ms |
| Mean draw calls | 596.87 |
| Approximate JS heap | 36,875,249 bytes |
| Sampled service cost | 256 recent per run ticks, mean 1.02 ms, p95 3.57 ms, peak 10.48 ms |
| Mean snapshot size | 6,085 bytes |

The measurement began during the three enemy assault and ended with two enemies alive, at 48.2 active gameplay seconds. The report samples frame cadence over wall time; game ticks can lag wall time under service load. This is a mixed three to two enemy combat sample, not a steady three enemy benchmark. No heavy regression suite ran during the sample. It supports retaining the conservative cap of three for this initial local slice, not raising the cap or claiming an FPS improvement over earlier scenes. Tick cost includes this run's simulation, due checkpoints and snapshot work, not an end to end latency or concurrent service load test.

The performance panel measures visible requestAnimationFrame cadence, draw calls and approximate heap, and includes server tick duration and snapshot size in its context. These are local observations, not a public load test, total GPU memory or a universal FPS promise. Repeat comparable samples before increasing population. Physical phone combat and sustained sessions remain unverified.
