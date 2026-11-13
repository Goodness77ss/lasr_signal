export const EQUIPMENT_BUILDS=Object.freeze({
 'marksman-rifle':'0xb68e0af5aeb21cb1d563b2c90eb7b259f8663817bb05ed33a295ffbe9fb461da',
 'support-gun':'0x78ce8a816917103214c4b1cb8c2d483b65734f1ed8eb5aaf507922cd642c294d',
} as const);
export const EQUIPMENT_RULES=Object.freeze({version:'journey-equipment-1',builds:EQUIPMENT_BUILDS,classVersion:'journey-classes-1',damage:'round(base * classDamagePercent / 100)',armour:'max(1, round(damage * (100 - min(40, classArmour + activeBrace)) / 100))',reload:'ceil(weaponReloadTicks * classReloadPercent / 100)',abilities:'soldier class only; focus adds 8 range; resupply adds at most 24 reserve; no gun grants a class',spread:'deterministic build spread',rankCombatBenefits:false} as const);
export type EquipmentEntry={actorId:number;asset:{kind:'gun';chainId:'31337';collection:string;tokenId:string};buildId:keyof typeof EQUIPMENT_BUILDS;buildHash:string;assetNonce:string};
export type EquipmentSnapshot={version:typeof EQUIPMENT_RULES.version;owner:string;entries:EquipmentEntry[];hash:string};
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const address=(value:unknown)=>{if(typeof value!=='string'||!/^0x[\da-fA-F]{40}$/.test(value)||/^0x0{40}$/.test(value))throw Error('Exact equipment owner and collection required');return value.toLowerCase();};
export function parseEquipmentSelection(value:unknown):EquipmentEntry[]{
 if(!Array.isArray(value)||value.length<1||value.length>3)throw Error('One to three equipped soldiers required');
 let last=0;const assets=new Set<string>();
 return value.map(entry=>{
  if(!record(entry)||!exact(entry,['actorId','asset','buildId','buildHash','assetNonce'])||!Number.isSafeInteger(entry.actorId)||Number(entry.actorId)<=last||Number(entry.actorId)>3||typeof entry.buildId!=='string'||!Object.hasOwn(EQUIPMENT_BUILDS,entry.buildId)||typeof entry.buildHash!=='string'||entry.buildHash.toLowerCase()!==EQUIPMENT_BUILDS[entry.buildId as keyof typeof EQUIPMENT_BUILDS]||typeof entry.assetNonce!=='string'||!/^(0|[1-9][0-9]{0,77})$/.test(entry.assetNonce)||BigInt(entry.assetNonce)>2n**256n-1n)throw Error('Exact supported equipment build required');
  last=Number(entry.actorId);const a=entry.asset;
  if(!record(a)||!exact(a,['kind','chainId','collection','tokenId'])||a.kind!=='gun'||a.chainId!=='31337'||typeof a.tokenId!=='string'||!/^[1-9][0-9]{0,77}$/.test(a.tokenId)||BigInt(a.tokenId)>2n**256n-1n)throw Error('Exact local gun asset required');
  const collection=address(a.collection),key=collection+':'+a.tokenId;if(assets.has(key))throw Error('Equipment asset selected twice');assets.add(key);
  return {actorId:Number(entry.actorId),asset:{kind:'gun',chainId:'31337',collection,tokenId:a.tokenId},buildId:entry.buildId as keyof typeof EQUIPMENT_BUILDS,buildHash:entry.buildHash.toLowerCase(),assetNonce:entry.assetNonce};
 });
}
const payload=(value:Omit<EquipmentSnapshot,'hash'>)=>JSON.stringify({version:value.version,owner:value.owner,entries:value.entries});
async function digest(value:string){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');}
export async function pinEquipment(owner:string,entries:EquipmentEntry[]):Promise<EquipmentSnapshot>{
 const value={version:EQUIPMENT_RULES.version,owner:address(owner),entries:parseEquipmentSelection(entries)};return {...value,hash:await digest(payload(value))};
}
export function validateEquipmentSnapshot(value:unknown):asserts value is EquipmentSnapshot {
 if(!record(value)||!exact(value,['version','owner','entries','hash'])||value.version!==EQUIPMENT_RULES.version||address(value.owner)!==value.owner||typeof value.hash!=='string'||!/^[a-f0-9]{64}$/.test(value.hash)||JSON.stringify(parseEquipmentSelection(value.entries))!==JSON.stringify(value.entries))throw Error('Invalid equipment snapshot');
}
export async function verifyEquipmentSnapshot(value:EquipmentSnapshot){validateEquipmentSnapshot(value);if(value.hash!==await digest(payload(value)))throw Error('Equipment snapshot hash mismatch');}
