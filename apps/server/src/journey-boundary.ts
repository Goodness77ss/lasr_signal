import { seesGrenade } from '../../../packages/sim/src/journey/grenades.ts';
import { eyeHeight,bodyHeight } from '../../../packages/sim/src/journey/motion.ts';
import type { JourneyClientMessage } from '../../../packages/protocol/src/journey.ts';
import { JOURNEY_SNAPSHOT_BYTES } from '../../../packages/protocol/src/journey.ts';
import { journeyWorld,actorEye,actorElevation,actorVision,type JourneyRun } from '../../../packages/sim/src/journey/encounter.ts';
import { distance } from '@last-signal/sim';
export type JourneyCommandMessage=Extract<JourneyClientMessage,{op:'command'}>;
export type JourneyAcknowledgement={op:'ack';id:string;ok:boolean;reason:string;sequence:number;order:number;tick:number};

// This boundary does not execute or acknowledge gameplay. Step 09 commits it durably.
export class JourneyCommandBoundary {
  private buckets=new Map<string,{at:number;count:number}>();
  constructor(private now:()=>number=Date.now){}
  allow(scope:string,category:'connection'|'run'|'fire'|'movement'|'control'):boolean {
    const time=this.now(),key=scope+':'+category,limit={connection:80,run:60,fire:12,movement:40,control:12}[category];
    let bucket=this.buckets.get(key);if(!bucket||time-bucket.at>=1000){bucket={at:time,count:0};this.buckets.set(key,bucket);}
    bucket.count++;return bucket.count<=limit;
  }
  release(scope:string){for(const key of this.buckets.keys())if(key.startsWith(scope+':'))this.buckets.delete(key);}
  validate(message:JourneyCommandMessage,context:{authenticatedRun:string;runId:string;section:string;leaderId:number;lastSequence:number}):void {
    if(context.authenticatedRun!==context.runId)throw Error('Run ownership denied');
    if(message.actorId!==context.leaderId)throw Error('Actor control denied');
    if(message.section!==context.section)throw Error('Retired section');
    if(message.sequence<=context.lastSequence)throw Error('Stale command sequence');
  }
}

export function journeyObservation(run:JourneyRun){
  const world=journeyWorld(run),friends=run.actors.filter(a=>a.side===0&&a.hp>0);
  const visible=run.actors.filter(a=>a.side===0||friends.some(friend=>{
    const range=distance(friend,a);if(range>actorVision(run,friend)*Math.min(world.terrain(friend).visibility??1,world.terrain(a).visibility??1))return false;
    const dy=run.pin.rules.motion?actorElevation(a)+bodyHeight(a.motion?.pose??'standing')/2-actorEye(friend):-.65,rayRange=run.pin.rules.traversal?Math.hypot(range,dy):range;
    return world.shotDistance({...friend,y:actorEye(friend)},{x:a.x-friend.x,y:dy,z:a.z-friend.z},rayRange+1)>=rayRange-.7;
  }));
  // Hidden actors and the full internal event ring never enter this payload.
  const sectionData=run.sectionData?{id:run.sectionData.id,ordinal:run.sectionData.ordinal,generator:run.sectionData.generator,template:run.sectionData.template,region:run.sectionData.region,spawn:run.sectionData.spawn,checkpoint:run.sectionData.checkpoint,solids:run.sectionData.solids,scenerySeed:run.sectionData.scenerySeed}:null;
  const observation={section:run.section,sectionData,tick:run.tick,state:run.state,actors:visible.map(a=>{const {awareness:_privateAwareness,tactics:_privateTactics,...publicActor}=a;return {...publicActor,route:[],...(a.tactics?{behaviour:{role:a.tactics.role,mode:a.tactics.mode}}:{})};}),checkpointComplete:run.checkpointComplete,practiceCredits:run.practiceCredits,bankedPracticeCredits:run.bankedPracticeCredits,pin:run.pin};
  const snapshot={...observation,...(run.ownedOwner?{ownedOwner:run.ownedOwner}:{}),...(run.rewards?{rewards:{...run.rewards,drops:run.rewards.drops.filter(d=>d.state!=='AVAILABLE'||friends.some(a=>{const length=Math.hypot(d.x-a.x,d.y+.2-actorEye(a),d.z-a.z);return distance(a,d)<=actorVision(run,a)&&world.shotDistance({...a,y:actorEye(a)},{x:d.x-a.x,y:d.y+.2-actorEye(a),z:d.z-a.z},length)>=length-.15;})).map(d=>({...d}))}}:{}),...(run.roster?{roster:structuredClone(run.roster)}:{}),...(run.equipment?{equipment:structuredClone(run.equipment)}:{}),...(run.projectiles?{projectiles:run.projectiles.filter(p=>friends.some(a=>seesGrenade(a,actorEye(a),p,world))).map(p=>structuredClone(p))}:{}),...(run.encounter?{encounter:{...run.encounter}}:{})};
  if(new TextEncoder().encode(JSON.stringify(snapshot)).length>JOURNEY_SNAPSHOT_BYTES)throw Error('Journey snapshot budget exceeded');
  return snapshot;
}

