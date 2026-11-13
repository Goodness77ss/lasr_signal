import {it,expect} from 'vitest';
import {id} from 'ethers';
import {SoldierMarketController,soldierSaleQuote,type SoldierMarketPort,type SoldierMarketState,type SoldierTokenTerms,type SoldierSaleQuote,type MarketTransaction} from '../packages/chain/src/journey-market.ts';
const owner='0x1111111111111111111111111111111111111111',buyer='0x2222222222222222222222222222222222222222',collection='0x3333333333333333333333333333333333333333',market='0x4444444444444444444444444444444444444444',currency='0x5555555555555555555555555555555555555555';
const asset={kind:'soldier' as const,chainId:'31337',collection,tokenId:'1'};
function fixture(){
 const events:string[]=[],states:Readonly<SoldierMarketState>[]=[],state={allowance:99n,approved:false,fail:'' as string,afterApproval:()=>{},failRefresh:false};
 let token:SoldierTokenTerms={asset,owner,progressRevision:'1',assetNonce:'1',buildHash:id('build'),cumulativeXp:'10',furthestCompleted:'0',leaseActive:false};
 let quote:SoldierSaleQuote={asset,market,currency,seller:owner,price:'6',listingNonce:'1',progressRevision:'1',assetNonce:'1',buildHash:id('build'),cumulativeXp:'10',furthestCompleted:'0'};
 const tx=async(label:string,work:()=>void):Promise<MarketTransaction>=>{
  events.push(label);if(state.fail==='reject')throw Object.assign(Error('rejected'),{code:'ACTION_REJECTED'});
  return {hash:id(label),wait:async()=>{
   if(state.fail==='replace')throw Object.assign(Error('replacement'),{code:'TRANSACTION_REPLACED',replacement:{hash:id('replacement')},cancelled:false});
   if(state.fail==='cancel')throw Object.assign(Error('replacement cancel'),{code:'TRANSACTION_REPLACED',replacement:{hash:id('cancel')},cancelled:true});
   work();return {status:1,hash:id(label)};
  }};
 };
 const port:SoldierMarketPort={wallet:buyer,verify:async()=>{events.push('verify');},token:async()=>{if(state.failRefresh)throw Error('read unavailable');return structuredClone(token);},quote:async()=>structuredClone(quote),allowance:async()=>state.allowance,approveCurrency:amount=>tx('approve:'+amount,()=>{state.allowance=amount;state.afterApproval();}),soldierApproved:async()=>state.approved,approveSoldier:()=>tx('approve NFT',()=>{state.approved=true;}),list:(_,price)=>tx('list',()=>{quote={...quote,price,listingNonce:String(BigInt(quote.listingNonce)+1n)};}),cancel:()=>tx('cancel listing',()=>{}),buy:()=>tx('buy',()=>{token={...token,owner:buyer,assetNonce:'2'};state.allowance=0n;})};
 return {port,state,events,states,quote:()=>structuredClone(quote),token:()=>structuredClone(token),changeQuote:(patch:Partial<SoldierSaleQuote>)=>{quote={...quote,...patch};},setToken:(patch:Partial<SoldierTokenTerms>)=>{token={...token,...patch};},controller:new SoldierMarketController(port,s=>states.push(s))};
}
it('resets a stale allowance, approves the exact reviewed price and exposes wallet, pending and confirmed states',async()=>{
 const f=fixture();const received=await f.controller.buy(f.quote());expect(f.events.filter(e=>e!=='verify')).toEqual(['approve:0','approve:6','buy']);expect(received.owner).toBe(buyer);expect(f.state.allowance).toBe(0n);expect(f.controller.state.status).toBe('CONFIRMED');expect(f.states.filter(s=>s.status==='PENDING')).toHaveLength(3);expect(f.states.filter(s=>s.status==='AWAITING_WALLET')).toHaveLength(3);
});
it('requires review again when terms change during approval and submits no purchase',async()=>{
 const f=fixture();f.state.allowance=0n;f.state.afterApproval=()=>f.changeQuote({listingNonce:'2'});await expect(f.controller.buy(f.quote())).rejects.toThrow('Refresh');expect(f.controller.state.status).toBe('STALE');expect(f.events).not.toContain('buy');expect(f.state.allowance).toBe(6n);
});
it('stops after wallet rejection or transaction replacement without retrying or continuing the purchase',async()=>{
 for(const fail of ['reject','replace','cancel']){
  const f=fixture();f.state.fail=fail;await expect(f.controller.buy(f.quote())).rejects.toThrow();expect(f.controller.state.status).toBe(fail==='reject'?'REJECTED':'REPLACED');expect(f.events.filter(e=>e!=='verify')).toEqual(['approve:0']);if(fail!=='reject')expect(f.controller.state.hash).toBe(id(fail==='replace'?'replacement':'cancel'));
 }
});
it('rejects wrong market, changed history and self purchase without granting a new allowance',async()=>{
 for(const patch of [{market:currency},{progressRevision:'2'},{cumulativeXp:'11'},{assetNonce:'2'}]){
  const f=fixture(),reviewed=f.quote();f.changeQuote(patch);await expect(f.controller.buy(reviewed)).rejects.toThrow('Refresh');expect(f.events.filter(e=>e.startsWith('approve'))).toHaveLength(0);
 }
 const f=fixture();await expect(f.controller.buy({...f.quote(),seller:buyer})).rejects.toThrow('another wallet');expect(()=>soldierSaleQuote({...f.quote(),price:'06'})).toThrow();
});
it('approves only the selected NFT, lists the seller price, refreshes and cancels without currency spending',async()=>{
 const f=fixture();Object.defineProperty(f.port,'wallet',{value:owner});const q=await f.controller.list(f.token(),'9');expect(q.price).toBe('9');expect(f.events.filter(e=>e!=='verify')).toEqual(['approve NFT','list']);await f.controller.cancel(asset);expect(f.events).toContain('cancel listing');expect((await f.controller.refresh(asset)).owner).toBe(owner);expect(f.controller.state.status).toBe('READY');
});
it('blocks leased or changed seller terms and prevents overlapping actions',async()=>{
 const f=fixture();Object.defineProperty(f.port,'wallet',{value:owner});f.setToken({leaseActive:true});await expect(f.controller.list(f.token(),'9')).rejects.toThrow('Refresh');expect(f.events).not.toContain('approve NFT');
 const g=fixture();let done!:()=>void;g.port.verify=()=>new Promise<void>(resolve=>{done=resolve;});const work=g.controller.buy(g.quote());await new Promise(resolve=>setTimeout(resolve,0));await expect(g.controller.review(asset)).rejects.toThrow('Finish');g.port.verify=async()=>{};done();await work;
});
it('preserves a confirmed transaction hash when the final ownership refresh fails',async()=>{
 const f=fixture();f.state.allowance=6n;f.port.token=async()=>{throw Error('read unavailable');};await expect(f.controller.buy(f.quote())).rejects.toThrow('read unavailable');expect(f.controller.state.status).toBe('REFRESH_REQUIRED');expect(f.controller.state.hash).toBe(id('buy'));expect(f.events.filter(e=>e==='buy')).toHaveLength(1);
});
