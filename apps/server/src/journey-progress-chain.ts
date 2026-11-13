import type {DatabaseSync} from 'node:sqlite';
import {getAddress,type JsonRpcProvider,type Signer} from 'ethers';
import {journeyAssetKey,soldierProgressDomain,soldierProgressTypes,SOLDIER_PROGRESS_POLICY,type SoldierProgressVoucher} from '@last-signal/chain';
import {SoldierCollections} from './journey-soldiers.ts';
import {JourneyDeploymentJournal} from './journey-deployments.ts';
import type {ProgressVoucherPort} from './journey-progress-outbox.ts';
/** Protected local gameplay signer. Never exposed as an arbitrary signing endpoint. */
export class JourneyProgressChain implements ProgressVoucherPort {
 constructor(private db:DatabaseSync,private provider:JsonRpcProvider,private soldiers:SoldierCollections,private deployments:JourneyDeploymentJournal,private signer:Signer,private service:string){this.service=getAddress(service);db.exec('CREATE TABLE IF NOT EXISTS journey_progress_receipts(source TEXT PRIMARY KEY,transaction_hash TEXT NOT NULL,block_hash TEXT NOT NULL,log_index INTEGER NOT NULL,revision TEXT NOT NULL)');}
 private asset(key:string){const parts=key.split(':');if(parts.length!==4||parts[0]!=='eip155'||parts[1]!=='31337'||! /^(0|[1-9][0-9]*)$/.test(parts[3]))throw Error('Explicit local soldier identity required');const asset={kind:'soldier' as const,chainId:'31337',collection:getAddress(parts[2]),tokenId:parts[3]};if(journeyAssetKey(asset)!==key)throw Error('Canonical soldier key required');return asset;}
 async inspect(assetKey:string,runId:string){
  const asset=this.asset(assetKey),lease=this.deployments.forRun(runId).find(row=>row.key===assetKey&&row.state==='ACTIVE');
  if(!lease||lease.service!==this.service)throw Error('Current named service lease required');
  const evidence=await this.soldiers.verify(lease),head=BigInt(evidence.blockNumber),{contract}=await this.soldiers.checked(asset,head),at={blockTag:head};
  const p=await contract.progress(asset.tokenId,at),owner=getAddress(await contract.ownerOf(asset.tokenId,at));
  if(owner!==lease.owner||getAddress(await this.signer.getAddress())!==this.soldiers.deployment.gameplaySigner)throw Error('Progress signer or owner mismatch');
  return {owner,nonce:String(await contract.progressNonce(asset.tokenId,at)),cumulativeXp:String(p.cumulativeXp),furthestCheckpoint:String(p.furthestCheckpoint),hasCheckpoint:Boolean(p.hasCheckpoint),rulesHash:this.soldiers.deployment.rulesHash,chainTime:evidence.chainTimestamp,leaseExpires:evidence.expiresAt};
 }
 async confirm(source:string,transactionHash:string){
  if(!/^0x[0-9a-fA-F]{64}$/.test(transactionHash))throw Error('Exact progress transaction required');
  const row=this.db.prepare('SELECT * FROM journey_progress_outbox WHERE source=?').get(source);
  if(!row||!row.voucher||!row.signature)throw Error('Signed bank progress source required');
  const asset=this.asset(String(row.asset_key)),voucher=JSON.parse(String(row.voucher)) as SoldierProgressVoucher;
  if(BigInt(await this.provider.send('eth_chainId',[]))!==31337n)throw Error('Progress chain mismatch');
  const prior=this.db.prepare('SELECT * FROM journey_progress_receipts WHERE source=?').get(source),receipt=await this.provider.getTransactionReceipt(transactionHash);
  const block=receipt?await this.provider.getBlock(receipt.blockNumber):null;
  if(prior&&String(prior.transaction_hash).toLowerCase()===transactionHash.toLowerCase()&&(!receipt||block?.hash!==prior.block_hash||receipt.blockHash!==prior.block_hash)){
   this.db.prepare("UPDATE journey_progress_outbox SET state='ORPHANED' WHERE source=?").run(source);return {state:'ORPHANED' as const};
  }
  if(!receipt||receipt.status!==1||block?.hash!==receipt.blockHash)throw Error('Canonical accepted progress receipt required');
  const {contract}=await this.soldiers.checked(asset,BigInt(receipt.blockNumber));
  const matches=receipt.logs.filter(log=>getAddress(log.address)===asset.collection).filter(log=>{try{const event=contract.interface.parseLog(log);return event?.name==='ProgressAccepted'&&String(event.args.tokenId)===voucher.tokenId&&getAddress(event.args.owner)===getAddress(voucher.owner)&&event.args.bankSource===source&&String(event.args.cumulativeXp)===voucher.cumulativeXp&&String(event.args.furthestCheckpoint)===voucher.furthestCheckpoint&&Boolean(event.args.hasCheckpoint)===voucher.hasCheckpoint;}catch{return false;}});
  if(matches.length!==1)throw Error('Exact progress acceptance event required');
  const head=BigInt(await this.provider.send('eth_blockNumber',[]));
  if(head<BigInt(receipt.blockNumber)+1n){this.db.prepare("UPDATE journey_progress_outbox SET state='SUBMITTED',transaction_hash=? WHERE source=? AND state IN ('SIGNED','SUBMITTED')").run(receipt.hash,source);return {state:'SUBMITTED' as const};}
  const event=contract.interface.parseLog(matches[0])!;
  this.db.exec('BEGIN IMMEDIATE');
  try{
   this.db.prepare('INSERT INTO journey_progress_receipts VALUES(?,?,?,?,?) ON CONFLICT(source) DO UPDATE SET transaction_hash=excluded.transaction_hash,block_hash=excluded.block_hash,log_index=excluded.log_index,revision=excluded.revision').run(source,receipt.hash,receipt.blockHash,matches[0].index,String(event.args.revision));
   this.db.prepare("UPDATE journey_progress_outbox SET state='CONFIRMED',transaction_hash=? WHERE source=? AND voucher=?").run(receipt.hash,source,JSON.stringify(voucher));this.db.exec('COMMIT');
  }catch(error){this.db.exec('ROLLBACK');throw error;}
  return {state:'CONFIRMED' as const,revision:String(event.args.revision)};
 }
 async sign(assetKey:string,voucher:SoldierProgressVoucher){
  const asset=this.asset(assetKey),row=this.db.prepare("SELECT run_id,voucher FROM journey_progress_outbox WHERE source=? AND asset_key=? AND state='PREPARED'").get(voucher.bankSource,assetKey);
  if(!row||String(row.voucher)!==JSON.stringify(voucher))throw Error('Exact durable progress reservation required');
  const view=await this.inspect(assetKey,String(row.run_id));
  if(voucher.tokenId!==asset.tokenId||getAddress(voucher.owner)!==view.owner||voucher.nonce!==view.nonce||voucher.rulesHash.toLowerCase()!==view.rulesHash.toLowerCase()||voucher.policy!==SOLDIER_PROGRESS_POLICY||BigInt(voucher.expiry)<=BigInt(view.chainTime)||BigInt(voucher.expiry)>BigInt(view.leaseExpires))throw Error('Progress authority changed before signing');
  return this.signer.signTypedData(soldierProgressDomain(31337n,asset.collection),soldierProgressTypes,voucher);
 }
}

