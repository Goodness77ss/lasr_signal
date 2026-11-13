import {parseJourneyClient,validJourneySection,JOURNEY_SNAPSHOT_BYTES,JOURNEY_COMBINED_IDENTIFIERS,JOURNEY_RECOVERY_IDENTIFIERS,JOURNEY_EQUIPMENT_IDENTIFIERS,JOURNEY_SUPPLY_IDENTIFIERS,JOURNEY_OWNED_IDENTIFIERS,type JourneyAction,type JourneyClientMessage} from '../../../packages/protocol/src/journey.ts';
import {verifyJourneyPin} from '../../../packages/sim/src/journey/rules.ts';
import {verifyEquipmentSnapshot} from '../../../packages/sim/src/journey/equipment.ts';
import {verifyRosterSnapshot} from '../../../packages/sim/src/journey/roster.ts';
import type {journeyObservation,JourneyAcknowledgement} from '../../server/src/journey-boundary.ts';

export type JourneyPublicSnapshot=ReturnType<typeof journeyObservation>;
export type JourneySocket=Pick<WebSocket,'readyState'|'bufferedAmount'|'send'|'close'|'onopen'|'onmessage'|'onclose'|'onerror'>;
type Entry=Extract<JourneyClientMessage,{op:'start'|'resume'}>;
type PublicStart<T>=T extends {op:'start'}?Omit<T,'session'|'admission'>:never;
export type JourneyRecovery={run:string;credential:string;protocol:string;rules:string;generator:string;start?:PublicStart<Entry>};
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const hex=(value:unknown,length:number)=>typeof value==='string'&&new RegExp('^[a-f0-9]{'+length+'}$').test(value);
// Owns transport and command identity only. It never simulates a server run.
export class JourneyConnection {
 private quitWaiter:{id:string;resolve:()=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}|null=null;
 private socket:JourneySocket|null=null;private generation=0;private queue:Promise<void>=Promise.resolve();private entry:Entry|null=null;private replayOnResume=false;
 private saved:JourneyRecovery|null=null;private observation:JourneyPublicSnapshot|null=null;private sequence=0;private pausedValue=false;private pending:{message:Extract<JourneyClientMessage,{op:'command'}>;text:string;ack?:JourneyAcknowledgement}|null=null;
 state:'idle'|'connecting'|'ready'|'uncertain'|'closed'='idle';
 constructor(private url:string,private events:{snapshot:(snapshot:JourneyPublicSnapshot)=>void;ack?:(ack:JourneyAcknowledgement)=>void;status?:(state:JourneyConnection['state'],reason?:string)=>void;recovery?:(recovery:JourneyRecovery)=>void},private openSocket:(url:string)=>JourneySocket=url=>new WebSocket(url)){}
 get recovery(){return this.saved?structuredClone(this.saved):null;}
 get snapshot(){return this.observation?structuredClone(this.observation):null;}
 get awaitingAcknowledgement(){return this.pending!==null;}
 get paused(){return this.pausedValue;}
 private status(state:JourneyConnection['state'],reason?:string){this.state=state;if((state==='uncertain'||state==='closed')&&this.quitWaiter){const waiter=this.quitWaiter;this.quitWaiter=null;clearTimeout(waiter.timer);waiter.reject(Error('Quit is not confirmed. Reconnect to recover the durable run before leaving.'));}this.events.status?.(state,reason);}
 private saveRecovery(value:JourneyRecovery){this.saved=structuredClone(value);this.events.recovery?.(structuredClone(value));}
 private recoveryEntry(value:JourneyRecovery,walletSession?:string):Entry{
  if(value.start){
   if(value.start.protocol!==value.protocol||value.start.rules!==value.rules||value.start.generator!==value.generator||Object.hasOwn(value.start,'session')||Object.hasOwn(value.start,'admission'))throw Error('Invalid pending Journey admission');
   return parseJourneyClient(JSON.stringify({...value.start,admission:{run:value.run,credential:value.credential},...((value.rules===JOURNEY_COMBINED_IDENTIFIERS.rules||value.rules===JOURNEY_RECOVERY_IDENTIFIERS.rules||value.rules===JOURNEY_EQUIPMENT_IDENTIFIERS.rules||value.rules===JOURNEY_SUPPLY_IDENTIFIERS.rules||value.rules===JOURNEY_OWNED_IDENTIFIERS.rules)?{session:walletSession}:{})})) as Entry;
  }
  return parseJourneyClient(JSON.stringify({op:'resume',...value,...((value.rules===JOURNEY_COMBINED_IDENTIFIERS.rules||value.rules===JOURNEY_RECOVERY_IDENTIFIERS.rules||value.rules===JOURNEY_EQUIPMENT_IDENTIFIERS.rules||value.rules===JOURNEY_SUPPLY_IDENTIFIERS.rules||value.rules===JOURNEY_OWNED_IDENTIFIERS.rules)?{session:walletSession}:{})})) as Entry;
 }
 connect(value:Entry){
  if(this.socket||this.saved)throw Error('Resume the existing Journey instead of starting another');
  let entry=parseJourneyClient(JSON.stringify(value));if(entry.op!=='start'&&entry.op!=='resume')throw Error('Journey entry required');
  if(entry.op==='start'){
   const random=(size:number)=>Array.from(crypto.getRandomValues(new Uint8Array(size)),byte=>byte.toString(16).padStart(2,'0')).join(''),admission=entry.admission??{run:random(16),credential:random(32)},publicStart={...entry} as Record<string,unknown>;delete publicStart.session;delete publicStart.admission;
   entry=parseJourneyClient(JSON.stringify({...entry,admission})) as Entry;
   this.saveRecovery({...admission,protocol:entry.protocol,rules:entry.rules,generator:entry.generator,start:publicStart as PublicStart<Entry>});
  }else this.saveRecovery({run:entry.run,credential:entry.credential,protocol:entry.protocol,rules:entry.rules,generator:entry.generator});
  this.entry=entry;this.begin();
 }
 resume(value:JourneyRecovery,walletSession?:string){
  if(this.socket||this.saved)throw Error('A Journey is already attached');
  this.entry=this.recoveryEntry(value,walletSession);this.saveRecovery(value);this.begin();
 }
 reconnect(walletSession?:string){
  if(!this.saved)throw Error('No acknowledged Journey to resume');
  const entry=this.recoveryEntry(this.saved,walletSession);this.disconnect();this.entry=entry;this.begin();
 }
 private begin(){
  if(!this.entry)throw Error('Journey entry required');const generation=++this.generation,current=this.openSocket(this.url);this.socket=current;this.replayOnResume=this.pending!==null;if(this.pending)delete this.pending.ack;this.queue=Promise.resolve();this.status('connecting');
  current.onopen=()=>{if(this.socket===current)current.send(JSON.stringify(this.entry));};
  current.onmessage=event=>{if(this.socket!==current)return;const data=event.data;this.queue=this.queue.then(async()=>{if(this.generation!==generation)return;if(typeof data!=='string'||new TextEncoder().encode(data).length>JOURNEY_SNAPSHOT_BYTES+8192)throw Error('Invalid Journey service payload');await this.receive(JSON.parse(data),generation);}).catch(()=>{if(this.socket===current){this.disconnect();this.status('uncertain','Journey service response rejected. Reconnect before continuing.');}});};
  current.onclose=()=>{if(this.socket===current){this.generation++;this.socket=null;this.status('uncertain','Journey disconnected. Reconnect to recover its acknowledged state.');}};
  current.onerror=()=>{if(this.socket===current)this.status('uncertain','Journey connection unavailable');};
 }
 private async receive(value:unknown,generation:number){
  if(!record(value)||typeof value.op!=='string')throw Error('Invalid Journey service message');
  if(value.op==='pong')return;
  if(value.op==='error'){this.disconnect();this.status('uncertain','Journey command rejected. Reconnect before continuing.');return;}
  if(['session','resumed','snapshot'].includes(value.op)){
   if(!this.entry||value.protocol!==this.entry.protocol||value.rules!==this.entry.rules||value.generator!==this.entry.generator)throw Error('Journey service version mismatch');
  }
  if(value.op==='session'||value.op==='resumed'){
   if(!hex(value.run,32)||value.op==='session'&&!hex(value.credential,64)||value.op==='resumed'&&(!Number.isSafeInteger(value.lastSequence)||Number(value.lastSequence)<0))throw Error('Invalid Journey recovery identity');
   if(value.op==='session'){
    if(this.entry!.op!=='start'||this.saved&&(value.run!==this.saved.run||value.credential!==this.saved.credential))throw Error('Unexpected Journey admission');
    this.saveRecovery({run:String(value.run),credential:String(value.credential),protocol:this.entry!.protocol,rules:this.entry!.rules,generator:this.entry!.generator});this.sequence=0;this.pausedValue=false;
   }else{
    const identity=this.entry!.op==='resume'?this.entry!:this.entry!.op==='start'?this.entry!.admission:undefined;
    if(!identity||value.run!==identity.run)throw Error('Unexpected Journey resume');
    this.saveRecovery({run:identity.run,credential:identity.credential,protocol:this.entry!.protocol,rules:this.entry!.rules,generator:this.entry!.generator});
    this.sequence=Number(value.lastSequence);
    if(typeof value.paused!=='boolean')throw Error('Invalid Journey pause state');this.pausedValue=value.paused;
    if(this.pending&&(this.sequence>this.pending.message.sequence||this.sequence<this.pending.message.sequence-1))throw Error('Journey advanced on another connection');
   }
   return;
  }
  if(value.op==='ack'){
   if(!this.pending||value.id!==this.pending.message.id||value.sequence!==this.pending.message.sequence||typeof value.ok!=='boolean'||typeof value.reason!=='string'||!Number.isSafeInteger(value.tick)||!Number.isSafeInteger(value.order))throw Error('Unexpected Journey acknowledgement');
   this.pending.ack={op:'ack',id:value.id as string,sequence:Number(value.sequence),ok:value.ok,reason:value.reason,tick:Number(value.tick),order:Number(value.order)};return;
  }
  if(value.op!=='snapshot'||!this.saved||!record(value.observation))throw Error('Unexpected Journey service message');
  const observed=value.observation;
  if(!validJourneySection(observed.section)||!Number.isSafeInteger(observed.tick)||Number(observed.tick)<0||!record(observed.pin)||!record(observed.pin.rules)||observed.pin.rules.version!==this.entry!.rules||!Array.isArray(observed.actors)||observed.actors.length>6||!observed.actors.some(a=>record(a)&&a.id===1&&a.side===0&&a.role==='leader'))throw Error('Invalid Journey observation');
  for(const actor of observed.actors)if(!record(actor)||Object.hasOwn(actor,'awareness')||Object.hasOwn(actor,'tactics')||!['x','z','hp','ammo','reserve','facing','fireAt','reloadAt'].every(key=>typeof actor[key]==='number'&&Number.isFinite(actor[key])))throw Error('Invalid Journey public actor');
  const snapshot=observed as JourneyPublicSnapshot;
  if((this.entry!.rules===JOURNEY_OWNED_IDENTIFIERS.rules||this.entry!.rules===JOURNEY_COMBINED_IDENTIFIERS.rules)?typeof snapshot.ownedOwner!=='string'||!/^0x[0-9a-f]{40}$/.test(snapshot.ownedOwner)||!snapshot.roster:snapshot.ownedOwner!==undefined)throw Error('Invalid owned roster observation');
  if(this.observation&&snapshot.ownedOwner!==this.observation.ownedOwner)throw Error('Journey owned owner changed');
  if((this.entry!.rules===JOURNEY_RECOVERY_IDENTIFIERS.rules||this.entry!.rules===JOURNEY_EQUIPMENT_IDENTIFIERS.rules||this.entry!.rules===JOURNEY_SUPPLY_IDENTIFIERS.rules)&&(!snapshot.equipment||!snapshot.roster))throw Error('Missing Journey equipment snapshot');
  await verifyJourneyPin(snapshot.pin);if(snapshot.roster)await verifyRosterSnapshot(snapshot.roster);if(snapshot.equipment)await verifyEquipmentSnapshot(snapshot.equipment);
  if(this.generation!==generation)return;
  if(this.observation&&(snapshot.pin.hash!==this.observation.pin.hash||snapshot.roster?.hash!==this.observation.roster?.hash))throw Error('Journey pinned identity changed');
  if(this.observation){const before=this.observation.section.split(':'),after=snapshot.section.split(':');if(before[1]!==after[1]||BigInt(after[2])<BigInt(before[2]))throw Error('Journey section moved backwards');}
  if(this.observation?.section===snapshot.section&&snapshot.tick<this.observation.tick)throw Error('Journey snapshot moved backwards');
  if(this.observation?.equipment&&JSON.stringify(snapshot.equipment)!==JSON.stringify(this.observation.equipment))throw Error('Journey equipment changed');
  this.observation=structuredClone(snapshot);this.events.snapshot(structuredClone(snapshot));
  if(this.pending?.ack){const ack=this.pending.ack,kind=this.pending.message.action.kind;this.sequence=ack.sequence;if(ack.ok&&['pause','resume'].includes(kind))this.pausedValue=kind==='pause';this.pending=null;this.status('ready');this.events.ack?.({...ack});if(this.quitWaiter?.id===ack.id){const waiter=this.quitWaiter;this.quitWaiter=null;clearTimeout(waiter.timer);if(ack.ok&&snapshot.state==='QUIT')waiter.resolve();else waiter.reject(Error(ack.ok?'Quit acknowledgement did not include a terminal snapshot':ack.reason));}}
  else if(this.pending&&this.replayOnResume){this.replayOnResume=false;this.socket!.send(this.pending.text);this.status('ready');}
  else this.status('ready');
 }
 command(action:JourneyAction,id:string=crypto.randomUUID()){
  if(this.state!=='ready'||!this.socket||this.socket.readyState!==1||!this.observation||this.pending)throw Error('Journey is not ready for another command');
  if(this.socket.bufferedAmount>65536)throw Error('Journey connection is congested');
  const message=parseJourneyClient(JSON.stringify({op:'command',id,sequence:this.sequence+1,section:this.observation.section,actorId:1,action}));if(message.op!=='command')throw Error('Journey command required');
  const text=JSON.stringify(message);this.pending={message,text};this.socket.send(text);return message.id;
 }
 quitAndWait():Promise<void>{
  if(this.observation&&['BANKED','DEAD','QUIT'].includes(this.observation.state))return Promise.resolve();
  if(this.quitWaiter)return Promise.reject(Error('Quit confirmation is already pending'));
  return new Promise((resolve,reject)=>{const id=this.command({kind:'quit'}),timer=setTimeout(()=>{if(this.quitWaiter?.id===id){this.quitWaiter=null;reject(Error('Quit confirmation timed out. Stay here and reconnect; no terminal outcome is assumed.'));}},15000);this.quitWaiter={id,resolve,reject,timer};});
 }
 disconnect(){this.generation++;const current=this.socket;this.socket=null;current?.close();this.status('uncertain','Journey connection closed. Its recovery identity is retained.');}
 dispose(){this.disconnect();this.pending=null;this.saved=null;this.observation=null;this.entry=null;this.status('closed');}
}



