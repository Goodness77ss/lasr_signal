import {registerRoundExit} from './operation-navigation.ts';
import './style.css';
import './immersive.css';
import './old-front.css';
import './guidance.css';
import './shooter.css';
import './survival.css';
import './polish.css';
import './station-shell.css';
import {mountStationShell,finishStationShell,stationElementId} from './station-shell.ts';
import {StationPresentation} from './station-presentation.ts';
import { Battlefield } from './scene.ts';
import { SURVIVAL_PROTOCOL,lineOfSight,createGame,observe, type Observation, type Point, type GameEvent } from '@last-signal/sim';
import type { Action } from '@last-signal/protocol';
import {FieldReview} from './field-review.ts';

const root=document.getElementById('app')!;
mountStationShell(root);
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(stationElementId(id)) as T;
const scene=new Battlefield(el('field'),Array.from(document.querySelectorAll<HTMLElement>('.relay-label')),true);scene.setView('squad');
const preview=observe(createGame(1,{untimed:true,hero:true}),0);
const pressureLabel=document.createElement('div');pressureLabel.id='pressure';pressureLabel.setAttribute('role','status');el('stations').before(pressureLabel);
const reviewTools=document.createElement('div');reviewTools.id='review-tools';root.append(reviewTools);
let reviewContext:Record<string,unknown>={mode:'Not playing'};
let assisted=false,assistAvailable=false,assistRouted=false,assistAt=0,assistSupportAt=0,fieldSnapshot:any=null,reviewCountdown=0,reviewOffer='';
const review=new FieldReview(scene,()=> assisted?'SERVER_PRACTICE_AUTOMATED_COMBAT':'SERVER_PRACTICE_V2',()=>({...reviewContext,automatedCombat:assisted}),reviewTools);
review.addReviewControl('COMBAT ASSIST FOR PRACTICE REVIEW: OFF',button=>{if(!assistAvailable)return;assisted=!assisted;assistRouted=false;button.textContent='COMBAT ASSIST FOR PRACTICE REVIEW: '+(assisted?'ON':'OFF');document.querySelector('.mode')!.textContent=assisted?'AUTOMATED COMBAT ASSIST · SERVER PRACTICE · NO TOKEN REWARDS':'SERVER PRACTICE V2 · NO TOKEN REWARDS';});
const ledgerPanel=document.createElement('details');ledgerPanel.id='reward-panel';
ledgerPanel.innerHTML='<summary id="reward-summary">SIMULATED STATION LEDGER · No wallet payout</summary><p id="reward-total">Start a new practice run to view eligibility.</p><ul id="reward-stations"></ul><ol id="reward-events"></ol><p>Practice units only. Not a wallet balance, token grant, claim or transferable asset.</p>';
el('stations').after(ledgerPanel);
const fieldPanel=document.createElement('details');fieldPanel.id='field-panel';fieldPanel.innerHTML='<summary id="field-summary">FIELD SUPPORT · Free starter</summary><p>Service rifle entitlement. Not tradable and never minted. Field credits expire at run end and cannot buy stakes, NFTs or listings.</p><button id="basic-ammo" disabled>20 SPARE ROUNDS · 5 FIELD CR</button><button id="basic-medical" disabled>UP TO 25 HEALTH · 10 FIELD CR</button><button id="field-pickup" disabled>TAKE NEARBY AMMO · G</button><p>Ammo cooldown: ten active seconds. Medical support: once per run, after five active seconds without damage. Healing does not restore fallen helpers.</p><p id="field-reply" role="status"></p>';
el('controls').after(fieldPanel);
const runPanel=document.createElement('details');runPanel.id='run-panel';runPanel.innerHTML='<summary id="run-summary">SIMULATED RUN FUNDS · ACCOUNTING</summary><p id="run-breakdown"></p><p>Available run funds can buy these supplies. Earned amounts are provisional simulation entries, not wallet tokens. Locked stakes cannot be spent. Bank and wallet settlement remain separate.</p><button id="run-ammo" disabled>40 SPARE ROUNDS · 5 SIM UNITS</button><button id="run-shield" disabled>SHIELD · 5 SIM UNITS</button><button id="run-recruit" disabled>REPLACEMENT HELPER · 10 SIM UNITS</button><p id="run-reply" role="status"></p><ol id="run-orders"></ol>';
ledgerPanel.after(runPanel);
const missionPanel=document.createElement('section');missionPanel.id='mission-panel';missionPanel.hidden=true;missionPanel.innerHTML='<strong>OPTIONAL HOLD THE SIGNAL · SIMULATED</strong><p id="mission-copy"></p><button id="mission-accept">ACCEPT · RISK 5 SIM UNITS</button><button id="mission-decline">DECLINE · FREE</button><details><summary>MISSION TERMS</summary><p>Retain ownership for thirty seconds after assault arrival and defeat every assigned attacker within sixty seconds. Success unlocks the accepted five and adds three bonus units. Failure consumes the accepted five once. Verified service abort unlocks it. The bonus is reserved only in this simulation.</p></details><p id="mission-reply" role="status"></p>';
pressureLabel.after(missionPanel);
const walletChoice=document.createElement('label');walletChoice.className='wallet-simulation';walletChoice.innerHTML='<input id="wallet-simulation" type="checkbox"> Use existing wallet login for simulated cap';fieldPanel.append(walletChoice);
let socket:WebSocket|null=null, rulesHash='',currentRulesHash='', ready=false, paused=true, observation:Observation|null=null, count=0, dragging=false, firing=false, events:GameEvent[]=[], lastShot=0;
const held=new Set<string>(),prefix=crypto.randomUUID();let last=performance.now(),driveAt=0,fireAt=0;
type Credential={run:string;token:string;rulesHash:string};let credential:Credential|null=null;
try{credential=JSON.parse(sessionStorage.getItem('last-signal-station-practice')??'null') as Credential|null;}catch{}
const note=(text:string)=>{el('status').textContent=text;el('station-ready-note').textContent=text;};
const send=(value:object)=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({...value,protocol:SURVIVAL_PROTOCOL,rulesHash}));};
function order(action:Action){if(!ready||paused||scene.contextLost||observation?.result)return;send({op:'command',id:prefix+':'+ ++count,action});}
function heroId(){return observation?.hero?.squadId??1;}
function fire(){order({kind:'fire',squadId:heroId(),direction:scene.aimDirection()});}
function pause(){held.clear();firing=false;if(scene.contextLost){note('Restore graphics before resuming. Server practice pause requested.');return;}send({op:'pause',paused:!paused});}
function basic(item:'BASIC_AMMO'|'BASIC_MEDICAL'){if(ready&&!scene.contextLost&&!observation?.result)send({op:'field',id:prefix+':field:'+ ++count,asset:'FIELD_CREDITS',item});}
function supply(item:'AMMO'|'SHIELD'|'RECRUIT'){if(ready&&!scene.contextLost&&!observation?.result)send({op:'supply',id:prefix+':supply:'+ ++count,asset:'RUN_TWIF',item});}
el('run-ammo').onclick=()=>supply('AMMO');el('run-shield').onclick=()=>supply('SHIELD');el('run-recruit').onclick=()=>supply('RECRUIT');
let missionId='';
function missionDecision(decision:'ACCEPT'|'DECLINE'){if(ready&&missionId&&!scene.contextLost&&!observation?.result)send({op:'mission',id:prefix+':mission:'+ ++count,asset:'RUN_TWIF',missionId,decision});}
el('mission-accept').onclick=()=>missionDecision('ACCEPT');el('mission-decline').onclick=()=>missionDecision('DECLINE');
const extractionPanel=document.createElement('details');extractionPanel.id='extraction-panel';extractionPanel.hidden=true;
extractionPanel.innerHTML='<summary id="extraction-summary">WESTERN EXTRACTION BANK · SIMULATED</summary><p id="extraction-copy"></p><button id="bank-route">GO TO BANK</button><button id="extract-start">EXTRACT · HOLD 8s</button><button id="extract-cancel">CANCEL EXTRACTION</button><p>Remain still and uncontested. Damage or movement cancels. Accepted missions must resolve first. Browser departure has sixty wall seconds of grace. New unextracted loot is lost on death or departure. Previously owned NFTs remain owned. No token claim or NFT mint exists in practice.</p><ul id="provisional-loot"></ul><p id="extraction-reply" role="status"></p>';
finishStationShell(fieldPanel,runPanel,ledgerPanel,extractionPanel,missionPanel,reviewTools);
let bankPoint:Point|null=null;
el('bank-route').onclick=()=>{if(bankPoint)order({kind:'move',squadId:heroId(),target:bankPoint});};
function extraction(decision:'START'|'CANCEL'){if(ready&&!paused&&!scene.contextLost&&!observation?.result)send({op:'extraction',id:prefix+':extraction:'+ ++count,decision});}
el('extract-start').onclick=()=>extraction('START');el('extract-cancel').onclick=()=>extraction('CANCEL');
function pickup(){if(!ready||paused||scene.contextLost||!observation)return;const hero=observation.squads.find(s=>s.id===heroId());const drop=hero?observation.loot.find(d=>Math.hypot(d.x-hero.x,d.z-hero.z)<=2):null;if(drop)send({op:'fieldLoot',id:prefix+':field:'+ ++count,lootId:drop.id});else el('field-reply').textContent='Reach an ammunition drop within two units.';}
el('basic-ammo').onclick=()=>basic('BASIC_AMMO');el('basic-medical').onclick=()=>basic('BASIC_MEDICAL');el('field-pickup').onclick=pickup;
const presentation=new StationPresentation(scene,{fire,reload:()=>order({kind:'reload',squadId:heroId()}),pickup,swap:()=>order({kind:'switchWeapon',squadId:heroId()}),pause,resume:()=>send({op:'pause',paused:false}),getState:()=>({ready,paused,observation})});
el<HTMLCanvasElement>('minimap').onclick=event=>{const rect=el('minimap').getBoundingClientRect();order({kind:'move',squadId:heroId(),target:{x:(event.clientX-rect.left)/rect.width*48,z:(event.clientY-rect.top)/rect.height*32}});};
function connect(resume:boolean){
  if(!rulesHash)return;if(!resume)rulesHash=currentRulesHash;socket?.close();ready=false;
  const current=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/survival`);socket=current;
  current.onopen=()=>{
    if(resume&&credential){rulesHash=credential.rulesHash;send({op:'resume',...credential});return;}
    const start:Record<string,unknown>={op:'start'};
    try{
      if(el<HTMLInputElement>('wallet-simulation').checked){const auth=JSON.parse(sessionStorage.getItem('last-signal-testnet-auth')??'null');if(!auth?.session||auth.expires<=Date.now()){note('An existing valid wallet login is required. Uncheck the option for anonymous free practice.');current.close();return;}start.walletSession=auth.session;}
      else{const token=localStorage.getItem('last-signal-practice-identity');if(token)start.practiceToken=token;}
    }catch{if(el<HTMLInputElement>('wallet-simulation').checked){note('Saved wallet login is unreadable. Uncheck the option for free anonymous practice.');current.close();return;}note('Practice identity storage unavailable. This run uses a new anonymous identity.');}
    send(start);
  };
  current.onclose=()=>{if(socket!==current)return;ready=false;paused=true;held.clear();firing=false;presentation.disconnected();note('Connection closed. Reconnect to restore your saved run paused.');el<HTMLButtonElement>('reconnect').disabled=false;};
  current.onerror=()=>note('The local game service is unavailable. Reconnect when it is running.');
  current.onmessage=event=>{
    if(socket!==current)return;const m=JSON.parse(String(event.data));
    if(m.op==='error'){if(quitPending){quitPending.reject(Error(m.reason));quitPending=null;}note(m.reason);return;}
    if(m.op==='session'){credential={run:m.run,token:m.token,rulesHash:m.rulesHash};try{sessionStorage.setItem('last-signal-station-practice',JSON.stringify(credential));if(m.practiceToken)localStorage.setItem('last-signal-practice-identity',m.practiceToken);}catch{}lastShot=0;assistRouted=false;reviewOffer='';for(const id of ['mission-reply','field-reply','run-reply','extraction-reply'])el(id).textContent='';scene.resetMatch();presentation.reset();presentation.changeView('eyes');return;}
    if(m.op==='ack'){if(quitPending&&quitPending.id===m.id){const pending=quitPending;quitPending=null;if(m.ok)pending.resolve();else pending.reject(Error(m.reason));}if(m.id.includes(':field:'))el('field-reply').textContent=m.reason;if(m.id.includes(':supply:'))el('run-reply').textContent=m.reason;if(m.id.includes(':mission:'))el('mission-reply').textContent=m.reason;if(m.id.includes(':extraction:'))el('extraction-reply').textContent=m.reason;if(!m.ok)note(m.reason);return;}
    if(m.op!=='snapshot'||m.protocol!==SURVIVAL_PROTOCOL||m.rulesHash!==rulesHash)return;
    observation=m.observation as Observation;ready=true;paused=m.paused;events=m.events;presentation.render(m);el<HTMLButtonElement>('reconnect').disabled=true;
    reviewCountdown=m.countdown;assistAvailable=m.mode==='SERVER_PRACTICE_V2'&&m.rewards===false;
    for(const event of events)if(event.seq>lastShot&&event.kind==='PlayerShot'&&event.side===0){scene.fireWeapon();lastShot=event.seq;}
    const hero=observation.squads.find(s=>s.id===heroId());
    const f=m.fieldAllowance;
    fieldSnapshot=f;
    el('field-summary').textContent=f?`FIELD CREDITS · ${f.credits} / 20 · FREE RIFLE · H`:'LEGACY RUN · NO FIELD ALLOWANCE';
    el<HTMLButtonElement>('basic-ammo').disabled=!f||!!observation.result||m.countdown>0||f.credits<f.ammoCost||observation.tick<f.ammoAt||(hero?.reserveAmmo??180)+f.ammoRounds>180;
    el<HTMLButtonElement>('basic-medical').disabled=!f||!!observation.result||m.countdown>0||f.credits<f.medicalCost||f.medicalUsed>=1||(hero?.hp??100)>=100||observation.tick-(hero?.lastHit??0)<100;
    el<HTMLButtonElement>('field-pickup').disabled=!f||paused||!!observation.result;
    const account=m.accounting;
    const lifecycle=m.lifecycle;extractionPanel.hidden=!lifecycle;if(lifecycle)el('extraction-summary').textContent=lifecycle.terminal?`RESULT · ${lifecycle.terminal.outcome} · ${lifecycle.terminal.simulatedBankCreditWhole} SIM BANK`:`WESTERN EXTRACTION BANK · ${lifecycle.channel?'CHANNELING':'8 SECOND HOLD'}`;bankPoint=lifecycle?{x:lifecycle.bank.bankX,z:lifecycle.bank.bankZ}:null;
    if(lifecycle){
      const remaining=lifecycle.channel?Math.max(0,Math.ceil((lifecycle.extractionSeconds*20-(observation.tick-lifecycle.channel.tick))/20)):null;
      el('extraction-copy').textContent=lifecycle.terminal?`${lifecycle.terminal.outcome} · simulated bank credit ${lifecycle.terminal.simulatedBankCreditWhole}. ${lifecycle.reason}`:`${lifecycle.channel?'CHANNELING · '+remaining+'s · ':''}${lifecycle.reason}`;
      el('provisional-loot').replaceChildren(...lifecycle.loot.map((l:{id:number;weapon:string;status:string})=>{const li=document.createElement('li');li.textContent=`Recovered ${l.weapon} · drop ${l.id} · ${l.status} · simulation only, no NFT`;return li;}));
    }
    el<HTMLButtonElement>('bank-route').disabled=!lifecycle||paused||!!observation.result||m.countdown>0;
    el<HTMLButtonElement>('extract-start').disabled=!lifecycle||paused||!!observation.result||!!lifecycle.channel||m.countdown>0;
    el<HTMLButtonElement>('extract-cancel').disabled=!lifecycle||paused||!!observation.result||!lifecycle.channel;
    el('run-summary').textContent=account?`AVAILABLE SIMULATED RUN FUNDS · ${account.availableWhole} · ACCOUNTING`:'LEGACY RUN · RUN SUPPLY LEDGER DISABLED';
    el('run-breakdown').textContent=account?`Deposit ${account.depositWhole} + station earnings ${account.stationWhole} + successful bonuses ${account.bonusWhole} − applied spending ${account.spentWhole} − failed stakes ${account.failedWhole} − locked stake ${account.lockedWhole} = available ${account.availableWhole}. Projected bank credit before unresolved locks: ${account.availableWhole+account.lockedWhole}. No wallet claim exists in practice.`:'Start a new run for run supplies and accounting.';
    el<HTMLButtonElement>('run-ammo').disabled=!account||!!observation.result||m.countdown>0||account.availableWhole<5||(hero?.reserveAmmo??180)+40>180;
    el<HTMLButtonElement>('run-shield').disabled=!account||!!observation.result||m.countdown>0||account.availableWhole<5||observation.tick<account.shieldAt||(hero?.shield??0)>0;
    el<HTMLButtonElement>('run-recruit').disabled=!account||!!observation.result||m.countdown>0||account.availableWhole<10||(hero?.members??3)>=3||observation.tick-(hero?.lastHit??0)<100||observation.tick<account.recruitAt;
    el('run-orders').replaceChildren(...(account?.orders??[]).map((o:{asset:string;item:string;applied:number;charged:number;reason:string})=>{const li=document.createElement('li');li.textContent=`${o.item} · ${o.asset} · ${o.applied?'APPLIED':'REJECTED'} · charged ${o.charged} · ${o.reason}`;return li;}));
    const p=m.pressure;
    const mission=m.mission?.current;missionId=mission?.id??'';missionPanel.hidden=!mission;
    if(assisted&&mission?.status==='OFFER'&&!paused&&reviewOffer!==mission.id){reviewOffer=mission.id;send({op:'pause',paused:true});}
    if(mission){
      const seconds=['OFFER','ACTIVE'].includes(mission.status)?Math.max(0,Math.ceil(((mission.status==='OFFER'?mission.offerUntil:mission.until??observation.tick)-observation.tick)/20)):0;
      el('mission-copy').textContent=`${mission.status} · Station ${mission.station} · ${seconds}s · Risk ${mission.stake} SIM, bonus ${mission.bonus} SIM. ${mission.reason}`;
    }
    el<HTMLButtonElement>('mission-accept').disabled=!mission||mission.status!=='OFFER'||!!observation.result;
    el<HTMLButtonElement>('mission-decline').disabled=!mission||mission.status!=='OFFER'||!!observation.result;
    const ledger=m.rewardLedger;
    el('reward-summary').textContent=ledger?`SIMULATED STATION REWARDS · ${ledger.totalWhole} / ${ledger.runCapWhole} · NO WALLET PAYOUT`:'LEGACY RUN · SIMULATED LEDGER DISABLED';
    el('reward-total').textContent=ledger?`Cycle ${Math.min(ledger.cycle,ledger.maxCycles)} / ${ledger.maxCycles}${ledger.cycle>ledger.maxCycles?' · reward cycles exhausted':''}. Rolling 24h cap remaining: ${ledger.rollingRemainingWhole} practice units. Scope: ${ledger.scopeKind}.`:'Start a new run for the version 2.2 simulated ledger. Existing runs keep their original rules.';
    el('reward-stations').replaceChildren(...(ledger?.stations??[]).map((s:{id:string;capture:boolean;defense:boolean;reason:string})=>{const li=document.createElement('li');li.textContent=`${s.id} · Capture ${s.capture?'recorded':'not recorded'} · Defense ${s.defense?'recorded':'not recorded'} · ${s.reason}`;return li;}));
    el('reward-events').replaceChildren(...(ledger?.events??[]).map((e:{station:string;cycle:number;kind:string;amountWhole:number})=>{const li=document.createElement('li');li.textContent=`Cycle ${e.cycle} · ${e.station} · ${e.kind} · +${e.amountWhole} simulated units`;return li;}));
    reviewContext={hud:`${paused?'PAUSED':'ACTIVE'} ${Math.floor(observation.tick/20)}s | HP ${Math.ceil(hero?.hp??0)} | ammo ${hero?.ammo??0}/${hero?.reserveAmmo??0} | ${account?.availableWhole??0} SIM available | lock ${account?.lockedWhole??0} | field ${f?.credits??0} | mission ${mission?.status??'none'} | ${lifecycle?.terminal?.outcome??'active'}`,missionStatus:mission?.status??null,available:account?.availableWhole??null,result:lifecycle?.terminal??null,rulesVersion:m.rulesVersion,rulesHash:m.rulesHash,activeSeconds:observation.tick/20,paused,pressure:p,tickProfile:m.tickProfile};
    pressureLabel.textContent=p?`THREAT ${p.tier} · ENEMIES ${p.enemies} / ${p.cap} · ${p.reason}${p.assault?.state==='preparing'?' · ARRIVAL IN '+p.assault.preparationSeconds+'s':''}`:'LEGACY STATION PRACTICE · Static defender. Start a new run for assaults.';
    el('stats').textContent=m.countdown>0?`START IN ${Math.ceil(m.countdown/20)}s`:`HP ${Math.ceil(hero?.hp??0)} · AMMO ${hero?.ammo??0} / ${hero?.reserveAmmo??0} · ${(observation.tick/20).toFixed(0)}s · ${account?.availableWhole??0} SIM AVAILABLE · ${f?.credits??0} FIELD CR`;
    el<HTMLButtonElement>('pause').disabled=!!observation.result||scene.contextLost;el('pause').textContent=paused?'RESUME':'PAUSE';el<HTMLButtonElement>('start').disabled=!observation.result;el<HTMLButtonElement>('end').disabled=scene.contextLost||!!observation.result||m.countdown>0;
    for(const [i,station] of observation.relays.entries()){
      const button=document.querySelector<HTMLButtonElement>(`[data-station="${i}"]`)!;
      button.disabled=paused||!!observation.result||m.countdown>0;
      button.querySelector('span')!.textContent=(station.contested?'CONTESTED':station.owner===0?'FRIENDLY':station.owner===1?'HOSTILE':'NEUTRAL')+' · '+m.stations[i].feedback;
    }
    if(observation.result)note('PRACTICE ENDED · '+observation.result.reason+'. No token or NFT rewards.');
    else if(scene.contextLost)note('Graphics lost. Server practice pause requested. Restore graphics, then choose RESUME. Wall time deadlines continue.');
    else if(paused)note('Paused. RESUME continues the same practice run.');
    else if(m.countdown>0||!hero)note('Preparing starter squad…');
    else{
      const nearby=observation.relays.find(r=>Math.hypot(hero.x-r.x,hero.z-r.z)<=3);
      note(nearby?m.stations[observation.relays.indexOf(nearby)].feedback:'Capture a station. Reach its ring and remain for five eligible seconds.');
    }
  };
}
el('start').onclick=()=>{credential=null;connect(false);};el('reconnect').onclick=()=>credential?connect(true):note('No practice session is saved in this tab.');
el('pause').onclick=pause;el('eyes').onclick=()=>presentation.changeView('eyes');el('tactical').onclick=()=>presentation.changeView('tactical');
el('end').onclick=()=>{if(!ready||scene.contextLost||observation?.result)return;held.clear();firing=false;send({op:'pause',paused:false});send({op:'command',id:prefix+':end:'+ ++count,action:{kind:'surrender'}});};el('fire').onclick=fire;el('reload').onclick=()=>order({kind:'reload',squadId:heroId()});
document.querySelectorAll<HTMLButtonElement>('[data-station]').forEach(button=>button.onclick=()=>{const station=observation?.relays[Number(button.dataset.station)];if(station)order({kind:'move',squadId:heroId(),target:{x:station.x-1,z:station.z}});});
let touch:Point|null=null;
document.querySelectorAll<HTMLButtonElement>('[data-move]').forEach(button=>{
  button.onpointerdown=event=>{button.setPointerCapture(event.pointerId);const [x,z]=button.dataset.move!.split(',').map(Number);touch={x,z};};
  button.onpointerup=button.onpointercancel=()=>{touch=null;order({kind:'drive',squadId:heroId(),direction:{x:0,z:0}});};
});
window.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.repeat||document.querySelector('dialog[open]'))return;const k=e.key.toLowerCase();if(['w','a','s','d','r','p','g','h'].includes(k))e.preventDefault();held.add(k);if(k==='r')order({kind:'reload',squadId:heroId()});if(k==='p')pause();if(k==='g')pickup();});
window.addEventListener('keyup',e=>{held.delete(e.key.toLowerCase());if(!(touch?.x||touch?.z)&&!["w","a","s","d"].some(key=>held.has(key)))scene.view.releaseMovement();if(['w','a','s','d'].includes(e.key.toLowerCase()))order({kind:'drive',squadId:heroId(),direction:{x:0,z:0}});});
window.addEventListener('blur',()=>{held.clear();firing=false;touch=null;});
document.addEventListener('station-release-input',()=>{held.clear();firing=false;touch=null;dragging=false;});
document.addEventListener('mouseup',e=>{if(e.button===0)firing=false;if(e.button===2)scene.view.aiming=false;});
const field=el('field');field.oncontextmenu=e=>e.preventDefault();
scene.renderer.domElement.addEventListener('webglcontextlost',()=>{held.clear();firing=false;touch=null;dragging=false;scene.view.aiming=false;review.interrupt('Graphics context lost');if(ready&&!observation?.result)send({op:'pause',paused:true});el<HTMLButtonElement>('pause').disabled=true;note('Graphics lost. Server practice pause requested. Restore graphics, then choose RESUME.');});
scene.renderer.domElement.addEventListener('webglcontextrestored',()=>{el<HTMLButtonElement>('pause').disabled=!ready||!!observation?.result;note('Graphics restored. Choose RESUME when ready.');});
field.onpointerdown=e=>{if(scene.contextLost||e.target!==scene.renderer.domElement||document.querySelector('dialog[open]'))return;if(scene.viewMode!=='eyes'){const point=scene.pick(e.clientX,e.clientY);if(point&&(e.button===2||e.pointerType==='touch'||scene.viewMode==='squad'))order({kind:'move',squadId:heroId(),target:point});return;}field.setPointerCapture(e.pointerId);dragging=true;if(e.button===0){firing=true;fire();}if(e.button===2)scene.view.aiming=true;};
field.onpointermove=e=>{if(dragging&&!presentation.handlesMouseLook)scene.view.rotate(e.movementX,e.movementY);};
field.onpointerup=field.onpointercancel=()=>{dragging=false;firing=false;scene.view.aiming=false;};
function frame(now:number){
 if(!(touch?.x||touch?.z)&&!["w","a","s","d"].some(key=>held.has(key)))scene.view.releaseMovement();

  const dt=Math.min(.1,(now-last)/1000);last=now;if(scene.contextLost){requestAnimationFrame(frame);return;}
  if(ready&&!paused&&!observation?.result&&!document.querySelector('dialog[open]')){
    if(assisted&&assistAvailable&&observation&&reviewCountdown===0&&now-assistAt>=250){
      assistAt=now;const hero=observation.squads.find(s=>s.id===heroId());
      if(hero){
        if(!assistRouted){const a=observation.relays[0];order({kind:'move',squadId:hero.id,target:{x:a.x-1,z:a.z}});assistRouted=true;}
        if(hero.ammo===0&&hero.reserveAmmo>0&&!hero.reloadUntil)order({kind:'reload',squadId:hero.id});
        const enemy=observation.squads.filter(s=>s.side===1&&Math.hypot(s.x-hero.x,s.z-hero.z)<=14&&lineOfSight(hero,s)).sort((a,b)=>a.hp-b.hp)[0];
        if(enemy&&hero.ammo>0&&!hero.reloadUntil){const dx=enemy.x-hero.x,dz=enemy.z-hero.z,length=Math.hypot(dx,dz);if(length>0)order({kind:'fire',squadId:hero.id,direction:{x:dx/length,y:0,z:dz/length}});}
        if(fieldSnapshot&&now-assistSupportAt>1000){assistSupportAt=now;if(hero.reserveAmmo<=40&&fieldSnapshot.credits>=5&&observation.tick>=fieldSnapshot.ammoAt)basic('BASIC_AMMO');else if(hero.hp<60&&fieldSnapshot.credits>=10&&fieldSnapshot.medicalUsed===0&&observation.tick-hero.lastHit>=100)basic('BASIC_MEDICAL');}
      }
    }
    if(now-driveAt>=100){driveAt=now;const forward=touch?.z??(Number(held.has('w'))-Number(held.has('s'))),strafe=touch?.x??(Number(held.has('d'))-Number(held.has('a')));if(forward||strafe)order({kind:'drive',squadId:heroId(),direction:scene.view.direction(forward,strafe)});}
    if(firing&&now-fireAt>=100){fireAt=now;fire();}
  }
  const view=observation??preview;scene.update(view,view.hero?.squadId??null,events,dt);presentation.frame(view,events,now);review.update(now);requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
void fetch('/api/survival/config').then(r=>r.json()).then(config=>{if(!config.enabled){el<HTMLButtonElement>('start').disabled=true;note('Survival is unavailable. Original local modes are available from Operations.');return;}rulesHash=config.rulesHash;currentRulesHash=config.rulesHash;note('Ready. Deploy into Station Survival. Free practice, no wallet required.');if(new URLSearchParams(location.search).get('play')==='1')connect(false);}).catch(()=>note('Start the local game service to play station practice.'));

window.addEventListener('pagehide',()=>{socket?.close();presentation.dispose();review.dispose();scene.dispose();},{once:true});

let quitPending:{id:string;resolve:()=>void;reject:(error:Error)=>void}|null=null;
registerRoundExit(()=>new Promise<void>((resolve,reject)=>{if(!observation||observation.result){resolve();return;}if(!ready||socket?.readyState!==WebSocket.OPEN){reject(Error('Reconnect to your round before quitting. Its rewards have not been forfeited yet.'));return;}const id=prefix+':quit:'+ ++count;quitPending={id,resolve,reject};held.clear();firing=false;send({op:'command',id,action:{kind:'surrender'}});setTimeout(()=>{if(quitPending?.id===id){quitPending=null;reject(Error('The server has not confirmed quitting. Reconnect and check your round.'));}},8000);}),()=>!!observation&&!observation.result);

