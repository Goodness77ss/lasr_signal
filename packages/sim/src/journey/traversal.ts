import type { Point } from '../rules.ts';
import { bodyHeight, MOTION_RULES, type MotionWorld, type Pose } from './motion.ts';
import type { Vec3 } from './world.ts';

// These parameters are not active rules until a new Journey version pins them.
export const TRAVERSAL_RULES = Object.freeze({
  ticks: 20, gravity: 14, jumpSpeed: 6, maxFallSpeed: 20, jumpCooldown: 16,
  stepHeight: .35, maxSlope: .8, maxHeight: 40, sweepStep: .025,
  vaultHeight: 1.35, vaultDistance: 3.6, vaultReach: 1.2, vaultTicks: 18,
  vaultClearance: .08, fallDamage: false,
});
export type TraversalWorld = MotionWorld & { terrain(p: Point): { elevation: number; speed?:number } };
export type VaultPlan = { from: Vec3; to: Vec3; direction: Point; crest: number; started: number; until: number };
export type TraversalState = {
  y: number; velocity: number; grounded: boolean; landedAt: number;
  nextJumpAt: number; vault: VaultPlan | null;
};
const EPS = 1e-7;
const finitePoint = (p: Vec3) => [p.x, p.y, p.z].every(Number.isFinite);
const validTick = (tick: number) => Number.isSafeInteger(tick) && tick >= 0 && tick <= Number.MAX_SAFE_INTEGER - TRAVERSAL_RULES.vaultTicks - TRAVERSAL_RULES.jumpCooldown;
const overlaps = (p: Point, s: MotionWorld['solids'][number]) => {
  const dx = p.x - Math.max(s.x, Math.min(s.x + s.w, p.x));
  const dz = p.z - Math.max(s.z, Math.min(s.z + s.d, p.z));
  return dx * dx + dz * dz < MOTION_RULES.radius ** 2 - EPS;
};
const groundAt = (world: TraversalWorld, p: Point) => world.terrain(p).elevation;

export function traversalSupport(world: TraversalWorld, p: Point, ceiling: number): number {
  let support = groundAt(world, p);
  if (!Number.isFinite(support) || support > ceiling + EPS) return Number.NaN;
  for (const solid of world.solids) {
    const top = (solid.y ?? 0) + solid.h;
    if (top <= ceiling + EPS && top > support && overlaps(p, solid)) support = top;
  }
  return support;
}

export function traversalBodyClear(world: TraversalWorld, p: Vec3, pose: Pose): boolean {
  const radius = MOTION_RULES.radius, ground = groundAt(world, p);
  if (!finitePoint(p) || !Number.isFinite(ground) || p.y < ground - EPS || p.y > TRAVERSAL_RULES.maxHeight ||
    p.x < radius || p.z < radius || p.x > world.width - radius || p.z > world.depth - radius) return false;
  return !world.solids.some(s => overlaps(p, s) && p.y < (s.y ?? 0) + s.h - EPS && p.y + bodyHeight(pose) > (s.y ?? 0) + EPS);
}

export function sweepTraversal(world: TraversalWorld, from: Vec3, to: Vec3, pose: Pose): Vec3 {
  const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  if (!finitePoint(to) || !Number.isFinite(length) || length > Math.hypot(world.width, world.depth, TRAVERSAL_RULES.maxHeight) * 2 || !traversalBodyClear(world, from, pose)) return { ...from };
  const samples = Math.max(1, Math.ceil(length / TRAVERSAL_RULES.sweepStep));
  let at = { ...from };
  for (let i = 1; i <= samples; i++) {
    const p = { x: from.x + (to.x - from.x) * i / samples, y: from.y + (to.y - from.y) * i / samples, z: from.z + (to.z - from.z) * i / samples };
    if (!traversalBodyClear(world, p, pose)) break;
    at = p;
  }
  return at;
}

export function emptyTraversal(y = 0): TraversalState {
  return { y, velocity: 0, grounded: true, landedAt: 0, nextJumpAt: 0, vault: null };
}

