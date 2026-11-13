import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {JsonRpcProvider,keccak256,parseEther,toUtf8Bytes} from 'ethers';
import {startEvm} from './evm.ts';
import {fixture,deploy,as,receipt,type Receipt} from './shared.ts';
import {salvageRulesHash,weaponRecoveryPolicyHash,SHOTGUN_BUILD_HASH,type ArmoryDeployment} from '@last-signal/chain';
import {buildServer} from '../../../apps/server/src/app.ts';
import type {WeaponCollectionDeployment} from '../../../apps/server/src/weapon-collections.ts';

// Disposable local chain and isolated database. Never load a public testnet signing role.
process.env.SURVIVAL_VAULT_V2='false';process.env.SURVIVAL_WEAPONS_V2='false';
process.env.ALLOWED_ORIGINS='http://127.0.0.1:5176,http://localhost:5176';
const origin='http://127.0.0.1:5176',evm=await startEvm(18573);
let service:Awaited<ReturnType<typeof buildServer>>|undefined;
let stopping=false;
async function stop(){if(stopping)return;stopping=true;await service?.app.close();evm.provider.destroy();await evm.stop();}
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>void stop().finally(()=>{process.exitCode=0;}));
try{
 const f=await fixture(evm.provider),receipts:Receipt[]=[...f.receipts];
 const old=await deploy(f.artifacts.GunArmory,f.deployer,[f.token.target,f.authority.address,salvageRulesHash],receipts,'deploy original local armory');
 const next=await deploy(f.artifacts.SurvivalGunCollection,f.deployer,[f.token.target,f.authority.address,weaponRecoveryPolicyHash],receipts,'deploy separate local V2 collection');
 await receipt(as(f.token,f.a).approve(old.target,parseEther('50')),'approve two original guns',receipts);
 await receipt(as(old,f.a).buyGun(0),'buy original rifle',receipts);await receipt(as(old,f.a).buyGun(1),'buy original carbine',receipts);
 const rifleURI=await old.tokenURI(1),carbineURI=await old.tokenURI(2);
 await receipt(as(f.token,f.b).approve(next.target,parseEther('35')),'approve exact new gun',receipts);await receipt(as(next,f.b).buyGun(2),'buy new collection item',receipts);
 await receipt(as(old,f.a).listGun(1,parseEther('7')),'list original rifle',receipts);await receipt(as(f.token,f.b).approve(old.target,parseEther('7')),'approve original sale',receipts);await receipt(as(old,f.b).buyListed(1,parseEther('7')),'trade original rifle',receipts);
 await receipt(as(next,f.b).listGun(1,parseEther('9'),SHOTGUN_BUILD_HASH),'list new exact build',receipts);const listing=await next.listings(1);
 await receipt(as(f.token,f.a).approve(next.target,parseEther('9')),'approve exact V2 sale',receipts);await receipt(as(next,f.a).buyListed(1,parseEther('9'),SHOTGUN_BUILD_HASH,listing.nonce),'trade new exact build and nonce',receipts);
 await receipt(as(f.token,f.b).approve(next.target,parseEther('35')),'approve second new item',receipts);await receipt(as(next,f.b).buyGun(2),'buy second review item',receipts);
 await receipt(as(next,f.b).listGun(2,parseEther('12'),SHOTGUN_BUILD_HASH),'actual V2 review listing',receipts);await receipt(as(old,f.b).listGun(1,parseEther('6')),'actual legacy review listing',receipts);await evm.provider.send('evm_mine',[]);
 const provider=new JsonRpcProvider(evm.url,undefined,{cacheTimeout:-1,batchMaxCount:1,pollingInterval:50});
 const deployment={chainId:31337,rpc:evm.url,token:String(f.token.target),escrow:String(f.escrow.target),settlementSigner:f.authority.address,deploymentBlock:0,tokenCodeHash:keccak256(await evm.provider.getCode(f.token.target)),escrowCodeHash:keccak256(await evm.provider.getCode(f.escrow.target))};
 const armory:ArmoryDeployment={chainId:31337,armory:String(old.target),token:String(f.token.target),gameplaySigner:f.authority.address,rulesHash:salvageRulesHash,codeHash:keccak256(await evm.provider.getCode(old.target)),deploymentBlock:0,transactionHash:receipts.find(r=>r.label==='deploy original local armory')!.hash};
 const v2:WeaponCollectionDeployment={collection:String(next.target),version:'SURVIVAL_V2',chainId:31337,currency:String(f.token.target),gameplaySigner:f.authority.address,rulesHash:weaponRecoveryPolicyHash,codeHash:keccak256(await evm.provider.getCode(next.target))};
 mkdirSync('.runtime',{recursive:true});const privateDirectory=mkdtempSync(resolve('.runtime/weapon-review-'));
 service=await buildServer({database:resolve(privateDirectory,'state.sqlite'),chain:{provider,signer:f.authority,deployment,confirmations:2,mode:'LOCAL_TEST'},armory:{provider,signer:f.authority,deployment:armory},weaponCollectionV2:v2});
 const login=async(wallet:typeof f.a)=>{const c=(await service!.app.inject({method:'POST',url:'/testnet/challenge',headers:{origin},payload:{address:wallet.address,chainId:31337}})).json();const r=await service!.app.inject({method:'POST',url:'/testnet/login',headers:{origin},payload:{nonce:c.nonce,signature:await wallet.signMessage(c.message)}});if(r.statusCode!==200)throw Error('Local login failed');return {origin,authorization:'Bearer '+r.json().session};};
 const equipment=[];
 for(const [wallet,id]of [[f.a,'2'],[f.b,'1']] as const){const headers=await login(wallet);let r=await service.app.inject({method:'POST',url:'/weapons/loadout',headers,payload:{collection:String(old.target),tokenId:id}});if(r.statusCode!==200)throw Error('Legacy loadout failed');r=await service.app.inject({method:'POST',url:'/weapons/equip',headers,payload:{}});if(r.statusCode!==200)throw Error('Legacy equipment failed');const data=r.json();equipment.push({collection:data.collection,tokenId:data.tokenId,weapon:data.observation.squads.find((s:{id:number})=>s.id===data.observation.hero.squadId).weapon});service.armory.finish(data.runId,wallet.address);}
 if(await old.tokenURI(1)!==rifleURI||await old.tokenURI(2)!==carbineURI)throw Error('Original metadata changed');
 if(await old.ownerOf(1)!==f.b.address||await next.ownerOf(1)!==f.a.address||await f.token.totalSupply()!==parseEther('80'))throw Error('Local ownership or conservation failed');
 const report={checkedAt:new Date().toISOString(),mode:'LOCAL_BLOCKCHAIN_SDK_COMPATIBILITY_REVIEW',chainId:31337,actors:{a:f.a.address,b:f.b.address},originalCollection:armory,v2Collection:v2,receipts,equipment,originalMetadataUnchanged:true,originalRifleURIHash:keccak256(toUtf8Bytes(rifleURI)),originalCarbineURIHash:keccak256(toUtf8Bytes(carbineURI)),sameIdOwners:{tokenId:'1',original:await old.ownerOf(1),v2:await next.ownerOf(1)},balances:{a:String(await f.token.balanceOf(f.a.address)),b:String(await f.token.balanceOf(f.b.address)),supply:String(await f.token.totalSupply()),escrowLiability:String(await f.escrow.liabilities())},limits:['Disposable local chain and SDK review actors, not public testnet deployment or human market activity.','Shotgun collectible combat and naturally extracted V2 shotgun loot are not implemented yet.']};
 writeFileSync('docs/evidence/v2-step16-local-compatibility.json',JSON.stringify(report,null,2)+'\n');writeFileSync(resolve(privateDirectory,'deployment.json'),JSON.stringify({armory,v2},null,2));
 await service.app.listen({host:'127.0.0.1',port:3003});console.log(JSON.stringify({mode:report.mode,url:'http://127.0.0.1:3003',a:f.a.address,b:f.b.address,original:String(old.target),v2:String(next.target),receipts:receipts.length,equipment}));
}catch(error){await stop();throw error;}
