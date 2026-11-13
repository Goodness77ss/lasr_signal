import { it,expect } from 'vitest';
import { generateSection } from '../packages/sim/src/journey/generator.ts';
import { createEncounter,stepEncounter,encounterRole,ENCOUNTER_RULES } from '../packages/sim/src/journey/checkpoints.ts';
import { createJourney,journeyStep,journeyFire,validateJourneyResume } from '../packages/sim/src/journey/encounter.ts';
import { createWorld } from '../packages/sim/src/journey/world.ts';
it('distinguishes ambush clearance, defended crossing and contested supply completion',()=>{
  const section=generateSection(1,'0'),leader={id:1,side:0 as const,hp:100,x:66,z:24},guard={id:4,side:1 as const,hp:100,x:40,z:24};
  const ambush=createEncounter({...section,template:'road-ambush'});stepEncounter(ambush,leader,[leader,guard]);expect(ambush.opened).toBe(false);stepEncounter(ambush,leader,[leader]);expect(ambush.opened).toBe(true);
  const crossing=createEncounter({...section,template:'crossing'});for(let i=0;i<100;i++)stepEncounter(crossing,leader,[leader]);expect(crossing.opened).toBe(false);
  leader.x=50;for(let i=0;i<ENCOUNTER_RULES.crossingTicks;i++)stepEncounter(crossing,leader,[leader]);expect(crossing.opened).toBe(true);
  const supply=createEncounter({...section,template:'supply-route'});leader.x=55;const contest={...guard,id:6,x:58};for(let i=0;i<100;i++)stepEncounter(supply,leader,[leader,contest]);expect(supply.progress).toBe(0);
  for(let i=0;i<ENCOUNTER_RULES.supplyTicks;i++)stepEncounter(supply,leader,[leader]);expect(supply.opened).toBe(true);
});
it('requires renewed hold after retreat and allows an irrelevant distant survivor',()=>{
  const state=createEncounter({...generateSection(5,'0'),template:'crossing'}),leader={id:1,side:0 as const,hp:100,x:50,z:24},distant={id:6,side:1 as const,hp:100,x:5,z:5};
  for(let i=0;i<20;i++)stepEncounter(state,leader,[leader,distant]);expect(state.progress).toBe(20);
  leader.x=66;for(let i=0;i<20;i++)stepEncounter(state,leader,[leader,distant]);expect(state.progress).toBe(0);expect(state.opened).toBe(false);
  leader.x=50;for(let i=0;i<40;i++)stepEncounter(state,leader,[leader,distant]);expect(state.opened).toBe(true);
});
it('changes bounded role composition without growing the guard population or health',async()=>{
  const early=[4,5,6].map(id=>encounterRole(0,id)),late=[4,5,6].map(id=>encounterRole(4,id));expect(early).not.toEqual(late);expect([4,5,6].map(id=>encounterRole(999,id))).toEqual(late);
  const run=await createJourney({streamed:true});expect(run.actors.filter(a=>a.side===1)).toHaveLength(3);expect(run.actors.every(a=>a.hp===100)).toBe(true);
});
it('rejects altered encounter recovery and gives death priority over a cleared exit',async()=>{
  const run=await createJourney({streamed:true,seed:13});
  const forged=structuredClone(run);forged.encounter!.source+=':forged';await expect(validateJourneyResume(forged)).rejects.toThrow('encounter');
  const invalidEvent=structuredClone(run);invalidEvent.eventSeq=1;invalidEvent.events=[{seq:1,kind:'checkpoint',from:{x:66,z:24},to:{x:66,z:24},side:0,height:1,section:run.section,source:'wrong'}];await expect(validateJourneyResume(invalidEvent)).rejects.toThrow('source');
  for(const actor of run.actors){actor.hp=0;actor.x=66;actor.z=24;}journeyStep(run);
  expect(run.state).toBe('DEAD');expect(run.practiceCredits).toBe(0);expect(run.events.some(e=>e.kind==='checkpoint')).toBe(false);
});
it('pins exact section sources, caps tiers and never completes a dead leader',()=>{
  const state=createEncounter({...generateSection(1,'18446744073709551615'),template:'supply-route'});expect(state.tier).toBe(4);expect(state.source).toContain('18446744073709551615:checkpoint');
  for(let i=0;i<100;i++)stepEncounter(state,{id:1,side:0,hp:0,x:55,z:24},[]);expect(state.opened).toBe(false);
});
it('awards nothing when the last guard and leader die within the same tick',async()=>{
  const run=await createJourney({streamed:true,seed:13}),world=createWorld(72,48,[]);
  // Authored lethal exchange fixture, using actual fire and damage commands.
  const [leader,helper,,guard]=run.actors;
  for(const actor of run.actors)if(actor.side===1)actor.hp=0;
  Object.assign(leader,{x:66,z:24,hp:7});Object.assign(helper,{x:62,z:24});Object.assign(guard,{x:64,z:24,hp:10,facing:Math.PI/2});
  expect(journeyFire(run,guard,{x:2,y:-.65,z:0},world)).toBe(true);
  expect(leader.hp).toBe(0);
  expect(journeyFire(run,helper,{x:2,y:-.65,z:0},world)).toBe(true);
  expect(guard.hp).toBe(0);journeyStep(run,world);
  expect(run.state).toBe('DEAD');expect(run.practiceCredits).toBe(0);expect(run.checkpointComplete).toBe(false);
  expect(run.events.filter(e=>e.kind==='checkpoint')).toHaveLength(0);
});