function supported(state: TraversalState, at: Point, world: TraversalWorld): boolean {
  return Math.abs(state.y - traversalSupport(world, at, state.y + EPS)) < EPS;
}

export function startJump(state: TraversalState, at: Point, pose: Pose, world: TraversalWorld, tick: number): boolean {
  if (!validTick(tick) || tick < state.nextJumpAt || !state.grounded || state.vault || pose !== 'standing' || !supported(state, at, world) ||
    !traversalBodyClear(world, { ...at, y: state.y + .05 }, pose)) return false;
  state.velocity = TRAVERSAL_RULES.jumpSpeed; state.grounded = false;
  state.nextJumpAt = tick + TRAVERSAL_RULES.jumpCooldown;
  return true;
}

function slopeAllowed(world: TraversalWorld, p: Point): boolean {
  const sample = .05;
  const dx = (groundAt(world, { x: p.x + sample, z: p.z }) - groundAt(world, { x: p.x - sample, z: p.z })) / (2 * sample);
  const dz = (groundAt(world, { x: p.x, z: p.z + sample }) - groundAt(world, { x: p.x, z: p.z - sample })) / (2 * sample);
  return Number.isFinite(dx) && Number.isFinite(dz) && Math.hypot(dx, dz) <= TRAVERSAL_RULES.maxSlope + EPS;
}

// Horizontal intent is bounded by its caller's speed. Steps are raised then swept;
// drops leave the actor airborne so gravity, rather than a teleport, handles them.
export function moveTraversal(state: TraversalState, at: Point, target: Point, pose: Pose, world: TraversalWorld): Point {
  if (state.vault || ![target.x, target.z].every(Number.isFinite)) return { ...at };
  const from = { x: at.x, y: state.y, z: at.z };
  let elevation = state.y;
  if (state.grounded) {
    const support = traversalSupport(world, target, state.y + TRAVERSAL_RULES.stepHeight);
    if (Number.isFinite(support) && support > state.y) {
      if (!slopeAllowed(world, target)) return { ...at };
      const raised = sweepTraversal(world, from, { ...from, y: support }, pose);
      if (Math.abs(raised.y - support) > EPS) return { ...at };
      elevation = support;
    }
  }
  const next = sweepTraversal(world, { ...from, y: elevation }, { x: target.x, y: elevation, z: target.z }, pose);
  if (Math.hypot(next.x - at.x, next.z - at.z) < EPS) return { ...at };
  state.y = next.y;
  state.grounded = state.velocity <= 0 && supported(state, next, world);
  return { x: next.x, z: next.z };
}

const smooth = (n: number) => { const t = Math.max(0, Math.min(1, n)); return t * t * (3 - 2 * t); };
export function vaultPosition(plan: VaultPlan, tick: number): Vec3 {
  const t = Math.max(0, Math.min(1, (tick - plan.started) / (plan.until - plan.started)));
  const horizontal = smooth((t - .25) / .5);
  return {
    x: plan.from.x + (plan.to.x - plan.from.x) * horizontal,
    z: plan.from.z + (plan.to.z - plan.from.z) * horizontal,
    y: t < .25 ? plan.from.y + (plan.crest - plan.from.y) * smooth(t / .25) :
      t > .75 ? plan.crest + (plan.to.y - plan.crest) * smooth((t - .75) / .25) : plan.crest,
  };
}

function vaultClear(world: TraversalWorld, plan: VaultPlan, pose: Pose): boolean {
  let previous = plan.from;
  // Match the fixed simulation tick paths, including their swept body segments.
  for (let tick = plan.started + 1; tick <= plan.until; tick++) {
    const next = vaultPosition(plan, tick), swept = sweepTraversal(world, previous, next, pose);
    if (Math.hypot(swept.x - next.x, swept.y - next.y, swept.z - next.z) > EPS) return false;
    previous = next;
  }
  return true;
}

