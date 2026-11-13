// Whole token quantities in configuration; financial ledgers use bigint base units.
export const SURVIVAL_PROTOCOL = 'survival-2';
const defaults = {
  version: 'survival-2.0.0',
  ticksPerSecond: 20,
  flags: { stations: false, rewards: false, missions: false, runVault: false, weaponCatalog: false },
  station: { count: 3, radius: 3, captureSeconds: 5, defenseSeconds: 20, captureReward: 5, defenseReward: 3, cycles: 5, cycleCap: 24, runCap: 120 },
  economy: { decimals: 18, suggestedDeposit: 40, maxDeposit: 100, fieldCredits: 20, segmentStationReserve: 24, segmentBonusReserve: 6, segmentReserve: 30, runBonusCap: 30, runRewardCap: 150, walletRewardCap: 200, walletWindowSeconds: 86400, supplyBurnBps: 1000, fundedRunsPerWallet: 1 },
  clock: { segmentSeconds: 300, wallCloseSeconds: 600, hardTimeoutSeconds: 900, settlementMarginSeconds: 60, disconnectGraceSeconds: 60 },
  mission: { firstOfferSeconds: 90, offerSeconds: 20, gapSeconds: 120, stake: 5, bonus: 3, durationSeconds: 60, holdSeconds: 30, preparationSeconds: 5, activeLimit: 1 },
  extractionSeconds: 8,
  allocation: { automaticCarryForward: false, sameRunOnly: true, sameCurrencyOnly: true },
  settlement: { submitter: 'worker-or-valid-result-holder', gasPayer: 'dedicated-test-gas-wallet', recipient: 'recorded-player', timeout: 'full-unsettled-deposit', abort: 'refund-deposit-cancel-provisional' },
};
type ReadonlyDeep<T> = { readonly [K in keyof T]: T[K] extends object ? ReadonlyDeep<T[K]> : T[K] };
const assaultDefaults = {
  maxEnemies:3, attackers:2, preparationSeconds:5, firstAssaultSeconds:25, intervalSeconds:35,
  retrySeconds:5, safeDistance:10, engagementRadius:10, tierSeconds:120, maxTier:6,
  stuckSeconds:10, abandonSeconds:30, historyLimit:32,
  spawnZones:[{x:40,z:5},{x:40,z:9},{x:40,z:23},{x:40,z:27}],
};
export type AssaultRules = ReadonlyDeep<typeof assaultDefaults>;
const fieldDefaults={ammoCost:5,ammoRounds:20,ammoCooldownSeconds:10,medicalCost:10,medicalHp:25,medicalUses:1,medicalSafeSeconds:5,medicalCooldownSeconds:30,dropRounds:12,dropLimit:20,dropRange:2};
export type FieldRules=ReadonlyDeep<typeof fieldDefaults>;
const supplyDefaults={ammoCost:5,ammoRounds:40,shieldCost:5,shieldHp:30,shieldSeconds:4,shieldCooldownSeconds:18,recruitCost:10,recruitSafeSeconds:5,recruitCooldownSeconds:30};
export type SupplyRules=ReadonlyDeep<typeof supplyDefaults>;
const lifecycleDefaults={bankX:8,bankZ:16,bankRadius:2,contestRadius:8,lootLimit:3};
export type LifecycleRules=ReadonlyDeep<typeof lifecycleDefaults>;
export type SurvivalRules = ReadonlyDeep<typeof defaults> & { readonly director?:AssaultRules;readonly field?:FieldRules;readonly supplies?:SupplyRules;readonly lifecycle?:LifecycleRules };

function freeze<T extends object>(value: T): ReadonlyDeep<T> {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value) as ReadonlyDeep<T>;
}

