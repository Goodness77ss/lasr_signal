import type {JourneyPoolDeployment} from '../../../apps/server/src/journey-funded-worker.ts';
import {pinJourneyRules,JOURNEY_COMBINED_STREAM_RULES} from '../../sim/src/journey/rules.ts';
import type {SoldierCollectionDeployment,SoldierMarketDeployment} from '../../../apps/server/src/journey-soldiers.ts';
import type {SupplyDeployment} from '../../../apps/server/src/journey-supply-chain.ts';
import {SUPPLY_EFFECT_RULES} from '../../sim/src/journey/supply-rules.ts';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import type {LightMyRequestResponse} from 'fastify';
import {createServer,type Server} from 'node:http';
import {getAddress,id,keccak256,parseEther} from 'ethers';
import {startEvm} from './evm.ts';
import {fixture,deploy,as,receipt,timestamp} from './shared.ts';
import {JOURNEY_SOLDIER_BUILDS,JOURNEY_GUN_BUILDS,JOURNEY_GUN_RECOVERY_RULES,journeyGunClaimTypes,journeyGunDomain,type JourneyGunClaim} from '@last-signal/chain';
import type {JourneyGunDeployment} from '../../../apps/server/src/journey-guns.ts';
import {buildServer} from '../../../apps/server/src/app.ts';

