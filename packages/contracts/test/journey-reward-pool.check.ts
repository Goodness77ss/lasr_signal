import {test} from 'node:test';
import assert from 'node:assert/strict';
import {id,parseEther} from 'ethers';
import {writeFileSync} from 'node:fs';
import {startEvm} from '../scripts/evm.ts';
import {fixture,deploy,as,receipt,type Receipt} from '../scripts/shared.ts';
test('J13 backing conserves funds, rejects duplicate payout and permits independent timeout',async()=>{
 const evm=await startEvm(18593),receipts:Receipt[]=[];
 try{
  const f=await fixture(evm.provider),pool=await deploy(f.artifacts.JourneyRewardPool,f.deployer,[f.token.target,f.a.address],receipts),one=id('authored pool reservation one'),two=id('authored pool reservation two'),three=id('authored pool reservation three');
  await assert.rejects(as(pool,f.a).open(one,f.b.address));
  await receipt(as(f.token,f.b).approve(pool.target,parseEther('30')),'approve exact pool funding',receipts);await receipt(as(pool,f.b).fund(parseEther('30')),'fund development reward backing',receipts);
  await receipt(as(pool,f.a).open(one,f.b.address),'reserve first run',receipts);await receipt(as(pool,f.a).open(two,f.b.address),'reserve second run',receipts);
  assert.equal(await pool.reserved(),parseEther('30'));await assert.rejects(as(pool,f.a).open(three,f.b.address));
  await assert.rejects(as(pool,f.b).settle(one,true,parseEther('10'),id('unauthorized')));await assert.rejects(as(pool,f.a).settle(one,true,parseEther('5'),id('invalid payout')));
  const before=await f.token.balanceOf(f.b.address);await receipt(as(pool,f.a).settle(one,true,parseEther('10'),id('authored bank outcome')),'settle ten checkpoint credits',receipts);
  assert.equal(await f.token.balanceOf(f.b.address),before+parseEther('10'));await assert.rejects(as(pool,f.a).settle(one,true,parseEther('10'),id('replay')));await assert.rejects(as(pool,f.a).open(one,f.b.address));
  const deadline=(await pool.runs(two)).deadline;await evm.provider.send('evm_setNextBlockTimestamp',[Number(deadline)]);await evm.provider.send('evm_mine',[]);
  await receipt(as(pool,f.b).timeout(two),'independent timeout without service',receipts);assert.equal(await pool.reserved(),0n);assert.equal(await pool.available(),parseEther('20'));await assert.rejects(as(pool,f.b).timeout(two));
  await receipt(as(pool,f.a).open(three,f.b.address),'new backed run',receipts);await receipt(as(pool,f.a).settle(three,false,0,id('authored quit')),'forfeit unbanked reward only',receipts);
  assert.equal(await pool.reserved(),0n);assert.equal(await f.token.balanceOf(pool.target),parseEther('20'));
  writeFileSync('docs/evidence/journey-reward-pool.json',JSON.stringify({environment:'DISPOSABLE_LOCAL_BLOCKCHAIN',limits:'Actual J13 contract accounting with authored run outcomes. Gameplay worker integration not proved.',receipts,funded:'30',paid:'10',remaining:'20',reserved:'0'},null,2)+'\n');
 }finally{evm.provider.destroy();await evm.stop();}
});
