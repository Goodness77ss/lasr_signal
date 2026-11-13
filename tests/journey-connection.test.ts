import {it,expect} from 'vitest';
import NodeWebSocket from 'ws';
import {buildServer} from '../apps/server/src/app.ts';
import {JourneyConnection,type JourneySocket,type JourneyPublicSnapshot} from '../apps/web/src/journey-connection.ts';
import {JOURNEY_REWARD_IDENTIFIERS} from '../packages/protocol/src/journey.ts';
function signal(){let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve};}
it('recovers a committed command after a lost acknowledgement over actual Journey sockets',async()=>{
 const server=await buildServer({database:':memory:',manual:true,journey:true});await server.app.listen({host:'127.0.0.1',port:0});
 let ready=signal(),acknowledged=signal(),lost=signal(),dropAck=true;const sent:string[]=[],snapshots:JourneyPublicSnapshot[]=[],acks:string[]=[];
 const client=new JourneyConnection(server.app.listeningOrigin.replace('http:','ws:')+'/journey',{snapshot:s=>snapshots.push(s),ack:a=>{acks.push(a.id);acknowledged.resolve();},status:state=>{if(state==='ready')ready.resolve();if(state==='uncertain')lost.resolve();}},url=>{
  const socket=new NodeWebSocket(url,{origin:'http://127.0.0.1:5174'}),transport:JourneySocket={get readyState(){return socket.readyState;},get bufferedAmount(){return socket.bufferedAmount;},send:data=>{sent.push(String(data));socket.send(data);},close:()=>socket.close(),onopen:null,onmessage:null,onclose:null,onerror:null};
  socket.on('open',()=>transport.onopen?.call(transport as WebSocket,{} as Event));socket.on('close',()=>transport.onclose?.call(transport as WebSocket,{} as CloseEvent));socket.on('error',()=>transport.onerror?.call(transport as WebSocket,{} as Event));
  socket.on('message',raw=>{const data=raw.toString(),message=JSON.parse(data);if(message.op==='ack'&&dropAck){dropAck=false;client.disconnect();return;}transport.onmessage?.call(transport as WebSocket,{data} as MessageEvent);});return transport;
 });
 try{
  client.connect({op:'start',...JOURNEY_REWARD_IDENTIFIERS,roster:[{id:'starter:1',revision:1,loadout:'signature'},null,null]});await ready.promise;
  const identity=client.recovery!;expect(identity.run).toHaveLength(32);expect(client.snapshot?.actors[0].ammo).toBe(20);expect(()=>client.connect({op:'start',...JOURNEY_REWARD_IDENTIFIERS,roster:[{id:'starter:1',revision:1,loadout:'signature'},null,null]})).toThrow('Resume');
  client.command({kind:'fire',direction:{x:1,y:0,z:0}},'lost-ack-shot');expect(()=>client.command({kind:'reload'})).toThrow('not ready');await lost.promise;
  expect(server.journey!.store.load(identity.run,identity.credential).run.actors[0].ammo).toBe(19);expect(client.awaitingAcknowledgement).toBe(true);
  ready=signal();client.reconnect();await acknowledged.promise;expect(acks).toEqual(['lost-ack-shot']);expect(client.snapshot?.actors[0].ammo).toBe(19);expect(client.awaitingAcknowledgement).toBe(false);
  const shots=sent.filter(text=>JSON.parse(text).op==='command');expect(shots).toHaveLength(2);expect(shots[0]).toBe(shots[1]);expect(server.journey!.store.load(identity.run,identity.credential).run.actors[0].ammo).toBe(19);
  const copy=client.snapshot!;copy.actors[0].ammo=999;expect(client.snapshot!.actors[0].ammo).toBe(19);
  acknowledged=signal();client.command({kind:'pause'},'pause-recovered');await acknowledged.promise;expect(client.paused).toBe(true);client.disconnect();ready=signal();client.reconnect();await ready.promise;expect(client.paused).toBe(true);
  acknowledged=signal();client.command({kind:'resume'},'resume-recovered');await acknowledged.promise;expect(client.paused).toBe(false);
  acknowledged=signal();client.command({kind:'quit'},'finish-recovered');await acknowledged.promise;expect(client.snapshot?.state).toBe('QUIT');expect(client.recovery).toEqual(identity);expect(snapshots.every(s=>!Object.hasOwn(s,'events'))).toBe(true);
 }finally{client.dispose();await server.app.close();}
},30000);
it('recovers the same run after losing its first admission response and recreating the browser controller',async()=>{
 const server=await buildServer({database:':memory:',manual:true,journey:true});await server.app.listen({host:'127.0.0.1',port:0});const url=server.app.listeningOrigin.replace('http:','ws:')+'/journey';
 const persisted:{value:import('../apps/web/src/journey-connection.ts').JourneyRecovery|null}={value:null};let first:JourneyConnection;const lost=signal(),ready=signal(),ack=signal();
 const open=(drop=false)=>(address:string):JourneySocket=>{
  const socket=new NodeWebSocket(address,{origin:'http://127.0.0.1:5174'}),transport:JourneySocket={get readyState(){return socket.readyState;},get bufferedAmount(){return socket.bufferedAmount;},send:data=>socket.send(data),close:()=>socket.close(),onopen:null,onmessage:null,onclose:null,onerror:null};
  socket.on('open',()=>transport.onopen?.call(transport as WebSocket,{} as Event));socket.on('close',()=>transport.onclose?.call(transport as WebSocket,{} as CloseEvent));socket.on('error',()=>transport.onerror?.call(transport as WebSocket,{} as Event));socket.on('message',raw=>{const data=raw.toString();if(drop){if(JSON.parse(data).op==='session'){first.disconnect();lost.resolve();}return;}transport.onmessage?.call(transport as WebSocket,{data} as MessageEvent);});return transport;
 };
 first=new JourneyConnection(url,{snapshot:()=>{throw Error('Initial response should have been lost');},recovery:value=>{persisted.value=value;}},open(true));let second:JourneyConnection|undefined,third:JourneyConnection|undefined;
 try{
  first.connect({op:'start',...JOURNEY_REWARD_IDENTIFIERS,roster:[{id:'starter:1',revision:1,loadout:'signature'},null,null]});
  expect(persisted.value?.start?.op).toBe('start');await lost.promise;const original=structuredClone(persisted.value!);first.dispose();
  const before=server.journey!.store.load(original.run,original.credential);expect(before.run.actors[0].ammo).toBe(20);expect(server.rooms.db.prepare('SELECT COUNT(*) AS n FROM journey_admissions').get()!.n).toBe(1);
  second=new JourneyConnection(url,{snapshot:()=>{},status:state=>{if(state==='ready')ready.resolve();},ack:()=>ack.resolve()},open());second.resume(original);await ready.promise;
  expect(second.snapshot?.pin).toEqual(before.run.pin);expect(second.snapshot?.section).toBe(before.run.section);expect(second.recovery?.start).toBeUndefined();second.command({kind:'fire',direction:{x:1,y:0,z:0}},'after-admission-loss');await ack.promise;expect(second.snapshot?.actors[0].ammo).toBe(19);second.dispose();
  const recovered=signal();third=new JourneyConnection(url,{snapshot:()=>{},status:state=>{if(state==='ready')recovered.resolve();}},open());third.resume(original);await recovered.promise;expect(third.snapshot?.actors[0].ammo).toBe(19);expect(third.recovery?.run).toBe(original.run);expect(server.rooms.db.prepare('SELECT COUNT(*) AS n FROM journey_runs').get()!.n).toBe(1);
 }finally{first.dispose();second?.dispose();third?.dispose();await server.app.close();}
},30000);
