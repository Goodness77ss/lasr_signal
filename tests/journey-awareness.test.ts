import { it,expect } from 'vitest';
import { createWorld } from '../packages/sim/src/journey/world.ts';
import { emptyAwareness,perceive,alertFromDamage,shareAlert,witnessLoss,AWARENESS_RULES } from '../packages/sim/src/journey/awareness.ts';
it('reacts only to witnessed allied losses and does not learn the attacker position',()=>{
  const actor=enemy(),memory=emptyAwareness(),world=createWorld(72,48,[]);
  expect(witnessLoss(actor,memory,{sequence:1,side:1,position:{x:25,z:24}},world,0)).toBe(true);expect(memory.lastKnown).toEqual({x:24,z:24});expect(memory.targetId).toBeNull();
  expect(witnessLoss(actor,memory,{sequence:1,side:1,position:{x:25,z:24}},world,1)).toBe(false);
  const blocked=createWorld(72,48,[{x:22,z:20,w:2,d:8,h:4}]);expect(witnessLoss(actor,emptyAwareness(),{sequence:2,side:1,position:{x:28,z:24}},blocked,2)).toBe(false);
});
const enemy=()=>({id:4,side:1 as const,hp:100,x:20,z:24,facing:Math.PI/2});
it('ignores distant gunfire and repeated damage does not postpone reaction forever',()=>{
  const actor=enemy(),memory=emptyAwareness(),world=createWorld(72,48,[]);
  perceive(actor,[],memory,world,0,[{sequence:1,position:{x:60,z:24},side:0}]);expect(memory.lastKnown).toBeNull();
  alertFromDamage(memory,{x:12,z:24},1);const deadline=memory.reactAt;alertFromDamage(memory,{x:12,z:24},5);expect(memory.reactAt).toBe(deadline);
  perceive(actor,[],memory,world,deadline);expect(actor.facing).not.toBe(Math.PI/2);
});
it('does not see a silent rear approach, but damage provokes a delayed bounded turn',()=>{
  const actor=enemy(),target={id:1,side:0 as const,hp:100,x:12,z:24,facing:0},memory=emptyAwareness(),world=createWorld(72,48,[]);
  expect(perceive(actor,[target],memory,world,0)).toBeNull();expect(memory.lastKnown).toBeNull();alertFromDamage(memory,target,1);
  perceive(actor,[target],memory,world,2);expect(actor.facing).toBe(Math.PI/2);
  perceive(actor,[target],memory,world,9);expect(Math.abs(actor.facing-Math.PI/2)).toBeLessThanOrEqual(AWARENESS_RULES.turnPerTick+.001);
});
it('remembers only the last seen point after obstruction and expires old threats',()=>{
  const actor=enemy(),target={id:1,side:0 as const,hp:100,x:28,z:24,facing:0},memory=emptyAwareness(),world=createWorld(72,48,[]);
  perceive(actor,[target],memory,world,0);expect(perceive(actor,[target],memory,world,8)?.id).toBe(1);
  const blocked=createWorld(72,48,[{x:23,z:20,w:2,d:8,h:4}]);target.x=30;perceive(actor,[target],memory,blocked,9);expect(memory.lastKnown).toEqual({x:28,z:24});expect(memory.targetId).toBeNull();
  perceive(actor,[],memory,blocked,109);expect(memory.state).toBe('patrol');expect(memory.lastKnown).toBeNull();
});
it('uses coarse sound clues and range limited allied alerts',()=>{
  const actor=enemy(),memory=emptyAwareness(),world=createWorld(72,48,[]);perceive(actor,[],memory,world,0,[{sequence:1,position:{x:12.3,z:25.1},side:0}]);
  expect(memory.lastKnown).toEqual({x:12,z:24});expect(memory.targetId).toBeNull();expect(shareAlert(actor,memory,{...actor,id:5,x:23},emptyAwareness(),1)).toBe(false);
  alertFromDamage(memory,{x:12.3,z:25.1},1);expect(shareAlert(actor,memory,{...actor,id:5,x:23},emptyAwareness(),1)).toBe(true);expect(shareAlert(actor,memory,{...actor,id:6,x:40},emptyAwareness(),1)).toBe(false);
});
