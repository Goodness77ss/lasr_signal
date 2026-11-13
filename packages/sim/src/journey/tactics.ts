import { distance,type Point } from '../rules.ts';
import type { WorldQuery } from './world.ts';
export const TACTICAL_RULES=Object.freeze({thinkTicks:10,commitTicks:24,retreatHealth:30,reloadBelow:3,flankDistance:5,coverSearchRange:12,aimToleranceRadians:.12});
export type TacticalRole='defender'|'flanker'|'support';
export type TacticalState={mode:'patrol'|'cover'|'suppress'|'flank'|'reload'|'retreat'|'search';role:TacticalRole;until:number;destination:Point|null;stuckTicks:number};
export type PerceivedHazard={position:Point;radius:number};
export type TacticalActor=Point&{id:number;hp:number;ammo:number;reserve:number;reloadAt:number;route:Point[];perceivedHazards?:readonly PerceivedHazard[]};
export const tacticalRole=(id:number):TacticalRole=>id%3===1?'defender':id%3===2?'flanker':'support';
export const emptyTactics=(id:number):TacticalState=>({role:tacticalRole(id),mode:'patrol',until:0,destination:null,stuckTicks:0});
export function chooseTactic(actor:TacticalActor,allies:readonly TacticalActor[],threat:Point|null,visible:boolean,world:WorldQuery,tick:number,state:TacticalState,route:(a:Point,b:Point)=>Point[]):TacticalState {
  const select=(mode:TacticalState['mode'],destination:Point|null):TacticalState=>({...state,mode,destination,until:tick+TACTICAL_RULES.commitTicks,stuckTicks:0});
  const hazard=actor.perceivedHazards?.find(h=>Number.isFinite(h.radius)&&h.radius>0&&h.radius<=10&&distance(actor,h.position)<=h.radius);
  if(hazard){
    let dx=actor.x-hazard.position.x;const dz=actor.z-hazard.position.z;if(!dx&&!dz)dx=actor.id%2?1:-1;const length=Math.hypot(dx,dz);
    const candidates=[0,Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2].map(angle=>({x:actor.x+(dx/length*Math.cos(angle)-dz/length*Math.sin(angle))*TACTICAL_RULES.flankDistance,z:actor.z+(dx/length*Math.sin(angle)+dz/length*Math.cos(angle))*TACTICAL_RULES.flankDistance}));
    return select('retreat',candidates.find(p=>world.walkable(p)&&distance(p,hazard.position)>distance(actor,hazard.position)&&route(actor,p).length>0)??null);
  }
  if(actor.ammo<TACTICAL_RULES.reloadBelow&&actor.reserve>0)return state.mode==='reload'&&tick<state.until?state:select('reload',null);
  if(tick<state.until&&actor.hp>TACTICAL_RULES.retreatHealth)return state;
  if(!threat)return select('patrol',null);
  const reachable=(point:Point)=>world.walkable(point)&&allies.filter(a=>a.id!==actor.id&&a.hp>0).every(a=>distance(point,a.route.at(-1)??a)>1)&&route(actor,point).length>0;
  const dx=actor.x-threat.x,dz=actor.z-threat.z,length=Math.hypot(dx,dz)||1;
  if(actor.hp<=TACTICAL_RULES.retreatHealth){
    const candidates=[0,Math.PI/4,-Math.PI/4].map(angle=>({x:actor.x+(dx/length*Math.cos(angle)-dz/length*Math.sin(angle))*5,z:actor.z+(dx/length*Math.sin(angle)+dz/length*Math.cos(angle))*5}));
    return select('retreat',candidates.find(reachable)??null);
  }
  if(!visible)return select('search',reachable(threat)?{...threat}:null);
  if(state.role==='flanker'){
    const sign=actor.id%2?1:-1;
    const candidates=[sign,-sign].map(side=>({x:threat.x-dz/length*TACTICAL_RULES.flankDistance*side,z:threat.z+dx/length*TACTICAL_RULES.flankDistance*side}));
    const destination=candidates.find(reachable);if(destination)return select('flank',destination);
  }
  const cover=world.solids.flatMap(s=>[
    {x:s.x-.8,z:s.z+s.d/2},{x:s.x+s.w+.8,z:s.z+s.d/2},
    {x:s.x+s.w/2,z:s.z-.8},{x:s.x+s.w/2,z:s.z+s.d+.8},
  ]).filter(p=>distance(actor,p)<=TACTICAL_RULES.coverSearchRange&&reachable(p)&&world.shotDistance({...threat,y:1.1},{x:p.x-threat.x,y:0,z:p.z-threat.z},distance(threat,p))<distance(threat,p)-.3).sort((a,b)=>distance(actor,a)-distance(actor,b));
  if(cover[0]&&state.role!=='support')return select('cover',cover[0]);
  return select('suppress',null);
}
