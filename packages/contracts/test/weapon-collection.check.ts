import {test,before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {id,parseEther,ZeroHash,Wallet,keccak256} from 'ethers';
import {startEvm} from '../scripts/evm.ts';
import {fixture,deploy,as,receipt,timestamp,at} from '../scripts/shared.ts';
import {salvageRulesHash,weaponRecoveryPolicyHash,SHOTGUN_BUILD_HASH,weaponLootV2Types,weaponCollectionV2Domain,type WeaponLootClaimV2} from '@last-signal/chain';
import {WeaponCollections,type WeaponCollectionDeployment} from '../../../apps/server/src/weapon-collections.ts';

let evm:Awaited<ReturnType<typeof startEvm>>,f:Awaited<ReturnType<typeof fixture>>,collection:Awaited<ReturnType<typeof deploy>>,legacy:Awaited<ReturnType<typeof deploy>>,checkpoint:string;
before(async()=>{evm=await startEvm(18571);f=await fixture(evm.provider);legacy=await deploy(f.artifacts.GunArmory,f.deployer,[f.token.target,f.authority.address,salvageRulesHash]);collection=await deploy(f.artifacts.SurvivalGunCollection,f.deployer,[f.token.target,f.authority.address,weaponRecoveryPolicyHash]);});
after(async()=>{evm?.provider.destroy();await evm?.stop();});
beforeEach(async()=>{checkpoint=await evm.provider.send('evm_snapshot',[]);});
afterEach(async()=>{await evm.provider.send('evm_revert',[checkpoint]);});
const domain=()=>weaponCollectionV2Domain(31337n,String(collection.target));
const claim=async(label='v2 source'):Promise<WeaponLootClaimV2>=>({dropId:id(label),runId:id('v2 run'),recipient:f.a.address,kind:2,rulesHash:weaponRecoveryPolicyHash,buildHash:SHOTGUN_BUILD_HASH,expiry:String(await timestamp(evm.provider)+3600n)});
const sign=(c:WeaponLootClaimV2,d=domain())=>f.authority.signTypedData(d,weaponLootV2Types,c);
const mint=async()=>{const c=await claim();await receipt(as(collection,f.a).claimLoot([c],[await sign(c)]),'claim new collection gun');};

test('new collection has exact shop burn and immutable build while old rifle and carbine metadata and trades remain intact',async()=>{
 await receipt(as(f.token,f.a).approve(legacy.target,parseEther('20')),'approve old rifle');await receipt(as(legacy,f.a).buyGun(0),'buy old rifle');
 await receipt(as(f.token,f.b).approve(legacy.target,parseEther('30')),'approve old carbine');await receipt(as(legacy,f.b).buyGun(1),'buy old carbine');
 const oldRifle=await legacy.tokenURI(1),oldCarbine=await legacy.tokenURI(2);
 await receipt(as(f.token,f.b).approve(collection.target,parseEther('35')),'approve exactly 35 new collection');await receipt(as(collection,f.b).buyGun(2),'buy new collection gun');
 assert.equal(await collection.ownerOf(1),f.b.address);assert.equal(await legacy.ownerOf(1),f.a.address);
 assert.equal(await collection.BUILD_HASH(),SHOTGUN_BUILD_HASH);assert.equal(await collection.buildHash(1),SHOTGUN_BUILD_HASH);assert.equal(await collection.gunKind(1),2n);
 assert.equal(await f.token.balanceOf(collection.target),0n);assert.equal(await f.token.totalSupply(),parseEther('115'));assert.equal(await f.escrow.liabilities(),0n);
 await assert.rejects(as(collection,f.a).buyGun(3));await assert.rejects(as(legacy,f.a).buyGun(2));
 await receipt(as(legacy,f.a).listGun(1,parseEther('7')),'list old rifle');await receipt(as(f.token,f.b).approve(legacy.target,parseEther('7')),'approve legacy sale');await receipt(as(legacy,f.b).buyListed(1,parseEther('7')),'trade legacy rifle');
 await receipt(as(legacy,f.b).listGun(2,parseEther('9')),'list old carbine');await receipt(as(f.token,f.a).approve(legacy.target,parseEther('9')),'approve carbine sale');await receipt(as(legacy,f.a).buyListed(2,parseEther('9')),'trade legacy carbine');
 assert.equal(await legacy.tokenURI(1),oldRifle);assert.equal(await legacy.tokenURI(2),oldCarbine);assert.equal(await legacy.gunKind(1),0n);assert.equal(await legacy.gunKind(2),1n);
 const uri=await collection.tokenURI(1),metadata=JSON.parse(Buffer.from(uri.split(',')[1],'base64').toString());assert.match(metadata.name,/Trench Shotgun/);assert.match(metadata.image,/^data:image\/svg\+xml;base64,/);
 assert.equal((await collection.ownedPage(f.b.address,0,32))[0][0],1n);await assert.rejects(collection.ownedPage(f.b.address,0,33));
});

test('recovery claims bind the collection, chain, recipient, class and exact immutable build',async()=>{
 const c=await claim(),sig=await sign(c),a=as(collection,f.a);
 for(const patch of [{kind:0},{buildHash:id('another build')},{rulesHash:id('wrong rules')},{runId:id('other run')},{dropId:id('other source')}])await assert.rejects(a.claimLoot([{...c,...patch}],[sig]));
 await assert.rejects(as(collection,f.b).claimLoot([c],[sig]));await assert.rejects(a.claimLoot([c],[await sign(c,weaponCollectionV2Domain(46630n,String(collection.target)))]));
 await assert.rejects(a.claimLoot([c],[await sign(c,weaponCollectionV2Domain(31337n,String(legacy.target)))]));await assert.rejects(a.claimLoot([c],[await Wallet.createRandom().signTypedData(domain(),weaponLootV2Types,c)]));
 assert.equal(await collection.nextTokenId(),1n);await receipt(a.claimLoot([c],[sig]),'claim correct collection');assert.equal(await collection.provenance(1),c.dropId);
});

test('claim batches are atomic, replay protected and reject the exact expiry boundary',async()=>{
 const c=await claim(),sig=await sign(c),a=as(collection,f.a);await assert.rejects(a.claimLoot([c,c],[sig,sig]));assert.equal(await collection.claimed(c.dropId),false);assert.equal(await collection.nextTokenId(),1n);
 await receipt(a.claimLoot([c],[sig]),'claim once');await assert.rejects(a.claimLoot([c],[sig]));await assert.rejects(a.claimLoot([],[]));await assert.rejects(a.claimLoot([c,c,c,c],[sig,sig,sig,sig]));
 const later=await claim('expiry');await at(evm.provider,BigInt(later.expiry));await evm.provider.send('evm_mine',[]);await assert.rejects(a.claimLoot([later],[await sign(later)]));assert.equal(await collection.claimed(later.dropId),false);
});

test('player exchange binds price, build and listing nonce, including same price cancellation and relisting',async()=>{
 await mint();const a=as(collection,f.a),b=as(collection,f.b),price=parseEther('7');await receipt(a.listGun(1,price,SHOTGUN_BUILD_HASH),'list v2');const stale=await collection.listings(1);
 await receipt(a.cancelListing(1),'cancel');await receipt(a.listGun(1,price,SHOTGUN_BUILD_HASH),'relist same price');const live=await collection.listings(1);assert.notEqual(live.nonce,stale.nonce);
 await receipt(as(f.token,f.b).approve(collection.target,price),'approve exactly sale');
 await assert.rejects(b.buyListed(1,price,SHOTGUN_BUILD_HASH,stale.nonce));await assert.rejects(b.buyListed(1,price-1n,SHOTGUN_BUILD_HASH,live.nonce));await assert.rejects(b.buyListed(1,price,id('stale build'),live.nonce));
 await receipt(b.buyListed(1,price,SHOTGUN_BUILD_HASH,live.nonce),'buy expected build and listing');assert.equal(await collection.ownerOf(1),f.b.address);assert.equal(await f.token.balanceOf(f.a.address),parseEther('107'));assert.equal(await f.token.balanceOf(f.b.address),parseEther('93'));assert.equal(await f.token.totalSupply(),parseEther('200'));assert.equal((await collection.listings(1)).price,0n);
 await assert.rejects(b.buyListed(1,price,SHOTGUN_BUILD_HASH,live.nonce));
});

test('external transfers invalidate listings even when the gun comes back to the same owner',async()=>{
 await mint();const a=as(collection,f.a),b=as(collection,f.b);await receipt(a.listGun(1,parseEther('8'),SHOTGUN_BUILD_HASH),'list');const prior=await collection.listings(1);
 await receipt(a.transferFrom(f.a.address,f.b.address,1),'transfer away');await receipt(b.transferFrom(f.b.address,f.a.address,1),'transfer back');assert.equal((await collection.listings(1)).seller,'0x0000000000000000000000000000000000000000');
 await receipt(a.listGun(1,parseEther('8'),SHOTGUN_BUILD_HASH),'new listing');await receipt(as(f.token,f.b).approve(collection.target,parseEther('8')),'approve current sale');await assert.rejects(b.buyListed(1,parseEther('8'),SHOTGUN_BUILD_HASH,prior.nonce));
 await assert.rejects(b.listGun(1,1,SHOTGUN_BUILD_HASH));await assert.rejects(a.listGun(1,0,SHOTGUN_BUILD_HASH));await assert.rejects(a.listGun(1,parseEther('1001'),SHOTGUN_BUILD_HASH));await assert.rejects(a.listGun(1,1,ZeroHash));
});

test('failed token payment and rejected NFT delivery roll back balances, ownership and listing terms',async()=>{
 const a=as(collection,f.a);await assert.rejects(a.buyGun(2));assert.equal(await collection.nextTokenId(),1n);await mint();await receipt(a.listGun(1,parseEther('10'),SHOTGUN_BUILD_HASH),'list');const listing=await collection.listings(1);
 const receiver=await deploy(f.artifacts.RejectingV2GunBuyer,f.deployer);await receipt(receiver.fund(f.token.target),'fund rejecting receiver');await assert.rejects(receiver.buy(f.token.target,collection.target,1,parseEther('10'),SHOTGUN_BUILD_HASH,listing.nonce));
 assert.equal(await collection.ownerOf(1),f.a.address);assert.equal(await f.token.balanceOf(receiver.target),parseEther('100'));assert.equal(await f.token.balanceOf(f.a.address),parseEther('100'));assert.equal((await collection.listings(1)).nonce,listing.nonce);
});

test('server ownership and quote routes cannot confuse equal IDs across the old and new collections',async()=>{
 await receipt(as(f.token,f.a).approve(legacy.target,parseEther('20')),'old approval');await receipt(as(legacy,f.a).buyGun(0),'old ID one');
 await receipt(as(f.token,f.b).approve(collection.target,parseEther('35')),'new approval');await receipt(as(collection,f.b).buyGun(2),'new ID one');await evm.provider.send('evm_mine',[]);
 const descriptions:WeaponCollectionDeployment[]=await Promise.all([{contract:legacy,version:'LEGACY_V1' as const},{contract:collection,version:'SURVIVAL_V2' as const}].map(async({contract,version})=>({collection:String(contract.target),version,chainId:31337,currency:String(f.token.target),gameplaySigner:f.authority.address,rulesHash:version==='LEGACY_V1'?salvageRulesHash:weaponRecoveryPolicyHash,codeHash:keccak256(await evm.provider.getCode(contract.target))})));
 const registry=new WeaponCollections(evm.provider,descriptions),oldAsset={collection:String(legacy.target),tokenId:'1'},newAsset={collection:String(collection.target),tokenId:'1'};
 assert.equal((await registry.owned(oldAsset,f.a.address)).weapon,'rifle');assert.equal((await registry.owned(newAsset,f.b.address)).weapon,'shotgun');
 await assert.rejects(registry.owned(oldAsset,f.b.address));await assert.rejects(registry.owned(newAsset,f.a.address));await assert.rejects(registry.owned({collection:String(f.escrow.target),tokenId:'1'},f.a.address));
 await receipt(as(legacy,f.a).listGun(1,parseEther('6')),'old route listing');await receipt(as(collection,f.b).listGun(1,parseEther('8'),SHOTGUN_BUILD_HASH),'new route listing');
 const oldQuote=await registry.quote(oldAsset),newQuote=await registry.quote(newAsset);assert.equal(oldQuote.route,'LEGACY_EXPECTED_PRICE');assert.equal(oldQuote.expectedBuildHash,null);assert.equal(newQuote.route,'V2_EXPECTED_BUILD');assert.equal(newQuote.expectedBuildHash,SHOTGUN_BUILD_HASH);assert.equal(newQuote.expectedNonce,'1');
 const wrong=new WeaponCollections(evm.provider,[{...descriptions[1],codeHash:ZeroHash}]);await assert.rejects(wrong.owned(newAsset,f.b.address),/code mismatch/);
 await receipt(as(collection,f.b).transferFrom(f.b.address,f.a.address,1),'external ownership transfer');await evm.provider.send('evm_mine',[]);await assert.rejects(registry.owned(newAsset,f.b.address));await assert.rejects(registry.quote(newAsset),/Listing unavailable/);
});
