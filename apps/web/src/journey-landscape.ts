import * as T from 'three';

// Original procedural surfaces. No downloaded art or external texture requests.
export function battlefieldTexture(kind:'earth'|'stone'|'road',repeat=12){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const ctx=canvas.getContext('2d')!;let seed=kind==='earth'?731:kind==='stone'?941:233;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  ctx.fillStyle=kind==='earth'?'#555342':kind==='stone'?'#77766d':'#686457';ctx.fillRect(0,0,512,512);
  for(let i=0;i<24000;i++){const v=Math.floor(random()*75+45);ctx.fillStyle=`rgba(${v+15},${v+12},${v},${random()*.35})`;const s=random()*4+.5;ctx.fillRect(random()*512,random()*512,s,s);}
  for(let i=0;i<110;i++){ctx.strokeStyle=kind==='stone'?'rgba(32,33,30,.28)':'rgba(32,29,22,.16)';ctx.lineWidth=random()*2+.5;ctx.beginPath();let x=random()*512,y=random()*512;ctx.moveTo(x,y);for(let j=0;j<5;j++){x+=random()*45-22;y+=random()*35;ctx.lineTo(x,y);}ctx.stroke();}
  if(kind==='road')for(const x of [150,355]){ctx.fillStyle='rgba(33,31,26,.17)';ctx.fillRect(x,0,24,512);}
  const texture=new T.CanvasTexture(canvas);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(repeat,repeat);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;return texture;
}
export function createJourneyLandscape(){
  const root=new T.Group();root.name='original-mountain-pass';
  const earth=battlefieldTexture('earth',22),stone=battlefieldTexture('stone',3),road=battlefieldTexture('road',9);
  const ground=new T.MeshStandardMaterial({map:earth,roughness:1,color:0xbbb49a});
  const rock=new T.MeshStandardMaterial({map:stone,roughness:.96,color:0xaca89a});
  const dark=new T.MeshStandardMaterial({color:0x333c3b,roughness:.88,metalness:.18});
  const concrete=new T.MeshStandardMaterial({map:stone,color:0xa6a796,roughness:.94});
  const mesh=(g:T.BufferGeometry,m:T.Material,x:number,y:number,z:number)=>{const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;root.add(o);return o;};
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,m:T.Material=concrete)=>mesh(new T.BoxGeometry(w,h,d),m,x,y,z);
  // The authoritative 72 by 48 arena remains level. Relief begins outside its boundary.
  const terrain=new T.PlaneGeometry(280,240,140,120);terrain.rotateX(-Math.PI/2);
  const p=terrain.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i)+36,z=p.getZ(i)+24;const edge=Math.max(0,-x,x-72,-z,z-48);const ridge=Math.sin(x*.065+z*.023)*Math.cos(z*.075)+Math.sin(x*.18-z*.1)*.24;const rise=Math.min(1,edge/20);let y=-.075+rise*(7+ridge*11+Math.max(0,edge-24)*.24);if(z>53&&z<75)y-=rise*8*Math.exp(-Math.pow((z-64)/8,2));p.setY(i,y);}
  terrain.computeVertexNormals();mesh(terrain,ground,36,0,24);
  const lane=mesh(new T.PlaneGeometry(72,10),new T.MeshStandardMaterial({map:road,color:0xb2aa91,roughness:.97}),36,.012,24);lane.rotation.x=-Math.PI/2;
  // Layered peaks and scree form a deep silhouette rather than a wall of cubes.
  for(let i=0;i<34;i++){const x=-55+(i%17)*11,z=i<17?-35:91,h=18+(Math.sin(i*7.23)+1)*17;const peak=mesh(new T.ConeGeometry(10+i%5,h,5,4),rock,x,h/2-2,z);peak.rotation.y=i*1.31;peak.scale.z=1.35;}
  for(let i=0;i<50;i++){const x=-12+(i%25)*4,z=i<25?-8:57;const b=mesh(new T.DodecahedronGeometry(2+(i%4)*.65,0),rock,x,1.4,z);b.scale.set(1.3,1+(i%3)*.6,.8);b.rotation.set(i*.31,i*.72,i*.14);}
  // Bomb craters, sunken pools and broken lips remain outside the playable route.
  const water=new T.MeshStandardMaterial({color:0x354c49,metalness:.45,roughness:.2,transparent:true,opacity:.85});
  for(let i=0;i<9;i++){const x=2+i*8,z=i%2?-5:53;const lip=mesh(new T.TorusGeometry(2.1,.38,8,32),ground,x,.05,z);lip.rotation.x=-Math.PI/2;lip.scale.z=.5;const hole=mesh(new T.CircleGeometry(1.9,32),water,x,.025,z);hole.rotation.x=-Math.PI/2;}
  // Ruined elevated aqueduct frames the road without introducing invisible cover.
  for(const z of [-13,65]){
    for(let x=-8;x<89;x+=16){box(3,17,4,x,8.5,z);box(5,1.2,5,x,17,z);box(15.5,2,3.5,x+8,18.5,z);for(const dx of [-1,1]){const brace=box(1,8,2,x+dx*3.1,13,z);brace.rotation.z=dx*.48;}box(.22,12,4.1,x-1.1,8,z,dark);}
    box(103,.8,5,36,20,z,dark);
  }
  // Giant signal structures at the exit create an unmistakable destination.
  for(const z of [13,35]){box(3,15,4,78,7.5,z);box(4,.6,5,78,15,z,dark);const fin=box(.6,10,5,79.6,10,z,dark);fin.rotation.z=-.2;}
  box(3,2,26,78,15,24,dark);
  const amber=new T.MeshStandardMaterial({color:0xf9ca79,emissive:0xf2a645,emissiveIntensity:2,roughness:.4});
  for(const z of [13,35])box(.15,8,.3,76.45,9,z,amber);
  const teal=new T.MeshStandardMaterial({color:0x35999a,roughness:.72,side:T.DoubleSide});
  const ochre=new T.MeshStandardMaterial({color:0xc1743f,roughness:.85,side:T.DoubleSide});
  // Faded district colors and curved fabric break up the stone palette.
  for(let i=0;i<10;i++){
    const x=2+i*8,z=i%2?-10:61;
    const fabric=new T.PlaneGeometry(2.2,5,6,10),points=fabric.attributes.position;
    for(let j=0;j<points.count;j++)points.setZ(j,Math.sin(points.getY(j)*1.2+i)*.18*(2.5-points.getY(j))/5);
    fabric.computeVertexNormals();mesh(fabric,i%2?teal:ochre,x,12,z);
    box(2.7,.12,.18,x,14.6,z,dark);
  }
  const grassMaterial=new T.MeshStandardMaterial({color:0x819252,roughness:1,side:T.DoubleSide});
  const grass=new T.InstancedMesh(new T.ConeGeometry(.16,.65,3),grassMaterial,240),gm=new T.Matrix4();
  for(let i=0;i<240;i++){const x=(Math.sin(i*48.1)*.5+.5)*72,z=i%2?-1.2:49.2;gm.compose(new T.Vector3(x,.22,z),new T.Quaternion().setFromEuler(new T.Euler(0,i,.15)),new T.Vector3(1,.6+i%3*.25,1));grass.setMatrixAt(i,gm);}root.add(grass);
  // Fine roadside dressing stays flush with the collision floor.
  const pebble=new T.IcosahedronGeometry(.09,0),pebbles=new T.InstancedMesh(pebble,rock,520),matrix=new T.Matrix4();
  for(let i=0;i<520;i++){const x=(Math.sin(i*73.1)*.5+.5)*72,z=(i%2?1:-1)*(5.3+(Math.sin(i*19.3)*.5+.5)*8)+24;matrix.compose(new T.Vector3(x,.04,z),new T.Quaternion().setFromEuler(new T.Euler(i,i*.7,0)),new T.Vector3(1+i%3,.5,1));pebbles.setMatrixAt(i,matrix);}pebbles.receiveShadow=true;root.add(pebbles);
  return root;
}
