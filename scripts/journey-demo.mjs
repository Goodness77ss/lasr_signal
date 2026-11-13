import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline';
const root=resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
const directory=resolve(root,'.runtime/journey-demo',randomUUID());mkdirSync(directory,{recursive:true});
async function freePort(){const server=createServer();return new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const address=server.address();server.close(error=>error?reject(error):done(address.port));});});}
const selected=new Set();async function distinctPort(){let port;do{port=await freePort();}while(selected.has(port));selected.add(port);return port;}
const ports={rpc:await distinctPort(),service:await distinctPort(),web:await distinctPort(),review:await distinctPort()};
const origin='http://127.0.0.1:'+ports.web;
const env={...process.env,JOURNEY_MANAGED:'true',JOURNEY_RPC_PORT:String(ports.rpc),JOURNEY_SERVICE_PORT:String(ports.service),JOURNEY_WEB_PORT:String(ports.web),JOURNEY_REVIEW_PORT:String(ports.review),ALLOWED_ORIGINS:origin+',http://localhost:'+ports.web,LAST_SIGNAL_SERVICE_ORIGIN:'http://127.0.0.1:'+ports.service};
let service,web,closing=false,ready=false;
const record={environment:'DISPOSABLE_LOCAL_BLOCKCHAIN',startedAt:new Date().toISOString(),ports,preview:origin+'/?mode=journey-server',practice:origin+'/?mode=journey',armory:origin+'/armory.html',recovery:origin+'/journey-recovery.html',status:'STARTING'};
const save=()=>writeFileSync(resolve(directory,'session.json'),JSON.stringify(record,null,2)+'\n');save();
function terminate(child){if(!child||child.exitCode!==null)return;if(process.platform==='win32')spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGTERM');}
function stop(reason='Stopped by owner'){
 if(closing)return;closing=true;if(reason!=='Stopped by owner')process.exitCode=1;record.status='STOPPING';record.reason=reason;save();console.log(reason);
 web&&terminate(web);if(service?.exitCode===null)service.stdin.write('stop\n');
 const force=setTimeout(()=>{terminate(service);record.status='STOPPED';save();process.exitCode=reason==='Stopped by owner'?0:1;process.stdin.pause();},8000);force.unref();
 if(!service||service.exitCode!==null){clearTimeout(force);record.status='STOPPED';save();process.stdin.pause();}
}
process.once('SIGINT',()=>stop());process.once('SIGTERM',()=>stop());process.stdin.setEncoding('utf8');process.stdin.on('data',data=>{if(String(data).trim()==='stop')stop();});process.stdin.resume();
console.log('Starting a new disposable Journey session. Existing sessions are left running.');
console.log('Session record: '+resolve(directory,'session.json'));
service=spawn(process.execPath,['--import','tsx','packages/contracts/scripts/journey-development.ts'],{cwd:root,env,windowsHide:true,stdio:['pipe','pipe','pipe']});record.servicePid=service.pid;save();
const startup=setTimeout(()=>{if(!ready)stop('Local deployment did not become ready within three minutes');},180000);startup.unref();
service.stderr.on('data',data=>process.stderr.write(data));
const lines=createInterface({input:service.stdout});
lines.on('line',line=>{
 process.stdout.write(line+'\n');let value;try{value=JSON.parse(line);}catch{return;}
 if(!value.ready||ready||closing)return;ready=true;clearTimeout(startup);record.status='SERVICE_READY';record.owner=value.owner;record.publicManifest=value.publicManifest;save();
 const vite=resolve(dirname(require.resolve('vite')),'../../bin/vite.js');
 web=spawn(process.execPath,[vite,'--host','127.0.0.1','--port',String(ports.web),'--strictPort','--mode','journey'],{cwd:resolve(root,'apps/web'),env,windowsHide:true,stdio:['ignore','pipe','pipe']});record.webPid=web.pid;save();
 web.stdout.on('data',data=>{const message=String(data);process.stdout.write(message);if(message.includes('Local:')){record.status='READY';save();console.log(JSON.stringify({...record,sessionFile:resolve(directory,'session.json'),stop:'Type stop then Enter in this terminal',limits:'Authored local assets. Gameplay, wallet and integration acceptance remain unverified.'},null,2));}});
 web.stderr.on('data',data=>process.stderr.write(data));web.once('error',error=>stop('Frontend launch failed: '+error.message));web.once('exit',code=>{if(!closing)stop('Frontend exited with code '+code);});
});
service.once('error',error=>{clearTimeout(startup);stop('Service launch failed: '+error.message);});
service.once('exit',code=>{clearTimeout(startup);if(!closing)stop('Local service exited with code '+code);else{record.status='STOPPED';save();process.stdin.pause();}lines.close();});
