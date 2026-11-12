const canvas = document.querySelector('#field');
const status = document.querySelector('#status');
const layerList = document.querySelector('#layer-list');
const resetButton = document.querySelector('#reset-view');
const aboutOpen = document.querySelector('#about-open');
const aboutDialog = document.querySelector('#about-dialog');

aboutOpen.addEventListener('click', () => {
  aboutDialog.showModal();
  aboutOpen.setAttribute('aria-expanded', 'true');
});
aboutDialog.addEventListener('close', () => aboutOpen.setAttribute('aria-expanded', 'false'));
aboutDialog.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    aboutDialog.close();
  }
});

async function startViewer() {
  if (location.protocol === 'file:') {
    throw new Error('Open this page through a local HTTP server to load the 3D model.');
  }
  const loadWarnings = [];
  const THREE = await import('three');
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x0000ff);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.01, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.minZoom = 0.2;
  controls.maxZoom = 12;
  controls.listenToKeyEvents(canvas);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.7;
  const contentControllers=new Map();
  let atlasTexture = null, atlasController = null, exploration = null, activeCamera = camera, storyOpen = false;
  const render = () => renderer.render(scene, activeCamera);
  controls.addEventListener('change', render);
  let previousTime = null;
  renderer.setAnimationLoop((time) => {
    const delta = previousTime === null ? 0 : Math.min((time - previousTime) / 1000, 0.1);
    previousTime = time;
    if (controls.enabled && !storyOpen) controls.update(delta);
    if (!storyOpen) exploration?.update(delta);
    if (storyOpen) return;
    if (atlasTexture) atlasTexture.needsUpdate = true;
    for (const texture of contentControllers.keys()) texture.needsUpdate = true;
    render();
  });
  const resetView = () => {
    exploration?.exit();
    camera.position.set(3.2, 2.1, 3.2);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.update();
    render();
  };
  function resize() {
    const width = canvas.clientWidth;
    const height = Math.max(canvas.clientHeight, 1);
    const aspect = width / height;
    // Leave room below the object for the layer panel on narrow screens.
    const halfHeight = aspect < 1 ? 2.3 / aspect : 1.8;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    exploration?.resize();
    render();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resetView();
  resize();
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    status.textContent = '3D view interrupted. Reload the page to restore it.';
    status.hidden = false;
  });

  const { scene: model } = await new GLTFLoader().loadAsync(new URL('../assets/models/vortex.glb?v=surfaces-1', import.meta.url).href);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const longestSide = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(longestSide) || longestSide <= 0) throw new Error('The model contains no displayable geometry.');
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = 2 / longestSide;
  model.scale.setScalar(scale);
  model.position.copy(center).multiplyScalar(-scale);
  model.traverse((object) => {
    if (object.isLine) {
      object.material = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65, depthWrite: false });
      object.renderOrder = 2;
    } else if (object.isMesh) {
      object.material.depthWrite = false;
      object.material.side = THREE.DoubleSide;
      object.material.polygonOffset = true;
      object.material.polygonOffsetFactor = 1;
      object.material.polygonOffsetUnits = 1;
      object.renderOrder = 1;
    }
  });
  scene.add(model);

  // The GLB stores all nine planes in one mesh. Select triangles at the
  // third distinct Y elevation from the top, preserving the exported shape.
  const planes = model.children.find(child => (child.userData.name || child.name) === '05_Planes');
  let surface = null;
  planes?.traverse(object => { if (object.isMesh && !surface) surface = object; });
  if (surface) {
    const position = surface.geometry.getAttribute('position');
    const heights = [...new Set(Array.from({length: position.count}, (_, i) => position.getY(i).toFixed(7)))].map(Number).sort((a,b) => b-a);
    const targetY = heights[2];
    const vertices = [], indices = surface.geometry.index;
    const count = indices ? indices.count : position.count;
    for (let i=0; i<count; i+=3) {
      const triangle = [0,1,2].map(offset => indices ? indices.getX(i+offset) : i+offset);
      if (triangle.every(index => Math.abs(position.getY(index)-targetY)<1e-6)) {
        triangle.forEach(index => vertices.push(position.getX(index),position.getY(index),position.getZ(index)));
      }
    }
    if (vertices.length !== 18) throw new Error('Third plane not found in the model.');
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometry.computeBoundingBox();
    const box=geometry.boundingBox;
    const uv=[];
    for(let i=0;i<vertices.length;i+=3) uv.push((vertices[i]-box.min.x)/(box.max.x-box.min.x),1-(vertices[i+2]-box.min.z)/(box.max.z-box.min.z));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    const atlasCanvas=document.createElement('canvas');atlasCanvas.width=1200;atlasCanvas.height=600;
    atlasTexture=new THREE.CanvasTexture(atlasCanvas);
    atlasTexture.colorSpace=THREE.SRGBColorSpace;
    atlasTexture.anisotropy=renderer.capabilities.getMaxAnisotropy();
    const material=new THREE.MeshBasicMaterial({map:atlasTexture,side:THREE.DoubleSide,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
    const atlas=new THREE.Mesh(geometry,material);
    atlas.name='Spatial Relatedness / third plane';
    atlas.userData.contentPlane=2;
    atlas.renderOrder=3;
    // Match source coordinates, inheriting any transforms on the source mesh.
    surface.add(atlas);
    const {createSpatialAtlas}=await import('../spatial-atlas.js?v=runtime-2');
    atlasController = await createSpatialAtlas(atlasCanvas,document.querySelector('#spatial-play'),document.querySelector('#spatial-status'),new URL('../assets/content/piano-03/',import.meta.url));
    contentControllers.set(atlasTexture,atlasController);
    // Plane 01 is the highest exported elevation, separate from the IPv4 floor.
    const firstVertices=[];
    for(let i=0;i<count;i+=3){
      const triangle=[0,1,2].map(offset=>indices?indices.getX(i+offset):i+offset);
      if(triangle.every(index=>Math.abs(position.getY(index)-heights[0])<1e-6))triangle.forEach(index=>firstVertices.push(position.getX(index),position.getY(index),position.getZ(index)));
    }
    if(firstVertices.length!==18)throw new Error('First plane not found in the model.');
    const firstGeometry=new THREE.BufferGeometry();firstGeometry.setAttribute('position',new THREE.Float32BufferAttribute(firstVertices,3));firstGeometry.computeBoundingBox();
    const firstBox=firstGeometry.boundingBox,firstUV=[];
    for(let i=0;i<firstVertices.length;i+=3)firstUV.push((firstVertices[i]-firstBox.min.x)/(firstBox.max.x-firstBox.min.x),1-(firstVertices[i+2]-firstBox.min.z)/(firstBox.max.z-firstBox.min.z));
    firstGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(firstUV,2));
    const firstCanvas=document.createElement('canvas');firstCanvas.width=1200;firstCanvas.height=600;
    const firstTexture=new THREE.CanvasTexture(firstCanvas);firstTexture.colorSpace=THREE.SRGBColorSpace;firstTexture.anisotropy=renderer.capabilities.getMaxAnisotropy();
    const firstMaterial=material.clone();firstMaterial.map=firstTexture;
    const firstAtlas=new THREE.Mesh(firstGeometry,firstMaterial);firstAtlas.name='Submarine cables / first plane';firstAtlas.userData.contentPlane=0;firstAtlas.renderOrder=3;surface.add(firstAtlas);
    const {createCableAtlas}=await import('../cable-atlas.js?v=runtime-2');
    try {
      contentControllers.set(firstTexture,await createCableAtlas(firstCanvas));
    } catch (error) {
      console.error('Submarine cable layer unavailable:', error);
      const context=firstCanvas.getContext('2d');
      context.fillStyle='#0000ff';context.fillRect(0,0,firstCanvas.width,firstCanvas.height);
      context.fillStyle='#f3f1dd';context.font='24px monospace';context.fillText('CABLE DATA UNAVAILABLE',25,85);
      loadWarnings.push('3D viewer ready; some map data is unavailable.');
    }
    const {createExploration}=await import('./explore.js');
    exploration=createExploration({THREE,model,surface,texture:atlasTexture,planeTextures:new Map([[0,firstTexture],[2,atlasTexture]]),orbitCamera:camera,controls,onCamera:next=>{activeCamera=next;}});
    let wasEnabled = true;
    window.addEventListener('storyboard-toggle', event => {
      storyOpen=event.detail.open;
      if(storyOpen){wasEnabled=controls.enabled;controls.enabled=false;}
      else controls.enabled=wasEnabled;
    });
    // A click on an animated floor or wall opens the same evidence room.
    const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2();
    let press=null;
    canvas.addEventListener('pointerdown',event=>{if(event.button===0)press={x:event.clientX,y:event.clientY};});
    canvas.addEventListener('pointercancel',()=>{press=null;});
    canvas.addEventListener('pointerup',event=>{
      if(!press)return;
      const distance=Math.hypot(event.clientX-press.x,event.clientY-press.y);press=null;
      if(distance>5||storyOpen)return;
      const rect=canvas.getBoundingClientRect();
      pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
      raycaster.setFromCamera(pointer,activeCamera);
      const targets=[];model.traverse(object=>{if(object.isMesh&&contentControllers.has(object.material.map)&&object.material.opacity>=.3&&object.visible){let parent=object.parent,visible=true;while(parent){visible=visible&&parent.visible;parent=parent.parent;}if(visible)targets.push(object);}});
      const hit=raycaster.intersectObjects(targets,false)[0];
      if(hit?.uv)contentControllers.get(hit.object.material.map)?.inspectAt(hit.uv.x,hit.uv.y);
    });
  }


  const names = ['01_Full-Cube', '02_Cube-Vortex', '03_Cube-Hole', '04_Vortex', '05_Planes'];
  for (const name of names) {
    const object = model.children.find((child) => (child.userData.name || child.name) === name);
    const label = document.createElement('label');
    label.className = 'layer';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(object);
    checkbox.disabled = !object;
    const text = document.createElement('span');
    const labels = { '01_Full-Cube':'Boundary / full cube', '02_Cube-Vortex':'Network / mesh', '03_Cube-Hole':'Territory / shell', '04_Vortex':'Vortex / membrane', '05_Planes':'Strata / data rooms' };
    text.textContent = labels[name] + (object ? '' : ' (empty)');
    label.append(checkbox, text);
    layerList.append(label);
    checkbox.addEventListener('change', () => {
      object.visible = checkbox.checked;
      render();
    });
  }
  document.querySelector('#layers').disabled = false;
  resetButton.disabled = false;
  resetButton.addEventListener('click', resetView);
  canvas.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'r') resetView();
    if (document.body.classList.contains('inside')) return;
    if (event.key === '+' || event.key === '=' || event.key === '-') {
      event.preventDefault();
      camera.zoom = THREE.MathUtils.clamp(camera.zoom * (event.key === '-' ? 0.9 : 1.1), controls.minZoom, controls.maxZoom);
      camera.updateProjectionMatrix();
      render();
    }
  });
  status.textContent = loadWarnings.join(' ');
  status.hidden = loadWarnings.length === 0;
  render();
}

startViewer().catch((error) => {
  console.error('Vortex viewer:', error);
  status.hidden = false;
  status.textContent = location.protocol === 'file:' ? error.message : 'Unable to load the 3D view. Check WebGL availability and reload.';
});
