import type {FastifyInstance} from 'fastify';
import type {Signer} from 'ethers';
import type {JourneyStore} from './journey-store.ts';
import type {JourneyGunCollections} from './journey-guns.ts';
import {JourneyCommandBoundary} from './journey-boundary.ts';
export function journeyRecoveryRoutes(app:FastifyInstance,origins:Set<string>,store:JourneyStore|undefined,adapter:JourneyGunCollections|undefined,signer:Signer|undefined,identify:(token:string,origin:string)=>string|null){
 const limits=new JourneyCommandBoundary();
 for(const operation of ['list','prepare','confirm'] as const)app.post('/journey/recovery/'+operation,async(req,reply)=>{
  reply.header('Cache-Control','no-store');const origin=req.headers.origin??'';if(!origins.has(origin))return reply.code(403).send({error:'Origin denied'});
  const owner=identify(req.headers.authorization?.replace(/^Bearer /,'')??'',origin);if(!owner)return reply.code(401).send({error:'Wallet login required'});
  if(!limits.allow(owner,'control'))return reply.code(429).send({error:'Recovery request limit exceeded'});
  if(!store||!adapter||!signer)return reply.code(503).send({error:'Local weapon recovery unavailable'});
  const body=req.body as Record<string,unknown>|null,keys=operation==='list'?[]:operation==='prepare'?['source']:['source','transactionHash'];
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join()!==keys.sort().join())return reply.code(400).send({error:'Unexpected recovery fields'});
  if(operation==='list')return {environment:'LOCAL_BLOCKCHAIN',recoveries:store.recovery.list(owner)};
  if(typeof body.source!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(body.source))return reply.code(400).send({error:'Exact source required'});
  try{return operation==='prepare'?await store.recovery.prepare(body.source,owner,adapter,signer):await store.recovery.confirm(body.source,owner,String(body.transactionHash),adapter);}catch(error){return reply.code(409).send({error:(error as Error).message.slice(0,256)});}
 });
}
