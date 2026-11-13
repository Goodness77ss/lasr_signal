import { expect,it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJourney,journeyStep,journeyWorld,type JourneyRun } from '../packages/sim/src/journey/encounter.ts';
import { defaultRosterSelection } from '../packages/sim/src/journey/roster.ts';
import { journeyReviewBot } from '../packages/sim/src/journey/review-bot.ts';
import { JourneyStore } from '../apps/server/src/journey-store.ts';
import { JOURNEY_PROGRESS_RULES,progressEntries,type ProgressIdentity } from '../apps/server/src/journey-progress.ts';
const make=()=>createJourney({streamed:true,seed:5,roster:defaultRosterSelection()});

// Explicit journal fixtures isolate attribution and atomicity from combat.
function fixtureTick(store:JourneyStore,id:string,run:JourneyRun,revision:number,move=true){
  run.tick++;if(move)for(const a of run.actors.filter(a=>a.side===0))a.x+=.01;
  store.saveTick(id,revision,run);
}
function complete(store:JourneyStore,id:string,run:JourneyRun,revision:number){
  run.tick++;run.checkpointComplete=true;run.state='CHECKPOINT_REACHED';run.encounter!.opened=true;
  run.encounter!.progress=run.encounter!.template==='crossing'?40:run.encounter!.template==='supply-route'?30:0;
  run.events.push({seq:++run.eventSeq,kind:'checkpoint',from:{x:66,z:24},to:{x:66,z:24},height:1,side:0,section:run.section,source:run.encounter!.source});
  store.saveTick(id,revision,run);
}

it('journals ordinary simulation checkpoint completion and recovers the same bounded XP after reopening SQLite',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'journey-progress-')),file=join(directory,'progress.sqlite');let db=new DatabaseSync(file);
  try{
    let store=new JourneyStore(db);const run=await make();store.create('ordinary','credential',run);let revision=0;
    for(let i=0;i<4000&&run.state==='ACTIVE';i++){
      journeyReviewBot(run,journeyWorld(run));journeyStep(run);store.saveTick('ordinary',revision++,run);
    }
    expect(run.state).toBe('CHECKPOINT_REACHED');const result=store.progress.forRun('ordinary')!;
    expect(result.account.furthestCompleted).toBe('0');expect(result.members[0]).toMatchObject({xp:'10',awards:1,furthestCompleted:'0'});
    expect(result.members.every(m=>BigInt(m.xp)<=10n)).toBe(true);expect(result.onchainVoucher).toBe(false);
    db.close();db=new DatabaseSync(file);store=new JourneyStore(db);
    expect(store.progress.forRun('ordinary')).toEqual(result);expect(store.load('ordinary','credential').run).toEqual(run);
    journeyStep(run);store.saveTick('ordinary',revision++,run);expect(store.progress.forRun('ordinary')).toEqual(result);
  }finally{db.close();rmSync(directory,{recursive:true,force:true});}
},30000);

it('requires sufficient contribution and living presence, with no credit for idle, dead or distant members',async()=>{
  const db=new DatabaseSync(':memory:');try{
    const store=new JourneyStore(db),run=await make();store.create('eligible','credential',run);
    for(let i=0;i<25;i++)fixtureTick(store,'eligible',run,i);
    expect(db.prepare('SELECT ticks FROM journey_participation').all().every(r=>r.ticks===20)).toBe(true);
    run.actors[1].hp=0;run.actors[2].x=50;complete(store,'eligible',run,25);
    expect(store.progress.forRun('eligible')!.members.map(m=>m.xp)).toEqual(['10','0','0']);
    const idle=await make();store.create('idle','credential',idle);
    for(let i=0;i<30;i++)fixtureTick(store,'idle',idle,i,false);complete(store,'idle',idle,30);
    expect(store.progress.forRun('idle')!.members.map(m=>m.xp)).toEqual(['0','0','0']);
    expect(store.progress.forRun('idle')!.account).toMatchObject({furthestCompleted:'0',xp:'0',completedSources:1});
    const brief=await make();store.create('brief','credential',brief);
    for(let i=0;i<19;i++)fixtureTick(store,'brief',brief,i);complete(store,'brief',brief,19);
    expect(store.progress.forRun('brief')!.members.every(m=>m.xp==='0')).toBe(true);
  }finally{db.close();}
});

