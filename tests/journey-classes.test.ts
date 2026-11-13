import { expect, it } from 'vitest';
import { SOLDIER_CLASS_IDS, SOLDIER_CLASSES, soldierClass, validateClassCatalogue, initialClassState, CLASS_RULES } from '../packages/sim/src/journey/classes.ts';
import { JOURNEY_WEAPONS, journeyWeapon, traceJourneyWeapon } from '../packages/sim/src/journey/weapons.ts';
import { createWorld } from '../packages/sim/src/journey/world.ts';

it('defines seven bounded distinct classes without rank combat inflation', () => {
  expect(() => validateClassCatalogue()).not.toThrow(); expect(SOLDIER_CLASS_IDS).toHaveLength(7);
  expect(new Set(SOLDIER_CLASS_IDS.map(id => SOLDIER_CLASSES[id].silhouette)).size).toBe(7);
  for (const id of SOLDIER_CLASS_IDS) {
    const p = soldierClass(id); expect(soldierClass(id, Number.MAX_SAFE_INTEGER)).toBe(p);
    expect(Object.isFrozen(p)).toBe(true); expect(p.tradeoff.length).toBeGreaterThan(20);
    expect(initialClassState(id).medicalCharges).toBe(p.medicalCharges); expect(journeyWeapon(p.weapon).id).toBe(p.weapon);
  }
  expect(soldierClass('kestrel').health).toBeLessThan(soldierClass('mara').health);
  expect(soldierClass('rook').speed).toBeLessThan(soldierClass('mara').speed);
  expect(CLASS_RULES.rankCombatBenefits).toBe(false);
  for (const id of ['toString', '__proto__', 'unknown']) expect(() => soldierClass(id)).toThrow();
  expect(() => soldierClass('mara', -1)).toThrow(); expect(() => journeyWeapon('rocket-launcher')).toThrow();
});

it('traces every local signature weapon against the same elevated bodies and walls', () => {
  const world = createWorld(72, 48, []), origin = { x: 5, y: 1.8, z: 24 }, target = { id: 4, x: 7, y: 0, z: 24, pose: 'standing' as const, hp: 100 };
  for (const build of Object.values(JOURNEY_WEAPONS)) {
    const shot = traceJourneyWeapon(world, origin, { x: 1, y: 0, z: 0 }, build, [target]);
    expect(shot.rays).toHaveLength(build.pellets); expect(shot.hits[0].damage).toBeGreaterThan(0);
    expect(shot.hits.reduce((sum, hit) => sum + hit.damage, 0)).toBeLessThanOrEqual(build.damage);
    const wall = createWorld(72, 48, [{ x: 6, z: 20, w: .02, d: 8, h: 4 }]);
    expect(traceJourneyWeapon(wall, origin, { x: 1, y: 0, z: 0 }, build, [target]).hits).toHaveLength(0);
    expect(traceJourneyWeapon(world, origin, { x: 1, y: 0, z: 0 }, build, [{ ...target, y: 2 }]).hits).toHaveLength(0);
  }
});

it('limits shotgun damage across several targets and preserves range differences', () => {
  const world = createWorld(72, 48, []), origin = { x: 5, y: 1.8, z: 24 }, direction = { x: 1, y: 0, z: 0 };
  const targets = Array.from({ length: 5 }, (_, i) => ({ id: i + 4, x: 7, y: 0, z: 24 + (i - 2) * .4, hp: 100, pose: 'standing' as const }));
  expect(traceJourneyWeapon(world, origin, direction, JOURNEY_WEAPONS['trench-shotgun'], targets).hits.reduce((total, hit) => total + hit.damage, 0)).toBeLessThanOrEqual(30);
  const distant = [{ ...targets[2], x: 40 }];
  expect(traceJourneyWeapon(world, origin, direction, JOURNEY_WEAPONS['marksman-rifle'], distant).hits).toHaveLength(1);
  expect(traceJourneyWeapon(world, origin, direction, JOURNEY_WEAPONS['field-carbine'], distant).hits).toHaveLength(0);
  expect(() => traceJourneyWeapon(world, origin, { x: 0, y: 0, z: 0 }, JOURNEY_WEAPONS['service-rifle'], targets)).toThrow();
});
