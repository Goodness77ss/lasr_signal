import {test,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {JourneyStore} from '../apps/server/src/journey-store.ts';
import {createJourney} from '../packages/sim/src/journey/encounter.ts';
import {journeyAssetKey} from '../packages/chain/src/journey-assets.ts';
test('bank outbox stages only this bank once, ignores abandoned XP and rejects owner mismatch',async()=>{
 const db=new DatabaseSync(':memory:'),owner='0x'+'1'.repeat(40),collection='0x'+'2'.repeat(40),service='0x'+'3'.repeat(40),asset={kind:'soldier' as const,chainId:'31337',collection,tokenId:'1'};
 const store=new JourneyStore(db,{verify:async request=>({...request,expiresAt:'3601',chainTimestamp:'1',blockNumber:'2',blockHash:'0x'+'4'.repeat(64)})});
 try{
  const run=await createJourney({streamed:true});run.state='BANKED';store.create('bank','credential',run);
  await store.deployments.reserve([{asset,runId:'bank',owner,service,leaseId:'0x'+'5'.repeat(64)}]);
  const add=(runId:string,source:string,xp:number,account='eip155:31337:'+owner)=>db.prepare('INSERT INTO journey_experience VALUES(?,?,?,?,?,?,?,?,?,?)').run(runId,source,1,'soldier-token',journeyAssetKey(asset),account,'journey-progress-1',run.pin.hash,'2',xp);
  add('abandoned','earlier',10);add('bank','checkpoint',10);
  expect(()=>store.progressOutbox.stage('bank')).toThrow('transaction');
  db.exec('BEGIN IMMEDIATE');store.progressOutbox.stage('bank');store.progressOutbox.stage('bank');db.exec('COMMIT');
  expect(store.progressOutbox.forRun('bank')).toHaveLength(1);expect(store.progressOutbox.forRun('bank')[0].xp).toBe('10');
  const source=String(store.progressOutbox.forRun('bank')[0].source);let attempts=0;const payloads:unknown[]=[];
  const port={inspect:async()=>({owner,nonce:'0',cumulativeXp:'20',furthestCheckpoint:'1',hasCheckpoint:true,rulesHash:'0x'+run.pin.hash,chainTime:'1',leaseExpires:'3601'}),sign:async(_key:string,voucher:unknown)=>{payloads.push(voucher);if(++attempts===1)throw Error('signing interrupted');return '0x'+'a'.repeat(130);}};
  await expect(store.progressOutbox.prepare(source,port)).rejects.toThrow('signing interrupted');
  expect(store.progressOutbox.forRun('bank')[0].state).toBe('PREPARED');
  const prepared=await store.progressOutbox.prepare(source,port);
  expect(prepared.voucher.cumulativeXp).toBe('30');expect(payloads[0]).toEqual(payloads[1]);
  await store.progressOutbox.prepare(source,port);expect(attempts).toBe(2);
  await expect(store.progressOutbox.prepare(source,{...port,inspect:async()=>({...await port.inspect(),nonce:'1'})})).rejects.toThrow('stale');
  db.prepare('UPDATE journey_experience SET account_id=? WHERE run_id=?').run('eip155:31337:'+service,'bank');
  db.exec('BEGIN IMMEDIATE');expect(()=>store.progressOutbox.stage('bank')).toThrow('identity mismatch');db.exec('ROLLBACK');
  expect(store.progressOutbox.forRun('bank')[0].xp).toBe('10');
 }finally{db.close();}
});

