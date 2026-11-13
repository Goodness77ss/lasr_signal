import {test,expect} from 'vitest';
import {parseJourneyClient,JOURNEY_OWNED_IDENTIFIERS,JOURNEY_CLIENT_BYTES} from '../packages/protocol/src/journey.ts';
test('owned start binds every selected token to a distinct actor lease and exact run identity',()=>{
 const collection='0x'+'1'.repeat(40),ownedSoldiers=[1,2,3].map(actorId=>({actorId,asset:{kind:'soldier',chainId:'31337',collection,tokenId:String(actorId)},leaseId:'0x'+String(actorId).repeat(64)}));
 const message={op:'start',...JOURNEY_OWNED_IDENTIFIERS,session:'a'.repeat(64),admission:{run:'b'.repeat(32),credential:'c'.repeat(64)},ownedSoldiers,roster:ownedSoldiers.map(choice=>({id:'eip155:31337:'+collection+':'+choice.asset.tokenId,revision:1,loadout:'signature'}))};
 expect(new TextEncoder().encode(JSON.stringify(message)).length).toBeLessThanOrEqual(JOURNEY_CLIENT_BYTES);
 expect(parseJourneyClient(JSON.stringify(message)).op).toBe('start');
 for(const change of [{...message,admission:undefined},{...message,session:undefined},{...message,ownedSoldiers:[]},{...message,ownedSoldiers:[ownedSoldiers[0],ownedSoldiers[0]]},{...message,ownedSoldiers:[...ownedSoldiers.slice(0,2),{...ownedSoldiers[2],leaseId:'0x'+'0'.repeat(64)}]}])expect(()=>parseJourneyClient(JSON.stringify(change))).toThrow();
 expect(parseJourneyClient(JSON.stringify({op:'resume',...JOURNEY_OWNED_IDENTIFIERS,session:message.session,run:message.admission.run,credential:message.admission.credential})).op).toBe('resume');
});
