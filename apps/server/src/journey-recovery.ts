import type {DatabaseSync} from 'node:sqlite';
import {getAddress,id,type Signer,verifyTypedData} from 'ethers';
import {journeyGunBuild,journeyGunClaimTypes,journeyGunDomain,type JourneyGunClaim} from '@last-signal/chain';
import type {JourneyRun} from '../../../packages/sim/src/journey/encounter.ts';
import type {JourneyGunCollections} from './journey-guns.ts';

/** Recovery sources are global across destination deployments. A signed source
 * never acquires a second destination when the registry changes. */
export class JourneyRecoveryJournal {
 constructor(private db:DatabaseSync){db.exec(`CREATE TABLE IF NOT EXISTS journey_weapon_recovery(source TEXT PRIMARY KEY,run_id TEXT NOT NULL,owner TEXT NOT NULL,simulation_rules TEXT NOT NULL,pickup_id TEXT NOT NULL,kind INTEGER NOT NULL,build_hash TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'BANKED',destination TEXT,voucher TEXT,signature TEXT,transaction_hash TEXT,UNIQUE(run_id,pickup_id));CREATE TABLE IF NOT EXISTS journey_weapon_recovery_history(source TEXT NOT NULL,voucher TEXT NOT NULL,signature TEXT,PRIMARY KEY(source,voucher));`);}
 stage(runId:string,run:JourneyRun){
  if(!this.db.isTransaction)throw Error('Recovery requires the bank writer transaction');
  if(run.state!=='BANKED'||!run.checkpointComplete||!run.encounter?.opened||!run.rewards||run.rewards.checkpointEarned<10)return;
  const owner=run.ownedOwner??run.equipment?.owner;if(!owner)return;
  const stored=this.db.prepare('SELECT snapshot FROM journey_runs WHERE id=?').get(runId);
  if(!stored||String(stored.snapshot)!==JSON.stringify(run))throw Error('Recovery requires committed bank snapshot');
  for(const drop of run.rewards.drops){
   if(drop.state!=='BANKED'||!run.pin.rules.battlefieldRecovery||!drop.weapon)continue;
   // This represents newly recovered battlefield material, never a token ID
   // from an enemy avatar or another player's collection.
   const source=id('LAST_SIGNAL_JOURNEY_RECOVERY:'+runId+':'+drop.id),kind=drop.weapon.kind,build=journeyGunBuild(kind);
   if(build.build.id!==drop.weapon.buildId)throw Error('Unsupported recovered weapon build');
   const prior=this.db.prepare('SELECT * FROM journey_weapon_recovery WHERE source=?').get(source);
   if(prior){if(prior.owner!==getAddress(owner)||prior.build_hash!==build.hash||prior.simulation_rules!==run.pin.hash)throw Error('Recovery source changed');continue;}
   this.db.prepare('INSERT INTO journey_weapon_recovery(source,run_id,owner,simulation_rules,pickup_id,kind,build_hash) VALUES(?,?,?,?,?,?,?)').run(source,runId,getAddress(owner),run.pin.hash,drop.id,kind,build.hash);
  }
 }
 list(owner:string){return this.db.prepare('SELECT source,run_id,pickup_id,kind,build_hash,state,destination,transaction_hash FROM journey_weapon_recovery WHERE owner=? ORDER BY rowid DESC LIMIT 100').all(getAddress(owner));}
 async prepare(source:string,owner:string,adapter:JourneyGunCollections,signer:Signer){
  let row=this.db.prepare('SELECT * FROM journey_weapon_recovery WHERE source=? AND owner=?').get(source,getAddress(owner));if(!row)throw Error('Recovery owner denied');
  if(!['BANKED','PREPARED','SIGNED','ORPHANED'].includes(String(row.state)))throw Error('Recovery already confirmed');
  const d=adapter.deployment,destination=JSON.stringify({chainId:31337,collection:d.collection,codeHash:d.codeHash});
  if(row.destination&&row.destination!==destination)throw Error('Recovery destination is pinned to its original deployment');
  const {contract,blockTag}=await adapter.checked({kind:'gun',chainId:'31337',collection:d.collection,tokenId:'1'});
  if(getAddress(await signer.getAddress())!==d.gameplaySigner)throw Error('Recovery signer mismatch');
  if(await contract.claimed(source))throw Error('Source already claimed; recover its receipt');
  const block=await contract.runner!.provider!.getBlock(blockTag);if(!block)throw Error('Chain time unavailable');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   row=this.db.prepare('SELECT * FROM journey_weapon_recovery WHERE source=?').get(source)!;
   if(row.destination&&row.destination!==destination)throw Error('Recovery destination changed');
   if(row.voucher&&BigInt((JSON.parse(String(row.voucher)) as JourneyGunClaim).expiry)<=BigInt(block.timestamp)){
    // Expired authority can only renew the same source into the same pinned
    // contract. On-chain claimed[source] remains the final deduplication gate.
    const previous=JSON.parse(String(row.voucher)) as JourneyGunClaim;
    if(previous.dropId!==source||getAddress(previous.recipient)!==getAddress(owner)||previous.kind!==Number(row.kind)||previous.buildHash!==row.build_hash||previous.rulesHash!==d.rulesHash)throw Error('Expired recovery identity changed');
    this.db.prepare('INSERT OR IGNORE INTO journey_weapon_recovery_history VALUES(?,?,?)').run(source,String(row.voucher),row.signature??null);
    this.db.prepare("UPDATE journey_weapon_recovery SET voucher=?,signature=NULL,state='PREPARED' WHERE source=?").run(JSON.stringify({...previous,expiry:String(block.timestamp+3600)}),source);
    row=this.db.prepare('SELECT * FROM journey_weapon_recovery WHERE source=?').get(source)!;
   }
   if(!row.voucher){const voucher:JourneyGunClaim={dropId:source,runId:id('LAST_SIGNAL_JOURNEY_RECOVERY_RUN:'+row.run_id),recipient:String(row.owner),kind:Number(row.kind),rulesHash:d.rulesHash,buildHash:String(row.build_hash),expiry:String(block.timestamp+3600)};this.db.prepare("UPDATE journey_weapon_recovery SET destination=?,voucher=?,state='PREPARED' WHERE source=? AND voucher IS NULL").run(destination,JSON.stringify(voucher),source);}
   this.db.exec('COMMIT');
  }catch(error){this.db.exec('ROLLBACK');throw error;}
  row=this.db.prepare('SELECT * FROM journey_weapon_recovery WHERE source=?').get(source)!;
  const voucher=JSON.parse(String(row.voucher)) as JourneyGunClaim;
  if(BigInt(voucher.expiry)<=BigInt(block.timestamp))throw Error('Recovery voucher expired; original source and destination remain reserved');
  const signature=row.signature?String(row.signature):await signer.signTypedData(journeyGunDomain(31337n,d.collection),journeyGunClaimTypes,voucher);
  if(getAddress(verifyTypedData(journeyGunDomain(31337n,d.collection),journeyGunClaimTypes,voucher,signature))!==d.gameplaySigner)throw Error('Recovery signature mismatch');
  this.db.prepare("UPDATE journey_weapon_recovery SET signature=?,state='SIGNED' WHERE source=? AND voucher=? AND signature IS NULL").run(signature,source,JSON.stringify(voucher));
  const issued=this.db.prepare('SELECT voucher,signature FROM journey_weapon_recovery WHERE source=?').get(source)!;
  if(issued.voucher!==JSON.stringify(voucher)||!issued.signature)throw Error('Recovery changed while signing; review it again');
  return {source,chainId:31337,collection:d.collection,codeHash:d.codeHash,gameplaySigner:d.gameplaySigner,voucher,signature:String(issued.signature)};
 }
 async confirm(source:string,owner:string,transactionHash:string,adapter:JourneyGunCollections){
  if(!/^0x[0-9a-fA-F]{64}$/.test(transactionHash))throw Error('Exact recovery transaction required');
  const row=this.db.prepare('SELECT * FROM journey_weapon_recovery WHERE source=? AND owner=?').get(source,getAddress(owner));if(!row?.voucher||!row.destination)throw Error('Issued recovery required');
  const d=adapter.deployment;if(row.destination!==JSON.stringify({chainId:31337,collection:d.collection,codeHash:d.codeHash}))throw Error('Use the pinned recovery deployment');
  const {contract,blockTag}=await adapter.checked({kind:'gun',chainId:'31337',collection:d.collection,tokenId:'1'}),provider=contract.runner!.provider!,receipt=await provider.getTransactionReceipt(transactionHash);
  if(!receipt){if(row.transaction_hash===transactionHash)this.db.prepare("UPDATE journey_weapon_recovery SET state='ORPHANED' WHERE source=?").run(source);return {state:'PENDING'};}
  const block=await provider.getBlock(receipt.blockNumber);if(!block||block.hash!==receipt.blockHash){this.db.prepare("UPDATE journey_weapon_recovery SET state='ORPHANED' WHERE source=?").run(source);return {state:'ORPHANED'};}
  if(receipt.status!==1||receipt.to?.toLowerCase()!==d.collection.toLowerCase())throw Error('Recovery transaction failed or wrong destination');
  const claim=JSON.parse(String(row.voucher)) as JourneyGunClaim;
  const event=receipt.logs.filter(log=>log.address.toLowerCase()===d.collection.toLowerCase()).map(log=>{try{return contract.interface.parseLog(log);}catch{return null;}}).find(log=>log?.name==='GunClaimed'&&log.args.dropId===source);
  if(!event||getAddress(event.args.recipient)!==getAddress(owner)||event.args.runId!==claim.runId||Number(event.args.kind)!==claim.kind||event.args.buildHash!==claim.buildHash)throw Error('Recovery receipt does not match issued source');
  if(blockTag<BigInt(receipt.blockNumber)+1n)return {state:'PENDING',transactionHash};
  if(!await contract.claimed(source,{blockTag:blockTag-1n}))throw Error('Recovery source not confirmed');
  this.db.prepare("UPDATE journey_weapon_recovery SET state='CONFIRMED',transaction_hash=? WHERE source=?").run(transactionHash,source);
  return {state:'CONFIRMED',transactionHash,tokenId:String(event.args.tokenId)};
 }
}
