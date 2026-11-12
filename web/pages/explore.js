export function createExploration({THREE, model, surface, texture, planeTextures=new Map([[2,texture]]), orbitCamera, controls, onCamera}) {
  const enter=document.querySelector('#enter-vortex'), levelsUI=document.querySelector('#level-list');
  const help=document.querySelector('#navigation-help'), mode=document.querySelector('#view-mode');
  const coordinates=document.querySelector('#coordinates'), pad=document.querySelector('#inside-controls');
  const rotation=document.querySelector('#rotation'), stretch=document.querySelector('#wall-height');
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let inside=false, chosen=2, yaw=0, pitch=-.22, drag=null, wallFactor=1, shouldOrbit=!reduce, transition=null;
  const keys=new Set(), walls=[], originals=[];
  model.updateMatrixWorld(true);
  model.traverse(object=>{if(object.material) originals.push({object,opacity:object.material.opacity,transparent:object.material.transparent,materialVisible:object.material.visible,objectVisible:object.visible});});
  const position=surface.geometry.getAttribute('position');
  const heights=[...new Set(Array.from({length:position.count},(_,i)=>position.getY(i).toFixed(7)))].map(Number).sort((a,b)=>b-a);
  const rooms=new THREE.Group();rooms.name='Vertical data rooms';surface.add(rooms);
  const levels=heights.map((height,index)=>{
    const unique=new Map();
    for(let i=0;i<position.count;i++)if(Math.abs(position.getY(i)-height)<1e-6){const p=new THREE.Vector3().fromBufferAttribute(position,i);unique.set(`${p.x.toFixed(7)},${p.z.toFixed(7)}`,p);}
    const corners=[...unique.values()];
    const center=corners.reduce((a,p)=>a.add(p),new THREE.Vector3()).multiplyScalar(1/corners.length);
    corners.sort((a,b)=>Math.atan2(a.z-center.z,a.x-center.x)-Math.atan2(b.z-center.z,b.x-center.x));
    const wallHeight=index===0?.0105:Math.min(.0115,(heights[index-1]-height)*.92);
    // Every level has architectural walls; only populated levels receive imagery.
    const wallTexture=planeTextures.get(index);
    for(let edge=0;edge<corners.length;edge++){
      const a=corners[edge], b=corners[(edge+1)%corners.length];
      const vertices=[a.x,height,a.z,b.x,height,b.z,a.x,height+wallHeight,a.z,b.x,height,b.z,b.x,height+wallHeight,b.z,a.x,height+wallHeight,a.z];
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
      const u=edge/4,v=(edge+1)/4;
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute([u,0,v,0,u,1,v,0,v,1,u,1],2));
      const material=new THREE.MeshBasicMaterial({map:wallTexture||null,color:wallTexture?0xffffff:0x8585ff,side:THREE.DoubleSide,transparent:true,opacity:wallTexture?.72:.045,depthWrite:false});
      const wall=new THREE.Mesh(geometry,material);wall.renderOrder=4;rooms.add(wall);
      const border=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:index===2?0xdeff00:0xa5b6ff,transparent:true,opacity:index===2?.85:.25,depthWrite:false}));
      rooms.add(border);walls.push({wall,border,height,wallHeight,vertices,index});
    }
    const labelCanvas=document.createElement('canvas');labelCanvas.width=256;labelCanvas.height=128;
    const c=labelCanvas.getContext('2d');c.fillStyle=index===2?'#deff00':'#f3f1dd';c.font='bold 62px monospace';c.fillText(String(index+1).padStart(2,'0'),10,73);c.font='15px monospace';c.fillText(index===2?'SPATIAL RELATEDNESS':index===0?'SUBMARINE CABLES':'EMPTY / STRATUM',10,105);
    const label=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(labelCanvas),depthTest:false,transparent:true}));
    label.position.copy(corners[0]).add(new THREE.Vector3(-.003,.002,0));label.scale.set(.009,.0045,1);rooms.add(label);
    const button=document.createElement('button');button.type='button';
    const number=document.createElement('span');number.textContent=String(index+1).padStart(2,'0');
    const name=document.createElement('span');name.textContent=index===0?'Submarine cables':index===2?'IPv4 geographies':'Empty level';
    const state=document.createElement('small');state.textContent=planeTextures.has(index)?'● CONTENT':'○ EMPTY';
    button.append(number,name,state);button.setAttribute('aria-label',`Select level ${index+1}: ${name.textContent}`);button.setAttribute('aria-current',String(index===chosen));
    button.addEventListener('click',()=>selectLevel(index));levelsUI.append(button);
    return {height,center,corners,wallHeight,button};
  });
  const selectionOutline=new THREE.LineLoop(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xdeff00,depthTest:false,transparent:true,opacity:1}));
  selectionOutline.name='Selected plane outline';selectionOutline.renderOrder=20;rooms.add(selectionOutline);
  const eye=new THREE.PerspectiveCamera(76,1,.001,40);eye.rotation.order='YXZ';
  const worldCenter=index=>surface.localToWorld(levels[index].center.clone());
  const face=()=>{eye.rotation.set(pitch,yaw,0,'YXZ');};
  function setOriginalMaterials(active){
    for(const {object,opacity,transparent,materialVisible,objectVisible} of originals){
      if(object.userData.contentPlane!==undefined){object.visible=!active;continue;}
      // Material visibility hides each original mesh without hiding its wall children.
      object.material.visible=active?false:materialVisible;
      object.visible=objectVisible;
      object.material.transparent=active||transparent;
      object.material.opacity=active?0:Math.min(opacity,object.isLine?.15:.10);
      object.material.needsUpdate=true;
    }
  }
  function refreshContentVisibility(){
    model.traverse(object=>{
      if(!object.isMesh||object.userData.contentPlane===undefined)return;
      object.visible=!inside;
      const active=object.userData.contentPlane===chosen;
      object.material.transparent=true;object.material.depthWrite=false;
      object.material.opacity=active?1:(inside?.10:.20);
    });
    walls.forEach(({wall,index,border})=>{
      const active=index===chosen;
      wall.material.opacity=wall.material.map?(active?(inside?.92:.80):.09):(active?.09:.025);
      border.material.opacity=active?.85:.16;
    });
    surface.material.visible=!inside;
    selectionOutline.visible=!inside;
    mode.textContent=inside?`INSIDE / PLANE ${String(chosen+1).padStart(2,'0')}`:`OUTSIDE / PLANE ${String(chosen+1).padStart(2,'0')} IN VIEW`;
  }
  function refreshLevel(){
    levels.forEach((level,i)=>level.button.setAttribute('aria-current',String(i===chosen)));
    document.querySelector('#selected-level').value=`${String(chosen+1).padStart(2,'0')} / 09`;
    document.querySelector('#level-menu-help').textContent=inside?'Choose a level to move between its walls.':'Select to highlight. ENTER to go inside.';
    selectionOutline.geometry.dispose();
    selectionOutline.geometry=new THREE.BufferGeometry().setFromPoints(levels[chosen].corners.map(p=>p.clone().add(new THREE.Vector3(0,.00005,0))));
    refreshContentVisibility();
  }
  function selectLevel(index){
    if(inside){enterLevel(index);return;}
    chosen=index;keys.clear();shouldOrbit=false;controls.autoRotate=false;
    const target=worldCenter(index),direction=orbitCamera.position.clone().sub(controls.target).normalize();
    if(!direction.lengthSq())direction.set(3.2,2.1,3.2).normalize();
    transition={target,position:target.clone().add(direction.multiplyScalar(5.2))};
    if(reduce){orbitCamera.position.copy(transition.position);controls.target.copy(transition.target);controls.update(0);transition=null;}
    refreshLevel();help.textContent='LEVEL HIGHLIGHTED · ENTER TO GO INSIDE · DRAG TO ORBIT';
  }
  document.querySelector('#level-prev').addEventListener('click',()=>selectLevel(Math.max(0,chosen-1)));
  document.querySelector('#level-next').addEventListener('click',()=>selectLevel(Math.min(levels.length-1,chosen+1)));
  document.querySelector('#level-overview').addEventListener('click',()=>document.querySelector('#reset-view').click());
  function enterLevel(index){
    transition=null;chosen=index;inside=true;keys.clear();drag=null;controls.enabled=false;controls.autoRotate=false;
    document.body.classList.add('inside');pad.hidden=false;
    eye.position.copy(worldCenter(index));eye.position.y+=levels[index].wallHeight*model.scale.y*.45;
    yaw=.15;pitch=0;face();onCamera(eye);setOriginalMaterials(true);

    enter.innerHTML='<span>BACK TO THE</span><strong>OUTSIDE ↗</strong>';enter.setAttribute('aria-pressed','true');
    mode.textContent='INHABITING THE NETWORK';help.textContent='DRAG: LOOK · WASD / ARROWS: WALK · Q/E OR SCROLL: HEIGHT · ESC: OUTSIDE';
    refreshLevel();resize();canvasFocus();
  }
  function canvasFocus(){document.querySelector('#field').focus({preventScroll:true});}
  function exit(){
    transition=null;inside=false;keys.clear();drag=null;controls.enabled=true;controls.autoRotate=shouldOrbit;
    document.body.classList.remove('inside');pad.hidden=true;onCamera(orbitCamera);setOriginalMaterials(false);

    enter.innerHTML='<span>DON’T JUST<br>LOOK AT IT.</span><strong>ENTER ↘</strong>';enter.setAttribute('aria-pressed','false');
    refreshLevel();help.textContent='DRAG TO ORBIT · SCROLL TO APPROACH · SELECT A LEVEL TO HIGHLIGHT';
  }
  function resize(){const field=document.querySelector('#field');eye.aspect=field.clientWidth/Math.max(1,field.clientHeight);eye.updateProjectionMatrix();}
  function move(forward,side,vertical,dt){
    const speed=.32*dt;
    eye.position.x+=(-Math.sin(yaw)*forward+Math.cos(yaw)*side)*speed;
    eye.position.z+=(-Math.cos(yaw)*forward-Math.sin(yaw)*side)*speed;
    eye.position.y+=vertical*speed;
    eye.position.clamp(new THREE.Vector3(-1.25,-1.15,-1.25),new THREE.Vector3(1.25,1.28,1.25));
  }
  const field=document.querySelector('#field');
  field.addEventListener('pointerdown',e=>{if(!inside||e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,yaw,pitch};field.setPointerCapture(e.pointerId);});
  field.addEventListener('pointermove',e=>{if(!inside||!drag||drag.id!==e.pointerId)return;yaw=drag.yaw-(e.clientX-drag.x)*.005;pitch=THREE.MathUtils.clamp(drag.pitch-(e.clientY-drag.y)*.005,-1.45,1.45);face();});
  const stop=()=>{drag=null;};field.addEventListener('pointerup',stop);field.addEventListener('pointercancel',stop);
  field.addEventListener('wheel',e=>{if(!inside)return;e.preventDefault();move(0,0,-Math.sign(e.deltaY),.22);},{passive:false});
  window.addEventListener('storyboard-toggle',()=>{keys.clear();stop();});
  window.addEventListener('keydown',e=>{
    if(document.body.classList.contains('investigating'))return;
    if(e.key==='Escape'&&inside&&document.querySelector('#evidence').hidden){exit();return;}
    if(!inside||e.target.matches('input,button,summary')||!document.querySelector('#evidence').hidden)return;
    const k=e.key.toLowerCase();if(['w','a','s','d','q','e','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){e.preventDefault();keys.add(k);}
  });
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur',()=>{keys.clear();stop();});document.addEventListener('visibilitychange',()=>{keys.clear();stop();});
  const padKeys={forward:'w',back:'s',left:'a',right:'d',up:'e',down:'q'};
  pad.querySelectorAll('button').forEach(button=>{
    const key=padKeys[button.dataset.move];button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);keys.add(key);});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>keys.delete(key));
    button.addEventListener('click',e=>{if(e.detail===0)move(key==='w'?1:key==='s'?-1:0,key==='d'?1:key==='a'?-1:0,key==='e'?1:key==='q'?-1:0,.2);});
  });
  enter.disabled=false;enter.addEventListener('click',()=>inside?exit():enterLevel(chosen));
  controls.autoRotate=shouldOrbit;rotation.setAttribute('aria-pressed',String(shouldOrbit));
  rotation.addEventListener('click',()=>{shouldOrbit=!shouldOrbit;controls.autoRotate=!inside&&shouldOrbit;rotation.setAttribute('aria-pressed',String(shouldOrbit));rotation.textContent=shouldOrbit?'Orbit ↻':'Orbit paused';});
  stretch.addEventListener('input',()=>{
    wallFactor=Number(stretch.value)/100;document.querySelector('#wall-value').value=stretch.value+'%';
    for(const {wall,border,height,wallHeight,vertices} of walls){
      const attr=wall.geometry.getAttribute('position');
      for(let i=0;i<attr.count;i++)attr.setY(i,height+(vertices[i*3+1]>height?wallHeight*wallFactor:0));
      attr.needsUpdate=true;wall.geometry.computeBoundingSphere();border.geometry.dispose();border.geometry=new THREE.EdgesGeometry(wall.geometry);
    }
  });
  const evidence=document.querySelector('#evidence'), info=document.querySelector('#data-info');
  function showEvidence(show){evidence.hidden=!show;info.setAttribute('aria-expanded',String(show));keys.clear();if(show)document.querySelector('#close-evidence').focus();else info.focus();}
  info.addEventListener('click',()=>showEvidence(evidence.hidden));document.querySelector('#close-evidence').addEventListener('click',()=>showEvidence(false));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!evidence.hidden)showEvidence(false);});
  setOriginalMaterials(false);refreshLevel();
  let readout=0;
  return {exit,resize,update(dt){
    if(!inside&&transition){
      const factor=1-Math.exp(-dt*8);
      orbitCamera.position.lerp(transition.position,factor);controls.target.lerp(transition.target,factor);controls.update(0);
      if(orbitCamera.position.distanceTo(transition.position)<.001&&controls.target.distanceTo(transition.target)<.001)transition=null;
    }
    if(inside&&evidence.hidden){
      move(Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft')),Number(keys.has('e'))-Number(keys.has('q')),dt);
      let nearest=0;for(let i=1;i<levels.length;i++)if(Math.abs(worldCenter(i).y-eye.position.y)<Math.abs(worldCenter(nearest).y-eye.position.y))nearest=i;
      if(chosen!==nearest){chosen=nearest;refreshLevel();}
    }
    readout+=dt;if(readout>.1){readout=0;const p=inside?eye.position:orbitCamera.position;coordinates.value=`X ${p.x.toFixed(2)} / Y ${p.y.toFixed(2)} / Z ${p.z.toFixed(2)}`;}
  }};
}
