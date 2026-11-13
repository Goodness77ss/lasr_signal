import { it,expect } from 'vitest';
import { createJourney,journeyStep,journeyWorld,journeyFire,validateJourneyState } from '../packages/sim/src/journey/encounter.ts';
import { distance } from '@last-signal/sim';
import { pinJourneyRules,JOURNEY_STREAM_RULES_V2 } from '../packages/sim/src/journey/rules.ts';
import { validateJourneyResume } from '../packages/sim/src/journey/encounter.ts';
it('keeps individual equipment, entitlement, health and ammunition separate',async()=>{
  const run=await createJourney({streamed:true,seed:1}),helper=run.actors[1],enemy=run.actors[3];Object.assign(helper,{x:8,z:24});Object.assign(enemy,{x:12,z:24});
  expect(journeyFire(run,helper,{x:4,y:-.65,z:0})).toBe(true);expect(helper.ammo).toBe(19);expect(run.actors[0].ammo).toBe(20);expect(enemy.hp).toBe(90);expect(run.actors[0].hp).toBe(100);
  expect(helper.build).toMatchObject({classId:'starter-rifle',weapon:'service-rifle',armour:0,pose:'standing',entitlement:'free-starter'});
  expect(enemy.build?.entitlement).toBe('encounter');expect(run.actors.filter(a=>a.side===0)).toHaveLength(3);expect(()=>validateJourneyState(run)).not.toThrow();
  const invalid=structuredClone(run);delete invalid.actors[1].build;expect(()=>validateJourneyState(invalid)).toThrow('build');
});
it('preserves the old pinned formation behaviour instead of upgrading a saved run',async()=>{
  const run=await createJourney({streamed:true,seed:1});run.pin=await pinJourneyRules(JOURNEY_STREAM_RULES_V2);
  Object.assign(run.actors[0],{x:27,z:20});Object.assign(run.actors[1],{x:16,z:24});run.actors[2].hp=0;for(const enemy of run.actors.filter(a=>a.side===1))enemy.hp=0;
  await expect(validateJourneyResume(run)).resolves.toBeUndefined();journeyStep(run);
  expect(run.pin.rules.version).toBe('journey-practice-0.2.0');expect(run.actors[1].route.at(-1)).toMatchObject({x:27,z:20});
});
it('follows reachable formation slots around cover without teleporting or reviving a helper',async()=>{
  const run=await createJourney({streamed:true,seed:1}),world=journeyWorld(run);
  // Isolate formation; natural combat is covered by the encounter and bot checks.
  for(const enemy of run.actors.filter(a=>a.side===1))enemy.hp=0;
  Object.assign(run.actors[0],{x:27,z:20});Object.assign(run.actors[1],{x:16,z:24});run.actors[2].hp=0;
  const ammunition=run.actors[0].ammo;
  for(let i=0;i<220;i++){const before={...run.actors[1]};journeyStep(run,world);expect(distance(before,run.actors[1])).toBeLessThanOrEqual(run.pin.rules.speed/run.pin.rules.ticks+.0001);expect(world.walkable(run.actors[1])).toBe(true);}
  expect(distance(run.actors[0],run.actors[1])).toBeLessThan(5);expect(distance(run.actors[0],run.actors[1])).toBeGreaterThan(.8);expect(run.actors[2].hp).toBe(0);expect(run.actors[0].ammo).toBe(ammunition);
});
