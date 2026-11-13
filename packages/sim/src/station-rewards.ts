import type {Game} from './index.ts';
import {distance,legal} from './rules.ts';
import type {Director} from './assault-director.ts';
import type {SurvivalRules} from './survival-rules.ts';

export type StationReward={run:string;cycle:number;station:string;kind:'CAPTURE'|'DEFENSE';amountWhole:number;tick:number;source:string};
type Defense={id:string;station:string;cycle:number;start:number;continuous:boolean;valid:boolean;engaged:boolean;participated:boolean};
export type RewardState={lastTick:number;cycle:number;owners:Record<string,number|null>;carried:string[];events:StationReward[];attempts:string[];defenses:Record<string,Defense>;reasons:Record<string,string>};
export function createRewardState(game:Game):RewardState {
  return {lastTick:game.tick,cycle:1,owners:Object.fromEntries(game.relays.map(s=>[s.id,s.owner])),carried:game.relays.filter(s=>s.owner===0).map(s=>s.id),events:[],attempts:[],defenses:{},reasons:{}};
}
export const rewardKey=(e:Pick<StationReward,'run'|'cycle'|'station'|'kind'>)=>JSON.stringify([e.run,e.cycle,e.station,e.kind]);
export function stationRewards(game:Game,director:Director,state:RewardState,rules:SurvivalRules,budget:{remainingWhole:number},commit:(event:StationReward)=>void):StationReward[]{
  if(!rules.flags.rewards)return [];
  if(game.tick===state.lastTick)return [];
  if(game.tick!==state.lastTick+1)throw Error('Reward tick continuity lost');
  const added:StationReward[]=[],cycle=1+Math.floor(game.tick/(rules.clock.segmentSeconds*rules.ticksPerSecond));
  if(cycle!==state.cycle){state.cycle=cycle;state.carried=game.relays.filter(s=>state.owners[s.id]===0).map(s=>s.id);state.reasons={};}
  const previous={...state.owners};state.owners=Object.fromEntries(game.relays.map(s=>[s.id,s.owner]));state.lastTick=game.tick;
  if(game.result||!game.hero?.alive){state.defenses={};return added;}
  if(cycle>rules.station.cycles){for(const s of game.relays)state.reasons[s.id]='Run station reward limit reached. Survival continues';state.defenses={};return added;}
  function grant(station:string,kind:StationReward['kind'],source:string){
    const event:StationReward={run:director.run,cycle,station,kind,amountWhole:kind==='CAPTURE'?rules.station.captureReward:rules.station.defenseReward,tick:game.tick,source};
    if(state.attempts.includes(rewardKey(event))){state.reasons[station]=kind+' eligibility already resolved for this cycle';return;}
    state.attempts.push(rewardKey(event));
    const runTotal=state.events.reduce((n,e)=>n+e.amountWhole,0),cycleTotal=state.events.filter(e=>e.cycle===cycle).reduce((n,e)=>n+e.amountWhole,0);
    if(cycleTotal+event.amountWhole>Math.min(rules.station.cycleCap,rules.economy.segmentStationReserve)){state.reasons[station]='Cycle station budget exhausted';return;}
    if(runTotal+event.amountWhole>Math.min(rules.station.runCap,rules.economy.runRewardCap)){state.reasons[station]='Run station budget exhausted';return;}
    if(!Number.isSafeInteger(budget.remainingWhole)||budget.remainingWhole<event.amountWhole){state.reasons[station]='Rolling identity reward cap reached';return;}
    commit(event);state.events.push(event);budget.remainingWhole-=event.amountWhole;added.push(event);state.reasons[station]='+'+event.amountWhole+' simulated '+kind.toLowerCase()+' recorded';
  }
  for(const station of game.relays){
    if(previous[station.id]!==0&&station.owner===0){
      if(state.carried.includes(station.id))state.reasons[station.id]='Carried station needs a new qualifying defense';
      else grant(station.id,'CAPTURE','capture:'+game.tick);
    }
  }
  for(const a of director.assaults){
    if(a.startedAt!==game.tick||a.state!=='active')continue;
    const station=game.relays.find(s=>s.id===a.station)!;
    const valid=a.eligible&&a.members.length>=2&&new Set(a.members.map(m=>m.id)).size===a.members.length&&a.origins.length===a.members.length&&a.origins.every(p=>legal(p,1))&&a.members.every(m=>game.squads.some(s=>s.id===m.id&&s.side===1&&s.hp>0&&s.route.length>0));
    state.defenses[a.id]={id:a.id,station:a.station,cycle,start:game.tick,continuous:previous[a.station]===0&&station.owner===0,valid,engaged:false,participated:false};
  }
  for(const p of Object.values(state.defenses)){
    const a=director.assaults.find(a=>a.id===p.id),station=game.relays.find(s=>s.id===p.station)!;
    if(!a||p.cycle!==cycle||!p.valid||!a.eligible||['captured','invalid'].includes(a.state)){delete state.defenses[p.id];continue;}
    p.continuous&&=station.owner===0;
    const ids=new Set(a.members.map(m=>m.id));
    const damage=game.events.some(e=>e.tick===game.tick&&e.side===0&&e.targetId!==undefined&&ids.has(e.targetId)&&(e.damage??0)>0);
    const finalZoneHit=game.events.some(e=>e.tick===game.tick&&e.side===0&&e.targetId!==undefined&&ids.has(e.targetId)&&e.to&&distance(e.to,station)<=rules.director!.engagementRadius&&(e.damage??0)>0);
    p.engaged||=a.members.some(m=>m.entered)||a.engagedAt!==null||finalZoneHit;
    p.participated||=damage||a.participated;
    if(!p.continuous){state.reasons[p.station]='Ownership lost during assault. No defense credit';delete state.defenses[p.id];continue;}
    if(a.state!=='defeated'||game.tick-p.start<rules.station.defenseSeconds*rules.ticksPerSecond)continue;
    if(p.engaged&&p.participated){
      if(state.carried.includes(p.station))grant(p.station,'CAPTURE',p.id);
      grant(p.station,'DEFENSE',p.id);
    }else state.reasons[p.station]='No qualifying engagement and participation evidence';
    delete state.defenses[p.id];
  }
  return added;
}
