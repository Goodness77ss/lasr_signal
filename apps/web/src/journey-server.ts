import {connectGameWallet} from './game-wallet.ts';
import {compactJourneyHud} from './journey-hud.ts';
import {journeyEntryMarkup,initialiseJourneyEntry} from './journey-entry.ts';
import {installOperationNavigation,registerRoundExit} from './operation-navigation.ts';
import {mountFundedRecovery} from './journey-funded-panel.ts';
import {mountOwnedRoster} from './journey-owned-panel.ts';
import {JourneyOwnedWallet} from './journey-owned-wallet.ts';
import {mountJourneyProgress} from './journey-progress-panel.ts';
import {JourneyProgressWallet} from './journey-progress-wallet.ts';


import {SupplyWallet,SupplyRedemptionCancelled} from './journey-supply-wallet.ts';
import './journey.css';
import {JourneyScene} from './journey-scene.ts';
import {JourneyAudio} from './journey-audio.ts';
import {JourneyConnection,type JourneyPublicSnapshot,type JourneyRecovery} from './journey-connection.ts';
import {JOURNEY_COMBINED_IDENTIFIERS,JOURNEY_RECOVERY_IDENTIFIERS,JOURNEY_OWNED_IDENTIFIERS,JOURNEY_SUPPLY_IDENTIFIERS,JOURNEY_REWARD_IDENTIFIERS,JOURNEY_EQUIPMENT_IDENTIFIERS,type JourneyAction} from '../../../packages/protocol/src/journey.ts';
import {journeyWeapon} from '../../../packages/sim/src/journey/weapons.ts';
import {SOLDIER_CLASS_IDS,soldierClass} from '../../../packages/sim/src/journey/classes.ts';
import type {RosterSelection} from '../../../packages/sim/src/journey/roster.ts';
import {parseEquipmentSelection} from '../../../packages/sim/src/journey/equipment.ts';
import {BrowserProvider,getAddress,type Eip1193Provider} from 'ethers';

