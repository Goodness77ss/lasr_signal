import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {id,keccak256,JsonRpcProvider} from 'ethers';
import {startEvm} from '../scripts/evm.ts';
import {fixture,deploy,as,receipt,timestamp,type Receipt} from '../scripts/shared.ts';
import {JOURNEY_GUN_BUILDS,JOURNEY_GUN_RECOVERY_RULES,journeyGunClaimTypes,journeyGunDomain} from '@last-signal/chain';
import {buildServer} from '../../../apps/server/src/app.ts';
import {JOURNEY_SUPPLY_IDENTIFIERS,parseJourneyClient} from '../../../packages/protocol/src/journey.ts';
import {SUPPLY_EFFECT_RULES} from '../../sim/src/journey/supply-rules.ts';
test('actual traded pack redemption funds one gameplay throw and survives service restart',async()=>{
 const evm=await startEvm(18591);let server:Awaited<ReturnType<typeof buildServer>>|undefined;
 const receipts:Receipt[]=[],directory=resolve('.runtime/supply-e2e',randomUUID());mkdirSync(directory,{recursive:true});
 try{
  const f=await fixture(evm.provider),policyHash=id(JSON.stringify(SUPPLY_EFFECT_RULES));
  const packs=await deploy(f.artifacts.JourneySupplies,f.deployer,[policyHash],receipts),market=await deploy(f.artifacts.JourneySupplyMarket,f.deployer,[packs.target,f.token.target],receipts);
  const guns=await deploy(f.artifacts.JourneyGunCollection,f.deployer,[f.token.target,f.authority.address,JOURNEY_GUN_RECOVERY_RULES,JOURNEY_GUN_BUILDS.map(b=>b.hash)],receipts);
  const claim={dropId:id('authored supply e2e gun'),runId:id('authored local development'),recipient:f.b.address,kind:0,rulesHash:JOURNEY_GUN_RECOVERY_RULES,buildHash:JOURNEY_GUN_BUILDS[0].hash,expiry:String(await timestamp(evm.provider)+3600n)};
  await receipt(as(guns,f.b).claimLoot([claim],[await f.authority.signTypedData(journeyGunDomain(31337n,String(guns.target)),journeyGunClaimTypes,claim)]),'authored equipment issuance',receipts);
  await receipt(packs.issueDevelopment(f.a.address,1,2),'authored unopened grenade packs',receipts);
  await receipt(as(packs,f.a).setApprovalForAll(market.target,true),'seller operator approval',receipts);
  await receipt(as(market,f.a).list(1,2,7,await timestamp(evm.provider)+3600n),'seller listing',receipts);
  const quote=await market.quote(f.a.address,1);
  await receipt(as(f.token,f.b).approve(market.target,7),'buyer exact allowance',receipts);
  await receipt(as(market,f.b).buy(f.a.address,1,1,7,7,quote.revision,quote.expiry),'actual pack sale',receipts);
  const redeemed=await receipt(as(packs,f.b).redeem(1,1),'owner pack redemption',receipts);await evm.provider.send('evm_mine',[]);
  const log=redeemed.logs.find(log=>{try{return packs.interface.parseLog(log)?.name==='Redeemed';}catch{return false;}})!;
  const gunDeployment={version:'JOURNEY_GUNS_V1' as const,chainId:31337 as const,collection:String(guns.target),currency:String(f.token.target),gameplaySigner:f.authority.address,rulesHash:JOURNEY_GUN_RECOVERY_RULES,codeHash:keccak256(await evm.provider.getCode(guns.target)),currencyCodeHash:keccak256(await evm.provider.getCode(f.token.target))};
  const options={database:resolve(directory,'journey.sqlite'),manual:true,journey:true,journeyGuns:{provider:evm.provider,deployment:gunDeployment},journeySupplies:{provider:evm.provider,deployment:{chainId:31337 as const,collection:String(packs.target),codeHash:keccak256(await evm.provider.getCode(packs.target)),policyHash}},chain:{provider:evm.provider,signer:f.authority,mode:'LOCAL_TEST' as const,confirmations:2,deployment:{chainId:31337,rpc:'http://127.0.0.1:18591',token:String(f.token.target),escrow:String(f.escrow.target),settlementSigner:f.authority.address,deploymentBlock:f.receipts[0].block,tokenCodeHash:keccak256(await evm.provider.getCode(f.token.target)),escrowCodeHash:keccak256(await evm.provider.getCode(f.escrow.target))}}};
  const origin='http://127.0.0.1:5174';
  const login=async()=>{const challenge=server!.testnet.auth.challenge(f.b.address,origin);return server!.testnet.auth.verify(challenge.nonce,await (await options.chain.provider.getSigner(f.b.address)).signMessage(challenge.message),origin).session;};
  server=await buildServer(options);let token=await login();
  const recover=async()=>{const response=await server!.app.inject({method:'POST',url:'/journey/supplies/recover',headers:{origin,authorization:'Bearer '+token},payload:{transactionHash:redeemed.hash,logIndex:log.index}});assert.equal(response.statusCode,200);return response.json();};
  assert.equal((await recover()).units,'3');
  const messages:Record<string,any>[]=[],connect=()=>server!.journey!.connect({send:m=>messages.push(m as Record<string,any>),close:()=>{},identify:session=>server!.testnet.auth.identify(session,origin)});
  let peer=connect();await peer.receive(parseJourneyClient(JSON.stringify({op:'start',...JOURNEY_SUPPLY_IDENTIFIERS,session:token,roster:[{id:'starter:1',revision:1,loadout:'signature'},null,null],equipment:[{actorId:1,asset:{kind:'gun',chainId:'31337',collection:String(guns.target),tokenId:'1'},buildId:'marksman-rifle',buildHash:JOURNEY_GUN_BUILDS[0].hash,assetNonce:'0'}]})));
  const identity=messages.find(m=>m.op==='session')!,before=server.journey!.store.load(identity.run,identity.credential);
  const command=parseJourneyClient(JSON.stringify({op:'command',id:'owned-throw',sequence:1,section:before.run.section,actorId:1,action:{kind:'supply',itemClass:1,targetId:1,direction:{x:1,y:0,z:0}}}));
  await peer.receive(command);await peer.receive(command);assert.equal(messages.find(m=>m.op==='ack')?.ok,true);assert.equal(server.journey!.store.supplies!.balance(f.b.address,1),2n);assert.equal(server.journey!.store.load(identity.run,identity.credential).run.projectiles!.length,1);
  peer.close();await server.app.close();const reconnected=new JsonRpcProvider('http://127.0.0.1:18591',undefined,{cacheTimeout:-1});options.chain.provider=reconnected;options.journeyGuns.provider=reconnected;options.journeySupplies.provider=reconnected;server=await buildServer(options);token=await login();peer=connect();
  await peer.receive(parseJourneyClient(JSON.stringify({op:'resume',...JOURNEY_SUPPLY_IDENTIFIERS,session:token,run:identity.run,credential:identity.credential})));
  assert.equal((await recover()).units,'2');assert.equal(server.journey!.store.load(identity.run,identity.credential).run.projectiles!.length,1);peer.close();
  writeFileSync(resolve('docs/evidence/journey-supply-e2e.json'),JSON.stringify({environment:'DISPOSABLE_LOCAL_BLOCKCHAIN',limits:'Actual SDK signed sessions, chain sale and redemption, service gameplay and SQLite restart. No rendered browser or extension wallet claim.',receipts,openedBefore:3,openedAfter:2,projectilesAfterRestart:1},null,2)+'\n');
 }finally{await server?.app.close();evm.provider.destroy();await evm.stop();}
});

