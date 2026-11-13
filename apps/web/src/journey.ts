import { journeyPose,journeyDodge,journeyThrow,journeyJump,journeyVault,journeyAbility,actorElevation,actorEye,actorHealth,actorClass } from '../../../packages/sim/src/journey/encounter.ts';
import { SOLDIER_CLASS_IDS,soldierClass } from '../../../packages/sim/src/journey/classes.ts';
import { journeyWeapon } from '../../../packages/sim/src/journey/weapons.ts';
import { createRosterSetup } from './journey-roster.ts';
import './journey.css';
import { JourneyScene } from './journey-scene.ts';
import {JourneyAudio} from './journey-audio.ts';
import { createJourney,journeyActive,journeyLeader,journeyStep,journeyDrive,journeyMove,journeyFire,journeyReload,journeyBank,journeyQuit,journeyContinue,journeyCheckpoint } from '../../../packages/sim/src/journey/encounter.ts';
import { distance,type Point } from '@last-signal/sim';
import { journeyReviewBot,journeyLootReviewBot } from '../../../packages/sim/src/journey/review-bot.ts';
import { journeyPickup } from '../../../packages/sim/src/journey/encounter.ts';
import { defaultRosterSelection } from '../../../packages/sim/src/journey/roster.ts';
import { ENCOUNTER_RULES } from '../../../packages/sim/src/journey/checkpoints.ts';
import { createVaultDrill } from '../../../packages/sim/src/journey/traversal-drill.ts';
import { createRearAttackDrill,fireRearDrillShot,createTacticsDrill } from '../../../packages/sim/src/journey/perception-drill.ts';

const root=document.querySelector<HTMLElement>('#app')!;
const enabled=import.meta.env.VITE_JOURNEY_ENABLED==='true'||import.meta.env.MODE==='journey';
if(!enabled){
  root.innerHTML='<main class="journey-disabled"><p>LAST SIGNAL / DEVELOPMENT</p><h1>Journey is disabled.</h1><p>The road encounter is available through the dedicated local development launch.</p><code>npm run journey:dev</code><p><a href="/">RETURN TO MODE SELECT</a></p></main>';
}else await start();

