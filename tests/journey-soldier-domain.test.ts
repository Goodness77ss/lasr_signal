import {it,expect} from 'vitest';
import {id,ZeroAddress} from 'ethers';
import {soldierProgressDomain,SOLDIER_PROGRESS_POLICY,soldierProgressTypes} from '../packages/chain/src/journey-soldiers.ts';
it('binds soldier progress to the explicit chain and collection with the complete bank and rules fields',()=>{
 const collection='0x1111111111111111111111111111111111111111',other='0x2222222222222222222222222222222222222222';
 expect(soldierProgressDomain(31337n,collection)).toEqual({name:'LAST SIGNAL Journey Soldiers',version:'1',chainId:31337n,verifyingContract:collection});
 expect(soldierProgressDomain(46630n,collection)).not.toEqual(soldierProgressDomain(31337n,collection));expect(soldierProgressDomain(31337n,other)).not.toEqual(soldierProgressDomain(31337n,collection));
 expect(()=>soldierProgressDomain(0n,collection)).toThrow();expect(()=>soldierProgressDomain(31337n,ZeroAddress)).toThrow();
 expect(SOLDIER_PROGRESS_POLICY).toBe(id('journey-progress-1'));expect(soldierProgressTypes.Progress.map(f=>f.name)).toEqual(['tokenId','owner','bankSource','rulesHash','policy','nonce','cumulativeXp','furthestCheckpoint','hasCheckpoint','expiry']);
});
