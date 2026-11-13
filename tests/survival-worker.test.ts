import {test,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {Wallet,id,ZeroHash,TypedDataEncoder} from 'ethers';
import {survivalVaultDomain,survivalResultTypes,type SurvivalResult} from '@last-signal/chain';
import {SurvivalSettlements,SurvivalSettlementWorker,type SettlementTransport,type WorkerObservation,type WorkerReceipt} from '../apps/server/src/survival-settlements.ts';

function fixture(){
 const signer=Wallet.createRandom(),gas=Wallet.createRandom(),db=new DatabaseSync(':memory:');let now=1000;
 const jobs=new SurvivalSettlements(db,()=>now);
 const r:SurvivalResult={runId:id('worker run'),player:Wallet.createRandom().address,currency:Wallet.createRandom().address,rulesHash:id('rules'),segment:1n,sequence:0n,deposit:40n,stationEarned:5n,bonusEarned:0n,spent:0n,failedStake:5n,successMask:0,failureMask:1,abortMask:0,outcome:3,resultHash:id('canonical failed mission'),expiry:900n,nextStationReserve:0n,nextBonusReserve:0n};
 let o:WorkerObservation={chainNow:100n,deadline:900n,finalized:ZeroHash,active:true,segment:1n,sequence:0n,deposit:40n,confirmations:0,matchingReceipt:false};
 let balance=10n**18n,nonce=0,broken=false,broadcasts=0,signs=0,crash=false;const receipts=new Map<string,WorkerReceipt>();
 const transport:SettlementTransport={chain:31337n,vault:Wallet.createRandom().address,signer:signer.address,gasAddress:gas.address,verify:async()=>{if(broken)throw Error('RPC down');},observe:async()=>o,receipt:async h=>receipts.get(h)??null,gas:async()=>({balance,price:10n,nonce}),estimate:async()=>100000n,sign:async(_r,_s,n,p)=>{signs++;return {raw:'private signed fixture:'+n+':'+p,hash:id(n+':'+p)};},validateAttempt:()=>{},broadcast:async()=>{broadcasts++;if(crash)throw Error('Process stopped after network accepted');}};
 const worker=(auditIntervalMs=0)=>new SurvivalSettlementWorker(jobs,transport,signer,2,30000,0n,auditIntervalMs);
 const key=jobs.prepare(transport.chain,transport.vault,r,{tick:1800,mission:'FAILED'});
 return {db,jobs,r,key,transport,worker,setNow:(n:number)=>{now=n;},setBalance:(n:bigint)=>{balance=n;},setNonce:(n:number)=>{nonce=n;},setBroken:(b:boolean)=>{broken=b;},setCrash:(b:boolean)=>{crash=b;},get counts(){return {broadcasts,signs};},receipts,setObservation:(patch:Partial<WorkerObservation>)=>{o={...o,...patch};},finalize:()=>{o={...o,finalized:TypedDataEncoder.hash(survivalVaultDomain(transport.chain,transport.vault),survivalResultTypes,r),matchingReceipt:true,confirmations:2};}};
}
test('authorization and transaction are durable before broadcast; public status omits both',async()=>{const f=fixture();await f.worker().poll();expect(f.jobs.get(f.key)?.state).toBe('submitted');expect(f.jobs.get(f.key)?.signature).toBeTruthy();expect(f.jobs.attempts(f.key)).toHaveLength(1);const status=JSON.stringify(f.jobs.status(f.key));expect(status).not.toContain(f.jobs.get(f.key)!.signature);expect(status).not.toContain('private signed');f.db.close();});
test('changed canonical replay cannot replace a prepared result',()=>{const f=fixture();expect(f.jobs.prepare(f.transport.chain,f.transport.vault,f.r,{tick:1800,mission:'FAILED'})).toBe(f.key);expect(()=>f.jobs.prepare(f.transport.chain,f.transport.vault,{...f.r,failedStake:0n},{tick:1800,mission:'FAILED'})).toThrow('immutable');f.db.close();});
test('restart after broadcast reconciles one actual finalization without a second transaction',async()=>{const f=fixture();f.setCrash(true);await f.worker().poll();expect(f.jobs.get(f.key)?.state).toBe('retrying');expect(f.jobs.attempts(f.key)).toHaveLength(1);f.finalize();await f.worker().poll();expect(f.jobs.get(f.key)?.state).toBe('settled');expect(f.counts.broadcasts).toBe(1);f.db.close();});
test('unknown broadcast result rebroadcasts identical bytes and nonce',async()=>{const f=fixture();f.setCrash(true);await f.worker().poll();f.setCrash(false);await f.worker().poll();expect(f.counts).toEqual({broadcasts:2,signs:1});expect(f.jobs.attempts(f.key)).toHaveLength(1);f.db.close();});
test('replacement bumps price with same nonce and logical result',async()=>{const f=fixture();await f.worker().poll();f.setNow(32000);await f.worker().poll();const a=f.jobs.attempts(f.key);expect(a).toHaveLength(2);expect(a[0].nonce).toBe(a[1].nonce);expect(BigInt(a[1].price)).toBeGreaterThan(BigInt(a[0].price));f.finalize();await f.worker().poll();expect(f.jobs.get(f.key)?.state).toBe('settled');f.db.close();});
test('insufficient gas blocks funded entry without deleting failed stake or reporting success',async()=>{const f=fixture();f.setBalance(0n);const w=f.worker();await w.poll();expect(w.health().fundedEntry).toBe(false);expect(f.jobs.get(f.key)?.state).toBe('retrying');expect(f.counts.broadcasts).toBe(0);expect(f.jobs.get(f.key)?.body).toContain('"failedStake":"5"');f.db.close();});
test('RPC failure is explicit and a later healthy poll recovers same job',async()=>{const f=fixture();f.setBroken(true);const w=f.worker();await w.poll();expect(w.health().reason).toContain('RPC');expect(f.jobs.get(f.key)?.state).toBe('retrying');f.setBroken(false);await w.poll();expect(f.jobs.get(f.key)?.state).toBe('submitted');f.db.close();});
test('expiry becomes independent recovery, never a fabricated settlement',async()=>{const f=fixture();f.setObservation({chainNow:900n});await f.worker().poll();expect(f.jobs.get(f.key)?.state).toBe('recovery required');expect(f.counts.broadcasts).toBe(0);f.db.close();});
test('wrong finalization and consumed nonce require recovery',async()=>{const f=fixture();f.setObservation({finalized:id('full timeout')});await f.worker().poll();expect(f.jobs.get(f.key)?.state).toBe('recovery required');expect(f.counts.broadcasts).toBe(0);f.db.close();const g=fixture();await g.worker().poll();g.setNonce(1);await g.worker().poll();expect(g.jobs.get(g.key)?.reason).toContain('nonce consumed');g.db.close();});
test('confirmation count and canonical receipt are both required',async()=>{const f=fixture();await f.worker().poll();f.finalize();f.setObservation({confirmations:1});await f.worker().poll();expect(f.jobs.get(f.key)?.state).toBe('confirming');f.setObservation({confirmations:2,matchingReceipt:false});await f.worker().poll();expect(f.jobs.get(f.key)?.state).toBe('confirming');f.finalize();await f.worker().poll();expect(f.jobs.get(f.key)?.state).toBe('settled');f.db.close();});
test('orphaned receipt cannot become settlement and same job is rebroadcast',async()=>{const f=fixture();await f.worker().poll();f.receipts.set(f.jobs.attempts(f.key)[0].hash,{status:1,canonical:false,confirmations:10});await f.worker().poll();expect(f.jobs.get(f.key)?.state).toBe('submitted');expect(f.counts.signs).toBe(1);f.db.close();});
test('corrupt checkpoints and transaction journals cannot be submitted',async()=>{const f=fixture();f.db.prepare('UPDATE survival_settlements SET checkpoint=?').run('{}');const w=f.worker();await w.poll();expect(f.jobs.get(f.key)?.state).toBe('recovery required');expect(f.counts.signs).toBe(0);expect(w.health().fundedEntry).toBe(false);f.db.close();const g=fixture();await g.worker().poll();g.transport.validateAttempt=()=>{throw Error('bad raw');};await g.worker().poll();expect(g.jobs.get(g.key)?.reason).toContain('Corrupt transaction');g.db.close();});
test('gas wallet lease fences concurrent workers and later jobs cannot reuse unresolved nonce',async()=>{const f=fixture();const lease=f.transport.chain+':'+f.transport.gasAddress.toLowerCase();expect(f.jobs.acquire(lease,'other')).toBe(true);await f.worker().poll();expect(f.counts.signs).toBe(0);f.setNow(62000);await f.worker().poll();const second=f.jobs.prepare(f.transport.chain,f.transport.vault,{...f.r,runId:id('second')},{tick:2});await f.worker().poll();expect(f.jobs.attempts(second)).toHaveLength(0);expect(f.jobs.get(second)?.reason).toContain('earlier gas nonce');f.db.close();});

test('completed audit cadence leaves pending jobs immediate and detects a rollback at the next sweep',async()=>{
 const f=fixture(),w=f.worker(30000),observe=f.transport.observe;let completedReads=0;
 f.transport.observe=async(r,attempts)=>{if(r.runId===f.r.runId){completedReads++;return observe(r,attempts);}return {chainNow:100n,deadline:900n,finalized:ZeroHash,active:true,segment:1n,sequence:0n,deposit:40n,confirmations:0,matchingReceipt:false};};
 await w.poll();f.finalize();await w.poll();expect(f.jobs.get(f.key)?.state).toBe('settled');
 const before=completedReads;await w.poll();expect(completedReads).toBe(before);
 f.setNonce(1);const second=f.jobs.prepare(f.transport.chain,f.transport.vault,{...f.r,runId:id('next immediate result')},{tick:1801});
 await w.poll();expect(f.jobs.get(second)?.state).toBe('submitted');expect(completedReads).toBe(before);
 f.setObservation({finalized:ZeroHash,matchingReceipt:false});f.setNow(31000);await w.poll();
 expect(f.jobs.get(f.key)?.state).toBe('recovery required');expect(w.health().fundedEntry).toBe(false);f.db.close();
});

test('restart audits completed jobs immediately and an unavailable audit retries without skipping its job',async()=>{
 const f=fixture();await f.worker().poll();f.finalize();await f.worker().poll();
 const observe=f.transport.observe,w=f.worker(30000);let unavailable=true,reads=0;
 f.transport.observe=async(r,attempts)=>{reads++;if(unavailable)throw Error('Receipt endpoint unavailable');return observe(r,attempts);};
 expect(await w.poll()).toBe(false);expect(w.health().fundedEntry).toBe(false);
 unavailable=false;f.setObservation({finalized:ZeroHash,matchingReceipt:false});await w.poll();
 expect(reads).toBe(2);expect(f.jobs.get(f.key)?.state).toBe('recovery required');expect(w.health().fundedEntry).toBe(false);f.db.close();
});

test('incomplete receipt search continues on the next poll rather than waiting for the audit interval',async()=>{
 const f=fixture();await f.worker().poll();f.finalize();await f.worker().poll();const w=f.worker(30000);
 f.setObservation({matchingReceipt:false,searchingReceipt:true});await w.poll();expect(w.health().fundedEntry).toBe(false);expect(f.jobs.get(f.key)?.state).toBe('settled');
 f.setObservation({matchingReceipt:true,searchingReceipt:false});await w.poll();expect(w.health().fundedEntry).toBe(true);expect(f.jobs.get(f.key)?.state).toBe('settled');
 f.db.close();
});