// Derive both ends from world geometry. A client supplies direction, never a
// destination, height, duration or an assertion that an obstacle was cleared.
export function planVault(state: TraversalState, at: Point, direction: Point, pose: Pose, world: TraversalWorld, tick: number): VaultPlan | null {
  const length = Math.hypot(direction.x, direction.z);
  if (!validTick(tick) || !Number.isFinite(length) || length < .001 || tick < state.nextJumpAt || !state.grounded || state.vault || pose !== 'standing' || !supported(state, at, world)) return null;
  const d = { x: direction.x / length, z: direction.z / length };
  let obstacle: MotionWorld['solids'][number] | undefined;
  for (let distance = .05; distance <= TRAVERSAL_RULES.vaultReach; distance += .05) {
    const point = { x: at.x + d.x * distance, z: at.z + d.z * distance };
    obstacle = world.solids.find(s => overlaps(point, s) && (s.y ?? 0) < state.y + bodyHeight(pose) && (s.y ?? 0) + s.h > state.y + EPS);
    if (obstacle) break;
  }
  if (!obstacle || (obstacle.y ?? 0) > state.y + TRAVERSAL_RULES.stepHeight) return null;
  const top = (obstacle.y ?? 0) + obstacle.h;
  if (top - state.y <= TRAVERSAL_RULES.stepHeight || top - state.y > TRAVERSAL_RULES.vaultHeight) return null;
  for (let distance = .1; distance <= TRAVERSAL_RULES.vaultDistance + EPS; distance += .05) {
    const p = { x: at.x + d.x * distance, z: at.z + d.z * distance };
    if (overlaps(p, obstacle)) continue;
    // The endpoint must actually be beyond the obstacle, not before its front.
    const beyond = (p.x - (obstacle.x + obstacle.w / 2)) * d.x + (p.z - (obstacle.z + obstacle.d / 2)) * d.z;
    if (beyond <= 0) continue;
    const y = traversalSupport(world, p, state.y + TRAVERSAL_RULES.stepHeight);
    if (!Number.isFinite(y) || !slopeAllowed(world, p) || !traversalBodyClear(world, { ...p, y }, pose)) continue;
    const plan = { from: { x: at.x, y: state.y, z: at.z }, to: { ...p, y }, direction: { ...d }, crest: Math.max(top, y) + TRAVERSAL_RULES.vaultClearance, started: tick, until: tick + TRAVERSAL_RULES.vaultTicks };
    return vaultClear(world, plan, pose) ? plan : null;
  }
  return null;
}

export function startVault(state: TraversalState, at: Point, direction: Point, pose: Pose, world: TraversalWorld, tick: number): boolean {
  const plan = planVault(state, at, direction, pose, world, tick);
  if (!plan) return false;
  state.vault = plan; state.grounded = false; state.velocity = 0;
  state.nextJumpAt = tick + TRAVERSAL_RULES.vaultTicks + TRAVERSAL_RULES.jumpCooldown;
  return true;
}

export function stepTraversal(state: TraversalState, at: Point, pose: Pose, world: TraversalWorld, tick: number): Point {
  if (state.vault) {
    const next = vaultPosition(state.vault, tick), swept = sweepTraversal(world, { ...at, y: state.y }, next, pose);
    state.y = swept.y;
    if (Math.hypot(next.x - swept.x, next.y - swept.y, next.z - swept.z) > EPS) state.vault = null;
    else if (tick >= state.vault.until) { state.vault = null; state.grounded = supported(state, swept, world); state.landedAt = tick; }
    return { x: swept.x, z: swept.z };
  }
  if (state.grounded && supported(state, at, world)) return { ...at };
  state.grounded = false;
  state.velocity = Math.max(-TRAVERSAL_RULES.maxFallSpeed, state.velocity - TRAVERSAL_RULES.gravity / TRAVERSAL_RULES.ticks);
  const support = traversalSupport(world, at, state.y), falling = state.velocity <= 0;
  let y = state.y + state.velocity / TRAVERSAL_RULES.ticks;
  const landing = falling && Number.isFinite(support) && y <= support;
  if (landing) y = support;
  const next = sweepTraversal(world, { ...at, y: state.y }, { ...at, y }, pose);
  if (Math.abs(next.y - y) > EPS) state.velocity = 0;
  else if (landing) { state.grounded = true; state.velocity = 0; state.landedAt = tick; }
  state.y = next.y;
  return { x: next.x, z: next.z };
}

