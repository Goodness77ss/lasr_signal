import {RULES,type Game} from './index.ts';
import type {SurvivalRules} from './survival-rules.ts';
export type RunEconomy={forfeitedWhole?:number;depositWhole:number;bonusWhole:number;spentWhole:number;failedWhole:number;lockedWhole:number;shieldAt:number;recruitAt:number};
export type RunSupply='AMMO'|'SHIELD'|'RECRUIT';
export const createRunEconomy=():RunEconomy=>({depositWhole:0,bonusWhole:0,spentWhole:0,failedWhole:0,lockedWhole:0,shieldAt:0,recruitAt:0});
export function availableRunWhole(e:RunEconomy,stationWhole:number){
  if(![...Object.values(e),stationWhole].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('Invalid simulated run accounting');
  const available=e.depositWhole+stationWhole+e.bonusWhole-e.spentWhole-e.failedWhole-e.lockedWhole-(e.forfeitedWhole??0);
  if(available<0)throw Error('Negative available run funds');return available;
}
export function runSupply(game:Game,e:RunEconomy,stationWhole:number,rules:SurvivalRules,item:RunSupply,asset:string){
  const p=rules.supplies,hero=game.squads.find(s=>s.id===game.hero?.squadId);
  const quotedWhole=p?(item==='AMMO'?p.ammoCost:item==='SHIELD'?p.shieldCost:item==='RECRUIT'?p.recruitCost:0):0;
  const reject=(reason:string)=>({ok:false,reason,quotedWhole,chargedWhole:0});
  if(asset!=='RUN_TWIF')return reject('Run supplies require the separate simulated RUN_TWIF ledger');
  if(!p||!quotedWhole||!hero||!game.hero?.alive||game.result||game.countdown>0)return reject('Valid living run and supported supply required');
  if(availableRunWhole(e,stationWhole)<quotedWhole)return reject('Not enough available run funds. Locked stakes cannot be spent');
  if(item==='AMMO'){
    if(hero.reserveAmmo+p.ammoRounds>RULES.maxReserveAmmo)return reject('Forty spare rounds do not fit; order not charged');
    hero.reserveAmmo+=p.ammoRounds;
  }else if(item==='SHIELD'){
    if(game.tick<e.shieldAt||hero.shield>0&&hero.shieldUntil>game.tick)return reject('Shield active or cooling down; order not charged');
    hero.shield=p.shieldHp;hero.shieldUntil=game.tick+p.shieldSeconds*rules.ticksPerSecond;e.shieldAt=game.tick+p.shieldCooldownSeconds*rules.ticksPerSecond;
  }else{
    if(hero.members>=3||game.tick-hero.lastHit<p.recruitSafeSeconds*rules.ticksPerSecond||game.tick<e.recruitAt)return reject('Replacement needs a casualty and five safe active seconds; order not charged');
    hero.members++;hero.hp=RULES.squadHp;e.recruitAt=game.tick+p.recruitCooldownSeconds*rules.ticksPerSecond;
  }
  e.spentWhole+=quotedWhole;return {ok:true,reason:item+' applied once for '+quotedWhole+' simulated run units',quotedWhole,chargedWhole:quotedWhole};
}

export function forfeitPracticeRewards(e:RunEconomy,stationWhole:number){if(e.depositWhole!==0)throw Error('Practice forfeiture cannot consume a wallet deposit');const amount=availableRunWhole(e,stationWhole);e.forfeitedWhole=(e.forfeitedWhole??0)+amount;return amount;}
