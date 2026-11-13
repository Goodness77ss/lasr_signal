import {test,before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {id,keccak256,parseEther} from 'ethers';
import {startEvm} from '../scripts/evm.ts';
import {fixture,deploy,as,receipt} from '../scripts/shared.ts';
import {salvageRulesHash,weaponRecoveryPolicyHash,weaponBuildHash,journeyAssetKey} from '@last-signal/chain';
import {WeaponCollections,type WeaponCollectionDeployment} from '../../../apps/server/src/weapon-collections.ts';
import {JourneyAssetCatalog} from '../../../apps/server/src/journey-assets.ts';
let evm:Awaited<ReturnType<typeof startEvm>>,f:Awaited<ReturnType<typeof fixture>>,legacy:Awaited<ReturnType<typeof deploy>>,next:Awaited<ReturnType<typeof deploy>>,registry:WeaponCollections,catalog:JourneyAssetCatalog,snapshot:string;
before(async()=>{
 evm=await startEvm(18576);f=await fixture(evm.provider);
 legacy=await deploy(f.artifacts.GunArmory,f.deployer,[f.token.target,f.authority.address,salvageRulesHash]);next=await deploy(f.artifacts.SurvivalGunCollection,f.deployer,[f.token.target,f.authority.address,weaponRecoveryPolicyHash]);
 await receipt(as(f.token,f.a).approve(legacy.target,parseEther('20')),'local rifle approval');await receipt(as(legacy,f.a).buyGun(0),'local original rifle');
 await receipt(as(f.token,f.b).approve(next.target,parseEther('35')),'local shotgun approval');await receipt(as(next,f.b).buyGun(2),'local V2 shotgun');await evm.provider.send('evm_mine',[]);
 const manifest=async(collection:typeof legacy,version:WeaponCollectionDeployment['version'],rulesHash:string):Promise<WeaponCollectionDeployment>=>({collection:String(collection.target),version,chainId:31337,currency:String(f.token.target),gameplaySigner:f.authority.address,rulesHash,codeHash:keccak256(await evm.provider.getCode(collection.target))});
 registry=new WeaponCollections(evm.provider,[await manifest(legacy,'LEGACY_V1',salvageRulesHash),await manifest(next,'SURVIVAL_V2',weaponRecoveryPolicyHash)]);catalog=new JourneyAssetCatalog(registry);
});
after(async()=>{evm?.provider.destroy();await evm?.stop();});
beforeEach(async()=>{snapshot=await evm.provider.send('evm_snapshot',[]);});afterEach(async()=>{await evm.provider.send('evm_revert',[snapshot]);});
const asset=(collection:typeof legacy)=>({kind:'gun' as const,chainId:'31337',collection:String(collection.target),tokenId:'1'});
test('same numeric ID inspects through the correct ABI and exposes honest mode capabilities',async()=>{
 const old=await catalog.inspect(asset(legacy)),fresh=await catalog.inspect(asset(next));
 assert.notEqual(old.key,fresh.key);assert.equal(old.key,journeyAssetKey(asset(legacy)));assert.equal(old.owner,f.a.address);assert.equal(fresh.owner,f.b.address);
 assert.equal(old.uri,await legacy.tokenURI(1));assert.equal(fresh.uri,await next.tokenURI(1));assert.equal(old.immutableBuild.hash,weaponBuildHash(0));assert.equal(fresh.immutableBuild.hash,weaponBuildHash(2));
 assert.equal(old.capabilities.combatReady,true);assert.equal(old.combatMode,'LEGACY_SALVAGE');assert.equal(fresh.capabilities.combatReady,false);assert.equal(old.capabilities.journeyCombatReady,false);assert.equal(fresh.capabilities.journeyCombatReady,false);
 await catalog.owned(asset(legacy),f.a.address);await assert.rejects(catalog.owned(asset(legacy),f.b.address));assert.throws(()=>catalog.requireJourneyEquipment(asset(legacy)),/not enabled/);
});
test('preserves actual legacy expected price and V2 expected build and nonce sales',async()=>{
 const oldUri=await legacy.tokenURI(1),newUri=await next.tokenURI(1);
 await receipt(as(legacy,f.a).listGun(1,parseEther('6')),'list original');await receipt(as(next,f.b).listGun(1,parseEther('8'),weaponBuildHash(2)),'list V2');
 const old=await catalog.quote(asset(legacy)),fresh=await catalog.quote(asset(next));assert.equal(old.route,'LEGACY_EXPECTED_PRICE');assert.equal(fresh.route,'V2_EXPECTED_BUILD');
 await receipt(as(f.token,f.b).approve(legacy.target,old.price),'approve original sale');await receipt(as(legacy,f.b).buyListed(1,old.price),'trade original');
 await receipt(as(f.token,f.a).approve(next.target,fresh.price),'approve V2 sale');await receipt(as(next,f.a).buyListed(1,fresh.price,fresh.expectedBuildHash,fresh.expectedNonce),'trade V2');await evm.provider.send('evm_mine',[]);
 assert.equal((await catalog.owned(asset(legacy),f.b.address)).owner,f.b.address);assert.equal((await catalog.owned(asset(next),f.a.address)).owner,f.a.address);
 assert.equal(await legacy.tokenURI(1),oldUri);assert.equal(await next.tokenURI(1),newUri);
});
test('rejects wrong chains, unknown kinds and collections, and explicit disabled registrations',async()=>{
 for(const value of [{...asset(legacy),chainId:'46630'},{...asset(legacy),chainId:'1'},{...asset(legacy),collection:String(f.escrow.target)},{...asset(legacy),kind:'soldier'},{...asset(legacy),kind:'consumable',amount:'1'}])await assert.rejects(catalog.inspect(value));
 await assert.rejects(new JourneyAssetCatalog(registry,[{chainId:'31337',collection:String(legacy.target)}]).inspect(asset(legacy)),/disabled/);
 const wrongRpc=new JourneyAssetCatalog(new WeaponCollections(evm.provider,[{...registry.deployments[0],chainId:46630}]));
 await assert.rejects(wrongRpc.inspect({...asset(legacy),chainId:'46630'}),/chain mismatch/);
 assert.throws(()=>new JourneyAssetCatalog(registry,[{chainId:'031337',collection:String(legacy.target)}]),/Canonical/);
});
test('rejects changed code, mismatched immutable currency, signer and rules against actual contract reads',async()=>{
 for(const patch of [{codeHash:id('changed runtime')},{currency:String(f.escrow.target)},{gameplaySigner:f.b.address},{rulesHash:id('wrong policy')}]){
  const changed={...registry.deployments[0],...patch};const isolated=new JourneyAssetCatalog(new WeaponCollections(evm.provider,[changed]));await assert.rejects(isolated.inspect(asset(legacy)));
 }
 await evm.provider.send('hardhat_setCode',[String(legacy.target),'0x00']);await assert.rejects(catalog.inspect(asset(legacy)),/code mismatch/);
});
test('rejects a runtime verified but unsupported gun build even when its numeric kind is familiar',async()=>{
 // Explicit ABI response fixture over real deployed bytecode checks. The immutable
 // build parser must reject the response before allowing an inspect or trade.
 const checked=registry.checked.bind(registry);registry.checked=async value=>{
  const result=await checked(value);if(result.asset.collection!==String(next.target))return result;
  return {...result,contract:new Proxy(result.contract,{get(target,key){if(key==='buildHash')return async()=>id('unsupported build');return Reflect.get(target,key);}})};
 };
 try{await assert.rejects(catalog.inspect(asset(next)),/Unsupported immutable weapon build/);await assert.rejects(catalog.quote(asset(next)),/Unsupported immutable weapon build/);}finally{registry.checked=checked;}
});
