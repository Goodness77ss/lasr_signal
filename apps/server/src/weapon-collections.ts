import {Contract,getAddress,keccak256,type JsonRpcProvider} from 'ethers';
import {readFileSync} from 'node:fs';
import {registeredWeaponAsset,weaponClass,type WeaponAsset,type WeaponCollectionVersion} from '@last-signal/chain';

export type WeaponCollectionDeployment={collection:string;version:WeaponCollectionVersion;chainId:number;currency:string;gameplaySigner:string;rulesHash:string;codeHash:string};

/** Explicit allowlist. An unknown collection never falls back to the original armory. */
export class WeaponCollections {
 readonly deployments:readonly WeaponCollectionDeployment[];
 constructor(readonly provider:JsonRpcProvider,deployments:readonly WeaponCollectionDeployment[]){
  if(!deployments.length||deployments.length>2)throw Error('One or two explicit weapon collections required');
  this.deployments=deployments.map(d=>({...d,collection:getAddress(d.collection),currency:getAddress(d.currency),gameplaySigner:getAddress(d.gameplaySigner)}));
  if(new Set(this.deployments.map(d=>d.collection)).size!==this.deployments.length)throw Error('Duplicate weapon collection');
  if(this.deployments.some(d=>!['LEGACY_V1','SURVIVAL_V2'].includes(d.version)||![31337,46630].includes(d.chainId)||d.chainId!==this.deployments[0].chainId||d.currency!==this.deployments[0].currency||!/^0x[\da-fA-F]{64}$/.test(d.codeHash)||!/^0x[\da-fA-F]{64}$/.test(d.rulesHash)))throw Error('Unsupported collection network, currency or identity');
 }
 private deployment(value:WeaponAsset){
  const asset=registeredWeaponAsset(value,this.deployments),deployment=this.deployments.find(d=>d.collection===asset.collection)!;
  return {asset,deployment};
 }
 async checked(value:WeaponAsset){
  const {asset,deployment:d}=this.deployment(value);
  if(Number(BigInt(await this.provider.send('eth_chainId',[])))!==d.chainId)throw Error('Weapon collection chain mismatch');
  if(keccak256(await this.provider.getCode(d.collection))!==d.codeHash)throw Error('Weapon collection code mismatch');
  const file=d.version==='LEGACY_V1'?'GunArmory':'SurvivalGunCollection';
  const contract=new Contract(d.collection,JSON.parse(readFileSync(new URL('../../../packages/contracts/abi/'+file+'.json',import.meta.url),'utf8')),this.provider);
  if(getAddress(await contract.currency())!==d.currency||getAddress(await contract.gameplaySigner())!==d.gameplaySigner||await contract.rulesHash()!==d.rulesHash)throw Error('Weapon collection immutable identity mismatch');
  return {asset,deployment:d,contract};
 }
 async owned(value:WeaponAsset,wallet:string){
  const {asset,deployment,contract}=await this.checked(value),owner=getAddress(wallet);
  const head=Number(BigInt(await this.provider.send('eth_blockNumber',[])));
  if(getAddress(await contract.ownerOf(asset.tokenId))!==owner||getAddress(await contract.ownerOf(asset.tokenId,{blockTag:Math.max(0,head-1)}))!==owner)throw Error('Confirmed ownership of this collection and token required');
  const kind=Number(await contract.gunKind(asset.tokenId));
  return {asset:{collection:asset.collection,tokenId:asset.tokenId},version:deployment.version,kind,weapon:weaponClass(deployment.version,kind),buildHash:deployment.version==='SURVIVAL_V2'?String(await contract.buildHash(asset.tokenId)):null};
 }
 async quote(value:WeaponAsset){
  const {asset,deployment,contract}=await this.checked(value),listing=await contract.listings(asset.tokenId),seller=getAddress(listing.seller);
  if(BigInt(listing.price)<=0n||seller!==getAddress(await contract.ownerOf(asset.tokenId)))throw Error('Listing unavailable');
  const kind=Number(await contract.gunKind(asset.tokenId));weaponClass(deployment.version,kind);
  if(deployment.version==='SURVIVAL_V2'){
   const build=String(await contract.buildHash(asset.tokenId));
   if(listing.buildHash!==build)throw Error('Listing build mismatch');
   return {asset:{collection:asset.collection,tokenId:asset.tokenId},seller,price:String(listing.price),currency:deployment.currency,route:'V2_EXPECTED_BUILD' as const,expectedBuildHash:build,expectedNonce:String(listing.nonce)};
  }
  return {asset:{collection:asset.collection,tokenId:asset.tokenId},seller,price:String(listing.price),currency:deployment.currency,route:'LEGACY_EXPECTED_PRICE' as const,expectedBuildHash:null,expectedNonce:null};
 }
}
