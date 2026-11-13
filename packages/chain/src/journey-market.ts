import {getAddress,ZeroAddress} from 'ethers';
import {journeyAsset,assetInteger,type JourneyAsset} from './journey-assets.ts';
export type SoldierAsset=Extract<JourneyAsset,{kind:'soldier'}>;
export type SoldierTokenTerms={asset:SoldierAsset;owner:string;progressRevision:string;assetNonce:string;buildHash:string;cumulativeXp:string;furthestCompleted:string|null;leaseActive:boolean};
export type SoldierSaleQuote={asset:SoldierAsset;market:string;currency:string;seller:string;price:string;listingNonce:string;progressRevision:string;assetNonce:string;buildHash:string;cumulativeXp:string;furthestCompleted:string|null};
export type MarketTransaction={hash:string;wait():Promise<{status:number|null;hash:string}|null>};
export interface SoldierMarketPort {
  readonly wallet:string;
  verify():Promise<void>;
  token(asset:SoldierAsset):Promise<SoldierTokenTerms>;
  quote(asset:SoldierAsset):Promise<SoldierSaleQuote>;
  allowance():Promise<bigint>;
  approveCurrency(amount:bigint):Promise<MarketTransaction>;
  soldierApproved(asset:SoldierAsset):Promise<boolean>;
  approveSoldier(asset:SoldierAsset):Promise<MarketTransaction>;
  list(token:SoldierTokenTerms,price:string):Promise<MarketTransaction>;
  cancel(asset:SoldierAsset):Promise<MarketTransaction>;
  buy(quote:SoldierSaleQuote):Promise<MarketTransaction>;
}
export type SoldierMarketState={status:'IDLE'|'REFRESHING'|'READY'|'AWAITING_WALLET'|'PENDING'|'CONFIRMED'|'REJECTED'|'REPLACED'|'STALE'|'FAILED'|'REFRESH_REQUIRED';action:string;hash?:string;message?:string};
const address=(value:string)=>{const result=getAddress(value);if(result===ZeroAddress)throw Error('Nonzero market address required');return result;};
const build=(value:string)=>{if(!/^0x[\da-fA-F]{64}$/.test(value))throw Error('Exact soldier build required');return value.toLowerCase();};
function soldier(value:SoldierAsset):SoldierAsset{const asset=journeyAsset(value);if(asset.kind!=='soldier'||asset.chainId!=='31337')throw Error('Local soldier asset required');return asset;}
export function soldierSaleQuote(value:SoldierSaleQuote):SoldierSaleQuote {
 return {asset:soldier(value.asset),market:address(value.market),currency:address(value.currency),seller:address(value.seller),price:assetInteger(value.price,true),listingNonce:assetInteger(value.listingNonce,true),progressRevision:assetInteger(value.progressRevision),assetNonce:assetInteger(value.assetNonce),buildHash:build(value.buildHash),cumulativeXp:assetInteger(value.cumulativeXp),furthestCompleted:value.furthestCompleted===null?null:assetInteger(value.furthestCompleted)};
}
function tokenTerms(value:SoldierTokenTerms):SoldierTokenTerms {
 if(typeof value.leaseActive!=='boolean')throw Error('Explicit soldier availability required');
 return {asset:soldier(value.asset),owner:address(value.owner),progressRevision:assetInteger(value.progressRevision),assetNonce:assetInteger(value.assetNonce),buildHash:build(value.buildHash),cumulativeXp:assetInteger(value.cumulativeXp),furthestCompleted:value.furthestCompleted===null?null:assetInteger(value.furthestCompleted),leaseActive:value.leaseActive};
}
export class SoldierTermsChangedError extends Error {constructor(){super('The soldier or listing changed. Refresh and review it again.');}}
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

/** Shared transaction flow for the later Armory panel. No automatic retry or
 * spending follows a rejected, replaced or stale transaction. */
