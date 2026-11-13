import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {parseEther} from 'ethers';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {startEvm} from '../scripts/evm.ts';
import {compile} from '../scripts/compile.ts';
import {receipt,as} from '../scripts/shared.ts';
import {workerFixture,missionGameplayFixture} from './survival-worker.fixture.ts';
import {FundedSurvival} from '../../../apps/server/src/funded-survival.ts';
import {decodeResult} from '../../../apps/server/src/survival-settlements.ts';
import {backupDatabase} from '../../../scripts/backup-database.mjs';
import {LocalSurvivalVaultTransport} from '../../../apps/server/src/survival-vault-transport.ts';
let evm:Awaited<ReturnType<typeof startEvm>>,artifacts:ReturnType<typeof compile>;
before(async()=>{artifacts=compile();evm=await startEvm(18555);});
after(async()=>{evm?.provider.destroy();await evm?.stop();});
test('server canonical departure fails an explicitly consented mission and worker settles with no connected player',async()=>{
 const f=await workerFixture(evm.provider,artifacts),e=await f.open();
 const detach=f.service.attach(e.runId,f.a.address,{send:()=>{},close:()=>{}});await f.advanceWall(90);const r=missionGameplayFixture(f.service,e.runId);assert.equal(r.mission.current.status,'OFFER');
 const p=await f.service.missionPermit(e.runId,f.a.address);await receipt(as(f.vault,f.a).acceptMission(p.permit,p.signature),'explicit player mission consent',f.receipts);await evm.provider.send('evm_mine',[]);
 // The player disconnects without notifying the service of the mined receipt. Poll must recover it from chain logs.
 detach();await f.service.poll();assert.equal(f.service.status(e.runId,f.a.address).mission.current?.status,'ACTIVE');
 await f.advanceWall(60);f.service.tick();const status=f.service.status(e.runId,f.a.address);assert.equal(status.phase,'closing');assert.equal(status.mission.current?.status,'FAILED');assert.equal(status.accounting.failedWhole,5);const key=status.settlement!.key;
 assert.equal(decodeResult(f.service.jobs.get(key)!.body).failedStake,parseEther('5'));
 const playerNonce=await evm.provider.getTransactionCount(f.a.address);await f.service.poll();assert.equal(f.service.jobs.get(key)?.state,'submitted');await evm.provider.send('evm_mine',[]);await f.service.poll();assert.equal(f.service.jobs.get(key)?.state,'settled');assert.equal(await f.vault.claimable(f.a.address),parseEther('35'));assert.equal(await evm.provider.getTransactionCount(f.a.address),playerNonce);assert.equal(await f.vault.claimable(f.gas.address),0n);assert.equal(await f.token.allowance(f.a.address,f.vault.target),0n);assert.equal(await f.token.balanceOf(f.vault.target),await f.vault.liabilities());
 await receipt(as(f.vault,f.a).claim(),'independent player pull claim');assert.equal(await f.vault.claimable(f.a.address),0n);f.db.close();
});
test('real broadcast followed by service reconstruction settles once from durable authorization and receipt',async()=>{
 const f=await workerFixture(evm.provider,artifacts),e=await f.open();f.service.attach(e.runId,f.a.address,{send:()=>{},close:()=>{}});f.service.pause(e.runId,f.a.address,false);for(let i=0;i<61;i++)f.service.tick();
 f.service.action(e.runId,f.a.address,'surrender',{kind:'command',action:{kind:'surrender'}});const status=f.service.status(e.runId,f.a.address),key=status.settlement!.key;
 const broadcast=f.transport.broadcast.bind(f.transport);f.transport.broadcast=async raw=>{await broadcast(raw);throw Error('Authored crash after broadcast before acknowledgement');};await f.service.poll();assert.equal(f.service.jobs.attempts(key).length,1);
 const nonce=await evm.provider.getTransactionCount(f.gas.address);f.transport.broadcast=broadcast;await evm.provider.send('evm_mine',[]);
 const restarted=new FundedSurvival(f.db,f.transport,f.authority,f.now);await restarted.poll();assert.equal(restarted.jobs.get(key)?.state,'settled');assert.equal(await evm.provider.getTransactionCount(f.gas.address),nonce);assert.equal(await f.vault.claimable(f.a.address),parseEther('40'));assert.equal(restarted.status(e.runId,f.a.address).phase,'ended');
 // Completed banked state also reloads without comparing it against the older closing snapshot.
 const again=new FundedSurvival(f.db,f.transport,f.authority,f.now);assert.equal(again.status(e.runId,f.a.address).phase,'ended');f.db.close();
});
test('top up after canonical closure preserves known failed stake and credits the added deposit',async()=>{
 const f=await workerFixture(evm.provider,artifacts),e=await f.open();const detach=f.service.attach(e.runId,f.a.address,{send:()=>{},close:()=>{}});await f.advanceWall(90);missionGameplayFixture(f.service,e.runId);const p=await f.service.missionPermit(e.runId,f.a.address);await receipt(as(f.vault,f.a).acceptMission(p.permit,p.signature),'explicit consent');await evm.provider.send('evm_mine',[]);await f.service.poll();detach();await f.advanceWall(60);f.service.tick();
 await receipt(as(f.token,f.a).approve(f.vault.target,parseEther('1')),'exact top up approval');await receipt(as(f.vault,f.a).topUp(e.runId,parseEther('1')),'racing top up');await f.service.poll();await evm.provider.send('evm_mine',[]);await f.service.poll();assert.equal(await f.vault.claimable(f.a.address),parseEther('36'));assert.equal(await f.treasury.totalRecycled(),parseEther('5'));f.db.close();
});
test('actual empty gas wallet and unavailable RPC retain obligations in explicit states',async()=>{
 const f=await workerFixture(evm.provider,artifacts),e=await f.open();f.service.attach(e.runId,f.a.address,{send:()=>{},close:()=>{}});f.service.pause(e.runId,f.a.address,false);for(let i=0;i<61;i++)f.service.tick();f.service.action(e.runId,f.a.address,'surrender',{kind:'command',action:{kind:'surrender'}});const key=f.service.status(e.runId,f.a.address).settlement!.key;
 await evm.provider.send('hardhat_setBalance',[f.gas.address,'0x0']);await f.service.poll();assert.equal(f.service.jobs.get(key)?.state,'retrying');assert.equal(f.service.worker.health().fundedEntry,false);assert.equal(await f.vault.claimable(f.a.address),0n);
 const verify=f.transport.verify.bind(f.transport);f.transport.verify=async()=>{throw Error('Authored RPC outage');};await f.service.poll();assert.match(f.service.jobs.get(key)!.reason,/RPC/);assert.equal(f.service.jobs.attempts(key).length,0);f.transport.verify=verify;
 await evm.provider.send('hardhat_setBalance',[f.gas.address,'0xde0b6b3a7640000']);await f.service.poll();await evm.provider.send('evm_mine',[]);await f.service.poll();assert.equal(f.service.jobs.get(key)?.state,'settled');assert.equal(await f.vault.claimable(f.a.address),parseEther('40'));f.db.close();
});
test('actual pending transaction is replaced at the same gas nonce and finalizes only one result',async()=>{
 const f=await workerFixture(evm.provider,artifacts),e=await f.open();f.service.attach(e.runId,f.a.address,{send:()=>{},close:()=>{}});f.service.pause(e.runId,f.a.address,false);for(let i=0;i<61;i++)f.service.tick();f.service.action(e.runId,f.a.address,'surrender',{kind:'command',action:{kind:'surrender'}});const key=f.service.status(e.runId,f.a.address).settlement!.key;
 await evm.provider.send('evm_setAutomine',[false]);try{
  await f.service.poll();assert.equal(f.service.jobs.attempts(key).length,1);f.setWall(f.now()+31000);await f.service.poll();const attempts=f.service.jobs.attempts(key);assert.equal(attempts.length,2);assert.equal(attempts[0].nonce,attempts[1].nonce);assert.notEqual(attempts[0].hash,attempts[1].hash);await evm.provider.send('evm_mine',[]);
 }finally{await evm.provider.send('evm_setAutomine',[true]);}
 await evm.provider.send('evm_mine',[]);await f.service.poll();assert.equal(f.service.jobs.get(key)?.state,'settled');assert.equal(await f.vault.claimable(f.a.address),parseEther('40'));assert.equal(await evm.provider.getTransactionCount(f.gas.address),1);f.db.close();
});
test('wall safety checkpoint preserves combat state and only carries the approved current credit',async()=>{
 const f=await workerFixture(evm.provider,artifacts),e=await f.open(40,20);f.service.attach(e.runId,f.a.address,{send:()=>{},close:()=>{}});const before=f.service.status(e.runId,f.a.address);await f.advanceWall(600);f.service.tick();const closing=f.service.status(e.runId,f.a.address);assert.equal(closing.phase,'closing');assert.equal(closing.observation.tick,before.observation.tick);await f.service.poll();await evm.provider.send('evm_mine',[]);await f.service.poll();const after=f.service.status(e.runId,f.a.address);assert.equal(after.phase,'active');assert.equal(after.allocation.segment,'2');assert.equal(after.accounting.depositWhole,20);assert.deepEqual(after.observation,before.observation);assert.deepEqual(after.fieldAllowance,before.fieldAllowance);assert.equal(await f.vault.claimable(f.a.address),parseEther('20'));assert.equal(await f.vault.lockedLiability(),parseEther('20'));assert.equal(await f.token.balanceOf(f.vault.target),parseEther('40'));f.db.close();
});
test('entry gas budget covers existing and newly authorized settlement obligations',async()=>{
 const f=await workerFixture(evm.provider,artifacts),price=BigInt(await evm.provider.send('eth_gasPrice',[]));await evm.provider.send('hardhat_setBalance',[f.gas.address,'0x'+(2000000n*price+10n**15n).toString(16)]);await f.service.poll();assert.equal(f.service.worker.health().fundedEntry,true);await f.open(0);await assert.rejects(f.service.entry(f.b.address,0,0),/cannot back another/);await evm.provider.send('hardhat_setBalance',[f.gas.address,'0xde0b6b3a7640000']);await f.service.poll();const next=await f.service.entry(f.b.address,0,0);assert.equal(next.entry.player,f.b.address);f.db.close();
});
test('another valid holder can settle and bounded log search resumes safely after restart',async()=>{
 const f=await workerFixture(evm.provider,artifacts);await evm.provider.send('hardhat_mine',['0x4e20']);await f.service.poll();const e=await f.open();f.service.attach(e.runId,f.a.address,{send:()=>{},close:()=>{}});f.service.pause(e.runId,f.a.address,false);for(let i=0;i<61;i++)f.service.tick();f.service.action(e.runId,f.a.address,'end',{kind:'command',action:{kind:'surrender'}});const key=f.service.status(e.runId,f.a.address).settlement!.key,r=decodeResult(f.service.jobs.get(key)!.body);
 await receipt(as(f.vault,f.b).settle(r,await f.signResult(r)),'different holder submits canonical server authorization');await evm.provider.send('evm_mine',[]);await f.service.poll();assert.equal(f.service.jobs.get(key)?.state,'confirming');assert.equal(f.service.worker.health().fundedEntry,false);await f.service.poll();assert.equal(f.service.jobs.get(key)?.state,'settled');assert.equal(f.service.jobs.attempts(key).length,0);assert.equal(await f.vault.claimable(f.a.address),parseEther('40'));
 const freshTransport=new LocalSurvivalVaultTransport(evm.provider,f.gas,f.gas.address,f.transport.manifest),restarted=new FundedSurvival(f.db,freshTransport,f.authority,f.now);await restarted.poll();assert.equal(restarted.worker.health().fundedEntry,false);assert.notEqual(restarted.jobs.get(key)?.state,'recovery required');await restarted.poll();assert.equal(restarted.jobs.get(key)?.state,'settled');f.db.close();
});
test('private online backup restores a pending settlement and reconnect without new gameplay rights or duplicate payment',async()=>{
 const directory=resolve('.runtime/worker-restore-tests',randomUUID());mkdirSync(directory,{recursive:true});const f=await workerFixture(evm.provider,artifacts,resolve(directory,'source.sqlite')),e=await f.open();f.service.attach(e.runId,f.a.address,{send:()=>{},close:()=>{}});f.service.pause(e.runId,f.a.address,false);for(let i=0;i<61;i++)f.service.tick();f.service.action(e.runId,f.a.address,'end',{kind:'command',action:{kind:'surrender'}});const before=f.service.status(e.runId,f.a.address),key=before.settlement!.key;
 const copy=await backupDatabase(resolve(directory,'source.sqlite'),resolve(directory,'backups'));assert.equal(copy.report.restore,'PASS');f.service.close();f.db.close();const db=new DatabaseSync(resolve(copy.directory,'restore-check.sqlite'));
 const restored=new FundedSurvival(db,f.transport,f.authority,f.now);let received=false;restored.attach(e.runId,f.a.address,{send:()=>{received=true;},close:()=>{}});assert.equal(received,true);assert.deepEqual(restored.status(e.runId,f.a.address).observation,before.observation);assert.throws(()=>restored.pause(e.runId,f.a.address,false));await restored.poll();await evm.provider.send('evm_mine',[]);await restored.poll();assert.equal(restored.jobs.get(key)?.state,'settled');assert.equal(await f.vault.claimable(f.a.address),parseEther('40'));assert.equal(await evm.provider.getTransactionCount(f.gas.address),1);db.close();
});
