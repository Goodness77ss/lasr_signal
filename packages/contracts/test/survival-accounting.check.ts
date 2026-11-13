import {test,before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {parseEther} from 'ethers';
import {startEvm} from '../scripts/evm.ts';
import {compile} from '../scripts/compile.ts';
import {vaultFixture} from './survival-vault.fixture.ts';
import {as,receipt,at} from '../scripts/shared.ts';
let evm:Awaited<ReturnType<typeof startEvm>>,f:Awaited<ReturnType<typeof vaultFixture>>,checkpoint:string;
before(async()=>{evm=await startEvm(18559);f=await vaultFixture(evm.provider,compile());});
after(async()=>{evm?.provider.destroy();await evm?.stop();});
beforeEach(async()=>{checkpoint=await evm.provider.send('evm_snapshot',[]);});
afterEach(async()=>{await evm.provider.send('evm_revert',[checkpoint]);});
const u=parseEther;
async function invariant(){assert.equal(await f.token.balanceOf(f.vault.target),await f.vault.liabilities());assert.equal(await f.token.balanceOf(f.treasury.target),(await f.treasury.freeCapacity())+(await f.treasury.reserved()));assert.equal(await f.escrow.liabilities(),0n);}

test('twenty four deterministic mixed ledgers conserve custody and burn at base unit precision',async()=>{
 let seed=0x1a57c0de;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 for(let sample=0;sample<24;sample++){
  const snap=await evm.provider.send('evm_snapshot',[]);
  try{
   const older=await f.entry('property older:'+sample,{deposit:0n});await f.open(older);await f.settle(await f.result(older));
   const count=sample%3,deposit=u(String(count?10+random()%31:random()%41))+BigInt(random()%10),earned=u(String(random()%24))+BigInt(random()%10);
   const e=await f.entry('property:'+sample,{deposit});await f.open(e);let successes=0,failures=0,aborts=0;
   if(count)await f.advance(90n);
   for(let i=0;i<count;i++){
    await f.accept(await f.mission(e,{stationEarned:earned,successMask:successes,failureMask:failures,abortMask:aborts}));
    const resolution=random()%3;if(resolution===0)successes|=1<<i;else if(resolution===1)failures|=1<<i;else aborts|=1<<i;
   }
   const bits=(v:number)=>BigInt((v&1)+((v>>1)&1)),bonus=bits(successes)*u('3'),failed=bits(failures)*u('5'),available=deposit+earned+bonus-failed;
   const spent=sample%4===0?available:sample%4===1?0n:BigInt(random())%(available+1n),burn=spent/10n,recycled=spent-burn+failed;
   const result=await f.result(e,{stationEarned:earned,bonusEarned:bonus,spent,failedStake:failed,successMask:successes,failureMask:failures,abortMask:aborts});
   const topup=BigInt(random()%19);if(topup){await receipt(as(f.token,f.a).approve(f.vault.target,topup),'property exact top up allowance');await receipt(as(f.vault,f.a).topUp(e.runId,topup),'property top up after canonical signing');}
   const credit=deposit+topup+earned+bonus-spent-failed;await f.settle(result);await invariant();
   assert.equal(await f.vault.claimable(f.a.address),u('5')+credit);assert.equal(await f.token.totalSupply(),u('300')-burn);assert.equal(await f.treasury.totalRecycled(),recycled);assert.equal(await f.token.balanceOf(f.treasury.target),u('195')-earned-bonus+recycled);
   await receipt(as(f.vault,f.a).claim(),'property independent aggregate claim');await invariant();assert.equal(await f.token.balanceOf(f.a.address)+await f.token.balanceOf(f.treasury.target),await f.token.totalSupply());assert.equal(await f.vault.claimLiability(),0n);
   await assert.rejects(f.settle(result));await assert.rejects(as(f.vault,f.a).claim());
  }finally{await evm.provider.send('evm_revert',[snap]);}
 }
});
test('seven simultaneous distinct wallets cannot oversubscribe a two hundred unit finite treasury',async()=>{
 const transactions:{hash:string;runId:string;player:string}[]=[];await evm.provider.send('evm_setAutomine',[false]);
 try{
  for(let i=1;i<8;i++){const player=await evm.provider.getSigner(i),e=await f.entry('competing:'+i,{player:player.address,deposit:0n,nonce:0n});const tx=await as(f.vault,player).open(e,await f.signEntry(e),{gasLimit:3000000});transactions.push({hash:tx.hash,runId:e.runId,player:player.address});}
  await evm.provider.send('evm_mine',[]);
 }finally{await evm.provider.send('evm_setAutomine',[true]);}
 const receipts=await Promise.all(transactions.map(t=>evm.provider.getTransactionReceipt(t.hash)));assert.equal(receipts.filter(r=>r?.status===1).length,6);assert.equal(receipts.filter(r=>r?.status===0).length,1);assert.equal(await f.treasury.reserved(),u('180'));assert.equal(await f.treasury.freeCapacity(),u('20'));await invariant();
 await f.advance(900n);for(let i=0;i<transactions.length;i++)if(receipts[i]?.status===1){const t=transactions[i];assert.equal(await f.vault.pendingRewards(t.player),u('30'));await receipt(f.vault.refundExpired(t.runId),'release actual competing reservation at hard timeout');assert.equal(await f.vault.pendingRewards(t.player),0n);}
 assert.equal(await f.treasury.reserved(),0n);assert.equal(await f.treasury.freeCapacity(),u('200'));await invariant();
});
test('history capacity banks current obligations and refuses the 257th earning authorization until expiry',async()=>{
 let firstAt=0n;
 for(let i=0;i<256;i++){const e=await f.entry('bounded-history:'+i,{deposit:0n,stationReserve:1n,bonusReserve:0n});await f.open(e);if(i===0)firstAt=(await f.vault.run(e.runId)).activatedAt;await f.settle(await f.result(e,{stationEarned:1n}));}
 assert.equal(await f.vault.walletEarned(f.a.address),256n);assert.equal(await f.vault.claimable(f.a.address),256n);assert.equal(await f.treasury.reserved(),0n);
 await assert.rejects(f.open(await f.entry('bounded-history:257',{deposit:0n,stationReserve:1n,bonusReserve:0n})));await invariant();
 await at(evm.provider,firstAt+86400n);await evm.provider.send('evm_mine',[]);const e=await f.entry('bounded-history:after-expiry',{deposit:0n,stationReserve:1n,bonusReserve:0n});await f.open(e);await f.settle(await f.result(e,{stationEarned:1n}));assert.equal(await f.vault.claimable(f.a.address),257n);await invariant();
});
