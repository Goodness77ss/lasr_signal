import {mountGameShell} from './game-shell.ts';

const aliases:Record<string,string>={field:'battlefield',status:'toast',eyes:'view-eyes',tactical:'view-tactical',fire:'fire-rifle',reload:'reload-rifle'};
export const stationElementId=(id:string)=>aliases[id]??id;

export function mountStationShell(root:HTMLElement){
 mountGameShell(root);document.body.dataset.experience='survival';document.title='LAST SIGNAL | Survival';
 const get=(id:string)=>document.getElementById(id)!;
 document.querySelector('.mode')!.innerHTML='<span class="status-dot"></span> SURVIVAL <small>SERVER PRACTICE · NO WALLET PAYOUT</small>';
 document.querySelector('.scene-meta span')!.textContent='SURVIVAL / KESTREL FRONT';
 get('briefing').innerHTML='<div class="eyebrow"><span>02</span> SURVIVAL BRIEFING</div><h1>Hold the<br>line.</h1><p>Capture. Defend. Extract.<br>The same front. A new operation.</p><div class="brief-rule"><b>01</b><span>Capture a station and survive its assaults.</span></div><div class="brief-rule"><b>02</b><span>Choose your supplies and optional missions.<br>Return to the western bank to extract.</span></div><button class="primary" id="start">DEPLOY · STATION SURVIVAL ↗</button><button class="text-button" id="reconnect">RECONNECT TO SAVED RUN →</button><a class="text-button" href="/">ENDLESS FRONT & CLASSIC MODES →</a><small>Free server practice. No wallet required.<br>Field credits and run earnings are separate simulated funds.</small><p id="station-ready-note" role="status">Connecting to the local service…</p>';
 const objectives=document.querySelector<HTMLElement>('.objectives')!;objectives.id='stations';
 for(const [i,button]of [...objectives.querySelectorAll<HTMLButtonElement>('button')].entries()){delete button.dataset.relay;button.dataset.station=String(i);button.innerHTML=['A · FORK AERIAL','B · TIMBER FRAME','C · DRUM POST'][i]+'<span>Awaiting deployment</span>';}
 document.querySelector('.scene-controls')!.insertAdjacentHTML('beforeend','<button id="pause" disabled>PAUSE · P</button>');
 get('surrender').id='end';get('end').textContent='End this survival run';(get('end') as HTMLButtonElement).disabled=true;
 document.querySelector('.command-deck')!.innerHTML='<section class="squad-panel"><div class="panel-heading"><span>YOUR SQUAD</span><small id="slots">FREE STARTER</small></div><strong id="stats">No wallet required</strong><p id="station-team-note">Service rifle · two helpers · field support</p></section><section class="orders"><div class="panel-heading"><span>FIELD ORDERS</span><small>CAPTURE · DEFEND · EXTRACT</small></div><div id="controls" class="action-row"><button class="action" id="station-open-supplies"><span class="action-glyph">⊞</span><strong>SUPPLIES</strong><small>FIELD & RUN <kbd>H</kbd></small></button><button class="action" id="station-open-bank"><span class="action-glyph">⌂</span><strong>EXTRACT</strong><small>WESTERN BANK</small></button><button class="action" id="station-open-ledger"><span class="action-glyph">≡</span><strong>LEDGER</strong><small>SIMULATED</small></button></div></section><section class="reserve"><div class="panel-heading"><span>RUN FUNDS</span><small>SIMULATED</small></div><div class="budget"><strong id="budget">0</strong><span>SIM<small>NO WALLET PAYOUT</small></span></div><p id="station-field-credit">20 FIELD CREDITS</p></section>';
 get('shooter-hud').insertAdjacentHTML('afterbegin','<nav id="touch" aria-label="Touch movement"><button data-move="0,1" aria-label="Move forward">↑</button><button data-move="0,-1" aria-label="Move back">↓</button><button data-move="-1,0" aria-label="Move left">←</button><button data-move="1,0" aria-label="Move right">→</button></nav>');
 get('fire-rifle').textContent='FIRE';get('release-control').textContent='COMMAND VIEW';
 get('supplies').innerHTML='<div class="dialog-heading"><small>FIELD SUPPORT / SURVIVAL</small><button data-station-close="supplies" aria-label="Close supplies">×</button></div><h2>Back into the fight.</h2><p>Free field credits and earned run funds are separate. This is practice; neither is a wallet balance.</p><div id="station-supply-content"></div><p>Opening this panel pauses active practice. Choose RESUME when ready. Wall deadlines continue.</p>';
 const bank=document.createElement('dialog');bank.id='station-bank';bank.innerHTML='<div class="dialog-heading"><small>WESTERN EXTRACTION</small><button data-station-close="station-bank" aria-label="Close extraction">×</button></div><h2>Bank what survives.</h2>';root.append(bank);
 get('help').innerHTML='<div class="dialog-heading"><small>COMMAND REFERENCE</small><button data-station-close="help" aria-label="Close help">×</button></div><h2>Capture. Defend. Return.</h2><p>WASD moves. TAKE CONTROL captures the mouse for looking, left click fires and right click aims. Escape releases the mouse. R reloads, G collects nearby ammunition and X swaps collected weapons. V cycles views. Station buttons and the minimap order movement.</p><p>Hold a station uncontested for five eligible seconds. Defend it against actual assaults. H opens supplies: field credits buy basic support, while simulated run funds buy other supplies and can fund optional mission stakes.</p><p>Mission acceptance is always your choice. Read its risk before accepting. Reach the western bank, remain still and safe for eight seconds to extract. Movement or damage interrupts extraction.</p><p>P pauses active practice. Server wall deadlines continue while paused. Leaving this mode gives sixty wall seconds of disconnect grace. No wallet tokens or NFTs are awarded in practice.</p>';
 get('token-readout').textContent='RUN FUNDS · 0 SIM';get('survival-hud').querySelector('small:not([id])')!.textContent='Server practice · no wallet payout';
 document.querySelector('footer>span')!.innerHTML='<i></i> SERVER PRACTICE <em>/</em> ORIGINAL PROCEDURAL WORLD';
 document.querySelector('.commander.hostile strong')!.textContent='HOSTILES';document.querySelector('.commander.friendly strong')!.textContent='STATIONS';
 get('phase').textContent='SURVIVAL STANDBY';get('timer').textContent='READY';get('score-you').textContent='0';get('score-bot').textContent='0';
 for(const button of document.querySelectorAll<HTMLButtonElement>('[data-station-close]'))button.onclick=()=>document.querySelector<HTMLDialogElement>('#'+button.dataset.stationClose)!.close();
}

export function finishStationShell(field:HTMLElement,run:HTMLElement,ledger:HTMLElement,extraction:HTMLElement,mission:HTMLElement,review:HTMLElement){
 document.getElementById('station-supply-content')!.append(field,run);
 document.getElementById('ledger-content')!.replaceChildren(ledger);
 document.getElementById('station-bank')!.append(extraction);
 document.getElementById('battlefield')!.append(mission);
 document.querySelector('footer')!.append(review);
 for(const panel of [field,run,ledger,extraction])if(panel instanceof HTMLDetailsElement)panel.open=true;
}
