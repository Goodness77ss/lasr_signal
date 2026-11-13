import { it,expect } from 'vitest';
import { createJourney,validateJourneyState } from '../packages/sim/src/journey/encounter.ts';
it('rejects impossible recovered actor, inventory, movement and terminal state',async()=>{
  const run=await createJourney({streamed:true});expect(()=>validateJourneyState(run)).not.toThrow();
  const badHealth=structuredClone(run);badHealth.actors[0].hp=999;
  const badAmmo=structuredClone(run);badAmmo.actors[0].ammo=-1;
  const badIdentity=structuredClone(run);badIdentity.actors[1].id=1;
  const badMovement=structuredClone(run);badMovement.drive.x=1e20;
  const badTerminal=structuredClone(run);badTerminal.state='DEAD';
  for(const candidate of [badHealth,badAmmo,badIdentity,badMovement,badTerminal])expect(()=>validateJourneyState(candidate)).toThrow();
});
