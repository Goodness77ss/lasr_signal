import {JOURNEY_WEAPON_SOUND,journeyShotSamples} from './journey-weapon-presentation.ts';
import {journeyLeader} from '../../../packages/sim/src/journey/encounter.ts';
import type {JourneySceneFrame} from './journey-frame.ts';
import type {JourneyWeaponId} from '../../../packages/sim/src/journey/weapons.ts';
export class JourneyAudio {
 private context:AudioContext|null=null;private sequence=0;private section='';private voices=new Set<AudioBufferSourceNode>();private buffers=new Map<JourneyWeaponId,AudioBuffer>();private generation=0;private shots=new Map<number,number>();private played=0;private lastWeapon:JourneyWeaponId|null=null;private byWeapon:Partial<Record<JourneyWeaponId,number>>={};
 enabled=false;
 inspect(){return {enabled:this.enabled,context:this.context?.state??'uninitialized',activeVoices:this.voices.size,played:this.played,lastWeapon:this.lastWeapon,byWeapon:{...this.byWeapon}};}
 async setEnabled(enabled:boolean){
  const generation=++this.generation;
  if(enabled){this.context??=new AudioContext();const context=this.context;await context.resume();if(generation!==this.generation)return this.enabled;this.enabled=context.state==='running';}else{this.enabled=false;this.stop();await this.context?.suspend();}
  return this.enabled;
 }
 private stop(){for(const voice of this.voices){voice.stop();voice.disconnect();}this.voices.clear();}
 update(run:Pick<JourneySceneFrame,'section'|'actors'|'events'|'eventSeq'|'tick'>){
  if(this.section!==run.section||run.eventSeq!==undefined&&run.eventSeq<this.sequence){this.section=run.section;this.sequence=run.eventSeq??0;this.shots=new Map(run.actors.map(a=>[a.id,a.fireAt]));this.stop();return;}
  const fresh=run.events?run.events.filter(e=>e.seq>this.sequence):run.actors.filter(a=>this.shots.has(a.id)&&a.fireAt>(this.shots.get(a.id)!)&&run.tick-a.fireAt<=2).map(a=>({kind:'shot',from:{x:a.x,z:a.z},side:a.side}));
  this.shots=new Map(run.actors.map(a=>[a.id,a.fireAt]));this.sequence=run.eventSeq??this.sequence;
  if(!this.enabled||!this.context||this.context.state!=='running'||document.hidden){this.stop();return;}
  const leader=journeyLeader(run);
  const triggers=new Set<string>();
  for(const event of fresh){
   if(event.kind!=='shot'||this.voices.size>=8)continue;
   const distance=Math.hypot(event.from.x-leader.x,event.from.z-leader.z);if(distance>48)continue;
   const actor=run.actors.find(a=>a.side===event.side&&Math.hypot(a.x-event.from.x,a.z-event.from.z)<.5),id=actor?.battlefieldWeapon?.buildId??actor?.build?.weapon??'service-rifle';
   const trigger=actor?String(actor.id)+':'+actor.fireAt:event.side+':'+event.from.x+':'+event.from.z;if(triggers.has(trigger))continue;triggers.add(trigger);
   let buffer=this.buffers.get(id);if(!buffer){const samples=journeyShotSamples(id,this.context.sampleRate);buffer=this.context.createBuffer(1,samples.length,this.context.sampleRate);buffer.copyToChannel(samples,0);this.buffers.set(id,buffer);}
   const source=this.context.createBufferSource(),filter=this.context.createBiquadFilter(),gain=this.context.createGain();source.buffer=buffer;filter.type='lowpass';filter.frequency.value=JOURNEY_WEAPON_SOUND[id].cutoff;gain.gain.value=.15/(1+distance*.15);
   source.connect(filter).connect(gain).connect(this.context.destination);this.voices.add(source);source.onended=()=>{this.voices.delete(source);source.disconnect();filter.disconnect();gain.disconnect();};source.start();this.played++;this.lastWeapon=id;this.byWeapon[id]=(this.byWeapon[id]??0)+1;
  }
 }
 reset(){this.sequence=0;this.section='';this.shots.clear();this.stop();}
 dispose(){this.generation++;this.enabled=false;this.stop();this.buffers.clear();void this.context?.close();this.context=null;}
}
