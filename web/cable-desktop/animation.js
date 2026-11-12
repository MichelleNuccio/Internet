/** Canvas engine shared by this standalone page and the first floor/walls.
 * No third-party dependency or remote API: all quantities come from cables.json.
 */
export const OWNERSHIP_COLORS={'Telco / consortium':'#f15bb5',Google:'#1c8cff',Meta:'#fee440',Microsoft:'#00cfe8',Amazon:'#ff8c42','Multiple big tech':'#9b5de5',Unknown:'#8d91aa'};
export const MODES=['map','length','years'];
// Keep missing values distinct from zero. Aggregate cable systems, not route features.
export function buildCableModel(records){
  const lengths=records.filter(r=>Number.isFinite(r.length_km)&&r.length_km>=0).slice().sort((a,b)=>b.length_km-a.length_km);
  const byYear=new Map();let missingYears=0;
  for(const r of records){const year=Number(r.year);if(r.year===null||r.year===''||!Number.isInteger(year)||year<1800||year>2200){missingYears++;continue;}
    if(!byYear.has(year))byYear.set(year,{year,'In service':0,Planned:0,Unknown:0});byYear.get(year)[['In service','Planned'].includes(r.status)?r.status:'Unknown']++;
  }
  return {records,lengths,years:[...byYear.values()].sort((a,b)=>a.year-b.year),missingYears,missingLengths:records.length-lengths.length};
}
export function createCableScene({canvas,data,onChange=()=>{}}){
  const ctx=canvas.getContext('2d'),format=new Intl.NumberFormat('en-US');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let playing=!reduced,time=0,last=null,model=buildCableModel(data.records),filter={status:'',group:'',search:''},previousMode='',previousUI=-1,raf;
  const modes={map:{title:'Global cable routes',figure:2},length:{title:'Longest cable systems / top 15',figure:6},years:{title:'Systems by ready-for-service year',figure:5}};
  const mode=()=>MODES[Math.min(2,Math.floor(time/8))];
  const base=document.createElement('canvas');base.width=790;base.height=380;const bc=base.getContext('2d');
  const point=([lon,lat])=>[20+(lon+180)/360*750,12+(85-lat)/155*345];
  function path(c,record){c.beginPath();for(const line of record.routes){let previous=null;for(const p of line){const [x,y]=point(p);if(!previous||Math.abs(p[0]-previous[0])>180)c.moveTo(x,y);else c.lineTo(x,y);previous=p;}}}
  // Render the expensive route background once per filter change, then reuse it.
  function rebuildMap(){bc.fillStyle='#090a18';bc.fillRect(0,0,790,380);bc.strokeStyle='#25283f';bc.lineWidth=.5;for(let x=20;x<790;x+=62.5){bc.beginPath();bc.moveTo(x,12);bc.lineTo(x,357);bc.stroke();}for(const r of model.records){bc.strokeStyle=OWNERSHIP_COLORS[r.group]||'#8d91aa';bc.lineWidth=.6;bc.setLineDash(r.status==='Planned'?[3,3]:[]);path(bc,r);bc.stroke();}bc.setLineDash([]);}
  // Animate a reading highlight over the original generalized geographic routes.
  function drawMap(t){
    ctx.drawImage(base,10,72);const routed=model.records.filter(r=>r.routes.length);if(!routed.length)return;
    const record=routed[Math.floor(t*1.1)%routed.length];ctx.save();ctx.translate(10,72);ctx.strokeStyle='#f3f1dd';ctx.lineWidth=2;ctx.setLineDash([16,9]);ctx.lineDashOffset=-t*65;path(ctx,record);ctx.stroke();ctx.restore();
    ctx.fillStyle='#f3f1dd';ctx.font='13px monospace';ctx.fillText(record.name,30,440,730);ctx.fillStyle='#9ca5c6';ctx.font='10px monospace';ctx.fillText('Base dashes: planned / moving white highlight: reading guide, not measured traffic',24,459);
  }
  // Rank published lengths. The final scale stays fixed while bars grow.
  // The chart shows the top 15; the dataset window retains all filtered records.
  function drawLengths(t,progress){
    const rows=model.lengths.slice(0,15),max=rows[0]?.length_km||1;ctx.font='11px monospace';
    for(let i=0;i<rows.length;i++){const r=rows[i],y=95+i*23,w=r.length_km/max*470*progress;ctx.fillStyle='#dedff2';ctx.fillText(r.name.slice(0,23),22,y+11);ctx.fillStyle=OWNERSHIP_COLORS[r.group];ctx.fillRect(205,y,w,13);ctx.fillStyle='#dedff2';ctx.fillText(format.format(r.length_km)+' km',690,y+11);}
    ctx.fillStyle='#9ca5c6';ctx.fillText(`${model.lengths.length} systems with length / ${model.missingLengths} unknown / one bar = one system`,22,455);
  }
  // Stack counts by recorded status at each RFS year. Missing years are reported.
  function drawYears(t,progress){
    const rows=model.years,max=Math.max(1,...rows.map(r=>r['In service']+r.Planned+r.Unknown)),left=50,bottom=420,width=720,height=310;
    ctx.font='11px monospace';ctx.strokeStyle='#39405e';ctx.lineWidth=.7;
    for(let n=0;n<=4;n++){const y=bottom-n/4*height;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+width,y);ctx.stroke();ctx.fillStyle='#9ca5c6';ctx.fillText(String(Math.round(n/4*max)),17,y+4);}
    rows.forEach((r,i)=>{const step=width/Math.max(rows.length,1),x=left+i*step;let y=bottom;for(const [status,color] of [['In service','#56e0c5'],['Planned','#f15bb5'],['Unknown','#8d91aa']]){const h=r[status]/max*height*progress;ctx.fillStyle=color;ctx.fillRect(x,y-h,Math.max(1,step-3),h);y-=h;}if(i%5===0||i===rows.length-1){ctx.fillStyle='#dedff2';ctx.fillText(String(r.year),x-8,440);}});
    ctx.fillStyle='#9ca5c6';ctx.fillText(`${model.records.length-model.missingYears} systems with RFS year / ${model.missingYears} unknown years`,24,465);
    ctx.fillStyle='#56e0c5';ctx.fillText('■ In service',480,465);ctx.fillStyle='#f15bb5';ctx.fillText('■ Planned',610,465);
  }
  function sourceFor(current){return {map:drawMap,length:drawLengths,years:drawYears}[current].toString();}
  function draw(){
    const current=mode(),t=time,progress=reduced?1:Math.min(1,(t%8+.15)/1.2);
    ctx.save();ctx.setTransform(canvas.width/1200,0,0,canvas.height/600,0,0);ctx.fillStyle='#090a18';ctx.fillRect(0,0,1200,600);
    ctx.fillStyle='#56e0c5';ctx.font='bold 20px monospace';ctx.fillText('01 / SUBMARINE NETWORKS / '+modes[current].title.toUpperCase(),20,30,1160);
    ctx.fillStyle='#9ca5c6';ctx.font='12px monospace';ctx.fillText(`${model.records.length} / ${data.records.length} SYSTEMS · OWNERSHIP COLORS · ${t.toFixed(1)} / 24s`,22,55);
    if(!model.records.length){ctx.fillStyle='#f3f1dd';ctx.font='20px monospace';ctx.fillText('No records match these filters.',55,240);}
    else if(current==='map')drawMap(t);else if(current==='length')drawLengths(t,progress);else drawYears(t,progress);
    const legend=[['Telco / consortium','Telco'],['Google','Google'],['Meta','Meta'],['Microsoft','Microsoft'],['Amazon','Amazon'],['Multiple big tech','Multi-tech'],['Unknown','Unknown']];
    if(current!=='years'){ctx.font='10px monospace';legend.forEach(([key,label],i)=>{ctx.fillStyle=OWNERSHIP_COLORS[key];ctx.fillText('■ '+label,23+i*108,484);});}
    else {ctx.font='10px monospace';ctx.fillStyle='#8d91aa';ctx.fillText('■ Unknown status',23,484);}
    ctx.save();ctx.beginPath();ctx.rect(20,500,770,70);ctx.clip();ctx.font='12px monospace';
    const rows=model.lengths.length?model.lengths:model.records,offset=t*40;
    for(let i=0;rows.length&&i<6;i++){const r=rows[(Math.floor(offset/20)+i)%rows.length],y=514+i*20-offset%20;ctx.fillStyle=OWNERSHIP_COLORS[r.group];ctx.fillText(r.name.slice(0,32),22,y);ctx.fillStyle='#dedff2';ctx.fillText(r.length_km===null?'—':format.format(r.length_km)+' km',330,y);ctx.fillText(String(r.year??'—'),450,y);ctx.fillText(r.status,520,y);ctx.fillText(r.group,635,y);}ctx.restore();
    ctx.fillStyle='#101424';ctx.fillRect(810,73,375,500);ctx.fillStyle='#56e0c5';ctx.font='12px monospace';ctx.fillText('JAVASCRIPT / '+current.toUpperCase(),825,95);
    const lines=sourceFor(current).split('\n'),codeOffset=t*23;ctx.save();ctx.beginPath();ctx.rect(821,110,355,450);ctx.clip();ctx.font='12px monospace';
    for(let i=0;i<30;i++){const index=(Math.floor(codeOffset/17)+i)%lines.length,y=129+i*17-codeOffset%17;ctx.fillStyle='#697495';ctx.fillText(String(index+1).padStart(2,'0'),824,y);ctx.fillStyle='#dedff2';ctx.fillText(lines[index],854,y);}ctx.restore();
    ctx.fillStyle='#9ca5c6';ctx.font='10px monospace';ctx.fillText('Local TeleGeography snapshot / movement guides reading, not measured traffic / planned status is as recorded, not verified today.',22,590);ctx.restore();
    if(current!==previousMode||Math.floor(t*5)!==previousUI){previousMode=current;previousUI=Math.floor(t*5);onChange({mode:current,time:t,playing,model,source:sourceFor(current),figure:modes[current].figure});}
  }
  // Use elapsed time rather than frame count; pause when the document is hidden.
  function frame(stamp){raf=requestAnimationFrame(frame);if(last!==null&&stamp-last<35)return;const dt=last===null?0:Math.min(stamp-last,100)/1000;last=stamp;if(playing&&!document.hidden)time=(time+dt)%24;draw();}
  rebuildMap();draw();raf=requestAnimationFrame(frame);
  return {pause(value=true){playing=!value;last=null;previousUI=-1;draw();},seek(value){time=Math.max(0,Math.min(23.999,Number(value)));previousUI=-1;draw();},setMode(value){if(MODES.includes(value)){time=MODES.indexOf(value)*8;last=null;previousUI=-1;draw();}},setFilter(values){filter={...filter,...values};model=buildCableModel(data.records.filter(r=>(!filter.status||r.status===filter.status)&&(!filter.group||r.group===filter.group)&&`${r.name} ${r.owners} ${r.year??''}`.toLowerCase().includes(filter.search.toLowerCase())));rebuildMap();previousUI=-1;draw();return model;},get figureIndex(){return modes[mode()].figure;},get playing(){return playing;},get model(){return model;},destroy(){cancelAnimationFrame(raf);}};
}
