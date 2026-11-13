import { it,expect } from 'vitest';
import { emptyMotion,setPose,bodyClear,startDodge,dodgeStep,rayBodyDistance,MOTION_RULES } from '../packages/sim/src/journey/motion.ts';
const world={width:30,depth:30,solids:[]};
it('requires head clearance before standing under an elevated ceiling',()=>{
  const low={...world,solids:[{x:4,z:4,w:5,d:5,h:.3,y:1.3}]},state=emptyMotion(),at={x:6,z:6};state.pose='crouched';
  expect(bodyClear(low,at,'crouched')).toBe(true);expect(setPose(state,'standing',at,low,0)).toBe(false);expect(state.pose).toBe('crouched');
  expect(setPose(state,'standing',{x:12,z:6},low,0)).toBe(true);
});
it('sweeps every dodge segment and cannot pass through a thin wall',()=>{
  const blocked={...world,solids:[{x:6,z:3,w:.05,d:5,h:3}]},state=emptyMotion();let at={x:5,z:5};expect(startDodge(state,{x:1,z:0},0)).toBe(true);
  for(let tick=1;tick<=6;tick++)at=dodgeStep(state,at,blocked,tick);
  expect(at.x).toBeLessThan(6-MOTION_RULES.radius);expect(at.x).toBeGreaterThan(5);expect(at.z).toBe(5);
});
it('normalizes diagonal dodges and retains cooldown after a blocked or replayed request',()=>{
  const state=emptyMotion();let at={x:10,z:10};expect(startDodge(state,{x:1,z:1},0)).toBe(true);expect(startDodge(state,{x:-1,z:0},0)).toBe(false);
  for(let tick=1;tick<=6;tick++)at=dodgeStep(state,at,world,tick);
  expect(Math.hypot(at.x-10,at.z-10)).toBeCloseTo(3);expect(startDodge(state,{x:1,z:0},59)).toBe(false);expect(startDodge(state,{x:1,z:0},60)).toBe(true);
});
it('changes the shot target shape immediately with pose and never grants dodge immunity',()=>{
  const origin={x:2,y:1.6,z:5},direction={x:1,y:0,z:0},actor={x:5,z:5};
  expect(rayBodyDistance(origin,direction,actor,'standing',10)).toBeCloseTo(2.65);expect(rayBodyDistance(origin,direction,actor,'crouched',10)).toBeNull();
  expect(rayBodyDistance({...origin,y:.8},direction,actor,'crouched',10)).not.toBeNull();expect(MOTION_RULES.invulnerable).toBe(false);
});
