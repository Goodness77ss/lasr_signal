import './operation-navigation.css';

type RoundExit={quit:()=>Promise<void>;active:()=>boolean};
let roundExit:RoundExit|null=null;
export function registerRoundExit(quit:()=>Promise<void>,active:()=>boolean){roundExit={quit,active};const button=document.getElementById('operation-quit');if(button)button.hidden=false;}
// Shared navigation never reads wallet storage or substitutes practice counters
// for chain balances. The existing wallet pages remain their actual authority.
export function installOperationNavigation(header:HTMLElement,options:{guardPageLinks?:boolean;quitMessage?:string}={}){
 if(document.getElementById('operation-modes'))return;
 const button=document.createElement('button');button.id='operation-modes';button.textContent='OPERATIONS';button.setAttribute('aria-haspopup','dialog');
 const menu=document.createElement('dialog');menu.id='operation-menu';menu.setAttribute('aria-label','Choose an operation');
 menu.innerHTML='<div class="operation-menu-heading"><small>LAST SIGNAL / OPERATIONS</small><button id="operation-menu-close" aria-label="Close operations">×</button></div><h2>Choose your front.</h2><nav aria-label="Game modes"><a href="/"><strong>MODE SELECT</strong><span>Choose your next round.</span></a><a href="/?mode=endless&play=1"><strong>ENDLESS FRONT</strong><span>Survive the waves.</span></a><a href="/?mode=classic&play=1"><strong>CLASSIC RELAY</strong><span>Capture stations and win on points.</span></a><a href="/?mode=survival&play=1"><strong>STATION SURVIVAL</strong><span>Capture, defend, resupply and extract. Free server practice.</span></a><a href="/private.html"><strong>PRIVATE MULTIPLAYER</strong><span>Join another player on the configured service.</span></a><a href="/armory.html"><strong>ARMORY</strong><span>Your guns, shop, player market and wallet claims.</span></a><a href="/survival-funded.html"><strong>TESTNET SURVIVAL</strong><span>Wallet allocation, automatic settlement and claims. Service availability required.</span></a></nav><p id="operation-leave-note">Practice counters and wallet balances remain separate. No wallet transaction is submitted by choosing a mode.</p>';
 button.onclick=()=>{document.dispatchEvent(new Event('operation-menu-open'));menu.showModal();};
 menu.querySelector<HTMLButtonElement>('#operation-menu-close')!.onclick=()=>menu.close();
 const quit=document.createElement('button');quit.id='operation-quit';quit.textContent='QUIT ROUND';quit.hidden=!roundExit;
 const warning=document.createElement('section');warning.id='operation-quit-warning';warning.hidden=true;warning.innerHTML='<h3>Leave this round?</h3><p>You lose all unclaimed rewards and recovered loot from this round. This cannot be undone. Previously owned guns and wallet funds stay yours.</p><button id="operation-quit-cancel">CANCEL</button><button id="operation-quit-confirm">QUIT & FORFEIT REWARDS</button><p id="operation-quit-status" role="alert"></p>';
 if(options.quitMessage)warning.querySelector('p')!.textContent=options.quitMessage;
 let destination='/';const requestExit=(target:string)=>{destination=target;if(!roundExit?.active()){location.assign(target);return;}document.dispatchEvent(new Event('operation-menu-open'));if(document.pointerLockElement)document.exitPointerLock();if(!menu.open)menu.showModal();warning.hidden=false;warning.querySelector<HTMLButtonElement>('#operation-quit-cancel')!.focus();};
 quit.onclick=()=>requestExit('/');menu.append(quit,warning);
 menu.querySelector<HTMLButtonElement>('#operation-quit-cancel')!.onclick=()=>{warning.hidden=true;quit.focus();};
 menu.querySelector<HTMLButtonElement>('#operation-quit-confirm')!.onclick=async()=>{const confirm=menu.querySelector<HTMLButtonElement>('#operation-quit-confirm')!,cancel=menu.querySelector<HTMLButtonElement>('#operation-quit-cancel')!,status=menu.querySelector<HTMLElement>('#operation-quit-status')!;confirm.disabled=true;cancel.disabled=true;status.textContent='Ending your round…';try{await roundExit?.quit();location.assign(destination);}catch(error){status.textContent=(error as Error).message;confirm.disabled=false;cancel.disabled=false;}};
 for(const link of menu.querySelectorAll<HTMLAnchorElement>('nav a'))link.addEventListener('click',event=>{if(roundExit?.active()){event.preventDefault();requestExit(link.href);}});
 if(options.guardPageLinks)document.addEventListener('click',event=>{if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0||!roundExit?.active())return;const link=(event.target as Element|null)?.closest<HTMLAnchorElement>('a[href]');if(!link||menu.contains(link)||link.target==='_blank'||link.hasAttribute('download'))return;const target=new URL(link.href);if(target.origin!==location.origin||!['http:','https:'].includes(target.protocol))return;event.preventDefault();requestExit(link.href);});
 header.append(button);document.body.append(menu);
 const currentMode=location.pathname==='/survival.html'?'survival':new URLSearchParams(location.search).get('mode');
 for(const link of menu.querySelectorAll<HTMLAnchorElement>('a')){const target=new URL(link.href);if(currentMode?target.searchParams.get('mode')===currentMode:target.pathname===location.pathname&&!target.searchParams.has('mode'))link.setAttribute('aria-current','page');}
}
