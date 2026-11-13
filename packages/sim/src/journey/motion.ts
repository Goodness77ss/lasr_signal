import type { Point,Solid } from '../rules.ts';
import type { Vec3 } from './world.ts';

export const MOTION_RULES=Object.freeze({standingHeight:2,crouchedHeight:1.15,standingEye:1.8,crouchedEye:1,crouchedSpeed:55,dodgeDistance:3,dodgeTicks:6,dodgeCooldown:60,radius:.35,invulnerable:false});
export type Pose='standing'|'crouched';
export type MotionState={pose:Pose;dodgeUntil:number;nextDodgeAt:number;direction:Point};
export type MotionWorld={width:number;depth:number;solids:readonly (Solid&{y?:number})[]};
export const emptyMotion=():MotionState=>({pose:'standing',dodgeUntil:0,nextDodgeAt:0,direction:{x:0,z:0}});
export const bodyHeight=(pose:Pose)=>pose==='crouched'?MOTION_RULES.crouchedHeight:MOTION_RULES.standingHeight;
export const eyeHeight=(pose:Pose)=>pose==='crouched'?MOTION_RULES.crouchedEye:MOTION_RULES.standingEye;
export function bodyClear(world:MotionWorld,p:Point&{y?:number},pose:Pose):boolean {
  const radius=MOTION_RULES.radius;
  if(![p.x,p.z].every(Number.isFinite)||p.x<radius||p.z<radius||p.x>world.width-radius||p.z>world.depth-radius)return false;
  return !world.solids.some(s=>{
    if((s.y??0)>=(p.y??0)+bodyHeight(pose)||(s.y??0)+s.h<=(p.y??0))return false;
    const dx=p.x-Math.max(s.x,Math.min(s.x+s.w,p.x)),dz=p.z-Math.max(s.z,Math.min(s.z+s.d,p.z));
    return dx*dx+dz*dz<=radius*radius;
  });
}
export function sweepBody(world:MotionWorld,from:Point,to:Point,pose:Pose):Point {
  const length=Math.hypot(to.x-from.x,to.z-from.z);
  if(!Number.isFinite(length)||length>Math.hypot(world.width,world.depth)*2||!bodyClear(world,from,pose))return {...from};
  let at={...from};const samples=Math.max(1,Math.ceil(length/.04));
  for(let i=1;i<=samples;i++){const p={x:from.x+(to.x-from.x)*i/samples,z:from.z+(to.z-from.z)*i/samples};if(!bodyClear(world,p,pose))break;at=p;}
  return at;
}
export function setPose(state:MotionState,pose:Pose,at:Point&{y?:number},world:MotionWorld,tick:number):boolean {
  if(state.dodgeUntil>tick||!bodyClear(world,at,pose))return false;
  state.pose=pose;return true;
}
export function startDodge(state:MotionState,direction:Point,tick:number):boolean {
  const length=Math.hypot(direction.x,direction.z);
  if(!Number.isSafeInteger(tick)||tick<0||tick<state.nextDodgeAt||!Number.isFinite(length)||length<.001)return false;
  state.direction={x:direction.x/length,z:direction.z/length};state.dodgeUntil=tick+MOTION_RULES.dodgeTicks;state.nextDodgeAt=tick+MOTION_RULES.dodgeCooldown;return true;
}
export function dodgeStep(state:MotionState,at:Point,world:MotionWorld,tick:number):Point {
  if(tick>state.dodgeUntil||tick<=state.dodgeUntil-MOTION_RULES.dodgeTicks)return {...at};
  const step=MOTION_RULES.dodgeDistance/MOTION_RULES.dodgeTicks;
  return sweepBody(world,at,{x:at.x+state.direction.x*step,z:at.z+state.direction.z*step},state.pose);
}
// Shared pose dependent upright hit box. Dodge deliberately grants no immunity.
export function rayBodyDistance(origin:Vec3,direction:Vec3,actor:Point&{y?:number},pose:Pose,range:number):number|null {
  const length=Math.hypot(direction.x,direction.y,direction.z);if(![origin.x,origin.y,origin.z,actor.x,actor.y??0,actor.z,length,range].every(Number.isFinite)||length<.001||range<0)return null;
  let lo=0,hi=range;const radius=MOTION_RULES.radius;
  for(const [axis,min,max] of [['x',actor.x-radius,actor.x+radius],['y',actor.y??0,(actor.y??0)+bodyHeight(pose)],['z',actor.z-radius,actor.z+radius]] as const){
    const d=direction[axis]/length;if(Math.abs(d)<1e-9){if(origin[axis]<min||origin[axis]>max)return null;}
    else{const a=(min-origin[axis])/d,b=(max-origin[axis])/d;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));if(lo>hi)return null;}
  }
  return lo;
}
