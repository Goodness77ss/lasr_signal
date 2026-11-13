import { it,expect } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync,readdirSync,unlinkSync,rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { JourneyService } from '../apps/server/src/journey-service.ts';
import { JOURNEY_IDENTIFIERS } from '../packages/protocol/src/journey.ts';
it('survives a real process exit after commit before acknowledgement without duplicate ammunition use',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'journey-crash-')),file=join(directory,'proof.sqlite');
  const child=spawn(process.execPath,['--import','tsx',resolve('scripts/journey-crash-child.ts'),file],{windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});
  let db:DatabaseSync|undefined;
  try{
    const exited=once(child,'exit'),identity=(await once(child,'message'))[0] as {run:string;credential:string};
    expect((await exited)[0]).toBe(73);
    db=new DatabaseSync(file);const service=new JourneyService(db),before=service.store.load(identity.run,identity.credential);
    expect(before.run.actors[0].ammo).toBe(19);expect(before.lastSequence).toBe(1);
    const messages:Record<string,unknown>[]=[],client=service.connect({send:m=>messages.push(m as Record<string,unknown>),close:()=>{}});
    await client.receive({op:'resume',...JOURNEY_IDENTIFIERS,...identity});
    await client.receive({op:'command',id:'crash-shot',sequence:1,section:before.run.section,actorId:1,action:{kind:'fire',direction:{x:1,y:0,z:0}}});
    expect(messages.find(m=>m.op==='ack')).toMatchObject({id:'crash-shot',ok:true,order:1});expect(service.store.load(identity.run,identity.credential).run.actors[0].ammo).toBe(19);
    expect(db.prepare('SELECT count(*) AS count FROM journey_commands').get()!.count).toBe(1);client.close();
  }finally{
    if(child.exitCode===null&&child.signalCode===null)child.kill();db?.close();
    for(const name of readdirSync(directory))unlinkSync(join(directory,name));rmdirSync(directory);
  }
},30000);
