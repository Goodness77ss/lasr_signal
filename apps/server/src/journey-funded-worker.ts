import {Contract,Transaction,getAddress,id,keccak256,type JsonRpcProvider,type Signer} from 'ethers';
import {readFileSync} from 'node:fs';
import type {DatabaseSync} from 'node:sqlite';
import {JourneyFundedJournal} from './journey-funded-journal.ts';
export type JourneyPoolDeployment={chainId:31337;pool:string;currency:string;service:string;codeHash:string;currencyCodeHash:string};
export const journeyRewardRunId=(runId:string)=>id('LAST_SIGNAL_JOURNEY_REWARD:'+runId);
export class JourneyFundedWorker {
 private pool:Contract;private busy=false;private stopped=false;private sending:Promise<void>=Promise.resolve();
 constructor(private db:DatabaseSync,private provider:JsonRpcProvider,private signer:Signer,readonly deployment:JourneyPoolDeployment){
  if(!signer.provider){signer=signer.connect(provider);this.signer=signer;}db.exec('CREATE TABLE IF NOT EXISTS journey_funded_broadcasts(source TEXT PRIMARY KEY,raw_transaction TEXT NOT NULL,transaction_hash TEXT NOT NULL,nonce INTEGER NOT NULL UNIQUE)');
  db.exec("CREATE TABLE IF NOT EXISTS journey_funded_intents(run_id TEXT PRIMARY KEY,owner TEXT NOT NULL,destination TEXT NOT NULL,state TEXT NOT NULL);CREATE UNIQUE INDEX IF NOT EXISTS journey_funded_owner_intent ON journey_funded_intents(owner) WHERE state IN ('PENDING','OPEN');");
  db.exec('CREATE TABLE IF NOT EXISTS journey_funded_recovery_events(id INTEGER PRIMARY KEY,run_id TEXT NOT NULL,state TEXT NOT NULL,reason TEXT NOT NULL,transaction_hash TEXT,recorded_at TEXT NOT NULL)');
  this.pool=new Contract(getAddress(deployment.pool),JSON.parse(readFileSync(new URL('../../../packages/contracts/abi/JourneyRewardPool.json',import.meta.url),'utf8')),signer);
 }
 private serial<T>(work:()=>Promise<T>):Promise<T>{const result=this.sending.then(work);this.sending=result.then(()=>{},()=>{});return result;}
 private send(source:string,data:string):Promise<{hash:string}>{
  return this.serial(async()=>{
   const opening=source.startsWith('open:')?source.slice(5):null;
   const permitted=()=>{if(opening){const intent=this.db.prepare('SELECT state,destination FROM journey_funded_intents WHERE run_id=?').get(opening);if(!intent||!['PENDING','OPEN'].includes(String(intent.state))||intent.destination!==JSON.stringify(this.deployment))throw Error('Allocation intent is cancelled or requires recovery');}};
   permitted();
   let row=this.db.prepare('SELECT * FROM journey_funded_broadcasts WHERE source=?').get(source);
   if(!row){const transaction=await this.signer.populateTransaction({to:this.deployment.pool,data,value:0}),raw=await this.signer.signTransaction(transaction),parsed=Transaction.from(raw);if(!parsed.hash)throw Error('Signed reward transaction hash missing');permitted();this.db.prepare('INSERT INTO journey_funded_broadcasts VALUES(?,?,?,?)').run(source,raw,parsed.hash,parsed.nonce);row=this.db.prepare('SELECT * FROM journey_funded_broadcasts WHERE source=?').get(source)!;}
   const parsed=Transaction.from(String(row.raw_transaction));if(parsed.data!==data||getAddress(parsed.to!)!==getAddress(this.deployment.pool))throw Error('Reward broadcast source changed');
   const hash=String(row.transaction_hash),receipt=await this.provider.getTransactionReceipt(hash);if(receipt){const block=await this.provider.getBlock(receipt.blockNumber);if(block?.hash===receipt.blockHash){if(receipt.status!==1)throw Error('Reward transaction failed; timeout recovery remains available');return {hash};}}
   try{await this.provider.broadcastTransaction(String(row.raw_transaction));}catch(error){if(!await this.provider.getTransaction(hash))throw error;}
   return {hash};
  });
 }
 async cancelUnbroadcast(runId:string,owner:string){
  if(!/^[a-f0-9]{32}$/.test(runId))throw Error('Exact proposed run required');owner=getAddress(owner);
  return this.serial(async()=>{
   await this.checked();const intent=this.db.prepare('SELECT * FROM journey_funded_intents WHERE run_id=?').get(runId);
   if(!intent||intent.owner!==owner||intent.destination!==JSON.stringify(this.deployment))throw Error('Allocation intent owner or destination denied');
   if(intent.state==='CANCELLED')return {state:'CANCELLED' as const,runId};
   if(intent.state!=='PENDING'||this.db.prepare('SELECT 1 FROM journey_funded_runs WHERE run_id=?').get(runId)||this.db.prepare('SELECT 1 FROM journey_runs WHERE id=?').get(runId)||this.db.prepare('SELECT 1 FROM journey_funded_broadcasts WHERE source=?').get('open:'+runId))throw Error('This allocation was signed, broadcast or admitted. Recover it or use its timeout.');
   const record=await this.pool.runs(journeyRewardRunId(runId));if(getAddress(record.player)!=='0x0000000000000000000000000000000000000000')throw Error('An on-chain allocation already exists');
   // The same queue owns signing and cancellation. No signed bytes can escape
   // between this last chain read and the durable cancellation record.
   this.db.exec('BEGIN IMMEDIATE');try{
    if(this.db.prepare('SELECT 1 FROM journey_funded_broadcasts WHERE source=?').get('open:'+runId)||this.db.prepare('SELECT 1 FROM journey_runs WHERE id=?').get(runId))throw Error('Allocation advanced before cancellation');
    const result=this.db.prepare("UPDATE journey_funded_intents SET state='CANCELLED' WHERE run_id=? AND state='PENDING'").run(runId);if(result.changes!==1)throw Error('Allocation state changed');
    this.db.prepare('INSERT INTO journey_funded_recovery_events(run_id,state,reason,recorded_at) VALUES(?,?,?,?)').run(runId,'CANCELLED','No allocation transaction was signed or broadcast',new Date().toISOString());this.db.exec('COMMIT');
   }catch(error){this.db.exec('ROLLBACK');throw error;}
   return {state:'CANCELLED' as const,runId};
  });
 }
 private orphan(runId:string,reason:string,state='ORPHANED'){
  this.db.exec('BEGIN IMMEDIATE');try{const previous=this.db.prepare('SELECT transaction_hash FROM journey_funded_outbox WHERE run_id=?').get(runId);this.db.prepare('UPDATE journey_funded_runs SET state=? WHERE run_id=?').run(state,runId);this.db.prepare("UPDATE journey_funded_outbox SET state='ORPHANED' WHERE run_id=?").run(runId);this.db.prepare("UPDATE journey_funded_intents SET state='RECOVERING' WHERE run_id=? AND state<>'CANCELLED'").run(runId);this.db.prepare('INSERT INTO journey_funded_recovery_events(run_id,state,reason,transaction_hash,recorded_at) VALUES(?,?,?,?,?)').run(runId,state,reason,previous?.transaction_hash??null,new Date().toISOString());this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 async checked(){
  const d=this.deployment;if(d.chainId!==31337||BigInt(await this.provider.send('eth_chainId',[]))!==31337n||getAddress(await this.signer.getAddress())!==getAddress(d.service))throw Error('Local reward service identity mismatch');
  for(const [address,hash] of [[d.pool,d.codeHash],[d.currency,d.currencyCodeHash]])if(!/^0x[0-9a-fA-F]{64}$/.test(hash)||keccak256(await this.provider.getCode(address))!==hash)throw Error('Reward deployment code mismatch');
  if(getAddress(await this.pool.currency())!==getAddress(d.currency)||getAddress(await this.pool.service())!==getAddress(d.service)||BigInt(await this.pool.TIMEOUT())!==1200n||BigInt(await this.pool.RUN_CAP())!==15n*10n**18n||await this.pool.POLICY()!==id('journey-local-rewards-J13'))throw Error('Reward pool policy mismatch');
 }
 async reserve(runId:string,owner:string){
  if(!/^[a-f0-9]{32}$/.test(runId))throw Error('Exact proposed run required');
  await this.checked();owner=getAddress(owner);const destination=JSON.stringify(this.deployment);
  this.db.exec('BEGIN IMMEDIATE');try{
   const intent=this.db.prepare('SELECT * FROM journey_funded_intents WHERE run_id=?').get(runId);
   if(intent){if(intent.owner!==owner||intent.destination!==destination||['CLOSED','CANCELLED'].includes(String(intent.state)))throw Error('Reservation intent changed or already closed');}
   else{
    if(this.db.prepare('SELECT 1 FROM journey_runs WHERE id=?').get(runId)&&!this.db.prepare('SELECT 1 FROM journey_funded_runs WHERE run_id=?').get(runId))throw Error('Existing practice run cannot become funded');
    const other=this.db.prepare("SELECT run_id FROM journey_funded_runs WHERE lower(owner)=? AND state NOT IN ('CONFIRMED','TIMED_OUT') AND run_id<>?").get(owner.toLowerCase(),runId);if(other)throw Error('Recover existing funded reservation first');
    this.db.prepare("INSERT INTO journey_funded_intents VALUES(?,?,?,'PENDING')").run(runId,owner,destination);
   }
   this.db.exec('COMMIT');
  }catch(error){this.db.exec('ROLLBACK');throw error;}
  const key=journeyRewardRunId(runId);let record=await this.pool.runs(key);
  if(record.player==='0x0000000000000000000000000000000000000000'){
   if(this.db.prepare('SELECT 1 FROM journey_funded_runs WHERE run_id=?').get(runId)){this.orphan(runId,'Confirmed allocation disappeared before admission recovery','RESERVATION_ORPHANED');throw Error('Original allocation requires reconciliation; no new allocation will be opened');}
   const tx=await this.send('open:'+runId,this.pool.interface.encodeFunctionData('open',[key,getAddress(owner)]));return {state:'SUBMITTED' as const,transactionHash:tx.hash};
  }
  if(getAddress(record.player)!==getAddress(owner)||record.closed)throw Error('Reward run reservation unavailable');
  const head=BigInt(await this.provider.send('eth_blockNumber',[]));if(head<1n)throw Error('Reservation unconfirmed');record=await this.pool.runs(key,{blockTag:head-1n});
  if(getAddress(record.player)!==getAddress(owner)||record.closed)throw Error('Reservation needs two confirmations');
  const currentBlock=await this.provider.getBlock(head);if(!currentBlock||BigInt(record.deadline)<=BigInt(currentBlock.timestamp))throw Error('Funded reservation expired');
  const logs=await this.pool.queryFilter(this.pool.filters.Reserved(key),0,head-1n),event=logs.at(-1);if(!event)throw Error('Reservation event missing');
  this.db.prepare("UPDATE journey_funded_intents SET state='OPEN' WHERE run_id=?").run(runId);
  return {state:'CONFIRMED' as const,transactionHash:event.transactionHash,deadline:String(record.deadline)};
 }
 async poll(){
  if(this.busy||this.stopped)return;this.busy=true;
  try{await this.checked();const head=BigInt(await this.provider.send('eth_blockNumber',[])),block=await this.provider.getBlock(head);if(!block)return;
   // A soft confirmation is revisited. Never keep showing a historical payout
   // as confirmed after its canonical source event has disappeared.
   if(head>0n)for(const prior of this.db.prepare("SELECT * FROM journey_funded_runs WHERE state IN ('CONFIRMED','TIMED_OUT')").all()){
    const key=journeyRewardRunId(String(prior.run_id)),record=await this.pool.runs(key,{blockTag:head-1n}),outbox=this.db.prepare('SELECT payload,transaction_hash FROM journey_funded_outbox WHERE run_id=?').get(String(prior.run_id));
    const timedOut=prior.state==='TIMED_OUT',expected=outbox?JSON.parse(String(outbox.payload)):null;
    let valid=getAddress(record.player)===getAddress(String(prior.owner))&&Boolean(record.closed)&&(timedOut?String(record.resultHash)==='0x'+'0'.repeat(64):!!expected&&String(record.resultHash)===expected.resultHash&&String(record.paid)===expected.payout);
    if(valid){const events=await this.pool.queryFilter(timedOut?this.pool.filters.TimedOut(key):this.pool.filters.Settled(key),0,head-1n);valid=events.length>0&&(!outbox?.transaction_hash||events.some(event=>event.transactionHash===outbox.transaction_hash));}
    if(!valid)this.orphan(String(prior.run_id),'Previously confirmed terminal source is no longer canonical');
   }
   if(head>0n)for(const prior of this.db.prepare("SELECT * FROM journey_funded_runs WHERE state IN ('ORPHANED','RESERVATION_ORPHANED','RESERVATION_CHANGED')").all()){
    const runId=String(prior.run_id),key=journeyRewardRunId(runId),confirmed=await this.pool.runs(key,{blockTag:head-1n});
    if(getAddress(confirmed.player)==='0x0000000000000000000000000000000000000000'){
     if(prior.state!=='RESERVATION_ORPHANED')this.orphan(runId,'Original allocation is absent; no second allocation will be issued','RESERVATION_ORPHANED');continue;
    }
    if(getAddress(confirmed.player)!==getAddress(String(prior.owner))||String(confirmed.deadline)!==String(prior.deadline)){
     if(prior.state!=='RESERVATION_CHANGED')this.orphan(runId,'Original allocation recipient or deadline changed','RESERVATION_CHANGED');continue;
    }
    const reservations=await this.pool.queryFilter(this.pool.filters.Reserved(key),0,head-1n),reservation=reservations.at(-1);if(!reservation)continue;
    const outbox=this.db.prepare('SELECT payload FROM journey_funded_outbox WHERE run_id=?').get(runId),payload=outbox?JSON.parse(String(outbox.payload)):null;
    if(confirmed.closed&&String(confirmed.resultHash)!=='0x'+'0'.repeat(64)&&(!payload||String(confirmed.resultHash)!==payload.resultHash||String(confirmed.paid)!==payload.payout)){
     this.orphan(runId,'Canonical settlement differs from the durable terminal source','SETTLEMENT_MISMATCH');continue;
    }
    this.db.exec('BEGIN IMMEDIATE');try{
     const recoveredState=confirmed.closed?(String(confirmed.resultHash)==='0x'+'0'.repeat(64)?'TIMEOUT_SUBMITTED':'SUBMITTED'):payload?'SETTLEMENT_PENDING':'ACTIVE';
     this.db.prepare('UPDATE journey_funded_runs SET state=?,reservation_hash=? WHERE run_id=?').run(recoveredState,reservation.transactionHash,runId);
     if(outbox)this.db.prepare('UPDATE journey_funded_outbox SET state=? WHERE run_id=?').run(confirmed.closed?recoveredState:'QUEUED',runId);
     // RECOVERING does not acquire a new owner slot or open a new allocation.
     this.db.prepare("UPDATE journey_funded_intents SET state='RECOVERING' WHERE run_id=?").run(runId);
     this.db.prepare('INSERT INTO journey_funded_recovery_events(run_id,state,reason,transaction_hash,recorded_at) VALUES(?,?,?,?,?)').run(runId,'RECONCILED','Original confirmed allocation recovered; terminal operation retains its original source',reservation.transactionHash,new Date().toISOString());this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
   }
   // Intent precedes signing and broadcasting. A lost first HTTP reply or a
   // process exit cannot abandon an on-chain reservation outside the worker.
   for(const intent of this.db.prepare("SELECT * FROM journey_funded_intents WHERE state IN ('PENDING','OPEN')").all()){
    if(this.stopped)break;
    if(intent.destination!==JSON.stringify(this.deployment))continue;
    const runId=String(intent.run_id),key=journeyRewardRunId(runId),record=await this.pool.runs(key);
    if(getAddress(record.player)==='0x0000000000000000000000000000000000000000'){
     if(this.db.prepare('SELECT 1 FROM journey_funded_runs WHERE run_id=?').get(runId)){this.orphan(runId,'Confirmed allocation disappeared during intent recovery','RESERVATION_ORPHANED');continue;}
     // Exact previously signed bytes are retried, never a second allocation.
     try{await this.send('open:'+runId,this.pool.interface.encodeFunctionData('open',[key,String(intent.owner)]));}catch{/* Backing/transport failure leaves the durable intent pending. */}
     continue;
    }
    if(getAddress(record.player)!==getAddress(String(intent.owner)))throw Error('Reservation intent owner mismatch');
    if(head===0n)continue;
    const confirmed=await this.pool.runs(key,{blockTag:head-1n});if(getAddress(confirmed.player)!==getAddress(String(intent.owner)))continue;
    const events=await this.pool.queryFilter(this.pool.filters.Reserved(key),0,head-1n),event=events.at(-1);if(!event)continue;
    const attached=this.db.prepare('SELECT deadline,reservation_hash FROM journey_funded_runs WHERE run_id=?').get(runId);
    if(attached&&(attached.deadline!==String(confirmed.deadline)||attached.reservation_hash!==event.transactionHash)){this.orphan(runId,'Allocation confirmation changed during intent recovery');continue;}
    new JourneyFundedJournal(this.db).attach(runId,String(intent.owner),String(confirmed.deadline),event.transactionHash);
    this.db.prepare('UPDATE journey_funded_intents SET state=? WHERE run_id=?').run(confirmed.closed?'CLOSED':'OPEN',runId);
   }
   const rows=this.db.prepare("SELECT * FROM journey_funded_runs WHERE state IN ('ACTIVE','SETTLEMENT_PENDING','SUBMITTED','TIMEOUT_SUBMITTED')").all();
   for(const row of rows){if(this.stopped)break;const runId=String(row.run_id);try{const key=journeyRewardRunId(runId),chain=await this.pool.runs(key);
    if(getAddress(chain.player)!==getAddress(String(row.owner))){this.orphan(runId,'Active allocation authority changed');continue;}
    const outbox=this.db.prepare('SELECT * FROM journey_funded_outbox WHERE run_id=?').get(runId),payload=outbox?JSON.parse(String(outbox.payload)):null;
    if(chain.closed){
     const confirmed=head>0n?await this.pool.runs(key,{blockTag:head-1n}):null;if(!confirmed?.closed)continue;
     const timedOut=String(confirmed.resultHash)==='0x'+'0'.repeat(64);
     if(!timedOut&&(!payload||confirmed.resultHash!==payload.resultHash||String(confirmed.paid)!==payload.payout))throw Error('Funded settlement differs from durable outcome');
     const logs=await this.pool.queryFilter(timedOut?this.pool.filters.TimedOut(key):this.pool.filters.Settled(key),0,head-1n),event=logs.at(-1);if(!event)continue;
     this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('UPDATE journey_funded_runs SET state=? WHERE run_id=?').run(timedOut?'TIMED_OUT':'CONFIRMED',runId);if(outbox)this.db.prepare('UPDATE journey_funded_outbox SET state=?,transaction_hash=? WHERE run_id=?').run(timedOut?'TIMED_OUT':'CONFIRMED',event.transactionHash,runId);this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}continue;
    }
    if(BigInt(block.timestamp)>=BigInt(chain.deadline)){const tx=await this.send('timeout:'+runId,this.pool.interface.encodeFunctionData('timeout',[key]));this.db.exec('BEGIN IMMEDIATE');try{if(outbox)this.db.prepare("UPDATE journey_funded_outbox SET state='TIMEOUT_SUBMITTED',transaction_hash=? WHERE run_id=?").run(tx.hash,runId);this.db.prepare("UPDATE journey_funded_runs SET state='TIMEOUT_SUBMITTED' WHERE run_id=?").run(runId);this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}continue;}
    if(payload&&['QUEUED','BROADCASTING','SUBMITTED'].includes(String(outbox?.state))){
     this.db.prepare("UPDATE journey_funded_outbox SET state='BROADCASTING' WHERE run_id=? AND state='QUEUED'").run(runId);
     const tx=await this.send('settle:'+runId,this.pool.interface.encodeFunctionData('settle',[key,payload.bank,BigInt(payload.payout),payload.resultHash]));
     this.db.prepare("UPDATE journey_funded_outbox SET state='SUBMITTED',transaction_hash=? WHERE run_id=?").run(tx.hash,runId);this.db.prepare("UPDATE journey_funded_runs SET state='SUBMITTED' WHERE run_id=?").run(runId);
    }
   }catch{const latest=this.db.prepare('SELECT state FROM journey_funded_recovery_events WHERE run_id=? ORDER BY id DESC LIMIT 1').get(runId);if(latest?.state!=='WAITING')this.db.prepare('INSERT INTO journey_funded_recovery_events(run_id,state,reason,recorded_at) VALUES(?,?,?,?)').run(runId,'WAITING','Terminal operation unavailable; original bytes and independent timeout remain available',new Date().toISOString());}}
  }finally{this.busy=false;}
 }
 close(){this.stopped=true;}
}


