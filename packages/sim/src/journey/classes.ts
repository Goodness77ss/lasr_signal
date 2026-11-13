import { JOURNEY_WEAPONS, JOURNEY_WEAPON_VERSION, journeyWeapon, type JourneyWeaponId } from './weapons.ts';

export type SoldierClassId = 'mara' | 'kestrel' | 'rook' | 'imani' | 'flint' | 'vale' | 'beck';
export type SoldierAbility = 'brace' | 'recon' | 'treat' | 'grenade-stock' | 'focus' | 'resupply';
export type SoldierClass = Readonly<{
  id: SoldierClassId; name: string; role: string; line: string; tradeoff: string;
  health: number; armour: number; speed: number; vision: number; reloadPercent: number;
  weapon: JourneyWeaponId; damagePercent: number; grenades: number; medicalCharges: number; ammoCharges: number;
  ability: SoldierAbility; duration: number; cooldown: number; followDistance: number;
  cloth: number; trim: number; silhouette: 'radio' | 'scarf' | 'plates' | 'medical' | 'grenades' | 'coat' | 'pouches';
}>;
const profile = (definition: SoldierClass): SoldierClass => Object.freeze(definition);
export const SOLDIER_CLASSES: Readonly<Record<SoldierClassId, SoldierClass>> = Object.freeze({
  mara: profile({ id: 'mara', name: 'Mara', role: 'Anchor', line: 'Hold together. We leave together.', tradeoff: 'Balanced rifle role. Brace briefly protects; no specialist reach.', health: 100, armour: 10, speed: 4, vision: 22, reloadPercent: 100, weapon: 'service-rifle', damagePercent: 100, grenades: 2, medicalCharges: 0, ammoCharges: 0, ability: 'brace', duration: 40, cooldown: 160, followDistance: 1.8, cloth: 0x77754e, trim: 0xc9ad71, silhouette: 'radio' }),
  kestrel: profile({ id: 'kestrel', name: 'Kestrel', role: 'Scout', line: 'Eyes ahead. Watch the far edge.', tradeoff: 'Fast movement and long observation. Low health and light armour.', health: 80, armour: 5, speed: 5, vision: 28, reloadPercent: 90, weapon: 'field-carbine', damagePercent: 100, grenades: 1, medicalCharges: 0, ammoCharges: 0, ability: 'recon', duration: 60, cooldown: 200, followDistance: 2.8, cloth: 0x5c7161, trim: 0xa4c4ac, silhouette: 'scarf' }),
  rook: profile({ id: 'rook', name: 'Rook', role: 'Bulwark', line: 'Stay behind my shoulder.', tradeoff: 'Heavy protection and sustained fire. Slow movement and long reload.', health: 120, armour: 25, speed: 3, vision: 20, reloadPercent: 125, weapon: 'support-gun', damagePercent: 100, grenades: 1, medicalCharges: 0, ammoCharges: 0, ability: 'brace', duration: 60, cooldown: 200, followDistance: 1.2, cloth: 0x4d5757, trim: 0xb4b7a4, silhouette: 'plates' }),
  imani: profile({ id: 'imani', name: 'Imani', role: 'Medic', line: 'Come closer. I can stop that bleeding.', tradeoff: 'Two finite treatments. Reduced carbine damage and light protection.', health: 90, armour: 5, speed: 4, vision: 22, reloadPercent: 100, weapon: 'field-carbine', damagePercent: 80, grenades: 1, medicalCharges: 2, ammoCharges: 0, ability: 'treat', duration: 0, cooldown: 60, followDistance: 1.6, cloth: 0x777b62, trim: 0xd8d0a8, silhouette: 'medical' }),
  flint: profile({ id: 'flint', name: 'Flint', role: 'Grenadier', line: 'Clear the throw. Then move.', tradeoff: 'Three finite fragmentation grenades. Slower movement and reload.', health: 100, armour: 15, speed: 3.6, vision: 22, reloadPercent: 110, weapon: 'service-rifle', damagePercent: 100, grenades: 3, medicalCharges: 0, ammoCharges: 0, ability: 'grenade-stock', duration: 0, cooldown: 0, followDistance: 2.2, cloth: 0x80694b, trim: 0xc3a05d, silhouette: 'grenades' }),
  vale: profile({ id: 'vale', name: 'Vale', role: 'Marksman', line: 'Give me a clear lane.', tradeoff: 'Long range and deliberate fire. Small magazine and slow close pressure.', health: 80, armour: 5, speed: 3.6, vision: 32, reloadPercent: 110, weapon: 'marksman-rifle', damagePercent: 100, grenades: 1, medicalCharges: 0, ammoCharges: 0, ability: 'focus', duration: 60, cooldown: 200, followDistance: 2.6, cloth: 0x576750, trim: 0x92a780, silhouette: 'coat' }),
  beck: profile({ id: 'beck', name: 'Beck', role: 'Ranger', line: 'Check your pockets before the next ridge.', tradeoff: 'One finite ammunition reserve. Shotgun reach is short.', health: 95, armour: 10, speed: 4.2, vision: 24, reloadPercent: 95, weapon: 'trench-shotgun', damagePercent: 100, grenades: 2, medicalCharges: 0, ammoCharges: 1, ability: 'resupply', duration: 0, cooldown: 40, followDistance: 2, cloth: 0x75674f, trim: 0xbea77c, silhouette: 'pouches' }),
});
export const SOLDIER_CLASS_IDS = Object.freeze(Object.keys(SOLDIER_CLASSES) as SoldierClassId[]);
export const CLASS_RULES = Object.freeze({
  version: 'journey-classes-1', classes: SOLDIER_CLASSES, weapons: JOURNEY_WEAPONS, weaponVersion: JOURNEY_WEAPON_VERSION,
  armourCap: 40, braceBonus: 15, reconBonus: 4, focusBonus: 8, focusSpeedPercent: 50,
  treatment: 25, treatmentRange: 3, ammoRefill: 24, maxExtraReserve: 24, rankCombatBenefits: false,
});
export type SoldierClassState = { version: typeof CLASS_RULES.version; id: SoldierClassId; medicalCharges: number; ammoCharges: number; readyAt: number; until: number };
export function soldierClass(id: string, cosmeticRank = 0): SoldierClass {
  if (!Object.hasOwn(SOLDIER_CLASSES, id) || !Number.isSafeInteger(cosmeticRank) || cosmeticRank < 0) throw Error('Unsupported Journey soldier class');
  return SOLDIER_CLASSES[id as SoldierClassId];
}
export function initialClassState(id: SoldierClassId): SoldierClassState {
  const definition = soldierClass(id);
  return { version: CLASS_RULES.version, id, medicalCharges: definition.medicalCharges, ammoCharges: definition.ammoCharges, readyAt: 0, until: 0 };
}
export function validateClassCatalogue(): void {
  if (SOLDIER_CLASS_IDS.length !== 7) throw Error('Invalid Journey class count');
  for (const id of SOLDIER_CLASS_IDS) {
    const p = soldierClass(id), weapon = journeyWeapon(p.weapon);
    if (p.id !== id || !p.line || !p.tradeoff || !p.role || !Number.isFinite(p.speed) || p.speed < 3 || p.speed > 5 ||
      !Number.isSafeInteger(p.health) || p.health < 75 || p.health > 120 || !Number.isSafeInteger(p.armour) || p.armour < 0 || p.armour > 25 ||
      !Number.isSafeInteger(p.vision) || p.vision < 18 || p.vision + CLASS_RULES.focusBonus > 40 || p.reloadPercent < 80 || p.reloadPercent > 130 ||
      p.damagePercent < 50 || p.damagePercent > 100 || p.grenades < 1 || p.grenades > 3 || p.medicalCharges < 0 || p.medicalCharges > 2 ||
      p.ammoCharges < 0 || p.ammoCharges > 1 || weapon.magazine < 1 || weapon.magazine > 60 || weapon.range > 44) throw Error('Invalid Journey class definition');
  }
}
