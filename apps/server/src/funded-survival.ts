import {randomBytes,createHash} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {Contract,id,keccak256,toUtf8Bytes,ZeroHash,type Signer} from 'ethers';
import {FUNDED_SURVIVAL_RULES as R,command,observe,visible,segmentCloseReason,tokenUnits,type Game} from '@last-signal/sim';
import {survivalRulesHash,survivalEntryTypes,survivalMissionTypes,survivalVaultDomain,type SurvivalEntry,type SurvivalMissionPermit,type SurvivalResult} from '@last-signal/chain';
import {parseClient,type Action} from '@last-signal/protocol';
import {createStationPractice,stepStationPractice} from '../../../packages/sim/src/survival.ts';
import {createDirector,stepDirector,type Director} from '../../../packages/sim/src/assault-director.ts';
import {createRewardState,stationRewards,rewardKey,type RewardState} from '../../../packages/sim/src/station-rewards.ts';
import {createFieldState,fieldSupport,takeFieldAmmo,type FieldState} from '../../../packages/sim/src/field-support.ts';
import {createRunEconomy,availableRunWhole,runSupply,type RunEconomy} from '../../../packages/sim/src/run-economy.ts';
import {createMissionState,tickMission,decideMission,abortMission,type MissionState,type Mission} from '../../../packages/sim/src/missions.ts';
import {createLifecycleState,tickLifecycle,extractionOrder,cancelExtraction,collectProvisionalLoot,type LifecycleState} from '../../../packages/sim/src/run-lifecycle.ts';
import {SurvivalSettlements,SurvivalSettlementWorker,json} from './survival-settlements.ts';
import {SurvivalVaultTransport} from './survival-vault-transport.ts';
import type {Peer} from './rooms.ts';

type Allocation={segment:string;sequence:string;deposit:string;stationReserve:string;bonusReserve:string;activatedAt:number;deadline:number};
type Accepted={mission:string;index:number;hash:string};
type FundedState={id:string;player:string;rulesHash:string;allocation:Allocation;game:Game;director:Director;rewards:RewardState;field:FieldState;economy:RunEconomy;mission:MissionState;lifecycle:LifecycleState;accepted:Accepted[];baseStation:number;baseTick:number;order:number;paused:boolean;phase:'active'|'closing'|'banked'|'ended'|'recovery';job:string|null;pendingMission:string|null;pendingUntil:number};
type Live=FundedState&{peer:Peer|null};
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const whole=(n:bigint)=>{if(n<0n||n%tokenUnits(1)!==0n||n>tokenUnits(1000))throw Error('Whole token allocation required');return Number(n/tokenUnits(1));};
const depositWhole=(n:bigint)=>{if(n<0n||n>tokenUnits(100))throw Error('Invalid chain deposit');return Number(n/tokenUnits(1));};
const hashId=(s:string)=>{if(!/^0x[0-9a-fA-F]{64}$/.test(s))throw Error('Valid chain ID required');return s;};

