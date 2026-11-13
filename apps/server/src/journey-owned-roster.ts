import {getAddress,id} from 'ethers';
import {journeyAssetKey,type JourneyAsset} from '@last-signal/chain';
import type {SoldierCollections} from './journey-soldiers.ts';
import type {DeploymentRequest} from './journey-deployments.ts';
export type OwnedSoldierChoice={actorId:number;asset:Extract<JourneyAsset,{kind:'soldier'}>;leaseId:string};
/** Chain backed input to the upcoming owned roster rules. Does not admit a run by itself. */
export class JourneyOwnedRoster {
 constructor(private soldiers:SoldierCollections,private service:string){this.service=getAddress(service);}
 async prepare(runId:string,owner:string,choices:readonly OwnedSoldierChoice[]){
  owner=getAddress(owner);choices=structuredClone(choices);
  if(choices.length<1||choices.length>3||new Set(choices.map(choice=>choice.actorId)).size!==choices.length||new Set(choices.map(choice=>journeyAssetKey(choice.asset))).size!==choices.length||choices.some(choice=>!Number.isInteger(choice.actorId)||choice.actorId<1||choice.actorId>3))throw Error('One to three distinct owned members required');
  const members=await Promise.all(choices.map(async choice=>{
   const request:DeploymentRequest={asset:choice.asset,runId,owner,service:this.service,leaseId:choice.leaseId};
   await this.soldiers.verify(request);const token=await this.soldiers.owned(choice.asset,owner);const lease=await this.soldiers.verify(request);
   if(token.owner!==owner||!token.leaseActive)throw Error('Current owned soldier lease required');
   return {actorId:choice.actorId,key:journeyAssetKey(choice.asset),asset:choice.asset,classId:token.immutableBuild.classId,buildHash:token.immutableBuild.hash,progressNonce:token.progressNonce,lease};
  }));
  members.sort((a,b)=>a.actorId-b.actorId);
  const payload={version:'journey-owned-roster-1',runId,owner,service:this.service,rulesHash:this.soldiers.deployment.rulesHash,members};
  return Object.freeze({...payload,hash:id(JSON.stringify(payload))});
 }
}



