import {test,expect} from 'vitest';
import {createGame,traceShotgun,command,step,WEAPONS,type Squad} from '@last-signal/sim';
import {WeaponLab,WEAPON_LAB_VERSION} from '../apps/server/src/weapon-lab.ts';
import type {WeaponCatalog} from '../apps/server/src/weapon-catalog.ts';

function fixture(){const game=createGame(1,{untimed:true,hero:true});game.countdown=0;const[from,target]=game.squads;Object.assign(from,{x:21,z:16,weapon:'shotgun',weapons:['rifle','shotgun'],ammo:6,reserveAmmo:12,members:1});Object.assign(target,{x:24,z:16,disabledUntil:1e9,hp:1000});return {game,from,target};}
const fire=(game:ReturnType<typeof createGame>,id:string)=>command(game,{id,side:0,kind:'fire',squadId:1,direction:{x:1,y:0,z:0}});
test('shotgun has bounded cone, range, falloff and a shared thirty damage budget',()=>{
 const {game,from,target}=fixture();target.x=22.2;
 const close=traceShotgun(game,from,{x:1,y:0,z:0});expect(close.hits[0].damage).toBeGreaterThan(0);expect(close.hits.reduce((n,h)=>n+h.damage,0)).toBeLessThanOrEqual(30);
 target.x=27;const far=traceShotgun(game,from,{x:1,y:0,z:0});expect(far.hits[0].damage).toBeLessThan(close.hits[0].damage);
 target.x=30;expect(traceShotgun(game,from,{x:1,y:0,z:0}).hits).toHaveLength(0);
 Object.assign(target,{x:25,z:20});expect(traceShotgun(game,from,{x:1,y:0,z:0}).hits).toHaveLength(0);
 Object.assign(target,{x:22.2,z:16});const another={...target,id:3,x:22.6,z:16.2} as Squad;game.squads.push(another);expect(traceShotgun(game,from,{x:1,y:0,z:0}).hits.reduce((n,h)=>n+h.damage,0)).toBeLessThanOrEqual(30);
 expect(()=>traceShotgun(game,from,{x:NaN,y:0,z:0})).toThrow();
});
test('shotgun cannot hit through buildings, ground, protected homes or above a body',()=>{
 const {game,from,target}=fixture();Object.assign(from,{x:10,z:9});Object.assign(target,{x:18,z:9});expect(traceShotgun(game,from,{x:1,y:0,z:0}).hits).toHaveLength(0);
 Object.assign(from,{x:21,z:16});Object.assign(target,{x:24,z:16});expect(traceShotgun(game,from,{x:0,y:1,z:0}).hits).toHaveLength(0);expect(traceShotgun(game,from,{x:1,y:-4,z:0}).hits).toHaveLength(0);
 Object.assign(from,{x:39,z:16});Object.assign(target,{x:43,z:16});expect(traceShotgun(game,from,{x:1,y:0,z:0}).hits).toHaveLength(0);
});
test('server fire consumes one shell, enforces cadence, exact reload and prevents switching exploits',()=>{
 const {game,from,target}=fixture();expect(fire(game,'a').ok).toBe(true);expect(from.ammo).toBe(5);expect(fire(game,'b').ok).toBe(false);
 expect(command(game,{id:'switchPending',side:0,kind:'switchWeapon',squadId:1}).ok).toBe(false);step(game,{legacyObjectives:false});expect(target.hp).toBeLessThan(1000);expect(target.hp).toBeGreaterThanOrEqual(970);
 expect(command(game,{id:'switchCycle',side:0,kind:'switchWeapon',squadId:1}).ok).toBe(false);
 for(let n=1;n<16;n++)step(game,{legacyObjectives:false});expect(fire(game,'c').ok).toBe(true);step(game,{legacyObjectives:false});
 expect(command(game,{id:'reload',side:0,kind:'reload',squadId:1}).ok).toBe(true);const end=from.reloadUntil,total=from.ammo+from.reserveAmmo;
 expect(end-game.tick).toBe(44);expect(fire(game,'reloadFire').ok).toBe(false);expect(command(game,{id:'reloadSwitch',side:0,kind:'switchWeapon',squadId:1}).ok).toBe(false);
 while(game.tick<end-1)step(game,{legacyObjectives:false});expect(from.ammo).toBe(4);step(game,{legacyObjectives:false});expect(from.ammo).toBe(6);expect(from.ammo+from.reserveAmmo).toBe(total);
 for(let n=0;n<12;n++)expect(command(game,{id:'switch'+n,side:0,kind:'switchWeapon',squadId:1}).ok).toBe(true);expect(from.ammo+from.reserveAmmo).toBe(total);expect(WEAPONS.rifle.damage).toBe(20);expect(WEAPONS.rifle.ticks).toBe(5);
});
test('lab owns controls, caps runs and stops a transferred or stale NFT',async()=>{
 let now=10000,owned=true;const asset={collection:'0x1111111111111111111111111111111111111111',tokenId:'1'};
 const catalog={registry:{owned:async()=>{if(!owned)throw Error('Transferred');return {weapon:'shotgun',kind:2,version:'LEGACY_V1'};}}} as unknown as WeaponCatalog;
 const lab=new WeaponLab(true,catalog,()=>now),messages:any[]=[],peer={send:(s:string)=>messages.push(JSON.parse(s)),close:()=>{}},client=lab.connect(peer,session=>session==='valid'?'0x2222222222222222222222222222222222222222':null);
 await client.receive(JSON.stringify({op:'start',version:WEAPON_LAB_VERSION,asset,session:'wrong'}));expect(messages.at(-1).reason).toContain('login');
 await client.receive(JSON.stringify({op:'start',version:WEAPON_LAB_VERSION,asset,session:'valid'}));expect(messages.at(-1).ownedAsset).toEqual(asset);expect(messages.at(-1).observation.squads[0].weapon).toBe('shotgun');
 await client.receive(JSON.stringify({op:'command',version:WEAPON_LAB_VERSION,id:'bad',action:{kind:'fire',squadId:2,direction:{x:-1,y:0,z:0}}}));expect(messages.at(-1).reason).toContain('Only your');
 lab.tick();lab.tick();const tick=messages.at(-1).observation.tick;now+=3001;lab.tick();lab.tick();expect(messages.at(-1).observation.tick).toBe(tick);
 await lab.poll();lab.tick();lab.tick();expect(messages.at(-1).observation.tick).toBeGreaterThan(tick);owned=false;await lab.poll();expect(messages.at(-1).paused).toBe(true);
 client.close();client.close();lab.close();
});