// Navigation predicts an ordinary jump with the same fixed gravity and swept
// horizontal movement as the live actor. No animation or teleport grants a link.
export function planJump(at:Point,direction:Point,pose:Pose,world:TraversalWorld,speed:number):Point|null {
  const length=Math.hypot(direction.x,direction.z),state=emptyTraversal(groundAt(world,at));
  if(!Number.isFinite(length)||length<.001||!Number.isFinite(speed)||speed<=0||speed>8||!startJump(state,at,pose,world,0))return null;
  const d={x:direction.x/length,z:direction.z/length};let point={...at};
  for(let tick=1;tick<=40;tick++){
    point=stepTraversal(state,point,pose,world,tick);
    const step=speed/TRAVERSAL_RULES.ticks*(world.terrain(point).speed??1);
    point=moveTraversal(state,point,{x:point.x+d.x*step,z:point.z+d.z*step},pose,world);
    if(state.grounded)return Math.hypot(point.x-at.x,point.z-at.z)>.75&&Math.abs(state.y-groundAt(world,point))<EPS?point:null;
  }
  return null;
}

export function validateTraversal(state: TraversalState, at: Point, pose: Pose, world: TraversalWorld, tick: number): void {
  const integer = (n: number, max: number) => Number.isSafeInteger(n) && n >= 0 && n <= max;
  if (!state || !validTick(tick) || !Number.isFinite(state.velocity) || state.velocity < -TRAVERSAL_RULES.maxFallSpeed || state.velocity > TRAVERSAL_RULES.jumpSpeed ||
    typeof state.grounded !== 'boolean' || !integer(state.landedAt, tick) || !integer(state.nextJumpAt, tick + TRAVERSAL_RULES.vaultTicks + TRAVERSAL_RULES.jumpCooldown) ||
    !traversalBodyClear(world, { ...at, y: state.y }, pose) || state.grounded && (!supported(state, at, world) || state.velocity !== 0 || state.vault !== null)) throw Error('Invalid Journey traversal state');
  if (state.vault) {
    const plan = state.vault, next = vaultPosition(plan, tick);
    if (!finitePoint(plan.from) || !finitePoint(plan.to) || !Number.isFinite(plan.crest) || !integer(plan.started, tick) || plan.until !== plan.started + TRAVERSAL_RULES.vaultTicks || plan.until <= tick ||
      state.velocity !== 0 || state.grounded || state.nextJumpAt !== plan.until + TRAVERSAL_RULES.jumpCooldown || pose !== 'standing' ||
      Math.hypot(plan.to.x - plan.from.x, plan.to.z - plan.from.z) > TRAVERSAL_RULES.vaultDistance + EPS ||
      plan.crest < Math.max(plan.from.y, plan.to.y) || plan.crest > plan.from.y + TRAVERSAL_RULES.vaultHeight + TRAVERSAL_RULES.vaultClearance + EPS ||
      Math.hypot(at.x - next.x, state.y - next.y, at.z - next.z) > EPS || !vaultClear(world, plan, pose)) throw Error('Invalid Journey vault plan');
    if(!plan.direction||![plan.direction.x,plan.direction.z].every(Number.isFinite)||Math.abs(Math.hypot(plan.direction.x,plan.direction.z)-1)>EPS)throw Error('Invalid Journey vault direction');
    const derived=planVault(emptyTraversal(plan.from.y),plan.from,plan.direction,pose,world,plan.started);
    if(!derived||Math.hypot(derived.to.x-plan.to.x,derived.to.y-plan.to.y,derived.to.z-plan.to.z)>EPS||Math.abs(derived.crest-plan.crest)>EPS)throw Error('Invalid Journey vault geometry');
  }
}
