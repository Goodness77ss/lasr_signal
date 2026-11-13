import { it,expect } from 'vitest';
import WebSocket from 'ws';
import { once } from 'node:events';
import { buildServer } from '../apps/server/src/app.ts';
import { JOURNEY_IDENTIFIERS,JOURNEY_ROSTER_IDENTIFIERS,JOURNEY_REWARD_IDENTIFIERS } from '../packages/protocol/src/journey.ts';
function reader(socket:WebSocket){
  const queue:Record<string,unknown>[]=[],pending:{op:string;resolve:(message:Record<string,unknown>)=>void}[]=[];
  socket.on('message',raw=>{const message=JSON.parse(raw.toString()) as Record<string,unknown>,index=pending.findIndex(p=>p.op===message.op);if(index>=0)pending.splice(index,1)[0].resolve(message);else queue.push(message);});
  return (op:string):Promise<Record<string,unknown>>=>{const index=queue.findIndex(m=>m.op===op);if(index>=0)return Promise.resolve(queue.splice(index,1)[0]);return new Promise(resolve=>pending.push({op,resolve}));};
}
it('admits reward practice over an actual socket without accepting client supplied loot value',async()=>{
  const server=await buildServer({database:':memory:',manual:true,journey:true});await server.app.listen({host:'127.0.0.1',port:0});
  const socket=new WebSocket(server.app.listeningOrigin.replace('http:','ws:')+'/journey',{origin:'http://127.0.0.1:5174'}),next=reader(socket);
  try{
    expect((await server.app.inject('/journey/config')).json()).toMatchObject({walletRewards:false,practiceRewards:{rules:JOURNEY_REWARD_IDENTIFIERS.rules,policy:{value:'SIMULATED_CREDITS',bank:'TERMINAL'}}});
    await once(socket,'open');socket.send(JSON.stringify({op:'start',...JOURNEY_REWARD_IDENTIFIERS,roster:[{id:'starter:1',revision:1,loadout:'signature'},null,null]}));
    expect((await next('session')).rules).toBe(JOURNEY_REWARD_IDENTIFIERS.rules);
    const observation=(await next('snapshot')).observation as {section:string;rewards:{dropCreated:number;provisionalLoot:number};rewardLedger:{terminal:unknown}};
    expect(observation.rewards).toMatchObject({dropCreated:0,provisionalLoot:0});expect(observation.rewardLedger.terminal).toBeNull();
    const pickup={op:'command',id:'missing-bag',sequence:1,section:observation.section,actorId:1,action:{kind:'pickup',dropId:observation.section+':enemy:6'}};
    socket.send(JSON.stringify({...pickup,action:{...pickup.action,credits:999}}));expect((await next('error')).reason).toBe('Invalid Journey packet');
    socket.send(JSON.stringify(pickup));expect((await next('ack')).ok).toBe(false);
    expect(((await next('snapshot')).observation as {rewards:{provisionalLoot:number}}).rewards.provisionalLoot).toBe(0);
  }finally{socket.terminate();await server.app.close();}
},30000);
it('executes durable application commands through actual sockets and resumes without duplicate effects',async()=>{
  const server=await buildServer({database:':memory:',manual:true,journey:true});await server.app.listen({host:'127.0.0.1',port:0});
  const url=server.app.listeningOrigin.replace('http:','ws:')+'/journey',socket=new WebSocket(url,{origin:'http://127.0.0.1:5174'}),next=reader(socket);let resumed:WebSocket|undefined;
  try{
    await once(socket,'open');socket.send(JSON.stringify({op:'start',...JOURNEY_IDENTIFIERS}));const session=await next('session'),initial=await next('snapshot');
    const observation=initial.observation as {section:string;actors:{side:number;ammo:number}[]};expect(observation.actors.every(a=>a.side===0)).toBe(true);
    const command={op:'command',id:'socket-shot',sequence:1,section:observation.section,actorId:1,action:{kind:'fire',direction:{x:1,y:0,z:0}}};
    socket.send(JSON.stringify(command));const ack=await next('ack');await next('snapshot');expect(ack.ok).toBe(true);
    socket.send(JSON.stringify(command));expect(await next('ack')).toEqual(ack);await next('snapshot');
    socket.send(JSON.stringify({...command,action:{kind:'quit'}}));expect((await next('error')).reason).toBe('Journey command rejected');
    socket.send(JSON.stringify({...command,id:'wrong-actor',sequence:2,actorId:2}));await next('error');
    server.journey!.tick();await next('snapshot');
    const id=String(session.run),credential=String(session.credential);expect(server.journey!.store.load(id,credential).run.actors[0].ammo).toBe(19);
    const closed=once(socket,'close');socket.close();await closed;
    resumed=new WebSocket(url,{origin:'http://127.0.0.1:5174'});const again=reader(resumed);await once(resumed,'open');
    resumed.send(JSON.stringify({op:'resume',...JOURNEY_IDENTIFIERS,run:id,credential}));expect((await again('resumed')).lastSequence).toBe(1);
    const recovered=(await again('snapshot')).observation as {tick:number;state:string};expect(recovered).toMatchObject({tick:1,state:'ACTIVE'});
    resumed.send(JSON.stringify(command));expect(await again('ack')).toEqual(ack);expect(server.journey!.store.load(id,credential).run.actors[0].ammo).toBe(19);
  }finally{socket.terminate();resumed?.terminate();await server.app.close();}
},30000);
it('admits a selected roster over actual sockets and resumes only its pinned entry version',async()=>{
  const server=await buildServer({database:':memory:',manual:true,journey:true});await server.app.listen({host:'127.0.0.1',port:0});
  const url=server.app.listeningOrigin.replace('http:','ws:')+'/journey',socket=new WebSocket(url,{origin:'http://127.0.0.1:5174'}),next=reader(socket);let resumed:WebSocket|undefined,wrong:WebSocket|undefined;
  const choice=(id:string)=>({id,revision:1,loadout:'signature'});
  type Observation={section:string;roster:{hash:string;members:{actorId:number;id:string}[]};actors:{id:number;hp:number;ammo:number}[];progress:{policy:string;onchainVoucher:boolean;members:{actorId:number;xp:string}[]}};
  try{
    const catalogue=await server.app.inject('/journey/roster');expect(catalogue.json()).toMatchObject({environment:'LOCAL_SERVER_PRACTICE',ownedAssets:false});expect(catalogue.json().entries).toHaveLength(10);
    await once(socket,'open');socket.send(JSON.stringify({op:'start',...JOURNEY_ROSTER_IDENTIFIERS,roster:[choice('development:rook'),choice('development:rook'),null]}));expect((await next('error')).reason).toBe('Invalid Journey packet');
    socket.send(JSON.stringify({op:'start',...JOURNEY_ROSTER_IDENTIFIERS,roster:[choice('development:rook'),choice('development:imani'),null]}));const session=await next('session'),initial=(await next('snapshot')).observation as Observation;
    expect(session.rules).toBe(JOURNEY_ROSTER_IDENTIFIERS.rules);expect(initial.actors.map(a=>a.id)).toEqual([1,2]);expect(initial.actors[0]).toMatchObject({hp:120,ammo:60});expect(initial.roster.members.map(m=>m.id)).toEqual(['development:rook','development:imani']);
    expect(initial.progress).toMatchObject({policy:'journey-progress-1',onchainVoucher:false,members:[{actorId:1,xp:'0'},{actorId:2,xp:'0'}]});
    socket.send(JSON.stringify({op:'command',id:'fake-kill',sequence:1,section:initial.section,actorId:1,action:{kind:'kill',targetId:4,xp:999}}));expect((await next('error')).reason).toBe('Invalid Journey packet');
    const fire={op:'command',id:'roster-fire',sequence:1,section:initial.section,actorId:1,action:{kind:'fire',direction:{x:1,y:0,z:0}}};socket.send(JSON.stringify(fire));const ack=await next('ack');expect(ack.ok).toBe(true);await next('snapshot');
    const closed=once(socket,'close');socket.close();await closed;
    wrong=new WebSocket(url,{origin:'http://127.0.0.1:5174'});const denied=reader(wrong);await once(wrong,'open');wrong.send(JSON.stringify({op:'resume',...JOURNEY_IDENTIFIERS,run:session.run,credential:session.credential}));expect((await denied('error')).reason).toBe('Journey command rejected');wrong.terminate();
    resumed=new WebSocket(url,{origin:'http://127.0.0.1:5174'});const again=reader(resumed);await once(resumed,'open');resumed.send(JSON.stringify({op:'resume',...JOURNEY_ROSTER_IDENTIFIERS,run:session.run,credential:session.credential}));expect((await again('resumed')).rules).toBe(JOURNEY_ROSTER_IDENTIFIERS.rules);
    const restored=(await again('snapshot')).observation as Observation;expect(restored.roster.hash).toBe(initial.roster.hash);expect(restored.actors[0].ammo).toBe(59);
    expect(restored.progress).toEqual(initial.progress);
    resumed.send(JSON.stringify(fire));expect(await again('ack')).toEqual(ack);expect(((await again('snapshot')).observation as Observation).actors[0].ammo).toBe(59);
  }finally{socket.terminate();wrong?.terminate();resumed?.terminate();await server.app.close();}
},30000);
it('publishes authoritative airborne state and resumes that height through a real socket',async()=>{
  const server=await buildServer({database:':memory:',manual:true,journey:true});await server.app.listen({host:'127.0.0.1',port:0});
  const url=server.app.listeningOrigin.replace('http:','ws:')+'/journey',socket=new WebSocket(url,{origin:'http://127.0.0.1:5174'}),next=reader(socket);let resumed:WebSocket|undefined;
  try{
    await once(socket,'open');socket.send(JSON.stringify({op:'start',...JOURNEY_IDENTIFIERS}));const session=await next('session'),initial=await next('snapshot');
    type Observation={section:string;actors:{id:number;traversal:{y:number;velocity:number;grounded:boolean}}[]};
    const observation=initial.observation as Observation,command={op:'command',id:'socket-jump',sequence:1,section:observation.section,actorId:1,action:{kind:'jump'}};
    socket.send(JSON.stringify(command));const ack=await next('ack');expect(ack.ok).toBe(true);await next('snapshot');
    let airborne:Observation|undefined;
    for(let i=0;i<7;i++){server.journey!.tick();airborne=(await next('snapshot')).observation as Observation;}
    const height=airborne!.actors.find(a=>a.id===1)!.traversal;expect(height.y).toBeGreaterThan(1);expect(height.grounded).toBe(false);
    const closed=once(socket,'close');socket.close();await closed;
    resumed=new WebSocket(url,{origin:'http://127.0.0.1:5174'});const again=reader(resumed);await once(resumed,'open');
    resumed.send(JSON.stringify({op:'resume',...JOURNEY_IDENTIFIERS,run:session.run,credential:session.credential}));await again('resumed');
    const restored=(await again('snapshot')).observation as Observation;expect(restored.actors.find(a=>a.id===1)!.traversal).toEqual(height);
    resumed.send(JSON.stringify(command));expect(await again('ack')).toEqual(ack);await again('snapshot');
    resumed.send(JSON.stringify({...command,id:'midair-dodge',sequence:2,action:{kind:'dodge',direction:{x:1,z:0}}}));expect((await again('ack')).ok).toBe(false);await again('snapshot');
    for(let i=0;i<15;i++){server.journey!.tick();await again('snapshot');}
    const saved=server.journey!.store.load(String(session.run),String(session.credential));expect(saved.run.actors[0].traversal).toMatchObject({y:0,grounded:true,velocity:0});
  }finally{socket.terminate();resumed?.terminate();await server.app.close();}
},30000);
