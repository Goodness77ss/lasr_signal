import {getAddress} from 'ethers';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {weaponAsset,weaponClass,weaponBuildHash,weaponRecoveryPolicyHash,type WeaponAsset} from '@last-signal/chain';
import type {ArmoryService} from './armory.ts';
import {WeaponCollections,type WeaponCollectionDeployment} from './weapon-collections.ts';
import {WeaponRecovery} from './weapon-recovery.ts';
import type {FundedSurvival} from './funded-survival.ts';
import {JourneyAssetCatalog} from './journey-assets.ts';
import type {SoldierCollections} from './journey-soldiers.ts';
import type {JourneyGunCollections} from './journey-guns.ts';

const checksum=(value:string)=>createHash('sha256').update(value).digest('hex');
export class WeaponCatalog {
 private soldiers:SoldierCollections|undefined;
 private journeyGuns:JourneyGunCollections|undefined;
 bindJourneyGuns(guns:JourneyGunCollections){this.journeyGuns=guns;}
 bindJourneySoldiers(soldiers:SoldierCollections){this.soldiers=soldiers;}
 inspectJourneyAsset(value:unknown){return new JourneyAssetCatalog(this.registry,[],this.soldiers,this.journeyGuns).inspect(value);}
 quoteJourneyAsset(value:unknown){return new JourneyAssetCatalog(this.registry,[],this.soldiers,this.journeyGuns).quote(value);}
 readonly registry:WeaponCollections|null;
 readonly v2Status:'ENABLED'|'DISABLED'|'UNAVAILABLE';
 private recoveries:WeaponRecovery|null=null;
 constructor(readonly armory:ArmoryService,v2?:WeaponCollectionDeployment){
  armory.testnet.rooms.db.exec('CREATE TABLE IF NOT EXISTS weapon_loadouts(wallet TEXT PRIMARY KEY,payload TEXT NOT NULL,digest TEXT NOT NULL);');
  const o=armory.options;
  if(!o){this.registry=null;this.v2Status='UNAVAILABLE';return;}
  const legacy:WeaponCollectionDeployment={collection:o.deployment.armory,version:'LEGACY_V1',chainId:o.deployment.chainId,currency:o.deployment.token,gameplaySigner:o.deployment.gameplaySigner,rulesHash:o.deployment.rulesHash,codeHash:o.deployment.codeHash};
  let state:'ENABLED'|'DISABLED'|'UNAVAILABLE'='DISABLED';
  if(v2||process.env.SURVIVAL_WEAPONS_V2==='true')try{
   v2??=JSON.parse(readFileSync(process.env.WEAPON_COLLECTION_DEPLOYMENT_FILE??resolve(import.meta.dirname,'../../../.runtime/testnet/weapon-collection.json'),'utf8')) as WeaponCollectionDeployment;
   if(v2.version!=='SURVIVAL_V2'||v2.rulesHash!==weaponRecoveryPolicyHash||v2.chainId!==legacy.chainId||getAddress(v2.currency)!==getAddress(legacy.currency)||getAddress(v2.gameplaySigner)!==getAddress(legacy.gameplaySigner))throw Error('Collection identity differs from configured armory');
   this.registry=new WeaponCollections(o.provider,[legacy,v2]);state='ENABLED';
  }catch{this.registry=new WeaponCollections(o.provider,[legacy]);state='UNAVAILABLE';}
  else this.registry=new WeaponCollections(o.provider,[legacy]);
  this.v2Status=state;
 }
 bindSurvival(survival:FundedSurvival|null){if(survival&&this.registry&&this.armory.options&&this.v2Status==='ENABLED')this.recoveries=new WeaponRecovery(this.armory.testnet.rooms.db,this.registry,this.armory.options.signer,survival);}
 private configured(){if(!this.registry)throw Error('Verified weapon collections unavailable. Free practice remains available.');return this.registry;}
 private page(value:number,min:number){if(!Number.isSafeInteger(value)||value<min||value>1000000)throw Error('Invalid collection page');return value;}
 async config(){
  if(!this.registry)return {status:'UNAVAILABLE',v2Status:this.v2Status,collections:[]};
  const collections=await Promise.all(this.registry.deployments.map(async d=>{try{await this.registry!.checked({collection:d.collection,tokenId:'1'});return {...d,status:'READY' as const,combatReady:d.version==='LEGACY_V1',shopKinds:d.version==='LEGACY_V1'?[0,1]:[0,1,2],claimRoute:d.version==='LEGACY_V1'?'LEGACY_V1':'SURVIVAL_V2'};}catch{return {collection:d.collection,version:d.version,status:'UNAVAILABLE' as const,combatReady:false,shopKinds:[]};}}));
  return {status:collections.some(c=>c.status==='READY')?'READY':'UNAVAILABLE',mode:this.registry.deployments[0].chainId===31337?'LOCAL_BLOCKCHAIN':'PUBLIC_TESTNET',v2Status:this.v2Status,collections};
 }
 async inventory(wallet:string,collection:string,offset=0){
  wallet=getAddress(wallet);this.page(offset,0);const {asset,deployment,contract}=await this.configured().checked({collection,tokenId:'1'}),page=await contract.ownedPage(wallet,offset,32);
  return {mode:'PUBLIC_READ_ONLY',wallet,collection:asset.collection,version:deployment.version,offset,total:String(await contract.balanceOf(wallet)),guns:Array.from(page[0] as bigint[],(tokenId,i)=>({collection:asset.collection,tokenId:String(tokenId),kind:Number(page[1][i]),weapon:weaponClass(deployment.version,Number(page[1][i])),source:String(page[2][i]),buildHash:deployment.version==='SURVIVAL_V2'?weaponBuildHash(Number(page[1][i])):null,combatReady:deployment.version==='LEGACY_V1'}))};
 }
 async market(collection:string,start=1){
  this.page(start,1);const {asset,deployment,contract}=await this.configured().checked({collection,tokenId:'1'}),page=await contract.marketPage(start,32),v2=deployment.version==='SURVIVAL_V2';
  const guns=await Promise.all(Array.from(page[0] as bigint[],async(tokenId,i)=>String(page[2][i])==='0'?null:({collection:asset.collection,tokenId:String(tokenId),seller:String(page[1][i]),price:String(page[2][i]),kind:v2?Number(await contract.gunKind(tokenId)):Number(page[3][i]),buildHash:v2?String(page[3][i]):null,listingNonce:v2?String(page[4][i]):null,route:v2?'V2_EXPECTED_BUILD':'LEGACY_EXPECTED_PRICE'})));
  return {mode:'PUBLIC_READ_ONLY',collection:asset.collection,start,nextTokenId:String(await contract.nextTokenId()),guns:guns.filter((g):g is NonNullable<typeof g>=>g!==null)};
 }
 async token(value:WeaponAsset){const {asset,deployment,contract}=await this.configured().checked(value);return {mode:'PUBLIC_READ_ONLY',...asset,version:deployment.version,owner:await contract.ownerOf(asset.tokenId),uri:await contract.tokenURI(asset.tokenId)};}
 quote(value:WeaponAsset){return this.configured().quote(value);}
 async history(value:WeaponAsset){
  const {asset,contract}=await this.configured().checked(value);
  if(this.recoveries)return this.recoveries.history(asset);
  return {asset,owner:String(await contract.ownerOf(asset.tokenId)),source:String(await contract.provenance(asset.tokenId)),mode:'NO_LOCAL_EXTRACTION_PROOF',entries:[],upgrades:'DEFERRED'};
 }
 async select(wallet:string,value:WeaponAsset){
  wallet=getAddress(wallet);const selected=await this.configured().owned(weaponAsset(value),wallet),payload=JSON.stringify(selected);
  this.armory.testnet.rooms.db.prepare('INSERT OR REPLACE INTO weapon_loadouts VALUES(?,?,?)').run(wallet.toLowerCase(),payload,checksum(payload));return selected;
 }
 async loadout(wallet:string){
  wallet=getAddress(wallet);const row=this.armory.testnet.rooms.db.prepare('SELECT payload,digest FROM weapon_loadouts WHERE wallet=?').get(wallet.toLowerCase());
  if(!row)return null;const raw=String(row.payload);if(checksum(raw)!==row.digest)throw Error('Loadout checkpoint is corrupt; select an owned asset again');
  const prior=JSON.parse(raw),current=await this.configured().owned(weaponAsset(prior.asset),wallet);
  if(current.version!==prior.version||current.buildHash!==prior.buildHash||current.kind!==prior.kind)throw Error('Loadout build no longer matches');return current;
 }
 async equip(wallet:string){const chosen=await this.loadout(wallet);if(!chosen)throw Error('Select an owned asset first');if(chosen.version!=='LEGACY_V1')throw Error('Shotgun combat is not enabled yet. The collectible can be inspected and traded.');return this.armory.start(wallet,chosen.asset.tokenId,chosen.asset.collection);}
 async recovery(run:string,wallet:string){if(this.armory.runs.has(run))return this.armory.vouchers(run,wallet);if(!this.recoveries)throw Error('V2 extracted item recovery is unavailable');return this.recoveries.claims(run,wallet);}
}
