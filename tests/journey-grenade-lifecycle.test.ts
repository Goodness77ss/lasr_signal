import { it,expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createJourney,journeyThrow,journeyStep,validateJourneyResume,journeyBank,journeyContinue } from '../packages/sim/src/journey/encounter.ts';
import { journeyObservation } from '../apps/server/src/journey-boundary.ts';
import { createWorld } from '../packages/sim/src/journey/world.ts';
import { JourneyService } from '../apps/server/src/journey-service.ts';
import { JOURNEY_IDENTIFIERS } from '../packages/protocol/src/journey.ts';
import { launchGrenade } from '../packages/sim/src/journey/grenades.ts';
it('rejects corrupted recovered fuse, identity, capacity and inventory without changing the source',async()=>{
  const run=await createJourney({streamed:true});
  expect(journeyThrow(run,{x:1,y:.4,z:0})).toBe(true);
  const mutations=[
    (r:typeof run)=>{r.projectiles!.push(structuredClone(r.projectiles![0]));},
    (r:typeof run)=>{r.projectiles![0].owner=7;},
    (r:typeof run)=>{r.projectiles![0].side=1;},
    (r:typeof run)=>{r.projectiles![0].born=1;},
    (r:typeof run)=>{r.projectiles![0].explodeAt++;},
    (r:typeof run)=>{r.projectiles![0].travel=19;},
    (r:typeof run)=>{r.projectiles![0].resting=true;},
    (r:typeof run)=>{r.actors[0].grenades!.quantity=3;},
    (r:typeof run)=>{r.actors[0].grenades!.nextThrowAt=21;},
  ];
  for(const mutate of mutations){const corrupted=structuredClone(run);mutate(corrupted);await expect(validateJourneyResume(corrupted)).rejects.toThrow();}
  await expect(validateJourneyResume(run)).resolves.toBeUndefined();
  expect(run.actors[0].grenades?.quantity).toBe(1);expect(run.projectiles).toHaveLength(1);
});
it('keeps moving away from an observed grenade without learning the hidden thrower',async()=>{
  const run=await createJourney({streamed:true}),world=createWorld(72,48,[]);
  for(const actor of run.actors)if(actor.id!==1&&actor.id!==4)actor.hp=0;
  Object.assign(run.actors[0],{x:60,z:40});
  const guard=run.actors[3];Object.assign(guard,{x:20,z:24,facing:Math.PI/2});run.tick=3;
  run.projectileSeq=1;run.projectiles=[launchGrenade(1,1,0,{x:22,y:.1,z:24},{x:1,y:0,z:0},3,world)!];
  run.projectiles[0].resting=true;run.projectiles[0].velocity={x:0,y:0,z:0};
  journeyStep(run,world);expect(guard.tactics?.mode).toBe('retreat');
  const start=guard.x;
  for(let i=0;i<5;i++)journeyStep(run,world);
  expect(guard.x).toBeLessThan(start-.5);
  expect(guard.awareness?.state).toBe('patrol');expect(guard.awareness?.lastKnown).toBeNull();
});
it('retreats only after a grenade enters actual enemy sight',async()=>{
  const run=await createJourney({streamed:true}),world=createWorld(72,48,[]);
  for(const a of run.actors)if(a.id!==1&&a.id!==4)a.hp=0;
  const guard=run.actors[3];Object.assign(guard,{x:20,z:24,facing:Math.PI/2});run.tick=3;
  const before=structuredClone(run);journeyStep(before,world);expect(before.actors[3].tactics?.mode).not.toBe('retreat');
  run.projectileSeq=1;run.projectiles=[launchGrenade(1,1,0,{x:22,y:1,z:24},{x:1,y:0,z:0},3,world)!];
  const behind=structuredClone(run);behind.actors[3].facing=-Math.PI/2;journeyStep(behind,world);expect(behind.actors[3].tactics?.mode).not.toBe('retreat');
  journeyStep(run,world);expect(guard.tactics?.mode).toBe('retreat');expect(guard.tactics?.destination?.x).toBeLessThan(20);
});
it('resolves a simultaneous friendly and enemy blast death before awarding a checkpoint',async()=>{
  const run=await createJourney({streamed:true}),world=createWorld(72,48,[]);
  for(const a of run.actors){a.hp=0;a.x=66;a.z=24;}run.actors[0].hp=20;run.actors[3].hp=20;run.encounter!.opened=true;run.encounter!.progress=run.encounter!.template==='crossing'?40:run.encounter!.template==='supply-route'?30:0;
  expect(journeyThrow(run,{x:0,y:1,z:0},run.actors[0],world)).toBe(true);run.projectiles![0].explodeAt=1;run.projectiles![0].position={x:66,y:.2,z:24};run.projectiles![0].resting=true;
  journeyStep(run,world);expect(run.actors[0].hp).toBe(0);expect(run.actors[3].hp).toBe(0);expect(run.state).toBe('DEAD');expect(run.practiceCredits).toBe(0);expect(run.events.filter(e=>e.kind==='checkpoint')).toHaveLength(0);
});
it('does not retire a live fuse by banking or continuing and hides unseen projectiles',async()=>{
  const run=await createJourney({streamed:true});expect(journeyThrow(run,{x:1,y:.3,z:0})).toBe(true);
  run.state='CHECKPOINT_REACHED';run.checkpointComplete=true;expect(journeyBank(run)).toBe(false);expect(journeyContinue(run).ok).toBe(false);
  for(const actor of run.actors.filter(a=>a.side===0))actor.facing=-Math.PI/2;run.projectiles![0].position={x:50,y:1,z:24};
  expect(journeyObservation(run).projectiles).toHaveLength(0);
});
it('restores a service with a live fuse after disconnect without earning offline ticks',async()=>{
  const db=new DatabaseSync(':memory:'),messages:Record<string,unknown>[]=[],transport={send:(m:unknown)=>messages.push(m as Record<string,unknown>),close:()=>{}};let service=new JourneyService(db),client=service.connect(transport);
  try{
    await client.receive({op:'start',...JOURNEY_IDENTIFIERS});const session=messages.find(m=>m.op==='session')!,run=String(session.run),credential=String(session.credential),saved=service.store.load(run,credential);
    await client.receive({op:'command',id:'live',sequence:1,section:saved.run.section,actorId:1,action:{kind:'throw',direction:{x:0,y:1,z:0}}});for(let i=0;i<20;i++)service.tick();client.close();for(let i=0;i<100;i++)service.tick();expect(service.store.load(run,credential).run.tick).toBe(20);
    service=new JourneyService(db);client=service.connect(transport);await client.receive({op:'resume',...JOURNEY_IDENTIFIERS,run,credential});for(let i=0;i<40;i++)service.tick();const restored=service.store.load(run,credential).run;expect(restored.projectiles).toHaveLength(0);expect(restored.actors[0].grenades?.quantity).toBe(1);expect(restored.events.filter(e=>e.kind==='explosion')).toHaveLength(1);
  }finally{client.close();db.close();}
});
it('consumes one grenade, resumes a live fuse identically and explodes once',async()=>{
  const run=await createJourney({streamed:true}),world=createWorld(72,48,[]);for(const a of run.actors)if(a.id!==1)a.hp=0;
  expect(journeyThrow(run,{x:0,y:1,z:0},run.actors[0],world)).toBe(true);expect(run.actors[0].grenades?.quantity).toBe(1);expect(journeyThrow(run,{x:1,y:0,z:0})).toBe(false);
  for(let i=0;i<20;i++)journeyStep(run,world);const restored=structuredClone(run);await validateJourneyResume(restored);
  for(let i=0;i<41;i++){journeyStep(run,world);journeyStep(restored,world);}expect(restored).toEqual(run);expect(run.projectiles).toHaveLength(0);expect(run.events.filter(e=>e.kind==='explosion')).toHaveLength(1);expect(run.actors[0].hp).toBeLessThan(100);
  run.actors[0].grenades!.quantity=0;expect(journeyThrow(run,{x:1,y:0,z:0})).toBe(false);
});
it('replays a committed throw without spending twice and freezes its fuse while paused',async()=>{
  const db=new DatabaseSync(':memory:'),messages:Record<string,unknown>[]=[],service=new JourneyService(db),client=service.connect({send:m=>messages.push(m as Record<string,unknown>),close:()=>{}});
  try{
    await client.receive({op:'start',...JOURNEY_IDENTIFIERS});const session=messages.find(m=>m.op==='session')!,read=()=>service.store.load(String(session.run),String(session.credential));
    const base={op:'command' as const,section:read().run.section,actorId:1},shot={...base,id:'throw:1',sequence:1,action:{kind:'throw' as const,direction:{x:0,y:1,z:0}}};
    await client.receive(shot);await client.receive(shot);expect(read().run.actors[0].grenades?.quantity).toBe(1);expect(read().run.projectiles).toHaveLength(1);
    await expect(client.receive({...shot,action:{kind:'throw',direction:{x:1,y:0,z:0}}})).rejects.toThrow('different');
    await client.receive({...base,id:'pause',sequence:2,action:{kind:'pause'}});for(let i=0;i<70;i++)service.tick();expect(read().run.tick).toBe(0);expect(read().run.projectiles![0].explodeAt).toBe(60);
    await client.receive({...base,id:'resume',sequence:3,action:{kind:'resume'}});for(let i=0;i<60;i++)service.tick();expect(read().run.projectiles).toHaveLength(0);expect(read().run.events.filter(e=>e.kind==='explosion')).toHaveLength(1);
  }finally{client.close();db.close();}
});
