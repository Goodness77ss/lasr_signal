import {test,expect} from 'vitest';
import {PRACTICE_ROSTER,ownedRosterEntry,resolveRoster,pinRoster,verifyRosterSnapshot} from '../packages/sim/src/journey/roster.ts';
import {createJourney,validateJourneyResume} from '../packages/sim/src/journey/encounter.ts';
test('two owned instances of one class retain distinct identities and signature equipment',async()=>{
 const first=ownedRosterEntry('eip155:31337:0x'+'1'.repeat(40)+':1','mara',1),second=ownedRosterEntry('eip155:31337:0x'+'1'.repeat(40)+':2','mara',1);
 const selection=[{id:first.id,revision:1,loadout:'signature' as const},{id:second.id,revision:1,loadout:'signature' as const},null];
 const members=resolveRoster(selection,[first,second]);expect(members).toHaveLength(2);expect(members[0].classId).toBe('mara');expect(members[1].classId).toBe('mara');expect(members[0].weapon).toBe('service-rifle');
 await verifyRosterSnapshot(await pinRoster(members));
 expect(()=>resolveRoster([selection[0],selection[0],null],[first,second])).toThrow('more than once');
 await expect(createJourney({streamed:true,roster:selection,catalogue:[first,second]})).rejects.toThrow('Owned roster rules');
 const run=await createJourney({ownedOwner:'0x'+'2'.repeat(40),streamed:true,roster:selection,catalogue:[first,second]});
 expect(run.pin.rules.version).toBe('journey-practice-0.16.0');expect(run.equipment).toBeUndefined();
 expect(run.actors.filter(actor=>actor.side===0).every(actor=>actor.build?.entitlement==='owned-collectible')).toBe(true);
 expect(run.actors[0].build?.weapon).toBe('service-rifle');await validateJourneyResume(run);
 const changed=structuredClone(run);changed.actors[0].build!.entitlement='local-development';await expect(validateJourneyResume(changed)).rejects.toThrow();
 const mixed=await createJourney({ownedOwner:'0x'+'2'.repeat(40),streamed:true,roster:[{id:'starter:1',revision:1,loadout:'signature'},{id:first.id,revision:1,loadout:'signature'},null],catalogue:[...PRACTICE_ROSTER,first]});
 expect(mixed.actors[0].build?.entitlement).toBe('free-starter');expect(mixed.actors[1].build?.entitlement).toBe('owned-collectible');await validateJourneyResume(mixed);
 expect(()=>ownedRosterEntry('development:mara','mara',1)).toThrow('identity');
});


