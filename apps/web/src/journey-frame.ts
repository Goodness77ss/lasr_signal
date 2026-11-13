import type {JourneyRun,JourneyEvent} from '../../../packages/sim/src/journey/encounter.ts';
import type {JourneyPublicSnapshot} from './journey-connection.ts';
// Shared visible scene input. No hidden actor reconstruction or simulation step.
export type JourneySceneFrame=Pick<JourneyPublicSnapshot,'pin'|'section'|'sectionData'|'tick'|'state'|'checkpointComplete'|'practiceCredits'|'bankedPracticeCredits'|'roster'|'equipment'|'projectiles'|'encounter'|'rewards'>&Pick<JourneyRun,'actors'>&{
 stream?:JourneyRun['stream'];drive?:JourneyRun['drive'];driveUntil?:number;events?:JourneyEvent[];eventSeq?:number;projectileSeq?:number;
};
