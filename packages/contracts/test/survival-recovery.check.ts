import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {parseEther} from 'ethers';
import {startEvm} from '../scripts/evm.ts';
import {compile} from '../scripts/compile.ts';
import {workerFixture} from './survival-worker.fixture.ts';
import {as,receipt} from '../scripts/shared.ts';
import {FundedSurvival} from '../../../apps/server/src/funded-survival.ts';
let evm:Awaited<ReturnType<typeof startEvm>>,artifacts:ReturnType<typeof compile>;
before(async()=>{evm=await startEvm(18560);artifacts=compile();});
after(async()=>{evm?.provider.destroy();await evm?.stop();});
async function closing(){const f=await workerFixture(evm.provider,artifacts),e=await f.open();f.service.attach(e.runId,f.a.address,{send:()=>{},close:()=>{}});f.service.pause(e.runId,f.a.address,false);for(let i=0;i<61;i++)f.service.tick();f.service.action(e.runId,f.a.address,'end',{kind:'command',action:{kind:'surrender'}});return {...f,e,key:f.service.status(e.runId,f.a.address).settlement!.key};}
test('canonical preparation and gameplay transaction rollback leave no partially issued monetary job',async()=>{
 const f=await workerFixture(evm.provider,artifacts),e=await f.open(),r=await f.result(e);f.db.exec('BEGIN IMMEDIATE');const key=f.service.jobs.prepare(31337n,String(f.vault.target),r,{authoredBoundary:'before commit'});assert.ok(f.service.jobs.get(key));f.db.exec('ROLLBACK');assert.equal(f.service.jobs.get(key),undefined);assert.equal(await f.vault.claimable(f.a.address),0n);assert.equal(await f.vault.lockedLiability(),parseEther('40'));assert.equal(await f.treasury.reserved(),parseEther('30'));f.db.close();
});
test('restart before first broadcast sends the already journaled transaction exactly once',async()=>{
 const f=await closing(),broadcast=f.transport.broadcast.bind(f.transport);f.transport.broadcast=async()=>{throw Error('Authored crash before network');};await f.service.poll();assert.equal(f.service.jobs.attempts(f.key).length,1);assert.equal(await evm.provider.getTransactionCount(f.gas.address),0);assert.equal(await f.vault.lockedLiability(),parseEther('40'));
 const hash=f.service.jobs.attempts(f.key)[0].hash;f.transport.broadcast=broadcast;const restarted=new FundedSurvival(f.db,f.transport,f.authority,f.now);await restarted.poll();await evm.provider.send('evm_mine',[]);await restarted.poll();assert.equal(restarted.jobs.get(f.key)?.state,'settled');assert.equal(restarted.jobs.attempts(f.key).length,1);assert.equal(restarted.jobs.attempts(f.key)[0].hash,hash);assert.equal(await evm.provider.getTransactionCount(f.gas.address),1);f.db.close();
});
test('orphan before required confirmation rebroadcasts the same canonical bytes without duplicate credit',async()=>{
 const f=await closing(),snap=await evm.provider.send('evm_snapshot',[]);await f.service.poll();assert.equal(f.service.jobs.get(f.key)?.state,'submitted');const hash=f.service.jobs.attempts(f.key)[0].hash;assert.equal(await f.vault.claimable(f.a.address),parseEther('40'));
 await evm.provider.send('evm_revert',[snap]);assert.equal(await f.vault.claimable(f.a.address),0n);await f.service.poll();assert.equal(f.service.jobs.attempts(f.key).length,1);assert.equal(f.service.jobs.attempts(f.key)[0].hash,hash);await evm.provider.send('evm_mine',[]);await f.service.poll();assert.equal(f.service.jobs.get(f.key)?.state,'settled');assert.equal(await f.vault.claimable(f.a.address),parseEther('40'));assert.equal(await evm.provider.getTransactionCount(f.gas.address),1);f.db.close();
});
test('reorganization after published confirmation revokes settled status and preserves independent recovery',async()=>{
 const f=await closing(),snap=await evm.provider.send('evm_snapshot',[]);await f.service.poll();await evm.provider.send('evm_mine',[]);await f.service.poll();assert.equal(f.service.jobs.get(f.key)?.state,'settled');assert.equal(f.service.status(f.e.runId,f.a.address).phase,'ended');
 await evm.provider.send('evm_revert',[snap]);await f.service.poll();assert.equal(f.service.jobs.get(f.key)?.state,'recovery required');assert.equal(f.service.worker.health().fundedEntry,false);assert.equal(f.service.status(f.e.runId,f.a.address).phase,'recovery');assert.equal(await f.vault.claimable(f.a.address),0n);assert.equal((await f.vault.run(f.e.runId)).active,true);
 await f.advance(900n);await receipt(as(f.vault,f.b).refundExpired(f.e.runId),'independent timeout after deep chain rollback');assert.equal(await f.vault.claimable(f.a.address),parseEther('40'));assert.equal(await f.vault.pendingRewards(f.a.address),0n);f.db.close();
});
test('corrupted gameplay or authorization checkpoints cannot resume or submit a result',async()=>{
 const f=await closing();f.db.prepare('UPDATE survival_funded_runs SET state=? WHERE id=?').run('{}',f.e.runId);const restarted=new FundedSurvival(f.db,f.transport,f.authority,f.now);await restarted.poll();assert.equal(restarted.jobs.get(f.key)?.state,'recovery required');assert.equal(restarted.worker.health().fundedEntry,false);assert.equal(await evm.provider.getTransactionCount(f.gas.address),0);assert.equal(await f.vault.claimable(f.a.address),0n);await f.advance(900n);await receipt(f.vault.refundExpired(f.e.runId),'full refund after unprovable gameplay');assert.equal(await f.vault.claimable(f.a.address),parseEther('40'));f.db.close();
 const g=await closing();g.db.prepare('UPDATE survival_settlements SET checkpoint=? WHERE key=?').run('{}',g.key);await g.service.poll();assert.equal(g.service.jobs.get(g.key)?.state,'recovery required');assert.equal(await evm.provider.getTransactionCount(g.gas.address),0);g.db.close();
});
test('verified active service interruption refunds full deposit while prepared canonical jobs retain charges',async()=>{
 const f=await workerFixture(evm.provider,artifacts),e=await f.open();const restarted=new FundedSurvival(f.db,f.transport,f.authority,f.now);await restarted.poll();assert.equal(restarted.status(e.runId,f.a.address).phase,'closing');await restarted.poll();await evm.provider.send('evm_mine',[]);await restarted.poll();assert.equal(await f.vault.claimable(f.a.address),parseEther('40'));assert.equal(await f.vault.pendingRewards(f.a.address),0n);assert.equal(await f.treasury.freeCapacity(),parseEther('200'));assert.equal(await f.vault.lockedLiability(),0n);f.db.close();
});
test('failure at the supply journal boundary rolls back combat and charges and disables new funded entry',async()=>{
 const f=await workerFixture(evm.provider,artifacts),e=await f.open();f.service.attach(e.runId,f.a.address,{send:()=>{},close:()=>{}});f.service.pause(e.runId,f.a.address,false);for(let i=0;i<61;i++)f.service.tick();const before=f.service.status(e.runId,f.a.address);
 f.db.exec("CREATE TRIGGER proof_disk_failure BEFORE INSERT ON survival_funded_commands BEGIN SELECT RAISE(ABORT,'Authored persistence failure'); END;");
 assert.throws(()=>f.service.action(e.runId,f.a.address,'shield',{kind:'supply',item:'SHIELD'}));const after=f.service.status(e.runId,f.a.address);assert.equal(after.accounting.spentWhole,0);assert.deepEqual(after.observation,before.observation);assert.equal(after.phase,'recovery');assert.equal(f.service.config().settlementWorker.fundedEntry,false);assert.equal(f.service.jobs.pending().length,0);assert.equal(await f.vault.lockedLiability(),parseEther('40'));assert.equal(await f.vault.claimable(f.a.address),0n);f.db.close();
});
test('a missing gameplay row cannot reactivate the same deposit with fresh health or supply budgets',async()=>{
 const f=await workerFixture(evm.provider,artifacts),e=await f.open();f.db.prepare('DELETE FROM survival_funded_runs WHERE id=?').run(e.runId);const restarted=new FundedSurvival(f.db,f.transport,f.authority,f.now);await restarted.poll();await assert.rejects(restarted.activate(e.runId,f.a.address),/Previously activated/);assert.equal(await f.vault.lockedLiability(),parseEther('40'));assert.equal(await f.vault.claimable(f.a.address),0n);await f.advance(900n);await receipt(f.vault.refundExpired(e.runId),'recover full deposit without missing checkpoint reset');assert.equal(await f.vault.claimable(f.a.address),parseEther('40'));f.db.close();
});
