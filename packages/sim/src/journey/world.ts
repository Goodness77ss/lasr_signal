import { MAP, FIELD_SOLIDS, walkable, bodyStep, lineOfSight, type Point, type Solid, type Side } from '../rules.ts';
export type Vec3 = Point & { y: number };
export interface WorldQuery {
  readonly width: number; readonly depth: number; readonly solids: readonly (Solid&{y?:number})[];
  walkable(point: Point, radius?: number): boolean;
  move(from: Point, to: Point, radius?: number): Point;
  segmentClear(from: Point, to: Point, radius?: number): boolean;
  shotDistance(origin: Vec3, direction: Vec3, range: number): number;
  terrain(point: Point): { surface: 'road' | 'soil' | 'mud' | 'vegetation' | 'gravel'; elevation: number; speed: number; visibility?:number;sound?:number };
  readonly portals: readonly Point[];
}
const finite = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.z);
export function createWorld(width: number, depth: number, solids: readonly (Solid&{y?:number})[], portals: readonly Point[] = []): WorldQuery {
  const world: WorldQuery = {
    width, depth, solids, portals,
    walkable(p, radius = .35) {
      return finite(p) && Number.isFinite(radius) && radius >= 0 && p.x >= radius && p.z >= radius && p.x <= width-radius && p.z <= depth-radius && !solids.some(s => {
        if((s.y??0)>=2||(s.y??0)+s.h<=0)return false;
        const dx=p.x-Math.max(s.x,Math.min(s.x+s.w,p.x)), dz=p.z-Math.max(s.z,Math.min(s.z+s.d,p.z));
        return dx*dx+dz*dz <= radius*radius;
      });
    },
    segmentClear(a,b,radius=.35) {
      if (!finite(a) || !finite(b) || Math.hypot(a.x-b.x,a.z-b.z) > Math.hypot(width,depth)*2) return false;
      const count=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.06));
      for(let i=0;i<=count;i++) if(!world.walkable({x:a.x+(b.x-a.x)*i/count,z:a.z+(b.z-a.z)*i/count},radius)) return false;
      return true;
    },
    move(a,b,radius=.35) {
      if(!world.walkable(a,radius)||!finite(b)) return {...a};
      const length=Math.hypot(b.x-a.x,b.z-a.z);
      if(length>Math.hypot(width,depth)*2) return {...a};
      const count=Math.max(1,Math.ceil(length/.06));let at={...a};
      for(let i=1;i<=count;i++) {
        const next={x:a.x+(b.x-a.x)*i/count,z:a.z+(b.z-a.z)*i/count};
        if(!world.walkable(next,radius)) break;
        at=next;
      }
      return at;
    },
    shotDistance(origin,direction,range) {
      if(!finite(origin)||!Number.isFinite(origin.y)||![direction.x,direction.y,direction.z,range].every(Number.isFinite)||range<0) return 0;
      const length=Math.hypot(direction.x,direction.y,direction.z);if(length<.001)return 0;
      const d={x:direction.x/length,y:direction.y/length,z:direction.z/length};let nearest=range;
      if(d.y<0) nearest=Math.min(nearest,Math.max(0,-origin.y/d.y));
      for(const s of solids){
        let lo=0,hi=nearest;
        for(const [key,min,max] of [['x',s.x,s.x+s.w],['y',s.y??0,(s.y??0)+s.h],['z',s.z,s.z+s.d]] as const){
          if(Math.abs(d[key])<1e-9){if(origin[key]<min||origin[key]>max){hi=-1;break;}}
          else {const a=(min-origin[key])/d[key],b=(max-origin[key])/d[key];lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));}
        }
        if(lo<=hi&&hi>=0)nearest=Math.min(nearest,Math.max(0,lo));
      }
      return nearest;
    },
    terrain(p){return {surface:Math.abs(p.z-depth/2)<5?'road':'soil',elevation:0,speed:1};},
  };
  return world;
}
// Preserve the fixed map's existing navigation semantics. No legacy global is mutated.
export function legacyWorld(side: Side = 0): WorldQuery {
  return {...createWorld(MAP.width,MAP.depth,FIELD_SOLIDS),walkable:(p,r)=>walkable(p,side,r),move:(a,b)=>bodyStep(a,b,side),segmentClear:(a,b)=>lineOfSight(a,b)};
}
export const ROAD_SECTION = Object.freeze({
  id:'authored-road-1:0', ordinal:'0', region:'ruined-outskirts',
  spawn:{x:7,z:24}, checkpoint:{x:66,z:24},
  solids:[
    {x:17,z:12,w:9,d:7,h:4.3},{x:17,z:31,w:9,d:7,h:3.6},
    {x:36,z:12,w:8,d:7,h:4.8},{x:39,z:32,w:10,d:7,h:4},
    {x:28,z:21,w:3,d:2,h:1.1},{x:42,z:25,w:4,d:2,h:1.1},
    {x:53,z:17,w:2,d:5,h:1.4},{x:55,z:31,w:5,d:2,h:1.2},
  ] as readonly Solid[],
});
export const roadWorld=()=>createWorld(72,48,ROAD_SECTION.solids,[ROAD_SECTION.spawn,ROAD_SECTION.checkpoint]);
