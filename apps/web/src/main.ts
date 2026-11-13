import {registerRoundExit} from './operation-navigation.ts';
import {mountGameShell} from './game-shell.ts';
import './style.css';
import './immersive.css';
import './old-front.css';
import './guidance.css';
import { Battlefield } from './scene.ts';
import { createGame, createCombatDrill, createLootTraining, createEndless, SUPPLIES, type Supply, step, command, observe, botCommands, visible, distance, isMoving, squadMembers, traceRifle, WEAPONS, lineOfSight, MAP, RULES as R, type Command, type GameEvent, type Point } from '@last-signal/sim';
import './shooter.css';
import './survival.css';
import { BattleFeedback } from './battle-feedback.ts';
import {FieldReview} from './field-review.ts';
import './polish.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
mountGameShell(app);
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const stationEntry=document.createElement('a');stationEntry.className='text-button';stationEntry.href='/?mode=survival';stationEntry.textContent='SURVIVAL · CAPTURE, DEFEND & EXTRACT →';
el('briefing').insertBefore(stationEntry,el('endless-start'));
const dialog = (id: string) => el<HTMLDialogElement>(id);
const practiceOptions={untimed:true,hero:true};
let game = createGame(1,practiceOptions), started = false, selected: number | null = null;
let targeting: 'move' | 'emp' | null = null, seq = 0, accumulator = 0, lastFrame = performance.now(), lastHud = 0, lastNotice = 0, resultShown = false;
let drill=false,rangeTraining=false;
let guided = false, tutorialStage = 0, tutorialFlankPhase = 0, tactical = false, paused = false, userPaused=false;
let audio: AudioContext | null = null, sound = true;
let rainGain:GainNode|null=null;
const heldKeys=new Set<string>();
let soundEvent=0, lastStepSound=0;
let triggerHeld=false, freeMouseLook=false, hitUntil=0, rifleHits=0;
const spending: { tick: number; action: string; cost: number }[] = [];
const toast = (message: string) => { el('toast').textContent = message; };
let scene: Battlefield;
try { scene = new Battlefield(el('battlefield'), [...document.querySelectorAll<HTMLElement>('.relay-label')]); }
catch { el('briefing').innerHTML = '<div class="eyebrow">RENDERER UNAVAILABLE</div><h1>WebGL 2 is required.</h1><p>Enable hardware acceleration in a current browser, then reload this page. No wallet or funds are needed.</p>'; throw new Error('WebGL initialization failed'); }
const feedback=new BattleFeedback(el('battle-feedback'),(at,height)=>scene.screenPoint(at,height));
const review=new FieldReview(scene,()=>game.endless?'LOCAL PRACTICE ENDLESS':drill?'LOCAL PRACTICE COMBAT DRILL':rangeTraining?'LOCAL PRACTICE LOOT TRAINING':'LOCAL PRACTICE RELAY');
try {
  const saved = JSON.parse(localStorage.getItem('last-signal-settings') ?? '{}');
  scene.effectsEnabled = saved.effects ?? true; scene.reducedMotion = saved.motion ?? scene.reducedMotion;
  sound=saved.audio??true;
} catch { /* Private storage may be unavailable. */ }
el<HTMLInputElement>('audio').checked = sound;
el<HTMLInputElement>('effects').checked = scene.effectsEnabled; el<HTMLInputElement>('motion').checked = scene.reducedMotion;
function saveSettings() { try { localStorage.setItem('last-signal-settings', JSON.stringify({ effects: scene.effectsEnabled, motion: scene.reducedMotion,audio:sound })); } catch { /* Settings remain valid in memory. */ } }
function tone(frequency: number, duration = .08) {
  if (!sound || !audio || document.hidden) return;
  const osc = audio.createOscillator(), gain = audio.createGain(); osc.frequency.value = frequency; osc.type = 'triangle'; gain.gain.setValueAtTime(.025, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration); osc.connect(gain).connect(audio.destination); osc.start(); osc.stop(audio.currentTime + duration);
}
function gunSound() {
 if(!sound||!audio||document.hidden)return;
 const buffer=audio.createBuffer(1,Math.floor(audio.sampleRate*.11),audio.sampleRate),data=buffer.getChannelData(0);
 for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/(audio.sampleRate*.018));
 const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();source.buffer=buffer;filter.type='lowpass';filter.frequency.value=1800;gain.gain.value=.16;source.connect(filter).connect(gain).connect(audio.destination);source.start();
}
function ambience() {
  if(!audio)return;
  if(!rainGain){
    const buffer=audio.createBuffer(1,audio.sampleRate*2,audio.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    const source=audio.createBufferSource(),filter=audio.createBiquadFilter();source.buffer=buffer;source.loop=true;filter.type='lowpass';filter.frequency.value=1100;rainGain=audio.createGain();source.connect(filter).connect(rainGain).connect(audio.destination);source.start();
  }
  rainGain.gain.value=(sound&&!document.hidden) ? .045 : 0;
}
function drawMap(o:ReturnType<typeof observe>) {
 const ctx=mapCanvas.getContext('2d')!;ctx.clearRect(0,0,192,128);ctx.fillStyle='#142022';ctx.fillRect(0,0,192,128);
 for(const obstacle of MAP.obstacles){ctx.fillStyle='#50605a';ctx.fillRect(obstacle.x*4,obstacle.z*4,obstacle.w*4,obstacle.d*4);}
 for(const r of o.relays){ctx.strokeStyle=r.owner===0?'#82d6cf':r.owner===1?'#e7b070':'#c3c7b1';ctx.beginPath();ctx.arc(r.x*4,r.z*4,10,0,Math.PI*2);ctx.stroke();ctx.fillStyle=ctx.strokeStyle;ctx.font='9px monospace';ctx.fillText(r.id,r.x*4-3,r.z*4+3);}
 for(const s of o.squads){ctx.fillStyle=s.side===0?'#82d6cf':'#e7b070';ctx.beginPath();ctx.arc(s.x*4,s.z*4,s.id===selected?3.5:2,0,Math.PI*2);ctx.fill();}
}
function issue(payload: Omit<Command, 'id' | 'side'> | Record<string, unknown>) {
  if (!started) return toast('Enter the compound to begin.');
  const c = { ...payload, id: `player:${++seq}`, side: 0 } as Command;
  const before = game.budgets[0], result = command(game, c); toast(result.reason);
  if (result.ok) {
    if (c.kind === 'move' || c.kind === 'emp' || c.kind === 'retreat') clearTarget();
    tone(c.kind === 'emp' ? 140 : 420);
    if (before > game.budgets[0]) spending.push({ tick: game.tick, action: c.kind.toUpperCase(), cost: before - game.budgets[0] });
    if (guided && c.kind === 'move' && tutorialStage === 1) tutorialStage = 2;
    if (guided && c.kind === 'deploy' && tutorialStage === 4) tutorialStage = 5;
    if (guided && c.kind === 'shield' && tutorialStage === 5) tutorialStage = 6;
  }
  updateHud();
}
function begin(training: boolean) {
  userPaused=false;
  pauseButton.textContent='PAUSE · P';
  releaseMouse();
  rifleHits=0;
  drill=false;rangeTraining=false;document.body.dataset.endless='false';
  game = createGame(1,practiceOptions); scene.resetMatch(); feedback.reset(); started = true; selected = 1; guided = training; tutorialStage = 0; tutorialFlankPhase = 0; targeting = null; resultShown = false; accumulator = 0; paused = false; lastNotice = 0; spending.length = 0;
  document.body.classList.add('in-match');
  clearTarget();
  el('tutorial-card').classList.remove('compact');
  if (training) changeView('tactical');
  if(sound){audio??=new AudioContext();void audio.resume();ambience();}
  soundEvent=0;
  el('briefing').hidden = true; dialog('result').close(); toast('Stand by. Deployment in three seconds.'); updateHud();
}
el('drill').onclick=()=>{
  begin(false);drill=true;game=createCombatDrill(1,practiceOptions);
  spending.push({tick:0,action:'DEPLOY',cost:R.deployCost},{tick:R.deployCooldown,action:'DEPLOY',cost:R.deployCost});
  selected=game.squads.find(s=>s.side===0&&s.z===16)!.id;
  toast('COMBAT DRILL. Two reinforcements already paid: 60 credits remain. Take control to aim and fire. Your soldiers fire automatically.');updateHud();
};
el('loot-training').onclick=()=>{begin(false);rangeTraining=true;game=createLootTraining();selected=game.hero!.squadId;changeView('eyes');toast('FIRING RANGE. The target is disarmed. Your soldiers assist. Shoot, approach its gun, then press G.');updateHud();};
function beginEndless(){begin(false);game=createEndless();document.body.dataset.endless='true';selected=game.hero!.squadId;changeView('eyes');toast('ENDLESS FRONT. Eliminate the wave, collect drops with G, use H for supplies. Health recovers after five seconds without damage.');updateHud();}
el('endless-start').onclick=beginEndless;
el('start').onclick = () => begin(false); el('tutorial').onclick = () => begin(true); el('rematch').onclick = () => game.endless?beginEndless():begin(guided);
function openSupplies(){
  if(!started||game.result||game.countdown)return;
  releaseMouse();el('supply-feedback').textContent='Choose supplies. Local practice is paused while this panel is open.';dialog('supplies').showModal();updateHud();
}
el('field-supplies').onclick=openSupplies;
for(const supply of ['ammo','shield','recruit'] as Supply[])el('buy-'+supply).onclick=()=>{
  const result=command(game,{id:'supply:'+ ++seq,side:0,kind:'supply',squadId:game.hero!.squadId,supply});
  el('supply-feedback').textContent=result.reason;toast(result.reason);updateHud();
};
function clearTarget() { targeting = null; el('battlefield').classList.remove('targeting'); document.body.dataset.orderMode = ''; el('order-hint').hidden = true; }
function target(kind: 'move' | 'emp') {
  if (!started || game.result || game.countdown > 0) return toast('Start practice and wait for the countdown first.');
  if (!game.squads.some(s => s.id === selected && s.side === 0)) return toast('Select a living friendly squad.');
  if (targeting === kind) { clearTarget(); updateHud(); return; }
  targeting = kind; el('battlefield').classList.add('targeting'); document.body.dataset.orderMode = kind;
  changeView('tactical');
  el('order-hint').hidden = false;
  el('order-title').textContent = kind === 'move' ? 'NOW CLICK THE GROUND' : 'NOW CLICK THE EMP TARGET';
  el('order-copy').textContent = kind === 'move' ? 'Move is waiting for a destination. Click open ground on the map and your squad will walk there. Or click GO TO CENTRE above to move straight to B.' : 'Click a visible point within range of your selected squad. A valid pulse costs 15 credits.';
  toast(kind === 'move' ? 'Choose where to go. Click open ground or a station button.' : 'Choose the EMP location.');
  updateHud();
}
el('cancel-order').onclick = () => { clearTarget(); updateHud(); };
el('move').onclick = () => target('move'); el('emp').onclick = () => target('emp');
el('shield').onclick = () => issue({ kind: 'shield', squadId: selected }); el('retreat').onclick = () => issue({ kind: 'retreat', squadId: selected }); el('deploy').onclick = () => issue({ kind: 'deploy' });
el('overlay').onclick = () => { tactical = !tactical; scene.setTactical(tactical); el('overlay').classList.toggle('active', tactical); };
el('zoom-in').onclick = () => scene.setZoom(.1); el('zoom-out').onclick = () => scene.setZoom(-.1); el('reset-camera').onclick = () => scene.resetCamera();
el('settings-button').onclick = () => dialog('settings').showModal(); el('help-button').onclick = () => dialog('help').showModal();
const pauseButton=document.createElement('button');pauseButton.id='pause-game';pauseButton.textContent='PAUSE · P';document.querySelector('.scene-controls')!.append(pauseButton);
function togglePause(){if(!started||game.result)return;userPaused=!userPaused;paused=userPaused||document.hidden;if(paused)releaseMouse();pauseButton.textContent=paused?'RESUME · P':'PAUSE · P';toast(paused?'Practice paused. Press P to resume.':'Practice resumed.');updateHud();}
pauseButton.onclick=togglePause;
document.addEventListener('operation-menu-open',()=>{if(started&&!paused&&!game.result)togglePause();else releaseMouse();});
document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(button => { button.onclick = () => dialog(button.dataset.close!).close(); });
el('surrender').onclick = () => { if (started && !game.result) issue({ kind: 'surrender' }); dialog('settings').close(); };
el('skip-tutorial').onclick = () => { guided = false; updateHud(); };
function selectSquad(id: number) {
  if (game.result) return toast('This match is over. Choose REDEPLOY to play again.');
  if (!started) begin(true);
  const squad = game.squads.find(s => s.side === 0 && s.id === id);
  if (!squad) return toast('That squad is not available. Deploy another squad for 20 credits.');
  selected = squad.id;
  if(game.hero&&selected!==game.hero.squadId&&scene.viewMode==='eyes')changeView('tactical');
  clearTarget();
  if (guided && tutorialStage === 0) tutorialStage = 1;
  el('battlefield').focus({ preventScroll: true });
  toast(`Squad ${friendlyName(selected)} selected. ${game.countdown ? 'Wait for the countdown, then click GO TO CENTRE.' : 'Click GO TO CENTRE to send it to station B.'}`);
  updateHud();
}
el('squad-cards').onclick = e => {
  const card = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-squad]');
  if (card) selectSquad(Number(card.dataset.squad));
};
el('tutorial-details').onclick = () => { el('tutorial-card').classList.toggle('compact'); updateHud(); };
el('tutorial-action').onclick = () => {
  if (tutorialStage === 0) { const first = game.squads.find(s => s.side === 0); if (first) selectSquad(first.id); }
  else if (tutorialStage === 1) { const r = game.relays[1]; issue({ kind: 'move', squadId: selected, target: { x: r.x - 1, z: r.z } }); }
  else if (tutorialStage === 4) issue({ kind: 'deploy' });
  else if (tutorialStage === 5) issue({ kind: 'shield', squadId: selected });
  else { changeView('tactical'); el('tutorial-card').classList.add('compact'); }
  updateHud();
};
el('ledger-button').onclick = () => {
  el('ledger-content').innerHTML = `<p>Starting reserve <b>100 CR</b></p>${spending.map(s => `<p>${Math.floor(s.tick / R.ticks)}s / ${s.action} <b>${s.cost} CR</b></p>`).join('')}<p>Spent <b>${game.spent[0]} CR</b></p><p>Remaining <b>${game.budgets[0]} CR</b></p>`; dialog('ledger').showModal();
};
el<HTMLInputElement>('effects').onchange = e => { scene.effectsEnabled = (e.target as HTMLInputElement).checked; saveSettings(); };
el<HTMLInputElement>('motion').onchange = e => { scene.reducedMotion = (e.target as HTMLInputElement).checked; saveSettings(); };
el<HTMLInputElement>('audio').onchange = () => { sound = el<HTMLInputElement>('audio').checked; if (sound) { audio ??= new AudioContext(); void audio.resume(); tone(380, .2); } ambience();saveSettings(); };

