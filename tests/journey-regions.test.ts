import { it,expect } from 'vitest';
import { generateSection } from '../packages/sim/src/journey/generator.ts';
import { regionWorld,regionSolids } from '../packages/sim/src/journey/regions.ts';
import { createJourney,journeyWorld,journeyDrive,journeyStep } from '../packages/sim/src/journey/encounter.ts';
import { journeyObservation } from '../apps/server/src/journey-boundary.ts';
import { pinJourneyRules,JOURNEY_STREAM_RULES_V3 } from '../packages/sim/src/journey/rules.ts';
it('reproduces terrain traversal and preserves old flat terrain for a saved version',async()=>{
  const run=await createJourney({streamed:true});run.stream={seed:1,ordinal:'1',completedThrough:'0'};run.sectionData=generateSection(1,'1');run.section=run.sectionData.id;Object.assign(run.actors[0],{x:20,z:24});
  const copy=structuredClone(run);
  for(let i=0;i<10;i++){journeyDrive(run,{x:-1,z:0});journeyStep(run);journeyDrive(copy,{x:-1,z:0});journeyStep(copy);}
  expect(copy).toEqual(run);
  const saved=structuredClone(run);saved.pin=await pinJourneyRules(JOURNEY_STREAM_RULES_V3);
  expect(journeyWorld(saved).terrain({x:20,z:24}).speed).toBe(1);expect(journeyWorld(run).terrain({x:20,z:24}).speed).toBe(.55);
});
it('keeps diagonal movement normalized and conceals distant targets in vegetation',async()=>{
  const make=async()=>{const run=await createJourney({streamed:true});run.stream={seed:1,ordinal:'1',completedThrough:'0'};run.sectionData=generateSection(1,'1');run.section=run.sectionData.id;Object.assign(run.actors[0],{x:20,z:24});return run;};
  const a=await make(),b=await make();journeyDrive(a,{x:1,z:0});journeyDrive(b,{x:1,z:1});journeyStep(a);journeyStep(b);
  expect(Math.hypot(b.actors[0].x-20,b.actors[0].z-24)).toBeCloseTo(a.actors[0].x-20);
  for(const actor of a.actors.filter(actor=>actor.side===0))Object.assign(actor,{x:35,z:9});Object.assign(a.actors[3],{x:51,z:9});
  expect(journeyObservation(a).actors.some(actor=>actor.id===4)).toBe(false);
  expect(journeyWorld(a).terrain({x:31.999,z:24}).speed).toBe(.55);expect(journeyWorld(a).terrain({x:32,z:24}).speed).toBe(1);
});
it('applies actual mud and gravel movement while preserving connected routes and solid trunks',async()=>{
  const run=await createJourney({streamed:true});run.stream={seed:1,ordinal:'1',completedThrough:'0'};run.sectionData=generateSection(1,'1');run.section=run.sectionData.id;
  const world=journeyWorld(run);Object.assign(run.actors[0],{x:20,z:24});const before=run.actors[0].x;journeyDrive(run,{x:1,z:0});journeyStep(run,world);
  expect(run.actors[0].x-before).toBeCloseTo(run.pin.rules.speed/run.pin.rules.ticks*.55);expect(world.terrain({x:40,z:8}).visibility).toBe(.6);
  for(const ordinal of ['0','1','2']){const section=generateSection(1,ordinal),w=regionWorld(section);expect(w.segmentClear(section.spawn,section.checkpoint)).toBe(true);}
  const trunk=regionSolids('wet-woodland')[0];expect(world.walkable({x:trunk.x+.3,z:trunk.z+.3})).toBe(false);expect(world.shotDistance({x:trunk.x-1,y:1,z:trunk.z+.3},{x:1,y:0,z:0},3)).toBe(1);
  expect(regionWorld(generateSection(1,'2')).terrain({x:40,z:24}).speed).toBe(.8);
});