// Disposable local tooling. Public addresses only; never exports a signing key.
const checkOnly=process.argv.includes('--check');
const port=(name:string,fallback:number)=>{const value=Number(process.env[name]??fallback);if(!Number.isSafeInteger(value)||value<1024||value>65535)throw Error('Invalid local port '+name);return value;};
const rpcPort=port('JOURNEY_RPC_PORT',checkOnly?18590:18586),servicePort=port('JOURNEY_SERVICE_PORT',3001),webPort=port('JOURNEY_WEB_PORT',5180),reviewPort=port('JOURNEY_REVIEW_PORT',3002),rpc='http://127.0.0.1:'+rpcPort,evm=await startEvm(rpcPort);let server:Awaited<ReturnType<typeof buildServer>>|undefined,reviewBridge:Server|undefined;
try{
 console.log(JSON.stringify({stage:'Compiling local contracts and creating disposable accounts'}));
 const f=await fixture(evm.provider),owner=getAddress(process.env.JOURNEY_DEV_OWNER??f.a.address),directory=resolve('.runtime/journey-development',randomUUID());mkdirSync(directory,{recursive:true});
 if(owner!==f.a.address){await receipt(f.deployer.sendTransaction({to:owner,value:parseEther('1')}),'provide disposable wallet gas');await receipt(as(f.token,f.a).transfer(owner,parseEther('100')),'provide disposable wallet test currency');}
 console.log(JSON.stringify({stage:'Deploying Journey collections'}));
 const guns=await deploy(f.artifacts.JourneyGunCollection,f.deployer,[f.token.target,f.authority.address,JOURNEY_GUN_RECOVERY_RULES,JOURNEY_GUN_BUILDS.map(build=>build.hash)]);
 const deployment:JourneyGunDeployment={version:'JOURNEY_GUNS_V1',chainId:31337,collection:String(guns.target),currency:String(f.token.target),gameplaySigner:f.authority.address,rulesHash:JOURNEY_GUN_RECOVERY_RULES,codeHash:keccak256(await evm.provider.getCode(guns.target)),currencyCodeHash:keccak256(await evm.provider.getCode(f.token.target))};
 const expiry=String(await timestamp(evm.provider)+3600n),claims:JourneyGunClaim[]=JOURNEY_GUN_BUILDS.map((build,kind)=>({dropId:id('authored development gun '+kind),runId:id('authored development issuance'),recipient:f.a.address,kind,rulesHash:JOURNEY_GUN_RECOVERY_RULES,buildHash:build.hash,expiry}));
 const signatures=await Promise.all(claims.map(claim=>f.authority.signTypedData(journeyGunDomain(31337n,String(guns.target)),journeyGunClaimTypes,claim)));
 await receipt(as(guns,f.a).claimLoot(claims,signatures),'issue two authored local development guns');
 if(owner!==f.a.address)for(const tokenId of [1,2])await receipt(as(guns,f.a).transferFrom(f.a.address,owner,tokenId),'deliver authored local development gun');await evm.provider.send('evm_mine',[]);
 const supplies=await deploy(f.artifacts.JourneySupplies,f.deployer,[id(JSON.stringify(SUPPLY_EFFECT_RULES))]);
 const supplyDeployment:SupplyDeployment={chainId:31337,collection:String(supplies.target),codeHash:keccak256(await evm.provider.getCode(supplies.target)),policyHash:id(JSON.stringify(SUPPLY_EFFECT_RULES))};
 const supplyMarket=await deploy(f.artifacts.JourneySupplyMarket,f.deployer,[supplies.target,f.token.target]);
 for(const itemClass of [0,1,2,3])await receipt(supplies.issueDevelopment(owner,itemClass,2),'issue authored local supply packs');
 writeFileSync(resolve(directory,'supply-deployment.json'),JSON.stringify({...supplyDeployment,market:String(supplyMarket.target),marketCodeHash:keccak256(await evm.provider.getCode(supplyMarket.target)),currency:String(f.token.target)},null,2)+'\n');
 const ownedPin=await pinJourneyRules(JOURNEY_COMBINED_STREAM_RULES),soldiers=await deploy(f.artifacts.JourneySoldiers,f.deployer,[f.authority.address,'0x'+ownedPin.hash,JOURNEY_SOLDIER_BUILDS.map(build=>build.hash),10]);
 const soldierDeployment:SoldierCollectionDeployment={version:'JOURNEY_SOLDIERS_V1',chainId:31337,collection:String(soldiers.target),mintAuthority:f.deployer.address,gameplaySigner:f.authority.address,rulesHash:'0x'+ownedPin.hash,codeHash:keccak256(await evm.provider.getCode(soldiers.target)),classSupplyCap:10,maxSupply:70};
 for(let classId=0;classId<7;classId++)await receipt(soldiers.mintDevelopment(owner,classId,id('authored local soldier '+classId)),'issue authored class soldier');
 const soldierMarket=await deploy(f.artifacts.JourneySoldierMarket,f.deployer,[soldiers.target,f.token.target]);
 const soldierMarketDeployment:SoldierMarketDeployment={version:'JOURNEY_SOLDIER_MARKET_V1',chainId:31337,market:String(soldierMarket.target),collection:String(soldiers.target),currency:String(f.token.target),codeHash:keccak256(await evm.provider.getCode(soldierMarket.target)),currencyCodeHash:keccak256(await evm.provider.getCode(f.token.target))};
 writeFileSync(resolve(directory,'soldier-deployment.json'),JSON.stringify({collection:soldierDeployment,market:soldierMarketDeployment,service:f.authority.address},null,2)+'\n');
 console.log(JSON.stringify({stage:'Creating backed local reward pool'}));
 const rewardPool=await deploy(f.artifacts.JourneyRewardPool,f.deployer,[f.token.target,f.authority.address]);
 const rewardDeployment:JourneyPoolDeployment={chainId:31337,pool:String(rewardPool.target),currency:String(f.token.target),service:f.authority.address,codeHash:keccak256(await evm.provider.getCode(rewardPool.target)),currencyCodeHash:keccak256(await evm.provider.getCode(f.token.target))};
 await receipt(f.deployer.sendTransaction({to:f.authority.address,value:parseEther('1')}),'fund disposable worker gas');
 await receipt(as(f.token,f.a).approve(rewardPool.target,parseEther('45')),'approve exact development pool backing');await receipt(as(rewardPool,f.a).fund(parseEther('45')),'back three local funded runs');
 writeFileSync(resolve(directory,'reward-pool-deployment.json'),JSON.stringify(rewardDeployment,null,2)+'\n');
 writeFileSync(resolve(directory,'deployment.json'),JSON.stringify(deployment,null,2)+'\n');
 writeFileSync(resolve(directory,'demo-public.json'),JSON.stringify({environment:'DISPOSABLE_LOCAL_BLOCKCHAIN',chainId:31337,rpc,owner,service:'http://127.0.0.1:'+servicePort,web:'http://127.0.0.1:'+webPort,guns:deployment,soldiers:soldierDeployment,soldierMarket:soldierMarketDeployment,supplies:supplyDeployment,rewardPool:rewardDeployment,authored:{soldiers:7,guns:2,packsPerClass:2,poolBacking:'45'},limits:'Authored development issuance; not earned gameplay evidence. No keys or signatures.'},null,2)+'\n');
 process.env.ALLOWED_ORIGINS??='http://127.0.0.1:'+webPort+',http://localhost:'+webPort+',http://127.0.0.1:5174';
 process.env.PUBLIC_OPERATION='false';process.env.SURVIVAL_VAULT_V2='false';
 // Deploy under normal automining. Interval mining is only needed once the
 // browser waits for second confirmations during the live session.
 if(!checkOnly)await evm.provider.send('evm_setIntervalMining',[1000]);
 console.log(JSON.stringify({stage:'Starting authoritative Journey service'}));
 server=await buildServer({database:resolve(directory,'journey.sqlite'),manual:checkOnly,journeyNetwork:{chainId:31337,rpc},journey:true,journeyPool:{provider:evm.provider,signer:f.authority,deployment:rewardDeployment},journeySoldiers:{provider:evm.provider,deployment:soldierDeployment,market:soldierMarketDeployment,service:f.authority.address,gameplay:f.authority},journeySupplies:{provider:evm.provider,deployment:supplyDeployment,market:{market:String(supplyMarket.target),currency:String(f.token.target),marketCodeHash:keccak256(await evm.provider.getCode(supplyMarket.target)),currencyCodeHash:keccak256(await evm.provider.getCode(f.token.target))}},journeyGuns:{provider:evm.provider,deployment,gameplay:f.authority},chain:{provider:evm.provider,signer:f.authority,mode:'LOCAL_TEST',confirmations:2,deployment:{chainId:31337,rpc,token:String(f.token.target),escrow:String(f.escrow.target),settlementSigner:f.authority.address,deploymentBlock:f.receipts[0].block,tokenCodeHash:keccak256(await evm.provider.getCode(f.token.target)),escrowCodeHash:keccak256(await evm.provider.getCode(f.escrow.target))}}});await server.app.listen({host:'127.0.0.1',port:checkOnly?0:servicePort});
 if(process.env.JOURNEY_DEV_REVIEW==='true'&&!checkOnly){
  if(owner!==f.a.address)throw Error('SDK review is limited to the disposable fixture account');
  reviewBridge=createServer(async(req,res)=>{const origin=req.headers.origin;
   if(req.method!=='POST'||req.url!=='/fixture'||!['http://127.0.0.1:'+webPort,'http://localhost:'+webPort].includes(origin??'')){res.writeHead(403);res.end();return;}
   try{const challenge=server!.testnet.auth.challenge(f.a.address,origin!),login=server!.testnet.auth.verify(challenge.nonce,await f.a.signMessage(challenge.message),origin!);res.writeHead(200,{'content-type':'application/json','access-control-allow-origin':origin!,'cache-control':'no-store'});res.end(JSON.stringify({...login,environment:'DISPOSABLE_LOCAL_BLOCKCHAIN',authored:true,collection:deployment.collection,tokenIds:['1','2']}));}catch{res.writeHead(500);res.end();}
  });await new Promise<void>((done,reject)=>{reviewBridge!.once('error',reject);reviewBridge!.listen(reviewPort,'127.0.0.1',done);});
 }
 if(checkOnly){const config=(await server.app.inject('/journey/config')).json();assert.equal(config.ownedRoster.enabled,true);assert.equal(config.ownedRoster.progressEnabled,true);assert.equal(config.ownedRoster.collection,soldierDeployment.collection);assert.equal(config.supplies.enabled,true);assert.equal(config.supplies.collection,supplyDeployment.collection);assert.equal(config.equipment.admission,true);assert.equal(config.equipment.collection,deployment.collection);assert.equal(server.testnet.auth.chainId,31337);for(const tokenId of ['1','2']){const inspected:LightMyRequestResponse=await server.app.inject('/weapons/journey-inspect?'+new URLSearchParams({kind:'gun',chainId:'31337',collection:deployment.collection,tokenId}));assert.equal(inspected.statusCode,200);assert.equal(inspected.json().owner,owner);}console.log(JSON.stringify({environment:'DISPOSABLE_LOCAL_BLOCKCHAIN',check:'passed',equipmentAdmission:true,checkedGuns:2,ownedRoster:true,progressBridge:true,authoredSoldiers:7,lifecycle:'Closing disposable service and node; no browser verification claimed.'}));}
 else{
 console.log(JSON.stringify({environment:'DISPOSABLE_LOCAL_BLOCKCHAIN',service:server.app.listeningOrigin,rpc,preview:'http://127.0.0.1:'+webPort+'/?mode=journey-server',ready:true,owner,chainId:31337,publicManifest:resolve(directory,'demo-public.json'),collection:deployment.collection,tokenIds:['1','2'],manifest:resolve(directory,'deployment.json'),limits:'Authored issuance only. Set JOURNEY_DEV_OWNER to your public local testing wallet address before launch to receive the guns. No key is exported. Browser wallet signing and rendered gameplay remain verification tasks.'}));
 await new Promise<void>(done=>{process.once('SIGINT',done);process.once('SIGTERM',done);if(process.env.JOURNEY_MANAGED==='true'){process.stdin.setEncoding('utf8');process.stdin.on('data',data=>{if(String(data).trim()==='stop')done();});process.stdin.resume();}});
 }
}finally{if(reviewBridge)await new Promise<void>(done=>reviewBridge!.close(()=>done()));await server?.app.close();evm.provider.destroy();await evm.stop();if(process.env.JOURNEY_MANAGED==='true')process.stdin.pause();}







