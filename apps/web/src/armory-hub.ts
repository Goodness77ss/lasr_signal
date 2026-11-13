import {connectGameWallet} from './game-wallet.ts';
import {mountJourneyArmory} from './journey-armory.ts';
import './armory-hub.css';
import type {Eip1193Provider} from 'ethers';

import {mountCollection} from './weapons-module.ts';
import {mountSalvage} from './armory-module.ts';
import {mountWallet} from './testnet-module.ts';
import {armoryAction,isArmoryBusy,playerMessage,publishArmoryWallet} from './armory-runtime.ts';
import {installOperationNavigation} from './operation-navigation.ts';

const app=document.querySelector<HTMLElement>('#app')!;
app.innerHTML=`<header class="hub-header"><a class="brand" href="/">LAST <span>SIGNAL</span><small>HOLD YOUR GROUND.</small></a><nav aria-label="Game"><a href="/survival.html">Play</a><a href="/armory.html" aria-current="page">Armory</a></nav><div class="wallet-controls"><span id="hub-balance">Wallet not connected</span><button id="hub-connect">Connect wallet ↗</button></div></header>
<div class="test-strip"><span class="status-dot"></span> DEMO MODE <span>Test credits only. No real money.</span><a href="#wallet">Wallet help ↗</a></div>
<main class="hub-shell"><section class="armory-hero"><div class="hero-copy"><p class="eyebrow">THE FIELD ARMORY / LAST SIGNAL</p><h1>FIELD ARMORY</h1><p>SELECT YOUR EQUIPMENT</p><a class="hero-link" href="#shop">Browse equipment <span>↓</span></a></div><div class="hero-art"><span class="hero-cross cross-one">+</span><span class="hero-cross cross-two">+</span><div class="hero-orbit"></div><img src="/art/weapons/service-rifle-v1.png" alt="Weathered walnut and steel service rifle" width="2160" height="720" fetchpriority="high"><div class="hero-caption"><span>01 / SERVICE RIFLE</span><span>STEADY. DEPENDABLE. YOURS.</span></div><span class="hero-watermark" aria-hidden="true">FIELD<br>ISSUE</span></div></section>

<div class="armory-tabs" role="tablist" aria-label="Armory"><button id="tab-locker" role="tab" data-panel="locker" aria-controls="hub-pane-locker">My equipment</button><button id="tab-shop" role="tab" data-panel="shop" aria-controls="hub-pane-shop">Shop <span>↗</span></button><button id="tab-market" role="tab" data-panel="market" aria-controls="hub-pane-market">Player market</button><button id="tab-wallet" role="tab" data-panel="wallet" aria-controls="hub-pane-wallet">Rewards & help</button></div>
<p id="hub-status" class="hub-status" role="status">Browse gear · Connect to equip, trade or claim.</p><div id="hub-collection"></div><div id="hub-combat" hidden></div>

</main><footer class="hub-footer"><a class="brand" href="/">LAST SIGNAL</a><p>Game equipment · Demo credits · No monetary value</p><a href="/survival.html">Back to the battlefield ↗</a></footer>`;
mountCollection(document.querySelector('#hub-collection')!);
mountJourneyArmory(document.querySelector('#hub-collection')!);
mountSalvage(document.querySelector('#hub-legacy-recoveries')!);
mountWallet(document.querySelector('#hub-wallet-desk')!);
document.querySelector('#hub-combat')!.append(document.querySelector('#salvage-play')!);
installOperationNavigation(document.querySelector('header')!);
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const panels=['locker','shop','market','wallet'];
function showPanel(){const panel=panels.includes(location.hash.slice(1))?location.hash.slice(1):'shop';document.dispatchEvent(new Event('armory:panel'));el('hub-combat').hidden=true;el('salvage-play').hidden=true;el('hub-collection').hidden=false;for(const name of panels){el('hub-pane-'+name).hidden=name!==panel;const wrapper=el('hub-pane-'+name).parentElement;if(wrapper?.classList.contains('journey-older-equipment'))wrapper.hidden=name!==panel;const tab=el<HTMLButtonElement>('tab-'+name);tab.setAttribute('aria-selected',String(name===panel));tab.tabIndex=name===panel?0:-1;}}
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-panel]')){button.onclick=()=>{location.hash=button.dataset.panel!;showPanel();};button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const current=panels.indexOf(button.dataset.panel!);const next=event.key==='Home'?0:event.key==='End'?3:(current+(event.key==='ArrowRight'?1:3))%4;location.hash=panels[next];el('tab-'+panels[next]).focus();};}
window.addEventListener('hashchange',showPanel);showPanel();
document.addEventListener('armory:play',()=>{el('hub-combat').hidden=false;el('hub-collection').hidden=true;});
el('hub-leave-fight').onclick=()=>{location.hash='locker';showPanel();};
type Injected=Eip1193Provider&{on?:(name:string,callback:()=>void)=>void};
const injected=(window as Window&{ethereum?:Injected}).ethereum;
let connected=false;
function invalidate(){connected=false;publishArmoryWallet(null);sessionStorage.removeItem('last-signal-testnet-auth');el('hub-balance').textContent='Wallet not connected';el('hub-connect').textContent='Connect wallet ↗';el('hub-status').textContent='Connect your wallet to buy, trade or collect. Saved match recovery stays in this browser.';}
for(const event of ['accountsChanged','chainChanged','disconnect'])injected?.on?.(event,invalidate);
const connectWallet=async(interactive=true)=>{const wallet=await connectGameWallet(injected,message=>{el('hub-status').textContent=message;},interactive);connected=true;publishArmoryWallet(wallet);el('hub-connect').textContent='Disconnect';el('hub-balance').textContent='Wallet connected';el('hub-status').textContent='Your equipment is loading.';};
el('hub-connect').onclick=()=>{if(connected){invalidate();return;}void armoryAction(()=>connectWallet()).catch(error=>{el('hub-status').textContent=playerMessage((error as Error).message);});};
if(sessionStorage.getItem('last-signal-testnet-auth'))void armoryAction(()=>connectWallet(false)).catch(()=>{});
document.addEventListener('armory:busy',()=>{el<HTMLButtonElement>('hub-connect').disabled=isArmoryBusy();});
document.addEventListener('armory:balance',event=>{if(connected)el('hub-balance').textContent=(event as CustomEvent<{balance:string}>).detail.balance+' test credits';});

