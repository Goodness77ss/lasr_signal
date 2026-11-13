import { it,expect } from 'vitest';
import { createWorld } from '../packages/sim/src/journey/world.ts';
import { chooseTactic,emptyTactics } from '../packages/sim/src/journey/tactics.ts';
import { journeyPath,createJourney,journeyStep,journeyWorld,validateJourneyResume } from '../packages/sim/src/journey/encounter.ts';
import { emptyAwareness,alertFromDamage } from '../packages/sim/src/journey/awareness.ts';
import { distance } from '@last-signal/sim';
it('recovers a blocked route through replanning without clipping or teleporting',async()=>{
  const run=await createJourney({streamed:true,seed:1}),world=journeyWorld(run),guard=run.actors[3];
  // Explicit stale route fixture models a route invalidated by an obstruction.
  Object.assign(guard,{x:16,z:15,facing:Math.PI/2,route:[{x:22,z:15}]});Object.assign(run.actors[0],{x:30,z:15});
  Object.assign(run.actors[1],{x:5,z:44});Object.assign(run.actors[2],{x:7,z:44});run.actors[4].hp=0;run.actors[5].hp=0;
  guard.awareness=emptyAwareness();alertFromDamage(guard.awareness,{x:30,z:15},0);guard.tactics={...emptyTactics(4),mode:'search',until:24,destination:{x:30,z:15}};
  for(let i=0;i<35;i++){const before={x:guard.x,z:guard.z};journeyStep(run,world);expect(world.walkable(guard)).toBe(true);expect(distance(before,guard)).toBeLessThanOrEqual(.2001);}
  expect(guard.route.every(p=>world.walkable(p))).toBe(true);expect(distance({x:16,z:15},guard)).toBeGreaterThan(3);await expect(validateJourneyResume(run)).resolves.toBeUndefined();
});
it('runs distinct live guard roles with legal movement and recoverable decisions',async()=>{
  const run=await createJourney({streamed:true,seed:1}),world=journeyWorld(run);Object.assign(run.actors[0],{x:30,z:24});Object.assign(run.actors[1],{x:5,z:44});Object.assign(run.actors[2],{x:7,z:44});
  for(const [index,z] of [24,29,20].entries())Object.assign(run.actors[index+3],{x:20,z,facing:Math.PI/2});
  const observed=new Set<string>();
  for(let i=0;i<70;i++){journeyStep(run,world);for(const guard of run.actors.filter(a=>a.side===1)){if(guard.tactics)observed.add(guard.tactics.mode);expect(world.walkable(guard)).toBe(true);}}
  expect(run.actors.slice(3).map(a=>a.tactics?.role)).toEqual(['defender','flanker','support']);expect(observed.has('flank')).toBe(true);expect(observed.has('suppress')||observed.has('cover')).toBe(true);
  await expect(validateJourneyResume(structuredClone(run))).resolves.toBeUndefined();
});
const actor=(id:number)=>({id,x:20,z:24,hp:100,ammo:20,reserve:80,reloadAt:0,route:[]});
it('responds to a perceived hazard without gaining knowledge of unreported danger',()=>{
  const world=createWorld(72,48,[]),a=actor(4),path=(from:{x:number;z:number},to:{x:number;z:number})=>journeyPath(world,from,to),committed={...emptyTactics(4),mode:'suppress' as const,until:100};
  expect(chooseTactic(a,[a],{x:30,z:24},true,world,1,committed,path)).toBe(committed);
  const reaction=chooseTactic({...a,perceivedHazards:[{position:{x:22,z:24},radius:4}]},[a],{x:30,z:24},true,world,1,committed,path);
  expect(reaction.mode).toBe('retreat');expect(reaction.destination!.x).toBeLessThan(a.x);expect(world.walkable(reaction.destination!)).toBe(true);
});
it('chooses only reachable protective cover and excludes occupied destinations',()=>{
  const world=createWorld(72,48,[{x:24,z:22,w:2,d:4,h:2}]),a=actor(4),threat={x:30,z:24},path=(from:{x:number;z:number},to:{x:number;z:number})=>journeyPath(world,from,to);
  const cover=chooseTactic(a,[a],threat,true,world,0,emptyTactics(4),path);expect(cover.mode).toBe('cover');expect(world.walkable(cover.destination!)).toBe(true);
  expect(chooseTactic(a,[a],threat,true,world,0,emptyTactics(4),()=>[]).mode).toBe('suppress');
  const ally={...actor(6),...cover.destination!},alternative=chooseTactic(a,[a,ally],threat,true,world,0,emptyTactics(4),path);expect(alternative.destination).not.toEqual(cover.destination);
});
it('chooses opposite flank sides and holds a committed choice through small threat changes',()=>{
  const world=createWorld(72,48,[]),a=actor(5),b=actor(8),threat={x:30,z:24},path=(from:{x:number;z:number},to:{x:number;z:number})=>journeyPath(world,from,to);
  const first=chooseTactic(a,[a],threat,true,world,0,emptyTactics(a.id),path),second=chooseTactic(b,[b],threat,true,world,0,emptyTactics(b.id),path);
  expect(first.mode).toBe('flank');expect(first.destination!.z).not.toBe(second.destination!.z);expect(chooseTactic(a,[a],{x:31,z:24},true,world,1,first,path)).toBe(first);
});
it('prioritizes reload, health retreat and known point search without hidden target input',()=>{
  const world=createWorld(72,48,[]),a=actor(4),path=(from:{x:number;z:number},to:{x:number;z:number})=>journeyPath(world,from,to);
  expect(chooseTactic({...a,ammo:0},[a],{x:30,z:24},true,world,0,emptyTactics(4),path).mode).toBe('reload');
  const retreat=chooseTactic({...a,hp:20},[a],{x:30,z:24},true,world,0,emptyTactics(4),path);expect(retreat.mode).toBe('retreat');expect(retreat.destination!.x).toBeLessThan(a.x);
  expect(chooseTactic(a,[a],{x:30,z:24},false,world,0,emptyTactics(4),path).mode).toBe('search');expect(chooseTactic(a,[a],null,false,world,0,emptyTactics(4),path).mode).toBe('patrol');
});
