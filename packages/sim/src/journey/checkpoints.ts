import { distance,type Point } from '../rules.ts';
import type { JourneySection } from './generator.ts';
import type { TacticalRole } from './tactics.ts';
export const ENCOUNTER_RULES=Object.freeze({crossingTicks:40,supplyTicks:30,objectiveRadius:3,contestRadius:8,maxTier:4,sectionsPerTier:3});
export type EncounterState={template:JourneySection['template'];progress:number;opened:boolean;tier:number;source:string};
export type EncounterActor=Point&{id:number;side:0|1;hp:number};
export function encounterRole(tier:number,id:number):TacticalRole {
  const groups:readonly (readonly TacticalRole[])[]=[['defender','flanker','support'],['defender','flanker','flanker'],['flanker','support','flanker'],['support','flanker','support'],['flanker','flanker','support']];
  return groups[Math.max(0,Math.min(ENCOUNTER_RULES.maxTier,tier))][(id-4)%3];
}
export function createEncounter(section:JourneySection):EncounterState {
  const ordinalTier=BigInt(section.ordinal)/BigInt(ENCOUNTER_RULES.sectionsPerTier),tier=Number(ordinalTier>BigInt(ENCOUNTER_RULES.maxTier)?BigInt(ENCOUNTER_RULES.maxTier):ordinalTier);
  return {template:section.template,progress:0,opened:false,tier,source:section.id+':checkpoint'};
}
export function encounterObjective(template:JourneySection['template']):Point|null {
  return template==='crossing'?{x:50,z:24}:template==='supply-route'?{x:55,z:24}:null;
}
export function stepEncounter(state:EncounterState,leader:EncounterActor,actors:readonly EncounterActor[],grounded=true):void {
  if(state.opened||leader.hp<=0)return;
  const enemies=actors.filter(a=>a.side===1&&a.hp>0);
  if(state.template==='road-ambush'){state.opened=enemies.length===0;return;}
  const objective=encounterObjective(state.template)!;
  const requiredClear=state.template==='crossing'?!enemies.some(a=>a.id===4||a.id===5):!enemies.some(a=>a.id===4);
  const uncontested=!enemies.some(a=>distance(a,objective)<ENCOUNTER_RULES.contestRadius);
  if(grounded&&requiredClear&&uncontested&&distance(leader,objective)<=ENCOUNTER_RULES.objectiveRadius)state.progress++;
  else state.progress=Math.max(0,state.progress-1);
  state.opened=state.progress>=(state.template==='crossing'?ENCOUNTER_RULES.crossingTicks:ENCOUNTER_RULES.supplyTicks);
}
