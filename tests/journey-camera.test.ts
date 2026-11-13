import { it,expect } from 'vitest';
import { PerspectiveCamera,Box3,Vector3 } from 'three';
import { createSoldier,animateSoldier } from '../apps/web/src/soldier.ts';
import { bodyHeight } from '../packages/sim/src/journey/motion.ts';
import { FieldCamera } from '../apps/web/src/field-camera.ts';
import { createWorld } from '../packages/sim/src/journey/world.ts';
it('applies validated crouch eye height immediately without crossing a low ceiling',()=>{
  const camera=new PerspectiveCamera(65,1,.1,180),view=new FieldCamera(camera,createWorld(72,48,[])),actor={x:7,z:24,route:[],drive:{x:0,z:0},driveUntil:0};
  view.setMode('eyes');view.update(actor,.05,true,0,0,1.8);expect(camera.position.y).toBe(1.8);
  view.update(actor,.05,false,0,1,1);expect(camera.position.y).toBe(1);
  view.update(actor,.05,false,0,2,1.8);expect(camera.position.y).toBe(1.8);
});
it('retains backward travel heading while looking independently',()=>{
  const view=new FieldCamera(new PerspectiveCamera());view.setMode('eyes');
  const before=view.direction(-1,0);view.rotate(400,0);expect(view.direction(-1,0)).toEqual(before);
  view.releaseMovement();const after=view.direction(-1,0);expect(after).not.toEqual(before);expect(Math.hypot(after.x,after.z)).toBeCloseTo(1);
});
it('tracks absolute airborne eye height and returns to the validated landing height',()=>{
  const camera=new PerspectiveCamera(65,1,.1,180),view=new FieldCamera(camera,createWorld(72,48,[])),actor={x:7,z:24,y:1.12,route:[],drive:{x:0,z:0},driveUntil:0};
  view.setMode('eyes');view.update(actor,.05,true,0,7,2.92);expect(camera.position.y).toBe(2.92);
  actor.y=0;view.update(actor,.05,false,1,20,1.8);expect(camera.position.y).toBe(1.8);
});
it('fits the procedural standing and crouched figure within its pose height',()=>{
  const soldier=createSoldier(0,1),baseScale=soldier.scale.y;
  for(const pose of ['standing','crouched'] as const){
    soldier.scale.y=baseScale*bodyHeight(pose)/2;animateSoldier(soldier,0,false,false,0,true);soldier.updateMatrixWorld(true);
    const height=new Box3().setFromObject(soldier).getSize(new Vector3()).y;
    expect(height).toBeLessThanOrEqual(bodyHeight(pose)+.04);expect(height).toBeGreaterThan(bodyHeight(pose)*.9);
  }
});
it('retains authoritative airborne figure elevation through the shared animation',()=>{
  const soldier=createSoldier(0,1);
  animateSoldier(soldier,0,false,false,0,true,1.18);expect(soldier.position.y).toBe(1.18);
  animateSoldier(soldier,1,true,false,0,false,1.18);expect(soldier.position.y).toBeGreaterThanOrEqual(1.18);expect(soldier.position.y).toBeLessThan(1.23);
  animateSoldier(soldier,0,false,false,0,true);expect(soldier.position.y).toBe(0);
});
