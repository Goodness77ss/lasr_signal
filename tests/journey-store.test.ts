import { it,expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { JourneyStore } from '../apps/server/src/journey-store.ts';
import { createJourney } from '../packages/sim/src/journey/encounter.ts';
import { journeyStep } from '../packages/sim/src/journey/encounter.ts';
import type { JourneyCommandMessage } from '../apps/server/src/journey-boundary.ts';
it('commits snapshot and acknowledgement together, rejects changed replay and rolls back a duplicate insert',async()=>{
  const db=new DatabaseSync(':memory:');try{
    const store=new JourneyStore(db),run=await createJourney({streamed:true});store.create('run','credential',run);
    const message:JourneyCommandMessage={op:'command',id:'one',sequence:1,section:run.section,actorId:1,action:{kind:'reload'}};
    const ack={op:'ack' as const,id:'one',ok:false,reason:'Magazine full',sequence:1,order:1,tick:0};store.commit('run',0,message,run,ack);
    expect(store.replay('run',message)).toEqual(ack);expect(()=>store.replay('run',{...message,action:{kind:'quit'}})).toThrow('different');
    expect(()=>store.load('run','wrong')).toThrow();
    const changed=structuredClone(run);changed.practiceCredits=999;
    expect(()=>store.commit('run',1,{...message,sequence:2},changed,ack)).toThrow();
    expect(store.load('run','credential')).toMatchObject({revision:1,lastSequence:1,run:{practiceCredits:0}});
    db.prepare('UPDATE journey_runs SET snapshot=? WHERE id=?').run('{}','run');expect(()=>store.load('run','credential')).toThrow('Corrupted');
  }finally{db.close();}
});
it('journals a checkpoint once and rolls back a repeated source with a new event sequence',async()=>{
  const db=new DatabaseSync(':memory:');try{
    const store=new JourneyStore(db),run=await createJourney({streamed:true,seed:1});store.create('run','credential',run);
    // Isolate journal recovery from combat: use an explicit completed encounter fixture.
    run.encounter!.opened=true;run.encounter!.progress=run.encounter!.template==='crossing'?40:run.encounter!.template==='supply-route'?30:0;
    for(const actor of run.actors){if(actor.side===1)actor.hp=0;else{actor.x=66;actor.z=24;}}
    journeyStep(run);expect(run.practiceCredits).toBe(10);store.saveTick('run',0,run);
    for(let i=0;i<5;i++)journeyStep(run);store.saveTick('run',1,run);
    expect(db.prepare('SELECT COUNT(*) AS n FROM journey_checkpoints').get()!.n).toBe(1);
    expect(run.events.filter(e=>e.kind==='checkpoint')).toHaveLength(1);
    const duplicated=structuredClone(run),event=duplicated.events.find(e=>e.kind==='checkpoint')!;duplicated.events.push({...event,seq:++duplicated.eventSeq});duplicated.practiceCredits+=10;
    expect(()=>store.saveTick('run',2,duplicated)).toThrow('Duplicate Journey checkpoint source');
    expect(store.load('run','credential')).toMatchObject({revision:2,run:{practiceCredits:10}});
  }finally{db.close();}
});
