import { distance } from '../rules.ts';
import type { JourneyRun,JourneyActor } from './encounter.ts';
import type { WorldQuery } from './world.ts';
import {journeyWeapon} from './weapons.ts';
export const REWARD_RULES=Object.freeze({version:'journey-rewards-1',veteranEverySections:3,veteranId:6,veteranHealth:120,dropCredits:5,pickupRadius:2,maxCheckpointCredits:100,maxDropCredits:50,bank:'TERMINAL',deadline:'NONE',value:'SIMULATED_CREDITS'} as const);
export type PracticeDrop={id:string;section:string;encounter:string;enemyId:number;x:number;y:number;z:number;credits:number;weapon?:{kind:0|1;buildId:'marksman-rifle'|'support-gun'};state:'AVAILABLE'|'PICKED'|'BANKED'|'FORFEITED'|'ABANDONED'};
export type JourneyRewards={version:typeof REWARD_RULES.version;checkpointEarned:number;dropCreated:number;dropPicked:number;provisionalLoot:number;bankedLoot:number;forfeitedLoot:number;drops:PracticeDrop[]};
export const emptyRewards=():JourneyRewards=>({version:REWARD_RULES.version,checkpointEarned:0,dropCreated:0,dropPicked:0,provisionalLoot:0,bankedLoot:0,forfeitedLoot:0,drops:[]});
export const enemyRank=(ordinal:string,id:number):'ordinary'|'veteran'=>id===REWARD_RULES.veteranId&&BigInt(ordinal)%BigInt(REWARD_RULES.veteranEverySections)===0n?'veteran':'ordinary';
export function defeatDrop(run:JourneyRun,enemy:JourneyActor,attackerSide:number):void {
  const rewards=run.rewards;if(!rewards||enemy.side!==1||enemy.hp!==0||enemy.rank!=='veteran'||attackerSide!==0||!run.encounter)return;
  const id=run.section+':enemy:'+enemy.id;
  if(rewards.drops.some(d=>d.id===id))return;
  const credits=Math.min(REWARD_RULES.dropCredits,REWARD_RULES.maxDropCredits-rewards.dropCreated);
  if(credits<=0)return;
  const kind=Number(BigInt(run.stream!.ordinal)%2n) as 0|1;
  rewards.dropCreated+=credits;rewards.drops.push({id,section:run.section,encounter:run.encounter.source,enemyId:enemy.id,x:enemy.x,y:enemy.traversal?.y??0,z:enemy.z,credits,...(run.pin.rules.battlefieldRecovery?{weapon:{kind,buildId:kind===0?'marksman-rifle' as const:'support-gun' as const}}:{}),state:'AVAILABLE'});
}
export function pickupDrop(run:JourneyRun,id:string,world:WorldQuery):boolean {
  const leader=run.actors[0],drop=run.rewards?.drops.find(d=>d.id===id);
  if(!drop||drop.state!=='AVAILABLE'||!['ACTIVE','CHECKPOINT_REACHED'].includes(run.state)||leader.hp<=0||Math.hypot(distance(leader,drop),(leader.traversal?.y??0)-drop.y)>REWARD_RULES.pickupRadius)return false;
  const length=distance(leader,drop),eye=(leader.traversal?.y??0)+(leader.motion?.pose==='crouched'?1:1.8);
  if(leader.traversal&&!leader.traversal.grounded||world.shotDistance({...leader,y:eye},{x:drop.x-leader.x,y:drop.y+.2-eye,z:drop.z-leader.z},Math.hypot(length,eye-drop.y-.2))<Math.hypot(length,eye-drop.y-.2)-.15)return false;
  drop.state='PICKED';run.rewards!.dropPicked+=drop.credits;run.rewards!.provisionalLoot+=drop.credits;
  if(drop.weapon&&run.pin.rules.battlefieldRecovery){const build=journeyWeapon(drop.weapon.buildId);leader.battlefieldWeapon={source:drop.id,buildId:drop.weapon.buildId};leader.ammo=build.magazine;leader.reserve=build.reserve;leader.reloadAt=0;}
  return true;
}
export function forfeitLoot(run:JourneyRun):void {
  const r=run.rewards;if(!r)return;r.forfeitedLoot+=r.provisionalLoot;r.provisionalLoot=0;
  for(const drop of r.drops)if(drop.state==='AVAILABLE'||drop.state==='PICKED')drop.state='FORFEITED';
}
export function bankLoot(run:JourneyRun):number {
  const r=run.rewards;if(!r)return 0;const amount=r.provisionalLoot;r.bankedLoot+=amount;r.provisionalLoot=0;
  for(const drop of r.drops)drop.state=drop.state==='PICKED'?'BANKED':drop.state==='AVAILABLE'?'ABANDONED':drop.state;
  return amount;
}
export function validateRewards(run:JourneyRun):void {
  const r=run.rewards;
  if(!run.pin.rules.rewards){if(r)throw Error('Unexpected Journey rewards');return;}
  const integer=(v:unknown,max:number)=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=max;
  if(!r||r.version!==REWARD_RULES.version||!integer(r.checkpointEarned,REWARD_RULES.maxCheckpointCredits)||![r.dropCreated,r.dropPicked,r.provisionalLoot,r.bankedLoot,r.forfeitedLoot].every(v=>integer(v,REWARD_RULES.maxDropCredits))||r.dropPicked>r.dropCreated||r.provisionalLoot+r.bankedLoot+r.forfeitedLoot!==r.dropPicked||run.practiceCredits>r.checkpointEarned||run.bankedPracticeCredits>r.checkpointEarned+r.bankedLoot||!Array.isArray(r.drops)||r.drops.length>1||new Set(r.drops.map(d=>d.id)).size!==r.drops.length)throw Error('Invalid Journey reward totals');
  if(run.state==='BANKED'?r.bankedLoot!==r.dropPicked||r.forfeitedLoot!==0||run.bankedPracticeCredits!==r.checkpointEarned+r.bankedLoot:r.bankedLoot!==0||run.bankedPracticeCredits!==0||(['ACTIVE','CHECKPOINT_REACHED'].includes(run.state)?r.forfeitedLoot!==0||run.practiceCredits!==r.checkpointEarned:r.forfeitedLoot!==r.dropPicked))throw Error('Inconsistent Journey reward lifecycle');
  for(const d of r.drops){
    if(run.pin.rules.battlefieldRecovery? !d.weapon||d.weapon.kind!==Number(BigInt(run.stream!.ordinal)%2n)||d.weapon.buildId!==(d.weapon.kind===0?'marksman-rifle':'support-gun'):d.weapon!==undefined)throw Error('Invalid battlefield recovery build');
    const enemy=run.actors.find(a=>a.id===d.enemyId);
    if(d.section!==run.section||d.encounter!==run.encounter?.source||d.id!==d.section+':enemy:'+d.enemyId||!enemy||enemy.side!==1||enemy.rank!=='veteran'||enemy.hp!==0||![d.x,d.y,d.z].every(Number.isFinite)||d.x!==enemy.x||d.z!==enemy.z||d.y!==(enemy.traversal?.y??0)||d.y<0||d.y>40||d.x<0||d.x>72||d.z<0||d.z>48||!integer(d.credits,REWARD_RULES.dropCredits)||d.credits===0||!['AVAILABLE','PICKED','BANKED','FORFEITED','ABANDONED'].includes(d.state))throw Error('Invalid Journey reward drop');
  }
  if(['QUIT','DEAD','BANKED'].includes(run.state)&&(r.provisionalLoot!==0||r.drops.some(d=>['AVAILABLE','PICKED'].includes(d.state))))throw Error('Unsettled Journey rewards');
}
