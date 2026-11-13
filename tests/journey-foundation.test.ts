import { describe,it,expect } from 'vitest';
import { JOURNEY_RULES,hashJourneyRules,pinJourneyRules,verifyJourneyPin,validateJourneyRules } from '../packages/sim/src/journey/rules.ts';
import { legacyWorld,roadWorld,ROAD_SECTION } from '../packages/sim/src/journey/world.ts';
import { walkable,bodyStep,lineOfSight,MAP } from '@last-signal/sim';
import { journeyCapabilities } from '../apps/server/src/journey-config.ts';

describe('Journey version and eligibility boundary',()=>{
  it('gates development entry independently and never advertises chain or server gameplay',()=>{
    expect(journeyCapabilities({}).enabled).toBe(false);expect(journeyCapabilities({JOURNEY_ENABLED:'true'}).enabled).toBe(true);
    expect(journeyCapabilities({JOURNEY_ENABLED:'true'})).toMatchObject({authoritativeGameplay:false,walletRewards:false,environment:'LOCAL_PRACTICE'});
  });
  it('pins a complete copy and rejects altered hash, unsupported protocol and version',async()=>{
    const pin=await pinJourneyRules();await expect(verifyJourneyPin(pin)).resolves.toBeUndefined();
    expect(pin.rules).not.toBe(JOURNEY_RULES);
    for(const changed of [{...pin,hash:'0'.repeat(64)},{...pin,protocol:'private-1'},{...pin,rules:{...pin.rules,version:'unknown'}}])await expect(verifyJourneyPin(changed as typeof pin)).rejects.toThrow();
  });
  it('hashes eligibility values and excludes unsafe costs, timing and capacity',async()=>{
    expect(await hashJourneyRules({...JOURNEY_RULES,checkpointCredits:11})).not.toBe(await hashJourneyRules(JOURNEY_RULES));
    for(const patch of [{checkpointCredits:-1},{rifleTicks:0},{maxActors:1000},{maxSections:3},{ticks:NaN},{maxExperience:1},{radius:Infinity}])expect(()=>validateJourneyRules({...JOURNEY_RULES,...patch})).toThrow();
  });
});
describe('Journey world coordinates and legacy adapter',()=>{
  it('retains the existing fixed map navigation without widening its bounds',()=>{
    const w=legacyWorld();
    for(const p of [{x:4,z:16},{x:14,z:9},{x:18.7,z:6},{x:60,z:24}])expect(w.walkable(p)).toBe(walkable(p,0));
    const a={x:9,z:9},b={x:19,z:9};expect(w.move(a,b)).toEqual(bodyStep(a,b,0));expect(w.segmentClear(a,b)).toBe(lineOfSight(a,b));expect(MAP.width).toBe(48);
  });
  it('offers two real approaches and an accessible exit in metre coordinates',()=>{
    const w=roadWorld();expect(w.walkable(ROAD_SECTION.spawn)).toBe(true);expect(w.walkable(ROAD_SECTION.checkpoint)).toBe(true);
    for(const z of [9,41]){
      const route=[ROAD_SECTION.spawn,{x:10,z},{x:63,z},ROAD_SECTION.checkpoint];
      for(let i=1;i<route.length;i++)expect(w.segmentClear(route[i-1],route[i])).toBe(true);
    }
  });
  it('uses the same solid for bodies, camera clearance and height aware shots',()=>{
    const w=roadWorld(),a={x:12,z:15},b={x:30,z:15};expect(w.segmentClear(a,b)).toBe(false);
    expect(w.move(a,b).x).toBeLessThan(17);expect(w.walkable({x:20,z:15})).toBe(false);
    expect(w.shotDistance({...a,y:1.8},{x:1,y:0,z:0},28)).toBe(5);
    expect(w.shotDistance({...a,y:6},{x:1,y:0,z:0},28)).toBe(28);
    expect(w.walkable({x:NaN,z:2})).toBe(false);expect(w.move(a,{x:1e20,z:1})).toEqual(a);
  });
});
