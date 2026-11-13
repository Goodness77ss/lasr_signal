import { getAddress,ZeroAddress,id } from 'ethers';
import { SOLDIER_CLASS_IDS,soldierClass,CLASS_RULES,type SoldierClassId } from '../../sim/src/journey/classes.ts';
import { JOURNEY_WEAPON_VERSION,journeyWeapon,type JourneyWeaponId } from '../../sim/src/journey/weapons.ts';

type TokenIdentity={chainId:string;collection:string;tokenId:string};
export type JourneyAsset=({kind:'soldier'}&TokenIdentity)|({kind:'gun'}&TokenIdentity)|({kind:'consumable';amount:string}&TokenIdentity);
export const JOURNEY_SUPPORTED_CHAINS=Object.freeze(['31337','46630'] as const);
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function assetInteger(value:unknown,positive=false):string {
  if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,77})$/.test(value)||BigInt(value)>2n**256n-1n||positive&&BigInt(value)===0n)throw Error('Canonical uint256 string required');return value;
}
export function journeyAsset(value:unknown):JourneyAsset {
  if(!record(value)||!['soldier','gun','consumable'].includes(String(value.kind)))throw Error('Explicit collectible kind required');
  const keys=['kind','chainId','collection','tokenId',...(value.kind==='consumable'?['amount']:[])];
  if(Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k))||typeof value.collection!=='string')throw Error('Explicit collectible identity required');
  const collection=getAddress(value.collection);if(collection===ZeroAddress)throw Error('Nonzero collection required');
  const base={chainId:assetInteger(value.chainId,true),collection,tokenId:assetInteger(value.tokenId)};
  return value.kind==='consumable'?{kind:'consumable',...base,amount:assetInteger(value.amount,true)}:{kind:value.kind as 'gun'|'soldier',...base};
}
// Amount and declared kind cannot produce a second identity for the same token.
export const journeyAssetKey=(value:JourneyAsset)=>{const a=journeyAsset(value);return 'eip155:'+a.chainId+':'+a.collection.toLowerCase()+':'+a.tokenId;};
const canonical=(value:Record<string,unknown>)=>JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))));
export function journeyWeaponIdentity(buildId:JourneyWeaponId){const build=journeyWeapon(buildId);return Object.freeze({id:JOURNEY_WEAPON_VERSION+':'+build.id,hash:id(canonical({...build,version:JOURNEY_WEAPON_VERSION})),build});}
export function journeySoldierIdentity(classId:SoldierClassId){const definition=soldierClass(classId);return Object.freeze({id:CLASS_RULES.version+':'+definition.id,hash:id(canonical({...definition,version:CLASS_RULES.version,signatureBuild:journeyWeaponIdentity(definition.weapon).hash})),classId});}
export const JOURNEY_SOLDIER_BUILDS=Object.freeze(SOLDIER_CLASS_IDS.map(journeySoldierIdentity));
export type JourneyProgressRecord={asset:Extract<JourneyAsset,{kind:'soldier'}>;revision:string;cumulativeXp:string;furthestCompleted:string|null;policy:string;rulesHash:string;source:string};
// Structural decoding only. A registered contract adapter must verify provenance.
export function parseProgressRecord(value:unknown):JourneyProgressRecord {
  if(!record(value)||Object.keys(value).sort().join()!==['asset','revision','cumulativeXp','furthestCompleted','policy','rulesHash','source'].sort().join())throw Error('Explicit progress record required');
  const asset=journeyAsset(value.asset);if(asset.kind!=='soldier')throw Error('Soldier progress identity required');
  if(typeof value.policy!=='string'||!value.policy||value.policy.length>96||typeof value.rulesHash!=='string'||!/^(0x)?[a-fA-F0-9]{64}$/.test(value.rulesHash)||typeof value.source!=='string'||!value.source||value.source.length>192)throw Error('Invalid progress provenance');
  return {asset,revision:assetInteger(value.revision),cumulativeXp:assetInteger(value.cumulativeXp),furthestCompleted:value.furthestCompleted===null?null:assetInteger(value.furthestCompleted),policy:value.policy,rulesHash:value.rulesHash,source:value.source};
}
export function developmentSoldier(classId:SoldierClassId){return Object.freeze({kind:'development-soldier',environment:'LOCAL_PRACTICE',id:'development:'+classId,build:journeySoldierIdentity(classId),ownedCollectible:false} as const);}
export type AssetCapabilities=Readonly<{inspect:boolean;equip:boolean;list:boolean;claim:boolean;consume:boolean;combatReady:boolean;journeyCombatReady:boolean}>;
