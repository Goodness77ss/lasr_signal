import type {DatabaseSync} from 'node:sqlite';
import {getAddress,ZeroAddress,ZeroHash} from 'ethers';
import {journeyAsset,journeyAssetKey,assetInteger,type JourneyAsset} from '@last-signal/chain';

export type DeploymentRequest={asset:Extract<JourneyAsset,{kind:'soldier'}>;runId:string;owner:string;service:string;leaseId:string};
export type DeploymentEvidence=DeploymentRequest&{expiresAt:string;chainTimestamp:string;blockNumber:string;blockHash:string};
export type DeploymentEndEvidence=DeploymentRequest&{chainTimestamp:string;blockNumber:string;blockHash:string;reason:'RELEASED'|'EXPIRED'|'REVOKED'};
// This is a trusted server adapter boundary, never a browser supplied receipt.
// Its implementation must verify owner consent and the current chain lease.
export interface DeploymentVerifier {verify(request:DeploymentRequest):Promise<DeploymentEvidence>;verifyClosed?(request:DeploymentRequest):Promise<DeploymentEndEvidence>}
export type DeploymentReservation=DeploymentEvidence&{key:string;state:'ACTIVE'|'RELEASED'|'EXPIRED'|'REVOKED'};
const hash=(value:unknown):string=>{
  if(typeof value!=='string'||!/^0x[\da-fA-F]{64}$/.test(value)||value.toLowerCase()===ZeroHash)throw Error('Nonzero deployment hash required');return value.toLowerCase();
};
function request(value:DeploymentRequest):DeploymentRequest {
  const asset=journeyAsset(value.asset);if(asset.kind!=='soldier')throw Error('Soldier deployment required');
  if(typeof value.runId!=='string'||!/^[-a-zA-Z0-9:_]{1,128}$/.test(value.runId))throw Error('Exact run identity required');
  const owner=getAddress(value.owner),service=getAddress(value.service);if(owner===ZeroAddress||service===ZeroAddress)throw Error('Nonzero deployment parties required');
  return {asset,runId:value.runId,owner,service,leaseId:hash(value.leaseId)};
}
function evidence(value:DeploymentEvidence):DeploymentEvidence {
  const normalized={...request(value),expiresAt:assetInteger(value.expiresAt,true),chainTimestamp:assetInteger(value.chainTimestamp),blockNumber:assetInteger(value.blockNumber),blockHash:hash(value.blockHash)};
  if(BigInt(normalized.expiresAt)<=BigInt(normalized.chainTimestamp))throw Error('Deployment lease has expired');return normalized;
}
function same(a:DeploymentRequest,b:DeploymentRequest){return journeyAssetKey(a.asset)===journeyAssetKey(b.asset)&&a.owner===b.owner&&a.service===b.service&&a.runId===b.runId&&a.leaseId===b.leaseId;}

/** Durable local uniqueness only. Admission remains disabled without a real
 * chain verifier. Expiry uses verified chain time, never the browser clock. */
