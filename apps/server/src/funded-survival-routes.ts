import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {FundedSurvival} from './funded-survival.ts';
import {json} from './survival-settlements.ts';
export function fundedSurvivalRoutes(app:FastifyInstance,service:FundedSurvival,origins:Set<string>,identify:(session:string,origin:string)=>string|null){
 const origin=(r:FastifyRequest)=>r.headers.origin??'http://'+r.headers.host;
 const wallet=(r:FastifyRequest)=>{const o=origin(r);if(!origins.has(o))throw Error('Origin denied');const address=identify(r.headers.authorization?.replace(/^Bearer /,'')??'',o);if(!address)throw Error('Wallet login required');return address;};
 const body=(r:FastifyRequest,keys:string[])=>{const b=r.body;if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).sort().join(',')!==[...keys].sort().join(','))throw Error('Invalid funded request');return b as Record<string,unknown>;};
 const run=(r:FastifyRequest)=>(r.params as {id:string}).id;
 const buckets=new Map<string,{at:number;n:number}>();
 const route=(method:'GET'|'POST',url:string,action:(r:FastifyRequest)=>unknown)=>app.route({method,url,handler:async(r,reply)=>{
  reply.header('Cache-Control','no-store');try{
   const k=r.ip+':'+url,t=Date.now(),b=buckets.get(k);if(!b||t-b.at>=60000)buckets.set(k,{at:t,n:1});else if(++b.n>120)throw Error('Funded request limit');if(buckets.size>2000)for(const [key,value]of buckets)if(t-value.at>60000)buckets.delete(key);
   const value=await action(r);return reply.type('application/json').send(json(value));
  }catch(e){return reply.code(400).send({error:(e as {code?:string}).code?'Chain unavailable. Funded state is not simulated.':(e as Error).message});}
 }});
 route('GET','/survival/funded/config',()=>service.config());
 route('POST','/survival/funded/entries',r=>{const b=body(r,['deposit','carryCap']);if(typeof b.deposit!=='number'||typeof b.carryCap!=='number')throw Error('Whole allocation amounts required');return service.entry(wallet(r),b.deposit,b.carryCap);});
 route('POST','/survival/funded/:id/activate',r=>{body(r,[]);return service.activate(run(r),wallet(r));});
 route('GET','/survival/funded/:id',r=>service.status(run(r),wallet(r)));
 route('POST','/survival/funded/:id/pause',r=>{const b=body(r,['paused']);if(typeof b.paused!=='boolean')throw Error('Pause flag required');return service.pause(run(r),wallet(r),b.paused);});
 route('POST','/survival/funded/:id/mission',r=>{body(r,[]);return service.missionPermit(run(r),wallet(r));});
 route('POST','/survival/funded/:id/mission-receipt',r=>{const b=body(r,['hash']);if(typeof b.hash!=='string')throw Error('Receipt hash required');return service.missionReceipt(run(r),wallet(r),b.hash);});
 app.get('/survival/funded-socket',{websocket:true,preValidation:async(r,reply)=>{if(!r.headers.origin||!origins.has(r.headers.origin))return reply.code(403).send({error:'Origin denied'});}},(socket,request)=>{
  let detach:(()=>void)|undefined,runId='',player='',session='',closed=false;const limit=setTimeout(()=>{if(!detach)socket.close(1008);},10000);let window=Date.now(),messages=0;
  socket.on('message',(raw,binary)=>{
   try{
    if(binary||Buffer.byteLength(raw.toString())>16384||closed)throw Error('Invalid funded transport');
    if(Date.now()-window>=1000){window=Date.now();messages=0;}if(++messages>60)throw Error('Funded transport limit');
    const m=JSON.parse(raw.toString());if(!m||typeof m!=='object'||Array.isArray(m))throw Error('Invalid funded control');
    if(!detach){if(Object.keys(m).sort().join(',')!=='op,run,session'||m.op!=='attach'||typeof m.run!=='string'||typeof m.session!=='string')throw Error('Authenticated attach required');session=m.session;player=identify(session,request.headers.origin??'')??'';if(!player)throw Error('Wallet login required');runId=m.run;detach=service.attach(runId,player,{send:data=>{if(socket.readyState===1){if(socket.bufferedAmount>262144)socket.close(1008);else socket.send(data);}},close:code=>socket.close(code)});clearTimeout(limit);return;}
    if(identify(session,request.headers.origin??'')!==player)throw Error('Wallet login expired');
    if(Object.keys(m).sort().join(',')!=='id,op,request'||m.op!=='action'||typeof m.id!=='string'||!m.request||typeof m.request!=='object'||Array.isArray(m.request))throw Error('Exact control fields required');
    const keys=m.request.kind==='command'?'action,kind':m.request.kind==='supply'||m.request.kind==='field'?'item,kind':m.request.kind==='extraction'?'decision,kind':m.request.kind==='decline'?'kind,missionId':m.request.kind==='fieldLoot'?'kind,lootId':'';
    if(!keys||Object.keys(m.request).sort().join(',')!==keys)throw Error('Unsupported control');socket.send(json({op:'ack',...service.action(runId,player,m.id,m.request)}));
   }catch{socket.send(json({op:'error',reason:'Funded control rejected. Check login, allocation and run phase.'}));}
  });
  socket.on('close',()=>{closed=true;clearTimeout(limit);detach?.();});socket.on('error',()=>{});
 });
}
