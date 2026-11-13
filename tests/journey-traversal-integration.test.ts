import { expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createJourney, journeyJump, journeyVault, journeyDodge, journeyMove, journeyPath, journeyStep, journeyFire, journeyThrow, journeyBank, validateJourneyResume, actorEye, actorElevation } from '../packages/sim/src/journey/encounter.ts';
import { createWorld } from '../packages/sim/src/journey/world.ts';
import { JOURNEY_STREAM_RULES_V9, pinJourneyRules } from '../packages/sim/src/journey/rules.ts';
import { JourneyService } from '../apps/server/src/journey-service.ts';
import { JOURNEY_IDENTIFIERS, parseJourneyClient } from '../packages/protocol/src/journey.ts';
import { createVaultDrill } from '../packages/sim/src/journey/traversal-drill.ts';

it('recovers the authored vault review on unchanged generated world geometry',async()=>{
  const run=await createVaultDrill();
  await expect(validateJourneyResume(run)).resolves.toBeUndefined();
  for(let i=0;i<9;i++)journeyStep(run);
  expect(actorElevation(run.actors[0])).toBeGreaterThan(1);
  await expect(validateJourneyResume(structuredClone(run))).resolves.toBeUndefined();
  for(let i=0;i<10;i++)journeyStep(run);
  expect(run.actors[0].traversal?.grounded).toBe(true);expect(run.practiceCredits).toBe(0);
});

it('pins physical traversal and refuses jump spam, midair dodge and midair banking', async () => {
  const run = await createJourney({ streamed: true });
  expect(run.pin.rules.version).toBe('journey-practice-0.10.0');
  expect(journeyJump(run)).toBe(true); expect(journeyJump(run)).toBe(false);
  expect(journeyDodge(run, { x: 1, z: 0 })).toBe(false);
  journeyStep(run); expect(actorElevation(run.actors[0])).toBeGreaterThan(0);
  await expect(validateJourneyResume(structuredClone(run))).resolves.toBeUndefined();
  run.state = 'CHECKPOINT_REACHED'; run.checkpointComplete = true;
  Object.assign(run.actors[0], { x: 66, z: 24 });
  expect(journeyBank(run)).toBe(false);
});

it('uses elevated target shapes and grenade origins instead of grounded substitutes', async () => {
  const run = await createJourney({ streamed: true }), world = createWorld(72, 48, []), leader = run.actors[0], guard = run.actors[3];
  for (const actor of run.actors) if (actor.id !== 1 && actor.id !== 4) actor.hp = 0;
  Object.assign(leader, { x: 5, z: 24 }); Object.assign(guard, { x: 10, z: 24, ammo: 0, reserve: 0 });
  expect(journeyJump(run, guard, world)).toBe(true);
  for (let i = 0; i < 7; i++) journeyStep(run, world);
  expect(actorElevation(guard)).toBeGreaterThan(1);
  expect(journeyFire(run, leader, { x: 5, y: -1.5, z: 0 }, world)).toBe(true); expect(guard.hp).toBe(100);
  run.tick += 5;
  expect(journeyFire(run, leader, { x: 5, y: actorElevation(guard) + 1 - actorEye(leader), z: 0 }, world)).toBe(true); expect(guard.hp).toBe(75);
  expect(journeyThrow(run, { x: 0, y: 1, z: 0 }, guard, world)).toBe(false); // Encounter guards have no inventory.
  expect(journeyJump(run, leader, world)).toBe(true); journeyStep(run, world);
  expect(journeyThrow(run, { x: 0, y: 1, z: 0 }, leader, world)).toBe(true);
  expect(run.projectiles![0].position.y).toBe(actorEye(leader));
});

it('uses the same derived vault links for a player and an investigating enemy', async () => {
  const world = createWorld(72, 48, [{ x: 20, z: 0, w: .8, d: 48, h: 1.1 }]), goal = { x: 23.5, z: 24 };
  expect(journeyPath(world, { x: 19, z: 24 }, goal)).toHaveLength(0);
  expect(journeyPath(world, { x: 19, z: 24 }, goal, true).some(p => p.traverseDirection)).toBe(true);
  const playerRun = await createJourney({ streamed: true });
  for (const actor of playerRun.actors) if (actor.id !== 1) actor.hp = 0;
  Object.assign(playerRun.actors[0], { x: 19, z: 24 });
  expect(journeyMove(playerRun, goal, world)).toBe(true);
  let playerApex = 0;
  for (let i = 0; i < 60; i++) { journeyStep(playerRun, world); playerApex = Math.max(playerApex, actorElevation(playerRun.actors[0])); }
  expect(playerRun.actors[0].x).toBeCloseTo(goal.x); expect(playerApex).toBeGreaterThan(1.1); expect(playerRun.actors[0].traversal?.grounded).toBe(true);
  const enemyRun = await createJourney({ streamed: true });
  for (const actor of enemyRun.actors) if (actor.id !== 1 && actor.id !== 4) actor.hp = 0;
  Object.assign(enemyRun.actors[0], { x: 60, z: 44 });
  const guard = enemyRun.actors[3]; Object.assign(guard, { x: 19, z: 24 });
  guard.awareness = { state: 'search', lastKnown: goal, targetId: null, expiresAt: 100, reactAt: 0, confidence: .8, lastSoundSequence: 0 };
  let enemyApex = 0;
  for (let i = 0; i < 60; i++) { journeyStep(enemyRun, world); enemyApex = Math.max(enemyApex, actorElevation(guard)); }
  expect(guard.x).toBeGreaterThan(21.15); expect(enemyApex).toBeGreaterThan(1.1); expect(guard.traversal?.grounded).toBe(true);
});

