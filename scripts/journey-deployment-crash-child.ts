import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {JsonRpcProvider} from 'ethers';
import {SoldierCollections,type SoldierCollectionDeployment} from '../apps/server/src/journey-soldiers.ts';
import {JourneyDeploymentJournal,type DeploymentRequest} from '../apps/server/src/journey-deployments.ts';
// Only the disposable integration test launches this helper. No wallet keys or
// signatures cross IPC. Abrupt exit intentionally skips database shutdown.
const [message]=await once(process,'message');
const {file,url,deployment,request}=message as {file:string;url:string;deployment:SoldierCollectionDeployment;request:DeploymentRequest};
if(new URL(url).hostname!=='127.0.0.1'||deployment.chainId!==31337)throw Error('Disposable loopback chain only');
const provider=new JsonRpcProvider(url,undefined,{cacheTimeout:-1,batchMaxCount:1}),db=new DatabaseSync(file);
db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
await new JourneyDeploymentJournal(db,new SoldierCollections(provider,deployment)).reserve([request]);
process.exit(74);
