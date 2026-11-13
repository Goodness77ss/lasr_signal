import { expect,it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createJourney,journeyStep,journeyContinue,journeyCheckpoint,validateJourneyResume } from '../packages/sim/src/journey/encounter.ts';
import { PRACTICE_ROSTER,defaultRosterSelection,type RosterCatalogueEntry } from '../packages/sim/src/journey/roster.ts';
import { JourneyService } from '../apps/server/src/journey-service.ts';
import { JOURNEY_IDENTIFIERS,JOURNEY_ROSTER_IDENTIFIERS,parseJourneyClient } from '../packages/protocol/src/journey.ts';
const choice=(id:string)=>({id,revision:1,loadout:'signature' as const});

it('deploys only selected members and restores a leader alone or a helper in the third slot',async()=>{
  for(const selection of [[choice('starter:1'),null,null],[choice('development:rook'),null,choice('development:imani')],defaultRosterSelection()]){
    const run=await createJourney({streamed:true,roster:selection});expect(run.pin.rules.version).toBe('journey-practice-0.12.0');
    expect(run.actors.filter(a=>a.side===0).map(a=>a.id)).toEqual(run.roster!.members.map(m=>m.actorId));
    expect(run.actors.filter(a=>a.side===1).map(a=>a.id)).toEqual([4,5,6]);journeyStep(run);await expect(validateJourneyResume(structuredClone(run))).resolves.toBeUndefined();
  }
});
it('retains the entry loadout and accepts a full health Rook at the section boundary',async()=>{
  const run=await createJourney({streamed:true,roster:[choice('development:rook'),null,choice('development:imani')]}),snapshot=structuredClone(run.roster);
  for(const actor of run.actors){if(actor.side===1)actor.hp=0;else Object.assign(actor,journeyCheckpoint(run));}
  run.encounter!.opened=true;run.encounter!.progress=run.encounter!.template==='crossing'?40:run.encounter!.template==='supply-route'?30:0;journeyStep(run);
  expect(run.actors[0].hp).toBe(120);expect(journeyContinue(run).ok).toBe(true);expect(run.roster).toEqual(snapshot);expect(run.actors.filter(a=>a.side===0).map(a=>a.id)).toEqual([1,3]);await expect(validateJourneyResume(run)).resolves.toBeUndefined();
  const edited=structuredClone(run);edited.actors.splice(1,0,{...edited.actors[1],id:2});await expect(validateJourneyResume(edited)).rejects.toThrow();
});
it('uses a strict separate roster entry and rejects legacy roster injection or live team replacement',()=>{
  const start={op:'start',...JOURNEY_ROSTER_IDENTIFIERS,roster:defaultRosterSelection()};expect(parseJourneyClient(JSON.stringify(start))).toEqual(start);
  for(const message of [{...start,rules:JOURNEY_IDENTIFIERS.rules},{op:'start',...JOURNEY_ROSTER_IDENTIFIERS},{...start,health:999},{op:'command',id:'swap',sequence:1,section:'journey-sections-1:1:0',actorId:1,action:{kind:'roster',roster:defaultRosterSelection()}}])expect(()=>parseJourneyClient(JSON.stringify(message))).toThrow();
});
it('rechecks catalogue changes after hashing, before creating or acknowledging a run',async()=>{
  const db=new DatabaseSync(':memory:');let reads=0;
  const service=new JourneyService(db,{catalogue:()=>{reads++;return PRACTICE_ROSTER.map(e=>e.id==='starter:1'&&reads>1?{...e,availability:'disabled' as const}:e);}}),messages:unknown[]=[],client=service.connect({send:m=>messages.push(m),close:()=>{}});
  try{await expect(client.receive({op:'start',...JOURNEY_ROSTER_IDENTIFIERS,roster:defaultRosterSelection()})).rejects.toThrow('unavailable');expect(messages).toHaveLength(0);expect(db.prepare('SELECT COUNT(*) AS count FROM journey_runs').get()!.count).toBe(0);}finally{client.close();db.close();}
});
it('recovers a pinned roster after the catalogue changes without changing a live loadout',async()=>{
  const db=new DatabaseSync(':memory:');let catalogue:readonly RosterCatalogueEntry[]=PRACTICE_ROSTER,service=new JourneyService(db,{catalogue:()=>catalogue});
  const messages:Record<string,unknown>[]=[],transport={send:(m:unknown)=>messages.push(m as Record<string,unknown>),close:()=>{}};let client=service.connect(transport);
  try{
    await client.receive({op:'start',...JOURNEY_ROSTER_IDENTIFIERS,roster:[choice('development:mara'),choice('development:beck'),null]});const session=messages.find(m=>m.op==='session')!,id=String(session.run),credential=String(session.credential),before=service.store.load(id,credential).run;
    expect(session.rules).toBe(JOURNEY_ROSTER_IDENTIFIERS.rules);client.close();catalogue=PRACTICE_ROSTER.map(e=>({...e,revision:2,availability:'disabled'}));service=new JourneyService(db,{catalogue:()=>catalogue});client=service.connect(transport);
    await client.receive({op:'resume',...JOURNEY_ROSTER_IDENTIFIERS,run:id,credential});expect(service.store.load(id,credential).run).toEqual(before);
    service.tick();expect(service.store.load(id,credential).run.roster).toEqual(before.roster);
  }finally{client.close();db.close();}
});
