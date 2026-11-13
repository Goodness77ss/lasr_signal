import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {keccak256} from 'ethers';
import {compile} from '../scripts/compile.ts';
import {startEvm} from '../scripts/evm.ts';
import {deploy,as,receipt} from '../scripts/shared.ts';
import {workerFixture} from './survival-worker.fixture.ts';
import {weaponRecoveryPolicyHash,weaponBuildHash} from '@last-signal/chain';
import {WeaponCollections,type WeaponCollectionDeployment} from '../../../apps/server/src/weapon-collections.ts';
import {WeaponRecovery} from '../../../apps/server/src/weapon-recovery.ts';
import {writeFileSync} from 'node:fs';

let evm:Awaited<ReturnType<typeof startEvm>>,artifacts:ReturnType<typeof compile>;
before(async()=>{artifacts=compile();evm=await startEvm(18574);});
after(async()=>{evm?.provider.destroy();await evm?.stop();});
async function setup(){
 const f=await workerFixture(evm.provider,artifacts),collection=await deploy(artifacts.SurvivalGunCollection,f.deployer,[f.token.target,f.authority.address,weaponRecoveryPolicyHash]);
 const descriptor:WeaponCollectionDeployment={collection:String(collection.target),version:'SURVIVAL_V2',chainId:31337,currency:String(f.token.target),gameplaySigner:f.authority.address,rulesHash:weaponRecoveryPolicyHash,codeHash:keccak256(await evm.provider.getCode(collection.target))};
 const registry=new WeaponCollections(evm.provider,[descriptor]),recovery=new WeaponRecovery(f.db,registry,f.authority,f.service),entry=await f.open(0);
 f.service.attach(entry.runId,f.a.address,{send:()=>{},close:()=>{}});f.service.pause(entry.runId,f.a.address,false);
 // Authored local extraction setup, not natural combat evidence. All pickup, channel and settlement actions below use the real authority.
 const r=(f.service as unknown as {runs:Map<string,any>}).runs.get(entry.runId)!;r.game.countdown=0;r.game.squads=r.game.squads.filter((s:{side:number})=>s.side===0);const hero=r.game.squads.find((s:{id:number})=>s.id===r.game.hero.squadId);hero.x=8;hero.z=16;hero.route=[];hero.driveUntil=0;
 r.game.loot=[{id:777,x:8,z:16,weapon:'rifle',ammo:12,tokens:0},{id:778,x:8,z:16,weapon:'carbine',ammo:12,tokens:0}];
 assert.equal(f.service.action(entry.runId,f.a.address,'collect-rifle',{kind:'fieldLoot',lootId:777}).ok,true);assert.equal(f.service.action(entry.runId,f.a.address,'collect-carbine',{kind:'fieldLoot',lootId:778}).ok,true);
 const extract=async()=>{assert.equal(f.service.action(entry.runId,f.a.address,'start-extraction',{kind:'extraction',decision:'START'}).ok,true);for(let i=0;i<160;i++){f.setWall(f.now()+50);if(i%20===0)await f.service.poll();f.service.tick();}assert.equal(f.service.status(entry.runId,f.a.address).lifecycle.terminal?.outcome,'EXTRACTED');};
 const settle=async()=>{for(let i=0;i<5&&f.service.status(entry.runId,f.a.address).phase!=='ended';i++){await f.service.poll();await evm.provider.send('evm_mine',[]);}await f.service.poll();assert.equal(f.service.status(entry.runId,f.a.address).settlement?.state,'settled');};
 return {...f,collection,descriptor,registry,recovery,entry,extract,settle};
}
test('only a canonically confirmed extraction authorizes exact collected classes in the second collection',async()=>{
 const f=await setup();try{
  await assert.rejects(f.recovery.claims(f.entry.runId,f.a.address),/confirmed extracted/);await f.extract();await assert.rejects(f.recovery.claims(f.entry.runId,f.a.address),/confirmed extracted/);await f.settle();
  await assert.rejects(f.recovery.claims(f.entry.runId,f.b.address));const first=await f.recovery.claims(f.entry.runId,f.a.address),again=await f.recovery.claims(f.entry.runId,f.a.address);assert.deepEqual(first.rewards,again.rewards);assert.equal(first.rewards.length,2);assert.equal(first.rewards[0].claim.kind,0);assert.equal(first.rewards[1].claim.kind,1);assert.equal(first.rewards[0].claim.buildHash,weaponBuildHash(0));assert.equal(first.rewards[0].claim.rulesHash,weaponRecoveryPolicyHash);assert.equal(first.collection,String(f.collection.target));
  await receipt(as(f.collection,f.a).claimLoot(first.rewards.map(r=>r.claim),first.rewards.map(r=>r.signature)),'claim actual confirmed local extracted classes');assert.equal(await f.collection.gunKind(1),0n);assert.equal(await f.collection.gunKind(2),1n);assert.equal(await f.collection.ownerOf(1),f.a.address);assert.equal((await f.recovery.claims(f.entry.runId,f.a.address)).rewards.length,0);
  const asset={collection:String(f.collection.target),tokenId:'1'},history=await f.recovery.history(asset);assert.equal(history.entries.length,1);assert.equal(history.entries[0].run,f.entry.runId);assert.deepEqual(await f.recovery.history(asset),history);assert.equal(history.upgrades,'DEFERRED');
  const uri=await f.collection.tokenURI(1);const transfer=await receipt(as(f.collection,f.a).transferFrom(f.a.address,f.b.address,1),'transfer recorded collectible');await evm.provider.send('evm_mine',[]);const transferred=await f.recovery.history(asset);assert.equal(transferred.owner,f.b.address);assert.equal(transferred.entries.length,1);assert.equal(await f.collection.tokenURI(1),uri);await assert.rejects(f.registry.owned(asset,f.a.address));
  if(process.env.LAST_SIGNAL_WRITE_HISTORY_EVIDENCE==='true')writeFileSync('docs/evidence/v2-step18-history.json',JSON.stringify({checkedAt:new Date().toISOString(),mode:'DISPOSABLE_LOCAL_CHAIN_AUTHORED_EXTRACTION',initial:history,afterTransfer:transferred,repeatedReadDuplicates:false,metadataUnchanged:true,previousOwnerRejected:true,transfer},null,2)+'\n');
  f.db.prepare('UPDATE weapon_recovery_claims SET proofHash=? WHERE source=?').run('corrupt',first.rewards[0].claim.dropId);await assert.rejects(f.recovery.history(asset),/extraction mismatch/);
 }finally{f.service.close();f.db.close();}
});
test('departure with unextracted loot never creates an NFT recovery authorization',async()=>{
 const f=await setup();try{f.service.action(f.entry.runId,f.a.address,'surrender',{kind:'command',action:{kind:'surrender'}});await f.settle();await assert.rejects(f.recovery.claims(f.entry.runId,f.a.address),/confirmed extracted/);assert.equal(f.db.prepare('SELECT count(*) n FROM weapon_recovery_claims').get()!.n,0);}finally{f.service.close();f.db.close();}
});
test('orphaned settlement and corrupted canonical checkpoints cannot issue new recovery signatures',async()=>{
 const f=await setup();try{await f.extract();const checkpoint=await evm.provider.send('evm_snapshot',[]);await f.settle();await evm.provider.send('evm_revert',[checkpoint]);await assert.rejects(f.recovery.claims(f.entry.runId,f.a.address),/canonically confirmed/);assert.equal(f.db.prepare('SELECT count(*) n FROM weapon_recovery_claims').get()!.n,0);}finally{f.service.close();f.db.close();}
 const g=await setup();try{await g.extract();await g.settle();g.db.prepare('UPDATE survival_settlements SET checkpoint=?').run('{}');await assert.rejects(g.recovery.claims(g.entry.runId,g.a.address),/Corrupt canonical/);assert.equal(g.db.prepare('SELECT count(*) n FROM weapon_recovery_claims').get()!.n,0);}finally{g.service.close();g.db.close();}
});
test('an issued source stays pinned to its original collection across a later registry change',async()=>{
 const f=await setup();try{await f.extract();await f.settle();const issued=await f.recovery.claims(f.entry.runId,f.a.address);assert.equal(issued.rewards.length,2);const other=await deploy(artifacts.SurvivalGunCollection,f.deployer,[f.token.target,f.authority.address,weaponRecoveryPolicyHash]);const registry=new WeaponCollections(evm.provider,[{...f.descriptor,collection:String(other.target),codeHash:keccak256(await evm.provider.getCode(other.target))}]);const changed=new WeaponRecovery(f.db,registry,f.authority,f.service);await assert.rejects(changed.claims(f.entry.runId,f.a.address),/already pinned/);assert.equal(await other.nextTokenId(),1n);}finally{f.service.close();f.db.close();}
});
