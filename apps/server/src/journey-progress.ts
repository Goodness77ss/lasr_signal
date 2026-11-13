import type { DatabaseSync } from 'node:sqlite';
import { distance } from '../../../packages/sim/src/rules.ts';
import { encounterObjective } from '../../../packages/sim/src/journey/checkpoints.ts';
import type { JourneyRun } from '../../../packages/sim/src/journey/encounter.ts';

// Cosmetic practice tuning. No combat bonus, token balance or voucher is produced.
export const JOURNEY_PROGRESS_RULES=Object.freeze({version:'journey-progress-1',minimumTicks:20,checkpointXp:10,checkpointCap:10,presenceRadius:10,minimumMovement:.001});
export type ProgressIdentity={kind:'free-entitlement'|'local-development'|'soldier-token';key:string};
export type ProgressEntry={actorId:number;identity:ProgressIdentity};
export function progressEntries(runId:string,run:JourneyRun):ProgressEntry[]{
  return (run.roster?.members??[]).map(m=>({actorId:m.actorId,identity:{kind:m.source==='soldier-token'?'soldier-token':m.source==='free-starter'?'free-entitlement':'local-development',key:m.source==='soldier-token'?m.id:runId+':'+m.id}}));
}

export class JourneyProgressJournal {
  constructor(private db:DatabaseSync){db.exec(`
    CREATE TABLE IF NOT EXISTS journey_progress_entries(run_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, rules_hash TEXT NOT NULL, policy TEXT NOT NULL, roster TEXT NOT NULL, identities TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS journey_participation(run_id TEXT NOT NULL, section TEXT NOT NULL, actor_id INTEGER NOT NULL, ticks INTEGER NOT NULL, PRIMARY KEY(run_id,section,actor_id));
    CREATE TABLE IF NOT EXISTS journey_experience(run_id TEXT NOT NULL, source TEXT NOT NULL, actor_id INTEGER NOT NULL, identity_kind TEXT NOT NULL, identity_key TEXT NOT NULL, account_id TEXT NOT NULL, policy TEXT NOT NULL, rules_hash TEXT NOT NULL, checkpoint TEXT NOT NULL, xp INTEGER NOT NULL, PRIMARY KEY(run_id,source,actor_id));
    CREATE TABLE IF NOT EXISTS journey_account_checkpoints(run_id TEXT NOT NULL, source TEXT NOT NULL, account_id TEXT NOT NULL, policy TEXT NOT NULL, rules_hash TEXT NOT NULL, checkpoint TEXT NOT NULL, PRIMARY KEY(run_id,source));
    INSERT OR IGNORE INTO journey_migrations(version) VALUES(4);`);}

  // Called only by trusted admission. A future verified token adapter can supply
  // canonical token identities here; no protocol action accepts these fields.
  enter(runId:string,run:JourneyRun,accountId='practice:'+runId,entries=progressEntries(runId,run)):void {
    if(!run.roster)return;
    if(run.tick!==0||run.eventSeq!==0||run.state!=='ACTIVE')throw Error('Progress requires entry at run creation');
    const actors=run.roster.members.map(m=>m.actorId);
    if(entries.length!==actors.length||entries.some((e,i)=>e.actorId!==actors[i]||!['free-entitlement','local-development','soldier-token'].includes(e.identity.kind)||!e.identity.key||e.identity.key.length>512)||new Set(entries.map(e=>e.identity.kind+':'+e.identity.key)).size!==entries.length||!accountId||accountId.length>512)throw Error('Invalid progress entry identities');
    this.db.prepare('INSERT INTO journey_progress_entries VALUES(?,?,?,?,?,?)').run(runId,accountId,run.pin.hash,JOURNEY_PROGRESS_RULES.version,JSON.stringify(run.roster),JSON.stringify(entries));
  }

