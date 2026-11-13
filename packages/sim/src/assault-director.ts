import {createGame, WEAPONS, type Game, type Squad} from './index.ts';
import {distance,legal,path,RULES,type Point} from './rules.ts';
import type {AssaultRules,SurvivalRules} from './survival-rules.ts';

type Member = { id:number; last:Point; progressAt:number; stalledAt:number|null; repathed:boolean; entered:boolean };
export type Assault = {
  id:string; station:string; tier:number; state:'preparing'|'active'|'defeated'|'captured'|'invalid';
  createdAt:number; readyAt:number; startedAt:number|null; endedAt:number|null;
  origins:Point[]; members:Member[]; engagedAt:number|null; participated:boolean;
  heldFrom:number|null; eligible:boolean; reason:string;
};
export type Director = {run:string; sequence:number; nextAt:number; tier:number; assaults:Assault[]; delayed:number; reason:string};
export function createDirector(run:string,rules:AssaultRules):Director {
  return {run,sequence:0,nextAt:rules.firstAssaultSeconds*RULES.ticks,tier:1,assaults:[],delayed:0,reason:'First assault preparing after '+rules.firstAssaultSeconds+' active seconds'};
}
const active=(a:Assault)=>a.state==='active'||a.state==='preparing';
function announce(game:Game,text:string,station?:Point){
  game.events.push({seq:++game.eventSeq,tick:game.tick,kind:'AssaultV2',text,to:station?{x:station.x,z:station.z}:undefined});
  if(game.events.length>100)game.events.splice(0,game.events.length-100);
}
function spawnPlans(game:Game,station:Point,tier:number,d:AssaultRules){
  const hero=game.squads.find(s=>s.id===game.hero?.squadId);
  if(!hero)return [];
  const zones=[...d.spawnZones].sort((a,b)=>Math.abs(a.z-station.z)-Math.abs(b.z-station.z)||a.z-b.z);
  // Tier two splits north and south approaches. No HP, damage, speed or aim boost.
  if(tier>=2){const last=zones.pop()!;zones.splice(1,0,last);}
  const result:{origin:Point;route:Point[]}[]=[];
  for(const origin of zones){
    if(!legal(origin,1)||distance(origin,hero)<d.safeDistance||game.squads.some(s=>distance(s,origin)<1.5))continue;
    const target={x:station.x+1,z:station.z},route=path(origin,target,1);
    if(route?.length)result.push({origin:{...origin},route});
    if(result.length===d.attackers)break;
  }
  return result;
}
export function stepDirector(game:Game,director:Director,rules:SurvivalRules){
  const d=rules.director;if(!d||game.result||game.countdown>0)return;
  director.tier=Math.min(d.maxTier,1+Math.floor(game.tick/(rules.ticksPerSecond*d.tierSeconds)));
  for(const a of director.assaults.filter(active)){
    const station=game.relays.find(s=>s.id===a.station)!;
    if(a.state==='preparing'){
      if(game.tick<a.readyAt)continue;
      if(game.squads.filter(s=>s.side===1&&s.hp>0).length+d.attackers>d.maxEnemies){delay('Enemy capacity reached; assault delayed');continue;}
      const plans=spawnPlans(game,station,a.tier,d);
      if(plans.length<d.attackers){delay('Safe spawn route unavailable; assault delayed');continue;}
      // Recheck the telegraphed positions. A changed route gets a fresh warning window.
      if(JSON.stringify(plans.map(p=>p.origin))!==JSON.stringify(a.origins)){
        a.origins=plans.map(p=>p.origin);a.readyAt=game.tick+d.preparationSeconds*rules.ticksPerSecond;
        director.reason='Approach changed; renewed preparation at '+a.station;announce(game,director.reason,station);continue;
      }
      const prototype=createGame().squads[1];
      a.members=plans.map((plan,index)=>{
        const weapon=a.tier>=3&&index===1?'carbine':'rifle';
        const squad:Squad={...structuredClone(prototype),id:game.nextId++,...plan.origin,route:plan.route,weapon,weapons:[weapon],ammo:WEAPONS[weapon].magazine,shotAt:game.tick,lastHit:game.tick};
        game.squads.push(squad);
        return {id:squad.id,last:{...plan.origin},progressAt:game.tick,stalledAt:null,repathed:false,entered:false};
      });
      a.state='active';a.startedAt=game.tick;a.heldFrom=station.owner===0?game.tick:null;
      director.reason='Assault '+a.id.split(':').at(-1)+' advancing on '+a.station;
      announce(game,director.reason,station);
      continue;
      function delay(reason:string){a.readyAt=game.tick+d!.retrySeconds*rules.ticksPerSecond;director.delayed++;director.reason=reason;a.reason=reason;}
    }
    const living=a.members.map(m=>({m,s:game.squads.find(s=>s.id===m.id&&s.hp>0)})).filter((entry):entry is {m:Member;s:Squad}=>!!entry.s);
    if(station.owner!==0)a.heldFrom=null;
    else if(a.heldFrom===null)a.heldFrom=game.tick;
    for(const {m,s} of living){
      if(distance(s,station)<=d.engagementRadius){m.entered=true;a.engagedAt??=game.tick;}
      if(distance(s,m.last)>=.25){m.last={x:s.x,z:s.z};m.progressAt=game.tick;m.stalledAt=null;}
      // Fighting and capture holding are legitimate stops, not route failures.
      if(distance(s,station)<=rules.station.radius||game.tick-s.lastHit<RULES.regenDelay)continue;
      if(game.tick-m.progressAt>=d.stuckSeconds*rules.ticksPerSecond){
        m.stalledAt??=m.progressAt;a.eligible=false;
        if(!m.repathed){
          const route=path(s,{x:station.x+1,z:station.z},1);s.route=route??[];m.repathed=true;
          a.reason='Stalled attacker detected; route checked again';announce(game,a.reason,station);
        }
        if(game.tick-m.stalledAt>=d.abandonSeconds*rules.ticksPerSecond){
          game.squads=game.squads.filter(unit=>unit.id!==s.id);a.reason='Stalled attacker removed without loot or defense credit';announce(game,a.reason,station);
        }
      }
    }
    const assigned=new Set(a.members.map(m=>m.id));
    const validDamage=game.events.some(e=>e.tick===game.tick&&e.side===0&&e.targetId!==undefined&&assigned.has(e.targetId)&&(e.damage??0)>0);
    const friendlyPresence=game.squads.some(s=>s.side===0&&s.hp>0&&distance(s,station)<=rules.station.radius);
    a.participated ||= validDamage||friendlyPresence;
    const capturedNow=game.events.some(e=>e.tick===game.tick&&e.kind==='StationCapturedV2'&&e.side===1&&e.to&&distance(e.to,station)<.01);
    if(capturedNow&&a.startedAt!==null&&game.tick>a.startedAt){
      a.state='captured';a.endedAt=game.tick;a.reason='Station taken; surviving attackers hold their assignment';
    }else if(!game.squads.some(s=>assigned.has(s.id)&&s.hp>0)){
      a.state=a.eligible?'defeated':'invalid';a.endedAt=game.tick;
      a.reason=a.eligible?'Assigned attackers defeated':'Assault invalidated by route failure';
    }
    if(!active(a)){director.nextAt=game.tick+d.intervalSeconds*rules.ticksPerSecond;director.reason=a.reason;announce(game,a.reason,station);}
  }
  if(director.assaults.some(active)||game.tick<director.nextAt)return;
  const stations=[...game.relays].sort((a,b)=>Number(b.owner===0)-Number(a.owner===0)||Number(a.owner===1)-Number(b.owner===1)||a.id.localeCompare(b.id));
  // Rotate equal priority targets while keeping friendly stations first.
  const priority=stations.filter(s=>s.owner===stations[0].owner);
  const station=priority[director.sequence%priority.length];
  if(game.squads.filter(s=>s.side===1&&s.hp>0).length+d.attackers>d.maxEnemies){
    director.delayed++;director.reason='Enemy capacity reached; no new attackers spawned';director.nextAt=game.tick+d.retrySeconds*rules.ticksPerSecond;return;
  }
  const plans=spawnPlans(game,station,director.tier,d);
  if(plans.length<d.attackers){director.delayed++;director.reason='No two safe routes; spawn delayed';director.nextAt=game.tick+d.retrySeconds*rules.ticksPerSecond;return;}
  const assault:Assault={id:director.run+':assault:'+ ++director.sequence,station:station.id,tier:director.tier,state:'preparing',createdAt:game.tick,readyAt:game.tick+d.preparationSeconds*rules.ticksPerSecond,startedAt:null,endedAt:null,origins:plans.map(p=>p.origin),members:[],engagedAt:null,participated:false,heldFrom:null,eligible:true,reason:'Five second approach warning'};
  director.assaults.push(assault);
  if(director.assaults.length>d.historyLimit)director.assaults.splice(0,director.assaults.length-d.historyLimit);
  director.reason='Incoming assault on '+station.id+' from the east';announce(game,director.reason,station);
}

export function directorStatus(game:Game,d:Director,rules:AssaultRules){
  const current=d.assaults.find(active)??d.assaults.at(-1);
  return {tier:d.tier,enemies:game.squads.filter(s=>s.side===1&&s.hp>0).length,cap:rules.maxEnemies,delayed:d.delayed,reason:d.reason,nextInSeconds:Math.max(0,Math.ceil((d.nextAt-game.tick)/RULES.ticks)),assault:current?{id:current.id,station:current.station,state:current.state,attackers:current.members.length,preparationSeconds:current.state==='preparing'?Math.max(0,Math.ceil((current.readyAt-game.tick)/RULES.ticks)):0,engaged:current.engagedAt!==null,routeFailure:!current.eligible}:null};
}
