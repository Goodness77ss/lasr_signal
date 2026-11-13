import {BrowserProvider,Contract,getAddress,keccak256,type Signer,type JsonRpcProvider,type TransactionResponse} from 'ethers';
import {SOLDIER_MARKET_POLICY,SoldierTermsChangedError,journeyAsset,type SoldierAsset,type SoldierMarketPort,type SoldierTokenTerms,type SoldierSaleQuote} from '@last-signal/chain';
import soldierAbi from '../../../packages/contracts/abi/JourneySoldiers.json';
import marketAbi from '../../../packages/contracts/abi/JourneySoldierMarket.json';
import tokenAbi from '../../../packages/contracts/abi/TestWIF.json';

export type SoldierWalletDeployment={chainId:31337;collection:string;market:string;currency:string;collectionCodeHash:string;marketCodeHash:string;currencyCodeHash:string};
/** Explicit local wallet transport. The caller supplies reviewed deployment
 * identities; this does not enable a public marketplace by itself. */
export class SoldierMarketWallet implements SoldierMarketPort {
 readonly wallet:string;
 private deployment:SoldierWalletDeployment;
 private collection:Contract;private market:Contract;private currency:Contract;
 constructor(private provider:BrowserProvider|JsonRpcProvider,private signer:Signer,wallet:string,deployment:SoldierWalletDeployment){
  this.wallet=getAddress(wallet);if(deployment.chainId!==31337)throw Error('Local soldier market only');
  this.deployment={...deployment,collection:getAddress(deployment.collection),market:getAddress(deployment.market),currency:getAddress(deployment.currency)};
  for(const hash of [deployment.collectionCodeHash,deployment.marketCodeHash,deployment.currencyCodeHash])if(!/^0x[\da-fA-F]{64}$/.test(hash))throw Error('Pinned market bytecode required');
  this.collection=new Contract(this.deployment.collection,soldierAbi,signer);this.market=new Contract(this.deployment.market,marketAbi,signer);this.currency=new Contract(this.deployment.currency,tokenAbi,signer);
 }
 private asset(value:SoldierAsset){const asset=journeyAsset(value);if(asset.kind!=='soldier'||asset.chainId!=='31337'||asset.collection!==this.deployment.collection)throw Error('Unregistered soldier asset');return asset;}
 async verify(){
  if(BigInt(await this.provider.send('eth_chainId',[]))!==31337n||getAddress(await this.signer.getAddress())!==this.wallet)throw Error('Wallet or network changed. Reconnect before continuing.');
  const accounts=(await this.provider.send('eth_accounts',[]) as string[]).map(getAddress);
  if(this.provider instanceof BrowserProvider?accounts[0]!==this.wallet:!accounts.includes(this.wallet))throw Error('Wallet account changed. Reconnect before continuing.');
  const d=this.deployment;for(const [address,expected] of [[d.collection,d.collectionCodeHash],[d.market,d.marketCodeHash],[d.currency,d.currencyCodeHash]]){const code=await this.provider.getCode(address);if(code==='0x'||keccak256(code).toLowerCase()!==expected.toLowerCase())throw Error('Market deployment code mismatch');}
  if(getAddress(await this.market.collection())!==d.collection||getAddress(await this.market.currency())!==d.currency||await this.market.MARKET_POLICY()!==SOLDIER_MARKET_POLICY)throw Error('Market deployment identity mismatch');
 }
 async token(value:SoldierAsset):Promise<SoldierTokenTerms>{
  await this.verify();const at={blockTag:BigInt(await this.provider.send('eth_blockNumber',[]))},asset=this.asset(value),p=await this.collection.progress(asset.tokenId,at);
  return {asset,owner:getAddress(await this.collection.ownerOf(asset.tokenId,at)),progressRevision:String(p.revision),assetNonce:String(await this.collection.progressNonce(asset.tokenId,at)),buildHash:String(await this.collection.buildHash(asset.tokenId,at)),cumulativeXp:String(p.cumulativeXp),furthestCompleted:p.hasCheckpoint?String(p.furthestCheckpoint):null,leaseActive:Boolean(await this.collection.leaseActive(asset.tokenId,at))};
 }
 async quote(value:SoldierAsset):Promise<SoldierSaleQuote>{
  await this.verify();const at={blockTag:BigInt(await this.provider.send('eth_blockNumber',[]))},asset=this.asset(value);
  const q=await this.market.quote(asset.tokenId,at).catch((error:unknown)=>{if((error as {revert?:{name?:string}}).revert?.name==='StaleTerms')throw new SoldierTermsChangedError();throw error;}),p=await this.collection.progress(asset.tokenId,at);
  return {asset,market:this.deployment.market,currency:this.deployment.currency,seller:getAddress(q.seller),price:String(q.price),listingNonce:String(q.nonce),progressRevision:String(q.progressRevision),assetNonce:String(q.assetNonce),buildHash:String(q.buildHash),cumulativeXp:String(p.cumulativeXp),furthestCompleted:p.hasCheckpoint?String(p.furthestCheckpoint):null};
 }
 async allowance(){await this.verify();return BigInt(await this.currency.allowance(this.wallet,this.deployment.market));}
 private async send(work:()=>Promise<TransactionResponse>){
  await this.verify();const block=BigInt(await this.provider.send('eth_blockNumber',[]));if(block>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Unsupported transaction observation block');
  // ContractTransactionResponse reconstructs the signer response. Explicitly
  // retain replacement scanning from the block before submission.
  return (await work()).replaceableTransaction(Number(block));
 }
 async approveCurrency(amount:bigint){return this.send(()=>this.currency.approve(this.deployment.market,amount));}
 async soldierApproved(value:SoldierAsset){await this.verify();return getAddress(await this.collection.getApproved(this.asset(value).tokenId))===this.deployment.market||Boolean(await this.collection.isApprovedForAll(this.wallet,this.deployment.market));}
 async approveSoldier(value:SoldierAsset){return this.send(()=>this.collection.approve(this.deployment.market,this.asset(value).tokenId));}
 async list(value:SoldierTokenTerms,price:string){return this.send(()=>this.market.listSoldier(this.asset(value.asset).tokenId,price,value.progressRevision,value.assetNonce));}
 async cancel(value:SoldierAsset){return this.send(()=>this.market.cancelListing(this.asset(value).tokenId));}
 async buy(value:SoldierSaleQuote){if(getAddress(value.market)!==this.deployment.market||getAddress(value.currency)!==this.deployment.currency)throw Error('Market quote identity mismatch');return this.send(()=>this.market.buyListed(this.asset(value.asset).tokenId,value.seller,value.price,value.listingNonce,value.progressRevision,value.assetNonce));}
}
