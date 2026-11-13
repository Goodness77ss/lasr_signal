import {journeyActive,actorHealth,actorReserveLimit,actorWeapon,journeyThrow,type JourneyRun} from './encounter.ts';
import {GRENADE_RULES} from './grenades.ts';
import type {Vec3} from './world.ts';
import {SUPPLY_EFFECT_RULES} from './supply-rules.ts';
export {SUPPLY_EFFECT_RULES} from './supply-rules.ts';
export type SupplyUse={itemClass:0|1|2|3;actorId:number;direction?:Vec3};
/** Candidate only. Caller must atomically debit owned stock with persistence of this result. */
export function supplyEffect(before:JourneyRun,use:SupplyUse):JourneyRun|null {
 if(!journeyActive(before))return null;
 const run=structuredClone(before),actor=run.actors.find(actor=>actor.id===use.actorId);
 if(!actor||actor.side!==0||actor.hp<=0)return null;
 switch(use.itemClass){
  case 0:{const limit=actorHealth(run,actor);if(actor.hp>=limit)return null;actor.hp=Math.min(limit,actor.hp+SUPPLY_EFFECT_RULES.health);return run;}
  case 2:{const limit=actorReserveLimit(run,actor);if(actor.reserve>=limit)return null;actor.reserve=Math.min(limit,actor.reserve+actorWeapon(run,actor).magazine);return run;}
  case 1:{
   if(!actor.grenades||!use.direction)return null;
   // Owned unit fuels an actual throw, retaining the actor's undeployed grenade inventory.
   actor.grenades.quantity+=GRENADE_RULES.inventoryCost;
   if(!journeyThrow(run,use.direction,actor))return null;
   return run;
  }
  // Only the separately versioned supply rules carry mutable armour.
  case 3:{const cap=actor.build?.armour??0;if(!run.pin.rules.supplies||!cap||actor.armourRemaining===undefined||actor.armourRemaining>=cap)return null;actor.armourRemaining=Math.min(cap,actor.armourRemaining+SUPPLY_EFFECT_RULES.armour);return run;}
 }
 return null;
}


