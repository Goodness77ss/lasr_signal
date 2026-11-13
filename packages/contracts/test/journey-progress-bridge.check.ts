import {JourneyOwnedWallet} from '../../../apps/web/src/journey-owned-wallet.ts';
import {JourneyProgressWallet} from '../../../apps/web/src/journey-progress-wallet.ts';
import Fastify from 'fastify';
import {journeyProgressRoutes} from '../../../apps/server/src/journey-progress-routes.ts';
import {JourneyService} from '../../../apps/server/src/journey-service.ts';
import {WalletAuth} from '../../../apps/server/src/wallet-auth.ts';
import {JOURNEY_OWNED_IDENTIFIERS,parseJourneyClient} from '../../protocol/src/journey.ts';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {journeyReviewBot} from '../../sim/src/journey/review-bot.ts';
import {writeFileSync} from 'node:fs';
import {ownedRosterEntry,PRACTICE_ROSTER} from '../../sim/src/journey/roster.ts';
import {pinJourneyRules,JOURNEY_OWNED_STREAM_RULES} from '../../sim/src/journey/rules.ts';
import {JourneyOwnedRoster} from '../../../apps/server/src/journey-owned-roster.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {id,keccak256,verifyTypedData} from 'ethers';
import {JOURNEY_SOLDIER_BUILDS,soldierRunHash,journeyAssetKey,soldierProgressDomain,soldierProgressTypes} from '@last-signal/chain';
import {startEvm} from '../scripts/evm.ts';
import {fixture,deploy,as,receipt,timestamp} from '../scripts/shared.ts';
import {createJourney,journeyStep,journeyWorld,journeyBank} from '../../sim/src/journey/encounter.ts';
import {JourneyStore} from '../../../apps/server/src/journey-store.ts';
import {SoldierCollections} from '../../../apps/server/src/journey-soldiers.ts';
import {JourneyProgressChain} from '../../../apps/server/src/journey-progress-chain.ts';
test('protected chain signer accepts only exact durable leased bank voucher',async()=>{
 const evm=await startEvm(18592),directory=resolve('.runtime/progress-bridge',randomUUID());mkdirSync(directory,{recursive:true});const database=resolve(directory,'journal.sqlite');let db=new DatabaseSync(database);
 try{
  const f=await fixture(evm.provider),run=await createJourney({streamed:true});run.state='BANKED';
  const soldiers=await deploy(f.artifacts.JourneySoldiers,f.deployer,[f.authority.address,'0x'+run.pin.hash,JOURNEY_SOLDIER_BUILDS.map(b=>b.hash),10]);
  await receipt(soldiers.mintDevelopment(f.a.address,0,id('authored bridge soldier')),'authored soldier issuance');
  const expiry=await timestamp(evm.provider)+3600n;
  await receipt(as(soldiers,f.a).startLease(1,soldierRunHash('bank'),f.authority.address,expiry),'owner exact run lease');await evm.provider.send('evm_mine',[]);
  const adapter=new SoldierCollections(evm.provider,{version:'JOURNEY_SOLDIERS_V1',chainId:31337,collection:String(soldiers.target),mintAuthority:f.deployer.address,gameplaySigner:f.authority.address,rulesHash:'0x'+run.pin.hash,codeHash:keccak256(await evm.provider.getCode(soldiers.target)),classSupplyCap:10,maxSupply:70});
  const store=new JourneyStore(db,adapter),asset={kind:'soldier' as const,chainId:'31337',collection:String(soldiers.target),tokenId:'1'},key=journeyAssetKey(asset),lease=await soldiers.runLease(1);
  const ownedRoster=new JourneyOwnedRoster(adapter,f.authority.address);
  const preparedRoster=await ownedRoster.prepare('bank',f.a.address,[{actorId:1,asset,leaseId:lease.id}]);
  assert.equal(preparedRoster.members[0].classId,'mara');assert.equal(preparedRoster.members[0].key,key);
  await assert.rejects(ownedRoster.prepare('bank',f.b.address,[{actorId:1,asset,leaseId:lease.id}]));
  await store.deployments.reserve([{asset,runId:'bank',owner:f.a.address,service:f.authority.address,leaseId:lease.id}]);store.create('bank','credential',run);
  // Explicit authored participation journal fixture; this does not claim earned gameplay XP.
  db.prepare('INSERT INTO journey_experience VALUES(?,?,?,?,?,?,?,?,?,?)').run('bank','authored checkpoint',1,'soldier-token',key,'eip155:31337:'+f.a.address,'journey-progress-1',run.pin.hash,'0',10);
  db.exec('BEGIN IMMEDIATE');store.progressOutbox.stage('bank');db.exec('COMMIT');
  const bridge=new JourneyProgressChain(db,evm.provider,adapter,store.deployments,f.authority,f.authority.address),source=String(store.progressOutbox.forRun('bank')[0].source),prepared=await store.progressOutbox.prepare(source,bridge);
  const row=db.prepare('SELECT signature FROM journey_progress_outbox WHERE source=?').get(source)!;
  assert.equal(verifyTypedData(soldierProgressDomain(31337n,String(soldiers.target)),soldierProgressTypes,prepared.voucher,String(row.signature)),f.authority.address);
  await assert.rejects(bridge.sign(key,{...prepared.voucher,cumulativeXp:'999'}),/durable progress reservation/);
  const beforeApply=await evm.provider.send('evm_snapshot',[]);
  const accepted=await receipt(as(soldiers,f.a).applyProgress(prepared.voucher,String(row.signature)),'apply exact authored bank voucher');
  assert.equal((await bridge.confirm(source,accepted.hash)).state,'SUBMITTED');
  await evm.provider.send('evm_mine',[]);
  assert.equal((await bridge.confirm(source,accepted.hash)).state,'CONFIRMED');
  assert.equal((await bridge.confirm(source,accepted.hash)).state,'CONFIRMED');
  assert.equal((await soldiers.progress(1)).cumulativeXp,10n);
  await evm.provider.send('evm_revert',[beforeApply]);
  assert.equal((await bridge.confirm(source,accepted.hash)).state,'ORPHANED');
  const ownedPin=await pinJourneyRules(JOURNEY_OWNED_STREAM_RULES),ownedCollection=await deploy(f.artifacts.JourneySoldiers,f.deployer,[f.authority.address,'0x'+ownedPin.hash,JOURNEY_SOLDIER_BUILDS.map(b=>b.hash),10]);
  await receipt(ownedCollection.mintDevelopment(f.a.address,0,id('authored atomic roster soldier')),'issue atomic roster fixture');
  await receipt(as(ownedCollection,f.a).startLease(1,soldierRunHash('owned'),f.authority.address,await timestamp(evm.provider)+3600n),'owner owned roster lease');await evm.provider.send('evm_mine',[]);
  const ownedAdapter=new SoldierCollections(evm.provider,{...adapter.deployment,collection:String(ownedCollection.target),rulesHash:'0x'+ownedPin.hash,codeHash:keccak256(await evm.provider.getCode(ownedCollection.target))}),ownedStore=new JourneyStore(db,ownedAdapter),ownedVerifier=new JourneyOwnedRoster(ownedAdapter,f.authority.address),ownedAsset={...asset,collection:String(ownedCollection.target)},ownedKey=journeyAssetKey(ownedAsset),catalogue=ownedRosterEntry(ownedKey,'mara',1),ownedLease=await ownedCollection.runLease(1);
  const ownedRun=await createJourney({streamed:true,seed:5,ownedOwner:f.a.address.toLowerCase(),roster:[{id:ownedKey,revision:1,loadout:'signature'},{id:'starter:2',revision:1,loadout:'signature'},{id:'starter:3',revision:1,loadout:'signature'}],catalogue:[catalogue,...PRACTICE_ROSTER]}),choices=[{actorId:1,asset:ownedAsset,leaseId:ownedLease.id}];
  db.exec("CREATE TRIGGER fail_owned_progress BEFORE INSERT ON journey_progress_entries WHEN NEW.run_id='owned' BEGIN SELECT RAISE(ABORT,'injected owned admission failure'); END;");
  await assert.rejects(ownedStore.createOwned('owned','credential',ownedRun,choices,ownedVerifier),/injected owned admission failure/);
  assert.equal(ownedStore.deployments.forRun('owned').length,0);assert.equal(db.prepare('SELECT count(*) AS n FROM journey_runs WHERE id=?').get('owned')!.n,0);
  db.exec('DROP TRIGGER fail_owned_progress');
  await ownedStore.createOwned('owned','credential',ownedRun,choices,ownedVerifier);
  assert.equal(ownedStore.deployments.forRun('owned').length,1);assert.equal(ownedStore.load('owned','credential').run.actors[0].build!.entitlement,'owned-collectible');
  const progressEntry=db.prepare('SELECT identities FROM journey_progress_entries WHERE run_id=?').get('owned')!;
  assert.equal(JSON.parse(String(progressEntry.identities))[0].identity.key,ownedKey);
  let revision=0;
  for(let i=0;i<4000&&ownedRun.state==='ACTIVE';i++){journeyReviewBot(ownedRun,journeyWorld(ownedRun));journeyStep(ownedRun);ownedStore.saveTick('owned',revision++,ownedRun);}
  assert.equal(ownedRun.state,'CHECKPOINT_REACHED');assert.equal(ownedStore.progress.forRun('owned')!.members[0].xp,'10');
  assert.equal(journeyBank(ownedRun),true);
  ownedStore.commit('owned',revision,{op:'command',id:'bank-earned',sequence:1,section:ownedRun.section,actorId:1,action:{kind:'bank'}},ownedRun,{op:'ack',id:'bank-earned',ok:true,reason:'Accepted',sequence:1,order:revision+1,tick:ownedRun.tick});
  const earnedSource=String(ownedStore.progressOutbox.forRun('owned')[0].source),earnedBridge=new JourneyProgressChain(db,evm.provider,ownedAdapter,ownedStore.deployments,f.authority,f.authority.address),earned=await ownedStore.progressOutbox.prepare(earnedSource,earnedBridge),earnedRow=db.prepare('SELECT signature FROM journey_progress_outbox WHERE source=?').get(earnedSource)!;
  assert.equal(earned.voucher.cumulativeXp,'10');
  const progressApi=Fastify(),progressAuth=new WalletAuth(db,31337),progressOrigin='http://127.0.0.1:5174';
  journeyProgressRoutes(progressApi,new Set([progressOrigin]),ownedStore,earnedBridge,(token,origin)=>progressAuth.identify(token,origin));
  const ownerChallenge=progressAuth.challenge(f.a.address,progressOrigin),ownerLogin=progressAuth.verify(ownerChallenge.nonce,await f.a.signMessage(ownerChallenge.message),progressOrigin);
  const ownerHeaders={origin:progressOrigin,authorization:'Bearer '+ownerLogin.session};
  const preparedResponse=await progressApi.inject({method:'POST',url:'/journey/progress/prepare',headers:ownerHeaders,payload:{source:earnedSource}});
  assert.equal(preparedResponse.statusCode,200);assert.equal(preparedResponse.json().voucher.cumulativeXp,'10');
  assert.equal((await progressApi.inject({method:'POST',url:'/journey/progress/prepare',headers:{origin:progressOrigin},payload:{source:earnedSource}})).statusCode,401);
  const otherChallenge=progressAuth.challenge(f.b.address,progressOrigin),otherLogin=progressAuth.verify(otherChallenge.nonce,await f.b.signMessage(otherChallenge.message),progressOrigin);
  assert.equal((await progressApi.inject({method:'POST',url:'/journey/progress/prepare',headers:{origin:progressOrigin,authorization:'Bearer '+otherLogin.session},payload:{source:earnedSource}})).statusCode,403);
  assert.equal(preparedResponse.headers['cache-control'],'no-store');await progressApi.close();
  const progressWallet=new JourneyProgressWallet(evm.provider,f.a,f.a.address,ownedAdapter.deployment);
  const earnedReceipt=await receipt(progressWallet.submit(earned.voucher,String(earnedRow.signature)),'apply actual simulated participation progress through owner wallet transport');await evm.provider.send('evm_mine',[]);
  assert.equal((await earnedBridge.confirm(earnedSource,earnedReceipt.hash)).state,'CONFIRMED');
  const activeLease=await ownedCollection.runLease(1);await evm.provider.send('evm_setNextBlockTimestamp',[Number(activeLease.expiresAt)+1]);await evm.provider.send('evm_mine',[]);
  const exchange=await deploy(f.artifacts.JourneySoldierMarket,f.deployer,[ownedCollection.target,f.token.target]),history=await ownedCollection.progress(1);
  await receipt(as(ownedCollection,f.a).approve(exchange.target,1),'owner sale approval');
  await receipt(as(exchange,f.a).listSoldier(1,7,history.revision,await ownedCollection.progressNonce(1)),'list earned soldier after lease expiry');
  const saleTerms=await exchange.quote(1);await receipt(as(f.token,f.b).approve(exchange.target,7),'exact soldier payment allowance');
  const sale=await receipt(as(exchange,f.b).buyListed(1,saleTerms.seller,saleTerms.price,saleTerms.nonce,saleTerms.progressRevision,saleTerms.assetNonce),'sell soldier with earned history');await evm.provider.send('evm_mine',[]);
  assert.equal((await ownedAdapter.inspect(ownedAsset)).progress.cumulativeXp,'10');assert.equal(await ownedCollection.ownerOf(1),f.b.address);
  db.close();db=new DatabaseSync(database);const reopened=new JourneyStore(db,ownedAdapter);
  assert.equal(reopened.progressOutbox.forRun('owned')[0].state,'CONFIRMED');assert.equal(reopened.progress.forRun('owned')!.members[0].xp,'10');
  assert.equal((await ownedAdapter.inspect(ownedAsset)).progress.cumulativeXp,'10');
  const serviceRun='d'.repeat(32),credential='e'.repeat(64),origin='http://127.0.0.1:5174';
  await receipt(ownedCollection.mintDevelopment(f.a.address,0,id('authored service roster soldier')),'issue owned service fixture');
  const ownedWallet=new JourneyOwnedWallet(evm.provider,f.a,f.a.address,ownedAdapter.deployment,f.authority.address);
  assert.equal((await ownedWallet.inspect('2')).classId,'mara');
  const leaseTx=await ownedWallet.startLease('2',serviceRun);await receipt(leaseTx,'owner service run lease through wallet transport');await evm.provider.send('evm_mine',[]);
  assert.equal(await ownedWallet.leaseOutcome(leaseTx.hash,leaseTx.nonce,'2',serviceRun),'confirmed');
  await assert.rejects(ownedWallet.leaseOutcome(leaseTx.hash,leaseTx.nonce+1,'2',serviceRun),/nonce mismatch/);
  const serviceAsset={...ownedAsset,tokenId:'2'},serviceKey=journeyAssetKey(serviceAsset),serviceLease=await ownedCollection.runLease(2),auth=new WalletAuth(db,31337),service=new JourneyService(db,{deploymentVerifier:ownedAdapter,ownedRoster:ownedVerifier});
  const login=async(wallet:typeof f.a)=>{const challenge=auth.challenge(wallet.address,origin);return auth.verify(challenge.nonce,await wallet.signMessage(challenge.message),origin).session;};
  const firstToken=await login(f.a),messages:Record<string,any>[]=[];
  const connect=(drop=false)=>service.connect({send:m=>{if(!drop)messages.push(m as Record<string,any>);},close:()=>{},identify:token=>auth.identify(token,origin)});
  const request={op:'start',...JOURNEY_OWNED_IDENTIFIERS,session:firstToken,admission:{run:serviceRun,credential},roster:[{id:serviceKey,revision:1,loadout:'signature'},null,null],ownedSoldiers:[{actorId:1,asset:serviceAsset,leaseId:serviceLease.id}]};
  const lost=connect(true);await lost.receive(parseJourneyClient(JSON.stringify(request)));lost.close();
  const freshToken=await login(f.a),recoveredPeer=connect();await recoveredPeer.receive(parseJourneyClient(JSON.stringify({...request,session:freshToken})));
  assert.equal(messages.find(m=>m.op==='resumed')?.run,serviceRun);assert.equal(db.prepare('SELECT count(*) AS n FROM journey_runs WHERE id=?').get(serviceRun)!.n,1);
  assert.equal(service.store.load(serviceRun,credential).run.actors[0].build!.entitlement,'owned-collectible');recoveredPeer.close();
  const wrong=connect();await assert.rejects(wrong.receive(parseJourneyClient(JSON.stringify({op:'resume',...JOURNEY_OWNED_IDENTIFIERS,session:await login(f.b),run:serviceRun,credential}))),/owner required/);wrong.close();service.close();
  writeFileSync('docs/evidence/journey-earned-progress.json',JSON.stringify({environment:'DISPOSABLE_LOCAL_BLOCKCHAIN',limits:'Actual ordinary review bot encounter and participation, owner SDK submission and chain confirmation. No rendered browser or human playtest.',tick:ownedRun.tick,xp:'10',bankSource:earnedSource,transactionHash:earnedReceipt.hash,collection:String(ownedCollection.target),tokenId:'1',saleTransactionHash:sale.hash,retainedXpAfterSaleAndRestart:'10'},null,2)+'\n');
 }finally{db.close();evm.provider.destroy();await evm.stop();}
});










