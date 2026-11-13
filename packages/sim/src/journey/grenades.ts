import type { Vec3,WorldQuery } from './world.ts';
export const GRENADE_RULES=Object.freeze({inventoryCost:1,starterQuantity:2,speed:12,gravity:9.8,fuseTicks:60,cooldownTicks:20,maxDistance:18,radius:.1,blastRadius:6,maxDamage:100,restitution:.35,friction:.65,maxBounces:4,maxActive:4,friendlyFire:true,ticks:20});
export type Grenade={id:number;owner:number;side:0|1;position:Vec3;velocity:Vec3;born:number;explodeAt:number;bounces:number;resting:boolean;travel:number};
export type GrenadeEvent={kind:'bounce'|'explosion';id:number;position:Vec3};
const finite=(p:Vec3)=>[p.x,p.y,p.z].every(Number.isFinite);
export function grenadePointClear(world:WorldQuery,p:Vec3):boolean {
  const r=GRENADE_RULES.radius;
  return finite(p)&&p.x>=r&&p.x<=world.width-r&&p.z>=r&&p.z<=world.depth-r&&p.y>=r&&!world.solids.some(s=>p.x>=s.x-r&&p.x<=s.x+s.w+r&&p.z>=s.z-r&&p.z<=s.z+s.d+r&&p.y>=(s.y??0)-r&&p.y<=(s.y??0)+s.h+r);
}
export function launchGrenade(id:number,owner:number,side:0|1,origin:Vec3,aim:Vec3,tick:number,world:WorldQuery):Grenade|null {
  const length=Math.hypot(aim.x,aim.y,aim.z);
  if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(tick)||tick<0||!finite(aim)||length<.001||!grenadePointClear(world,origin))return null;
  return {id,owner,side,position:{...origin},velocity:{x:aim.x/length*GRENADE_RULES.speed,y:aim.y/length*GRENADE_RULES.speed,z:aim.z/length*GRENADE_RULES.speed},born:tick,explodeAt:tick+GRENADE_RULES.fuseTicks,bounces:0,resting:false,travel:0};
}
type Impact={at:number;normal:Vec3};
function sweep(world:WorldQuery,from:Vec3,to:Vec3):Impact|null {
  const r=GRENADE_RULES.radius,d={x:to.x-from.x,y:to.y-from.y,z:to.z-from.z};let hit:Impact|null=null;
  const plane=(axis:'x'|'y'|'z',boundary:number,sign:number)=>{if(d[axis]*sign>=0)return;const at=(boundary-from[axis])/d[axis];if(at>=0&&at<=1&&(!hit||at<hit.at)){const normal={x:0,y:0,z:0};normal[axis]=sign;hit={at,normal};}};
  plane('y',r,1);plane('x',r,1);plane('x',world.width-r,-1);plane('z',r,1);plane('z',world.depth-r,-1);
  for(const s of world.solids){let lo=0,hi=1,normal={x:0,y:0,z:0};
    for(const [axis,min,max] of [['x',s.x-r,s.x+s.w+r],['y',(s.y??0)-r,(s.y??0)+s.h+r],['z',s.z-r,s.z+s.d+r]] as const){
      if(Math.abs(d[axis])<1e-10){if(from[axis]<min||from[axis]>max){hi=-1;break;}}
      else{const a=(min-from[axis])/d[axis],b=(max-from[axis])/d[axis],entry=Math.min(a,b);if(entry>lo){lo=entry;normal={x:0,y:0,z:0};normal[axis]=a<b?-1:1;}hi=Math.min(hi,Math.max(a,b));}
    }
    if(lo<=hi&&hi>=0&&lo<=1&&(!hit||lo<hit.at))hit={at:lo,normal};
  }
  return hit;
}
export function stepGrenade(grenade:Grenade,tick:number,world:WorldQuery):GrenadeEvent[] {
  if(tick>=grenade.explodeAt)return [{kind:'explosion',id:grenade.id,position:{...grenade.position}}];
  if(grenade.resting)return [];
  const dt=1/GRENADE_RULES.ticks;grenade.velocity.y-=GRENADE_RULES.gravity*dt;
  const horizontal=Math.hypot(grenade.velocity.x,grenade.velocity.z)*dt,remaining=GRENADE_RULES.maxDistance-grenade.travel,scale=horizontal>remaining?Math.max(0,remaining)/horizontal:1;
  const from=grenade.position,to={x:from.x+grenade.velocity.x*dt*scale,y:from.y+grenade.velocity.y*dt,z:from.z+grenade.velocity.z*dt*scale},impact=sweep(world,from,to);
  const at=impact?Math.max(0,impact.at-1e-5):1;grenade.position={x:from.x+(to.x-from.x)*at,y:from.y+(to.y-from.y)*at,z:from.z+(to.z-from.z)*at};grenade.travel+=Math.hypot(grenade.position.x-from.x,grenade.position.z-from.z);
  if(scale<1){grenade.velocity.x=0;grenade.velocity.z=0;}
  if(!impact)return [];
  const n=impact.normal,dot=grenade.velocity.x*n.x+grenade.velocity.y*n.y+grenade.velocity.z*n.z;
  for(const axis of ['x','y','z'] as const)grenade.velocity[axis]=(grenade.velocity[axis]-(1+GRENADE_RULES.restitution)*dot*n[axis])*(n[axis]===0?GRENADE_RULES.friction:1);
  grenade.bounces=Math.min(GRENADE_RULES.maxBounces,grenade.bounces+1);
  if(grenade.bounces>=GRENADE_RULES.maxBounces||Math.hypot(grenade.velocity.x,grenade.velocity.y,grenade.velocity.z)<.8){grenade.resting=n.y>0;grenade.velocity={x:0,y:0,z:0};}
  return [{kind:'bounce',id:grenade.id,position:{...grenade.position}}];
}
export function grenadeDamage(origin:Vec3,target:Vec3,world:WorldQuery):number {
  const direction={x:target.x-origin.x,y:target.y-origin.y,z:target.z-origin.z},range=Math.hypot(direction.x,direction.y,direction.z);
  if(!finite(origin)||!finite(target)||range>=GRENADE_RULES.blastRadius)return 0;
  if(range>.001&&world.shotDistance(origin,direction,range)<range-.01)return 0;
  return Math.max(0,Math.round(GRENADE_RULES.maxDamage*(1-range/GRENADE_RULES.blastRadius)));
}
export function seesGrenade(observer:{x:number;z:number;facing:number;hp:number},height:number,grenade:Grenade,world:WorldQuery):boolean {
  if(observer.hp<=0)return false;
  const d={x:grenade.position.x-observer.x,y:grenade.position.y-height,z:grenade.position.z-observer.z},range=Math.hypot(d.x,d.y,d.z),angle=Math.atan2(Math.sin(Math.atan2(d.x,d.z)-observer.facing),Math.cos(Math.atan2(d.x,d.z)-observer.facing));
  return range<=22*(world.terrain(observer).visibility??1)&&Math.abs(angle)<=Math.PI/3&&world.shotDistance({...observer,y:height},d,range)>=range-.02;
}
export function grenadePreview(origin:Vec3,aim:Vec3,world:WorldQuery):Vec3[] {
  const grenade=launchGrenade(1,1,0,origin,aim,0,world);if(!grenade)return [];
  const points=[{...origin}];for(let tick=1;tick<GRENADE_RULES.fuseTicks;tick++){stepGrenade(grenade,tick,world);if(tick%2===0||grenade.resting)points.push({...grenade.position});if(grenade.resting)break;}return points;
}
