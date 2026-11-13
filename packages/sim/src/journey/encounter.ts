import { GRENADE_RULES,seesGrenade,launchGrenade,stepGrenade,grenadeDamage,type Grenade } from './grenades.ts';
import { CLASS_RULES,soldierClass,initialClassState,type SoldierClassState,type SoldierClassId } from './classes.ts';
import { journeyWeapon,traceJourneyWeapon,type JourneyWeaponId } from './weapons.ts';
import { pinEquipment,validateEquipmentSnapshot,verifyEquipmentSnapshot,type EquipmentEntry,type EquipmentSnapshot } from './equipment.ts';
import { resolveRoster,pinRoster,validateRosterSnapshot,verifyRosterSnapshot,type RosterSnapshot,type RosterSelection,type RosterCatalogueEntry } from './roster.ts';
import { JOURNEY_COMBINED_STREAM_RULES,JOURNEY_RECOVERY_STREAM_RULES,JOURNEY_OWNED_STREAM_RULES,JOURNEY_SUPPLY_STREAM_RULES,JOURNEY_REWARD_STREAM_RULES,JOURNEY_EQUIPMENT_STREAM_RULES } from './rules.ts';
import { REWARD_RULES,emptyRewards,enemyRank,defeatDrop,pickupDrop,bankLoot,forfeitLoot,validateRewards,type JourneyRewards } from './rewards.ts';
import { emptyTraversal,startJump,startVault,planVault,planJump,stepTraversal,moveTraversal,validateTraversal,traversalBodyClear,type TraversalState } from './traversal.ts';
import { emptyMotion,setPose,startDodge,dodgeStep,sweepBody,bodyClear,eyeHeight,bodyHeight,rayBodyDistance,MOTION_RULES,type MotionState,type Pose } from './motion.ts';
import { distance, type Point } from '../rules.ts';
import { pinJourneyRules, verifyJourneyPin,validateJourneyRules,JOURNEY_STREAM_RULES,JOURNEY_CLASS_STREAM_RULES,JOURNEY_ROSTER_STREAM_RULES, type JourneyPin } from './rules.ts';
import { ROAD_SECTION, roadWorld,createWorld, type WorldQuery, type Vec3 } from './world.ts';
import { JourneyWindow,type JourneyStream } from './streaming.ts';
import { generateSection,sectionOrdinal,type JourneySection } from './generator.ts';
import { regionWorld } from './regions.ts';
import { perceive,emptyAwareness,alertFromDamage,shareAlert,witnessLoss,validateAwareness,type ThreatMemory } from './awareness.ts';
import { chooseTactic,emptyTactics,TACTICAL_RULES,type TacticalState } from './tactics.ts';
import { createEncounter,stepEncounter,encounterRole,ENCOUNTER_RULES,type EncounterState } from './checkpoints.ts';

