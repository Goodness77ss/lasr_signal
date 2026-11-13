import {RULES,distance,legal,path,type Game} from './index.ts';
import type {Director,Assault} from './assault-director.ts';
import {availableRunWhole,type RunEconomy} from './run-economy.ts';
import {missionFits,type SurvivalRules} from './survival-rules.ts';
export type Mission={id:string;cycle:number;station:string;assault:string;status:'OFFER'|'ACTIVE'|'SUCCEEDED'|'FAILED'|'DECLINED'|'EXPIRED'|'ABORTED';offered:number;offerUntil:number;accepted:number|null;until:number|null;holdFrom:number|null;stake:number;bonus:number;reason:string};
export type MissionState={sequence:number;nextOffer:number;segment:number;wallStart:number;current:Mission|null;history:Mission[]};
export const createMissionState=(rules:SurvivalRules,wall:number):MissionState=>({sequence:0,nextOffer:rules.mission.firstOfferSeconds*rules.ticksPerSecond,segment:1,wallStart:wall,current:null,history:[]});
type Hooks={reserve:(m:Mission)=>boolean;update:(m:Mission)=>void};
const open=(m:Mission)=>m.status==='OFFER'||m.status==='ACTIVE';
function feasible(game:Game,a:Assault,rules:SurvivalRules){
 const station=game.relays.find(s=>s.id===a.station),hero=game.squads.find(s=>s.id===game.hero?.squadId),d=rules.director;
 if(!station||station.owner!==0||!hero||!d||!a.eligible||!['preparing','active'].includes(a.state))return false;
 if(a.state==='active')return a.members.length===d.attackers&&a.members.every(m=>{
  const unit=game.squads.find(s=>s.id===m.id&&s.hp>0);if(!unit)return false;const route=path(unit,{x:station.x+1,z:station.z},1);if(!route)return false;
  let length=0,previous={x:unit.x,z:unit.z};for(const point of route){length+=distance(previous,point);previous=point;}
  return length/(RULES.speed*RULES.firingSpeed*RULES.suppressionSpeed)+rules.mission.holdSeconds<=rules.mission.durationSeconds;
 });
 if(game.squads.filter(s=>s.side===1&&s.hp>0).length+d.attackers>d.maxEnemies)return false;
 return a.origins.length===d.attackers&&a.origins.every(p=>{
  if(!legal(p,1)||distance(p,hero)<d.safeDistance)return false;
  const route=path(p,{x:station.x+1,z:station.z},1);if(!route)return false;
  let length=0,previous=p;for(const point of route){length+=distance(previous,point);previous=point;}
  return length/(RULES.speed*RULES.firingSpeed*RULES.suppressionSpeed)+rules.mission.preparationSeconds+rules.mission.holdSeconds<=rules.mission.durationSeconds;
 });
}
function finish(state:MissionState,e:RunEconomy,status:Mission['status'],reason:string,hooks:Hooks){
 const m=state.current;if(!m||!open(m))return;
 if(m.status==='ACTIVE'){e.lockedWhole-=m.stake;if(status==='SUCCEEDED')e.bonusWhole+=m.bonus;else if(status==='FAILED')e.failedWhole+=m.stake;}
 m.status=status;m.reason=reason;hooks.update(m);state.history.push(structuredClone(m));if(state.history.length>8)state.history.shift();
}
export function abortMission(state:MissionState,e:RunEconomy,hooks:Hooks,reason='Service abort: stake unlocked'){finish(state,e,'ABORTED',reason,hooks);}
export function decideMission(game:Game,d:Director,e:RunEconomy,stationWhole:number,state:MissionState,rules:SurvivalRules,id:string,decision:'ACCEPT'|'DECLINE',wall:number,hooks:Hooks){
 const m=state.current;
 if(!m||m.id!==id||m.status!=='OFFER')return {ok:false,reason:'Offer unavailable, resolved or already accepted'};
 if(decision==='DECLINE'){finish(state,e,'DECLINED','Declined. Nothing charged',hooks);return {ok:true,reason:m.reason};}
 if(game.result||!game.hero?.alive||game.tick>=m.offerUntil||wall-state.wallStart>=rules.clock.wallCloseSeconds){finish(state,e,'EXPIRED','Offer expired. Nothing charged',hooks);return {ok:false,reason:m.reason};}
 const a=d.assaults.find(a=>a.id===m.assault);
 if(!a||!feasible(game,a,rules)||availableRunWhole(e,stationWhole)<m.stake||e.lockedWhole!==0)return {ok:false,reason:'Assault, time envelope or available stake changed. Nothing charged'};
 const activeRemaining=rules.clock.segmentSeconds*rules.ticksPerSecond-(game.tick%(rules.clock.segmentSeconds*rules.ticksPerSecond));
 if(activeRemaining<rules.mission.durationSeconds*rules.ticksPerSecond)return {ok:false,reason:'Mission cannot fit checkpoint. Nothing charged'};
 e.lockedWhole+=m.stake;m.status='ACTIVE';m.accepted=game.tick;m.until=game.tick+rules.mission.durationSeconds*rules.ticksPerSecond;m.reason='Hold '+m.station+' and defeat all marked attackers';hooks.update(m);
 return {ok:true,reason:'Accepted explicitly. '+m.stake+' simulated run units locked once'};
}
export function tickMission(game:Game,d:Director,e:RunEconomy,stationWhole:number,state:MissionState,rules:SurvivalRules,wall:number,hooks:Hooks){
 if(!rules.flags.missions)return;
 const span=rules.clock.segmentSeconds*rules.ticksPerSecond,segment=1+Math.floor(game.tick/span);
 const m=state.current;
 if(segment!==state.segment){if(m&&open(m))abortMission(state,e,hooks,'Checkpoint boundary: stake unlocked');state.segment=segment;state.wallStart=wall;}
 if(m&&open(m)){
  const a=d.assaults.find(a=>a.id===m.assault),station=game.relays.find(s=>s.id===m.station)!;
  if(m.status==='OFFER'){
   if(game.result||game.tick>=m.offerUntil||wall-state.wallStart>=rules.clock.wallCloseSeconds)finish(state,e,'EXPIRED','Offer expired. Nothing charged',hooks);
   else if(!a||!feasible(game,a,rules))finish(state,e,'ABORTED','Offer no longer feasible. Nothing charged',hooks);
  }else{
   if(game.result||!game.hero?.alive)finish(state,e,'FAILED','Death or surrender: accepted stake consumed once',hooks);
   else if(station.owner!==0)finish(state,e,'FAILED','Station ownership lost: accepted stake consumed once',hooks);
   else if(!a||!a.eligible||a.state==='invalid'||wall-state.wallStart>=rules.clock.wallCloseSeconds||a.startedAt===null&&game.tick-m.accepted!>rules.mission.preparationSeconds*rules.ticksPerSecond)abortMission(state,e,hooks,'Service or checkpoint abort: stake unlocked');
   else{
    if(a.engagedAt!==null)m.holdFrom??=Math.max(a.engagedAt,m.accepted!);
    if(a.state==='defeated'&&m.holdFrom!==null&&game.tick-m.holdFrom>=rules.mission.holdSeconds*rules.ticksPerSecond&&game.tick<=m.until!)finish(state,e,'SUCCEEDED','Stake unlocked. Three simulated bonus units earned',hooks);
    else if(game.tick>=m.until!)finish(state,e,'FAILED','Mission time expired: accepted stake consumed once',hooks);
   }
  }
 }
 if(game.result||!game.hero?.alive||game.tick<state.nextOffer||state.current&&open(state.current)||e.lockedWhole!==0||e.bonusWhole+rules.mission.bonus>rules.economy.runBonusCap||availableRunWhole(e,stationWhole)<rules.mission.stake)return;
 const localTick=game.tick%span,remaining=rules.clock.hardTimeoutSeconds-(wall-state.wallStart);
 if(!missionFits(localTick,remaining,rules)||wall-state.wallStart>=rules.clock.wallCloseSeconds)return;
 const assault=d.assaults.find(a=>['preparing','active'].includes(a.state)&&feasible(game,a,rules));if(!assault)return;
 const offer:Mission={id:d.run+':mission:'+ ++state.sequence,cycle:segment,station:assault.station,assault:assault.id,status:'OFFER',offered:game.tick,offerUntil:game.tick+rules.mission.offerSeconds*rules.ticksPerSecond,accepted:null,until:null,holdFrom:null,stake:rules.mission.stake,bonus:rules.mission.bonus,reason:'Optional Hold the Signal: retain thirty seconds after assault arrival and defeat all marked attackers within sixty seconds'};
 if(!hooks.reserve(offer)){state.nextOffer=game.tick+rules.ticksPerSecond;return;}
 state.current=offer;state.nextOffer=game.tick+rules.mission.gapSeconds*rules.ticksPerSecond;
}
