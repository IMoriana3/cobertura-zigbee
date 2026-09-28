/* Presentation only. No solar, irradiance, tracking or shadow-engine inputs.
 * Metre-scale terrain shared by the synthetic and real-layout views.
 * The surrounding landscape is illustrative, not surveyed topography.
 */
(function(root){
'use strict';
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const hash=(x,z)=>{const v=Math.sin(x*127.1+z*311.7)*43758.5453123;return v-Math.floor(v);};
function noise(x,z){const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);return mix(mix(hash(ix,iz),hash(ix+1,iz),u),mix(hash(ix,iz+1),hash(ix+1,iz+1),u),v);}
function distance(x,z,p){return Math.hypot(Math.max(p.x0-x,x-p.x1,0),Math.max(p.z0-z,z-p.z1,0));}
function random(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function build(T,world,opt){
  const {bounds:p,width,height,cx,cz,real=false,groundY=0,renderer}=opt;
  const edge=real?60:14, rise=real?300:90,amp=real?34:7;
  const heightAt=(x,z)=>groundY+((noise(x/(real?380:120)+4,z/(real?320:110))-0.48)*amp+(noise(x/(real?125:44),z/(real?130:48))-0.5)*amp*.3)*smooth(edge,edge+rise,distance(x,z,p));
  const group=new T.Group();group.name='overcast-landscape';group.userData.presentationOnly=true;world.add(group);
  const textureSize=1024, texels=new Uint8Array(textureSize*textureSize*4);
  // Continuous, multiscale ground colour. Small detail lives in a separate
  // repeating bump map, so a kilometre-wide layout does not stretch pebbles.
  for(let j=0;j<textureSize;j++)for(let i=0;i<textureSize;i++){
    const x=cx+(i/(textureSize-1)-.5)*width,z=cz+(.5-j/(textureSize-1))*height,d=distance(x,z,p);
    const broad=noise(x/57,z/63),patch=noise(x/13+8,z/17),grain=hash(i,j)-.5;
    const meadow=smooth(8,real?60:30,d),green=smooth(.3,.76,.7*broad+.3*patch)*meadow;
    const variation=(broad-.5)*22+(patch-.5)*14+grain*5;
    const k=(j*textureSize+i)*4;
    texels[k]=mix(111,88,green)+variation;texels[k+1]=mix(102,99,green)+variation;texels[k+2]=mix(77,68,green)+variation*.75;texels[k+3]=255;
  }
  const map=new T.DataTexture(texels,textureSize,textureSize,T.RGBAFormat);
  map.magFilter=T.LinearFilter;map.minFilter=T.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;
  const aniso=renderer&&renderer.capabilities.getMaxAnisotropy?Math.min(8,renderer.capabilities.getMaxAnisotropy()):1;map.anisotropy=aniso;
  const grainSize=256,grainData=new Uint8Array(grainSize*grainSize*4);
  for(let j=0;j<grainSize;j++)for(let i=0;i<grainSize;i++){
    const k=(j*grainSize+i)*4,v=96+noise(i/9,j/9)*50+hash(i+37,j+91)*62;
    grainData[k]=grainData[k+1]=grainData[k+2]=v;grainData[k+3]=255;
  }
  const bump=new T.DataTexture(grainData,grainSize,grainSize,T.RGBAFormat);
  bump.wrapS=bump.wrapT=T.RepeatWrapping;bump.repeat.set(width/7,height/7);bump.magFilter=T.LinearFilter;bump.minFilter=T.LinearMipmapLinearFilter;bump.generateMipmaps=true;bump.anisotropy=aniso;bump.needsUpdate=true;
  const geo=new T.PlaneGeometry(width,height,real?192:128,real?192:96);geo.rotateX(-Math.PI/2);
  const pos=geo.attributes.position;
  for(let i=0;i<pos.count;i++)pos.setY(i,heightAt(pos.getX(i)+cx,pos.getZ(i)+cz)-groundY);
  geo.computeVertexNormals();
  const ground=new T.Mesh(geo,new T.MeshStandardMaterial({map,bumpMap:bump,bumpScale:.055,roughness:.98,metalness:0}));
  // Three r128 shares the colour map's UV transform with the bump map.
  // Give grain its own metre-based scale instead of stretching it over km.
  ground.material.onBeforeCompile=shader=>{
    shader.uniforms.landscapeDetailScale={value:new T.Vector2(width/7,height/7)};
    shader.fragmentShader='uniform vec2 landscapeDetailScale;\n'+shader.fragmentShader.replace('#include <bumpmap_pars_fragment>',T.ShaderChunk.bumpmap_pars_fragment.replace(/\bvUv\b/g,'(vUv * landscapeDetailScale)'));
  };
  ground.material.customProgramCacheKey=()=> 'overcast-ground-detail-v1';
  ground.name='landscape-soil';ground.position.set(cx,groundY,cz);ground.receiveShadow=true;group.add(ground);

  // A real ribbon, rather than a road painted onto coarse terrain vertices.
  // Rounded corners stay a consistent four metres wide at every plant size.
  const inner=real?8:3,outer=inner+4,vertices=[],uv=[],indices=[];
  const corners=[[p.x1,p.z1,0],[p.x0,p.z1,Math.PI/2],[p.x0,p.z0,Math.PI],[p.x1,p.z0,Math.PI*1.5]];
  let length=0,prev=null,index=0;
  for(const [x,z,start] of corners)for(let k=0;k<=16;k++){
    const a=start+k/16*Math.PI/2,dx=Math.cos(a),dz=Math.sin(a),mx=x+dx*(inner+2),mz=z+dz*(inner+2);
    if(prev)length+=Math.hypot(mx-prev[0],mz-prev[1]);prev=[mx,mz];
    for(const r of [inner,outer])vertices.push(x+dx*r,groundY+.018,z+dz*r);
    uv.push(0,length/4,1,length/4);
    if(index){const n=index*2;indices.push(n-2,n-1,n,n-1,n+1,n);}index++;
  }
  indices.push((index-1)*2,(index-1)*2+1,0,(index-1)*2+1,1,0);
  const roadGeo=new T.BufferGeometry();roadGeo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));roadGeo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));roadGeo.setIndex(indices);roadGeo.computeVertexNormals();
  const roadBump=bump.clone();roadBump.repeat.set(1,1);roadBump.needsUpdate=true;
  const road=new T.Mesh(roadGeo,new T.MeshStandardMaterial({color:0x8c8066,bumpMap:roadBump,bumpScale:.035,roughness:1,side:T.DoubleSide}));
  road.name='landscape-service-road';road.receiveShadow=true;group.add(road);

  const rand=random(real?4242:12345),dummy=new T.Object3D(),color=new T.Color();
  // Small, irregular tufts give the rows a scale cue. Instancing bounds the
  // draw calls; no alpha cards, imported assets or runtime network requests.
  const grassV=[];
  for(let k=0;k<3;k++){const a=k*Math.PI/3,dx=Math.cos(a)*.11,dz=Math.sin(a)*.11;grassV.push(-dx,0,-dz,dx,0,dz,dx*.65,.28+ k*.04,dz*.65);}
  const grassGeo=new T.BufferGeometry();grassGeo.setAttribute('position',new T.Float32BufferAttribute(grassV,3));grassGeo.computeVertexNormals();
  const grasses=new T.InstancedMesh(grassGeo,new T.MeshLambertMaterial({color:0xffffff,side:T.DoubleSide}),real?2800:1600);
  grasses.name='landscape-grass';const vegetationWidth=(p.x1-p.x0)+(real?200:170),vegetationDepth=(p.z1-p.z0)+(real?200:150);
  let g=0;
  for(let attempt=0;attempt<grasses.count*4&&g<grasses.count;attempt++){
    const x=cx+(rand()-.5)*vegetationWidth,z=cz+(rand()-.5)*vegetationDepth,d=distance(x,z,p);
    if(d>inner-1&&d<outer+3)continue;
    if(rand()>noise(x/8+3,z/9))continue;
    const size=.45+rand()*1.1;dummy.position.set(x,heightAt(x,z),z);dummy.rotation.set(0,rand()*Math.PI*2,0);dummy.scale.set(size,size,size);dummy.updateMatrix();grasses.setMatrixAt(g,dummy.matrix);
    color.setRGB(.30+rand()*.12,.31+rand()*.09,.18+rand()*.08);grasses.setColorAt(g++,color);
  }
  grasses.count=g;grasses.receiveShadow=true;grasses.frustumCulled=false;group.add(grasses);
  const bushGeo=new T.IcosahedronGeometry(1,1),bp=bushGeo.attributes.position;
  for(let i=0;i<bp.count;i++){const x=bp.getX(i),y=bp.getY(i),z=bp.getZ(i),f=.8+.28*noise(x*4+3,z*4+y);bp.setXYZ(i,x*f,(y+1)*.44*f,z*f);}bushGeo.computeVertexNormals();
  const bushes=new T.InstancedMesh(bushGeo,new T.MeshStandardMaterial({color:0xffffff,roughness:1}),real?240:100);
  bushes.name='landscape-scrub';let b=0;
  for(let a=0;a<1200&&b<bushes.count;a++){
    const x=cx+(rand()-.5)*vegetationWidth*1.9,z=cz+(rand()-.5)*vegetationDepth*1.9;
    if(distance(x,z,p)<(real?28:20)||noise(x/25,z/25)<.42)continue;
    const s=.45+rand()*1.1;dummy.position.set(x,heightAt(x,z),z);dummy.rotation.set(0,rand()*6.28,0);dummy.scale.set(s,s*(.7+rand()*.4),s);dummy.updateMatrix();bushes.setMatrixAt(b,dummy.matrix);
    color.setRGB(.20+rand()*.10,.23+rand()*.09,.13+rand()*.07);bushes.setColorAt(b++,color);
  }
  bushes.count=b;bushes.castShadow=true;bushes.receiveShadow=true;bushes.frustumCulled=false;group.add(bushes);
  group.userData={presentationOnly:true,groundY,roadWidth:4,vegetationInstances:g+b};
  return {group,heightAt,ground,road};
}
root.OvercastEnvironment=Object.freeze({build});
})(typeof window!=='undefined'?window:globalThis);
