import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {id,parseEther} from 'ethers';
import {compile} from './compile.ts';
import {startEvm} from './evm.ts';
import {fixture,deploy,as,receipt,type Receipt} from './shared.ts';

const evm=await startEvm(18552);
try{
 const artifacts=compile(),f=await fixture(evm.provider,artifacts),receipts:Receipt[]=[...f.receipts],u=parseEther;
 const treasury=await deploy(artifacts.SurvivalTreasury,f.deployer,[f.token.target,f.deployer.address],receipts,'deploy local reward treasury');
 const consumer=await deploy(artifacts.SurvivalReserveHarness,f.deployer,[treasury.target],receipts,'deploy TEST ONLY consumer harness');
 const grant=await deploy(artifacts.SurvivalWelcomeGrant,f.deployer,[f.token.target,f.deployer.address],receipts,'deploy local welcome distributor');
 const campaign=id('LAST_SIGNAL_V2_LOCAL_WELCOME_1'),aKey=id('STEP11:segment:A'),bKey=id('STEP11:segment:B');
 await receipt(treasury.bindVault(consumer.target),'bind TEST ONLY consumer',receipts);
 await receipt(grant.createCampaign(campaign),'create named welcome campaign',receipts);
 await receipt(as(f.token,f.deployer).faucet(),'existing public mock faucet for local distributor funding',receipts);
 await receipt(as(f.token,f.deployer).approve(grant.target,u('100')),'approve exact grant funding',receipts);
 await receipt(grant.fundCampaign(campaign,u('100')),'fund finite welcome campaign',receipts);
 await receipt(as(f.token,f.a).approve(treasury.target,u('60')),'approve exact reward pool funding',receipts);
 await receipt(as(treasury,f.a).fund(u('60')),'fund finite reward capacity',receipts);
 await receipt(as(grant,f.a).claim(campaign),'wallet A claims one campaign grant',receipts);
 await assert.rejects(as(grant,f.a).claim(campaign));await assert.rejects(as(grant,f.b).claim(campaign));
 assert.equal(await grant.claimed(campaign,f.b.address),false);
 await receipt(consumer.reserve(aKey,f.a.address,u('30')),'reserve segment A capacity',receipts);
 await receipt(consumer.reserve(bKey,f.b.address,u('30')),'reserve segment B capacity',receipts);
 assert.equal(await treasury.freeCapacity(),0n);await assert.rejects(consumer.reserve(id('oversubscribed'),f.a.address,1n));
 const full={balance:await f.token.balanceOf(treasury.target),reserved:await treasury.reserved(),free:await treasury.freeCapacity()};
 await receipt(consumer.resolve(aKey,u('8')),'TEST ONLY consumer uses eight reward units and releases twenty two',receipts);
 await receipt(consumer.resolve(bKey,0),'TEST ONLY consumer releases unused segment B backing',receipts);
 await receipt(consumer.recycle(u('5')),'TEST ONLY consumer returns five units',receipts);
 await assert.rejects(consumer.resolve(aKey,0));
 const final={balance:await f.token.balanceOf(treasury.target),reserved:await treasury.reserved(),free:await treasury.freeCapacity(),consumerBalance:await f.token.balanceOf(consumer.target),welcomeBalance:await f.token.balanceOf(grant.target),welcomeAllocated:await grant.allocated(),welcomeGranted:await grant.totalGranted(),totalSupply:await f.token.totalSupply(),walletA:await f.token.balanceOf(f.a.address),walletB:await f.token.balanceOf(f.b.address),deployer:await f.token.balanceOf(f.deployer.address),legacyEscrowLiability:await f.escrow.liabilities()};
 assert.equal(final.balance,final.reserved+final.free);assert.equal(final.balance,u('57'));assert.equal(final.consumerBalance,u('3'));assert.equal(final.welcomeGranted,u('100'));assert.equal(final.legacyEscrowLiability,0n);assert.equal(final.totalSupply,final.balance+final.consumerBalance+final.welcomeBalance+final.walletA+final.walletB+final.deployer);
 const report={checkedAt:new Date().toISOString(),mode:'DISPOSABLE_LOCAL_CHAIN',chainId:String((await evm.provider.getNetwork()).chainId),compiler:artifacts.SurvivalTreasury.compiler,node:process.version,currency:{address:f.token.target,name:await f.token.name(),symbol:await f.token.symbol(),decimals:String(await f.token.decimals()),funding:'Existing TestWIF public faucet and explicit transfers. No admin mint or purchase.'},contracts:{treasury:treasury.target,welcomeGrant:grant.target,testOnlyConsumerHarness:consumer.target},campaign,fullReservation:full,final,rejectionsVerified:['duplicate campaign claim','empty campaign does not consume eligibility','capacity oversubscription','second reservation resolution'],receipts,limitations:['Local proof only. The temporary chain stops after this script.','The consumer harness is test infrastructure, not SurvivalRunVault or funded gameplay.','No V2 automatic settlement, token claims from station play, NFT mint or public deployment is proven.','A campaign is scoped to this distributor and campaign ID, not to a unique person.']};
 const out=resolve(import.meta.dirname,'../../..','docs/evidence/v2-step11-local-treasury.json');mkdirSync(resolve(out,'..'),{recursive:true});writeFileSync(out,JSON.stringify(report,(_k,v)=>typeof v==='bigint'?v.toString():v,2));
 console.log('Local treasury proof passed: '+receipts.length+' confirmed receipts; finite capacity and campaign conservation verified.');console.log('Evidence: '+out);
}finally{evm.provider.destroy();await evm.stop();}
