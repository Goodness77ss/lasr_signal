import { it,expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createJourney,journeyFire,journeyPickup,journeyBank,journeyQuit,journeyStep,journeyContinue,journeyWorld,validateJourneyResume,type JourneyRun } from '../packages/sim/src/journey/encounter.ts';
import { defaultRosterSelection } from '../packages/sim/src/journey/roster.ts';
import { REWARD_RULES,defeatDrop } from '../packages/sim/src/journey/rewards.ts';
import { journeyLootReviewBot } from '../packages/sim/src/journey/review-bot.ts';
import { createWorld } from '../packages/sim/src/journey/world.ts';
import { JourneyStore } from '../apps/server/src/journey-store.ts';
import { JourneyService } from '../apps/server/src/journey-service.ts';
import { JOURNEY_REWARD_IDENTIFIERS,parseJourneyClient } from '../packages/protocol/src/journey.ts';
const make=()=>createJourney({streamed:true,seed:5,roster:defaultRosterSelection(),rewards:true});
const clearWorld=createWorld(72,48,[]);
function woundFixture(run:JourneyRun,targetId=6){
  Object.assign(run.actors[0],{x:20,z:24});
  for(const a of run.actors.filter(a=>a.side===1))a.hp=0;
  Object.assign(run.actors.find(a=>a.id===targetId)!,{x:21.5,z:24,hp:1});
}
function commit(store:JourneyStore,id:string,run:JourneyRun,revision:number,kind:'fire'|'pickup'|'bank'|'quit'|'continue',execute:()=>boolean|void){
  const ok=execute()!==false,sequence=revision+1,action=kind==='fire'?{kind,direction:{x:1,y:0,z:0}}:kind==='pickup'?{kind,dropId:run.rewards!.drops[0].id}:{kind};
  const message={op:'command' as const,id:'action-'+sequence,sequence,section:run.section,actorId:1,action};
  const ack={op:'ack' as const,id:message.id,ok,reason:'test',sequence,order:revision+1,tick:run.tick};
  store.commit(id,revision,message,run,ack);return {message,ack};
}
it('pins veteran roles and practice caps without changing old roster rules',async()=>{
  const run=await make();expect(run.pin.rules.version).toBe('journey-practice-0.13.0');expect(run.pin.rules.rewards).toEqual(REWARD_RULES);
  expect(run.actors.filter(a=>a.side===1).map(a=>[a.rank,a.hp])).toEqual([['ordinary',100],['ordinary',100],['veteran',120]]);
  const old=await createJourney({streamed:true,roster:defaultRosterSelection()});expect(old.rewards).toBeUndefined();expect(old.actors.every(a=>a.rank===undefined)).toBe(true);
  await expect(validateJourneyResume(run)).resolves.toBeUndefined();
  const forged=structuredClone(run);forged.rewards!.dropCreated=51;await expect(validateJourneyResume(forged)).rejects.toThrow('reward');
});
it('creates a single veteran drop through actual weapon damage and separates pickup from banking',async()=>{
  for(const targetId of [4,6]){
    const run=await make();woundFixture(run,targetId);expect(journeyFire(run,run.actors[0],{x:1,y:0,z:0},clearWorld)).toBe(true);
    expect(run.rewards!.drops).toHaveLength(targetId===6?1:0);
    if(targetId===4)continue;
    const drop=run.rewards!.drops[0];expect(drop).toMatchObject({enemyId:6,section:run.section,encounter:run.encounter!.source,credits:5,state:'AVAILABLE'});
    defeatDrop(run,run.actors[5],0);expect(run.rewards!.drops).toHaveLength(1);
    expect(run.rewards!.provisionalLoot).toBe(0);expect(run.bankedPracticeCredits).toBe(0);
    run.actors[0].x=10;expect(journeyPickup(run,drop.id,clearWorld)).toBe(false);run.actors[0].x=20;
    expect(journeyPickup(run,drop.id,clearWorld)).toBe(true);expect(journeyPickup(run,drop.id,clearWorld)).toBe(false);
    expect(run.rewards).toMatchObject({dropCreated:5,dropPicked:5,provisionalLoot:5});expect(journeyBank(run)).toBe(false);
    journeyQuit(run);expect(run.rewards).toMatchObject({provisionalLoot:0,forfeitedLoot:5,dropCreated:5,dropPicked:5});expect(drop.state).toBe('FORFEITED');
    journeyQuit(run);expect(run.rewards!.forfeitedLoot).toBe(5);
  }
});
it('rejects blocked or airborne pickup and gives simultaneous leader death priority over loot',async()=>{
  const run=await make();woundFixture(run);journeyFire(run,run.actors[0],{x:1,y:0,z:0},clearWorld);const drop=run.rewards!.drops[0];
  const wall=createWorld(72,48,[{x:20.5,z:23,w:.3,d:2,h:3}]);expect(journeyPickup(run,drop.id,wall)).toBe(false);
  run.actors[0].traversal!.grounded=false;run.actors[0].traversal!.y=2;expect(journeyPickup(run,drop.id,clearWorld)).toBe(false);run.actors[0].traversal!.y=0;run.actors[0].traversal!.grounded=true;
  run.actors[0].hp=0;journeyStep(run,clearWorld);expect(run.state).toBe('DEAD');expect(drop.state).toBe('FORFEITED');expect(run.bankedPracticeCredits).toBe(0);
});
it('keeps an elevated defeat drop above its barrier and requires actual three dimensional pickup reach',async()=>{
  const run=await make();woundFixture(run);const enemy=run.actors[5];enemy.hp=0;enemy.traversal!.y=1.2;
  defeatDrop(run,enemy,0);const drop=run.rewards!.drops[0];expect(drop.y).toBe(1.2);
  const barrier=createWorld(72,48,[{x:21,z:23,w:1,d:2,h:1.1}]);
  expect(journeyPickup(run,drop.id,barrier)).toBe(true);expect(drop.state).toBe('PICKED');
  const high=await make();woundFixture(high);high.actors[5].hp=0;high.actors[5].traversal!.y=4;defeatDrop(high,high.actors[5],0);
  expect(journeyPickup(high,high.rewards!.drops[0].id,clearWorld)).toBe(false);
});
it('commits ordinary combat, pickup and terminal banking with durable source and cap history',async()=>{
  const db=new DatabaseSync(':memory:');try{
    let store=new JourneyStore(db);const run=await make();store.create('ordinary','credential',run);let revision=0;
    for(let i=0;i<4000&&!(run.state==='CHECKPOINT_REACHED'&&run.rewards!.provisionalLoot>0&&Math.hypot(run.actors[0].x-66,run.actors[0].z-24)<=3);i++){
      journeyLootReviewBot(run,journeyWorld(run));journeyStep(run);store.saveTick('ordinary',revision++,run);
    }
    expect(run.state).toBe('CHECKPOINT_REACHED');expect(run.practiceCredits).toBe(10);expect(run.rewards!.provisionalLoot).toBe(5);
    const result=commit(store,'ordinary',run,revision++,'bank',()=>journeyBank(run));expect(result.ack.ok).toBe(true);
    expect(run.bankedPracticeCredits).toBe(15);expect(journeyBank(run)).toBe(false);expect(journeyContinue(run).ok).toBe(false);
    store=new JourneyStore(db);expect(store.load('ordinary','credential').run).toEqual(run);expect(store.replay('ordinary',result.message)).toEqual(result.ack);
    expect(store.rewards.forRun('ordinary')).toMatchObject({value:'SIMULATED_CREDITS',allowance:{checkpoint_earned:10,drop_created:5,drop_picked:5},terminal:{state:'BANKED',checkpoint_credits:10,loot_credits:5,total_credits:15}});
    expect(db.prepare('SELECT kind,state FROM journey_reward_sources ORDER BY kind').all()).toEqual([{kind:'CHECKPOINT',state:'BANKED'},{kind:'ENEMY_DROP',state:'BANKED'}]);
    await expect(validateJourneyResume(run)).resolves.toBeUndefined();
  }finally{db.close();}
},30000);
it('rolls back a rejected bank terminal and then commits the same bank exactly once',async()=>{
  const db=new DatabaseSync(':memory:');try{
    const store=new JourneyStore(db),run=await make();store.create('bank','credential',run);let revision=0;
    while(run.state==='ACTIVE'&&run.tick<4000){journeyLootReviewBot(run,journeyWorld(run));journeyStep(run);store.saveTick('bank',revision++,run);}
    // Finish any ordinary loot detour before banking.
    while(Math.hypot(run.actors[0].x-66,run.actors[0].z-24)>3&&run.tick<4500){journeyLootReviewBot(run,journeyWorld(run));journeyStep(run);store.saveTick('bank',revision++,run);}
    db.exec("CREATE TRIGGER reject_bank BEFORE INSERT ON journey_reward_terminals BEGIN SELECT RAISE(ABORT,'bank interruption'); END");
    const before=structuredClone(run);expect(()=>commit(store,'bank',run,revision,'bank',()=>journeyBank(run))).toThrow('bank interruption');
    expect(store.load('bank','credential').run).toEqual(before);expect(store.rewards.forRun('bank')!.terminal).toBeNull();
    db.exec('DROP TRIGGER reject_bank');const result=commit(store,'bank',run,revision,'bank',()=>true);expect(store.replay('bank',result.message)).toEqual(result.ack);
    expect(db.prepare('SELECT COUNT(*) n FROM journey_reward_terminals').get()!.n).toBe(1);
  }finally{db.close();}
},30000);
it('keeps quit forfeiture and allowance history durable without changing entry equipment',async()=>{
  const db=new DatabaseSync(':memory:');try{
    let store=new JourneyStore(db);const run=await make();woundFixture(run);const roster=structuredClone(run.roster);store.create('quit','credential',run);
    commit(store,'quit',run,0,'fire',()=>journeyFire(run,run.actors[0],{x:1,y:0,z:0},clearWorld));
    commit(store,'quit',run,1,'pickup',()=>journeyPickup(run,run.rewards!.drops[0].id,clearWorld));
    const quit=commit(store,'quit',run,2,'quit',()=>journeyQuit(run));store=new JourneyStore(db);
    expect(store.replay('quit',quit.message)).toEqual(quit.ack);expect(store.load('quit','credential').run.roster).toEqual(roster);
    expect(store.rewards.forRun('quit')).toMatchObject({allowance:{drop_created:5,drop_picked:5},terminal:{state:'QUIT',total_credits:0}});
    expect(db.prepare("SELECT state FROM journey_reward_sources WHERE kind='ENEMY_DROP'").get()!.state).toBe('FORFEITED');
  }finally{db.close();}
});
it('serializes competing pickup commands and preserves an untimed disconnected run',async()=>{
  const db=new DatabaseSync(':memory:');const messages:Record<string,unknown>[]=[],service=new JourneyService(db),transport={send:(m:unknown)=>messages.push(m as Record<string,unknown>),close:()=>{}};
  let first=service.connect(transport),second=service.connect(transport);
  try{
    await first.receive({op:'start',...JOURNEY_REWARD_IDENTIFIERS,roster:defaultRosterSelection()});const session=messages.find(m=>m.op==='session')!,id=String(session.run),credential=String(session.credential);
    const saved=service.store.load(id,credential),run=saved.run;woundFixture(run);run.actors[0].x=7;run.actors[5].x=8.5;run.tick++;service.store.saveTick(id,0,run);
    await second.receive({op:'resume',...JOURNEY_REWARD_IDENTIFIERS,run:id,credential});
    const base={op:'command' as const,section:run.section,actorId:1};await first.receive({...base,id:'shot',sequence:1,action:{kind:'fire',direction:{x:1,y:0,z:0}}});
    const drop=service.store.load(id,credential).run.rewards!.drops[0];expect(drop).toBeDefined();
    await Promise.all([first.receive({...base,id:'pick-a',sequence:2,action:{kind:'pickup',dropId:drop.id}}),second.receive({...base,id:'pick-b',sequence:3,action:{kind:'pickup',dropId:drop.id}})]);
    expect(messages.filter(m=>m.op==='ack'&&String(m.id).startsWith('pick')).map(m=>m.ok)).toEqual([true,false]);
    const before=service.store.load(id,credential);first.close();second.close();for(let i=0;i<100;i++)service.tick();expect(service.store.load(id,credential)).toEqual(before);
    expect(REWARD_RULES.deadline).toBe('NONE');first=service.connect(transport);await first.receive({op:'resume',...JOURNEY_REWARD_IDENTIFIERS,run:id,credential});expect(service.store.load(id,credential).run.rewards!.provisionalLoot).toBe(5);
  }finally{first.close();second.close();db.close();}
});
it('rejects client supplied amounts or forged drops and preserves the reward rules identifier',()=>{
  const start={op:'start',...JOURNEY_REWARD_IDENTIFIERS,roster:defaultRosterSelection()};expect(parseJourneyClient(JSON.stringify(start))).toEqual(start);
  const pickup={op:'command',id:'pick',sequence:1,section:'journey-sections-1:5:0',actorId:1,action:{kind:'pickup',dropId:'journey-sections-1:5:0:enemy:6'}};
  expect(parseJourneyClient(JSON.stringify(pickup))).toEqual(pickup);
  expect(()=>parseJourneyClient(JSON.stringify({...pickup,action:{...pickup.action,credits:999}}))).toThrow();
});
it('caps repeated checkpoint rewards and drop creation while retaining spent allowance after quit',async()=>{
  const run=await make();
  // Authored objective fixtures isolate cap accounting from combat balance.
  for(let i=0;i<12;i++){
    for(const a of run.actors){if(a.side===1)a.hp=0;else Object.assign(a,{x:66,z:24});}
    run.encounter!.opened=true;run.encounter!.progress=run.encounter!.template==='crossing'?40:run.encounter!.template==='supply-route'?30:0;
    journeyStep(run);expect(run.practiceCredits).toBe(Math.min((i+1)*10,100));expect(journeyContinue(run).ok).toBe(true);
  }
  expect(run.rewards!.checkpointEarned).toBe(100);
  // The explicit near cap drop fixture cannot create a credit beyond the limit.
  run.rewards!.dropCreated=50;const veteran=run.actors[5];veteran.hp=0;defeatDrop(run,veteran,0);expect(run.rewards!.drops).toHaveLength(0);
  journeyQuit(run);expect(run.rewards).toMatchObject({checkpointEarned:100,dropCreated:50});expect(run.practiceCredits).toBe(0);
});
it('retires an uncollected section bag without freeing its allowance or regenerating it on resume',async()=>{
  const db=new DatabaseSync(':memory:');try{
    const store=new JourneyStore(db),run=await make();woundFixture(run);store.create('abandoned','credential',run);
    commit(store,'abandoned',run,0,'fire',()=>journeyFire(run,run.actors[0],{x:1,y:0,z:0},clearWorld));const oldDrop=run.rewards!.drops[0].id;
    for(const a of run.actors){if(a.side===1)a.hp=0;else Object.assign(a,{x:66,z:24});}
    run.encounter!.opened=true;run.encounter!.progress=40;journeyStep(run);store.saveTick('abandoned',1,run);
    expect(commit(store,'abandoned',run,2,'continue',()=>journeyContinue(run).ok).ack.ok).toBe(true);
    expect(run.rewards).toMatchObject({drops:[],dropCreated:5,dropPicked:0,provisionalLoot:0});expect(run.actors.filter(a=>a.side===1).every(a=>a.rank==='ordinary')).toBe(true);
    expect(db.prepare('SELECT state FROM journey_reward_sources WHERE source=?').get(oldDrop)!.state).toBe('ABANDONED');
    const restored=store.load('abandoned','credential').run;expect(journeyPickup(restored,oldDrop)).toBe(false);await expect(validateJourneyResume(restored)).resolves.toBeUndefined();
  }finally{db.close();}
});
