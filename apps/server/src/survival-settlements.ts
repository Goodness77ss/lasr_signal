import {randomUUID,createHash} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {TypedDataEncoder,verifyTypedData,type Signer,ZeroHash} from 'ethers';
import {survivalResultTypes,survivalVaultDomain,type SurvivalResult} from '@last-signal/chain';

export const json=(value:unknown)=>JSON.stringify(value,(_k,v)=>typeof v==='bigint'?v.toString():v);
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const bigFields=['segment','sequence','deposit','stationEarned','bonusEarned','spent','failedStake','expiry','nextStationReserve','nextBonusReserve'] as const;
export function decodeResult(body:string):SurvivalResult{const r=JSON.parse(body) as SurvivalResult;for(const k of bigFields)r[k]=BigInt(r[k]);return r;}
export type SettlementState='prepared'|'signed'|'submitted'|'confirming'|'settled'|'retrying'|'recovery required';
export type SettlementJob={key:string;chain:string;vault:string;body:string;checkpoint:string;checksum:string;digest:string;signature:string|null;state:SettlementState;reason:string;updated:number};
export type SettlementAttempt={job:string;hash:string;raw:string;nonce:number;price:string;gas:string;at:number};

/** Private durable journal. Authorization and raw transactions must never enter public status or evidence. */
export class SurvivalSettlements{
 constructor(readonly db:DatabaseSync,readonly now:()=>number=Date.now){
  db.exec(`CREATE TABLE IF NOT EXISTS survival_settlements(key TEXT PRIMARY KEY,chain TEXT NOT NULL,vault TEXT NOT NULL,body TEXT NOT NULL,checkpoint TEXT NOT NULL,checksum TEXT NOT NULL,digest TEXT NOT NULL,signature TEXT,state TEXT NOT NULL,reason TEXT NOT NULL,updated INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS survival_settlement_attempts(job TEXT NOT NULL,hash TEXT PRIMARY KEY,raw TEXT NOT NULL,nonce INTEGER NOT NULL,price TEXT NOT NULL,gas TEXT NOT NULL,at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS survival_worker_leases(id TEXT PRIMARY KEY,owner TEXT NOT NULL,until INTEGER NOT NULL);`);
 }
 prepare(chain:bigint,vault:string,result:SurvivalResult,checkpoint:unknown){
  const body=json(result),snapshot=json(checkpoint),digest=TypedDataEncoder.hash(survivalVaultDomain(chain,vault),survivalResultTypes,result);
  const key=[chain,vault.toLowerCase(),result.runId.toLowerCase(),result.segment,result.sequence].join(':');
  const old=this.get(key);if(old){if(old.body!==body||old.checkpoint!==snapshot)throw Error('Canonical settlement is immutable');return key;}
  if(Number(this.db.prepare("SELECT count(*) AS n FROM survival_settlements WHERE state!='settled'").get()!.n)>=1024)throw Error('Settlement queue full');
  this.db.prepare('INSERT INTO survival_settlements VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(key,String(chain),vault.toLowerCase(),body,snapshot,hash(body+'\n'+snapshot),digest,null,'prepared','Canonical checkpoint committed',this.now());return key;
 }
 get(key:string){return this.db.prepare('SELECT * FROM survival_settlements WHERE key=?').get(key) as SettlementJob|undefined;}
 pending(){return this.db.prepare("SELECT * FROM survival_settlements WHERE state!='settled' ORDER BY updated,key").all() as SettlementJob[];}
 settledAfter(row:number){return this.db.prepare("SELECT rowid AS cursor,* FROM survival_settlements WHERE state='settled' AND rowid>? ORDER BY rowid LIMIT 8").all(row) as (SettlementJob&{cursor:number})[];}
 runNeedsRecovery(runId:string){return !!this.db.prepare("SELECT 1 FROM survival_settlements WHERE state='recovery required' AND json_extract(body,'$.runId')=? LIMIT 1").get(runId);}
 verify(j:SettlementJob){if(hash(j.body+'\n'+j.checkpoint)!==j.checksum||TypedDataEncoder.hash(survivalVaultDomain(BigInt(j.chain),j.vault),survivalResultTypes,decodeResult(j.body))!==j.digest)throw Error('Corrupt canonical settlement');}
 state(key:string,state:SettlementState,reason:string){this.db.prepare('UPDATE survival_settlements SET state=?,reason=?,updated=? WHERE key=?').run(state,reason,this.now(),key);}
 authorize(key:string,signature:string){this.db.prepare("UPDATE survival_settlements SET signature=?,state='signed',reason='Canonical authorization stored',updated=? WHERE key=? AND signature IS NULL").run(signature,this.now(),key);}
 attempts(key:string){return this.db.prepare('SELECT * FROM survival_settlement_attempts WHERE job=? ORDER BY at,rowid').all(key) as SettlementAttempt[];}
 attempt(a:SettlementAttempt){this.db.prepare('INSERT INTO survival_settlement_attempts VALUES(?,?,?,?,?,?,?)').run(a.job,a.hash,a.raw,a.nonce,a.price,a.gas,a.at);this.state(a.job,'submitted','Transaction journaled before broadcast');}
 status(key:string){const j=this.get(key);return j?{key:j.key,state:j.state,reason:j.reason,digest:j.digest,hashes:this.attempts(key).map(a=>a.hash),updated:j.updated}:null;}
 acquire(id:string,owner:string){const now=this.now();this.db.prepare('INSERT INTO survival_worker_leases VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,until=excluded.until WHERE survival_worker_leases.until<=?').run(id,owner,now+60000,now);return this.owns(id,owner);}
 owns(id:string,owner:string){const r=this.db.prepare('SELECT owner,until FROM survival_worker_leases WHERE id=?').get(id);return r?.owner===owner&&Number(r.until)>this.now();}
 release(id:string,owner:string){this.db.prepare('DELETE FROM survival_worker_leases WHERE id=? AND owner=?').run(id,owner);}
}

export type WorkerObservation={chainNow:bigint;deadline:bigint;finalized:string;active:boolean;segment:bigint;sequence:bigint;deposit:bigint;confirmations:number;matchingReceipt:boolean;searchingReceipt?:boolean};
export type WorkerReceipt={status:number;confirmations:number;canonical:boolean};
export interface SettlementTransport{
 chain:bigint;vault:string;signer:string;gasAddress:string;
 verify():Promise<void>;
 observe(result:SurvivalResult,attempts:SettlementAttempt[]):Promise<WorkerObservation>;
 receipt(hash:string):Promise<WorkerReceipt|null>;
 gas():Promise<{balance:bigint;price:bigint;nonce:number}>;
 estimate(result:SurvivalResult,signature:string):Promise<bigint>;
 sign(result:SurvivalResult,signature:string,nonce:number,price:bigint,gas:bigint):Promise<{raw:string;hash:string}>;
 validateAttempt(result:SurvivalResult,signature:string,attempt:SettlementAttempt):void;
 broadcast(raw:string):Promise<void>;
}
export class SurvivalSettlementWorker{
 private busy=false;
 private lastHealthy=0;
 private lastReason='Worker has not checked its chain';
 private auditCursor=0;
 private nextAuditAt=0;
 readonly id=randomUUID();
 constructor(readonly jobs:SurvivalSettlements,readonly transport:SettlementTransport,private gameplay:Signer,readonly confirmations=2,private replacementMs=30000,private gasReserve=0n,private auditIntervalMs=0){if(!Number.isSafeInteger(confirmations)||confirmations<1)throw Error('Confirmation policy required');if(!Number.isSafeInteger(auditIntervalMs)||auditIntervalMs<0||auditIntervalMs>30000)throw Error('Completed audit interval must be at most thirty seconds');}
 health(){return {fundedEntry:this.lastHealthy>0&&this.jobs.now()-this.lastHealthy<15000&&this.lastReason==='ok',reason:this.lastReason,checkedAt:this.lastHealthy};}
 private unhealthy(reason:string){this.lastReason=reason;}
 async poll(){
  if(this.busy)return false;this.busy=true;
  const lease=this.transport.chain+':'+this.transport.gasAddress.toLowerCase();
  if(!this.jobs.acquire(lease,this.id)){this.busy=false;return false;}
  try{
   await this.transport.verify();
   if((await this.gameplay.getAddress()).toLowerCase()!==this.transport.signer.toLowerCase()||this.transport.gasAddress.toLowerCase()===this.transport.signer.toLowerCase())throw Error('Role mismatch');
   const gas=await this.transport.gas();
   if(gas.balance<2000000n*gas.price+this.gasReserve){this.unhealthy('Insufficient test gas');}else{this.lastHealthy=this.jobs.now();this.lastReason='ok';}
   if(this.jobs.now()>=this.nextAuditAt){
   const audit=this.jobs.settledAfter(this.auditCursor);let auditComplete=true;
   for(const j of audit){
    if(!this.jobs.owns(lease,this.id)){auditComplete=false;break;}
    this.jobs.verify(j);
    const o=await this.transport.observe(decodeResult(j.body),this.jobs.attempts(j.key));
    if(o.finalized===j.digest&&o.searchingReceipt){this.unhealthy('Rechecking prior receipt confirmation');auditComplete=false;break;}
    this.auditCursor=j.cursor;
    if(o.finalized!==j.digest||!o.matchingReceipt||o.confirmations<this.confirmations){this.jobs.state(j.key,'recovery required','Previously confirmed result lost canonical confirmation; operator reconciliation required');this.unhealthy('Chain reorganization requires recovery');}
   }
   // Finish a bounded sweep before delaying the next one. Pending jobs still run every poll.
   if(auditComplete&&audit.length<8){this.auditCursor=0;this.nextAuditAt=this.jobs.now()+this.auditIntervalMs;}
   }
   for(const initial of this.jobs.pending()){
    if(!this.jobs.owns(lease,this.id))break;
    try{await this.process(initial,lease);}catch{this.unhealthy('RPC or submission failure');this.jobs.state(initial.key,'retrying','RPC or submission failure; canonical job retained');}
   }
   return true;
  }catch{this.unhealthy('RPC or chain identity failure');for(const j of this.jobs.pending())if(j.state!=='recovery required')this.jobs.state(j.key,'retrying','RPC or chain identity failure; canonical job retained');return false;}
  finally{this.jobs.release(lease,this.id);this.busy=false;}
 }
 private async process(j:SettlementJob,lease:string){
  if(j.state==='recovery required'){this.unhealthy(j.reason);return;}
  try{this.jobs.verify(j);}catch{this.jobs.state(j.key,'recovery required','Corrupt canonical checkpoint; no authorization issued');this.unhealthy('Corrupt canonical checkpoint');return;}
  if(j.chain!==String(this.transport.chain)||j.vault!==this.transport.vault.toLowerCase()){this.jobs.state(j.key,'recovery required','Job domain mismatch');this.unhealthy('Job domain mismatch');return;}
  const r=decodeResult(j.body),attempts=this.jobs.attempts(j.key),o=await this.transport.observe(r,attempts);
  if(o.finalized!==ZeroHash){
   if(o.finalized!==j.digest){this.jobs.state(j.key,'recovery required','Different finalization or timeout; reconcile player recovery');this.unhealthy('Finalization requires recovery');return;}
   const confirmed=o.confirmations>=this.confirmations&&o.matchingReceipt;
   this.jobs.state(j.key,confirmed?'settled':'confirming',confirmed?'Canonical finalization confirmed':'Finalization observed; awaiting canonical receipt confirmations');if(!confirmed)this.unhealthy('Finalization awaiting canonical confirmations');return;
  }
  if(o.chainNow>=r.expiry||o.chainNow>=o.deadline){this.jobs.state(j.key,'recovery required','Authorization expired; full deposit timeout recovery remains independent');this.unhealthy('Settlement requires timeout recovery');return;}
  if(!o.active||o.segment!==r.segment||o.sequence!==r.sequence||o.deposit<r.deposit){this.jobs.state(j.key,'recovery required','Onchain allocation differs from canonical checkpoint');this.unhealthy('Allocation mismatch');return;}
  // A finalized receipt that disappears is never retained as success. Reconcile and rebroadcast the same job.
  for(const a of attempts){const receipt=await this.transport.receipt(a.hash);if(receipt&&receipt.canonical&&receipt.status===0){this.jobs.state(j.key,'recovery required','Transaction reverted; no claim reported');this.unhealthy('Settlement reverted');return;}if(receipt&&receipt.canonical&&receipt.status===1){this.jobs.state(j.key,'confirming','Receipt found; awaiting matching contract finalization');return;}}
  let signature=j.signature;
  if(!signature){signature=await this.gameplay.signTypedData(survivalVaultDomain(BigInt(j.chain),j.vault),survivalResultTypes,r);if(!this.jobs.owns(lease,this.id))return;this.jobs.authorize(j.key,signature);}
  if(verifyTypedData(survivalVaultDomain(BigInt(j.chain),j.vault),survivalResultTypes,r,signature).toLowerCase()!==this.transport.signer.toLowerCase()){this.jobs.state(j.key,'recovery required','Stored authorization invalid');this.unhealthy('Authorization invalid');return;}
  const last=attempts.at(-1),g=await this.transport.gas();
  const limit=last?BigInt(last.gas):(await this.transport.estimate(r,signature))*120n/100n;
  const price=last&&this.jobs.now()-last.at>=this.replacementMs?max(g.price,BigInt(last.price)*1125n/1000n+1n):last?BigInt(last.price):g.price;
  if(g.balance<limit*price+this.gasReserve){this.jobs.state(j.key,'retrying','Insufficient test gas; new funded entry disabled');this.unhealthy('Insufficient test gas');return;}
  if(last&&g.nonce>last.nonce){this.jobs.state(j.key,'recovery required','Gas nonce consumed without canonical settlement; reconcile before retry');this.unhealthy('Unknown gas nonce consumption');return;}
  let a=last;
  if(!a||price!==BigInt(a.price)){
   const nonce=a?.nonce??g.nonce;
   // Only one unresolved nonce is allowed per gas wallet. A later job cannot replace an earlier job.
   const unresolved=this.jobs.pending().some(other=>other.key!==j.key&&this.jobs.attempts(other.key).some(t=>t.nonce===nonce));
   if(unresolved){this.jobs.state(j.key,'retrying','Waiting for earlier gas nonce');return;}
   const signed=await this.transport.sign(r,signature,nonce,price,limit);
   if(!this.jobs.owns(lease,this.id))return;
   a={job:j.key,...signed,nonce,price:String(price),gas:String(limit),at:this.jobs.now()};this.jobs.attempt(a);
  }
  // Persisted hash and bytes precede network I/O. A crash here only causes identical rebroadcast.
  if(!this.jobs.owns(lease,this.id))return;
  try{this.transport.validateAttempt(r,signature,a);}catch{this.jobs.state(j.key,'recovery required','Corrupt transaction journal; broadcast refused');this.unhealthy('Corrupt transaction journal');return;}
  await this.transport.broadcast(a.raw);this.jobs.state(j.key,'submitted','Transaction broadcast; awaiting canonical confirmation');
 }
}
const max=(a:bigint,b:bigint)=>a>b?a:b;
