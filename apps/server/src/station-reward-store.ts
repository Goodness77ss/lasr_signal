import {randomBytes,createHash} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import type {SurvivalRules} from '@last-signal/sim';
import {rewardKey,type RewardState,type StationReward} from '../../../packages/sim/src/station-rewards.ts';
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export class StationRewardStore {
  constructor(private db:DatabaseSync,private now:()=>number=Date.now){
    db.exec('CREATE TABLE IF NOT EXISTS survival_practice_identities(hash TEXT PRIMARY KEY,scope TEXT UNIQUE NOT NULL); CREATE TABLE IF NOT EXISTS survival_station_rewards(run TEXT,cycle INTEGER,station TEXT,kind TEXT,scope TEXT NOT NULL,at INTEGER NOT NULL,amount INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(run,cycle,station,kind)); CREATE INDEX IF NOT EXISTS survival_reward_window ON survival_station_rewards(scope,at);');
    db.exec('CREATE TABLE IF NOT EXISTS survival_mission_reservations(run TEXT,id TEXT,scope TEXT,cycle INTEGER,amount INTEGER,at INTEGER,state TEXT,stage TEXT,stake INTEGER,failed INTEGER,PRIMARY KEY(run,id)); CREATE INDEX IF NOT EXISTS survival_bonus_window ON survival_mission_reservations(scope,at);');
  }
  identity(token?:string){
    if(token!==undefined){if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw Error('Invalid practice identity');const row=this.db.prepare('SELECT scope FROM survival_practice_identities WHERE hash=?').get(digest(token));if(!row)throw Error('Unknown practice identity');return {token,scope:String(row.scope)};}
    token=randomBytes(32).toString('hex');const scope='practice:'+digest(token);
    this.db.prepare('INSERT INTO survival_practice_identities VALUES(?,?)').run(digest(token),scope);return {token,scope};
  }
  remaining(scope:string,rules:SurvivalRules){
    const now=Math.floor(this.now()/1000),latest=this.db.prepare('SELECT MAX(at) AS latest FROM (SELECT at FROM survival_station_rewards WHERE scope=? UNION ALL SELECT at FROM survival_mission_reservations WHERE scope=?)').get(scope,scope)!;
    if(latest.latest!==null&&Number(latest.latest)>now)throw Error('Reward clock moved backwards');
    const row=this.db.prepare('SELECT COALESCE(SUM(amount),0) AS total FROM survival_station_rewards WHERE scope=? AND at>? AND at<=?').get(scope,now-rules.economy.walletWindowSeconds,now)!;
    const bonuses=this.db.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM survival_mission_reservations WHERE scope=? AND (state='RESERVED' OR (state='EARNED' AND at>? AND at<=?))").get(scope,now-rules.economy.walletWindowSeconds,now)!;
    return Math.max(0,rules.economy.walletRewardCap-Number(row.total)-Number(bonuses.total));
  }
  commit(scope:string,event:StationReward){
    this.db.prepare('INSERT INTO survival_station_rewards VALUES(?,?,?,?,?,?,?,?)').run(event.run,event.cycle,event.station,event.kind,scope,Math.floor(this.now()/1000),event.amountWhole,JSON.stringify(event));
  }
  verify(run:string,scope:string,state:RewardState){
    const rows=this.db.prepare('SELECT scope,payload FROM survival_station_rewards WHERE run=?').all(run);
    const expected=state.events.map(e=>JSON.stringify(e)).sort(),actual=rows.map(r=>String(r.payload)).sort();
    if(rows.some(r=>r.scope!==scope)||expected.length!==new Set(state.events.map(rewardKey)).size||JSON.stringify(expected)!==JSON.stringify(actual))throw Error('Reward checkpoint does not match journal');
    if(state.events.some(e=>e.run!==run))throw Error('Reward run mismatch');
  }
}
