const root=document.querySelector<HTMLElement>('#app')!;
root.textContent='Loading the front…';
const params=new URLSearchParams(location.search);
const survival=location.pathname.endsWith('/survival.html')||params.get('mode')==='survival';
const mode=params.get('mode')??(location.pathname==='/'||location.pathname.endsWith('/index.html')?'journey-server':null);
const start=mode==='journey-server'?import('./journey-server.ts'):mode==='journey'?import('./journey.ts'):location.pathname.endsWith('/private.html')?import('./private.ts'):survival?import('./stations.ts'):['endless','classic'].includes(mode??'')?import('./main.ts'):mode==='landing'?import('./landing.ts'):import('./journey-server.ts');
void start.catch(error=>{
 console.error('Battlefield startup failed:',error instanceof Error?error.message:'Unknown startup error');
 root.replaceChildren();
 const panel=document.createElement('main');panel.style.cssText='max-width:600px;margin:10vh auto;padding:24px;font:18px sans-serif;color:#e9dfc2;background:#182a24';panel.setAttribute('role','alert');
 const title=document.createElement('h1');title.textContent='The battlefield could not start.';
 const copy=document.createElement('p');copy.textContent='This game needs WebGL 2 and a working graphics driver. Enable hardware acceleration, close other graphics heavy tabs and reload. A missing application download can also cause this screen. No wallet action was submitted.';
 const retry=document.createElement('button');retry.textContent='RETRY';retry.style.cssText='padding:16px;margin:12px';retry.onclick=()=>location.reload();
 const tokens=document.createElement('a');tokens.href='/testnet.html';tokens.textContent='OPEN TOKEN RECOVERY';tokens.style.color='inherit';
 panel.append(title,copy,retry,tokens);root.append(panel);
});
