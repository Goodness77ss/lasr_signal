import * as T from 'three';
import type {Point} from '@last-signal/sim';
type Particle={object:T.Object3D;born:number;life:number;velocity?:T.Vector3;gravity?:number;grow?:number;opacity:number;spin?:number};
/** Original, bounded presentation effects driven only by acknowledged shot events. */
export class JourneyGunFX{
 private particles:Particle[]=[];
 private smoke:T.CanvasTexture;
 constructor(private scene:T.Scene){const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d')!,g=ctx.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,.55)');g.addColorStop(.35,'rgba(230,230,230,.3)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);this.smoke=new T.CanvasTexture(c);}
 private add(object:T.Object3D,time:number,life:number,velocity?:T.Vector3,gravity=0,grow=0,opacity=1,spin=0){while(this.particles.length>=120)this.remove(this.particles.shift()!);this.scene.add(object);this.particles.push({object,born:time,life,velocity,gravity,grow,opacity,spin});}
 private remove(p:Particle){p.object.removeFromParent();p.object.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}else if(o instanceof T.Sprite)o.material.dispose();});}
 private puff(at:T.Vector3,time:number,size:number,life:number,color:number,velocity:T.Vector3,opacity=.28){const o=new T.Sprite(new T.SpriteMaterial({map:this.smoke,color,transparent:true,opacity,depthWrite:false,rotation:time*7}));o.position.copy(at);o.scale.setScalar(size);this.add(o,time,life,velocity,0,1.8,opacity);}
 shot(from:T.Vector3,to:T.Vector3,time:number,side:number,impact:boolean,reduced:boolean){
  const direction=to.clone().sub(from).normalize(),length=from.distanceTo(to);
  // A short moving streak rather than a continuous laser across the battlefield.
  if(length>.3){const streak=new T.Mesh(new T.CylinderGeometry(.009,.016,Math.min(1.5,length),5),new T.MeshBasicMaterial({color:side===0?0xffe1a2:0xffba77,transparent:true,opacity:.75,depthWrite:false,blending:T.AdditiveBlending}));streak.position.copy(from);streak.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction);this.add(streak,time,Math.min(.075,length/350),direction.clone().multiplyScalar(350),0,0,.75);}
  const flash=new T.Group();flash.position.copy(from);flash.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),direction);
  for(let i=0;i<3;i++){const flame=new T.Mesh(new T.ConeGeometry(i===0?.075:.035,i===0?.28:.17,5),new T.MeshBasicMaterial({color:i===0?0xfff6d6:0xffaa42,transparent:true,opacity:.85,depthWrite:false,blending:T.AdditiveBlending}));flame.rotation.x=Math.PI/2;flame.rotation.z=i*2.1;flame.position.set(i===0?0:Math.sin(i*2.1)*.035,i===0?0:Math.cos(i*2.1)*.035,.09);flash.add(flame);}this.add(flash,time,.045);
  if(!reduced){const light=new T.PointLight(0xffbd73,2.2,3);light.position.copy(from);this.add(light,time,.045);}
  this.puff(from,time,.13,.4,0xaaa99b,new T.Vector3(direction.x*.22,.3,direction.z*.22),.13);
  const right=new T.Vector3().crossVectors(direction,new T.Vector3(0,1,0)).normalize();
  const casing=new T.Mesh(new T.CylinderGeometry(.018,.018,.075,8),new T.MeshStandardMaterial({color:0xc4a05d,metalness:.8,roughness:.3}));casing.position.copy(from).addScaledVector(direction,-.65);casing.rotation.z=1.2;this.add(casing,time,.7,right.multiplyScalar(1.7).add(new T.Vector3(0,1.4,0)),8,0,1,13);
  if(impact)this.impact({x:to.x,z:to.z},to.y,time,false);
 }
 impact(at:Point,height:number,time:number,body=false){const p=new T.Vector3(at.x,height,at.z);this.puff(p,time,body?.18:.42,body?.32:.65,body?0x9d907b:0xb2a58b,new T.Vector3(0,.35,0),body?.22:.4);if(body)return;for(let i=0;i<5;i++){const chip=new T.Mesh(new T.BoxGeometry(.025,.025,.045),new T.MeshStandardMaterial({color:i%2?0x877c65:0xc1ac84,roughness:1,transparent:true}));chip.position.copy(p);this.add(chip,time,.22+i*.035,new T.Vector3(Math.sin(i*2.4)*1.2,.8+i*.15,Math.cos(i*2.4)*1.2),6,0,1,8);}}
 update(time:number,dt:number){for(const p of this.particles){const age=time-p.born;if(p.velocity){p.velocity.y-=(p.gravity??0)*dt;p.object.position.addScaledVector(p.velocity,dt);if(p.object.position.y<.035){p.object.position.y=.035;p.velocity.set(0,0,0);p.spin=0;}}if(p.spin){p.object.rotation.x+=dt*p.spin;p.object.rotation.z+=dt*p.spin*.7;}if(p.grow)p.object.scale.multiplyScalar(1+dt*p.grow);p.object.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Sprite)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.transparent)m.opacity=p.opacity*Math.max(0,1-age/p.life);});}this.particles=this.particles.filter(p=>{if(time-p.born>=p.life){this.remove(p);return false;}return true;});}
 reset(){this.particles.forEach(p=>this.remove(p));this.particles=[];}
 dispose(){this.reset();this.smoke.dispose();}
}

