import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { parseJourneyClient,type JourneyClientMessage } from '../../../packages/protocol/src/journey.ts';
import { JourneyCommandBoundary } from './journey-boundary.ts';
import { ROSTER_RULES,type RosterCatalogueEntry } from '../../../packages/sim/src/journey/roster.ts';
export interface JourneyTransportService {
  rosterCatalogue?():readonly RosterCatalogueEntry[];
  connect(transport:{send:(message:unknown)=>void;close:(code:number)=>void;identify?:(session:string)=>string|null}):{receive:(message:JourneyClientMessage)=>Promise<void>;close:()=>void};
}
export function journeyRoutes(app:FastifyInstance,origins:Set<string>,service?:JourneyTransportService,enabled=process.env.JOURNEY_ENABLED==='true',identify?:(session:string,origin:string)=>string|null){
  app.get('/journey/roster',async(_request,reply)=>{
    if(!enabled||!service?.rosterCatalogue)return reply.code(503).send({error:'Journey roster unavailable'});
    return {version:ROSTER_RULES.catalogueVersion,environment:'LOCAL_SERVER_PRACTICE',ownedAssets:false,entries:service.rosterCatalogue()};
  });
  const boundary=new JourneyCommandBoundary(),connections=new Set<string>();
  app.get('/journey',{websocket:true,preValidation:async(req,reply)=>{
    if(!req.headers.origin||!origins.has(req.headers.origin))return reply.code(403).send({error:'Origin denied'});
    if(!enabled||!service)return reply.code(503).send({error:'Authoritative Journey service unavailable'});
    if(connections.size>=64)return reply.code(503).send({error:'Journey connection capacity reached'});
  }},(socket,request)=>{
    const scope=randomUUID();connections.add(scope);let closed=false,pending=0,queue=Promise.resolve();
    const client=service!.connect({send:message=>{if(socket.readyState===1){if(socket.bufferedAmount>262144)socket.close(1008);else socket.send(JSON.stringify(message));}},close:code=>socket.close(code),identify:session=>identify?.(session,request.headers.origin!)??null});
    socket.on('message',(raw,binary)=>{
      if(closed)return;
      if(binary){socket.close(1003);return;}
      if(!boundary.allow(scope,'connection')||pending>=32){socket.close(1008);return;}
      let message:JourneyClientMessage;
      try{message=parseJourneyClient(raw.toString());}catch{socket.send(JSON.stringify({op:'error',reason:'Invalid Journey packet'}));return;}
      if(message.op==='command'){
        const category=['fire','throw'].includes(message.action.kind)?'fire':['move','drive'].includes(message.action.kind)?'movement':'control';
        if(!boundary.allow(scope,category)){socket.close(1008);return;}
      }
      pending++;queue=queue.then(async()=>{if(!closed)await client.receive(message);}).catch(()=>{if(socket.readyState===1)socket.send(JSON.stringify({op:'error',reason:'Journey command rejected'}));}).finally(()=>{pending--;});
    });
    socket.once('close',()=>{closed=true;connections.delete(scope);boundary.release(scope);client.close();});socket.on('error',()=>{});
  });
}
