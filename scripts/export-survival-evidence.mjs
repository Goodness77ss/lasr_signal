// Export a deliberately limited practice report. Never export auth tokens, token hashes or wallet sessions.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const db=new DatabaseSync('.runtime/rooms.sqlite',{readOnly:true});
try{
 const requested=process.argv[2],out=process.argv[3];
 if(!out)throw Error('Usage: node scripts/export-survival-evidence.mjs <run-id|latest> <output.json>');
 const row=requested==='latest'?db.prepare('SELECT * FROM survival_practice_runs ORDER BY rowid DESC LIMIT 1').get():db.prepare('SELECT * FROM survival_practice_runs WHERE id=?').get(requested);
 if(!row)throw Error('Practice run unavailable');
 const s=JSON.parse(row.state);
 if(createHash('sha256').update(row.state).digest('hex')!==row.digest||!s.economy||!s.rewards)throw Error('Unreconciled practice checkpoint');
 const rewards=db.prepare('SELECT payload FROM survival_station_rewards WHERE run=? ORDER BY at,cycle,station,kind').all(row.id).map(r=>JSON.parse(r.payload));
 const sum=rewards.reduce((n,r)=>n+r.amountWhole,0),e=s.economy;
 if(sum!==s.rewards.events.reduce((n,r)=>n+r.amountWhole,0))throw Error('Reward journal mismatch');
 const available=e.depositWhole+sum+e.bonusWhole-e.spentWhole-e.failedWhole-e.lockedWhole;
 if(available<0)throw Error('Negative practice availability');
 const orders=db.prepare('SELECT asset,item,quoted,charged,applied,reason,tick FROM survival_supply_orders WHERE run=? ORDER BY rowid').all(row.id);
 if(orders.filter(o=>o.asset==='RUN_TWIF').reduce((n,o)=>n+Number(o.charged),0)!==e.spentWhole||orders.some(o=>!o.applied&&o.charged!==0))throw Error('Supply journal mismatch');
 if(orders.filter(o=>o.asset==='FIELD_CREDITS').reduce((n,o)=>n+Number(o.charged),0)!==s.rules.economy.fieldCredits-s.field.credits)throw Error('Field journal mismatch');
 const missions=db.prepare('SELECT state,stage,amount,failed,stake FROM survival_mission_reservations WHERE run=?').all(row.id);
 if(missions.filter(m=>m.state==='EARNED').reduce((n,m)=>n+Number(m.amount),0)!==e.bonusWhole||missions.reduce((n,m)=>n+Number(m.failed),0)!==e.failedWhole||missions.filter(m=>m.stage==='ACTIVE').reduce((n,m)=>n+Number(m.stake),0)!==e.lockedWhole)throw Error('Mission journal mismatch');
 const report={checkedAt:new Date().toISOString(),mode:'SERVER_PRACTICE_V2',automatedCombat:process.env.EVIDENCE_AUTOMATED_COMBAT==='true',run:row.id,rulesVersion:s.rules.version,rulesHash:s.rulesHash,activeSeconds:s.game.tick/s.rules.ticksPerSecond,result:s.game.result,accounting:{asset:'RUN_TWIF',mode:'SIMULATED_ONLY',deposit:e.depositWhole,station:sum,bonus:e.bonusWhole,spent:e.spentWhole,failed:e.failedWhole,locked:e.lockedWhole,available,walletClaim:null},fieldCredits:s.field?.credits??null,rewards,orders,mission:s.mission?{current:s.mission.current,history:s.mission.history}:null,lifecycle:s.lifecycle??null,chain:{funded:false,settlementWorker:false,transactionHash:null,nftMinted:false}};
 writeFileSync(out,JSON.stringify(report,null,2));console.log('Wrote reconciled practice evidence to '+out);
}finally{db.close();}
