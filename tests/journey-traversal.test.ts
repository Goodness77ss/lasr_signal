import { expect, it } from 'vitest';
import { createWorld } from '../packages/sim/src/journey/world.ts';
import { emptyTraversal, startJump, startVault, stepTraversal, moveTraversal, traversalBodyClear, validateTraversal, TRAVERSAL_RULES } from '../packages/sim/src/journey/traversal.ts';

it('jumps physically, refuses repeated midair input and lands deterministically after recovery', () => {
  const world = createWorld(72, 48, []), state = emptyTraversal(); let point = { x: 5, z: 24 };
  expect(startJump(state, point, 'standing', world, 0)).toBe(true);
  expect(startJump(state, point, 'standing', world, 0)).toBe(false);
  for (let tick = 1; tick <= 7; tick++) point = stepTraversal(state, point, 'standing', world, tick);
  expect(state.y).toBeGreaterThan(1); expect(state.grounded).toBe(false);
  const recovered = structuredClone(state); let restoredPoint = { ...point };
  validateTraversal(recovered, restoredPoint, 'standing', world, 7);
  for (let tick = 8; tick <= 20; tick++) {
    point = stepTraversal(state, point, 'standing', world, tick);
    restoredPoint = stepTraversal(recovered, restoredPoint, 'standing', world, tick);
    expect(recovered).toEqual(state); expect(restoredPoint).toEqual(point);
  }
  expect(state.grounded).toBe(true); expect(state.y).toBe(0); expect(state.velocity).toBe(0);
});

it('sweeps ascent against a low ceiling and lets gravity recover after the collision', () => {
  const world = createWorld(72, 48, [{ x: 4, z: 22, w: 4, d: 4, y: 2.2, h: .1 }]);
  const state = emptyTraversal(), point = { x: 5, z: 24 };
  expect(startJump(state, point, 'standing', world, 0)).toBe(true);
  for (let tick = 1; tick <= 20; tick++) {
    stepTraversal(state, point, 'standing', world, tick);
    expect(state.y).toBeLessThanOrEqual(.2 + 1e-7);
    expect(traversalBodyClear(world, { ...point, y: state.y }, 'standing')).toBe(true);
  }
  expect(state.grounded).toBe(true); expect(state.y).toBe(0);
});

it('cannot move through a thin wall in midair or step up an excessive ledge', () => {
  const world = createWorld(72, 48, [{ x: 6, z: 20, w: .02, d: 8, h: 4 }]), state = emptyTraversal(), point = { x: 5, z: 24 };
  startJump(state, point, 'standing', world, 0); stepTraversal(state, point, 'standing', world, 1);
  const next = moveTraversal(state, point, { x: 7, z: 24 }, 'standing', world);
  expect(next.x).toBeLessThanOrEqual(6 - .35);
  const ledge = createWorld(72, 48, [{ x: 6, z: 20, w: 3, d: 8, h: .6 }]), grounded = emptyTraversal();
  expect(moveTraversal(grounded, point, { x: 7, z: 24 }, 'standing', ledge).x).toBeLessThanOrEqual(6 - .35);
});

it('steps onto a small surface, falls from its edge and rejects steep slopes', () => {
  const world = createWorld(72, 48, [{ x: 6, z: 20, w: 2, d: 8, h: .3 }]), state = emptyTraversal(); let point = { x: 5.5, z: 24 };
  point = moveTraversal(state, point, { x: 6.5, z: 24 }, 'standing', world);
  expect(point.x).toBe(6.5); expect(state.y).toBe(.3); expect(state.grounded).toBe(true);
  point = moveTraversal(state, point, { x: 9, z: 24 }, 'standing', world);
  expect(state.grounded).toBe(false); expect(state.y).toBe(.3);
  for (let tick = 1; tick <= 10; tick++) point = stepTraversal(state, point, 'standing', world, tick);
  expect(state.y).toBe(0); expect(state.grounded).toBe(true);
  const slope = createWorld(72, 48, []); slope.terrain = p => ({ surface: 'soil', speed: 1, elevation: Math.max(0, p.x - 5) });
  const steep = emptyTraversal(); expect(moveTraversal(steep, { x: 5, z: 24 }, { x: 5.1, z: 24 }, 'standing', slope)).toEqual({ x: 5, z: 24 });
});

