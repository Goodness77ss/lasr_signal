import {DatabaseSync,backup} from 'node:sqlite';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
const mode=process.argv[2],source=resolve(process.argv[3]??''),destination=resolve(process.argv[4]??''),runtime=resolve('.runtime');
if(!['backup','restore'].includes(mode)||process.argv.length!==5||!source.startsWith(runtime+sep)||!destination.startsWith(runtime+sep)||source===destination)throw Error('Use backup or restore with distinct existing source and new destination inside this workspace .runtime directory');
if(!existsSync(source)||existsSync(destination))throw Error('Existing source and unused destination required');
mkdirSync(dirname(destination),{recursive:true});
const input=new DatabaseSync(source,{readOnly:true});
try{await backup(input,destination);}finally{input.close();}
const digest=createHash('sha256').update(readFileSync(destination)).digest('hex');
writeFileSync(destination+'.backup.json',JSON.stringify({operation:mode,createdAt:new Date().toISOString(),sha256:digest,method:'node:sqlite online backup',privateRuntimeOnly:true},null,2)+'\n');
console.log(JSON.stringify({operation:mode,destination,sha256:digest,limits:'Private database backup. Exclude from submission archives.'}));