const icons:Record<string,string>={locker:'<path d="M4 8h16v13H4zM8 8V4h8v4M4 13h16M10 13v3h4v-3"/>',shop:'<path d="M3 10h18l-2-6H5zM5 10v11h14V10M9 21v-7h6v7"/>',market:'<path d="M3 7h17l-4-4M21 17H4l4 4M20 7l-4 4M4 17l4-4"/>',wallet:'<path d="M3 6h16v15H3zM3 6l13-3v3M15 12h6v5h-6z"/>'};
for(const [name,paths]of Object.entries(icons)){const tab=el('tab-'+name);tab.insertAdjacentHTML('afterbegin','<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5">'+paths+'</svg>');}
const guide=document.createElement('details');guide.className='equipment-guide';guide.innerHTML='<summary>How gear works ⓘ</summary><div><span>▣</span><b>WALLET OWNED</b><small>Your owned gear stays in your wallet.</small></div><div><span>⇄</span><b>TRADE</b><small>Choose an item and set your asking price.</small></div><div><span>⬡</span><b>RECOVER</b><small>Collect equipment earned in eligible runs.</small></div>';el('hub-collection').append(guide);
document.addEventListener('pointerover',event=>{const card=(event.target as HTMLElement).closest('.gun-card');const image=card?.querySelector<HTMLImageElement>('.weapon-render');if(image){const preview=document.querySelector<HTMLImageElement>('.hero-art>img')!;preview.src=image.src;preview.alt=image.alt;document.querySelector('.hero-caption')!.textContent=image.alt.toUpperCase();}});
for(const section of document.querySelectorAll<HTMLElement>('#hub-pane-wallet .support-card')){const paragraphs=Array.from(section.children).filter((node):node is HTMLParagraphElement=>node instanceof HTMLParagraphElement&&!node.id&&node.textContent!.length>90);if(!paragraphs.length)continue;const detail=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Rules & help';detail.append(summary,...paragraphs);section.append(detail);}


document.addEventListener('journey:catalog-ready',()=>{for(const name of panels){const pane=el('hub-pane-'+name);if(pane.parentElement?.classList.contains('journey-older-equipment'))continue;const detail=document.createElement('details');detail.className='journey-older-equipment';const title=document.createElement('summary');title.textContent='Earlier equipment and support';detail.hidden=pane.hidden;pane.replaceWith(detail);detail.append(title,pane);}},{once:true});
