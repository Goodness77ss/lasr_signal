import { expect,it } from 'vitest';
import { PRACTICE_ROSTER,defaultRosterSelection,parseRosterSelection,resolveRoster,pinRoster,verifyRosterSnapshot } from '../packages/sim/src/journey/roster.ts';
const choice=(id:string)=>({id,revision:1,loadout:'signature' as const});

it('resolves starter only, a leader alone and a complete class team with unique entitlements',()=>{
  expect(resolveRoster(defaultRosterSelection()).map(m=>m.actorId)).toEqual([1,2,3]);
  expect(resolveRoster([choice('starter:1'),null,null])).toHaveLength(1);
  const team=resolveRoster([choice('development:mara'),choice('development:imani'),choice('development:rook')]);
  expect(team.map(m=>m.classId)).toEqual(['mara','imani','rook']);expect(team.map(m=>m.weapon)).toEqual(['service-rifle','field-carbine','support-gun']);
});
it('rejects an empty leader, excessive or duplicate membership and unsupported equipment',()=>{
  for(const selection of [[],[null,null,null],[choice('starter:1'),null,null,null],[choice('starter:1'),choice('starter:1'),null],[choice('unowned:1'),null,null],[{...choice('starter:1'),loadout:'owned'},null,null],[{...choice('starter:1'),health:999},null,null]])expect(()=>resolveRoster(selection)).toThrow();
  expect(()=>parseRosterSelection([choice('starter:1'),{...choice('starter:2'),revision:1.5},null])).toThrow();
});
it('revalidates availability and revisions at admission without inventing ownership',()=>{
  for(const availability of ['disabled','sold'] as const){const catalogue=PRACTICE_ROSTER.map(e=>e.id==='development:mara'?{...e,availability}:e);expect(()=>resolveRoster([choice('development:mara'),null,null],catalogue)).toThrow('unavailable');}
  const changed=PRACTICE_ROSTER.map(e=>e.id==='starter:1'?{...e,revision:2}:e);
  expect(()=>resolveRoster(defaultRosterSelection(),changed)).toThrow('changed');
});
it('pins an independent loadout and detects changed hash or class after catalogue edits',async()=>{
  const catalogue=PRACTICE_ROSTER.map(e=>({...e})),snapshot=await pinRoster(resolveRoster(defaultRosterSelection(),catalogue));
  catalogue[0].revision=2;catalogue[0].availability='disabled';await expect(verifyRosterSnapshot(snapshot)).resolves.toBeUndefined();
  expect(snapshot.members[0].revision).toBe(1);expect(Object.isFrozen(snapshot.members[0])).toBe(true);
  const edited=structuredClone(snapshot);edited.members=[{...edited.members[0],revision:2},...edited.members.slice(1)];await expect(verifyRosterSnapshot(edited)).rejects.toThrow('hash');
});
