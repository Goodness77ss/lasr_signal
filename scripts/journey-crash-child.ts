import { DatabaseSync } from 'node:sqlite';
import { JourneyService } from '../apps/server/src/journey-service.ts';
import { JOURNEY_IDENTIFIERS } from '../packages/protocol/src/journey.ts';
const db=new DatabaseSync(process.argv[2]);db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL');
const service=new JourneyService(db);let session:Record<string,unknown>|null=null;
const client=service.connect({send:value=>{
  const message=value as Record<string,unknown>;
  if(message.op==='session')session=message;
  // commit() has returned before this send. Exit before delivering the ack.
  if(message.op==='ack')process.exit(73);
},close:()=>{}});
await client.receive({op:'start',...JOURNEY_IDENTIFIERS});
if(!session||!process.send)throw Error('Missing crash proof IPC');
const identity=session as Record<string,unknown>;
await new Promise<void>((resolve,reject)=>process.send!({run:identity.run,credential:identity.credential},error=>error?reject(error):resolve()));
const saved=service.store.load(String(identity.run),String(identity.credential));
await client.receive({op:'command',id:'crash-shot',sequence:1,section:saved.run.section,actorId:1,action:{kind:'fire',direction:{x:1,y:0,z:0}}});
throw Error('Crash point was not reached');
