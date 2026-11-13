import {it,expect} from 'vitest';
import {id,ZeroAddress} from 'ethers';
import {JOURNEY_GUN_BUILD_IDS,JOURNEY_GUN_BUILDS,JOURNEY_GUN_RECOVERY_RULES,journeyGunBuild,journeyGunDomain,journeyGunClaimTypes} from '../packages/chain/src/journey-guns.ts';
import {journeyWeaponIdentity} from '../packages/chain/src/journey-assets.ts';
import {weaponBuildHash} from '../packages/chain/src/weapon-assets.ts';
it('keeps marksman and support collectibles bound to the implemented Journey builds without reusing old IDs',()=>{
 expect(JOURNEY_GUN_BUILD_IDS).toEqual(['marksman-rifle','support-gun']);
 for(let kind=0;kind<2;kind++){
  expect(journeyGunBuild(kind)).toEqual(journeyWeaponIdentity(JOURNEY_GUN_BUILD_IDS[kind]));expect(Object.isFrozen(journeyGunBuild(kind).build)).toBe(true);
  for(let old=0;old<3;old++)expect(journeyGunBuild(kind).hash).not.toBe(weaponBuildHash(old));
 }
 for(const kind of [-1,2,NaN,.5])expect(()=>journeyGunBuild(kind)).toThrow();
 expect(JOURNEY_GUN_RECOVERY_RULES).toBe(id('LAST SIGNAL Journey gun recovery 1; maxPerRun=3; builds='+JOURNEY_GUN_BUILDS.map(b=>b.hash).join(',')));
});
it('binds recovery to the exact chain, collection, source, recipient, build and expiry',()=>{
 const collection='0x1111111111111111111111111111111111111111';expect(journeyGunDomain(31337n,collection)).toEqual({name:'LAST SIGNAL Journey Guns',version:'1',chainId:31337n,verifyingContract:collection});
 expect(journeyGunDomain(46630n,collection)).not.toEqual(journeyGunDomain(31337n,collection));expect(()=>journeyGunDomain(31337n,ZeroAddress)).toThrow();expect(()=>journeyGunDomain(0n,collection)).toThrow();
 expect(journeyGunClaimTypes.Claim.map(field=>field.name)).toEqual(['dropId','runId','recipient','kind','rulesHash','buildHash','expiry']);
});
