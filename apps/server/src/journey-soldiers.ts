import {Contract,getAddress,keccak256,toQuantity,ZeroAddress,type JsonRpcProvider} from 'ethers';
import {readFileSync} from 'node:fs';
import {journeyAsset,journeyAssetKey,parseProgressRecord,JOURNEY_SOLDIER_BUILDS,SOLDIER_PROGRESS_POLICY,SOLDIER_LEASE_POLICY,SOLDIER_MARKET_POLICY,SOLDIER_MAX_LEASE_SECONDS,soldierRunHash,type JourneyAsset,type AssetCapabilities} from '@last-signal/chain';
import type {DeploymentRequest,DeploymentEvidence,DeploymentEndEvidence,DeploymentVerifier} from './journey-deployments.ts';
export type SoldierCollectionDeployment={version:'JOURNEY_SOLDIERS_V1';chainId:31337;collection:string;mintAuthority:string;gameplaySigner:string;rulesHash:string;codeHash:string;classSupplyCap:number;maxSupply:number};
export type SoldierMarketDeployment={version:'JOURNEY_SOLDIER_MARKET_V1';chainId:31337;market:string;collection:string;currency:string;codeHash:string;currencyCodeHash:string};
export class SoldierCollections implements DeploymentVerifier {
  readonly deployment:Readonly<SoldierCollectionDeployment>;
  readonly marketDeployment:Readonly<SoldierMarketDeployment>|undefined;
  constructor(private provider:JsonRpcProvider,manifest:SoldierCollectionDeployment,market?:SoldierMarketDeployment){
    if(manifest.version!=='JOURNEY_SOLDIERS_V1'||manifest.chainId!==31337||!Number.isSafeInteger(manifest.classSupplyCap)||manifest.classSupplyCap<1||manifest.classSupplyCap>1000||manifest.maxSupply!==manifest.classSupplyCap*7||!/^0x[\da-fA-F]{64}$/.test(manifest.rulesHash)||!/^0x[\da-fA-F]{64}$/.test(manifest.codeHash))throw Error('Unsupported local soldier manifest');
    const normalized={...manifest,collection:getAddress(manifest.collection),mintAuthority:getAddress(manifest.mintAuthority),gameplaySigner:getAddress(manifest.gameplaySigner)};
    if([normalized.collection,normalized.mintAuthority,normalized.gameplaySigner].includes(ZeroAddress))throw Error('Nonzero soldier identities required');
    this.deployment=Object.freeze(normalized);
    if(market){
      const configured={...market,market:getAddress(market.market),collection:getAddress(market.collection),currency:getAddress(market.currency)};
      if(configured.version!=='JOURNEY_SOLDIER_MARKET_V1'||configured.chainId!==31337||configured.collection!==normalized.collection||[configured.market,configured.currency].includes(ZeroAddress)||!/^0x[\da-fA-F]{64}$/.test(configured.codeHash)||!/^0x[\da-fA-F]{64}$/.test(configured.currencyCodeHash))throw Error('Unsupported local soldier market manifest');
      this.marketDeployment=Object.freeze(configured);
    }
  }
  async checked(value:unknown,blockTag?:bigint){
    const asset=journeyAsset(value),d=this.deployment;
    if(asset.kind!=='soldier'||asset.chainId!==String(d.chainId)||asset.collection!==d.collection)throw Error('Unregistered soldier asset');
    if(BigInt(await this.provider.send('eth_chainId',[]))!==BigInt(d.chainId))throw Error('Soldier chain mismatch');
    blockTag??=BigInt(await this.provider.send('eth_blockNumber',[]));const at={blockTag};
    const code=await this.provider.getCode(d.collection,blockTag);if(code==='0x'||keccak256(code)!==d.codeHash)throw Error('Soldier code mismatch');
    const contract=new Contract(d.collection,JSON.parse(readFileSync(new URL('../../../packages/contracts/abi/JourneySoldiers.json',import.meta.url),'utf8')),this.provider);
    if(getAddress(await contract.mintAuthority(at))!==d.mintAuthority||getAddress(await contract.gameplaySigner(at))!==d.gameplaySigner||String(await contract.rulesHash(at)).toLowerCase()!==d.rulesHash.toLowerCase()||await contract.PROGRESS_POLICY(at)!==SOLDIER_PROGRESS_POLICY||BigInt(await contract.classSupplyCap(at))!==BigInt(d.classSupplyCap)||BigInt(await contract.maxSupply(at))!==BigInt(d.maxSupply)||await contract.LEASE_POLICY(at)!==SOLDIER_LEASE_POLICY||BigInt(await contract.MAX_LEASE_DURATION(at))!==BigInt(SOLDIER_MAX_LEASE_SECONDS))throw Error('Soldier immutable configuration mismatch');
    const builds=await Promise.all(JOURNEY_SOLDIER_BUILDS.map((_,index)=>contract.buildForClass(index,at)));
    if(builds.some((hash,index)=>String(hash).toLowerCase()!==JOURNEY_SOLDIER_BUILDS[index].hash.toLowerCase()))throw Error('Unsupported soldier class build');
    return {asset,contract,blockTag};
  }
  async inspect(value:unknown){
    const {asset,contract,blockTag}=await this.checked(value),at={blockTag},classId=Number(await contract.classOf(asset.tokenId,at)),build=JOURNEY_SOLDIER_BUILDS[classId];
    if(!build||String(await contract.buildHash(asset.tokenId,at)).toLowerCase()!==build.hash.toLowerCase())throw Error('Unsupported soldier token build');
    if(this.marketDeployment)await this.checkedMarket(asset,blockTag);
    const p=await contract.progress(asset.tokenId,at),capabilities:AssetCapabilities={inspect:true,equip:false,list:Boolean(this.marketDeployment),claim:false,consume:false,combatReady:false,journeyCombatReady:false};
    const progress=parseProgressRecord({asset,revision:String(p.revision),cumulativeXp:String(p.cumulativeXp),furthestCompleted:p.hasCheckpoint?String(p.furthestCheckpoint):null,policy:'journey-progress-1',rulesHash:this.deployment.rulesHash,source:String(p.bankSource)});
    return {asset,key:journeyAssetKey(asset),environment:'LOCAL_BLOCKCHAIN',adapter:'JOURNEY_SOLDIERS_V1',owner:getAddress(await contract.ownerOf(asset.tokenId,at)),uri:String(await contract.tokenURI(asset.tokenId,at)),immutableBuild:build,provenance:String(await contract.provenance(asset.tokenId,at)),capabilities,combatMode:null,progress,progressNonce:String(await contract.progressNonce(asset.tokenId,at)),observedBlock:String(blockTag),leaseActive:Boolean(await contract.leaseActive(asset.tokenId,at))};
  }
  async owned(value:JourneyAsset,wallet:string){
    const inspected=await this.inspect(value),{contract}=await this.checked(value),head=BigInt(await this.provider.send('eth_blockNumber',[])),owner=getAddress(wallet);
    if(inspected.owner!==owner||getAddress(await contract.ownerOf(inspected.asset.tokenId,{blockTag:head>0n?head-1n:0n}))!==owner)throw Error('Confirmed soldier ownership required');return inspected;
  }
  async checkedMarket(value:unknown,blockTag?:bigint){
    const checked=await this.checked(value,blockTag),d=this.marketDeployment;
    if(!d)throw Error('Verified local soldier market unavailable');
    const at={blockTag:checked.blockTag},code=await this.provider.getCode(d.market,checked.blockTag),currencyCode=await this.provider.getCode(d.currency,checked.blockTag);
    if(code==='0x'||currencyCode==='0x'||keccak256(code)!==d.codeHash||keccak256(currencyCode)!==d.currencyCodeHash)throw Error('Soldier market or currency code mismatch');
    const market=new Contract(d.market,JSON.parse(readFileSync(new URL('../../../packages/contracts/abi/JourneySoldierMarket.json',import.meta.url),'utf8')),this.provider);
    if(getAddress(await market.collection(at))!==d.collection||getAddress(await market.currency(at))!==d.currency||await market.MARKET_POLICY(at)!==SOLDIER_MARKET_POLICY)throw Error('Soldier market immutable configuration mismatch');
    return {...checked,market,marketDeployment:d};
  }
  async quote(value:unknown){
    const {asset,contract,market,marketDeployment,blockTag}=await this.checkedMarket(value),at={blockTag},q=await market.quote(asset.tokenId,at),p=await contract.progress(asset.tokenId,at);
    return {asset,key:journeyAssetKey(asset),chainId:'31337',market:marketDeployment.market,currency:marketDeployment.currency,seller:getAddress(q.seller),price:String(q.price),listingNonce:String(q.nonce),progressRevision:String(q.progressRevision),assetNonce:String(q.assetNonce),buildHash:String(q.buildHash),cumulativeXp:String(p.cumulativeXp),furthestCompleted:p.hasCheckpoint?String(p.furthestCheckpoint):null,observedBlock:String(blockTag),environment:'LOCAL_BLOCKCHAIN',policy:'journey-soldier-fixed-price-1'};
  }
  private async leaseObservation(value:DeploymentRequest){
    const {asset,contract,blockTag}=await this.checked(value.asset),at={blockTag};
    const block=await this.provider.send('eth_getBlockByNumber',[toQuantity(blockTag),false]) as {timestamp:string;hash:string}|null;
    if(!block)throw Error('Missing deployment observation block');
    const lease=await contract.runLease(asset.tokenId,at),owner=getAddress(await contract.ownerOf(asset.tokenId,at));
    return {asset,contract,blockTag,block,lease,owner,chainTimestamp:BigInt(block.timestamp).toString()};
  }
  async verify(value:DeploymentRequest):Promise<DeploymentEvidence>{
    const {contract,blockTag,block,lease,owner,chainTimestamp}=await this.leaseObservation(value);
    if(lease.id.toLowerCase()!==value.leaseId.toLowerCase()||lease.runId!==soldierRunHash(value.runId)||getAddress(lease.owner)!==getAddress(value.owner)||owner!==getAddress(value.owner)||getAddress(lease.service)!==getAddress(value.service)||BigInt(lease.expiresAt)<=BigInt(chainTimestamp))throw Error('Current owner consented deployment lease required');
    if(blockTag===0n)throw Error('Confirmed deployment lease required');
    const prior=await contract.runLease(value.asset.tokenId,{blockTag:blockTag-1n});
    if(prior.id!==lease.id||getAddress(await contract.ownerOf(value.asset.tokenId,{blockTag:blockTag-1n}))!==owner)throw Error('Confirmed deployment lease required');
    const current=await this.provider.send('eth_getBlockByNumber',[toQuantity(blockTag),false]) as {hash:string}|null;
    if(current?.hash!==block.hash)throw Error('Deployment observation reorganized');
    return {...value,expiresAt:String(lease.expiresAt),chainTimestamp,blockNumber:String(blockTag),blockHash:block.hash};
  }
  async verifyClosed(value:DeploymentRequest):Promise<DeploymentEndEvidence>{
    const {contract,blockTag,block,lease,owner,chainTimestamp}=await this.leaseObservation(value);
    if(lease.id.toLowerCase()===value.leaseId.toLowerCase()&&BigInt(lease.expiresAt)>BigInt(chainTimestamp)&&owner===getAddress(value.owner))throw Error('Deployment lease is still active');
    if(blockTag===0n)throw Error('Confirmed deployment release required');
    const prior=await contract.runLease(value.asset.tokenId,{blockTag:blockTag-1n}),priorBlock=await this.provider.send('eth_getBlockByNumber',[toQuantity(blockTag-1n),false]) as {timestamp:string}|null;
    if(!priorBlock||prior.id.toLowerCase()===value.leaseId.toLowerCase()&&BigInt(prior.expiresAt)>BigInt(priorBlock.timestamp)&&getAddress(await contract.ownerOf(value.asset.tokenId,{blockTag:blockTag-1n}))===getAddress(value.owner))throw Error('Confirmed deployment release required');
    const current=await this.provider.send('eth_getBlockByNumber',[toQuantity(blockTag),false]) as {hash:string}|null;
    if(current?.hash!==block.hash)throw Error('Deployment release observation reorganized');
    return {...value,chainTimestamp,blockNumber:String(blockTag),blockHash:block.hash,reason:owner!==getAddress(value.owner)?'REVOKED':lease.id.toLowerCase()===value.leaseId.toLowerCase()?'EXPIRED':'RELEASED'};
  }
}
