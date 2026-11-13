import {WEAPONS} from '@last-signal/sim';
export const weaponArtPaths=['/art/weapons/service-rifle-v1.png','/art/weapons/field-carbine-v1.png','/art/weapons/trench-shotgun-v1.png'] as const;
export const weaponNames=['Service rifle','Field carbine','Trench shotgun'] as const;
export const weaponRoles=['STEADY / MID RANGE','QUICK / FLEXIBLE','HEAVY / CLOSE RANGE'] as const;
export const weaponDescriptions=['A dependable rifle for holding the line. Steady shots, useful reach and a twenty round magazine.','Move fast and stay in the fight. A quicker firing carbine with thirty rounds before reloading.','Spread shots share one damage limit. Built for close encounters. Check availability before choosing this gun.'] as const;
export function createWeaponArt(kind:number){const image=document.createElement('img');image.className='weapon-render';image.src=weaponArtPaths[kind]??weaponArtPaths[0];image.alt=weaponNames[kind]??'Collectible gun';image.width=2160;image.height=720;image.loading='lazy';image.decoding='async';return image;}

export function createWeaponStats(kind:number){const stats=Object.values(WEAPONS)[kind];const dl=document.createElement('dl');dl.className='weapon-stats';if(stats)for(const [label,value]of [['Damage',stats.damage],['Rounds',stats.magazine]]){const pair=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=String(label);dd.textContent=String(value);pair.append(dt,dd);dl.append(pair);}return dl;}