/** Opt in local funded authority. Shares existing combat, station, supply, mission and lifecycle logic. */
export class FundedSurvival{
 readonly jobs:SurvivalSettlements;readonly worker:SurvivalSettlementWorker;
 private runs=new Map<string,Live>();private chainNow=0;private checkedAt=0;private polling=false;private stopped=false;
 private interrupted=new Set<string>();private invalid=new Set<string>();
 constructor(readonly db:DatabaseSync,readonly transport:SurvivalVaultTransport,private gameplay:Signer,readonly now:()=>number=Date.now){
  if(transport.manifest.rulesHash!==survivalRulesHash(R))throw Error('Funded rules mismatch');
  this.jobs=new SurvivalSettlements(db,now);this.worker=new SurvivalSettlementWorker(this.jobs,transport,gameplay,2,30000,transport.mode==='LOCAL_BLOCKCHAIN'?10n**15n:0n,transport.mode==='PUBLIC_TESTNET'?30000:0);
  db.exec(`CREATE TABLE IF NOT EXISTS survival_funded_entries(run TEXT PRIMARY KEY,player TEXT NOT NULL,entry TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS survival_funded_runs(id TEXT PRIMARY KEY,state TEXT NOT NULL,digest TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS survival_funded_commands(run TEXT,id TEXT,payload TEXT NOT NULL,ack TEXT NOT NULL,PRIMARY KEY(run,id));
   CREATE TABLE IF NOT EXISTS survival_funded_rewards(key TEXT PRIMARY KEY,run TEXT NOT NULL,payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS survival_funded_activations(run TEXT PRIMARY KEY);
   INSERT OR IGNORE INTO survival_funded_activations SELECT id FROM survival_funded_runs;`);
  for(const row of db.prepare('SELECT * FROM survival_funded_runs').all()){
   try{
    const raw=String(row.state),r=JSON.parse(raw) as FundedState;
    if(digest(raw)!==row.digest||r.id!==row.id||r.rulesHash!==survivalRulesHash(R))throw Error('Corrupt funded checkpoint');
    const count=Number(db.prepare('SELECT count(*) AS n FROM survival_funded_commands WHERE run=?').get(r.id)!.n);
    const rewards=db.prepare('SELECT payload FROM survival_funded_rewards WHERE run=? ORDER BY key').all(r.id).map(e=>String(e.payload)).sort();
    if(count!==r.order||json(rewards)!==json(r.rewards.events.map(e=>json(e)).sort())||r.rewards.lastTick!==r.game.tick)throw Error('Incomplete funded journal');
    this.verifyEconomy(r);
    if(r.phase==='closing'&&r.job){const j=this.jobs.get(r.job);if(!j)throw Error('Missing canonical settlement');this.jobs.verify(j);if(j.checkpoint!==json(r))throw Error('Closing checkpoint differs from canonical job');}
    // A verified closing job survives exactly. An interrupted active allocation is conservatively aborted after chain verification.
    this.runs.set(r.id,{...r,peer:null});if(r.phase==='active')this.interrupted.add(r.id);
   }catch{this.invalid.add(String(row.id));db.prepare("UPDATE survival_settlements SET state='recovery required',reason='Funded gameplay checkpoint failed recovery' WHERE json_extract(body,'$.runId')=?").run(String(row.id));}
  }
 }
 config(){return {enabled:true,mode:this.transport.mode,chainId:String(this.transport.chain),vault:this.transport.vault,currency:this.transport.manifest.token,rulesHash:survivalRulesHash(R),rulesVersion:R.version,settlementWorker:{...this.worker.health(),fundedEntry:this.invalid.size===0&&this.worker.health().fundedEntry},invalidCheckpoints:this.invalid.size,browserWalletEvidence:"docs/TESTNET_SURVIVAL_V2.md"};}
 private saved(r:Live):FundedState{const {peer,...saved}=r;return saved;}
 private save(r:Live){const raw=json(this.saved(r));this.db.prepare('INSERT INTO survival_funded_runs VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,digest=excluded.digest').run(r.id,raw,digest(raw));}
 private station(r:FundedState){return r.rewards.events.reduce((n,e)=>n+e.amountWhole,0)-r.baseStation;}
 private hooks(r:Live){return {reserve:(_m:Mission)=>r.accepted.length<2&&tokenUnits(r.economy.bonusWhole+3)<=BigInt(r.allocation.bonusReserve),update:(_m:Mission)=>{}};}
 private masks(r:FundedState){let successMask=0,failureMask=0,abortMask=0;for(const a of r.accepted){const m=r.mission.current?.id===a.mission?r.mission.current:r.mission.history.find(m=>m.id===a.mission);if(m?.status==='SUCCEEDED')successMask|=1<<a.index;else if(m?.status==='FAILED')failureMask|=1<<a.index;else if(m?.status==='ABORTED')abortMask|=1<<a.index;else throw Error('Accepted mission is unresolved');}return {successMask,failureMask,abortMask};}
 private verifyEconomy(r:FundedState){availableRunWhole(r.economy,this.station(r));if(r.economy.depositWhole!==depositWhole(BigInt(r.allocation.deposit))||tokenUnits(this.station(r))>BigInt(r.allocation.stationReserve)||tokenUnits(r.economy.bonusWhole)>BigInt(r.allocation.bonusReserve)||new Set(r.accepted.map(a=>a.index)).size!==r.accepted.length||r.accepted.length>2)throw Error('Funded accounting mismatch');}
 private live(id:string,player:string){const r=this.runs.get(hashId(id));if(!r||r.player.toLowerCase()!==player.toLowerCase())throw Error('Recorded wallet login required');return r;}
 private ready(){if(this.invalid.size||!this.worker.health().fundedEntry||this.now()-this.checkedAt>5000||this.stopped)throw Error('Funded entry unavailable; worker, chain or gas health inadequate');}
 async entry(player:string,deposit:number,carryCap:number){
  this.ready();if(![deposit,carryCap].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=100))throw Error('Allocation and carry must be whole units from zero through one hundred');
  await this.transport.verify();const c=this.transport.contract;
  const gas=await this.transport.gas(),active=[...this.runs.values()].filter(r=>['active','closing','recovery'].includes(r.phase)).length;
  const awaiting=Number(this.db.prepare("SELECT count(*) AS n FROM survival_funded_entries e WHERE CAST(json_extract(e.entry,'$.expiry') AS INTEGER)>? AND NOT EXISTS(SELECT 1 FROM survival_funded_runs r WHERE r.id=e.run)").get(this.chainNow)!.n);
  if(gas.balance<BigInt(active+awaiting+1)*2000000n*gas.price)throw Error('Free test gas cannot back another settlement obligation');
  if(await c.activeRun(player)!==ZeroHash)throw Error('Wallet already has an active funded run');
  if(Number(this.db.prepare('SELECT count(*) AS n FROM survival_funded_entries WHERE player=? AND CAST(json_extract(entry,\'$.expiry\') AS INTEGER)>?').get(player.toLowerCase(),this.chainNow)!.n)>=2)throw Error('Outstanding entry limit');
  const treasury=new Contract(this.transport.manifest.treasury,['function freeCapacity() view returns(uint256)'],this.transport.provider);
  if(await treasury.freeCapacity()<tokenUnits(30)||await c.walletRemaining(player)<tokenUnits(30))throw Error('Reward backing unavailable; choose free practice');
  const e:SurvivalEntry={runId:'0x'+randomBytes(32).toString('hex'),player,currency:this.transport.manifest.token,rulesHash:survivalRulesHash(R),segment:1n,sequence:0n,deposit:tokenUnits(deposit),stationReserve:tokenUnits(24),bonusReserve:tokenUnits(6),carryCap:tokenUnits(carryCap),nonce:await c.entryNonce(player),expiry:BigInt(this.chainNow+120)};
  this.db.prepare('INSERT INTO survival_funded_entries VALUES(?,?,?)').run(e.runId,player.toLowerCase(),json(e));
  const signature=await this.gameplay.signTypedData(survivalVaultDomain(this.transport.chain,this.transport.vault),survivalEntryTypes,e);return {entry:e,signature};
 }
 async activate(runId:string,player:string){
  this.ready();const old=this.runs.get(runId);if(old){this.live(runId,player);return this.status(runId,player);}
  if(this.runs.size>=64)throw Error('Local funded run limit');
  if(this.db.prepare('SELECT 1 FROM survival_funded_activations WHERE run=?').get(runId))throw Error('Previously activated run has no provable checkpoint; use independent timeout recovery');
  const issued=this.db.prepare('SELECT entry,player FROM survival_funded_entries WHERE run=?').get(hashId(runId));if(!issued||issued.player!==player.toLowerCase())throw Error('Server issued allocation required');
  await this.transport.verify();const chain=await this.transport.contract.run(runId),e=JSON.parse(String(issued.entry));
  if(!chain.active||chain.player.toLowerCase()!==player.toLowerCase()||chain.segment!==1n||chain.sequence!==0n||String(chain.deposit)!==e.deposit||String(chain.stationReserve)!==e.stationReserve||String(chain.bonusReserve)!==e.bonusReserve||chain.accepted!==0n||this.chainNow>=Number(chain.deadline)-60)throw Error('Confirmed fresh allocation required');
  const game=createStationPractice(),r:Live={id:runId,player,rulesHash:survivalRulesHash(R),allocation:this.allocation(chain),game,director:createDirector(runId,R.director!),rewards:createRewardState(game),field:createFieldState(R),economy:{...createRunEconomy(),depositWhole:whole(chain.deposit)},mission:createMissionState(R,Number(chain.activatedAt)),lifecycle:createLifecycleState(),accepted:[],baseStation:0,baseTick:game.tick,order:0,paused:true,phase:'active',job:null,pendingMission:null,pendingUntil:0,peer:null};
  // Entry receipt must be sufficiently confirmed before the server grants gameplay rights.
  const logs=await this.transport.contract.queryFilter(this.transport.contract.filters.Opened(runId),this.transport.manifest.fromBlock,'latest');
  const receipt=logs.length?await this.transport.receipt(logs[0].transactionHash):null;if(!receipt?.canonical||receipt.status!==1||receipt.confirmations<2)throw Error('Allocation awaiting confirmations');
  this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('INSERT INTO survival_funded_activations VALUES(?)').run(runId);this.save(r);this.db.exec('COMMIT');}catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');throw error;}
  this.runs.set(runId,r);return this.status(runId,player);
 }
 private allocation(c:any):Allocation{return {segment:String(c.segment),sequence:String(c.sequence),deposit:String(c.deposit),stationReserve:String(c.stationReserve),bonusReserve:String(c.bonusReserve),activatedAt:Number(c.activatedAt),deadline:Number(c.deadline)};}
 status(runId:string,player:string){const r=this.live(runId,player);return {...this.config(),run:r.id,phase:r.phase,paused:r.paused,order:r.order,countdown:r.game.countdown,events:r.game.events.filter(e=>(!e.from||visible(r.game,0,e.from))&&(!e.to||visible(r.game,0,e.to))).map(e=>e.kind==='StationCapturedV2'?{...e,text:'Station captured. Funded earnings remain provisional until confirmed settlement.'}:e),observation:observe(r.game,0),fieldAllowance:r.field,mission:r.mission,accounting:{...r.economy,stationWhole:this.station(r),availableWhole:availableRunWhole(r.economy,this.station(r)),asset:'RUN_TWIF',mode:this.transport.mode,walletClaimable:null},allocation:r.allocation,settlement:r.job?this.jobs.status(r.job):null,lifecycle:r.lifecycle};}
 attach(runId:string,player:string,peer:Peer){const r=this.live(runId,player);if(r.peer)throw Error('Run already has a connection');r.peer=peer;if(r.phase==='active'){r.lifecycle.disconnectedAt=null;r.paused=true;this.save(r);}peer.send(json(this.status(runId,player)));return ()=>{if(r.peer!==peer)return;r.peer=null;if(r.phase==='active'){r.paused=true;r.lifecycle.disconnectedAt??=this.now();cancelExtraction(r.lifecycle,'Connection closed. Sixty wall seconds departure grace');this.save(r);}};}
 pause(runId:string,player:string,paused:boolean){const r=this.live(runId,player);if(r.phase!=='active'||r.pendingMission)throw Error('Allocation is closing or awaiting explicit mission receipt');r.paused=paused;this.save(r);return this.status(runId,player);}
 action(runId:string,player:string,orderId:string,request:{kind:'command';action:Action}|{kind:'supply'|'field';item:string}|{kind:'extraction';decision:'START'|'CANCEL'}|{kind:'decline';missionId:string}|{kind:'fieldLoot';lootId:number}){
  const r=this.live(runId,player);if(!/^[a-zA-Z0-9:_.-]{1,96}$/.test(orderId))throw Error('Invalid order ID');const payload=json(request),old=this.db.prepare('SELECT payload,ack FROM survival_funded_commands WHERE run=? AND id=?').get(runId,orderId);if(old){if(old.payload!==payload)throw Error('Changed order replay');return JSON.parse(String(old.ack));}
  if(r.phase!=='active'||r.pendingMission||r.paused||!r.peer||this.now()-this.checkedAt>5000)throw Error('Run is paused, offline, closing or awaiting chain health');
  if(request.kind==='command'){const p=parseClient(json({op:'command',id:orderId,action:request.action}));if(p.op!=='command'||!['move','drive','fire','reload','switchWeapon','surrender'].includes(p.action.kind)||p.action.kind!=='surrender'&&(!('squadId' in p.action)||p.action.squadId!==r.game.hero?.squadId))throw Error('Only starter squad controls allowed');}
  if(request.kind==='supply'&&!['AMMO','SHIELD','RECRUIT'].includes(request.item)||request.kind==='field'&&!['BASIC_AMMO','BASIC_MEDICAL'].includes(request.item))throw Error('Unsupported supply');
  if(request.kind==='fieldLoot'&&(!Number.isSafeInteger(request.lootId)||request.lootId<1))throw Error('Valid loot ID required');
  const saved=structuredClone(this.saved(r));this.db.exec('BEGIN IMMEDIATE');
  try{
   const drop=request.kind==='fieldLoot'?r.game.loot.find(l=>l.id===request.lootId):undefined;
   const result=request.kind==='command'?command(r.game,{...request.action,id:orderId,side:0}):request.kind==='supply'?runSupply(r.game,r.economy,this.station(r),R,request.item as 'AMMO','RUN_TWIF'):request.kind==='field'?fieldSupport(r.game,r.field,R,request.item as 'BASIC_AMMO','FIELD_CREDITS'):request.kind==='fieldLoot'?takeFieldAmmo(r.game,r.field,R,request.lootId):request.kind==='extraction'?extractionOrder(r.game,r.lifecycle,R,r.mission,request.decision):decideMission(r.game,r.director,r.economy,this.station(r),r.mission,R,(request as {missionId:string}).missionId,'DECLINE',this.chainNow,this.hooks(r));
   if(result.ok&&drop)collectProvisionalLoot(r.lifecycle,R,drop.id,drop.weapon);
   if(result.ok&&request.kind==='command'&&['move','drive'].includes(request.action.kind))cancelExtraction(r.lifecycle,'Extraction canceled by movement');
   this.resolve(r);r.order++;const ack={...result,id:orderId,order:r.order};this.db.prepare('INSERT INTO survival_funded_commands VALUES(?,?,?,?)').run(runId,orderId,payload,json(ack));this.closeIfDue(r);this.save(r);this.db.exec('COMMIT');return ack;
  }catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');Object.assign(r,saved);r.paused=true;r.phase='recovery';this.invalid.add(r.id);throw error;}
 }
 async missionPermit(runId:string,player:string){
  const r=this.live(runId,player);this.ready();if(r.phase!=='active'||r.pendingMission||r.accepted.length>=2)throw Error('Mission consent unavailable');
  const m=r.mission.current;if(!m||m.status!=='OFFER')throw Error('Available offer required');
  const check=decideMission(structuredClone(r.game),structuredClone(r.director),structuredClone(r.economy),this.station(r),structuredClone(r.mission),R,m.id,'ACCEPT',this.chainNow,{reserve:()=>true,update:()=>{}});if(!check.ok)throw Error(check.reason);
  const c=await this.transport.contract.run(runId);if(!c.active||String(c.segment)!==r.allocation.segment||Number(c.accepted)!==r.accepted.length||this.chainNow-Number(c.activatedAt)<90||Number(c.deadline)-this.chainNow<=390)throw Error('Chain mission envelope unavailable');
  const permit:SurvivalMissionPermit={runId,missionId:id(m.id),player,currency:this.transport.manifest.token,rulesHash:r.rulesHash,segment:BigInt(r.allocation.segment),sequence:BigInt(r.allocation.sequence),stationEarned:tokenUnits(this.station(r)),spent:tokenUnits(r.economy.spentWhole),...this.masks(r),expiry:BigInt(Math.min(Number(c.activatedAt)+540,this.chainNow+60))};
  r.paused=true;r.pendingMission=m.id;r.pendingUntil=Number(permit.expiry);this.save(r);return {permit,signature:await this.gameplay.signTypedData(survivalVaultDomain(this.transport.chain,this.transport.vault),survivalMissionTypes,permit)};
 }
 async missionReceipt(runId:string,player:string,hash:string){
  const r=this.live(runId,player),mission=r.pendingMission;if(!mission)throw Error('No pending mission consent');hashId(hash);
  const receipt=await this.transport.provider.getTransactionReceipt(hash),confirmation=await this.transport.receipt(hash);
  if(!receipt||receipt.to?.toLowerCase()!==this.transport.vault.toLowerCase()||receipt.from.toLowerCase()!==player.toLowerCase()||!confirmation?.canonical||confirmation.status!==1||confirmation.confirmations<2)throw Error('Confirmed player consent receipt required');
  const accepted=receipt.logs.filter(l=>l.address.toLowerCase()===this.transport.vault.toLowerCase()).map(l=>{try{return this.transport.iface.parseLog(l);}catch{return null;}}).find(l=>l?.name==='MissionAccepted'&&l.args.runId===runId&&l.args.missionId===id(mission)&&String(l.args.segment)===r.allocation.segment&&Number(l.args.index)===r.accepted.length);
  if(!accepted)throw Error('Receipt does not consent to this mission');
  const saved=structuredClone(this.saved(r));this.db.exec('BEGIN IMMEDIATE');try{
   r.accepted.push({mission,index:Number(accepted.args.index),hash});
   const decision=decideMission(r.game,r.director,r.economy,this.station(r),r.mission,R,mission,'ACCEPT',this.chainNow,this.hooks(r));
   if(!decision.ok){if(r.mission.current?.id!==mission)throw Error('Mission checkpoint mismatch');r.mission.current.status='ABORTED';r.mission.current.reason='Confirmed consent arrived after feasible offer; no stake charged';r.mission.history.push(structuredClone(r.mission.current));}
   r.pendingMission=null;this.verifyEconomy(r);this.save(r);this.db.exec('COMMIT');return this.status(runId,player);
  }catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');Object.assign(r,saved);throw error;}
 }
 private resolve(r:Live){tickMission(r.game,r.director,r.economy,this.station(r),r.mission,R,this.chainNow,this.hooks(r));tickLifecycle(r.game,r.lifecycle,R,r.economy,this.station(r),this.now());this.verifyEconomy(r);}
 private closeIfDue(r:Live,serviceAbort=false){
  if(r.phase!=='active')return;
  const reason=serviceAbort?'service-abort':segmentCloseReason({activeTicks:r.game.tick-r.baseTick,chainNow:this.chainNow,activatedAt:r.allocation.activatedAt,terminal:r.lifecycle.terminal?.outcome==='EXTRACTED'?'extraction':r.lifecycle.terminal?'death':null,disconnectedAt:r.lifecycle.disconnectedAt===null?null:Math.floor(r.lifecycle.disconnectedAt/1000),wallNow:Math.floor(this.now()/1000)},R);
  if(!reason)return;if(reason==='timeout-recovery'){r.phase='recovery';r.paused=true;return;}
  if(r.pendingMission)return; // Reconcile a potentially mined consent before authorizing any result.
  if(reason==='disconnect'&&!r.game.result){r.game.result={winner:1,reason:'DISCONNECT'};this.resolve(r);}
  if(!r.lifecycle.terminal)abortMission(r.mission,r.economy,this.hooks(r),'Economic checkpoint: accepted stake unlocked');
  const outcome=serviceAbort?4:r.lifecycle.terminal?.outcome==='EXTRACTED'?2:r.lifecycle.terminal?.outcome==='DEATH'?1:r.lifecycle.terminal?3:0;
  r.paused=true;r.phase='closing';
  const result:SurvivalResult={runId:r.id,player:r.player,currency:this.transport.manifest.token,rulesHash:r.rulesHash,segment:BigInt(r.allocation.segment),sequence:BigInt(r.allocation.sequence),deposit:BigInt(r.allocation.deposit),stationEarned:serviceAbort?0n:tokenUnits(this.station(r)),bonusEarned:serviceAbort?0n:tokenUnits(r.economy.bonusWhole),spent:serviceAbort?0n:tokenUnits(r.economy.spentWhole),failedStake:serviceAbort?0n:tokenUnits(r.economy.failedWhole),...this.masks(r),outcome,resultHash:ZeroHash,expiry:BigInt(r.allocation.deadline),nextStationReserve:outcome===0?tokenUnits(24):0n,nextBonusReserve:outcome===0?tokenUnits(6):0n};
  if(serviceAbort){result.successMask=0;result.failureMask=0;result.abortMask=(1<<r.accepted.length)-1;}
  result.resultHash=keccak256(toUtf8Bytes(json({...this.saved(r),job:null})));
  // Job key is deterministic; include it in the gameplay snapshot before storing both in one SQLite transaction.
  r.job=[this.transport.chain,this.transport.vault.toLowerCase(),r.id.toLowerCase(),result.segment,result.sequence].join(':');
  this.jobs.prepare(this.transport.chain,this.transport.vault,result,this.saved(r));
 }
 tick(){
  if(this.stopped||!this.checkedAt||this.now()-this.checkedAt>5000)return;
  for(const r of this.runs.values())if(r.phase==='active'){
   const saved=structuredClone(this.saved(r));this.db.exec('BEGIN IMMEDIATE');try{
    if(r.peer&&!r.paused&&!r.pendingMission){const before=r.game.tick;stepStationPractice(r.game,R);if(r.game.tick!==before){stepDirector(r.game,r.director,R);const budget={remainingWhole:whole(BigInt(r.allocation.stationReserve))-this.station(r)};stationRewards(r.game,r.director,r.rewards,R,budget,e=>this.db.prepare('INSERT INTO survival_funded_rewards VALUES(?,?,?)').run(rewardKey(e),r.id,json(e)));}}
    this.resolve(r);this.closeIfDue(r);this.save(r);this.db.exec('COMMIT');
   }catch{if(this.db.isTransaction)this.db.exec('ROLLBACK');Object.assign(r,saved);r.paused=true;r.phase='recovery';this.invalid.add(r.id);}
   if(r.peer&&(r.game.tick%2===0||r.phase!=='active'))try{r.peer.send(json(this.status(r.id,r.player)));}catch{r.peer=null;r.paused=true;r.lifecycle.disconnectedAt??=this.now();this.save(r);}
  }
 }
 async poll(){
  if(this.polling||this.stopped)return;this.polling=true;
  try{
   if(!await this.worker.poll())return;this.chainNow=Number(await this.transport.chainNow());this.checkedAt=this.now();
   for(const r of this.runs.values()){
    if(this.jobs.runNeedsRecovery(r.id)&&r.phase!=='recovery'){r.phase='recovery';r.paused=true;this.save(r);}
    if(r.phase==='active'&&r.pendingMission){
     const logs=await this.transport.contract.queryFilter(this.transport.contract.filters.MissionAccepted(r.id,id(r.pendingMission)),this.transport.manifest.fromBlock,'latest');
     if(logs.length){const receipt=await this.transport.receipt(logs[0].transactionHash);if(receipt?.canonical&&receipt.status===1&&receipt.confirmations>=2)await this.missionReceipt(r.id,r.player,logs[0].transactionHash);}
     else if(this.chainNow>=r.pendingUntil+30){const c=await this.transport.contract.run(r.id);if(Number(c.accepted)===r.accepted.length){r.pendingMission=null;r.pendingUntil=0;this.save(r);}}
    }
    if(r.phase==='active'){
     const c=await this.transport.contract.run(r.id);
     if(!c.active||String(c.segment)!==r.allocation.segment||String(c.sequence)!==r.allocation.sequence||c.player.toLowerCase()!==r.player.toLowerCase()){r.phase='recovery';r.paused=true;this.save(r);continue;}
     if(c.deposit>BigInt(r.allocation.deposit)){r.allocation.deposit=String(c.deposit);r.economy.depositWhole=depositWhole(c.deposit);this.verifyEconomy(r);this.save(r);}
    }
    if(r.phase==='active'&&this.interrupted.has(r.id)&&!r.pendingMission){
     const saved=structuredClone(this.saved(r));this.db.exec('BEGIN IMMEDIATE');try{this.closeIfDue(r,true);this.save(r);this.db.exec('COMMIT');this.interrupted.delete(r.id);}catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');Object.assign(r,saved);throw error;}
    }
    if(r.phase==='closing'&&r.job&&this.jobs.get(r.job)?.state==='settled'){
     const c=await this.transport.contract.run(r.id);
     if(c.active&&BigInt(c.segment)===BigInt(r.allocation.segment)+1n){
      const shieldAt=r.economy.shieldAt,recruitAt=r.economy.recruitAt;
      r.allocation=this.allocation(c);r.baseStation=r.rewards.events.reduce((n,e)=>n+e.amountWhole,0);r.baseTick=r.game.tick;r.economy={...createRunEconomy(),depositWhole:depositWhole(c.deposit),shieldAt,recruitAt};r.accepted=[];r.mission.wallStart=Number(c.activatedAt);r.phase='active';r.job=null;r.paused=true;
     }else{r.phase=r.lifecycle.terminal||c.ended?'ended':'banked';}
     this.save(r);
    }
   }
  }catch{/* Chain reads fail closed. Health comes from the worker; stale clocks freeze commands and ticks. */}finally{this.polling=false;}
 }
 close(){this.stopped=true;for(const r of this.runs.values()){r.peer=null;if(r.phase==='active'){r.paused=true;r.lifecycle.disconnectedAt??=this.now();this.save(r);}}}
}
