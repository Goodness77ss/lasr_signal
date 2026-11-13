export const RULES = Object.freeze({
  version: 'practice-5-endless-front', ticks: 20, countdown: 60, regulation: 3600, overtime: 400,
  victory: 240, doubleAt: 3000, budget: 100, squadHp: 100, speed: 3,
  range: 8, vision: 12, volley: 10, weaponTicks: 20, firingSpeed: .75,
  rifleDamage: 20, rifleTicks: 5, rifleRange: 14, magazine: 20, reserveAmmo: 80, maxReserveAmmo:180, reloadTicks: 30,
  heroDamageScale:.5, heroHitGraceTicks:10,
  regenDelay:100, regenPerSecond:8, waveBreak:160, waveReward:10,
  lootTokens: 5, lootRange: 2, dodgeCooldown: 60, dodgeDuration: 10,
  maxSquads: 3, deployCost: 20, deployCooldown: 100, spawnDelay: 40,
  shieldCost: 10, shieldCapacity: 30, shieldDuration: 80, shieldCooldown: 360,
  empCost: 15, empRange: 10, empRadius: 3, empDuration: 40, empCooldown: 440,
  captureRadius: 3, captureTicks: 100, homeRadius: 4,
  coverTicks: 10, coverReduction: .6, suppressionHit: 25,
  suppressionThreshold: 60, suppressionDelay: 40, suppressionDecay: 1, suppressionSpeed: .6,
  botThink: 15,
});
export type Side = 0 | 1;
export type Point = { x: number; z: number };
export const HOMES: Point[] = [{ x: 4, z: 16 }, { x: 44, z: 16 }];
export const RELAYS = [{ id: 'A', x: 24, z: 7 }, { id: 'B', x: 24, z: 16 }, { id: 'C', x: 24, z: 25 }];
export const MAP = {
  version: 'compound-1', width: 48, depth: 32,
  obstacles: [
    { x: 11, z: 7, w: 6, d: 4, h: 2.4 }, { x: 31, z: 7, w: 6, d: 4, h: 2.4 },
    { x: 11, z: 21, w: 6, d: 4, h: 2.4 }, { x: 31, z: 21, w: 6, d: 4, h: 2.4 },
    { x: 20, z: 11, w: 3, d: 2, h: 1.6 }, { x: 25, z: 11, w: 3, d: 2, h: 1.6 },
    { x: 20, z: 19, w: 3, d: 2, h: 1.6 }, { x: 25, z: 19, w: 3, d: 2, h: 1.6 },
  ],
  covers: [
    { id: 0, x: 18, z: 6, facing: 1 }, { id: 1, x: 30, z: 6, facing: -1 },
    { id: 2, x: 18, z: 16, facing: 1 }, { id: 3, x: 30, z: 16, facing: -1 },
    { id: 4, x: 18, z: 26, facing: 1 }, { id: 5, x: 30, z: 26, facing: -1 },
  ],
};
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
export const quantize = (n: number) => Math.round(n * 10000) / 10000;
export function legal(p: Point, side?: Side): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.z) && p.x >= .5 && p.x <= 47.5 && p.z >= .5 && p.z <= 31.5
    && !MAP.obstacles.some(o => p.x >= o.x && p.x <= o.x + o.w && p.z >= o.z && p.z <= o.z + o.d)
    && (side === undefined || distance(p, HOMES[1 - side]) > RULES.homeRadius);
}
// Physical bodies use the same authored footprints as the rendered field props.
export const ACTOR={radius:.26,eyeHeight:1.8,modelScale:1.1,fieldScale:1.5} as const;
export type Solid={x:number;z:number;w:number;d:number;h:number};
export const FIELD_SOLIDS:Solid[]=[...MAP.obstacles,
 ...RELAYS.flatMap((r,i)=>[{x:r.x-.55,z:r.z+.125,w:1.1,d:.65,h:.9},{x:r.x+.57,z:r.z+.52,w:.06,d:.06,h:2.5},...(i===1?[-.8,1.7].map(x=>({x:r.x+x-.52,z:r.z-.67,w:.14,d:.14,h:3.2})):[]),...(i===2?[-.7,1.8].map(x=>({x:r.x+x-.87,z:r.z-.92,w:.84,d:.84,h:1.4})):[])]),
 ...MAP.covers.map(c=>({x:c.x+c.facing*.7-.3,z:c.z-1.49,w:.6,d:3.1,h:.74})),
 ...HOMES.flatMap(h=>[{x:h.x-.9,z:h.z+2.025,w:1.8,d:.95,h:.93},{x:h.x+(h.x>24?-1.3:1.3)-.8*.65/2,z:h.z+2.8-.65*.65/2,w:.8*.65,d:.65*.65,h:.65*.65},{x:h.x-.06,z:h.z+3.34,w:.12,d:.12,h:3}]),
 ...MAP.obstacles.flatMap(o=>[{x:o.x+.6-.8*.65/2,z:o.z+o.d+.22-.65*.65/2,w:.8*.65,d:.65*.65,h:.65*.65},{x:o.x+1.3-.2,z:o.z+o.d+.22-.1625,w:.4,d:.325,h:.325},{x:o.x+o.w-.69,z:o.z+o.d-.02,w:.48,d:.48,h:.65}].map(s=>o.x>24?{...s,x:2*(o.x+o.w/2)-s.x-s.w}:s)),
 ...[{x:3,z:4},{x:45,z:28}].map(p=>({x:p.x-1,z:p.z-.7,w:2,d:1.4,h:.8}))];
