import {SupplyMarketWallet} from '../../../apps/web/src/journey-supply-market-wallet.ts';
import {SupplyWallet} from '../../../apps/web/src/journey-supply-wallet.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {id,keccak256} from 'ethers';
import {DatabaseSync} from 'node:sqlite';
import {JourneySupplyReceipts} from '../../../apps/server/src/journey-supply-chain.ts';
import {JourneySupplyJournal} from '../../../apps/server/src/journey-supplies.ts';
import {startEvm} from '../scripts/evm.ts';
import {fixture,deploy,as,receipt,timestamp} from '../scripts/shared.ts';
test('partial supply sale invalidates old quotes and only owner redemption burns unopened stock',async()=>{
 const evm=await startEvm(18589);
 try{
  const f=await fixture(evm.provider),packs=await deploy(f.artifacts.JourneySupplies,f.deployer,[id('J12 local fixture policy')]),market=await deploy(f.artifacts.JourneySupplyMarket,f.deployer,[packs.target,f.token.target]);
  const originalUri=await packs.uri(0);
  const metadata=JSON.parse(Buffer.from(String(originalUri).split(',')[1],'base64').toString());
  assert.equal(metadata.unitsPerPack,3);assert.equal(metadata.itemClass,0);assert.equal(metadata.policyHash,id('J12 local fixture policy'));
  assert.match(metadata.description,/Unused opened stock persists/);assert.match(metadata.image,/^data:image\/svg\+xml;base64,/);
  await assert.rejects(packs.uri(4));
  await receipt(packs.issueDevelopment(f.a.address,0,5),'issue authored health packs');
  await assert.rejects(as(packs,f.b).issueDevelopment(f.b.address,0,1));
  await assert.rejects(as(packs,f.a).redeem(0,0));
  const marketDeployment={chainId:31337 as const,collection:String(packs.target),codeHash:keccak256(await evm.provider.getCode(packs.target)),policyHash:id('J12 local fixture policy'),market:String(market.target),currency:String(f.token.target),marketCodeHash:keccak256(await evm.provider.getCode(market.target)),currencyCodeHash:keccak256(await evm.provider.getCode(f.token.target))};
  const sellerWallet=new SupplyMarketWallet(evm.provider,f.a,f.a.address,marketDeployment),buyerWallet=new SupplyMarketWallet(evm.provider,f.b,f.b.address,marketDeployment);
  await receipt(sellerWallet.approvePacks(true),'approve explicit supply operator');
  const expiry=await timestamp(evm.provider)+3600n;
  await receipt(sellerWallet.list(0,5n,7n,expiry),'list five packs');
  const q=await market.quote(f.a.address,0);
  const reviewed=await buyerWallet.quote(f.a.address,0,2n);
  await receipt(buyerWallet.approveCurrency(BigInt(reviewed.total)),'approve exact partial fill');
  const before=await f.token.balanceOf(f.a.address);
  await receipt(buyerWallet.buy(reviewed),'buy two packs');
  assert.equal(await f.token.balanceOf(f.a.address),before+14n);
  assert.equal(await packs.balanceOf(f.b.address,0),2n);
  assert.equal((await market.quote(f.a.address,0)).quantity,3n);
  await assert.rejects(buyerWallet.buy(reviewed),/quote changed/);
  await assert.rejects(as(market,f.b).buy(f.a.address,0,1,7,7,q.revision,expiry));
  const beforeRedemption=await evm.provider.send('evm_snapshot',[]);
  const wallet=new SupplyWallet(evm.provider,f.b,f.b.address,{chainId:31337,collection:String(packs.target),codeHash:keccak256(await evm.provider.getCode(packs.target)),policyHash:id('J12 local fixture policy')});
  const redemption=await receipt(wallet.redeem(0,1n),'burn one owned pack through wallet transport');
  const log=redemption.logs.find(log=>{try{return packs.interface.parseLog(log)?.name==='Redeemed';}catch{return false;}})!;
  assert.equal(wallet.redemptionLog(redemption,0,1n),log.index);
  const verifier=new JourneySupplyReceipts(evm.provider,{chainId:31337,collection:String(packs.target),codeHash:keccak256(await evm.provider.getCode(packs.target)),policyHash:id('J12 local fixture policy')});
  const db=new DatabaseSync(':memory:');
  try{
   const journal=new JourneySupplyJournal(db,verifier);
   assert.equal((await journal.recover(redemption.hash,log.index)).units,'0');
   await assert.rejects(wallet.confirmedRedemption(redemption.hash,0,1n),/two canonical confirmations/);
   await evm.provider.send('evm_mine',[]);
   assert.equal((await wallet.confirmedRedemption(redemption.hash,0,1n)).logIndex,log.index);
   assert.equal((await journal.recover(redemption.hash,log.index)).units,'3');
   assert.equal((await journal.recover(redemption.hash,log.index)).units,'3');
   await assert.rejects(verifier.verify(redemption.hash,redemption.logs[0].index));
  }finally{db.close();}
  assert.equal(await packs.balanceOf(f.b.address,0),1n);
  assert.equal(await packs.redemptionSequence(),1n);assert.equal(await packs.uri(0),originalUri);
  await assert.rejects(as(packs,f.b).redeem(0,2));
  await receipt(as(packs,f.a).safeTransferFrom(f.a.address,f.b.address,0,1,'0x'),'external balance change');
  await assert.rejects(market.quote(f.a.address,0));
  const recoveryDb=new DatabaseSync(':memory:');
  try{
   const journal=new JourneySupplyJournal(recoveryDb,verifier);
   assert.equal((await journal.recover(redemption.hash,log.index)).units,'3');
   await evm.provider.send('evm_revert',[beforeRedemption]);
   assert.equal((await journal.reconcile(f.b.address)).frozen,true);
   assert.equal(journal.balance(f.b.address,0),3n);
  }finally{recoveryDb.close();}
  for(const cancelled of [false,true]){
   await evm.provider.send('evm_setAutomine',[false]);
   try{
    const tx=await wallet.redeem(0,1n);let replacementHash='';
    const result=wallet.waitRedemption(tx,0,1n,hash=>{replacementHash=hash;}).then(value=>({value,error:null as unknown}),error=>({value:null,error}));
    const replacement=await f.b.sendTransaction({to:cancelled?f.b.address:tx.to!,data:cancelled?'0x':tx.data,value:0,nonce:tx.nonce,gasLimit:cancelled?21000:tx.gasLimit,maxFeePerGas:(tx.maxFeePerGas??tx.gasPrice)*2n+1n,maxPriorityFeePerGas:(tx.maxPriorityFeePerGas??tx.gasPrice)*2n+1n});
    await evm.provider.send('evm_mine',[]);await replacement.wait();await evm.provider.send('evm_mine',[]);
    const outcome=await result;assert.equal(replacementHash,replacement.hash);
    assert.equal(await wallet.replacementOutcome(replacement.hash,tx.nonce),cancelled?'cancelled':'redemption');
    await assert.rejects(wallet.replacementOutcome(replacement.hash,tx.nonce+1),/nonce mismatch/);
    if(cancelled)assert.match((outcome.error as Error).message,/cancelled/);else{assert.equal(outcome.error,null);assert.equal(outcome.value!.transactionHash,replacement.hash);}
   }finally{await evm.provider.send('evm_setAutomine',[true]);await evm.provider.send('evm_mine',[]);}
  }
 }finally{evm.provider.destroy();await evm.stop();}
});








