// Disposable local proof child. Private values arrive only through the child environment and are never logged.
import {DatabaseSync} from 'node:sqlite';
import {JsonRpcProvider,Wallet} from 'ethers';
import {SurvivalSettlements,SurvivalSettlementWorker} from '../../../apps/server/src/survival-settlements.ts';
import {LocalSurvivalVaultTransport} from '../../../apps/server/src/survival-vault-transport.ts';
const config=JSON.parse(process.env.LAST_SIGNAL_LOCAL_WORKER_PROOF??'null');
if(!config||!/^http:\/\/127\.0\.0\.1:\d+$/.test(config.rpc))throw Error('Local proof environment required');
const provider=new JsonRpcProvider(config.rpc,undefined,{cacheTimeout:-1,batchMaxCount:1}),db=new DatabaseSync(config.database);db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL');
try{
 const gas=new Wallet(config.gasKey,provider),gameplay=new Wallet(config.gameplayKey),manifest={...config.manifest,chain:BigInt(config.manifest.chain)};
 const transport=new LocalSurvivalVaultTransport(provider,gas,gas.address,manifest),jobs=new SurvivalSettlements(db);
 if(process.env.LAST_SIGNAL_PROOF_CRASH==='true'){const broadcast=transport.broadcast.bind(transport);transport.broadcast=async raw=>{await broadcast(raw);process.stdout.write('CONFIRMED_BROADCAST_BOUNDARY\n');process.exit(17);};}
 const worker=new SurvivalSettlementWorker(jobs,transport,gameplay,2,30000,10n**15n);
 for(let tries=0;tries<40;tries++){await worker.poll();if(!jobs.pending().length||process.env.LAST_SIGNAL_PROOF_CRASH==='true')break;await new Promise(r=>setTimeout(r,2000));}
 if(jobs.pending().length)process.exitCode=2;else console.log('CANONICAL_SETTLEMENT_CONFIRMED');
}catch{console.error('Local worker proof child failed; private diagnostics suppressed');process.exitCode=1;}finally{db.close();provider.destroy();}
