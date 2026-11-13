import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {WeaponCatalog} from './weapon-catalog.ts';
import {weaponAsset} from '@last-signal/chain';

export function weaponCatalogRoutes(app:FastifyInstance,service:WeaponCatalog,origins:Set<string>){
 const buckets=new Map<string,{at:number;n:number}>();
 const origin=(r:FastifyRequest)=>r.headers.origin??'http://'+r.headers.host;
 const wallet=(r:FastifyRequest)=>{const o=origin(r);if(!origins.has(o))throw Error('Origin denied');const wallet=service.armory.testnet.auth.identify(r.headers.authorization?.replace(/^Bearer /,'')??'',o);if(!wallet)throw Error('Wallet login required');return wallet;};
 const query=(r:FastifyRequest)=>r.query as Record<string,string|undefined>;
 const asset=(r:FastifyRequest)=>{const q=query(r);return weaponAsset({collection:q.collection!,tokenId:q.tokenId!});};
 const body=(r:FastifyRequest,keys:string[])=>{const b=r.body;if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).sort().join(',')!==[...keys].sort().join(','))throw Error('Invalid weapon request');return b as Record<string,unknown>;};
 const route=(method:'GET'|'POST',url:string,action:(r:FastifyRequest)=>unknown)=>app.route({method,url,handler:async(r,reply)=>{reply.header('Cache-Control','no-store');try{
  const k=r.ip+':'+url,now=Date.now(),b=buckets.get(k);if(!b||now-b.at>=60000)buckets.set(k,{at:now,n:1});else if(++b.n>90)throw Error('Weapon request limit');if(buckets.size>2000)for(const[key,bucket]of buckets)if(now-bucket.at>60000)buckets.delete(key);
  return await action(r);
 }catch(e){return reply.code(400).send({error:(e as {code?:string}).code?'Weapon chain reads unavailable. No simulated ownership is substituted.':(e as Error).message});}}});
 route('GET','/weapons/config',()=>service.config());
 route('GET','/weapons/journey-inspect',r=>service.inspectJourneyAsset(query(r)));
 route('GET','/weapons/journey-quote',r=>service.quoteJourneyAsset(query(r)));
 route('GET','/weapons/locker',r=>{const q=query(r);return service.inventory(q.wallet!,q.collection!,q.offset===undefined?0:Number(q.offset));});
 route('GET','/weapons/market',r=>{const q=query(r);return service.market(q.collection!,q.start===undefined?1:Number(q.start));});
 route('GET','/weapons/token',r=>service.token(asset(r)));
 route('GET','/weapons/quote',r=>service.quote(asset(r)));
 route('GET','/weapons/history',r=>service.history(asset(r)));
 route('GET','/weapons/loadout',r=>service.loadout(wallet(r)));
 route('POST','/weapons/loadout',r=>{const b=body(r,['collection','tokenId']);if(typeof b.collection!=='string'||typeof b.tokenId!=='string')throw Error('Explicit collection and token ID required');return service.select(wallet(r),weaponAsset({collection:b.collection,tokenId:b.tokenId}));});
 route('POST','/weapons/equip',r=>{body(r,[]);return service.equip(wallet(r));});
 route('POST','/weapons/recovery/:run',r=>{body(r,[]);return service.recovery((r.params as {run:string}).run,wallet(r));});
}
