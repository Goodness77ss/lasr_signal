import {test,before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {id,keccak256,ZeroAddress,ZeroHash} from 'ethers';
import {startEvm} from '../scripts/evm.ts';
import {fixture,deploy,as,receipt,timestamp,at} from '../scripts/shared.ts';
import {JOURNEY_SOLDIER_BUILDS,soldierRunHash,SOLDIER_MAX_LEASE_SECONDS,SOLDIER_LEASE_POLICY,SOLDIER_PROGRESS_POLICY,soldierProgressDomain,soldierProgressTypes,type SoldierProgressVoucher} from '@last-signal/chain';
import {pinJourneyRules,JOURNEY_REWARD_STREAM_RULES} from '../../sim/src/journey/rules.ts';
import {SoldierCollections,type SoldierCollectionDeployment} from '../../../apps/server/src/journey-soldiers.ts';
import {JourneyDeploymentJournal,type DeploymentRequest} from '../../../apps/server/src/journey-deployments.ts';
import {JourneyService} from '../../../apps/server/src/journey-service.ts';
import {JOURNEY_IDENTIFIERS} from '../../protocol/src/journey.ts';
let evm:Awaited<ReturnType<typeof startEvm>>,f:Awaited<ReturnType<typeof fixture>>,soldiers:Awaited<ReturnType<typeof deploy>>,adapter:SoldierCollections,snapshot:string,deployment:SoldierCollectionDeployment;
before(async()=>{
 evm=await startEvm(18580);f=await fixture(evm.provider);const rules='0x'+(await pinJourneyRules(JOURNEY_REWARD_STREAM_RULES)).hash;
 soldiers=await deploy(f.artifacts.JourneySoldiers,f.deployer,[f.authority.address,rules,JOURNEY_SOLDIER_BUILDS.map(b=>b.hash),10]);
 deployment={version:'JOURNEY_SOLDIERS_V1',chainId:31337,collection:String(soldiers.target),mintAuthority:f.deployer.address,gameplaySigner:f.authority.address,rulesHash:rules,codeHash:keccak256(await evm.provider.getCode(soldiers.target)),classSupplyCap:10,maxSupply:70};adapter=new SoldierCollections(evm.provider,deployment);
 await receipt(soldiers.mintDevelopment(f.a.address,0,id('lease fixture soldier')),'mint local lease fixture');
});
after(async()=>{evm?.provider.destroy();await evm?.stop();});
beforeEach(async()=>{snapshot=await evm.provider.send('evm_snapshot',[]);});afterEach(async()=>{await evm.provider.send('evm_revert',[snapshot]);});
const asset=()=>({kind:'soldier' as const,chainId:'31337',collection:String(soldiers.target),tokenId:'1'});
async function start(runId='run:one',duration=100n){
 const expiresAt=await timestamp(evm.provider)+duration;
 await receipt(as(soldiers,f.a).startLease(1,soldierRunHash(runId),f.b.address,expiresAt),'owner consents exact run lease');
 const lease=await soldiers.runLease(1);return {expiresAt,request:{asset:asset(),runId,owner:f.a.address,service:f.b.address,leaseId:String(lease.id)} satisfies DeploymentRequest};
}

test('owner transaction binds exact run, service and bounded expiry; operator approval cannot grant consent',async()=>{
 assert.equal(await soldiers.MAX_LEASE_DURATION(),BigInt(SOLDIER_MAX_LEASE_SECONDS));assert.equal(await soldiers.LEASE_POLICY(),SOLDIER_LEASE_POLICY);
 const now=await timestamp(evm.provider);await receipt(as(soldiers,f.a).approve(f.b.address,1),'grant ERC721 operator only');
 await assert.rejects(as(soldiers,f.b).startLease(1,soldierRunHash('wrong-owner'),f.b.address,now+100n));
 for(const args of [[ZeroHash,f.b.address,now+100n],[soldierRunHash('zero-service'),ZeroAddress,now+100n],[soldierRunHash('expired'),f.b.address,now],[soldierRunHash('over-maximum'),f.b.address,now+7200n]])await assert.rejects(as(soldiers,f.a).startLease(1,...args));
 const current=await timestamp(evm.provider);await as(soldiers,f.a).startLease.staticCall(1,soldierRunHash('max-boundary'),f.b.address,current+3600n);await assert.rejects(as(soldiers,f.a).startLease.staticCall(1,soldierRunHash('over-by-one'),f.b.address,current+3601n));
 const {request,expiresAt}=await start(),lease=await soldiers.runLease(1);assert.equal(lease.owner,f.a.address);assert.equal(lease.service,f.b.address);assert.equal(lease.runId,soldierRunHash(request.runId));assert.equal(lease.expiresAt,expiresAt);assert.equal(lease.nonce,1n);assert.equal(await soldiers.progressNonce(1),1n);
 await assert.rejects(as(soldiers,f.a).startLease(1,soldierRunHash('second-run'),f.b.address,expiresAt));
 await assert.rejects(as(soldiers,f.a).transferFrom(f.a.address,f.b.address,1));await assert.rejects(as(soldiers,f.b).transferFrom(f.a.address,f.b.address,1));await assert.rejects(as(soldiers,f.a)['safeTransferFrom(address,address,uint256)'](f.a.address,f.b.address,1));await assert.rejects(as(soldiers,f.a).transferFrom(f.a.address,f.a.address,1));assert.equal(await soldiers.ownerOf(1),f.a.address);
});

test('only the exact run service can release early and an old release cannot unlock a newer deployment',async()=>{
 const one=await start();await assert.rejects(as(soldiers,f.a).releaseLease(1,one.request.leaseId));await assert.rejects(soldiers.releaseLease(1,one.request.leaseId));await assert.rejects(as(soldiers,f.b).releaseLease(1,id('wrong lease')));await assert.rejects(as(soldiers,f.a).clearExpiredLease(1,one.request.leaseId));
 await receipt(as(soldiers,f.b).releaseLease(1,one.request.leaseId),'service releases early');assert.equal(await soldiers.leaseActive(1),false);assert.equal(await soldiers.progressNonce(1),2n);await assert.rejects(as(soldiers,f.b).releaseLease(1,one.request.leaseId));
 await assert.rejects(as(soldiers,f.a).startLease(1,soldierRunHash(one.request.runId),f.b.address,one.expiresAt));
 const two=await start('run:two');assert.notEqual(two.request.leaseId,one.request.leaseId);await assert.rejects(as(soldiers,f.b).releaseLease(1,one.request.leaseId));assert.equal(await soldiers.leaseActive(1),true);assert.equal((await soldiers.runLease(1)).nonce,2n);
});

test('lease start and release invalidate outstanding progress vouchers before a fresh owner update',async()=>{
 const p:SoldierProgressVoucher={tokenId:'1',owner:f.a.address,bankSource:id('before lease fixture'),rulesHash:deployment.rulesHash,policy:SOLDIER_PROGRESS_POLICY,nonce:'0',cumulativeXp:'10',furthestCheckpoint:'0',hasCheckpoint:true,expiry:String(await timestamp(evm.provider)+1000n)};
 const signature=await f.authority.signTypedData(soldierProgressDomain(31337n,String(soldiers.target)),soldierProgressTypes,p),one=await start();await assert.rejects(as(soldiers,f.a).applyProgress(p,signature));
 await receipt(as(soldiers,f.b).releaseLease(1,one.request.leaseId),'end lease before new progress authorization');await assert.rejects(as(soldiers,f.a).applyProgress(p,signature));
 const fresh={...p,nonce:String(await soldiers.progressNonce(1))};await receipt(as(soldiers,f.a).applyProgress(fresh,await f.authority.signTypedData(soldierProgressDomain(31337n,String(soldiers.target)),soldierProgressTypes,fresh)),'fresh post lease authored progress');assert.equal((await soldiers.progress(1)).revision,1n);
});

test('transfer succeeds at exact expiry with no service or unlock transaction and invalidates old run access',async()=>{
 const one=await start();await evm.provider.send('evm_mine',[]);await adapter.verify(one.request);
 await at(evm.provider,one.expiresAt-1n);await evm.provider.send('evm_mine',[]);await assert.rejects(as(soldiers,f.a).transferFrom.staticCall(f.a.address,f.b.address,1));
 await at(evm.provider,one.expiresAt);const result=await receipt(as(soldiers,f.a).transferFrom(f.a.address,f.b.address,1),'transfer at exact lease expiry');assert.equal(BigInt((await evm.provider.getBlock(result.blockNumber))!.timestamp),one.expiresAt);assert.equal(await soldiers.ownerOf(1),f.b.address);assert.equal(await soldiers.leaseActive(1),false);assert.equal((await soldiers.runLease(1)).id,ZeroHash);
 await assert.rejects(adapter.verify(one.request));await assert.rejects(adapter.owned(asset(),f.a.address));await evm.provider.send('evm_mine',[]);assert.equal((await adapter.owned(asset(),f.b.address)).owner,f.b.address);
 await receipt(as(soldiers,f.b).transferFrom(f.b.address,f.a.address,1),'external transfer returns to original wallet');await evm.provider.send('evm_mine',[]);await assert.rejects(adapter.verify(one.request));await assert.rejects(as(soldiers,f.b).releaseLease(1,one.request.leaseId));
});

test('any local wallet can clear an expired lease and clear replay cannot affect a later lease',async()=>{
 const one=await start();await at(evm.provider,one.expiresAt);await evm.provider.send('evm_mine',[]);assert.equal(await soldiers.leaseActive(1),false);await assert.rejects(as(soldiers,f.b).releaseLease(1,one.request.leaseId));
 await receipt(soldiers.clearExpiredLease(1,one.request.leaseId),'independent expiry recovery');await assert.rejects(soldiers.clearExpiredLease(1,one.request.leaseId));const two=await start('run:next');await assert.rejects(soldiers.clearExpiredLease(1,one.request.leaseId));assert.equal((await soldiers.runLease(1)).id,two.request.leaseId);
});

test('real chain verifier and durable journals reject conflicting runs, recover after reopen and revoke released access',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'journey-chain-lease-')),file=join(directory,'journal.sqlite');let a=new DatabaseSync(file),b=new DatabaseSync(file);
 try{
  const one=await start();const first=new JourneyDeploymentJournal(a,adapter),second=new JourneyDeploymentJournal(b,adapter);
  await assert.rejects(first.reserve([one.request]),/Confirmed/);await evm.provider.send('evm_mine',[]);
  const [reserved]=await first.reserve([one.request]);await assert.rejects(second.reserve([{...one.request,runId:'other-run'}]));await assert.rejects(second.reserve([{...one.request,service:f.a.address}]));await assert.rejects(second.reserve([{...one.request,owner:f.b.address}]));
  assert.equal((await second.authorize(one.request)).leaseId,reserved.leaseId);a.close();b.close();a=new DatabaseSync(file);b=new DatabaseSync(file);const reopened=new JourneyDeploymentJournal(a,adapter);
  assert.equal((await reopened.authorize(one.request)).state,'ACTIVE');await assert.rejects(reopened.close(one.request),/still active/);
  await receipt(as(soldiers,f.b).releaseLease(1,one.request.leaseId),'release after service restart');await evm.provider.send('evm_mine',[]);
  await assert.rejects(reopened.authorize(one.request));assert.equal((await reopened.close(one.request)).state,'RELEASED');assert.equal((await reopened.close(one.request)).state,'RELEASED');
  const two=await start('run:replacement');await evm.provider.send('evm_mine',[]);await reopened.reserve([two.request]);await reopened.close(one.request);assert.equal(reopened.current(asset())!.leaseId,two.request.leaseId);assert.equal((await reopened.authorize(two.request)).state,'ACTIVE');assert.equal(reopened.history(asset()).length,2);
 }finally{a.close();b.close();rmSync(directory,{recursive:true,force:true});}
});

