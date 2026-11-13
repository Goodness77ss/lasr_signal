import {performance} from 'node:perf_hooks';
import {command,createGame,observe,step,WEAPONS,type Game,type Weapon} from '@last-signal/sim';
import {parseClient,MAX_BYTES} from '@last-signal/protocol';
import {weaponAsset,type WeaponAsset,weaponBuildHash} from '@last-signal/chain';
import type {WeaponCatalog} from './weapon-catalog.ts';
import type {Peer} from './rooms.ts';

export const WEAPON_LAB_VERSION='weapon-lab-1';
type Run={game:Game;peer:Peer;paused:boolean;started:number;fresh:number;wallet?:string;asset?:WeaponAsset;costs:number[]};
// An isolated, unfunded combat review. Existing station and funded rules do not
// opt into this mode, and this service cannot authorize tokens or NFT rewards.
export class WeaponLab{
 private runs=new Set<Run>();private connections=0;private polling=false;
 constructor(readonly enabled:boolean,private catalog:WeaponCatalog,private now:()=>number=Date.now){}
 config(){return {enabled:this.enabled,mode:'SERVER_WEAPON_LAB',version:WEAPON_LAB_VERSION,rewards:false,persistence:'EPHEMERAL',weapons:WEAPONS,shotgun:{range:8,coneDegrees:30,pellets:5,maxDamage:30,buildHash:weaponBuildHash(2)}};}
 connect(peer:Peer,identify:(session:string)=>string|null){
  if(!this.enabled||this.connections>=16){peer.close(1008);return {receive:async(_raw:string)=>{},close:()=>{}};}
  this.connections++;let run:Run|null=null,closed=false,starting=false,window=this.now(),messages=0;
  const send=(value:unknown)=>{if(!closed)peer.send(JSON.stringify(value));};
  return {receive:async(raw:string)=>{try{
   if(closed)return;if(Buffer.byteLength(raw)>MAX_BYTES)throw Error('Message too large');
   if(this.now()-window>=1000){window=this.now();messages=0;}if(++messages>40)throw Error('Control rate exceeded');
   const m=JSON.parse(raw);if(!m||m.version!==WEAPON_LAB_VERSION)throw Error('Weapon lab version required');
   const exact=(keys:string[])=>{if(Object.keys(m).sort().join(',')!==[...keys,'version'].sort().join(','))throw Error('Invalid lab message');};
   if(m.op==='start'){
    if(run||starting)throw Error('One lab run per connection');starting=true;
    try{
     let weapon:Weapon,asset:WeaponAsset|undefined,wallet:string|undefined;
     if(m.asset!==undefined){exact(['op','asset','session']);if(typeof m.session!=='string')throw Error('Wallet login required');wallet=identify(m.session)??undefined;if(!wallet)throw Error('Wallet login required');asset=weaponAsset(m.asset);const owned=await this.catalog.registry?.owned(asset,wallet);if(!owned)throw Error('Verified collection unavailable');weapon=owned.weapon;if(owned.version==='SURVIVAL_V2'&&owned.buildHash!==weaponBuildHash(owned.kind))throw Error('Weapon build mismatch');}
     else {exact(['op','weapon']);if(!['rifle','shotgun'].includes(m.weapon))throw Error('Choose a supported lab weapon');weapon=m.weapon;}
     if(closed)return;const game=createGame(1,{untimed:true,hero:true});game.countdown=0;game.budgets=[0,0];
     Object.assign(game.squads[0],{x:21,z:16,weapon,weapons:weapon==='rifle'?['rifle']:['rifle',weapon],ammo:WEAPONS[weapon].magazine,reserveAmmo:80,members:1});
     // Authored matched scene, not an ordinary survival run. Helpers and target
     // fire are disabled so measurements compare only the selected weapon.
     Object.assign(game.squads[1],{x:26,z:16,disabledUntil:Number.MAX_SAFE_INTEGER,hp:3000,members:1});
     run={game,peer,paused:false,started:this.now(),fresh:this.now(),wallet,asset,costs:[]};this.runs.add(run);send(this.snapshot(run));
    }finally{starting=false;}return;
   }
   if(!run)throw Error('Start a lab run');
   if(m.op==='pause'){exact(['op','paused']);if(typeof m.paused!=='boolean')throw Error('Invalid pause');run.paused=m.paused;send(this.snapshot(run));return;}
   exact(['op','id','action']);if(m.op!=='command')throw Error('Only lab commands accepted');if(run.paused||run.asset&&this.now()-run.fresh>=3000)throw Error('Lab paused or ownership read stale');
   const parsed=parseClient(JSON.stringify({op:'command',id:m.id,action:m.action}));if(parsed.op!=='command')throw Error('Invalid command');
   const a=parsed.action;if(!['move','drive','fire','reload','switchWeapon','surrender'].includes(a.kind)||a.kind!=='surrender'&&(!('squadId'in a)||a.squadId!==run.game.hero?.squadId))throw Error('Only your lab character controls are allowed');
   send({op:'ack',id:m.id,...command(run.game,{...a,id:m.id,side:0})});
  }catch(e){send({op:'error',reason:(e as Error).message});}},close:()=>{if(closed)return;closed=true;this.connections--;if(run)this.runs.delete(run);}};
 }
 private snapshot(r:Run){const costs=[...r.costs].sort((a,b)=>a-b);return {op:'snapshot',...this.config(),paused:r.paused,ownedAsset:r.asset??null,observation:observe(r.game,0),events:r.game.events,tickProfile:{samples:costs.length,p95Ms:costs[Math.floor(costs.length*.95)]??null,peakMs:costs.at(-1)??null}};}
 tick(){for(const r of this.runs){if(this.now()-r.started>=900000||r.game.tick>=12000){r.peer.close(1000);this.runs.delete(r);continue;}if(r.paused||r.game.result||r.asset&&this.now()-r.fresh>=3000)continue;const start=performance.now();step(r.game,{legacyObjectives:false});r.game.seen={};r.costs.push(performance.now()-start);if(r.costs.length>128)r.costs.shift();if(r.game.tick%2===0)r.peer.send(JSON.stringify(this.snapshot(r)));}}
 async poll(){if(this.polling)return;this.polling=true;try{for(const r of this.runs)if(r.asset&&r.wallet)try{await this.catalog.registry!.owned(r.asset,r.wallet);r.fresh=this.now();}catch{r.fresh=0;r.paused=true;r.peer.send(JSON.stringify({op:'error',reason:'Ownership no longer verified. Lab paused.'}));r.peer.send(JSON.stringify(this.snapshot(r)));}}finally{this.polling=false;}}
 close(){for(const r of this.runs)r.peer.close(1001);this.runs.clear();}
}
