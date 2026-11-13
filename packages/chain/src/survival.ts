import { id } from 'ethers';
import { MAP, RULES } from '@last-signal/sim';
import { SURVIVAL_PROTOCOL, SURVIVAL_RULES, validateSurvivalRules, type SurvivalRules } from '../../sim/src/survival-rules.ts';

function canonical(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}
// Bind inherited combat and map data as well as the V2 economy. V1 hashes are untouched.
export function survivalRulesHash(rules: SurvivalRules = SURVIVAL_RULES): string {
  validateSurvivalRules(rules);
  return id(canonical({ mode: 'SURVIVAL_STATIONS_V2', protocol: SURVIVAL_PROTOCOL, rules, combat: RULES, map: MAP }));
}
