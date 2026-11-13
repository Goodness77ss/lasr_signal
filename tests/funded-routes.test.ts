import {test,expect} from 'vitest';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import {fundedSurvivalRoutes} from '../apps/server/src/funded-survival-routes.ts';
import type {FundedSurvival} from '../apps/server/src/funded-survival.ts';

test('funded HTTP routes require the allowed origin and wallet login before requesting authorization',async()=>{
 const app=Fastify({logger:false});await app.register(websocket);let requests=0;
 const service={config:()=>({mode:'LOCAL_BLOCKCHAIN'}),entry:async(player:string,deposit:number,carryCap:number)=>{requests++;return {player,deposit:BigInt(deposit),carryCap:BigInt(carryCap)};}} as unknown as FundedSurvival;
 const origin='http://127.0.0.1:5174';fundedSurvivalRoutes(app,service,new Set([origin]),token=>token==='fixture_session'?'0x'+'11'.repeat(20):null);await app.ready();
 try{
  for(const headers of [{origin},{origin,authorization:'Bearer invalid'},{origin:'http://other.invalid',authorization:'Bearer fixture_session'}]){const r=await app.inject({method:'POST',url:'/survival/funded/entries',headers,payload:{deposit:0,carryCap:0}});expect(r.statusCode).toBe(400);}
  expect(requests).toBe(0);
  const r=await app.inject({method:'POST',url:'/survival/funded/entries',headers:{origin,authorization:'Bearer fixture_session'},payload:{deposit:0,carryCap:0}});expect(r.statusCode).toBe(200);expect(r.headers['cache-control']).toBe('no-store');expect(r.json().deposit).toBe('0');expect(requests).toBe(1);
 }finally{await app.close();}
});
test('extra financial fields and client submitted results cannot reach the funded service',async()=>{
 const app=Fastify({logger:false});await app.register(websocket);let requests=0;const service={config:()=>({mode:'LOCAL_BLOCKCHAIN'}),entry:()=>{requests++;return {};}} as unknown as FundedSurvival;
 const origin='http://127.0.0.1:5174';fundedSurvivalRoutes(app,service,new Set([origin]),()=> '0x'+'11'.repeat(20));await app.ready();
 try{
  for(const payload of [{deposit:0,carryCap:0,stationEarned:24},{deposit:'0',carryCap:0},{deposit:0}])expect((await app.inject({method:'POST',url:'/survival/funded/entries',headers:{origin},payload})).statusCode).toBe(400);
  expect(requests).toBe(0);expect((await app.inject({method:'POST',url:'/survival/funded/results',headers:{origin},payload:{stationEarned:24}})).statusCode).toBe(404);
 }finally{await app.close();}
});
