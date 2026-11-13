import type {FastifyInstance} from 'fastify';
import type {JourneyStore} from './journey-store.ts';
import type {JourneyProgressChain} from './journey-progress-chain.ts';
import {JourneyCommandBoundary} from './journey-boundary.ts';
export function journeyProgressRoutes(app:FastifyInstance,origins:Set<string>,store:JourneyStore|undefined,bridge:JourneyProgressChain|undefined,identify:(token:string,origin:string)=>string|null){
 const limits=new JourneyCommandBoundary();
 for(const operation of ['list','prepare','confirm'] as const)app.post('/journey/progress/'+operation,async(req,reply)=>{
  reply.header('Cache-Control','no-store');const origin=req.headers.origin??'';
  if(!origins.has(origin))return reply.code(403).send({error:'Origin denied'});
  const owner=identify(req.headers.authorization?.replace(/^Bearer /,'')??'',origin)?.toLowerCase();if(!owner)return reply.code(401).send({error:'Wallet login required'});
  if(!store||!bridge)return reply.code(503).send({error:'Local progress bridge unavailable'});
  if(!limits.allow(owner,'control'))return reply.code(429).send({error:'Progress request limit exceeded'});
  const body=req.body as Record<string,unknown>|null,keys=operation==='list'?['runId']:operation==='prepare'?['source']:['source','transactionHash'];
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join()!==keys.sort().join())return reply.code(400).send({error:'Unexpected progress fields'});
  if(operation==='list'){
   if(typeof body.runId!=='string'||!/^[-a-zA-Z0-9:_]{1,128}$/.test(body.runId))return reply.code(400).send({error:'Invalid run identity'});
   return {environment:'LOCAL_BLOCKCHAIN',updates:store.progressOutbox.forRun(body.runId).filter(row=>String(row.owner).toLowerCase()===owner)};
  }
  if(typeof body.source!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(body.source))return reply.code(400).send({error:'Invalid bank source'});
  const row=store.db.prepare('SELECT owner,asset_key FROM journey_progress_outbox WHERE source=?').get(body.source);
  if(!row||String(row.owner).toLowerCase()!==owner)return reply.code(403).send({error:'Progress source owner denied'});
  try{
   if(operation==='prepare'){
    const result=await store.progressOutbox.prepare(body.source,bridge),signed=store.db.prepare('SELECT signature FROM journey_progress_outbox WHERE source=?').get(body.source)!;
    return {...result,environment:'LOCAL_BLOCKCHAIN',chainId:31337,collection:String(row.asset_key).split(':')[2],signature:String(signed.signature)};
   }
   if(typeof body.transactionHash!=='string')return reply.code(400).send({error:'Transaction hash required'});
   return await bridge.confirm(body.source,body.transactionHash);
  }catch{return reply.code(409).send({error:'Progress authority or confirmation changed. Refresh the bank update.'});}
 });
}
