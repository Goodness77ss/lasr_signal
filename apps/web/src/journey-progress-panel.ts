import {isError} from 'ethers';
import type {SoldierProgressVoucher} from '@last-signal/chain';
import type {JourneyProgressWallet} from './journey-progress-wallet.ts';
import type {ProgressWalletDeployment} from './journey-progress-wallet.ts';
type Update={source:string;xp:string;checkpoint:string;state:string};
type Api=(operation:string,body:Record<string,unknown>)=>Promise<any>;
export function mountJourneyProgress(parent:HTMLElement,header:HTMLElement,runId:()=>string|undefined,api:Api,connect:()=>Promise<JourneyProgressWallet>){
 const panel=document.createElement('section');panel.className='journey-progress-panel';panel.hidden=true;
 panel.innerHTML='<h2>Banked soldier progress</h2><p>Cosmetic XP only. Review and submit once after banking. Pending updates are separate from confirmed chain history.</p><label>Run identity <input data-id="run" autocomplete="off"></label><button data-id="refresh">REFRESH BANK UPDATES</button><label>Bank update <select data-id="source"></select></label><p data-id="review" role="status">Load your banked updates.</p><button data-id="submit">SUBMIT REVIEWED PROGRESS</button><label>Submitted or replacement transaction hash <input data-id="hash" autocomplete="off"></label><button data-id="recover">RECOVER CONFIRMATION</button><button data-id="close">CLOSE</button><p data-id="status" role="status"></p>';
 parent.append(panel);const toggle=document.createElement('button');toggle.textContent='PROGRESS';header.append(toggle);
 const el=<T extends HTMLElement>(id:string)=>panel.querySelector<T>('[data-id="'+id+'"]')!;
 let updates:Update[]=[];const pendingKey='last-signal-progress-pending';
 let prepared:{source:string;voucher:SoldierProgressVoucher;signature:string;deployment:ProgressWalletDeployment;owner:string}|null=null;
 const prepareButton=document.createElement('button');prepareButton.dataset.id='prepare';prepareButton.textContent='PREPARE PROGRESS FOR REVIEW';el('submit').before(prepareButton);
 const offline=document.createElement('a');offline.href='/journey-recovery.html';offline.textContent='Independent recovery for saved progress';panel.append(offline);
 toggle.onclick=()=>{panel.hidden=!panel.hidden;el<HTMLInputElement>('run').value=runId()??el<HTMLInputElement>('run').value;};el('close').onclick=()=>{panel.hidden=true;};
 const selected=()=>{const value=updates.find(row=>row.source===el<HTMLSelectElement>('source').value);if(!value)throw Error('Select a bank update');return value;};
 const review=()=>{try{const row=selected();el('review').textContent=row.xp+' banked XP · furthest checkpoint '+row.checkpoint+' · '+row.state;}catch{el('review').textContent='No pending bank update.';}};
 el('source').onchange=()=>{prepared=null;review();};
 const refresh=async()=>{prepared=null;const response=await api('list',{runId:el<HTMLInputElement>('run').value.trim()});updates=response.updates;const select=el<HTMLSelectElement>('source');select.replaceChildren();for(const row of updates){const option=document.createElement('option');option.value=row.source;option.textContent=row.xp+' XP / '+row.state;select.append(option);}review();};
 const action=(id:string,work:()=>Promise<void>)=>{el<HTMLButtonElement>(id).onclick=async()=>{for(const control of panel.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement>('input,button,select'))control.disabled=true;try{await work();}catch(error){el('status').textContent=(error as Error).message;}finally{for(const control of panel.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement>('input,button,select'))control.disabled=false;}};};
 action('refresh',refresh);
 action('prepare',async()=>{prepared=null;const source=selected().source,value=await api('prepare',{source}),wallet=await connect();prepared={source,voucher:value.voucher,signature:value.signature,deployment:wallet.metadata,owner:wallet.owner};sessionStorage.setItem('last-signal:journey-offline-progress:'+wallet.owner.toLowerCase()+':'+source,JSON.stringify(prepared));el('review').textContent='Token '+prepared.voucher.tokenId+' · Recipient '+prepared.voucher.owner+' · Cumulative XP '+prepared.voucher.cumulativeXp+' · Checkpoint '+prepared.voucher.furthestCheckpoint+' · Expires '+new Date(Number(prepared.voucher.expiry)*1000).toLocaleString()+'. Prepared for submission or independent recovery.';});
 action('submit',async()=>{
  if(sessionStorage.getItem(pendingKey))throw Error('Recover the pending progress transaction first');
  const source=selected().source;if(!prepared||prepared.source!==source)throw Error('Prepare and review this progress update first');const selectedProgress=prepared;prepared=null;const wallet=await connect(),tx=await wallet.submit(selectedProgress.voucher,selectedProgress.signature);
  const save=(hash:string)=>{sessionStorage.setItem(pendingKey,JSON.stringify({source,hash}));el<HTMLInputElement>('hash').value=hash;};save(tx.hash);el('status').textContent='Waiting for two confirmations: '+tx.hash;
  let receipt;try{receipt=await tx.wait(2);}catch(error){if(!isError(error,'TRANSACTION_REPLACED'))throw error;save(error.replacement.hash);if(error.cancelled){sessionStorage.removeItem(pendingKey);throw Error('Progress transaction cancelled. The bank update remains pending.');}receipt=error.receipt;}
  if(!receipt||receipt.status!==1)throw Error('Progress transaction did not confirm');
  const result=await api('confirm',{source,transactionHash:receipt.hash});if(result.state==='CONFIRMED')sessionStorage.removeItem(pendingKey);el('status').textContent='Progress '+result.state;await refresh();
 });
 action('recover',async()=>{const pending=JSON.parse(sessionStorage.getItem(pendingKey)??'null'),source=pending?.source??selected().source,transactionHash=el<HTMLInputElement>('hash').value.trim()||pending?.hash;if(!transactionHash)throw Error('Enter the submitted transaction hash');const result=await api('confirm',{source,transactionHash});if(result.state==='CONFIRMED')sessionStorage.removeItem(pendingKey);el('status').textContent='Progress '+result.state;await refresh();});
}
