import { JOURNEY_COMBINED_STREAM_RULES,JOURNEY_RECOVERY_STREAM_RULES,JOURNEY_OWNED_STREAM_RULES,JOURNEY_SUPPLY_STREAM_RULES,JOURNEY_PROTOCOL,JOURNEY_STREAM_RULES,JOURNEY_ROSTER_STREAM_RULES,JOURNEY_REWARD_STREAM_RULES,JOURNEY_EQUIPMENT_STREAM_RULES } from '../../sim/src/journey/rules.ts';
import {parseEquipmentSelection,type EquipmentEntry} from '../../sim/src/journey/equipment.ts';
import { parseRosterSelection,type RosterSelection } from '../../sim/src/journey/roster.ts';
import { sectionOrdinal,GENERATOR_VERSION } from '../../sim/src/journey/generator.ts';
export const JOURNEY_CLIENT_BYTES=2048;
export const JOURNEY_COMBINED_CLIENT_BYTES=4096;
export const JOURNEY_SNAPSHOT_BYTES=65536;
export const JOURNEY_IDENTIFIERS={protocol:JOURNEY_PROTOCOL,rules:JOURNEY_STREAM_RULES.version,generator:GENERATOR_VERSION} as const;
export const JOURNEY_ROSTER_IDENTIFIERS={...JOURNEY_IDENTIFIERS,rules:JOURNEY_ROSTER_STREAM_RULES.version} as const;
export const JOURNEY_REWARD_IDENTIFIERS={...JOURNEY_IDENTIFIERS,rules:JOURNEY_REWARD_STREAM_RULES.version} as const;
export const JOURNEY_EQUIPMENT_IDENTIFIERS={...JOURNEY_IDENTIFIERS,rules:JOURNEY_EQUIPMENT_STREAM_RULES.version} as const;
export const JOURNEY_SUPPLY_IDENTIFIERS={...JOURNEY_IDENTIFIERS,rules:JOURNEY_SUPPLY_STREAM_RULES.version} as const;
export const JOURNEY_RECOVERY_IDENTIFIERS={...JOURNEY_IDENTIFIERS,rules:JOURNEY_RECOVERY_STREAM_RULES.version} as const;
export const JOURNEY_COMBINED_IDENTIFIERS={...JOURNEY_IDENTIFIERS,rules:JOURNEY_COMBINED_STREAM_RULES.version} as const;
export const JOURNEY_OWNED_IDENTIFIERS={...JOURNEY_IDENTIFIERS,rules:JOURNEY_OWNED_STREAM_RULES.version} as const;
export type OwnedRosterChoice={actorId:number;asset:{kind:'soldier';chainId:'31337';collection:string;tokenId:string};leaseId:string};
type Point={x:number;z:number};
export type JourneyAction={kind:'supply';itemClass:0|1|2|3;targetId:number;direction?:Point&{y:number}}|{kind:'pickup';dropId:string}|{kind:'ability';targetId?:number}|{kind:'pose';pose:'standing'|'crouched'}|{kind:'dodge'|'vault';direction:Point}|{kind:'move';target:Point}|{kind:'drive';direction:Point}|{kind:'fire'|'throw';direction:Point&{y:number}}|{kind:'jump'|'reload'|'continue'|'bank'|'quit'|'pause'|'resume'};
export type JourneyAdmission={run:string;credential:string};
export type JourneyClientMessage=({op:'start';roster:RosterSelection;ownedSoldiers:OwnedRosterChoice[];equipment?:EquipmentEntry[];funded?:true;session:string;admission:JourneyAdmission}&(typeof JOURNEY_OWNED_IDENTIFIERS|typeof JOURNEY_COMBINED_IDENTIFIERS))|({op:'resume';run:string;credential:string;session:string}&(typeof JOURNEY_OWNED_IDENTIFIERS|typeof JOURNEY_COMBINED_IDENTIFIERS))|((({op:'start'}&typeof JOURNEY_IDENTIFIERS)|({op:'start';roster:RosterSelection}&(typeof JOURNEY_ROSTER_IDENTIFIERS|typeof JOURNEY_REWARD_IDENTIFIERS))|({op:'start';roster:RosterSelection;equipment:EquipmentEntry[];session:string}&(typeof JOURNEY_EQUIPMENT_IDENTIFIERS|typeof JOURNEY_SUPPLY_IDENTIFIERS|typeof JOURNEY_RECOVERY_IDENTIFIERS)))&{admission?:JourneyAdmission})|({op:'resume';run:string;credential:string;session:string}&(typeof JOURNEY_EQUIPMENT_IDENTIFIERS|typeof JOURNEY_SUPPLY_IDENTIFIERS|typeof JOURNEY_RECOVERY_IDENTIFIERS))|({op:'resume';run:string;credential:string}&(typeof JOURNEY_IDENTIFIERS|typeof JOURNEY_ROSTER_IDENTIFIERS|typeof JOURNEY_REWARD_IDENTIFIERS))|{op:'ping'}|{op:'command';id:string;sequence:number;section:string;actorId:number;action:JourneyAction};
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const bounded=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const hex=(v:unknown,n:number)=>typeof v==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(v);
export function validJourneySection(value:unknown):value is string {
  if(typeof value!=='string')return false;
  const pieces=value.split(':');if(pieces.length!==3||pieces[0]!==GENERATOR_VERSION||!/^(0|[1-9][0-9]{0,9})$/.test(pieces[1])||Number(pieces[1])>0xffffffff)return false;
  try{sectionOrdinal(pieces[2]);return true;}catch{return false;}
}
export function parseJourneyClient(text:string):JourneyClientMessage {
  const bytes=new TextEncoder().encode(text).length;if(bytes>JOURNEY_COMBINED_CLIENT_BYTES)throw Error('Journey message too large');
  const m:unknown=JSON.parse(text);if(!record(m))throw Error('Invalid Journey message');
  if(bytes>JOURNEY_CLIENT_BYTES&&(m.op!=='start'||m.rules!==JOURNEY_COMBINED_IDENTIFIERS.rules))throw Error('Journey message too large');
  if(m.op==='ping'){if(!exact(m,['op']))throw Error('Unexpected fields');return m as JourneyClientMessage;}
  if(m.op==='start'||m.op==='resume'){
    const combined=m.rules===JOURNEY_COMBINED_IDENTIFIERS.rules,owned=combined||m.rules===JOURNEY_OWNED_IDENTIFIERS.rules;
    const equipped=m.rules===JOURNEY_RECOVERY_IDENTIFIERS.rules||m.rules===JOURNEY_EQUIPMENT_IDENTIFIERS.rules||m.rules===JOURNEY_SUPPLY_IDENTIFIERS.rules,rosterEntry=owned||equipped||m.rules===JOURNEY_ROSTER_IDENTIFIERS.rules||m.rules===JOURNEY_REWARD_IDENTIFIERS.rules;
    if(!exact(m,['op','protocol','rules','generator',...(m.op==='resume'?['run','credential']:rosterEntry?['roster']:[]),...(owned?['session',...(m.op==='start'?['ownedSoldiers',...(combined&&Object.hasOwn(m,'equipment')?['equipment']:[])]:[])]:equipped?['session',...(m.op==='start'?['equipment']:[])]:[]),...(m.op==='start'&&Object.hasOwn(m,'admission')?['admission']:[]),...(owned&&m.op==='start'&&Object.hasOwn(m,'funded')?['funded']:[])]))throw Error('Unexpected entry fields');
    if(m.op==='start'&&Object.hasOwn(m,'admission')&&(!record(m.admission)||!exact(m.admission,['run','credential'])||!hex(m.admission.run,32)||!hex(m.admission.credential,64)))throw Error('Invalid admission identity');
    if(m.protocol!==JOURNEY_IDENTIFIERS.protocol||!rosterEntry&&m.rules!==JOURNEY_IDENTIFIERS.rules||m.generator!==GENERATOR_VERSION)throw Error('Journey version mismatch');
    if(m.op==='start'&&rosterEntry)parseRosterSelection(m.roster);
    if(equipped){if(!hex(m.session,64))throw Error('Wallet session required');if(m.op==='start')parseEquipmentSelection(m.equipment);}
    if(combined&&m.op==='start'&&Object.hasOwn(m,'equipment'))parseEquipmentSelection(m.equipment);
    if(owned){
      if(Object.hasOwn(m,'funded')&&m.funded!==true)throw Error('Explicit funded entry required');
      if(!hex(m.session,64))throw Error('Owned roster wallet session required');
      if(m.op==='start'){
        if(!m.admission||!Array.isArray(m.ownedSoldiers)||m.ownedSoldiers.length<1||m.ownedSoldiers.length>3)throw Error('Exact leased run admission required');
        const actors=new Set<number>(),assets=new Set<string>(),selection=parseRosterSelection(m.roster);
        for(const choice of m.ownedSoldiers){
          if(!record(choice)||!exact(choice,['actorId','asset','leaseId'])||!Number.isInteger(choice.actorId)||!bounded(choice.actorId,1,3)||!record(choice.asset)||!exact(choice.asset,['kind','chainId','collection','tokenId']))throw Error('Invalid owned roster choice');
          const asset=choice.asset;
          if(asset.kind!=='soldier'||asset.chainId!=='31337'||typeof asset.collection!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(asset.collection)||typeof asset.tokenId!=='string'||!/^(0|[1-9][0-9]{0,77})$/.test(asset.tokenId)||typeof choice.leaseId!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(choice.leaseId)||/^0x0{64}$/.test(choice.leaseId))throw Error('Explicit owned token and lease required');
          const actorId=Number(choice.actorId),key='eip155:31337:'+asset.collection.toLowerCase()+':'+asset.tokenId;
          if(actors.has(actorId)||assets.has(key)||selection[actorId-1]?.id!==key)throw Error('Owned choices differ from roster slots');actors.add(actorId);assets.add(key);
        }
        if(selection.some((choice,index)=>choice?.id.startsWith('eip155:')&&!actors.has(index+1)))throw Error('Missing owned soldier lease');
      }
    }
    if(m.op==='resume'&&(!hex(m.run,32)||!hex(m.credential,64)))throw Error('Invalid resume identity');
    return m as JourneyClientMessage;
  }
  if(m.op!=='command'||!exact(m,['op','id','sequence','section','actorId','action'])||typeof m.id!=='string'||!/^[a-zA-Z0-9:_.-]{1,96}$/.test(m.id)||!Number.isSafeInteger(m.sequence)||!bounded(m.sequence,1,Number.MAX_SAFE_INTEGER)||!validJourneySection(m.section)||!Number.isSafeInteger(m.actorId)||!bounded(m.actorId,1,3)||!record(m.action))throw Error('Invalid Journey command');
  const a=m.action;
  if(a.kind==='supply'){
    if(!Number.isInteger(a.itemClass)||!bounded(a.itemClass,0,3)||!Number.isSafeInteger(a.targetId)||!bounded(a.targetId,1,3)||!exact(a,['kind','itemClass','targetId',...(a.itemClass===1?['direction']:[])]))throw Error('Invalid supply action');
    if(a.itemClass===1){if(!record(a.direction)||!exact(a.direction,['x','y','z'])||!['x','y','z'].every(k=>bounded((a.direction as Record<string,unknown>)[k],-1,1)))throw Error('Invalid supply throw');const d=a.direction as Record<string,number>,length=Math.hypot(d.x,d.y,d.z);if(length<.001||length>1.001)throw Error('Invalid supply direction');}
  }else if(a.kind==='pickup'){
    if(!exact(a,['kind','dropId'])||typeof a.dropId!=='string'||a.dropId.length>128||!/^journey-sections-1:\d+:\d+:enemy:[4-6]$/.test(a.dropId))throw Error('Invalid pickup source');
  }else if(a.kind==='ability'){
    if(!exact(a,['kind',...(Object.hasOwn(a,'targetId')?['targetId']:[])])||Object.hasOwn(a,'targetId')&&(!Number.isSafeInteger(a.targetId)||!bounded(a.targetId,1,3)))throw Error('Invalid class ability');
  }else if(a.kind==='move'){
    if(!exact(a,['kind','target'])||!record(a.target)||!exact(a.target,['x','z'])||!bounded(a.target.x,.35,71.65)||!bounded(a.target.z,.35,47.65))throw Error('Invalid local target');
  }else if(a.kind==='pose'){
    if(!exact(a,['kind','pose'])||!['standing','crouched'].includes(String(a.pose)))throw Error('Invalid pose');
  }else if(a.kind==='drive'||a.kind==='fire'||a.kind==='dodge'||a.kind==='vault'||a.kind==='throw'){
    const keys=a.kind==='fire'||a.kind==='throw'?['x','y','z']:['x','z'];
    if(!exact(a,['kind','direction'])||!record(a.direction)||!exact(a.direction,keys)||!keys.every(k=>bounded((a.direction as Record<string,unknown>)[k],-1,1)))throw Error('Invalid direction');
    const length=Math.hypot(...keys.map(k=>(a.direction as Record<string,number>)[k]));if(length>1.001||a.kind!=='drive'&&length<.001)throw Error('Direction must be normalized');
  }else if(!['jump','reload','continue','bank','quit','pause','resume'].includes(String(a.kind))||!exact(a,['kind']))throw Error('Unsupported Journey action');
  return m as JourneyClientMessage;
}




