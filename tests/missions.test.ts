import {describe,test,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {MISSION_SURVIVAL_RULES as R,SURVIVAL_PROTOCOL} from '@last-signal/sim';
import {createStationPractice} from '../packages/sim/src/survival.ts';
import {createDirector,type Assault} from '../packages/sim/src/assault-director.ts';
import {createRunEconomy,availableRunWhole} from '../packages/sim/src/run-economy.ts';
import {createMissionState,tickMission,decideMission,type Mission} from '../packages/sim/src/missions.ts';
import {StationRewardStore} from '../apps/server/src/station-reward-store.ts';
import {MissionReservations} from '../apps/server/src/mission-reservations.ts';
import {SurvivalPractice} from '../apps/server/src/survival.ts';

function fixture(){
 const game=createStationPractice();game.countdown=0;game.tick=1800;game.squads[0].x=23;game.squads[0].z=7;game.relays[0].owner=0;
 const d=createDirector('fixture',R.director!),e=createRunEconomy(),state=createMissionState(R,0),updates:Mission[]=[];
 const a:Assault={id:'fixture:assault:1',station:'A',tier:1,state:'preparing',createdAt:1800,readyAt:1900,startedAt:null,endedAt:null,origins:[{x:40,z:5},{x:40,z:9}],members:[],engagedAt:null,participated:false,heldFrom:1800,eligible:true,reason:'fixture'};d.assaults.push(a);
 const hooks={reserve:(_m:Mission)=>true,update:(m:Mission)=>updates.push(structuredClone(m))};
 const tick=()=>tickMission(game,d,e,8,state,R,100,hooks),decide=(decision:'ACCEPT'|'DECLINE')=>decideMission(game,d,e,8,state,R,state.current!.id,decision,100,hooks);
 tick();return {game,d,e,state,a,hooks,updates,tick,decide};
}
describe('optional Hold the Signal mission',()=>{
 test('offer reserves bonus without locking stake or auto acceptance; decline is free',()=>{
  const f=fixture();expect(f.state.current!.status).toBe('OFFER');expect(f.e.lockedWhole).toBe(0);expect(f.decide('DECLINE').ok).toBe(true);expect(f.e.failedWhole).toBe(0);expect(availableRunWhole(f.e,8)).toBe(8);f.tick();expect(f.state.current!.status).toBe('DECLINED');
 });
 test('acceptance locks once and rejects changed or duplicate acceptance',()=>{
  const f=fixture();expect(f.decide('ACCEPT').ok).toBe(true);expect(f.e.lockedWhole).toBe(5);expect(availableRunWhole(f.e,8)).toBe(3);expect(f.decide('ACCEPT').ok).toBe(false);expect(f.e.lockedWhole).toBe(5);
 });
 test('success unlocks existing stake and adds only the reserved bonus',()=>{
  const f=fixture();f.decide('ACCEPT');f.a.state='defeated';f.a.startedAt=1850;f.a.engagedAt=1900;f.game.tick=1900;f.tick();f.game.tick=2499;f.tick();expect(f.state.current!.status).toBe('ACTIVE');f.game.tick=2500;f.tick();expect(f.state.current!.status).toBe('SUCCEEDED');expect(f.e.bonusWhole).toBe(3);expect(f.e.lockedWhole).toBe(0);expect(availableRunWhole(f.e,8)).toBe(11);f.tick();expect(f.e.bonusWhole).toBe(3);
 });
 test.each(['death','surrender','ownership','expiry'] as const)('ordinary %s consumes stake exactly once',reason=>{
  const f=fixture();f.decide('ACCEPT');f.a.startedAt=1850;
  if(reason==='death'){f.game.hero!.alive=false;f.game.result={winner:1,reason:'death'};}
  if(reason==='surrender')f.game.result={winner:1,reason:'Surrender'};
  if(reason==='ownership')f.game.relays[0].owner=1;
  if(reason==='expiry')f.game.tick=f.state.current!.until!;
  f.tick();f.tick();expect(f.state.current!.status).toBe('FAILED');expect(f.e.failedWhole).toBe(5);expect(f.e.lockedWhole).toBe(0);expect(availableRunWhole(f.e,8)).toBe(3);
 });
 test('completion on final tick wins over expiry, but death on that tick wins over completion',()=>{
  for(const death of [false,true]){const f=fixture();f.decide('ACCEPT');f.a.state='defeated';f.a.startedAt=1900;f.a.engagedAt=2400;f.game.tick=2400;f.tick();f.game.tick=3000;if(death)f.game.result={winner:1,reason:'death'};f.tick();expect(f.state.current!.status).toBe(death?'FAILED':'SUCCEEDED');}
 });
 test('service route abort and safety close unlock without consuming stake',()=>{
  for(const route of [true,false]){const f=fixture();f.decide('ACCEPT');if(route)f.a.eligible=false;tickMission(f.game,f.d,f.e,8,f.state,R,route?100:600,f.hooks);expect(f.state.current!.status).toBe('ABORTED');expect(f.e.failedWhole).toBe(0);expect(availableRunWhole(f.e,8)).toBe(8);}
 });
 test('unaccepted expiry is free and a future bonus cannot fund stake',()=>{
  const f=fixture();f.game.tick=f.state.current!.offerUntil;f.tick();expect(f.state.current!.status).toBe('EXPIRED');expect(f.e.failedWhole).toBe(0);
  const poor=fixture();expect(decideMission(poor.game,poor.d,poor.e,0,poor.state,R,poor.state.current!.id,'ACCEPT',100,poor.hooks).ok).toBe(false);expect(poor.e.lockedWhole).toBe(0);
 });
 test('too late, unsafe, unaffordable or unreserved offers are suppressed',()=>{
  for(const why of ['time','ownership','budget','reserve'] as const){const f=fixture();f.state.current=null;f.state.nextOffer=0;if(why==='time')f.game.tick=5900;if(why==='ownership')f.game.relays[0].owner=1;tickMission(f.game,f.d,f.e,why==='budget'?0:8,f.state,R,100,{...f.hooks,reserve:()=>why!=='reserve'});expect(f.state.current).toBe(null);}
 });
});
describe('mission reservation custody simulation',()=>{
 test('bonus suballocation, total cap and shared rolling capacity are reserved before offer',()=>{
  const db=new DatabaseSync(':memory:'),rewards=new StationRewardStore(db,()=>100000),store=new MissionReservations(db,rewards,()=>100000),scope=rewards.identity().scope;
  const f=fixture(),hooks=store.hooks('r',scope,R),m=f.state.current!;
  expect(hooks.reserve({...m,id:'one'})).toBe(true);expect(hooks.reserve({...m,id:'two'})).toBe(true);expect(hooks.reserve({...m,id:'three'})).toBe(false);expect(rewards.remaining(scope,R)).toBe(194);
  hooks.update({...m,id:'one',status:'DECLINED'});expect(rewards.remaining(scope,R)).toBe(197);expect(hooks.reserve({...m,id:'three'})).toBe(true);db.close();
 });
 test('earned and failed reservations reconcile exact accounting and cannot finalize twice',()=>{
  for(const success of [false,true]){
   const db=new DatabaseSync(':memory:'),rewards=new StationRewardStore(db,()=>100000),store=new MissionReservations(db,rewards,()=>100000),scope=rewards.identity().scope,f=fixture(),hooks=store.hooks('r',scope,R),m=f.state.current!;
   expect(hooks.reserve(m)).toBe(true);m.accepted=m.offered;m.status='ACTIVE';hooks.update(m);m.status=success?'SUCCEEDED':'FAILED';hooks.update(m);
   const e={...createRunEconomy(),bonusWhole:success?3:0,failedWhole:success?0:5};store.verify('r',scope,e,{...f.state,current:m});expect(rewards.remaining(scope,R)).toBe(success?197:200);expect(()=>hooks.update(m)).toThrow('unavailable');db.close();
  }
 });
 test('a missing pending reservation fails recovery and a full rolling budget suppresses offers',()=>{
  const db=new DatabaseSync(':memory:'),rewards=new StationRewardStore(db,()=>100000),store=new MissionReservations(db,rewards,()=>100000),scope=rewards.identity().scope,f=fixture();
  expect(()=>store.verify('r',scope,f.e,f.state)).toThrow('reservation');
  for(let i=0;i<40;i++)rewards.commit(scope,{run:'historical:'+i,cycle:1,station:'A',kind:'CAPTURE',amountWhole:5,tick:100,source:'historical test fixture'});
  expect(store.hooks('r',scope,R).reserve(f.state.current!)).toBe(false);expect(rewards.remaining(scope,R)).toBe(0);db.close();
 });
 test('real authoritative run reaches an offer; accepted stake and reservation survive restart',()=>{
  const db=new DatabaseSync(':memory:');let now=1000000,service=new SurvivalPractice(db,true,()=>now,R),messages:any[]=[],c=service.connect({send:raw=>messages.push(JSON.parse(raw)),close:()=>{}}),n=0;
  const versions={protocol:SURVIVAL_PROTOCOL,rulesHash:service.config().rulesHash};const send=(m:object)=>c.receive(JSON.stringify({...versions,...m}));send({op:'start'});const session=messages.find(m=>m.op==='session');
  for(let i=0;i<3500;i++){
   const snap=messages.filter(m=>m.op==='snapshot').at(-1),g=snap?.observation,hero=g?.squads.find((s:any)=>s.id===g.hero?.squadId);
   if(i===61)send({op:'command',id:'move',action:{kind:'move',squadId:1,target:{x:23,z:7}}});
   if(hero&&g.tick%5===0){const enemy=g.squads.filter((s:any)=>s.side===1).sort((a:any,b:any)=>a.hp-b.hp)[0];if(enemy&&hero.ammo>0){const dx=enemy.x-hero.x,dz=enemy.z-hero.z,length=Math.hypot(dx,dz);send({op:'command',id:'shot:'+n++,action:{kind:'fire',squadId:1,direction:{x:dx/length,y:0,z:dz/length}}});}if(hero.ammo===0&&hero.reserveAmmo>0&&!hero.reloadUntil)send({op:'command',id:'reload:'+n++,action:{kind:'reload',squadId:1}});}
   if(snap?.mission?.current?.status==='OFFER'){send({op:'pause',paused:true});send({op:'mission',id:'accept',asset:'RUN_TWIF',missionId:snap.mission.current.id,decision:'ACCEPT'});break;}
   now+=50;service.tick();
  }
  const last=messages.filter(m=>m.op==='snapshot').at(-1);expect(last.observation.hero.alive).toBe(true);expect(last.mission.current?.status,JSON.stringify({tick:last.observation.tick,pressure:last.pressure,funds:last.accounting.availableWhole,owner:last.observation.relays[0].owner,mission:last.mission,errors:messages.filter(m=>m.op==='error').slice(-2)})).toBe('ACTIVE');expect(last.accounting.lockedWhole).toBe(5);
  c.close();service.close();service=new SurvivalPractice(db,true,()=>now,R);messages=[];c=service.connect({send:raw=>messages.push(JSON.parse(raw)),close:()=>{}});send({op:'resume',run:session.run,token:session.token});expect(messages.at(-1).mission.current.status).toBe('ACTIVE');expect(messages.at(-1).accounting.lockedWhole).toBe(5);
  send({op:'pause',paused:false});
  for(let i=0;i<1400;i++){
   const snap=messages.filter(m=>m.op==='snapshot').at(-1),g=snap.observation,hero=g.squads.find((s:any)=>s.id===g.hero?.squadId);
   if(snap.mission.current.status!=='ACTIVE')break;
   if(hero&&g.tick%5===0){const enemy=g.squads.filter((s:any)=>s.side===1).sort((a:any,b:any)=>a.hp-b.hp)[0];if(enemy&&hero.ammo>0){const dx=enemy.x-hero.x,dz=enemy.z-hero.z,length=Math.hypot(dx,dz);send({op:'command',id:'finish:'+n++,action:{kind:'fire',squadId:1,direction:{x:dx/length,y:0,z:dz/length}}});}if(hero.ammo===0&&hero.reserveAmmo>0&&!hero.reloadUntil)send({op:'command',id:'reload:'+n++,action:{kind:'reload',squadId:1}});}
   now+=50;service.tick();
  }
  const completed=messages.filter(m=>m.op==='snapshot').at(-1);expect(completed.mission.current.status,completed.mission.current.reason).toBe('SUCCEEDED');expect(completed.accounting.bonusWhole).toBe(3);expect(completed.accounting.lockedWhole).toBe(0);expect(completed.accounting.failedWhole).toBe(0);
  c.close();service.close();db.close();
 },30000);
});
