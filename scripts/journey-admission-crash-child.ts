import {DatabaseSync} from 'node:sqlite';
import {JourneyService} from '../apps/server/src/journey-service.ts';
import {parseJourneyClient} from '../packages/protocol/src/journey.ts';
import type {EquipmentOwnershipVerifier} from '../apps/server/src/journey-equipment.ts';
// Deliberately exit after the durable admission commit but before any reply.
// Test ownership is an explicit fixture, not an EVM ownership claim.
const chunks:Buffer[]=[];for await(const chunk of process.stdin)chunks.push(Buffer.from(chunk));const request=parseJourneyClient(Buffer.concat(chunks).toString('utf8'));
if(request.op!=='start'||!('equipment' in request))throw Error('Equipment admission fixture required');
const verifier:EquipmentOwnershipVerifier={owned:async(asset,_owner,hash,nonce)=>{const entry=request.equipment.find(e=>e.asset.tokenId===asset.tokenId);if(!entry||entry.buildHash!==hash||entry.assetNonce!==nonce)throw Error('Unsupported fixture');return {assetNonce:nonce,immutableBuild:{hash,build:{id:entry.buildId}}};}};
const db=new DatabaseSync(process.argv[2]),service=new JourneyService(db,{equipmentVerifier:verifier}),client=service.connect({identify:()=> '0x1111111111111111111111111111111111111111',close:()=>{},send:message=>{if((message as {op:string}).op==='session')process.exit(74);}});
await client.receive(request);throw Error('Expected process exit at admission reply');