// Reject extra and missing keys before calculating a rules identity.
export function validateSurvivalRules(value: unknown): asserts value is SurvivalRules {
  function shape(candidate: unknown, template: unknown, path: string): void {
    if (template && typeof template === 'object') {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw Error('Invalid ' + path);
      const expected = Object.keys(template), actual = Object.keys(candidate);
      if (actual.length !== expected.length || actual.some(key => !expected.includes(key))) throw Error('Invalid fields at ' + path);
      for (const key of expected) shape((candidate as Record<string, unknown>)[key], (template as Record<string, unknown>)[key], path + '.' + key);
    } else if (typeof template === 'number') {
      if (typeof candidate !== 'number' || !Number.isSafeInteger(candidate) || candidate <= 0) throw Error('Invalid positive integer at ' + path);
    } else if (typeof template === 'boolean') {
      if (typeof candidate !== 'boolean') throw Error('Invalid flag at ' + path);
    } else if (path === 'rules.version') {
      if (typeof candidate !== 'string' || !/^survival-2\.\d+\.\d+$/.test(candidate)) throw Error('Invalid V2 version');
    } else if (candidate !== template) throw Error('Unsupported policy at ' + path);
  }
  const directed=!!value&&typeof value==='object'&&'director' in value;
  const template=directed?{...defaults,director:assaultDefaults}:defaults;
  // Zones are an authored fixed list, not client selected spawn coordinates.
  if(directed){
    const zones=(value as {director?:{spawnZones?:unknown}}).director?.spawnZones;
    if(JSON.stringify(zones)!==JSON.stringify(assaultDefaults.spawnZones))throw Error('Unsupported spawn zones');
    const candidate=structuredClone(value) as Record<string,unknown>;
    for(const [key,definition] of Object.entries({field:fieldDefaults,supplies:supplyDefaults,lifecycle:lifecycleDefaults})){
      if(key in candidate)shape(candidate[key],definition,'rules.'+key);delete candidate[key];
    }
    const director={...(candidate.director as Record<string,unknown>)};delete director.spawnZones;
    candidate.director=director;
    const {spawnZones:_,...numeric}=assaultDefaults;
    shape(candidate,{...defaults,director:numeric},'rules');
  }else shape(value, template, 'rules');
  const r = value as SurvivalRules, s = r.station, e = r.economy, c = r.clock, m = r.mission;
  const require = (condition: boolean, reason: string) => { if (!condition) throw Error(reason); };
  const revision=Number(r.version.split('.')[1]);
  require(Array.from({length:8},(_,n)=>'survival-2.'+n+'.0').includes(r.version)&&directed===(revision>=1),'Unsupported rules revision');
  require(revision<2||r.flags.rewards,'Reward revision requires ledger');
  require(!!r.field===(revision>=3),'Field rules revision mismatch');
  require(!!r.supplies===(revision>=4),'Supply rules revision mismatch');
  require(r.flags.missions===(revision>=5),'Mission rules revision mismatch');
  require(!!r.lifecycle===(revision>=6),'Lifecycle rules revision mismatch');
  require(r.flags.runVault===(revision>=7),'Vault rules revision mismatch');
  if(r.lifecycle){const l=r.lifecycle;require(l.bankX===8&&l.bankZ===16&&l.bankRadius===2&&l.contestRadius===8&&l.lootLimit===3&&r.extractionSeconds===8&&c.disconnectGraceSeconds===60,'Unsupported extraction envelope');}
  if(r.supplies){const p=r.supplies;require(p.ammoRounds<=40&&p.ammoCost<=10&&p.shieldCost<=10&&p.recruitCost<=20&&p.shieldHp<=30&&p.shieldSeconds<=4&&p.shieldCooldownSeconds>=18&&p.recruitSafeSeconds>=5&&p.recruitCooldownSeconds>=30,'Unsafe supply effects');}
  if(r.field){const f=r.field;require(f.ammoRounds<=40&&f.medicalHp<=25&&f.medicalUses<=1&&f.dropLimit<=20&&f.dropRounds<=12&&f.dropRange<=2&&f.ammoCooldownSeconds>=5&&f.medicalSafeSeconds>=5,'Unsafe field allowance');}
  if(r.director){const d=r.director;
    require(d.maxEnemies<=3&&d.attackers===2&&d.attackers<=d.maxEnemies,'Unmeasured population cap');
    require(d.preparationSeconds>=1&&d.preparationSeconds<=10&&d.firstAssaultSeconds>=15&&d.intervalSeconds>=20&&d.retrySeconds<=30,'Unsafe assault timing');
    require(d.safeDistance>=10&&d.safeDistance<=20&&d.engagementRadius===10&&d.tierSeconds>=120&&d.maxTier<=6,'Unsafe assault pressure');
    require(d.stuckSeconds>=5&&d.abandonSeconds>d.stuckSeconds&&d.abandonSeconds<=60&&d.historyLimit<=64,'Unbounded assault recovery');
  }
  require(r.ticksPerSecond === 20 && s.count === 3 && e.decimals === 18, 'Unsupported simulation or currency format');
  require(s.radius <= 10 && s.cycles <= 100 && s.captureSeconds <= 300 && s.defenseSeconds <= 300, 'Unsupported station bounds');
  require(e.walletWindowSeconds === 86400 && e.walletRewardCap <= 10000 && e.segmentReserve <= 1000, 'Unsupported reward envelope');
  require(c.hardTimeoutSeconds <= 900 && c.segmentSeconds <= 300 && m.durationSeconds <= 300, 'Unsupported deadline bounds');
  require(s.count * (s.captureReward + s.defenseReward) === s.cycleCap && s.cycleCap * s.cycles === s.runCap, 'Station cap mismatch');
  require(e.segmentStationReserve === s.cycleCap && e.segmentStationReserve + e.segmentBonusReserve === e.segmentReserve, 'Segment reservation mismatch');
  require(s.runCap + e.runBonusCap === e.runRewardCap && e.walletRewardCap >= e.runRewardCap, 'Run or wallet cap mismatch');
  require(e.suggestedDeposit <= e.maxDeposit && e.maxDeposit <= 100 && e.supplyBurnBps <= 10000 && e.fundedRunsPerWallet === 1, 'Unsafe deposit or burn bounds');
  require(m.bonus <= e.segmentBonusReserve && m.activeLimit === 1 && m.stake <= e.maxDeposit, 'Mission allocation mismatch');
  require(m.preparationSeconds + m.holdSeconds <= m.durationSeconds && m.firstOfferSeconds + m.offerSeconds + m.durationSeconds <= c.segmentSeconds, 'Mission cannot fit segment');
  require(c.segmentSeconds < c.wallCloseSeconds && c.wallCloseSeconds + c.settlementMarginSeconds < c.hardTimeoutSeconds && c.disconnectGraceSeconds <= c.wallCloseSeconds, 'Unsafe clock envelope');
  require(!r.allocation.automaticCarryForward && r.allocation.sameRunOnly && r.allocation.sameCurrencyOnly, 'Explicit bounded carry consent required');
  require(!r.flags.rewards || r.flags.stations, 'Rewards need stations');
  require(!r.flags.missions || r.flags.rewards, 'Missions need reward accounting');
  require(!r.flags.runVault || r.flags.rewards, 'Vault needs reward accounting');
}

