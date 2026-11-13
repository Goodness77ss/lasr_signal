import { createGame, step, type Game, type Relay } from './index.ts';
import { distance, RULES } from './rules.ts';
import { SURVIVAL_RULES, type SurvivalRules } from './survival-rules.ts';

export function createStationPractice(seed = 1): Game {
  const game = createGame(seed, { untimed:true, hero:true });
  game.budgets = [0,0];
  game.squads[1].x = 26; game.squads[1].z = 25;
  game.relays[2].owner = 1;
  return game;
}

export function stationFeedback(game: Game, station: Relay, rules: SurvivalRules = SURVIVAL_RULES): string {
  const inside = game.squads.filter(s => s.hp > 0 && distance(s, station) <= rules.station.radius);
  if (game.result) return 'Run ended';
  if (station.contested) return 'Contested. Clear the hostile presence';
  if (inside.some(s => s.side === 0) && !inside.some(s => s.side === 0 && s.suppression < RULES.suppressionThreshold)) return 'Suppressed. Recover before capturing';
  if (station.owner === 0) return rules.flags.rewards?'Friendly station. See simulated eligibility ledger':'Friendly station. Token rewards disabled';
  if (station.attacker === 0 && station.progress > 0) return 'Capturing. Remain inside the ring';
  return station.progress > 0 ? 'Capture decaying without eligible presence' : 'Enter the ring to capture';
}

// Called after shared combat and removal of casualties, never from a client event.
export function stepStations(game: Game, rules: SurvivalRules = SURVIVAL_RULES) {
  if (game.result || !game.hero?.alive) return;
  for (const r of game.relays) {
    const inside = game.squads.filter(s => s.hp > 0 && distance(s, r) <= rules.station.radius);
    r.contested = new Set(inside.map(s => s.side)).size === 2;
    if (r.contested) continue;
    const side = inside.find(s => s.suppression < RULES.suppressionThreshold)?.side;
    if (side === undefined || side === r.owner) {
      r.progress = Math.max(0, r.progress - 1);
      if (r.progress === 0) r.attacker = null;
      continue;
    }
    if (side !== r.attacker) { r.progress = 0; r.attacker = side; }
    r.progress++;
    if (r.progress >= rules.station.captureSeconds * rules.ticksPerSecond) {
      r.owner = side; r.attacker = null; r.progress = 0;
      game.events.push({ seq:++game.eventSeq, tick:game.tick, kind:'StationCapturedV2', side, to:{x:r.x,z:r.z}, text:'Station '+r.id+' captured. Server practice only. No token rewards.' });
      if (game.events.length > 160) game.events.splice(0,game.events.length-160);
    }
  }
}

export function stepStationPractice(game: Game, rules: SurvivalRules = SURVIVAL_RULES) {
  const before = game.tick;
  step(game, { legacyObjectives:false });
  if (game.tick !== before) stepStations(game, rules);
  if (game.hero) game.hero.tokens = 0;
  for (const loot of game.loot) loot.tokens = 0;
}
