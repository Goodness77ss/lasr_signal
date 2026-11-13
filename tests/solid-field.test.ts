import {describe,it,expect} from 'vitest';
import {ACTOR,FIELD_SOLIDS,MAP,HOMES,walkable,bodyStep,clearBodyPosition,path,command,createGame,step,distance} from '@last-signal/sim';
import {Scene,PerspectiveCamera,Vector3} from 'three';
import {FieldCamera} from '../apps/web/src/field-camera.ts';

describe('solid field movement',()=>{
 it('keeps eye position and aim aligned with the wider rendered world',()=>{
  const scene=new Scene(),camera=new PerspectiveCamera();scene.scale.set(ACTOR.fieldScale,1,ACTOR.fieldScale);camera.scale.set(1/ACTOR.fieldScale,1,1/ACTOR.fieldScale);scene.add(camera);
  const view=new FieldCamera(camera),hero=createGame().squads[0];view.setMode('eyes');view.update(hero,.016,true,0);scene.updateMatrixWorld(true);
  const eye=camera.getWorldPosition(new Vector3());expect(eye.x).toBeCloseTo(hero.x*ACTOR.fieldScale);expect(eye.z).toBeCloseTo(hero.z*ACTOR.fieldScale);expect(eye.y).toBeCloseTo(ACTOR.eyeHeight);
  const direction=camera.getWorldDirection(new Vector3());expect(direction.x).toBeGreaterThan(.99);expect(Math.abs(direction.z)).toBeLessThan(.001);
  const ahead=new Vector3((hero.x+5)*ACTOR.fieldScale,ACTOR.eyeHeight,hero.z*ACTOR.fieldScale).project(camera);expect(Math.abs(ahead.x)).toBeLessThan(.001);
 });
 it('moves an older saved position out of newly solid scenery',()=>{
  const inside={x:18.7,z:6},clear=clearBodyPosition(inside,0);expect(walkable(clear,0)).toBe(true);expect(distance(clear,inside)).toBeLessThan(2.5);
 });
 it('blocks every solid footprint and keeps body clearance at building walls',()=>{
  for(const solid of FIELD_SOLIDS)expect(walkable({x:solid.x+solid.w/2,z:solid.z+solid.d/2})).toBe(false);
  const wall=MAP.obstacles[0];expect(walkable({x:wall.x-ACTOR.radius/2,z:wall.z+2})).toBe(false);
  expect(walkable({x:wall.x-ACTOR.radius-.01,z:wall.z+2})).toBe(true);
  for(const home of HOMES)expect(walkable(home)).toBe(true);
 });
 it('does not tunnel across a building even with a large movement step',()=>{
  const stop=bodyStep({x:9,z:9},{x:19,z:9},0);
  expect(stop.x).toBeLessThanOrEqual(11-ACTOR.radius);expect(stop.x).toBeGreaterThan(10);
  expect(walkable(stop,0)).toBe(true);
 });
 it('blocks direct movement through sandbags, crates, wrecks and radio tables',()=>{
  for(const [x,z]of [[18.7,6],[11.6,11.22],[3,4],[24.45,7.45]]){
   const at=bodyStep({x:x-2,z},{x:x+2,z},0);expect(at.x).toBeLessThan(x);expect(walkable(at,0)).toBe(true);
  }
 });
 it('slides along a wall without entering it',()=>{
  const game=createGame();game.countdown=0;const hero=game.squads[0];Object.assign(hero,{x:10.65,z:8,route:[]});
  for(let i=0;i<30;i++){command(game,{id:'slide'+i,side:0,kind:'drive',squadId:hero.id,direction:{x:1,z:1}});step(game);expect(walkable(hero,0)).toBe(true);}
  expect(hero.z).toBeGreaterThan(9);expect(hero.x).toBeLessThan(11);
 });
 it('routes around a building and reaches accessible cover',()=>{
  const route=path({x:9,z:9},{x:19,z:9},0);expect(route).not.toBeNull();expect(route!.every(p=>walkable(p,0))).toBe(true);
  const game=createGame();game.countdown=0;const hero=game.squads[0];
  expect(command(game,{id:'cover',side:0,kind:'move',squadId:hero.id,target:{x:18,z:16}}).ok).toBe(true);
  for(let i=0;i<200;i++){step(game);expect(walkable(hero,0)).toBe(true);}
  expect(distance(hero,{x:18,z:16})).toBeLessThan(1);
 });
});
