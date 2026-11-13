import { createJourney, journeyWorld, journeyVault, type JourneyRun } from './encounter.ts';
import { emptyTraversal, planVault } from './traversal.ts';
import { MOTION_RULES } from './motion.ts';

// Original authored local setup on real generated geometry. This is not a
// naturally reached checkpoint, human playtest or reward demonstration.
export async function createVaultDrill(): Promise<JourneyRun> {
  const run = await createJourney({ streamed: true, seed: 1 }), world = journeyWorld(run), margin = MOTION_RULES.radius + .15;
  for (const solid of world.solids) {
    const approaches = [
      { at: { x: solid.x - margin, z: solid.z + solid.d / 2 }, direction: { x: 1, z: 0 } },
      { at: { x: solid.x + solid.w + margin, z: solid.z + solid.d / 2 }, direction: { x: -1, z: 0 } },
      { at: { x: solid.x + solid.w / 2, z: solid.z - margin }, direction: { x: 0, z: 1 } },
      { at: { x: solid.x + solid.w / 2, z: solid.z + solid.d + margin }, direction: { x: 0, z: -1 } },
    ];
    for (const approach of approaches) {
      if (!planVault(emptyTraversal(), approach.at, approach.direction, 'standing', world, 0)) continue;
      Object.assign(run.actors[0], approach.at, { facing: Math.atan2(approach.direction.x, approach.direction.z) });
      if (journeyVault(run, approach.direction)) return run;
    }
  }
  throw Error('The authored vault review has no valid approach');
}