  advance(runId:string,before:JourneyRun,after:JourneyRun,tick:boolean):void {
    const entry=this.db.prepare('SELECT * FROM journey_progress_entries WHERE run_id=?').get(runId);
    // Saved runs from before this migration retain their original semantics.
    if(!entry)return;
    if(entry.policy!==JOURNEY_PROGRESS_RULES.version||entry.rules_hash!==after.pin.hash||entry.roster!==JSON.stringify(after.roster)||entry.roster!==JSON.stringify(before.roster))throw Error('Progress entry roster changed');
    const members=JSON.parse(String(entry.identities)) as ProgressEntry[];
    const ids=members.map(m=>m.actorId);
    if(JSON.stringify(after.actors.filter(a=>a.side===0).map(a=>a.id))!==JSON.stringify(ids))throw Error('Progress actor membership changed');
    if(after.tick!==before.tick+(tick?1:0))throw Error('Progress requires ordered server ticks');
    const p=JOURNEY_PROGRESS_RULES;
    if(tick&&before.state==='ACTIVE'&&before.section===after.section){
      const objective=before.encounter?encounterObjective(before.encounter.template):null;
      for(const member of members){
        const a=before.actors.find(a=>a.id===member.actorId),b=after.actors.find(a=>a.id===member.actorId);
        if(!a||!b||a.hp<=0||b.hp<=0)continue;
        const moved=distance(a,b)>p.minimumMovement;
        const objectiveWork=objective&&distance(b,objective)<=3&&(after.encounter?.progress??0)>(before.encounter?.progress??0);
        if(moved||objectiveWork)this.db.prepare('INSERT INTO journey_participation VALUES(?,?,?,1) ON CONFLICT(run_id,section,actor_id) DO UPDATE SET ticks=MIN(ticks+1,?)').run(runId,after.section,member.actorId,p.minimumTicks);
      }
    }
    for(const event of after.events.filter(e=>e.seq>before.eventSeq&&e.kind==='checkpoint')){
      if(!tick||before.state!=='ACTIVE'||!event.source||event.source!==after.encounter?.source||!after.encounter.opened||event.section!==after.section||before.checkpointComplete||!after.checkpointComplete||after.state!=='CHECKPOINT_REACHED'||!after.stream)throw Error('Unverified progress checkpoint');
      const checkpoint=after.stream.ordinal;
      this.db.prepare('INSERT INTO journey_account_checkpoints VALUES(?,?,?,?,?,?)').run(runId,event.source,entry.account_id,entry.policy,entry.rules_hash,checkpoint);
      const leader=after.actors.find(a=>a.id===1)!;
      for(const member of members){
        const actor=after.actors.find(a=>a.id===member.actorId);
        const contribution=this.db.prepare('SELECT ticks FROM journey_participation WHERE run_id=? AND section=? AND actor_id=?').get(runId,after.section,member.actorId);
        if(!actor||actor.hp<=0||leader.hp<=0||distance(actor,leader)>p.presenceRadius||Number(contribution?.ticks??0)<p.minimumTicks)continue;
        this.db.prepare('INSERT INTO journey_experience VALUES(?,?,?,?,?,?,?,?,?,?)').run(runId,event.source,member.actorId,member.identity.kind,member.identity.key,entry.account_id,entry.policy,entry.rules_hash,checkpoint,Math.min(p.checkpointXp,p.checkpointCap));
      }
    }
  }

  history(identity:ProgressIdentity,rulesHash:string){return this.summary('identity_kind=? AND identity_key=?',[identity.kind,identity.key],rulesHash);}
  forRun(runId:string){
    const entry=this.db.prepare('SELECT * FROM journey_progress_entries WHERE run_id=?').get(runId);if(!entry)return null;
    const members=JSON.parse(String(entry.identities)) as ProgressEntry[];
    const row=this.db.prepare('SELECT snapshot FROM journey_runs WHERE id=?').get(runId),bankedRun=row?JSON.parse(String(row.snapshot)).state==='BANKED':false;
    return {policy:entry.policy,cosmetic:true,provisional:!bankedRun,bankedRun,onchainVoucher:false,members:members.map(m=>({actorId:m.actorId,...this.history(m.identity,String(entry.rules_hash))})),account:this.account(String(entry.account_id),String(entry.rules_hash))};
  }
  account(accountId:string,rulesHash:string){
    const xp=this.summary('account_id=?',[accountId],rulesHash);
    const checkpoints=this.db.prepare('SELECT checkpoint FROM journey_account_checkpoints WHERE account_id=? AND policy=? AND rules_hash=?').all(accountId,JOURNEY_PROGRESS_RULES.version,rulesHash);
    return {...xp,furthestCompleted:furthest(checkpoints.map(c=>String(c.checkpoint))),completedSources:checkpoints.length};
  }
  private summary(where:string,args:string[],rulesHash:string){
    const rows=this.db.prepare('SELECT checkpoint,xp FROM journey_experience WHERE '+where+' AND policy=? AND rules_hash=?').all(...args,JOURNEY_PROGRESS_RULES.version,rulesHash);
    const total=rows.reduce((sum,row)=>sum+BigInt(String(row.xp)),0n);
    return {policy:JOURNEY_PROGRESS_RULES.version,rulesHash,xp:total.toString(),furthestCompleted:furthest(rows.map(r=>String(r.checkpoint))),awards:rows.length};
  }
}
function furthest(values:string[]):string|null{return values.reduce<string|null>((max,value)=>max===null||BigInt(value)>BigInt(max)?value:max,null);}

