import type {JourneyOwnedRoster} from './journey-owned-roster.ts';
import {ownedRosterEntry} from '../../../packages/sim/src/journey/roster.ts';
import {supplyEffect,type SupplyUse} from '../../../packages/sim/src/journey/supplies.ts';
import type {SupplyReceiptVerifier} from './journey-supplies.ts';
import { journeyPose,journeyDodge,journeyThrow,journeyJump,journeyVault,journeyAbility,journeyPickup } from '../../../packages/sim/src/journey/encounter.ts';
import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { createJourney,validateJourneyResume,journeyLeader,journeyMove,journeyDrive,journeyFire,journeyReload,journeyContinue,journeyBank,journeyQuit,journeyStep,journeyActive,type JourneyRun } from '../../../packages/sim/src/journey/encounter.ts';
import type { JourneyClientMessage } from '../../../packages/protocol/src/journey.ts';
import { JOURNEY_COMBINED_IDENTIFIERS,JOURNEY_RECOVERY_IDENTIFIERS,JOURNEY_OWNED_IDENTIFIERS,JOURNEY_SUPPLY_IDENTIFIERS,JOURNEY_IDENTIFIERS,JOURNEY_ROSTER_IDENTIFIERS,JOURNEY_REWARD_IDENTIFIERS,JOURNEY_EQUIPMENT_IDENTIFIERS } from '../../../packages/protocol/src/journey.ts';
import {parseEquipmentSelection} from '../../../packages/sim/src/journey/equipment.ts';
import type {EquipmentOwnershipVerifier} from './journey-equipment.ts';
import {progressEntries} from './journey-progress.ts';
import { PRACTICE_ROSTER,resolveRoster,type RosterCatalogueEntry } from '../../../packages/sim/src/journey/roster.ts';
import { JourneyStore } from './journey-store.ts';
import { JourneyCommandBoundary,journeyObservation,type JourneyAcknowledgement } from './journey-boundary.ts';
import type { JourneyTransportService } from './journey-routes.ts';
import type { DeploymentVerifier } from './journey-deployments.ts';
export class JourneyService implements JourneyTransportService {
  readonly store:JourneyStore;
  private boundary=new JourneyCommandBoundary();
  private active=new Map<string,{credential:string;peers:Set<Parameters<JourneyTransportService['connect']>[0]>}>();
  private checkingDeployments=new Set<string>();
  constructor(db:DatabaseSync,private options:{fundedReservation?:(runId:string,owner:string)=>Promise<void>;ownedRoster?:JourneyOwnedRoster;catalogue?:()=>readonly RosterCatalogueEntry[];deploymentVerifier?:DeploymentVerifier;equipmentVerifier?:EquipmentOwnershipVerifier;supplyVerifier?:SupplyReceiptVerifier}={}){this.store=new JourneyStore(db,options.deploymentVerifier,options.equipmentVerifier,options.supplyVerifier);}
  rosterCatalogue(){return (this.options.catalogue?.()??PRACTICE_ROSTER).map(({id,revision,name,classId,source,weapon,availability})=>({id,revision,name,classId,source,weapon,availability}));}
  private identifiers(run:JourneyRun){return run.pin.rules.combinedLoadout?JOURNEY_COMBINED_IDENTIFIERS:run.pin.rules.battlefieldRecovery?JOURNEY_RECOVERY_IDENTIFIERS:run.pin.rules.ownedRoster?JOURNEY_OWNED_IDENTIFIERS:run.pin.rules.supplies?JOURNEY_SUPPLY_IDENTIFIERS:run.pin.rules.equipment?JOURNEY_EQUIPMENT_IDENTIFIERS:run.pin.rules.rewards?JOURNEY_REWARD_IDENTIFIERS:run.pin.rules.roster?JOURNEY_ROSTER_IDENTIFIERS:JOURNEY_IDENTIFIERS;}
  private async authorize(id:string,run:JourneyRun){const funding=this.store.db.prepare('SELECT owner FROM journey_funded_runs WHERE run_id=?').get(id);if(funding&&['ACTIVE','CHECKPOINT_REACHED'].includes(run.state)){if(!this.options.fundedReservation)throw Error('Funded service unavailable');await this.options.fundedReservation(id,String(funding.owner));}await this.store.deployments.authorizeRun(id);await this.store.equipment.authorize(id,run);}
  close(){for(const entry of this.active.values())for(const peer of entry.peers)peer.close(1001);this.active.clear();}
  tick():void|Promise<void> {
    const pending:Promise<void>[]=[];
    for(const [id,entry] of this.active){
      if(this.store.deployments.forRun(id).length||this.store.db.prepare('SELECT 1 FROM journey_equipment_runs WHERE run_id=?').get(id)){
        try{const saved=this.store.load(id,entry.credential);if(saved.paused||!journeyActive(saved.run))continue;}catch{this.advance(id,entry);continue;}
        if(this.checkingDeployments.has(id))continue;
        this.checkingDeployments.add(id);
        pending.push(this.authorize(id,this.store.load(id,entry.credential).run).then(()=>{
          if(this.active.get(id)===entry)this.advance(id,entry);
        }).catch(()=>{if(this.active.get(id)===entry){for(const peer of entry.peers)peer.close(1011);this.active.delete(id);}}).finally(()=>this.checkingDeployments.delete(id)));
        continue;
      }
      this.advance(id,entry);
    }
    if(pending.length)return Promise.all(pending).then(()=>{});
  }
  private advance(id:string,entry:{credential:string;peers:Set<Parameters<JourneyTransportService['connect']>[0]>}){
      try{
        const saved=this.store.load(id,entry.credential);if(saved.paused||!journeyActive(saved.run))return;
        journeyStep(saved.run);this.store.saveTick(id,saved.revision,saved.run);
        for(const peer of entry.peers)peer.send({op:'snapshot',...this.identifiers(saved.run),observation:{...journeyObservation(saved.run),progress:this.store.progress.forRun(id),rewardLedger:this.store.rewards.forRun(id)}});
      }catch{for(const peer of entry.peers)peer.close(1011);this.active.delete(id);}
  }
  connect(transport:Parameters<JourneyTransportService['connect']>[0]){
    let session:{id:string;credential:string}|null=null,closed=false;
    const attach=()=>{if(!session)return;let entry=this.active.get(session.id);if(!entry){entry={credential:session.credential,peers:new Set()};this.active.set(session.id,entry);}entry.peers.add(transport);};
    const snapshot=(run:JourneyRun)=>transport.send({op:'snapshot',...this.identifiers(run),observation:{...journeyObservation(run),funded:session?this.store.funded.forRun(session.id):null,progress:session?this.store.progress.forRun(session.id):null,rewardLedger:session?this.store.rewards.forRun(session.id):null}});
    return {
      receive:async(message:JourneyClientMessage)=>{
        if(closed)return;
        if(message.op==='ping'){transport.send({op:'pong'});return;}
        if(message.op==='start'){
          if(session)throw Error('Already in a Journey run');
          if('ownedSoldiers' in message){
            const verifier=this.options.ownedRoster,owner=transport.identify?.(message.session)?.toLowerCase();
            if(!verifier||!owner)throw Error('Authenticated owned roster service required');
            const proposed=message.admission,intent={protocol:message.protocol,rules:message.rules,generator:message.generator,owner,roster:message.roster,ownedSoldiers:message.ownedSoldiers,funded:message.funded===true,...(message.rules===JOURNEY_COMBINED_IDENTIFIERS.rules?{equipment:message.equipment?parseEquipmentSelection(message.equipment):null}:{})};
            const recoverOwned=async()=>{
              const saved=this.store.recoverAdmission(proposed.run,proposed.credential,intent);if(!saved)return false;
              await validateJourneyResume(saved.run);
              if(saved.run.ownedOwner!==owner||transport.identify?.(message.session)?.toLowerCase()!==owner)throw Error('Owned roster owner changed');
              if(journeyActive(saved.run))await this.authorize(proposed.run,saved.run);
              if(closed)return true;session={id:proposed.run,credential:proposed.credential};attach();transport.send({op:'resumed',...this.identifiers(saved.run),run:session.id,lastSequence:saved.lastSequence,paused:saved.paused});snapshot(saved.run);return true;
            };
            if(await recoverOwned())return;
            const proof=await verifier.prepare(proposed.run,owner,message.ownedSoldiers),catalogue=[...this.rosterCatalogue(),...proof.members.map(member=>ownedRosterEntry(member.key,member.classId,1))];
            if(message.funded){if(!this.options.fundedReservation)throw Error('Funded entry unavailable. Choose practice.');await this.options.fundedReservation(proposed.run,owner);}else if(this.store.db.prepare('SELECT 1 FROM journey_funded_runs WHERE run_id=?').get(proposed.run)||this.store.db.prepare("SELECT 1 FROM journey_funded_intents WHERE run_id=? AND state<>'CANCELLED'").get(proposed.run))throw Error('This run already has funded backing; recover its funded entry');
            const run=await createJourney({combined:message.rules===JOURNEY_COMBINED_IDENTIFIERS.rules,...(message.equipment?{equipment:{owner,entries:parseEquipmentSelection(message.equipment)}}:{}),streamed:true,ownedOwner:owner,seed:randomBytes(4).readUInt32LE(),roster:message.roster,catalogue});
            if(closed)return;if(transport.identify?.(message.session)?.toLowerCase()!==owner)throw Error('Owned roster owner changed');
            if(await recoverOwned())return;
            try{await this.store.createOwned(proposed.run,proposed.credential,run,message.ownedSoldiers,verifier,intent,()=>!closed&&transport.identify?.(message.session)?.toLowerCase()===owner);}catch(error){if(await recoverOwned())return;throw error;}
            if(closed)return;session={id:proposed.run,credential:proposed.credential};attach();transport.send({op:'session',...this.identifiers(run),run:session.id,credential:session.credential});snapshot(run);return;
          }
          if(message.rules===JOURNEY_SUPPLY_IDENTIFIERS.rules&&!this.store.supplies)throw Error('Supply service unavailable');
          const selection='roster' in message?message.roster:undefined;
          const owner='equipment' in message?transport.identify?.(message.session):undefined;
          if('equipment' in message&&!owner)throw Error('Authenticated equipment owner required');
          const admission=message.admission,intent=admission?{protocol:message.protocol,rules:message.rules,generator:message.generator,owner:owner?.toLowerCase()??null,roster:selection??null,equipment:'equipment' in message?parseEquipmentSelection(message.equipment):null}:undefined;
          const recover=async()=>{
            if(!admission)return false;const saved=this.store.recoverAdmission(admission.run,admission.credential,intent);if(!saved)return false;
            await validateJourneyResume(saved.run);if(journeyActive(saved.run))await this.authorize(admission.run,saved.run);
            if('equipment' in message&&transport.identify?.(message.session)?.toLowerCase()!==saved.run.equipment?.owner)throw Error('Authenticated equipment owner changed');
            if(closed)return true;session={id:admission.run,credential:admission.credential};attach();transport.send({op:'resumed',...this.identifiers(saved.run),run:session.id,lastSequence:saved.lastSequence,paused:saved.paused});snapshot(saved.run);return true;
          };
          if(await recover())return;
          const run=await createJourney({recovery:message.rules===JOURNEY_RECOVERY_IDENTIFIERS.rules,supplies:message.rules===JOURNEY_SUPPLY_IDENTIFIERS.rules,streamed:true,seed:randomBytes(4).readUInt32LE(),...(selection?{roster:selection,catalogue:this.rosterCatalogue(),rewards:message.rules===JOURNEY_REWARD_IDENTIFIERS.rules}:{}),...('equipment' in message?{equipment:{owner:owner!,entries:parseEquipmentSelection(message.equipment)}}:{})});
          const proof=run.equipment?await this.store.equipment.prepare(run.equipment):undefined;
          if(closed)return;
          // Recheck after both asynchronous hashes, immediately before admission.
          if(selection&&JSON.stringify(resolveRoster(selection,this.rosterCatalogue()))!==JSON.stringify(run.roster!.members))throw Error('Roster changed before admission');
          if('equipment' in message&&transport.identify?.(message.session)?.toLowerCase()!==run.equipment!.owner)throw Error('Authenticated equipment owner changed');
          if(await recover())return;if(closed)return;
          const admitted={id:admission?.run??randomBytes(16).toString('hex'),credential:admission?.credential??randomBytes(32).toString('hex')};
          try{this.store.create(admitted.id,admitted.credential,run,run.equipment?{accountId:'eip155:31337:'+run.equipment.owner,entries:progressEntries(admitted.id,run)}:undefined,proof,intent);}catch(error){if(await recover())return;throw error;}
          session=admitted;
          attach();
          transport.send({op:'session',...this.identifiers(run),run:session.id,credential:session.credential});snapshot(run);return;
        }
        if(message.op==='resume'){
          if(session)throw Error('Already in a Journey run');
          const saved=this.store.load(message.run,message.credential);await validateJourneyResume(saved.run);
          if(saved.run.ownedOwner&&(!('session' in message)||transport.identify?.(message.session)?.toLowerCase()!==saved.run.ownedOwner))throw Error('Authenticated owned roster owner required');
          if(saved.run.equipment&&(!('session' in message)||transport.identify?.(message.session)?.toLowerCase()!==saved.run.equipment.owner))throw Error('Authenticated equipment owner required');
          if(journeyActive(saved.run))await this.authorize(message.run,saved.run);
          if(message.rules!==this.identifiers(saved.run).rules)throw Error('Journey resume rules mismatch');
          if(closed)return;session={id:message.run,credential:message.credential};attach();transport.send({op:'resumed',...this.identifiers(saved.run),run:session.id,lastSequence:saved.lastSequence,paused:saved.paused});snapshot(saved.run);return;
        }
        if(!session)throw Error('Journey session required');
        if(!this.boundary.allow(session.id,'run'))throw Error('Run command rate exceeded');
        let saved=this.store.load(session.id,session.credential);const replay=this.store.replay(session.id,message);
        if(replay){transport.send(replay);snapshot(saved.run);return;}
        if(!['quit','pause'].includes(message.action.kind))await this.authorize(session.id,saved.run);
        if(closed)return;
        saved=this.store.load(session.id,session.credential);
        this.boundary.validate(message,{authenticatedRun:session.id,runId:session.id,section:saved.run.section,leaderId:journeyLeader(saved.run).id,lastSequence:saved.lastSequence});
        let run=structuredClone(saved.run);const action=message.action;let supply:SupplyUse|undefined;let ok=false,reason='Action unavailable';
        let paused=saved.paused;
        if(paused&&!['resume','quit','pause'].includes(action.kind))throw Error('Journey is paused');
        switch(action.kind){
          case 'supply':{
            if(!this.store.supplies||!(run.ownedOwner??run.equipment?.owner)||!run.pin.rules.supplies)throw Error('Owned supplies unavailable');
            const owner=(run.ownedOwner??run.equipment?.owner)!;await this.store.supplies.reconcile(owner);
            if(this.store.supplies.frozen(owner)||this.store.supplies.balance(owner,action.itemClass)<1n)throw Error('Owned supply stock unavailable');
            const use:SupplyUse={itemClass:action.itemClass,actorId:action.targetId,...(action.direction?{direction:action.direction}:{})},candidate=supplyEffect(run,use);
            if(candidate){run=candidate;supply=use;ok=true;}break;
          }
          case 'pickup':ok=journeyPickup(run,action.dropId);break;
          case 'ability':ok=journeyAbility(run,action.targetId);break;
          case 'jump':ok=journeyJump(run);break;
          case 'vault':ok=journeyVault(run,action.direction);break;
          case 'throw':ok=journeyThrow(run,action.direction);break;
          case 'pose':ok=journeyPose(run,action.pose);break;
          case 'dodge':ok=journeyDodge(run,action.direction);break;
          case 'move':ok=journeyMove(run,action.target);break;
          case 'drive':journeyDrive(run,action.direction);ok=run.state==='ACTIVE'||run.state==='CHECKPOINT_REACHED';break;
          case 'fire':ok=journeyFire(run,journeyLeader(run),action.direction);break;
          case 'reload':ok=journeyReload(run);break;
          case 'continue':{if(this.store.db.prepare('SELECT 1 FROM journey_funded_runs WHERE run_id=?').get(session.id))throw Error('Bank this funded segment before starting a new run');const result=journeyContinue(run);ok=result.ok;reason=result.reason;break;}
          case 'bank':ok=journeyBank(run);break;
          case 'quit':ok=run.state==='ACTIVE'||run.state==='CHECKPOINT_REACHED';journeyQuit(run);break;
          case 'pause':paused=true;run.drive={x:0,z:0};run.driveUntil=0;ok=true;break;
          case 'resume':paused=false;ok=true;break;
        }
        if(ok)reason='Accepted';
        const ack:JourneyAcknowledgement={op:'ack',id:message.id,ok,reason,sequence:message.sequence,order:saved.revision+1,tick:run.tick};
        this.store.commit(session.id,saved.revision,message,run,ack,paused,supply);
        if(!closed){transport.send(ack);snapshot(run);}
      },
      close:()=>{closed=true;if(session){const entry=this.active.get(session.id);entry?.peers.delete(transport);if(entry?.peers.size===0)this.active.delete(session.id);this.boundary.release(session.id);}},
    };
  }
}







