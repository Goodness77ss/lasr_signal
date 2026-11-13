import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {id,keccak256,Wallet} from 'ethers';
import {startEvm} from './evm.ts';
import {compile} from './compile.ts';
import {deploy,as,receipt,timestamp,type Receipt} from './shared.ts';
import {JOURNEY_SOLDIER_BUILDS,SOLDIER_PROGRESS_POLICY,soldierProgressDomain,soldierProgressTypes,type SoldierProgressVoucher} from '@last-signal/chain';
import {pinJourneyRules,JOURNEY_REWARD_STREAM_RULES} from '../../sim/src/journey/rules.ts';
import {SoldierCollections,type SoldierCollectionDeployment} from '../../../apps/server/src/journey-soldiers.ts';

const evm=await startEvm(18579);
try{
 const deployer=await evm.provider.getSigner(0),a=await evm.provider.getSigner(1),b=await evm.provider.getSigner(2),authority=Wallet.createRandom(),receipts:Receipt[]=[];
 const rulesHash='0x'+(await pinJourneyRules(JOURNEY_REWARD_STREAM_RULES)).hash;
 const soldiers=await deploy(compile().JourneySoldiers,deployer,[authority.address,rulesHash,JOURNEY_SOLDIER_BUILDS.map(b=>b.hash),10],receipts,'deploy approved local collection: 70 total, 10 per class');
 const deployment:SoldierCollectionDeployment={version:'JOURNEY_SOLDIERS_V1',chainId:31337,collection:String(soldiers.target),mintAuthority:deployer.address,gameplaySigner:authority.address,rulesHash,codeHash:keccak256(await evm.provider.getCode(soldiers.target)),classSupplyCap:10,maxSupply:70};
 for(let i=0;i<7;i++)await receipt(soldiers.mintDevelopment(a.address,i,id('approved-local-development:'+i)),'authorized mint '+JOURNEY_SOLDIER_BUILDS[i].classId,receipts);
 // Exercise the approved cap, not only a smaller boundary fixture.
 for(let i=1;i<10;i++)await receipt(soldiers.mintDevelopment(a.address,0,id('approved-local-extra-mara:'+i)),'authorized Mara instance '+(i+1),receipts);
 await assert.rejects(soldiers.mintDevelopment(a.address,0,id('eleventh Mara')));
 await assert.rejects(as(soldiers,b).mintDevelopment(b.address,1,id('unauthorized mint')));
 assert.equal(await soldiers.classMinted(0),10n);assert.equal(await soldiers.maxSupply(),70n);assert.equal(await soldiers.totalSupply(),16n);
 await evm.provider.send('evm_mine',[]);
 const adapter=new SoldierCollections(evm.provider,deployment),asset={kind:'soldier' as const,chainId:'31337',collection:String(soldiers.target),tokenId:'1'};
 const before=await adapter.owned(asset,a.address);
 const voucher:SoldierProgressVoucher={tokenId:'1',owner:a.address,bankSource:id('authored-local-progress-fixture:bank:1'),rulesHash,policy:SOLDIER_PROGRESS_POLICY,nonce:'0',cumulativeXp:'10',furthestCheckpoint:'0',hasCheckpoint:true,expiry:String(await timestamp(evm.provider)+3600n)};
 const domain=soldierProgressDomain(31337n,String(soldiers.target)),signature=await authority.signTypedData(domain,soldierProgressTypes,voucher);
 await receipt(as(soldiers,a).applyProgress(voucher,signature),'accept designated signer authored progress fixture',receipts);
 await assert.rejects(as(soldiers,a).applyProgress(voucher,signature));
 await receipt(as(soldiers,a).transferFrom(a.address,b.address,1),'transfer progressed soldier to second local wallet',receipts);
 await evm.provider.send('evm_mine',[]);const after=await adapter.owned(asset,b.address);
 assert.equal(after.progress.cumulativeXp,'10');assert.equal(after.progress.revision,'1');assert.equal(after.progressNonce,'2');assert.equal(after.progress.furthestCompleted,'0');
 assert.deepEqual(after.immutableBuild,before.immutableBuild);assert.equal(after.provenance,before.provenance);
 const metadata=(uri:string)=>JSON.parse(Buffer.from(uri.split(',')[1],'base64').toString());assert.equal(metadata(after.uri).image,metadata(before.uri).image);
 const environment='DISPOSABLE_LOCAL_BLOCKCHAIN',generatedAt=new Date().toISOString();
 writeFileSync('docs/evidence/journey-soldiers-local-deployment.json',JSON.stringify({generatedAt,environment,lifecycle:'Node closed after proof. Addresses are evidence, not a running deployment.',deployment,classBuilds:JOURNEY_SOLDIER_BUILDS,mintPolicy:'Owner approved local authorized development mint only; no purchase price or public supply policy.',deploymentReceipt:receipts[0]},null,2)+'\n');
 writeFileSync('docs/evidence/journey-soldiers-proof.json',JSON.stringify({generatedAt,environment,deployment,receipts,minted:'16',classZeroMinted:'10',eleventhClassZeroRejected:true,unauthorizedMintRejected:true,replayRejected:true,before,after,progressSource:'Authored designated signer fixture. Not an automatic simulation journal to chain bank.',limits:'Disposable local wallets and real local ERC721 transactions. No public deployment, purchase, owned combat admission, lease or marketplace. Signatures and keys are not exported.'},null,2)+'\n');
 console.log(JSON.stringify({environment,receipts:receipts.length,minted:16,maxSupply:70,classSupplyCap:10,acceptedXp:after.progress.cumulativeXp,historySurvivesTransfer:true}));
}finally{evm.provider.destroy();await evm.stop();}
