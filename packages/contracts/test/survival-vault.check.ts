import {test,before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {id,parseEther,TypedDataEncoder,Wallet,ZeroAddress,ZeroHash} from 'ethers';
import {survivalEntryTypes,survivalResultTypes,survivalMissionTypes} from '@last-signal/chain';
import {compile} from '../scripts/compile.ts';
import {startEvm} from '../scripts/evm.ts';
import {as,receipt,at,timestamp,deploy} from '../scripts/shared.ts';
import {vaultFixture} from './survival-vault.fixture.ts';
let evm:Awaited<ReturnType<typeof startEvm>>,f:Awaited<ReturnType<typeof vaultFixture>>,checkpoint:string;
const u=parseEther;
before(async()=>{const artifacts=compile();evm=await startEvm(18553);f=await vaultFixture(evm.provider,artifacts);},{timeout:60000});
after(async()=>{evm?.provider.destroy();await evm?.stop();});
beforeEach(async()=>{checkpoint=await evm.provider.send('evm_snapshot',[]);});
afterEach(async()=>{await evm.provider.send('evm_revert',[checkpoint]);});
async function invariant(){assert.equal(await f.token.balanceOf(f.vault.target),await f.vault.liabilities());assert.equal(await f.token.balanceOf(f.treasury.target),(await f.treasury.freeCapacity())+(await f.treasury.reserved()));assert.equal(await f.escrow.liabilities(),0n);}

test('zero deposit reserves real rewards, settles from another gas payer and creates only the recorded player claim',async()=>{
 const e=await f.entry('zero',{deposit:0n});await f.open(e);assert.equal(await f.token.balanceOf(f.vault.target),0n);assert.equal(await f.treasury.reserved(),u('30'));assert.equal(await f.vault.pendingRewards(f.a.address),u('30'));
 const r=await f.result(e);assert.equal(await f.vault.resultDigest(r),TypedDataEncoder.hash(f.domain,survivalResultTypes,r));await f.settle(r);assert.equal(await f.vault.claimable(f.a.address),u('5'));assert.equal(await f.vault.claimable(f.b.address),0n);assert.equal(await f.vault.walletEarned(f.a.address),u('5'));await invariant();
 const before=await f.token.balanceOf(f.a.address);await receipt(as(f.vault,f.a).claim(),'pull reward');assert.equal(await f.token.balanceOf(f.a.address),before+u('5'));await assert.rejects(as(f.vault,f.a).claim());await assert.rejects(f.settle(r));await invariant();
});
test('supplies burn ten percent in base units and recycle the rest while preserving deposit liabilities',async()=>{
 const e=await f.entry('supplies');await f.open(e);const supply=await f.token.totalSupply();await f.settle(await f.result(e,{spent:u('5')}));assert.equal(await f.vault.claimable(f.a.address),u('40'));assert.equal(await f.token.totalSupply(),supply-u('0.5'));assert.equal(await f.treasury.totalRecycled(),u('4.5'));assert.equal(await f.token.balanceOf(f.treasury.target),u('199.5'));await invariant();
});
test('explicit mission failure consumes the accepted stake once without a second player settlement approval',async()=>{
 const e=await f.entry('failure');await f.open(e);await f.advance(90n);const p=await f.mission(e);assert.equal(await f.vault.missionDigest(p),TypedDataEncoder.hash(f.domain,survivalMissionTypes,p));await f.accept(p);
 assert.equal(await f.token.allowance(f.a.address,f.vault.target),0n);const r=await f.result(e,{failureMask:1,failedStake:u('5'),outcome:1});await f.settle(r);assert.equal(await f.vault.claimable(f.a.address),u('40'));assert.equal(await f.treasury.totalRecycled(),u('5'));await assert.rejects(f.settle(r));await invariant();
});
test('mission success returns the original stake by unlocking and adds only three bonus units',async()=>{
 const e=await f.entry('success');await f.open(e);await f.advance(90n);await f.accept(await f.mission(e));await f.settle(await f.result(e,{successMask:1,bonusEarned:u('3')}));assert.equal(await f.vault.claimable(f.a.address),u('48'));assert.equal(await f.vault.walletEarned(f.a.address),u('8'));await invariant();
});
test('unaccepted failures, invented bonuses and unresolved or contradictory mission outcomes cannot settle',async()=>{
 const e=await f.entry('consent');await f.open(e);
 for(const patch of [{failedStake:u('5'),failureMask:1},{bonusEarned:u('3'),successMask:1}])await assert.rejects(f.settle(await f.result(e,patch)));
 await assert.rejects(f.accept(await f.mission(e)));await f.advance(90n);const p=await f.mission(e);await assert.rejects(as(f.vault,f.b).acceptMission(p,await f.signMission(p)));await f.accept(p);await assert.rejects(f.accept(p));
 for(const patch of [{},{successMask:1,failureMask:1,bonusEarned:u('3'),failedStake:u('5')},{successMask:2,bonusEarned:u('3')},{successMask:1,bonusEarned:u('8')},{failureMask:1,failedStake:0n}])await assert.rejects(f.settle(await f.result(e,patch)));
 await f.settle(await f.result(e,{abortMask:1}));assert.equal(await f.vault.claimable(f.a.address),u('45'));await invariant();
});
test('the new mission cannot use its own future bonus, omit previous outcomes or exceed two consents',async()=>{
 const e=await f.entry('future',{deposit:0n});await f.open(e);await f.advance(90n);await assert.rejects(f.accept(await f.mission(e,{stationEarned:u('2')})));await f.accept(await f.mission(e));
 await assert.rejects(f.accept(await f.mission(e)));await f.accept(await f.mission(e,{stationEarned:u('24'),successMask:1}));await assert.rejects(f.accept(await f.mission(e,{stationEarned:u('24'),successMask:3})));
 await assert.rejects(f.settle(await f.result(e,{stationEarned:u('5'),successMask:3,bonusEarned:u('6')})));
 await f.settle(await f.result(e,{stationEarned:u('24'),successMask:3,bonusEarned:u('6')}));assert.equal(await f.vault.claimable(f.a.address),u('30'));await invariant();
});
test('initial entry binds all fields, domain, currency, rules and wallet consent',async()=>{
 const e=await f.entry('entry');assert.equal(await f.vault.entryDigest(e),TypedDataEncoder.hash(f.domain,survivalEntryTypes,e));await receipt(as(f.token,f.a).approve(f.vault.target,u('100')),'bounded test approval');const sig=await f.signEntry(e);
 for(const patch of [{deposit:u('41')},{carryCap:1n},{stationReserve:u('23')},{bonusReserve:u('5')},{sequence:1n},{nonce:1n},{runId:id('changed')},{rulesHash:id('other')},{currency:ZeroAddress}])await assert.rejects(as(f.vault,f.a).open({...e,...patch},sig));
 await assert.rejects(as(f.vault,f.b).open(e,sig));await assert.rejects(as(f.vault,f.a).open(e,await f.signEntry(e,{...f.domain,chainId:46630n})));await assert.rejects(as(f.vault,f.a).open(e,await f.signEntry(e,{...f.domain,verifyingContract:String(f.escrow.target)})));await assert.rejects(as(f.vault,f.a).open(e,await Wallet.createRandom().signTypedData(f.domain,survivalEntryTypes,e)));
 await f.open(e);await assert.rejects(f.open(e));await assert.rejects(f.open(await f.entry('parallel',{deposit:0n})));await invariant();
});
test('initial allocations and reward subreserves reject unknown or excessive bounds',async()=>{
 for(const patch of [{deposit:u('100')+1n},{carryCap:u('100')+1n},{stationReserve:u('24')+1n},{bonusReserve:u('6')+1n},{stationReserve:0n,bonusReserve:0n},{runId:ZeroHash}]){const e=await f.entry('bounds',patch);await assert.rejects(as(f.vault,f.a).open(e,await f.signEntry(e)));}
 await invariant();
});
test('settlement binds ledger, run, segment, sequence, player, currency and domain',async()=>{
 const e=await f.entry('signed');await f.open(e);const r=await f.result(e),sig=await f.signResult(r);
 for(const patch of [{stationEarned:u('6')},{spent:1n},{deposit:u('39')},{outcome:1},{runId:id('other')},{segment:2n},{sequence:1n},{player:f.b.address},{currency:ZeroAddress},{rulesHash:id('bad')},{resultHash:ZeroHash}])await assert.rejects(as(f.vault,f.b).settle({...r,...patch},sig));
 await assert.rejects(as(f.vault,f.b).settle(r,await f.signResult(r,{...f.domain,chainId:46630n})));await assert.rejects(as(f.vault,f.b).settle(r,await f.signResult(r,{...f.domain,verifyingContract:String(f.escrow.target)})));await f.settle(r);await invariant();
});
test('bounded top ups preserve canonical charges without extending time',async()=>{
 const e=await f.entry('topup');await f.open(e);const r=await f.result(e),deadline=(await f.vault.run(e.runId)).deadline;
 await assert.rejects(as(f.vault,f.b).topUp(e.runId,1));await assert.rejects(as(f.vault,f.a).topUp(e.runId,1));await receipt(as(f.token,f.a).approve(f.vault.target,u('60')),'approve exactly sixty');await receipt(as(f.vault,f.a).topUp(e.runId,u('60')),'top up to maximum');assert.equal((await f.vault.run(e.runId)).deposit,u('100'));assert.equal((await f.vault.run(e.runId)).deadline,deadline);await assert.rejects(as(f.vault,f.a).topUp(e.runId,1));await f.settle(r);assert.equal(await f.vault.claimable(f.a.address),u('105'));await invariant();
});
test('checkpoint waits at least three hundred chain seconds and defaults to banking without renewal',async()=>{
 const e=await f.entry('default');await f.open(e);const r=await f.result(e,{outcome:0,nextStationReserve:u('24'),nextBonusReserve:u('6')});await assert.rejects(f.settle(r));await f.advance(300n);await f.settle(r);const state=await f.vault.run(e.runId);assert.equal(state.active,false);assert.equal(state.ended,false);assert.equal(await f.vault.claimable(f.a.address),u('45'));assert.equal(await f.vault.lockedLiability(),0n);await invariant();
});
test('carry forward consumes only new segment credit, caps the amount and leaves prior banked claims untouched',async()=>{
 const first=await f.entry('old-credit');await f.open(first);await f.settle(await f.result(first));assert.equal(await f.vault.claimable(f.a.address),u('45'));
 const e=await f.entry('carry',{carryCap:u('20')});await f.open(e);await f.advance(300n);await f.settle(await f.result(e,{outcome:0,nextStationReserve:u('24'),nextBonusReserve:u('6')}));let r=await f.vault.run(e.runId);assert.equal(r.active,true);assert.equal(r.segment,2n);assert.equal(r.sequence,1n);assert.equal(r.deposit,u('20'));assert.equal(r.totalStation,u('5'));assert.equal(await f.vault.claimable(f.a.address),u('70'));
 await receipt(as(f.vault,f.a).setCarryCap(e.runId,0),'revoke future carry');await f.advance(300n);await f.settle(await f.result(e,{outcome:0,nextStationReserve:u('24'),nextBonusReserve:u('6')}));r=await f.vault.run(e.runId);assert.equal(r.active,false);assert.equal(await f.vault.claimable(f.a.address),u('95'));assert.equal(await f.vault.pendingRewards(f.a.address),0n);await invariant();
});
test('lack of next reserve banks a valid checkpoint rather than blocking its settlement',async()=>{
 const t=await deploy(f.artifacts.SurvivalTreasury,f.deployer,[f.token.target,f.deployer.address]),v=await deploy(f.artifacts.SurvivalRunVault,f.deployer,[f.token.target,t.target,f.authority.address,f.rules]);await receipt(t.bindVault(v.target),'bind small vault');await receipt(as(f.token,f.a).approve(t.target,u('30')),'approve small pool');await receipt(as(t,f.a).fund(u('30')),'fund only one reservation');
 const domain={...f.domain,verifyingContract:String(v.target)},entry=await f.entry('small',{deposit:0n,carryCap:u('40')});await receipt(as(v,f.a).open(entry,await f.authority.signTypedData(domain,survivalEntryTypes,entry)),'open zero deposit small pool');await f.advance(300n);const result=await f.result(entry,{stationEarned:u('24'),outcome:0,nextStationReserve:u('24'),nextBonusReserve:u('6')},v);await receipt(as(v,f.b).settle(result,await f.authority.signTypedData(domain,survivalResultTypes,result)),'bank because next pool is insufficient');assert.equal((await v.run(entry.runId)).active,false);assert.equal(await v.claimable(f.a.address),u('24'));assert.equal(await f.token.balanceOf(t.target),u('6'));assert.equal(await f.token.balanceOf(v.target),await v.liabilities());await invariant();
});
test('explicit later allocation reuses the same run with preserved cumulative caps and a new segment',async()=>{
 const e=await f.entry('resume',{deposit:0n});await f.open(e);await f.advance(300n);await f.settle(await f.result(e,{outcome:0}));const next=await f.entry('resume',{deposit:0n,segment:2n,sequence:1n});await f.open(next);assert.equal((await f.vault.run(e.runId)).totalStation,u('5'));await f.settle(await f.result(next));await assert.rejects(f.open(await f.entry('resume',{deposit:0n,segment:3n,sequence:2n})));await invariant();
});
test('full timeout is available exactly at nine hundred seconds and preserves older claims',async()=>{
 const old=await f.entry('older');await f.open(old);await f.settle(await f.result(old));const e=await f.entry('timeout');await f.open(e);await f.advance(90n);await f.accept(await f.mission(e));const r=await f.result(e,{failureMask:1,failedStake:u('5')}),deadline=(await f.vault.run(e.runId)).deadline;
 await assert.rejects(f.vault.refundExpired(e.runId));await at(f.provider,deadline);await f.provider.send('evm_mine',[]);await assert.rejects(f.settle(r));await receipt(as(f.vault,f.b).refundExpired(e.runId),'independent timeout caller');assert.equal(await f.vault.claimable(f.a.address),u('85'));assert.equal(await f.vault.pendingRewards(f.a.address),0n);await assert.rejects(f.vault.refundExpired(e.runId));await assert.rejects(f.settle(r));await invariant();
});
test('settlement works before the hard deadline and fails at its signed expiry',async()=>{
 const e=await f.entry('last');await f.open(e);const state=await f.vault.run(e.runId);await at(f.provider,state.deadline-1n);await f.settle(await f.result(e));await invariant();
});
test('signed expiry is exclusive and cannot exceed the stored hard deadline',async()=>{
 const e=await f.entry('expiry');await f.open(e);const deadline=(await f.vault.run(e.runId)).deadline;await assert.rejects(f.settle(await f.result(e,{expiry:deadline+1n})));const expiry=await timestamp(f.provider)+20n,r=await f.result(e,{expiry});await at(f.provider,expiry);await f.provider.send('evm_mine',[]);await assert.rejects(f.settle(r));await invariant();
});
test('infrastructure abort returns full unsettled deposit and cancels provisional mission and supply amounts',async()=>{
 const e=await f.entry('abort');await f.open(e);await f.advance(90n);await f.accept(await f.mission(e,{spent:u('5')}));await assert.rejects(f.settle(await f.result(e,{outcome:4,abortMask:1,spent:1n,stationEarned:0n})));await f.settle(await f.result(e,{outcome:4,abortMask:1,stationEarned:0n}));assert.equal(await f.vault.claimable(f.a.address),u('40'));assert.equal(await f.vault.walletEarned(f.a.address),0n);assert.equal(await f.treasury.freeCapacity(),u('200'));await invariant();
});

async function fiveCycles(label:string){
 let firstAt=0n;
 for(let i=1;i<=5;i++){
  const e=await f.entry(label,{deposit:0n,segment:BigInt(i),sequence:BigInt(i-1)});await f.open(e);if(i===1)firstAt=(await f.vault.run(e.runId)).activatedAt;
  await f.advance(90n);await f.accept(await f.mission(e,{stationEarned:u('24')}));await f.accept(await f.mission(e,{stationEarned:u('24'),successMask:1}));await f.advance(210n);await f.settle(await f.result(e,{stationEarned:u('24'),bonusEarned:u('6'),successMask:3,outcome:0}));await invariant();
 }
 return firstAt;
}
test('five explicit economic segments retain cumulative station and bonus limits without resetting',async()=>{
 await fiveCycles('five');const r=await f.vault.run(id('five'));assert.equal(r.totalStation,u('120'));assert.equal(r.totalBonus,u('30'));assert.equal(r.segment,5n);assert.equal(await f.vault.claimable(f.a.address),u('150'));await assert.rejects(f.open(await f.entry('five',{deposit:0n,segment:6n,sequence:5n,stationReserve:1n,bonusReserve:0n})));await invariant();
});
test('partial checkpoints can pass five economic segments while preserving the same cumulative reward cap',async()=>{
 const e=await f.entry('partial-checkpoints',{deposit:0n,carryCap:u('5')});await f.open(e);
 for(let i=0;i<6;i++){await f.advance(300n);await f.settle(await f.result(e,{stationEarned:u('1'),outcome:0,nextStationReserve:u('24'),nextBonusReserve:u('6')}));}
 const r=await f.vault.run(e.runId);assert.equal(r.active,true);assert.equal(r.segment,7n);assert.equal(r.totalStation,u('6'));assert.equal(r.totalBonus,0n);await invariant();
});
test('rolling wallet budget includes pending capacity and releases settled earnings at the exact authorization age',async()=>{
 await receipt(as(f.token,f.a).approve(f.treasury.target,u('100')),'approve more existing mock tokens');await receipt(as(f.treasury,f.a).fund(u('100')),'fund window test');
 const firstAt=await fiveCycles('rolling');
 for(const [label,amount] of [['twenty-four',24n],['another-twenty-four',24n],['last-two',2n]] as const){const e=await f.entry(label,{deposit:0n,stationReserve:u(String(amount)),bonusReserve:0n});await f.open(e);await f.settle(await f.result(e,{stationEarned:u(String(amount))}));}
 assert.equal(await f.vault.walletEarned(f.a.address),u('200'));await assert.rejects(f.open(await f.entry('over-cap',{deposit:0n,stationReserve:1n,bonusReserve:0n})));
 await at(f.provider,firstAt+86399n);await f.provider.send('evm_mine',[]);assert.equal(await f.vault.walletEarned(f.a.address),u('200'));
 await at(f.provider,firstAt+86400n);await f.provider.send('evm_mine',[]);assert.equal(await f.vault.walletEarned(f.a.address),u('170'));assert.equal(await f.vault.walletRemaining(f.a.address),u('30'));
 const active=await f.entry('new-window',{deposit:0n});await f.open(active);assert.equal(await f.vault.walletRemaining(f.a.address),0n);
 await f.advance(86400n);assert.equal(await f.vault.walletEarned(f.a.address),0n);assert.equal(await f.vault.walletRemaining(f.a.address),u('170'));await receipt(f.vault.refundExpired(active.runId),'release old pending reservation');assert.equal(await f.vault.walletRemaining(f.a.address),u('200'));await invariant();
});
test('base unit burn rounding and signed excessive ledger fields cannot consume older claims',async()=>{
 const e=await f.entry('rounding',{deposit:11n});await f.open(e);const supply=await f.token.totalSupply();
 for(const patch of [{stationEarned:u('24')+1n},{stationEarned:0n,spent:12n},{bonusEarned:1n},{nextStationReserve:u('24')+1n}])await assert.rejects(f.settle(await f.result(e,patch)));
 await f.settle(await f.result(e,{stationEarned:0n,spent:11n}));assert.equal(await f.token.totalSupply(),supply-1n);assert.equal(await f.treasury.totalRecycled(),10n);assert.equal(await f.vault.claimable(f.a.address),0n);await invariant();
});
test('fake burns and failed claims roll back state and preserve obligations for retry',async()=>{
 const h=await vaultFixture(f.provider,f.artifacts,'HostileToken'),e=await h.entry('hostile');await h.open(e);await receipt(h.token.setMode(3),'fake burn mode');const r=await h.result(e,{spent:u('5')});await assert.rejects(h.settle(r));assert.equal((await h.vault.run(e.runId)).active,true);assert.equal(await h.treasury.reserved(),u('30'));assert.equal(await h.vault.pendingRewards(h.a.address),u('30'));assert.equal(await h.vault.claimable(h.a.address),0n);
 await receipt(h.token.setMode(0),'restore exact burn');await h.settle(r);await receipt(h.token.setBlockClaims(true),'block claim transfer');await assert.rejects(as(h.vault,h.a).claim());assert.equal(await h.vault.claimable(h.a.address),u('40'));assert.equal(await h.token.balanceOf(h.vault.target),await h.vault.liabilities());await receipt(h.token.setBlockClaims(false),'allow retry');await receipt(as(h.vault,h.a).claim(),'retry player claim');assert.equal(await h.vault.claimable(h.a.address),0n);assert.equal(await h.token.balanceOf(h.vault.target),0n);await invariant();
});
