import { it,expect } from 'vitest';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { journeyRoutes } from '../apps/server/src/journey-routes.ts';
import WebSocket from 'ws';
import { once } from 'node:events';
import { JOURNEY_IDENTIFIERS } from '../packages/protocol/src/journey.ts';
it('denies unknown origins and unavailable authoritative entry without starting a run',async()=>{
  const app=Fastify();await app.register(websocket);journeyRoutes(app,new Set(['http://127.0.0.1:5180']));await app.ready();
  try{
    expect((await app.inject({url:'/journey',headers:{origin:'https://untrusted.example'}})).statusCode).toBe(403);
    expect((await app.inject({url:'/journey',headers:{origin:'http://127.0.0.1:5180'}})).statusCode).toBe(503);
  }finally{await app.close();}
});
it('validates and serializes actual WebSocket packets and rejects binary traffic',async()=>{
  const app=Fastify(),received:string[]=[];let disconnected=0;
  await app.register(websocket);
  journeyRoutes(app,new Set(['http://127.0.0.1:5180']),{connect:transport=>({receive:async message=>{
    received.push(message.op);transport.send({op:'received',kind:message.op});
  },close:()=>{disconnected++;}})},true);
  await app.listen({host:'127.0.0.1',port:0});
  const socket=new WebSocket(app.listeningOrigin.replace('http:','ws:')+'/journey',{origin:'http://127.0.0.1:5180'});
  try{
    await once(socket,'open');
    const invalid=once(socket,'message');socket.send(JSON.stringify({op:'start',...JOURNEY_IDENTIFIERS,reward:999}));expect(JSON.parse(String((await invalid)[0])).op).toBe('error');expect(received).toEqual([]);
    const start=once(socket,'message');socket.send(JSON.stringify({op:'start',...JOURNEY_IDENTIFIERS}));expect(JSON.parse(String((await start)[0])).kind).toBe('start');
    const ping=once(socket,'message');socket.send(JSON.stringify({op:'ping'}));await ping;expect(received).toEqual(['start','ping']);
    const closed=once(socket,'close');socket.send(Buffer.from([1,2,3]));expect((await closed)[0]).toBe(1003);
  }finally{socket.terminate();await app.close();}
  expect(disconnected).toBe(1);
});
it('closes a real socket that exceeds the per category command budget',async()=>{
  const app=Fastify();await app.register(websocket);
  journeyRoutes(app,new Set(['http://127.0.0.1:5180']),{connect:()=>({receive:async()=>{},close:()=>{}})},true);
  await app.listen({host:'127.0.0.1',port:0});
  const socket=new WebSocket(app.listeningOrigin.replace('http:','ws:')+'/journey',{origin:'http://127.0.0.1:5180'});
  try{
    await once(socket,'open');const closed=once(socket,'close');
    for(let i=0;i<20;i++)socket.send(JSON.stringify({op:'command',id:'fire:'+i,sequence:i+1,section:'journey-sections-1:1:0',actorId:1,action:{kind:'fire',direction:{x:1,y:0,z:0}}}));
    expect((await closed)[0]).toBe(1008);
  }finally{socket.terminate();await app.close();}
});
