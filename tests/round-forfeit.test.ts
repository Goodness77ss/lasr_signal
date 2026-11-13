import {describe,it,expect} from 'vitest';
import {createRunEconomy,availableRunWhole,forfeitPracticeRewards} from '../packages/sim/src/run-economy.ts';
import {createGame,command} from '@last-signal/sim';

describe('quitting a practice round',()=>{
 it('forfeits unspent round earnings once without relabelling mission failures',()=>{
  const e=createRunEconomy();e.bonusWhole=3;e.failedWhole=5;e.spentWhole=2;
  expect(forfeitPracticeRewards(e,12)).toBe(8);expect(availableRunWhole(e,12)).toBe(0);expect(e.failedWhole).toBe(5);
  expect(forfeitPracticeRewards(e,12)).toBe(0);expect(e.forfeitedWhole).toBe(8);
  expect(availableRunWhole(JSON.parse(JSON.stringify(e)),12)).toBe(0);
 });
 it('cannot apply practice forfeiture to a wallet deposit',()=>{const e=createRunEconomy();e.depositWhole=40;expect(()=>forfeitPracticeRewards(e,8)).toThrow('wallet deposit');expect(e.depositWhole).toBe(40);expect(e.forfeitedWhole).toBeUndefined();});
 it('supports quitting during deployment while other commands stay blocked',()=>{const g=createGame();expect(g.countdown).toBeGreaterThan(0);expect(command(g,{id:'fire',side:0,kind:'fire',squadId:1,direction:{x:1,y:0,z:0}}).ok).toBe(false);expect(command(g,{id:'quit',side:0,kind:'surrender'}).ok).toBe(true);expect(g.result?.winner).toBe(1);});
});
