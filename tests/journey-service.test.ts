import { it,expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,unlinkSync,rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JourneyService } from '../apps/server/src/journey-service.ts';
import { JOURNEY_IDENTIFIERS } from '../packages/protocol/src/journey.ts';
import type { JourneyCommandMessage } from '../apps/server/src/journey-boundary.ts';
it('commits crouch and dodge once and preserves cooldown through replay',async()=>{
  const db=new DatabaseSync(':memory:'),messages:Record<string,unknown>[]=[],service=new JourneyService(db),client=service.connect({send:m=>messages.push(m as Record<string,unknown>),close:()=>{}});
  try{
    await client.receive({op:'start',...JOURNEY_IDENTIFIERS});const session=messages.find(m=>m.op==='session')!,read=()=>service.store.load(String(session.run),String(session.credential));
    const base={op:'command' as const,actorId:1,section:read().run.section};
    await client.receive({...base,id:'crouch',sequence:1,action:{kind:'pose',pose:'crouched'}});
    const dodge:JourneyCommandMessage={...base,id:'dodge',sequence:2,action:{kind:'dodge',direction:{x:1,z:0}}};await client.receive(dodge);await client.receive(dodge);
    expect(read().lastSequence).toBe(2);expect(read().run.actors[0].motion).toMatchObject({pose:'crouched',dodgeUntil:6,nextDodgeAt:60});
    await client.receive({...dodge,id:'again',sequence:3});expect(messages.filter(m=>m.op==='ack').at(-1)?.ok).toBe(false);
    for(let i=0;i<3;i++)service.tick();expect(read().run.actors[0].x).toBeCloseTo(8.5);expect(read().run.actors[0].motion?.nextDodgeAt).toBe(60);
  }finally{client.close();db.close();}
});
it('sends no success and spends no ammunition when SQLite rejects the state write',async()=>{
  const db=new DatabaseSync(':memory:'),messages:Record<string,unknown>[]=[],service=new JourneyService(db);
  const client=service.connect({send:m=>messages.push(m as Record<string,unknown>),close:()=>{}});
  try{
    await client.receive({op:'start',...JOURNEY_IDENTIFIERS});const session=messages.find(m=>m.op==='session')!,id=String(session.run),credential=String(session.credential);
    const read=()=>service.store.load(id,credential),message:JourneyCommandMessage={op:'command',id:'failed-shot',sequence:1,section:read().run.section,actorId:1,action:{kind:'fire',direction:{x:1,y:0,z:0}}};
    db.exec("CREATE TRIGGER reject_journey_write BEFORE UPDATE ON journey_runs BEGIN SELECT RAISE(ABORT,'injected storage rejection'); END");
    await expect(client.receive(message)).rejects.toThrow('storage rejection');expect(messages.some(m=>m.op==='ack')).toBe(false);expect(read().run.actors[0].ammo).toBe(20);expect(read().lastSequence).toBe(0);
    db.exec('DROP TRIGGER reject_journey_write');await client.receive(message);expect(read().run.actors[0].ammo).toBe(19);expect(messages.find(m=>m.op==='ack')?.ok).toBe(true);
  }finally{client.close();db.close();}
});
it('persists fixed movement ticks and pauses simulation durably',async()=>{
  const db=new DatabaseSync(':memory:'),messages:Record<string,unknown>[]=[],service=new JourneyService(db);
  const client=service.connect({send:m=>messages.push(m as Record<string,unknown>),close:()=>{}});
  try{
    await client.receive({op:'start',...JOURNEY_IDENTIFIERS});const session=messages.find(m=>m.op==='session')!,id=String(session.run),credential=String(session.credential);
    const read=()=>service.store.load(id,credential),base={op:'command' as const,actorId:1,section:read().run.section};
    await client.receive({...base,id:'move',sequence:1,action:{kind:'move',target:{x:20,z:24}}});
    for(let i=0;i<10;i++)service.tick();expect(read().run.tick).toBe(10);expect(read().run.actors[0].x).toBeGreaterThan(7);
    await client.receive({...base,id:'pause',sequence:2,action:{kind:'pause'}});for(let i=0;i<10;i++)service.tick();expect(read().run.tick).toBe(10);expect(read().paused).toBe(true);
    await expect(client.receive({...base,id:'blocked',sequence:3,action:{kind:'reload'}})).rejects.toThrow('paused');
    await client.receive({...base,id:'resume',sequence:3,action:{kind:'resume'}});service.tick();expect(read().run.tick).toBe(11);
    client.close();service.tick();expect(read().run.tick).toBe(11);expect(read().run.state).toBe('ACTIVE');
  }finally{client.close();db.close();}
});
it('restores a disk run and replays its committed acknowledgement after service recreation',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'journey-service-')),file=join(directory,'test.sqlite');let db=new DatabaseSync(file);
  const messages:Record<string,unknown>[]=[],transport={send:(m:unknown)=>messages.push(m as Record<string,unknown>),close:()=>{}};
  let client=new JourneyService(db).connect(transport);
  try{
    await client.receive({op:'start',...JOURNEY_IDENTIFIERS});
    const session=messages.find(m=>m.op==='session')!,id=String(session.run),credential=String(session.credential);
    const saved=new JourneyService(db).store.load(id,credential);
    const command:JourneyCommandMessage={op:'command',id:'shot:1',sequence:1,section:saved.run.section,actorId:1,action:{kind:'fire',direction:{x:1,y:0,z:0}}};
    await client.receive(command);const ack=messages.find(m=>m.op==='ack');expect(ack?.ok).toBe(true);
    expect(new JourneyService(db).store.load(id,credential).run.actors[0].ammo).toBe(19);
    await expect(client.receive({...command,action:{kind:'quit'}})).rejects.toThrow('different');
    client.close();db.close();db=new DatabaseSync(file);messages.length=0;const service=new JourneyService(db);client=service.connect(transport);
    await client.receive({op:'resume',...JOURNEY_IDENTIFIERS,run:id,credential});await client.receive(command);
    expect(messages.find(m=>m.op==='ack')).toEqual(ack);expect(service.store.load(id,credential).run.actors[0].ammo).toBe(19);
    expect(service.store.load(id,credential).run.state).toBe('ACTIVE');
    await expect(client.receive({...command,id:'spoof',sequence:2,actorId:2})).rejects.toThrow('Actor');
  }finally{client.close();db.close();unlinkSync(file);rmdirSync(directory);}
});
