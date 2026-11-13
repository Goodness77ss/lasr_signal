import {BrowserProvider,Contract,getAddress,keccak256,type JsonRpcProvider,type Signer,type TransactionResponse} from 'ethers';
import {SupplyWallet,type SupplyWalletDeployment} from './journey-supply-wallet.ts';
import marketAbi from '../../../packages/contracts/abi/JourneySupplyMarket.json';
import tokenAbi from '../../../packages/contracts/abi/TestWIF.json';
export type SupplyMarketDeployment=SupplyWalletDeployment&{market:string;currency:string;marketCodeHash:string;currencyCodeHash:string};
export type SupplyQuote=Readonly<{seller:string;itemClass:number;quantity:string;available:string;unitPrice:string;total:string;revision:string;expiry:string}>;
export class SupplyMarketWallet extends SupplyWallet {
 private market:Contract;private currency:Contract;private terms:SupplyMarketDeployment;
 constructor(provider:BrowserProvider|JsonRpcProvider,signer:Signer,wallet:string,deployment:SupplyMarketDeployment){
  super(provider,signer,wallet,deployment);
  this.terms={...deployment,market:getAddress(deployment.market),currency:getAddress(deployment.currency)};
  for(const hash of [deployment.marketCodeHash,deployment.currencyCodeHash])if(!/^0x[0-9a-fA-F]{64}$/.test(hash))throw Error('Checked supply market required');
  this.market=new Contract(this.terms.market,marketAbi,signer);this.currency=new Contract(this.terms.currency,tokenAbi,signer);
 }
 override async verify(){
  await super.verify();
  for(const [address,hash] of [[this.terms.market,this.terms.marketCodeHash],[this.terms.currency,this.terms.currencyCodeHash]])if(keccak256(await this.provider.getCode(address))!==hash)throw Error('Supply market code mismatch');
  if(getAddress(await this.market.collection())!==this.deployment.collection||getAddress(await this.market.currency())!==this.terms.currency)throw Error('Supply market identity mismatch');
 }
 private async send(work:()=>Promise<TransactionResponse>){await this.verify();const head=BigInt(await this.provider.send('eth_blockNumber',[]));if(head>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Unsupported block');return (await work()).replaceableTransaction(Number(head));}
 async approvePacks(approved:boolean){return this.send(()=>this.contract.setApprovalForAll(this.terms.market,approved));}
 async packsApproved(){await this.verify();return Boolean(await this.contract.isApprovedForAll(this.wallet,this.terms.market));}
 async allowance(){await this.verify();return BigInt(await this.currency.allowance(this.wallet,this.terms.market));}
 async approveCurrency(exactTotal:bigint){if(exactTotal<0n)throw Error('Invalid allowance');return this.send(()=>this.currency.approve(this.terms.market,exactTotal));}
 async list(itemClass:number,quantity:bigint,unitPrice:bigint,expiry:bigint){if(quantity<1n||unitPrice<1n||quantity>await this.packs(itemClass))throw Error('Invalid listing quantity or price');return this.send(()=>this.market.list(itemClass,quantity,unitPrice,expiry));}
 async cancel(itemClass:number){await this.packs(itemClass);return this.send(()=>this.market.cancel(itemClass));}
 async quote(seller:string,itemClass:number,quantity:bigint):Promise<SupplyQuote>{
  await this.packs(itemClass);seller=getAddress(seller);const q=await this.market.quote(seller,itemClass);
  if(quantity<1n||quantity>BigInt(q.quantity))throw Error('Unavailable pack quantity');
  return Object.freeze({seller,itemClass,quantity:String(quantity),available:String(q.quantity),unitPrice:String(q.unitPrice),total:String(quantity*BigInt(q.unitPrice)),revision:String(q.revision),expiry:String(q.expiry)});
 }
 async buy(reviewed:SupplyQuote){
  const current=await this.quote(reviewed.seller,reviewed.itemClass,BigInt(reviewed.quantity));
  if(JSON.stringify(current)!==JSON.stringify(reviewed))throw Error('Supply quote changed. Review again.');
  return this.send(()=>this.market.buy(current.seller,current.itemClass,current.quantity,current.unitPrice,current.total,current.revision,current.expiry));
 }
}
