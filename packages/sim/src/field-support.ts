import {RULES,distance,lineOfSight,type Game} from './index.ts';
import type {SurvivalRules} from './survival-rules.ts';
export type FieldState={credits:number;ammoAt:number;medicalAt:number;medicalUsed:number;picked:number[]};
export const createFieldState=(rules:SurvivalRules):FieldState=>({credits:rules.economy.fieldCredits,ammoAt:0,medicalAt:0,medicalUsed:0,picked:[]});
export function fieldSupport(game:Game,state:FieldState,rules:SurvivalRules,item:'BASIC_AMMO'|'BASIC_MEDICAL',asset:string){
  const f=rules.field,hero=game.squads.find(s=>s.id===game.hero?.squadId);
  const reject=(reason:string)=>({ok:false,reason});
  if(asset!=='FIELD_CREDITS')return reject('Basic support requires nontransferable FIELD_CREDITS');
  if(!['BASIC_AMMO','BASIC_MEDICAL'].includes(item))return reject('Field credits only buy basic ammunition or medical support');
  if(!f||!hero||game.result||!game.hero?.alive||game.countdown>0)return reject('Living active starter run required');
  if(item==='BASIC_AMMO'){
    if(state.credits<f.ammoCost)return reject('Not enough field credits');
    if(game.tick<state.ammoAt)return reject('Basic ammunition cooldown is active');
    if(hero.reserveAmmo+f.ammoRounds>RULES.maxReserveAmmo)return reject('Not enough spare ammunition capacity');
    hero.reserveAmmo+=f.ammoRounds;state.credits-=f.ammoCost;state.ammoAt=game.tick+f.ammoCooldownSeconds*rules.ticksPerSecond;
    return {ok:true,reason:f.ammoRounds+' spare rounds applied for '+f.ammoCost+' field credits'};
  }
  if(state.credits<f.medicalCost)return reject('Not enough field credits');
  if(state.medicalUsed>=f.medicalUses)return reject('Basic medical support already used this run');
  if(game.tick<state.medicalAt||game.tick-hero.lastHit<f.medicalSafeSeconds*rules.ticksPerSecond)return reject('Medical support needs five active seconds without damage');
  if(hero.hp>=RULES.squadHp)return reject('Health already full');
  const healed=Math.min(f.medicalHp,RULES.squadHp-hero.hp);hero.hp+=healed;state.credits-=f.medicalCost;state.medicalUsed++;state.medicalAt=game.tick+f.medicalCooldownSeconds*rules.ticksPerSecond;
  return {ok:true,reason:healed+' health restored. Fallen helpers stay down'};
}
export function takeFieldAmmo(game:Game,state:FieldState,rules:SurvivalRules,lootId:number){
  const f=rules.field,hero=game.squads.find(s=>s.id===game.hero?.squadId),drop=game.loot.find(l=>l.id===lootId);
  if(!f||!hero||game.result||!game.hero?.alive||game.countdown>0)return {ok:false,reason:'Living active starter run required'};
  if(!drop||state.picked.includes(lootId))return {ok:false,reason:'Ammunition drop unavailable or already collected'};
  if(state.picked.length>=f.dropLimit)return {ok:false,reason:'Run ammunition pickup limit reached'};
  if(distance(hero,drop)>f.dropRange||!lineOfSight(hero,drop))return {ok:false,reason:'Reach the ammunition drop with a clear path'};
  const rounds=Math.min(f.dropRounds,RULES.maxReserveAmmo-hero.reserveAmmo);
  if(rounds<=0)return {ok:false,reason:'Spare ammunition is full'};
  hero.reserveAmmo+=rounds;state.picked.push(lootId);game.loot=game.loot.filter(l=>l.id!==lootId);
  return {ok:true,reason:rounds+' spare rounds recovered. No tokens or NFT minted'};
}
