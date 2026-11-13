import { expect,it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createJourney,journeyDrive,journeyStep,journeyFire,journeyReload,journeyAbility,journeyPose,journeyContinue,journeyCheckpoint,validateJourneyResume,actorHealth,actorVision } from '../packages/sim/src/journey/encounter.ts';
import { SOLDIER_CLASS_IDS,soldierClass,CLASS_RULES } from '../packages/sim/src/journey/classes.ts';
import { journeyWeapon } from '../packages/sim/src/journey/weapons.ts';
import { createWorld } from '../packages/sim/src/journey/world.ts';
import { JourneyService } from '../apps/server/src/journey-service.ts';
import { JOURNEY_IDENTIFIERS,parseJourneyClient } from '../packages/protocol/src/journey.ts';
import { journeyObservation } from '../apps/server/src/journey-boundary.ts';
import { JOURNEY_STREAM_RULES,pinJourneyRules } from '../packages/sim/src/journey/rules.ts';
const world=createWorld(72,48,[]);

it('creates seven supported local builds with their actual health, movement and ammunition limits',async()=>{
  for(const id of SOLDIER_CLASS_IDS){
    const run=await createJourney({streamed:true,classes:[id,null,null]}),actor=run.actors[0],p=soldierClass(id),weapon=journeyWeapon(p.weapon);
    expect(actor.hp).toBe(p.health);expect(actor.ammo).toBe(weapon.magazine);expect(actor.grenades?.quantity).toBe(p.grenades);
    expect(actor.build).toMatchObject({classId:id,weapon:p.weapon,armour:p.armour,entitlement:'local-development'});
    await expect(validateJourneyResume(structuredClone(run))).resolves.toBeUndefined();
    for(const other of run.actors)if(other.id!==1)other.hp=0;
    const x=actor.x;journeyDrive(run,{x:1,z:0});journeyStep(run,world);expect(actor.x-x).toBeCloseTo(p.speed/20);
    actor.ammo=0;expect(journeyReload(run)).toBe(true);const until=actor.reloadAt;
    expect(until-run.tick).toBe(Math.ceil(weapon.reloadTicks*p.reloadPercent/100));
    for(let tick=run.tick;tick<until;tick++)journeyStep(run,world);
    expect(actor.ammo).toBe(weapon.magazine);expect(actor.reserve).toBe(weapon.reserve-weapon.magazine);
    await expect(validateJourneyResume(structuredClone(run))).resolves.toBeUndefined();
  }
});

it('uses real weapon cadence, range and per trigger ammunition for every class',async()=>{
  for(const id of SOLDIER_CLASS_IDS){
    const run=await createJourney({streamed:true,classes:[id,null,null]}),actor=run.actors[0],p=soldierClass(id),weapon=journeyWeapon(p.weapon),target=run.actors[3];
    Object.assign(actor,{x:5,z:24});Object.assign(target,{x:7,z:24});
    const ammo=actor.ammo;expect(journeyFire(run,actor,{x:1,y:0,z:0},world)).toBe(true);
    expect(actor.ammo).toBe(ammo-1);expect(target.hp).toBeLessThan(100);expect(100-target.hp).toBeLessThanOrEqual(weapon.damage);
    expect(journeyFire(run,actor,{x:1,y:0,z:0},world)).toBe(false);
    run.tick=weapon.interval;expect(journeyFire(run,actor,{x:1,y:0,z:0},world)).toBe(true);expect(actor.ammo).toBe(ammo-2);
  }
});

it('applies armour and a bounded brace instead of cosmetic protection',async()=>{
  const run=await createJourney({streamed:true,classes:['rook',null,null]}),rook=run.actors[0],guard=run.actors[3];Object.assign(rook,{x:10,z:24});Object.assign(guard,{x:5,z:24,facing:Math.PI/2});
  expect(journeyFire(run,guard,{x:1,y:0,z:0},world)).toBe(true);expect(rook.hp).toBe(115);
  expect(journeyAbility(run)).toBe(true);run.tick=32;expect(journeyFire(run,guard,{x:1,y:0,z:0},world)).toBe(true);expect(rook.hp).toBe(111);
  expect(journeyAbility(run)).toBe(false);expect(rook.classState?.readyAt).toBe(200);expect(actorHealth(run,rook)).toBe(120);
});

it('uses finite treatment with no charge for a blocked, full, dead or enemy target',async()=>{
  const run=await createJourney({streamed:true,classes:['imani',null,null]}),medic=run.actors[0],friend=run.actors[1];Object.assign(medic,{x:5,z:24});Object.assign(friend,{x:7,z:24,hp:60});
  const wall=createWorld(72,48,[{x:6,z:22,w:.1,d:4,h:4}]);expect(journeyAbility(run,2,medic,wall)).toBe(false);expect(medic.classState?.medicalCharges).toBe(2);
  expect(journeyAbility(run,2,medic,world)).toBe(true);expect(friend.hp).toBe(85);expect(medic.classState?.medicalCharges).toBe(1);
  expect(journeyAbility(run,2,medic,world)).toBe(false);run.tick=60;expect(journeyAbility(run,2,medic,world)).toBe(true);expect(friend.hp).toBe(100);expect(medic.classState?.medicalCharges).toBe(0);
  run.tick=120;expect(journeyAbility(run,2,medic,world)).toBe(false);friend.hp=0;expect(journeyAbility(run,2,medic,world)).toBe(false);expect(journeyAbility(run,4,medic,world)).toBe(false);
});

