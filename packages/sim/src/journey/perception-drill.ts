import { createJourney,journeyFire,journeyStep,type JourneyRun } from './encounter.ts';
// Authored local test scenario. It is never an ordinary run or reward proof.
export async function createRearAttackDrill():Promise<JourneyRun>{
  const run=await createJourney({streamed:true,seed:1});
  Object.assign(run.actors[0],{x:25,z:24});Object.assign(run.actors[1],{x:7,z:44});Object.assign(run.actors[2],{x:5,z:44});
  Object.assign(run.actors[3],{x:20,z:24,facing:-Math.PI/2});return run;
}
export function fireRearDrillShot(run:JourneyRun):boolean {
  const leader=run.actors[0],guard=run.actors[3];return journeyFire(run,leader,{x:guard.x-leader.x,y:-.65,z:guard.z-leader.z});
}
export async function createTacticsDrill():Promise<JourneyRun>{
  const run=await createJourney({streamed:true,seed:1});Object.assign(run.actors[0],{x:30,z:24});Object.assign(run.actors[1],{x:5,z:44});Object.assign(run.actors[2],{x:7,z:44});
  for(const [index,z] of [24,29,20].entries())Object.assign(run.actors[index+3],{x:20,z,facing:Math.PI/2});return run;
}
