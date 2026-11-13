import { describe,it,expect } from 'vitest';
import { parseJourneyClient,JOURNEY_IDENTIFIERS,validJourneySection } from '../packages/protocol/src/journey.ts';
import { MAX_BYTES } from '@last-signal/protocol';
const message={op:'command',id:'move:1',sequence:1,section:'journey-sections-1:1:0',actorId:1,action:{kind:'move',target:{x:66,z:24}}};
describe('separate Journey client boundary',()=>{
  it('accepts only bounded pose and dodge inputs without submitted cooldown or immunity',()=>{
    for(const action of [{kind:'pose',pose:'crouched'},{kind:'pose',pose:'standing'},{kind:'dodge',direction:{x:1,z:0}}])expect(parseJourneyClient(JSON.stringify({...message,action}))).toMatchObject({action});
    for(const action of [{kind:'pose',pose:'prone'},{kind:'pose',pose:'crouched',invulnerable:true},{kind:'dodge',direction:{x:0,z:0}},{kind:'dodge',direction:{x:1,z:1}},{kind:'dodge',direction:{x:1,z:0},cooldown:0}])expect(()=>parseJourneyClient(JSON.stringify({...message,action}))).toThrow();
  });
  it('accepts exact entry, resume and bounded local commands without widening legacy packets',()=>{
    expect(parseJourneyClient(JSON.stringify({op:'start',...JOURNEY_IDENTIFIERS})).op).toBe('start');
    expect(parseJourneyClient(JSON.stringify({op:'resume',...JOURNEY_IDENTIFIERS,run:'a'.repeat(32),credential:'b'.repeat(64)})).op).toBe('resume');
    expect(parseJourneyClient(JSON.stringify(message))).toEqual(message);expect(MAX_BYTES).toBe(2048);
  });
  it('rejects edited economy, ownership, sequences, coordinates and packet size',()=>{
    for(const patch of [{health:100},{xp:99},{reward:100},{actorId:4},{sequence:0},{sequence:1.5},{section:'journey-sections-1:1:01'},{action:{kind:'move',target:{x:1e10,z:24}}},{action:{kind:'move',target:{x:66,z:24,health:100}}},{action:{kind:'spawn'}}])expect(()=>parseJourneyClient(JSON.stringify({...message,...patch}))).toThrow();
    for(const raw of ['{','null','[]',' '.repeat(2049)])expect(()=>parseJourneyClient(raw)).toThrow();
  });
  it('validates exact section representation and normalized direction',()=>{
    expect(validJourneySection('journey-sections-1:4294967295:18446744073709551615')).toBe(true);expect(validJourneySection('journey-sections-1:4294967296:0')).toBe(false);
    expect(()=>parseJourneyClient(JSON.stringify({...message,action:{kind:'fire',direction:{x:1,y:1,z:1}}}))).toThrow();
    expect(()=>parseJourneyClient(JSON.stringify({...message,action:{kind:'fire',direction:{x:0,y:0,z:0}}}))).toThrow();
  });
});
