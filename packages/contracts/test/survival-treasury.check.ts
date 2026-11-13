import {test,before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {id,parseEther,ZeroAddress,ZeroHash,type Contract} from 'ethers';
import {compile} from '../scripts/compile.ts';
import {startEvm} from '../scripts/evm.ts';
import {fixture,deploy,as,receipt} from '../scripts/shared.ts';

let evm:Awaited<ReturnType<typeof startEvm>>,f:Awaited<ReturnType<typeof fixture>>,treasury:Contract,consumer:Contract,grant:Contract,checkpoint:string;
const campaign=id('LAST_SIGNAL_V2_LOCAL_WELCOME_1'),second=id('LAST_SIGNAL_V2_LOCAL_WELCOME_2'),u=parseEther;
before(async()=>{
 const artifacts=compile();evm=await startEvm(18551);f=await fixture(evm.provider,artifacts);
 treasury=await deploy(artifacts.SurvivalTreasury,f.deployer,[f.token.target,f.deployer.address]);
 consumer=await deploy(artifacts.SurvivalReserveHarness,f.deployer,[treasury.target]);
 grant=await deploy(artifacts.SurvivalWelcomeGrant,f.deployer,[f.token.target,f.deployer.address]);
 await receipt(treasury.bindVault(consumer.target),'bind test consumer');await receipt(grant.createCampaign(campaign),'create campaign');
},{timeout:60000});
after(async()=>{evm?.provider.destroy();await evm?.stop();});
beforeEach(async()=>{checkpoint=await evm.provider.send('evm_snapshot',[]);});
afterEach(async()=>{await evm.provider.send('evm_revert',[checkpoint]);});
async function fundTreasury(amount=u('60')){await receipt(as(f.token,f.a).approve(treasury.target,amount),'approve exact reward funding');await receipt(as(treasury,f.a).fund(amount),'fund reward pool');}
async function fundGrant(amount=u('100'),key=campaign){await receipt(as(f.token,f.b).approve(grant.target,amount),'approve exact grant funding');await receipt(as(grant,f.b).fundCampaign(key,amount),'fund welcome campaign');}
async function invariant(){
 const balance=await f.token.balanceOf(treasury.target);assert.equal(balance,(await treasury.freeCapacity())+(await treasury.reserved()));
 assert.equal(await treasury.reserved(),(await treasury.reservedFor(f.a.address))+(await treasury.reservedFor(f.b.address)));
 assert.equal(await f.token.balanceOf(grant.target),(await grant.allocated())+(await grant.unallocated()));
 assert.equal(await f.escrow.liabilities(),0n);
}

test('finite pool starts empty and rejects unsupported reservation terms and unbacked capacity',async()=>{
 assert.equal(await treasury.freeCapacity(),0n);assert.equal(await treasury.reserved(),0n);
 await assert.rejects(consumer.reserve(id('empty'),f.a.address,u('30')));
 await fundTreasury();
 for(const args of [[ZeroHash,f.a.address,u('30')],[id('zero-player'),ZeroAddress,u('1')],[id('zero'),f.a.address,0n],[id('too-large'),f.a.address,u('30')+1n]])await assert.rejects(consumer.reserve(...args));
 await invariant();
});
test('two reservations cannot spend the same capacity; player backing and one use keys are conserved',async()=>{
 await fundTreasury();await receipt(consumer.reserve(id('A'),f.a.address,u('30')),'reserve A');await receipt(consumer.reserve(id('B'),f.b.address,u('30')),'reserve B');
 assert.equal(await treasury.freeCapacity(),0n);assert.equal(await treasury.reservedFor(f.a.address),u('30'));assert.equal(await treasury.reservedFor(f.b.address),u('30'));
 await assert.rejects(consumer.reserve(id('C'),f.a.address,1n));await assert.rejects(consumer.reserve(id('A'),f.a.address,1n));
 await receipt(consumer.resolve(id('A'),u('8')),'use eight reward units');
 assert.equal(await f.token.balanceOf(consumer.target),u('8'));assert.equal(await treasury.freeCapacity(),u('22'));assert.equal(await treasury.reserved(),u('30'));
 await assert.rejects(consumer.resolve(id('A'),0n));await assert.rejects(consumer.reserve(id('A'),f.a.address,1n));await assert.rejects(consumer.resolve(id('B'),u('31')));await invariant();
});
test('zero use releases all backing and inflows called recycled require the bound consumer',async()=>{
 await fundTreasury();await receipt(consumer.reserve(id('release'),f.a.address,u('30')),'reserve');await receipt(consumer.resolve(id('release'),0),'release');assert.equal(await treasury.freeCapacity(),u('60'));
 await receipt(consumer.reserve(id('use'),f.b.address,u('30')),'reserve next');await receipt(consumer.resolve(id('use'),u('8')),'use');await assert.rejects(as(treasury,f.a).recycle(1));
 await receipt(consumer.recycle(u('5')),'recycle five');assert.equal(await treasury.totalRecycled(),u('5'));assert.equal(await treasury.totalFunded(),u('65'));assert.equal(await treasury.totalPaid(),u('8'));assert.equal(await treasury.freeCapacity(),u('57'));await invariant();
});
test('only the one bound consumer can allocate or resolve, with no withdrawal surface',async()=>{
 await fundTreasury();await assert.rejects(as(treasury,f.a).reserve(id('forged'),f.a.address,u('1')));await assert.rejects(as(treasury,f.a).resolve(id('forged'),0));await assert.rejects(treasury.bindVault(consumer.target));
 assert.equal(treasury.interface.hasFunction('withdraw'),false);assert.equal(treasury.interface.hasFunction('setVault'),false);
 const fresh=await deploy(f.artifacts.SurvivalTreasury,f.deployer,[f.token.target,f.deployer.address]);await assert.rejects(as(fresh,f.a).bindVault(consumer.target));await assert.rejects(fresh.bindVault(f.a.address));
 const badCurrency=await deploy(f.artifacts.TestWIF,f.deployer),badTreasury=await deploy(f.artifacts.SurvivalTreasury,f.deployer,[badCurrency.target,f.deployer.address]),wrongConsumer=await deploy(f.artifacts.SurvivalReserveHarness,f.deployer,[badTreasury.target]);await assert.rejects(fresh.bindVault(wrongConsumer.target));await invariant();
});
test('campaign grants transfer exactly one hundred once per wallet and leave public faucet behavior separate',async()=>{
 await fundGrant();const supply=await f.token.totalSupply(),before=await f.token.balanceOf(f.a.address);await receipt(as(grant,f.a).claim(campaign),'claim welcome');
 assert.equal(await f.token.balanceOf(f.a.address),before+u('100'));assert.equal(await grant.claimed(campaign,f.a.address),true);assert.equal((await grant.campaigns(campaign)).claims,1n);assert.equal(await grant.totalGranted(),u('100'));assert.equal(await f.token.totalSupply(),supply);
 await assert.rejects(as(grant,f.a).claim(campaign));await assert.rejects(as(f.token,f.a).faucet());assert.equal(await grant.allocated(),0n);await invariant();
});
test('an empty campaign does not consume eligibility, and campaigns cannot borrow one another budgets',async()=>{
 await receipt(grant.createCampaign(second),'create separate campaign');await fundGrant();await assert.rejects(as(grant,f.a).claim(second));assert.equal(await grant.claimed(second,f.a.address),false);
 await receipt(as(grant,f.a).claim(campaign),'first campaign');await assert.rejects(as(grant,f.b).claim(campaign));assert.equal(await grant.claimed(campaign,f.b.address),false);
 await receipt(as(f.token,f.a).approve(grant.target,u('100')),'approve second budget');await receipt(as(grant,f.a).fundCampaign(second,u('100')),'fund second budget');await receipt(as(grant,f.a).claim(second),'second named campaign');assert.equal(await grant.claimed(second,f.a.address),true);await invariant();
});
test('duplicate claims from two connections have a single onchain winner',async()=>{
 await fundGrant();const first=as(grant,f.a),other=as(grant,f.a);const outcomes=await Promise.allSettled([first.claim(campaign),other.claim(campaign)]);
 const successful=outcomes.filter((r):r is PromiseFulfilledResult<any>=>r.status==='fulfilled');for(const r of successful)await receipt(r.value,'claim transaction');
 assert.equal(successful.length,1);assert.equal((await grant.campaigns(campaign)).claims,1n);assert.equal(await grant.totalGranted(),u('100'));await invariant();
});
test('campaign setup is explicit and only unassigned donations can be assigned',async()=>{
 await assert.rejects(as(grant,f.a).createCampaign(second));await assert.rejects(grant.createCampaign(campaign));await assert.rejects(grant.createCampaign(ZeroHash));await fundGrant();
 await assert.rejects(grant.assignDonation(campaign,1));await receipt(as(f.token,f.a).transfer(grant.target,u('7')),'donate without allocation');assert.equal(await grant.unallocated(),u('7'));
 await assert.rejects(as(grant,f.a).assignDonation(campaign,1));await receipt(grant.assignDonation(campaign,u('7')),'assign only donation');assert.equal((await grant.campaigns(campaign)).remaining,u('107'));assert.equal(await grant.unallocated(),0n);assert.equal(grant.interface.hasFunction('withdraw'),false);await invariant();
});
test('unannounced direct treasury donations add only free capacity and never reduce reservations',async()=>{
 await fundTreasury();await receipt(consumer.reserve(id('live'),f.a.address,u('30')),'reserve');await receipt(as(f.token,f.b).transfer(treasury.target,u('10')),'donation');assert.equal(await treasury.freeCapacity(),u('40'));assert.equal(await treasury.reserved(),u('30'));await invariant();
});
test('short or false incoming transfers cannot create reward or campaign backing',async()=>{
 const t=await deploy(f.artifacts.HostileToken,f.deployer),r=await deploy(f.artifacts.SurvivalTreasury,f.deployer,[t.target,f.deployer.address]),g=await deploy(f.artifacts.SurvivalWelcomeGrant,f.deployer,[t.target,f.deployer.address]);await receipt(g.createCampaign(campaign),'campaign');await receipt(t.mint(f.a.address,u('100')),'fixture mint');await receipt(as(t,f.a).approve(r.target,u('50')),'approve');await receipt(as(t,f.a).approve(g.target,u('50')),'approve');
 for(const mode of [1,2]){await receipt(t.setMode(mode),'hostile transfer mode');await assert.rejects(as(r,f.a).fund(u('10')));await assert.rejects(as(g,f.a).fundCampaign(campaign,u('10')));assert.equal(await r.reserved(),0n);assert.equal(await g.allocated(),0n);assert.equal(await t.balanceOf(r.target),0n);assert.equal(await t.balanceOf(g.target),0n);}
});
test('failed outgoing transfers roll back reservation and welcome eligibility atomically',async()=>{
 const t=await deploy(f.artifacts.HostileToken,f.deployer),r=await deploy(f.artifacts.SurvivalTreasury,f.deployer,[t.target,f.deployer.address]),c=await deploy(f.artifacts.SurvivalReserveHarness,f.deployer,[r.target]),g=await deploy(f.artifacts.SurvivalWelcomeGrant,f.deployer,[t.target,f.deployer.address]);await receipt(r.bindVault(c.target),'bind');await receipt(g.createCampaign(campaign),'campaign');await receipt(t.mint(f.a.address,u('200')),'fixture mint');
 await receipt(as(t,f.a).approve(r.target,u('30')),'approve');await receipt(as(r,f.a).fund(u('30')),'fund');await receipt(c.reserve(id('live'),f.a.address,u('30')),'reserve');await receipt(as(t,f.a).approve(g.target,u('100')),'approve');await receipt(as(g,f.a).fundCampaign(campaign,u('100')),'fund grant');await receipt(t.setBlockClaims(true),'block transfers');
 await assert.rejects(c.resolve(id('live'),u('8')));await assert.rejects(as(g,f.b).claim(campaign));assert.equal((await r.reservations(id('live'))).closed,false);assert.equal(await r.reserved(),u('30'));assert.equal(await r.totalPaid(),0n);assert.equal(await g.claimed(campaign,f.b.address),false);assert.equal((await g.campaigns(campaign)).remaining,u('100'));assert.equal(await g.totalGranted(),0n);
});
test('a contract wallet cannot reenter another campaign during a claim',async()=>{
 const t=await deploy(f.artifacts.HostileToken,f.deployer),g=await deploy(f.artifacts.SurvivalWelcomeGrant,f.deployer,[t.target,f.deployer.address]),receiver=await deploy(f.artifacts.ReentrantWelcomeReceiver,f.deployer,[g.target]);await receipt(g.createCampaign(campaign),'first');await receipt(g.createCampaign(second),'second');await receipt(t.mint(f.a.address,u('200')),'fixture mint');await receipt(as(t,f.a).approve(g.target,u('200')),'approve');await receipt(as(g,f.a).fundCampaign(campaign,u('100')),'fund');await receipt(as(g,f.a).fundCampaign(second,u('100')),'fund');await receipt(t.setCallback(true),'enable malicious callback');
 await receipt(receiver.claim(campaign,second),'contract wallet claim');assert.equal(await receiver.attempted(),true);assert.equal(await receiver.reentered(),false);assert.equal(await g.claimed(campaign,receiver.target),true);assert.equal(await g.claimed(second,receiver.target),false);assert.equal(await t.balanceOf(receiver.target),u('100'));assert.equal(await g.allocated(),u('100'));
});
