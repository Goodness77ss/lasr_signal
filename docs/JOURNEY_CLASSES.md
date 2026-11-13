# Seven local soldier classes

Step 18 verified within local practice scope on 9 November 2026. J09 approves the seven concepts. Numbers below are reversible prototype tuning, not approved mint supply, pricing or final balance. No soldier collection or new collectible gun adapter is implemented by this step.

## Profiles

| Class | Health | Armour | Speed | Vision | Signature loadout | Actual ability and tradeoff |
| --- | --- | --- | --- | --- | --- | --- |
| Mara, Anchor | 100 | 10% | 4 | 22 | Service rifle | Brace adds 15 armour points for 40 ticks, with 160 tick recovery. Balanced generalist. |
| Kestrel, Scout | 80 | 5% | 5 | 28 | Field carbine | Recon adds four metres of observation for 60 ticks, with 200 tick recovery. Low health and protection. |
| Rook, Bulwark | 120 | 25% | 3 | 20 | Support gun | Brace for 60 ticks with 200 tick recovery. Heavy protection costs speed and a 75 tick reload. |
| Imani, Medic | 90 | 5% | 4 | 22 | Defensive carbine | Two finite 25 HP treatments, within three metres and clear sight, 60 tick recovery. Carbine damage is reduced to 80%. |
| Flint, Grenadier | 100 | 15% | 3.6 | 22 | Rifle and fragmentation grenades | Three finite grenades through the existing throw command. Slower movement and reload. No separate active Q ability is advertised. |
| Vale, Marksman | 80 | 5% | 3.6 | 32 | Marksman rifle | Crouch to activate focus: eight extra metres of observation and weapon range for 60 ticks, 200 tick recovery and half movement speed while active. Small magazine and slow firing. |
| Beck, Ranger | 95 | 10% | 4.2 | 24 | Trench shotgun | One finite 24 round reserve refill, capped at 60 reserve. Short weapon reach. |

Speed is metres per second before terrain and stance. Observation and weapon range are separate. Armour reduces actual shot and blast damage and is capped at 40 percent while braced. No class grants invulnerability. Rank is cosmetic and does not change these stats.

Helper formation spacing uses the class profile. A medic helper prioritizes a living wounded teammate. Helpers can treat, brace, recon, focus or refill under their actual conditions. A helper never receives a client supplied healing amount. Grenadier stock is finite, not a promise that helpers automatically throw grenades. Concise original text lines accompany deployment and ability use; no speech model or external service is used.

## Local weapon builds

| Build | Trigger damage ceiling | Interval | Range | Magazine | Initial reserve | Base reload |
| --- | --- | --- | --- | --- | --- | --- |
| Service rifle | 25 | 5 ticks | 28 m | 20 | 80 | 30 ticks |
| Field carbine | 12 | 3 ticks | 22 m | 30 | 90 | 26 ticks |
| Support gun | 10 | 2 ticks | 30 m | 60 | 120 | 60 ticks |
| Marksman rifle | 48 | 18 ticks | 44 m | 5 | 25 | 44 ticks |
| Trench shotgun | 30 across five rays | 16 ticks | 8 m | 6 | 36 | 44 ticks |

Class reload percentages apply to the base. Shotgun rays share a trigger damage budget, have deterministic spread and distance falloff, and spend one shell per trigger. Every build uses the same height aware body and world obstruction queries. These are local gameplay definitions under `journey-weapons-1`. They do not reinterpret existing immutable gun collections, metadata or token IDs. New ownership and market adapters remain Step 26 work.

## Version and authority

Explicit class practice pins `journey-practice-0.11.0`, including the complete immutable class and weapon pack. Ordinary starter entry remains practice 0.10. Class definitions are separate from actor health, ammunition, cooldowns and finite charges. No experience or collectible identity is stored in the class definition.

The briefing offers each class as one local leader with two free rifle helpers. This is Step 18 access for trying roles; full leader, helper and loadout selection remains Step 19. These actors are marked `local-development`, not owned NFTs. Selection happens before combat and no class switch is accepted during a live run.

The service derives ability effects from the pinned class, rejects extra client fields, checks ownership of the controlled actor and commits the same durable command journal as other actions. A replayed treatment heals once and consumes one charge. An invalid target, full health, dead actor, blocked treatment ray, empty stock or cooldown rejects without charging. Class injury, ammunition and used charges persist through section travel. New public class entry is not advertised by the existing starter capability endpoint; service class recovery is checked with an internally created disposable practice run. The roster transport gate is Step 19.

## Visuals and corrected traversal rendering

`journey-soldier.ts` builds original procedural radio, scarf, plate, medical satchel, grenade bandolier, coat and pouch variants. Signature weapons have matching local procedural variants in world and eye view. They are temporary prototype assets, with the same pose height limits and existing shared rig. No external asset or dependency was added.

Inspection found that the shared animation overwrote the previously assigned actor elevation. Physics and the eye camera had been correct, but the third person figure could remain at ground level. The animation now accepts authoritative elevation while preserving legacy callers' zero default. Tests exercise the final animated position and bounds. Fresh `journey-vault-rendered-height.png` and `journey-class-browser.json` supersede the old third person figure evidence: physical feet are 1.18 m and rendered root is about 1.216 m with ordinary walking bob. This is not a new physics grant or animation quality claim.

## Actual verification

Full `npx vitest run --maxWorkers=2 --testTimeout=30000` passed 313 tests in 55 files. A later added class transition case passed in a focused 21 test run across class simulation, class catalogue, class visuals, camera and actor checks. `npm run build` passed strict typecheck and production build. The final focused command was `npx vitest run tests/journey-class-integration.test.ts tests/journey-classes.test.ts tests/journey-class-visuals.test.ts tests/journey-camera.test.ts tests/journey-actors.test.ts --maxWorkers=2 --testTimeout=30000`.

Coverage includes seven valid profiles, cosmetic maximum safe integer rank, unsupported classes and weapons, actual damage, cadence, reload, per trigger charge, wall and height obstruction, bounded shotgun spread damage, armour and brace, observation filtering, finite treatment and refill, helper healing, changed command replay, service recreation, bad snapshots, unchanged old rules and class inventory surviving a section transition.

Actual browser selection verified all seven expected class IDs, health, weapons and inventories. Rook showed 120 HP and support gun 60 / 120 with a committed brace timer. Beck changed 6 / 36 to 6 / 60 and used his single reserve charge. Vale crouched and activated focus, with the marksman scope visible and validated one metre eye height. Evidence: `docs/evidence/journey-class-browser.json`, `journey-class-catalogue.png`, seven named class screenshots and `journey-class-vale-focus.png`.

This is local practice and disposable SQLite service evidence. Browser reload resets its run. No new soldier NFT, chain balance, marketplace sale, public multiplayer, final balance assessment or human playtest is claimed. The forty step goal remains active; Step 19 is next.
