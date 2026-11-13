import {createWorld} from './world.ts';
import {EQUIPMENT_BUILDS} from './equipment.ts';
import {test,expect} from 'vitest';
import {createJourney,validateJourneyResume,journeyContinue,journeyWorld,journeyFire} from './encounter.ts';
import {supplyEffect} from './supplies.ts';
test('health and ammunition target living friendly actors and cap actual effect',async()=>{
 const run=await createJourney({streamed:true,classes:['vale','mara','beck']});
 expect(supplyEffect(run,{itemClass:0,actorId:1})).toBeNull();
 run.actors[0].hp=70;
 const healed=supplyEffect(run,{itemClass:0,actorId:1})!;
 expect(healed.actors[0].hp).toBe(80);expect(run.actors[0].hp).toBe(70);
 expect(supplyEffect(run,{itemClass:2,actorId:1})).toBeNull();
 run.actors[0].reserve=23;
 expect(supplyEffect(run,{itemClass:2,actorId:1})!.actors[0].reserve).toBe(25);
 run.actors[0].hp=0;
 expect(supplyEffect(run,{itemClass:0,actorId:1})).toBeNull();
 expect(supplyEffect(run,{itemClass:2,actorId:1})).toBeNull();
 expect(supplyEffect(run,{itemClass:3,actorId:1})).toBeNull();
});



test('supply rules pin bounded repairable armour and preserve old immutable runs',async()=>{
 const owner='0x'+'1'.repeat(40),collection='0x'+'2'.repeat(40);
 const run=await createJourney({supplies:true,streamed:true,roster:[{id:'development:rook',revision:1,loadout:'signature'},null,null],equipment:{owner,entries:[{actorId:1,asset:{kind:'gun',chainId:'31337',collection,tokenId:'1'},buildId:'support-gun',buildHash:EQUIPMENT_BUILDS['support-gun'],assetNonce:'0'}]}});
 expect(run.pin.rules.version).toBe('journey-practice-0.15.0');
 expect(run.actors[0].armourRemaining).toBe(25);
 expect(supplyEffect(run,{itemClass:3,actorId:1})).toBeNull();
 run.actors[0].armourRemaining=3;
 const repaired=supplyEffect(run,{itemClass:3,actorId:1})!;
 expect(repaired.actors[0].armourRemaining).toBe(25);
 expect(run.actors[0].armourRemaining).toBe(3);
 const combat=structuredClone(repaired),guard=combat.actors.find(actor=>actor.side===1)!;
 for(const actor of combat.actors)if(actor!==guard&&actor.side===1)actor.hp=0;
 Object.assign(combat.actors[0],{x:10,z:24});Object.assign(guard,{x:12,z:24});
 combat.actors[0].traversal!.y=0;guard.traversal!.y=0;
 expect(journeyFire(combat,guard,{x:-1,y:0,z:0},createWorld(72,48,[]))).toBe(true);
 expect(combat.actors[0].hp).toBeLessThan(120);
 expect(combat.actors[0].armourRemaining).toBe(24);
 await validateJourneyResume(repaired);
 const travelling=structuredClone(repaired);travelling.actors[0].armourRemaining=7;
 Object.assign(travelling.actors[0],travelling.sectionData!.checkpoint);
 travelling.actors[0].traversal!.y=journeyWorld(travelling).terrain(travelling.actors[0]).elevation;
 travelling.state='CHECKPOINT_REACHED';travelling.checkpointComplete=true;
 expect(journeyContinue(travelling).ok).toBe(true);
 expect(travelling.actors[0].armourRemaining).toBe(7);
 expect(travelling.actors.filter(actor=>actor.side===1).every(actor=>actor.armourRemaining===0)).toBe(true);
 await validateJourneyResume(travelling);
 repaired.actors[0].armourRemaining=26;
 await expect(validateJourneyResume(repaired)).rejects.toThrow('armour');
 const old=await createJourney({streamed:true,classes:['rook',null,null]});
 expect(old.actors[0].armourRemaining).toBeUndefined();
 expect(supplyEffect(old,{itemClass:3,actorId:1})).toBeNull();
});