it('makes scout observation and marksman focus real, and keeps supply refill finite',async()=>{
  const scout=await createJourney({streamed:true,classes:['kestrel',null,null]});for(const a of scout.actors)if(a.id!==1&&a.id!==4)a.hp=0;Object.assign(scout.actors[3],{x:37,z:24});
  expect(journeyObservation(scout).actors.some(a=>a.id===4)).toBe(false);expect(journeyAbility(scout)).toBe(true);expect(actorVision(scout,scout.actors[0])).toBe(32);expect(journeyObservation(scout).actors.some(a=>a.id===4)).toBe(true);
  const marksman=await createJourney({streamed:true,classes:['vale',null,null]});expect(journeyAbility(marksman)).toBe(false);expect(journeyPose(marksman,'crouched')).toBe(true);expect(journeyAbility(marksman)).toBe(true);expect(actorVision(marksman,marksman.actors[0])).toBe(40);
  const ranger=await createJourney({streamed:true,classes:['beck',null,null]}),beck=ranger.actors[0],reserve=beck.reserve;
  expect(journeyAbility(ranger)).toBe(true);expect(beck.reserve).toBe(reserve+CLASS_RULES.ammoRefill);expect(beck.classState?.ammoCharges).toBe(0);ranger.tick=40;expect(journeyAbility(ranger)).toBe(false);
});

it('lets a medic helper prioritize a living wounded teammate without a client healing amount',async()=>{
  const run=await createJourney({streamed:true,classes:[null,'imani',null]});run.actors[0].hp=40;for(const enemy of run.actors.filter(a=>a.side===1))enemy.hp=0;
  journeyStep(run,world);journeyStep(run,world);expect(run.actors[0].hp).toBe(65);expect(run.actors[1].classState?.medicalCharges).toBe(1);
});

it('commits one treatment across command replay and durable service recreation',async()=>{
  const db=new DatabaseSync(':memory:'),run=await createJourney({streamed:true,classes:['imani',null,null]});run.actors[0].hp=40;
  let service=new JourneyService(db);const id='a'.repeat(32),credential='b'.repeat(64);service.store.create(id,credential,run);
  const messages:Record<string,unknown>[]=[],transport={send:(message:unknown)=>messages.push(message as Record<string,unknown>),close:()=>{}};let client=service.connect(transport);
  try{
    await client.receive({op:'resume',...JOURNEY_IDENTIFIERS,run:id,credential});const command={op:'command' as const,id:'treatment',sequence:1,actorId:1,section:run.section,action:{kind:'ability' as const,targetId:1}};
    await client.receive(command);await client.receive(command);expect(service.store.load(id,credential).run.actors[0].hp).toBe(65);
    await expect(client.receive({...command,action:{kind:'ability',targetId:2}})).rejects.toThrow('different');
    client.close();service=new JourneyService(db);client=service.connect(transport);await client.receive({op:'resume',...JOURNEY_IDENTIFIERS,run:id,credential});await client.receive(command);
    const saved=service.store.load(id,credential).run;expect(saved.actors[0].hp).toBe(65);expect(saved.actors[0].classState?.medicalCharges).toBe(1);expect(saved.events.filter(e=>e.kind==='ability')).toHaveLength(1);
  }finally{client.close();db.close();}
});

it('rejects edited class builds, inventory, capacity and client submitted ability effects',async()=>{
  const run=await createJourney({streamed:true,classes:['rook',null,null]});
  for(const mutate of [(r:typeof run)=>{r.actors[0].build!.weapon='marksman-rifle';},(r:typeof run)=>{r.actors[0].classState!.medicalCharges=3;},(r:typeof run)=>{r.actors[0].hp=121;},(r:typeof run)=>{r.actors[0].classState!.until=10;}]){const edited=structuredClone(run);mutate(edited);await expect(validateJourneyResume(edited)).rejects.toThrow();}
  const command={op:'command',id:'ability',sequence:1,actorId:1,section:run.section};
  expect(parseJourneyClient(JSON.stringify({...command,action:{kind:'ability',targetId:2}}))).toMatchObject({action:{kind:'ability',targetId:2}});
  for(const action of [{kind:'ability',amount:100},{kind:'ability',targetId:4},{kind:'ability',medicalCharges:999}])expect(()=>parseJourneyClient(JSON.stringify({...command,action}))).toThrow();
});
it('carries class injury, ammunition and consumed charges through a section without refilling them',async()=>{
  const run=await createJourney({streamed:true,classes:['beck','imani','flint']}),beck=run.actors[0],medic=run.actors[1],flint=run.actors[2];
  expect(journeyAbility(run,1)).toBe(true);beck.hp=75;beck.ammo=3;medic.classState!.medicalCharges=1;flint.grenades!.quantity=1;
  for(const actor of run.actors.filter(a=>a.side===0))Object.assign(actor,journeyCheckpoint(run));
  for(const enemy of run.actors.filter(a=>a.side===1))enemy.hp=0;
  run.encounter!.opened=true;run.encounter!.progress=run.encounter!.template==='crossing'?40:run.encounter!.template==='supply-route'?30:0;
  run.state='CHECKPOINT_REACHED';run.checkpointComplete=true;run.practiceCredits=10;
  expect(journeyContinue(run).ok).toBe(true);expect(beck.hp).toBe(75);expect(beck.ammo).toBe(3);expect(beck.reserve).toBe(60);expect(beck.classState?.ammoCharges).toBe(0);expect(medic.classState?.medicalCharges).toBe(1);expect(flint.grenades?.quantity).toBe(1);
  await expect(validateJourneyResume(run)).resolves.toBeUndefined();
  const legacy=structuredClone(run);legacy.pin=await pinJourneyRules(JOURNEY_STREAM_RULES);await expect(validateJourneyResume(legacy)).rejects.toThrow('class deployment');
});
