import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname,isAbsolute} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {id,keccak256,toUtf8Bytes,JsonRpcProvider,getAddress} from 'ethers';
import {JourneyGunCollections,type JourneyGunDeployment} from '../../../apps/server/src/journey-guns.ts';
import {as,receipt,type Receipt} from './shared.ts';

// Controls only the explicitly issued SDK review fixture on the loopback node.
const mode=process.argv[2],manifestFile=process.argv[3];
if(!['away','back','checkpoint'].includes(mode)||!manifestFile||!isAbsolute(manifestFile))throw Error('Use away, back or checkpoint and the absolute live local manifest path');
const deployment=JSON.parse(readFileSync(manifestFile,'utf8')) as JourneyGunDeployment,provider=new JsonRpcProvider('http://127.0.0.1:18586',undefined,{cacheTimeout:-1,batchMaxCount:1});
const proofFile=resolve(import.meta.dirname,'../../../docs/evidence/journey-owned-browser-transfer-20261111.json');
type Observation={tick:number;state:string;paused:boolean;sequence:number;ammo:number;reserve:number;reloadAt:number;assetNonce:string};
type Proof={version:1;environment:'DISPOSABLE_LOCAL_BLOCKCHAIN';collection:string;originalOwner:string;uriHash:string;receipts:Receipt[];observations:{stage:string;at:string;ownerIsOriginal:boolean;nonce:string;metadataUnchanged:boolean;run:Observation}[];returned?:boolean;limits:string};
try{
 const adapter=new JourneyGunCollections(provider,deployment),asset={kind:'gun' as const,chainId:'31337',collection:deployment.collection,tokenId:'2'},inspected=await adapter.inspect(asset),checked=await adapter.checked(asset);
 assert.equal(inspected.sourceRun,id('authored development issuance'));assert.equal(inspected.provenance,id('authored development gun 1'));
 const fixtureResponse=await fetch('http://127.0.0.1:3002/fixture',{method:'POST',headers:{Origin:'http://127.0.0.1:5180'}});assert.equal(fixtureResponse.status,200);const fixture=await fixtureResponse.json() as {address:string;authored:boolean;environment:string};assert.equal(fixture.authored,true);assert.equal(fixture.environment,'DISPOSABLE_LOCAL_BLOCKCHAIN');
 const sdkOwner=getAddress(fixture.address),prior=existsSync(proofFile)?JSON.parse(readFileSync(proofFile,'utf8')) as Proof:null;
 if(prior){assert.equal(prior.collection.toLowerCase(),deployment.collection.toLowerCase());assert.equal(prior.originalOwner,sdkOwner);}
 const proof:Proof=prior??{version:1,environment:'DISPOSABLE_LOCAL_BLOCKCHAIN',collection:deployment.collection,originalOwner:sdkOwner,uriHash:keccak256(toUtf8Bytes(inspected.uri)),receipts:[],observations:[],limits:'Actual disposable SDK NFT transfers and read only database observations. Browser actions are recorded separately. No personal wallet, key export, public deployment or earned loot claim.'};
 const observe=async(stage:string)=>{
  const record=await adapter.inspect(asset),db=new DatabaseSync(resolve(dirname(manifestFile),'journey.sqlite'),{readOnly:true});
  try{const match=db.prepare('SELECT snapshot,paused,last_sequence FROM journey_runs').all().map(row=>({row,run:JSON.parse(String(row.snapshot))})).find(value=>value.run.equipment?.entries.some((entry:{asset:{collection:string;tokenId:string}})=>entry.asset.collection.toLowerCase()===deployment.collection.toLowerCase()&&entry.asset.tokenId==='2'));if(!match)throw Error('Actual admitted support fixture run required');const actor=match.run.actors[0];proof.observations.push({stage,at:new Date().toISOString(),ownerIsOriginal:record.owner===sdkOwner,nonce:record.assetNonce,metadataUnchanged:keccak256(toUtf8Bytes(record.uri))===proof.uriHash,run:{tick:match.run.tick,state:match.run.state,paused:match.row.paused===1,sequence:Number(match.row.last_sequence),ammo:actor.ammo,reserve:actor.reserve,reloadAt:actor.reloadAt,assetNonce:match.run.equipment.entries[0].assetNonce}});}finally{db.close();}
 };
 if(mode==='away'){
  if(prior)throw Error('Transfer proof already exists; refusing another away transfer');assert.equal(inspected.owner,sdkOwner);await observe('before-away');
  const recipient=await provider.getSigner(5);assert.notEqual(recipient.address,sdkOwner);await receipt(as(checked.contract,await provider.getSigner(sdkOwner)).transferFrom(sdkOwner,recipient.address,2),'transfer authored support fixture away',proof.receipts);await provider.send('evm_mine',[]);await observe('after-away');
 }else if(mode==='back'){
  if(!prior||prior.returned)throw Error('One completed away transfer required');assert.notEqual(inspected.owner,sdkOwner);
  await receipt(as(checked.contract,await provider.getSigner(inspected.owner)).transferFrom(inspected.owner,sdkOwner,2),'return support fixture with a fresh nonce',proof.receipts);await provider.send('evm_mine',[]);proof.returned=true;await observe('after-back');
 }else{if(!prior)throw Error('Existing transfer proof required');if(proof.returned){await assert.rejects(adapter.owned(asset,sdkOwner,inspected.immutableBuild.hash,'0'),/ownership epoch changed/);await adapter.owned(asset,sdkOwner,inspected.immutableBuild.hash,inspected.assetNonce);}await observe(proof.returned?'after-back-confirmed-adapter-rejection':'after-away-checkpoint');}
 assert.equal(proof.observations.every(observation=>observation.metadataUnchanged),true);writeFileSync(proofFile,JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({environment:proof.environment,stage:proof.observations.at(-1)!.stage,receipts:proof.receipts.length,last:proof.observations.at(-1),proof:proofFile}));
}finally{provider.destroy();}

