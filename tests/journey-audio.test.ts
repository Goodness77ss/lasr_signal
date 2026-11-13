import {it,expect,vi,afterEach} from 'vitest';
import {JourneyAudio} from '../apps/web/src/journey-audio.ts';
import {createJourney,journeyFire} from '../packages/sim/src/journey/encounter.ts';
import {createWorld} from '../packages/sim/src/journey/world.ts';
class TestNode{
 stopped=false;disconnected=false;started=false;onended:(()=>void)|null=null;buffer:unknown;type='';frequency={value:0};gain={value:0};
 connect(node:TestNode){return node;}disconnect(){this.disconnected=true;}start(){this.started=true;}stop(){this.stopped=true;this.onended?.();}
}
class TestContext{
 static last:TestContext;state='suspended';sampleRate=48000;destination=new TestNode();sources:TestNode[]=[];buffers=0;
 constructor(){TestContext.last=this;}async resume(){this.state='running';}async suspend(){this.state='suspended';}async close(){this.state='closed';}
 createBuffer(_channels:number,length:number,_rate:number){this.buffers++;return {length,copyToChannel:(_data:Float32Array,_channel:number)=>{}};}
 createBufferSource(){const node=new TestNode();this.sources.push(node);return node;}createBiquadFilter(){return new TestNode();}createGain(){return new TestNode();}
}
afterEach(()=>vi.unstubAllGlobals());
it('plays each fresh trigger once, skips old shots on resume and bounds active voices',async()=>{
 vi.stubGlobal('AudioContext',TestContext);vi.stubGlobal('document',{hidden:false});const audio=new JourneyAudio(),run=await createJourney({streamed:true,classes:['rook',null,null]});
 try{
  await audio.setEnabled(true);const context=TestContext.last;audio.update(run);const world=createWorld(72,48,[]),actor=run.actors[0];for(const enemy of run.actors)if(enemy.side===1)enemy.hp=0;
  for(let i=0;i<12;i++){run.tick=i*2;expect(journeyFire(run,actor,{x:1,y:0,z:0},world)).toBe(true);audio.update(run);audio.update(structuredClone(run));}
  expect(context.sources).toHaveLength(8);expect(context.buffers).toBe(1);expect(context.sources.every(s=>s.started)).toBe(true);
  expect(audio.inspect().byWeapon).toEqual({'support-gun':8});const counts=audio.inspect();counts.byWeapon['support-gun']=999;expect(audio.inspect().byWeapon['support-gun']).toBe(8);
  await audio.setEnabled(false);expect(context.sources.every(s=>s.stopped&&s.disconnected)).toBe(true);await audio.setEnabled(true);audio.update(run);expect(context.sources).toHaveLength(8);
  run.tick+=2;journeyFire(run,actor,{x:1,y:0,z:0},world);audio.update(run);expect(context.sources).toHaveLength(9);
  vi.stubGlobal('document',{hidden:true});audio.update(run);expect(context.sources.at(-1)!.stopped).toBe(true);
  run.section='new section';audio.update(run);vi.stubGlobal('document',{hidden:false});audio.update(run);expect(context.sources).toHaveLength(9);
 }finally{audio.dispose();}expect(TestContext.last.state).toBe('closed');
});
it('coalesces a shotgun trigger and does not restore audio after disposal races an unlock',async()=>{
 vi.stubGlobal('AudioContext',TestContext);vi.stubGlobal('document',{hidden:false});const audio=new JourneyAudio(),run=await createJourney({streamed:true,classes:['beck',null,null]}),world=createWorld(72,48,[]);
 await audio.setEnabled(true);audio.update(run);expect(journeyFire(run,run.actors[0],{x:1,y:0,z:0},world)).toBe(true);expect(run.events.filter(e=>e.kind==='shot')).toHaveLength(5);audio.update(run);expect(TestContext.last.sources).toHaveLength(1);audio.dispose();
 const racing=new JourneyAudio(),unlock=racing.setEnabled(true);racing.dispose();await unlock;expect(racing.enabled).toBe(false);expect(TestContext.last.state).toBe('closed');
});
