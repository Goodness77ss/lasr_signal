import { distance } from '../rules.ts';
import { journeyLeader,journeyMove,journeyFire,journeyReload,journeyCheckpoint,journeyContinue,journeyPickup,type JourneyRun } from './encounter.ts';
import type { WorldQuery } from './world.ts';
import { encounterObjective } from './checkpoints.ts';

// Explicit development review driver. All effects use ordinary gameplay actions.
// It never edits health, enemies, inventory, rewards or checkpoint completion.
export function journeyReviewBot(run:JourneyRun,world:WorldQuery):boolean {
  if(run.state==='CHECKPOINT_REACHED')return journeyContinue(run).ok;
  if(run.state!=='ACTIVE')return false;
  const leader=journeyLeader(run),target=run.actors.filter(a=>a.side===1&&a.hp>0&&distance(leader,a)<run.pin.rules.rifleRange).sort((a,b)=>distance(leader,a)-distance(leader,b))[0];
  if(target)journeyFire(run,leader,{x:target.x-leader.x,y:-.65,z:target.z-leader.z},world);
  if(!leader.ammo)journeyReload(run);
  const objective=run.encounter&&!run.encounter.opened?encounterObjective(run.encounter.template):null;
  if(!leader.route.length)journeyMove(run,objective??journeyCheckpoint(run),world);
  return false;
}
// Ordinary commands only. Stops at the first checkpoint instead of continuing.
export function journeyLootReviewBot(run:JourneyRun,world:WorldQuery):boolean {
  if(!['ACTIVE','CHECKPOINT_REACHED'].includes(run.state))return false;
  if(run.state==='ACTIVE')journeyReviewBot(run,world);
  const drop=run.rewards?.drops.find(d=>d.state==='AVAILABLE');
  if(drop){if(journeyPickup(run,drop.id,world))return true;journeyMove(run,drop,world);}
  else if(run.state==='CHECKPOINT_REACHED'&&!run.actors[0].route.length)journeyMove(run,journeyCheckpoint(run),world);
  return false;
}