export class SoldierMarketController {
 private busy=false;
 private current:Readonly<SoldierMarketState>=Object.freeze({status:'IDLE',action:''});
 constructor(private port:SoldierMarketPort,private changed:(state:Readonly<SoldierMarketState>)=>void=()=>{}){}
 get state(){return this.current;}
 private set(value:SoldierMarketState){this.current=Object.freeze(value);this.changed(this.current);}
 private async action<T>(label:string,work:()=>Promise<T>):Promise<T>{
  if(this.busy)throw Error('Finish the current wallet request first.');this.busy=true;this.set({status:'REFRESHING',action:label});
  try{return await work();}catch(error){
   const e=error as {code?:string|number;message?:string;replacement?:{hash?:string};receipt?:{hash?:string}};
   const status:SoldierMarketState['status']=e.code===4001||e.code==='ACTION_REJECTED'?'REJECTED':e.code==='TRANSACTION_REPLACED'?'REPLACED':error instanceof SoldierTermsChangedError?'STALE':this.current.status==='CONFIRMED'?'REFRESH_REQUIRED':'FAILED';
   this.set({status,action:label,hash:e.replacement?.hash??e.receipt?.hash??this.current.hash,message:status==='REPLACED'?'Transaction replaced or cancelled. Refresh chain state before retrying.':status==='REJECTED'?'Wallet request rejected. No automatic retry.':(e.message??'Market request failed').slice(0,512)});throw error;
  }finally{this.busy=false;}
 }
 private async transact(label:string,send:()=>Promise<MarketTransaction>){
  await this.port.verify();this.set({status:'AWAITING_WALLET',action:label});const tx=await send();this.set({status:'PENDING',action:label,hash:tx.hash});const receipt=await tx.wait();
  if(!receipt||receipt.status!==1)throw Error('Market transaction did not confirm successfully.');this.set({status:'CONFIRMED',action:label,hash:receipt.hash});return receipt;
 }
 refresh(asset:SoldierAsset){return this.action('Refresh soldier',async()=>{const token=tokenTerms(await this.port.token(soldier(asset)));this.set({status:'READY',action:'Refresh soldier'});return token;});}
 review(asset:SoldierAsset){return this.action('Review listing',async()=>{const quote=soldierSaleQuote(await this.port.quote(soldier(asset)));this.set({status:'READY',action:'Review listing'});return quote;});}
 list(reviewed:SoldierTokenTerms,price:string){const selected=tokenTerms(reviewed);price=assetInteger(price,true);return this.action('List soldier',async()=>{
  const recheck=async()=>{const current=tokenTerms(await this.port.token(selected.asset));if(!equal(current,selected)||current.owner!==getAddress(this.port.wallet)||current.leaseActive)throw new SoldierTermsChangedError();};
  await recheck();if(!await this.port.soldierApproved(selected.asset)){await this.transact('Approve this soldier',()=>this.port.approveSoldier(selected.asset));await recheck();}
  await this.transact('List soldier',()=>this.port.list(selected,price));return soldierSaleQuote(await this.port.quote(selected.asset));
 });}
 cancel(asset:SoldierAsset){asset=soldier(asset);return this.action('Cancel listing',async()=>{
  if((await this.port.token(asset)).owner!==getAddress(this.port.wallet))throw new SoldierTermsChangedError();await this.transact('Cancel listing',()=>this.port.cancel(asset));return tokenTerms(await this.port.token(asset));
 });}
 buy(reviewed:SoldierSaleQuote){const selected=soldierSaleQuote(reviewed);return this.action('Buy soldier',async()=>{
  if(selected.seller===getAddress(this.port.wallet))throw Error('Choose a soldier listed by another wallet.');
  const recheck=async()=>{if(!equal(soldierSaleQuote(await this.port.quote(selected.asset)),selected))throw new SoldierTermsChangedError();};
  await recheck();const amount=BigInt(selected.price),old=await this.port.allowance();
  if(old!==amount){if(old>0n){await this.transact('Reset stale allowance',()=>this.port.approveCurrency(0n));await recheck();}await this.transact('Approve exact asking price',()=>this.port.approveCurrency(amount));}
  await recheck();await this.transact('Buy soldier',()=>this.port.buy(selected));return tokenTerms(await this.port.token(selected.asset));
 });}
}
