import { describe, expect, test } from 'vitest';
import { SURVIVAL_RULES as R, pinSurvivalRules, validateSurvivalRules, segmentAccounting, availableRunFunds, segmentCloseReason, missionFits, tokenUnits as t, type SegmentLedger } from '../packages/sim/src/survival-rules.ts';
import { survivalRulesHash } from '../packages/chain/src/survival.ts';
import { rulesHash, salvageRulesHash } from '@last-signal/chain';
import {FUNDED_SURVIVAL_RULES,LIFECYCLE_SURVIVAL_RULES} from '../packages/sim/src/survival-rules.ts';
import {DatabaseSync} from 'node:sqlite';
import {SurvivalPractice} from '../apps/server/src/survival.ts';

const ledger = (patch: Partial<SegmentLedger> = {}): SegmentLedger => ({ deposit:t(40), station:t(24), bonus:t(6), spent:t(15), failed:t(5), locked:0n, stationReserve:t(24), bonusReserve:t(6), ...patch });
type Mutable<T> = { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] };
const editable = () => structuredClone(R) as Mutable<typeof R>;
describe('versioned survival configuration', () => {
  test('funded rules have a distinct identity and cannot instantiate simulated practice',()=>{
    expect(FUNDED_SURVIVAL_RULES.flags.runVault).toBe(true);expect(LIFECYCLE_SURVIVAL_RULES.flags.runVault).toBe(false);expect(survivalRulesHash(FUNDED_SURVIVAL_RULES)).not.toBe(survivalRulesHash(LIFECYCLE_SURVIVAL_RULES));
    const db=new DatabaseSync(':memory:');try{expect(()=>new SurvivalPractice(db,true,Date.now,FUNDED_SURVIVAL_RULES)).toThrow('funded run service');expect(db.prepare("SELECT name FROM sqlite_schema WHERE name LIKE 'survival_%'").all()).toHaveLength(0);}finally{db.close();}
  });
  test('deep frozen and pinned independently with all new entry flags disabled', () => {
    expect(() => validateSurvivalRules(R)).not.toThrow();
    const source = editable(), pinned = pinSurvivalRules(source);
    source.mission.stake = 6;
    expect(pinned.mission.stake).toBe(5);
    expect(Object.isFrozen(pinned.station)).toBe(true);
    expect(Object.values(R.flags).every(flag => !flag)).toBe(true);
    expect(() => { (pinned.station as { radius:number }).radius = 10; }).toThrow();
  });
  test('rejects malformed fields, bad budgets, policies and clock envelopes', () => {
    for (const change of [
      (r:any) => { r.extra = true; }, (r:any) => { delete r.clock; },
      (r:any) => { r.flags.stations = 'true'; }, (r:any) => { r.station.radius = NaN; },
      (r:any) => { r.station.captureSeconds = .5; }, (r:any) => { r.station.cycles = -1; },
      (r:any) => { r.economy.segmentBonusReserve = 30; }, (r:any) => { r.economy.runRewardCap = 151; },
      (r:any) => { r.clock.wallCloseSeconds = 899; }, (r:any) => { r.clock.hardTimeoutSeconds = 600; },
      (r:any) => { r.mission.durationSeconds = 301; }, (r:any) => { r.flags.missions = true; },
      (r:any) => { r.allocation.automaticCarryForward = true; }, (r:any) => { r.settlement.recipient = 'sender'; },
      (r:any) => { r.settlement.gasPayer = 'player'; },
    ]) { const r = structuredClone(R); change(r); expect(() => validateSurvivalRules(r)).toThrow(); }
  });
  test('canonical hash binds V2 configuration while preserving deployed V1 identities', () => {
    const hash = survivalRulesHash(), r = editable();
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    const reordered = Object.fromEntries(Object.entries(r).reverse());
    expect(survivalRulesHash(reordered as typeof R)).toBe(hash);
    r.mission.stake = 6;
    expect(survivalRulesHash(r)).not.toBe(hash);
    expect(hash).not.toBe(rulesHash); expect(hash).not.toBe(salvageRulesHash);
    expect(salvageRulesHash).toBe('0xff1abc8952110b1479646ff55f123c4de8143a349e2448add4de8b157e189345');
  });
});
describe('V2 accounting specification', () => {
  test('worked example conserves custody, unlock is never additional income', () => {
    expect(availableRunFunds(ledger({ locked:t(5) }))).toBe(t(45));
    const result = segmentAccounting(ledger());
    expect(result.credit).toBe(t(50)); expect(result.burn).toBe(t(15) / 10n);
    expect(result.treasury).toBe(t(185) / 10n);
    expect(result.credit + result.burn + result.treasury).toBe(t(70));
  });
  test('zero deposit and split reserve bounds, no field credit conversion', () => {
    expect(segmentAccounting(ledger({ deposit:0n, spent:0n, failed:0n })).credit).toBe(t(30));
    expect(() => segmentAccounting(ledger({ bonus:t(7) }))).toThrow();
    expect(() => segmentAccounting(ledger({ locked:1n }))).toThrow();
    expect(() => segmentAccounting(ledger({ deposit:t(101) }))).toThrow();
    expect(() => availableRunFunds(ledger({ spent:t(100) }))).toThrow();
    expect(() => availableRunFunds(ledger({ failed:-1n }))).toThrow();
    expect(() => availableRunFunds({ ...ledger(), fieldCredits:20n } as SegmentLedger)).toThrow();
    expect(() => t(.5)).toThrow('Invalid whole token amount');
  });
  test('base unit rounding and varied valid settlements conserve every unit', () => {
    for (let i=0;i<500;i++) {
      const l=ledger({ deposit:BigInt(i), station:BigInt(i%25), bonus:BigInt(i%7), spent:BigInt(i%19), failed:0n });
      if (l.deposit+l.station+l.bonus<l.spent) continue;
      const a=segmentAccounting(l);
      expect(a.credit+a.burn+a.treasury).toBe(l.deposit+l.stationReserve+l.bonusReserve);
      expect(a.burn).toBe(l.spent/10n);
    }
  });
});
describe('independent gameplay and chain boundaries', () => {
  const clock = { activeTicks:5999, activatedAt:1000, chainNow:1599, terminal:null, disconnectedAt:null, wallNow:100 } as const;
  test('checkpoint, safety, terminal and exact hard timeout precedence', () => {
    expect(segmentCloseReason(clock)).toBe(null);
    expect(segmentCloseReason({...clock,activeTicks:6000})).toBe('checkpoint');
    expect(segmentCloseReason({...clock,chainNow:1600})).toBe('wall-safety');
    expect(segmentCloseReason({...clock,terminal:'death'})).toBe('death');
    expect(segmentCloseReason({...clock,chainNow:1899,terminal:'extraction'})).toBe('extraction');
    expect(segmentCloseReason({...clock,chainNow:1900,terminal:'death'})).toBe('timeout-recovery');
    expect(segmentCloseReason({...clock,activeTicks:0,chainNow:1901})).toBe('timeout-recovery');
  });
  test('disconnect grace and mission fit cannot extend chain deadline', () => {
    expect(segmentCloseReason({...clock,disconnectedAt:41})).toBe(null);
    expect(segmentCloseReason({...clock,disconnectedAt:40})).toBe('disconnect');
    expect(missionFits(4400,141)).toBe(true);
    expect(missionFits(4401,141)).toBe(false);
    expect(missionFits(0,140)).toBe(false);
    expect(missionFits(-1,200)).toBe(false);
    expect(() => segmentCloseReason({...clock,chainNow:999})).toThrow();
  });
});
