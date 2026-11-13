import {it,expect} from 'vitest';
import {id} from 'ethers';
import {journeyAsset,journeyAssetKey,journeySoldierIdentity,journeyWeaponIdentity,developmentSoldier,parseProgressRecord} from '../packages/chain/src/journey-assets.ts';
import {SOLDIER_CLASS_IDS} from '../packages/sim/src/journey/classes.ts';
import {weaponBuildHash} from '../packages/chain/src/weapon-assets.ts';
const collection='0x1111111111111111111111111111111111111111',base={kind:'gun',chainId:'31337',collection,tokenId:'1'};
it('binds the chain and collection in a canonical exact identity and separates quantities from identity',()=>{
 const asset=journeyAsset(base);expect(journeyAssetKey(asset)).toBe('eip155:31337:'+collection+':1');
 expect(journeyAssetKey(journeyAsset({...base,collection:'0x2222222222222222222222222222222222222222'}))).not.toBe(journeyAssetKey(asset));
 expect(journeyAssetKey(journeyAsset({...base,chainId:'46630'}))).not.toBe(journeyAssetKey(asset));
 const supply=journeyAsset({...base,kind:'consumable',amount:'2'});expect(journeyAssetKey(supply)).toBe(journeyAssetKey(journeyAsset({...supply,amount:'10'})));
 for(const patch of [{tokenId:1},{chainId:31337},{chainId:'031337'},{tokenId:'01'},{tokenId:'-1'},{tokenId:(2n**256n).toString()},{collection:'0x0000000000000000000000000000000000000000'},{kind:'development-soldier'},{rank:99}])expect(()=>journeyAsset({...base,...patch})).toThrow();
 for(const amount of ['0','-1','01',1])expect(()=>journeyAsset({...base,kind:'consumable',amount})).toThrow();
 expect(()=>journeyAsset({...base,amount:'1'})).toThrow();
});
it('pins all approved class and signature build identities without equating original gun statistics',()=>{
 const builds=SOLDIER_CLASS_IDS.map(journeySoldierIdentity);expect(new Set(builds.map(b=>b.hash)).size).toBe(7);
 for(const classId of SOLDIER_CLASS_IDS){const local=developmentSoldier(classId);expect(local.ownedCollectible).toBe(false);expect(local.build).toEqual(journeySoldierIdentity(classId));expect(()=>journeyAsset(local)).toThrow();}
 expect(journeyWeaponIdentity('service-rifle').hash).not.toBe(weaponBuildHash(0));
 expect(()=>journeyWeaponIdentity('unsupported' as never)).toThrow();expect(()=>journeySoldierIdentity('unapproved' as never)).toThrow();
});
it('keeps revisioned progress separate from immutable builds and rejects injected build fields',()=>{
 const soldier=journeyAsset({...base,kind:'soldier'}),record={asset:soldier,revision:'2',cumulativeXp:'100',furthestCompleted:'9007199254740993',policy:'journey-progress-1',rulesHash:id('rules'),source:'bank:1'};
 const build=journeySoldierIdentity('mara');expect(parseProgressRecord(record)).toEqual(record);expect(journeySoldierIdentity('mara')).toEqual(build);
 for(const altered of [{...record,buildHash:id('overridden')},{...record,revision:'-1'},{...record,cumulativeXp:100},{...record,asset:base}])expect(()=>parseProgressRecord(altered)).toThrow();
});
