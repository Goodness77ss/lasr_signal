import {describe,test,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {STARTER_SURVIVAL_RULES as R,SURVIVAL_PROTOCOL,RULES} from '@last-signal/sim';
import {createStationPractice} from '../packages/sim/src/survival.ts';
import {createFieldState,fieldSupport,takeFieldAmmo} from '../packages/sim/src/field-support.ts';
import {SurvivalPractice} from '../apps/server/src/survival.ts';
const fixture=()=>{const game=createStationPractice();game.countdown=0;game.tick=200;return {game,hero:game.squads[0],field:createFieldState(R)};};
describe('free starter and nontransferable field allowance',()=>{
  test('starter has ordinary rifle stats and twenty distinct field credits',()=>{
    const f=fixture();expect(f.hero.weapon).toBe('rifle');expect(f.hero.ammo).toBe(20);expect(f.hero.reserveAmmo).toBe(80);expect(f.field.credits).toBe(20);expect(f.game.hero!.tokens).toBe(0);
    expect(fieldSupport(f.game,f.field,R,'BASIC_AMMO','FIELD_CREDITS').ok).toBe(true);expect(f.hero.reserveAmmo).toBe(100);expect(f.field.credits).toBe(15);expect(f.game.hero!.tokens).toBe(0);
  });
  test('ammunition cooldown, capacity and exhaustion reject without effects or debit',()=>{
    const f=fixture();fieldSupport(f.game,f.field,R,'BASIC_AMMO','FIELD_CREDITS');
    expect(fieldSupport(f.game,f.field,R,'BASIC_AMMO','FIELD_CREDITS').ok).toBe(false);expect(f.field.credits).toBe(15);expect(f.hero.reserveAmmo).toBe(100);
    for(let i=0;i<3;i++){f.game.tick+=200;expect(fieldSupport(f.game,f.field,R,'BASIC_AMMO','FIELD_CREDITS').ok).toBe(true);}
    f.game.tick+=200;expect(fieldSupport(f.game,f.field,R,'BASIC_AMMO','FIELD_CREDITS').ok).toBe(false);expect(f.field.credits).toBe(0);
    const full=fixture();full.hero.reserveAmmo=170;expect(fieldSupport(full.game,full.field,R,'BASIC_AMMO','FIELD_CREDITS').ok).toBe(false);expect(full.field.credits).toBe(20);
  });
  test('medical support is bounded, once per run and never resurrects helpers',()=>{
    const f=fixture();f.hero.hp=15;f.hero.members=1;f.hero.lastHit=f.game.tick;
    expect(fieldSupport(f.game,f.field,R,'BASIC_MEDICAL','FIELD_CREDITS').ok).toBe(false);f.game.tick+=100;
    expect(fieldSupport(f.game,f.field,R,'BASIC_MEDICAL','FIELD_CREDITS').ok).toBe(true);expect(f.hero.hp).toBe(40);expect(f.hero.members).toBe(1);expect(f.field.credits).toBe(10);
    f.game.tick+=600;expect(fieldSupport(f.game,f.field,R,'BASIC_MEDICAL','FIELD_CREDITS').ok).toBe(false);expect(f.field.credits).toBe(10);
  });
  test('full health, terminal runs and other payment assets cannot consume credits',()=>{
    const f=fixture();expect(fieldSupport(f.game,f.field,R,'BASIC_MEDICAL','FIELD_CREDITS').ok).toBe(false);
    for(const item of ['MISSION_STAKE','MINT_NFT','PAY_LISTING','WITHDRAW'])expect(fieldSupport(f.game,f.field,R,item as any,'FIELD_CREDITS').ok).toBe(false);
    expect(fieldSupport(f.game,f.field,R,'BASIC_AMMO','RUN_TWIF').ok).toBe(false);f.game.result={winner:1,reason:'death'};
    expect(fieldSupport(f.game,f.field,R,'BASIC_AMMO','FIELD_CREDITS').ok).toBe(false);expect(f.field.credits).toBe(20);
  });
  test('authoritative drops supply bounded ammunition once without guns or tokens',()=>{
    const f=fixture();f.game.loot.push({id:100,x:f.hero.x,z:f.hero.z,weapon:'carbine',ammo:12,tokens:0});
    expect(takeFieldAmmo(f.game,f.field,R,100).ok).toBe(true);expect(f.hero.reserveAmmo).toBe(92);expect(f.hero.weapons).toEqual(['rifle']);expect(f.game.hero!.tokens).toBe(0);expect(f.field.credits).toBe(20);
    expect(takeFieldAmmo(f.game,f.field,R,100).ok).toBe(false);
    for(let i=1;i<20;i++){f.hero.reserveAmmo=0;f.game.loot.push({id:100+i,x:f.hero.x,z:f.hero.z,weapon:'rifle',ammo:12,tokens:0});expect(takeFieldAmmo(f.game,f.field,R,100+i).ok).toBe(true);}
    f.game.loot.push({id:200,x:f.hero.x,z:f.hero.z,weapon:'rifle',ammo:12,tokens:0});expect(takeFieldAmmo(f.game,f.field,R,200).ok).toBe(false);
  });
  test('drop range and walls are checked, inventory cannot exceed its cap',()=>{
    const f=fixture();f.game.loot.push({id:1,x:10,z:16,weapon:'rifle',ammo:12,tokens:0});expect(takeFieldAmmo(f.game,f.field,R,1).ok).toBe(false);
    f.hero.x=10.5;f.hero.z=8;f.game.loot[0].x=11.5;f.game.loot[0].z=8;expect(takeFieldAmmo(f.game,f.field,R,1).ok).toBe(false);
    f.game.loot[0].x=f.hero.x;f.hero.reserveAmmo=RULES.maxReserveAmmo-2;expect(takeFieldAmmo(f.game,f.field,R,1).ok).toBe(true);expect(f.hero.reserveAmmo).toBe(RULES.maxReserveAmmo);
  });
});
function client(service:SurvivalPractice){const messages:any[]=[],c=service.connect({send:raw=>messages.push(JSON.parse(raw)),close:()=>{}}),v={protocol:SURVIVAL_PROTOCOL,rulesHash:service.config().rulesHash},send=(m:object)=>c.receive(JSON.stringify({...v,...m}));send({op:'start'});return {messages,c,v,send,last:()=>messages.filter(m=>m.op==='snapshot').at(-1),session:messages.find(m=>m.op==='session')};}
describe('durable field authority',()=>{
  test('ordinary starter captures A without spending or a wallet',()=>{
    const db=new DatabaseSync(':memory:'),service=new SurvivalPractice(db,true),a=client(service);
    for(let i=0;i<60;i++)service.tick();a.send({op:'command',id:'route',action:{kind:'move',squadId:1,target:{x:23,z:7}}});for(let i=0;i<330;i++)service.tick();a.send({op:'pause',paused:true});
    expect(a.last().rewardLedger.totalWhole).toBe(5);expect(a.last().fieldAllowance.credits).toBe(20);expect(a.last().fieldAllowance.starter).toMatchObject({tradable:false,minted:false});a.c.close();service.close();db.close();
  });
  test('duplicate orders, changed replay and restart never duplicate effects',()=>{
    const db=new DatabaseSync(':memory:');let service=new SurvivalPractice(db,true);const a=client(service);for(let i=0;i<60;i++)service.tick();a.send({op:'pause',paused:true});
    const order={op:'field',id:'supply',asset:'FIELD_CREDITS',item:'BASIC_AMMO'};a.send(order);const ack=a.messages.find(m=>m.op==='ack');a.send(order);expect(a.messages.at(-1)).toEqual(ack);a.send({...order,item:'BASIC_MEDICAL'});expect(a.messages.at(-1).reason).toContain('replay');
    expect(a.last().fieldAllowance.credits).toBe(15);expect(a.last().observation.squads[0].reserveAmmo).toBe(100);a.c.close();service.close();
    service=new SurvivalPractice(db,true);const messages:any[]=[],c=service.connect({send:raw=>messages.push(JSON.parse(raw)),close:()=>{}});c.receive(JSON.stringify({...a.v,op:'resume',run:a.session.run,token:a.session.token}));c.receive(JSON.stringify({...a.v,...order}));expect(messages.at(-1)).toEqual(ack);c.close();service.close();db.close();
  });
  test('field credits cannot address stakes, collectibles, listings or wallet transfers',()=>{
    const db=new DatabaseSync(':memory:'),service=new SurvivalPractice(db,true),a=client(service);for(let i=0;i<60;i++)service.tick();
    for(const item of ['MISSION_STAKE','MINT_NFT','PAY_LISTING','WITHDRAW']){a.send({op:'field',id:item,asset:'FIELD_CREDITS',item});expect(a.messages.at(-1).reason).toContain('never stakes');}
    a.send({op:'field',id:'bad-asset',asset:'RUN_TWIF',item:'BASIC_AMMO'});expect(a.messages.at(-1).reason).toContain('never stakes');a.send({op:'pause',paused:true});expect(a.last().fieldAllowance.credits).toBe(20);expect(a.last().rewardLedger.totalWhole).toBe(0);a.c.close();service.close();db.close();
  });
});
