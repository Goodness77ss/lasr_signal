import {JourneyFundedJournal} from './journey-funded-journal.ts';
import {JourneyRecoveryJournal} from './journey-recovery.ts';
import type {JourneyOwnedRoster,OwnedSoldierChoice} from './journey-owned-roster.ts';
import type {DeploymentAdmission} from './journey-deployments.ts';
import {progressEntries} from './journey-progress.ts';
import {JourneyProgressOutbox} from './journey-progress-outbox.ts';
import {JourneySupplyJournal,type SupplyReceiptVerifier} from './journey-supplies.ts';
import {supplyEffect,type SupplyUse} from '../../../packages/sim/src/journey/supplies.ts';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { validateJourneyState,type JourneyRun } from '../../../packages/sim/src/journey/encounter.ts';
import type { JourneyCommandMessage,JourneyAcknowledgement } from './journey-boundary.ts';
import { JourneyProgressJournal,type ProgressEntry } from './journey-progress.ts';
import { JourneyRewardJournal } from './journey-rewards.ts';
import { JourneyDeploymentJournal,type DeploymentVerifier } from './journey-deployments.ts';
import { JourneyEquipmentJournal,type EquipmentOwnershipVerifier,type EquipmentAdmission } from './journey-equipment.ts';
function canonical(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
  return JSON.stringify(value);
}
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
type OwnedAdmission={deployment:DeploymentAdmission};
export class JourneyStore {
  private ownedAdmissions=new WeakSet<OwnedAdmission>();
  readonly progress:JourneyProgressJournal;
  readonly funded:JourneyFundedJournal;
  readonly recovery:JourneyRecoveryJournal;
  readonly progressOutbox:JourneyProgressOutbox;
  readonly rewards:JourneyRewardJournal;
  readonly deployments:JourneyDeploymentJournal;
  readonly equipment:JourneyEquipmentJournal;
  readonly supplies?:JourneySupplyJournal;
  constructor(readonly db:DatabaseSync,deploymentVerifier?:DeploymentVerifier,equipmentVerifier?:EquipmentOwnershipVerifier,supplyVerifier?:SupplyReceiptVerifier){
    db.exec(`CREATE TABLE IF NOT EXISTS journey_migrations(version INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS journey_runs(id TEXT PRIMARY KEY, credential_hash TEXT NOT NULL, snapshot TEXT NOT NULL, snapshot_hash TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, last_sequence INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS journey_commands(run_id TEXT NOT NULL, command_id TEXT NOT NULL, fingerprint TEXT NOT NULL, acknowledgement TEXT NOT NULL, PRIMARY KEY(run_id,command_id));
      INSERT OR IGNORE INTO journey_migrations(version) VALUES(1);`);
    const columns=db.prepare('PRAGMA table_info(journey_runs)').all();
    if(!columns.some(c=>c.name==='paused'))db.exec('ALTER TABLE journey_runs ADD COLUMN paused INTEGER NOT NULL DEFAULT 0');
    db.exec('CREATE TABLE IF NOT EXISTS journey_events(run_id TEXT NOT NULL, sequence INTEGER NOT NULL, event TEXT NOT NULL, PRIMARY KEY(run_id,sequence)); INSERT OR IGNORE INTO journey_migrations(version) VALUES(2);');
    db.exec('CREATE TABLE IF NOT EXISTS journey_checkpoints(run_id TEXT NOT NULL, source TEXT NOT NULL, event_sequence INTEGER NOT NULL, PRIMARY KEY(run_id,source)); INSERT OR IGNORE INTO journey_migrations(version) VALUES(3);');
    this.progress=new JourneyProgressJournal(db);
    this.funded=new JourneyFundedJournal(db);
    this.recovery=new JourneyRecoveryJournal(db);
    this.rewards=new JourneyRewardJournal(db);
    this.deployments=new JourneyDeploymentJournal(db,deploymentVerifier);
    this.progressOutbox=new JourneyProgressOutbox(db,this.deployments);
    this.equipment=new JourneyEquipmentJournal(db,equipmentVerifier);
    if(supplyVerifier)this.supplies=new JourneySupplyJournal(db,supplyVerifier);
    db.exec('CREATE TABLE IF NOT EXISTS journey_admissions(run_id TEXT PRIMARY KEY,intent_hash TEXT NOT NULL); INSERT OR IGNORE INTO journey_migrations(version) VALUES(8);');
    db.exec('INSERT OR IGNORE INTO journey_migrations(version) VALUES(9);');
  }
  create(id:string,credential:string,run:JourneyRun,progress?:{accountId:string;entries:ProgressEntry[]},equipment?:EquipmentAdmission,admissionIntent?:unknown,owned?:OwnedAdmission):void {
    if(run.ownedOwner? !owned||!this.ownedAdmissions.has(owned):!!owned)throw Error('Verified owned roster store admission required');
    validateJourneyState(run);const snapshot=JSON.stringify(run);this.db.exec('BEGIN IMMEDIATE');
    try{
      const fundedIntent=this.db.prepare('SELECT owner,state FROM journey_funded_intents WHERE run_id=?').get(id),funded=this.db.prepare('SELECT owner FROM journey_funded_runs WHERE run_id=?').get(id);
      if(fundedIntent?.state==='CANCELLED'&&(!run.ownedOwner||String(fundedIntent.owner).toLowerCase()!==run.ownedOwner))throw Error('Cancelled allocation identity remains bound to its original owner');
      if(fundedIntent&&fundedIntent.state!=='CANCELLED'&&(!funded||!run.ownedOwner||String(funded.owner).toLowerCase()!==run.ownedOwner))throw Error('Confirmed owned funded admission required for this reserved identity');
      this.db.prepare('INSERT INTO journey_runs(id,credential_hash,snapshot,snapshot_hash) VALUES(?,?,?,?)').run(id,digest(credential),snapshot,digest(snapshot));
      if(admissionIntent!==undefined)this.db.prepare('INSERT INTO journey_admissions VALUES(?,?)').run(id,digest(canonical(admissionIntent)));
      if(owned){this.ownedAdmissions.delete(owned);this.deployments.enter(owned.deployment);}
      this.equipment.enter(id,run,equipment);this.progress.enter(id,run,progress?.accountId,progress?.entries);this.rewards.enter(id,run);this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  async createOwned(id:string,credential:string,run:JourneyRun,choices:readonly OwnedSoldierChoice[],verifier:JourneyOwnedRoster,admissionIntent?:unknown,authorize?:()=>boolean){
    run=structuredClone(run);choices=structuredClone(choices);
    if(!run.ownedOwner||!run.pin.rules.ownedRoster)throw Error('Owned rules and owner required');
    const prepared=await verifier.prepare(id,run.ownedOwner,choices),members=run.roster!.members.filter(member=>member.source==='soldier-token');
    if(prepared.rulesHash.toLowerCase()!=='0x'+run.pin.hash)throw Error('Soldier collection rules differ from owned run');
    if(members.length!==prepared.members.length||members.some(member=>!prepared.members.some(proof=>proof.actorId===member.actorId&&proof.key===member.id&&proof.classId===member.classId)))throw Error('Owned roster differs from verified token classes');
    const deployment=await this.deployments.prepareAdmission(prepared.members.map(member=>member.lease)),proof={deployment};
    const equipment=run.equipment?await this.equipment.prepare(run.equipment):undefined;
    if(authorize&&!authorize())throw Error('Owned admission authentication changed');
    this.ownedAdmissions.add(proof);
    this.create(id,credential,run,{accountId:'eip155:31337:'+run.ownedOwner,entries:progressEntries(id,run)},equipment,admissionIntent,proof);
  }
  recoverAdmission(id:string,credential:string,intent:unknown){
    const row=this.db.prepare('SELECT intent_hash FROM journey_admissions WHERE run_id=?').get(id);
    if(!row){if(this.db.prepare('SELECT 1 FROM journey_runs WHERE id=?').get(id))throw Error('Journey admission identity denied');return null;}
    if(row.intent_hash!==digest(canonical(intent)))throw Error('Journey admission intent changed');return this.load(id,credential);
  }
  load(id:string,credential:string):{run:JourneyRun;revision:number;lastSequence:number;paused:boolean} {
    const row=this.db.prepare('SELECT * FROM journey_runs WHERE id=? AND credential_hash=?').get(id,digest(credential));
    if(!row)throw Error('Journey identity denied');
    if(typeof row.snapshot!=='string'||digest(row.snapshot)!==row.snapshot_hash)throw Error('Corrupted Journey snapshot');
    const run=JSON.parse(row.snapshot) as JourneyRun;validateJourneyState(run);
    this.equipment.check(id,run);
    return {run,revision:Number(row.revision),lastSequence:Number(row.last_sequence),paused:row.paused===1};
  }
  replay(id:string,message:JourneyCommandMessage):JourneyAcknowledgement|null {
    const row=this.db.prepare('SELECT fingerprint,acknowledgement FROM journey_commands WHERE run_id=? AND command_id=?').get(id,message.id);
    if(!row)return null;
    if(row.fingerprint!==digest(canonical(message)))throw Error('Command ID reused with different payload');
    return JSON.parse(String(row.acknowledgement)) as JourneyAcknowledgement;
  }
  commit(id:string,expectedRevision:number,message:JourneyCommandMessage,run:JourneyRun,ack:JourneyAcknowledgement,paused=false,supply?:SupplyUse):void {
    const snapshot=JSON.stringify(run);
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const before=this.previous(id);
      if(supply){
        if(!this.supplies||!(before.ownedOwner??before.equipment?.owner)||!before.pin.rules.supplies||!ack.ok)throw Error('Authenticated supply commit required');
        const expected=supplyEffect(before,supply);
        if(!expected||canonical(expected)!==canonical(run))throw Error('Supply gameplay effect mismatch');
        this.supplies.consume((before.ownedOwner??before.equipment?.owner)!,supply.itemClass,id,message.id,digest(canonical({message,supply})));
      }
      const result=this.db.prepare('UPDATE journey_runs SET snapshot=?,snapshot_hash=?,revision=revision+1,last_sequence=?,paused=? WHERE id=? AND revision=? AND last_sequence<?').run(snapshot,digest(snapshot),message.sequence,paused?1:0,id,expectedRevision,message.sequence);
      if(result.changes!==1)throw Error('Stale Journey revision or sequence');
      this.db.prepare('INSERT INTO journey_commands(run_id,command_id,fingerprint,acknowledgement) VALUES(?,?,?,?)').run(id,message.id,digest(canonical(message)),JSON.stringify(ack));
      this.events(id,run);
      this.progress.advance(id,before,run,false);
      this.equipment.advance(id,before,run);
      this.rewards.advance(id,before,run);this.funded.terminal(id,run);
      if(before.state!=='BANKED'&&run.state==='BANKED'){this.progressOutbox.stage(id);this.recovery.stage(id,run);}
      this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  private events(id:string,run:JourneyRun){for(const event of run.events){
    if(event.kind==='checkpoint'&&event.source){
      const prior=this.db.prepare('SELECT event_sequence FROM journey_checkpoints WHERE run_id=? AND source=?').get(id,event.source);
      if(prior&&prior.event_sequence!==event.seq)throw Error('Duplicate Journey checkpoint source');
      this.db.prepare('INSERT OR IGNORE INTO journey_checkpoints(run_id,source,event_sequence) VALUES(?,?,?)').run(id,event.source,event.seq);
    }
    this.db.prepare('INSERT OR IGNORE INTO journey_events(run_id,sequence,event) VALUES(?,?,?)').run(id,event.seq,JSON.stringify(event));
  }}
  saveTick(id:string,revision:number,run:JourneyRun):void {
    const snapshot=JSON.stringify(run);this.db.exec('BEGIN IMMEDIATE');
    try{
      const before=this.previous(id);
      if(this.db.prepare('UPDATE journey_runs SET snapshot=?,snapshot_hash=?,revision=revision+1 WHERE id=? AND revision=?').run(snapshot,digest(snapshot),id,revision).changes!==1)throw Error('Stale Journey tick revision');
      this.events(id,run);this.equipment.advance(id,before,run);this.progress.advance(id,before,run,true);this.rewards.advance(id,before,run);this.funded.terminal(id,run);this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  private previous(id:string):JourneyRun {
    const row=this.db.prepare('SELECT snapshot,snapshot_hash FROM journey_runs WHERE id=?').get(id);
    if(!row||typeof row.snapshot!=='string'||digest(row.snapshot)!==row.snapshot_hash)throw Error('Corrupted Journey snapshot');
    return JSON.parse(row.snapshot) as JourneyRun;
  }
}










