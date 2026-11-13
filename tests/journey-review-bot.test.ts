import { it,expect } from 'vitest';
import { createJourney,journeyStep,journeyWorld } from '../packages/sim/src/journey/encounter.ts';
import { journeyReviewBot } from '../packages/sim/src/journey/review-bot.ts';

it('drives actual combat across a generated portal without fixture health or reward edits',async()=>{
  const run=await createJourney({streamed:true,seed:1});
  for(let i=0;i<3000&&run.stream!.ordinal==='0'&&run.state!=='DEAD';i++){
    journeyReviewBot(run,journeyWorld(run));journeyStep(run);
  }
  expect(run.stream!.ordinal).toBe('1');expect(run.practiceCredits).toBe(10);expect(run.actors[0].hp).toBeGreaterThan(0);expect(run.actors[0].ammo).toBeLessThan(20);
});
it('completes three consecutive generated encounters with one source per completion',async()=>{
  const run=await createJourney({streamed:true,seed:5}),templates=new Set<string>(),sources=new Set<string>();
  let lastOrdinal='0';templates.add(run.sectionData!.template);
  for(let i=0;i<12000&&BigInt(run.stream!.ordinal)<3n&&run.state!=='DEAD';i++){
    journeyReviewBot(run,journeyWorld(run));journeyStep(run);
    for(const event of run.events)if(event.kind==='checkpoint')sources.add(event.source!);
    if(run.stream!.ordinal!==lastOrdinal){lastOrdinal=run.stream!.ordinal;if(BigInt(lastOrdinal)<3n)templates.add(run.sectionData!.template);}
  }
  expect(run.stream!.ordinal).toBe('3');expect(templates.size).toBe(3);expect(sources.size).toBe(3);expect(run.practiceCredits).toBe(30);
});