const canvas = scene.renderer.domElement;
const touchDrive=document.createElement('nav');touchDrive.id='touch-drive';touchDrive.setAttribute('aria-label','Touch movement. Drag the battlefield to look.');
for(const [label,key,glyph] of [['Move forward','KeyW','↑'],['Move left','KeyA','←'],['Move back','KeyS','↓'],['Move right','KeyD','→']]){
 const b=document.createElement('button');b.textContent=glyph;b.setAttribute('aria-label',label);
 b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);heldKeys.add(key);};
 b.onpointerup=b.onpointercancel=()=>heldKeys.delete(key);touchDrive.append(b);
}
el('shooter-hud').prepend(touchDrive);
el('fire-rifle').addEventListener('pointerdown',e=>{if(e.pointerType==='touch'){triggerHeld=true;fireRifle();}});
canvas.addEventListener('webglcontextlost',()=>{review.interrupt('Graphics context lost');releaseMouse();toast('Graphics lost. Restore graphics to resume local practice.');});
canvas.addEventListener('webglcontextrestored',()=>toast('Graphics restored. Local practice resumed.'));
changeView('eyes');
function changeView(mode:'squad'|'eyes'|'tactical') {
 if(mode!=='eyes') releaseMouse();
 if(mode==='eyes'&&started&&game.hero?.alive)selected=game.hero.squadId;
 scene.setView(mode);
 for(const name of ['squad','eyes','tactical']) el('view-'+name).classList.toggle('active',name===mode);
 el('camera-label').textContent=mode==='eyes'?'EYE LEVEL / SQUAD LEAD':mode==='squad'?'SQUAD CAMERA':'COMMAND CAMERA';
}
for(const mode of ['squad','eyes','tactical'] as const) el('view-'+mode).onclick=()=>changeView(mode);
document.querySelectorAll<HTMLButtonElement>('[data-relay]').forEach(b=>b.onclick=()=>{const r=game.relays[Number(b.dataset.relay)];issue({kind:'move',squadId:selected,target:{x:r.x-1,z:r.z}});});
const mapCanvas=el<HTMLCanvasElement>('minimap');
mapCanvas.onclick=e=>{const rect=mapCanvas.getBoundingClientRect();issue({kind:'move',squadId:selected,target:{x:(e.clientX-rect.left)/rect.width*48,z:(e.clientY-rect.top)/rect.height*32}});};
let pointerStart:{x:number;y:number}|null=null,dragged=false,previousPointer={x:0,y:0};
let lookPointer:{x:number;y:number}|null=null;
function releaseMouse() { triggerHeld=false; freeMouseLook=false; lookPointer=null;heldKeys.clear(); if(scene)scene.view.aiming=false; document.body.classList.remove('mouse-captured'); if(document.pointerLockElement)document.exitPointerLock(); }
function fallbackLook(){if(!started||game.result||scene.viewMode!=='eyes')return;freeMouseLook=true;lookPointer=null;document.body.classList.add('mouse-captured');el('shoot-status').textContent='MOVE MOUSE OVER THE BATTLEFIELD TO LOOK · LEFT FIRE · RIGHT AIM · ESC RELEASE';}
function enterControl() {
 if(!started||game.result)return toast('Start a practice match first.');
 if(game.hero){if(!game.hero.alive)return toast('Your character has died. Restart the run.');selected=game.hero.squadId;}
 if(selected===null){const first=game.squads.find(s=>s.side===0);if(!first)return toast('Deploy a squad first.');selectSquad(first.id);}
 clearTarget();changeView('eyes');el('tutorial-card').classList.add('compact');el('battlefield').focus({preventScroll:true});
 if(!canvas.requestPointerLock){fallbackLook();return;}
 try { const request=canvas.requestPointerLock(); if(request)void request.catch(fallbackLook); }
 catch {fallbackLook();}
}
function fireRifle() {
 if(!started||paused||game.result||game.countdown||scene.viewMode!=='eyes'||selected===null)return;
 const s=game.squads.find(s=>s.id===(game.hero?.squadId??selected)&&s.side===0);if(!s)return;
 if(s.reloadUntil>game.tick){el('shoot-status').textContent='RELOADING…';return;}
 if(!s.ammo){el('shoot-status').textContent=s.reserveAmmo?'EMPTY · PRESS R TO RELOAD':'OUT OF BULLETS · FIND A GUN PICKUP';return;}
 if(game.tick-(s.rifleAt??-100)<WEAPONS[s.weapon].ticks)return;
 const result=command(game,{id:`rifle:${++seq}`,side:0,kind:'fire',squadId:s.id,direction:scene.aimDirection()});
 if(result.ok){scene.fireWeapon();el('shoot-status').textContent='RIFLE FIRED · Cycling bolt · Squad continues automatic fire';}
 else el('shoot-status').textContent=result.reason;
}
el('take-control').onclick=enterControl;
el('fire-rifle').onclick=fireRifle;
el('aim-rifle').onclick=()=>{scene.view.aiming=!scene.view.aiming;};
function nearestLoot(){const hero=game.squads.find(s=>s.id===game.hero?.squadId);return hero?observe(game,0).loot.filter(l=>lineOfSight(hero,l)).sort((a,b)=>distance(hero,a)-distance(hero,b))[0]:undefined;}
function pickupLoot(){const drop=nearestLoot();if(!drop)return toast('No gun pickup nearby. Defeat an enemy first.');issue({kind:'loot',squadId:game.hero?.squadId,lootId:drop.id});}
function reloadHero(){triggerHeld=false;issue({kind:'reload',squadId:game.hero?.squadId??selected});}
el('reload-rifle').onclick=reloadHero;el('pickup-loot').onclick=pickupLoot;el('switch-weapon').onclick=()=>issue({kind:'switchWeapon',squadId:game.hero?.squadId??selected});
el('training-live').onclick=()=>{begin(false);changeView('eyes');};
el('release-control').onclick=()=>changeView('tactical');
document.addEventListener('pointerlockchange',()=>{const locked=document.pointerLockElement===canvas;document.body.classList.toggle('mouse-captured',locked);triggerHeld=false;heldKeys.clear();scene.view.aiming=false;el('shoot-status').textContent=locked?'HOLD WASD TO KEEP HEADING · MOUSE LOOK · LEFT FIRE · HOLD RIGHT AIM · ESC RELEASE':'Click TAKE CONTROL to look freely. Your squad still fires automatically.';});
document.addEventListener('pointerlockerror',fallbackLook);
document.addEventListener('mousemove',e=>{
 if(scene.viewMode!=='eyes')return;
 if(document.pointerLockElement===canvas)scene.view.rotate(e.movementX,e.movementY);
 else if(freeMouseLook&&e.target===canvas){if(lookPointer)scene.view.rotate(e.clientX-lookPointer.x,e.clientY-lookPointer.y);lookPointer={x:e.clientX,y:e.clientY};}
 else lookPointer=null;
});
document.addEventListener('mouseup',e=>{if(e.button===0)triggerHeld=false;if(e.button===2)scene.view.aiming=false;});
document.addEventListener('pointerup',e=>{if(e.button===0)triggerHeld=false;if(e.button===2)scene.view.aiming=false;});
canvas.addEventListener('pointerdown',e=>{
 if(scene.viewMode==='eyes'&&!targeting&&e.pointerType==='mouse'){
   e.preventDefault();if(document.pointerLockElement!==canvas&&!freeMouseLook){enterControl();return;}
   if(e.button===0){triggerHeld=true;fireRifle();}if(e.button===2)scene.view.aiming=true;return;
 }
 pointerStart={x:e.clientX,y:e.clientY};previousPointer={x:e.clientX,y:e.clientY};dragged=false;canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{if(document.pointerLockElement===canvas||freeMouseLook)return;if(!pointerStart)return;if(Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>5)dragged=true;if(dragged)scene.view.rotate(e.clientX-previousPointer.x,e.clientY-previousPointer.y);previousPointer={x:e.clientX,y:e.clientY};});
canvas.addEventListener('pointerup',e=>{if(scene.viewMode==='eyes'&&!targeting&&e.pointerType==='mouse'){pointerStart=null;return;}if(pointerStart&&!dragged)battlefieldClick(e);pointerStart=null;});
canvas.addEventListener('pointercancel',()=>{pointerStart=null;triggerHeld=false;scene.view.aiming=false;lookPointer=null;});
canvas.addEventListener('wheel',e=>{e.preventDefault();scene.setZoom(-e.deltaY*.0005);},{passive:false});
function battlefieldClick(e: PointerEvent) {
  if (!started || game.result || game.countdown > 0) return;
  const p = scene.pick(e.clientX, e.clientY); if (!p) return;
  if (e.button === 2 || targeting) {
    issue({ kind: targeting === 'emp' ? 'emp' : 'move', squadId: selected, target: p }); return;
  }
  const closest = game.squads.filter(s => s.side === 0 && distance(s, p) < 2.4).sort((a, b) => distance(a, p) - distance(b, p))[0];
  if (closest) selectSquad(closest.id);
  else if (selected && (e.pointerType === 'touch' || scene.viewMode!=='tactical')) issue({ kind: 'move', squadId: selected, target: p });
  else toast('Select a cyan squad or use the squad cards below.');
  updateHud();
}
canvas.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('keydown', e => {
  if ((e.target as HTMLElement).matches('input, textarea, select') || document.querySelector('dialog[open]') || e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.code === 'Space') { e.preventDefault(); scene.setTactical(true); }
  if(['KeyW','KeyA','KeyS','KeyD'].includes(e.code)){e.preventDefault();heldKeys.add(e.code);}
  if (e.repeat) return;
  const key = e.key.toLowerCase();
  if(key==='p'){togglePause();return;}
  const squadKey = /^(?:Digit|Numpad)([123])$/.exec(e.code)?.[1] ?? (['1', '2', '3'].includes(key) ? key : null);
  if (squadKey) {
    e.preventDefault();
    const squad = game.squads.filter(s => s.side === 0)[Number(squadKey) - 1];
    if (squad) selectSquad(squad.id);
    else toast(`Squad ${squadKey} is not deployed. Use DEPLOY SQUAD first. Your current selection is unchanged.`);
  }
  if(key==='v'){scene.view.cycle();changeView(scene.viewMode);}
  if(key==='f')scene.resetCamera();
  if (key === 'm') target('move'); if (key === 'q') issue({ kind: 'shield', squadId: selected }); if (key === 'e') target('emp'); if (key === 't') issue({ kind: 'retreat', squadId: selected });
  if(key==='h')openSupplies();if(key==='r')reloadHero();if(key==='g')pickupLoot();if(key==='x')issue({kind:'switchWeapon',squadId:game.hero?.squadId??selected});
  if (key === 'escape') { if(scene.viewMode==='eyes'){releaseMouse();toast('Mouse released. Use the cards or station buttons, or TAKE CONTROL to resume.');return;} if (targeting) { clearTarget(); toast('Order cancelled. Your squad is still selected.'); } else { selected = null; toast('Selection cleared'); } updateHud(); }
});
window.addEventListener('keyup', e => { heldKeys.delete(e.code);if(!["KeyW","KeyA","KeyS","KeyD"].some(key=>heldKeys.has(key)))scene.view.releaseMovement(); if(!heldKeys.size&&['KeyW','KeyA','KeyS','KeyD'].includes(e.code)&&selected!==null)command(game,{id:`stop:${++seq}`,side:0,kind:'drive',squadId:game.hero?.squadId??selected!,direction:{x:0,z:0}}); if (e.code === 'Space') scene.setTactical(tactical); });
window.addEventListener('blur', () => {triggerHeld=false;scene.view.aiming=false;heldKeys.clear();scene.setTactical(tactical);});
document.addEventListener('visibilitychange', () => { paused = document.hidden||userPaused;triggerHeld=false;scene.view.aiming=false;heldKeys.clear();ambience(); accumulator = 0; lastFrame = performance.now(); if (started && !game.result) toast(paused ? 'Practice paused. Press P to resume when visible.' : 'Practice resumed.'); });
const friendlyName = (id: number) => String(game.squads.filter(s => s.side === 0).findIndex(s => s.id === id) + 1).padStart(2, '0');
function updateHud() {
  const own = game.squads.filter(s => s.side === 0);
  const hero=own.find(s=>s.id===game.hero?.squadId),hp=hero?.hp??(game.hero?.alive?100:0);
  el('hero-health').textContent=`YOUR HEALTH · ${Math.max(0,Math.ceil(hp))} / 100 · ${hero?squadMembers(hero):0}/3 MEN`;
  el('player-health-fill').style.width=Math.max(0,hp)+'%';
  el('player-health-fill').style.background=hp<30?'#ff7858':'#6fe5b4';
  el('weapon-readout').textContent=hero?`${WEAPONS[hero.weapon].name.toUpperCase()} · ${hero.ammo} / ${hero.reserveAmmo}${hero.reloadUntil>game.tick?' · RELOADING':''}`:'CHARACTER DOWN';
  const reloadProgress=el<HTMLProgressElement>('reload-progress');reloadProgress.hidden=!hero||hero.reloadUntil<=game.tick;reloadProgress.max=R.reloadTicks;reloadProgress.value=hero?Math.max(0,R.reloadTicks-(hero.reloadUntil-game.tick)):0;
  el('weapon-readout').classList.toggle('ammo-empty',!!hero&&!hero.ammo);
  el('range-guide').hidden=!rangeTraining;el('training-live').hidden=!rangeTraining;
  if(rangeTraining)el('range-guide').textContent=game.hero!.tokens>0?'LOOT COLLECTED · X SWAPS GUNS · R RELOADS':game.loot.length?(hero&&distance(hero,game.loot[0])<=R.lootRange?'PRESS G TO COLLECT THE GUN AND PRACTICE WIF':'WASD · WALK TO THE DROPPED GUN'):'SHOOT THE DISARMED TARGET · YOUR SQUAD ASSISTS';
  const recoveryWait=hero?Math.max(0,R.regenDelay-(game.tick-hero.lastHit)):0;
  el('regen-status').textContent=!hero?'':hp>=100?'HEALTH FULL':paused||dialog('supplies').open?'RECOVERY PAUSED':recoveryWait?'RECOVERY IN '+Math.ceil(recoveryWait/R.ticks)+'s · AVOID DAMAGE':'RECOVERING +8 HP / SEC';
  el('regen-status').classList.toggle('recovering',!!hero&&hp<100&&!recoveryWait);
  const endless=game.endless;
  el('wave-guide').hidden=!endless;
  if(endless)el('wave-guide').textContent=endless.nextWaveAt!==null?'WAVE '+endless.wave+' CLEAR · NEXT IN '+Math.ceil((endless.nextWaveAt-game.tick)/R.ticks)+'s · G LOOT · H SUPPLIES':'WAVE '+endless.wave+' · '+game.squads.filter(s=>s.side===1).length+' ENEMY SQUADS LEFT · G LOOT · H SUPPLIES';
  el('supply-balance').textContent=(game.hero?.tokens??0)+' PRACTICE WIF AVAILABLE · NO REAL VALUE';
  for(const supply of ['ammo','shield','recruit'] as Supply[]){
    const unavailable=!hero||!!game.result||(game.hero?.tokens??0)<SUPPLIES[supply].cost||(supply==='ammo'?hero.reserveAmmo>=R.maxReserveAmmo:supply==='shield'?hero.shield>0&&hero.shieldUntil>game.tick:squadMembers(hero)>=3||game.tick-hero.lastHit<R.regenDelay);
    el<HTMLButtonElement>('buy-'+supply).disabled=unavailable;
  }
  el<HTMLButtonElement>('field-supplies').disabled=!started||!hero||!!game.result||game.countdown>0;
  el('token-readout').textContent=`PRACTICE WIF · ${game.hero?.tokens??0}`;
  const nearby=nearestLoot(),near=!!hero&&!!nearby&&distance(hero,nearby)<=R.lootRange;
  el('loot-prompt').textContent=near?`G · TAKE ${WEAPONS[nearby.weapon].name.toUpperCase()} + ${nearby.tokens} WIF`:nearby?`GUN PICKUP · ${Math.ceil(distance(hero!,nearby))} m away`:hero&&!hero.ammo&&!hero.reserveAmmo?'OUT OF BULLETS · FIND AN ENEMY GUN':'R RELOAD · G LOOT · X SWAP GUN';
  el<HTMLButtonElement>('reload-rifle').disabled=!hero||!!game.result||hero.reloadUntil>game.tick||!hero.reserveAmmo||hero.ammo>=WEAPONS[hero.weapon].magazine;
  el<HTMLButtonElement>('pickup-loot').disabled=!near||!!game.result;
  el<HTMLButtonElement>('switch-weapon').disabled=!hero||hero.weapons.length<2||!!game.result;
  if (selected !== null && !own.some(s => s.id === selected)) {
    releaseMouse();
    clearTarget();
    selected = game.hero&&!game.hero.alive?null:own[0]?.id ?? null;
    if (started && !game.result) toast(selected === null ? 'Your squad was lost. No soldiers remain. Deploy another squad if you have 20 credits.' : `Your selected squad was lost. Squad ${friendlyName(selected)} is now selected.`);
  }
  el('score-you').textContent = String(game.scores[0]).padStart(3, '0'); el('score-bot').textContent = String(game.scores[1]).padStart(3, '0');
  el('timer').textContent = game.endless?'WAVE '+game.endless.wave:'UNTIMED';
  el('phase').textContent = !started?'READY':game.result?'RUN ENDED':paused?'PAUSED':game.countdown?'GET READY':game.endless?'ENDLESS FRONT':rangeTraining?'DISARMED TRAINING TARGET':drill?'COMBAT DRILL':'HOLD THE STATIONS';
  el('budget').textContent = String(game.budgets[0]); el('slots').textContent = `${own.length} / 3 ACTIVE`;
  document.querySelector('.squad-panel .panel-heading > span')!.textContent = '1. YOUR TEAM · CLICK A SQUAD';
  document.body.dataset.trainingStep = guided && started && !game.result ? String(tutorialStage) : '';
  el('selected-name').textContent = selected && own.some(s => s.id === selected) ? `SQUAD ${friendlyName(selected)} SELECTED` : 'SELECT A SQUAD';
  const squadSignature = own.map(s => s.id).join('|') + ':' + game.pending.filter(p => p.side === 0).length;
  if (el('squad-cards').dataset.signature !== squadSignature) {
    el('squad-cards').dataset.signature = squadSignature;
    el('squad-cards').innerHTML = own.map((s, i) => `<button class="squad-card ${s.id === selected ? 'selected' : ''}" data-squad="${s.id}" aria-pressed="${s.id === selected}" aria-label="Select squad ${i + 1}, ${s.hp} health"><span><b>◈</b> SQUAD ${i + 1} <kbd>${i + 1}</kbd></span><div class="hp-track"><i style="width:${s.hp}%"></i></div><small>${s.id === selected ? '✓ SELECTED' : 'CLICK TO SELECT'} · ${Math.ceil(s.hp)} HP · ${squadMembers(s)}/3 MEN</small></button>`).join('') + (game.pending.some(p => p.side === 0) ? '<span class="preparing">PREPARING<br>REINFORCEMENT</span>' : own.length ? '' : '<span class="preparing">NO SQUADS LEFT<br>Use DEPLOY SQUAD if you have 20 credits.</span>');
  }
  el('squad-cards').querySelectorAll<HTMLButtonElement>('[data-squad]').forEach(card => {
    const squad = own.find(s => s.id === Number(card.dataset.squad))!;
    const active = squad.id === selected;
    card.classList.toggle('selected', active);
    card.setAttribute('aria-pressed', String(active));
    card.setAttribute('aria-label', `${started ? 'Select' : 'Start guided practice with'} squad ${friendlyName(squad.id)}, ${squad.hp} health`);
    card.querySelector<HTMLElement>('.hp-track i')!.style.width = `${squad.hp}%`;
    card.querySelector('small')!.textContent = `${!started ? 'CLICK TO START & SELECT' : active ? '✓ SELECTED' : 'CLICK TO SELECT'} · ${Math.ceil(squad.hp)} HP · ${squadMembers(squad)}/3 MEN`;
  });
  el('selected-name').textContent = !started ? 'SELECT A SQUAD TO START PRACTICE' : selected && own.some(s => s.id === selected) ? `SQUAD ${friendlyName(selected)} · ${game.countdown ? 'READY AFTER COUNTDOWN' : 'CHOOSE A STATION ABOVE'}` : 'NO SQUAD SELECTED · CLICK A CARD';
  el('move').classList.toggle('active', targeting === 'move');
  el('move').querySelector('strong')!.textContent = targeting === 'move' ? 'PICK GROUND' : 'MOVE TO…';
  el('emp').classList.toggle('active', targeting === 'emp');
  for(const id of ['take-control','fire-rifle','aim-rifle'])el<HTMLButtonElement>(id).disabled=!started||!!game.result||!own.some(s=>s.id===selected)||game.countdown>0;
  el('relay-status').innerHTML = game.relays.map(r => `<b class="${r.owner === 0 ? 'friendly' : r.owner === 1 ? 'hostile' : ''}">${r.id}</b>`).join('');
  document.querySelectorAll<HTMLButtonElement>('[data-relay]').forEach((b, i) => {
    const r = game.relays[i];
    const label=`${r.owner}:${r.contested}`;
    if(b.dataset.label!==label){b.dataset.label=label;b.innerHTML = `<b>${r.id}</b><span>GO TO ${['NORTH', 'CENTRE', 'SOUTH'][i]}<small>${r.contested ? 'CONTESTED' : r.owner === 0 ? 'YOURS · +1 POINT / SEC' : r.owner === 1 ? 'ENEMY STATION' : 'CAPTURE THIS STATION'}</small></span>`;}
    b.disabled = !started || game.countdown > 0 || !!game.result || selected === null || !own.some(s => s.id === selected);
  });
  for (const kind of ['shield', 'emp', 'deploy'] as const) {
    const cooldown = Math.max(0, Math.ceil((game.cooldowns[0][kind] - game.tick) / R.ticks));
    const cost = kind === 'shield' ? R.shieldCost : kind === 'emp' ? R.empCost : R.deployCost;
    el<HTMLButtonElement>(kind).disabled = !started || game.countdown > 0 || !!game.result || cooldown > 0 || game.budgets[0] < cost || (kind === 'deploy' ? own.length + game.pending.filter(p => p.side === 0).length >= 3 : !own.some(s => s.id === selected));
    if (kind !== 'deploy') el(`${kind}-cost`).innerHTML = cooldown ? `${cooldown}s COOLDOWN` : `${cost} CR <kbd>${kind === 'shield' ? 'Q' : 'E'}</kbd>`;
    else el('deploy').innerHTML = cooldown ? `PREPARING / READY IN ${cooldown}s` : '+ DEPLOY SQUAD <span>20 CR</span>';
  }
  for (const key of ['move', 'retreat']) el<HTMLButtonElement>(key).disabled = !started || game.countdown > 0 || !!game.result || !own.some(s => s.id === selected);
  el('countdown').hidden = !started || game.countdown === 0; el('countdown').textContent = String(Math.ceil(game.countdown / R.ticks));
  if (guided && tutorialStage === 2 && game.relays.some(r => r.owner === 0)) tutorialStage = 3;
  if (guided && tutorialStage === 3 && observe(game, 0).squads.some(s => s.side === 1)) tutorialStage = 4;
  const guidance = [
    ['Choose your soldiers', 'Your team controls the cyan soldiers. The highlighted SQUAD 1 card is at the bottom left. Click it, press 1, or use the button here. You move with WASD. In EYE LEVEL, choose TAKE CONTROL to look freely and fire your rifle. Your soldiers fire automatically.'],
    ['Send your squad to station B', 'A relay is a radio station inside a circle on the ground. Look for the large B marker in the middle of the map. Click GO TO CENTRE at the top, or SEND SQUAD TO B here. Your soldiers will walk there by themselves.'],
    ['Let your squad capture B', 'Your movement order is active. Wait for your soldiers to reach the B circle, then stay inside it for five seconds with no enemy present. You do not need to click again. The station turns cyan when captured and starts earning points.'],
    ['Watch the northern flank', 'The training bot is approaching through relay A. Buildings block sight, so its position appears only when visible.'],
    ['Bring more soldiers', 'An enemy is visible. Click DEPLOY SQUAD at the bottom right or use the button here. It costs 20 of your 100 practice credits. After two seconds a second squad and its selection card appear at home.'],
    ['Protect your selected squad', 'Click SHIELD in the bottom controls or use the button here. It protects the selected squad for four seconds, absorbs 30 damage and costs 10 credits.'],
    ['Now hold two stations', 'Select a squad card, then click GO TO NORTH or GO TO SOUTH to capture another station. Each station earns points. Reach 240 points. There is no match timer. Keep your main character alive. WASD moves your squad; drag to look; V changes camera.'],
  ];
  el('tutorial-card').hidden = !guided || !started || !!game.result;
  if (el('tutorial-card').dataset.stage !== String(tutorialStage)) { el('tutorial-card').dataset.stage = String(tutorialStage); el('tutorial-card').classList.remove('compact'); }
  el('tutorial-details').textContent = el('tutorial-card').classList.contains('compact') ? 'Show instructions' : 'Hide instructions to see map';
  el('tutorial-title').textContent = guidance[tutorialStage][0]; el('tutorial-copy').textContent = guidance[tutorialStage][1];
  el('tutorial-step').textContent = `FIELD TRAINING · STEP ${tutorialStage + 1} OF 7`;
  const trainingAction = el<HTMLButtonElement>('tutorial-action');
  const actionLabel=['SELECT SQUAD 1', 'SEND SQUAD TO B', 'SHOW OVERHEAD MAP', 'SHOW OVERHEAD MAP', 'DEPLOY SECOND SQUAD · 20 CR', 'SHIELD SELECTED SQUAD · 10 CR', 'SHOW OVERHEAD MAP'][tutorialStage];
  if(trainingAction.textContent!==actionLabel)trainingAction.textContent=actionLabel;
  trainingAction.disabled = tutorialStage === 1 ? game.countdown > 0 || selected === null : tutorialStage === 4 ? el<HTMLButtonElement>('deploy').disabled : tutorialStage === 5 ? el<HTMLButtonElement>('shield').disabled : false;
  if (game.result && !resultShown) {
    releaseMouse();
    clearTarget();
    resultShown = true; el('result-title').textContent = rangeTraining?(game.hero?.tokens?'TRAINING COMPLETE':'TRAINING ENDED'):game.hero&&!game.hero.alive?'YOU DIED':game.result.winner === null ? 'Signal unresolved.' : game.result.winner === 0 ? 'Frequency secured.' : 'Transmission lost.';
    el('result-reason').textContent = game.endless?`${game.result.reason}. ${game.endless.cleared} waves cleared. Restart whenever you want.`:`${game.result.reason}. You ${game.scores[0]} / Bot ${game.scores[1]}.`;
    el('result-stats').innerHTML = `<p>Relays held <b>${game.relays.filter(r => r.owner === 0).length} / 3</b></p><p>Squads lost <b>${game.lost[0]}</b></p><p>Reserve spent <b>${game.spent[0]} CR</b></p><p>Reserve remaining <b>${game.budgets[0]} CR</b></p><p>Practice WIF remaining <b>${game.hero?.tokens??0} · SIMULATED</b></p>`;
    el('result-observations').textContent = `You used ${spending.filter(s => s.action === 'DEPLOY').length} paid reinforcements and ${spending.filter(s => s.action !== 'DEPLOY').length} support abilities. ${game.budgets[0]} of your 100 starting practice credits remained.`;
    try { const history = JSON.parse(localStorage.getItem('last-signal-results') ?? '[]'); history.unshift({ at: new Date().toISOString(), mode: 'LOCAL_PRACTICE', drill, rangeTraining, endless:game.endless, result: game.result, scores: game.scores, spent: game.spent[0] }); localStorage.setItem('last-signal-results', JSON.stringify(history.slice(0, 10))); } catch { /* Match results work without persistence. */ }
    el('result').querySelector('.honesty')!.textContent=rangeTraining?'FIRING RANGE · DISARMED TARGET · SIMULATED PICKUPS':'LOCAL PRACTICE / NO CHAIN SETTLEMENT';
    dialog('result').showModal();
  }
}
function frame(now: number) {
 if(!["KeyW","KeyA","KeyS","KeyD"].some(key=>heldKeys.has(key)))scene.view.releaseMovement();

  const elapsed = Math.min((now - lastFrame) / 1000, .25); lastFrame = now;
  if(scene.contextLost){requestAnimationFrame(frame);return;}
  if (started && !paused && !game.result && !dialog('supplies').open) {
    accumulator += elapsed;
    let catchup = 0;
    while (accumulator >= 1 / R.ticks && catchup++ < 5) {
      if(triggerHeld)fireRifle();
      if(game.countdown===0&&heldKeys.size&&!document.querySelector('dialog[open]')) {
 const squad=game.squads.find(s=>s.id===(game.hero?.squadId??selected)&&s.side===0);
 if(squad){const d=scene.view.direction(Number(heldKeys.has('KeyW'))-Number(heldKeys.has('KeyS')),Number(heldKeys.has('KeyD'))-Number(heldKeys.has('KeyA')));
 if(d.x||d.z){if(targeting)clearTarget();const accepted=command(game,{id:'keys:'+ ++seq,side:0,kind:'drive',squadId:squad.id,direction:d});if(accepted.ok&&guided&&tutorialStage===1)tutorialStage=2;}}
 }
 step(game);
      if(game.countdown===0&&game.tick===0)toast('WASD moves you. TAKE CONTROL enables mouse look, left fire and right aim. Your soldiers fire automatically.');
      if (game.countdown === 0 && !rangeTraining) {
        const observation = observe(game, 1);
        if (!guided || tutorialStage >= 6) {
          for (const c of botCommands(observation, 1)) command(game, c);
        } else if (tutorialStage >= 3 && game.tick % 60 === 0) {
          // The scripted training route uses ordinary commands and only known map geometry.
          // It waits for the first player capture, then approaches from the north.
          const botSquad = observation.squads.find(s => s.side === 1);
          if (botSquad && !botSquad.route.length) {
            if (distance(botSquad, { x: 26, z: 7 }) < 1) tutorialFlankPhase = 1;
            command(game, { id: `training:${game.tick}`, side: 1, kind: 'move', squadId: botSquad.id, target: tutorialFlankPhase === 0 ? { x: 26, z: 7 } : { x: 26, z: 16 } });
          }
        }
      }
      accumulator -= 1 / R.ticks;
    }
  }
  const events: GameEvent[] = game.events.filter(e => !(e.kind === 'DeployAccepted' && e.side !== 0) && (!e.from || visible(game, 0, e.from)) && (!e.to || e.side === 0 || visible(game, 0, e.to)));
  for (const e of events) if (e.seq > lastNotice && e.text && e.kind !== 'SquadSpawned') { if (started) toast(e.text); }
  lastNotice = game.eventSeq;
  const observation=observe(game,0);
 scene.update(observation,selected,events,elapsed);
 review.update(now);
 const ownSelected=observation.squads.find(s=>s.id===(game.hero?.squadId??selected));
 feedback.update(observation,events,now);
 if(ownSelected&&scene.viewMode==='eyes'){
   const weaponStatus=paused?'PAUSED · PRESS P TO RESUME':ownSelected.reloadUntil>game.tick?'RELOADING…':ownSelected.disabledUntil>game.tick?'WEAPON DISABLED BY EMP':!ownSelected.ammo?(ownSelected.reserveAmmo?'EMPTY · PRESS R TO RELOAD':'OUT OF BULLETS · FIND AN ENEMY GUN'):game.tick-(ownSelected.rifleAt??-100)<WEAPONS[ownSelected.weapon].ticks?'CYCLING WEAPON':document.body.classList.contains('mouse-captured')?'WASD MOVE · LEFT FIRE · RIGHT AIM · R RELOAD · G LOOT · ESC RELEASE':'READY · TAKE CONTROL TO LOOK AND FIRE · R RELOAD · G LOOT';
   if(el('shoot-status').textContent!==weaponStatus)el('shoot-status').textContent=weaponStatus;
   const sight=traceRifle(observation,ownSelected,scene.aimDirection());
   el('field-reticle').classList.toggle('on-target',!!sight.target);
   el('aim-status').textContent=(now<hitUntil?'HIT CONFIRMED':sight.target?`ENEMY IN SIGHTS · ${Math.round(distance(ownSelected,sight.target))} m · ${Math.ceil(sight.target.hp)} HP`:'AIM AT AN ENEMY · SQUAD FIRES AUTOMATICALLY')+` · YOUR HITS ${rifleHits}`;
   el('aim-rifle').classList.toggle('active',scene.view.aiming);
 }else if(!ownSelected){el('aim-status').textContent='NO SOLDIERS LEFT · DEPLOY A NEW SQUAD';el('field-reticle').classList.remove('on-target');}
 if(ownSelected){const state=ownSelected.disabledUntil>game.tick?'WEAPONS DISABLED':ownSelected.suppression>=60?'UNDER FIRE / SUPPRESSED':game.tick-ownSelected.shotAt<20?'ENGAGING HOSTILES':isMoving(ownSelected,game.tick)?'MOVING':ownSelected.coverId!==null?'HOLDING COVER':'HOLDING POSITION';el('field-state').textContent=Math.ceil(ownSelected.hp)+' HP / '+state;el('damage-feedback').style.opacity=String(scene.reducedMotion?0:Math.max(0,1-(game.tick-ownSelected.lastHit)/12)*.7);}else{el('field-state').textContent=started?'SELECT A LIVING SQUAD':'READY TO DEPLOY';el('damage-feedback').style.opacity='0';}
 drawMap(observation);
 for(const event of events)if(event.seq>soundEvent){if(event.kind==='ShotFired'||event.kind==='PlayerShot')gunSound();if(event.kind==='PlayerHit'&&event.side===0){rifleHits++;hitUntil=now+350;el('field-reticle').classList.add('hit');}if(event.kind==='RelayCaptured')tone(640,.18);}
 el('field-reticle').classList.toggle('hit',now<hitUntil);
 soundEvent=game.eventSeq;
 if(ownSelected&&isMoving(ownSelected,game.tick)&&now-lastStepSound>330){tone(75,.035);lastStepSound=now;}
  if (now - lastHud > 100) { updateHud(); lastHud = now; }
  requestAnimationFrame(frame);
}
updateHud(); requestAnimationFrame(frame);
window.addEventListener('pagehide', () => { review.dispose();scene.dispose(); void audio?.close(); }, { once: true });

registerRoundExit(async()=>{if(started&&!game.result){const result=command(game,{id:'quit:'+ ++seq,side:0,kind:'surrender'});if(!result.ok)throw Error(result.reason);if(game.hero)game.hero.tokens=0;game.loot=[];game.budgets[0]=0;started=false;releaseMouse();}},()=>started&&!game.result);
const entryMode=new URLSearchParams(location.search);if(entryMode.get('play')==='1'){if(entryMode.get('mode')==='endless')beginEndless();else if(entryMode.get('mode')==='classic')begin(false);}
document.addEventListener('operation-menu-open',()=>{releaseMouse();if(started&&!game.result){userPaused=true;paused=true;triggerHeld=false;heldKeys.clear();pauseButton.textContent='RESUME · P';updateHud();}});
