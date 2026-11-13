import {test,before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {id,keccak256,parseEther,ZeroAddress} from 'ethers';
import {startEvm} from '../scripts/evm.ts';
import {fixture,deploy,as,receipt,timestamp} from '../scripts/shared.ts';
import {JOURNEY_SOLDIER_BUILDS,SOLDIER_PROGRESS_POLICY,soldierProgressDomain,soldierProgressTypes,soldierRunHash,SoldierMarketController,type SoldierProgressVoucher,type SoldierMarketState} from '@last-signal/chain';
import {pinJourneyRules,JOURNEY_REWARD_STREAM_RULES} from '../../sim/src/journey/rules.ts';
import {SoldierCollections,type SoldierCollectionDeployment,type SoldierMarketDeployment} from '../../../apps/server/src/journey-soldiers.ts';
import {JourneyAssetCatalog} from '../../../apps/server/src/journey-assets.ts';
import {SoldierMarketWallet} from '../../../apps/web/src/journey-market-wallet.ts';
import {buildServer} from '../../../apps/server/src/app.ts';
let evm:Awaited<ReturnType<typeof startEvm>>,f:Awaited<ReturnType<typeof fixture>>,soldiers:Awaited<ReturnType<typeof deploy>>,market:Awaited<ReturnType<typeof deploy>>,snapshot:string,rulesHash:string;
before(async()=>{
 evm=await startEvm(18582);f=await fixture(evm.provider);rulesHash='0x'+(await pinJourneyRules(JOURNEY_REWARD_STREAM_RULES)).hash;
 soldiers=await deploy(f.artifacts.JourneySoldiers,f.deployer,[f.authority.address,rulesHash,JOURNEY_SOLDIER_BUILDS.map(b=>b.hash),10]);market=await deploy(f.artifacts.JourneySoldierMarket,f.deployer,[soldiers.target,f.token.target]);
 await receipt(soldiers.mintDevelopment(f.a.address,0,id('market fixture soldier')),'mint authorized local soldier');
});
after(async()=>{evm?.provider.destroy();await evm?.stop();});beforeEach(async()=>{snapshot=await evm.provider.send('evm_snapshot',[]);});afterEach(async()=>{await evm.provider.send('evm_revert',[snapshot]);});
const price=parseEther('6');
type Quote={seller:string;price:bigint;nonce:bigint;progressRevision:bigint;assetNonce:bigint;buildHash:string};
const quote=async():Promise<Quote>=>{const q=await market.quote(1);return {seller:q.seller,price:q.price,nonce:q.nonce,progressRevision:q.progressRevision,assetNonce:q.assetNonce,buildHash:q.buildHash};};
async function list(amount=price){await receipt(as(soldiers,f.a).approve(market.target,1),'approve exact NFT');await receipt(as(market,f.a).listSoldier(1,amount,(await soldiers.progress(1)).revision,await soldiers.progressNonce(1)),'seller chooses fixture asking price');return quote();}
const terms=(q:Awaited<ReturnType<typeof quote>>)=>[1,q.seller,q.price,q.nonce,q.progressRevision,q.assetNonce];
async function progress(xp='10'){
 const p:SoldierProgressVoucher={tokenId:'1',owner:f.a.address,bankSource:id('authored market progress '+xp),rulesHash,policy:SOLDIER_PROGRESS_POLICY,nonce:String(await soldiers.progressNonce(1)),cumulativeXp:xp,furthestCheckpoint:'0',hasCheckpoint:true,expiry:String(await timestamp(evm.provider)+3600n)};
 await receipt(as(soldiers,f.a).applyProgress(p,await f.authority.signTypedData(soldierProgressDomain(31337n,String(soldiers.target)),soldierProgressTypes,p)),'accept authored market progress fixture');
}

test('atomic fixed price sale pays exactly the seller and preserves immutable build and verified token history',async()=>{
 await progress();const q=await list(),before=await soldiers.tokenURI(1),source=await soldiers.provenance(1),balances=[await f.token.balanceOf(f.a.address),await f.token.balanceOf(f.b.address)];
 await receipt(as(f.token,f.b).approve(market.target,q.price),'approve exact sale amount');await receipt(as(market,f.b).buyListed(...terms(q)),'buy progressed soldier');
 assert.equal(await soldiers.ownerOf(1),f.b.address);assert.equal(await f.token.balanceOf(f.a.address),balances[0]+price);assert.equal(await f.token.balanceOf(f.b.address),balances[1]-price);assert.equal(await f.token.allowance(f.b.address,market.target),0n);assert.equal(await f.token.balanceOf(market.target),0n);
 assert.equal(await soldiers.tokenURI(1),before);assert.equal(await soldiers.provenance(1),source);assert.equal(await soldiers.buildHash(1),JOURNEY_SOLDIER_BUILDS[0].hash);assert.equal((await soldiers.progress(1)).revision,1n);assert.equal((await soldiers.progress(1)).cumulativeXp,10n);assert.equal((await market.listings(1)).seller,ZeroAddress);assert.equal(await market.listingNonce(1),q.nonce+1n);await assert.rejects(as(market,f.b).buyListed(...terms(q)));
});

test('rejects wrong seller, self purchase, altered quote fields, unsupported identities and stale listing inputs',async()=>{
 await assert.rejects(as(market,f.b).listSoldier(1,price,0,0));await assert.rejects(as(market,f.a).listSoldier(1,0,0,0));await assert.rejects(as(market,f.a).listSoldier(1,price,1,0));await assert.rejects(as(market,f.a).listSoldier(1,price,0,1));await assert.rejects(market.quote(0));
 const q=await list();await assert.rejects(as(market,f.a).buyListed(...terms(q)));await receipt(as(f.token,f.b).approve(market.target,price),'approve fixture price');
 for(const patch of [{seller:f.b.address},{price:q.price+1n},{nonce:q.nonce+1n},{progressRevision:1n},{assetNonce:1n}])await assert.rejects(as(market,f.b).buyListed(...terms({...q,...patch})));assert.equal(await soldiers.ownerOf(1),f.a.address);
 await assert.rejects(deploy(f.artifacts.JourneySoldierMarket,f.deployer,[ZeroAddress,f.token.target]));await assert.rejects(deploy(f.artifacts.JourneySoldierMarket,f.deployer,[soldiers.target,ZeroAddress]));await assert.rejects(deploy(f.artifacts.JourneySoldierMarket,f.deployer,[soldiers.target,soldiers.target]));
});

test('same price relisting, cancellation and changed price invalidate prior quotes',async()=>{
 const old=await list(),same=await list();assert.equal(old.price,same.price);assert.notEqual(old.nonce,same.nonce);await assert.rejects(as(market,f.b).buyListed(...terms(old)));
 await receipt(as(market,f.a).cancelListing(1),'cancel seller listing');await assert.rejects(market.quote(1));await assert.rejects(as(market,f.b).cancelListing(1));
 const changed=await list(price+1n);await assert.rejects(as(market,f.b).buyListed(...terms(same)));assert.equal(changed.price,price+1n);assert.equal(await market.listingNonce(1),4n);
});

test('progress changes invalidate terms without automatically changing the seller asking price',async()=>{
 const old=await list();await progress();await assert.rejects(market.quote(1));await assert.rejects(as(market,f.b).buyListed(...terms(old)));assert.equal((await market.listings(1)).price,price);
 const fresh=await list();assert.equal(fresh.progressRevision,1n);assert.equal(fresh.price,price);await receipt(as(f.token,f.b).approve(market.target,price),'approve refreshed terms');await receipt(as(market,f.b).buyListed(...terms(fresh)),'buy reviewed revised history');
});

test('a lease blocks listing and settlement and release does not revive an older listing',async()=>{
 const old=await list();await receipt(as(soldiers,f.a).startLease(1,soldierRunHash('market-active-run'),f.b.address,await timestamp(evm.provider)+100n),'owner starts lease');
 await assert.rejects(as(market,f.a).listSoldier(1,price,0,await soldiers.progressNonce(1)));await assert.rejects(market.quote(1));await assert.rejects(as(market,f.b).buyListed(...terms(old)));
 await receipt(as(soldiers,f.b).releaseLease(1,(await soldiers.runLease(1)).id),'service releases lease');await assert.rejects(market.quote(1));const fresh=await list();assert.notEqual(fresh.assetNonce,old.assetNonce);
});

test('external transfer and return cannot revive a seller quote',async()=>{
 const old=await list();await receipt(as(soldiers,f.a).transferFrom(f.a.address,f.b.address,1),'external transfer');await assert.rejects(market.quote(1));await receipt(as(soldiers,f.b).transferFrom(f.b.address,f.a.address,1),'return original owner');await assert.rejects(market.quote(1));await assert.rejects(as(market,f.b).buyListed(...terms(old)));assert.equal((await market.listings(1)).seller,f.a.address);
});

test('failed approval, underpayment and false returning currency revert payment, listing and NFT state',async()=>{
 const q=await list();await assert.rejects(as(market,f.b).buyListed(...terms(q)));assert.equal((await market.quote(1)).nonce,q.nonce);
 const hostile=await deploy(f.artifacts.HostileToken,f.deployer),other=await deploy(f.artifacts.JourneySoldierMarket,f.deployer,[soldiers.target,hostile.target]);await receipt(hostile.mint(f.b.address,price),'fund hostile fixture');await receipt(as(soldiers,f.a).approve(other.target,1),'approve fixture market');await receipt(as(other,f.a).listSoldier(1,price,0,0),'fixture listing');const offer=await other.quote(1);
 for(const mode of [1,2]){
  await receipt(hostile.setMode(mode),'set hostile transfer fixture');await receipt(as(hostile,f.b).approve(other.target,price),'exact hostile allowance');await assert.rejects(as(other,f.b).buyListed(...terms(offer)));assert.equal(await hostile.balanceOf(f.a.address),0n);assert.equal(await hostile.balanceOf(f.b.address),price);assert.equal(await hostile.allowance(f.b.address,other.target),price);assert.equal((await other.quote(1)).nonce,offer.nonce);assert.equal(await soldiers.ownerOf(1),f.a.address);assert.equal(await soldiers.progressNonce(1),0n);
 }
});

test('rejected NFT delivery rolls back payment, listing, approval and progress nonce',async()=>{
 const q=await list(),rejector=await deploy(f.artifacts.RejectingSoldierBuyer,f.deployer);await receipt(as(f.token,f.b).transfer(rejector.target,price),'fund rejecting receiver');const before=await f.token.balanceOf(f.a.address);
 await assert.rejects(rejector.buy(f.token.target,market.target,...terms(q)));assert.equal(await f.token.balanceOf(f.a.address),before);assert.equal(await f.token.balanceOf(rejector.target),price);assert.equal(await f.token.allowance(rejector.target,market.target),0n);assert.equal(await soldiers.ownerOf(1),f.a.address);assert.equal(await soldiers.progressNonce(1),0n);assert.equal((await market.quote(1)).nonce,q.nonce);assert.equal(await soldiers.getApproved(1),market.target);
});

async function manifests(){
 const deployment:SoldierCollectionDeployment={version:'JOURNEY_SOLDIERS_V1',chainId:31337,collection:String(soldiers.target),mintAuthority:f.deployer.address,gameplaySigner:f.authority.address,rulesHash,codeHash:keccak256(await evm.provider.getCode(soldiers.target)),classSupplyCap:10,maxSupply:70};
 const exchange:SoldierMarketDeployment={version:'JOURNEY_SOLDIER_MARKET_V1',chainId:31337,market:String(market.target),collection:String(soldiers.target),currency:String(f.token.target),codeHash:keccak256(await evm.provider.getCode(market.target)),currencyCodeHash:keccak256(await evm.provider.getCode(f.token.target))};
 return {deployment,exchange,wallet:{chainId:31337 as const,collection:deployment.collection,market:exchange.market,currency:exchange.currency,collectionCodeHash:deployment.codeHash,marketCodeHash:exchange.codeHash,currencyCodeHash:exchange.currencyCodeHash}};
}
const identity=()=>({kind:'soldier' as const,chainId:'31337',collection:String(soldiers.target),tokenId:'1'});
test('real wallet controllers list, reset stale allowance, buy once and see the same history through checked API reads',async()=>{
 await progress();const {deployment,exchange,wallet}=await manifests(),adapter=new SoldierCollections(evm.provider,deployment,exchange),catalog=new JourneyAssetCatalog(null,[],adapter);
 const seller=new SoldierMarketController(new SoldierMarketWallet(evm.provider,f.a,f.a.address,wallet)),states:Readonly<SoldierMarketState>[]=[],buyer=new SoldierMarketController(new SoldierMarketWallet(evm.provider,f.b,f.b.address,wallet),state=>states.push(state));
 assert.equal((await adapter.inspect(identity())).capabilities.list,true);const listed=await seller.list(await seller.refresh(identity()),String(price));assert.equal(listed.progressRevision,'1');assert.equal((await catalog.quote(identity())).price,String(price));
 const server=await buildServer({database:':memory:',manual:true,journeySoldiers:{provider:evm.provider,deployment,market:exchange}});
 try{
  const url='/weapons/journey-quote?kind=soldier&chainId=31337&collection='+soldiers.target+'&tokenId=1',response=await server.app.inject(url);assert.equal(response.statusCode,200);assert.equal(response.json().seller,f.a.address);assert.equal(response.json().progressRevision,'1');assert.equal(response.json().cumulativeXp,'10');
  await receipt(as(f.token,f.b).approve(market.target,price+1n),'deliberately stale local allowance');const block=Number(BigInt(await evm.provider.send('eth_blockNumber',[])));
  const reviewed=await buyer.review(identity()),received=await buyer.buy(reviewed);assert.equal(received.owner,f.b.address);assert.equal(received.cumulativeXp,'10');assert.equal(received.furthestCompleted,'0');assert.equal((await seller.refresh(identity())).owner,f.b.address);
  const approvals=await f.token.queryFilter(f.token.filters.Approval(f.b.address,market.target),block+1,'latest');assert.deepEqual(approvals.map(log=>f.token.interface.parseLog(log)!.args.value),[0n,price]);assert.equal(await f.token.allowance(f.b.address,market.target),0n);assert.equal(states.filter(s=>s.status==='PENDING').length,3);assert.equal(buyer.state.status,'CONFIRMED');assert.equal((await server.app.inject(url)).statusCode,400);
 }finally{await server.app.close();}
});

test('market adapters reject mismatched code, currency and disabled collections without enabling owned combat',async()=>{
 await list();const {deployment,exchange,wallet}=await manifests();
 for(const patch of [{codeHash:id('wrong market code')},{currencyCodeHash:id('wrong currency code')},{currency:String(f.escrow.target),currencyCodeHash:keccak256(await evm.provider.getCode(f.escrow.target))}])await assert.rejects(new SoldierCollections(evm.provider,deployment,{...exchange,...patch}).quote(identity()));
 const adapter=new SoldierCollections(evm.provider,deployment,exchange);await assert.rejects(new JourneyAssetCatalog(null,[{chainId:'31337',collection:String(soldiers.target)}],adapter).quote(identity()));assert.equal((await adapter.inspect(identity())).capabilities.journeyCombatReady,false);
 const badWallet=new SoldierMarketWallet(evm.provider,f.b,f.b.address,{...wallet,marketCodeHash:id('unregistered code')});await assert.rejects(badWallet.quote(identity()));
});

test('actual repriced and cancelled pending approvals stop the wallet flow for a new review', {timeout:30000},async()=>{
 const {wallet}=await manifests();
 for(const cancelled of [false,true]){
  await list();await receipt(as(f.token,f.b).approve(market.target,0),'reset replacement fixture allowance');
  let pending!:(hash:string)=>void;const submitted=new Promise<string>(resolve=>{pending=resolve;}),buyer=new SoldierMarketController(new SoldierMarketWallet(evm.provider,f.b,f.b.address,wallet),state=>{if(state.status==='PENDING')pending(state.hash!);});
  const reviewed=await buyer.review(identity());await evm.provider.send('evm_setAutomine',[false]);
  try{
   const work=buyer.buy(reviewed);const outcome=work.then(()=>({ok:true,error:null}),error=>({ok:false,error}));
   const hash=await submitted,original=await evm.provider.getTransaction(hash);assert.ok(original);
   const replacement=await f.b.sendTransaction({to:cancelled?f.b.address:original.to!,data:cancelled?'0x':original.data,value:0,nonce:original.nonce,gasLimit:cancelled?21000:original.gasLimit,maxFeePerGas:(original.maxFeePerGas??original.gasPrice)*2n+1n,maxPriorityFeePerGas:(original.maxPriorityFeePerGas??original.gasPrice)*2n+1n});
   await evm.provider.send('evm_mine',[]);await replacement.wait();await new Promise(resolve=>setTimeout(resolve,100));await evm.provider.send('evm_mine',[]);
   const result=await outcome;assert.equal(result.ok,false);assert.equal(result.error.code,'TRANSACTION_REPLACED');assert.equal(buyer.state.status,'REPLACED');assert.equal(buyer.state.hash,replacement.hash);assert.equal(await soldiers.ownerOf(1),f.a.address);assert.equal(await f.token.allowance(f.b.address,market.target),cancelled?0n:price);
  }finally{await evm.provider.send('evm_setAutomine',[true]);await evm.provider.send('evm_mine',[]);}
 }
});
