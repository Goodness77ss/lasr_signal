import { SOLDIER_CLASS_IDS,soldierClass,type SoldierClassId } from './classes.ts';
import type { JourneyWeaponId } from './weapons.ts';

export const ROSTER_RULES=Object.freeze({version:'journey-roster-1',catalogueVersion:'journey-practice-roster-1',maxActive:3,minimumActive:1,loadout:'signature'} as const);
export type RosterCatalogueEntry=Readonly<{id:string;revision:number;name:string;classId:'starter-rifle'|SoldierClassId;source:'free-starter'|'local-development'|'soldier-token';weapon:JourneyWeaponId;availability:'available'|'disabled'|'sold'}>;
export const PRACTICE_ROSTER:readonly RosterCatalogueEntry[]=Object.freeze([
  ...[1,2,3].map(i=>Object.freeze({id:'starter:'+i,revision:1,name:'Free Rifle '+i,classId:'starter-rifle' as const,source:'free-starter' as const,weapon:'service-rifle' as const,availability:'available' as const})),
  ...SOLDIER_CLASS_IDS.map(id=>{const p=soldierClass(id);return Object.freeze({id:'development:'+id,revision:1,name:p.name+' / '+p.role,classId:id,source:'local-development' as const,weapon:p.weapon,availability:'available' as const});}),
]);
export function ownedRosterEntry(id:string,classId:SoldierClassId,revision:number):RosterCatalogueEntry {
 if(!/^eip155:31337:0x[0-9a-f]{40}:(0|[1-9][0-9]*)$/.test(id)||!Number.isSafeInteger(revision)||revision<1||revision>1_000_000)throw Error('Canonical owned soldier identity required');
 const profile=soldierClass(classId);
 return Object.freeze({id,revision,name:profile.name+' / '+profile.role,classId,source:'soldier-token',weapon:profile.weapon,availability:'available'});
}
function canonicalMember(value:{id:unknown;source:unknown;classId:unknown;revision:unknown}){
 const existing=PRACTICE_ROSTER.find(entry=>entry.id===value.id);if(existing)return existing;
 if(value.source!=='soldier-token'||typeof value.id!=='string'||typeof value.classId!=='string'||!SOLDIER_CLASS_IDS.includes(value.classId as SoldierClassId)||typeof value.revision!=='number')return undefined;
 return ownedRosterEntry(value.id,value.classId as SoldierClassId,value.revision);
}
export type RosterChoice={id:string;revision:number;loadout:'signature'};
export type RosterSelection=readonly (RosterChoice|null)[];
export type RosterMember={actorId:number;id:string;revision:number;classId:'starter-rifle'|SoldierClassId;source:'free-starter'|'local-development'|'soldier-token';weapon:JourneyWeaponId;loadout:'signature'};
export type RosterSnapshot={version:typeof ROSTER_RULES.version;catalogueVersion:typeof ROSTER_RULES.catalogueVersion;members:readonly RosterMember[];hash:string};
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value:Record<string,unknown>,keys:readonly string[])=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const revision=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0&&value<=1_000_000;

export function parseRosterSelection(value:unknown):RosterSelection {
  if(!Array.isArray(value)||value.length!==3)throw Error('Choose a leader and up to two helpers.');
  if(value[0]===null)throw Error('Choose a leader before deployment.');
  const ids=new Set<string>();
  for(const choice of value){
    if(choice===null)continue;
    if(!record(choice)||!exact(choice,['id','revision','loadout'])||typeof choice.id!=='string'||choice.id.length>128||!revision(choice.revision)||choice.loadout!=='signature')throw Error('Choose supported signature equipment.');
    if(ids.has(choice.id))throw Error('That soldier is selected more than once.');ids.add(choice.id);
  }
  return value as RosterSelection;
}

export function resolveRoster(selection:unknown,catalogue:readonly RosterCatalogueEntry[]=PRACTICE_ROSTER):RosterMember[] {
  const choices=parseRosterSelection(selection);
  if(new Set(catalogue.map(entry=>entry.id)).size!==catalogue.length)throw Error('Roster catalogue contains duplicate identities.');
  return choices.flatMap((choice,index)=>{
    if(!choice)return [];
    const entry=catalogue.find(e=>e.id===choice.id),canonical=entry?canonicalMember(entry):undefined;
    if(!entry||!canonical||entry.availability!=='available')throw Error('The selected soldier is unavailable. Choose another.');
    if(entry.revision!==choice.revision)throw Error('The roster changed. Refresh the selection before deployment.');
    if(entry.classId!==canonical.classId||entry.source!==canonical.source||entry.weapon!==canonical.weapon)throw Error('Unsupported roster class or equipment.');
    return [{actorId:index+1,id:entry.id,revision:entry.revision,classId:entry.classId,source:entry.source,weapon:entry.weapon,loadout:'signature' as const}];
  });
}

function payload(snapshot:Omit<RosterSnapshot,'hash'>):string {
  return JSON.stringify({version:snapshot.version,catalogueVersion:snapshot.catalogueVersion,members:snapshot.members.map(m=>({actorId:m.actorId,id:m.id,revision:m.revision,classId:m.classId,source:m.source,weapon:m.weapon,loadout:m.loadout}))});
}
async function digest(value:string):Promise<string>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function pinRoster(members:readonly RosterMember[]):Promise<RosterSnapshot>{
  const snapshot={version:ROSTER_RULES.version,catalogueVersion:ROSTER_RULES.catalogueVersion,members:members.map(member=>({...member}))};
  const result={...snapshot,hash:await digest(payload(snapshot))};validateRosterSnapshot(result);
  return Object.freeze({...result,members:Object.freeze(result.members.map(m=>Object.freeze(m)))});
}
export function validateRosterSnapshot(value:unknown):asserts value is RosterSnapshot {
  if(!record(value)||!exact(value,['version','catalogueVersion','members','hash'])||value.version!==ROSTER_RULES.version||value.catalogueVersion!==ROSTER_RULES.catalogueVersion||typeof value.hash!=='string'||!/^[a-f0-9]{64}$/.test(value.hash)||!Array.isArray(value.members)||value.members.length<1||value.members.length>3)throw Error('Invalid Journey roster snapshot');
  let previous=0;const identities=new Set<string>();
  for(const member of value.members){
    if(!record(member)||!exact(member,['actorId','id','revision','classId','source','weapon','loadout'])||!Number.isSafeInteger(member.actorId)||Number(member.actorId)<=previous||Number(member.actorId)>3||typeof member.id!=='string'||identities.has(member.id)||!revision(member.revision)||member.loadout!=='signature')throw Error('Invalid Journey roster member');
    const canonical=canonicalMember(member as {id:unknown;source:unknown;classId:unknown;revision:unknown});
    if(!canonical||member.classId!==canonical.classId||member.source!==canonical.source||member.weapon!==canonical.weapon)throw Error('Unsupported Journey roster member');
    previous=Number(member.actorId);identities.add(member.id);
  }
  if(value.members[0].actorId!==1)throw Error('Journey roster needs a leader');
}
export async function verifyRosterSnapshot(value:RosterSnapshot):Promise<void>{validateRosterSnapshot(value);if(value.hash!==await digest(payload(value)))throw Error('Journey loadout hash mismatch');}
export function defaultRosterSelection():RosterSelection{return PRACTICE_ROSTER.slice(0,3).map(entry=>({id:entry.id,revision:entry.revision,loadout:'signature'}));}

