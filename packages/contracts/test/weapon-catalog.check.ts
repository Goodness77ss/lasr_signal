import {test,before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {JsonRpcProvider,keccak256,parseEther} from 'ethers';
import {startEvm} from '../scripts/evm.ts';
import {fixture,deploy,as,receipt} from '../scripts/shared.ts';
import {salvageRulesHash,weaponRecoveryPolicyHash,SHOTGUN_BUILD_HASH,type ArmoryDeployment} from '@last-signal/chain';
import {buildServer} from '../../../apps/server/src/app.ts';
import type {WeaponCollectionDeployment} from '../../../apps/server/src/weapon-collections.ts';
import {WeaponLab,WEAPON_LAB_VERSION} from '../../../apps/server/src/weapon-lab.ts';

let evm:Awaited<ReturnType<typeof startEvm>>,f:Awaited<ReturnType<typeof fixture>>,legacy:Awaited<ReturnType<typeof deploy>>,next:Awaited<ReturnType<typeof deploy>>,server:Awaited<ReturnType<typeof buildServer>>|null,checkpoint:string,v2:WeaponCollectionDeployment;
const origin='http://127.0.0.1:5174';
before(async()=>{
 evm=await startEvm(18572);f=await fixture(evm.provider);legacy=await deploy(f.artifacts.GunArmory,f.deployer,[f.token.target,f.authority.address,salvageRulesHash]);next=await deploy(f.artifacts.SurvivalGunCollection,f.deployer,[f.token.target,f.authority.address,weaponRecoveryPolicyHash]);
 await receipt(as(f.token,f.a).approve(legacy.target,parseEther('20')),'old rifle approval');await receipt(as(legacy,f.a).buyGun(0),'old rifle');await receipt(as(f.token,f.b).approve(legacy.target,parseEther('30')),'old carbine approval');await receipt(as(legacy,f.b).buyGun(1),'old carbine');await receipt(as(f.token,f.b).approve(next.target,parseEther('35')),'new collection approval');await receipt(as(next,f.b).buyGun(2),'new collectible');await evm.provider.send('evm_mine',[]);
 v2={collection:String(next.target),version:'SURVIVAL_V2',chainId:31337,currency:String(f.token.target),gameplaySigner:f.authority.address,rulesHash:weaponRecoveryPolicyHash,codeHash:keccak256(await evm.provider.getCode(next.target))};
});
after(async()=>{evm?.provider.destroy();await evm?.stop();});
async function boot(database=':memory:',enabled=true){
 const provider=new JsonRpcProvider(evm.url,undefined,{cacheTimeout:-1,batchMaxCount:1,pollingInterval:20});
 const deployment={chainId:31337,rpc:evm.url,token:String(f.token.target),escrow:String(f.escrow.target),settlementSigner:f.authority.address,deploymentBlock:0,tokenCodeHash:keccak256(await evm.provider.getCode(f.token.target)),escrowCodeHash:keccak256(await evm.provider.getCode(f.escrow.target))};
 const armory:ArmoryDeployment={chainId:31337,token:String(f.token.target),armory:String(legacy.target),gameplaySigner:f.authority.address,rulesHash:salvageRulesHash,codeHash:keccak256(await evm.provider.getCode(legacy.target)),deploymentBlock:0,transactionHash:'local-test-only'};
 return buildServer({database,manual:true,chain:{provider,signer:f.authority,deployment,confirmations:2,mode:'LOCAL_TEST'},armory:{provider,signer:f.authority,deployment:armory},weaponCollectionV2:enabled?v2:undefined});
}
beforeEach(async()=>{checkpoint=await evm.provider.send('evm_snapshot',[]);server=await boot();});
afterEach(async()=>{await server?.app.close();server=null;await evm.provider.send('evm_revert',[checkpoint]);});
async function login(wallet:typeof f.a){const challenge=(await server!.app.inject({method:'POST',url:'/testnet/challenge',headers:{origin},payload:{address:wallet.address,chainId:31337}})).json();const reply=await server!.app.inject({method:'POST',url:'/testnet/login',headers:{origin},payload:{nonce:challenge.nonce,signature:await wallet.signMessage(challenge.message)}});assert.equal(reply.statusCode,200);return {origin,authorization:'Bearer '+reply.json().session};}
const api=async(path:string,headers:Record<string,string>={},payload?:object)=>{const reply=await server!.app.inject({method:payload===undefined?'GET':'POST',url:'/weapons/'+path,headers,payload});return {status:reply.statusCode,data:reply.json()};};

test('public catalog and inventory expose actual separate collections, bounded pages and original metadata',async()=>{
 const inspectPath='journey-inspect?kind=gun&chainId=31337&collection='+legacy.target+'&tokenId=1';
 const inspected=await api(inspectPath);assert.equal(inspected.status,200);assert.equal(inspected.data.asset.chainId,'31337');assert.equal(inspected.data.owner,f.a.address);assert.equal(inspected.data.uri,await legacy.tokenURI(1));assert.equal(inspected.data.capabilities.journeyCombatReady,false);
 assert.equal((await api(inspectPath+'&rank=999')).status,400);assert.equal((await api('journey-inspect?kind=gun&collection='+legacy.target+'&tokenId=1')).status,400);
 const config=await api('config');assert.equal(config.data.collections.length,2);assert.equal(config.data.mode,'LOCAL_BLOCKCHAIN');assert.equal(config.data.collections[1].combatReady,false);
 const old=await api('locker?wallet='+f.a.address+'&collection='+legacy.target),fresh=await api('locker?wallet='+f.b.address+'&collection='+next.target);assert.equal(old.status,200);assert.equal(fresh.status,200);assert.equal(old.data.guns[0].tokenId,'1');assert.equal(fresh.data.guns[0].tokenId,'1');assert.notEqual(old.data.guns[0].collection,fresh.data.guns[0].collection);assert.equal(fresh.data.guns[0].weapon,'shotgun');
 assert.equal((await api('locker?wallet='+f.a.address+'&collection='+next.target)).data.total,'0');assert.equal((await api('locker?wallet='+f.a.address+'&collection='+f.escrow.target)).status,400);assert.equal((await api('locker?wallet='+f.a.address+'&collection='+legacy.target+'&offset=-1')).status,400);
 const oldToken=await api('token?collection='+legacy.target+'&tokenId=1'),newToken=await api('token?collection='+next.target+'&tokenId=1');assert.equal(oldToken.data.uri,await legacy.tokenURI(1));assert.equal(newToken.data.owner,f.b.address);assert.match(Buffer.from(newToken.data.uri.split(',')[1],'base64').toString(),/Trench Shotgun/);
 const history=await api('history?collection='+next.target+'&tokenId=1');assert.equal(history.status,200);assert.deepEqual(history.data.entries,[]);assert.equal(history.data.upgrades,'DEFERRED');assert.equal((await api('history?collection='+f.escrow.target+'&tokenId=1')).status,400);
});
test('authenticated loadouts bind the exact asset and retain old rifle and carbine equipment',async()=>{
 const a=await login(f.a),b=await login(f.b);assert.equal((await api('loadout',a,{collection:String(next.target),tokenId:'1'})).status,400);assert.equal((await api('loadout',{}, {collection:String(legacy.target),tokenId:'1'})).status,400);
 assert.equal((await api('loadout',a,{collection:String(legacy.target),tokenId:'1',kind:2})).status,400);assert.equal((await api('loadout',{...a,origin:'https://unapproved.example'},{collection:String(legacy.target),tokenId:'1'})).status,400);
 assert.equal((await api('loadout',a,{collection:String(legacy.target),tokenId:'1'})).data.weapon,'rifle');const rifle=await api('equip',a,{});assert.equal(rifle.status,200);assert.equal(rifle.data.collection,String(legacy.target));assert.equal(rifle.data.observation.squads.find((s:{id:number})=>s.id===rifle.data.observation.hero.squadId).weapon,'rifle');
 await server!.armory.finish(rifle.data.runId,f.a.address);const recovery=await api('recovery/'+rifle.data.runId,a,{});assert.equal(recovery.status,200);assert.equal(recovery.data.collection,String(legacy.target));assert.equal(recovery.data.claimRoute,'LEGACY_V1');
 await api('loadout',b,{collection:String(legacy.target),tokenId:'2'});const carbine=await api('equip',b,{});assert.equal(carbine.status,200);assert.equal(carbine.data.observation.squads.find((s:{id:number})=>s.id===carbine.data.observation.hero.squadId).weapon,'carbine');
 await api('loadout',b,{collection:String(next.target),tokenId:'1'});const pending=await api('equip',b,{});assert.equal(pending.status,400);assert.match(pending.data.error,/not enabled/);
});
test('actual exchange quote routes reject changed V2 terms while retaining legacy expected price sales',async()=>{
 await receipt(as(legacy,f.a).listGun(1,parseEther('6')),'list original');await receipt(as(next,f.b).listGun(1,parseEther('8'),SHOTGUN_BUILD_HASH),'list new');
 const old=await api('quote?collection='+legacy.target+'&tokenId=1'),fresh=await api('quote?collection='+next.target+'&tokenId=1');assert.equal(old.data.route,'LEGACY_EXPECTED_PRICE');assert.equal(fresh.data.route,'V2_EXPECTED_BUILD');assert.equal(fresh.data.expectedBuildHash,SHOTGUN_BUILD_HASH);
 const market=await api('market?collection='+next.target);assert.equal(market.data.guns[0].collection,String(next.target));assert.equal(market.data.guns[0].listingNonce,fresh.data.expectedNonce);
 await receipt(as(next,f.b).cancelListing(1),'cancel new');await receipt(as(next,f.b).listGun(1,parseEther('8'),SHOTGUN_BUILD_HASH),'relist same price');await receipt(as(f.token,f.a).approve(next.target,parseEther('8')),'exact new price');await assert.rejects(as(next,f.a).buyListed(1,fresh.data.price,fresh.data.expectedBuildHash,fresh.data.expectedNonce));
 const current=await api('quote?collection='+next.target+'&tokenId=1');await receipt(as(next,f.a).buyListed(1,current.data.price,current.data.expectedBuildHash,current.data.expectedNonce),'new supported sale route');assert.equal(await next.ownerOf(1),f.a.address);
 await receipt(as(f.token,f.b).approve(legacy.target,parseEther('6')),'exact old price');await receipt(as(legacy,f.b).buyListed(1,old.data.price),'old supported sale route');assert.equal(await legacy.ownerOf(1),f.b.address);
});
test('transferred equipment loses access and a disabled second collection does not disable the old armory',async()=>{
 const b=await login(f.b);await api('loadout',b,{collection:String(next.target),tokenId:'1'});await receipt(as(next,f.b).transferFrom(f.b.address,f.a.address,1),'external transfer');await evm.provider.send('evm_mine',[]);assert.equal((await api('loadout',b)).status,400);
 await server!.app.close();server=await boot(':memory:',false);const config=await api('config');assert.equal(config.data.collections.length,1);assert.equal(config.data.v2Status,'DISABLED');assert.equal((await api('locker?wallet='+f.a.address+'&collection='+legacy.target)).status,200);assert.equal((await api('locker?wallet='+f.a.address+'&collection='+next.target)).status,400);
});

test('new collection shotgun fires only for its verified owner and external transfer stops lab use',async()=>{
 const headers=await login(f.b),session=headers.authorization.slice(7),messages:any[]=[];
 const lab=new WeaponLab(true,server!.weapons),client=lab.connect({send:raw=>messages.push(JSON.parse(raw)),close:()=>{}},value=>server!.testnet.auth.identify(value,origin));
 try{
  await client.receive(JSON.stringify({op:'start',version:WEAPON_LAB_VERSION,asset:{collection:String(next.target),tokenId:'1'},session}));
  assert.equal(messages.at(-1).observation.squads[0].weapon,'shotgun');assert.equal(messages.at(-1).ownedAsset.collection,String(next.target));
  await client.receive(JSON.stringify({op:'command',version:WEAPON_LAB_VERSION,id:'owned-shot',action:{kind:'fire',squadId:1,direction:{x:1,y:0,z:0}}}));assert.equal(messages.at(-1).ok,true);
  lab.tick();lab.tick();assert.equal(messages.at(-1).observation.squads[0].ammo,5);assert.ok(messages.at(-1).observation.squads[1].hp<3000);
  await receipt(as(next,f.b).transferFrom(f.b.address,f.a.address,1),'transfer equipped shotgun');await evm.provider.send('evm_mine',[]);await lab.poll();assert.equal(messages.at(-1).paused,true);
  const tick=messages.at(-1).observation.tick;lab.tick();lab.tick();assert.equal(messages.at(-1).observation.tick,tick);
 }finally{client.close();lab.close();}
});
test('loadouts survive disk restart and legacy checkpoints without a collection retain their original identity',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'last-signal-weapons-')),database=join(directory,'state.sqlite');
 try{
  await server!.app.close();server=await boot(database);const a=await login(f.a);await api('loadout',a,{collection:String(legacy.target),tokenId:'1'});const run=await api('equip',a,{});assert.equal(run.status,200);await server!.app.close();server=null;
  const d=new DatabaseSync(database),row=d.prepare('SELECT state FROM salvage_runs WHERE id=?').get(run.data.runId)!;const saved=JSON.parse(String(row.state));delete saved.collection;const raw=JSON.stringify(saved);d.prepare('UPDATE salvage_runs SET state=?,digest=? WHERE id=?').run(raw,createHash('sha256').update(raw).digest('hex'),run.data.runId);d.close();
  server=await boot(database);const fresh=await login(f.a);assert.equal((await api('loadout',fresh)).data.asset.collection,String(legacy.target));assert.equal(server.armory.status(run.data.runId,f.a.address).collection,String(legacy.target));
  server.rooms.db.prepare('UPDATE weapon_loadouts SET digest=?').run('corrupt');assert.equal((await api('loadout',fresh)).status,400);
 }finally{await server?.app.close();server=null;const target=resolve(directory);if(!target.startsWith(resolve(tmpdir())+sep)||!basename(target).startsWith('last-signal-weapons-'))throw Error('Unsafe test cleanup path');rmSync(target,{recursive:true,force:true});}
});