test('verified expiry revokes a recovered run even when the owner never transfers or clears its lease',async()=>{
 const db=new DatabaseSync(':memory:');try{
  const journal=new JourneyDeploymentJournal(db,adapter),one=await start();await evm.provider.send('evm_mine',[]);await journal.reserve([one.request]);
  await at(evm.provider,one.expiresAt);await evm.provider.send('evm_mine',[]);await assert.rejects(journal.authorize(one.request));await assert.rejects(journal.close(one.request),/Confirmed/);await evm.provider.send('evm_mine',[]);assert.equal((await journal.close(one.request)).state,'EXPIRED');assert.equal(await soldiers.ownerOf(1),f.a.address);
  const two=await start('run:after-expiry');await evm.provider.send('evm_mine',[]);await journal.reserve([two.request]);assert.equal(journal.current(asset())!.leaseId,two.request.leaseId);await assert.rejects(journal.reserve([one.request]));
 }finally{db.close();}
});

test('abrupt process exit after lease reservation commit retains uniqueness and permits independent expiry recovery',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'journey-lease-crash-')),file=join(directory,'journal.sqlite');let db:DatabaseSync|undefined;
 const one=await start('run:crash');await evm.provider.send('evm_mine',[]);
 const child=spawn(process.execPath,['--import','tsx',resolve('scripts/journey-deployment-crash-child.ts')],{windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});let failure='';child.stderr?.on('data',chunk=>failure+=String(chunk));
 try{
  const exited=once(child,'exit');child.send({file,url:evm.url,deployment,request:one.request});assert.equal((await exited)[0],74,failure);
  db=new DatabaseSync(file);const reopened=new JourneyDeploymentJournal(db,adapter);assert.equal((await reopened.authorize(one.request)).runId,'run:crash');assert.equal(reopened.history(asset()).length,1);await assert.rejects(reopened.reserve([{...one.request,runId:'run:conflict'}]));
  await at(evm.provider,one.expiresAt);await evm.provider.send('evm_mine',[]);await assert.rejects(reopened.authorize(one.request));await evm.provider.send('evm_mine',[]);assert.equal((await reopened.close(one.request)).state,'EXPIRED');await receipt(soldiers.clearExpiredLease(1,one.request.leaseId),'recover after service process crash');
 }finally{if(child.exitCode===null&&child.signalCode===null)child.kill();db?.close();rmSync(directory,{recursive:true,force:true});}
});

