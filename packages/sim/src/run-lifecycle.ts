import {distance,lineOfSight,type Game,type Point,type Weapon} from './index.ts';
import type {SurvivalRules} from './survival-rules.ts';
import type {MissionState} from './missions.ts';
import {availableRunWhole,type RunEconomy} from './run-economy.ts';

export type RunOutcome='EXTRACTED'|'DEATH'|'SURRENDER'|'DISCONNECT';
export type LifecycleState={channel:null|{tick:number;origin:Point;lastHit:number};disconnectedAt:number|null;reason:string;loot:{id:number;weapon:Weapon;status:'UNEXTRACTED'|'EXTRACTED'|'LOST'}[];terminal:null|{outcome:RunOutcome;tick:number;at:number;simulatedBankCreditWhole:number}};
export const createLifecycleState=():LifecycleState=>({channel:null,disconnectedAt:null,reason:'Fallback extraction at the western bank. Eight safe active seconds. New loot is lost on death or departure. Previously owned NFTs remain owned.',loot:[],terminal:null});
const heroOf=(g:Game)=>g.squads.find(s=>s.id===g.hero?.squadId&&s.hp>0);
function blocked(g:Game,r:SurvivalRules){const hero=heroOf(g);return !hero||g.squads.some(s=>s.side===1&&s.hp>0&&distance(s,hero)<=r.lifecycle!.contestRadius&&lineOfSight(s,hero));}
export function extractionOrder(g:Game,state:LifecycleState,r:SurvivalRules,mission:MissionState|undefined,decision:'START'|'CANCEL'){
 if(!r.lifecycle||g.result||!g.hero?.alive||g.countdown>0)return {ok:false,reason:'Living active extraction run required'};
 if(decision==='CANCEL'){state.channel=null;state.reason='Extraction canceled. Nothing charged';return {ok:true,reason:state.reason};}
 if(state.channel)return {ok:false,reason:'Extraction already channeling'};
 const hero=heroOf(g),bank={x:r.lifecycle.bankX,z:r.lifecycle.bankZ};
 if(!hero||distance(hero,bank)>r.lifecycle.bankRadius)return {ok:false,reason:'Reach the western extraction bank within two metres'};
 if(mission?.current?.status==='ACTIVE')return {ok:false,reason:'Resolve the accepted mission before extracting. Surrender fails its stake'};
 if(hero.route.length||hero.drive&&g.tick<(hero.driveUntil??0))return {ok:false,reason:'Stop moving before starting extraction'};
 if(blocked(g,r))return {ok:false,reason:'Extraction contested by a nearby hostile'};
 state.channel={tick:g.tick,origin:{x:hero.x,z:hero.z},lastHit:hero.lastHit};state.reason='Extracting. Remain still for eight active seconds without damage or contest';return {ok:true,reason:state.reason};
}
export function cancelExtraction(state:LifecycleState,reason:string){if(state.channel){state.channel=null;state.reason=reason;}}
export function collectProvisionalLoot(state:LifecycleState,r:SurvivalRules,id:number,weapon:Weapon){
 if(state.terminal||state.loot.length>=r.lifecycle!.lootLimit||state.loot.some(l=>l.id===id))return;
 state.loot.push({id,weapon,status:'UNEXTRACTED'});
}
export function departureDue(state:LifecycleState,r:SurvivalRules,wall:number){return state.disconnectedAt!==null&&wall-state.disconnectedAt>=r.clock.disconnectGraceSeconds*1000;}
// Call after combat and mission resolution, including on the extraction completion tick.
export function tickLifecycle(g:Game,state:LifecycleState,r:SurvivalRules,e:RunEconomy,stationWhole:number,wall:number){
 if(state.terminal)return;
 let outcome:RunOutcome|null=null;
 if(g.result||!g.hero?.alive)outcome=g.result?.reason==='EXTRACTED'?'EXTRACTED':g.result?.reason==='DISCONNECT'?'DISCONNECT':g.hero?.alive?'SURRENDER':'DEATH';
 if(!outcome&&state.channel){
  const hero=heroOf(g),channel=state.channel;
  if(!hero||distance(hero,channel.origin)>.01||hero.route.length||hero.drive&&g.tick<(hero.driveUntil??0))cancelExtraction(state,'Extraction canceled by movement');
  else if(hero.lastHit!==channel.lastHit)cancelExtraction(state,'Extraction canceled by damage');
  else if(blocked(g,r))cancelExtraction(state,'Extraction canceled by hostile contest');
  else if(g.tick-channel.tick>=r.extractionSeconds*r.ticksPerSecond){outcome='EXTRACTED';g.result={winner:0,reason:'EXTRACTED'};}
 }
 if(outcome){
  if(e.lockedWhole!==0)throw Error('Resolve stake before terminal accounting');
  state.channel=null;state.disconnectedAt=null;state.terminal={outcome,tick:g.tick,at:wall,simulatedBankCreditWhole:availableRunWhole(e,stationWhole)};
  for(const loot of state.loot)loot.status=outcome==='EXTRACTED'?'EXTRACTED':'LOST';
  state.reason=outcome==='EXTRACTED'?'Extracted. Simulated bank accounting only. No wallet claim or NFT mint.':outcome+'. Validated earnings remain eligible. New unextracted loot lost. Previously owned NFTs remain owned.';
 }
}
export function verifyLifecycle(state:LifecycleState,g:Game,r:SurvivalRules,e:RunEconomy,stationWhole:number){
 if(!state||!Array.isArray(state.loot)||state.loot.length>r.lifecycle!.lootLimit||new Set(state.loot.map(l=>l.id)).size!==state.loot.length||state.loot.some(l=>!Number.isSafeInteger(l.id)||l.id<1||!['rifle','carbine'].includes(l.weapon)||!['UNEXTRACTED','EXTRACTED','LOST'].includes(l.status)))throw Error('Invalid provisional loot checkpoint');
 if(state.disconnectedAt!==null&&(!Number.isSafeInteger(state.disconnectedAt)||state.disconnectedAt<0))throw Error('Invalid departure checkpoint');
 if(state.channel&&(!Number.isSafeInteger(state.channel.tick)||state.channel.tick>g.tick||!Number.isFinite(state.channel.origin.x)||!Number.isFinite(state.channel.origin.z)||!Number.isSafeInteger(state.channel.lastHit)))throw Error('Invalid extraction checkpoint');
 if(state.terminal){const t=state.terminal;if(!g.result||!['EXTRACTED','DEATH','SURRENDER','DISCONNECT'].includes(t.outcome)||t.tick!==g.tick||!Number.isSafeInteger(t.at)||e.lockedWhole!==0||t.simulatedBankCreditWhole!==availableRunWhole(e,stationWhole)||state.loot.some(l=>l.status!==(t.outcome==='EXTRACTED'?'EXTRACTED':'LOST')))throw Error('Invalid terminal checkpoint');}
 else if(g.result||state.loot.some(l=>l.status!=='UNEXTRACTED'))throw Error('Missing terminal checkpoint');
}
