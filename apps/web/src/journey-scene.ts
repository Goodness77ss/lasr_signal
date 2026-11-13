import { grenadePreview,seesGrenade,GRENADE_RULES } from '../../../packages/sim/src/journey/grenades.ts';
import type { Vec3 } from '../../../packages/sim/src/journey/world.ts';
import { eyeHeight,bodyHeight } from '../../../packages/sim/src/journey/motion.ts';
import * as T from 'three';
import {createJourneyLandscape,battlefieldTexture} from './journey-landscape.ts';
import { createSoldier,animateSoldier,createViewWeapon } from './soldier.ts';
import { createJourneySoldier,createJourneyViewWeapon } from './journey-soldier.ts';
import {animateJourneyViewWeapon} from './journey-weapon-presentation.ts';
import {journeyWeapon} from '../../../packages/sim/src/journey/weapons.ts';
import {actorClass} from '../../../packages/sim/src/journey/encounter.ts';
import type { JourneyWeaponId } from '../../../packages/sim/src/journey/weapons.ts';
import { FieldCamera } from './field-camera.ts';
import { CombatFX } from './combat-fx.ts';
import {JourneyGunFX} from './journey-gun-fx.ts';
import { ROAD_SECTION,roadWorld } from '../../../packages/sim/src/journey/world.ts';
import type { Point } from '@last-signal/sim';
import { journeyLeader,journeyWorld,actorElevation,actorEye,type JourneyRun } from '../../../packages/sim/src/journey/encounter.ts';
import { JourneyWindow } from '../../../packages/sim/src/journey/streaming.ts';
import { regionZones,regionSolids } from '../../../packages/sim/src/journey/regions.ts';
import { encounterObjective } from '../../../packages/sim/src/journey/checkpoints.ts';
import type {JourneySceneFrame} from './journey-frame.ts';