test('authoritative service checks an attached lease before fresh commands, ticks and active run resume',async()=>{
 const db=new DatabaseSync(':memory:'),messages:Record<string,unknown>[]=[],service=new JourneyService(db,{deploymentVerifier:adapter});
 let closed=0;const client=service.connect({send:m=>messages.push(m as Record<string,unknown>),close:()=>{closed++;}});
 try{
  // This explicit access guard fixture attaches a real lease to an existing
  // practice run. It does not claim an owned combat roster or owned XP bridge.
  await client.receive({op:'start',...JOURNEY_IDENTIFIERS});const session=messages.find(m=>m.op==='session')!,run=String(session.run),credential=String(session.credential),one=await start(run);await evm.provider.send('evm_mine',[]);await service.store.deployments.reserve([one.request]);
  await service.tick();assert.equal(service.store.load(run,credential).run.tick,1);
  const command={op:'command' as const,id:'lease-shot',sequence:1,actorId:1,section:service.store.load(run,credential).run.section,action:{kind:'fire' as const,direction:{x:1,y:0,z:0}}};
  await client.receive(command);assert.equal(service.store.load(run,credential).run.actors[0].ammo,19);const ack=messages.find(m=>m.op==='ack');
  await receipt(as(soldiers,f.b).releaseLease(1,one.request.leaseId),'release service guarded run');await evm.provider.send('evm_mine',[]);
  await client.receive(command);assert.equal(messages.filter(m=>m.op==='ack').length,2);assert.deepEqual(messages.filter(m=>m.op==='ack')[1],ack);
  await assert.rejects(client.receive({...command,id:'new-shot',sequence:2}));await service.tick();assert.equal(closed,1);assert.equal(service.store.load(run,credential).run.tick,1);assert.equal(service.store.load(run,credential).run.actors[0].ammo,19);
  const next=service.connect({send:()=>{},close:()=>{}});await assert.rejects(next.receive({op:'resume',...JOURNEY_IDENTIFIERS,run,credential}));next.close();
 }finally{client.close();service.close();db.close();}
});
