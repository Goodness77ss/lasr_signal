import {installOperationNavigation} from './operation-navigation.ts';
import './stations.css';
import {Battlefield} from './scene.ts';
import {FieldReview} from './field-review.ts';
import {WEAPONS,type Observation,type GameEvent} from '@last-signal/sim';
import type {Action} from '@last-signal/protocol';

const version='weapon-lab-1',root=document.getElementById('app')!;
root.innerHTML='<header><h1>LAST SIGNAL · WEAPON LAB</h1><span class="mode">SERVER WEAPON LAB · AUTHORED TARGET · NO REWARDS</span><a href="/weapons.html">COLLECTIONS</a><p>Matched rifle and shotgun review. A static target cannot fire. This is an authored test scene, not a survival mission. No tokens, NFT rewards or saved progress.</p></header><div id="controls"><button id="rifle">START RIFLE</button><button id="shotgun">START SHOTGUN</button><button id="owned">USE SELECTED OWNED NFT</button><button id="pause" disabled>PAUSE</button><button id="switch" disabled>SWITCH WEAPON</button><button id="eyes">EYE LEVEL</button><button id="tactical">OVERHEAD</button><strong id="stats">Awaiting service</strong></div><p id="status" role="status"></p><div id="field"><div class="relay-label"></div><div class="relay-label"></div><div class="relay-label"></div></div><p>WASD moves, drag to look, click fires, R reloads. Shotgun: five bounded rays, total damage cap 30, range 8, cone 30 degrees. Damage falls after 2 units. Six rounds, 0.8 second cadence, 2.2 second reload. Rifle retains its longer range and faster fire.</p><div id="touch"><button id="fire">FIRE</button><button id="reload">RELOAD</button></div><div id="review-tools"></div>';
installOperationNavigation(document.querySelector('header')!);
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const scene=new Battlefield(el('field'),Array.from(document.querySelectorAll<HTMLElement>('.relay-label')),true);scene.setView('eyes');
let socket:WebSocket|null=null,observation:Observation|null=null,events:GameEvent[]=[],paused=true,sequence=0,lastShot=0,auto=false,context:Record<string,unknown>={},last=performance.now(),fireAt=0,driveAt=0,dragging=false,firing=false;
const held=new Set<string>(),prefix=crypto.randomUUID();
const review=new FieldReview(scene,()=>auto?'SERVER_WEAPON_LAB_AUTOMATED':'SERVER_WEAPON_LAB',()=>context,el('review-tools'));
review.addReviewControl('MATCHED TARGET ASSIST: OFF',button=>{auto=!auto;button.textContent='MATCHED TARGET ASSIST: '+(auto?'ON':'OFF');});
const note=(text:string)=>el('status').textContent=text;
const send=(value:object)=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({...value,version}));};
const hero=()=>observation?.squads.find(s=>s.id===observation!.hero?.squadId);
function order(action:Action){if(!paused&&!scene.contextLost)send({op:'command',id:prefix+':'+ ++sequence,action});}
function start(weapon:'rifle'|'shotgun'|'owned'){
 socket?.close();observation=null;events=[];paused=true;lastShot=0;scene.resetMatch();
 const current=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/weapon-lab`);socket=current;
 current.onopen=()=>{if(weapon==='owned'){void (async()=>{try{const auth=JSON.parse(sessionStorage.getItem('last-signal-testnet-auth')??'null');if(!auth?.session||auth.expires<=Date.now())throw Error('Connect and select an owned NFT in Collections first.');const response=await fetch('/api/weapons/loadout',{headers:{Authorization:'Bearer '+auth.session}}),selected=await response.json();if(!response.ok||!selected?.asset)throw Error(selected?.error??'Select an owned asset first');if(socket!==current)return;send({op:'start',asset:selected.asset,session:auth.session});}catch(e){note((e as Error).message);current.close();}})();}else send({op:'start',weapon});};
 current.onclose=()=>{if(socket===current){paused=true;note('Lab connection closed. Start a fresh scene. No rewards or progress are lost.');}};
 current.onmessage=event=>{if(socket!==current)return;const m=JSON.parse(String(event.data));if(m.op==='error'){note(m.reason);return;}if(m.op==='ack'){if(!m.ok)note(m.reason);return;}if(m.op!=='snapshot'||m.version!==version)return;observation=m.observation;events=m.events;paused=m.paused;const h=hero();if(!h)return;
  for(const e of events)if(e.kind==='PlayerShot'&&e.side===0&&e.seq>lastShot){scene.fireWeapon();lastShot=e.seq;}
  const target=observation!.squads.find(s=>s.side===1),remaining=Math.max(0,h.reloadUntil-observation!.tick)/20;
  el('stats').textContent=`${WEAPONS[h.weapon].name} · ${h.ammo} / ${h.reserveAmmo} · ${remaining?'RELOAD '+remaining.toFixed(1)+'s':paused?'PAUSED':'READY'} · Target HP ${target?.hp??0}`;
  el<HTMLButtonElement>('pause').disabled=!!observation!.result;el('pause').textContent=paused?'RESUME':'PAUSE';el<HTMLButtonElement>('switch').disabled=paused||h.weapons.length<2;
  context={weapon:h.weapon,ammo:h.ammo,reserve:h.reserveAmmo,targetHp:target?.hp??0,mode:'SERVER_WEAPON_LAB',automated:auto,authoredTarget:true,tickProfile:m.tickProfile,ownedAsset:m.ownedAsset,paused};
  note(observation!.result?'Scene ended. Start another matched scene.':m.ownedAsset?'Verified owned NFT. Ownership is rechecked while playing.':'Free practice entitlement. No wallet ownership claimed.');
 };
}
el('rifle').onclick=()=>start('rifle');el('shotgun').onclick=()=>start('shotgun');el('owned').onclick=()=>start('owned');
el('pause').onclick=()=>send({op:'pause',paused:!paused});el('switch').onclick=()=>order({kind:'switchWeapon',squadId:hero()?.id??1});el('eyes').onclick=()=>scene.setView('eyes');el('tactical').onclick=()=>scene.setView('tactical');
el('fire').onclick=()=>order({kind:'fire',squadId:hero()?.id??1,direction:scene.aimDirection()});el('reload').onclick=()=>order({kind:'reload',squadId:hero()?.id??1});
window.addEventListener('keydown',e=>{if(e.repeat)return;const key=e.key.toLowerCase();held.add(key);if(['w','a','s','d','r'].includes(key))e.preventDefault();if(key==='r')el('reload').click();});window.addEventListener('keyup',e=>held.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{held.clear();firing=false;dragging=false;});
const field=el('field');field.oncontextmenu=e=>e.preventDefault();field.onpointerdown=e=>{if(scene.contextLost)return;field.setPointerCapture(e.pointerId);dragging=true;if(e.button===0){firing=true;el('fire').click();}if(e.button===2)scene.view.aiming=true;};field.onpointermove=e=>{if(dragging)scene.view.rotate(e.movementX,e.movementY);};field.onpointerup=field.onpointercancel=()=>{dragging=false;firing=false;scene.view.aiming=false;};
scene.renderer.domElement.addEventListener('webglcontextlost',()=>{held.clear();firing=false;review.interrupt('Graphics context lost');send({op:'pause',paused:true});});
function frame(now:number){
 if(!["w","a","s","d"].some(key=>held.has(key)))scene.view.releaseMovement();
const dt=Math.min(.1,(now-last)/1000);last=now;const h=hero();if(h&&!paused&&!scene.contextLost&&!observation?.result){
 if(now-fireAt>=100){fireAt=now;if(auto){const target=observation!.squads.find(s=>s.side===1);if(target&&h.ammo&&!h.reloadUntil){const dx=target.x-h.x,dz=target.z-h.z,length=Math.hypot(dx,dz);if(length>0)order({kind:'fire',squadId:h.id,direction:{x:dx/length,y:0,z:dz/length}});}else if(!h.ammo&&h.reserveAmmo&&!h.reloadUntil)order({kind:'reload',squadId:h.id});}else if(firing)el('fire').click();}
 if(now-driveAt>=100){driveAt=now;const forward=Number(held.has('w'))-Number(held.has('s')),strafe=Number(held.has('d'))-Number(held.has('a'));order({kind:'drive',squadId:h.id,direction:scene.view.direction(forward,strafe)});}
 }if(observation&&!scene.contextLost)scene.update(observation,observation.hero?.squadId??null,events,dt);review.update(now);requestAnimationFrame(frame);}
requestAnimationFrame(frame);
void fetch('/api/weapon-lab/config').then(r=>r.json()).then(c=>{if(!c.enabled){for(const id of ['rifle','shotgun','owned'])el<HTMLButtonElement>(id).disabled=true;note('Weapon lab disabled. Enable SURVIVAL_WEAPON_LAB=true on the local service.');}else note('Ready. Choose a matched practice scene or your selected owned NFT.');}).catch(()=>note('Local service unavailable.'));
