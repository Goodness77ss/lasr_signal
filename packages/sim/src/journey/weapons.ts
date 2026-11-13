import { rayBodyDistance, type Pose } from './motion.ts';
import type { Vec3, WorldQuery } from './world.ts';

export type JourneyWeaponId = 'service-rifle' | 'field-carbine' | 'support-gun' | 'marksman-rifle' | 'trench-shotgun';
export type JourneyWeaponBuild = Readonly<{
  id: JourneyWeaponId; name: string; damage: number; interval: number; range: number;
  magazine: number; reserve: number; reloadTicks: number; pellets: number; spread: number;
}>;
export const JOURNEY_WEAPONS: Readonly<Record<JourneyWeaponId, JourneyWeaponBuild>> = Object.freeze({
  'service-rifle': Object.freeze({ id: 'service-rifle', name: 'Service rifle', damage: 25, interval: 5, range: 28, magazine: 20, reserve: 80, reloadTicks: 30, pellets: 1, spread: 0 }),
  'field-carbine': Object.freeze({ id: 'field-carbine', name: 'Field carbine', damage: 12, interval: 3, range: 22, magazine: 30, reserve: 90, reloadTicks: 26, pellets: 1, spread: 0 }),
  'support-gun': Object.freeze({ id: 'support-gun', name: 'Support gun', damage: 10, interval: 2, range: 30, magazine: 60, reserve: 120, reloadTicks: 60, pellets: 1, spread: 0 }),
  'marksman-rifle': Object.freeze({ id: 'marksman-rifle', name: 'Marksman rifle', damage: 48, interval: 18, range: 44, magazine: 5, reserve: 25, reloadTicks: 44, pellets: 1, spread: 0 }),
  'trench-shotgun': Object.freeze({ id: 'trench-shotgun', name: 'Trench shotgun', damage: 30, interval: 16, range: 8, magazine: 6, reserve: 36, reloadTicks: 44, pellets: 5, spread: Math.PI / 12 }),
});
export const JOURNEY_WEAPON_VERSION = 'journey-weapons-1';
export function journeyWeapon(id: string): JourneyWeaponBuild {
  if (!Object.hasOwn(JOURNEY_WEAPONS, id)) throw Error('Unsupported Journey weapon');
  return JOURNEY_WEAPONS[id as JourneyWeaponId];
}
export type JourneyShotTarget = { id: number; x: number; z: number; y: number; pose: Pose; hp: number };
export type JourneyRay = { to: Vec3; target: number | null };
// These are local gameplay builds, not adapters for any existing collectible.
// All rays share one trigger damage budget and use the physical world and body.
export function traceJourneyWeapon(world: WorldQuery, origin: Vec3, direction: Vec3, build: JourneyWeaponBuild, targets: readonly JourneyShotTarget[], rangeBonus = 0) {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (![origin.x, origin.y, origin.z, length, rangeBonus].every(Number.isFinite) || length < .001 || rangeBonus < 0 || rangeBonus > 8 || journeyWeapon(build.id) !== build) throw Error('Invalid Journey weapon shot');
  const unit = { x: direction.x / length, y: direction.y / length, z: direction.z / length }, hits = new Map<number, number>(), rays: JourneyRay[] = [];
  for (let i = 0; i < build.pellets; i++) {
    const angle = build.pellets === 1 ? 0 : (i / (build.pellets - 1) * 2 - 1) * build.spread;
    const d = { x: unit.x * Math.cos(angle) + unit.z * Math.sin(angle), y: unit.y, z: unit.z * Math.cos(angle) - unit.x * Math.sin(angle) };
    let end = world.shotDistance(origin, d, build.range + rangeBonus), target: number | null = null;
    for (const actor of targets) {
      if (actor.hp <= 0) continue;
      const at = rayBodyDistance(origin, d, actor, actor.pose, end);
      if (at !== null && at < end) { end = at; target = actor.id; }
    }
    rays.push({ to: { x: origin.x + d.x * end, y: origin.y + d.y * end, z: origin.z + d.z * end }, target });
    if (target !== null) {
      const falloff = build.pellets === 1 ? 1 : Math.max(.25, 1 - Math.max(0, end - 2) / 8);
      hits.set(target, (hits.get(target) ?? 0) + build.damage / build.pellets * falloff);
    }
  }
  return { rays, hits: [...hits].map(([id, damage]) => ({ id, damage: Math.floor(damage) })) };
}
