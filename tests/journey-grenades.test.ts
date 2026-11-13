import { it,expect } from 'vitest';
import { createWorld } from '../packages/sim/src/journey/world.ts';
import { launchGrenade,stepGrenade,grenadeDamage,seesGrenade,grenadePreview,GRENADE_RULES } from '../packages/sim/src/journey/grenades.ts';
const world=createWorld(72,48,[]);
it('observes only actual grenades in view and previews the same deterministic trajectory',()=>{
  const origin={x:5,y:1.8,z:24},aim={x:1,y:.4,z:0},grenade=launchGrenade(1,1,0,origin,aim,0,world)!,observer={x:10,z:24,facing:-Math.PI/2,hp:100};
  expect(seesGrenade(observer,1.8,grenade,world)).toBe(true);expect(seesGrenade({...observer,facing:Math.PI/2},1.8,grenade,world)).toBe(false);
  expect(seesGrenade(observer,1.8,grenade,createWorld(72,48,[{x:7,z:20,w:1,d:8,h:5}]))).toBe(false);
  const preview=grenadePreview(origin,aim,world);for(let tick=1;tick<=2;tick++)stepGrenade(grenade,tick,world);expect(preview[1]).toEqual(grenade.position);
});
it('rejects blocked origins and zero aim, sweeps thin walls and bounds flight',()=>{
  const wall=createWorld(72,48,[{x:8,z:20,w:.02,d:8,h:6}]);expect(launchGrenade(1,1,0,{x:8,y:1,z:24},{x:1,y:0,z:0},0,wall)).toBeNull();expect(launchGrenade(1,1,0,{x:5,y:1,z:24},{x:0,y:0,z:0},0,wall)).toBeNull();
  const grenade=launchGrenade(1,1,0,{x:5,y:1.8,z:24},{x:1,y:.2,z:0},0,wall)!;let bounces=0;
  for(let tick=1;tick<60;tick++){bounces+=stepGrenade(grenade,tick,wall).filter(e=>e.kind==='bounce').length;expect(grenade.position.x).toBeLessThan(8);}
  expect(bounces).toBeGreaterThan(0);expect(grenade.bounces).toBeLessThanOrEqual(4);expect(grenade.travel).toBeLessThanOrEqual(18.00001);
});
it('replays identical flight, bounce and fuse after snapshot recovery',()=>{
  const grenade=launchGrenade(1,1,0,{x:5,y:1.8,z:24},{x:1,y:.4,z:0},0,world)!;
  for(let tick=1;tick<=20;tick++)stepGrenade(grenade,tick,world);const recovered=structuredClone(grenade);
  for(let tick=21;tick<=60;tick++){expect(stepGrenade(recovered,tick,world)).toEqual(stepGrenade(grenade,tick,world));expect(recovered).toEqual(grenade);}
  expect(stepGrenade(grenade,60,world)[0].kind).toBe('explosion');expect(GRENADE_RULES.friendlyFire).toBe(true);
});
it('attenuates blast by distance and uses actual wall shielding',()=>{
  const origin={x:5,y:.2,z:24};expect(grenadeDamage(origin,origin,world)).toBe(100);expect(grenadeDamage(origin,{x:11,y:.2,z:24},world)).toBe(0);
  const target={x:9,y:1,z:24},wall=createWorld(72,48,[{x:7,z:20,w:.1,d:8,h:3}]);expect(grenadeDamage(origin,target,world)).toBeGreaterThan(0);expect(grenadeDamage(origin,target,wall)).toBe(0);
});