const root=document.querySelector<HTMLElement>('#app')!;
if(import.meta.env.VITE_JOURNEY_ENABLED==='false')root.textContent='Server Journey preview is disabled.';
else await start();
async function start(){
 document.title='LAST SIGNAL | Server Journey preview';
 root.innerHTML=`<main class="journey-app journey-server-app"><div id="journey-field" tabindex="0" aria-label="Server Journey battlefield"></div><header class="journey-top"><a class="journey-brand" href="/">LAST SIGNAL</a><span class="journey-environment">LOCAL SERVER PRACTICE</span><button id="sound">SOUND OFF</button><button id="reconnect">RECONNECT</button><a href="/?mode=journey">LOCAL PRACTICE</a></header><section class="journey-roster"><small>SERVER OBSERVATION</small><p id="health">Awaiting entry</p><p id="identity">No equipment admitted</p><p id="state">DISCONNECTED</p></section><section class="journey-bottom"><div class="journey-status"><span>SERVER AMMUNITION</span><strong id="ammo">—</strong><small id="weapon">AWAITING ENTRY</small></div><div class="journey-actions"><button id="fire">FIRE</button><button id="reload">RELOAD</button><button id="view">EYE LEVEL</button><button id="crouch">CROUCH</button><button id="jump">JUMP</button><button id="vault">VAULT</button><button id="ability">ABILITY</button><button id="pickup">PICK UP</button><button id="pause">PAUSE</button><button id="continue">CONTINUE</button><button id="bank">BANK PRACTICE</button><button id="quit">QUIT</button></div></section><p id="journey-notice" role="status">Experimental server preview. WASD moves. Drag to look. No local gameplay simulation.</p>${journeyEntryMarkup()}</main>`;
 const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T,scene=new JourneyScene(el('journey-field')),audio=new JourneyAudio(),controls=new AbortController();
 const objective=document.createElement('section');objective.className='journey-objective journey-server-objective';objective.innerHTML='<small>JOURNEY</small><h1>Reach the checkpoint.</h1><p data-route>Awaiting route</p><p data-squad></p><p data-loot></p>';document.querySelector('.journey-server-app')!.append(objective);
 for(const id of SOLDIER_CLASS_IDS){const p=soldierClass(id),option=document.createElement('option');option.value='development:'+id;option.textContent=p.name+' · '+p.role;el<HTMLSelectElement>('leader').append(option);}
 initialiseJourneyEntry();
 let snapshot:JourneyPublicSnapshot|null=null,previous=performance.now(),driveAt=0,dragging=false,pointerX=0,pointerY=0,frame=0,reloadReview=false,reviewShotId:string|null=null;let fundingNotice='';let refreshAfterSupply=false;let connectionStatus='closed';const held=new Set<string>(),storageKey='last-signal-journey-recovery';
 const note=(text:string)=>{el('journey-notice').textContent=text;el('entry-status').textContent=text;};
 function walletSession(){const auth=JSON.parse(sessionStorage.getItem('last-signal-testnet-auth')??'null');if(!auth||typeof auth.session!=='string'||auth.expires<=Date.now())throw Error('Log in with your wallet in Collections first.');return String(auth.session);}
 const client=new JourneyConnection(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/journey`,{snapshot:observed=>{
  snapshot=observed;returnRoster.hidden=!['BANKED','DEAD','QUIT'].includes(observed.state);el('setup').hidden=true;const funding=(observed as typeof observed&{funded?:{state:string;pendingPayout:string;confirmedPayout:string}}).funded;el('bank').textContent=funding?'BANK LOCAL REWARDS':'BANK PRACTICE';if(funding){document.querySelector('.journey-environment')!.textContent='LOCAL BACKED / '+funding.state;const nextFundingNotice=funding.state+':'+funding.pendingPayout+':'+funding.confirmedPayout;if(nextFundingNotice!==fundingNotice){fundingNotice=nextFundingNotice;note('Pool rewards: '+(BigInt(funding.pendingPayout)/10n**18n)+' pending · '+(BigInt(funding.confirmedPayout)/10n**18n)+' confirmed test credits. Zero deposit or stake.');}}const leader=observed.actors[0];const checkpoint=observed.sectionData?.checkpoint;objective.querySelector('[data-route]')!.textContent=(observed.sectionData?.region??'Road').replaceAll('-',' ')+' · '+(checkpoint?Math.round(Math.hypot(checkpoint.x-leader.x,checkpoint.z-leader.z))+' m to checkpoint':'Awaiting checkpoint');objective.querySelector('[data-squad]')!.textContent=observed.actors.filter(actor=>actor.side===0).map(actor=>(actor.id===1?'Leader':'Helper '+(actor.id-1))+': '+actor.hp+' HP').join(' / ')+' · Grenades '+(leader.grenades?.quantity??0);objective.querySelector('[data-loot]')!.textContent=observed.state==='BANKED'?'BANKED':observed.state==='CHECKPOINT_REACHED'?'CHECKPOINT READY · BANK OR CONTINUE':'Provisional '+(observed.practiceCredits+(observed.rewards?.provisionalLoot??0))+(funding?' local reward credits':' practice credits');el('ammo').textContent=leader.reloadAt>observed.tick?'RELOADING':leader.ammo+' / '+leader.reserve;el('weapon').textContent=journeyWeapon(leader.battlefieldWeapon?.buildId??leader.build?.weapon??'service-rifle').name.toUpperCase();el('health').textContent=leader.hp+' HP · '+observed.actors.filter(a=>a.side===1&&a.hp>0).length+' VISIBLE GUARDS';el('identity').textContent=leader.battlefieldWeapon?'TEMPORARY BATTLEFIELD WEAPON / BANK TO RECOVER':observed.equipment?'LOCAL CHAIN GUN / '+observed.equipment.entries[0].asset.tokenId:observed.ownedOwner?'OWNED SOLDIER SIGNATURES':'FREE SIGNATURE EQUIPMENT';el('state').textContent=observed.state+' · TICK '+observed.tick;
  if(client.recovery)sessionStorage.setItem(storageKey,JSON.stringify(client.recovery));
  if(reloadReview&&leader.reloadAt>observed.tick&&client.state==='ready'&&!client.awaitingAcknowledgement){const total=Math.ceil(journeyWeapon(leader.battlefieldWeapon?.buildId??leader.build?.weapon??'service-rifle').reloadTicks*(leader.classState?soldierClass(leader.classState.id).reloadPercent:100)/100);if(leader.reloadAt-observed.tick<=total/2){reloadReview=false;client.command({kind:'pause'});note('Authored reload review paused through ordinary server commands at the middle of the reload.');}}
 },ack:ack=>{if(!ack.ok)note(ack.reason);if(refreshAfterSupply){refreshAfterSupply=false;void refreshStock();}if(reviewShotId===ack.id){reviewShotId=null;if(ack.ok){client.command({kind:'pause'});note('Authored one shot review. One normal fire command followed by a normal pause.');}}},recovery:identity=>{sessionStorage.setItem(storageKey,JSON.stringify(identity));el<HTMLButtonElement>('recover').hidden=false;},status:(state,reason)=>{const recovered=state==='ready'&&connectionStatus==='connecting';connectionStatus=state;if(recovered)note('Journey connected. Showing the server acknowledged state.');el('state').textContent=state==='ready'&&snapshot?(client.paused&&['ACTIVE','CHECKPOINT_REACHED'].includes(snapshot.state)?'PAUSED':snapshot.state)+' · TICK '+snapshot.tick:state.toUpperCase();if(reason)note(reason);}});
 type Injected=Eip1193Provider&{on?:(event:string,callback:()=>void)=>void;removeListener?:(event:string,callback:()=>void)=>void};
 const injected=(window as Window&{ethereum?:Injected}).ethereum,loginButton=document.createElement('button');loginButton.textContent='CONNECT WALLET';el('owned-tools').prepend(loginButton);
 loginButton.onclick=async()=>{loginButton.disabled=true;try{await connectGameWallet(injected,note);loginButton.textContent='WALLET CONNECTED';document.dispatchEvent(new Event('journey-wallet-ready'));void refreshStock();note('Your equipment is ready to choose.');}catch(error){note((error as Error).message);}finally{loginButton.disabled=false;}};
 const walletChanged=()=>{sessionStorage.removeItem('last-signal-testnet-auth');client.disconnect();loginButton.textContent='CONNECT WALLET';note('Your wallet changed. Connect again to load your equipment.');};injected?.on?.('accountsChanged',walletChanged);injected?.on?.('chainChanged',walletChanged);
 mountJourneyProgress(document.querySelector('.journey-server-app')!,document.querySelector('.journey-top')!,()=>client.recovery?.run,async(operation,body)=>{
  const response=await fetch('/api/journey/progress/'+operation,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+walletSession()},body:JSON.stringify(body)}),result=await response.json();if(!response.ok)throw Error(result.error??'Progress unavailable');return result;
 },async()=>{if(!injected)throw Error('A local owner wallet is required');const config=await fetch('/api/journey/config').then(r=>r.json());if(!config.ownedRoster?.progressEnabled)throw Error('Local progress submission unavailable');const provider=new BrowserProvider(injected),signer=await provider.getSigner();return new JourneyProgressWallet(provider,signer,await signer.getAddress(),{...config.ownedRoster,chainId:Number(config.ownedRoster.chainId)});});
 const active=()=>snapshot&&['ACTIVE','CHECKPOINT_REACHED'].includes(snapshot.state)&&client.state==='ready'&&!client.awaitingAcknowledgement&&!scene.contextLost;
 mountFundedRecovery(document.querySelector('.journey-server-app')!,document.querySelector('.journey-top')!,()=>client.recovery?.run,async(operation,run)=>{const response=await fetch('/api/journey/funded/'+operation,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+walletSession()},body:JSON.stringify({run})}),value=await response.json();if(!response.ok)throw Error(value.error??'Allocation recovery unavailable');return value;},run=>{
  if(client.recovery?.run===run){if(client.snapshot)throw Error('An observed run cannot be reset by allocation cancellation');sessionStorage.setItem('last-signal-cancelled-admission:'+run,JSON.stringify(client.recovery));client.dispose();sessionStorage.removeItem(storageKey);}
  const draft=JSON.parse(sessionStorage.getItem('last-signal-owned-roster-draft')??'null');if(draft?.run===run){delete draft.funded;sessionStorage.setItem('last-signal-owned-roster-draft',JSON.stringify(draft));const choice=document.querySelector<HTMLInputElement>('[data-funded]');if(choice)choice.checked=false;}
 });
 const order=(action:JourneyAction)=>{if(!active()||client.paused&&!['resume','pause','quit'].includes(action.kind))return;try{client.command(action);}catch(error){note((error as Error).message);}};
 registerRoundExit(async()=>{held.clear();dragging=false;await client.quitAndWait();},()=>!!client.recovery&&(!snapshot||!['BANKED','DEAD','QUIT'].includes(snapshot.state)));
 installOperationNavigation(document.querySelector<HTMLElement>('.journey-top')!,{guardPageLinks:true,quitMessage:'Leaving ends this run and forfeits only unbanked new rewards and recovered loot. Previously owned assets and unused opened supplies persist. Funded Journey has no player deposit or stake.'});
 document.addEventListener('operation-menu-open',()=>{held.clear();dragging=false;scene.view.releaseMovement();},{signal:controls.signal});
 const enterRun=async(useOwnedGun:boolean)=>{const button=el<HTMLButtonElement>(useOwnedGun?'enter-equipment':'enter');button.disabled=true;button.textContent='JOINING…';try{
  const response=await fetch('/api/journey/config'),config=await response.json();if(config.funded?.deployment)localStorage.setItem('last-signal:journey-offline-pool',JSON.stringify(config.funded.deployment));if(!response.ok||!config.enabled||!config.authoritativeGameplay)throw Error('Authoritative Journey service is unavailable.');
  const leader=el<HTMLSelectElement>('leader').value,helpers=Number(el<HTMLSelectElement>('helpers').value),roster:RosterSelection=[{id:leader,revision:1,loadout:'signature'},helpers>=1?{id:'starter:2',revision:1,loadout:'signature'}:null,helpers===2?{id:'starter:3',revision:1,loadout:'signature'}:null],tokenId=useOwnedGun?el<HTMLInputElement>('token').value.trim():'';
  if(useOwnedGun&&!tokenId)throw Error('Choose an owned gun, or use Play Journey for the ready squad');
  if(tokenId){
   if(!config.equipment?.admission||config.equipment.chainId!=='31337'||typeof config.equipment.collection!=='string')throw Error('Local collectible equipment is unavailable on this service.');
   const session=walletSession(),asset={kind:'gun',chainId:'31337',collection:config.equipment.collection,tokenId},query=new URLSearchParams(asset),inspection=await fetch('/api/weapons/journey-inspect?'+query),gun=await inspection.json();if(!inspection.ok)throw Error(gun.error??'Gun inspection failed');
   const equipment=parseEquipmentSelection([{actorId:1,asset,buildId:gun.immutableBuild?.build?.id,buildHash:gun.immutableBuild?.hash,assetNonce:gun.assetNonce}]);client.connect({op:'start',...(el<HTMLInputElement>('enable-recovery').checked?JOURNEY_RECOVERY_IDENTIFIERS:el<HTMLInputElement>('enable-supplies').checked?JOURNEY_SUPPLY_IDENTIFIERS:JOURNEY_EQUIPMENT_IDENTIFIERS),roster,equipment,session});
  }else client.connect({op:'start',...JOURNEY_REWARD_IDENTIFIERS,roster});
 }catch(error){note((error as Error).message);}finally{button.disabled=false;button.textContent=useOwnedGun?'PLAY WITH THIS GUN':'PLAY JOURNEY';}};
 el('enter').onclick=()=>void enterRun(false);el('enter-equipment').onclick=()=>void enterRun(true);
 const ownedWeaponPlay=document.createElement('button');ownedWeaponPlay.hidden=true;el('owned-tools').append(ownedWeaponPlay);ownedWeaponPlay.onclick=()=>void enterRun(true);document.addEventListener('journey-owned-weapon',event=>{const choice=(event as CustomEvent<{tokenId:string;name:string}>).detail;el<HTMLInputElement>('token').value=choice.tokenId;ownedWeaponPlay.textContent='PLAY WITH '+choice.name.toUpperCase();ownedWeaponPlay.hidden=false;},{signal:controls.signal});
 const supplyChoice=document.createElement('label');supplyChoice.textContent='Use my opened supplies';const supplyCheck=document.createElement('input');supplyCheck.type='checkbox';supplyCheck.id='enable-supplies';supplyChoice.prepend(supplyCheck);el('advanced-tools').append(supplyChoice);
 const recoveryChoice=document.createElement('label');recoveryChoice.textContent='Enable eligible weapon recovery with this gun';const recoveryCheck=document.createElement('input');recoveryCheck.type='checkbox';recoveryCheck.id='enable-recovery';recoveryChoice.prepend(recoveryCheck);el('advanced-tools').append(recoveryChoice);
 const stockLabel=document.createElement('p');stockLabel.textContent='Opened supplies: not loaded';document.querySelector('.journey-roster')!.append(stockLabel);
 let stock:number[]=[0,0,0,0],stockFrozen=true;
 async function refreshStock(){
  try{
   const response=await fetch('/api/journey/supplies/stock',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+walletSession()},body:'{}'}),data=await response.json();
   if(!response.ok)throw Error(data.error??'Stock unavailable');
   stock=data.units.map((unit:{quantity:string})=>Number(unit.quantity));stockFrozen=data.frozen;
   stockLabel.textContent=data.frozen?'Opened stock frozen for reconciliation':'Opened stock: health '+stock[0]+' · grenades '+stock[1]+' · ammo '+stock[2]+' · repair '+stock[3];
  }catch(error){stockFrozen=true;stockLabel.textContent=(error as Error).message;}
 }
 const redeemTerms=document.createElement('p');redeemTerms.textContent='Burn one unopened pack for three nontransferable opened units. Unused opened units persist after quit or death. This cannot be undone.';
 const redeemClass=document.createElement('select');redeemClass.setAttribute('aria-label','Pack to redeem');['Health kit','Grenade pack','Ammunition pack','Armour repair kit'].forEach((name,id)=>{const option=document.createElement('option');option.value=String(id);option.textContent=name;redeemClass.append(option);});
 const redeemButton=document.createElement('button');redeemButton.textContent='BURN ONE PACK FOR THREE OPENED UNITS';
 el('supply-tools').append(redeemTerms,redeemClass,redeemButton);
 redeemButton.onclick=async()=>{redeemButton.disabled=true;try{
  if(sessionStorage.getItem('last-signal-supply-pending'))throw Error('Recover the pending redemption before burning another pack');
  if(!injected)throw Error('A local wallet is required for pack redemption');
  const session=walletSession(),config=await fetch('/api/journey/config').then(r=>r.json());if(!config.supplies?.enabled)throw Error('Local supplies unavailable');localStorage.setItem('last-signal:journey-offline-supplies',JSON.stringify({...config.supplies,chainId:Number(config.supplies.chainId)}));
  const provider=new BrowserProvider(injected),signer=await provider.getSigner(),wallet=new SupplyWallet(provider,signer,await signer.getAddress(),{...config.supplies,chainId:Number(config.supplies.chainId)}),itemClass=Number(redeemClass.value);
  const tx=await wallet.redeem(itemClass,1n);sessionStorage.setItem('last-signal-supply-pending',JSON.stringify({hash:tx.hash,nonce:tx.nonce,itemClass,owner:wallet.wallet,quantity:'1',deployment:wallet.deployment,collection:config.supplies.collection}));note('Pack redemption submitted. Waiting for two confirmations: '+tx.hash);
  const proof=await wallet.waitRedemption(tx,itemClass,1n,hash=>sessionStorage.setItem('last-signal-supply-pending',JSON.stringify({hash,nonce:tx.nonce,itemClass,owner:wallet.wallet,quantity:'1',deployment:wallet.deployment,collection:config.supplies.collection})));
  const response=await fetch('/api/journey/supplies/recover',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+session},body:JSON.stringify(proof)}),result=await response.json();
  if(!response.ok)throw Error(result.error??'Confirmed redemption recovery unavailable');
  sessionStorage.removeItem('last-signal-supply-pending');await refreshStock();note('Pack burned and three opened units confirmed. Unused stock persists.');
 }catch(error){if(error instanceof SupplyRedemptionCancelled)sessionStorage.removeItem('last-signal-supply-pending');note((error as Error).message);}finally{redeemButton.disabled=false;}};
 const replacementInput=document.createElement('input');replacementInput.placeholder='Replacement hash, if wallet changed the transaction';replacementInput.setAttribute('aria-label','Replacement transaction hash');el('supply-tools').append(replacementInput);
 const recoverPack=document.createElement('button');recoverPack.textContent='RECOVER PENDING REDEMPTION';el('supply-tools').append(recoverPack);
 recoverPack.onclick=async()=>{recoverPack.disabled=true;try{
  const pending=JSON.parse(sessionStorage.getItem('last-signal-supply-pending')??'null');if(!pending)throw Error('No pending redemption saved in this tab');
  if(!injected)throw Error('Reconnect the local redemption wallet');
  const session=walletSession(),config=await fetch('/api/journey/config').then(r=>r.json());
  if(!config.supplies?.enabled||getAddress(pending.collection)!==getAddress(config.supplies.collection))throw Error('Pending redemption belongs to another deployment');
  const provider=new BrowserProvider(injected),signer=await provider.getSigner(),wallet=new SupplyWallet(provider,signer,await signer.getAddress(),{...config.supplies,chainId:Number(config.supplies.chainId)});
  const hash=replacementInput.value.trim()||pending.hash;
  if(replacementInput.value.trim()){
   const outcome=await wallet.replacementOutcome(hash,pending.nonce);
   if(outcome==='cancelled'){sessionStorage.removeItem('last-signal-supply-pending');note('Confirmed cancellation or failed replacement. No opened stock granted.');return;}
  }
  const proof=await wallet.confirmedRedemption(hash,pending.itemClass,1n);
  const response=await fetch('/api/journey/supplies/recover',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+session},body:JSON.stringify(proof)}),result=await response.json();
  if(!response.ok)throw Error(result.error??'Redemption recovery unavailable');
  sessionStorage.removeItem('last-signal-supply-pending');await refreshStock();note('Confirmed opened stock recovered. No second burn was submitted.');
 }catch(error){note((error as Error).message);}finally{recoverPack.disabled=false;}};
 mountOwnedRoster(el('owned-tools'),async()=>{if(!injected)throw Error('A local owner wallet is required');walletSession();const config=await fetch('/api/journey/config').then(r=>r.json());if(!config.ownedRoster?.enabled)throw Error('Owned roster admission unavailable');const provider=new BrowserProvider(injected),signer=await provider.getSigner();return new JourneyOwnedWallet(provider,signer,await signer.getAddress(),{...config.ownedRoster,chainId:Number(config.ownedRoster.chainId)},config.ownedRoster.service);},walletSession,message=>client.connect(message),()=>!client.recovery);

 const refreshButton=document.createElement('button');refreshButton.textContent='REFRESH OPENED STOCK';refreshButton.onclick=()=>void refreshStock();el('supply-tools').append(refreshButton);
 const supplyButtons:HTMLButtonElement[]=[];
 for(const [itemClass,label] of ['USE HEALTH','THROW OWNED GRENADE','USE AMMO','REPAIR ARMOUR'].entries()){
  const button=document.createElement('button');button.textContent=label;button.id='supply-'+itemClass;
  button.onclick=()=>{if(!active()||client.paused)return;refreshAfterSupply=true;const aim=scene.aim();order({kind:'supply',itemClass:itemClass as 0|1|2|3,targetId:1,...(itemClass===1?{direction:{x:aim.x,y:aim.y,z:aim.z}}:{})});};
  document.querySelector('.journey-actions')!.append(button);supplyButtons.push(button);
 }
 const reconnect=()=>{try{const recovery=client.recovery;if(recovery)client.reconnect((recovery.rules===JOURNEY_COMBINED_IDENTIFIERS.rules||recovery.rules===JOURNEY_RECOVERY_IDENTIFIERS.rules||recovery.rules===JOURNEY_EQUIPMENT_IDENTIFIERS.rules||recovery.rules===JOURNEY_SUPPLY_IDENTIFIERS.rules||recovery.rules===JOURNEY_OWNED_IDENTIFIERS.rules)?walletSession():undefined);else{const saved=JSON.parse(sessionStorage.getItem(storageKey)??'null') as JourneyRecovery|null;if(!saved)throw Error('No saved acknowledged Journey in this tab.');client.resume(saved,(saved.rules===JOURNEY_COMBINED_IDENTIFIERS.rules||saved.rules===JOURNEY_RECOVERY_IDENTIFIERS.rules||saved.rules===JOURNEY_EQUIPMENT_IDENTIFIERS.rules||saved.rules===JOURNEY_SUPPLY_IDENTIFIERS.rules||saved.rules===JOURNEY_OWNED_IDENTIFIERS.rules)?walletSession():undefined);}}catch(error){note((error as Error).message);}};
 el('reconnect').onclick=reconnect;el('recover').onclick=reconnect;
 const sdkReview=new URLSearchParams(location.search).get('review')==='local-sdk'&&location.protocol==='http:'&&['localhost','127.0.0.1'].includes(location.hostname);
 if(sdkReview){el('equipment-advanced').hidden=false;
  document.querySelector('.journey-environment')!.textContent='AUTHORED LOCAL SDK REVIEW';const fixtureButton=document.createElement('button');fixtureButton.textContent='USE DISPOSABLE SDK OWNED GUN FIXTURE';el('enter').before(fixtureButton);
  fixtureButton.onclick=async()=>{fixtureButton.disabled=true;try{const response=await fetch('http://127.0.0.1:3002/fixture',{method:'POST',cache:'no-store'}),fixture=await response.json();if(!response.ok||fixture.environment!=='DISPOSABLE_LOCAL_BLOCKCHAIN'||fixture.authored!==true||typeof fixture.session!=='string'||fixture.expires<=Date.now())throw Error('Explicit disposable SDK review bridge is unavailable.');sessionStorage.setItem('last-signal-testnet-auth',JSON.stringify({session:fixture.session,address:fixture.address,expires:fixture.expires}));if(!el<HTMLInputElement>('token').value)el<HTMLInputElement>('token').value='1';note('Authored local SDK account. Actual local NFT ownership, no browser wallet signature and no earned issuance.');el('enter').click();}catch(error){note((error as Error).message);}finally{fixtureButton.disabled=false;}};
  const reloadReviewButton=document.createElement('button');reloadReviewButton.textContent='REVIEW RELOAD THEN PAUSE';document.querySelector('.journey-actions')!.append(reloadReviewButton);reloadReviewButton.onclick=()=>{const leader=snapshot?.actors[0];if(!active()||client.paused||!leader||leader.ammo>=journeyWeapon(leader.battlefieldWeapon?.buildId??leader.build!.weapon).magazine||!leader.reserve)return;reloadReview=true;order({kind:'reload'});};
  const shotReviewButton=document.createElement('button');shotReviewButton.textContent='FIRE ONCE THEN PAUSE';document.querySelector('.journey-actions')!.append(shotReviewButton);shotReviewButton.onclick=()=>{if(!active()||client.paused)return;const aim=scene.aim();reviewShotId=client.command({kind:'fire',direction:{x:aim.x,y:aim.y,z:aim.z}});};
 }
 const returnRoster=document.createElement('button');returnRoster.textContent='BACK TO ROSTER';returnRoster.hidden=true;returnRoster.title='Keep the completed run recovery record. Existing soldier leases release or expire separately.';document.querySelector('.journey-top')!.append(returnRoster);
 returnRoster.onclick=()=>{
  if(!snapshot||!['BANKED','DEAD','QUIT'].includes(snapshot.state)||client.state!=='ready')return;
  const recovery=client.recovery;if(!recovery)return;
  sessionStorage.setItem('last-signal-journey-previous-run',JSON.stringify(recovery));
  const draftText=sessionStorage.getItem('last-signal-owned-roster-draft');
  if(draftText){const draft=JSON.parse(draftText);if(draft.run===recovery.run){sessionStorage.setItem('last-signal-owned-roster-archive:'+recovery.run,draftText);sessionStorage.removeItem('last-signal-owned-roster-draft');}}
  client.dispose();location.reload();
 };
 for(const [label,kind] of [['GRENADE','throw'],['DODGE','dodge']] as const){const button=document.createElement('button');button.textContent=label;button.onclick=()=>{const aim=scene.aim();if(kind==='throw')order({kind,direction:aim});else{const length=Math.hypot(aim.x,aim.z);if(length>.001)order({kind,direction:{x:aim.x/length,z:aim.z/length}});}};document.querySelector('.journey-actions')!.append(button);}
 const touchMove=document.createElement('div');touchMove.className='journey-touch-move';touchMove.setAttribute('aria-label','Touch movement');
 for(const [label,key] of [['↑','KeyW'],['←','KeyA'],['↓','KeyS'],['→','KeyD']]){const button=document.createElement('button');button.textContent=label;button.setAttribute('aria-label','Move '+key.slice(3));button.onpointerdown=event=>{event.preventDefault();held.add(key);button.setPointerCapture(event.pointerId);};button.onpointerup=button.onpointercancel=button.onlostpointercapture=()=>held.delete(key);touchMove.append(button);}document.querySelector('.journey-server-app')!.append(touchMove);
 const captureButton=document.createElement('button');captureButton.textContent='SAVE REVIEW FRAME';document.querySelector('.journey-top')!.append(captureButton);
 captureButton.onclick=()=>{if(!snapshot||scene.contextLost)return;scene.renderer.render(scene.scene,scene.camera);const image=document.createElement('canvas');image.width=scene.renderer.domElement.width;image.height=scene.renderer.domElement.height+202;const context=image.getContext('2d')!;context.fillStyle='#14231c';context.fillRect(0,0,image.width,202);context.fillStyle='#e8dfbb';context.font='16px monospace';
  const actor=snapshot.actors[0],entry=snapshot.equipment?.entries.find(e=>e.actorId===1),sound=audio.inspect(),lines=[sdkReview&&entry?'AUTHORED LOCAL SDK REVIEW / PINNED LOCAL NFT EQUIPMENT':'LOCAL SERVER PRACTICE / NO CHAIN OWNERSHIP CLAIM',actor.build!.weapon+' | '+actor.ammo+' / '+actor.reserve+' | tick '+snapshot.tick+' | '+(client.paused&&['ACTIVE','CHECKPOINT_REACHED'].includes(snapshot.state)?'PAUSED':snapshot.state)+' | '+scene.view.mode+' | connection '+client.state,snapshot.pin.rules.version+' | rules '+snapshot.pin.hash,'Equipment: '+(entry?entry.asset.chainId+' / '+entry.asset.collection+' / token '+entry.asset.tokenId:'Free or development signature'),'Build: '+(entry?.buildHash??'local signature')+' | nonce '+(entry?.assetNonce??'none'),'Audio: '+sound.context+' | enabled '+sound.enabled+' | sources started '+sound.played+' | last '+sound.lastWeapon,'Sources by gun: '+JSON.stringify(sound.byWeapon)];lines.forEach((line,index)=>context.fillText(line,18,26+index*26));context.drawImage(scene.renderer.domElement,0,202);const anchor=document.createElement('a');anchor.download='journey-'+(entry?'owned':'signature')+'-'+actor.build!.weapon+'-'+snapshot.tick+'.png';anchor.href=image.toDataURL('image/png');anchor.click();};
 el('sound').onclick=async()=>{try{const enabled=await audio.setEnabled(!audio.enabled);el('sound').textContent=enabled?'SOUND ON':'SOUND OFF';}catch{note('Sound is unavailable.');}};
 el('view').onclick=()=>{scene.view.cycle();if(scene.view.mode==='tactical'&&document.pointerLockElement===scene.renderer.domElement)document.exitPointerLock();};
 el('fire').onclick=()=>{const aim=scene.aim();order({kind:'fire',direction:{x:aim.x,y:aim.y,z:aim.z}});};el('reload').onclick=()=>order({kind:'reload'});el('jump').onclick=()=>order({kind:'jump'});
 el('crouch').onclick=()=>order({kind:'pose',pose:snapshot?.actors[0].motion?.pose==='crouched'?'standing':'crouched'});
 el('vault').onclick=()=>{const aim=scene.aim(),length=Math.hypot(aim.x,aim.z);if(length>.001)order({kind:'vault',direction:{x:aim.x/length,z:aim.z/length}});};
 el('ability').onclick=()=>order({kind:'ability'});el('continue').onclick=()=>order({kind:'continue'});el('bank').onclick=()=>order({kind:'bank'});el('quit').onclick=()=>{held.clear();void client.quitAndWait().then(()=>note('Run ended. Unbanked rewards were forfeited. Existing assets and unused opened supplies persist.')).catch(error=>note((error as Error).message));};
 el('pickup').onclick=()=>{const actor=snapshot?.actors[0],drop=snapshot?.rewards?.drops.filter(d=>d.state==='AVAILABLE').sort((a,b)=>Math.hypot(a.x-actor!.x,a.z-actor!.z)-Math.hypot(b.x-actor!.x,b.z-actor!.z))[0];if(drop)order({kind:'pickup',dropId:drop.id});};
 el('pause').onclick=()=>{order({kind:client.paused?'resume':'pause'});if(document.pointerLockElement===scene.renderer.domElement)document.exitPointerLock();};
 const release=()=>{held.clear();dragging=false;scene.view.aiming=false;document.querySelector('.journey-app')!.classList.remove('is-aiming');scene.view.releaseMovement();if(document.pointerLockElement===scene.renderer.domElement)document.exitPointerLock();};
 document.addEventListener('pointerlockchange',()=>{const locked=document.pointerLockElement===scene.renderer.domElement;document.querySelector('.journey-app')!.classList.toggle('mouse-captured',locked);if(!locked){held.clear();dragging=false;scene.view.aiming=false;document.querySelector('.journey-app')!.classList.remove('is-aiming');scene.view.releaseMovement();}},{signal:controls.signal});
 document.addEventListener('operation-menu-open',()=>{if(document.pointerLockElement===scene.renderer.domElement)document.exitPointerLock();},{signal:controls.signal});
 scene.renderer.domElement.addEventListener('webglcontextlost',()=>{release();client.disconnect();audio.reset();note('Graphics lost. Restore graphics, then reconnect to the saved Journey.');},{signal:controls.signal});
 scene.renderer.domElement.oncontextmenu=event=>event.preventDefault();scene.renderer.domElement.onpointerdown=event=>{event.preventDefault();el('journey-field').focus({preventScroll:true});if(event.pointerType==='mouse'&&event.button===0){if(scene.view.mode!=='tactical'&&document.pointerLockElement!==scene.renderer.domElement){try{const lock=scene.renderer.domElement.requestPointerLock?.();if(lock)void lock.catch(()=>note('Mouse capture unavailable. Hold right mouse and drag to look.'));}catch{note('Hold right mouse and drag to look.');}}el('fire').click();return;}if(event.pointerType==='mouse'&&event.button!==2)return;if(event.pointerType==='mouse'&&event.button===2){scene.view.aiming=true;document.querySelector('.journey-app')!.classList.add('is-aiming');}dragging=true;pointerX=event.clientX;pointerY=event.clientY;scene.renderer.domElement.setPointerCapture(event.pointerId);};scene.renderer.domElement.onpointermove=event=>{if(document.pointerLockElement===scene.renderer.domElement){scene.view.rotate(event.movementX,event.movementY);return;}if(dragging){scene.view.rotate(event.clientX-pointerX,event.clientY-pointerY);pointerX=event.clientX;pointerY=event.clientY;}};scene.renderer.domElement.onpointerup=scene.renderer.domElement.onpointercancel=scene.renderer.domElement.onlostpointercapture=()=>{dragging=false;scene.view.aiming=false;document.querySelector('.journey-app')!.classList.remove('is-aiming');};
 window.addEventListener('keydown',event=>{if(event.target instanceof HTMLInputElement||event.target instanceof HTMLSelectElement||event.target instanceof HTMLTextAreaElement||(event.target instanceof HTMLElement&&event.target.isContentEditable))return;if(['KeyW','KeyA','KeyS','KeyD','Space'].includes(event.code))event.preventDefault();held.add(event.code);if(event.code==='KeyR'&&!event.repeat)el('reload').click();if(event.code==='Space'&&!event.repeat)el('jump').click();},{signal:controls.signal});window.addEventListener('keyup',event=>held.delete(event.code),{signal:controls.signal});window.addEventListener('blur',release,{signal:controls.signal});document.addEventListener('visibilitychange',()=>{if(document.hidden){release();client.disconnect();}},{signal:controls.signal});
 let runToggle=false,lastMoving=false;const runButton=compactJourneyHud();runButton.onclick=()=>{runToggle=!runToggle;runButton.setAttribute('aria-pressed',String(runToggle));};
 const render=(now:number)=>{const dt=Math.min(.1,(now-previous)/1000);previous=now;
  if(snapshot&&!scene.contextLost){scene.sprinting=!client.paused&&(runToggle||held.has('ShiftLeft')||held.has('ShiftRight'))&&!!(held.has('KeyW')||held.has('KeyA')||held.has('KeyS')||held.has('KeyD'));document.querySelector('.journey-app')!.classList.toggle('is-sprinting',scene.sprinting&&!!snapshot.actors[0].moving);scene.update(snapshot,dt,now/1000);audio.update(snapshot);el('pause').textContent=client.paused?'RESUME':'PAUSE';
   if(!client.paused&&!document.hidden&&active()&&now-driveAt>=100){const forward=Number(held.has('KeyW'))-Number(held.has('KeyS')),strafe=Number(held.has('KeyD'))-Number(held.has('KeyA'));if(forward||strafe){driveAt=now;const direction=scene.view.mode!=='tactical'?scene.view.direction(forward,strafe):{x:strafe/Math.max(1,Math.hypot(strafe,forward)),z:-forward/Math.max(1,Math.hypot(strafe,forward))};const pace=held.has('ShiftLeft')||held.has('ShiftRight')||runToggle?1:.62;order({kind:'drive',direction:{x:direction.x*pace,z:direction.z*pace}});}else if(lastMoving){driveAt=now;scene.view.releaseMovement();order({kind:'drive',direction:{x:0,z:0}});}lastMoving=!!(forward||strafe);}
  }for(const button of document.querySelectorAll<HTMLButtonElement>('.journey-actions button'))if(button.id!=='view')button.disabled=!active()||client.paused&&!['pause','quit'].includes(button.id);for(const [i,button] of supplyButtons.entries())button.disabled=!active()||client.paused||!snapshot?.pin.rules.supplies||stockFrozen||!stock[i];frame=requestAnimationFrame(render);};frame=requestAnimationFrame(render);
 if(new URLSearchParams(location.search).has('useOwned'))el<HTMLDetailsElement>('owned-setup').open=true;
 if(injected&&sessionStorage.getItem('last-signal-testnet-auth'))void connectGameWallet(injected,()=>{},false).then(()=>{loginButton.textContent='WALLET CONNECTED';document.dispatchEvent(new Event('journey-wallet-ready'));void refreshStock();}).catch(()=>{});
 window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);controls.abort();release();injected?.removeListener?.('accountsChanged',walletChanged);injected?.removeListener?.('chainChanged',walletChanged);client.dispose();audio.dispose();scene.dispose();},{once:true});
}






















