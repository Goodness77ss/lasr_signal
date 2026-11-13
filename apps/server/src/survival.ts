import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { command, observe, visible, LIFECYCLE_SURVIVAL_RULES, SURVIVAL_PROTOCOL, pinSurvivalRules, type Game, type SurvivalRules } from '@last-signal/sim';
import { createStationPractice, stepStationPractice, stationFeedback } from '../../../packages/sim/src/survival.ts';
import {createDirector,stepDirector,directorStatus,type Director} from '../../../packages/sim/src/assault-director.ts';
import { survivalRulesHash } from '@last-signal/chain';
import { parseClient, MAX_BYTES,type Action } from '@last-signal/protocol';
import type { Peer } from './rooms.ts';
import {createRewardState,stationRewards,type RewardState} from '../../../packages/sim/src/station-rewards.ts';
import {StationRewardStore} from './station-reward-store.ts';
import {createFieldState,fieldSupport,takeFieldAmmo,type FieldState} from '../../../packages/sim/src/field-support.ts';
import {createRunEconomy,availableRunWhole,forfeitPracticeRewards,runSupply,type RunEconomy} from '../../../packages/sim/src/run-economy.ts';
import {SupplyOrders} from './supply-orders.ts';
import {createMissionState,tickMission,decideMission,abortMission,type MissionState} from '../../../packages/sim/src/missions.ts';
import {MissionReservations} from './mission-reservations.ts';
import {createLifecycleState,extractionOrder,cancelExtraction,collectProvisionalLoot,departureDue,tickLifecycle,verifyLifecycle,type LifecycleState} from '../../../packages/sim/src/run-lifecycle.ts';

