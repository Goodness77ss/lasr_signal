import {describe,it,expect} from 'vitest';
import {PerspectiveCamera,Vector3} from 'three';
import {FieldCamera} from '../apps/web/src/field-camera.ts';
import {createGame,command,step} from '@last-signal/sim';

const quarterTurn=(view:FieldCamera)=>view.rotate(Math.PI/2/.0026,0);
describe('independent looking while moving',()=>{
 it('holds forward and backward travel while looking sideways and vertically',()=>{
  const camera=new PerspectiveCamera(),view=new FieldCamera(camera);view.setMode('eyes');const forward=view.direction(1,0);
  quarterTurn(view);view.rotate(0,-1000);view.update(createGame().squads[0],.016,true,0);
  expect(view.direction(1,0)).toEqual(forward);expect(view.direction(-1,0).x).toBeCloseTo(-forward.x);expect(view.direction(-1,0).z).toBeCloseTo(-forward.z);
  expect(camera.getWorldDirection(new Vector3()).y).toBeGreaterThan(.9);
 });
 it('adopts the new look heading only after movement is released',()=>{
  const view=new FieldCamera(new PerspectiveCamera());view.direction(1,0);quarterTurn(view);
  expect(view.direction(1,0).x).toBeCloseTo(1);expect(view.direction(0,0)).toEqual({x:0,z:0});
  expect(view.direction(1,0).z).toBeCloseTo(1);expect(view.direction(1,0).x).toBeCloseTo(0);
  quarterTurn(view);view.releaseMovement();expect(view.direction(1,0).x).toBeCloseTo(-1);
 });
 it('keeps diagonal and strafe movement normalized through a full look rotation',()=>{
  const view=new FieldCamera(new PerspectiveCamera()),before=view.direction(1,1);view.rotate(Math.PI*2/.0026,0);
  expect(view.direction(1,1)).toEqual(before);expect(Math.hypot(before.x,before.z)).toBeCloseTo(1);expect(Math.hypot(...Object.values(view.direction(0,1)))).toBeCloseTo(1);
 });
 it('clears the old travel heading when resetting a round or changing views',()=>{
  const view=new FieldCamera(new PerspectiveCamera());view.direction(1,0);quarterTurn(view);view.setMode('eyes');expect(view.direction(1,0).z).toBeCloseTo(1);
  view.reset();expect(view.direction(1,0).x).toBeCloseTo(1);
 });
 it('sends independent move and fire directions to the actual simulation',()=>{
  const g=createGame();g.countdown=0;const hero=g.squads[0];hero.x=9;hero.z=16;
  const camera=new PerspectiveCamera(),view=new FieldCamera(camera);view.setMode('eyes');view.direction(1,0);quarterTurn(view);view.update(hero,.016,true,0);
  const aim=camera.getWorldDirection(new Vector3());expect(aim.z).toBeGreaterThan(.99);
  expect(command(g,{id:'side-shot',side:0,kind:'fire',squadId:hero.id,direction:{x:aim.x,y:aim.y,z:aim.z}}).ok).toBe(true);
  for(let i=0;i<12;i++){command(g,{id:'walk'+i,side:0,kind:'drive',squadId:hero.id,direction:view.direction(1,0)});step(g);}
  expect(hero.x).toBeGreaterThan(9.5);expect(hero.z).toBeCloseTo(16);expect(hero.ammo).toBe(19);
 });
});
