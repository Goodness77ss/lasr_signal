import {test,expect} from 'vitest';
import {createJourney} from '../packages/sim/src/journey/encounter.ts';
import {parseJourneyClient} from '../packages/protocol/src/journey.ts';
test('supply command rejects client stock, malformed classes, targets and throw vectors',async()=>{
 const run=await createJourney({streamed:true});
 const base={op:'command',id:'supply',sequence:1,section:run.section,actorId:1};
 const parse=(action:unknown)=>parseJourneyClient(JSON.stringify({...base,action}));
 expect(parse({kind:'supply',itemClass:0,targetId:2}).op).toBe('command');
 expect(parse({kind:'supply',itemClass:1,targetId:1,direction:{x:1,y:0,z:0}}).op).toBe('command');
 for(const action of [{kind:'supply',itemClass:4,targetId:1},{kind:'supply',itemClass:0,targetId:4},{kind:'supply',itemClass:0,targetId:1,units:99},{kind:'supply',itemClass:1,targetId:1},{kind:'supply',itemClass:1,targetId:1,direction:{x:0,y:0,z:0}},{kind:'supply',itemClass:2,targetId:1,direction:{x:1,y:0,z:0}}])expect(()=>parse(action)).toThrow();
});
