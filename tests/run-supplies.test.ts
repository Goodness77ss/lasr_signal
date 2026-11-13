import {describe,test,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {SUPPLY_SURVIVAL_RULES as R,SURVIVAL_PROTOCOL} from '@last-signal/sim';
import {createStationPractice} from '../packages/sim/src/survival.ts';
import {createRunEconomy,availableRunWhole,runSupply} from '../packages/sim/src/run-economy.ts';
import {SurvivalPractice} from '../apps/server/src/survival.ts';
function fixture(){const game=createStationPractice();game.countdown=0;game.tick=400;return {game,hero:game.squads[0],e:createRunEconomy()};}
describe('exact simulated run supply accounting',()=>{
 test('available balance includes only its own ledger and never double counts returned stake',()=>{
  const e={...createRunEconomy(),depositWhole:40,bonusWhole:6,spentWhole:15,failedWhole:5};expect(availableRunWhole(e,24)).toBe(50);e.lockedWhole=5;expect(availableRunWhole(e,24)).toBe(45);e.lockedWhole=0;expect(availableRunWhole(e,24)).toBe(50);
  expect(()=>availableRunWhole({...e,spentWhole:100},24)).toThrow('Negative');
 });
 test('accepted ammo applies forty rounds and charges exactly once per application',()=>{
  const f=fixture(),result=runSupply(f.game,f.e,5,R,'AMMO','RUN_TWIF');expect(result).toMatchObject({ok:true,quotedWhole:5,chargedWhole:5});expect(f.hero.reserveAmmo).toBe(120);expect(f.e.spentWhole).toBe(5);expect(availableRunWhole(f.e,5)).toBe(0);
 });
 test('capacity and insufficient funds reject without debit or effects',()=>{
  const f=fixture();f.hero.reserveAmmo=170;expect(runSupply(f.game,f.e,5,R,'AMMO','RUN_TWIF').chargedWhole).toBe(0);expect(f.e.spentWhole).toBe(0);expect(f.hero.reserveAmmo).toBe(170);
  f.hero.reserveAmmo=80;f.e.lockedWhole=5;expect(runSupply(f.game,f.e,5,R,'AMMO','RUN_TWIF').ok).toBe(false);expect(f.hero.reserveAmmo).toBe(80);
  expect(runSupply(f.game,f.e,5,R,'AMMO','FIELD_CREDITS').ok).toBe(false);
 });
 test('shield and helper effects respect existing limits and safe intervals',()=>{
  const f=fixture();expect(runSupply(f.game,f.e,20,R,'SHIELD','RUN_TWIF').ok).toBe(true);expect(f.hero.shield).toBe(30);expect(runSupply(f.game,f.e,20,R,'SHIELD','RUN_TWIF').chargedWhole).toBe(0);
  f.hero.members=1;f.hero.hp=20;f.hero.lastHit=f.game.tick;expect(runSupply(f.game,f.e,20,R,'RECRUIT','RUN_TWIF').chargedWhole).toBe(0);f.game.tick+=100;
  expect(runSupply(f.game,f.e,20,R,'RECRUIT','RUN_TWIF').ok).toBe(true);expect(f.hero.members).toBe(2);expect(f.hero.hp).toBe(100);expect(f.e.spentWhole).toBe(15);
 });
});
function client(service:SurvivalPractice){const messages:any[]=[],c=service.connect({send:raw=>messages.push(JSON.parse(raw)),close:()=>{}}),v={protocol:SURVIVAL_PROTOCOL,rulesHash:service.config().rulesHash},send=(m:object)=>c.receive(JSON.stringify({...v,...m}));send({op:'start'});return {messages,c,v,send,last:()=>messages.filter(m=>m.op==='snapshot').at(-1),session:messages.find(m=>m.op==='session')};}
function capture(service:SurvivalPractice,a:ReturnType<typeof client>){for(let i=0;i<60;i++)service.tick();a.send({op:'command',id:'route',action:{kind:'move',squadId:1,target:{x:23,z:7}}});for(let i=0;i<330;i++)service.tick();a.send({op:'pause',paused:true});}
describe('authoritative run supply orders',()=>{
 test('accepted and rejected orders persist once, remain separate from field credits and recover',()=>{
  const db=new DatabaseSync(':memory:');let service=new SurvivalPractice(db,true);const a=client(service);capture(service,a);expect(a.last().accounting.availableWhole).toBe(5);
  const order={op:'supply',id:'ammo',asset:'RUN_TWIF',item:'AMMO'};a.send(order);const ack=a.messages.filter(m=>m.op==='ack').at(-1);a.send(order);expect(a.messages.at(-1)).toEqual(ack);
  a.send({...order,id:'unaffordable'});expect(a.last().accounting.orders[0]).toMatchObject({charged:0,applied:0});expect(a.last().accounting.spentWhole).toBe(5);expect(a.last().fieldAllowance.credits).toBe(20);expect(a.last().observation.squads[0].reserveAmmo).toBe(120);expect(a.last().accounting.walletClaimableWhole).toBe(null);
  a.c.close();service.close();service=new SurvivalPractice(db,true);const messages:any[]=[],c=service.connect({send:raw=>messages.push(JSON.parse(raw)),close:()=>{}});
  c.receive(JSON.stringify({...a.v,op:'resume',run:a.session.run,token:a.session.token}));expect(messages.at(-1).accounting.orders).toHaveLength(2);expect(messages.at(-1).accounting.spentWhole).toBe(5);c.receive(JSON.stringify({...a.v,...order}));expect(messages.at(-1)).toEqual(ack);c.close();service.close();db.close();
 });
 test('legacy receipt, spoofed price and cross asset paths cannot charge or apply',()=>{
  const db=new DatabaseSync(':memory:'),service=new SurvivalPractice(db,true),a=client(service);capture(service,a);
  a.send({op:'supply',id:'receipt',asset:'RUN_TWIF',item:'AMMO',receipt:'fake'});expect(a.messages.at(-1).reason).toContain('Unexpected');
  a.send({op:'supply',id:'price',asset:'RUN_TWIF',item:'AMMO',price:0});expect(a.messages.at(-1).reason).toContain('Unexpected');
  a.send({op:'supply',id:'asset',asset:'FIELD_CREDITS',item:'AMMO'});expect(a.messages.at(-1).reason).toContain('RUN_TWIF');a.send({op:'pause',paused:true});expect(a.last().accounting.spentWhole).toBe(0);expect(a.last().observation.squads[0].reserveAmmo).toBe(80);a.c.close();service.close();db.close();
 });
 test('checkpoint failure rolls back both applied order and debit before retry',()=>{
  const db=new DatabaseSync(':memory:'),service=new SurvivalPractice(db,true),a=client(service);capture(service,a);
  db.exec(`CREATE TRIGGER fail_spend BEFORE INSERT ON survival_practice_runs WHEN NEW.state LIKE '%"spentWhole":5%' BEGIN SELECT RAISE(ABORT,'fixture'); END;`);
  const order={op:'supply',id:'safe-retry',asset:'RUN_TWIF',item:'AMMO'};a.send(order);expect(db.prepare('SELECT COUNT(*) AS n FROM survival_supply_orders').get()!.n).toBe(0);
  db.exec('DROP TRIGGER fail_spend');a.send(order);expect(a.last().accounting.spentWhole).toBe(5);expect(a.last().observation.squads[0].reserveAmmo).toBe(120);expect(a.last().accounting.orders).toHaveLength(1);a.c.close();service.close();db.close();
 });
});
