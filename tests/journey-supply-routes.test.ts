import {test,expect} from 'vitest';
import Fastify from 'fastify';
import {DatabaseSync} from 'node:sqlite';
import {journeySupplyRoutes} from '../apps/server/src/journey-supply-routes.ts';
import {JourneySupplyJournal,type SupplyRedemption} from '../apps/server/src/journey-supplies.ts';
test('supply recovery derives owner from origin bound session and never accepts client balance',async()=>{
 const app=Fastify(),db=new DatabaseSync(':memory:'),owner='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40),origin='http://localhost:5180';
 const event:SupplyRedemption={chainId:'31337',transactionHash:'0x'+'3'.repeat(64),logIndex:0,collection:other,owner,itemClass:0,packs:'1',blockHash:'0x'+'4'.repeat(64),confirmed:true};
 const journal=new JourneySupplyJournal(db,{verify:async()=>event,canonical:async()=>true});
 journeySupplyRoutes(app,new Set([origin]),journal,session=>session==='owner'?owner:session==='other'?other:null);
 const headers={origin,authorization:'Bearer owner'},payload={transactionHash:event.transactionHash,logIndex:0};
 try{
  expect((await app.inject({method:'POST',url:'/journey/supplies/recover',headers:{...headers,origin:'https://invalid.example'},payload})).statusCode).toBe(403);
  expect((await app.inject({method:'POST',url:'/journey/supplies/recover',headers:{origin},payload})).statusCode).toBe(401);
  expect((await app.inject({method:'POST',url:'/journey/supplies/recover',headers:{...headers,authorization:'Bearer other'},payload})).statusCode).toBe(400);
  expect(journal.balance(owner,0)).toBe(0n);
  const recovered=await app.inject({method:'POST',url:'/journey/supplies/recover',headers,payload});
  expect(recovered.statusCode).toBe(200);expect(recovered.json().units).toBe('3');
  expect((await app.inject({method:'POST',url:'/journey/supplies/stock',headers,payload:{units:999}})).statusCode).toBe(400);
  const stock=await app.inject({method:'POST',url:'/journey/supplies/stock',headers,payload:{}});
  expect(stock.json().units[0].quantity).toBe('3');expect(stock.headers['cache-control']).toBe('no-store');
  const burst=await Promise.all(Array.from({length:20},()=>app.inject({method:'POST',url:'/journey/supplies/stock',headers,payload:{}})));
  expect(burst.some(response=>response.statusCode===429)).toBe(true);
 }finally{await app.close();db.close();}
});