export type DeploymentAdmission=Readonly<{records:string}>;
export class JourneyDeploymentJournal {
  private admissions=new WeakSet<DeploymentAdmission>();
  constructor(private db:DatabaseSync,private verifier?:DeploymentVerifier){
    db.exec(`CREATE TABLE IF NOT EXISTS journey_deployment_leases(
      asset_key TEXT NOT NULL,lease_id TEXT NOT NULL,run_id TEXT NOT NULL,
      record TEXT NOT NULL,PRIMARY KEY(asset_key,lease_id));
      CREATE TABLE IF NOT EXISTS journey_deployment_current(
      asset_key TEXT PRIMARY KEY,lease_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS journey_migrations(version INTEGER PRIMARY KEY);
      INSERT OR IGNORE INTO journey_migrations(version) VALUES(6);`);
  }
  current(asset:JourneyAsset):DeploymentReservation|null {
    const row=this.db.prepare('SELECT l.record FROM journey_deployment_current c JOIN journey_deployment_leases l ON l.asset_key=c.asset_key AND l.lease_id=c.lease_id WHERE c.asset_key=?').get(journeyAssetKey(asset));
    return row?JSON.parse(String(row.record)) as DeploymentReservation:null;
  }
  history(asset:JourneyAsset):DeploymentReservation[]{return this.db.prepare('SELECT record FROM journey_deployment_leases WHERE asset_key=? ORDER BY rowid').all(journeyAssetKey(asset)).map(row=>JSON.parse(String(row.record)) as DeploymentReservation);}
  forRun(runId:string):DeploymentReservation[]{return this.db.prepare('SELECT record FROM journey_deployment_leases WHERE run_id=? ORDER BY rowid').all(runId).map(row=>JSON.parse(String(row.record)) as DeploymentReservation);}
  async authorizeRun(runId:string):Promise<void>{
    const rows=this.forRun(runId);await Promise.all(rows.map(row=>this.authorize(row)));
  }
  async authorize(value:DeploymentRequest):Promise<DeploymentReservation>{
    if(!this.verifier)throw Error('Verified chain deployment adapter required');
    const expected=request(value),proof=evidence(await this.verifier.verify(structuredClone(expected))),prior=this.current(expected.asset);
    if(!same(expected,proof)||!prior||prior.state!=='ACTIVE'||!same(prior,proof)||prior.expiresAt!==proof.expiresAt)throw Error('Current reserved deployment required');
    this.observation(prior,proof);return {...prior,chainTimestamp:proof.chainTimestamp,blockNumber:proof.blockNumber,blockHash:proof.blockHash};
  }
  async close(value:DeploymentRequest):Promise<DeploymentReservation>{
    if(!this.verifier?.verifyClosed)throw Error('Verified chain release adapter required');
    const expected=request(value),raw=await this.verifier.verifyClosed(structuredClone(expected));
    const proof:DeploymentEndEvidence={...request(raw),chainTimestamp:assetInteger(raw.chainTimestamp),blockNumber:assetInteger(raw.blockNumber),blockHash:hash(raw.blockHash),reason:raw.reason};
    if(!same(expected,proof)||!['RELEASED','EXPIRED','REVOKED'].includes(proof.reason))throw Error('Deployment release evidence mismatch');
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const prior=this.history(expected.asset).find(row=>row.leaseId===expected.leaseId);
      if(!prior||!same(prior,expected))throw Error('Unknown deployment lease');
      this.observation(prior,proof);
      if(proof.reason==='EXPIRED'&&BigInt(proof.chainTimestamp)<BigInt(prior.expiresAt))throw Error('Premature deployment expiry');
      const closed:DeploymentReservation=prior.state==='ACTIVE'?{...prior,state:BigInt(proof.chainTimestamp)>=BigInt(prior.expiresAt)?'EXPIRED':proof.reason,chainTimestamp:proof.chainTimestamp,blockNumber:proof.blockNumber,blockHash:proof.blockHash}:prior;
      this.save(closed);this.db.exec('COMMIT');return closed;
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  async prepareAdmission(values:readonly DeploymentRequest[]):Promise<DeploymentAdmission> {
    if(!this.verifier)throw Error('Verified chain deployment adapter required');
    if(values.length<1||values.length>3)throw Error('One to three deployment members required');
    const requests=values.map(request),keys=requests.map(value=>journeyAssetKey(value.asset));
    if(new Set(keys).size!==keys.length||requests.some(value=>value.runId!==requests[0].runId||value.owner!==requests[0].owner||value.service!==requests[0].service))throw Error('One owner and run with distinct soldiers required');
    const proofs=await Promise.all(requests.map(async value=>{
      const proof=evidence(await this.verifier!.verify(structuredClone(value)));
      if(!same(value,proof))throw Error('Deployment evidence mismatch');return proof;
    }));
    const admission=Object.freeze({records:JSON.stringify(proofs)});this.admissions.add(admission);return admission;
  }
  enter(admission:DeploymentAdmission):DeploymentReservation[]{
    if(!this.db.isTransaction||!this.admissions.has(admission))throw Error('Fresh deployment admission in writer transaction required');
    this.admissions.delete(admission);
    const proofs=JSON.parse(admission.records) as DeploymentEvidence[],requests=proofs,keys=proofs.map(proof=>journeyAssetKey(proof.asset));
      const runRows=this.forRun(requests[0].runId);
      if(new Set([...runRows.map(row=>row.key),...keys]).size>3||runRows.some(row=>row.owner!==requests[0].owner||row.service!==requests[0].service))throw Error('Run deployment roster cannot change owner or exceed three soldiers');
      const reservations=proofs.map(proof=>{
        const key=journeyAssetKey(proof.asset),prior=this.current(proof.asset);
        if(prior){
          this.observation(prior,proof);
          if(prior.state==='ACTIVE'&&BigInt(prior.expiresAt)>BigInt(proof.chainTimestamp)){
            if(!same(prior,proof)||prior.expiresAt!==proof.expiresAt)throw Error('Soldier already reserved for another deployment');
            return prior;
          }
          if(prior.state==='ACTIVE')this.save({...prior,state:'EXPIRED'});
        }
        if(this.db.prepare('SELECT 1 FROM journey_deployment_leases WHERE asset_key=? AND lease_id=?').get(key,proof.leaseId))throw Error('Deployment lease cannot be replayed');
        const reservation:DeploymentReservation={...proof,key,state:'ACTIVE'};
        this.db.prepare('INSERT INTO journey_deployment_leases(asset_key,lease_id,run_id,record) VALUES(?,?,?,?)').run(key,proof.leaseId,proof.runId,JSON.stringify(reservation));
        this.db.prepare('INSERT INTO journey_deployment_current(asset_key,lease_id) VALUES(?,?) ON CONFLICT(asset_key) DO UPDATE SET lease_id=excluded.lease_id').run(key,proof.leaseId);
        return reservation;
      });
    return reservations;
  }
  async reserve(values:readonly DeploymentRequest[]):Promise<DeploymentReservation[]>{
    const admission=await this.prepareAdmission(values);this.db.exec('BEGIN IMMEDIATE');
    try{const result=this.enter(admission);this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;}
  }  private observation(prior:DeploymentEvidence,proof:Pick<DeploymentEvidence,'blockNumber'|'blockHash'|'chainTimestamp'>){
    if(BigInt(proof.blockNumber)<BigInt(prior.blockNumber)||BigInt(proof.chainTimestamp)<BigInt(prior.chainTimestamp))throw Error('Stale deployment chain observation');
    if(proof.blockNumber===prior.blockNumber&&proof.blockHash!==prior.blockHash)throw Error('Deployment observation changed block hash');
  }
  private save(value:DeploymentReservation){this.db.prepare('UPDATE journey_deployment_leases SET record=? WHERE asset_key=? AND lease_id=?').run(JSON.stringify(value),value.key,value.leaseId);}
}