it('rolls back late roster insertion, duplicate checkpoint sources, stale ticks and rejected XP writes',async()=>{
  const db=new DatabaseSync(':memory:');try{
    const store=new JourneyStore(db),run=await make();store.create('guarded','credential',run);
    const changed=structuredClone(run);changed.roster!.members[0].id='starter:2';changed.tick++;
    expect(()=>store.saveTick('guarded',0,changed)).toThrow('roster changed');expect(store.load('guarded','credential').revision).toBe(0);
    const absent=structuredClone(run);absent.tick++;absent.actors.splice(1,1);
    expect(()=>store.saveTick('guarded',0,absent)).toThrow('membership changed');
    const skipped=structuredClone(run);skipped.tick=2;expect(()=>store.saveTick('guarded',0,skipped)).toThrow('ordered');
    for(let i=0;i<20;i++)fixtureTick(store,'guarded',run,i);
    db.exec("CREATE TRIGGER reject_xp BEFORE INSERT ON journey_experience BEGIN SELECT RAISE(ABORT,'rejected XP write'); END");
    expect(()=>complete(store,'guarded',run,20)).toThrow('rejected XP');
    expect(store.load('guarded','credential')).toMatchObject({revision:20,run:{checkpointComplete:false}});
    expect(db.prepare('SELECT COUNT(*) n FROM journey_account_checkpoints').get()!.n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) n FROM journey_checkpoints').get()!.n).toBe(0);
    db.exec('DROP TRIGGER reject_xp');store.saveTick('guarded',20,run);
    const replay=structuredClone(run);replay.tick++;replay.events.push({...replay.events.at(-1)!,seq:++replay.eventSeq});
    expect(()=>store.saveTick('guarded',21,replay)).toThrow('Duplicate Journey checkpoint');
    expect(store.progress.forRun('guarded')!.members[0].awards).toBe(1);
  }finally{db.close();}
});

it('keeps token history distinct from seller and buyer achievements across two trusted admission fixtures',async()=>{
  const db=new DatabaseSync(':memory:');try{
    const store=new JourneyStore(db),token:ProgressIdentity={kind:'soldier-token',key:'eip155:31337:0x1111111111111111111111111111111111111111:7'};
    let rulesHash='';
    for(const [id,accountId] of [['seller-run','seller'],['buyer-run','buyer']]){
      const run=await make(),entries=progressEntries(id,run);rulesHash=run.pin.hash;entries[0].identity=token;
      store.create(id,'credential',run,{accountId,entries});
      for(let i=0;i<20;i++)fixtureTick(store,id,run,i);complete(store,id,run,20);
    }
    expect(store.progress.history(token,rulesHash)).toMatchObject({xp:'20',awards:2,furthestCompleted:'0'});
    for(const accountId of ['seller','buyer'])expect(store.progress.account(accountId,rulesHash)).toMatchObject({xp:'30',awards:3,completedSources:1});
    expect(store.progress.history(token,'another difficulty hash')).toMatchObject({xp:'0',furthestCompleted:null});
    expect(store.progress.history({kind:'free-entitlement',key:'seller-run:starter:1'},rulesHash).xp).toBe('0');
  }finally{db.close();}
});

it('does not count command replay, a submitted coordinate or unverified client kill as participation',async()=>{
  const db=new DatabaseSync(':memory:');try{
    const store=new JourneyStore(db),run=await make();store.create('commands','credential',run);
    const message={op:'command' as const,id:'move',sequence:1,section:run.section,actorId:1,action:{kind:'move' as const,target:{x:66,z:24}}};
    run.actors[0].route=[{x:66,z:24}];const ack={op:'ack' as const,id:'move',ok:true,reason:'Accepted',sequence:1,order:1,tick:0};
    store.commit('commands',0,message,run,ack);expect(store.replay('commands',message)).toEqual(ack);
    expect(db.prepare('SELECT COUNT(*) n FROM journey_participation').get()!.n).toBe(0);
    expect(store.progress.forRun('commands')!.account.furthestCompleted).toBeNull();
    expect(JOURNEY_PROGRESS_RULES.checkpointCap).toBe(10);
  }finally{db.close();}
});

it('isolates two simultaneously active practice runs with identical starter choices and checkpoint sources',async()=>{
  const db=new DatabaseSync(':memory:');try{
    const store=new JourneyStore(db),a=await make(),b=await make();
    store.create('a','credential-a',a);store.create('b','credential-b',b);
    for(let i=0;i<20;i++){fixtureTick(store,'a',a,i);fixtureTick(store,'b',b,i,false);}
    complete(store,'a',a,20);complete(store,'b',b,20);
    expect(store.progress.forRun('a')!.members[0].xp).toBe('10');expect(store.progress.forRun('b')!.members[0].xp).toBe('0');
    expect(db.prepare('SELECT COUNT(*) n FROM journey_account_checkpoints').get()!.n).toBe(2);
    expect(store.progress.history({kind:'free-entitlement',key:'a:starter:1'},a.pin.hash).xp).toBe('10');
    expect(store.progress.history({kind:'free-entitlement',key:'b:starter:1'},a.pin.hash).xp).toBe('0');
  }finally{db.close();}
});

it('rejects a late or duplicate identity admission atomically and preserves older untracked runs',async()=>{
  const db=new DatabaseSync(':memory:');try{
    const store=new JourneyStore(db),run=await make();run.tick=1;
    expect(()=>store.create('late','credential',run)).toThrow('entry at run creation');
    expect(db.prepare('SELECT COUNT(*) n FROM journey_runs').get()!.n).toBe(0);
    run.tick=0;const entries=progressEntries('duplicate',run);entries[1].identity=entries[0].identity;
    expect(()=>store.create('duplicate','credential',run,{accountId:'account',entries})).toThrow('identities');
    const legacy=await createJourney({streamed:true});store.create('old','credential',legacy);journeyStep(legacy);store.saveTick('old',0,legacy);
    expect(store.progress.forRun('old')).toBeNull();expect(store.load('old','credential').run.tick).toBe(1);
  }finally{db.close();}
});
