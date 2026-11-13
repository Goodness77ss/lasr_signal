import {Contract,getAddress,keccak256,ZeroAddress,type JsonRpcProvider} from 'ethers';
import {readFileSync} from 'node:fs';
import {journeyAsset,journeyAssetKey,journeyGunBuild,JOURNEY_GUN_BUILDS,JOURNEY_GUN_RECOVERY_RULES,type JourneyAsset,type AssetCapabilities} from '@last-signal/chain';
export type JourneyGunDeployment={version:'JOURNEY_GUNS_V1';chainId:31337;collection:string;currency:string;gameplaySigner:string;rulesHash:string;codeHash:string;currencyCodeHash:string};
export class JourneyGunCollections {
 readonly deployment:Readonly<JourneyGunDeployment>;
 constructor(private provider:JsonRpcProvider,value:JourneyGunDeployment){
  if(value.version!=='JOURNEY_GUNS_V1'||value.chainId!==31337||value.rulesHash.toLowerCase()!==JOURNEY_GUN_RECOVERY_RULES.toLowerCase()||![value.codeHash,value.currencyCodeHash].every(hash=>/^0x[\da-fA-F]{64}$/.test(hash)))throw Error('Unsupported local Journey gun manifest');
  const normalized={...value,collection:getAddress(value.collection),currency:getAddress(value.currency),gameplaySigner:getAddress(value.gameplaySigner)};
  if([normalized.collection,normalized.currency,normalized.gameplaySigner].includes(ZeroAddress))throw Error('Nonzero Journey gun identities required');this.deployment=Object.freeze(normalized);
 }
 supports(value:JourneyAsset){const asset=journeyAsset(value);return asset.kind==='gun'&&asset.chainId===String(this.deployment.chainId)&&asset.collection===this.deployment.collection;}
 async checked(value:unknown,blockTag?:bigint){
  const asset=journeyAsset(value),d=this.deployment;if(asset.kind!=='gun'||!this.supports(asset))throw Error('Unregistered Journey gun');
  if(BigInt(await this.provider.send('eth_chainId',[]))!==31337n)throw Error('Journey gun chain mismatch');
  blockTag??=BigInt(await this.provider.send('eth_blockNumber',[]));const at={blockTag};
  const code=await this.provider.getCode(d.collection,blockTag),currency=await this.provider.getCode(d.currency,blockTag);
  if(code==='0x'||currency==='0x'||keccak256(code)!==d.codeHash||keccak256(currency)!==d.currencyCodeHash)throw Error('Journey gun or currency code mismatch');
  const contract=new Contract(d.collection,JSON.parse(readFileSync(new URL('../../../packages/contracts/abi/JourneyGunCollection.json',import.meta.url),'utf8')),this.provider);
  if(getAddress(await contract.currency(at))!==d.currency||getAddress(await contract.gameplaySigner(at))!==d.gameplaySigner||String(await contract.rulesHash(at)).toLowerCase()!==d.rulesHash.toLowerCase())throw Error('Journey gun immutable configuration mismatch');
  const builds=await Promise.all(JOURNEY_GUN_BUILDS.map((_,kind)=>contract.buildForKind(kind,at)));
  if(builds.some((hash,kind)=>String(hash).toLowerCase()!==JOURNEY_GUN_BUILDS[kind].hash.toLowerCase()))throw Error('Unsupported Journey gun builds');
  return {asset,contract,blockTag};
 }
 async inspect(value:unknown,blockTag?:bigint){
  const {asset,contract,blockTag:head}=await this.checked(value,blockTag),at={blockTag:head},kind=Number(await contract.gunKind(asset.tokenId,at)),build=journeyGunBuild(kind);
  if(String(await contract.buildHash(asset.tokenId,at)).toLowerCase()!==build.hash.toLowerCase())throw Error('Journey gun token build mismatch');
  const capabilities:AssetCapabilities={inspect:true,equip:false,list:true,claim:false,consume:false,combatReady:false,journeyCombatReady:false};
  return {asset,key:journeyAssetKey(asset),environment:'LOCAL_BLOCKCHAIN',adapter:'JOURNEY_GUNS_V1',owner:getAddress(await contract.ownerOf(asset.tokenId,at)),uri:String(await contract.tokenURI(asset.tokenId,at)),immutableBuild:build,kind,provenance:String(await contract.provenance(asset.tokenId,at)),sourceRun:String(await contract.sourceRun(asset.tokenId,at)),capabilities,combatMode:null,progress:null,observedBlock:String(head),assetNonce:String(await contract.listingNonce(asset.tokenId,at))};
 }
 async owned(value:unknown,wallet:string,expectedBuild?:string,expectedNonce?:string){
  const head=BigInt(await this.provider.send('eth_blockNumber',[])),inspected=await this.inspect(value,head),{contract}=await this.checked(value,head),owner=getAddress(wallet);
  if(head===0n||inspected.owner!==owner||getAddress(await contract.ownerOf(inspected.asset.tokenId,{blockTag:head-1n}))!==owner)throw Error('Confirmed Journey gun ownership required');
  if(expectedBuild!==undefined&&expectedBuild.toLowerCase()!==inspected.immutableBuild.hash.toLowerCase())throw Error('Exact Journey equipment build required');if(expectedNonce!==undefined&&expectedNonce!==inspected.assetNonce)throw Error('Journey equipment ownership epoch changed');return inspected;
 }
 async quote(value:unknown){
  const {asset,contract,blockTag}=await this.checked(value),at={blockTag},offer=await contract.quote(asset.tokenId,at),kind=Number(await contract.gunKind(asset.tokenId,at)),build=journeyGunBuild(kind);
  if(String(offer.buildHash).toLowerCase()!==build.hash.toLowerCase())throw Error('Journey gun listing build mismatch');
  return {asset,key:journeyAssetKey(asset),seller:getAddress(offer.seller),price:String(offer.price),currency:this.deployment.currency,route:'JOURNEY_EXPECTED_BUILD' as const,expectedBuildHash:build.hash,expectedNonce:String(offer.nonce),observedBlock:String(blockTag)};
 }
}
