# Journey world and combat

Status: proposed systems and acceptance criteria, not implemented features.

## Infinite route model

Use seeded, bounded route sections with entrances, exits, encounter areas and validated collision. Keep only nearby sections active. Retire distant geometry and enemies while preserving a compact journal of progress. Checkpoint IDs include run, section and encounter identity. Rejoining a run must restore the same seed, section, roster, loot and completed checkpoints.

Unbounded progression does not mean unbounded memory, enemy counts or rewards. Avoid endless numeric stat inflation. Use difficulty tiers, tougher combinations and capped simultaneous enemies. Preserve safe spawn distances and a traversable route for every section.

## Initial regions

| Region | Visual identity | Gameplay effects | Fairness requirements |
| --- | --- | --- | --- |
| Ruined outskirts | Broken brick streets and wrecks | Clear lanes, solid cover, flanking routes | At least two viable approaches; readable collision |
| Wet woodland | Trees, muddy paths and shallow water | Mud slows movement; vegetation reduces observation distance | No invisible walls; visible mud boundaries; no shooting through solid trunks |
| Rocky highlands | Rock cuts, narrow passes and exposed ridges | Chokepoints, longer sightlines and limited supply locations | No hidden cliff fall damage; valid navigation and cover alternatives |

Start with flat, connected walkable surfaces and authored obstacles. Actual height traversal, slopes, jumping and vertical hit detection need dedicated implementation before claiming realistic highlands. Visual region changes alone are not proof that terrain affects gameplay.

## Checkpoints and encounters

Initial templates: road ambush, defended crossing and a supply position with a risky shortcut. Encounters should let players make movement decisions rather than require hunting an unreachable final enemy. Define an explicit completion condition for each template.

Reward only the first valid completion. Going backward, reconnecting, repeating requests or revisiting retired sections must not pay again. Show the next destination, region effect and current unbanked earnings clearly.

## Enemy awareness

Enemies react to incoming damage, nearby gunfire, line of sight and visible fallen allies. Remember the last suspected threat position for a limited period. Turn, investigate, seek reachable cover, return fire, flank or retreat according to role. Attackers cannot know a hidden player's exact location through walls.

Reaction delay, aim speed and accuracy must be bounded. Dodging is a response to observable danger, not knowledge of a future random bullet result. Assign a few distinct roles before adding a complicated behaviour graph. Test a rear attack, loss of sight, cover selection, pursuit and retreat.

## Grenades

Proposed first grenade: one fragmentation type with a limited inventory, visible throw arc, fuse, warning cue, blast falloff and wall obstruction. Decide friendly fire before implementation. Check throw range, valid origin, inventory consumption and duplicate commands on the authoritative simulation. No wallet prompt should interrupt the throw itself.

Grenade purchases, collectible ownership and deployed grenade inventory are separate concepts. A purchased item must not become an unlimited grenade source. Death, quit, disconnect and retry rules must define exactly what was consumed.

## Movement abilities

Implement crouching and a limited dodge first. Crouching changes movement and the actual shot target shape; a lower animation alone is insufficient. Dodging needs a cooldown, collision checks and clear feedback. It should not grant unexplained invulnerability.

Jumping and vaulting require vertical position, landing, obstacle clearance, camera behaviour, enemy navigation and matching bullet tests. Schedule them after the base route works. Do not animate a jump over a wall while the server still treats the unit as standing on the original plane.

## World exit checks

All generated sections are traversable. Bodies and shots agree with solid scenery. Terrain effects are deterministic and visible. Enemies cannot spawn inside the player or an obstacle. Rear attacks provoke a reasonable response. A long automated journey keeps memory and active enemy counts bounded. Reconnect and checkpoint replay do not duplicate rewards or loot.
