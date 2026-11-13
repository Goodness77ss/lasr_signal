import {JOURNEY_PROGRESS_RULES} from './journey-progress.ts';
import type {DatabaseSync} from 'node:sqlite';
import {id} from 'ethers';
import {SOLDIER_PROGRESS_POLICY,type SoldierProgressVoucher,journeyAssetKey} from '@last-signal/chain';
import type {JourneyDeploymentJournal} from './journey-deployments.ts';
export interface ProgressVoucherPort {
 inspect(assetKey:string,runId:string):Promise<{owner:string;nonce:string;cumulativeXp:string;furthestCheckpoint:string;hasCheckpoint:boolean;rulesHash:string;chainTime:string;leaseExpires:string}>;
 sign(assetKey:string,voucher:SoldierProgressVoucher):Promise<string>;
}
/** Durable bank sources only. Signing and chain confirmation are separate outbox phases. */
export class JourneyProgressOutbox {
 constructor(private db:DatabaseSync,private deployments:JourneyDeploymentJournal){db.exec(`CREATE TABLE IF NOT EXISTS journey_progress_outbox(source TEXT PRIMARY KEY,run_id TEXT NOT NULL,asset_key TEXT NOT NULL,owner TEXT NOT NULL,rules_hash TEXT NOT NULL,xp TEXT NOT NULL,checkpoint TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'QUEUED',voucher TEXT,signature TEXT,transaction_hash TEXT,UNIQUE(run_id,asset_key)); CREATE UNIQUE INDEX IF NOT EXISTS journey_progress_nonce ON journey_progress_outbox(asset_key,json_extract(voucher,'$.nonce')) WHERE voucher IS NOT NULL;`);}
 stage(runId:string){
  if(!this.db.isTransaction)throw Error('Bank writer transaction required');
  const row=this.db.prepare('SELECT snapshot FROM journey_runs WHERE id=?').get(runId);
  if(!row||JSON.parse(String(row.snapshot)).state!=='BANKED')throw Error('Durable bank required');
  for(const lease of this.deployments.forRun(runId)){
   if(lease.state!=='ACTIVE')continue;
   const key=journeyAssetKey(lease.asset),rows=this.db.prepare("SELECT xp,checkpoint,rules_hash,account_id,policy FROM journey_experience WHERE run_id=? AND identity_kind='soldier-token' AND identity_key=?").all(runId,key);
   if(!rows.length)continue;
   const hash=String(rows[0].rules_hash);
   if(hash!==JSON.parse(String(row.snapshot)).pin.hash||rows.some(row=>row.policy!==JOURNEY_PROGRESS_RULES.version||!Number.isSafeInteger(row.xp)||Number(row.xp)<1||Number(row.xp)>JOURNEY_PROGRESS_RULES.checkpointCap||!/^(0|[1-9][0-9]*)$/.test(String(row.checkpoint))||row.rules_hash!==hash||String(row.account_id).toLowerCase()!==('eip155:'+lease.asset.chainId+':'+lease.owner).toLowerCase()))throw Error('Bank participation identity mismatch');
   const xp=rows.reduce((sum,row)=>sum+BigInt(String(row.xp)),0n),checkpoint=rows.reduce((max,row)=>BigInt(String(row.checkpoint))>max?BigInt(String(row.checkpoint)):max,0n);
   const source=id('journey-bank-progress:'+runId+':'+key+':'+hash);
   const existing=this.db.prepare('SELECT xp,checkpoint,rules_hash,owner FROM journey_progress_outbox WHERE source=?').get(source);
   if(existing){if(existing.xp!==xp.toString()||existing.checkpoint!==checkpoint.toString()||existing.rules_hash!==hash||existing.owner!==lease.owner)throw Error('Bank progress source changed');continue;}
   this.db.prepare('INSERT INTO journey_progress_outbox(source,run_id,asset_key,owner,rules_hash,xp,checkpoint) VALUES(?,?,?,?,?,?,?)').run(source,runId,key,lease.owner,hash,xp.toString(),checkpoint.toString());
  }
 }
 async prepare(source:string,port:ProgressVoucherPort){
  let row=this.db.prepare('SELECT * FROM journey_progress_outbox WHERE source=?').get(source);if(!row)throw Error('Unknown bank progress source');
  if(!['QUEUED','PREPARED','SIGNED'].includes(String(row.state)))throw Error('Progress source not signable');
  const view=await port.inspect(String(row.asset_key),String(row.run_id));
  const uint=(text:string)=>/^(0|[1-9][0-9]*)$/.test(text);
  if(![view.nonce,view.cumulativeXp,view.furthestCheckpoint,view.chainTime,view.leaseExpires].every(uint)||view.owner.toLowerCase()!==String(row.owner).toLowerCase()||view.rulesHash.toLowerCase()!=='0x'+row.rules_hash||BigInt(view.leaseExpires)<=BigInt(view.chainTime))throw Error('Current progress authority required');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   row=this.db.prepare('SELECT * FROM journey_progress_outbox WHERE source=?').get(source)!;
   if(!row.voucher){
    const expiry=BigInt(view.chainTime)+3600n<BigInt(view.leaseExpires)?BigInt(view.chainTime)+3600n:BigInt(view.leaseExpires);
    const checkpoint=BigInt(String(row.checkpoint))>BigInt(view.furthestCheckpoint)?String(row.checkpoint):view.furthestCheckpoint;
    const voucher:SoldierProgressVoucher={tokenId:String(row.asset_key).split(':').at(-1)!,owner:String(row.owner),bankSource:source,rulesHash:view.rulesHash,policy:SOLDIER_PROGRESS_POLICY,nonce:view.nonce,cumulativeXp:String(BigInt(view.cumulativeXp)+BigInt(String(row.xp))),furthestCheckpoint:checkpoint,hasCheckpoint:true,expiry:String(expiry)};
    this.db.prepare("UPDATE journey_progress_outbox SET voucher=?,state='PREPARED' WHERE source=? AND state='QUEUED'").run(JSON.stringify(voucher),source);
   }
   this.db.exec('COMMIT');
  }catch(error){this.db.exec('ROLLBACK');throw error;}
  row=this.db.prepare('SELECT * FROM journey_progress_outbox WHERE source=?').get(source)!;
  const voucher=JSON.parse(String(row.voucher)) as SoldierProgressVoucher;
  if(voucher.nonce!==view.nonce||BigInt(voucher.expiry)<=BigInt(view.chainTime))throw Error('Reserved progress voucher is stale');
  if(row.signature)return {voucher,state:'SIGNED' as const};
  const signature=await port.sign(String(row.asset_key),structuredClone(voucher));
  if(!/^0x[0-9a-fA-F]{130}$/.test(signature))throw Error('Invalid progress signature');
  this.db.prepare("UPDATE journey_progress_outbox SET signature=?,state='SIGNED' WHERE source=? AND state='PREPARED' AND signature IS NULL").run(signature,source);
  return {voucher,state:'SIGNED' as const};
 }
 forRun(runId:string){return this.db.prepare('SELECT source,asset_key,owner,rules_hash,xp,checkpoint,state,transaction_hash FROM journey_progress_outbox WHERE run_id=?').all(runId);}
}


