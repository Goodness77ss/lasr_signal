import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JourneyStore } from '../apps/server/src/journey-store.ts';
import { createJourney,journeyStep,journeyWorld,journeyBank,journeyCheckpoint } from '../packages/sim/src/journey/encounter.ts';
import { defaultRosterSelection } from '../packages/sim/src/journey/roster.ts';
import { journeyLootReviewBot } from '../packages/sim/src/journey/review-bot.ts';
import { REWARD_RULES } from '../packages/sim/src/journey/rewards.ts';
const directory=mkdtempSync(join(tmpdir(),'journey-rewards-proof-')),file=join(directory,'rewards.sqlite');let db=new DatabaseSync(file);
try{
  let store=new JourneyStore(db);const run=await createJourney({streamed:true,seed:5,roster:defaultRosterSelection(),rewards:true});store.create('proof','local-proof',run);let revision=0;
  while(run.tick<4000){
    journeyLootReviewBot(run,journeyWorld(run));journeyStep(run);store.saveTick('proof',revision++,run);
    if(run.state==='CHECKPOINT_REACHED'&&run.rewards!.provisionalLoot===5&&Math.hypot(run.actors[0].x-journeyCheckpoint(run).x,run.actors[0].z-journeyCheckpoint(run).z)<=3)break;
  }
  assert.equal(run.state,'CHECKPOINT_REACHED');assert.equal(run.rewards!.provisionalLoot,5);assert.equal(run.practiceCredits,10);
  assert.equal(journeyBank(run),true);const message={op:'command' as const,id:'proof-bank',sequence:1,section:run.section,actorId:1,action:{kind:'bank' as const}};
  const ack={op:'ack' as const,id:message.id,ok:true,reason:'Accepted',sequence:1,order:revision+1,tick:run.tick};store.commit('proof',revision,message,run,ack);
  assert.equal(run.bankedPracticeCredits,15);const before=store.rewards.forRun('proof');db.close();db=new DatabaseSync(file);store=new JourneyStore(db);
  assert.deepEqual(store.rewards.forRun('proof'),before);assert.deepEqual(store.load('proof','local-proof').run,run);assert.deepEqual(store.replay('proof',message),ack);assert.equal(journeyBank(run),false);
  const report={generatedAt:new Date().toISOString(),environment:'LOCAL_SIMULATION_DURABLE_REWARD_PROOF',policy:REWARD_RULES,state:run.state,tick:run.tick,rulesHash:run.pin.hash,rewards:run.rewards,ledger:store.rewards.forRun('proof'),progress:store.progress.forRun('proof'),sources:db.prepare('SELECT source,kind,section,encounter,enemy_id,amount,state FROM journey_reward_sources ORDER BY kind').all(),reopenedDatabaseEqual:true,bankReplayEqual:true,limits:'Ordinary deterministic simulation and disposable SQLite. No browser, public multiplayer, owned inventory, wallet transfer or chain claim.'};
  writeFileSync('docs/evidence/journey-rewards-proof.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({state:run.state,tick:run.tick,banked:run.bankedPracticeCredits,ledger:before,reopenedDatabaseEqual:true,bankReplayEqual:true}));
}finally{db.close();rmSync(directory,{recursive:true,force:true});}
