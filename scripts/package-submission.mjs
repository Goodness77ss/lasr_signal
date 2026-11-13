import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,copyFileSync,statSync} from 'node:fs';
import {resolve,relative,dirname,sep} from 'node:path';
const root=process.cwd(),privateRoot=resolve(root,'.runtime');mkdirSync(privateRoot,{recursive:true});
const stage=mkdtempSync(resolve(privateRoot,'submission-'));
if(!stage.startsWith(privateRoot+sep))throw Error('Submission staging must stay in private runtime');
const names=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean))].sort();
const files=[];
for(const name of names){
 if(name.split('/').some(p=>['.git','.runtime','node_modules','dist','artifacts'].includes(p))||/\.(dpapi|pem|key|sqlite|log)$/i.test(name)||/(^|\/)\.env(?!\.example$)/.test(name))continue;
 const source=resolve(root,name),inside=relative(root,source);if(inside.startsWith('..')||!source.startsWith(root+sep))throw Error('Source escapes repository');
 if(!statSync(source).isFile())continue;const data=readFileSync(source),target=resolve(stage,name);
 if(!/\.(png|jpe?g|webp|gif|ico|woff2?|mp[34]|wav|pdf|zip)$/i.test(name)){
  const content=data.toString('utf8');
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)||/PRIVATE_KEY\s*[:=]\s*["']?(?:0x)?[a-fA-F0-9]{64}\b/.test(content)||/"(?:privateKey|raw_transaction|signature)"\s*:\s*"0x[a-fA-F0-9]{128,}"/.test(content))throw Error('Protected material detected; packaging stopped: '+name);
 }if(!target.startsWith(stage+sep))throw Error('Target escapes stage');
 mkdirSync(dirname(target),{recursive:true});copyFileSync(source,target);files.push({path:name,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
}
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const manifest={createdAt:new Date().toISOString(),baseRevision:revision,uncommittedWorkPreserved:true,sourceAndEvidenceDigest:createHash('sha256').update(JSON.stringify(files)).digest('hex'),files,excluded:['Private runtime and databases','Protected roles and wallet sessions','Environment files except the public example','Installed dependencies and generated builds','Git metadata'],scope:'See docs/SUBMISSION_PRIORITIES.md and docs/JOURNEY_IMPLEMENTATION_STATUS.md. Steps 26 and 28 deferred by owner. Latest unverified work is identified in docs/STATUS.md. Local prototype; no public hosting/mainnet/audit claim.'};
writeFileSync(resolve(stage,'SUBMISSION_MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({stage,files:files.length,baseRevision:revision,digest:manifest.sourceAndEvidenceDigest},null,2));

const archive=stage+'.zip';execFileSync('powershell.exe',['-NoProfile','-Command','Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory(\u0024env:JOURNEY_STAGE,\u0024env:JOURNEY_ARCHIVE)'],{env:{...process.env,JOURNEY_STAGE:stage,JOURNEY_ARCHIVE:archive},windowsHide:true});console.log(JSON.stringify({archive}));

