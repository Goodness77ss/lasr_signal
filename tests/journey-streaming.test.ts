import { describe,it,expect } from 'vitest';
import { JourneyWindow,type JourneyStream } from '../packages/sim/src/journey/streaming.ts';
import { MAX_SECTION_ORDINAL } from '../packages/sim/src/journey/generator.ts';
import { createJourney,journeyContinue,journeyStep,journeyCheckpoint,validateJourneyResume } from '../packages/sim/src/journey/encounter.ts';

const team=(point:{x:number;z:number})=>[1,2,3].map(id=>({id,hp:100,...point}));
describe('Journey bounded section window',()=>{
  it('crosses an integrated run atomically while retaining injuries, ammunition and unbanked credits',async()=>{
    const run=await createJourney({streamed:true,seed:7}),checkpoint=journeyCheckpoint(run);
    // Explicit transition fixture. Natural combat is tested separately in journey-encounter.
    run.encounter!.opened=true;run.encounter!.progress=run.encounter!.template==='crossing'?40:run.encounter!.template==='supply-route'?30:0;
    for(const actor of run.actors){if(actor.side===1)actor.hp=0;else Object.assign(actor,checkpoint);}
    run.actors[0].hp=53;run.actors[0].ammo=7;journeyStep(run);expect(run.practiceCredits).toBe(10);
    const old=run.section;expect(journeyContinue(run).ok).toBe(true);expect(run.section).not.toBe(old);expect(run.stream?.ordinal).toBe('1');
    expect(run.actors[0].hp).toBe(53);expect(run.actors[0].ammo).toBe(7);expect(run.practiceCredits).toBe(10);expect(run.actors.length).toBe(6);
    expect(journeyContinue(run).ok).toBe(false);await expect(validateJourneyResume(structuredClone(run))).resolves.toBeUndefined();
  });
  it('rejects skipped, stale, incomplete, dead and separated portal entries',()=>{
    const state:JourneyStream={seed:7,ordinal:'0',completedThrough:null},window=new JourneyWindow(state),section=window.current(),roster=team(section.checkpoint);
    expect(window.transition(section.id,false,roster[0],roster).ok).toBe(false);
    expect(window.transition('retired',true,roster[0],roster).ok).toBe(false);
    expect(window.transition(section.id,true,{...roster[0],hp:0},roster).ok).toBe(false);
    expect(window.transition(section.id,true,{...roster[0],x:NaN},roster).ok).toBe(false);
    expect(window.transition(section.id,true,roster[0],[roster[0],roster[0]]).ok).toBe(false);
    expect(window.transition(section.id,true,roster[0],[...roster,{id:4,hp:100,x:7,z:24}]).ok).toBe(false);
    expect(state.ordinal).toBe('0');expect(state.completedThrough).toBeNull();
    const result=window.transition(section.id,true,roster[0],roster);expect(result.ok).toBe(true);expect(result.placements?.map(p=>p.id)).toEqual([1,2,3]);
    expect(state.ordinal).toBe('1');expect(state.completedThrough).toBe('0');expect(window.transition(section.id,true,roster[0],roster).ok).toBe(false);
  });
  it('keeps at most three active sections throughout ten thousand forward transitions',()=>{
    const state:JourneyStream={seed:8,ordinal:'0',completedThrough:null},window=new JourneyWindow(state);
    for(let i=0;i<10000;i++){
      const section=window.current(),roster=team(section.checkpoint);
      expect(window.transition(section.id,true,roster[0],roster).ok).toBe(true);expect(window.entries().length).toBeLessThanOrEqual(3);
      expect(window.entries().every(s=>BigInt(s.ordinal)>=BigInt(state.ordinal)-1n&&BigInt(s.ordinal)<=BigInt(state.ordinal)+1n)).toBe(true);
    }
    expect(state.ordinal).toBe('10000');expect(state.completedThrough).toBe('9999');expect(JSON.stringify(state).length).toBeLessThan(100);
  },30000);
  it('restores the same active section from compact state and stops at the exact limit',()=>{
    const state:JourneyStream={seed:7,ordinal:'9007199254740993',completedThrough:'9007199254740992'},a=new JourneyWindow(state),b=new JourneyWindow(structuredClone(state));expect(b.current()).toEqual(a.current());
    const end=new JourneyWindow({seed:7,ordinal:String(MAX_SECTION_ORDINAL),completedThrough:String(MAX_SECTION_ORDINAL-1n)}),section=end.current(),roster=team(section.checkpoint);expect(end.transition(section.id,true,roster[0],roster).ok).toBe(false);
    expect(()=>new JourneyWindow({seed:7,ordinal:'8',completedThrough:'2'})).toThrow();
  });
});
