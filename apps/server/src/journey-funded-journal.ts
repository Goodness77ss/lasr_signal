import type {DatabaseSync} from 'node:sqlite';
import {id,getAddress} from 'ethers';
import type {JourneyRun} from '../../../packages/sim/src/journey/encounter.ts';
export class JourneyFundedJournal {
 constructor(private db:DatabaseSync){db.exec(`CREATE TABLE IF NOT EXISTS journey_funded_runs(run_id TEXT PRIMARY KEY,owner TEXT NOT NULL,deadline TEXT NOT NULL,reservation_hash TEXT NOT NULL,state TEXT NOT NULL);CREATE TABLE IF NOT EXISTS journey_funded_outbox(source TEXT PRIMARY KEY,run_id TEXT NOT NULL UNIQUE,payload TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'QUEUED',transaction_hash TEXT);CREATE TABLE IF NOT EXISTS journey_funded_intents(run_id TEXT PRIMARY KEY,owner TEXT NOT NULL,destination TEXT NOT NULL,state TEXT NOT NULL);CREATE UNIQUE INDEX IF NOT EXISTS journey_funded_owner_intent ON journey_funded_intents(owner) WHERE state IN ('PENDING','OPEN');`);}
 /** Called by the protected chain adapter after confirmed pool reservation. */
 attach(runId:string,owner:string,deadline:string,reservationHash:string){
  owner=getAddress(owner);if(!/^[1-9][0-9]*$/.test(deadline)||!/^0x[0-9a-fA-F]{64}$/.test(reservationHash))throw Error('Confirmed reservation identity required');
  const prior=this.db.prepare('SELECT * FROM journey_funded_runs WHERE run_id=?').get(runId);
  if(prior){if(prior.owner!==owner||prior.deadline!==deadline||prior.reservation_hash!==reservationHash)throw Error('Funded reservation changed');return;}
  this.db.prepare('INSERT INTO journey_funded_runs VALUES(?,?,?,?,?)').run(runId,owner,deadline,reservationHash,'ACTIVE');
 }
 forRun(runId:string){
  const reservation=this.db.prepare('SELECT state,deadline,reservation_hash FROM journey_funded_runs WHERE run_id=?').get(runId);if(!reservation)return null;
  const settlement=this.db.prepare('SELECT payload,state,transaction_hash FROM journey_funded_outbox WHERE run_id=?').get(runId),payout=settlement?String(JSON.parse(String(settlement.payload)).payout):'0';
  return {environment:'LOCAL_BLOCKCHAIN',cap:'15',deposit:'0',stake:'0',state:String(reservation.state),deadline:String(reservation.deadline),pendingPayout:settlement&&['QUEUED','BROADCASTING','SUBMITTED'].includes(String(settlement.state))?payout:'0',confirmedPayout:settlement?.state==='CONFIRMED'?payout:'0',transactionHash:settlement?.transaction_hash?String(settlement.transaction_hash):null};
 }
 terminal(runId:string,run:JourneyRun){
  if(!this.db.isTransaction)throw Error('Funded outcome requires gameplay writer transaction');
  const funded=this.db.prepare('SELECT * FROM journey_funded_runs WHERE run_id=?').get(runId);if(!funded||!['BANKED','DEAD','QUIT'].includes(run.state))return;
  const bank=run.state==='BANKED';if(bank&&(!run.checkpointComplete||!run.rewards||run.rewards.checkpointEarned<10))throw Error('Backed checkpoint required for funded bank');
  const payout=bank?10+Math.min(5,run.rewards!.bankedLoot):0;
  if(payout!==0&&payout!==10&&payout!==15)throw Error('Unsupported J13 bank amount');
  const source=id('journey-funded-terminal:'+runId),payload=JSON.stringify({runId,owner:String(funded.owner),bank,payout:String(BigInt(payout)*10n**18n),outcome:run.state,tick:run.tick,resultHash:id(JSON.stringify({runId,state:run.state,tick:run.tick,payout,rules:run.pin.hash}))});
  const prior=this.db.prepare('SELECT payload FROM journey_funded_outbox WHERE source=?').get(source);
  if(prior){if(prior.payload!==payload)throw Error('Funded terminal outcome changed');return;}
  this.db.prepare('INSERT INTO journey_funded_outbox(source,run_id,payload) VALUES(?,?,?)').run(source,runId,payload);this.db.prepare("UPDATE journey_funded_runs SET state='SETTLEMENT_PENDING' WHERE run_id=?").run(runId);
 }
}

