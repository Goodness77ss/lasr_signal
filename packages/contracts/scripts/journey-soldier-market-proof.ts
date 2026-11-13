import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {id,keccak256,Wallet,parseEther} from 'ethers';
import {startEvm} from './evm.ts';
import {compile} from './compile.ts';
import {deploy,as,receipt,timestamp,type Receipt} from './shared.ts';
import {JOURNEY_SOLDIER_BUILDS,SOLDIER_PROGRESS_POLICY,soldierProgressDomain,soldierProgressTypes,SoldierMarketController,type SoldierProgressVoucher,type SoldierMarketState} from '@last-signal/chain';
import {pinJourneyRules,JOURNEY_REWARD_STREAM_RULES} from '../../sim/src/journey/rules.ts';
import {SoldierCollections,type SoldierCollectionDeployment,type SoldierMarketDeployment} from '../../../apps/server/src/journey-soldiers.ts';
import {SoldierMarketWallet} from '../../../apps/web/src/journey-market-wallet.ts';
import {buildServer} from '../../../apps/server/src/app.ts';
const evm=await startEvm(18583);
try{
 const deployer=await evm.provider.getSigner(0),a=await evm.provider.getSigner(1),b=await evm.provider.getSigner(2),authority=Wallet.createRandom(),artifacts=compile(),receipts:Receipt[]=[];
 const token=await deploy(artifacts.TestWIF,deployer,[],receipts,'deploy disposable mock currency');await receipt(as(token,a).faucet(),'mock faucet for seller',receipts);await receipt(as(token,b).faucet(),'mock faucet for buyer',receipts);
 const rulesHash='0x'+(await pinJourneyRules(JOURNEY_REWARD_STREAM_RULES)).hash;
 const soldiers=await deploy(artifacts.JourneySoldiers,deployer,[authority.address,rulesHash,JOURNEY_SOLDIER_BUILDS.map(b=>b.hash),10],receipts,'deploy approved local soldier collection'),market=await deploy(artifacts.JourneySoldierMarket,deployer,[soldiers.target,token.target],receipts,'deploy separate local fixed price exchange');
 const deployment:SoldierCollectionDeployment={version:'JOURNEY_SOLDIERS_V1',chainId:31337,collection:String(soldiers.target),mintAuthority:deployer.address,gameplaySigner:authority.address,rulesHash,codeHash:keccak256(await evm.provider.getCode(soldiers.target)),classSupplyCap:10,maxSupply:70};
 const exchange:SoldierMarketDeployment={version:'JOURNEY_SOLDIER_MARKET_V1',chainId:31337,collection:String(soldiers.target),market:String(market.target),currency:String(token.target),codeHash:keccak256(await evm.provider.getCode(market.target)),currencyCodeHash:keccak256(await evm.provider.getCode(token.target))};
 const wallet={chainId:31337 as const,collection:deployment.collection,market:exchange.market,currency:exchange.currency,collectionCodeHash:deployment.codeHash,marketCodeHash:exchange.codeHash,currencyCodeHash:exchange.currencyCodeHash};
 await receipt(soldiers.mintDevelopment(a.address,0,id('authorized market proof soldier')),'authorized development mint with no purchase price',receipts);
 const progress:SoldierProgressVoucher={tokenId:'1',owner:a.address,bankSource:id('authored market proof progress source'),rulesHash,policy:SOLDIER_PROGRESS_POLICY,nonce:'0',cumulativeXp:'10',furthestCheckpoint:'0',hasCheckpoint:true,expiry:String(await timestamp(evm.provider)+3600n)};
 await receipt(as(soldiers,a).applyProgress(progress,await authority.signTypedData(soldierProgressDomain(31337n,String(soldiers.target)),soldierProgressTypes,progress)),'accept authored signed cosmetic progress fixture',receipts);
 const asset={kind:'soldier' as const,chainId:'31337',collection:String(soldiers.target),tokenId:'1'},adapter=new SoldierCollections(evm.provider,deployment,exchange),before=await adapter.inspect(asset),confirmed:{label:string;hash:string}[]=[],sellerStates:Readonly<SoldierMarketState>[]=[],buyerStates:Readonly<SoldierMarketState>[]=[];
 const record=(states:Readonly<SoldierMarketState>[]) =>(state:Readonly<SoldierMarketState>)=>{states.push(state);if(state.status==='CONFIRMED')confirmed.push({label:state.action,hash:state.hash!});};
 const seller=new SoldierMarketController(new SoldierMarketWallet(evm.provider,a,a.address,wallet),record(sellerStates)),buyer=new SoldierMarketController(new SoldierMarketWallet(evm.provider,b,b.address,wallet),record(buyerStates));
 // This is a seller chosen local fixture price, not a mint price or market valuation.
 const price=parseEther('6'),listed=await seller.list(await seller.refresh(asset),String(price));
 const server=await buildServer({database:':memory:',manual:true,journeySoldiers:{provider:evm.provider,deployment,market:exchange}});
 let publicQuote:unknown;
 try{const response=await server.app.inject('/weapons/journey-quote?kind=soldier&chainId=31337&collection='+soldiers.target+'&tokenId=1');assert.equal(response.statusCode,200);publicQuote=response.json();}finally{await server.app.close();}
 await receipt(as(token,b).approve(market.target,price+1n),'set stale allowance fixture',receipts);const balancesBefore={seller:String(await token.balanceOf(a.address)),buyer:String(await token.balanceOf(b.address))};
 const reviewed=await buyer.review(asset),received=await buyer.buy(reviewed),sellerView=await seller.refresh(asset);await evm.provider.send('evm_mine',[]);const after=await adapter.owned(asset,b.address);
 assert.equal(received.owner,b.address);assert.equal(sellerView.owner,b.address);assert.equal(received.cumulativeXp,'10');assert.equal(await token.allowance(b.address,market.target),0n);assert.equal(before.uri,after.uri);assert.deepEqual(before.progress,after.progress);
 const balancesAfter={seller:String(await token.balanceOf(a.address)),buyer:String(await token.balanceOf(b.address))};assert.equal(BigInt(balancesAfter.seller)-BigInt(balancesBefore.seller),price);assert.equal(BigInt(balancesBefore.buyer)-BigInt(balancesAfter.buyer),price);await assert.rejects(adapter.quote(asset));
 for(const submitted of confirmed){const tx=await evm.provider.getTransaction(submitted.hash);assert.ok(tx);await receipt(tx,submitted.label,receipts);}receipts.sort((a,b)=>a.block-b.block);
 const report={generatedAt:new Date().toISOString(),environment:'DISPOSABLE_LOCAL_BLOCKCHAIN',deployment,exchange,receipts,listed,publicQuote,reviewed,before,after,received,sellerView,balancesBefore,balancesAfter,sellerStates,buyerStates,finalAllowance:'0',checks:{exactSellerPayment:true,historyUnchanged:true,listingConsumed:true,staleAllowanceReset:true,bothWalletsSeeBuyerOwnership:true},limits:'Actual local contracts, wallet transport and controller transactions, plus read only API inspection. The price is a seller chosen mock fixture. Progress is an authored signed fixture, not the gameplay bank bridge. No public deployment, human wallet interaction or real currency. Account achievements are separate and are not reassigned by a token sale.'};
 writeFileSync('docs/evidence/journey-soldier-market-proof.json',JSON.stringify(report,null,2)+'\n');
 writeFileSync('docs/evidence/journey-soldier-market-local-deployment.json',JSON.stringify({generatedAt:report.generatedAt,environment:report.environment,lifecycle:'Disposable node closed after proof; historical addresses only.',deployment,exchange,deploymentReceipts:receipts.filter(r=>r.label.startsWith('deploy '))},null,2)+'\n');
 console.log(JSON.stringify({environment:report.environment,receipts:receipts.length,price:String(price),progressRevision:after.progress.revision,checks:report.checks}));
}finally{evm.provider.destroy();await evm.stop();}
