import { distance,type Point } from '../rules.ts';
import { generateSection,MAX_SECTION_ORDINAL,sectionOrdinal,type JourneySection } from './generator.ts';

export type JourneyStream = { seed:number; ordinal:string; completedThrough:string|null };
export type PortalActor = Point & { id:number; hp:number };
export class JourneyWindow {
  private sections=new Map<string,JourneySection>();
  constructor(readonly state:JourneyStream){
    const ordinal=sectionOrdinal(state.ordinal);
    if(state.completedThrough!==(ordinal===0n?null:String(ordinal-1n)))throw Error('Inconsistent Journey stream progress');
    this.refresh();
  }
  current():JourneySection {return this.sections.get(this.state.ordinal)!;}
  entries():readonly JourneySection[] {return [...this.sections.values()];}
  refresh():void {
    const ordinal=sectionOrdinal(this.state.ordinal),wanted=[ordinal-1n,ordinal,ordinal+1n].filter(n=>n>=0n&&n<=MAX_SECTION_ORDINAL).map(String);
    for(const key of this.sections.keys())if(!wanted.includes(key))this.sections.delete(key);
    for(const key of wanted)if(!this.sections.has(key))this.sections.set(key,generateSection(this.state.seed,key));
  }
  // Only an already completed encounter and the whole surviving roster may cross.
  transition(sectionId:string,completed:boolean,leader:PortalActor,roster:readonly PortalActor[],healthLimit:(actor:PortalActor)=>number=()=>100):{ok:boolean;reason:string;placements?:{id:number;point:Point}[]} {
    const current=this.current(),ordinal=sectionOrdinal(this.state.ordinal);
    const finite=(a:PortalActor)=>{const limit=healthLimit(a);return Number.isSafeInteger(a.id)&&a.id>0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=120&&[a.x,a.z,a.hp].every(Number.isFinite)&&a.hp>=0&&a.hp<=limit;};
    if(!finite(leader)||roster.length<1||roster.length>3||!roster.every(finite)||new Set(roster.map(a=>a.id)).size!==roster.length||!roster.some(a=>a.id===leader.id&&a.x===leader.x&&a.z===leader.z&&a.hp===leader.hp))return {ok:false,reason:'Invalid deployed roster'};
    if(sectionId!==current.id)return {ok:false,reason:'Retired section'};
    if(!completed||leader.hp<=0||distance(leader,current.checkpoint)>3)return {ok:false,reason:'Complete this checkpoint alive first'};
    if(roster.some(a=>a.hp>0&&distance(a,leader)>8))return {ok:false,reason:'Wait for surviving helpers to regroup'};
    if(ordinal===MAX_SECTION_ORDINAL)return {ok:false,reason:'Prototype route representation limit reached'};
    this.state.completedThrough=this.state.ordinal;this.state.ordinal=String(ordinal+1n);this.refresh();
    const spawn=this.current().spawn;
    return {ok:true,reason:'Section crossed',placements:roster.map((a,i)=>({id:a.id,point:{x:spawn.x-(i?2:0),z:spawn.z+(i===1?-2:i===2?2:0)}}))};
  }
}
