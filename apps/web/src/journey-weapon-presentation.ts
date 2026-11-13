import type {Object3D} from 'three';
import {journeyWeapon,type JourneyWeaponId} from '../../../packages/sim/src/journey/weapons.ts';

// Original prototype handling. Visual recoil never changes the authoritative ray.
export type WeaponHandlingFrame={tick:number;shotAt:number;reloadAt:number;reloadTicks:number;time:number;moving:boolean;aiming:boolean;reduced:boolean};
export function journeyHandlingPose(id:JourneyWeaponId,frame:WeaponHandlingFrame){
 const build=journeyWeapon(id),age=frame.tick-frame.shotAt;
 const recoil=age>=0?Math.max(0,1-age/Math.min(build.interval,5)):0;
 const reloading=frame.reloadAt>frame.tick;
 const progress=reloading?Math.max(0,Math.min(1,1-(frame.reloadAt-frame.tick)/Math.max(1,frame.reloadTicks))):0;
 const reload=Math.sin(Math.PI*progress),kick=id==='marksman-rifle'?.09:id==='support-gun'?.045:.06;
 const bob=frame.moving&&!frame.reduced?Math.sin(frame.time*9)*.008:0;
 return {recoil,reloading,progress,bolt:recoil*.09,flash:age>=0&&age<1,
  x:(frame.aiming?.08:.32)+bob,y:(frame.aiming?-.23:-.34)-reload*.14,
  z:-.65+(frame.reduced?0:recoil*kick),pitch:frame.reduced?0:recoil*kick*.7+reload*.22,
  roll:frame.reduced?0:reload*(id==='support-gun'?-.24:.18),magazineDrop:reload*(id==='support-gun'?.14:.08)};
}
export function animateJourneyViewWeapon(root:Object3D,id:JourneyWeaponId,frame:WeaponHandlingFrame){
 const pose=journeyHandlingPose(id,frame),weapon=root.getObjectByName('weapon')!;
 const previous=root.userData.observedShot;
 if(previous!==undefined&&frame.shotAt!==previous&&frame.shotAt>0)root.userData.visualShotTime=frame.time;
 root.userData.observedShot=frame.shotAt;
 const elapsed=frame.time-(root.userData.visualShotTime??-100);
 const impulse=elapsed>=0&&elapsed<.24?Math.exp(-elapsed*19)*Math.sin(Math.min(1,elapsed/.022)*Math.PI/2):0;
 if(!frame.reduced){pose.z+=impulse*.055;pose.pitch+=impulse*.065;pose.roll+=impulse*.018;}
 root.position.set(pose.x,pose.y,pose.z);root.rotation.set(pose.pitch,0,pose.roll);
 weapon.getObjectByName('bolt')!.position.z=-.17+pose.bolt;
 const flash=weapon.getObjectByName('flash')!;flash.visible=pose.flash;flash.scale.set(.65,.8,.65);
 const magazine=weapon.getObjectByName('journey-magazine');if(magazine)magazine.position.y=-.17-pose.magazineDrop;
 const hand=root.getObjectByName('boltHand');if(hand)hand.position.set(.04, -.08-pose.magazineDrop,-.05+pose.bolt);
 return pose;
}

export const JOURNEY_WEAPON_SOUND=Object.freeze({
 'service-rifle':{duration:.1,decay:.018,cutoff:1800,body:110},
 'field-carbine':{duration:.08,decay:.014,cutoff:2200,body:145},
 'marksman-rifle':{duration:.2,decay:.032,cutoff:1400,body:72},
 'support-gun':{duration:.095,decay:.014,cutoff:2500,body:125},
 'trench-shotgun':{duration:.19,decay:.03,cutoff:1100,body:65}
} as const);
// Deterministic original synthesis, no recording or downloaded sound sample.
export function journeyShotSamples(id:JourneyWeaponId,sampleRate:number){
 journeyWeapon(id);if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000)throw Error('Unsupported audio sample rate');
 const profile=JOURNEY_WEAPON_SOUND[id],samples=new Float32Array(Math.ceil(sampleRate*profile.duration));let seed=173;
 for(let i=0;i<samples.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const time=i/sampleRate,noise=seed/2147483648-1;samples[i]=(noise*.65+Math.sin(2*Math.PI*profile.body*time)*.35)*Math.exp(-time/profile.decay)*Math.min(1,time/.001);}
 return samples;
}