validateSurvivalRules(defaults);
export const SURVIVAL_RULES: SurvivalRules = freeze(defaults);
export const DIRECTED_SURVIVAL_RULES: SurvivalRules = freeze({...defaults,version:'survival-2.1.0',director:assaultDefaults});
validateSurvivalRules(DIRECTED_SURVIVAL_RULES);
export const REWARD_SURVIVAL_RULES: SurvivalRules=freeze({...defaults,version:'survival-2.2.0',director:assaultDefaults,flags:{...defaults.flags,stations:true,rewards:true}});
validateSurvivalRules(REWARD_SURVIVAL_RULES);
export const STARTER_SURVIVAL_RULES:SurvivalRules=freeze({...REWARD_SURVIVAL_RULES,version:'survival-2.3.0',field:fieldDefaults});
validateSurvivalRules(STARTER_SURVIVAL_RULES);
export const SUPPLY_SURVIVAL_RULES:SurvivalRules=freeze({...STARTER_SURVIVAL_RULES,version:'survival-2.4.0',supplies:supplyDefaults});
validateSurvivalRules(SUPPLY_SURVIVAL_RULES);
export const MISSION_SURVIVAL_RULES:SurvivalRules=freeze({...SUPPLY_SURVIVAL_RULES,version:'survival-2.5.0',flags:{...SUPPLY_SURVIVAL_RULES.flags,missions:true}});
validateSurvivalRules(MISSION_SURVIVAL_RULES);
export const LIFECYCLE_SURVIVAL_RULES:SurvivalRules=freeze({...MISSION_SURVIVAL_RULES,version:'survival-2.6.0',lifecycle:lifecycleDefaults});
validateSurvivalRules(LIFECYCLE_SURVIVAL_RULES);
// Provisional local contract identity. Practice continues to pin 2.6.0 with custody disabled.
export const FUNDED_SURVIVAL_RULES:SurvivalRules=freeze({...LIFECYCLE_SURVIVAL_RULES,version:'survival-2.7.0',flags:{...LIFECYCLE_SURVIVAL_RULES.flags,runVault:true}});
validateSurvivalRules(FUNDED_SURVIVAL_RULES);

