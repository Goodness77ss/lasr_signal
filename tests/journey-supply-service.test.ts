import {test,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {JourneyService} from '../apps/server/src/journey-service.ts';
import {JOURNEY_SUPPLY_IDENTIFIERS,parseJourneyClient} from '../packages/protocol/src/journey.ts';
import {EQUIPMENT_BUILDS} from '../packages/sim/src/journey/equipment.ts';
import type {SupplyRedemption} from '../apps/server/src/journey-supplies.ts';
test('authenticated supply service throws once, replays exactly and resumes without restoring stock',async()=>{
 const db=new DatabaseSync(':memory:'),owner='0x'+'1'.repeat(40),collection='0x'+'2'.repeat(40);
 const event:SupplyRedemption={chainId:'31337',transactionHash:'0x'+'3'.repeat(64),logIndex:0,collection,owner,itemClass:1,packs:'1',blockHash:'0x'+'4'.repeat(64),confirmed:true};
 const service=new JourneyService(db,{equipmentVerifier:{owned:async(_asset,_owner,hash,nonce)=>({assetNonce:nonce,immutableBuild:{hash,build:{id:'marksman-rifle'}}})},supplyVerifier:{verify:async()=>event,canonical:async()=>true}});
 const sent:Record<string,any>[]=[],peer=service.connect({send:m=>sent.push(m as Record<string,any>),close:()=>{},identify:()=>owner});
 try{
  const start=parseJourneyClient(JSON.stringify({op:'start',...JOURNEY_SUPPLY_IDENTIFIERS,session:'a'.repeat(64),roster:[{id:'starter:1',revision:1,loadout:'signature'},null,null],equipment:[{actorId:1,asset:{kind:'gun',chainId:'31337',collection,tokenId:'1'},buildId:'marksman-rifle',buildHash:EQUIPMENT_BUILDS['marksman-rifle'],assetNonce:'0'}]}));
  await peer.receive(start);const identity=sent.find(m=>m.op==='session')!;
  await service.store.supplies!.recover(event.transactionHash,0);
  const before=service.store.load(identity.run,identity.credential),quantity=before.run.actors[0].grenades!.quantity;
  const message=parseJourneyClient(JSON.stringify({op:'command',id:'owned-grenade',sequence:1,section:before.run.section,actorId:1,action:{kind:'supply',itemClass:1,targetId:1,direction:{x:1,y:0,z:0}}}));
  await peer.receive(message);expect(sent.find(m=>m.op==='ack')?.ok).toBe(true);
  expect(service.store.supplies!.balance(owner,1)).toBe(2n);
  expect(service.store.load(identity.run,identity.credential).run.actors[0].grenades!.quantity).toBe(quantity);
  await peer.receive(message);expect(service.store.supplies!.balance(owner,1)).toBe(2n);
  expect(service.store.load(identity.run,identity.credential).run.projectiles).toHaveLength(1);
  peer.close();
  const resumed=service.connect({send:m=>sent.push(m as Record<string,any>),close:()=>{},identify:()=>owner});
  await resumed.receive(parseJourneyClient(JSON.stringify({op:'resume',...JOURNEY_SUPPLY_IDENTIFIERS,run:identity.run,credential:identity.credential,session:'a'.repeat(64)})));
  expect(sent.some(m=>m.op==='resumed'&&m.rules===JOURNEY_SUPPLY_IDENTIFIERS.rules)).toBe(true);
  expect(service.store.supplies!.balance(owner,1)).toBe(2n);resumed.close();
 }finally{service.close();db.close();}
});