it('keeps saved practice 0.9 flat and refuses newly introduced abilities', async () => {
  const run = await createJourney({ streamed: true }); run.pin = await pinJourneyRules(JOURNEY_STREAM_RULES_V9);
  for (const actor of run.actors) delete actor.traversal;
  await expect(validateJourneyResume(run)).resolves.toBeUndefined();
  expect(journeyJump(run)).toBe(false); expect(journeyVault(run, { x: 1, z: 0 })).toBe(false);
  journeyStep(run); expect(run.actors[0].traversal).toBeUndefined();
});
it('uses actual jump links over a thin low barrier for player and enemy navigation',async()=>{
  const world=createWorld(72,48,[{x:20,z:0,w:.05,d:48,h:.6}]),start={x:19,z:24},goal={x:23.5,z:24};
  expect(journeyPath(world,start,goal,true).some(p=>p.traverseKind==='jump')).toBe(true);
  for(const id of [1,4]){
    const run=await createJourney({streamed:true});
    for(const actor of run.actors)if(actor.id!==1&&actor.id!==id)actor.hp=0;
    const actor=run.actors[id-1];Object.assign(actor,start);
    if(id===1)expect(journeyMove(run,goal,world)).toBe(true);
    else{Object.assign(run.actors[0],{x:60,z:44});actor.awareness={state:'search',lastKnown:goal,targetId:null,expiresAt:100,reactAt:0,confidence:.8,lastSoundSequence:0};}
    let apex=0,vaulted=false;
    for(let tick=0;tick<60;tick++){journeyStep(run,world);apex=Math.max(apex,actorElevation(actor));vaulted||=!!actor.traversal?.vault;}
    expect(actor.x).toBeGreaterThan(20.4);expect(apex).toBeGreaterThan(1);expect(vaulted).toBe(false);expect(actor.traversal?.grounded).toBe(true);
  }
});

it('accepts intentions only and rejects submitted jump physics and vault destinations', () => {
  const command = { op: 'command', id: 'vertical', sequence: 1, section: 'journey-sections-1:1:0', actorId: 1 };
  for (const action of [{ kind: 'jump' }, { kind: 'vault', direction: { x: 1, z: 0 } }]) expect(parseJourneyClient(JSON.stringify({ ...command, action }))).toMatchObject({ action });
  for (const action of [{ kind: 'jump', y: 5 }, { kind: 'jump', velocity: 9 }, { kind: 'vault', direction: { x: 0, z: 0 } }, { kind: 'vault', direction: { x: 1, z: 0 }, target: { x: 25, y: 3, z: 24 } }]) expect(() => parseJourneyClient(JSON.stringify({ ...command, action }))).toThrow();
});

it('commits one jump, freezes it during pause and restores the live flight after service recreation', async () => {
  const db = new DatabaseSync(':memory:'), messages: Record<string, unknown>[] = [], transport = { send: (m: unknown) => messages.push(m as Record<string, unknown>), close: () => {} };
  let service = new JourneyService(db), client = service.connect(transport);
  try {
    await client.receive({ op: 'start', ...JOURNEY_IDENTIFIERS });
    const session = messages.find(m => m.op === 'session')!, run = String(session.run), credential = String(session.credential), read = () => service.store.load(run, credential);
    const base = { op: 'command' as const, actorId: 1, section: read().run.section }, jump = { ...base, id: 'jump', sequence: 1, action: { kind: 'jump' as const } };
    await client.receive(jump); await client.receive(jump);
    expect(read().run.actors[0].traversal?.velocity).toBe(6);
    await client.receive({ ...base, id: 'pause', sequence: 2, action: { kind: 'pause' } });
    for (let i = 0; i < 40; i++) service.tick(); expect(read().run.tick).toBe(0);
    await client.receive({ ...base, id: 'resume', sequence: 3, action: { kind: 'resume' } });
    for (let i = 0; i < 7; i++) service.tick(); expect(actorElevation(read().run.actors[0])).toBeGreaterThan(1);
    const expected = structuredClone(read().run); client.close(); service = new JourneyService(db); client = service.connect(transport);
    await client.receive({ op: 'resume', ...JOURNEY_IDENTIFIERS, run, credential });
    await client.receive(jump); expect(read().run).toEqual(expected);
    for (let i = 0; i < 15; i++) { journeyStep(expected); service.tick(); }
    expect(read().run).toEqual(expected); expect(read().run.actors[0].traversal?.grounded).toBe(true);
  } finally { client.close(); db.close(); }
});
