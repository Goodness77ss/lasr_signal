import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {id,keccak256,parseEther} from 'ethers';
import {startEvm} from './evm.ts';
import {fixture,deploy,as,receipt,timestamp,type Receipt} from './shared.ts';
import {JOURNEY_GUN_BUILDS,JOURNEY_GUN_RECOVERY_RULES,journeyGunClaimTypes,journeyGunDomain,type JourneyGunClaim} from '@last-signal/chain';
import {JourneyGunCollections,type JourneyGunDeployment} from '../../../apps/server/src/journey-guns.ts';
const evm=await startEvm(18585);
try{
 const f=await fixture(evm.provider),receipts:Receipt[]=[...f.receipts],guns=await deploy(f.artifacts.JourneyGunCollection,f.deployer,[f.token.target,f.authority.address,JOURNEY_GUN_RECOVERY_RULES,JOURNEY_GUN_BUILDS.map(b=>b.hash)],receipts,'deploy separate local Journey gun collection');
 const deployment:JourneyGunDeployment={version:'JOURNEY_GUNS_V1',chainId:31337,collection:String(guns.target),currency:String(f.token.target),gameplaySigner:f.authority.address,rulesHash:JOURNEY_GUN_RECOVERY_RULES,codeHash:keccak256(await evm.provider.getCode(guns.target)),currencyCodeHash:keccak256(await evm.provider.getCode(f.token.target))};
 const claims:JourneyGunClaim[]=JOURNEY_GUN_BUILDS.map((build,kind)=>({dropId:id('authored gun foundation drop '+kind),runId:id('authored gun foundation run'),recipient:f.a.address,kind,rulesHash:JOURNEY_GUN_RECOVERY_RULES,buildHash:build.hash,expiry:'0'}));
 const expiry=String(await timestamp(evm.provider)+1000n);for(const claim of claims)claim.expiry=expiry;
 const signatures=await Promise.all(claims.map(c=>f.authority.signTypedData(journeyGunDomain(31337n,String(guns.target)),journeyGunClaimTypes,c)));
 await receipt(as(guns,f.a).claimLoot(claims,signatures),'claim two authored exact build fixtures',receipts);await evm.provider.send('evm_mine',[]);
 const adapter=new JourneyGunCollections(evm.provider,deployment),identity=(tokenId:string)=>({kind:'gun' as const,chainId:'31337',collection:String(guns.target),tokenId}),before=await Promise.all(['1','2'].map(tokenId=>adapter.owned(identity(tokenId),f.a.address)));
 const price=parseEther('6');await receipt(as(guns,f.a).listGun(1,price,JOURNEY_GUN_BUILDS[0].hash),'seller chooses local fixture price',receipts);const quote=await adapter.quote(identity('1'));
 await receipt(as(f.token,f.b).approve(guns.target,price),'approve exact mock asking price',receipts);await receipt(as(guns,f.b).buyListed(1,f.a.address,price,quote.expectedBuildHash,quote.expectedNonce),'buy exact marksman collectible',receipts);await evm.provider.send('evm_mine',[]);
 const after=await adapter.owned(identity('1'),f.b.address,JOURNEY_GUN_BUILDS[0].hash);assert.equal(after.uri,before[0].uri);await assert.rejects(adapter.owned(identity('1'),f.a.address));await assert.rejects(adapter.owned(identity('1'),f.b.address,JOURNEY_GUN_BUILDS[1].hash));await assert.rejects(as(guns,f.a).claimLoot(claims,signatures));
 const report={generatedAt:new Date().toISOString(),environment:'DISPOSABLE_LOCAL_BLOCKCHAIN',stage:'COLLECTIBLE_FOUNDATION_ONLY',deployment,receipts,builds:JOURNEY_GUN_BUILDS,before,quote,after,metadataUnchanged:true,oldOwnerRejected:true,wrongEquipmentBuildRejected:true,replayRejected:true,limits:'Authored signed claim fixtures, not earned Journey loot. Actual local secondary sale and checked ownership only. Owned Journey equipment admission, complete gun presentation and Step 26 exit remain incomplete. Shop and combat readiness stay disabled. No public deployment, mint price, key or signature export.'};
 writeFileSync('docs/evidence/journey-guns-foundation-proof.json',JSON.stringify(report,null,2)+'\n');writeFileSync('docs/evidence/journey-guns-local-deployment.json',JSON.stringify({generatedAt:report.generatedAt,environment:report.environment,stage:report.stage,lifecycle:'Closed disposable chain; addresses are historical evidence only.',deployment},null,2)+'\n');
 console.log(JSON.stringify({environment:report.environment,stage:report.stage,receipts:receipts.length,metadataUnchanged:true,oldOwnerRejected:true}));
}finally{evm.provider.destroy();await evm.stop();}
