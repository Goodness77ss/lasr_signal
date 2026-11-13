import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {id,keccak256,Wallet} from 'ethers';
import {startEvm} from './evm.ts';
import {compile} from './compile.ts';
import {deploy,as,receipt,timestamp,at,type Receipt} from './shared.ts';
import {JOURNEY_SOLDIER_BUILDS,soldierRunHash} from '@last-signal/chain';
import {pinJourneyRules,JOURNEY_REWARD_STREAM_RULES} from '../../sim/src/journey/rules.ts';
import {JOURNEY_IDENTIFIERS} from '../../protocol/src/journey.ts';
import {SoldierCollections,type SoldierCollectionDeployment} from '../../../apps/server/src/journey-soldiers.ts';
import {JourneyDeploymentJournal,type DeploymentRequest} from '../../../apps/server/src/journey-deployments.ts';
import {JourneyService} from '../../../apps/server/src/journey-service.ts';

const evm=await startEvm(18581),directory=mkdtempSync(join(tmpdir(),'journey-lease-proof-')),file=join(directory,'proof.sqlite');
let db:DatabaseSync|undefined,service:JourneyService|undefined;
try{
 const deployer=await evm.provider.getSigner(0),a=await evm.provider.getSigner(1),b=await evm.provider.getSigner(2),runService=await evm.provider.getSigner(3),authority=Wallet.createRandom(),receipts:Receipt[]=[];
 const rulesHash='0x'+(await pinJourneyRules(JOURNEY_REWARD_STREAM_RULES)).hash;
 const soldiers=await deploy(compile().JourneySoldiers,deployer,[authority.address,rulesHash,JOURNEY_SOLDIER_BUILDS.map(b=>b.hash),10],receipts,'deploy approved local collection with one hour leases');
 const deployment:SoldierCollectionDeployment={version:'JOURNEY_SOLDIERS_V1',chainId:31337,collection:String(soldiers.target),mintAuthority:deployer.address,gameplaySigner:authority.address,rulesHash,codeHash:keccak256(await evm.provider.getCode(soldiers.target)),classSupplyCap:10,maxSupply:70};
 const adapter=new SoldierCollections(evm.provider,deployment),asset={kind:'soldier' as const,chainId:'31337',collection:String(soldiers.target),tokenId:'1'};
 await receipt(soldiers.mintDevelopment(a.address,0,id('lease proof authorized mint')),'mint local Mara',receipts);
 db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');service=new JourneyService(db,{deploymentVerifier:adapter});
 const messages:Record<string,unknown>[]=[],client=service.connect({send:m=>messages.push(m as Record<string,unknown>),close:()=>{}});
 await client.receive({op:'start',...JOURNEY_IDENTIFIERS});const session=messages.find(m=>m.op==='session')!,runId=String(session.run),credential=String(session.credential);
 async function start(runId:string,duration:bigint):Promise<DeploymentRequest>{
  await receipt(as(soldiers,a).startLease(1,soldierRunHash(runId),runService.address,await timestamp(evm.provider)+duration),'owner consents exact run '+runId,receipts);
  const lease=await soldiers.runLease(1);await evm.provider.send('evm_mine',[]);return {asset,runId,owner:a.address,service:runService.address,leaseId:String(lease.id)};
 }
 const first=await start(runId,3600n),[reserved]=await service.store.deployments.reserve([first]);
 await assert.rejects(service.store.deployments.reserve([{...first,runId:'conflicting-run'}]));
 await assert.rejects(as(soldiers,a).startLease(1,soldierRunHash('conflicting-run'),runService.address,await timestamp(evm.provider)+100n));
 await assert.rejects(as(soldiers,a).transferFrom(a.address,b.address,1));
 await service.tick();const tickBeforeRelease=service.store.load(runId,credential).run.tick;assert.equal(tickBeforeRelease,1);
 const command={op:'command' as const,id:'lease-proof-shot',sequence:1,actorId:1,section:service.store.load(runId,credential).run.section,action:{kind:'fire' as const,direction:{x:1,y:0,z:0}}};
 await client.receive(command);assert.equal(service.store.load(runId,credential).run.actors[0].ammo,19);
 await receipt(as(soldiers,runService).releaseLease(1,first.leaseId),'run service releases early',receipts);await evm.provider.send('evm_mine',[]);
 await assert.rejects(client.receive({...command,id:'post-release-shot',sequence:2}));await client.receive(command);assert.equal(messages.filter(m=>m.op==='ack').length,2);
 await service.tick();const tickAfterRelease=service.store.load(runId,credential).run.tick;assert.equal(tickAfterRelease,tickBeforeRelease);assert.equal(service.store.load(runId,credential).run.actors[0].ammo,19);
 const released=await service.store.deployments.close(first);assert.equal(released.state,'RELEASED');client.close();service.close();service=undefined;db.close();db=new DatabaseSync(file);
 const recovered=new JourneyDeploymentJournal(db,adapter);assert.deepEqual(recovered.current(asset),released);
 const second=await start('expiry-proof',100n);await recovered.reserve([second]);const expiry=BigInt((await soldiers.runLease(1)).expiresAt);
 await assert.rejects(as(soldiers,runService).releaseLease(1,first.leaseId));
 await at(evm.provider,expiry-1n);await evm.provider.send('evm_mine',[]);await assert.rejects(as(soldiers,a).transferFrom.staticCall(a.address,b.address,1));
 await at(evm.provider,expiry);const transferred=await receipt(as(soldiers,a).transferFrom(a.address,b.address,1),'transfer at exact expiry without service or unlock transaction',receipts);
 assert.equal(BigInt((await evm.provider.getBlock(transferred.blockNumber))!.timestamp),expiry);await evm.provider.send('evm_mine',[]);await assert.rejects(recovered.authorize(second));const expired=await recovered.close(second);assert.equal(expired.state,'EXPIRED');
 assert.equal((await adapter.owned(asset,b.address)).owner,b.address);await receipt(as(soldiers,b).transferFrom(b.address,a.address,1),'return ownership without reviving old run',receipts);await evm.provider.send('evm_mine',[]);await assert.rejects(adapter.verify(second));
 const third=await start('independent-unlock-proof',100n),thirdExpiry=BigInt((await soldiers.runLease(1)).expiresAt);await at(evm.provider,thirdExpiry);await evm.provider.send('evm_mine',[]);
 await receipt(as(soldiers,b).clearExpiredLease(1,third.leaseId),'unrelated wallet clears expired lease',receipts);assert.equal(await soldiers.leaseActive(1),false);
 const report={generatedAt:new Date().toISOString(),environment:'DISPOSABLE_LOCAL_BLOCKCHAIN',deployment,maxLeaseSeconds:3600,receipts,reserved,released,expired,finalOwner:await soldiers.ownerOf(1),leaseActive:false,tickBeforeRelease,tickAfterRelease,checks:{secondRunRejected:true,transferWhileActiveRejected:true,postReleaseCommandRejected:true,originalAcknowledgementRetried:true,diskRecoveryEqual:true,staleReleaseRejected:true,exactExpiryTransfer:true,returnedOwnerCannotReviveOldLease:true,independentExpiredClear:true},limits:'Actual local contract and service access guard proof. The practice run uses an explicit attached lease fixture, not an owned combat roster or banked XP bridge. No human wallet interaction, public deployment or money. The disposable node is closed after this proof.'};
 writeFileSync('docs/evidence/journey-leases-proof.json',JSON.stringify(report,null,2)+'\n');
 writeFileSync('docs/evidence/journey-leases-local-deployment.json',JSON.stringify({generatedAt:report.generatedAt,environment:report.environment,lifecycle:'Closed disposable node; evidence addresses only.',deployment,leasePolicy:'journey-owner-run-lock-1',maxLeaseSeconds:3600,ownerDecision:'J11',deploymentReceipt:receipts[0]},null,2)+'\n');
 console.log(JSON.stringify({environment:report.environment,receipts:receipts.length,maxLeaseSeconds:3600,checks:report.checks}));
}finally{service?.close();db?.close();evm.provider.destroy();await evm.stop();rmSync(directory,{recursive:true,force:true});}
