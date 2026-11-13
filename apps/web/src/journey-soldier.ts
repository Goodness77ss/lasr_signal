import * as T from 'three';
import { createSoldier,createViewWeapon,periodRifle } from './soldier.ts';
import { soldierClass,type SoldierClassId } from '../../../packages/sim/src/journey/classes.ts';
import { journeyWeapon,type JourneyWeaponId } from '../../../packages/sim/src/journey/weapons.ts';

function dispose(root:T.Object3D){root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});}
function part(parent:T.Object3D,geometry:T.BufferGeometry,color:number,x:number,y:number,z:number,view=false){
  const mesh=new T.Mesh(geometry,new T.MeshStandardMaterial({color,roughness:.8,depthTest:!view}));mesh.position.set(x,y,z);mesh.castShadow=!view;mesh.renderOrder=view?1000:0;parent.add(mesh);return mesh;
}
export function createJourneyWeapon(id:JourneyWeaponId,view=false):T.Group {
  journeyWeapon(id);const weapon=periodRifle(view);weapon.userData.journeyWeapon=id;
  if(id==='field-carbine')weapon.scale.z=.75;
  if(id==='support-gun'){
    part(weapon,new T.BoxGeometry(.16,.23,.19),0x343d38,0,-.17,-.1,view).name='journey-magazine';
    for(const x of [-.065,.065]){const leg=part(weapon,new T.CylinderGeometry(.012,.012,.28,6),0x42483e,x,-.09,.55,view);leg.rotation.z=x<0?-.35:.35;}
  }
  if(id==='marksman-rifle'){
    weapon.scale.z=1.15;
    const scope=part(weapon,new T.CylinderGeometry(.047,.047,.32,10),0x293b34,0,.17,.04,view);scope.rotation.x=Math.PI/2;
    for(const z of [-.04,.12])part(weapon,new T.BoxGeometry(.05,.09,.025),0x454c40,0,.12,z,view);
  }
  if(id==='trench-shotgun'){
    weapon.scale.z=.82;
    const tube=part(weapon,new T.CylinderGeometry(.028,.028,.68,10),0x323b34,0,-.015,.4,view);tube.rotation.x=Math.PI/2;
    part(weapon,new T.BoxGeometry(.13,.12,.24),0x825d36,0,-.04,.4,view);
  }
  return weapon;
}
export function createJourneySoldier(side:number,index:number,classId?:SoldierClassId,equippedWeapon?:JourneyWeaponId):T.Group {
  const root=createSoldier(side,index);root.userData.journeyClass=classId??'starter-rifle';
  const body=root.getObjectByName('rig')!;
  // Close camera detail: webbing, shoulder protection, knee pads and pack seams.
  for(const x of [-.145,.145]){
    part(body,new T.BoxGeometry(.045,.42,.035),0xaaa083,x,1.17,.151);
    part(body,new T.SphereGeometry(.092,10,6),0x515c50,x*1.65,1.32,.025).scale.set(1,.55,1.2);
    part(body,new T.BoxGeometry(.075,.11,.055),0x575b4c,x,.99,.205);
  }
  for(const name of ['legL','legR']){const leg=body.getObjectByName(name)!;part(leg,new T.BoxGeometry(.13,.12,.035),0x4b5148,0,-.34,.095);}
  part(body,new T.BoxGeometry(.26,.025,.025),0xb1a47c,0,1.23,-.305);
  if(!classId&&!equippedWeapon)return root;
  const p=classId?soldierClass(classId):null,rig=root.getObjectByName('rig')!;
  if(p)root.traverse(o=>{if(o instanceof T.Mesh){const materials=Array.isArray(o.material)?o.material:[o.material];for(const material of materials){if(material instanceof T.MeshStandardMaterial){const color=material.color.getHex();if(color===0x7b7850)material.color.setHex(p.cloth);if(color===0xb8c49e)material.color.setHex(p.trim);}}}});
  const old=rig.getObjectByName('weapon')!,weapon=createJourneyWeapon(equippedWeapon??p!.weapon);old.removeFromParent();dispose(old);weapon.position.set(.18,1.13,.38);rig.add(weapon);
  if(!p)return root;
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,color=p.trim)=>part(rig,new T.BoxGeometry(w,h,d),color,x,y,z);
  switch(p.silhouette){
    case 'radio':box(.24,.32,.15,0,1.2,-.32,0x394438);part(rig,new T.CylinderGeometry(.008,.008,.32,5),p.trim,.1,1.52,-.32);break;
    case 'scarf':{const scarf=part(rig,new T.TorusGeometry(.145,.035,6,14),p.trim,0,1.42,0);scarf.rotation.x=Math.PI/2;box(.2,.36,.025,0,1.2,-.2);break;}
    case 'plates':box(.44,.37,.12,0,1.14,.16,0x555e57);for(const x of [-.245,.245])box(.13,.1,.26,x,1.33,.015,0x6b7469);break;
    case 'medical':box(.18,.25,.1,-.2,1.05,.12,0xe1d8b8);for(const x of [-.23,-.17])part(rig,new T.SphereGeometry(.023,6,4),0xc49b55,x,1.1,.18);break;
    case 'grenades':for(const x of [-.12,0,.12])part(rig,new T.CylinderGeometry(.04,.04,.16,8),0x7f8b53,x,1.13,.21);break;
    case 'coat':box(.4,.44,.035,0,.86,-.17,p.cloth);box(.2,.35,.03,-.11,.85,.12,p.trim);break;
    case 'pouches':for(const x of [-.22,.22])box(.1,.22,.12,x,.93,.13);box(.28,.13,.12,0,1.34,-.3);break;
  }
  return root;
}
export function createJourneyViewWeapon(id:JourneyWeaponId):T.Group {
  const root=createViewWeapon(),old=root.getObjectByName('weapon')!,replacement=createJourneyWeapon(id,true);
  replacement.position.copy(old.position);replacement.rotation.copy(old.rotation);replacement.scale.multiply(old.scale);old.removeFromParent();dispose(old);root.add(replacement);return root;
}
