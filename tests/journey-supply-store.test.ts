import {it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {JourneyStore} from '../apps/server/src/journey-store.ts';
import {createJourney} from '../packages/sim/src/journey/encounter.ts';
import {supplyEffect,type SupplyUse} from '../packages/sim/src/journey/supplies.ts';
import {EQUIPMENT_BUILDS} from '../packages/sim/src/journey/equipment.ts';
import type {SupplyRedemption} from '../apps/server/src/journey-supplies.ts';
import type {JourneyCommandMessage} from '../apps/server/src/journey-boundary.ts';
it('run commit rolls back debit and heal on failed acknowledgement persistence',async()=>{
 const db=new DatabaseSync(':memory:'),owner='0x'+'1'.repeat(40),collection='0x'+'2'.repeat(40);
 const event:SupplyRedemption={chainId:'31337',transactionHash:'0x'+'3'.repeat(64),logIndex:0,collection,owner,itemClass:0,packs:'1',blockHash:'0x'+'4'.repeat(64),confirmed:true};
 // Trusted receipt and ownership fixtures. Real chain ingestion is covered separately.
 const store=new JourneyStore(db,undefined,{owned:async(_asset,_owner,hash,nonce)=>({assetNonce:nonce,immutableBuild:{hash,build:{id:'marksman-rifle'}}})},{verify:async()=>event});
 try{
  const run=await createJourney({supplies:true,streamed:true,roster:[{id:'starter:1',revision:1,loadout:'signature'},null,null],equipment:{owner,entries:[{actorId:1,asset:{kind:'gun',chainId:'31337',collection,tokenId:'1'},buildId:'marksman-rifle',buildHash:EQUIPMENT_BUILDS['marksman-rifle'],assetNonce:'0'}]}});
  run.actors[0].hp=40;
  store.create('run','credential',run,undefined,await store.equipment.prepare(run.equipment!));
  await store.supplies!.recover(event.transactionHash,0);
  const use:SupplyUse={itemClass:0,actorId:1},after=supplyEffect(run,use)!;
  const message:JourneyCommandMessage={op:'command',id:'use-one',sequence:1,section:run.section,actorId:1,action:{kind:'supply',itemClass:0,targetId:1}};
  const ack={op:'ack' as const,id:message.id,ok:true,reason:'Accepted',sequence:1,order:1,tick:0};
  db.exec("CREATE TRIGGER fail_supply_ack BEFORE INSERT ON journey_commands BEGIN SELECT RAISE(ABORT,'injected write failure'); END;");
  expect(()=>store.commit('run',0,message,after,ack,false,use)).toThrow('injected write failure');
  expect(store.load('run','credential').run.actors[0].hp).toBe(40);
  expect(store.supplies!.balance(owner,0)).toBe(3n);
  expect(db.prepare('SELECT count(*) AS n FROM journey_supply_uses').get()!.n).toBe(0);
  db.exec('DROP TRIGGER fail_supply_ack');
  store.commit('run',0,message,after,ack,false,use);
  expect(store.load('run','credential').run.actors[0].hp).toBe(75);
  expect(store.supplies!.balance(owner,0)).toBe(2n);
  expect(store.replay('run',message)).toEqual(ack);
  expect(store.supplies!.balance(owner,0)).toBe(2n);
  const tampered=structuredClone(after);tampered.actors[0].hp=99;
  expect(()=>store.commit('run',1,{...message,id:'two',sequence:2},tampered,{...ack,id:'two',sequence:2},false,use)).toThrow('effect mismatch');
  expect(store.supplies!.balance(owner,0)).toBe(2n);
 }finally{db.close();}
});



