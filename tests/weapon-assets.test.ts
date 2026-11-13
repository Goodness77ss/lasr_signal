import {test,expect} from 'vitest';
import {Wallet,ZeroAddress} from 'ethers';
import {weaponAsset,weaponAssetKey,registeredWeaponAsset,weaponClass} from '@last-signal/chain';

test('same token ID in two collections has distinct identity and resolves only its registered collection',()=>{
 const old=Wallet.createRandom().address,next=Wallet.createRandom().address,collections=[{collection:old,version:'LEGACY_V1' as const},{collection:next,version:'SURVIVAL_V2' as const}];
 const a={collection:old,tokenId:'1'},b={collection:next,tokenId:'1'};
 expect(weaponAssetKey(a)).not.toBe(weaponAssetKey(b));expect(weaponAssetKey({...a,collection:old.toLowerCase()})).toBe(weaponAssetKey(a));
 expect(registeredWeaponAsset(a,collections).version).toBe('LEGACY_V1');expect(registeredWeaponAsset(b,collections).version).toBe('SURVIVAL_V2');
 expect(()=>registeredWeaponAsset({collection:Wallet.createRandom().address,tokenId:'1'},collections)).toThrow('supported');
 expect(()=>registeredWeaponAsset(a,[...collections,collections[0]])).toThrow('Exactly one');
});
test('invalid and aliased identifiers cannot address a different asset',()=>{
 const collection=Wallet.createRandom().address;
 for(const tokenId of ['0','01','-1','1.0','1e2',' 1',String(2n**256n)])expect(()=>weaponAsset({collection,tokenId})).toThrow();
 expect(()=>weaponAsset({collection:ZeroAddress,tokenId:'1'})).toThrow();expect(()=>weaponAsset({collection:'bad',tokenId:'1'})).toThrow();
 expect(()=>weaponAsset({collection,tokenId:1} as unknown as Parameters<typeof weaponAsset>[0])).toThrow();
});
test('legacy classes keep their meanings and new classes cannot be smuggled through the old collection',()=>{
 expect(weaponClass('LEGACY_V1',0)).toBe('rifle');expect(weaponClass('LEGACY_V1',1)).toBe('carbine');expect(weaponClass('SURVIVAL_V2',2)).toBe('shotgun');
 expect(()=>weaponClass('LEGACY_V1',2)).toThrow();expect(weaponClass('SURVIVAL_V2',0)).toBe('rifle');expect(weaponClass('SURVIVAL_V2',1)).toBe('carbine');
});
