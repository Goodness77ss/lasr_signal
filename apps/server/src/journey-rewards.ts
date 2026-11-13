import type { DatabaseSync } from 'node:sqlite';
import { REWARD_RULES,emptyRewards,validateRewards,type PracticeDrop } from '../../../packages/sim/src/journey/rewards.ts';
import type { JourneyRun } from '../../../packages/sim/src/journey/encounter.ts';
export class JourneyRewardJournal {
  constructor(private db:DatabaseSync){db.exec(`
    CREATE TABLE IF NOT EXISTS journey_reward_allowances(run_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, policy TEXT NOT NULL, rules_hash TEXT NOT NULL, checkpoint_earned INTEGER NOT NULL, drop_created INTEGER NOT NULL, drop_picked INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS journey_reward_sources(run_id TEXT NOT NULL, source TEXT NOT NULL, kind TEXT NOT NULL, section TEXT NOT NULL, encounter TEXT NOT NULL, enemy_id INTEGER, amount INTEGER NOT NULL, state TEXT NOT NULL, PRIMARY KEY(run_id,source));
    CREATE TABLE IF NOT EXISTS journey_reward_terminals(run_id TEXT PRIMARY KEY, state TEXT NOT NULL, checkpoint_credits INTEGER NOT NULL, loot_credits INTEGER NOT NULL, total_credits INTEGER NOT NULL, tick INTEGER NOT NULL);
    INSERT OR IGNORE INTO journey_migrations(version) VALUES(5);`);}
  enter(id:string,run:JourneyRun):void {
    if(!run.rewards)return;
    if(JSON.stringify(run.rewards)!==JSON.stringify(emptyRewards())||run.tick!==0||run.practiceCredits||run.bankedPracticeCredits)throw Error('Rewards require a fresh admission');
    const entry=this.db.prepare('SELECT account_id FROM journey_progress_entries WHERE run_id=?').get(id);
    if(!entry)throw Error('Reward attribution required');
    this.db.prepare('INSERT INTO journey_reward_allowances VALUES(?,?,?,?,0,0,0)').run(id,entry.account_id,REWARD_RULES.version,run.pin.hash);
  }
  advance(id:string,before:JourneyRun,after:JourneyRun):void {
    if(!before.rewards&&!after.rewards)return;
    validateRewards(after);
    const a=before.rewards,b=after.rewards,allowance=this.db.prepare('SELECT * FROM journey_reward_allowances WHERE run_id=?').get(id);
    if(!a||!b||!allowance||allowance.rules_hash!==after.pin.hash||allowance.policy!==REWARD_RULES.version||a.checkpointEarned!==allowance.checkpoint_earned||a.dropCreated!==allowance.drop_created||a.dropPicked!==allowance.drop_picked)throw Error('Reward allowance mismatch');
    if(['BANKED','QUIT','DEAD'].includes(before.state)&&JSON.stringify(a)!==JSON.stringify(b))throw Error('Terminal reward mutation');
    let checkpoints=0,created=0,picked=0;
    for(const event of after.events.filter(e=>e.seq>before.eventSeq&&e.kind==='checkpoint')){
      if(!event.source||event.source!==after.encounter?.source||after.state!=='CHECKPOINT_REACHED'||!after.checkpointComplete)throw Error('Unverified reward checkpoint');
      const amount=Math.min(after.pin.rules.checkpointCredits,REWARD_RULES.maxCheckpointCredits-a.checkpointEarned-checkpoints);checkpoints+=amount;
      this.db.prepare('INSERT INTO journey_reward_sources VALUES(?,?,?,?,?,NULL,?,?)').run(id,event.source,'CHECKPOINT',after.section,event.source,amount,'PROVISIONAL');
    }
    if(before.section!==after.section){
      for(const drop of a.drops)if(drop.state==='AVAILABLE')this.setDrop(id,drop,'ABANDONED');
      if(b.drops.length)throw Error('Regenerated Journey drops');
    }else{
      for(const prior of a.drops)if(!b.drops.some(d=>d.id===prior.id))throw Error('Removed Journey drop');
      for(const drop of b.drops){
        const prior=a.drops.find(d=>d.id===drop.id);
        if(!prior){
          const enemy=before.actors.find(e=>e.id===drop.enemyId);
          const down=after.events.some(e=>e.seq>before.eventSeq&&e.kind==='down'&&e.side===0&&Math.hypot(e.to.x-drop.x,e.to.z-drop.z)<.001);
          if(!enemy||enemy.hp<=0||!down)throw Error('Unverified Journey defeat');
          created+=drop.credits;
          this.db.prepare('INSERT INTO journey_reward_sources VALUES(?,?,?,?,?,?,?,?)').run(id,drop.id,'ENEMY_DROP',drop.section,drop.encounter,drop.enemyId,drop.credits,'AVAILABLE');
        }else if(JSON.stringify({...prior,state:drop.state})!==JSON.stringify(drop))throw Error('Journey drop identity changed');
        const oldState=prior?.state??'AVAILABLE';
        if(oldState==='AVAILABLE'&&drop.state==='PICKED')picked+=drop.credits;
        else if(oldState!==drop.state&&!(['BANKED','QUIT','DEAD'].includes(after.state)&&['AVAILABLE','PICKED'].includes(oldState)&&['BANKED','FORFEITED','ABANDONED'].includes(drop.state)))throw Error('Invalid Journey drop transition');
        this.setDrop(id,drop,drop.state);
      }
    }
    if(b.checkpointEarned!==a.checkpointEarned+checkpoints||b.dropCreated!==a.dropCreated+created||b.dropPicked!==a.dropPicked+picked)throw Error('Changed Journey reward allowance');
    const terminal=after.state!==before.state&&['BANKED','QUIT','DEAD'].includes(after.state);
    if(terminal){
      const banked=after.state==='BANKED',loot=b.dropPicked;
      if(banked&&(before.state!=='CHECKPOINT_REACHED'||after.bankedPracticeCredits!==before.bankedPracticeCredits+before.practiceCredits+a.provisionalLoot||b.bankedLoot!==a.bankedLoot+a.provisionalLoot))throw Error('Invalid Journey bank result');
      this.db.prepare('INSERT INTO journey_reward_terminals VALUES(?,?,?,?,?,?)').run(id,after.state,banked?before.practiceCredits:0,banked?a.provisionalLoot:0,banked?after.bankedPracticeCredits:0,after.tick);
      this.db.prepare("UPDATE journey_reward_sources SET state=? WHERE run_id=? AND state='PROVISIONAL'").run(banked?'BANKED':'FORFEITED',id);
      this.db.prepare("UPDATE journey_reward_sources SET state=? WHERE run_id=? AND state='PICKED'").run(banked?'BANKED':'FORFEITED',id);
      if(!banked&&(b.forfeitedLoot!==loot||after.practiceCredits!==0||after.bankedPracticeCredits!==0))throw Error('Invalid Journey forfeiture');
    }
    this.db.prepare('UPDATE journey_reward_allowances SET checkpoint_earned=?,drop_created=?,drop_picked=? WHERE run_id=?').run(b.checkpointEarned,b.dropCreated,b.dropPicked,id);
  }
  private setDrop(id:string,drop:PracticeDrop,state:PracticeDrop['state']){
    if(this.db.prepare("UPDATE journey_reward_sources SET state=? WHERE run_id=? AND source=? AND kind='ENEMY_DROP'").run(state,id,drop.id).changes!==1)throw Error('Missing Journey drop source');
  }
  forRun(id:string){
    const allowance=this.db.prepare('SELECT policy,checkpoint_earned,drop_created,drop_picked FROM journey_reward_allowances WHERE run_id=?').get(id);if(!allowance)return null;
    return {environment:'LOCAL_SERVER_PRACTICE',value:'SIMULATED_CREDITS',allowance,terminal:this.db.prepare('SELECT state,checkpoint_credits,loot_credits,total_credits,tick FROM journey_reward_terminals WHERE run_id=?').get(id)??null};
  }
}