export type JourneyWaypoint=Point&{traverseDirection?:Point;traverseKind?:'jump'|'vault'};
export type JourneyActor = Point & {
  id: number; side: 0 | 1; role: 'leader' | 'helper' | 'guard'; hp: number;
  ammo: number; reserve: number; fireAt: number; reloadAt: number;
  facing: number; moving: boolean; route: JourneyWaypoint[];
  awareness?:ThreatMemory;
  tactics?:TacticalState;
  motion?:MotionState;
  traversal?:TraversalState;
  classState?:SoldierClassState;
  rank?:'ordinary'|'veteran';
  battlefieldWeapon?:{source:string;buildId:'marksman-rifle'|'support-gun'};
  armourRemaining?:number;
  grenades?:{quantity:number;nextThrowAt:number};
  build?:{classId:'starter-rifle'|SoldierClassId;armour:number;weapon:JourneyWeaponId;pose:Pose;abilityUntil:number;entitlement:'free-starter'|'encounter'|'local-development'|'owned-collectible'};
};
const starterBuild=(side:0|1):NonNullable<JourneyActor['build']>=>({classId:'starter-rifle',armour:0,weapon:'service-rifle',pose:'standing',abilityUntil:0,entitlement:side===0?'free-starter':'encounter'});
export type JourneyEvent = { seq: number; kind: 'shot' | 'hit' | 'down' | 'checkpoint' | 'bank' | 'quit' | 'throw' | 'bounce' | 'explosion' | 'ability'; from: Point; to: Point; side: number; height: number;text?:string;originHeight?:number;victimSide?:0|1;projectile?:number;section?:string;source?:string };
export type JourneyRun = {
  pin: JourneyPin; section: string; tick: number; actors: JourneyActor[];
  state: 'ACTIVE' | 'CHECKPOINT_REACHED' | 'BANKED' | 'DEAD' | 'QUIT';
  practiceCredits: number; bankedPracticeCredits: number; checkpointComplete: boolean;
  events: JourneyEvent[]; eventSeq: number; target: Point | null; drive: Point; driveUntil: number;
  stream:JourneyStream|null; sectionData:JourneySection|null;
  encounter?:EncounterState;
  projectiles?:Grenade[];projectileSeq?:number;
  roster?:RosterSnapshot;
  rewards?:JourneyRewards;
  equipment?:EquipmentSnapshot;
  ownedOwner?:string;
};
export async function createJourney(options:{combined?:boolean;recovery?:boolean;ownedOwner?:string;supplies?:boolean;streamed?:boolean;seed?:number;classes?:readonly (SoldierClassId|null)[];roster?:RosterSelection;catalogue?:readonly RosterCatalogueEntry[];rewards?:boolean;equipment?:{owner:string;entries:EquipmentEntry[]}}={}): Promise<JourneyRun> {
  if(options.combined&&(!options.ownedOwner||options.recovery||options.equipment&&options.equipment.owner.toLowerCase()!==options.ownedOwner))throw Error('Combined entry needs one authenticated owner');
  if(options.recovery&&(!options.equipment||options.ownedOwner))throw Error('Recovery entry requires an authenticated equipment roster');
  if(options.supplies&&!options.equipment)throw Error('Supplies require authenticated equipment entry');
  if(options.equipment&&!options.roster)throw Error('Equipment requires an explicit roster');
  if(options.rewards&&!options.roster)throw Error('Reward practice requires an explicit roster');
  if(options.roster&&(!options.streamed||options.classes))throw Error('Choose one roster entry model.');
  const members=options.roster?resolveRoster(options.roster,options.catalogue):undefined;
  if(members?.some(member=>member.source==='soldier-token')&&!options.ownedOwner)throw Error('Owned roster rules admission required');
  if(options.ownedOwner&&(!/^0x[0-9a-f]{40}$/.test(options.ownedOwner)||!members?.some(member=>member.source==='soldier-token')||!!options.equipment&&!options.combined))throw Error('Explicit owned roster admission required');
  const selectedClasses=members?[1,2,3].map(actorId=>{const m=members.find(m=>m.actorId===actorId);return m&&m.classId!=='starter-rifle'?m.classId:null;}):options.classes;
  if(options.classes&&(!options.streamed||options.classes.length!==3))throw Error('Class practice needs three explicit roster slots');
  for(const id of options.classes??[])if(id!==null)soldierClass(id);
  const pin=await pinJourneyRules(options.combined?JOURNEY_COMBINED_STREAM_RULES:options.recovery?JOURNEY_RECOVERY_STREAM_RULES:options.ownedOwner?JOURNEY_OWNED_STREAM_RULES:options.supplies?JOURNEY_SUPPLY_STREAM_RULES:options.equipment?JOURNEY_EQUIPMENT_STREAM_RULES:options.rewards?JOURNEY_REWARD_STREAM_RULES:members?JOURNEY_ROSTER_STREAM_RULES:options.classes?JOURNEY_CLASS_STREAM_RULES:options.streamed?JOURNEY_STREAM_RULES:undefined),r=pin.rules;
  const roster=members?await pinRoster(members):undefined;
  const equipment=options.equipment?await pinEquipment(options.equipment.owner,options.equipment.entries):undefined;
  if(equipment?.entries.some(entry=>!members?.some(member=>member.actorId===entry.actorId)))throw Error('Equipment actor is not deployed');
  const stream:JourneyStream|null=options.streamed?{seed:options.seed??1,ordinal:'0',completedThrough:null}:null;
  const sectionData=stream?new JourneyWindow(stream).current():null,spawn=sectionData?.spawn??ROAD_SECTION.spawn;
  const enemies=sectionData?.enemySpawns??[{x:34,z:24},{x:49,z:23},{x:58,z:26}];
  const actor=(id:number,side:0|1,role:JourneyActor['role'],x:number,z:number):JourneyActor=>({id,side,role,x,z,hp:r.health,ammo:r.magazine,reserve:r.reserve,fireAt:-100,reloadAt:0,facing:side===1&&['journey-practice-0.5.0','journey-practice-0.6.0','journey-practice-0.7.0','journey-practice-0.8.0','journey-practice-0.9.0','journey-practice-0.10.0','journey-practice-0.11.0','journey-practice-0.12.0','journey-practice-0.13.0','journey-practice-0.14.0','journey-practice-0.15.0','journey-practice-0.16.0','journey-practice-0.17.0','journey-practice-0.18.0'].includes(r.version)?-Math.PI/2:Math.PI/2,moving:false,route:[],...(r.grenades?{grenades:{quantity:side===0?GRENADE_RULES.starterQuantity:0,nextThrowAt:0}}:{}),...(r.motion?{motion:emptyMotion()}:{}),...(r.traversal?{traversal:emptyTraversal()}:{}),...(['journey-practice-0.3.0','journey-practice-0.4.0','journey-practice-0.5.0','journey-practice-0.6.0','journey-practice-0.7.0','journey-practice-0.8.0','journey-practice-0.9.0','journey-practice-0.10.0','journey-practice-0.11.0','journey-practice-0.12.0','journey-practice-0.13.0','journey-practice-0.14.0','journey-practice-0.15.0','journey-practice-0.16.0','journey-practice-0.17.0','journey-practice-0.18.0'].includes(r.version)?{build:starterBuild(side)}:{})});
  let actors=[actor(1,0,'leader',spawn.x,spawn.z),actor(2,0,'helper',spawn.x-2,spawn.z-2),actor(3,0,'helper',spawn.x-2,spawn.z+2),...enemies.map((p,i)=>actor(4+i,1,'guard',p.x,p.z))];
  selectedClasses?.forEach((id,index)=>{if(!id)return;const p=soldierClass(id),weapon=journeyWeapon(p.weapon);Object.assign(actors[index],{hp:p.health,ammo:weapon.magazine,reserve:weapon.reserve,classState:initialClassState(id),grenades:{quantity:p.grenades,nextThrowAt:0},build:{classId:id,armour:p.armour,weapon:p.weapon,pose:'standing',abilityUntil:0,entitlement:'local-development'}});});
  if(members)actors=actors.filter(a=>a.side===1||members.some(m=>m.actorId===a.id));
  for(const entry of equipment?.entries??[]){const actor=actors.find(actor=>actor.id===entry.actorId)!,weapon=journeyWeapon(entry.buildId);actor.build!.weapon=entry.buildId;actor.ammo=weapon.magazine;actor.reserve=weapon.reserve;}
  if(r.rewards)for(const a of actors.filter(a=>a.side===1)){a.rank=enemyRank(stream!.ordinal,a.id);if(a.rank==='veteran')a.hp=REWARD_RULES.veteranHealth;}
  if(r.supplies)for(const a of actors)a.armourRemaining=a.build?.armour??0;
  if(options.ownedOwner)for(const a of actors)if(members?.find(m=>m.actorId===a.id)?.source==='soldier-token')a.build!.entitlement='owned-collectible';
  return {pin,...(options.ownedOwner?{ownedOwner:options.ownedOwner}:{}),section:sectionData?.id??ROAD_SECTION.id,tick:0,state:'ACTIVE',actors,...(roster?{roster}:{}),...(equipment?{equipment}:{}),...(r.rewards?{rewards:emptyRewards()}:{}),practiceCredits:0,bankedPracticeCredits:0,checkpointComplete:false,events:[],eventSeq:0,target:null,drive:{x:0,z:0},driveUntil:0,stream,sectionData,...(r.grenades?{projectiles:[],projectileSeq:0}:{}),...(sectionData&&['journey-practice-0.7.0','journey-practice-0.8.0','journey-practice-0.9.0','journey-practice-0.10.0','journey-practice-0.11.0','journey-practice-0.12.0','journey-practice-0.13.0','journey-practice-0.14.0','journey-practice-0.15.0','journey-practice-0.16.0','journey-practice-0.17.0','journey-practice-0.18.0'].includes(r.version)?{encounter:createEncounter(sectionData)}:{})};
}
export const journeyLeader=(run:Pick<JourneyRun,'actors'>)=>run.actors[0];
export const actorElevation=(actor:{traversal?:{y:number}})=>actor.traversal?.y??0;
export const actorEye=(actor:Pick<JourneyActor,'motion'|'traversal'>)=>actorElevation(actor)+eyeHeight(actor.motion?.pose??'standing');
export const actorClass=(run:Pick<JourneyRun,'pin'>,actor:JourneyActor)=>run.pin.rules.classes&&actor.classState?soldierClass(actor.classState.id):null;
export const actorHealth=(run:JourneyRun,actor:JourneyActor)=>run.pin.rules.rewards&&actor.side===1&&actor.rank==='veteran'?REWARD_RULES.veteranHealth:actorClass(run,actor)?.health??run.pin.rules.health;
export const actorVision=(run:JourneyRun,actor:JourneyActor)=>{const p=actorClass(run,actor);return p?p.vision+(actor.classState!.until>run.tick?(p.ability==='recon'?CLASS_RULES.reconBonus:p.ability==='focus'?CLASS_RULES.focusBonus:0):0):run.pin.rules.vision;};
export const actorSpeed=(run:JourneyRun,actor:JourneyActor)=>{const p=actorClass(run,actor);return (p?.speed??run.pin.rules.speed)*(p?.ability==='focus'&&actor.classState!.until>run.tick?CLASS_RULES.focusSpeedPercent/100:1);};
export const actorEquipment=(run:JourneyRun,actor:JourneyActor)=>run.pin.rules.equipment?run.equipment?.entries.find(entry=>entry.actorId===actor.id):undefined;
export const actorWeapon=(run:JourneyRun,actor:JourneyActor)=>journeyWeapon(actor.battlefieldWeapon?.buildId??actorEquipment(run,actor)?.buildId??actorClass(run,actor)?.weapon??'service-rifle');
export const actorReserveLimit=(run:JourneyRun,actor:JourneyActor)=>{const p=actorClass(run,actor);return actor.battlefieldWeapon||p||actorEquipment(run,actor)?actorWeapon(run,actor).reserve+(p?.ability==='resupply'?CLASS_RULES.maxExtraReserve:0):run.pin.rules.reserve;};
const actorMagazine=(run:JourneyRun,actor:JourneyActor)=>actor.battlefieldWeapon||actorClass(run,actor)||actorEquipment(run,actor)?actorWeapon(run,actor).magazine:run.pin.rules.magazine;
const actorReloadTicks=(run:JourneyRun,actor:JourneyActor)=>{const p=actorClass(run,actor);return actor.battlefieldWeapon||p||actorEquipment(run,actor)?Math.ceil(actorWeapon(run,actor).reloadTicks*(p?.reloadPercent??100)/100):run.pin.rules.reloadTicks;};
const damageAfterArmour=(run:JourneyRun,actor:JourneyActor,amount:number)=>{const p=actorClass(run,actor),armour=p?Math.min(CLASS_RULES.armourCap,(run.pin.rules.supplies?actor.armourRemaining??0:p.armour)+(p.ability==='brace'&&actor.classState!.until>run.tick?CLASS_RULES.braceBonus:0)):0;if(run.pin.rules.supplies&&actor.armourRemaining)actor.armourRemaining=Math.max(0,actor.armourRemaining-run.pin.rules.supplies.armourWearPerHit);return Math.max(1,Math.round(amount*(100-armour)/100));};
const onRouteGround=(run:JourneyRun,actor:JourneyActor,world:WorldQuery)=>!run.pin.rules.traversal||!!actor.traversal?.grounded&&!actor.traversal.vault&&Math.abs(actor.traversal.y-world.terrain(actor).elevation)<1e-7;
export const journeyActive=(run:JourneyRun)=>run.state==='ACTIVE'||run.state==='CHECKPOINT_REACHED';
export function journeyThrow(run:JourneyRun,aim:Vec3,actor=journeyLeader(run),world=journeyWorld(run)):boolean {
  if(!journeyActive(run)||actor.hp<=0||!run.pin.rules.grenades||!actor.grenades||actor.grenades.quantity<GRENADE_RULES.inventoryCost||run.tick<actor.grenades.nextThrowAt||!run.projectiles||run.projectiles.length>=GRENADE_RULES.maxActive)return false;
  const id=(run.projectileSeq??0)+1,grenade=launchGrenade(id,actor.id,actor.side,{x:actor.x,y:actorEye(actor),z:actor.z},aim,run.tick,world);
  if(!grenade)return false;
  run.projectileSeq=id;run.projectiles.push(grenade);actor.grenades.quantity-=GRENADE_RULES.inventoryCost;actor.grenades.nextThrowAt=run.tick+GRENADE_RULES.cooldownTicks;
  emit(run,'throw',actor,actor,actor.side,grenade.position.y);run.events.at(-1)!.projectile=id;return true;
}
function stepJourneyGrenades(run:JourneyRun,world:WorldQuery):void {
  for(const grenade of [...(run.projectiles??[])])for(const event of stepGrenade(grenade,run.tick,world)){
    emit(run,event.kind,event.position,event.position,grenade.side,event.position.y);run.events.at(-1)!.projectile=grenade.id;
    if(event.kind!=='explosion')continue;
    // Resolve the whole blast before deciding leader death, including friendly fire.
    for(const actor of run.actors){if(actor.hp<=0)continue;const damage=grenadeDamage(grenade.position,{x:actor.x,y:actorElevation(actor)+bodyHeight(actor.motion?.pose??'standing')/2,z:actor.z},world);if(!damage)continue;
      actor.hp=Math.max(0,actor.hp-damageAfterArmour(run,actor,damage));emit(run,actor.hp?'hit':'down',grenade.position,actor,grenade.side,run.pin.rules.traversal?actorElevation(actor)+bodyHeight(actor.motion?.pose??'standing')/2:1.1);run.events.at(-1)!.victimSide=actor.side;defeatDrop(run,actor,grenade.side);
    }
    run.projectiles=run.projectiles!.filter(p=>p.id!==grenade.id);
  }
}
export function journeyPose(run:JourneyRun,pose:Pose,actor=journeyLeader(run),world=journeyWorld(run)):boolean {
  if(!journeyActive(run)||actor.hp<=0||!actor.motion||!actor.build||run.pin.rules.traversal&&!actor.traversal?.grounded||!setPose(actor.motion,pose,{...actor,y:actorElevation(actor)},world,run.tick))return false;
  actor.build.pose=pose;return true;
}
export function journeyDodge(run:JourneyRun,direction:Point,actor=journeyLeader(run)):boolean {
  if(!journeyActive(run)||actor.hp<=0||!actor.motion||!actor.build||run.pin.rules.traversal&&!actor.traversal?.grounded||!startDodge(actor.motion,direction,run.tick))return false;
  actor.build.abilityUntil=actor.motion.dodgeUntil;actor.route=[];return true;
}
export function journeyJump(run:JourneyRun,actor=journeyLeader(run),world=journeyWorld(run)):boolean {
  if(!journeyActive(run)||actor.hp<=0||!run.pin.rules.traversal||!actor.traversal||!actor.motion||run.tick<actor.motion.dodgeUntil)return false;
  return startJump(actor.traversal,actor,actor.motion.pose,world,run.tick);
}
export function journeyVault(run:JourneyRun,direction:Point,actor=journeyLeader(run),world=journeyWorld(run)):boolean {
  if(!journeyActive(run)||actor.hp<=0||!run.pin.rules.traversal||!actor.traversal||!actor.motion||run.tick<actor.motion.dodgeUntil)return false;
  if(!startVault(actor.traversal,actor,direction,actor.motion.pose,world,run.tick))return false;
  actor.route=[];return true;
}
export const journeyCheckpoint=(run:{sectionData:Pick<JourneySection,'checkpoint'>|null})=>run.sectionData?.checkpoint??ROAD_SECTION.checkpoint;
export const journeyWorld=(run:Pick<JourneyRun,'pin'>&{sectionData:Pick<JourneySection,'region'|'solids'|'spawn'|'checkpoint'>|null}):WorldQuery=>run.sectionData?(['journey-practice-0.4.0','journey-practice-0.5.0','journey-practice-0.6.0','journey-practice-0.7.0','journey-practice-0.8.0','journey-practice-0.9.0','journey-practice-0.10.0','journey-practice-0.11.0','journey-practice-0.12.0','journey-practice-0.13.0','journey-practice-0.14.0','journey-practice-0.15.0','journey-practice-0.16.0','journey-practice-0.17.0','journey-practice-0.18.0'].includes(run.pin.rules.version)?regionWorld(run.sectionData):createWorld(72,48,run.sectionData.solids,[run.sectionData.spawn,run.sectionData.checkpoint])):roadWorld();
export const journeyPickup=(run:JourneyRun,id:string,world=journeyWorld(run))=>pickupDrop(run,id,world);
export function validateJourneyState(run:JourneyRun):void {
  if(!run||typeof run!=='object'||!run.pin||!run.pin.rules)throw Error('Invalid Journey snapshot');
  validateJourneyRules(run.pin.rules);
  validateRewards(run);
  const r=run.pin.rules,integer=(n:unknown,min:number,max:number)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max;
  if(r.grenades){
    if(!integer(run.projectileSeq,0,Number.MAX_SAFE_INTEGER)||!Array.isArray(run.projectiles)||run.projectiles.length>GRENADE_RULES.maxActive||new Set(run.projectiles.map(p=>p.id)).size!==run.projectiles.length)throw Error('Invalid Journey projectile capacity');
    for(const p of run.projectiles)if(!integer(p.id,1,run.projectileSeq!)||!integer(p.owner,1,6)||p.side!==(p.owner<=3?0:1)||!integer(p.born,0,run.tick)||p.explodeAt!==p.born+GRENADE_RULES.fuseTicks||p.explodeAt<=run.tick||!integer(p.bounces,0,GRENADE_RULES.maxBounces)||typeof p.resting!=='boolean'||![p.position?.x,p.position?.y,p.position?.z,p.velocity?.x,p.velocity?.y,p.velocity?.z,p.travel].every(Number.isFinite)||p.position.x<0||p.position.x>r.width||p.position.z<0||p.position.z>r.depth||p.position.y<0||p.position.y>40||Math.hypot(p.velocity.x,p.velocity.y,p.velocity.z)>48||p.travel<0||p.travel>GRENADE_RULES.maxDistance+.00001||p.resting&&Math.hypot(p.velocity.x,p.velocity.y,p.velocity.z)!==0)throw Error('Invalid Journey projectile');
  }
  if(['journey-practice-0.7.0','journey-practice-0.8.0','journey-practice-0.9.0','journey-practice-0.10.0','journey-practice-0.11.0','journey-practice-0.12.0','journey-practice-0.13.0','journey-practice-0.14.0','journey-practice-0.15.0','journey-practice-0.16.0','journey-practice-0.17.0','journey-practice-0.18.0'].includes(r.version)){
    if(!run.sectionData||!run.encounter)throw Error('Missing Journey encounter');
    const expected=createEncounter(run.sectionData),encounter=run.encounter,required=encounter.template==='crossing'?ENCOUNTER_RULES.crossingTicks:encounter.template==='supply-route'?ENCOUNTER_RULES.supplyTicks:0;
    if(encounter.source!==expected.source||encounter.template!==expected.template||encounter.tier!==expected.tier||!integer(encounter.progress,0,required)||typeof encounter.opened!=='boolean'||encounter.opened&&encounter.progress<required||run.checkpointComplete&&!encounter.opened)throw Error('Invalid Journey encounter state');
  }
  if(!integer(run.tick,0,Number.MAX_SAFE_INTEGER)||!integer(run.eventSeq,0,Number.MAX_SAFE_INTEGER)||!integer(run.practiceCredits,0,Number.MAX_SAFE_INTEGER)||!integer(run.bankedPracticeCredits,0,Number.MAX_SAFE_INTEGER)||!['ACTIVE','CHECKPOINT_REACHED','BANKED','DEAD','QUIT'].includes(run.state)||typeof run.checkpointComplete!=='boolean')throw Error('Invalid Journey lifecycle values');
  if(run.roster?.members.some(member=>member.source==='soldier-token')&&!r.ownedRoster)throw Error('Owned roster rules admission required');
  if(r.ownedRoster?typeof run.ownedOwner!=='string'||!/^0x[0-9a-f]{40}$/.test(run.ownedOwner)||!run.roster?.members.some(member=>member.source==='soldier-token'):run.ownedOwner!==undefined)throw Error('Invalid owned roster owner');
  if(r.roster)validateRosterSnapshot(run.roster);else if(run.roster)throw Error('Unexpected Journey roster snapshot');
  if(r.equipment&&(!r.combinedLoadout||run.equipment)){validateEquipmentSnapshot(run.equipment);if(run.equipment!.entries.some(entry=>!run.roster!.members.some(member=>member.actorId===entry.actorId)))throw Error('Equipment actor is not deployed');}else if(run.equipment)throw Error('Unexpected Journey equipment snapshot');
  if(r.combinedLoadout&&run.equipment&&run.equipment.owner!==run.ownedOwner)throw Error('Combined equipment owner mismatch');
  const expectedActorIds=r.roster?[...run.roster!.members.map(m=>m.actorId),4,5,6]:[1,2,3,4,5,6];
  if(!Array.isArray(run.actors)||run.actors.length!==expectedActorIds.length||new Set(run.actors.map(a=>a.id)).size!==expectedActorIds.length||!Array.isArray(run.events)||run.events.length>64)throw Error('Invalid Journey actor or event capacity');
  if(r.roster&&run.projectiles?.some(p=>!run.actors.some(a=>a.id===p.owner)))throw Error('Projectile owner is not deployed');
  const world=journeyWorld(run);
  const actorClear=(actor:JourneyActor)=>r.traversal?traversalBodyClear(world,{...actor,y:actorElevation(actor)},actor.motion?.pose??'standing'):actor.motion?bodyClear(world,actor,actor.motion.pose):world.walkable(actor);
  for(const [index,actor] of run.actors.entries()){
    if(actor.battlefieldWeapon&&(!r.battlefieldRecovery||actor.id!==1||!run.rewards?.drops.some(drop=>drop.id===actor.battlefieldWeapon!.source&&drop.weapon?.buildId===actor.battlefieldWeapon!.buildId&&['PICKED','BANKED','FORFEITED'].includes(drop.state))))throw Error('Unbacked battlefield weapon');
    if(r.supplies?!Number.isSafeInteger(actor.armourRemaining)||actor.armourRemaining!<0||actor.armourRemaining!>(actor.build?.armour??0):actor.armourRemaining!==undefined)throw Error('Invalid mutable armour state');
    if(r.rewards?(actor.side===1?actor.rank!==enemyRank(run.stream!.ordinal,actor.id):actor.rank!==undefined):actor.rank!==undefined)throw Error('Invalid Journey enemy rank');
    if(r.roster&&actor.side===0){const member=run.roster!.members.find(m=>m.actorId===actor.id);if(!member||member.classId!==(actor.classState?.id??'starter-rifle')||(actorEquipment(run,actor)?.buildId??member.weapon)!==actor.build?.weapon||(member.source==='soldier-token'?'owned-collectible':member.source)!==actor.build?.entitlement)throw Error('Journey actor differs from entry loadout');}
    if(actor.classState){
      if(!r.classes||actor.side!==0)throw Error('Unsupported Journey class deployment');
      const p=actorClass(run,actor)!,state=actor.classState;
      if(state.version!==CLASS_RULES.version||!integer(state.medicalCharges,0,p.medicalCharges)||!integer(state.ammoCharges,0,p.ammoCharges)||!integer(state.readyAt,0,run.tick+p.cooldown)||!integer(state.until,0,run.tick+p.duration)||
        p.duration===0&&state.until!==0||p.duration>0&&(state.until===0?state.readyAt!==0:state.readyAt!==state.until+p.cooldown-p.duration)||
        !actor.build||actor.build.classId!==p.id||actor.build.weapon!==(actorEquipment(run,actor)?.buildId??p.weapon)||actor.build.armour!==p.armour||actor.build.entitlement!==(r.ownedRoster&&run.roster?.members.find(member=>member.actorId===actor.id)?.source==='soldier-token'?'owned-collectible':'local-development')||actor.build.pose!==actor.motion?.pose||actor.build.abilityUntil!==actor.motion?.dodgeUntil)throw Error('Invalid Journey class build or ability');
    }
    if(r.traversal){if(!actor.traversal)throw Error('Missing Journey traversal');validateTraversal(actor.traversal,actor,actor.motion?.pose??'standing',world,run.tick);}
    for(const waypoint of actor.route??[])if(waypoint.traverseDirection){const direction=waypoint.traverseDirection;if(!r.traversal||!['jump','vault'].includes(waypoint.traverseKind??'')||![direction.x,direction.z].every(Number.isFinite)||Math.abs(Math.hypot(direction.x,direction.z)-1)>1e-7||!(waypoint.traverseKind==='jump'?planJump(waypoint,direction,'standing',world,actorSpeed(run,actor)):planVault(emptyTraversal(world.terrain(waypoint).elevation),waypoint,direction,'standing',world,run.tick)))throw Error('Invalid Journey traversal waypoint');}
    if(r.motion&&(!actor.motion||!['standing','crouched'].includes(actor.motion.pose)||!integer(actor.motion.dodgeUntil,0,run.tick+MOTION_RULES.dodgeTicks)||!integer(actor.motion.nextDodgeAt,0,run.tick+MOTION_RULES.dodgeCooldown)||![actor.motion.direction.x,actor.motion.direction.z].every(Number.isFinite)||Math.hypot(actor.motion.direction.x,actor.motion.direction.z)>1.001||!actorClear(actor)))throw Error('Invalid Journey motion');
    if(r.motion&&actor.motion){const motion=actor.motion,length=Math.hypot(motion.direction.x,motion.direction.z);if(motion.dodgeUntil===0?motion.nextDodgeAt!==0||length!==0:motion.nextDodgeAt!==motion.dodgeUntil+MOTION_RULES.dodgeCooldown-MOTION_RULES.dodgeTicks||Math.abs(length-1)>.000001)throw Error('Inconsistent Journey dodge cooldown');}
    if(r.grenades&&(!actor.grenades||!integer(actor.grenades.quantity,0,actorClass(run,actor)?.grenades??GRENADE_RULES.starterQuantity)||!integer(actor.grenades.nextThrowAt,0,run.tick+GRENADE_RULES.cooldownTicks)))throw Error('Invalid Journey grenade inventory');
    if(actor.awareness)validateAwareness(actor.awareness,run.tick,run.eventSeq);
    if(actor.tactics&&(!['defender','flanker','support'].includes(actor.tactics.role)||!['patrol','cover','suppress','flank','reload','retreat','search'].includes(actor.tactics.mode)||!integer(actor.tactics.until,0,run.tick+TACTICAL_RULES.commitTicks)||!integer(actor.tactics.stuckTicks,0,TACTICAL_RULES.thinkTicks)||actor.tactics.destination!==null&&!world.walkable(actor.tactics.destination)))throw Error('Invalid Journey tactical state');
    if(!actor.classState&&['journey-practice-0.3.0','journey-practice-0.4.0','journey-practice-0.5.0','journey-practice-0.6.0','journey-practice-0.7.0','journey-practice-0.8.0','journey-practice-0.9.0','journey-practice-0.10.0','journey-practice-0.11.0','journey-practice-0.12.0','journey-practice-0.13.0','journey-practice-0.14.0','journey-practice-0.15.0','journey-practice-0.16.0','journey-practice-0.17.0','journey-practice-0.18.0'].includes(r.version)&&(!actor.build||actor.build.classId!=='starter-rifle'||actor.build.armour!==0||actor.build.weapon!==(actorEquipment(run,actor)?.buildId??'service-rifle')||(r.motion?actor.build.pose!==actor.motion?.pose||actor.build.abilityUntil!==actor.motion?.dodgeUntil:actor.build.pose!=='standing'||actor.build.abilityUntil!==0)||actor.build.entitlement!==(actor.side===0?'free-starter':'encounter')))throw Error('Unsupported Journey actor build');
    if(actor.id!==expectedActorIds[index]||actor.side!==(actor.id<4?0:1)||actor.role!==(actor.id===1?'leader':actor.id<4?'helper':'guard')||!integer(actor.hp,0,actorHealth(run,actor))||!integer(actor.ammo,0,actorMagazine(run,actor))||!integer(actor.reserve,0,actorReserveLimit(run,actor))||!Number.isFinite(actor.facing)||typeof actor.moving!=='boolean'||!integer(actor.fireAt,-100,run.tick)||!integer(actor.reloadAt,0,run.tick+actorReloadTicks(run,actor))||!actorClear(actor)||!Array.isArray(actor.route)||actor.route.length>3456||!actor.route.every(p=>world.walkable(p)))throw Error('Invalid Journey actor state');
  }
  if(!run.drive||![run.drive.x,run.drive.z].every(Number.isFinite)||Math.hypot(run.drive.x,run.drive.z)>1.001||!integer(run.driveUntil,0,run.tick+2)||run.target!==null&&!world.walkable(run.target))throw Error('Invalid Journey movement state');
  let previous=0;
  for(const event of run.events){if(!integer(event.seq,1,run.eventSeq)||event.seq<=previous||!['shot','hit','down','checkpoint','bank','quit','throw','bounce','explosion',...(r.classes?['ability']:[])].includes(event.kind)||![event.from?.x,event.from?.z,event.to?.x,event.to?.z,event.height].every(Number.isFinite))throw Error('Invalid Journey event state');
    if(event.kind==='ability'&&(typeof event.text!=='string'||event.text.length>120))throw Error('Invalid Journey ability event');
    if(event.originHeight!==undefined&&(!r.traversal||!Number.isFinite(event.originHeight)||event.originHeight<0||event.originHeight>42))throw Error('Invalid Journey shot origin height');
    if(['journey-practice-0.7.0','journey-practice-0.8.0','journey-practice-0.9.0','journey-practice-0.10.0','journey-practice-0.11.0','journey-practice-0.12.0','journey-practice-0.13.0','journey-practice-0.14.0','journey-practice-0.15.0','journey-practice-0.16.0','journey-practice-0.17.0','journey-practice-0.18.0'].includes(r.version)){
      const prefix='journey-sections-1:'+run.stream!.seed+':';if(!event.section?.startsWith(prefix)||sectionOrdinal(event.section.slice(prefix.length))>sectionOrdinal(run.stream!.ordinal)||event.kind==='checkpoint'&&event.source!==event.section+':checkpoint')throw Error('Invalid Journey event source');
    }
    previous=event.seq;
  }
  if(run.state==='DEAD'&&run.actors[0].hp!==0||['DEAD','QUIT','BANKED'].includes(run.state)&&run.practiceCredits!==0||run.state==='CHECKPOINT_REACHED'&&!run.checkpointComplete)throw Error('Inconsistent Journey terminal state');
}
export async function validateJourneyResume(run:JourneyRun):Promise<void> {
  validateJourneyState(run);
  await verifyJourneyPin(run.pin);
  if(run.roster)await verifyRosterSnapshot(run.roster);
  if(run.equipment)await verifyEquipmentSnapshot(run.equipment);
  if(run.stream){
    const expected=generateSection(run.stream.seed,run.stream.ordinal);new JourneyWindow(run.stream);
    if(run.pin.rules.generator!==expected.generator||run.section!==expected.id||JSON.stringify(run.sectionData)!==JSON.stringify(expected))throw Error('Incompatible Journey section snapshot');
  }else if(run.section!==ROAD_SECTION.id||run.sectionData||run.pin.rules.generator!=='authored-road-1')throw Error('Unsupported Journey section');
}
function emit(run:JourneyRun,kind:JourneyEvent['kind'],from:Point,to:Point,side=0,height=1.1){
  run.events.push({seq:++run.eventSeq,kind,from:{x:from.x,z:from.z},to:{x:to.x,z:to.z},side,height,...(run.encounter?{section:run.section,...(kind==='checkpoint'?{source:run.encounter.source}:{})}:{})});if(run.events.length>64)run.events.shift();
}
export function journeyReload(run:JourneyRun,actor=journeyLeader(run)):boolean {
  if(!journeyActive(run)||actor.hp<=0||actor.reloadAt>run.tick||actor.ammo>=actorMagazine(run,actor)||actor.reserve<=0)return false;
  actor.reloadAt=run.tick+actorReloadTicks(run,actor);return true;
}
export function journeyAbility(run:JourneyRun,targetId?:number,actor=journeyLeader(run),world=journeyWorld(run)):boolean {
  const p=actorClass(run,actor),state=actor.classState;
  if(!journeyActive(run)||actor.hp<=0||!p||!state||run.tick<state.readyAt||actor.traversal&&!actor.traversal.grounded||p.ability==='grenade-stock')return false;
  let target=actor;
  if(p.ability==='treat'){
    if(state.medicalCharges<=0)return false;
    const eligible=run.actors.filter(a=>a.side===actor.side&&a.hp>0&&a.hp<actorHealth(run,a)&&distance(actor,a)<=CLASS_RULES.treatmentRange&&(!a.traversal||a.traversal.grounded)).filter(a=>{
      const d={x:a.x-actor.x,y:actorElevation(a)+bodyHeight(a.motion?.pose??'standing')/2-actorEye(actor),z:a.z-actor.z},length=Math.hypot(d.x,d.y,d.z);
      return world.shotDistance({...actor,y:actorEye(actor)},d,length)>=length-.01;
    });
    const chosen=targetId===undefined?eligible.sort((a,b)=>a.hp/actorHealth(run,a)-b.hp/actorHealth(run,b)||a.id-b.id)[0]:eligible.find(a=>a.id===targetId);
    if(!chosen)return false;target=chosen;target.hp=Math.min(actorHealth(run,target),target.hp+CLASS_RULES.treatment);state.medicalCharges--;
  }else{
    if(targetId!==undefined&&targetId!==actor.id)return false;
    if(p.ability==='resupply'){
      if(state.ammoCharges<=0||actor.reserve>=actorReserveLimit(run,actor))return false;
      actor.reserve=Math.min(actorReserveLimit(run,actor),actor.reserve+CLASS_RULES.ammoRefill);state.ammoCharges--;
    }else if(p.ability==='focus'&&actor.motion?.pose!=='crouched')return false;
  }
  state.readyAt=run.tick+p.cooldown;state.until=p.duration?run.tick+p.duration:0;
  emit(run,'ability',actor,target,actor.side,actorElevation(target)+1);run.events.at(-1)!.text=p.name+': '+p.line;
  return true;
}
function classFire(run:JourneyRun,actor:JourneyActor,direction:Vec3,world:WorldQuery):boolean {
  const p=actorClass(run,actor);const build=actorWeapon(run,actor);
  if(!journeyActive(run)||actor.hp<=0||actor.ammo<=0||actor.reloadAt>run.tick||run.tick-actor.fireAt<build.interval||![direction.x,direction.y,direction.z].every(Number.isFinite)||Math.hypot(direction.x,direction.y,direction.z)<.001)return false;
  const origin={x:actor.x,y:actorEye(actor),z:actor.z},bonus=p?.ability==='focus'&&actor.classState!.until>run.tick?CLASS_RULES.focusBonus:0;
  const shot=traceJourneyWeapon(world,origin,direction,build,run.actors.filter(a=>a.side!==actor.side).map(a=>({id:a.id,x:a.x,y:actorElevation(a),z:a.z,pose:a.motion?.pose??'standing',hp:a.hp})),bonus);
  actor.fireAt=run.tick;actor.ammo--;actor.facing=Math.atan2(direction.x,direction.z);
  for(const ray of shot.rays){emit(run,'shot',actor,ray.to,actor.side,ray.to.y);run.events.at(-1)!.originHeight=origin.y;}
  for(const hit of shot.hits){if(hit.damage<=0)continue;const target=run.actors.find(a=>a.id===hit.id)!;
    target.hp=Math.max(0,target.hp-damageAfterArmour(run,target,Math.max(1,Math.round(hit.damage*(p?.damagePercent??100)/100))));
    emit(run,target.hp?'hit':'down',actor,target,actor.side,actorElevation(target)+bodyHeight(target.motion?.pose??'standing')/2);run.events.at(-1)!.victimSide=target.side;
    defeatDrop(run,target,actor.side);
    if(target.side===1){target.awareness??=emptyAwareness();alertFromDamage(target.awareness,actor,run.tick);}
  }
  return true;
}
export function journeyFire(run:JourneyRun,actor:JourneyActor,direction:Vec3,world:WorldQuery=journeyWorld(run)):boolean {
  const r=run.pin.rules;
  if(actor.battlefieldWeapon||actorClass(run,actor)||actorEquipment(run,actor))return classFire(run,actor,direction,world);
  if(!journeyActive(run)||actor.hp<=0||actor.ammo<=0||actor.reloadAt>run.tick||run.tick-actor.fireAt<(actor.role==='leader'?r.rifleTicks:actor.role==='helper'?r.helperTicks:r.enemyTicks))return false;
  const length=Math.hypot(direction.x,direction.y,direction.z);if(!Number.isFinite(length)||length<.001)return false;
  const d={x:direction.x/length,y:direction.y/length,z:direction.z/length},origin={x:actor.x,y:actorEye(actor),z:actor.z};
  if(actor.side===1&&['journey-practice-0.6.0','journey-practice-0.7.0','journey-practice-0.8.0','journey-practice-0.9.0','journey-practice-0.10.0','journey-practice-0.11.0','journey-practice-0.12.0','journey-practice-0.13.0','journey-practice-0.14.0','journey-practice-0.15.0','journey-practice-0.16.0','journey-practice-0.17.0','journey-practice-0.18.0'].includes(r.version)&&Math.abs(Math.atan2(Math.sin(Math.atan2(d.x,d.z)-actor.facing),Math.cos(Math.atan2(d.x,d.z)-actor.facing)))>TACTICAL_RULES.aimToleranceRadians)return false;
  let end=world.shotDistance(origin,d,r.rifleRange),target:JourneyActor|undefined;
  for(const enemy of run.actors){
    if(enemy.side===actor.side||enemy.hp<=0)continue;
    if(r.motion){const at=rayBodyDistance(origin,d,{...enemy,y:actorElevation(enemy)},enemy.motion?.pose??'standing',end);if(at!==null&&at<end){end=at;target=enemy;}continue;}
    const dx=enemy.x-origin.x,dy=1.15-origin.y,dz=enemy.z-origin.z,along=dx*d.x+dy*d.y+dz*d.z;
    const disc=.62**2-(dx*dx+dy*dy+dz*dz-along*along);if(disc<0)continue;
    const at=along-Math.sqrt(disc);if(at>=0&&at<end){end=at;target=enemy;}
  }
  actor.fireAt=run.tick;actor.ammo--;actor.facing=Math.atan2(d.x,d.z);
  const to={x:origin.x+d.x*end,z:origin.z+d.z*end};emit(run,'shot',actor,to,actor.side,Math.max(0,origin.y+d.y*end));
  if(r.traversal)run.events.at(-1)!.originHeight=origin.y;
  if(target){target.hp=Math.max(0,target.hp-damageAfterArmour(run,target,actor.role==='leader'?r.rifleDamage:actor.role==='helper'?r.helperDamage:r.enemyDamage));emit(run,target.hp?'hit':'down',actor,target,actor.side,r.traversal?actorElevation(target)+bodyHeight(target.motion?.pose??'standing')/2:1.1);defeatDrop(run,target,actor.side);}
  if(target&&target.side===1&&['journey-practice-0.5.0','journey-practice-0.6.0','journey-practice-0.7.0','journey-practice-0.8.0','journey-practice-0.9.0','journey-practice-0.10.0','journey-practice-0.11.0','journey-practice-0.12.0','journey-practice-0.13.0','journey-practice-0.14.0','journey-practice-0.15.0','journey-practice-0.16.0','journey-practice-0.17.0','journey-practice-0.18.0'].includes(r.version)){target.awareness??=emptyAwareness();alertFromDamage(target.awareness,actor,run.tick);}
  return true;
}
// Bounded authored section navigation. Generation and streaming follow this slice.
export function journeyPath(world:WorldQuery,from:Point,to:Point,allowTraversal=false,traversalSpeed=4):JourneyWaypoint[] {
  if(!world.walkable(to))return [];
  if(world.segmentClear(from,to))return [{...to}];
  const width=Math.ceil(world.width),index=(p:Point)=>Math.floor(p.z)*width+Math.floor(p.x),point=(n:number)=>({x:n%width+.5,z:Math.floor(n/width)+.5});
  const start=index(from),queue=[start],previous=new Map<number,number>([[start,-1]]);let end=-1;
  for(let i=0;i<queue.length&&i<world.width*world.depth;i++){
    const n=queue[i],at=n===start?from:point(n);
    if(distance(at,to)<1.6&&world.segmentClear(at,to)){end=n;break;}
    for(const d of [{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}]){
      const next={x:Math.floor(at.x)+.5+d.x,z:Math.floor(at.z)+.5+d.z},id=index(next);
      if(!previous.has(id)&&world.walkable(next)&&world.segmentClear(at,next)){previous.set(id,n);queue.push(id);}
    }
  }
  if(end<0)return allowTraversal?journeyLinkedPath(world,from,to,traversalSpeed):[];
  const route:Point[]=[{...to}];for(let n=end;n!==start;n=previous.get(n)!)route.unshift(point(n));return route;
}
// Fallback links are derived with the same full body vault planner used by the
// command path. Ordinary connected ground routes retain their cheaper search.
function journeyLinkedPath(world:WorldQuery,from:Point,to:Point,speed:number):JourneyWaypoint[] {
  const width=Math.ceil(world.width),index=(p:Point)=>Math.floor(p.z)*width+Math.floor(p.x),point=(n:number)=>({x:n%width+.5,z:Math.floor(n/width)+.5});
  const start=index(from),queue=[start],previous=new Map<number,number>([[start,-1]]),links=new Map<number,{from:Point;to:Point;direction:Point;kind:'jump'|'vault'}>();let end=-1;
  const directions=[{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}];
  for(let i=0;i<queue.length&&i<world.width*world.depth;i++){
    const n=queue[i],at=n===start?from:point(n);
    if(distance(at,to)<1.6&&world.segmentClear(at,to)){end=n;break;}
    for(const d of directions){
      const adjacent={x:Math.floor(at.x)+.5+d.x,z:Math.floor(at.z)+.5+d.z};
      if(world.walkable(adjacent)&&world.segmentClear(at,adjacent)){
        const id=index(adjacent);if(!previous.has(id)){previous.set(id,n);queue.push(id);}continue;
      }
      const jump=planJump(at,d,'standing',world,speed),vault=jump&&!world.segmentClear(at,jump)&&world.walkable(jump)?null:planVault(emptyTraversal(world.terrain(at).elevation),at,d,'standing',world,0);
      const destination=vault?.to??jump,kind=vault?'vault':'jump';
      if(!destination||world.segmentClear(at,destination)||!world.walkable(destination))continue;
      const id=index(destination),landing=point(id);
      if(previous.has(id)||!world.walkable(landing)||!world.segmentClear(destination,landing))continue;
      previous.set(id,n);links.set(id,{from:{...at},to:{x:destination.x,z:destination.z},direction:d,kind});queue.push(id);
    }
  }
  if(end<0)return [];
  const route:JourneyWaypoint[]=[{...to}];
  for(let n=end;n!==start;n=previous.get(n)!){route.unshift(point(n));const link=links.get(n);if(link){route.unshift(link.to);route.unshift({...link.from,traverseDirection:link.direction,traverseKind:link.kind});}}
  return route;
}
export function journeyMove(run:JourneyRun,target:Point,world=journeyWorld(run)):boolean {
  if(!journeyActive(run)||!world.walkable(target))return false;
  const route=journeyPath(world,journeyLeader(run),target,!!run.pin.rules.traversal,actorSpeed(run,journeyLeader(run)));if(!route.length)return false;
  run.target={...target};journeyLeader(run).route=route;run.driveUntil=0;return true;
}
export function journeyDrive(run:JourneyRun,direction:Point):void {
  const length=Math.hypot(direction.x,direction.z);if(!journeyActive(run)||!Number.isFinite(length))return;
  run.drive=length>1?{x:direction.x/length,z:direction.z/length}:{...direction};run.driveUntil=run.tick+2;
  if(length){run.target=null;journeyLeader(run).route=[];}
}
function advance(actor:JourneyActor,target:Point,speed:number,world:WorldQuery,vertical=false) {
  speed*=world.terrain(actor).speed*(actor.motion?.pose==='crouched'?MOTION_RULES.crouchedSpeed/100:1);
  const length=distance(actor,target);if(length<.03)return;
  const delta=Math.min(speed,length),destination={x:actor.x+(target.x-actor.x)/length*delta,z:actor.z+(target.z-actor.z)/length*delta},next=vertical&&actor.traversal?moveTraversal(actor.traversal,actor,destination,actor.motion?.pose??'standing',world):actor.motion?sweepBody(world,actor,destination,actor.motion.pose):world.move(actor,destination);
  actor.moving=distance(actor,next)>.001;if(actor.moving)actor.facing=Math.atan2(next.x-actor.x,next.z-actor.z);Object.assign(actor,next);
}
export function journeyStep(run:JourneyRun,world=journeyWorld(run)):void {
  if(!journeyActive(run))return;run.tick++;const r=run.pin.rules,leader=journeyLeader(run);
  if(leader.hp<=0){run.state='DEAD';run.practiceCredits=0;forfeitLoot(run);return;}
  for(const actor of run.actors){
    actor.moving=false;if(actor.hp<=0)continue;
    const speed=actorSpeed(run,actor),profile=actorClass(run,actor);
    if(r.traversal&&actor.traversal){const vaulting=!!actor.traversal.vault,next=stepTraversal(actor.traversal,actor,actor.motion?.pose??'standing',world,run.tick);actor.moving=distance(actor,next)>.001;Object.assign(actor,next);if(vaulting)continue;}
    if(actor.reloadAt&&actor.reloadAt<=run.tick){const amount=Math.min(actorMagazine(run,actor)-actor.ammo,actor.reserve);actor.ammo+=amount;actor.reserve-=amount;actor.reloadAt=0;}
    if(actor.motion&&run.tick<=actor.motion.dodgeUntil){const step=MOTION_RULES.dodgeDistance/MOTION_RULES.dodgeTicks,next=r.traversal&&actor.traversal?moveTraversal(actor.traversal,actor,{x:actor.x+actor.motion.direction.x*step,z:actor.z+actor.motion.direction.z*step},actor.motion.pose,world):dodgeStep(actor.motion,actor,world,run.tick);actor.moving=distance(actor,next)>.001;Object.assign(actor,next);continue;}
    if(actor.id===leader.id&&run.driveUntil>=run.tick&&Math.hypot(run.drive.x,run.drive.z)>0){advance(actor,{x:actor.x+run.drive.x,z:actor.z+run.drive.z},speed*Math.min(1,Math.hypot(run.drive.x,run.drive.z))/r.ticks,world,!!r.traversal);continue;}
    if(actor.role==='helper'&&run.tick%10===1){
      const follow=profile?.ability==='treat'?run.actors.filter(a=>a.side===0&&a.id!==actor.id&&a.hp>0&&a.hp<actorHealth(run,a)).sort((a,b)=>a.hp/actorHealth(run,a)-b.hp/actorHealth(run,b))[0]??leader:leader;
      const slot={x:follow.x-(profile?.followDistance??1.8),z:follow.z+(actor.id===2?-1.7:1.7)};
      if(['journey-practice-0.3.0','journey-practice-0.4.0','journey-practice-0.5.0','journey-practice-0.6.0','journey-practice-0.7.0','journey-practice-0.8.0','journey-practice-0.9.0','journey-practice-0.10.0','journey-practice-0.11.0','journey-practice-0.12.0','journey-practice-0.13.0','journey-practice-0.14.0','journey-practice-0.15.0','journey-practice-0.16.0','journey-practice-0.17.0','journey-practice-0.18.0'].includes(run.pin.rules.version)){
        const candidates=[slot,...[1.6,2.8,4].flatMap(radius=>Array.from({length:8},(_,i)=>({x:follow.x+Math.cos(i*Math.PI/4)*radius,z:follow.z+Math.sin(i*Math.PI/4)*radius})))];
        const target=candidates.find(p=>world.walkable(p)&&run.actors.filter(a=>a.side===0&&a.hp>0&&a.id!==actor.id).every(a=>distance(p,a.route.at(-1)??a)>.8)&&journeyPath(world,actor,p,!!r.traversal,speed).length>0);
        if(target&&distance(actor,target)>1)actor.route=journeyPath(world,actor,target,!!r.traversal,speed);
      }else if(distance(actor,slot)>1)actor.route=journeyPath(world,actor,world.walkable(slot)?slot:leader);
    }
    const perceptionFacing=actor.facing;
    if(r.traversal&&actor.route[0]?.traverseDirection&&distance(actor,actor.route[0])<.08){if(actor.traversal?.grounded&&run.tick<actor.traversal.nextJumpAt)continue;const waypoint=actor.route[0],remaining=actor.route.slice(1),ok=waypoint.traverseKind==='jump'?journeyJump(run,actor,world):journeyVault(run,waypoint.traverseDirection!,actor,world);if(ok){actor.route=remaining;continue;}actor.route=[];}
    if(actor.route.length){advance(actor,actor.route[0],speed/r.ticks,world,!!r.traversal);if(distance(actor,actor.route[0])<.08&&!actor.route[0].traverseDirection)actor.route.shift();}
    if(actor.side===1&&['journey-practice-0.5.0','journey-practice-0.6.0','journey-practice-0.7.0','journey-practice-0.8.0','journey-practice-0.9.0','journey-practice-0.10.0','journey-practice-0.11.0','journey-practice-0.12.0','journey-practice-0.13.0','journey-practice-0.14.0','journey-practice-0.15.0','journey-practice-0.16.0','journey-practice-0.17.0','journey-practice-0.18.0'].includes(r.version))actor.facing=perceptionFacing;
    if(actor.role==='leader')continue;
    let target=run.actors.filter(a=>a.hp>0&&a.side!==actor.side&&distance(actor,a)<=actorVision(run,actor)*Math.min(world.terrain(actor).visibility??1,world.terrain(a).visibility??1)).sort((a,b)=>distance(actor,a)-distance(actor,b)).find(a=>{
      const range=distance(actor,a),dy=r.motion?actorElevation(a)+bodyHeight(a.motion?.pose??'standing')/2-actorEye(actor):-.65,rayRange=r.traversal?Math.hypot(range,dy):range;return world.shotDistance({...actor,y:actorEye(actor)},{x:a.x-actor.x,y:dy,z:a.z-actor.z},rayRange+1)>=rayRange-.7;
    });
    if(actor.side===0&&profile&&run.tick%10===actor.id%10){
      if(profile.ability==='treat')journeyAbility(run,undefined,actor,world);
      else if(profile.ability==='resupply'&&actor.reserve<actorMagazine(run,actor)*2)journeyAbility(run,undefined,actor,world);
      else if(target&&['brace','recon'].includes(profile.ability))journeyAbility(run,undefined,actor,world);
      else if(target&&profile.ability==='focus'&&distance(actor,target)>20){journeyPose(run,'crouched',actor,world);journeyAbility(run,undefined,actor,world);}
    }
    if(actor.side===1&&['journey-practice-0.5.0','journey-practice-0.6.0','journey-practice-0.7.0','journey-practice-0.8.0','journey-practice-0.9.0','journey-practice-0.10.0','journey-practice-0.11.0','journey-practice-0.12.0','journey-practice-0.13.0','journey-practice-0.14.0','journey-practice-0.15.0','journey-practice-0.16.0','journey-practice-0.17.0','journey-practice-0.18.0'].includes(r.version)){
      if(!actor.awareness)actor.awareness=emptyAwareness();
      for(const event of run.events.filter(e=>e.kind==='down'))witnessLoss(actor,actor.awareness,{sequence:event.seq,position:event.to,side:event.victimSide??(event.side===0?1:0),...(r.traversal?{height:event.height}:{})},world,run.tick);
      const perceived=perceive(actor,run.actors,actor.awareness,world,run.tick,run.events.filter(e=>e.kind==='shot').map(e=>({sequence:e.seq,position:e.from,side:e.side as 0|1})));
      target=perceived?run.actors.find(a=>a.id===perceived.id):undefined;
      if(!['journey-practice-0.6.0','journey-practice-0.7.0','journey-practice-0.8.0','journey-practice-0.9.0','journey-practice-0.10.0','journey-practice-0.11.0','journey-practice-0.12.0','journey-practice-0.13.0','journey-practice-0.14.0','journey-practice-0.15.0','journey-practice-0.16.0','journey-practice-0.17.0','journey-practice-0.18.0'].includes(r.version)&&!target&&actor.awareness.lastKnown&&run.tick>=actor.awareness.reactAt&&run.tick%10===actor.id%10&&distance(actor,actor.awareness.lastKnown)>1)actor.route=journeyPath(world,actor,actor.awareness.lastKnown);
      // A visible grenade can require escape without identifying its thrower.
      // Preserve that committed route while awareness still has no combat target.
      if(actor.awareness.state==='patrol'&&!(r.grenades&&actor.tactics?.mode==='retreat'&&run.tick<actor.tactics.until))actor.route=[];
      for(const ally of run.actors.filter(a=>a.side===actor.side&&a.hp>0&&a.id!==actor.id)){ally.awareness??=emptyAwareness();shareAlert(actor,actor.awareness,ally,ally.awareness,run.tick);}
      if(['journey-practice-0.6.0','journey-practice-0.7.0','journey-practice-0.8.0','journey-practice-0.9.0','journey-practice-0.10.0','journey-practice-0.11.0','journey-practice-0.12.0','journey-practice-0.13.0','journey-practice-0.14.0','journey-practice-0.15.0','journey-practice-0.16.0','journey-practice-0.17.0','journey-practice-0.18.0'].includes(r.version)){
        if(!actor.tactics){actor.tactics=emptyTactics(actor.id);if(run.encounter)actor.tactics.role=encounterRole(run.encounter.tier,actor.id);}
        if(actor.route.length&&!actor.moving)actor.tactics.stuckTicks++;else actor.tactics.stuckTicks=0;
        if(actor.tactics.stuckTicks>=TACTICAL_RULES.thinkTicks){actor.tactics.until=0;actor.route=[];}
        if(run.tick%TACTICAL_RULES.thinkTicks===actor.id%TACTICAL_RULES.thinkTicks){
          actor.tactics=chooseTactic({...actor,perceivedHazards:run.projectiles?.filter(p=>seesGrenade(actor,actorEye(actor),p,world)).map(p=>({position:p.position,radius:GRENADE_RULES.blastRadius}))},run.actors.filter(a=>a.side===actor.side),actor.awareness.lastKnown,!!target,world,run.tick,actor.tactics,(from,to)=>journeyPath(world,from,to,!!r.traversal,r.speed));
          actor.route=actor.tactics.destination?journeyPath(world,actor,actor.tactics.destination,!!r.traversal,r.speed):[];
          if(actor.tactics.mode==='reload')journeyReload(run,actor);
        }
      }
    }
    if(target&&actor.tactics?.mode!=='retreat'){if(!actor.ammo)journeyReload(run,actor);else journeyFire(run,actor,{x:target.x-actor.x,y:r.motion?actorElevation(target)+bodyHeight(target.motion?.pose??'standing')/2-actorEye(actor):-.65,z:target.z-actor.z},world);}
  }
  if(leader.hp<=0){run.state='DEAD';run.practiceCredits=0;forfeitLoot(run);return;}
  stepJourneyGrenades(run,world);
  if(leader.hp<=0){run.state='DEAD';run.practiceCredits=0;forfeitLoot(run);return;}
  if(run.encounter)stepEncounter(run.encounter,leader,run.actors,onRouteGround(run,leader,world));
  if(!run.checkpointComplete&&onRouteGround(run,leader,world)&&(run.encounter?run.encounter.opened:run.actors.every(a=>a.side===0||a.hp<=0))&&distance(leader,journeyCheckpoint(run))<=r.checkpointRadius){
    run.checkpointComplete=true;run.state='CHECKPOINT_REACHED';const award=run.rewards?Math.min(r.checkpointCredits,REWARD_RULES.maxCheckpointCredits-run.rewards.checkpointEarned):r.checkpointCredits;run.practiceCredits+=award;if(run.rewards)run.rewards.checkpointEarned+=award;emit(run,'checkpoint',leader,journeyCheckpoint(run));
  }
}
export function journeyBank(run:JourneyRun):boolean {
  if(run.projectiles?.length||!onRouteGround(run,journeyLeader(run),journeyWorld(run))||run.state!=='CHECKPOINT_REACHED'||distance(journeyLeader(run),journeyCheckpoint(run))>run.pin.rules.checkpointRadius)return false;
  run.bankedPracticeCredits+=run.practiceCredits+bankLoot(run);run.practiceCredits=0;run.state='BANKED';emit(run,'bank',journeyLeader(run),journeyCheckpoint(run));return true;
}
export function journeyContinue(run:JourneyRun):{ok:boolean;reason:string} {
  if(run.projectiles?.length||!run.stream||run.state!=='CHECKPOINT_REACHED')return {ok:false,reason:'Complete the current checkpoint first'};
  const window=new JourneyWindow({...run.stream}),roster=run.actors.filter(a=>a.side===0);
  if(roster.some(a=>a.hp>0&&!onRouteGround(run,a,journeyWorld(run))))return {ok:false,reason:'Regroup on the ground before continuing'};
  const healthLimits=new Map(roster.map(a=>[a.id,actorHealth(run,a)]));
  const result=window.transition(run.section,run.checkpointComplete,journeyLeader(run),roster,a=>healthLimits.get(a.id)??0);
  if(!result.ok)return result;
  const section=window.current();
  for(const actor of roster)if(actor.battlefieldWeapon){delete actor.battlefieldWeapon;actor.ammo=Math.min(actor.ammo,actorMagazine(run,actor));actor.reserve=Math.min(actor.reserve,actorReserveLimit(run,actor));actor.reloadAt=0;}
  if(run.rewards)run.rewards.drops=[];
  for(const placement of result.placements!){const actor=roster.find(a=>a.id===placement.id)!;Object.assign(actor,placement.point);actor.route=[];actor.moving=false;}
  run.stream=window.state;run.sectionData=section;run.section=section.id;run.checkpointComplete=false;run.state='ACTIVE';run.target=null;run.drive={x:0,z:0};run.driveUntil=0;
  if(['journey-practice-0.7.0','journey-practice-0.8.0','journey-practice-0.9.0','journey-practice-0.10.0','journey-practice-0.11.0','journey-practice-0.12.0','journey-practice-0.13.0','journey-practice-0.14.0','journey-practice-0.15.0','journey-practice-0.16.0','journey-practice-0.17.0','journey-practice-0.18.0'].includes(run.pin.rules.version))run.encounter=createEncounter(section);
  const r=run.pin.rules;
  run.actors=[...roster,...section.enemySpawns.map((p,i):JourneyActor=>({id:i+4,side:1,role:'guard',...(r.supplies?{armourRemaining:0}:{}),hp:r.health,ammo:r.magazine,reserve:r.reserve,fireAt:run.tick,reloadAt:0,facing:-Math.PI/2,moving:false,route:[],...(r.grenades?{grenades:{quantity:0,nextThrowAt:0}}:{}),...(r.motion?{motion:emptyMotion()}:{}),...(r.traversal?{traversal:emptyTraversal()}:{}),...p,...(['journey-practice-0.3.0','journey-practice-0.4.0','journey-practice-0.5.0','journey-practice-0.6.0','journey-practice-0.7.0','journey-practice-0.8.0','journey-practice-0.9.0','journey-practice-0.10.0','journey-practice-0.11.0','journey-practice-0.12.0','journey-practice-0.13.0','journey-practice-0.14.0','journey-practice-0.15.0','journey-practice-0.16.0','journey-practice-0.17.0','journey-practice-0.18.0'].includes(r.version)?{build:starterBuild(1)}:{})}))];
  if(r.rewards)for(const a of run.actors.filter(a=>a.side===1)){a.rank=enemyRank(run.stream!.ordinal,a.id);if(a.rank==='veteran')a.hp=REWARD_RULES.veteranHealth;}
  return {ok:true,reason:'Next section ready. Unbanked practice credits remain at risk.'};
}
export function journeyQuit(run:JourneyRun):void {
  if(!journeyActive(run))return;run.practiceCredits=0;forfeitLoot(run);run.state='QUIT';emit(run,'quit',journeyLeader(run),journeyLeader(run));
}






