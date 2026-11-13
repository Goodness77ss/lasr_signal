import type {DatabaseSync} from 'node:sqlite';
import {verifyEquipmentSnapshot,type EquipmentSnapshot,type EquipmentEntry} from '../../../packages/sim/src/journey/equipment.ts';
import {journeyActive,type JourneyRun} from '../../../packages/sim/src/journey/encounter.ts';
export interface EquipmentOwnershipVerifier {owned(asset:EquipmentEntry['asset'],owner:string,buildHash:string,assetNonce:string):Promise<{assetNonce:string;immutableBuild:{hash:string;build:{id:string}}}>}
export type EquipmentAdmission=Readonly<{snapshot:string}>;
const key=(entry:EquipmentEntry)=>'eip155:'+entry.asset.chainId+':'+entry.asset.collection+':'+entry.asset.tokenId;
export class JourneyEquipmentJournal {
 private proofs=new WeakSet<EquipmentAdmission>();
 constructor(private db:DatabaseSync,private verifier?:EquipmentOwnershipVerifier){db.exec(`
  CREATE TABLE IF NOT EXISTS journey_equipment_runs(run_id TEXT PRIMARY KEY,snapshot TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS journey_equipment_current(asset_key TEXT PRIMARY KEY,run_id TEXT NOT NULL,asset_nonce TEXT NOT NULL);
  INSERT OR IGNORE INTO journey_migrations(version) VALUES(7);`);}
 private async verify(snapshot:EquipmentSnapshot){
  if(!this.verifier)throw Error('Verified Journey gun adapter required');
  await Promise.all(snapshot.entries.map(async entry=>{const owned=await this.verifier!.owned(entry.asset,snapshot.owner,entry.buildHash,entry.assetNonce);if(owned.assetNonce!==entry.assetNonce||owned.immutableBuild.hash.toLowerCase()!==entry.buildHash||owned.immutableBuild.build.id!==entry.buildId)throw Error('Equipment ownership or build changed');}));
 }
 async prepare(snapshot:EquipmentSnapshot):Promise<EquipmentAdmission>{
  const pinned=structuredClone(snapshot);await verifyEquipmentSnapshot(pinned);await this.verify(pinned);const proof=Object.freeze({snapshot:JSON.stringify(pinned)});this.proofs.add(proof);return proof;
 }
 // Only called inside the same writer transaction as run and XP entry creation.
 enter(runId:string,run:JourneyRun,proof?:EquipmentAdmission){
  if(!run.equipment){if(proof)throw Error('Unexpected equipment admission');return;}
  if(!proof||!this.proofs.has(proof)||proof.snapshot!==JSON.stringify(run.equipment))throw Error('Fresh verified equipment admission required');this.proofs.delete(proof);
  for(const entry of run.equipment.entries){
   const prior=this.db.prepare('SELECT run_id,asset_nonce FROM journey_equipment_current WHERE asset_key=?').get(key(entry));
   if(prior){
    if(BigInt(entry.assetNonce)<=BigInt(String(prior.asset_nonce)))throw Error('Gun is equipped in another active Journey');
    // A confirmed greater transfer or listing nonce invalidates the old run,
    // including an external transfer away and back between ownership polls.
    this.db.prepare('UPDATE journey_equipment_runs SET revoked=1 WHERE run_id=?').run(String(prior.run_id));this.db.prepare('DELETE FROM journey_equipment_current WHERE run_id=?').run(String(prior.run_id));
   }
  }
  this.db.prepare('INSERT INTO journey_equipment_runs(run_id,snapshot) VALUES(?,?)').run(runId,proof.snapshot);
  for(const entry of run.equipment.entries)this.db.prepare('INSERT INTO journey_equipment_current VALUES(?,?,?)').run(key(entry),runId,entry.assetNonce);
 }
 check(runId:string,run:JourneyRun){
  const row=this.db.prepare('SELECT * FROM journey_equipment_runs WHERE run_id=?').get(runId);
  if(run.equipment?row?.snapshot!==JSON.stringify(run.equipment):row!==undefined)throw Error('Journey equipment entry changed');return row;
 }
 async authorize(runId:string,run:JourneyRun){
  const row=this.check(runId,run);if(!run.equipment)return;if(row?.revoked)throw Error('Journey equipment access revoked');await this.verify(run.equipment);if(this.check(runId,run)?.revoked)throw Error('Journey equipment access revoked');
 }
 advance(runId:string,before:JourneyRun,after:JourneyRun){
  this.check(runId,before);const row=this.check(runId,after);if(row?.revoked&&journeyActive(after))throw Error('Journey equipment access revoked');
  if(after.equipment&&!journeyActive(after))this.db.prepare('DELETE FROM journey_equipment_current WHERE run_id=?').run(runId);
 }
}
