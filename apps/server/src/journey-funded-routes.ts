import type {FastifyInstance} from 'fastify';
import type {JourneyStore} from './journey-store.ts';
import type {JourneyFundedWorker} from './journey-funded-worker.ts';
import {JourneyCommandBoundary} from './journey-boundary.ts';
export function journeyFundedRoutes(app:FastifyInstance,origins:Set<string>,store:JourneyStore|undefined,worker:JourneyFundedWorker|undefined,identify:(token:string,origin:string)=>string|null){
 const limits=new JourneyCommandBoundary();
 for(const operation of ['reserve','status','cancel','reconcile'] as const)app.post('/journey/funded/'+operation,async(req,reply)=>{
  reply.header('Cache-Control','no-store');const origin=req.headers.origin??'';if(!origins.has(origin))return reply.code(403).send({error:'Origin denied'});
  const owner=identify(req.headers.authorization?.replace(/^Bearer /,'')??'',origin);if(!owner)return reply.code(401).send({error:'Wallet login required'});
  if(!store||!worker)return reply.code(503).send({error:'Funded Journey unavailable. Choose practice.'});if(!limits.allow(owner.toLowerCase(),'control'))return reply.code(429).send({error:'Reservation request limit exceeded'});
  const body=req.body as {run?:unknown}|null;if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).join()!=='run'||typeof body.run!=='string'||!/^[a-f0-9]{32}$/.test(body.run))return reply.code(400).send({error:'Exact proposed run required'});
  const runId=body.run,prior=store.db.prepare('SELECT * FROM journey_funded_runs WHERE run_id=?').get(runId),intent=store.db.prepare('SELECT owner,state FROM journey_funded_intents WHERE run_id=?').get(runId);
  if([prior,intent].some(row=>row&&String(row.owner).toLowerCase()!==owner.toLowerCase()))return reply.code(403).send({error:'Reservation owner denied'});
  const status=()=>({environment:'LOCAL_BLOCKCHAIN',reservation:store.db.prepare('SELECT * FROM journey_funded_runs WHERE run_id=?').get(runId)??null,intentState:store.db.prepare('SELECT state FROM journey_funded_intents WHERE run_id=?').get(runId)?.state??null,rewards:store.funded.forRun(runId),settlement:store.db.prepare('SELECT state,transaction_hash FROM journey_funded_outbox WHERE run_id=?').get(runId)??null,events:store.db.prepare('SELECT state,reason,transaction_hash,recorded_at FROM journey_funded_recovery_events WHERE run_id=? ORDER BY id DESC LIMIT 10').all(runId),broadcasts:store.db.prepare('SELECT source,transaction_hash,nonce FROM journey_funded_broadcasts WHERE source IN (?,?,?)').all('open:'+runId,'settle:'+runId,'timeout:'+runId)});
  if(operation==='status')return status();
  try{
   if(operation==='cancel')return {...await worker.cancelUnbroadcast(runId,owner),environment:'LOCAL_BLOCKCHAIN',signedOrBroadcast:false};
   if(operation==='reconcile'){if(!prior&&!intent)return reply.code(404).send({error:'Unknown allocation source'});await worker.poll();return status();}
   const other=store.db.prepare("SELECT run_id FROM journey_funded_runs WHERE lower(owner)=? AND state NOT IN ('CONFIRMED','TIMED_OUT') AND run_id<>?").get(owner.toLowerCase(),runId);if(other)return reply.code(409).send({error:'Recover the existing funded reservation first'});
   const result=await worker.reserve(runId,owner);if(result.state==='CONFIRMED')store.funded.attach(runId,owner,result.deadline,result.transactionHash);return {...result,environment:'LOCAL_BLOCKCHAIN',cap:'15',playerDeposit:'0',playerStake:'0',gameplayAdmitted:false};
  }catch{return reply.code(409).send({error:operation==='cancel'?'Allocation was signed, broadcast, admitted or cannot be safely cancelled. Recover its status or use independent timeout.':'Backing or source confirmation unavailable. Recover the original allocation or choose a new practice run.'});}
 });
}
