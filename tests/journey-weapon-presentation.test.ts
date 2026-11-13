import {it,expect} from 'vitest';
import {journeyHandlingPose,animateJourneyViewWeapon,journeyShotSamples,JOURNEY_WEAPON_SOUND,type WeaponHandlingFrame} from '../apps/web/src/journey-weapon-presentation.ts';
import {createJourneyViewWeapon} from '../apps/web/src/journey-soldier.ts';
const frame:WeaponHandlingFrame={tick:10,shotAt:10,reloadAt:0,reloadTicks:44,time:1,moving:false,aiming:false,reduced:false};
it('drives distinct gun recoil and finite reload poses from immutable simulation timing',()=>{
 const marksman=journeyHandlingPose('marksman-rifle',frame),support=journeyHandlingPose('support-gun',frame);expect(marksman.z).toBeGreaterThan(support.z);expect(marksman.flash).toBe(true);
 expect(journeyHandlingPose('marksman-rifle',{...frame,tick:16})).toMatchObject({z:-.65,flash:false,reloading:false});
 const root=createJourneyViewWeapon('support-gun');const before={...frame,reloadAt:70,reloadTicks:60};
 for(const tick of [10,25,40,55,70]){const pose=animateJourneyViewWeapon(root,'support-gun',{...before,tick});expect(root.position.y).toBe(pose.y);expect(root.getObjectByName('journey-magazine')!.position.y).toBe(-.17-pose.magazineDrop);expect(root.getObjectByName('flash')!.visible).toBe(pose.flash);}
 expect(root.position.y).toBe(-.34);expect(root.rotation.z).toBeCloseTo(0);expect(before).toEqual({...frame,reloadAt:70,reloadTicks:60});
 expect(journeyHandlingPose('marksman-rifle',{...frame,reduced:true})).toMatchObject({z:-.65,pitch:0,roll:0});
 expect(journeyHandlingPose('support-gun',{...frame,aiming:true})).toMatchObject({x:.08,y:-.23});
});
it('synthesizes distinct bounded original shot sounds with finite decaying tails',()=>{
 for(const id of ['marksman-rifle','support-gun'] as const){const samples=journeyShotSamples(id,48000);expect(samples).toHaveLength(Math.ceil(48000*JOURNEY_WEAPON_SOUND[id].duration));expect(samples).toEqual(journeyShotSamples(id,48000));expect(samples.every(v=>Number.isFinite(v)&&Math.abs(v)<=1)).toBe(true);expect(samples.some(v=>Math.abs(v)>.1)).toBe(true);expect(Math.abs(samples.at(-1)!)).toBeLessThan(.01);}
 expect(JOURNEY_WEAPON_SOUND['marksman-rifle'].body).not.toBe(JOURNEY_WEAPON_SOUND['support-gun'].body);
 for(const rate of [0,NaN,Infinity,400000])expect(()=>journeyShotSamples('marksman-rifle',rate)).toThrow();
});
