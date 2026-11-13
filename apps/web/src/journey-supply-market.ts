import {SupplyMarketWallet,type SupplyQuote} from './journey-supply-market-wallet.ts';
export function mountSupplyMarket(parent:HTMLElement,connect:()=>Promise<SupplyMarketWallet>,operationLock:(work:()=>Promise<void>)=>Promise<void>=work=>work()){
 const panel=document.createElement('details');panel.innerHTML='<summary>Trade unopened local packs</summary><p>Local test currency only. Opened stock cannot be traded. Pack approval covers every unopened pack in this collection until revoked.</p><label>Pack <select data-id="class"><option value="0">Health</option><option value="1">Grenade</option><option value="2">Ammunition</option><option value="3">Armour repair</option></select></label><label>Number of packs <input data-id="quantity" value="1" inputmode="numeric"></label><label>Seller address to buy from <input data-id="seller" autocomplete="off"></label><button data-id="review">REVIEW PURCHASE</button><p data-id="quote" role="status">Review a seller listing before purchase.</p><button data-id="currency">APPROVE EXACT REVIEWED TOTAL</button><button data-id="buy">BUY REVIEWED PACKS</button><label>Your asking price per pack in smallest test currency units <input data-id="price" inputmode="numeric"></label><button data-id="approve">APPROVE PACK SALES</button><button data-id="list">LIST FOR ONE HOUR</button><button data-id="cancel">CANCEL MY LISTING</button><button data-id="revoke">REVOKE ALL PACK SALES APPROVAL</button><p data-id="status" role="status"></p>';
 parent.append(panel);
 const el=<T extends HTMLElement>(id:string)=>panel.querySelector<T>('[data-id="'+id+'"]')!;
 let reviewed:SupplyQuote|null=null,busy=false;
 const invalidate=()=>{reviewed=null;el('quote').textContent='Terms changed. Review again.';};
 for(const id of ['class','quantity','seller'])el(id).addEventListener('input',invalidate);
 const number=(id:string)=>{const text=el<HTMLInputElement>(id).value.trim();if(!/^[1-9][0-9]*$/.test(text))throw Error('Enter a positive whole number');return BigInt(text);};
 const item=()=>Number(el<HTMLSelectElement>('class').value);
 const action=(id:string,work:(wallet:SupplyMarketWallet)=>Promise<void>)=>{el<HTMLButtonElement>(id).onclick=async()=>{if(busy)return;busy=true;for(const control of panel.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>('button,input,select'))control.disabled=true;try{await operationLock(async()=>{await work(await connect());});}catch(error){el('status').textContent=(error as Error).message;reviewed=null;}finally{busy=false;for(const control of panel.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>('button,input,select'))control.disabled=false;}};};
 const wait=async(tx:Awaited<ReturnType<SupplyMarketWallet['approvePacks']>>)=>{el('status').textContent='Waiting for two confirmations: '+tx.hash;const receipt=await tx.wait(2);if(!receipt||receipt.status!==1)throw Error('Transaction did not confirm');el('status').textContent='Confirmed. '+receipt.hash;};
 action('review',async wallet=>{reviewed=await wallet.quote(el<HTMLInputElement>('seller').value.trim(),item(),number('quantity'));el('quote').textContent=reviewed.quantity+' packs at '+reviewed.unitPrice+' per pack. Total '+reviewed.total+' smallest test currency units. Seller '+reviewed.seller+'. Revision '+reviewed.revision+'. Expires '+new Date(Number(reviewed.expiry)*1000).toLocaleString();});
 action('currency',async wallet=>{if(!reviewed)throw Error('Review a purchase first');await wait(await wallet.approveCurrency(BigInt(reviewed.total)));});
 action('buy',async wallet=>{if(!reviewed)throw Error('Review a purchase first');const quote=reviewed;reviewed=null;await wait(await wallet.buy(quote));el('quote').textContent='Purchase confirmed. Review again for another fill.';});
 action('approve',async wallet=>{await wait(await wallet.approvePacks(true));});
 action('revoke',async wallet=>{await wait(await wallet.approvePacks(false));});
 action('list',async wallet=>{await wait(await wallet.list(item(),number('quantity'),number('price'),BigInt(Math.floor(Date.now()/1000)+3600)));});
 action('cancel',async wallet=>{await wait(await wallet.cancel(item()));});
}


