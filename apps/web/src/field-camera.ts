import * as T from 'three';
import { ACTOR, FIELD_SOLIDS, walkable, type Point, type Squad, type Solid } from '@last-signal/sim';
export type ViewMode = 'squad' | 'eyes' | 'tactical';
export class FieldCamera {
  mode: ViewMode = 'squad';
  private yaw = Math.PI / 2;
  private pitch = .035;
  private movementYaw:number|null=null;
  aiming = false;
  cameraRelativeMovement=false;
  private distance = 5.4;
  private focus = new T.Vector3(4,1,16);
  private initialized = false;
  constructor(readonly camera: T.PerspectiveCamera, private world: {width:number;depth:number;solids:readonly (Solid&{y?:number})[];walkable:(p:Point)=>boolean} = {width:48,depth:32,solids:FIELD_SOLIDS,walkable}) {}
  setMode(mode: ViewMode) { this.releaseMovement();this.mode=mode; this.initialized=false; this.camera.zoom=1; this.camera.updateProjectionMatrix(); }
  cycle() { this.setMode(this.mode==='squad'?'eyes':this.mode==='eyes'?'tactical':'squad'); }
  reset() { this.releaseMovement();this.yaw=Math.PI/2; this.pitch=.035; this.distance=5.4; this.initialized=false; this.aiming=false; }
  rotate(dx: number, dy: number) { const sensitivity=this.aiming?.0013:.0026; this.yaw-=dx*sensitivity; this.pitch=T.MathUtils.clamp(this.pitch+dy*sensitivity,-1.4,1.4); }
  zoom(delta: number) { this.distance=T.MathUtils.clamp(this.distance-delta*8,2.2,15); }
  releaseMovement(){this.movementYaw=null;}
  direction(forward: number, strafe: number): Point {
    if(!forward&&!strafe){this.releaseMovement();return {x:0,z:0};}
    // Movement keeps its starting heading; looking and aiming remain independent.
    const heading=this.cameraRelativeMovement?this.yaw:(this.movementYaw??=this.yaw);
    const x=Math.sin(heading)*forward-Math.cos(heading)*strafe;
    const z=Math.cos(heading)*forward+Math.sin(heading)*strafe;
    const d=Math.hypot(x,z)||1; return {x:x/d,z:z/d};
  }
  update(squad: (Pick<Squad,'x'|'z'|'route'|'drive'|'driveUntil'>&{y?:number}) | undefined, dt: number, reduced: boolean, time: number, tick=0, eyeOverride?:number) {
    const c=this.camera,fieldScale=c.parent?.scale.x??1;
    if (this.mode==='tactical') {
      const scale=this.world.width/48;c.zoom=T.MathUtils.clamp(5.4/this.distance,.7,2.1);c.fov=c.aspect<1.2?56:38; c.position.set(this.world.width/2,(c.aspect<1.2?59:43)*fieldScale*scale,(c.aspect<1.2?62:51)*scale); c.lookAt(this.world.width/2*fieldScale,0,this.world.depth/2*fieldScale); c.updateProjectionMatrix(); this.initialized=false; return;
    }
    if(this.cameraRelativeMovement&&this.mode==='squad'&&squad){
      // The center ray passes beside the soldier, rather than through their head.
      const anchor=new T.Vector3(squad.x,eyeOverride??((squad.y??0)+1.8),squad.z);
      const forward=new T.Vector3(Math.sin(this.yaw)*Math.cos(this.pitch),-Math.sin(this.pitch),Math.cos(this.yaw)*Math.cos(this.pitch));
      const right=new T.Vector3(-Math.cos(this.yaw),0,Math.sin(this.yaw));
      const desired=anchor.clone().addScaledVector(forward,-(this.aiming?2.3:this.distance)).addScaledVector(right,this.aiming?.62:.82);
      const displacement=desired.clone().sub(anchor),length=displacement.length(),ray=new T.Ray(anchor,displacement.normalize()),hit=new T.Vector3();let clear=length;
      for(const o of this.world.solids){const box=new T.Box3(new T.Vector3(o.x-.15,(o.y??0)-.15,o.z-.15),new T.Vector3(o.x+o.w+.15,(o.y??0)+o.h+.15,o.z+o.d+.15));if(ray.intersectBox(box,hit))clear=Math.min(clear,Math.max(.15,hit.distanceTo(anchor)-.15));}
      desired.copy(ray.at(clear,new T.Vector3()));desired.y=Math.max((squad.y??0)+.3,desired.y);
      c.position.lerp(desired,this.initialized&&!reduced?1-Math.exp(-dt*14):1);this.initialized=true;
      c.zoom=1;c.fov=this.aiming?48:65;c.lookAt(c.position.clone().addScaledVector(forward,30));c.updateProjectionMatrix();return;
    }
    if(squad) this.focus.set(squad.x,(squad.y??0)+1.25,squad.z);
    c.zoom=1;
    const forward=new T.Vector3(Math.sin(this.yaw),0,Math.cos(this.yaw));
    const eye=this.mode==='eyes';
    const desired=this.focus.clone().addScaledVector(forward,eye?0:-this.distance);
    desired.y=eye?(eyeOverride??ACTOR.eyeHeight):(squad?.y??0)+2.4+this.pitch*5;
    // Keep the camera out of the collision volumes without changing gameplay.
    if(!eye)for (const o of this.world.solids) if(desired.x>o.x-.4&&desired.x<o.x+o.w+.4&&desired.z>o.z-.4&&desired.z<o.z+o.d+.4) desired.y=Math.max(desired.y,(o.y??0)+o.h+.55);
    const moving=squad&&(squad.route.length>0||((squad.driveUntil??-1)>=tick&&Math.hypot(squad.drive?.x??0,squad.drive?.z??0)>0));
    const bob=moving&&!reduced?Math.sin(time*10)*.022:0; desired.y+=bob;
    c.position.lerp(desired,this.initialized&&!reduced?1-Math.exp(-dt*10):1); if(eye&&eyeOverride!==undefined)c.position.y=desired.y; if(eye&&!this.world.walkable({x:c.position.x,z:c.position.z}))c.position.copy(desired);this.initialized=true;
    const look=this.focus.clone().addScaledVector(forward,eye?15:2.5);
    look.y=(squad?.y??0)+1.15-this.pitch*2;
    if(eye) look.copy(c.position).add(new T.Vector3(forward.x*Math.cos(this.pitch),-Math.sin(this.pitch),forward.z*Math.cos(this.pitch)).multiplyScalar(15));
    c.fov=eye?(this.aiming?49:T.MathUtils.clamp(76-(5.4-this.distance)*6,48,94)):(this.aiming?48:65); c.lookAt(look.multiply(new T.Vector3(fieldScale,1,fieldScale))); c.updateProjectionMatrix();
  }
}
