import {journeyArmoryRoutes} from './journey-armory-routes.ts';
import {journeyRecoveryRoutes} from './journey-recovery-routes.ts';
import {JourneyFundedWorker,type JourneyPoolDeployment} from './journey-funded-worker.ts';
import {journeyFundedRoutes} from './journey-funded-routes.ts';
import {JourneyProgressChain} from './journey-progress-chain.ts';
import {journeyProgressRoutes} from './journey-progress-routes.ts';
import {JourneyOwnedRoster} from './journey-owned-roster.ts';
import {JourneySupplyReceipts,type SupplyDeployment} from './journey-supply-chain.ts';
import {journeySupplyRoutes} from './journey-supply-routes.ts';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import {RULES,MAP} from '@last-signal/sim';
import {MAX_BYTES,PROTOCOL} from '@last-signal/protocol';
import {TestnetService,type ChainOptions} from './testnet.ts';
import {testnetRoutes} from './testnet-routes.ts';
import {Rooms} from './rooms.ts';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {operation} from './operation.ts';
import {ArmoryService,type ArmoryOptions} from './armory.ts';
import {armoryRoutes} from './armory-routes.ts';
import {SurvivalPractice} from './survival.ts';
import {FundedSurvival} from './funded-survival.ts';
import {fundedSurvivalRoutes} from './funded-survival-routes.ts';
import type {SurvivalVaultTransport} from './survival-vault-transport.ts';
import type {Signer,JsonRpcProvider} from 'ethers';
import {configuredPublicSurvival} from './survival-public-config.ts';
import {WeaponCatalog} from './weapon-catalog.ts';
import {weaponCatalogRoutes} from './weapon-catalog-routes.ts';
import type {WeaponCollectionDeployment} from './weapon-collections.ts';
import {WeaponLab} from './weapon-lab.ts';
import {journeyCapabilities} from './journey-config.ts';
import {journeyRoutes} from './journey-routes.ts';
import {JourneyService} from './journey-service.ts';
import {SoldierCollections,type SoldierCollectionDeployment,type SoldierMarketDeployment} from './journey-soldiers.ts';
import {JourneyGunCollections,type JourneyGunDeployment} from './journey-guns.ts';
export async function buildServer(options:{database?:string;manual?:boolean;journeyNetwork?:{chainId:31337;rpc:string};journey?:boolean;journeyPool?:{provider:JsonRpcProvider;signer:Signer;deployment:JourneyPoolDeployment};journeySoldiers?:{provider:JsonRpcProvider;deployment:SoldierCollectionDeployment;service?:string;gameplay?:Signer;market?:SoldierMarketDeployment};journeySupplies?:{provider:JsonRpcProvider;deployment:SupplyDeployment;market?:{market:string;currency:string;marketCodeHash:string;currencyCodeHash:string}};journeyGuns?:{provider:JsonRpcProvider;deployment:JourneyGunDeployment;gameplay?:Signer};now?:()=>number;grace?:number;chain?:ChainOptions;armory?:ArmoryOptions;weaponCollectionV2?:WeaponCollectionDeployment;survival?:boolean;fundedSurvival?:{transport:SurvivalVaultTransport;gameplay:Signer}}={}){
 const app=Fastify({logger:false,bodyLimit:MAX_BYTES});
 let closing=false;
 const config=operation(),origins=config.origins;
 const database=options.database??config.database;if(database!==':memory:')mkdirSync(dirname(database),{recursive:true});
 const rooms=new Rooms(database,options.now,options.grace);
 const journeyEnabled=options.journey??process.env.JOURNEY_ENABLED==='true';
 const soldierAdapter=options.journeySoldiers?new SoldierCollections(options.journeySoldiers.provider,options.journeySoldiers.deployment,options.journeySoldiers.market):undefined;
 const gunAdapter=options.journeyGuns?new JourneyGunCollections(options.journeyGuns.provider,options.journeyGuns.deployment):undefined;
 const supplyAdapter=options.journeySupplies?new JourneySupplyReceipts(options.journeySupplies.provider,options.journeySupplies.deployment):undefined;
 const ownedRoster=soldierAdapter&&options.journeySoldiers?.service?new JourneyOwnedRoster(soldierAdapter,options.journeySoldiers.service):undefined;
 const journey:JourneyService|null=journeyEnabled?new JourneyService(rooms.db,{ownedRoster,fundedReservation:options.journeyPool?async(runId,owner)=>{if(!journeyPoolWorker||!journey)throw Error('Funded service unavailable');const reservation=await journeyPoolWorker.reserve(runId,owner);if(reservation.state!=='CONFIRMED')throw Error('Reward backing awaiting confirmations. Recover entry shortly.');journey.store.funded.attach(runId,owner,reservation.deadline,reservation.transactionHash);}:undefined,deploymentVerifier:soldierAdapter,equipmentVerifier:gunAdapter,supplyVerifier:supplyAdapter}):null;
 const progressBridge=journey&&soldierAdapter&&options.journeySoldiers?.gameplay&&options.journeySoldiers.service?new JourneyProgressChain(rooms.db,options.journeySoldiers.provider,soldierAdapter,journey.store.deployments,options.journeySoldiers.gameplay,options.journeySoldiers.service):undefined;
 const journeyPoolWorker:JourneyFundedWorker|undefined=journey&&options.journeyPool?new JourneyFundedWorker(rooms.db,options.journeyPool.provider,options.journeyPool.signer,options.journeyPool.deployment):undefined;
 const testnet=new TestnetService(rooms,options.chain);
 const armory=new ArmoryService(testnet,options.armory,options.now);
 const weapons=new WeaponCatalog(armory,options.weaponCollectionV2);
 if(soldierAdapter)weapons.bindJourneySoldiers(soldierAdapter);
 if(gunAdapter)weapons.bindJourneyGuns(gunAdapter);
 const weaponLab=new WeaponLab(process.env.SURVIVAL_WEAPON_LAB==='true',weapons,options.now);
 const survival=new SurvivalPractice(rooms.db,options.survival??process.env.SURVIVAL_STATIONS_V2==='true',options.now);
 let configuredFunded:ReturnType<typeof configuredPublicSurvival>=null,fundedSetupReason='Funded survival is disabled. Free practice remains available.';
 if(!options.fundedSurvival)try{configuredFunded=configuredPublicSurvival();}catch{fundedSetupReason='Funded survival deployment or protected roles are unavailable. Free practice remains available.';}
 const fundedOptions=options.fundedSurvival??configuredFunded;
 const funded=fundedOptions?new FundedSurvival(rooms.db,fundedOptions.transport,fundedOptions.gameplay,options.now):null;
 weapons.bindSurvival(funded);
 await app.register(websocket,{options:{maxPayload:MAX_BYTES*2,perMessageDeflate:false},errorHandler:(_error,socket)=>socket.close(1011),preClose:done=>{closing=true;for(const socket of app.websocketServer.clients){socket.close(1001,'Service restarting');const deadline=setTimeout(()=>socket.terminate(),1000);deadline.unref();socket.once('close',()=>clearTimeout(deadline));}app.websocketServer.close();done();}});
 testnetRoutes(app,testnet,origins);
 app.post('/testnet/session',async(req,reply)=>{reply.header('Cache-Control','no-store');const origin=req.headers.origin??'';if(!origins.has(origin))return reply.code(403).send({error:'Connection unavailable'});const address=testnet.auth.identify(req.headers.authorization?.replace(/^Bearer /,'')??'',origin);if(!address)return reply.code(401).send({error:'Connect your wallet'});return {address};});
 journeyArmoryRoutes(app,origins,journey?.store,soldierAdapter,gunAdapter,options.journeySupplies,(token,origin)=>testnet.auth.identify(token,origin));
 journeyFundedRoutes(app,origins,journey?.store,journeyPoolWorker,(token,origin)=>testnet.auth.identify(token,origin));
 journeyRecoveryRoutes(app,origins,journey?.store,gunAdapter,options.journeyGuns?.gameplay,(token,origin)=>testnet.auth.identify(token,origin));
 journeyProgressRoutes(app,origins,journey?.store,progressBridge,(token,origin)=>testnet.auth.identify(token,origin));
 journeySupplyRoutes(app,origins,journey?.store.supplies,(session,origin)=>testnet.auth.identify(session,origin));
 armoryRoutes(app,armory,origins);
 weaponCatalogRoutes(app,weapons,origins);
 app.get('/weapon-lab/config',async()=>weaponLab.config());
 app.get('/journey/config',async()=>({...journeyCapabilities({JOURNEY_ENABLED:String(journeyEnabled)},!!journey),network:options.journeyNetwork?{chainId:31337,chainName:'LAST SIGNAL Demo',rpc:options.journeyNetwork.rpc}:undefined,funded:{enabled:!!journeyPoolWorker&&!!ownedRoster,reservationAvailable:!!journeyPoolWorker,environment:'LOCAL_BLOCKCHAIN',cap:'15',deposit:'0',stake:'0',deadlineSeconds:1200,deployment:journeyPoolWorker?journeyPoolWorker.deployment:undefined},ownedRoster:ownedRoster&&journey?{enabled:true,chainId:31337,collection:soldierAdapter!.deployment.collection,codeHash:soldierAdapter!.deployment.codeHash,gameplaySigner:soldierAdapter!.deployment.gameplaySigner,rulesHash:soldierAdapter!.deployment.rulesHash,progressEnabled:!!progressBridge,market:soldierAdapter!.marketDeployment?{chainId:31337,collection:soldierAdapter!.deployment.collection,collectionCodeHash:soldierAdapter!.deployment.codeHash,market:soldierAdapter!.marketDeployment.market,currency:soldierAdapter!.marketDeployment.currency,marketCodeHash:soldierAdapter!.marketDeployment.codeHash,currencyCodeHash:soldierAdapter!.marketDeployment.currencyCodeHash}:undefined,service:options.journeySoldiers!.service}:{enabled:false},supplies:supplyAdapter&&journey?{enabled:true,environment:'LOCAL_BLOCKCHAIN',chainId:31337,collection:supplyAdapter.deployment.collection,codeHash:supplyAdapter.deployment.codeHash,policyHash:supplyAdapter.deployment.policyHash,...options.journeySupplies?.market}:{enabled:false},equipment:gunAdapter&&journey?{admission:true,environment:'LOCAL_BLOCKCHAIN',chainId:'31337',loginChainId:testnet.auth.chainId,collection:gunAdapter.deployment.collection,deployment:gunAdapter.deployment,presentationReady:false}:{admission:false,presentationReady:false}}));
 journeyRoutes(app,origins,journey??undefined,journeyEnabled,(session,origin)=>testnet.auth.identify(session,origin));
 app.get('/weapon-lab',{websocket:true,preValidation:async(req,reply)=>{if(!req.headers.origin||!origins.has(req.headers.origin))return reply.code(403).send({error:'Origin denied'});}},(socket,req)=>{
  const client=weaponLab.connect({send:data=>{if(socket.readyState===1){if(socket.bufferedAmount>262144)socket.close(1008);else socket.send(data);}},close:code=>socket.close(code)},session=>testnet.auth.identify(session,req.headers.origin??''));
  socket.on('message',(raw,binary)=>{if(closing)return;if(binary){socket.close(1003);return;}void client.receive(raw.toString());});socket.on('close',client.close);socket.on('error',()=>{});
 });
 if(funded)fundedSurvivalRoutes(app,funded,origins,(session,origin)=>testnet.auth.identify(session,origin));
 else app.get('/survival/funded/config',async()=>({enabled:false,reason:fundedSetupReason}));
 app.get('/survival/config',async()=>survival.config());
 app.get('/survival',{websocket:true,preValidation:async(req,reply)=>{if(!req.headers.origin||!origins.has(req.headers.origin))return reply.code(403).send({error:'Origin denied'});}},(socket,req)=>{
  const client=survival.connect({send:data=>{if(socket.readyState===1){if(socket.bufferedAmount>262144)socket.close(1008);else socket.send(data);}},close:code=>socket.close(code)},token=>testnet.auth.identify(token,req.headers.origin??''));
  socket.on('message',(raw,binary)=>{if(closing)return;if(binary){socket.close(1003);return;}client.receive(raw.toString());});socket.on('close',client.close);socket.on('error',()=>{});
 });
 app.get('/health',async(_req,reply)=>{reply.header('Cache-Control','no-store');return {status:'ok',service:'LAST SIGNAL',version:'0.1.0',revision:config.revision,uptimeSeconds:Math.floor(process.uptime()),mode:'PRIVATE_UNFUNDED',multiplayer:true,publicOperation:config.publicOperation,public:false,rules:RULES.version,map:MAP.version,protocol:PROTOCOL,persistence:'SQLite',wallet:true,testnetConfigured:!!testnet.options};});
 app.get('/room',{websocket:true,preValidation:async(req,reply)=>{if(!req.headers.origin||!origins.has(req.headers.origin))return reply.code(403).send({error:'Origin denied'});}},(socket,req)=>{
  const client=rooms.connect({send:data=>{if(socket.readyState===1){if(socket.bufferedAmount>262144)socket.close(1008);else socket.send(data);}},close:code=>socket.close(code)},token=>testnet.auth.identify(token,req.headers.origin??''));
  socket.on('message',(raw,isBinary)=>{if(closing)return;if(isBinary){socket.close(1003);return;}client.receive(raw.toString());});socket.on('close',client.close);socket.on('error',()=>{});
  const expiry=setInterval(()=>{if(client.expired?.()){socket.close(1008);clearInterval(expiry);}},1000);socket.on('close',()=>clearInterval(expiry));
 });
 const journeyPoolTimer=options.manual||!journeyPoolWorker?null:setInterval(()=>void journeyPoolWorker.poll().catch(()=>{}),1500);
 const fundedTimer=options.manual||!funded?null:setInterval(()=>void funded.poll(),1000);
 const chainTimer=options.manual?null:setInterval(()=>{void testnet.poll();void armory.poll();},4000);
 const weaponTimer=options.manual?null:setInterval(()=>void weaponLab.poll(),2000);
 const timer=options.manual?null:setInterval(()=>{rooms.tick();armory.tick();survival.tick();weaponLab.tick();funded?.tick();journey?.tick();},1000/RULES.ticks);
 app.addHook('preClose',async()=>{if(journeyPoolTimer)clearInterval(journeyPoolTimer);journeyPoolWorker?.close();if(weaponTimer)clearInterval(weaponTimer);weaponLab.close();if(fundedTimer)clearInterval(fundedTimer);funded?.close();if(timer)clearInterval(timer);if(chainTimer)clearInterval(chainTimer);survival.close();armory.close();rooms.disconnectAll();});
 app.addHook('onClose',async()=>{journey?.close();testnet.close();configuredFunded?.close();rooms.close();});await app.ready();return {app,rooms,testnet,armory,weapons,weaponLab,survival,funded,journey};
}