export function walkable(p:Point,side?:Side,radius:number=ACTOR.radius):boolean{return legal(p,side)&&!FIELD_SOLIDS.some(o=>{const dx=p.x-Math.max(o.x,Math.min(o.x+o.w,p.x)),dz=p.z-Math.max(o.z,Math.min(o.z+o.d,p.z));return dx*dx+dz*dz<radius*radius;});}
export function bodyStep(from:Point,to:Point,side:Side):Point{const count=Math.max(1,Math.ceil(distance(from,to)/.06));let at={...from};for(let i=1;i<=count;i++){const next={x:from.x+(to.x-from.x)*i/count,z:from.z+(to.z-from.z)*i/count};if(!walkable(next,side))break;at=next;}return {x:quantize(at.x),z:quantize(at.z)};}
export function lineOfSight(a: Point, b: Point): boolean {
  const steps = Math.ceil(distance(a, b) * 8);
  for (let i = 1; i < steps; i++) {
    if (!legal({ x: a.x + (b.x - a.x) * i / steps, z: a.z + (b.z - a.z) * i / steps })) return false;
  }
  return true;
}
const routeEdgeCache=new Map<string,boolean>();
// Stable four neighbor breadth first search on an authored one unit grid.
export function path(from: Point, to: Point, side: Side): Point[] | null {
  if(!walkable(to,side)){if(!legal(to,side))return null;const original=to;const nearby=[.4,.7,1].flatMap(r=>Array.from({length:8},(_,i)=>({x:original.x+Math.cos(i*Math.PI/4-Math.PI/2)*r,z:original.z+Math.sin(i*Math.PI/4-Math.PI/2)*r}))).find(p=>walkable(p,side));if(!nearby)return null;to=nearby;}
  const cell = (p: Point) => Math.floor(p.z) * 48 + Math.floor(p.x);
  const point = (n: number): Point => ({ x: n % 48 + .5, z: Math.floor(n / 48) + .5 });
  const start = cell(from), end = cell(to);
  const queue = [start], previous = new Map<number, number>([[start, -1]]);
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (current === end) break;
    const p = point(current);
    for (const d of [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }, { x: 0, z: -1 }]) {
      const next = { x: p.x + d.x, z: p.z + d.z }, id = cell(next);
      const destination=id===end?to:next,origin=current===start?from:p;const length=distance(origin,destination),samples=Math.max(1,Math.ceil(length/.15));const key=side+':'+current+':'+id;const cached=current!==start&&id!==end?routeEdgeCache.get(key):undefined;
      const clear=cached??Array.from({length:samples},(_,i)=>({x:origin.x+(destination.x-origin.x)*(i+1)/samples,z:origin.z+(destination.z-origin.z)*(i+1)/samples})).every(at=>walkable(at,side));if(current!==start&&id!==end&&cached===undefined)routeEdgeCache.set(key,clear);
      if (!previous.has(id)&&clear) { previous.set(id, current); queue.push(id); }
    }
  }
  if (!previous.has(end)) return null;
  const result: Point[] = [to];
  for (let c = end; c !== start; c = previous.get(c)!) if(c!==end)result.unshift(point(c));
  return result;
}

export function clearBodyPosition(p:Point,side:Side):Point{if(walkable(p,side))return p;for(let ring=1;ring<=12;ring++)for(let i=0;i<24;i++){const at={x:quantize(p.x+Math.cos(i*Math.PI/12)*ring*.2),z:quantize(p.z+Math.sin(i*Math.PI/12)*ring*.2)};if(walkable(at,side))return at;}return p;}
