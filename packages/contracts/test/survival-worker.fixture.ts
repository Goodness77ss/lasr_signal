import {DatabaseSync} from 'node:sqlite';
import {Wallet,keccak256,parseEther,type JsonRpcProvider} from 'ethers';
import {compile} from '../scripts/compile.ts';
import {receipt} from '../scripts/shared.ts';
import {vaultFixture} from './survival-vault.fixture.ts';
import {LocalSurvivalVaultTransport} from '../../../apps/server/src/survival-vault-transport.ts';
import {FundedSurvival} from '../../../apps/server/src/funded-survival.ts';
export async function workerFixture(provider:JsonRpcProvider,artifacts=compile(),database=':memory:'){
 const f=await vaultFixture(provider,artifacts),gas=Wallet.createRandom().connect(provider);
 await receipt(f.deployer.sendTransaction({to:gas.address,value:parseEther('1')}),'free local test gas for separate worker wallet',f.receipts);
 const m={chain:31337n,vault:String(f.vault.target),token:String(f.token.target),treasury:String(f.treasury.target),signer:f.authority.address,deployment:f.deployer.address,rulesHash:f.rules,fromBlock:0,vaultCodeHash:keccak256(await provider.getCode(f.vault.target)),tokenCodeHash:keccak256(await provider.getCode(f.token.target)),treasuryCodeHash:keccak256(await provider.getCode(f.treasury.target))};
 const transport=new LocalSurvivalVaultTransport(provider,gas,gas.address,m),db=new DatabaseSync(database);db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL');
 let wall=Date.now();const now=()=>wall,service=new FundedSurvival(db,transport,f.authority,now);await service.poll();
 const open=async(deposit=40,carryCap=0)=>{const {entry,signature}=await service.entry(f.a.address,deposit,carryCap);if(entry.deposit)await receipt(f.token.connect(f.a).getFunction('approve')(f.vault.target,entry.deposit),'exact player vault approval',f.receipts);await receipt(f.vault.connect(f.a).getFunction('open')(entry,signature),'player explicitly opens server issued allocation',f.receipts);await provider.send('evm_mine',[]);await service.poll();await service.activate(entry.runId,f.a.address);return entry;};
 const advanceWall=async(seconds:number)=>{wall+=seconds*1000;await f.advance(BigInt(seconds));await service.poll();};
 return {...f,gas,transport,db,service,now,open,advanceWall,setWall:(n:number)=>{wall=n;}};
}
/** Authored test setup only. No runtime route exposes checkpoint editing or reward injection. */
export function missionGameplayFixture(service:FundedSurvival,runId:string){
 const r=(service as unknown as {runs:Map<string,any>}).runs.get(runId)!;
 r.game.countdown=0;r.game.tick=1800;r.rewards.lastTick=1800;r.game.squads[0].x=23;r.game.squads[0].z=7;r.game.relays[0].owner=0;r.rewards.owners.A=0;
 r.director.assaults.push({id:runId+':authored-assault',station:'A',tier:1,state:'preparing',createdAt:1800,readyAt:1900,startedAt:null,endedAt:null,origins:[{x:40,z:5},{x:40,z:9}],members:[],engagedAt:null,participated:false,heldFrom:1800,eligible:true,reason:'Authored local worker recovery fixture'});
 service.tick();return r;
}
