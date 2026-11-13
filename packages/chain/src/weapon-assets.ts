import {getAddress,id,ZeroAddress} from 'ethers';

export type WeaponAsset={collection:string;tokenId:string};
export type WeaponCollectionVersion='LEGACY_V1'|'SURVIVAL_V2';
export type WeaponCollection={collection:string;version:WeaponCollectionVersion};
export const SHOTGUN_BUILD_TEXT='LAST SIGNAL Trench Shotgun build 1; maxDamage=30; shotTicks=16; magazine=6; reloadTicks=44; range=8; coneDegrees=30';
export const SHOTGUN_BUILD_HASH=id(SHOTGUN_BUILD_TEXT);
export const WEAPON_BUILD_HASHES=[id('LAST SIGNAL Service Rifle build 1; damage=20; shotTicks=5; magazine=20; reloadTicks=30; range=14'),id('LAST SIGNAL Field Carbine build 1; damage=12; shotTicks=3; magazine=30; reloadTicks=30; range=14'),SHOTGUN_BUILD_HASH] as const;
export const weaponBuildHash=(kind:number)=>{if(!Number.isSafeInteger(kind)||kind<0||kind>2)throw Error('Unsupported weapon build');return WEAPON_BUILD_HASHES[kind];};
export const weaponRecoveryPolicyHash=id('LAST SIGNAL extracted weapon policy 2; maxPerRun=3; owner=recordedPlayer; source=confirmedExtraction; builds='+WEAPON_BUILD_HASHES.join(','));
export const weaponLootV2Types={Claim:[{name:'dropId',type:'bytes32'},{name:'runId',type:'bytes32'},{name:'recipient',type:'address'},{name:'kind',type:'uint8'},{name:'rulesHash',type:'bytes32'},{name:'buildHash',type:'bytes32'},{name:'expiry',type:'uint256'}]};
export type WeaponLootClaimV2={dropId:string;runId:string;recipient:string;kind:number;rulesHash:string;buildHash:string;expiry:string};
export const weaponCollectionV2Domain=(chainId:bigint,collection:string)=>({name:'LAST SIGNAL Survival Guns',version:'2',chainId,verifyingContract:getAddress(collection)});

export function weaponAsset(value:WeaponAsset):WeaponAsset{
 if(!value||typeof value.collection!=='string'||typeof value.tokenId!=='string')throw Error('Collection and token ID must be explicit strings');
 const collection=getAddress(value.collection);
 if(collection===ZeroAddress||!/^[1-9][0-9]{0,77}$/.test(value.tokenId)||BigInt(value.tokenId)>2n**256n-1n)throw Error('Valid collection and positive token ID required');
 return {collection,tokenId:value.tokenId};
}
export const weaponAssetKey=(value:WeaponAsset)=>{const asset=weaponAsset(value);return asset.collection.toLowerCase()+':'+asset.tokenId;};
export function registeredWeaponAsset(value:WeaponAsset,collections:readonly WeaponCollection[]){
 const asset=weaponAsset(value),matches=collections.filter(c=>getAddress(c.collection)===asset.collection);
 if(matches.length!==1)throw Error('Exactly one supported weapon collection required');
 return {...asset,version:matches[0].version};
}
export function weaponClass(version:WeaponCollectionVersion,kind:number){
 if((version==='LEGACY_V1'||version==='SURVIVAL_V2')&&(kind===0||kind===1))return kind===0?'rifle' as const:'carbine' as const;
 if(version==='SURVIVAL_V2'&&kind===2)return 'shotgun' as const;
 throw Error('Unsupported class for this weapon collection');
}
