import {SUPPLY_EFFECT_RULES} from './supply-rules.ts';
import { GRENADE_RULES } from './grenades.ts';
import { EQUIPMENT_RULES } from './equipment.ts';
import { CLASS_RULES,validateClassCatalogue } from './classes.ts';
import { ROSTER_RULES } from './roster.ts';
import { REWARD_RULES } from './rewards.ts';
import { TRAVERSAL_RULES } from './traversal.ts';
import { MOTION_RULES } from './motion.ts';
import { AWARENESS_RULES } from './awareness.ts';
import { TACTICAL_RULES } from './tactics.ts';
import { ENCOUNTER_RULES } from './checkpoints.ts';
export const JOURNEY_PROTOCOL = 'journey-local-1';
export const JOURNEY_RULES = Object.freeze({
  mode: 'journey', version: 'journey-practice-0.1.0', generator: 'authored-road-1',
  environment: 'LOCAL_PRACTICE', ticks: 20, width: 72, depth: 48,
  activeSoldiers: 3, maxActors: 6, maxSections: 1, health: 100, radius: .35,
  speed: 4, rifleDamage: 25, rifleRange: 28, rifleTicks: 5,
  magazine: 20, reserve: 80, reloadTicks: 30, enemyDamage: 7, enemyTicks: 32,
  helperDamage: 10, helperTicks: 24, vision: 22, checkpointRadius: 3,
  checkpointCredits: 10, maxExperience: 0, leaderDeathEndsRun: true,
  permanentAssetLoss: false, signatureEquipment: 'DEFAULT_LOADOUT',
  experienceBenefits: 'COSMETIC_ONLY',
} as const);
export const JOURNEY_STREAM_RULES_V2=Object.freeze({...JOURNEY_RULES,version:'journey-practice-0.2.0',generator:'journey-sections-1',maxSections:3} as const);
export const JOURNEY_STREAM_RULES_V3=Object.freeze({...JOURNEY_STREAM_RULES_V2,version:'journey-practice-0.3.0'} as const);
export const JOURNEY_STREAM_RULES_V4=Object.freeze({...JOURNEY_STREAM_RULES_V3,version:'journey-practice-0.4.0'} as const);
export const JOURNEY_STREAM_RULES_V5=Object.freeze({...JOURNEY_STREAM_RULES_V4,version:'journey-practice-0.5.0',awareness:AWARENESS_RULES} as const);
export const JOURNEY_STREAM_RULES_V6=Object.freeze({...JOURNEY_STREAM_RULES_V5,version:'journey-practice-0.6.0',tactics:TACTICAL_RULES} as const);
export const JOURNEY_STREAM_RULES_V7=Object.freeze({...JOURNEY_STREAM_RULES_V6,version:'journey-practice-0.7.0',encounters:ENCOUNTER_RULES} as const);
export const JOURNEY_STREAM_RULES_V8=Object.freeze({...JOURNEY_STREAM_RULES_V7,version:'journey-practice-0.8.0',motion:MOTION_RULES} as const);
export const JOURNEY_STREAM_RULES_V9=Object.freeze({...JOURNEY_STREAM_RULES_V8,version:'journey-practice-0.9.0',grenades:GRENADE_RULES} as const);
export const JOURNEY_STREAM_RULES=Object.freeze({...JOURNEY_STREAM_RULES_V9,version:'journey-practice-0.10.0',traversal:TRAVERSAL_RULES} as const);
export const JOURNEY_CLASS_STREAM_RULES=Object.freeze({...JOURNEY_STREAM_RULES,version:'journey-practice-0.11.0',classes:CLASS_RULES} as const);
export const JOURNEY_ROSTER_STREAM_RULES=Object.freeze({...JOURNEY_CLASS_STREAM_RULES,version:'journey-practice-0.12.0',roster:ROSTER_RULES} as const);
export const JOURNEY_REWARD_STREAM_RULES=Object.freeze({...JOURNEY_ROSTER_STREAM_RULES,version:'journey-practice-0.13.0',rewards:REWARD_RULES} as const);
export const JOURNEY_EQUIPMENT_STREAM_RULES=Object.freeze({...JOURNEY_REWARD_STREAM_RULES,version:'journey-practice-0.14.0',equipment:EQUIPMENT_RULES} as const);
export const JOURNEY_SUPPLY_STREAM_RULES=Object.freeze({...JOURNEY_EQUIPMENT_STREAM_RULES,version:'journey-practice-0.15.0',supplies:SUPPLY_EFFECT_RULES} as const);
export const JOURNEY_OWNED_STREAM_RULES=Object.freeze({...JOURNEY_REWARD_STREAM_RULES,version:'journey-practice-0.16.0',supplies:SUPPLY_EFFECT_RULES,ownedRoster:'journey-owned-roster-1'} as const);
export const JOURNEY_RECOVERY_STREAM_RULES=Object.freeze({...JOURNEY_SUPPLY_STREAM_RULES,version:'journey-practice-0.17.0',battlefieldRecovery:'journey-battlefield-recovery-1'} as const);
export const JOURNEY_COMBINED_STREAM_RULES=Object.freeze({...JOURNEY_OWNED_STREAM_RULES,version:'journey-practice-0.18.0',equipment:EQUIPMENT_RULES,battlefieldRecovery:'journey-battlefield-recovery-1',combinedLoadout:'journey-owned-equipment-1'} as const);
export type JourneyRules = { [K in keyof typeof JOURNEY_RULES]: K extends 'version'|'generator' ? string : (typeof JOURNEY_RULES)[K] extends number ? number : (typeof JOURNEY_RULES)[K] }&{readonly awareness?:typeof AWARENESS_RULES;readonly tactics?:typeof TACTICAL_RULES;readonly encounters?:typeof ENCOUNTER_RULES;readonly motion?:typeof MOTION_RULES;readonly grenades?:typeof GRENADE_RULES;readonly traversal?:typeof TRAVERSAL_RULES;readonly classes?:typeof CLASS_RULES;readonly roster?:typeof ROSTER_RULES;readonly rewards?:typeof REWARD_RULES;readonly combinedLoadout?:'journey-owned-equipment-1';readonly battlefieldRecovery?:'journey-battlefield-recovery-1';readonly ownedRoster?:'journey-owned-roster-1';readonly supplies?:typeof SUPPLY_EFFECT_RULES;readonly equipment?:typeof EQUIPMENT_RULES};
export function validateJourneyRules(rules: JourneyRules): void {
  const build=[JOURNEY_RULES,JOURNEY_STREAM_RULES_V2,JOURNEY_STREAM_RULES_V3,JOURNEY_STREAM_RULES_V4,JOURNEY_STREAM_RULES_V5,JOURNEY_STREAM_RULES_V6,JOURNEY_STREAM_RULES_V7,JOURNEY_STREAM_RULES_V8,JOURNEY_STREAM_RULES_V9,JOURNEY_STREAM_RULES,JOURNEY_CLASS_STREAM_RULES,JOURNEY_ROSTER_STREAM_RULES,JOURNEY_REWARD_STREAM_RULES,JOURNEY_EQUIPMENT_STREAM_RULES,JOURNEY_SUPPLY_STREAM_RULES,JOURNEY_OWNED_STREAM_RULES,JOURNEY_RECOVERY_STREAM_RULES,JOURNEY_COMBINED_STREAM_RULES].find(build=>build.version===rules.version);
  if(!build||Object.keys(rules).sort().join() !== Object.keys(build).sort().join()) throw Error('Unexpected Journey rules');
  for (const [key, value] of Object.entries(rules)) {
    if (typeof value === 'number' && (key === 'radius' ? !Number.isFinite(value) || value <= 0 || value > 1 : !Number.isSafeInteger(value) || value < 0)) throw Error('Invalid Journey rule: ' + key);
    if (typeof (build as unknown as Record<string,unknown>)[key] !== typeof value) throw Error('Invalid Journey rule type');
  }
  if(Object.hasOwn(build,'combinedLoadout')&&rules.combinedLoadout!=='journey-owned-equipment-1')throw Error('Unsupported combined loadout rules');
  if(Object.hasOwn(build,'battlefieldRecovery')&&rules.battlefieldRecovery!=='journey-battlefield-recovery-1')throw Error('Unsupported battlefield recovery rules');
  if(Object.hasOwn(build,'ownedRoster')&&rules.ownedRoster!=='journey-owned-roster-1')throw Error('Unsupported owned roster rules');
  if(Object.hasOwn(build,'supplies')&&JSON.stringify(rules.supplies)!==JSON.stringify(SUPPLY_EFFECT_RULES))throw Error('Unsupported supply rules');
  if(Object.hasOwn(build,'awareness')&&JSON.stringify(rules.awareness)!==JSON.stringify(AWARENESS_RULES))throw Error('Unsupported Journey awareness rules');
  if(Object.hasOwn(build,'tactics')&&JSON.stringify(rules.tactics)!==JSON.stringify(TACTICAL_RULES))throw Error('Unsupported Journey tactical rules');
  if(Object.hasOwn(build,'grenades')&&JSON.stringify(rules.grenades)!==JSON.stringify(GRENADE_RULES))throw Error('Unsupported Journey grenade rules');
  if(Object.hasOwn(build,'traversal')&&JSON.stringify(rules.traversal)!==JSON.stringify(TRAVERSAL_RULES))throw Error('Unsupported Journey traversal rules');
  if(Object.hasOwn(build,'classes')){validateClassCatalogue();if(JSON.stringify(rules.classes)!==JSON.stringify(CLASS_RULES))throw Error('Unsupported Journey class rules');}
  if(Object.hasOwn(build,'equipment')&&JSON.stringify(rules.equipment)!==JSON.stringify(EQUIPMENT_RULES))throw Error('Unsupported Journey equipment rules');
  if(Object.hasOwn(build,'rewards')&&JSON.stringify(rules.rewards)!==JSON.stringify(REWARD_RULES))throw Error('Unsupported Journey reward rules');
  if(Object.hasOwn(build,'roster')&&JSON.stringify(rules.roster)!==JSON.stringify(ROSTER_RULES))throw Error('Unsupported Journey roster rules');
  if(Object.hasOwn(build,'motion')&&JSON.stringify(rules.motion)!==JSON.stringify(MOTION_RULES))throw Error('Unsupported Journey motion rules');
  if(Object.hasOwn(build,'encounters')&&JSON.stringify(rules.encounters)!==JSON.stringify(ENCOUNTER_RULES))throw Error('Unsupported Journey encounter rules');
  if (!build || rules.generator !== build.generator || rules.environment !== 'LOCAL_PRACTICE' || rules.mode !== 'journey') throw Error('Unsupported Journey rules');
  if (rules.activeSoldiers !== 3 || rules.maxActors < rules.activeSoldiers || rules.maxActors > 32 || rules.maxSections !== build.maxSections || rules.width !== 72 || rules.depth !== 48) throw Error('Invalid Journey capacity');
  for (const key of ['ticks','health','speed','rifleTicks','enemyTicks','helperTicks','reloadTicks','magazine','rifleRange','vision','checkpointRadius'] as const) if (rules[key] < 1 || rules[key] > 1000) throw Error('Invalid Journey timing or scale');
  // The body radius is fractional; it is validated separately below.
  if (rules.checkpointCredits > 100 || rules.maxExperience !== 0 || rules.permanentAssetLoss !== false || rules.leaderDeathEndsRun !== true || rules.signatureEquipment !== 'DEFAULT_LOADOUT' || rules.experienceBenefits !== 'COSMETIC_ONLY') throw Error('Unsupported Journey policy');
}
export function serializeJourneyRules(rules: JourneyRules): string {
  return JSON.stringify(Object.fromEntries(Object.entries(rules).sort(([a],[b]) => a.localeCompare(b))));
}
export async function hashJourneyRules(rules: JourneyRules): Promise<string> {
  validateJourneyRules(rules);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serializeJourneyRules(rules)));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2,'0')).join('');
}
export type JourneyPin = { protocol: string; rules: JourneyRules; hash: string };
export async function pinJourneyRules(definition:JourneyRules=JOURNEY_RULES): Promise<JourneyPin> {
  const rules = { ...definition };
  return { protocol: JOURNEY_PROTOCOL, rules, hash: await hashJourneyRules(rules) };
}
export async function verifyJourneyPin(pin: JourneyPin): Promise<void> {
  if (pin.protocol !== JOURNEY_PROTOCOL || pin.hash !== await hashJourneyRules(pin.rules)) throw Error('Incompatible Journey rules snapshot');
}


