import {it,expect} from 'vitest';
import {createJourney,journeyFire,journeyReload,journeyStep,journeyPose,journeyAbility,validateJourneyResume,actorReserveLimit,actorWeapon} from '../packages/sim/src/journey/encounter.ts';
import {initialClassState,soldierClass,CLASS_RULES} from '../packages/sim/src/journey/classes.ts';
import {parseEquipmentSelection,pinEquipment,verifyEquipmentSnapshot,EQUIPMENT_BUILDS,type EquipmentEntry} from '../packages/sim/src/journey/equipment.ts';
import {JOURNEY_GUN_BUILDS} from '../packages/chain/src/journey-guns.ts';
import {createWorld} from '../packages/sim/src/journey/world.ts';
const owner='0x1111111111111111111111111111111111111111',collection='0x2222222222222222222222222222222222222222';
const entry=(buildId:EquipmentEntry['buildId']='marksman-rifle',actorId=1):EquipmentEntry=>({actorId,asset:{kind:'gun',chainId:'31337',collection,tokenId:String(actorId)},buildId,buildHash:EQUIPMENT_BUILDS[buildId],assetNonce:'0'});
const roster=(id='starter:1')=>[{id,revision:1,loadout:'signature' as const},null,null];
const make=(id='starter:1',buildId:EquipmentEntry['buildId']='marksman-rifle')=>createJourney({streamed:true,seed:5,roster:roster(id),equipment:{owner,entries:[entry(buildId)]}});
it('pins exact equipment identities and rejects duplicate assets, unknown builds and undeployed actors',async()=>{
 for(const build of JOURNEY_GUN_BUILDS)expect(EQUIPMENT_BUILDS[build.build.id as keyof typeof EQUIPMENT_BUILDS]).toBe(build.hash);
 const one=await pinEquipment(owner,[entry()]);expect(await pinEquipment(owner,[entry()])).toEqual(one);await verifyEquipmentSnapshot(one);
 expect((await pinEquipment(collection,[entry()])).hash).not.toBe(one.hash);
 for(const value of [[entry(),{...entry(),actorId:2}],[{...entry(),buildHash:EQUIPMENT_BUILDS['support-gun']}],[{...entry(),asset:{...entry().asset,tokenId:'01'}}]])expect(()=>parseEquipmentSelection(value)).toThrow();
 await expect(createJourney({streamed:true,roster:roster(),equipment:{owner,entries:[entry('marksman-rifle',2)]}})).rejects.toThrow('not deployed');
});
it('adds pinned equipment without granting a class or changing the roster signature entitlement',async()=>{
 const run=await make();expect(run.pin.rules.version).toBe('journey-practice-0.14.0');expect(run.actors[0].build?.weapon).toBe('marksman-rifle');expect(run.roster!.members[0].weapon).toBe('service-rifle');expect(run.actors[0].classState).toBeUndefined();expect(run.actors[0].ammo).toBe(5);expect(run.actors[0].reserve).toBe(25);await validateJourneyResume(structuredClone(run));
 const old=await createJourney({streamed:true,roster:roster(),rewards:true});expect(old.pin.rules.version).toBe('journey-practice-0.13.0');expect(old.equipment).toBeUndefined();expect(old.actors[0].ammo).toBe(20);await validateJourneyResume(old);
 const altered=structuredClone(old);altered.equipment=run.equipment;await expect(validateJourneyResume(altered)).rejects.toThrow('Unexpected Journey equipment');
});
it('uses the admitted weapon for firing cadence, ammunition and reload while retaining class modifiers',async()=>{
 const world=createWorld(72,48,[]);
 for(const [id,buildId,expectedReload] of [['starter:1','marksman-rifle',44],['development:imani','marksman-rifle',44],['development:rook','marksman-rifle',55],['development:mara','support-gun',60]] as const){
  const run=await make(id,buildId),actor=run.actors[0],weapon=actorWeapon(run,actor);for(const other of run.actors)if(other.side===1)other.hp=0;
  expect(journeyFire(run,actor,{x:1,y:0,z:0},world)).toBe(true);expect(actor.ammo).toBe(weapon.magazine-1);expect(journeyFire(run,actor,{x:1,y:0,z:0},world)).toBe(false);
  run.tick=weapon.interval-1;expect(journeyFire(run,actor,{x:1,y:0,z:0},world)).toBe(false);run.tick++;expect(journeyFire(run,actor,{x:1,y:0,z:0},world)).toBe(true);
  actor.ammo=0;expect(journeyReload(run)).toBe(true);expect(actor.reloadAt-run.tick).toBe(expectedReload);for(let i=0;i<expectedReload;i++)journeyStep(run,world);expect(actor.ammo).toBe(weapon.magazine);expect(actor.reserve).toBe(weapon.reserve-weapon.magazine);
 }
 const beck=await make('development:beck');expect(actorReserveLimit(beck,beck.actors[0])).toBe(49);
});
it('preserves equipment on resume and rejects tampered hashes, loadouts and oversized ammunition',async()=>{
 const run=await make('development:mara');await validateJourneyResume(structuredClone(run));
 for(const mutate of [(r:typeof run)=>{r.equipment!.entries[0].asset.tokenId='2';},(r:typeof run)=>{r.equipment!.entries[0].buildHash=EQUIPMENT_BUILDS['support-gun'];},(r:typeof run)=>{r.actors[0].build!.weapon='service-rifle';},(r:typeof run)=>{r.actors[0].ammo=20;}]){
  const edited=structuredClone(run);mutate(edited);await expect(validateJourneyResume(edited)).rejects.toThrow();
 }
});
it('applies admitted damage, range, obstruction and class armour without granting weapon abilities',async()=>{
 const world=createWorld(72,48,[]),wall=createWorld(72,48,[{x:6,z:20,w:.1,d:8,h:4}]);
 for(const buildId of ['marksman-rifle','support-gun'] as const){
  for(const id of ['starter:1','development:imani']){
   const run=await make(id,buildId),actor=run.actors[0],target=run.actors.find(a=>a.side===1)!,weapon=actorWeapon(run,actor);
   for(const other of run.actors)if(other!==actor&&other!==target)other.hp=0;
   Object.assign(actor,{x:5,z:24});Object.assign(target,{x:7,z:24,hp:100});
   expect(journeyFire(run,actor,{x:1,y:0,z:0},wall)).toBe(true);expect(target.hp).toBe(100);
   run.tick+=weapon.interval;expect(journeyFire(run,actor,{x:1,y:0,z:0},world)).toBe(true);expect(100-target.hp).toBe(Math.round(weapon.damage*(id==='development:imani'?.8:1)));
   target.hp=100;target.x=actor.x+weapon.range+1;run.tick+=weapon.interval;expect(journeyFire(run,actor,{x:1,y:0,z:0},world)).toBe(true);expect(target.hp).toBe(100);
  }
  // Authored armoured target exercises the same class protection used by players.
  const run=await make('starter:1',buildId),actor=run.actors[0],target=run.actors.find(a=>a.side===1)!,weapon=actorWeapon(run,actor),rook=soldierClass('rook');
  for(const other of run.actors)if(other!==actor&&other!==target)other.hp=0;
  Object.assign(actor,{x:5,z:24});Object.assign(target,{x:7,z:24,hp:rook.health,classState:initialClassState('rook')});
  expect(journeyFire(run,actor,{x:1,y:0,z:0},world)).toBe(true);expect(rook.health-target.hp).toBe(Math.round(weapon.damage*(100-rook.armour)/100));
  target.hp=rook.health;target.classState!.until=run.tick+CLASS_RULES.braceBonus+weapon.interval+1;run.tick+=weapon.interval;expect(journeyFire(run,actor,{x:1,y:0,z:0},world)).toBe(true);expect(rook.health-target.hp).toBe(Math.round(weapon.damage*(100-Math.min(CLASS_RULES.armourCap,rook.armour+CLASS_RULES.braceBonus))/100));
  expect(journeyAbility(run)).toBe(false);expect(actor.classState).toBeUndefined();
 }
});
it('retains Vale focus range only when that class activates it with admitted support equipment',async()=>{
 const world=createWorld(72,48,[]),run=await make('development:vale','support-gun'),actor=run.actors[0],target=run.actors.find(a=>a.side===1)!,weapon=actorWeapon(run,actor);
 for(const other of run.actors)if(other!==actor&&other!==target)other.hp=0;
 Object.assign(actor,{x:5,z:24});Object.assign(target,{x:5+weapon.range+3,z:24,hp:100});
 expect(journeyFire(run,actor,{x:1,y:0,z:0},world)).toBe(true);expect(target.hp).toBe(100);
 expect(journeyAbility(run)).toBe(false);expect(journeyPose(run,'crouched')).toBe(true);expect(journeyAbility(run)).toBe(true);run.tick+=weapon.interval;
 expect(journeyFire(run,actor,{x:1,y:0,z:0},world)).toBe(true);expect(target.hp).toBe(100-weapon.damage);
});
