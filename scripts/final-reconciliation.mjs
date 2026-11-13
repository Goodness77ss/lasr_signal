import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync} from 'node:fs';
const chain=JSON.parse(readFileSync('docs/evidence/v2-step15-current-state.json','utf8'));
if(chain.reads.length!==2||chain.reads.some(r=>!r.passed||!r.custodyCoversLiabilities))throw Error('Chain reconciliation unavailable');
const db=new DatabaseSync('.runtime/survival-public.sqlite',{readOnly:true});
try{
 const jobs=db.prepare('SELECT state,count(*) count FROM survival_settlements GROUP BY state').all();
 const pending=jobs.filter(j=>j.state!=='settled').reduce((n,j)=>n+Number(j.count),0);
 const runs=db.prepare('SELECT state FROM survival_funded_runs').all().map(r=>JSON.parse(String(r.state)));
 const active=runs.filter(r=>!['ended','banked'].includes(r.phase)).length;
 if(pending||active||chain.reads.some(r=>BigInt(r.amounts.lockedLiability)!==0n||BigInt(r.amounts.claimLiability)!==0n))throw Error('Pending funded work must be reconciled before freeze');
 const worker=await fetch('http://127.0.0.1:3002/survival/funded/config',{signal:AbortSignal.timeout(10000)}).then(r=>r.json());
 const report={checkedAt:new Date().toISOString(),mode:'LOCAL_SERVICE_PUBLIC_TESTNET_RECONCILIATION',chainId:46630,jobs,pendingJobs:pending,activeRuns:active,runCount:runs.length,worker:worker.settlementWorker,invalidCheckpoints:worker.invalidCheckpoints,codeVerifiedOnTwoProviders:true,rewardFree:chain.reads[0].amounts.rewardFree,welcomeRemaining:chain.reads[0].amounts.welcomeRemaining,vaultCustody:chain.reads[0].amounts.vaultCustody,lockedLiability:chain.reads[0].amounts.lockedLiability,claimLiability:chain.reads[0].amounts.claimLiability,publicHosting:false,limits:['Public worker needs free test gas before new allocations. No purchase or mainnet fallback.','Receipt confirmation is L2 soft confirmation, not Ethereum finality.','Private databases, authorizations, raw transactions and roles are excluded.']};
 writeFileSync('docs/evidence/v2-step20-reconciliation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{db.close();}
