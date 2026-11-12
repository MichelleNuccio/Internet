/** An interactive globe of the original cached cable geometries.
 * The sphere and coastlines are geographic scaffolding. Cable colors represent
 * the notebook ownership groups; neither line width nor motion encodes traffic.
 */
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {OWNERSHIP_COLORS} from './animation.js';

// Match Three.js SphereGeometry UVs to an equirectangular lon/lat texture.
export function lonLatVector(lon,lat,radius=1){
  const phi=lon*Math.PI/180,theta=lat*Math.PI/180;
  return new THREE.Vector3(Math.cos(theta)*Math.cos(phi),Math.sin(theta),-Math.cos(theta)*Math.sin(phi)).multiplyScalar(radius);
}

// Preserve each source polyline bend. Densify long spans on the sphere so
// straight GPU segments stay above its surface instead of cutting through it.
export function cableSegments(record,radius=1.012){
  const vertices=[];
  for(const line of record.routes)for(let i=1;i<line.length;i++){
    const a=lonLatVector(...line[i-1]),b=lonLatVector(...line[i]);
    const dot=THREE.MathUtils.clamp(a.dot(b),-1,1);if(dot<-.9999)continue;
    const steps=Math.max(1,Math.ceil(Math.acos(dot)/.035));
    for(let step=0;step<steps;step++){
      const p=a.clone().lerp(b,step/steps).normalize().multiplyScalar(radius),q=a.clone().lerp(b,(step+1)/steps).normalize().multiplyScalar(radius);
      vertices.push(p.x,p.y,p.z,q.x,q.y,q.z);
    }
  }
  return vertices;
}

export async function createCableGlobe({canvas,records,onSelect=()=>{}}){
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setClearColor(0x0000ff,0);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(37,1,.01,30);camera.position.set(0,.12,3.5);
  const controls=new OrbitControls(camera,canvas);controls.enablePan=false;controls.enableDamping=true;controls.dampingFactor=.09;controls.minDistance=1.55;controls.maxDistance=5;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;controls.autoRotate=!reduced;controls.autoRotateSpeed=.32;
  scene.add(new THREE.AmbientLight(0xc5d7ff,2.5));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(-3,3,4);scene.add(light);
  const textureCanvas=document.createElement('canvas');textureCanvas.width=2048;textureCanvas.height=1024;const ctx=textureCanvas.getContext('2d');
  ctx.fillStyle='#0000bc';ctx.fillRect(0,0,2048,1024);
  const response=await fetch(new URL('../assets/content/piano-01/world-land.json',import.meta.url));if(!response.ok)throw Error('Coastline reference unavailable');const world=await response.json();
  for(const ring of world.rings){ctx.beginPath();ring.forEach(([lon,lat],i)=>{const x=(lon+180)/360*2048,y=(90-lat)/180*1024;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.closePath();ctx.fillStyle='#4444fa';ctx.fill();ctx.strokeStyle='#a2aaff';ctx.lineWidth=.9;ctx.stroke();}
  ctx.strokeStyle='#a4b3ff44';ctx.lineWidth=1;for(let x=0;x<2048;x+=2048/12){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,1024);ctx.stroke();}for(let y=0;y<1024;y+=1024/6){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(2048,y);ctx.stroke();}
  const texture=new THREE.CanvasTexture(textureCanvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();
  const sphere=new THREE.Mesh(new THREE.SphereGeometry(1,96,64),new THREE.MeshPhongMaterial({map:texture,shininess:20,specular:0x4d66ff}));scene.add(sphere);
  // Batch by ownership group: seven draw calls, with a cable ID per segment.
  const groups=new Map(),geometries=new Map();
  for(const record of records){const vertices=cableSegments(record);geometries.set(record.id,vertices);if(!groups.has(record.group))groups.set(record.group,{vertices:[],ids:[]});const group=groups.get(record.group);group.vertices.push(...vertices);for(let i=0;i<vertices.length/6;i++)group.ids.push(record.id);}
  const lines=[];
  for(const [name,group] of groups){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(group.vertices,3));const line=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:OWNERSHIP_COLORS[name]||'#8d91aa',transparent:true,opacity:.82}));line.userData.segmentIds=group.ids;scene.add(line);lines.push(line);}
  const selectedLine=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xdeff00,depthTest:true,transparent:true,opacity:1}));selectedLine.renderOrder=5;scene.add(selectedLine);
  const raycaster=new THREE.Raycaster();raycaster.params.Line.threshold=.009;const pointer=new THREE.Vector2();let press=null,focusTarget=null,last=0,paused=false;
  function pick(event){const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);const surface=raycaster.intersectObject(sphere)[0];const hit=raycaster.intersectObjects(lines,false).find(h=>!surface||h.distance<surface.distance+.035);if(hit){const id=hit.object.userData.segmentIds[Math.floor(hit.index/2)];if(id){select(id,false);onSelect(id);}}}
  canvas.addEventListener('pointerdown',e=>{press={x:e.clientX,y:e.clientY};focusTarget=null;controls.autoRotate=false;});
  canvas.addEventListener('pointerup',e=>{if(press&&Math.hypot(e.clientX-press.x,e.clientY-press.y)<5)pick(e);press=null;});canvas.addEventListener('pointercancel',()=>{press=null;});
  canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();controls.autoRotate=false;const spherical=new THREE.Spherical().setFromVector3(camera.position);if(e.key==='ArrowLeft')spherical.theta-=.12;if(e.key==='ArrowRight')spherical.theta+=.12;if(e.key==='ArrowUp')spherical.phi-=.12;if(e.key==='ArrowDown')spherical.phi+=.12;spherical.makeSafe();camera.position.setFromSpherical(spherical);controls.update();}if(['+','=','-'].includes(e.key)){e.preventDefault();camera.position.multiplyScalar(e.key==='-'?1.1:.9);camera.position.setLength(THREE.MathUtils.clamp(camera.position.length(),1.55,5));controls.update();}});
  function select(id,focus=true){const positions=geometries.get(id)||[];selectedLine.geometry.dispose();selectedLine.geometry=new THREE.BufferGeometry();selectedLine.geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));lines.forEach(line=>{line.material.opacity=positions.length?.35:.82;});controls.autoRotate=false;if(focus&&positions.length){const point=new THREE.Vector3(positions[0],positions[1],positions[2]).normalize();focusTarget=point.multiplyScalar(Math.max(2.2,camera.position.length()));}}
  function resize(){const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  renderer.setAnimationLoop(time=>{if(paused||document.hidden)return;const dt=last?Math.min((time-last)/1000,.1):0;last=time;if(focusTarget){camera.position.lerp(focusTarget,reduced?1:1-Math.exp(-dt*7));if(camera.position.distanceTo(focusTarget)<.001)focusTarget=null;}controls.update(dt);renderer.render(scene,camera);});
  return {select,pause(value){paused=value;last=0;},resize,destroy(){observer.disconnect();renderer.setAnimationLoop(null);controls.dispose();renderer.dispose();texture.dispose();}};
}
