import { PRACTICE_ROSTER,defaultRosterSelection,resolveRoster,type RosterSelection } from '../../../packages/sim/src/journey/roster.ts';
import { soldierClass } from '../../../packages/sim/src/journey/classes.ts';
import { journeyWeapon } from '../../../packages/sim/src/journey/weapons.ts';

export function createRosterSetup(deploy:(selection:RosterSelection)=>Promise<void>):HTMLElement {
  const section=document.createElement('section');section.className='journey-roster-setup';section.setAttribute('aria-label','Squad setup');
  const title=document.createElement('h3');title.textContent='CHOOSE YOUR SQUAD';
  const note=document.createElement('p');note.textContent='One leader, up to two helpers. Free rifles and local class profiles. No wallet required.';
  const selectors:HTMLSelectElement[]=[],equipment:HTMLSelectElement[]=[],defaults=defaultRosterSelection();section.append(title,note);
  for(const [index,label] of ['Leader','Helper 1','Helper 2'].entries()){
    const group=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=label;group.append(legend);
    const select=document.createElement('select');select.setAttribute('aria-label',label+' soldier');
    const empty=document.createElement('option');empty.value='';empty.textContent=index===0?'Choose a leader':'No helper';select.append(empty);
    for(const entry of PRACTICE_ROSTER){const option=document.createElement('option');option.value=entry.id;option.textContent=entry.name+(entry.source==='free-starter'?' / FREE':' / LOCAL PRACTICE');option.disabled=entry.availability!=='available';select.append(option);}
    select.value=defaults[index]!.id;selectors.push(select);group.append(select);
    const gear=document.createElement('select');gear.setAttribute('aria-label',label+' equipment');
    for(const [value,text,disabled] of [['signature','Signature equipment / included',false],['owned','Owned guns / not available in Journey practice',true]] as const){const option=document.createElement('option');option.value=value;option.textContent=text;option.disabled=disabled;gear.append(option);}
    equipment.push(gear);group.append(gear);
    const details=document.createElement('p');details.className='journey-roster-details';group.append(details);
    const update=()=>{const entry=PRACTICE_ROSTER.find(e=>e.id===select.value);gear.disabled=!entry;
      if(!entry){details.textContent=index===0?'A living leader is required.':'This slot will stay empty.';return;}
      const p=entry.classId==='starter-rifle'?null:soldierClass(entry.classId);
      details.textContent=(p?.role??'Rifle')+' · '+(p?.health??100)+' HP · '+(p?.armour??0)+'% armour · '+journeyWeapon(entry.weapon).name+' · '+(p?.grenades??2)+' grenades'+(p?.medicalCharges?' · '+p.medicalCharges+' treatments':'')+(p?.ammoCharges?' · '+p.ammoCharges+' reserve charge':'');
    };select.onchange=update;update();section.append(group);
  }
  const owned=document.createElement('p');owned.textContent='Signature equipment is included in practice. Your owned guns stay separate in the Armory.';
  const armory=document.createElement('a');armory.href='/armory.html';armory.textContent='OPEN ARMORY';
  const status=document.createElement('p');status.setAttribute('role','alert');status.tabIndex=-1;status.hidden=true;
  const button=document.createElement('button');button.type='button';button.textContent='DEPLOY SELECTED SQUAD';
  button.onclick=async()=>{status.hidden=true;button.disabled=true;
    try{const selection=selectors.map((select,index)=>{if(!select.value)return null;const entry=PRACTICE_ROSTER.find(e=>e.id===select.value);if(!entry)throw Error('Choose an available soldier.');return {id:entry.id,revision:entry.revision,loadout:equipment[index].value as 'signature'};});resolveRoster(selection);await deploy(selection);}
    catch(error){status.textContent=error instanceof Error?error.message:'Could not prepare this squad.';status.hidden=false;status.focus();}
    finally{button.disabled=false;}
  };
  section.append(owned,armory,status,button);return section;
}
