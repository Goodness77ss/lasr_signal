import {test,before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {id,keccak256,Wallet,ZeroAddress,ZeroHash} from 'ethers';
import {startEvm} from '../scripts/evm.ts';
import {fixture,deploy,as,receipt,timestamp,at} from '../scripts/shared.ts';
import {JOURNEY_SOLDIER_BUILDS,SOLDIER_PROGRESS_POLICY,soldierProgressDomain,soldierProgressTypes,type SoldierProgressVoucher} from '@last-signal/chain';
import {pinJourneyRules,JOURNEY_REWARD_STREAM_RULES} from '../../sim/src/journey/rules.ts';
import {SoldierCollections,type SoldierCollectionDeployment} from '../../../apps/server/src/journey-soldiers.ts';
import {JourneyAssetCatalog} from '../../../apps/server/src/journey-assets.ts';
import {buildServer} from '../../../apps/server/src/app.ts';
let evm:Awaited<ReturnType<typeof startEvm>>,f:Awaited<ReturnType<typeof fixture>>,soldiers:Awaited<ReturnType<typeof deploy>>,snapshot:string,rules:string,manifest:SoldierCollectionDeployment;
const builds=JOURNEY_SOLDIER_BUILDS.map(b=>b.hash);
before(async()=>{
 evm=await startEvm(18578);f=await fixture(evm.provider);rules='0x'+(await pinJourneyRules(JOURNEY_REWARD_STREAM_RULES)).hash;
 // One per class is an isolated boundary fixture, not the product mint policy.
 soldiers=await deploy(f.artifacts.JourneySoldiers,f.deployer,[f.authority.address,rules,builds,1]);
 manifest={version:'JOURNEY_SOLDIERS_V1',chainId:31337,collection:String(soldiers.target),mintAuthority:await f.deployer.getAddress(),gameplaySigner:f.authority.address,rulesHash:rules,codeHash:keccak256(await evm.provider.getCode(soldiers.target)),classSupplyCap:1,maxSupply:7};
});
after(async()=>{evm?.provider.destroy();await evm?.stop();});
beforeEach(async()=>{snapshot=await evm.provider.send('evm_snapshot',[]);});afterEach(async()=>{await evm.provider.send('evm_revert',[snapshot]);});
const mint=async(kind=0,owner?:string)=>receipt(soldiers.mintDevelopment(owner??f.a.address,kind,id('local-development:'+kind)),'mint fixture soldier');
const identity=(tokenId='1')=>({kind:'soldier' as const,chainId:'31337',collection:String(soldiers.target),tokenId});
const domain=()=>soldierProgressDomain(31337n,String(soldiers.target));
const voucher=async(patch:Partial<SoldierProgressVoucher>={}):Promise<SoldierProgressVoucher>=>({tokenId:'1',owner:f.a.address,bankSource:id('bank:1'),rulesHash:rules,policy:SOLDIER_PROGRESS_POLICY,nonce:String(await soldiers.progressNonce(1)),cumulativeXp:'10',furthestCheckpoint:'0',hasCheckpoint:true,expiry:String(await timestamp(evm.provider)+3600n),...patch});
const sign=(p:SoldierProgressVoucher,d=domain())=>f.authority.signTypedData(d,soldierProgressTypes,p);

test('authorized bounded mint creates all seven immutable classes with enumerated ownership and complete metadata',async()=>{
 for(let i=0;i<7;i++){
  await mint(i);const token=i+1;assert.equal(await soldiers.classOf(token),BigInt(i));assert.equal(await soldiers.buildHash(token),builds[i]);assert.equal(await soldiers.ownerOf(token),f.a.address);assert.equal(await soldiers.provenance(token),id('local-development:'+i));
  const metadata=JSON.parse(Buffer.from((await soldiers.tokenURI(token)).split(',')[1],'base64').toString());
  assert.equal(metadata.classId,i);assert.equal(metadata.buildHash,builds[i]);assert.equal(metadata.progress.revision,'0');assert.equal(metadata.progress.hasCheckpoint,false);assert.equal(metadata.gameplayAvailability,'REQUIRES_ADAPTER_AND_RUN_LEASE');assert.match(metadata.image,/^data:image\/svg\+xml;base64,/);
 }
 assert.equal(await soldiers.totalSupply(),7n);assert.equal(await soldiers.maxSupply(),7n);assert.equal((await soldiers.ownedPage(f.a.address,0,32))[0].length,7);assert.equal((await soldiers.ownedPage(f.a.address,7,32))[0].length,0);
 await assert.rejects(soldiers.ownedPage(f.a.address,0,33));await assert.rejects(soldiers.tokenURI(0));await assert.rejects(soldiers.classOf(8));
});
test('rejects unauthorized mint, invalid classes, reused provenance, capacity overflow and unsafe receivers atomically',async()=>{
 await assert.rejects(as(soldiers,f.a).mintDevelopment(f.a.address,0,id('unauthorized')));await assert.rejects(soldiers.mintDevelopment(f.a.address,7,id('bad class')));await assert.rejects(soldiers.mintDevelopment(ZeroAddress,0,id('zero owner')));await assert.rejects(soldiers.mintDevelopment(f.a.address,0,ZeroHash));
 const source=id('unsafe receiver');await assert.rejects(soldiers.mintDevelopment(f.token.target,0,source));assert.equal(await soldiers.mintedSource(source),false);assert.equal(await soldiers.classMinted(0),0n);
 await mint();await assert.rejects(soldiers.mintDevelopment(f.a.address,1,id('local-development:0')));await assert.rejects(soldiers.mintDevelopment(f.a.address,0,id('capacity overflow')));assert.equal(await soldiers.nextTokenId(),2n);
});
test('rejects invalid constructor configuration without changing existing ABIs or compilation settings',async()=>{
 for(const args of [[ZeroAddress,rules,builds,1],[f.authority.address,ZeroHash,builds,1],[f.authority.address,rules,builds,0],[f.authority.address,rules,builds,1001],[f.authority.address,rules,builds.map(()=>builds[0]),1],[f.authority.address,rules,[ZeroHash,...builds.slice(1)],1]])await assert.rejects(deploy(f.artifacts.JourneySoldiers,f.deployer,args));
 assert.equal(soldiers.interface.hasFunction('buySoldier'),false);assert.equal(soldiers.interface.hasFunction('setClass'),false);
});
test('accepts the designated signer once and separates progress revision from immutable class and provenance',async()=>{
 await mint();const p=await voucher(),signature=await sign(p),before=JSON.parse(Buffer.from((await soldiers.tokenURI(1)).split(',')[1],'base64').toString());
 await receipt(as(soldiers,f.a).applyProgress(p,signature),'apply verified fixture progress');const state=await soldiers.progress(1);
 assert.equal(state.cumulativeXp,10n);assert.equal(state.revision,1n);assert.equal(state.hasCheckpoint,true);assert.equal(state.furthestCheckpoint,0n);assert.equal(await soldiers.progressNonce(1),1n);assert.equal(await soldiers.usedProgressSource(1,p.bankSource),true);
 await assert.rejects(as(soldiers,f.a).applyProgress(p,signature));
 const after=JSON.parse(Buffer.from((await soldiers.tokenURI(1)).split(',')[1],'base64').toString());assert.equal(after.buildHash,before.buildHash);assert.equal(after.provenance,before.provenance);assert.equal(after.image,before.image);assert.equal(after.progress.cumulativeXp,'10');assert.equal(after.progress.revision,'1');
});
test('binds every voucher field, chain, collection and current owner and rejects an unrelated signer',async()=>{
 await mint();const p=await voucher(),signature=await sign(p),holder=as(soldiers,f.a);
 for(const patch of [{tokenId:'2'},{owner:f.b.address},{bankSource:id('another bank')},{rulesHash:id('another rules')},{policy:id('another progression policy')},{nonce:'1'},{cumulativeXp:'11'},{furthestCheckpoint:'1'},{hasCheckpoint:false},{expiry:String(BigInt(p.expiry)+1n)}])await assert.rejects(holder.applyProgress({...p,...patch},signature));
 await assert.rejects(as(soldiers,f.b).applyProgress(p,signature));await assert.rejects(holder.applyProgress(p,await sign(p,soldierProgressDomain(46630n,String(soldiers.target)))));await assert.rejects(holder.applyProgress(p,await sign(p,soldierProgressDomain(31337n,String(f.escrow.target)))));
 await assert.rejects(holder.applyProgress(p,await Wallet.createRandom().signTypedData(domain(),soldierProgressTypes,p)));assert.equal((await soldiers.progress(1)).revision,0n);
});
test('rejects stale nonces, reused bank sources, backwards progress and checkpoint overflow',async()=>{
 await mint();const p=await voucher({furthestCheckpoint:'2'});await receipt(as(soldiers,f.a).applyProgress(p,await sign(p)),'initial progress');
 for(const patch of [{bankSource:id('stale'),nonce:'0',cumulativeXp:'20'},{cumulativeXp:'20'},{bankSource:id('backwards xp'),cumulativeXp:'9'},{bankSource:id('backwards checkpoint'),cumulativeXp:'11',furthestCheckpoint:'1'},{bankSource:id('no checkpoint'),cumulativeXp:'0',hasCheckpoint:false,furthestCheckpoint:'0'},{bankSource:id('overflow'),furthestCheckpoint:(2n**64n).toString()},{bankSource:id('no change')}]){
  const bad=await voucher({furthestCheckpoint:'2',...patch});await assert.rejects(as(soldiers,f.a).applyProgress(bad,await sign(bad)));
 }
 const next=await voucher({bankSource:id('bank:2'),cumulativeXp:'20',furthestCheckpoint:'3'});await receipt(as(soldiers,f.a).applyProgress(next,await sign(next)),'monotonic progress');assert.equal((await soldiers.progress(1)).revision,2n);
});
test('rejects the exact expiry boundary and accepts a first zero XP verified checkpoint',async()=>{
 await mint();const p=await voucher({expiry:String(await timestamp(evm.provider)+20n)}),signature=await sign(p);await at(evm.provider,BigInt(p.expiry));await evm.provider.send('evm_mine',[]);await assert.rejects(as(soldiers,f.a).applyProgress(p,signature));
 const zero=await voucher({bankSource:id('zero XP completion'),cumulativeXp:'0'});await receipt(as(soldiers,f.a).applyProgress(zero,await sign(zero)),'checkpoint without XP');assert.equal((await soldiers.progress(1)).hasCheckpoint,true);assert.equal((await soldiers.progress(1)).cumulativeXp,0n);
});
test('retains token progress across ownership changes and invalidates old vouchers even after transfer back',async()=>{
 await mint();const p=await voucher();await receipt(as(soldiers,f.a).applyProgress(p,await sign(p)),'seller progress');
 const old=await voucher({bankSource:id('outstanding seller bank'),cumulativeXp:'20'}),signature=await sign(old);
 await receipt(as(soldiers,f.a).transferFrom(f.a.address,f.b.address,1),'transfer to buyer');assert.equal(await soldiers.progressNonce(1),2n);assert.equal((await soldiers.progress(1)).cumulativeXp,10n);
 await assert.rejects(as(soldiers,f.b).applyProgress(old,signature));const buyer=await voucher({owner:f.b.address,bankSource:id('buyer bank'),cumulativeXp:'20',furthestCheckpoint:'1'});await receipt(as(soldiers,f.b).applyProgress(buyer,await sign(buyer)),'buyer progress');
 await receipt(as(soldiers,f.b).transferFrom(f.b.address,f.a.address,1),'transfer back');await assert.rejects(as(soldiers,f.a).applyProgress(old,signature));assert.equal((await soldiers.progress(1)).revision,2n);assert.equal((await soldiers.progress(1)).cumulativeXp,20n);assert.equal(await soldiers.buildHash(1),builds[0]);
});
test('checked local adapter and read only API verify class, owner and separate progress without enabling combat',async()=>{
 await mint();await evm.provider.send('evm_mine',[]);const adapter=new SoldierCollections(evm.provider,manifest),catalog=new JourneyAssetCatalog(null,[],adapter),inspected=await adapter.owned(identity(),f.a.address);assert.equal((await catalog.owned(identity(),f.a.address)).owner,inspected.owner);
 assert.equal(inspected.immutableBuild.classId,'mara');assert.equal(inspected.progress.cumulativeXp,'0');assert.equal(inspected.capabilities.journeyCombatReady,false);await assert.rejects(catalog.quote(identity()));
 const p=await voucher();await receipt(as(soldiers,f.a).applyProgress(p,await sign(p)),'progress for adapter');assert.equal((await catalog.inspect(identity())).progress!.revision,'1');
 const server=await buildServer({database:':memory:',manual:true,journeySoldiers:{provider:evm.provider,deployment:manifest}});
 try{const response=await server.app.inject('/weapons/journey-inspect?kind=soldier&chainId=31337&collection='+soldiers.target+'&tokenId=1');assert.equal(response.statusCode,200);assert.equal(response.json().progress.cumulativeXp,'10');assert.equal(response.json().owner,f.a.address);}finally{await server.app.close();}
 for(const patch of [{codeHash:id('wrong code')},{rulesHash:id('wrong rules')},{gameplaySigner:f.b.address},{mintAuthority:f.a.address},{classSupplyCap:2,maxSupply:14}])await assert.rejects(new SoldierCollections(evm.provider,{...manifest,...patch}).inspect(identity()));
 await assert.rejects(adapter.inspect({...identity(),chainId:'46630'}));await assert.rejects(adapter.inspect({...identity(),collection:String(f.escrow.target)}));
 await assert.rejects(new JourneyAssetCatalog(null,[{chainId:'31337',collection:String(soldiers.target)}],adapter).inspect(identity()));
});
