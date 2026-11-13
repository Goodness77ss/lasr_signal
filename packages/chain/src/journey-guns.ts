import {getAddress,id,ZeroAddress} from 'ethers';
import {journeyWeaponIdentity} from './journey-assets.ts';
export const JOURNEY_GUN_BUILD_IDS=Object.freeze(['marksman-rifle','support-gun'] as const);
export const JOURNEY_GUN_BUILDS=Object.freeze(JOURNEY_GUN_BUILD_IDS.map(journeyWeaponIdentity));
export const JOURNEY_GUN_RECOVERY_RULES=id('LAST SIGNAL Journey gun recovery 1; maxPerRun=3; builds='+JOURNEY_GUN_BUILDS.map(build=>build.hash).join(','));
export function journeyGunBuild(kind:number){if(!Number.isSafeInteger(kind)||kind<0||kind>=JOURNEY_GUN_BUILDS.length)throw Error('Unsupported Journey collectible gun');return JOURNEY_GUN_BUILDS[kind];}
export const journeyGunClaimTypes={Claim:[{name:'dropId',type:'bytes32'},{name:'runId',type:'bytes32'},{name:'recipient',type:'address'},{name:'kind',type:'uint8'},{name:'rulesHash',type:'bytes32'},{name:'buildHash',type:'bytes32'},{name:'expiry',type:'uint256'}]};
export type JourneyGunClaim={dropId:string;runId:string;recipient:string;kind:number;rulesHash:string;buildHash:string;expiry:string};
export function journeyGunDomain(chainId:bigint,collection:string){const address=getAddress(collection);if(chainId<=0n||address===ZeroAddress)throw Error('Explicit Journey gun domain required');return {name:'LAST SIGNAL Journey Guns',version:'1',chainId,verifyingContract:address};}
