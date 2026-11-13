import { it,expect } from 'vitest';
import { createJourney,journeyPose,journeyDodge,journeyDrive,journeyStep,journeyFire,validateJourneyResume } from '../packages/sim/src/journey/encounter.ts';
import { createWorld } from '../packages/sim/src/journey/world.ts';
import { JOURNEY_STREAM_RULES_V7,pinJourneyRules } from '../packages/sim/src/journey/rules.ts';
const world=createWorld(72,48,[]);
it('runs crouch at the pinned slower speed while keeping looking independent',async()=>{
  const run=await createJourney({streamed:true});for(const actor of run.actors)if(actor.id!==1)actor.hp=0;
  expect(journeyPose(run,'crouched')).toBe(true);const x=run.actors[0].x;
  journeyDrive(run,{x:1,z:0});journeyStep(run,world);expect(run.actors[0].x-x).toBeCloseTo(.11);expect(run.actors[0].build?.pose).toBe('crouched');
  await expect(validateJourneyResume(structuredClone(run))).resolves.toBeUndefined();
});
it('persists a partial dodge and cooldown without a second movement grant',async()=>{
  const run=await createJourney({streamed:true});for(const actor of run.actors)if(actor.id!==1)actor.hp=0;
  const x=run.actors[0].x;expect(journeyDodge(run,{x:1,z:0})).toBe(true);for(let i=0;i<3;i++)journeyStep(run,world);
  const recovered=structuredClone(run);await validateJourneyResume(recovered);expect(journeyDodge(recovered,{x:-1,z:0})).toBe(false);
  const forged=structuredClone(recovered);forged.actors[0].motion!.nextDodgeAt=0;await expect(validateJourneyResume(forged)).rejects.toThrow('cooldown');
  for(let i=0;i<3;i++)journeyStep(recovered,world);expect(recovered.actors[0].x-x).toBeCloseTo(3);expect(recovered.actors[0].motion?.nextDodgeAt).toBe(60);
});
it('keeps low cover between a crouched shooter and target without granting immunity',async()=>{
  const run=await createJourney({streamed:true}),leader=run.actors[0],guard=run.actors[3],cover=createWorld(72,48,[{x:7,z:22,w:1,d:4,h:1.2}]);
  Object.assign(leader,{x:5,z:24});Object.assign(guard,{x:10,z:24});
  expect(journeyPose(run,'crouched',leader,cover)).toBe(true);expect(journeyFire(run,leader,{x:1,y:0,z:0},cover)).toBe(true);expect(guard.hp).toBe(100);
  run.tick=5;expect(journeyPose(run,'standing',leader,cover)).toBe(true);expect(journeyFire(run,leader,{x:1,y:0,z:0},cover)).toBe(true);expect(guard.hp).toBe(75);
});
it('uses actual crouched target shape and keeps actors vulnerable while dodging',async()=>{
  const run=await createJourney({streamed:true}),leader=run.actors[0],guard=run.actors[3];leader.x=5;leader.z=24;guard.x=10;guard.z=24;
  expect(journeyPose(run,'crouched',guard,world)).toBe(true);
  expect(journeyFire(run,leader,{x:1,y:0,z:0},world)).toBe(true);expect(guard.hp).toBe(100);
  run.tick=5;expect(journeyDodge(run,{x:1,z:0},guard)).toBe(true);
  expect(journeyFire(run,leader,{x:5,y:-1,z:0},world)).toBe(true);expect(guard.hp).toBe(75);
});
it('keeps a version 0.7 snapshot without motion and refuses new abilities',async()=>{
  const run=await createJourney({streamed:true});run.pin=await pinJourneyRules(JOURNEY_STREAM_RULES_V7);for(const actor of run.actors)delete actor.motion;
  await expect(validateJourneyResume(run)).resolves.toBeUndefined();expect(journeyPose(run,'crouched')).toBe(false);expect(journeyDodge(run,{x:1,z:0})).toBe(false);
});
it('uses the same elevated obstruction for pose clearance, movement and shots',async()=>{
  const ceiling=createWorld(72,48,[{x:4,z:22,w:6,d:4,h:.3,y:1.3}]),run=await createJourney({streamed:true});
  for(const actor of run.actors)if(actor.id!==1)actor.hp=0;Object.assign(run.actors[0],{x:5,z:24});
  expect(journeyPose(run,'crouched',run.actors[0],ceiling)).toBe(true);expect(journeyPose(run,'standing',run.actors[0],ceiling)).toBe(false);
  journeyDrive(run,{x:1,z:0});journeyStep(run,ceiling);expect(run.actors[0].x).toBeCloseTo(5.11);
  expect(ceiling.shotDistance({x:2,y:1,z:24},{x:1,y:0,z:0},10)).toBe(10);
  expect(ceiling.shotDistance({x:2,y:1.4,z:24},{x:1,y:0,z:0},10)).toBe(2);
});