export class JourneyScene {
  readonly renderer=new T.WebGLRenderer({antialias:true});
  readonly scene=new T.Scene();
  readonly camera=new T.PerspectiveCamera(65,1,.1,180);
  readonly world=roadWorld();
  readonly view=new FieldCamera(this.camera,this.world);
  grenadeAim:Vec3|null=null;
  sprinting=false;
  private sprintBlend=0;
  private aimFrame:JourneySceneFrame|null=null;
  private grenades=new Map<number,T.Group>();
  private drops=new Map<string,T.Group>();
  private arc=new T.Line(new T.BufferGeometry(),new T.LineBasicMaterial({color:0xe7b65d}));
  private units=new Map<number,T.Group>();
  private fx=new CombatFX(this.scene);
  private gunFX=new JourneyGunFX(this.scene);
  private lastEvent=0;
  private resizeObserver:ResizeObserver;
  private marker:T.Mesh;
  private objectiveMarker:T.Mesh;
  private weapon=createViewWeapon();
  private weaponId:JourneyWeaponId='service-rifle';
  private pointer=new T.Vector2();
  private ray=new T.Raycaster();
  private contextEvents=new AbortController();
  private sectionGeometry=new T.Group();
  private currentSection='';
  private masonry=battlefieldTexture('stone',1.5);
  private sectionWindow:JourneyWindow|null=null;
  contextLost=false;
  constructor(private container:HTMLElement){
    this.view.cameraRelativeMovement=true;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=T.PCFSoftShadowMap;
    this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
    this.renderer.domElement.setAttribute('aria-label','Journey road battlefield');container.append(this.renderer.domElement);
    this.scene.background=new T.Color(0xaab8ba);this.scene.fog=new T.FogExp2(0xaab8ba,.0055);
    this.scene.add(new T.HemisphereLight(0xc9deed,0x39372b,1.65));
    const sun=new T.DirectionalLight(0xffd8a0,3);sun.position.set(-8,30,20);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-75,right:75,top:55,bottom:-55,far:130});sun.shadow.bias=-.001;this.scene.add(sun);
    this.scene.add(createJourneyLandscape());
    this.scene.add(this.sectionGeometry);this.scene.add(this.arc);
    // Distant original geometry is outside playable bounds and cannot hide obstacles.
    const ring=new T.Mesh(new T.RingGeometry(2.7,2.95,48),new T.MeshBasicMaterial({color:0xc6dba7,side:T.DoubleSide,transparent:true,opacity:.85}));ring.rotation.x=-Math.PI/2;ring.position.set(66,.06,24);this.scene.add(ring);this.marker=ring;
    for(const z of [20.7,27.3])this.box(.15,4,.15,66,2,z,0x343e32);
    this.objectiveMarker=new T.Mesh(new T.RingGeometry(2.75,3,48),new T.MeshBasicMaterial({color:0xe7b65d,side:T.DoubleSide,transparent:true,opacity:.9}));this.objectiveMarker.rotation.x=-Math.PI/2;this.scene.add(this.objectiveMarker);
    this.box(.2,.6,6.6,66,3.6,24,0xa2b28a);
    this.scene.add(this.camera);this.camera.add(this.weapon);this.weapon.visible=false;
    this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();this.contextLost=true;container.dispatchEvent(new Event('journey-graphics-lost'));},{signal:this.contextEvents.signal});
    this.renderer.domElement.addEventListener('webglcontextrestored',()=>{this.contextLost=false;container.dispatchEvent(new Event('journey-graphics-restored'));},{signal:this.contextEvents.signal});
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();
    this.view.setMode('squad');this.view.zoom(.18);
  }
  private box(w:number,h:number,d:number,x:number,y:number,z:number,color:number,parent:T.Object3D=this.scene){const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color,roughness:.95,map:w>1&&h>.3?this.masonry:null}));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
  syncSection(run:JourneySceneFrame){
    if(this.currentSection===run.section)return;
    this.reset();this.disposeObject(this.sectionGeometry);this.sectionGeometry.clear();
    Object.assign(this.world,journeyWorld(run));
    this.sectionWindow=run.stream?new JourneyWindow({...run.stream}):null;
    this.world.solids.forEach((s,i)=>{
      const rocky=['journey-practice-0.4.0','journey-practice-0.5.0','journey-practice-0.6.0','journey-practice-0.7.0','journey-practice-0.8.0','journey-practice-0.9.0','journey-practice-0.10.0','journey-practice-0.11.0','journey-practice-0.12.0','journey-practice-0.13.0','journey-practice-0.14.0'].includes(run.pin.rules.version)&&run.sectionData?.region==='rocky-highlands',trunk=!!run.sectionData&&i>=run.sectionData.solids.length;
      this.box(s.w,s.h,s.d,s.x+s.w/2,(s.y??0)+s.h/2,s.z+s.d/2,trunk?0x514532:rocky?0x73766c:i<4?0x686556:0x5a5846,this.sectionGeometry);
      if(!trunk&&s.h>2){
        // Flush facade layers retain the exact authoritative cover silhouette.
        for(let y=.7;y<s.h-.2;y+=1.15)this.box(s.w,.035,.025,s.x+s.w/2,(s.y??0)+y,s.z+s.d+.014,0x3f433f,this.sectionGeometry);
        for(const x of [s.x+.13,s.x+s.w-.13])this.box(.17,s.h,.025,x,(s.y??0)+s.h/2,s.z+s.d+.025,0x888b7e,this.sectionGeometry);
      }
      if(i<4&&!rocky){this.box(s.w+.25,.17,s.d+.25,s.x+s.w/2,s.h+.085,s.z+s.d/2,0x403f37,this.sectionGeometry);for(let x=s.x+1;x<s.x+s.w-1;x+=2)this.box(.7,.85,.025,x,1.6,s.z+s.d+.015,0x282e29,this.sectionGeometry);}
    });
    if(run.sectionData&&['journey-practice-0.4.0','journey-practice-0.5.0','journey-practice-0.6.0','journey-practice-0.7.0','journey-practice-0.8.0','journey-practice-0.9.0','journey-practice-0.10.0','journey-practice-0.11.0','journey-practice-0.12.0','journey-practice-0.13.0','journey-practice-0.14.0'].includes(run.pin.rules.version)){
      for(const zone of regionZones(run.sectionData.region))this.box(zone.w,.018,zone.d,zone.x+zone.w/2,.035,zone.z+zone.d/2,zone.color,this.sectionGeometry);
      for(const trunk of regionSolids(run.sectionData.region)){
        const foliage=new T.Mesh(new T.ConeGeometry(1.5,3,7),new T.MeshStandardMaterial({color:0x304d32,roughness:1}));foliage.position.set(trunk.x+trunk.w/2,4,trunk.z+trunk.d/2);foliage.castShadow=true;this.sectionGeometry.add(foliage);
      }
    }
    this.currentSection=run.section;this.lastEvent=run.eventSeq??0;
  }
  private resize(){const {clientWidth:w,clientHeight:h}=this.container;this.renderer.setSize(w,h);this.camera.aspect=w/Math.max(1,h);this.camera.updateProjectionMatrix();}
  aim(){
    const direction=this.camera.getWorldDirection(new T.Vector3()),frame=this.aimFrame;
    if(!frame)return direction;
    const leader=journeyLeader(frame),origin=new T.Vector3(leader.x,actorEye(leader),leader.z);
    const ray=new T.Ray(this.camera.position.clone(),direction),hit=new T.Vector3();
    let distance=140,target=ray.at(distance,new T.Vector3()),enemy=false;
    const check=(box:T.Box3,isEnemy=false)=>{if(!ray.intersectBox(box,hit))return;const d=hit.distanceTo(ray.origin);if(d>=distance||hit.clone().sub(origin).dot(direction)<.1)return;distance=d;target=hit.clone();enemy=isEnemy;};
    for(const s of this.world.solids)check(new T.Box3(new T.Vector3(s.x,s.y??0,s.z),new T.Vector3(s.x+s.w,(s.y??0)+s.h,s.z+s.d)));
    for(const actor of frame.actors)if(actor.id!==leader.id&&actor.hp>0)check(new T.Box3(new T.Vector3(actor.x-.35,actorElevation(actor),actor.z-.35),new T.Vector3(actor.x+.35,actorElevation(actor)+bodyHeight(actor.motion?.pose??'standing'),actor.z+.35)),actor.side!==leader.side);
    const ground=ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),0),new T.Vector3());
    if(ground&&ground.distanceTo(ray.origin)<distance&&ground.clone().sub(origin).dot(direction)>.1){target=ground;enemy=false;}
    this.renderer.domElement.dataset.journeyAim=enemy?'enemy':'clear';
    return target.sub(origin).normalize();
  }
  pick(x:number,y:number):Point|null {
    const rect=this.renderer.domElement.getBoundingClientRect();this.pointer.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);this.ray.setFromCamera(this.pointer,this.camera);
    const hit=this.ray.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),0),new T.Vector3());return hit?{x:hit.x,z:hit.z}:null;
  }
  screen(point:Point,height=0){const p=new T.Vector3(point.x,height,point.z).project(this.camera);return {x:(p.x+1)/2*this.container.clientWidth,y:(1-p.y)/2*this.container.clientHeight,visible:p.z>-1&&p.z<1};}
  update(run:JourneySceneFrame,dt:number,time:number){
    this.aimFrame=run;
    this.syncSection(run);
    const leader=journeyLeader(run);
    const weaponId=leader.battlefieldWeapon?.buildId??leader.build?.weapon??'service-rifle';
    if(weaponId!==this.weaponId){this.weapon.removeFromParent();this.disposeObject(this.weapon);this.weapon=createJourneyViewWeapon(weaponId);this.camera.add(this.weapon);this.weaponId=weaponId;}
    this.view.update({...leader,y:actorElevation(leader),drive:run.drive??{x:0,z:0},driveUntil:run.driveUntil??0},dt,matchMedia('(prefers-reduced-motion: reduce)').matches,time,run.tick,leader.motion?actorEye(leader):undefined);
    this.sprintBlend+=(Number(this.sprinting&&leader.moving)-this.sprintBlend)*(1-Math.exp(-dt*7));
    if(this.view.mode!=='tactical'&&!matchMedia('(prefers-reduced-motion: reduce)').matches){this.camera.fov+=this.sprintBlend*7;this.camera.updateProjectionMatrix();}
    this.camera.updateMatrixWorld();this.weapon.visible=this.view.mode==='eyes';
    const handling=animateJourneyViewWeapon(this.weapon,weaponId,{tick:run.tick,shotAt:leader.fireAt,reloadAt:leader.reloadAt,reloadTicks:Math.ceil(journeyWeapon(weaponId).reloadTicks*(actorClass(run,leader)?.reloadPercent??100)/100),time,moving:leader.moving,aiming:this.view.aiming,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches});
    this.weapon.getObjectByName('flash')!.visible=false;
    this.renderer.domElement.dataset.journeyWeaponHandling=JSON.stringify(handling);
    for(const [id,mesh] of this.units)if(!run.actors.some(actor=>actor.id===id)){this.scene.remove(mesh);this.disposeObject(mesh);this.units.delete(id);}
    for(const actor of run.actors){
      let mesh=this.units.get(actor.id);
      const activeWeapon=actor.battlefieldWeapon?.buildId??actor.build?.weapon;if(mesh&&mesh.userData.activeWeapon!==activeWeapon){this.scene.remove(mesh);this.disposeObject(mesh);this.units.delete(actor.id);mesh=undefined;}
      if(!mesh){mesh=createJourneySoldier(actor.side,1,actor.classState?.id,activeWeapon);mesh.userData.activeWeapon=activeWeapon;mesh.position.set(actor.x,0,actor.z);this.units.set(actor.id,mesh);this.scene.add(mesh);}
      if(actor.rank==='veteran'&&!mesh.userData.veteran){const band=new T.Mesh(new T.BoxGeometry(.5,.12,.12),new T.MeshStandardMaterial({color:0xd8b258}));band.position.set(0,1.65,-.22);mesh.add(band);mesh.userData.veteran=true;}
      mesh.visible=actor.hp>0&&!(actor.id===leader.id&&(this.view.mode==='eyes'||this.view.mode==='squad'&&this.camera.position.distanceTo(new T.Vector3(actor.x,actorEye(actor),actor.z))<1.1));const smoothing=1-Math.exp(-dt*18);if(Math.hypot(mesh.position.x-actor.x,mesh.position.z-actor.z)>4)mesh.position.set(actor.x,actorElevation(actor),actor.z);else{mesh.position.x+=(actor.x-mesh.position.x)*smoothing;mesh.position.z+=(actor.z-mesh.position.z)*smoothing;}const facing=actor.id===leader.id&&this.view.mode!=='tactical'?Math.atan2(this.camera.getWorldDirection(new T.Vector3()).x,this.camera.getWorldDirection(new T.Vector3()).z):actor.facing;mesh.rotation.y+=Math.atan2(Math.sin(facing-mesh.rotation.y),Math.cos(facing-mesh.rotation.y))*smoothing;
      const baseScaleY=mesh.userData.journeyBaseScaleY??=mesh.scale.y;mesh.scale.y=baseScaleY*(actor.motion?bodyHeight(actor.motion.pose)/2:1);
      const carried=mesh.getObjectByName('weapon');if(carried&&actor.id===leader.id&&this.view.mode!=='tactical'){const direction=this.aim();carried.rotation.x=-Math.asin(T.MathUtils.clamp(direction.y,-1,1));}else if(carried)carried.rotation.x=mesh.userData.weaponPitch??0;
      mesh.userData.gaitTime=(mesh.userData.gaitTime??time)+dt*(actor.role==='leader'&&this.sprinting?1.55:1);
      const shotAge=time-(mesh.userData.lastVisualShot??-100),kick=shotAge>=0&&shotAge<.2?Math.exp(-shotAge*22):0;
      animateSoldier(mesh,mesh.userData.gaitTime,actor.moving,false,kick,matchMedia('(prefers-reduced-motion: reduce)').matches,actorElevation(actor));
      const muzzle=mesh.getObjectByName('flash');if(muzzle)muzzle.visible=false;
      if(carried&&!matchMedia('(prefers-reduced-motion: reduce)').matches)carried.rotation.x-=kick*.045;
    }
    for(const event of run.events??[]){if(event.seq<=this.lastEvent)continue;this.lastEvent=event.seq;if(event.kind==='shot'){
      const shooter=run.actors.filter(a=>a.side===event.side).sort((a,b)=>Math.hypot(a.x-event.from.x,a.z-event.from.z)-Math.hypot(b.x-event.from.x,b.z-event.from.z))[0];
      const origin=new T.Vector3(event.from.x,event.originHeight??1.6,event.from.z),end=new T.Vector3(event.to.x,event.height,event.to.z);
      if(shooter){const model=this.units.get(shooter.id);if(model){model.userData.lastVisualShot=time;model.userData.weaponPitch=-Math.atan2(end.y-origin.y,Math.hypot(end.x-origin.x,end.z-origin.z));model.rotation.y=Math.atan2(end.x-event.from.x,end.z-event.from.z);}}
      const barrel=shooter&&Math.hypot(shooter.x-event.from.x,shooter.z-event.from.z)<1?(shooter.id===leader.id&&this.view.mode==='eyes'?this.weapon:this.units.get(shooter.id))?.getObjectByName('flash'):undefined;
      if(barrel){barrel.updateWorldMatrix(true,false);barrel.getWorldPosition(origin);}
      const surface=event.height<.12||this.world.solids.some(s=>event.to.x>=s.x-.12&&event.to.x<=s.x+s.w+.12&&event.to.z>=s.z-.12&&event.to.z<=s.z+s.d+.12&&event.height>=(s.y??0)-.12&&event.height<=(s.y??0)+s.h+.12);
      this.gunFX.shot(origin,end,time,event.side,surface,matchMedia('(prefers-reduced-motion: reduce)').matches);
    }if(event.kind==='explosion')this.fx.burst(event.to,event.height,0xffbd67,time,28);if(event.kind==='hit')this.gunFX.impact(event.to,event.height,time,true);}
    this.marker.material instanceof T.MeshBasicMaterial&&(this.marker.material.color.setHex(run.checkpointComplete?0xb5e291:0xc6dba7));
    const objective=run.encounter?encounterObjective(run.encounter.template):null;
    this.objectiveMarker.visible=!!objective&&!run.encounter?.opened;
    if(objective)this.objectiveMarker.position.set(objective.x,.07,objective.z);
    const visibleGrenades=(run.projectiles??[]).filter(p=>run.actors.some(a=>a.side===0&&seesGrenade(a,actorEye(a),p,this.world)));
    const drops=(run.rewards?.drops??[]).filter(d=>d.state==='AVAILABLE');
    for(const [id,group] of this.drops)if(!drops.some(d=>d.id===id)){this.scene.remove(group);this.disposeObject(group);this.drops.delete(id);}
    for(const d of drops){let group=this.drops.get(d.id);if(!group){group=new T.Group();const bag=new T.Mesh(new T.BoxGeometry(.6,.35,.45),new T.MeshStandardMaterial({color:0xb7a366,roughness:.9}));bag.position.y=.22;group.add(bag);if(d.weapon){const barrel=new T.Mesh(new T.BoxGeometry(.85,.08,.09),new T.MeshStandardMaterial({color:0xadb4a2}));barrel.position.set(.1,.48,0);group.add(barrel);const stock=new T.Mesh(new T.BoxGeometry(.3,.14,.14),new T.MeshStandardMaterial({color:0x70593c}));stock.position.set(-.3,.44,0);group.add(stock);}const ring=new T.Mesh(new T.RingGeometry(.7,.85,32),new T.MeshBasicMaterial({color:0xe8c66e,side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.05;group.add(ring);this.scene.add(group);this.drops.set(d.id,group);}group.position.set(d.x,d.y,d.z);}
    for(const [id,group] of this.grenades)if(!visibleGrenades.some(p=>p.id===id)){this.scene.remove(group);this.disposeObject(group);this.grenades.delete(id);}
    for(const p of visibleGrenades){let group=this.grenades.get(p.id);if(!group){group=new T.Group();const ball=new T.Mesh(new T.SphereGeometry(.13,10,8),new T.MeshStandardMaterial({color:0xdab66c,emissive:0x604310}));group.add(ball);const warning=new T.Mesh(new T.RingGeometry(GRENADE_RULES.blastRadius-.12,GRENADE_RULES.blastRadius,48),new T.MeshBasicMaterial({color:0xff7656,transparent:true,opacity:.4,side:T.DoubleSide}));warning.rotation.x=-Math.PI/2;group.add(warning);this.scene.add(group);this.grenades.set(p.id,group);}group.position.set(p.position.x,p.position.y,p.position.z);group.children[1].position.y=.05-p.position.y;}
    this.arc.visible=!!this.grenadeAim&&!!leader.grenades?.quantity;
    if(this.arc.visible){const points=grenadePreview({x:leader.x,y:actorEye(leader),z:leader.z},this.grenadeAim!,this.world);if(points.length)this.arc.geometry.setFromPoints(Array.from({length:60},(_,i)=>{const p=points[Math.min(i,points.length-1)];return new T.Vector3(p.x,p.y,p.z);}));else this.arc.visible=false;}
    this.aim();this.fx.update(time,dt);this.gunFX.update(time,dt);this.renderer.render(this.scene,this.camera);
    // Read only development evidence, without exposing a writable game controller.
    const canvas=this.renderer.domElement;
    canvas.dataset.journeySection=run.section;
    canvas.dataset.journeyGrenades=String(leader.grenades?.quantity??0);canvas.dataset.journeyProjectiles=String(run.projectiles?.length??0);
    canvas.dataset.journeyGrenadePreview=String(this.arc.visible);
    canvas.dataset.journeyProjectileSequence=String(run.projectileSeq??0);
    canvas.dataset.journeyGrenadeEvents=JSON.stringify((run.events??[]).filter(e=>['throw','bounce','explosion'].includes(e.kind)).map(e=>({kind:e.kind,projectile:e.projectile})));
    canvas.dataset.journeyRules=run.pin.rules.version;
    canvas.dataset.journeyPose=leader.motion?.pose??'standing';
    canvas.dataset.journeyEyeHeight=String(this.camera.position.y);
    canvas.dataset.journeyLeaderPosition=JSON.stringify({x:leader.x,z:leader.z});
    canvas.dataset.journeyTraversal=JSON.stringify(leader.traversal??null);
    canvas.dataset.journeyClass=leader.classState?.id??'starter-rifle';canvas.dataset.journeyClassState=JSON.stringify(leader.classState??null);
    canvas.dataset.journeyRoster=JSON.stringify(run.roster??null);
    canvas.dataset.journeyRewards=JSON.stringify(run.rewards??null);canvas.dataset.journeyState=run.state;canvas.dataset.journeyCredits=String(run.practiceCredits);canvas.dataset.journeyBankedCredits=String(run.bankedPracticeCredits);
    canvas.dataset.journeyRenderedLeaderY=String(this.units.get(leader.id)?.position.y??0);canvas.dataset.journeyWeapon=weaponId;canvas.dataset.journeyLeaderHealth=String(leader.hp);
    canvas.dataset.journeyTick=String(run.tick);
    canvas.dataset.journeyDodgeReadyAt=String(leader.motion?.nextDodgeAt??0);
    canvas.dataset.journeyCachedSections=String(this.sectionWindow?.entries().length??1);
    canvas.dataset.journeyActors=String(this.units.size);
    canvas.dataset.journeyGeometries=String(this.renderer.info.memory.geometries);
    canvas.dataset.journeyTextures=String(this.renderer.info.memory.textures);
    canvas.dataset.journeyDrawCalls=String(this.renderer.info.render.calls);
  }
  reset(){for(const group of this.drops.values()){this.scene.remove(group);this.disposeObject(group);}this.drops.clear();for(const group of this.grenades.values()){this.scene.remove(group);this.disposeObject(group);}this.grenades.clear();this.arc.visible=false;for(const m of this.units.values()){this.scene.remove(m);this.disposeObject(m);}this.units.clear();this.fx.reset();this.gunFX.reset();this.lastEvent=0;this.view.reset();this.view.setMode('squad');this.view.zoom(.18);}
  private disposeObject(object:T.Object3D){object.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){o.geometry.dispose();for(const material of Array.isArray(o.material)?o.material:[o.material])material.dispose();}});}
  dispose(){this.contextEvents.abort();this.resizeObserver.disconnect();this.fx.reset();this.gunFX.dispose();const textures=new Set<T.Texture>();this.scene.traverse(o=>{if(o instanceof T.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof T.MeshStandardMaterial&&m.map)textures.add(m.map);});textures.add(this.masonry);textures.forEach(t=>t.dispose());this.disposeObject(this.scene);this.renderer.dispose();this.renderer.domElement.remove();}
}