it('vaults a low obstacle with a swept body and recovers the exact active plan', () => {
  const world = createWorld(72, 48, [{ x: 6, z: 22, w: .8, d: 4, h: 1.1 }]);
  const state = emptyTraversal(); let point = { x: 5, z: 24 };
  expect(startVault(state, point, { x: 1, z: 0 }, 'standing', world, 0)).toBe(true);
  expect(startVault(state, point, { x: 1, z: 0 }, 'standing', world, 0)).toBe(false);
  for (let tick = 1; tick <= 9; tick++) { point = stepTraversal(state, point, 'standing', world, tick); validateTraversal(state, point, 'standing', world, tick); }
  expect(state.y).toBeGreaterThan(1.1);
  const recovered = structuredClone(state); let restoredPoint = { ...point };
  for (let tick = 10; tick <= TRAVERSAL_RULES.vaultTicks; tick++) {
    point = stepTraversal(state, point, 'standing', world, tick);
    restoredPoint = stepTraversal(recovered, restoredPoint, 'standing', world, tick);
    expect(recovered).toEqual(state); expect(restoredPoint).toEqual(point);
    expect(traversalBodyClear(world, { ...point, y: state.y }, 'standing')).toBe(true);
  }
  expect(point.x).toBeGreaterThan(6.8 + .35); expect(state.y).toBe(0); expect(state.vault).toBeNull(); expect(state.grounded).toBe(true);
});

it('rejects tall, wide, distant and ceiling blocked vaults and edited recovery state', () => {
  const point = { x: 5, z: 24 }, direction = { x: 1, z: 0 };
  for (const solids of [
    [{ x: 6, z: 22, w: .8, d: 4, h: 2 }],
    [{ x: 6, z: 22, w: 5, d: 4, h: 1 }],
    [{ x: 8, z: 22, w: .8, d: 4, h: 1 }],
    [{ x: 6, z: 22, w: .8, d: 4, h: 1 }, { x: 4, z: 22, w: 5, d: 4, h: .1, y: 2.2 }],
  ]) expect(startVault(emptyTraversal(), point, direction, 'standing', createWorld(72, 48, solids), 0)).toBe(false);
  const world = createWorld(72, 48, []), state = emptyTraversal();
  state.y = 3; expect(() => validateTraversal(state, point, 'standing', world, 0)).toThrow();
  state.grounded = false; state.velocity = 999; expect(() => validateTraversal(state, point, 'standing', world, 0)).toThrow();
  expect(startJump(emptyTraversal(), point, 'crouched', world, 0)).toBe(false);
});
it('rejects altered vault geometry and waits for cooldown between repeated obstacle crossings',()=>{
  const world=createWorld(72,48,[{x:6,z:22,w:.8,d:4,h:1.1}]),state=emptyTraversal();let point={x:5,z:24};
  expect(startVault(state,point,{x:1,z:0},'standing',world,0)).toBe(true);
  for(let tick=1;tick<=9;tick++)point=stepTraversal(state,point,'standing',world,tick);
  const forged=structuredClone(state);forged.vault!.direction={x:0,z:1};expect(()=>validateTraversal(forged,point,'standing',world,9)).toThrow();
  for(let tick=10;tick<=18;tick++)point=stepTraversal(state,point,'standing',world,tick);
  expect(startVault(state,point,{x:-1,z:0},'standing',world,18)).toBe(false);
  expect(startVault(state,point,{x:-1,z:0},'standing',world,34)).toBe(true);
});
