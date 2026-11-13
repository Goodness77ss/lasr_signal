import { JOURNEY_PROTOCOL,JOURNEY_STREAM_RULES,JOURNEY_ROSTER_STREAM_RULES,JOURNEY_REWARD_STREAM_RULES } from '../../../packages/sim/src/journey/rules.ts';

// Entry is independently gated. Authoritative Journey gameplay is introduced at Step 09.
export function journeyCapabilities(env:NodeJS.ProcessEnv=process.env,authoritativeGameplay=false){
  return {enabled:env.JOURNEY_ENABLED==='true',protocol:JOURNEY_PROTOCOL,rules:JOURNEY_STREAM_RULES.version,generator:JOURNEY_STREAM_RULES.generator,environment:authoritativeGameplay?'LOCAL_SERVER_PRACTICE':'LOCAL_PRACTICE',authoritativeGameplay,walletRewards:false,roster:{enabled:authoritativeGameplay,rules:JOURNEY_ROSTER_STREAM_RULES.version,maxActive:3,ownedAssets:false},practiceRewards:{enabled:authoritativeGameplay,rules:JOURNEY_REWARD_STREAM_RULES.version,policy:JOURNEY_REWARD_STREAM_RULES.rewards}};
}
