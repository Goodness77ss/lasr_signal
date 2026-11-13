import { it,expect } from 'vitest';
import { JourneyCommandBoundary,journeyObservation } from '../apps/server/src/journey-boundary.ts';
import { createJourney } from '../packages/sim/src/journey/encounter.ts';
import { emptyAwareness } from '../packages/sim/src/journey/awareness.ts';
import { emptyTactics } from '../packages/sim/src/journey/tactics.ts';
import type { JourneyCommandMessage } from '../apps/server/src/journey-boundary.ts';

it('rejects wrong run, actor, retired section and stale sequence',()=>{
  const boundary=new JourneyCommandBoundary(),context={authenticatedRun:'one',runId:'one',section:'journey-sections-1:1:0',leaderId:1,lastSequence:2};
  const message:JourneyCommandMessage={op:'command',id:'move',sequence:3,section:context.section,actorId:1,action:{kind:'move',target:{x:30,z:24}}};
  expect(()=>boundary.validate(message,context)).not.toThrow();
  for(const patch of [{authenticatedRun:'two'},{leaderId:2},{section:'journey-sections-1:1:1'},{lastSequence:3}])expect(()=>boundary.validate(message,{...context,...patch})).toThrow();
});
it('bounds category traffic and releases disconnected connection buckets',()=>{
  let time=0;const boundary=new JourneyCommandBoundary(()=>time);
  for(let i=0;i<12;i++)expect(boundary.allow('connection-a','fire')).toBe(true);
  expect(boundary.allow('connection-a','fire')).toBe(false);time=1000;expect(boundary.allow('connection-a','fire')).toBe(true);
  boundary.release('connection-a');expect(boundary.allow('connection-a','fire')).toBe(true);
});
it('omits distant enemies and internal events from an actual run snapshot',async()=>{
  const run=await createJourney({streamed:true});const observation=journeyObservation(run);
  expect(observation.actors.every(a=>a.side===0)).toBe(true);expect(Object.hasOwn(observation,'events')).toBe(false);
  expect(Object.hasOwn(observation.sectionData!,'enemySpawns')).toBe(false);
  Object.assign(run.actors[3],{x:10,z:24});run.actors[3].awareness=emptyAwareness();run.actors[3].tactics=emptyTactics(4);const visible=journeyObservation(run).actors.find(a=>a.id===4);expect(visible).toBeDefined();expect(Object.hasOwn(visible!,'awareness')).toBe(false);expect(Object.hasOwn(visible!,'tactics')).toBe(false);expect(visible?.behaviour).toEqual({role:'defender',mode:'patrol'});
});
