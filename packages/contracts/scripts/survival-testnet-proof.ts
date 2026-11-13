import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {Contract,JsonRpcProvider,parseEther,ZeroHash} from 'ethers';
import {WebSocket} from 'ws';
import {lineOfSight,distance} from '@last-signal/sim';
import {TESTNET,json,type SurvivalEntry,type SurvivalMissionPermit} from '@last-signal/chain';
import {loadRole,secretFolder} from './testnet-keys.ts';
import {SurvivalPublicJournal} from './survival-public-journal.ts';
import type {FundedSurvival} from '../../../apps/server/src/funded-survival.ts';
type Snapshot=ReturnType<FundedSurvival['status']>;
type PrivateState={vault:string;player:string;initialBalance:string;runId?:string;entry?:SurvivalEntry;entrySignature?:string;completed?:boolean};
const root=resolve(import.meta.dirname,'../../..'),provider=new JsonRpcProvider(TESTNET.rpc,undefined,{cacheTimeout:-1,batchMaxCount:1,pollingInterval:1000});
const base='http://127.0.0.1:3002',origin='http://127.0.0.1:5175';let socket:WebSocket|undefined,timer:ReturnType<typeof setInterval>|undefined,stage='preflight',auth='';
try{
 assert.equal(BigInt(await provider.send('eth_chainId',[])),46630n);
 const m=JSON.parse(readFileSync(resolve(secretFolder,'survival-deployment.json'),'utf8')),player=loadRole('playerA'),abi=(n:string)=>JSON.parse(readFileSync(resolve(import.meta.dirname,'../abi',n+'.json'),'utf8'));
 const token=new Contract(m.token,abi('TestWIF'),provider),vault=new Contract(m.vault,abi('SurvivalRunVault'),provider),grant=new Contract(m.welcomeGrant,abi('SurvivalWelcomeGrant'),provider),treasury=new Contract(m.treasury,abi('SurvivalTreasury'),provider);
 const api=async<T=Snapshot>(path:string,body?:unknown):Promise<T>=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{origin,...(body===undefined?{}:{'content-type':'application/json'}),...(auth?{authorization:'Bearer '+auth}:{})},body:body===undefined?undefined:json(body),signal:AbortSignal.timeout(20000)});const value=await r.json();if(!r.ok)throw Error('Authoritative service rejected SDK operation');return value as T;};
 const config=await api<{mode:string;chainId:string;vault:string;settlementWorker:{fundedEntry:boolean}}>('/survival/funded/config');assert.equal(config.mode,'PUBLIC_TESTNET');assert.equal(config.chainId,'46630');assert.equal(config.vault,m.vault);assert.ok(config.settlementWorker.fundedEntry);
 const file=resolve(secretFolder,'survival-sdk-state.json'),state:PrivateState=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{vault:m.vault,player:player.address,initialBalance:String(await token.balanceOf(player.address))};
 assert.equal(state.vault,m.vault);assert.equal(state.player,player.address);if(state.completed){console.log('Public SDK proof already completed. Existing evidence retained; no new transaction sent.');process.exit(0);}
 const save=()=>writeFileSync(file,json(state));save();
 const journal=new SurvivalPublicJournal(provider,resolve(secretFolder,'survival-sdk-journal.json'),json({chain:46630,vault:m.vault,token:m.token,player:player.address,campaign:m.campaign}));
 stage='welcome claim';await journal.send('SDK player claims one finite welcome campaign grant',player,{to:m.welcomeGrant,data:grant.interface.encodeFunctionData('claim',[m.campaign])});
 assert.equal(await grant.claimed(m.campaign,player.address),true);
 stage='wallet login';const challenge=await api<{nonce:string;message:string}>('/testnet/challenge',{address:player.address,chainId:46630}),login=await api<{session:string;address:string}>('/testnet/login',{nonce:challenge.nonce,signature:await player.signMessage(challenge.message)});assert.equal(login.address,player.address);auth=login.session;
 if(!state.runId){stage='bounded entry authorization';const a=await api<{entry:SurvivalEntry;signature:string}>('/survival/funded/entries',{deposit:40,carryCap:0});assert.equal(a.entry.player,player.address);assert.equal(a.entry.currency,m.token);assert.equal(a.entry.rulesHash,m.rulesHash);state.runId=a.entry.runId;state.entry=a.entry;state.entrySignature=a.signature;save();}
 const runId=state.runId!;
 stage='allocation';await journal.send('SDK player approves exactly forty mock units',player,{to:m.token,data:token.interface.encodeFunctionData('approve',[m.vault,parseEther('40')])});
 await journal.send('SDK player explicitly opens bounded survival allocation',player,{to:m.vault,data:vault.interface.encodeFunctionData('open',[state.entry,state.entrySignature])});
 let snapshot=await api('/survival/funded/'+runId+'/activate',{});if(snapshot.phase!=='active')throw Error('Existing SDK run is not active. Preserve its recovery state');
 const gasNonceBefore=await provider.getTransactionCount(m.gasWallet),ledgerSamples:unknown[]=[];
 stage='ordinary server combat through authenticated SDK WebSocket';let received:Snapshot|null=null,order=0,missionWorking=false,accepted=false,missionError=false,routed=false,ammoAt=0;
 socket=new WebSocket(base.replace('http:','ws:')+'/survival/funded-socket',{headers:{origin}});
 const ready=new Promise<void>((done,reject)=>{socket!.once('error',()=>reject(Error('SDK socket failed')));socket!.once('open',()=>socket!.send(json({op:'attach',run:runId,session:auth})));socket!.on('message',raw=>{try{const m=JSON.parse(raw.toString());if(m.observation){received=m as Snapshot;done();}}catch{}});});await ready;
 const orderTo=(request:unknown)=>{if(socket?.readyState===WebSocket.OPEN)socket.send(json({op:'action',id:'sdk:'+ ++order,request}));};
 const command=(action:unknown)=>orderTo({kind:'command',action});
 await api('/survival/funded/'+runId+'/pause',{paused:false});const started=Date.now();
 timer=setInterval(()=>{
  const s=received;if(!s||s.phase!=='active'||s.paused||s.observation.result||missionWorking||accepted)return;
  const g=s.observation,h=g.squads.find(u=>u.id===g.hero?.squadId);if(!h||g.tick===0)return;
  if(!routed){const a=g.relays[0];command({kind:'move',squadId:h.id,target:{x:a.x-1,z:a.z}});routed=true;}
  if(!h.ammo&&h.reserveAmmo&&!h.reloadUntil)command({kind:'reload',squadId:h.id});
  const enemy=g.squads.filter(u=>u.side===1&&u.hp>0&&distance(h,u)<=14&&lineOfSight(h,u)).sort((a,b)=>a.hp-b.hp)[0];
  if(enemy&&h.ammo&&!h.reloadUntil){const length=distance(h,enemy);if(length)command({kind:'fire',squadId:h.id,direction:{x:(enemy.x-h.x)/length,y:0,z:(enemy.z-h.z)/length}});}
  if(Date.now()-ammoAt>1200){
   if(h.hp<60&&s.fieldAllowance.credits>=10&&!s.fieldAllowance.medicalUsed&&g.tick-h.lastHit>=100){orderTo({kind:'field',item:'BASIC_MEDICAL'});ammoAt=Date.now();}
   else if(h.reserveAmmo<=40&&s.fieldAllowance.credits>=5&&g.tick>=s.fieldAllowance.ammoAt){orderTo({kind:'field',item:'BASIC_AMMO'});ammoAt=Date.now();}
   else if(h.reserveAmmo<=40&&s.accounting.availableWhole>=10){orderTo({kind:'supply',item:'AMMO'});ammoAt=Date.now();}
  }
  if(s.mission.current?.status==='OFFER'){
   missionWorking=true;ledgerSamples.push({at:new Date().toISOString(),stage:'OFFER',tick:g.tick,accounting:s.accounting,mission:s.mission.current});
   void(async()=>{
    try{const a=await api<{permit:SurvivalMissionPermit;signature:string}>('/survival/funded/'+runId+'/mission',{});const r=await journal.send('SDK player explicitly consents to offered mission stake',player,{to:m.vault,data:vault.interface.encodeFunctionData('acceptMission',[a.permit,a.signature])});snapshot=await api('/survival/funded/'+runId+'/mission-receipt',{hash:r.hash});assert.equal(snapshot.mission.current?.status,'ACTIVE');accepted=true;ledgerSamples.push({at:new Date().toISOString(),stage:'ACCEPTED',tick:snapshot.observation.tick,accounting:snapshot.accounting});}catch{missionError=true;}finally{missionWorking=false;}
   })();
  }
 },250);
 while(!accepted){await new Promise(r=>setTimeout(r,500));const current=received as Snapshot|null;if(missionError||current?.phase!=='active'||current?.observation.result||Date.now()-started>245000)throw Error('SDK combat did not reach a confirmed feasible mission; preserve authoritative recovery');}
 clearInterval(timer);timer=undefined;
 const playerNonceAtClosure=await provider.getTransactionCount(player.address);socket.close();await new Promise<void>(done=>socket!.once('close',()=>done()));socket=undefined;
 stage='independent worker after SDK client closure';console.log('Actual station play and explicit mission consent completed. SDK client closed; waiting for departure and automatic settlement.');
 const until=Date.now()+150000;let closing:Snapshot|null=null;
 while(Date.now()<until){snapshot=await api('/survival/funded/'+runId);if(snapshot.phase==='recovery')throw Error('Public run entered recovery; no settlement success claimed');if(snapshot.settlement){closing??=snapshot;if(snapshot.settlement.state==='settled')break;}await new Promise(r=>setTimeout(r,2000));}
 assert.ok(closing);assert.equal(snapshot.settlement?.state,'settled');assert.equal(closing.mission.current?.status,'FAILED');assert.equal(closing.accounting.failedWhole,5);assert.ok(closing.accounting.stationWhole>=5);assert.equal(await provider.getTransactionCount(player.address),playerNonceAtClosure);
 const expected=BigInt(closing.allocation.deposit)+parseEther(String(closing.accounting.stationWhole+closing.accounting.bonusWhole-closing.accounting.spentWhole-closing.accounting.failedWhole));assert.equal(await vault.claimable(player.address),expected);
 const hashes=snapshot.settlement!.hashes,settlements=[];for(const hash of hashes){const r=await provider.getTransactionReceipt(hash);if(r?.status===1){assert.equal(r.from,m.gasWallet);assert.equal((await provider.getBlock(r.blockNumber))?.hash,r.blockHash);assert.ok(await r.confirmations()>=2);const events=r.logs.filter(l=>l.address.toLowerCase()===m.vault.toLowerCase()).map(l=>{try{return vault.interface.parseLog(l);}catch{return null;}});const result=events.find(l=>l?.name==='Settled');assert.ok(result);assert.equal(result.args.authorization,snapshot.settlement!.digest);assert.equal(result.args.credit,expected);settlements.push({hash:r.hash,block:r.blockNumber,blockHash:r.blockHash,status:1,gasUsed:String(r.gasUsed),credit:String(result.args.credit),burn:String(result.args.burn),recycled:String(result.args.recycled),authorization:String(result.args.authorization)});}}
 assert.equal(settlements.length,1);assert.equal(await provider.getTransactionCount(m.gasWallet)-gasNonceBefore,1);assert.equal(await vault.activeRun(player.address),ZeroHash);
 stage='independent pull claim';await journal.send('SDK player independently claims confirmed survival credit',player,{to:m.vault,data:vault.interface.encodeFunctionData('claim')});assert.equal(await vault.claimable(player.address),0n);assert.equal(await token.balanceOf(m.vault),await vault.liabilities());assert.equal(await token.balanceOf(m.treasury),(await treasury.freeCapacity())+(await treasury.reserved()));
 const report={checkedAt:new Date().toISOString(),mode:'PUBLIC_TESTNET_SDK_AUTOMATED_SERVER_COMBAT',chainId:46630,manifest:m,runId,player:player.address,initialPlayerMock:state.initialBalance,ledgerSamples,closing:{tick:closing.observation.tick,accounting:closing.accounting,outcome:closing.lifecycle.terminal?.outcome,job:snapshot.settlement},settlements,playerReceipts:journal.receipts,automaticSubmission:{closedClient:'SDK_WEBSOCKET',extraPlayerTransactionsBeforeSettlement:0,workerTransactions:1},final:{playerMock:String(await token.balanceOf(player.address)),vaultMock:String(await token.balanceOf(m.vault)),vaultLiability:String(await vault.liabilities()),playerClaimable:String(await vault.claimable(player.address)),treasuryMock:String(await token.balanceOf(m.treasury)),treasuryReserved:String(await treasury.reserved()),totalSupplyObserved:String(await token.totalSupply())},limitations:['SDK controlled dedicated test wallet and automated ordinary server commands. No browser wallet signing is represented.','Combat used the normal running server and authenticated WebSocket. No checkpoint editing or authored reward fixture was used.','The browser wallet path, human playtest, foreground performance and public hosting remain unverified.','Only original valueless mock tWIF and free test ETH were used. Two L2 blocks are soft confirmations.']};
 writeFileSync(resolve(root,'docs/evidence/v2-step15-sdk-run.json'),JSON.stringify(report,(_k,v)=>typeof v==='bigint'?String(v):v,2));state.completed=true;save();console.log('Public SDK station reward, accepted mission departure, automatic settlement and independent claim verified. Browser wallet gate remains separate.');
}catch{console.error('Public SDK survival proof stopped at '+stage+'. Recovery metadata and journals retained; no fabricated success.');process.exitCode=1;}finally{if(timer)clearInterval(timer);socket?.close();provider.destroy();}
