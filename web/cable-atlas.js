// The first plane shares its live canvas engine with the blue desktop workspace.
export async function createCableAtlas(canvas){
  const root=new URL('assets/content/piano-01/',import.meta.url),ctx=canvas.getContext('2d');
  ctx.fillStyle='#0000ff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#f3f1dd';ctx.font='24px monospace';ctx.fillText('01 / OPENING SUBMARINE NETWORKS',25,42);
  const response=await fetch(new URL('cables.json',root));if(!response.ok)throw Error('Cable data unavailable');const data=await response.json();
  const {createCableScene}=await import(new URL('cable-desktop/animation.js?v=runtime-2',import.meta.url).href);const scene=createCableScene({canvas,data});
  const panel=document.getElementById('cable-reader'),frame=document.getElementById('cable-desktop-frame');let open=false,returnFocus,wasPlaying=false;
  const backgroundState=new Map();
  function notify(){if(frame.contentWindow)frame.contentWindow.postMessage({type:'plane01-pause',paused:!open},location.origin);}
  function toggle(value){
    open=value;panel.hidden=!value;document.body.classList.toggle('investigating',value);
    if(value){returnFocus=document.activeElement;wasPlaying=scene.playing;scene.pause(true);if(!frame.getAttribute('src'))frame.src=new URL('cable-desktop/index.html?v=runtime-2',import.meta.url).href;frame.focus({preventScroll:true});}
    else{scene.pause(!wasPlaying);}
    if(value){for(const node of panel.parentElement.children){if(node===panel)continue;backgroundState.set(node,node.inert);node.inert=true;}}else{for(const [node,inert] of backgroundState)node.inert=inert;backgroundState.clear();returnFocus?.focus({preventScroll:true});}
    notify();window.dispatchEvent(new CustomEvent('storyboard-toggle',{detail:{open:value}}));
  }
  frame.addEventListener('load',notify);
  window.addEventListener('message',event=>{if(event.source===frame.contentWindow&&event.origin===location.origin&&event.data?.type==='plane01-close')toggle(false);});
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();toggle(false);}});
  return {inspectAt(){toggle(true);}};
}
