import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {cpSync,copyFileSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,relative,resolve,sep} from 'node:path';
const root=resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),runtime=resolve(root,'.runtime');mkdirSync(runtime,{recursive:true});
const vite=resolve(dirname(require.resolve('vite')),'../../bin/vite.js');
execFileSync(process.execPath,[vite,'build','--mode','journey'],{cwd:resolve(root,'apps/web'),stdio:'inherit',windowsHide:true});
const output=execFileSync(process.execPath,['scripts/package-submission.mjs'],{cwd:root,encoding:'utf8',windowsHide:true});
const {archive:sourceArchive}=JSON.parse(output.trim().split(/\r?\n/).at(-1));
if(typeof sourceArchive!=='string'||!resolve(sourceArchive).startsWith(runtime+sep))throw Error('Unexpected source archive location');
const stage=mkdtempSync(resolve(runtime,'journey-release-'));copyFileSync(sourceArchive,resolve(stage,'source-and-evidence.zip'));cpSync(resolve(root,'apps/web/dist'),resolve(stage,'frontend'),{recursive:true});
const digest=data=>createHash('sha256').update(data).digest('hex'),files=[];
function walk(directory){for(const entry of readdirSync(directory,{withFileTypes:true})){const path=resolve(directory,entry.name);if(entry.isSymbolicLink())throw Error('Unexpected release symlink');if(entry.isDirectory()){walk(path);continue;}const data=readFileSync(path);if(/\.(?:js|css|html|json|txt|md)$/i.test(path)){const content=data.toString('utf8');if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)||/PRIVATE_KEY\s*[:=]\s*["']?(?:0x)?[a-fA-F0-9]{64}\b/.test(content)||/"(?:privateKey|raw_transaction|signature)"\s*:\s*"0x[a-fA-F0-9]{128,}"/.test(content))throw Error('Protected material detected in frontend; release stopped');}files.push({path:relative(stage,path).split(sep).join('/'),bytes:data.length,sha256:digest(data)});}}
walk(resolve(stage,'frontend'));
for(const name of ['JOURNEY_DEMO_LAUNCH.md','JOURNEY_INDEPENDENT_RECOVERY.md','SUBMISSION_HANDOFF.md'])copyFileSync(resolve(root,'docs',name),resolve(stage,name));
writeFileSync(resolve(stage,'START_HERE.md'),`# LAST SIGNAL Journey local prototype

Extract source-and-evidence.zip into a new directory. Use Node.js 24 or newer, run npm ci, then npm run journey:demo. The launcher prints the actual browser and wallet RPC URLs and leaves existing sessions alone. Type stop then Enter in its terminal to close that session.

For owned assets, set JOURNEY_DEV_OWNER to your public local wallet address before launch. Never provide a private key. The default account is a fresh fixture account; the free roster needs no wallet.

The frontend directory contains the generated Journey production bundle. Serve it over HTTP. Authoritative play and Armory need an API proxy to the matching local service. Independent recovery needs the saved public deployment metadata and wallet RPC but not the game API.

Steps 26 and 28 are deferred by the owner. Latest combined roster, settlement, recovery and navigation source is unverified. No new tests or strict type checks were run. The owner accepted a short free-roster demonstration; this does not establish wallet or combined chain acceptance. Public testnet is excluded. The primary Endless route is preserved while required gates remain open.

Read JOURNEY_DEMO_LAUNCH.md for the demo and interruption route. A new launch creates a fresh disposable chain; a database backup alone cannot restore it. No private databases, environment files, keys or runtime signatures are included.
`);
const manifest={createdAt:new Date().toISOString(),baseRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),worktreeChangesIncluded:true,node:process.version,frontendBuild:'vite build --mode journey',sourceSchemaVersion:9,restoreProofComplete:false,testsRun:false,typecheckRun:false,environment:'LOCAL_PROTOTYPE',publicTestnet:'EXCLUDED',deferredSteps:[26,28],primaryEndlessChanged:false,sourceArchiveSHA256:digest(readFileSync(sourceArchive)),files};
writeFileSync(resolve(stage,'RELEASE_MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
const archive=resolve(runtime,'LAST_SIGNAL_JOURNEY_RELEASE_'+new Date().toISOString().replace(/[:.]/g,'_')+'.zip');
execFileSync('powershell.exe',['-NoProfile','-Command','Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory($env:JOURNEY_RELEASE_STAGE,$env:JOURNEY_RELEASE_ARCHIVE)'],{env:{...process.env,JOURNEY_RELEASE_STAGE:stage,JOURNEY_RELEASE_ARCHIVE:archive},windowsHide:true});
console.log(JSON.stringify({archive,sourceArchive,frontendFiles:files.length,status:'PACKAGED_WITH_OPEN_ACCEPTANCE_GATES'}));
