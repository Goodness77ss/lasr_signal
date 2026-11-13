import type { Point,Solid } from '../rules.ts';
import { createWorld,ROAD_SECTION } from './world.ts';
export const GENERATOR_VERSION='journey-sections-1';
export const MAX_SECTION_ORDINAL=(1n<<64n)-1n;
export type JourneySection = {
  id:string; ordinal:string; generator:string; template:'road-ambush'|'crossing'|'supply-route';
  region:'ruined-outskirts'|'wet-woodland'|'rocky-highlands';
  spawn:Point; checkpoint:Point; solids:Solid[]; enemySpawns:Point[]; scenerySeed:number; fallback:boolean;
};
export function sectionOrdinal(text:string):bigint {
  if(!/^(0|[1-9][0-9]{0,19})$/.test(text))throw Error('Invalid section ordinal');
  const value=BigInt(text);if(value>MAX_SECTION_ORDINAL)throw Error('Section ordinal exhausted');return value;
}
// FNV1a stream seed and Mulberry32 are pinned by GENERATOR_VERSION.
export function sectionRandom(seed:number,ordinal:string,subsystem:string):()=>number {
  sectionOrdinal(ordinal);if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw Error('Invalid Journey seed');
  let state=2166136261;
  for(const c of `${GENERATOR_VERSION}:${seed}:${ordinal}:${subsystem}`){state^=c.charCodeAt(0);state=Math.imul(state,16777619)>>>0;}
  return ()=>{state=(state+0x6d2b79f5)>>>0;let n=Math.imul(state^(state>>>15),state|1);n^=n+Math.imul(n^(n>>>7),n|61);return ((n^(n>>>14))>>>0)/4294967296;};
}
function candidate(seed:number,ordinal:string,attempt:number):JourneySection {
  const random=sectionRandom(seed,ordinal,'layout:'+attempt),encounter=sectionRandom(seed,ordinal,'encounter'),scenery=sectionRandom(seed,ordinal,'scenery');
  const template=(['road-ambush','crossing','supply-route'] as const)[Math.floor(random()*3)],mirror=random()<.5;
  const solids=ROAD_SECTION.solids.map((s,i)=>{
    const shift=i<4?Math.floor(random()*3)-1:0;
    return {...s,x:s.x+shift,h:i<4?s.h+Math.floor(random()*3)*.25:s.h,z:mirror?48-s.z-s.d:s.z};
  });
  const world=createWorld(72,48,solids),enemySpawns=[34,49,58].map(x=>{
    const at={x,z:24+(encounter()-.5)*3};return world.walkable(at)?at:{x,z:24};
  });
  return {id:`${GENERATOR_VERSION}:${seed}:${ordinal}`,ordinal,generator:GENERATOR_VERSION,template,
    region:(['ruined-outskirts','wet-woodland','rocky-highlands'] as const)[Number(sectionOrdinal(ordinal)%3n)],
    spawn:{...ROAD_SECTION.spawn},checkpoint:{...ROAD_SECTION.checkpoint},solids,enemySpawns,scenerySeed:Math.floor(scenery()*0x100000000),fallback:false};
}
export function validateSection(section:JourneySection):boolean {
  if(section.generator!==GENERATOR_VERSION||section.solids.length>16||section.enemySpawns.length!==3)return false;
  try{sectionOrdinal(section.ordinal);}catch{return false;}
  if(!section.solids.every(s=>Object.values(s).every(Number.isFinite)&&s.w>0&&s.d>0&&s.h>0&&s.h<=8&&s.x>=0&&s.z>=0&&s.x+s.w<=72&&s.z+s.d<=48))return false;
  const world=createWorld(72,48,section.solids);
  return world.walkable(section.spawn)&&world.walkable(section.checkpoint)&&world.segmentClear(section.spawn,section.checkpoint)&&section.enemySpawns.every(p=>world.walkable(p)&&Math.hypot(p.x-section.spawn.x,p.z-section.spawn.z)>12&&Math.hypot(p.x-section.checkpoint.x,p.z-section.checkpoint.z)>4);
}
export function generateSection(seed:number,ordinal:string,build:(seed:number,ordinal:string,attempt:number)=>JourneySection=candidate):JourneySection {
  sectionOrdinal(ordinal);sectionRandom(seed,ordinal,'validate');
  for(let attempt=0;attempt<3;attempt++){
    const section=build(seed,ordinal,attempt);if(validateSection(section))return section;
  }
  const fallback=candidate(seed,ordinal,0);fallback.solids=ROAD_SECTION.solids.map(s=>({...s}));fallback.enemySpawns=[34,49,58].map(x=>({x,z:24}));fallback.fallback=true;
  if(!validateSection(fallback))throw Error('Invalid Journey fallback');return fallback;
}
