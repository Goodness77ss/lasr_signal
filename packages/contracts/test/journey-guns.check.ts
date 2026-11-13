import {test,before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import WebSocket from 'ws';
import {id,keccak256,parseEther,Wallet,ZeroHash} from 'ethers';
import {startEvm} from '../scripts/evm.ts';
import {fixture,deploy,as,receipt,timestamp,at} from '../scripts/shared.ts';
import {JOURNEY_GUN_BUILDS,JOURNEY_GUN_RECOVERY_RULES,journeyGunClaimTypes,journeyGunDomain,type JourneyGunClaim} from '@last-signal/chain';
import {JourneyGunCollections,type JourneyGunDeployment} from '../../../apps/server/src/journey-guns.ts';
import {JourneyAssetCatalog} from '../../../apps/server/src/journey-assets.ts';
import {buildServer} from '../../../apps/server/src/app.ts';
import {JOURNEY_EQUIPMENT_IDENTIFIERS} from '../../../packages/protocol/src/journey.ts';
import {JourneyConnection,type JourneySocket} from '../../../apps/web/src/journey-connection.ts';
let evm:Awaited<ReturnType<typeof startEvm>>,f:Awaited<ReturnType<typeof fixture>>,guns:Awaited<ReturnType<typeof deploy>>,adapter:JourneyGunCollections,manifest:JourneyGunDeployment,snapshot:string;
before(async()=>{
 evm=await startEvm(18584);f=await fixture(evm.provider);guns=await deploy(f.artifacts.JourneyGunCollection,f.deployer,[f.token.target,f.authority.address,JOURNEY_GUN_RECOVERY_RULES,JOURNEY_GUN_BUILDS.map(b=>b.hash)]);
 manifest={version:'JOURNEY_GUNS_V1',chainId:31337,collection:String(guns.target),currency:String(f.token.target),gameplaySigner:f.authority.address,rulesHash:JOURNEY_GUN_RECOVERY_RULES,codeHash:keccak256(await evm.provider.getCode(guns.target)),currencyCodeHash:keccak256(await evm.provider.getCode(f.token.target))};adapter=new JourneyGunCollections(evm.provider,manifest);
});
after(async()=>{evm?.provider.destroy();await evm?.stop();});beforeEach(async()=>{snapshot=await evm.provider.send('evm_snapshot',[]);});afterEach(async()=>{await evm.provider.send('evm_revert',[snapshot]);});
const asset=(tokenId='1')=>({kind:'gun' as const,chainId:'31337',collection:String(guns.target),tokenId});
const domain=()=>journeyGunDomain(31337n,String(guns.target));
const claim=async(patch:Partial<JourneyGunClaim>={}):Promise<JourneyGunClaim>=>({dropId:id('authored Journey gun drop'),runId:id('authored Journey gun run'),recipient:f.a.address,kind:0,rulesHash:JOURNEY_GUN_RECOVERY_RULES,buildHash:JOURNEY_GUN_BUILDS[0].hash,expiry:String(await timestamp(evm.provider)+1000n),...patch});
const sign=(c:JourneyGunClaim)=>f.authority.signTypedData(domain(),journeyGunClaimTypes,c);
async function waitSignal<T>(promise:Promise<T>){let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([promise,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('Timed out waiting for Journey client')),10000);})]);}finally{if(timer)clearTimeout(timer);}}
async function mint(kind=0,label='one'){const c=await claim({kind,buildHash:JOURNEY_GUN_BUILDS[kind].hash,dropId:id('fixture drop '+label)});await receipt(as(guns,f.a).claimLoot([c],[await sign(c)]),'authored claim fixture');return c;}
function socketReader(socket:WebSocket){
 const queue:Record<string,unknown>[]=[],pending:{op:string;resolve:(message:Record<string,unknown>)=>void}[]=[];
 socket.on('message',raw=>{const message=JSON.parse(raw.toString()) as Record<string,unknown>,index=pending.findIndex(p=>p.op===message.op);if(index>=0)pending.splice(index,1)[0].resolve(message);else queue.push(message);});
 return (op:string):Promise<Record<string,unknown>>=>{const index=queue.findIndex(m=>m.op===op);if(index>=0)return Promise.resolve(queue.splice(index,1)[0]);return new Promise((resolve,reject)=>{const waiter={op,resolve:(message:Record<string,unknown>)=>{clearTimeout(timer);resolve(message);}},timer=setTimeout(()=>{const index=pending.indexOf(waiter);if(index>=0)pending.splice(index,1);reject(Error('Timed out waiting for '+op));},10000);pending.push(waiter);});};
}
test('browser connection controller recovers lost first admission replies for both actual owned gun builds',async()=>{
 await mint(0,'admission marksman');await mint(1,'admission support');await evm.provider.send('evm_mine',[]);
 const server=await buildServer({database:':memory:',manual:true,journey:true,journeyGuns:{provider:evm.provider,deployment:manifest}}),origin='http://127.0.0.1:5174';await server.app.listen({host:'127.0.0.1',port:0});
 try{
  const challenge=(await server.app.inject({method:'POST',url:'/testnet/challenge',headers:{origin},payload:{address:f.a.address,chainId:server.testnet.auth.chainId}})).json(),login=await server.app.inject({method:'POST',url:'/testnet/login',headers:{origin},payload:{nonce:challenge.nonce,signature:await f.a.signMessage(challenge.message)}});assert.equal(login.statusCode,200);const walletSession=String(login.json().session);
  for(const kind of [0,1]){
   let lose=true,resolveLost!:()=>void,resolveReady!:()=>void,resolveAck!:()=>void;const lost=new Promise<void>(r=>resolveLost=r),ready=new Promise<void>(r=>resolveReady=r),acked=new Promise<void>(r=>resolveAck=r),sent:string[]=[];
   const client=new JourneyConnection(server.app.listeningOrigin.replace('http:','ws:')+'/journey',{snapshot:()=>{},status:state=>{if(state==='ready')resolveReady();},ack:()=>resolveAck()},url=>{
    const socket=new WebSocket(url,{origin}),transport:JourneySocket={get readyState(){return socket.readyState;},get bufferedAmount(){return socket.bufferedAmount;},send:data=>{sent.push(String(data));socket.send(data);},close:()=>socket.close(),onopen:null,onmessage:null,onclose:null,onerror:null};
    const forward=(callback:((...args:never[])=>unknown)|null,event:unknown)=>{if(callback)Reflect.apply(callback,transport,[event]);};
    socket.on('open',()=>forward(transport.onopen,{}));socket.on('close',()=>forward(transport.onclose,{}));socket.on('error',()=>forward(transport.onerror,{}));socket.on('message',raw=>{const data=raw.toString();if(JSON.parse(data).op==='session'&&lose){lose=false;client.disconnect();resolveLost();return;}forward(transport.onmessage,{data});});return transport;
   });
   try{
    const record=await adapter.inspect(asset(String(kind+1))),build=JOURNEY_GUN_BUILDS[kind].build;
    client.connect({op:'start',...JOURNEY_EQUIPMENT_IDENTIFIERS,session:walletSession,roster:[{id:'starter:1',revision:1,loadout:'signature'},null,null],equipment:[{actorId:1,asset:{...asset(String(kind+1)),chainId:'31337'},buildId:build.id as 'marksman-rifle'|'support-gun',buildHash:record.immutableBuild.hash,assetNonce:record.assetNonce}]});
    await waitSignal(lost);const proposed=client.recovery!;assert.equal(proposed.start?.op,'start');assert.equal(JSON.stringify(proposed).includes(walletSession),false);assert.equal(server.journey!.store.load(proposed.run,proposed.credential).run.actors[0].ammo,build.magazine);
    const freshChallenge=(await server.app.inject({method:'POST',url:'/testnet/challenge',headers:{origin},payload:{address:f.a.address,chainId:server.testnet.auth.chainId}})).json(),freshLogin=await server.app.inject({method:'POST',url:'/testnet/login',headers:{origin},payload:{nonce:freshChallenge.nonce,signature:await f.a.signMessage(freshChallenge.message)}});assert.equal(freshLogin.statusCode,200);const freshSession=String(freshLogin.json().session);assert.notEqual(freshSession,walletSession);
    client.reconnect(freshSession);await waitSignal(ready);assert.equal(client.recovery!.run,proposed.run);assert.equal(client.recovery!.start,undefined);assert.equal(client.snapshot!.actors[0].ammo,build.magazine);const entries=sent.map(text=>JSON.parse(text)).filter(m=>m.op==='start');assert.equal(entries.length,2);assert.equal(entries[0].session,walletSession);assert.equal(entries[1].session,freshSession);for(const entry of entries)delete entry.session;assert.deepEqual(entries[0],entries[1]);
    client.command({kind:'fire',direction:{x:1,y:0,z:0}},'recovered-owned-shot');await waitSignal(acked);assert.equal(client.snapshot!.actors[0].ammo,build.magazine-1);assert.equal(server.journey!.store.load(proposed.run,proposed.credential).run.actors[0].ammo,build.magazine-1);
   }finally{client.dispose();}
  }
  assert.equal(server.rooms.db.prepare('SELECT COUNT(*) AS n FROM journey_runs').get()!.n,2);assert.equal(server.rooms.db.prepare('SELECT COUNT(*) AS n FROM journey_equipment_current').get()!.n,2);
 }finally{await server.app.close();}
});
for(const kind of [0,1])test('wallet authenticated live Journey pins '+JOURNEY_GUN_BUILDS[kind].build.id+' and rejects stale ownership after transfer away and back',async()=>{
 await mint(kind);await evm.provider.send('evm_mine',[]);
 const server=await buildServer({database:':memory:',manual:true,journey:true,journeyGuns:{provider:evm.provider,deployment:manifest}}),origin='http://127.0.0.1:5174',sockets:WebSocket[]=[];
 type Observation={section:string;tick:number;equipment:{hash:string;owner:string};actors:{id:number;ammo:number;build:{weapon:string}}[]};
 try{
  const challenge=await server.app.inject({method:'POST',url:'/testnet/challenge',headers:{origin},payload:{address:f.a.address,chainId:server.testnet.auth.chainId}});assert.equal(challenge.statusCode,200);
  const proof=challenge.json(),login=await server.app.inject({method:'POST',url:'/testnet/login',headers:{origin},payload:{nonce:proof.nonce,signature:await f.a.signMessage(proof.message)}});assert.equal(login.statusCode,200);const walletSession=String(login.json().session);
  await server.app.listen({host:'127.0.0.1',port:0});const url=server.app.listeningOrigin.replace('http:','ws:')+'/journey';
  const open=async()=>{const socket=new WebSocket(url,{origin}),next=socketReader(socket);sockets.push(socket);await once(socket,'open');return {socket,next};};
  const first=await open(),record=await adapter.inspect(asset());
  const build=JOURNEY_GUN_BUILDS[kind].build;
  first.socket.send(JSON.stringify({op:'start',...JOURNEY_EQUIPMENT_IDENTIFIERS,roster:[{id:'starter:1',revision:1,loadout:'signature'},null,null],equipment:[{actorId:1,asset:asset(),buildId:build.id,buildHash:record.immutableBuild.hash,assetNonce:record.assetNonce}],session:walletSession}));
  const identity=await first.next('session'),initial=(await first.next('snapshot')).observation as Observation,run=String(identity.run),credential=String(identity.credential);
  assert.equal(initial.equipment.owner,f.a.address.toLowerCase());assert.equal(initial.actors[0].ammo,build.magazine);assert.equal(initial.actors[0].build.weapon,build.id);assert.equal(JSON.stringify(identity).includes(walletSession),false);
  const command={op:'command',id:'owned-chain-shot',sequence:1,section:initial.section,actorId:1,action:{kind:'fire',direction:{x:1,y:0,z:0}}};first.socket.send(JSON.stringify(command));const ack=await first.next('ack');assert.equal(ack.ok,true);await first.next('snapshot');first.socket.send(JSON.stringify(command));assert.deepEqual(await first.next('ack'),ack);await first.next('snapshot');assert.equal(server.journey!.store.load(run,credential).run.actors[0].ammo,build.magazine-1);
  const closed=once(first.socket,'close');first.socket.close();await closed;
  const resumed=await open(),resume={op:'resume',...JOURNEY_EQUIPMENT_IDENTIFIERS,run,credential,session:walletSession};resumed.socket.send(JSON.stringify(resume));await resumed.next('resumed');const recovered=(await resumed.next('snapshot')).observation as Observation;assert.equal(recovered.equipment.hash,initial.equipment.hash);assert.equal(recovered.actors[0].ammo,build.magazine-1);
  await server.journey!.tick();await resumed.next('snapshot');assert.equal(server.journey!.store.load(run,credential).run.tick,1);
  await receipt(as(guns,f.a).transferFrom(f.a.address,f.b.address,1),'transfer equipped local gun');await evm.provider.send('evm_mine',[]);
  resumed.socket.send(JSON.stringify({...command,id:'after-transfer',sequence:2}));assert.equal((await resumed.next('error')).reason,'Journey command rejected');await server.journey!.tick();assert.equal(server.journey!.store.load(run,credential).run.tick,1);assert.equal(server.journey!.store.load(run,credential).run.actors[0].ammo,build.magazine-1);
  await receipt(as(guns,f.b).transferFrom(f.b.address,f.a.address,1),'return gun with a new ownership epoch');await evm.provider.send('evm_mine',[]);
  const stale=await open();stale.socket.send(JSON.stringify(resume));assert.equal((await stale.next('error')).reason,'Journey command rejected');assert.equal((await adapter.inspect(asset())).owner,f.a.address);assert.notEqual((await adapter.inspect(asset())).assetNonce,record.assetNonce);
 }finally{for(const socket of sockets)socket.terminate();await server.app.close();}
});
test('exact signed builds create real separate marksman and support collectibles with immutable metadata',async()=>{
 for(let kind=0;kind<2;kind++){
  const c=await mint(kind,String(kind)),tokenId=kind+1,record=await adapter.inspect(asset(String(tokenId))),metadata=JSON.parse(Buffer.from(record.uri.split(',')[1],'base64').toString());
  assert.equal(record.owner,f.a.address);assert.equal(record.immutableBuild.hash,JOURNEY_GUN_BUILDS[kind].hash);assert.equal(record.provenance,c.dropId);assert.equal(metadata.buildHash,record.immutableBuild.hash);assert.equal(metadata.kind,kind);assert.equal(metadata.sourceRun,c.runId);assert.match(metadata.image,/^data:image\/svg\+xml;base64,/);assert.equal(record.capabilities.journeyCombatReady,false);
 }
 assert.equal(await guns.totalSupply(),2n);assert.deepEqual(Array.from(await guns.ownedPage(f.a.address,0,32)),[1n,2n]);await assert.rejects(guns.ownedPage(f.a.address,0,33));await assert.rejects(guns.buildForKind(2));
});
test('claims bind all fields, designated signer, chain and collection without consuming invalid sources',async()=>{
 const c=await claim(),signature=await sign(c);
 for(const patch of [{dropId:id('different')},{runId:id('different')},{recipient:f.b.address},{kind:1},{rulesHash:id('different')},{buildHash:JOURNEY_GUN_BUILDS[1].hash},{expiry:String(BigInt(c.expiry)+1n)}])await assert.rejects(as(guns,f.a).claimLoot([{...c,...patch}],[signature]));
 await assert.rejects(as(guns,f.b).claimLoot([c],[signature]));await assert.rejects(as(guns,f.a).claimLoot([c],[await Wallet.createRandom().signTypedData(domain(),journeyGunClaimTypes,c)]));
 for(const d of [journeyGunDomain(46630n,String(guns.target)),journeyGunDomain(31337n,String(f.escrow.target))])await assert.rejects(as(guns,f.a).claimLoot([c],[await f.authority.signTypedData(d,journeyGunClaimTypes,c)]));
 assert.equal(await guns.claimed(c.dropId),false);assert.equal(await guns.runClaims(c.runId),0n);assert.equal(await guns.nextTokenId(),1n);
});
test('replay, per run cap, exact expiry and a late invalid batch item revert atomically',async()=>{
 const first=await mint();await assert.rejects(as(guns,f.a).claimLoot([first],[await sign(first)]));await mint(1,'two');await mint(0,'three');const fourth=await claim({dropId:id('fourth')});await assert.rejects(as(guns,f.a).claimLoot([fourth],[await sign(fourth)]));assert.equal(await guns.runClaims(first.runId),3n);
 const one=await claim({runId:id('new batch'),dropId:id('batch one')}),bad=await claim({runId:id('new batch'),dropId:ZeroHash});await assert.rejects(as(guns,f.a).claimLoot([one,bad],[await sign(one),await sign(bad)]));assert.equal(await guns.claimed(one.dropId),false);assert.equal(await guns.runClaims(one.runId),0n);
 const expired=await claim({runId:id('expiry'),dropId:id('expiry'),expiry:String(await timestamp(evm.provider)+20n)});await at(evm.provider,BigInt(expired.expiry));await evm.provider.send('evm_mine',[]);await assert.rejects(as(guns,f.a).claimLoot([expired],[await sign(expired)]));
});
test('empty, oversized and rejected receiver claims preserve source and run budgets',async()=>{
 await assert.rejects(as(guns,f.a).claimLoot([],[]));const c=await claim(),signature=await sign(c);await assert.rejects(as(guns,f.a).claimLoot([c],[]));await assert.rejects(as(guns,f.a).claimLoot([c,c,c,c],[signature,signature,signature,signature]));
 const receiver=await deploy(f.artifacts.RejectingJourneyGunReceiver,f.deployer),unsafe=await claim({recipient:String(receiver.target)});await assert.rejects(receiver.claim(guns.target,[unsafe],[await sign(unsafe)]));assert.equal(await guns.claimed(unsafe.dropId),false);assert.equal(await guns.runClaims(unsafe.runId),0n);assert.equal(await guns.nextTokenId(),1n);
});
test('secondary sales bind seller, price, build and nonce and preserve metadata after exact payment',async()=>{
 await mint();const before=await guns.tokenURI(1),price=parseEther('6');await receipt(as(guns,f.a).listGun(1,price,JOURNEY_GUN_BUILDS[0].hash),'local seller fixture price');const q=await adapter.quote(asset());assert.equal(q.route,'JOURNEY_EXPECTED_BUILD');
 await assert.rejects(as(guns,f.b).buyListed(1,f.b.address,price,q.expectedBuildHash,q.expectedNonce));await assert.rejects(as(guns,f.b).buyListed(1,f.a.address,price+1n,q.expectedBuildHash,q.expectedNonce));await assert.rejects(as(guns,f.b).buyListed(1,f.a.address,price,JOURNEY_GUN_BUILDS[1].hash,q.expectedNonce));
 await receipt(as(guns,f.a).listGun(1,price,q.expectedBuildHash),'same price relisting');await assert.rejects(as(guns,f.b).buyListed(1,f.a.address,price,q.expectedBuildHash,q.expectedNonce));const fresh=await adapter.quote(asset()),sellerBefore=await f.token.balanceOf(f.a.address);
 await receipt(as(f.token,f.b).approve(guns.target,price),'exact local allowance');await receipt(as(guns,f.b).buyListed(1,f.a.address,price,fresh.expectedBuildHash,fresh.expectedNonce),'buy exact Journey build');assert.equal(await f.token.balanceOf(f.a.address),sellerBefore+price);assert.equal(await f.token.allowance(f.b.address,guns.target),0n);assert.equal(await guns.tokenURI(1),before);await evm.provider.send('evm_mine',[]);await adapter.owned(asset(),f.b.address,fresh.expectedBuildHash);await assert.rejects(adapter.owned(asset(),f.a.address,fresh.expectedBuildHash));await assert.rejects(adapter.owned(asset(),f.b.address,JOURNEY_GUN_BUILDS[1].hash));
});
test('checked catalog and API reject unknown builds, wrong code and disabled identities',async()=>{
 await mint();await evm.provider.send('evm_mine',[]);const catalog=new JourneyAssetCatalog(null,[],undefined,adapter);assert.equal((await catalog.owned(asset(),f.a.address)).owner,f.a.address);
 for(const patch of [{codeHash:id('wrong code')},{currencyCodeHash:id('wrong currency')},{gameplaySigner:f.b.address}])await assert.rejects(new JourneyGunCollections(evm.provider,{...manifest,...patch}).inspect(asset()));
 const unsupported=await deploy(f.artifacts.JourneyGunCollection,f.deployer,[f.token.target,f.authority.address,JOURNEY_GUN_RECOVERY_RULES,[id('unsupported'),JOURNEY_GUN_BUILDS[1].hash]]);await assert.rejects(new JourneyGunCollections(evm.provider,{...manifest,collection:String(unsupported.target),codeHash:keccak256(await evm.provider.getCode(unsupported.target))}).checked({...asset(),collection:String(unsupported.target)}));
 await assert.rejects(new JourneyAssetCatalog(null,[{chainId:'31337',collection:String(guns.target)}],undefined,adapter).inspect(asset()));await assert.rejects(adapter.inspect({...asset(),chainId:'46630'}));
 const server=await buildServer({database:':memory:',manual:true,journeyGuns:{provider:evm.provider,deployment:manifest}});try{const response=await server.app.inject('/weapons/journey-inspect?kind=gun&chainId=31337&collection='+guns.target+'&tokenId=1');assert.equal(response.statusCode,200);assert.equal(response.json().immutableBuild.hash,JOURNEY_GUN_BUILDS[0].hash);assert.equal(response.json().capabilities.combatReady,false);}finally{await server.app.close();}
});
