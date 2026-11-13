import {JourneyCommandBoundary} from './journey-boundary.ts';
import type {FastifyInstance} from 'fastify';
import type {JourneySupplyJournal} from './journey-supplies.ts';
export function journeySupplyRoutes(app:FastifyInstance,origins:Set<string>,journal:JourneySupplyJournal|undefined,identify:(session:string,origin:string)=>string|null){
 const limits=new JourneyCommandBoundary();
 const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
 app.post('/journey/supplies/stock',async(req,reply)=>{
  reply.header('Cache-Control','no-store');
  const origin=req.headers.origin??'';if(!origins.has(origin))return reply.code(403).send({error:'Origin denied'});
  const owner=identify(req.headers.authorization?.replace(/^Bearer /,'')??'',origin);if(!owner)return reply.code(401).send({error:'Wallet login required'});
  if(!journal)return reply.code(503).send({error:'Local supplies unavailable'});
  if(!limits.allow(owner,'control'))return reply.code(429).send({error:'Supply request limit exceeded'});
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||!exact(req.body as Record<string,unknown>,[]))return reply.code(400).send({error:'Unexpected stock fields'});
  try{await journal.reconcile(owner);return {environment:'LOCAL_BLOCKCHAIN',owner,frozen:journal.frozen(owner),units:[0,1,2,3].map(itemClass=>({itemClass,quantity:journal.balance(owner,itemClass).toString()}))};}catch{return reply.code(503).send({error:'Supply reconciliation unavailable'});}
 });
 app.post('/journey/supplies/recover',async(req,reply)=>{
  reply.header('Cache-Control','no-store');
  const origin=req.headers.origin??'';if(!origins.has(origin))return reply.code(403).send({error:'Origin denied'});
  const owner=identify(req.headers.authorization?.replace(/^Bearer /,'')??'',origin);if(!owner)return reply.code(401).send({error:'Wallet login required'});
  if(!journal)return reply.code(503).send({error:'Local supplies unavailable'});
  if(!limits.allow(owner,'control'))return reply.code(429).send({error:'Supply request limit exceeded'});
  const body=req.body as Record<string,unknown>|null;
  if(!body||typeof body!=='object'||Array.isArray(body)||!exact(body,['transactionHash','logIndex'])||typeof body.transactionHash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(body.transactionHash)||!Number.isSafeInteger(body.logIndex)||Number(body.logIndex)<0)return reply.code(400).send({error:'Invalid receipt identity'});
  try{return await journal.recover(body.transactionHash,Number(body.logIndex),owner);}catch{return reply.code(400).send({error:'Redemption unavailable or owner mismatch'});}
 });
}

