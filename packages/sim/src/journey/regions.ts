import type { Point,Solid } from '../rules.ts';
import { createWorld,type WorldQuery } from './world.ts';
import type { JourneySection } from './generator.ts';
export type TerrainZone={x:number;z:number;w:number;d:number;surface:'mud'|'vegetation'|'gravel';speed:number;visibility:number;sound:number;color:number};
export function regionZones(region:JourneySection['region']):readonly TerrainZone[]{
  if(region==='wet-woodland')return [
    {x:18,z:20,w:14,d:8,surface:'mud',speed:.55,visibility:1,sound:.8,color:0x544833},
    {x:35,z:7,w:18,d:4,surface:'vegetation',speed:.85,visibility:.6,sound:.65,color:0x385c38},
    {x:35,z:39,w:18,d:4,surface:'vegetation',speed:.85,visibility:.6,sound:.65,color:0x385c38},
  ];
  if(region==='rocky-highlands')return [{x:36,z:20,w:16,d:8,surface:'gravel',speed:.8,visibility:1.15,sound:1.2,color:0x8c897a}];
  return [];
}
export function regionSolids(region:JourneySection['region']):Solid[]{
  return region==='wet-woodland'?[10,30,55,63].flatMap(x=>[7,41].map(z=>({x,z,w:.6,d:.6,h:4}))):[];
}
export function regionWorld(section:Pick<JourneySection,'solids'|'spawn'|'checkpoint'|'region'>):WorldQuery {
  const world=createWorld(72,48,[...section.solids,...regionSolids(section.region)],[section.spawn,section.checkpoint]),baseline=world.terrain;
  const zones=regionZones(section.region);
  world.terrain=(point:Point)=>{
    const zone=zones.find(z=>point.x>=z.x&&point.x<z.x+z.w&&point.z>=z.z&&point.z<z.z+z.d);
    return zone?{surface:zone.surface,elevation:0,speed:zone.speed,visibility:zone.visibility,sound:zone.sound}:{...baseline(point),visibility:1,sound:1};
  };
  return world;
}