async function start(){
  document.title='LAST SIGNAL | Journey practice';
  let run=await createJourney({streamed:true}),started=false,paused=false,accumulator=0,previous=performance.now(),aimTarget:Point|null=null,aimMode=false,heldFire=false,frame=0;
  const keys=new Set<string>(),events=new AbortController();
  const el=<E extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as E;
  root.innerHTML=`<main class="journey-app">
    <div id="journey-field" tabindex="0" aria-label="Journey battlefield. Click ground to move. Click an enemy to shoot."></div>
    <header class="journey-top"><a class="journey-brand" href="/">LAST <span>SIGNAL</span></a><span class="journey-environment">LOCAL PRACTICE <b>NO WALLET</b></span><button id="journey-pause">PAUSE</button><button id="journey-leave">LEAVE</button></header>
    <section class="journey-objective"><small id="journey-region">01 / RUINED OUTSKIRTS</small><h1>THE ROAD<br>TO SIGNAL.</h1><p id="journey-objective-copy">Clear the road. Reach the checkpoint.</p><div class="journey-route"><i id="journey-progress"></i></div><div class="journey-route-label"><span>INSERTION</span><span id="journey-route-checkpoint">CHECKPOINT 01</span></div><strong id="journey-distance">59 m TO CHECKPOINT</strong></section>
    <section class="journey-roster" aria-label="Your squad"><small>YOUR SQUAD / FREE STARTER</small><div id="journey-soldiers"></div></section>
    <div id="journey-destination" class="journey-destination" aria-hidden="true">◇<span>CHECKPOINT 01</span></div>
    <div id="journey-enemies" aria-hidden="true"></div>
    <section class="journey-bottom"><div class="journey-status"><span id="journey-state">READY TO DEPLOY</span><strong id="journey-ammo">20 / 80</strong><small>SERVICE RIFLE</small></div><div class="journey-actions"><button id="journey-view">EYE LEVEL</button><button id="journey-aim" aria-pressed="false">TAP: MOVE</button><button id="journey-fire">FIRE</button><button id="journey-reload">RELOAD · R</button><button id="journey-continue" disabled>CONTINUE →</button><button id="journey-bank" disabled>BANK & FINISH</button></div><div class="journey-rewards"><strong id="journey-credits">0</strong><span>UNBANKED PRACTICE CREDITS</span><small>Simulated. No wallet value.</small></div></section>
    <p id="journey-notice" role="status">Click ground to move. Click a guard to fire. WASD to move. V changes view.</p>
    <section id="journey-overlay" class="journey-overlay"><div><small>JOURNEY / LOCAL ROUTE PROTOTYPE</small><h2>A squad.<br>A road.<br>A way through.</h2><p>Lead two helpers past the road guards. Reach a checkpoint, then continue or bank your practice credits.</p><p>Seeded road sections keep the route going. Reload resets progress. Mud slows movement and vegetation limits observation. Soldier NFTs and Journey chain rewards are not available yet.</p><button id="journey-enter">ENTER THE ROAD ↗</button><a href="/">BACK TO OPERATIONS</a></div></section>
    <dialog id="journey-quit-dialog"><h2>Leave this practice run?</h2><p>Unbanked practice credits are lost. Previously owned guns, soldiers and wallet funds stay yours.</p><button id="journey-quit-cancel">STAY</button><button id="journey-quit-confirm">QUIT & FORFEIT</button></dialog>
    <section id="journey-graphics" class="journey-overlay" hidden><div><h2>Graphics paused.</h2><p>Restore graphics, then explicitly resume local practice.</p><button id="journey-restore">RESTORE GRAPHICS</button></div></section>
  </main>`;
  const scene=new JourneyScene(el('journey-field')),canvas=scene.renderer.domElement;
  const audio=new JourneyAudio(),soundButton=document.createElement('button');soundButton.textContent='SOUND OFF';soundButton.setAttribute('aria-pressed','false');document.querySelector('.journey-top')!.append(soundButton);
  soundButton.onclick=async()=>{soundButton.disabled=true;try{const enabled=await audio.setEnabled(!audio.enabled);soundButton.textContent=enabled?'SOUND ON':'SOUND OFF';soundButton.setAttribute('aria-pressed',String(enabled));}catch{notice('Sound unavailable. You can continue playing.');}finally{soundButton.disabled=false;}};
  const notice=(text:string)=>el('journey-notice').textContent=text;
  let grenadeArmed=false;
  let botReview=false;
  let lootReview=false;
  let regionReview=false;const reviewedSurfaces=new Set<string>();
  let rearReview=false;
  let tacticsReview=false;
  let checkpointReview=false;
  let traversalReview:'jump'|'vault'|null=null;
  let traversalReviewLabel:'jump'|'vault'|null=null;
  const reviewButton=document.createElement('button');reviewButton.textContent='RUN AUTOMATED LOCAL BOT REVIEW';reviewButton.id='journey-bot-review';
  el('journey-overlay').querySelector('div')!.append(reviewButton);
  const lootReviewButton=document.createElement('button');lootReviewButton.textContent='REVIEW PRACTICE LOOT AND BANK';el('journey-overlay').querySelector('div')!.append(lootReviewButton);
  lootReviewButton.onclick=async()=>{run=await createJourney({streamed:true,seed:5,roster:defaultRosterSelection(),rewards:true});scene.reset();refreshRoster();botReview=false;lootReview=true;started=true;paused=false;el('journey-overlay').hidden=true;el('journey-pause').textContent='PAUSE';notice('AUTOMATED LOCAL LOOT REVIEW. Ordinary combat and pickup. Pauses after pickup and at the checkpoint. Bank manually. No wallet value.');};
  reviewButton.onclick=()=>{botReview=true;started=true;paused=false;el('journey-overlay').hidden=true;el('journey-field').focus();notice('AUTOMATED LOCAL BOT REVIEW. Ordinary combat and portal actions. No human playtest claim.');};
  const checkpointButton=document.createElement('button');checkpointButton.textContent='REVIEW THREE CHECKPOINT ENCOUNTERS';el('journey-overlay').querySelector('div')!.append(checkpointButton);
  checkpointButton.onclick=async()=>{run=await createJourney({streamed:true,seed:5});scene.reset();checkpointReview=true;botReview=true;started=true;paused=true;el('journey-overlay').hidden=true;el('journey-pause').textContent='RESUME';notice('AUTOMATED CHECKPOINT REVIEW. Seed 5: crossing, ambush, supply. Inspect the objective, then resume ordinary combat. Pauses after three crossings.');};
  const regionButton=document.createElement('button');regionButton.id='journey-region-review';regionButton.textContent='REVIEW TERRAIN THROUGH NORMAL PLAY';el('journey-overlay').querySelector('div')!.append(regionButton);
  regionButton.onclick=()=>{regionReview=true;botReview=true;started=true;paused=false;el('journey-overlay').hidden=true;el('journey-field').focus();notice('AUTOMATED REGION REVIEW. Pauses on first mud and gravel entry. No gameplay state grants.');};
  const rearButton=document.createElement('button');rearButton.id='journey-rear-review';rearButton.textContent='AUTHORED REAR ATTACK DRILL';el('journey-overlay').querySelector('div')!.append(rearButton);
  rearButton.onclick=async()=>{run=await createRearAttackDrill();scene.reset();botReview=false;regionReview=false;rearReview=true;started=true;paused=false;el('journey-overlay').hidden=true;el('journey-field').focus();fireRearDrillShot(run);notice('AUTHORED LOCAL REAR ATTACK DRILL. One normal shot, then 24 simulation ticks. No reward proof.');};
  const tacticsButton=document.createElement('button');tacticsButton.textContent='AUTHORED TACTICAL ROLE DRILL';el('journey-overlay').querySelector('div')!.append(tacticsButton);
  tacticsButton.onclick=async()=>{run=await createTacticsDrill();scene.reset();botReview=false;regionReview=false;rearReview=false;tacticsReview=true;started=true;paused=false;el('journey-overlay').hidden=true;el('journey-field').focus();notice('AUTHORED LOCAL TACTICS DRILL. Ordinary simulation, no reward proof.');};
  for(const kind of ['jump','vault'] as const){const button=document.createElement('button');button.textContent='AUTHORED '+kind.toUpperCase()+' DRILL';el('journey-overlay').querySelector('div')!.append(button);button.onclick=async()=>{
    run=kind==='vault'?await createVaultDrill():await createJourney({streamed:true,seed:1});if(kind==='jump')journeyJump(run);
    scene.reset();botReview=false;regionReview=false;rearReview=false;tacticsReview=false;checkpointReview=false;traversalReview=kind;traversalReviewLabel=kind;started=true;paused=false;
    el('journey-overlay').hidden=true;el('journey-field').focus();notice('AUTHORED LOCAL '+kind.toUpperCase()+' DRILL. Ordinary traversal simulation, pauses in flight. No reward proof.');
  };}
  const release=()=>{keys.clear();heldFire=false;scene.view.aiming=false;scene.view.releaseMovement();run.driveUntil=0;run.drive={x:0,z:0};if(document.pointerLockElement===canvas)document.exitPointerLock();};
  const rosterSetup=createRosterSetup(async selection=>{
    const prepared=await createJourney({streamed:true,roster:selection,rewards:true});
    run=prepared;scene.reset();refreshRoster();botReview=false;regionReview=false;rearReview=false;tacticsReview=false;checkpointReview=false;traversalReview=null;traversalReviewLabel=null;aimTarget=null;grenadeArmed=false;started=true;paused=true;release();
    el('journey-overlay').hidden=true;el('journey-pause').textContent='RESUME';el('journey-view').textContent='EYE LEVEL';notice('Squad ready. Signature equipment is included practice gear. Resume when ready.');
  });
  el('journey-enter').before(rosterSetup);
  el('journey-enter').textContent='QUICK START / THREE RIFLES';
  const classSection=document.createElement('section');classSection.className='journey-class-catalogue';classSection.setAttribute('aria-label','Seven local soldier classes');
  const classHeading=document.createElement('h3');classHeading.textContent='SEVEN ROLES / LOCAL PRACTICE';classSection.append(classHeading);
  const classNote=document.createElement('p');classNote.textContent='Try one leader with two free rifle helpers. These local practice profiles are not owned collectibles.';classSection.append(classNote);
  for(const id of SOLDIER_CLASS_IDS){const p=soldierClass(id),card=document.createElement('article');card.style.setProperty('--class-color','#'+p.trim.toString(16).padStart(6,'0'));
    const title=document.createElement('h4');title.textContent=p.name+' / '+p.role;
    if(p.weapon==='marksman-rifle'||p.weapon==='support-gun'){const illustration=document.createElement('img');illustration.src=p.weapon==='marksman-rifle'?'/assets/journey-marksman.svg':'/assets/journey-support.svg';illustration.alt=journeyWeapon(p.weapon).name+' original prototype illustration';illustration.width=640;illustration.height=220;illustration.style.cssText='display:block;width:100%;height:auto';card.append(illustration);}
    const stats=document.createElement('small');stats.textContent=p.health+' HP · '+p.armour+'% ARMOUR · '+journeyWeapon(p.weapon).name.toUpperCase();
    const tradeoff=document.createElement('p');tradeoff.textContent=p.tradeoff;
    const button=document.createElement('button');button.textContent='PRACTICE AS '+p.name.toUpperCase();
    button.onclick=async()=>{run=await createJourney({streamed:true,classes:[id,null,null]});scene.reset();botReview=false;regionReview=false;rearReview=false;tacticsReview=false;checkpointReview=false;traversalReview=null;traversalReviewLabel=null;aimTarget=null;grenadeArmed=false;started=true;paused=true;release();el('journey-overlay').hidden=true;el('journey-pause').textContent='RESUME';notice(p.name+': '+p.line+' Local class practice. Inspect your role, then resume.');};
    card.append(title,stats,tradeoff,button);classSection.append(card);
  }
  el('journey-overlay').querySelector('div')!.append(classSection);
  const canPlay=()=>started&&!paused&&!scene.contextLost&&journeyActive(run)&&!document.hidden;
  const pickupButton=document.createElement('button');pickupButton.textContent='PICK UP DROP · F';el('journey-fire').parentElement!.append(pickupButton);
  pickupButton.onclick=()=>{if(!canPlay())return;const drop=run.rewards?.drops.filter(d=>d.state==='AVAILABLE').sort((a,b)=>distance(a,journeyLeader(run))-distance(b,journeyLeader(run)))[0];notice(drop&&journeyPickup(run,drop.id,scene.world)?'Picked up simulated credits. Bank at a completed checkpoint to keep them.':'Move within two metres of the drop with a clear path.');};
  window.addEventListener('keydown',e=>{if(!e.repeat&&e.code==='KeyF')pickupButton.click();},{signal:events.signal});
  const lootNote=document.createElement('small');lootNote.id='journey-loot-note';el('journey-credits').parentElement!.append(lootNote);
  const fire=()=>{
    if(!canPlay())return;
    const leader=journeyLeader(run),targetActor=aimTarget&&run.actors.find(a=>a.side===1&&a.hp>0&&distance(a,aimTarget!)<.01),d=scene.view.mode==='eyes'?scene.aim():aimTarget?{x:aimTarget.x-leader.x,y:(targetActor?actorElevation(targetActor):0)+1.15-actorEye(leader),z:aimTarget.z-leader.z}:null;
    if(!d){notice('Click a visible guard to aim, or use eye level view.');return;}
    if(!journeyFire(run,leader,d,scene.world)&&!leader.ammo){journeyReload(run);notice('Reloading the service rifle.');}
  };
  el('journey-enter').onclick=()=>{started=true;paused=false;el('journey-overlay').hidden=true;el('journey-field').focus();notice('Follow the encounter objective. Click a guard to fire. Checkpoint credits remain provisional until banked.');};
  window.addEventListener('keydown',e=>{if(e.repeat||el<HTMLDialogElement>('journey-quit-dialog').open)return;if(e.code==='KeyC')crouchButton.click();if(e.code==='KeyG')grenadeButton.click();if(e.code==='KeyJ')jumpButton.click();if(e.code==='KeyE')vaultButton.click();if(e.code==='KeyQ')abilityButton.click();if(e.code==='Space'){e.preventDefault();dodgeButton.click();}},{signal:events.signal});
  const togglePause=()=>{if(!started||!journeyActive(run)||scene.contextLost)return;paused=!paused;release();el('journey-pause').textContent=paused?'RESUME':'PAUSE';notice(paused?'Local practice paused. Choose RESUME to continue.':'Local practice resumed.');};
  el('journey-pause').onclick=togglePause;
  const toggleView=()=>{release();scene.view.setMode(scene.view.mode==='eyes'?'tactical':'eyes');el('journey-view').textContent=scene.view.mode==='eyes'?'COMMAND VIEW':'EYE LEVEL';notice(scene.view.mode==='eyes'?'Click the battlefield for mouse look. WASD moves, left click fires. Escape releases the mouse.':'Click ground to move. Click a guard to fire.');};
  el('journey-view').onclick=toggleView;
  el('journey-aim').onclick=()=>{aimMode=!aimMode;el('journey-aim').textContent=aimMode?'TAP: FIRE':'TAP: MOVE';el('journey-aim').setAttribute('aria-pressed',String(aimMode));};
  const crouchButton=document.createElement('button');crouchButton.textContent='CROUCH · C';el('journey-fire').parentElement!.append(crouchButton);
  crouchButton.onclick=()=>{if(canPlay()){const pose=journeyLeader(run).motion?.pose==='crouched'?'standing':'crouched';notice(journeyPose(run,pose)?pose==='crouched'?'Crouched. Reduced profile and movement speed.':'Standing.':'Cannot change pose here. Check clearance or wait for dodge to finish.');}};
  const dodgeButton=document.createElement('button');dodgeButton.textContent='DODGE · SPACE';el('journey-fire').parentElement!.append(dodgeButton);
  dodgeButton.onclick=()=>{if(canPlay()){const leader=journeyLeader(run),direction=Math.hypot(run.drive.x,run.drive.z)>0?run.drive:{x:Math.sin(leader.facing),z:Math.cos(leader.facing)};journeyDodge(run,direction);}};
  const jumpButton=document.createElement('button');jumpButton.textContent='JUMP · J';el('journey-fire').parentElement!.append(jumpButton);
  jumpButton.onclick=()=>{if(canPlay())notice(journeyJump(run)?'Jumping. Land before another movement ability.':'Cannot jump. Stand on a clear surface and wait for recovery.');};
  const vaultButton=document.createElement('button');vaultButton.textContent='VAULT · E';el('journey-fire').parentElement!.append(vaultButton);
  vaultButton.onclick=()=>{if(canPlay()){const leader=journeyLeader(run),aim=scene.view.mode==='eyes'?scene.aim():Math.hypot(run.drive.x,run.drive.z)>0?run.drive:{x:Math.sin(leader.facing),z:Math.cos(leader.facing)};notice(journeyVault(run,{x:aim.x,z:aim.z})?'Vaulting. Stay clear until landing.':'No safe low obstacle within reach. Move closer and face it.');}};
  const grenadeAimButton=document.createElement('button');grenadeAimButton.textContent='AIM GRENADE';el('journey-fire').parentElement!.append(grenadeAimButton);grenadeAimButton.onclick=()=>{grenadeArmed=!grenadeArmed;notice('Grenade blast damages allies and you. Inspect the arc, then throw.');};
  const grenadeButton=document.createElement('button');grenadeButton.textContent='THROW · G';el('journey-fire').parentElement!.append(grenadeButton);grenadeButton.onclick=()=>{if(canPlay()){const leader=journeyLeader(run),aim=scene.view.mode==='eyes'?scene.aim():aimTarget?{x:aimTarget.x-leader.x,y:4,z:aimTarget.z-leader.z}:{x:Math.sin(leader.facing),y:.4,z:Math.cos(leader.facing)};if(journeyThrow(run,aim)){grenadeArmed=false;notice('Grenade thrown. Move clear of the blast.');}else notice('Cannot throw. Check inventory, cooldown or clearance.');}};
  const abilityButton=document.createElement('button');abilityButton.textContent='ABILITY · Q';el('journey-fire').parentElement!.append(abilityButton);
  abilityButton.onclick=()=>{if(canPlay()){const p=actorClass(run,journeyLeader(run));notice(journeyAbility(run)?p!.name+': '+p!.line:'Ability unavailable. Check charges, cooldown, stance or a nearby wounded ally.');}};
  el('journey-fire').onclick=fire;el('journey-reload').onclick=()=>{if(canPlay())journeyReload(run);};
  el('journey-bank').onclick=()=>{if(canPlay()&&journeyBank(run)){release();notice(`Banked ${run.bankedPracticeCredits} practice credits. This is a local simulation, with no chain claim.`);}};
  el('journey-continue').onclick=()=>{if(!canPlay())return;const result=journeyContinue(run);notice(result.reason);if(result.ok){release();aimTarget=null;scene.syncSection(run);el('journey-view').textContent='EYE LEVEL';}};
  el('journey-leave').onclick=()=>{release();if(journeyActive(run)&&started){paused=true;el('journey-pause').textContent='RESUME';el<HTMLDialogElement>('journey-quit-dialog').showModal();}else location.assign('/');};
  el('journey-quit-cancel').onclick=()=>{el<HTMLDialogElement>('journey-quit-dialog').close();notice('You stayed in the run. Choose RESUME to continue.');};
  el('journey-quit-confirm').onclick=()=>{journeyQuit(run);location.assign('/');};
  el('journey-field').addEventListener('journey-graphics-lost',()=>{paused=true;release();el('journey-graphics').hidden=false;el('journey-pause').textContent='RESUME';},{signal:events.signal});
  el('journey-field').addEventListener('journey-graphics-restored',()=>{el('journey-graphics').hidden=true;notice('Graphics restored. Choose RESUME to continue.');},{signal:events.signal});
  el('journey-restore').onclick=()=>scene.renderer.forceContextRestore();
  canvas.addEventListener('contextmenu',e=>e.preventDefault(),{signal:events.signal});
  canvas.addEventListener('pointerdown',e=>{
    if(!canPlay())return;
    if(scene.view.mode==='eyes'){
      if(document.pointerLockElement!==canvas){void canvas.requestPointerLock()?.catch(()=>notice('Mouse capture was unavailable. Drag over the battlefield to look.'));return;}
      if(e.button===0){heldFire=true;fire();}else if(e.button===2)scene.view.aiming=true;
      return;
    }
    const point=scene.pick(e.clientX,e.clientY);if(!point)return;
    const rect=canvas.getBoundingClientRect();
    const target=run.actors.filter(a=>a.side===1&&a.hp>0).find(a=>{const p=scene.screen(a,1.15);return p.visible&&Math.hypot(p.x-(e.clientX-rect.left),p.y-(e.clientY-rect.top))<24;});
    if(target||aimMode||e.button===2){aimTarget=target??point;fire();notice(target?`Guard ${target.id-3} selected. Click the guard again or use FIRE.`:'Ground aim selected. Use FIRE or select a guard.');}
    else if(journeyMove(run,point,scene.world))notice('Moving to your destination. Helpers follow through accessible lanes.');
    else notice('That destination is blocked. Choose the road or an open side lane.');
  },{signal:events.signal});
  document.addEventListener('pointerup',()=>{heldFire=false;scene.view.aiming=false;},{signal:events.signal});
  document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas)release();},{signal:events.signal});
  document.addEventListener('pointermove',e=>{if(canPlay()&&scene.view.mode==='eyes'&&(document.pointerLockElement===canvas||e.buttons===1))scene.view.rotate(e.movementX,e.movementY);},{signal:events.signal});
  document.addEventListener('keydown',e=>{
    if(e.target instanceof HTMLButtonElement||e.target instanceof HTMLAnchorElement||el<HTMLDialogElement>('journey-quit-dialog').open)return;
    if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
    if(e.code==='KeyP'&&!e.repeat)togglePause();if(!canPlay())return;
    keys.add(e.code);if(e.code==='KeyR')journeyReload(run);if(e.code==='KeyV'&&!e.repeat)toggleView();
  },{signal:events.signal});
  document.addEventListener('keyup',e=>{keys.delete(e.code);},{signal:events.signal});
  window.addEventListener('blur',()=>{release();if(started&&journeyActive(run)){paused=true;el('journey-pause').textContent='RESUME';}},{signal:events.signal});
  document.addEventListener('visibilitychange',()=>{release();if(document.hidden&&started){paused=true;el('journey-pause').textContent='RESUME';}},{signal:events.signal});
  function refreshRoster(){el('journey-soldiers').innerHTML=run.actors.filter(a=>a.side===0).map(a=>`<div class="journey-soldier"><span>0${a.id}</span><p>${a.role==='leader'?'LEADER':'RIFLE HELPER'}<small id="journey-hp-${a.id}">${a.hp} HP</small></p><progress id="journey-health-${a.id}" max="${actorHealth(run,a)}" value="${a.hp}" aria-label="Soldier ${a.id} health"></progress></div>`).join('');}
  refreshRoster();
  el('journey-enemies').innerHTML=run.actors.filter(a=>a.side===1).map(a=>`<span id="journey-enemy-${a.id}" class="journey-enemy">GUARD <b></b></span>`).join('');
  const render=(now:number)=>{
    const dt=Math.min(.1,(now-previous)/1000);previous=now;
    if(canPlay()){
      accumulator+=dt;
      while(accumulator>=1/run.pin.rules.ticks){
        const forward=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'));
        const strafe=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
        const direction=scene.view.mode==='eyes'?scene.view.direction(forward,strafe):{x:strafe,z:-forward};
        journeyDrive(run,direction);if(heldFire)fire();
        if(lootReview&&journeyLootReviewBot(run,scene.world)){paused=true;el('journey-pause').textContent='RESUME';notice('AUTOMATED LOCAL REVIEW: drop picked up as provisional loot. Resume to reach the checkpoint, then bank manually.');}
        if(botReview&&journeyReviewBot(run,scene.world)){
          scene.syncSection(run);
          if(BigInt(run.stream?.ordinal??'0')>=(checkpointReview?3n:10n)){paused=true;el('journey-pause').textContent='RESUME';notice(checkpointReview?'AUTOMATED CHECKPOINT REVIEW paused after crossing, ambush and supply. Three completions, 30 provisional practice credits.':'AUTOMATED LOCAL BOT REVIEW paused after ten actual combat crossings.');}
        }
        journeyStep(run,scene.world);accumulator-=1/run.pin.rules.ticks;
        if(lootReview&&(paused||run.state==='CHECKPOINT_REACHED'&&distance(journeyLeader(run),journeyCheckpoint(run))<=run.pin.rules.checkpointRadius&&!run.rewards?.drops.some(d=>d.state==='AVAILABLE'))){if(run.state==='CHECKPOINT_REACHED')lootReview=false;paused=true;release();el('journey-pause').textContent='RESUME';notice(run.state==='CHECKPOINT_REACHED'?'AUTOMATED LOCAL REVIEW: checkpoint ready. Resume, then BANK & FINISH. Simulated credits only.':'AUTOMATED LOCAL REVIEW: provisional loot picked up. Resume to reach the checkpoint.');accumulator=0;break;}
        if(traversalReview&&run.tick>=(traversalReview==='jump'?7:9)){const kind=traversalReview;traversalReview=null;paused=true;release();el('journey-pause').textContent='RESUME';notice('AUTHORED LOCAL '+kind.toUpperCase()+' DRILL: feet '+actorElevation(journeyLeader(run)).toFixed(2)+' m. Resume to land. No reward proof.');accumulator=0;break;}
        if(tacticsReview&&run.tick>=70){paused=true;release();el('journey-pause').textContent='RESUME';notice('AUTHORED TACTICS DRILL: '+run.actors.filter(a=>a.side===1).map(a=>`${a.tactics?.role}: ${a.tactics?.mode}`).join(' / ')+'. No reward proof.');accumulator=0;break;}
        if(rearReview&&run.tick>=24){paused=true;release();el('journey-pause').textContent='RESUME';notice(`AUTHORED REAR ATTACK DRILL: guard HP ${run.actors[3].hp}, facing ${Math.round(run.actors[3].facing*180/Math.PI)} degrees from initial -90, state ${run.actors[3].awareness?.state}. No reward or multiplayer proof.`);accumulator=0;break;}
        const surface=scene.world.terrain(journeyLeader(run)).surface;
        if(regionReview&&['mud','gravel'].includes(surface)&&!reviewedSurfaces.has(surface)){
          reviewedSurfaces.add(surface);paused=true;release();el('journey-pause').textContent='RESUME';notice(`AUTOMATED REGION REVIEW paused on ${surface.toUpperCase()}. Inspect the terrain and HUD, then resume.`);accumulator=0;break;
        }
      }
    }else accumulator=0;
    audio.update(run);
    if(!scene.contextLost){scene.update(run,dt,now/1000);const at=scene.screen(journeyCheckpoint(run),4);el('journey-destination').style.transform=`translate(${at.x}px,${at.y}px)`;el('journey-destination').hidden=!at.visible;
      for(const actor of run.actors.filter(a=>a.side===1)){const label=el(`journey-enemy-${actor.id}`),p=scene.screen(actor,actorElevation(actor)+2.4);label.hidden=!p.visible||actor.hp<=0||scene.view.mode==='eyes';label.style.transform=`translate(${p.x}px,${p.y}px)`;label.querySelector('b')!.style.width=(actor.hp/actorHealth(run,actor)*100)+'%';label.firstChild!.textContent=(actor.rank==='veteran'?'VETERAN / ':'')+(actor.tactics?actor.tactics.role.toUpperCase()+' / '+actor.tactics.mode.toUpperCase()+' ':'GUARD ');}
    }
    const previewLeader=journeyLeader(run);scene.grenadeAim=grenadeArmed?(scene.view.mode==='eyes'?scene.aim():aimTarget?{x:aimTarget.x-previewLeader.x,y:4,z:aimTarget.z-previewLeader.z}:{x:Math.sin(previewLeader.facing),y:.4,z:Math.cos(previewLeader.facing)}):null;
    grenadeButton.textContent='THROW '+(previewLeader.grenades?.quantity??0)+' · G';grenadeButton.disabled=!canPlay()||!previewLeader.grenades?.quantity||run.tick<(previewLeader.grenades?.nextThrowAt??0);grenadeAimButton.disabled=!canPlay();
    const leader=journeyLeader(run),remaining=run.actors.filter(a=>a.side===1&&a.hp>0).length;
    const checkpointLabel='CHECKPOINT '+String(BigInt(run.stream?.ordinal??'0')+1n).padStart(2,'0');
    const terrain=scene.world.terrain(leader);
    el('journey-region').textContent=`${String(BigInt(run.stream?.ordinal??'0')+1n).padStart(2,'0')} / ${(run.sectionData?.region??'ruined-outskirts').replaceAll('-',' ').toUpperCase()} / ${terrain.surface.toUpperCase()} ${Math.round(terrain.speed*100)}% SPEED`;
    el('journey-route-checkpoint').textContent=checkpointLabel;el('journey-destination').querySelector('span')!.textContent=checkpointLabel;
    el('journey-distance').textContent=Math.ceil(distance(leader,journeyCheckpoint(run)))+' m TO CHECKPOINT';el('journey-progress').style.width=Math.max(0,Math.min(100,(leader.x-7)/59*100))+'%';
    for(const a of run.actors.filter(a=>a.side===0)){const p=actorClass(run,a);el(`journey-hp-${a.id}`).textContent=a.hp>0?a.hp+' / '+actorHealth(run,a)+' HP':'DOWN FOR THIS RUN';const bar=el<HTMLProgressElement>(`journey-health-${a.id}`);bar.max=actorHealth(run,a);bar.value=a.hp;el(`journey-hp-${a.id}`).parentElement!.firstChild!.textContent=p?p.name.toUpperCase()+' / '+p.role.toUpperCase():a.role==='leader'?'LEADER':'RIFLE HELPER';}
    el('journey-ammo').textContent=leader.reloadAt>run.tick?'RELOADING':`${leader.ammo} / ${leader.reserve}`;
    const profile=actorClass(run,leader);document.querySelector('.journey-status>small')!.textContent=journeyWeapon(leader.build?.weapon??'service-rifle').name.toUpperCase();
    el('journey-soldiers').parentElement!.querySelector('small')!.textContent=run.roster?'YOUR SQUAD / PREPARED PRACTICE':profile?'YOUR SQUAD / LOCAL CLASS PRACTICE':'YOUR SQUAD / FREE STARTER';
    abilityButton.hidden=!profile||profile.ability==='grenade-stock';abilityButton.disabled=!canPlay()||!profile||run.tick<(leader.classState?.readyAt??0);
    if(profile?.ability==='treat'&&!leader.classState!.medicalCharges||profile?.ability==='resupply'&&!leader.classState!.ammoCharges)abilityButton.disabled=true;
    if(profile){const charges=profile.ability==='treat'?' '+leader.classState!.medicalCharges:profile.ability==='resupply'?' '+leader.classState!.ammoCharges:'';abilityButton.textContent=profile.ability.toUpperCase()+charges+' · Q';}
    el('journey-state').textContent=!started?'READY TO DEPLOY':paused?'PAUSED':run.state==='ACTIVE'?remaining+' GUARDS REMAIN':run.state.replaceAll('_',' ');
    if(traversalReviewLabel)el('journey-state').textContent='AUTHORED '+traversalReviewLabel.toUpperCase()+' / '+el('journey-state').textContent;
    const airborne=!!leader.traversal&&!leader.traversal.grounded;
    crouchButton.disabled=!canPlay()||airborne;dodgeButton.disabled=!canPlay()||airborne||run.tick<(leader.motion?.nextDodgeAt??0);crouchButton.textContent=leader.motion?.pose==='crouched'?'STAND · C':'CROUCH · C';
    jumpButton.disabled=vaultButton.disabled=!canPlay()||airborne||leader.motion?.pose!=='standing'||run.tick<(leader.traversal?.nextJumpAt??0)||run.tick<(leader.motion?.dodgeUntil??0);
    const encounter=run.encounter;
    const objectiveCopy=encounter&&!encounter.opened?(encounter.template==='road-ambush'?'Survive the ambush. Clear all road guards.':encounter.template==='crossing'?`Clear the two crossing defenders. Hold the amber circle uncontested: ${encounter.progress}/${ENCOUNTER_RULES.crossingTicks}.`:`Clear the supply defender. Secure the amber circle uncontested: ${encounter.progress}/${ENCOUNTER_RULES.supplyTicks}.`):remaining&&!encounter?'Clear the road guards, then reach the checkpoint.':'Route opened. Reach the checkpoint with your living helpers. Continue or bank and finish.';
    el('journey-objective-copy').textContent=run.state==='BANKED'?'Practice journey banked. Reload to start another route.':run.state==='DEAD'?'Leader lost. Reload this page for a new practice run.':objectiveCopy;
    el('journey-credits').textContent=String(run.state==='BANKED'?run.bankedPracticeCredits:run.practiceCredits);
    el('journey-credits').nextElementSibling!.textContent=run.state==='BANKED'?'BANKED PRACTICE CREDITS':'UNBANKED PRACTICE CREDITS';
    lootNote.hidden=!run.rewards;lootNote.textContent=run.rewards?run.state==='BANKED'?`Includes ${run.rewards.bankedLoot} banked loot credits. Simulated only.`:`${run.rewards.provisionalLoot} LOOT CREDITS / UNBANKED · ${run.rewards.drops.filter(d=>d.state==='AVAILABLE').length} DROP AVAILABLE · Simulated only.`:'';
    pickupButton.hidden=!run.rewards;pickupButton.disabled=!canPlay()||!run.rewards?.drops.some(d=>d.state==='AVAILABLE'&&distance(d,leader)<=2);
    const atCheckpoint=canPlay()&&run.state==='CHECKPOINT_REACHED'&&distance(leader,journeyCheckpoint(run))<=run.pin.rules.checkpointRadius;
    el<HTMLButtonElement>('journey-bank').disabled=!atCheckpoint;el<HTMLButtonElement>('journey-continue').disabled=!atCheckpoint;
    for(const id of ['journey-fire','journey-reload'])el<HTMLButtonElement>(id).disabled=!canPlay();
    frame=requestAnimationFrame(render);
  };
  frame=requestAnimationFrame(render);
  window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);events.abort();release();audio.dispose();scene.dispose();},{once:true});
}
