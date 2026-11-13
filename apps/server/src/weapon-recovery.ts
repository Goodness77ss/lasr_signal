import type {DatabaseSync} from 'node:sqlite';
import {id,getAddress,keccak256,toUtf8Bytes,verifyTypedData,type Signer} from 'ethers';
import {weaponRecoveryPolicyHash,weaponBuildHash,weaponLootV2Types,weaponCollectionV2Domain,type WeaponLootClaimV2,type WeaponAsset} from '@last-signal/chain';
import {FUNDED_SURVIVAL_RULES} from '@last-signal/sim';
import {verifyLifecycle} from '../../../packages/sim/src/run-lifecycle.ts';
import {decodeResult,json} from './survival-settlements.ts';
import type {FundedSurvival} from './funded-survival.ts';
import type {WeaponCollections} from './weapon-collections.ts';

/** Reads only canonical server checkpoints. There is no client source or reward write API. */
export class WeaponRecovery {
 constructor(readonly db:DatabaseSync,readonly registry:WeaponCollections,private signer:Signer,readonly survival:FundedSurvival){
  db.exec('CREATE TABLE IF NOT EXISTS weapon_recovery_claims(source TEXT PRIMARY KEY,run TEXT NOT NULL,wallet TEXT NOT NULL,collection TEXT NOT NULL,proofHash TEXT NOT NULL,gameplayRules TEXT NOT NULL,payload TEXT NOT NULL,signature TEXT NOT NULL);');
 }
 private async extraction(run:string,wallet:string){
  wallet=getAddress(wallet);const state=this.survival.status(run,wallet);
  if(state.lifecycle.terminal?.outcome!=='EXTRACTED'||state.phase!=='ended'||state.settlement?.state!=='settled')throw Error('A confirmed extracted run is required for new collectible recovery');
  const job=this.survival.jobs.get(state.settlement.key);if(!job)throw Error('Canonical extraction record missing');this.survival.jobs.verify(job);
  const result=decodeResult(job.body),frozen=JSON.parse(job.checkpoint);
  if(result.outcome!==2||result.runId!==run||getAddress(result.player)!==wallet||frozen.id!==run||getAddress(frozen.player)!==wallet||frozen.rulesHash!==state.rulesHash||result.rulesHash!==frozen.rulesHash||result.resultHash!==keccak256(toUtf8Bytes(json({...frozen,job:null}))))throw Error('Extraction checkpoint does not match its confirmed result');
  const station=frozen.rewards.events.reduce((n:number,e:{amountWhole:number})=>n+e.amountWhole,0)-frozen.baseStation;
  verifyLifecycle(frozen.lifecycle,frozen.game,FUNDED_SURVIVAL_RULES,frozen.economy,station);
  await this.survival.transport.verify();const observation=await this.survival.transport.observe(result,this.survival.jobs.attempts(job.key));
  if(observation.finalized!==job.digest||!observation.matchingReceipt||observation.confirmations<2)throw Error('Extraction result is no longer canonically confirmed');
  return {result,frozen};
 }
 async history(asset:WeaponAsset){
  const {deployment,contract}=await this.registry.checked(asset),owner=String(await contract.ownerOf(asset.tokenId)),source=String(await contract.provenance(asset.tokenId));
  const base={asset,owner,source,mode:'VERIFIED_EXTRACTION_PROVENANCE',upgrades:'DEFERRED',entries:[] as {kind:string;run:string;gameplayRules:string;resultHash:string;source:string}[]};
  if(deployment.version!=='SURVIVAL_V2'||/^0x0{64}$/.test(source))return {...base,mode:'NO_LOCAL_EXTRACTION_PROOF'};
  const row=this.db.prepare('SELECT * FROM weapon_recovery_claims WHERE source=?').get(source);if(!row)return {...base,mode:'NO_LOCAL_EXTRACTION_PROOF'};
  const claim=JSON.parse(String(row.payload)) as WeaponLootClaimV2;
  if(getAddress(String(row.collection))!==deployment.collection||claim.dropId!==source||claim.runId!==row.run||getAddress(claim.recipient)!==getAddress(String(row.wallet))||claim.rulesHash!==deployment.rulesHash||claim.buildHash!==weaponBuildHash(Number(await contract.gunKind(asset.tokenId)))||getAddress(verifyTypedData(weaponCollectionV2Domain(BigInt(deployment.chainId),deployment.collection),weaponLootV2Types,claim,String(row.signature)))!==deployment.gameplaySigner)throw Error('Service record proof mismatch');
  const {result,frozen}=await this.extraction(String(row.run),String(row.wallet));
  if(row.proofHash!==result.resultHash||row.gameplayRules!==frozen.rulesHash||!frozen.lifecycle.loot.some((loot:{id:number;weapon:string;status:string})=>loot.status==='EXTRACTED'&&id(['LAST_SIGNAL_EXTRACTED_WEAPON_V2',this.survival.transport.chain,this.survival.transport.vault.toLowerCase(),String(row.run),result.segment,loot.id].join(':'))===source))throw Error('Service record extraction mismatch');
  return {...base,entries:[{kind:'RECOVERED_FROM_CONFIRMED_EXTRACTION',run:String(row.run),gameplayRules:String(row.gameplayRules),resultHash:result.resultHash,source}]};
 }
 async claims(run:string,wallet:string){
  wallet=getAddress(wallet);const {result,frozen}=await this.extraction(run,wallet);
  const deployment=this.registry.deployments.find(d=>d.version==='SURVIVAL_V2');
  if(!deployment||deployment.rulesHash!==weaponRecoveryPolicyHash||BigInt(deployment.chainId)!==this.survival.transport.chain||getAddress(deployment.currency)!==getAddress(result.currency)||getAddress(deployment.gameplaySigner)!==getAddress(await this.signer.getAddress()))throw Error('Matching V2 extraction collection unavailable');
  const {contract}=await this.registry.checked({collection:deployment.collection,tokenId:'1'}),block=await this.registry.provider.getBlock('latest');if(!block)throw Error('Chain time unavailable');
  const rewards:{collection:string;claim:WeaponLootClaimV2;signature:string}[]=[];
  for(const loot of frozen.lifecycle.loot){
   if(loot.status!=='EXTRACTED')throw Error('Unextracted items cannot become collectibles');
   const weapon=String(loot.weapon),kind=weapon==='rifle'?0:weapon==='carbine'?1:weapon==='shotgun'?2:-1;if(kind<0)throw Error('Unsupported extracted weapon class');
   const source=id(['LAST_SIGNAL_EXTRACTED_WEAPON_V2',this.survival.transport.chain,this.survival.transport.vault.toLowerCase(),run,result.segment,loot.id].join(':'));
   if(await contract.claimed(source))continue;
   const old=this.db.prepare('SELECT * FROM weapon_recovery_claims WHERE source=?').get(source);
   if(old&&(getAddress(String(old.wallet))!==wallet||getAddress(String(old.collection))!==deployment.collection||old.proofHash!==result.resultHash||old.gameplayRules!==frozen.rulesHash))throw Error('Recovery destination or proof is already pinned');
   let claim:WeaponLootClaimV2,signature:string;
   if(old&&BigInt(JSON.parse(String(old.payload)).expiry)>BigInt(block.timestamp)){claim=JSON.parse(String(old.payload));signature=String(old.signature);}
   else{
    claim={dropId:source,runId:run,recipient:wallet,kind,rulesHash:weaponRecoveryPolicyHash,buildHash:weaponBuildHash(kind),expiry:String(block.timestamp+3600)};
    signature=await this.signer.signTypedData(weaponCollectionV2Domain(this.survival.transport.chain,deployment.collection),weaponLootV2Types,claim);
    this.db.prepare("INSERT INTO weapon_recovery_claims VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(source) DO UPDATE SET payload=excluded.payload,signature=excluded.signature WHERE CAST(json_extract(weapon_recovery_claims.payload,'$.expiry') AS INTEGER)<=?").run(source,run,wallet,deployment.collection,result.resultHash,frozen.rulesHash,json(claim),signature,block.timestamp);
    const saved=this.db.prepare('SELECT payload,signature FROM weapon_recovery_claims WHERE source=?').get(source)!;claim=JSON.parse(String(saved.payload));signature=String(saved.signature);
   }
   if(claim.dropId!==source||claim.runId!==run||getAddress(claim.recipient)!==wallet||claim.kind!==kind||claim.rulesHash!==weaponRecoveryPolicyHash||claim.buildHash!==weaponBuildHash(kind)||getAddress(verifyTypedData(weaponCollectionV2Domain(this.survival.transport.chain,deployment.collection),weaponLootV2Types,claim,signature))!==getAddress(deployment.gameplaySigner))throw Error('Corrupt recovery authorization');
   rewards.push({collection:deployment.collection,claim,signature});
  }
  return {collection:deployment.collection,claimRoute:'SURVIVAL_V2',rewards,gameplayRules:frozen.rulesHash,extractionResultHash:result.resultHash,trust:'Server attested extraction. Two L2 confirmations are not Ethereum finality; an already issued unexpired authorization cannot be revoked by a later reorganization.'};
 }
}
