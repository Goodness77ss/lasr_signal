import type {DatabaseSync} from 'node:sqlite';
import type {SurvivalRules} from '@last-signal/sim';
import type {Mission,MissionState} from '../../../packages/sim/src/missions.ts';
import type {RunEconomy} from '../../../packages/sim/src/run-economy.ts';
import type {StationRewardStore} from './station-reward-store.ts';
export class MissionReservations{
 constructor(private db:DatabaseSync,private rewards:StationRewardStore,private now:()=>number=Date.now){}
 hooks(run:string,scope:string,rules:SurvivalRules){return {
  reserve:(m:Mission)=>{
   const rows=this.db.prepare("SELECT cycle,SUM(amount) AS amount FROM survival_mission_reservations WHERE run=? AND state IN('RESERVED','EARNED') GROUP BY cycle").all(run);
   const total=rows.reduce((n,r)=>n+Number(r.amount),0),cycle=Number(rows.find(r=>Number(r.cycle)===m.cycle)?.amount??0);
   if(this.rewards.remaining(scope,rules)<m.bonus||cycle+m.bonus>rules.economy.segmentBonusReserve||total+m.bonus>rules.economy.runBonusCap)return false;
   this.db.prepare('INSERT INTO survival_mission_reservations VALUES(?,?,?,?,?,?,?,?,?,?)').run(run,m.id,scope,m.cycle,m.bonus,Math.floor(this.now()/1000),'RESERVED','OFFER',0,0);return true;
  },
  update:(m:Mission)=>{
   this.rewards.remaining(scope,rules);
   const row=this.db.prepare('SELECT state,stage FROM survival_mission_reservations WHERE run=? AND id=? AND scope=?').get(run,m.id,scope);
   if(!row||row.state!=='RESERVED')throw Error('Mission reservation is unavailable');
   if(m.status==='ACTIVE'&&row.stage!=='OFFER')throw Error('Mission stake already accepted');
   const state=m.status==='SUCCEEDED'?'EARNED':m.status==='ACTIVE'?'RESERVED':'RELEASED';
   this.db.prepare('UPDATE survival_mission_reservations SET state=?,stage=?,stake=?,failed=?,at=? WHERE run=? AND id=?').run(state,m.status,m.accepted===null?0:m.stake,m.status==='FAILED'?m.stake:0,Math.floor(this.now()/1000),run,m.id);
  }
 };}
 verify(run:string,scope:string,e:RunEconomy,m:MissionState){
  const rows=this.db.prepare('SELECT * FROM survival_mission_reservations WHERE run=?').all(run);
  const sum=(f:(r:typeof rows[number])=>number)=>rows.reduce((n,r)=>n+f(r),0);
  if(rows.some(r=>r.scope!==scope)||sum(r=>r.state==='EARNED'?Number(r.amount):0)!==e.bonusWhole||sum(r=>Number(r.failed))!==e.failedWhole||sum(r=>r.stage==='ACTIVE'?Number(r.stake):0)!==e.lockedWhole)throw Error('Mission checkpoint differs from reservation ledger');
  const open=rows.filter(r=>r.state==='RESERVED'),expected=m.current&&['OFFER','ACTIVE'].includes(m.current.status)?1:0;if(open.length!==expected||open.length===1&&open[0].id!==m.current?.id)throw Error('Mission reservation does not match current offer');
 }
}
