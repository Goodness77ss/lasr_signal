import { eyeHeight,bodyHeight,type MotionState } from './motion.ts';
import { distance,type Point } from '../rules.ts';
import type { WorldQuery } from './world.ts';
export const AWARENESS_RULES=Object.freeze({fieldOfView:Math.PI*2/3,turnPerTick:Math.PI/24,reactionTicks:8,memoryTicks:100,hearingRange:18,visionRange:22,communicationRange:10});
export type ThreatMemory={state:'patrol'|'alerted'|'investigate'|'search';lastKnown:Point|null;targetId:number|null;expiresAt:number;reactAt:number;confidence:number;lastSoundSequence:number;lastWitnessSequence?:number};
export type PerceptionActor=Point&{id:number;side:0|1;hp:number;facing:number;motion?:MotionState;traversal?:{y:number}};
const actorEye=(actor:PerceptionActor)=>(actor.traversal?.y??0)+eyeHeight(actor.motion?.pose??'standing');
export type SoundClue={sequence:number;position:Point;side:0|1;height?:number};
export const emptyAwareness=():ThreatMemory=>({state:'patrol',lastKnown:null,targetId:null,expiresAt:0,reactAt:0,confidence:0,lastSoundSequence:0});
export function validateAwareness(memory:ThreatMemory,tick:number,eventSequence:number):void {
  const integer=(value:unknown,max:number)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=max;
  if(!memory||!['patrol','alerted','investigate','search'].includes(memory.state)||!Number.isFinite(memory.confidence)||memory.confidence<0||memory.confidence>1||!integer(memory.expiresAt,tick+AWARENESS_RULES.memoryTicks)||!integer(memory.reactAt,tick+AWARENESS_RULES.reactionTicks)||!integer(memory.lastSoundSequence,eventSequence)||memory.lastWitnessSequence!==undefined&&!integer(memory.lastWitnessSequence,eventSequence)||memory.targetId!==null&&(!integer(memory.targetId,6)||memory.targetId===0)||memory.lastKnown!==null&&(!Number.isFinite(memory.lastKnown.x)||!Number.isFinite(memory.lastKnown.z)||memory.lastKnown.x<0||memory.lastKnown.x>72||memory.lastKnown.z<0||memory.lastKnown.z>48))throw Error('Invalid Journey threat memory');
}
const coarse=(p:Point):Point=>({x:Math.round(p.x/4)*4,z:Math.round(p.z/4)*4});
const angle=(r:number)=>Math.atan2(Math.sin(r),Math.cos(r));
export function alertFromDamage(memory:ThreatMemory,source:Point,tick:number){
  if(memory.state==='patrol'||tick>=memory.expiresAt)memory.reactAt=tick+AWARENESS_RULES.reactionTicks;
  memory.lastKnown=coarse(source);memory.state='alerted';memory.confidence=.8;memory.expiresAt=tick+AWARENESS_RULES.memoryTicks;
}
export function perceive(actor:PerceptionActor,others:readonly PerceptionActor[],memory:ThreatMemory,world:WorldQuery,tick:number,sounds:readonly SoundClue[]=[]):PerceptionActor|null {
  let visible:PerceptionActor|null=null;
  for(const target of others){
    if(target.hp<=0||target.side===actor.side)continue;
    const range=distance(actor,target),visibility=Math.min(world.terrain(actor).visibility??1,world.terrain(target).visibility??1);
    if(range>AWARENESS_RULES.visionRange*visibility||Math.abs(angle(Math.atan2(target.x-actor.x,target.z-actor.z)-actor.facing))>AWARENESS_RULES.fieldOfView/2)continue;
    const dy=actor.motion||target.motion?(target.traversal?.y??0)+bodyHeight(target.motion?.pose??'standing')/2-actorEye(actor):-.65,rayRange=actor.traversal||target.traversal?Math.hypot(range,dy):range;
    if(world.shotDistance({...actor,y:actorEye(actor)},{x:target.x-actor.x,y:dy,z:target.z-actor.z},rayRange+1)<rayRange-.7)continue;
    if(!visible||range<distance(actor,visible))visible=target;
  }
  for(const sound of sounds){
    if(sound.sequence<=memory.lastSoundSequence)continue;memory.lastSoundSequence=sound.sequence;
    if(visible||sound.side===actor.side||distance(actor,sound.position)>AWARENESS_RULES.hearingRange*(world.terrain(sound.position).sound??1))continue;
    if(memory.state==='patrol'||tick>=memory.expiresAt)memory.reactAt=tick+AWARENESS_RULES.reactionTicks;
    memory.lastKnown=coarse(sound.position);memory.targetId=null;memory.state='investigate';memory.confidence=.4;memory.expiresAt=tick+AWARENESS_RULES.memoryTicks;
  }
  if(visible){
    if(memory.targetId!==visible.id)memory.reactAt=tick+AWARENESS_RULES.reactionTicks;
    memory.targetId=visible.id;memory.lastKnown={x:visible.x,z:visible.z};memory.confidence=1;memory.expiresAt=tick+AWARENESS_RULES.memoryTicks;memory.state='alerted';
  }else if(memory.targetId!==null){memory.targetId=null;memory.state='search';}
  if(memory.lastKnown&&tick>=memory.expiresAt){memory.lastKnown=null;memory.targetId=null;memory.confidence=0;memory.state='patrol';}
  if(memory.lastKnown&&tick>=memory.reactAt){const desired=Math.atan2(memory.lastKnown.x-actor.x,memory.lastKnown.z-actor.z),delta=angle(desired-actor.facing);actor.facing=angle(actor.facing+Math.max(-AWARENESS_RULES.turnPerTick,Math.min(AWARENESS_RULES.turnPerTick,delta)));}
  return visible&&tick>=memory.reactAt?visible:null;
}
export function shareAlert(source:PerceptionActor,memory:ThreatMemory,ally:PerceptionActor,allyMemory:ThreatMemory,tick:number):boolean {
  if(source.side!==ally.side||!memory.lastKnown||memory.confidence<.8||distance(source,ally)>AWARENESS_RULES.communicationRange)return false;
  if(allyMemory.confidence>=.8&&allyMemory.expiresAt>tick)return false;
  alertFromDamage(allyMemory,memory.lastKnown,tick);return true;
}
export function witnessLoss(actor:PerceptionActor,memory:ThreatMemory,clue:SoundClue,world:WorldQuery,tick:number):boolean {
  if(clue.sequence<=(memory.lastWitnessSequence??0))return false;memory.lastWitnessSequence=clue.sequence;
  const range=distance(actor,clue.position),dy=(clue.height??1.15)-actorEye(actor),rayRange=actor.traversal?Math.hypot(range,dy):range;
  if(clue.side!==actor.side||range>AWARENESS_RULES.visionRange||Math.abs(angle(Math.atan2(clue.position.x-actor.x,clue.position.z-actor.z)-actor.facing))>AWARENESS_RULES.fieldOfView/2||world.shotDistance({...actor,y:actorEye(actor)},{x:clue.position.x-actor.x,y:dy,z:clue.position.z-actor.z},rayRange+1)<rayRange-.7)return false;
  if(memory.confidence<.8){alertFromDamage(memory,clue.position,tick);memory.confidence=.6;memory.targetId=null;memory.state='investigate';}
  return true;
}