type Saved = { id:string; tokenHash:string; rules:SurvivalRules; rulesHash:string; protocol:string; game:Game; paused:boolean; order:number; director?:Director; rewards?:RewardState; rewardScope?:string;field?:FieldState;economy?:RunEconomy;mission?:MissionState;lifecycle?:LifecycleState };
type Run = Saved & { peer:Peer|null };
const digest = (s:string) => createHash('sha256').update(s).digest('hex');
export class SurvivalPractice {
  private runs = new Map<string,Run>();
  private connections = 0;
  private profiles=new WeakMap<Run,{costs:number[];bytes:number[]}>();
  private readonly currentHash:string;
  private rewardStore:StationRewardStore|null=null;
  private supplyOrders:SupplyOrders|null=null;
  private missions:MissionReservations|null=null;
  private stopping=false;
  readonly rules: SurvivalRules;
  constructor(private db:DatabaseSync, readonly enabled:boolean,private now:()=>number=Date.now,rules:SurvivalRules=LIFECYCLE_SURVIVAL_RULES) {
    this.rules = pinSurvivalRules(rules);
    if(this.rules.flags.runVault)throw Error('Funded rules require the funded run service, not simulated practice');
    this.currentHash=survivalRulesHash(this.rules);
    if (!enabled) return;
    db.exec('CREATE TABLE IF NOT EXISTS survival_practice_runs(id TEXT PRIMARY KEY,state TEXT NOT NULL,digest TEXT NOT NULL); CREATE TABLE IF NOT EXISTS survival_practice_commands(run TEXT,id TEXT,payload TEXT,ack TEXT,PRIMARY KEY(run,id));');
    this.rewardStore=new StationRewardStore(db,now);
    this.supplyOrders=new SupplyOrders(db);
    this.missions=new MissionReservations(db,this.rewardStore,now);
    for (const row of db.prepare('SELECT * FROM survival_practice_runs').all()) {
      try {
        const raw=String(row.state), saved=JSON.parse(raw) as Saved;
        if (digest(raw)!==row.digest || saved.id!==row.id || saved.protocol!==SURVIVAL_PROTOCOL || saved.rulesHash!==survivalRulesHash(saved.rules) || !saved.rules.flags.stations || saved.rules.flags.runVault) throw Error('Invalid checkpoint');
        const count=db.prepare('SELECT count(*) AS n FROM survival_practice_commands WHERE run=?').get(saved.id)!;
        if (Number(count.n)!==saved.order) throw Error('Incomplete command journal');
        if(saved.rules.director&&(!saved.director||saved.director.run!==saved.id||!Number.isSafeInteger(saved.director.sequence)||!Array.isArray(saved.director.assaults)))throw Error('Incomplete assault checkpoint');
        if(!saved.rules.director&&saved.director)throw Error('Unexpected director in legacy run');
        if(saved.rules.flags.rewards){
          if(!['survival-2.2.0','survival-2.3.0','survival-2.4.0','survival-2.5.0','survival-2.6.0'].includes(saved.rules.version)||!saved.rewards||!saved.rewardScope||saved.rewards.lastTick!==saved.game.tick)throw Error('Incomplete reward checkpoint');
          this.rewardStore.verify(saved.id,saved.rewardScope,saved.rewards);
        }else if(saved.rewards||saved.rewardScope)throw Error('Unexpected legacy reward state');
        if(saved.rules.field){if(!saved.field||!Number.isSafeInteger(saved.field.credits)||saved.field.credits<0||saved.field.credits>saved.rules.economy.fieldCredits||saved.field.medicalUsed>saved.rules.field.medicalUses||saved.field.picked.length>saved.rules.field.dropLimit)throw Error('Invalid field checkpoint');}
        else if(saved.field)throw Error('Unexpected legacy allowance');
        if(saved.rules.supplies){if(!saved.economy||!saved.field||!saved.rewards)throw Error('Missing run economy');availableRunWhole(saved.economy,saved.rewards.events.reduce((n,e)=>n+e.amountWhole,0));this.supplyOrders.verify(saved.id,saved.economy,saved.field,saved.rules.economy.fieldCredits);}
        else if(saved.economy)throw Error('Unexpected legacy run economy');
        if(saved.rules.flags.missions){if(!saved.mission||!saved.economy||!saved.rewardScope)throw Error('Missing mission checkpoint');this.missions.verify(saved.id,saved.rewardScope,saved.economy,saved.mission);}
        else if(saved.mission)throw Error('Unexpected legacy mission');
        if(saved.rules.lifecycle){if(!saved.lifecycle||!saved.economy)throw Error('Missing lifecycle checkpoint');verifyLifecycle(saved.lifecycle,saved.game,saved.rules,saved.economy,this.stationTotal(saved));}
        else if(saved.lifecycle)throw Error('Unexpected legacy lifecycle');
        const recovered:Run={...saved,rules:pinSurvivalRules(saved.rules),paused:true,peer:null};
        if(recovered.lifecycle&&!recovered.game.result)this.servicePause(recovered,'Service restart verified. Extraction canceled and mission stake unlocked. Reconnect preserves gameplay and validated earnings');
        this.runs.set(saved.id,recovered);
      } catch { if(db.isTransaction)db.exec('ROLLBACK');/* Unprovable practice checkpoints cannot resume. */ }
    }
  }
  config() { return { enabled:this.enabled, mode:'SERVER_PRACTICE_V2', protocol:SURVIVAL_PROTOCOL, rulesHash:this.currentHash, rulesVersion:this.rules.version, director:!!this.rules.director, simulatedRewards:true, rewards:false, settlementWorker:false }; }
  private save(r:Run) {
    const {peer:_,...saved}=r, raw=JSON.stringify(saved);
    this.db.prepare('INSERT OR REPLACE INTO survival_practice_runs VALUES(?,?,?)').run(r.id,raw,digest(raw));
  }
  private snapshot(r:Run) {
    const observation=observe(r.game,0);
    // Transport only observed enemy positions and no private enemy intent.
    for (const s of observation.squads) if(s.side===1) { s.route=[]; delete s.drive; delete s.rifleAim; delete s.focusId; s.ammo=0;s.reserveAmmo=0; }
    const events=r.game.events.filter(e=>(!e.from||visible(r.game,0,e.from))&&(!e.to||visible(r.game,0,e.to))).map(e=>({...e,from:e.from?{x:e.from.x,z:e.from.z}:undefined,to:e.to?{x:e.to.x,z:e.to.z}:undefined}));
    const profile=this.profile(r),sorted=[...profile.costs].sort((a,b)=>a-b);
    const tickProfile={samples:sorted.length,p95Ms:sorted[Math.floor(sorted.length*.95)]??null,peakMs:sorted.at(-1)??null,meanMs:sorted.length?sorted.reduce((a,b)=>a+b,0)/sorted.length:null,meanSnapshotBytes:profile.bytes.length?profile.bytes.reduce((a,b)=>a+b,0)/profile.bytes.length:0};
    const rewards=r.rewards?{mode:'SIMULATED_ONLY',scopeKind:r.rewardScope?.startsWith('wallet:')?'authenticated wallet':'anonymous practice identity',cycle:r.rewards.cycle,maxCycles:r.rules.station.cycles,totalWhole:r.rewards.events.reduce((n,e)=>n+e.amountWhole,0),runCapWhole:r.rules.station.runCap,rollingRemainingWhole:this.rewardStore!.remaining(r.rewardScope!,r.rules),events:r.rewards.events.slice(-8),stations:r.game.relays.map(s=>({id:s.id,reason:r.rewards!.reasons[s.id]??'Capture or defeat a real station assault. No passive rewards',capture:r.rewards!.events.some(e=>e.cycle===r.rewards!.cycle&&e.station===s.id&&e.kind==='CAPTURE'),defense:r.rewards!.events.some(e=>e.cycle===r.rewards!.cycle&&e.station===s.id&&e.kind==='DEFENSE')}))}:null;
    const accounting=r.economy?{...r.economy,stationWhole:rewards!.totalWhole,availableWhole:availableRunWhole(r.economy,rewards!.totalWhole),asset:'RUN_TWIF',mode:'SIMULATED_ONLY',orders:this.supplyOrders!.recent(r.id),walletClaimableWhole:null}:null;
    return { op:'snapshot', ...this.config(),lifecycle:r.lifecycle?{...r.lifecycle,bank:r.rules.lifecycle,extractionSeconds:r.rules.extractionSeconds,disconnectGraceSeconds:r.rules.clock.disconnectGraceSeconds,mode:'SIMULATED_ONLY'}:null,mission:r.mission?{...r.mission,mode:'SIMULATED_ONLY'}:null,accounting,fieldAllowance:r.field?{...r.field,asset:'FIELD_CREDITS',starter:{name:'Service rifle entitlement',tradable:false,minted:false},ammoRounds:r.rules.field!.ammoRounds,ammoCost:r.rules.field!.ammoCost,medicalHp:r.rules.field!.medicalHp,medicalCost:r.rules.field!.medicalCost}:null, simulatedRewards:!!r.rewards,rewardLedger:rewards,rulesHash:r.rulesHash,rulesVersion:r.rules.version,director:!!r.director, pressure:r.director&&r.rules.director?directorStatus(r.game,r.director,r.rules.director):null,tickProfile, run:r.id, paused:r.paused||!r.peer, countdown:r.game.countdown, order:r.order, observation, events, stations:r.game.relays.map(s=>({id:s.id,feedback:stationFeedback(r.game,s,r.rules)})) };
  }
  private profile(r:Run){let profile=this.profiles.get(r);if(!profile){profile={costs:[],bytes:[]};this.profiles.set(r,profile);}return profile;}
  private send(r:Run) { if(r.peer){const raw=JSON.stringify(this.snapshot(r)),p=this.profile(r);p.bytes.push(Buffer.byteLength(raw));if(p.bytes.length>128)p.bytes.shift();r.peer.send(raw);} }
  connect(peer:Peer,identifyWallet?:(session:string)=>string|null) {
    if(this.connections>=32){peer.close(1008);return {receive:(_raw:string)=>{},close:()=>{}};}
    this.connections++;
    let run:Run|null=null;
    let closed=false,window=this.now(),messages=0;
    const send=(m:unknown)=>peer.send(JSON.stringify(m));
    return {
      receive:(raw:string)=>{
        try {
          if(closed)return;
          if(run&&run.peer!==peer)throw Error('Practice connection detached. Reconnect before issuing controls');
          if(this.now()-window>=1000){window=this.now();messages=0;}
          if(++messages>100){peer.close(1008);throw Error('Too many practice commands');}
          if(!this.enabled) throw Error('Station practice is disabled on this service');
          if(Buffer.byteLength(raw)>MAX_BYTES) throw Error('Message too large');
          const m=JSON.parse(raw);
          if(!m || typeof m!=='object' || Array.isArray(m) || m.protocol!==SURVIVAL_PROTOCOL) throw Error('Survival protocol mismatch');
          const expectedHash=run?.rulesHash??(m.op==='resume'&&typeof m.run==='string'?this.runs.get(m.run)?.rulesHash:undefined)??this.config().rulesHash;
          if(m.rulesHash!==expectedHash) throw Error('Survival rules mismatch');
          const exact=(keys:string[])=>{if(Object.keys(m).length!==keys.length || Object.keys(m).some(k=>!keys.includes(k)))throw Error('Unexpected survival fields');};
          if(m.op==='start') {
            const optional=['walletSession','practiceToken'].filter(key=>key in m);exact(['op','protocol','rulesHash',...optional]);
            if(optional.length>1)throw Error('Choose one simulated budget identity');
            if(run) throw Error('A run is already attached');
            if([...this.runs.values()].filter(r=>!r.game.result).length>=16) throw Error('Practice capacity reached');
            const token=randomBytes(32).toString('hex'), id=randomBytes(16).toString('hex');
            let scope:string,practiceToken:string|undefined;
            if('walletSession' in m){if(typeof m.walletSession!=='string')throw Error('Invalid wallet session');const wallet=identifyWallet?.(m.walletSession);if(!wallet||!/^0x[0-9a-fA-F]{40}$/.test(wallet))throw Error('Valid existing wallet login required for wallet simulation cap');scope='wallet:'+wallet.toLowerCase();}
            else{const identity=this.rewardStore!.identity(m.practiceToken);scope=identity.scope;practiceToken=identity.token;}
            const game=createStationPractice();
            run={id,tokenHash:digest(token),rules:this.rules,rulesHash:expectedHash,protocol:SURVIVAL_PROTOCOL,game,director:createDirector(id,this.rules.director!),rewards:createRewardState(game),rewardScope:scope,field:createFieldState(this.rules),economy:createRunEconomy(),mission:createMissionState(this.rules,Math.floor(this.now()/1000)),lifecycle:this.rules.lifecycle?createLifecycleState():undefined,paused:false,order:0,peer};
            this.save(run);this.runs.set(id,run);send({op:'session',run:id,token,practiceToken,protocol:SURVIVAL_PROTOCOL,rulesHash:expectedHash});this.send(run);return;
          }
          if(m.op==='resume') {
            exact(['op','protocol','rulesHash','run','token']);
            if(run || typeof m.run!=='string' || typeof m.token!=='string' || !/^[a-f0-9]{64}$/.test(m.token)) throw Error('Invalid practice credential');
            const found=this.runs.get(m.run);
            if(!found || found.rulesHash!==m.rulesHash || !timingSafeEqual(Buffer.from(found.tokenHash),Buffer.from(digest(m.token)))) throw Error('Invalid practice credential');
            if(found.peer) throw Error('Practice run is open in another connection');
            if(found.lifecycle&&departureDue(found.lifecycle,found.rules,this.now()))this.resolveDeparture(found);run=found;run.peer=peer;run.paused=true;if(run.lifecycle)run.lifecycle.disconnectedAt=null;this.save(run);this.send(run);return;
          }
          if(!run) throw Error('Start or resume a practice run');
          if(m.op==='ping'){exact(['op','protocol','rulesHash']);return;}
          if(m.op==='pause') { exact(['op','protocol','rulesHash','paused']);if(typeof m.paused!=='boolean')throw Error('Invalid pause');run.paused=m.paused;this.save(run);this.send(run);return; }
          if(!['command','field','fieldLoot','supply','mission','extraction'].includes(m.op)) throw Error('Only authoritative controls are accepted');
          let action:Action|null=null;
          if(m.op==='command'){exact(['op','protocol','rulesHash','id','action']);const parsed=parseClient(JSON.stringify({op:'command',id:m.id,action:m.action}));if(parsed.op!=='command')throw Error('Invalid command');action=parsed.action;}
          else{
            if(!run.field)throw Error('Field allowance is unavailable under these run rules');
            if(typeof m.id!=='string'||!/^[a-zA-Z0-9:_.-]{1,96}$/.test(m.id))throw Error('Invalid order ID');
            if(m.op==='extraction'){exact(['op','protocol','rulesHash','id','decision']);if(!run.lifecycle||!['START','CANCEL'].includes(m.decision))throw Error('Valid extraction decision required');}
            else if(m.op==='mission'){exact(['op','protocol','rulesHash','id','asset','missionId','decision']);if(!run.mission||m.asset!=='RUN_TWIF'||typeof m.missionId!=='string'||!['ACCEPT','DECLINE'].includes(m.decision))throw Error('Mission requires explicit decision and available run funds, never field credits');}
            else if(m.op==='field'||m.op==='supply'){exact(['op','protocol','rulesHash','id','asset','item']);if(m.op==='field'&&(m.asset!=='FIELD_CREDITS'||!['BASIC_AMMO','BASIC_MEDICAL'].includes(m.item)))throw Error('Field credits only buy basic support, never stakes, NFTs or listings');if(m.op==='supply'&&(!run.economy||m.asset!=='RUN_TWIF'||!['AMMO','SHIELD','RECRUIT'].includes(m.item)))throw Error('Supported run supply and RUN_TWIF required. No wallet receipt path');}
            else{exact(['op','protocol','rulesHash','id','lootId']);if(!Number.isSafeInteger(m.lootId)||m.lootId<1)throw Error('Invalid ammunition drop');}
          }
          const payload=action?JSON.stringify(action):JSON.stringify(m.op==='extraction'?{kind:m.op,decision:m.decision}:m.op==='mission'?{kind:m.op,asset:m.asset,missionId:m.missionId,decision:m.decision}:['field','supply'].includes(m.op)?{kind:m.op,asset:m.asset,item:m.item}:{kind:'fieldLoot',lootId:m.lootId}),old=this.db.prepare('SELECT payload,ack FROM survival_practice_commands WHERE run=? AND id=?').get(run.id,m.id);
          if(old) { if(old.payload!==payload)throw Error('Changed command replay');send(JSON.parse(String(old.ack)));return; }
          if((run.paused&&action?.kind!=='surrender'&&!['field','supply','mission'].includes(m.op))||run.game.result) throw Error('Practice is paused or ended');
          if(action&&(!['move','drive','fire','reload','switchWeapon','surrender'].includes(action.kind) || action.kind!=='surrender' && (!('squadId' in action) || action.squadId!==run.game.hero?.squadId))) throw Error('Only your starter squad controls are allowed');
          const saved=structuredClone({game:run.game,field:run.field,economy:run.economy,mission:run.mission,lifecycle:run.lifecycle}),order=run.order;let ack:object;
          try {
            this.db.exec('BEGIN IMMEDIATE');
            const stationTotal=run.rewards?.events.reduce((n,e)=>n+e.amountWhole,0)??0;
            const drop=m.op==='fieldLoot'?run.game.loot.find(l=>l.id===m.lootId):undefined;
            const result=m.op==='extraction'?extractionOrder(run.game,run.lifecycle!,run.rules,run.mission,m.decision):action?command(run.game,{...action,id:m.id,side:0}):m.op==='mission'?decideMission(run.game,run.director!,run.economy!,stationTotal,run.mission!,run.rules,m.missionId,m.decision,Math.floor(this.now()/1000),this.missionHooks(run)):m.op==='field'?fieldSupport(run.game,run.field!,run.rules,m.item,m.asset):m.op==='supply'?runSupply(run.game,run.economy!,stationTotal,run.rules,m.item,m.asset):takeFieldAmmo(run.game,run.field!,run.rules,m.lootId);run.order++;
            if(result.ok&&run.lifecycle){if(drop)collectProvisionalLoot(run.lifecycle,run.rules,drop.id,drop.weapon);if(action&&['move','drive'].includes(action.kind))cancelExtraction(run.lifecycle,'Extraction canceled by movement order');}
            if(run.mission&&run.game.result)tickMission(run.game,run.director!,run.economy!,stationTotal,run.mission,run.rules,Math.floor(this.now()/1000),this.missionHooks(run));
            if(result.ok&&action?.kind==='surrender'&&run.economy){forfeitPracticeRewards(run.economy,stationTotal);if(run.game.hero)run.game.hero.tokens=0;}
            if(run.lifecycle){tickLifecycle(run.game,run.lifecycle,run.rules,run.economy!,stationTotal,this.now());if(result.ok&&action?.kind==='surrender')run.lifecycle.reason='Round quit. All unclaimed round rewards and recovered loot forfeited. Previously owned guns and wallet funds stay yours.';}
            if(run.economy&&!action&&['field','supply','fieldLoot'].includes(m.op)){const quoted=m.op==='supply'?('quotedWhole' in result?Number(result.quotedWhole):0):m.op==='field'?(m.item==='BASIC_AMMO'?run.rules.field!.ammoCost:run.rules.field!.medicalCost):0;this.supplyOrders!.record(run.id,m.id,m.op==='field'?'FIELD_CREDITS':m.op==='supply'?'RUN_TWIF':'FREE_DROP',m.item??'AMMO_DROP',quoted,result.ok?quoted:0,result.ok,result.reason,run.game.tick);}
            ack={op:'ack',id:m.id,...result,order:run.order};
            this.db.prepare('INSERT INTO survival_practice_commands VALUES(?,?,?,?)').run(run.id,m.id,payload,JSON.stringify(ack));this.save(run);this.db.exec('COMMIT');
          } catch { if(this.db.isTransaction)this.db.exec('ROLLBACK');run.game=saved.game;run.field=saved.field;run.economy=saved.economy;run.mission=saved.mission;run.lifecycle=saved.lifecycle;run.order=order;run.paused=true;throw Error('Practice persistence failed'); }
          try{send(ack);this.send(run);}catch{this.detach(run);}
        } catch(error) { send({op:'error',reason:error instanceof Error?error.message:'Invalid survival request'}); }
      },
      close:()=>{if(closed)return;closed=true;this.connections--;if(run && run.peer===peer)this.detach(run);},
    };
  }
  private missionHooks(r:Run){return this.missions!.hooks(r.id,r.rewardScope!,r.rules);}
  private stationTotal(r:Saved){return r.rewards?.events.reduce((n,e)=>n+e.amountWhole,0)??0;}
  private detach(r:Run){
    r.peer=null;r.paused=true;
    if(r.lifecycle&&!r.game.result&&!this.stopping){r.lifecycle.disconnectedAt??=this.now();cancelExtraction(r.lifecycle,'Connection closed. Extraction canceled. Reconnect within sixty wall seconds or departure resolves as surrender');}
    this.save(r);
  }
  private servicePause(r:Run,reason:string){
    const backup=structuredClone({mission:r.mission,economy:r.economy,lifecycle:r.lifecycle});
    this.db.exec('BEGIN IMMEDIATE');
    try{if(r.mission)abortMission(r.mission,r.economy!,this.missionHooks(r),'Verified service interruption: accepted stake unlocked');r.lifecycle!.channel=null;r.lifecycle!.disconnectedAt=null;r.lifecycle!.reason=reason;r.paused=true;this.save(r);this.db.exec('COMMIT');}
    catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');Object.assign(r,backup);r.paused=true;throw error;}
  }
  private resolveDeparture(r:Run){
    if(r.game.result||!r.lifecycle)return;
    const backup=structuredClone({game:r.game,economy:r.economy,mission:r.mission,lifecycle:r.lifecycle});
    this.db.exec('BEGIN IMMEDIATE');
    try{r.game.result={winner:1,reason:'DISCONNECT'};if(r.mission)tickMission(r.game,r.director!,r.economy!,this.stationTotal(r),r.mission,r.rules,Math.floor(this.now()/1000),this.missionHooks(r));tickLifecycle(r.game,r.lifecycle,r.rules,r.economy!,this.stationTotal(r),this.now());r.paused=true;this.save(r);this.db.exec('COMMIT');}
    catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');Object.assign(r,backup);throw error;}
  }
  tick() {
    if(!this.enabled)return;
    for(const r of this.runs.values()) if(!r.game.result&&(r.peer&&!r.paused||r.lifecycle&&departureDue(r.lifecycle,r.rules,this.now())||r.mission?.current&&['OFFER','ACTIVE'].includes(r.mission.current.status)&&Math.floor(this.now()/1000)-r.mission.wallStart>=r.rules.clock.wallCloseSeconds)){
      const start=performance.now();
      const backup=r.rewards?structuredClone({game:r.game,director:r.director,rewards:r.rewards,economy:r.economy,mission:r.mission,lifecycle:r.lifecycle}):null;
      let transaction=false,completed=false;
      try{
        if(r.rewards){this.db.exec('BEGIN IMMEDIATE');transaction=true;}
        if(r.lifecycle&&departureDue(r.lifecycle,r.rules,this.now()))r.game.result={winner:1,reason:'DISCONNECT'};
        const before=r.game.tick;if(r.peer&&!r.paused)stepStationPractice(r.game,r.rules);
        if(r.director&&r.game.tick!==before)stepDirector(r.game,r.director,r.rules);
        if(r.rewards&&r.director&&r.game.tick!==before){
          const budget={remainingWhole:this.rewardStore!.remaining(r.rewardScope!,r.rules)};
          stationRewards(r.game,r.director,r.rewards,r.rules,budget,event=>this.rewardStore!.commit(r.rewardScope!,event));
        }
        if(r.mission)tickMission(r.game,r.director!,r.economy!,r.rewards!.events.reduce((n,e)=>n+e.amountWhole,0),r.mission,r.rules,Math.floor(this.now()/1000),this.missionHooks(r));
        if(r.lifecycle)tickLifecycle(r.game,r.lifecycle,r.rules,r.economy!,this.stationTotal(r),this.now());
        const transition=r.game.events.some(e=>e.tick===r.game.tick&&['AssaultV2','StationCapturedV2'].includes(e.kind));
        if(r.rewards||r.game.tick%20===0||r.game.result||transition)this.save(r);
        if(r.rewards)this.db.exec('COMMIT');
        transaction=false;completed=true;
      }catch{if(backup){if(transaction&&this.db.isTransaction)this.db.exec('ROLLBACK');r.game=backup.game;r.director=backup.director;r.rewards=backup.rewards;r.economy=backup.economy;r.mission=backup.mission;r.lifecycle=backup.lifecycle;}r.paused=true;try{r.peer?.send(JSON.stringify({op:'error',reason:'Practice persistence or simulation failed. Run paused; no reward can be authorized.'}));}catch{r.peer=null;}}
      if(completed&&(r.game.tick%2===0||r.game.result||r.paused))try{this.send(r);}catch{this.detach(r);}
      const p=this.profile(r);p.costs.push(performance.now()-start);if(p.costs.length>256)p.costs.shift();
    }
  }
  close() { this.stopping=true;for(const r of this.runs.values()){if(r.lifecycle&&!r.game.result)this.servicePause(r,'Known service shutdown. Mission stake unlocked; extraction canceled');else{r.paused=true;this.save(r);}r.peer=null;} }
}