// Persist this immutable complete copy with each run, never consult new defaults on recovery.
export function pinSurvivalRules(value: unknown): SurvivalRules {
  validateSurvivalRules(value);
  return freeze(structuredClone(value));
}

export type SegmentLedger = { deposit: bigint; station: bigint; bonus: bigint; spent: bigint; failed: bigint; locked: bigint; stationReserve: bigint; bonusReserve: bigint };
export const tokenUnits = (whole: number): bigint => {
  if (!Number.isSafeInteger(whole) || whole < 0) throw Error('Invalid whole token amount');
  return BigInt(whole) * 10n ** 18n;
};
export function availableRunFunds(l: SegmentLedger): bigint {
  const keys = ['deposit','station','bonus','spent','failed','locked','stationReserve','bonusReserve'];
  if (Object.keys(l).length !== keys.length || Object.keys(l).some(key => !keys.includes(key))) throw Error('Unknown ledger asset or field');
  if (Object.values(l).some(v => typeof v !== 'bigint' || v < 0n)) throw Error('Invalid ledger amount');
  if (l.station > l.stationReserve || l.bonus > l.bonusReserve) throw Error('Unreserved reward');
  const balance = l.deposit + l.station + l.bonus - l.spent - l.failed - l.locked;
  if (balance < 0n) throw Error('Negative available funds');
  return balance;
}
export function segmentAccounting(l: SegmentLedger, rules: SurvivalRules = SURVIVAL_RULES) {
  validateSurvivalRules(rules);
  if (l.deposit > tokenUnits(rules.economy.maxDeposit) || l.stationReserve > tokenUnits(rules.economy.segmentStationReserve) || l.bonusReserve > tokenUnits(rules.economy.segmentBonusReserve)) throw Error('Segment bounds exceeded');
  const credit = availableRunFunds(l);
  if (l.locked !== 0n) throw Error('Resolve or abort active stake before closing');
  const burn = l.spent * BigInt(rules.economy.supplyBurnBps) / 10000n;
  const unusedReserve = l.stationReserve + l.bonusReserve - l.station - l.bonus;
  return { credit, burn, treasury: l.spent - burn + l.failed + unusedReserve, unusedReserve };
}

export type SegmentClock = { activeTicks: number; chainNow: number; activatedAt: number; terminal: 'death' | 'extraction' | 'surrender' | null; disconnectedAt: number | null; wallNow: number };
export function segmentCloseReason(c: SegmentClock, rules: SurvivalRules = SURVIVAL_RULES) {
  for (const v of [c.activeTicks, c.chainNow, c.activatedAt, c.wallNow, ...(c.disconnectedAt === null ? [] : [c.disconnectedAt])]) if (!Number.isSafeInteger(v) || v < 0) throw Error('Invalid clock');
  if (c.chainNow < c.activatedAt) throw Error('Chain clock predates activation');
  const age = c.chainNow - c.activatedAt;
  if (age >= rules.clock.hardTimeoutSeconds) return 'timeout-recovery';
  if (c.terminal) return c.terminal;
  if (c.disconnectedAt !== null && c.wallNow - c.disconnectedAt >= rules.clock.disconnectGraceSeconds) return 'disconnect';
  if (age >= rules.clock.wallCloseSeconds) return 'wall-safety';
  if (c.activeTicks >= rules.clock.segmentSeconds * rules.ticksPerSecond) return 'checkpoint';
  return null;
}
export function missionFits(activeTicks: number, chainSecondsRemaining: number, rules: SurvivalRules = SURVIVAL_RULES): boolean {
  if (!Number.isSafeInteger(activeTicks) || activeTicks < 0 || !Number.isSafeInteger(chainSecondsRemaining)) return false;
  // Full offer window plus preparation (included in duration) must fit before the close trigger.
  const needed = rules.mission.offerSeconds + rules.mission.durationSeconds;
  return activeTicks + needed * rules.ticksPerSecond <= rules.clock.segmentSeconds * rules.ticksPerSecond && chainSecondsRemaining > needed + rules.clock.settlementMarginSeconds;
}
