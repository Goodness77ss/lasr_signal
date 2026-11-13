import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {keccak256,parseEther} from 'ethers';
import {startEvm} from './evm.ts';
import {fixture,deploy,as,receipt,type Receipt} from './shared.ts';
import {salvageRulesHash,weaponRecoveryPolicyHash,weaponBuildHash,developmentSoldier} from '@last-signal/chain';
import {WeaponCollections,type WeaponCollectionDeployment} from '../../../apps/server/src/weapon-collections.ts';
import {JourneyAssetCatalog} from '../../../apps/server/src/journey-assets.ts';
const evm=await startEvm(18577);
try{
 const f=await fixture(evm.provider),receipts:Receipt[]=[...f.receipts];
 const legacy=await deploy(f.artifacts.GunArmory,f.deployer,[f.token.target,f.authority.address,salvageRulesHash],receipts,'deploy original collection');
 const next=await deploy(f.artifacts.SurvivalGunCollection,f.deployer,[f.token.target,f.authority.address,weaponRecoveryPolicyHash],receipts,'deploy V2 collection');
 await receipt(as(f.token,f.a).approve(legacy.target,parseEther('20')),'approve original mock cost',receipts);await receipt(as(legacy,f.a).buyGun(0),'mint original rifle',receipts);
 await receipt(as(f.token,f.b).approve(next.target,parseEther('35')),'approve V2 mock cost',receipts);await receipt(as(next,f.b).buyGun(2),'mint V2 shotgun',receipts);await evm.provider.send('evm_mine',[]);
 const manifest=async(c:typeof legacy,version:WeaponCollectionDeployment['version'],rulesHash:string):Promise<WeaponCollectionDeployment>=>({collection:String(c.target),version,chainId:31337,currency:String(f.token.target),gameplaySigner:f.authority.address,rulesHash,codeHash:keccak256(await evm.provider.getCode(c.target))});
 const registry=new WeaponCollections(evm.provider,[await manifest(legacy,'LEGACY_V1',salvageRulesHash),await manifest(next,'SURVIVAL_V2',weaponRecoveryPolicyHash)]),catalog=new JourneyAssetCatalog(registry);
 const identity=(c:typeof legacy)=>({kind:'gun' as const,chainId:'31337',collection:String(c.target),tokenId:'1'});
 const before=[await catalog.inspect(identity(legacy)),await catalog.inspect(identity(next))];assert.notEqual(before[0].key,before[1].key);
 await receipt(as(legacy,f.a).listGun(1,parseEther('6')),'list original expected price',receipts);await receipt(as(next,f.b).listGun(1,parseEther('8'),weaponBuildHash(2)),'list V2 expected build',receipts);
 const quotes=[await catalog.quote(identity(legacy)),await catalog.quote(identity(next))];
 await receipt(as(f.token,f.b).approve(legacy.target,quotes[0].price),'approve original sale',receipts);await receipt(as(legacy,f.b).buyListed(1,quotes[0].price),'trade original rifle',receipts);
 await receipt(as(f.token,f.a).approve(next.target,quotes[1].price),'approve V2 sale',receipts);await receipt(as(next,f.a).buyListed(1,quotes[1].price,quotes[1].expectedBuildHash,quotes[1].expectedNonce),'trade V2 shotgun',receipts);await evm.provider.send('evm_mine',[]);
 const after=[await catalog.owned(identity(legacy),f.b.address),await catalog.owned(identity(next),f.a.address)];assert.deepEqual(after.map(a=>a.uri),before.map(a=>a.uri));
 await assert.rejects(catalog.inspect({...identity(legacy),chainId:'46630'}));await assert.rejects(new JourneyAssetCatalog(registry,[{chainId:'31337',collection:String(legacy.target)}]).inspect(identity(legacy)));
 const report={generatedAt:new Date().toISOString(),environment:'DISPOSABLE_LOCAL_BLOCKCHAIN',chainId:31337,deployments:registry.deployments,receipts,before,quotes,after,metadataUnchanged:true,wrongChainRejected:true,disabledCollectionRejected:true,localDevelopmentExample:developmentSoldier('mara'),limits:'Local mock token and disposable contracts. No soldier collection, public deployment, Journey equipment admission or real currency transaction.'};
 writeFileSync('docs/evidence/journey-assets-proof.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({environment:report.environment,receipts:receipts.length,distinctKeys:before.map(a=>a.key),metadataUnchanged:true,owners:after.map(a=>a.owner)}));
}finally{evm.provider.destroy();await evm.stop();}
