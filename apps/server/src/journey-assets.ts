import { getAddress } from 'ethers';
import { journeyAsset,journeyAssetKey,assetInteger,JOURNEY_SUPPORTED_CHAINS,weaponBuildHash,weaponClass,type JourneyAsset,type AssetCapabilities } from '@last-signal/chain';
import type { WeaponCollections } from './weapon-collections.ts';
import type { SoldierCollections } from './journey-soldiers.ts';
import type { JourneyGunCollections } from './journey-guns.ts';
type GunQuote=Awaited<ReturnType<WeaponCollections['quote']>>&{asset:JourneyAsset;key:string};
type SoldierQuote=Awaited<ReturnType<SoldierCollections['quote']>>;

// Existing gun ABIs and trading routes stay in WeaponCollections. New soldier
// and supply contracts require their own checked adapters before admission.
export class JourneyAssetCatalog {
  private disabled:ReadonlySet<string>;
  constructor(private weapons:WeaponCollections|null,disabled:readonly {chainId:string;collection:string}[]=[],private soldiers?:SoldierCollections,private guns?:JourneyGunCollections){
    this.disabled=new Set(disabled.map(d=>assetInteger(d.chainId,true)+':'+getAddress(d.collection).toLowerCase()));
  }
  private registered(value:unknown){
    const asset=this.enabled(value);
    if(asset.kind!=='gun'||!this.weapons)throw Error('No verified adapter for this collectible kind');
    const deployment=this.weapons.deployments.find(d=>String(d.chainId)===asset.chainId&&d.collection===asset.collection);
    if(!deployment)throw Error('Unsupported collectible chain or collection');
    return {asset,deployment};
  }
  private enabled(value:unknown){
    const asset=journeyAsset(value);
    if(!JOURNEY_SUPPORTED_CHAINS.includes(asset.chainId as typeof JOURNEY_SUPPORTED_CHAINS[number]))throw Error('Unsupported collectible chain');
    if(this.disabled.has(asset.chainId+':'+asset.collection.toLowerCase()))throw Error('Collectible collection disabled');
    return asset;
  }
  async inspect(value:unknown){
    const candidate=this.enabled(value);if(candidate.kind==='soldier'){if(!this.soldiers)throw Error('No verified soldier adapter');return this.soldiers.inspect(candidate);}
    if(candidate.kind==='gun'&&this.guns?.supports(candidate))return this.guns.inspect(candidate);
    const {asset,deployment}=this.registered(value),{contract}=await this.weapons!.checked(asset);
    const kind=Number(await contract.gunKind(asset.tokenId)),weapon=weaponClass(deployment.version,kind);
    const expected=weaponBuildHash(kind);
    if(deployment.version==='SURVIVAL_V2'&&String(await contract.buildHash(asset.tokenId)).toLowerCase()!==expected.toLowerCase())throw Error('Unsupported immutable weapon build');
    const legacy=deployment.version==='LEGACY_V1';
    const capabilities:AssetCapabilities=Object.freeze({inspect:true,equip:legacy,list:true,claim:false,consume:false,combatReady:legacy,journeyCombatReady:false});
    return {asset,key:journeyAssetKey(asset),environment:asset.chainId==='31337'?'LOCAL_BLOCKCHAIN':'PUBLIC_TESTNET',adapter:deployment.version,owner:getAddress(await contract.ownerOf(asset.tokenId)),uri:String(await contract.tokenURI(asset.tokenId)),immutableBuild:{id:deployment.version+':'+weapon,hash:expected},capabilities,combatMode:legacy?'LEGACY_SALVAGE':null,progress:null};
  }
  quote(value:Extract<JourneyAsset,{kind:'gun'}>):Promise<GunQuote|Awaited<ReturnType<JourneyGunCollections['quote']>>>;
  quote(value:Extract<JourneyAsset,{kind:'soldier'}>):Promise<SoldierQuote>;
  quote(value:unknown):Promise<GunQuote|SoldierQuote|Awaited<ReturnType<JourneyGunCollections['quote']>>>;
  async quote(value:unknown):Promise<GunQuote|SoldierQuote|Awaited<ReturnType<JourneyGunCollections['quote']>>>{const candidate=this.enabled(value);if(candidate.kind==='soldier'&&this.soldiers)return this.soldiers.quote(candidate);if(candidate.kind==='gun'&&this.guns?.supports(candidate))return this.guns.quote(candidate);const inspected=await this.inspect(value);if(inspected.asset.kind!=='gun'||!this.weapons)throw Error('Collectible trading is not enabled');return {...await this.weapons.quote(inspected.asset),asset:inspected.asset,key:inspected.key};}
  async owned(value:unknown,wallet:string){const candidate=this.enabled(value);if(candidate.kind==='soldier'&&this.soldiers)return this.soldiers.owned(candidate,wallet);if(candidate.kind==='gun'&&this.guns?.supports(candidate))return this.guns.owned(candidate,wallet);const inspected=await this.inspect(value);await this.weapons!.owned(inspected.asset,wallet);return inspected;}
  requireJourneyEquipment(value:JourneyAsset):never {this.registered(value);throw Error('Owned collectible Journey equipment is not enabled');}
}
