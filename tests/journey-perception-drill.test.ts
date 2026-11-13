import { it,expect } from 'vitest';
import { createRearAttackDrill,fireRearDrillShot } from '../packages/sim/src/journey/perception-drill.ts';
import { journeyStep,validateJourneyResume } from '../packages/sim/src/journey/encounter.ts';
it('responds to a real rear shot with delayed turning and valid recoverable memory',async()=>{
  const run=await createRearAttackDrill(),guard=run.actors[3],initial=guard.facing;
  expect(fireRearDrillShot(run)).toBe(true);expect(guard.hp).toBe(75);expect(run.actors[0].ammo).toBe(19);
  for(let i=0;i<7;i++)journeyStep(run);expect(guard.facing).toBe(initial);
  for(let i=0;i<17;i++)journeyStep(run);expect(Math.abs(guard.facing-initial)).toBeGreaterThan(.5);expect(guard.awareness?.lastKnown).not.toBeNull();
  await expect(validateJourneyResume(structuredClone(run))).resolves.toBeUndefined();expect(run.practiceCredits).toBe(0);
});
