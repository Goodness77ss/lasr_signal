# Journey jumping and vaulting

Rendering correction, 9 November 2026: later inspection found shared soldier animation overwrote the third person figure's assigned elevation. Physics and eye height were correct; the figure could remain near ground. The animation now receives authoritative elevation, with five camera and figure checks and the wider class regression passing. Fresh `journey-vault-rendered-height.png` and `journey-class-browser.json` prove the rendered root follows the 1.18 metre foot elevation plus normal animation bob. These supersede the earlier third person figure capture. See JOURNEY_CLASSES.md.

Step 17 verified for the current local prototype on 9 November 2026. Owner decision J08 requires jumping and vaulting in the first prototype. New runs pin `journey-practice-0.10.0` and the complete traversal parameter pack. Explicit practice 0.9 remains supported without vertical actors or the new abilities.

## Actual behavior

Actors have foot elevation, vertical velocity, grounded state, last landing tick, jump readiness and an optional vault plan. Jump uses a six metre per second initial velocity, gravity fourteen and twenty simulation ticks per second. The fixed discrete integration reaches about 1.14 metres. A second jump and a new dodge are rejected while airborne. Jump readiness is sixteen ticks; landing must also have happened.

The full standing or crouched body is swept in three dimensions against the same solid volumes used for shots. Ground support includes the terrain elevation query and solid top faces. Maximum ordinary step is 0.35 metres and the allowed terrain gradient is 0.8. Walking off an edge leaves the actor airborne for gravity to resolve. A ceiling stops ascent and gravity returns the actor to support. Fall damage is disabled for this practice tuning; no asset loss policy is implied.

Vault accepts a direction only. The simulation derives a nearby obstacle, the landing point and a full clear trajectory. Maximum obstacle height is 1.35 metres, reach 1.2 metres and travel 3.6 metres. The eighteen tick path rises before moving over the obstacle, then lowers onto support. Standing clearance is checked along every swept segment, including ceilings. A recovered plan is checked against the original geometry, direction, endpoint, crest and timers. No destination, height or velocity is accepted from the browser.

Ground navigation remains the preferred bounded route. When no connected ground route exists, a second bounded search derives jump and vault links from the same physical helpers. Jump prediction includes the actual gravity, body sweep, movement speed and terrain speed. Leaders, helpers and investigating guards execute those links through ordinary abilities. Generated sections still retain their validated ground alternatives; no mandatory jump was introduced into the generator.

Camera eye height, body hit shapes, observation rays, grenade launch height, blast target height and shot effect origin use actual elevation. Checkpoint holds and banking require route ground rather than a matching horizontal coordinate in midair. Living helpers must be grounded before section travel. Previously saved flat rules keep their existing behavior.

## Controls and review

Use J or JUMP, E or VAULT, C for crouch and Space for dodge. Vault toward the movement heading in command view or the look direction in eye view. Stand before jumping or vaulting. Reload and pause retain their existing controls. Input release freezes no timer by itself; explicit local pause and disconnected service practice freeze simulation ticks.

The development briefing has labelled authored jump and vault drills. They use ordinary simulation and pause for inspection in flight. The vault drill chooses a legal approach to an actual generated solid without changing its definition. The HUD retains the authored label after changing camera view. These setups are not naturally reached checkpoint, reward or human playtest evidence.

Browser evidence in `docs/evidence/journey-traversal-browser.json`:

| Observation | Measured state |
| --- | --- |
| Jump tick 7 | Feet 1.12 metres, velocity 1.1, airborne, eye camera 2.92 metres |
| Jump tick 29 | Feet zero, grounded, landing recorded at tick 17, eye camera 1.8 metres |
| Vault tick 9 | Feet 1.18 metres over a 1.1 metre barrier, active plan from z20.5 to z23.35 |
| Vault tick 34 | At z23.35, feet zero, grounded, landing recorded at tick 18, plan cleared |

Images: `journey-jump-airborne.png`, `journey-jump-landed.png`, `journey-vault-airborne.png` and `journey-vault-landed.png`. Leader health fell to 93 during the vault and 86 after resume. No invulnerability or reward grant was used. All images are actual browser local practice with original procedural assets.

## Requirement checks

| Requirement | Evidence |
| --- | --- |
| Physical jump and bounded repeated input | `journey-traversal.test.ts` and `journey-traversal-integration.test.ts` |
| Ceiling, thin wall, steps, edge fall and steep slope | Shared swept body cases in `journey-traversal.test.ts` |
| Low vault, unreachable landing, tall or wide obstacle, edited plan | Vault and recovery cases in `journey-traversal.test.ts` |
| Same player and enemy constraints | Real simulation corridor tests for both jump and vault links in `journey-traversal-integration.test.ts` |
| Elevated shots and grenade origin | Integrated airborne combat cases |
| Airborne command replay, pause and durable service recreation | Integrated disposable SQLite service case |
| Network correction and reconnect | Actual loopback socket jump, filtered snapshots, resume and midair dodge rejection in `journey-application-socket.test.ts` |
| Camera and original modes | `journey-camera.test.ts`, legacy checks and production build |
| No mandatory unsupported generated jump | Existing validated ground route generator retained; full generator regressions include 10000 sections |

Full `npx vitest run --maxWorkers=2 --testTimeout=30000` passed 300 tests in 52 files. After the final elevated sight and effect correction, seven relevant files passed thirty checks and `npm run build` passed strict typecheck and production build. The final focused command was `npx vitest run tests/journey-awareness.test.ts tests/journey-perception-drill.test.ts tests/journey-boundary.test.ts tests/journey-traversal.test.ts tests/journey-traversal-integration.test.ts tests/journey-camera.test.ts tests/journey-application-socket.test.ts --maxWorkers=2 --testTimeout=30000`.

## Limits and next step

Region ground remains flat between solid obstacles. Terrain elevation and slope checks do not claim rendered sloping highlands. Navigation links currently connect ground routes across validated low obstacles; this is not a multistorey building navigation system. Vault uses the existing standing procedural figure on a physical trajectory, without an articulated hand over cover animation. No new external art or dependency was added.

The browser page is still local simulation and resets on reload. The durable service and actual socket behavior are separately tested; its browser renderer adapter remains Step 33. No public multiplayer, chain progress, funded Journey reward or human playtest is claimed.

Step 18 may proceed using all seven concepts approved in J09. Class numbers are reversible local tuning; mint supply, purchase policy, consumables and funded custody remain separate later decisions.
