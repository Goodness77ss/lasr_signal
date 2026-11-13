const icons:Record<string,string>={fire:'<circle cx="12" cy="12" r="6"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',reload:'<path d="M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 14-2M19 16a8 8 0 0 1-14 2"/>',jump:'<path d="M5 18h14M12 16V4m-5 5 5-5 5 5"/>',view:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',run:'<circle cx="15" cy="4" r="2"/><path d="m11 9 3-2 4 4 3 1M5 10l5-3 3 6-4 7m4-7 4 3-1 5M2 15h4M1 19h3"/>'};
export function compactJourneyHud(){
 const actions=document.querySelector<HTMLElement>('.journey-actions')!;
 const drawer=document.createElement('details');drawer.className='journey-more';drawer.innerHTML='<summary aria-label="More actions">•••<span>More</span></summary><div class="journey-more-grid"></div>';
 const primary=['fire','reload','jump','view'];
 for(const button of [...actions.querySelectorAll('button')]){
  if(primary.includes(button.id)){const label=button.id==='view'?'Camera':button.id[0].toUpperCase()+button.id.slice(1);button.title=label;button.setAttribute('aria-label',label);button.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[button.id]}</svg><span>${label}</span>`;}
  else drawer.querySelector('div')!.append(button);
 }
 const run=document.createElement('button');run.id='run';run.title='Run · hold Shift or tap to toggle';run.setAttribute('aria-label','Toggle running');run.setAttribute('aria-pressed','false');run.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${icons.run}</svg><span>Run</span>`;actions.append(run,drawer);
 const menu=document.createElement('details');menu.className='journey-menu';menu.innerHTML='<summary>☰ <span>Menu</span></summary><div></div>';
 const top=document.querySelector('.journey-top')!;
 for(const element of [...top.children])if(element instanceof HTMLButtonElement&&element.id!=='sound'||element instanceof HTMLAnchorElement&&!element.classList.contains('journey-brand'))menu.querySelector('div')!.append(element);
 top.append(menu);
 const hint=document.createElement('div');hint.className='journey-controls-hint';hint.textContent='Click to play · mouse look · WASD move · left click fire · right click aim · Shift run · Esc release';document.querySelector('.journey-app')!.append(hint);
 const reticle=document.createElement('div');reticle.className='journey-crosshair';reticle.setAttribute('aria-hidden','true');reticle.innerHTML='<i></i><i></i><i></i><i></i><b></b>';document.querySelector('.journey-app')!.append(reticle);
 const streak=document.createElement('div');streak.className='journey-sprint-effect';streak.setAttribute('aria-hidden','true');document.querySelector('.journey-app')!.append(streak);
 document.querySelector('.journey-roster>small')!.textContent='SQUAD';
 document.querySelector('.journey-status>span')!.textContent='AMMO';
 return run;
}



