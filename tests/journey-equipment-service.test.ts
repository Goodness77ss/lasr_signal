import {it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {JourneyService} from '../apps/server/src/journey-service.ts';
import {JOURNEY_EQUIPMENT_IDENTIFIERS,parseJourneyClient} from '../packages/protocol/src/journey.ts';
import {EQUIPMENT_BUILDS,type EquipmentEntry} from '../packages/sim/src/journey/equipment.ts';
import type {EquipmentOwnershipVerifier} from '../apps/server/src/journey-equipment.ts';
const owner='0x1111111111111111111111111111111111111111',collection='0x2222222222222222222222222222222222222222',session='a'.repeat(64);
const equipment=(assetNonce='0'):EquipmentEntry[]=>[{actorId:1,asset:{kind:'gun',chainId:'31337',collection,tokenId:'1'},buildId:'marksman-rifle',buildHash:EQUIPMENT_BUILDS['marksman-rifle'],assetNonce}];
const start=(nonce='0')=>({op:'start' as const,...JOURNEY_EQUIPMENT_IDENTIFIERS,roster:[{id:'starter:1',revision:1,loadout:'signature' as const},null,null],equipment:equipment(nonce),session});
function fixture(){
 const state={nonce:'0',unavailable:false};
 // Explicit trusted ownership fixture; actual EVM admission is checked in the
 // disposable chain suite. No fixture here claims wallet or chain evidence.
 const verifier:EquipmentOwnershipVerifier={owned:async(_asset,wallet,build,nonce)=>{if(state.unavailable)throw Error('Chain unavailable');if(wallet!==owner||nonce!==state.nonce||build!==EQUIPMENT_BUILDS['marksman-rifle'])throw Error('Ownership epoch changed');return {assetNonce:nonce,immutableBuild:{hash:build,build:{id:'marksman-rifle'}}};}};
 return {state,verifier};
}
function connect(service:JourneyService,identify=true){
 const messages:Record<string,unknown>[]=[],client=service.connect({send:m=>messages.push(m as Record<string,unknown>),close:()=>{},...(identify?{identify:(token:string)=>token===session?owner:null}:{})});
 return {client,messages,identity:()=>{const saved=messages.find(m=>m.op==='session');return {run:String(saved?.run),credential:String(saved?.credential)};}};
}
it('strict equipment entry requires wallet login, exact nonce and complete build identity',async()=>{
 expect(parseJourneyClient(JSON.stringify(start()))).toMatchObject({rules:'journey-practice-0.14.0'});
 for(const patch of [{session:undefined},{equipment:[{...equipment()[0],assetNonce:undefined}]},{equipment:[{...equipment()[0],buildHash:EQUIPMENT_BUILDS['support-gun']}]},{equipment:[...equipment(),{...equipment()[0],actorId:2}]}])expect(()=>parseJourneyClient(JSON.stringify({...start(),...patch}))).toThrow();
 const db=new DatabaseSync(':memory:');try{const f=fixture(),service=new JourneyService(db,{equipmentVerifier:f.verifier}),anonymous=connect(service,false);await expect(anonymous.client.receive(start())).rejects.toThrow('Authenticated');expect(db.prepare('SELECT COUNT(*) AS n FROM journey_runs').get()!.n).toBe(0);anonymous.client.close();service.close();}finally{db.close();}
});
it('admits once, replays one ammunition charge and stops fresh commands and ticks after ownership changes',async()=>{
 const db=new DatabaseSync(':memory:');try{
  const f=fixture(),service=new JourneyService(db,{equipmentVerifier:f.verifier}),first=connect(service);await first.client.receive(start());const id=first.identity(),read=()=>service.store.load(id.run,id.credential);
  expect(read().run.actors[0].ammo).toBe(5);expect(db.prepare('SELECT account_id FROM journey_progress_entries WHERE run_id=?').get(id.run)!.account_id).toBe('eip155:31337:'+owner);
  const command={op:'command' as const,id:'owned-shot',sequence:1,section:read().run.section,actorId:1,action:{kind:'fire' as const,direction:{x:1,y:0,z:0}}};await first.client.receive(command);await first.client.receive(command);expect(read().run.actors[0].ammo).toBe(4);
  await service.tick();expect(read().run.tick).toBe(1);const duplicate=connect(service);await expect(duplicate.client.receive(start())).rejects.toThrow('another active');duplicate.client.close();
  f.state.nonce='2';await expect(first.client.receive({...command,id:'after-transfer',sequence:2})).rejects.toThrow('epoch');await service.tick();expect(read().run.tick).toBe(1);expect(read().run.actors[0].ammo).toBe(4);
  const newer=connect(service);await newer.client.receive(start('2'));const newId=newer.identity();expect(db.prepare('SELECT revoked FROM journey_equipment_runs WHERE run_id=?').get(id.run)!.revoked).toBe(1);
  await first.client.receive({...command,id:'stop-old',sequence:2,action:{kind:'quit'}});expect(db.prepare('SELECT run_id FROM journey_equipment_current').get()!.run_id).toBe(newId.run);first.client.close();newer.client.close();service.close();
 }finally{db.close();}
});
it('rolls back run and allocation on a failed entry write and permits retry on the same connection',async()=>{
 const db=new DatabaseSync(':memory:');try{
  const f=fixture(),service=new JourneyService(db,{equipmentVerifier:f.verifier}),c=connect(service);db.exec("CREATE TRIGGER fail_equipment_progress BEFORE INSERT ON journey_progress_entries BEGIN SELECT RAISE(ABORT,'entry rejection'); END");
  const request={...start(),admission:{run:'a'.repeat(32),credential:'b'.repeat(64)}};
  await expect(c.client.receive(request)).rejects.toThrow('entry rejection');expect(db.prepare('SELECT COUNT(*) AS n FROM journey_runs').get()!.n).toBe(0);expect(db.prepare('SELECT COUNT(*) AS n FROM journey_equipment_current').get()!.n).toBe(0);expect(db.prepare('SELECT COUNT(*) AS n FROM journey_admissions').get()!.n).toBe(0);expect(c.messages).toHaveLength(0);
  db.exec('DROP TRIGGER fail_equipment_progress');await c.client.receive(request);expect(c.identity().run).toBe(request.admission.run);c.client.close();service.close();
 }finally{db.close();}
});
it('recovers a lost equipment admission from disk without duplicating its reservation or accepting changed intent',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'journey-admission-')),file=join(directory,'journal.sqlite'),f=fixture(),request={...start(),admission:{run:'c'.repeat(32),credential:'d'.repeat(64)}};let db=new DatabaseSync(file),service=new JourneyService(db,{equipmentVerifier:f.verifier});
 try{
  const first=connect(service);await first.client.receive(request);const before=service.store.load(request.admission.run,request.admission.credential).run;first.client.close();service.close();db.close();db=new DatabaseSync(file);service=new JourneyService(db,{equipmentVerifier:f.verifier});
  const retry=connect(service);await retry.client.receive(request);expect(retry.messages[0]).toMatchObject({op:'resumed',run:request.admission.run,lastSequence:0});expect(service.store.load(request.admission.run,request.admission.credential).run).toEqual(before);retry.client.close();
  for(const changed of [{...request,admission:{...request.admission,credential:'e'.repeat(64)}},{...request,roster:[{id:'development:mara',revision:1,loadout:'signature' as const},null,null]},{...request,equipment:equipment('1')}]){const denied=connect(service);await expect(denied.client.receive(changed)).rejects.toThrow();expect(denied.messages).toHaveLength(0);denied.client.close();}
  const anonymous=connect(service,false);await expect(anonymous.client.receive(request)).rejects.toThrow('Authenticated');anonymous.client.close();
  for(const table of ['journey_runs','journey_admissions','journey_equipment_runs','journey_equipment_current','journey_progress_entries'])expect(db.prepare('SELECT COUNT(*) AS n FROM '+table).get()!.n).toBe(1);
  const admission=db.prepare('SELECT * FROM journey_admissions').get()!,stored=db.prepare('SELECT credential_hash FROM journey_runs').get()!;expect(JSON.stringify(admission)+JSON.stringify(stored)).not.toContain(request.admission.credential);
  f.state.nonce='2';const revoked=connect(service);await expect(revoked.client.receive(request)).rejects.toThrow('epoch');revoked.client.close();
 }finally{service.close();db.close();rmSync(directory,{recursive:true,force:true});}
});
it('coalesces concurrent identical equipment admissions and rejects malformed recovery identities',async()=>{
 const db=new DatabaseSync(':memory:');try{
  const f=fixture(),service=new JourneyService(db,{equipmentVerifier:f.verifier}),request={...start(),admission:{run:'f'.repeat(32),credential:'a'.repeat(64)}},first=connect(service),second=connect(service);
  await Promise.all([first.client.receive(request),second.client.receive(request)]);expect(db.prepare('SELECT COUNT(*) AS n FROM journey_runs').get()!.n).toBe(1);expect(db.prepare('SELECT COUNT(*) AS n FROM journey_equipment_current').get()!.n).toBe(1);expect([first.messages[0].op,second.messages[0].op].sort()).toEqual(['resumed','session']);
  for(const admission of [{},null,{run:'1',credential:'b'.repeat(64)},{run:'a'.repeat(32),credential:'b'.repeat(64),owner},{run:'a'.repeat(32),credential:'B'.repeat(64)}])expect(()=>parseJourneyClient(JSON.stringify({...start(),admission}))).toThrow();
  const full={...request,roster:[1,2,3].map(actorId=>({id:'starter:'+actorId,revision:1,loadout:'signature'})),equipment:[1,2,3].map(actorId=>({...equipment()[0],actorId,asset:{...equipment()[0].asset,tokenId:String(actorId)}}))};expect(parseJourneyClient(JSON.stringify(full)).op).toBe('start');
  first.client.close();second.client.close();service.close();
 }finally{db.close();}
});
it('survives a real child process exit after equipment admission commit before its first reply',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'journey-admission-crash-')),file=join(directory,'journal.sqlite'),request={...start(),admission:{run:'b'.repeat(32),credential:'c'.repeat(64)}},child=spawn(process.execPath,['--import','tsx',resolve('scripts/journey-admission-crash-child.ts'),file],{windowsHide:true,stdio:['pipe','ignore','pipe']});let db:DatabaseSync|undefined,service:JourneyService|undefined;let errors='';child.stderr.on('data',data=>{errors+=String(data);});
 try{
  const exited=once(child,'exit');child.stdin.end(JSON.stringify(request));expect((await exited)[0],errors).toBe(74);
  db=new DatabaseSync(file);service=new JourneyService(db,{equipmentVerifier:fixture().verifier});const retry=connect(service);await retry.client.receive(request);expect(retry.messages[0]).toMatchObject({op:'resumed',run:request.admission.run,lastSequence:0});
  expect(service.store.load(request.admission.run,request.admission.credential).run.actors[0].ammo).toBe(5);for(const table of ['journey_runs','journey_admissions','journey_equipment_current','journey_progress_entries'])expect(db.prepare('SELECT COUNT(*) AS n FROM '+table).get()!.n).toBe(1);retry.client.close();
 }finally{if(child.exitCode===null&&child.signalCode===null)child.kill();service?.close();db?.close();rmSync(directory,{recursive:true,force:true});}
},30000);
it('recovers pinned equipment from disk and requires both the run credential and its wallet on resume',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'journey-equipment-')),file=join(directory,'journal.sqlite');let db=new DatabaseSync(file);const f=fixture();let service=new JourneyService(db,{equipmentVerifier:f.verifier});
 try{
  const first=connect(service);await first.client.receive(start());const identity=first.identity(),before=service.store.load(identity.run,identity.credential).run.equipment;first.client.close();service.close();db.close();db=new DatabaseSync(file);service=new JourneyService(db,{equipmentVerifier:f.verifier});
  const wrong=connect(service,false);await expect(wrong.client.receive({op:'resume',...JOURNEY_EQUIPMENT_IDENTIFIERS,...identity,session})).rejects.toThrow('Authenticated');wrong.client.close();
  const c=connect(service);await c.client.receive({op:'resume',...JOURNEY_EQUIPMENT_IDENTIFIERS,...identity,session});expect(service.store.load(identity.run,identity.credential).run.equipment).toEqual(before);await service.tick();expect(service.store.load(identity.run,identity.credential).run.tick).toBe(1);c.client.close();
  f.state.nonce='2';const stale=connect(service);await expect(stale.client.receive({op:'resume',...JOURNEY_EQUIPMENT_IDENTIFIERS,...identity,session})).rejects.toThrow('epoch');stale.client.close();
 }finally{service.close();db.close();rmSync(directory,{recursive:true,force:true});}
});
