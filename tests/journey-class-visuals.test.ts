import { expect,it } from 'vitest';
import { Box3,Vector3 } from 'three';
import { SOLDIER_CLASS_IDS,soldierClass } from '../packages/sim/src/journey/classes.ts';
import { createJourneySoldier,createJourneyViewWeapon } from '../apps/web/src/journey-soldier.ts';
import { animateSoldier } from '../apps/web/src/soldier.ts';
import { bodyHeight } from '../packages/sim/src/journey/motion.ts';

it('renders each local class with its weapon and keeps its figure at physical elevation',()=>{
  for(const id of SOLDIER_CLASS_IDS){
    const soldier=createJourneySoldier(0,1,id),p=soldierClass(id),baseScale=soldier.scale.y;
    expect(soldier.getObjectByName('weapon')!.userData.journeyWeapon).toBe(p.weapon);
    for(const pose of ['standing','crouched'] as const){
      soldier.scale.y=baseScale*bodyHeight(pose)/2;animateSoldier(soldier,0,false,false,0,true,1.18);soldier.updateMatrixWorld(true);
      const bounds=new Box3().setFromObject(soldier),height=bounds.getSize(new Vector3()).y;
      expect(height).toBeLessThanOrEqual(bodyHeight(pose)+.04);expect(bounds.min.y).toBeGreaterThanOrEqual(1.18);expect(soldier.position.y).toBe(1.18);
    }
    const view=createJourneyViewWeapon(p.weapon);expect(view.getObjectByName('weapon')!.userData.journeyWeapon).toBe(p.weapon);
  }
  const starter=createJourneySoldier(0,1);expect(starter.userData.journeyClass).toBe('starter-rifle');
});
it('uses admitted equipment in the world figure while preserving the soldier class silhouette',()=>{
  for(const weapon of ['marksman-rifle','support-gun'] as const){
    const starter=createJourneySoldier(0,1,undefined,weapon);expect(starter.userData.journeyClass).toBe('starter-rifle');expect(starter.getObjectByName('weapon')!.userData.journeyWeapon).toBe(weapon);
    const medic=createJourneySoldier(0,1,'imani',weapon);expect(medic.userData.journeyClass).toBe('imani');expect(medic.getObjectByName('weapon')!.userData.journeyWeapon).toBe(weapon);
    expect(medic.getObjectByName('rig')!.children.length).toBe(createJourneySoldier(0,1,'imani').getObjectByName('rig')!.children.length);
  }
});
