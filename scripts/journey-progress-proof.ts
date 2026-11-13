import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JourneyStore } from '../apps/server/src/journey-store.ts';
import { JOURNEY_PROGRESS_RULES } from '../apps/server/src/journey-progress.ts';
import { createJourney,journeyStep,journeyWorld } from '../packages/sim/src/journey/encounter.ts';
import { defaultRosterSelection } from '../packages/sim/src/journey/roster.ts';
import { journeyReviewBot } from '../packages/sim/src/journey/review-bot.ts';

const directory=mkdtempSync(join(tmpdir(),'journey-progress-proof-'));
let db=new DatabaseSync(join(directory,'journal.sqlite'));
const replayDb=new DatabaseSync(':memory:');
try{
  let store=new JourneyStore(db);const replay=new JourneyStore(replayDb);
  const run=await createJourney({streamed:true,seed:5,roster:defaultRosterSelection()});
  store.create('proof','local-proof',run);replay.create('proof','local-proof',structuredClone(run));let revision=0;
  while(run.state==='ACTIVE'&&run.tick<4000){
    journeyReviewBot(run,journeyWorld(run));journeyStep(run);
    store.saveTick('proof',revision,run);replay.saveTick('proof',revision,structuredClone(run));revision++;
  }
  assert.equal(run.state,'CHECKPOINT_REACHED');
  const beforeRestart=store.progress.forRun('proof');assert.deepEqual(beforeRestart,replay.progress.forRun('proof'));
  assert.equal(beforeRestart!.members[0].xp,'10');
  db.close();db=new DatabaseSync(join(directory,'journal.sqlite'));store=new JourneyStore(db);
  assert.deepEqual(store.progress.forRun('proof'),beforeRestart);
  assert.deepEqual(store.load('proof','local-proof').run,run);
  const report={generatedAt:new Date().toISOString(),environment:'LOCAL_SIMULATION_DURABLE_JOURNAL_PROOF',policy:JOURNEY_PROGRESS_RULES,tick:run.tick,state:run.state,seed:5,section:run.section,simulationRules:run.pin.rules.version,rulesHash:run.pin.hash,rosterHash:run.roster!.hash,summary:beforeRestart,participation:db.prepare('SELECT section,actor_id,ticks FROM journey_participation ORDER BY actor_id').all(),awards:db.prepare('SELECT source,actor_id,identity_kind,identity_key,checkpoint,xp FROM journey_experience ORDER BY actor_id').all(),independentReplayEqual:true,reopenedDatabaseEqual:true,limits:'Ordinary deterministic simulation and disposable SQLite stores. No browser, public multiplayer, wallet ownership, token transfer or chain voucher is claimed.'};
  writeFileSync('docs/evidence/journey-progress-proof.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({state:run.state,tick:run.tick,members:beforeRestart!.members,independentReplayEqual:true,reopenedDatabaseEqual:true}));
}finally{db.close();replayDb.close();rmSync(directory,{recursive:true,force:true});}
