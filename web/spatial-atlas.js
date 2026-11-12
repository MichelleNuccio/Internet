// A spatial storyboard: separate map views overlap as evidence, never as totals.
export async function createSpatialAtlas(canvas, button, status, baseURL) {
  const ctx=canvas.getContext('2d'), root=new URL('../material/piano-03/output/',import.meta.url);
  const $=id=>document.getElementById(id), reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ink='#05051b', paper='#f3f1dd', acid='#deff00', violet='#bdbdff';
  const format=new Intl.NumberFormat('en-US');
  const localNames=new Intl.DisplayNames(['it'],{type:'region'});
  const localName=code=>/^[A-Z]{2}$/.test(code)?localNames.of(code):code;
  let story, records, images, running=!reduced, position=0, previous=null, selected=0, cards=[], open=false, lastUI=-1, returnFocus, lastChapter=-1;
  const panel=$('storyboard');
  let sortKey='amount', sortDirection=-1;
  let lastFrame=0;
  function announcePlay(){
    button.textContent=running?'Pause storyboard Ⅱ':'Resume storyboard ▷';button.setAttribute('aria-pressed',String(running));

  }
  function setRunning(value){running=value;previous=null;announcePlay();}
  button.addEventListener('click',()=>setRunning(!running));
  announcePlay();
  ctx.fillStyle=ink;ctx.fillRect(0,0,1200,600);ctx.fillStyle=acid;ctx.font='24px monospace';ctx.fillText('ASSEMBLING THE EVIDENCE…',35,65);
  try {
    const responses=await Promise.all([fetch(new URL('metadata/storyboard.json',root)),fetch(new URL('metadata/story-records.json',root))]);
    if(responses.some(r=>!r.ok))throw Error('Storyboard data unavailable');
    [story,records]=await Promise.all(responses.map(r=>r.json()));
    images=await Promise.all(story.plates.map(plate=>new Promise((resolve,reject)=>{
      const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Plate '+plate.number+' unavailable'));
      image.src=new URL(plate.preview,root).href;
    })));
  }catch(error){status.textContent='Storyboard unavailable — reload through the local server.';console.error(error);return;}
  const chapterAt=()=>Math.min(story.chapters.length-1,Math.floor(position/8));
  const chapterButtons=[], readingButtons=[], thumbnails=[];
  story.chapters.forEach((chapter,index)=>{
    const b=document.createElement('button');b.type='button';b.textContent=chapter.title;b.addEventListener('click',()=>seek(index*8,true));
    $('story-chapters').append(b);chapterButtons.push(b);
    const readingButton=document.createElement('button');readingButton.type='button';readingButton.textContent=chapter.title;readingButton.addEventListener('click',()=>selectPlate(chapter.plates[0]));$('reading-chapters').append(readingButton);readingButtons.push(readingButton);
  });
  story.plates.forEach(plate=>{
    const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',`${plate.number}. ${plate.title}`);
    const image=document.createElement('img');image.src=new URL(plate.preview,root).href;image.alt='';image.loading='lazy';
    const label=document.createElement('span');label.textContent=String(plate.number).padStart(2,'0')+' / '+plate.title;
    b.append(image,label);b.addEventListener('click',()=>selectPlate(plate.id));$('story-filmstrip').append(b);thumbnails.push(b);
  });
  function filteredRecords(){
    const plate=story.plates[selected], search=$('story-search').value.trim().toLocaleLowerCase();
    return records[plate.scope].filter(r=>(!plate.company||plate.company===r.company)&&(!search||`${r.country} ${r.name} ${localName(r.country)} ${r.company}`.toLocaleLowerCase().includes(search))).sort((a,b)=>{if(a[sortKey]===null)return b[sortKey]===null?0:1;if(b[sortKey]===null)return -1;return typeof a[sortKey]==='number'?(a[sortKey]-b[sortKey])*sortDirection:String(a[sortKey]).localeCompare(String(b[sortKey]))*sortDirection;});
  }
  function renderRecords(){
    const rows=filteredRecords(), body=$('story-records');body.replaceChildren();
    for(const row of rows){
      const tr=document.createElement('tr');
      for(const value of [`${row.name} (${row.country})`,row.company,format.format(row.amount),row.share===null?'—':row.share.toFixed(2)+'%']){
        const td=document.createElement('td');td.textContent=value;tr.append(td);
      }
      body.append(tr);
    }
    $('story-record-count').textContent=rows.length?`${rows.length} records · ${sortKey==='amount'?'IPv4':sortKey==='share'?'share':sortKey==='name'?'country':'organization'} ${sortDirection===1?'ascending':'deascending'}`:'No results. Try a country code or another plate.';
  }
  function showPlate(){
    const plate=story.plates[selected], chapter=story.chapters[plate.chapter];
    $('plate-number').textContent=`EVIDENCE ${String(plate.number).padStart(2,'0')} / 20`;
    $('plate-title').textContent=plate.title;$('plate-image').src=new URL(plate.preview,root).href;$('plate-image').alt=plate.title+' — full map, legend and source notes';
    $('plate-preview').href=new URL(plate.preview,root).href;$('plate-pdf').href=new URL(plate.pdf,root).href;
    $('plate-metric').textContent=plate.id===2?'Monochrome spatial study / no quantity encoding.':chapter.metric;
    $('story-data-note').textContent=plate.dataNote;
    thumbnails.forEach((b,i)=>b.setAttribute('aria-current',String(i===selected)));
    readingButtons.forEach((b,i)=>b.setAttribute('aria-current',String(i===plate.chapter)));
    $('plate-viewport').classList.remove('zoomed');$('map-zoom').setAttribute('aria-pressed','false');$('map-zoom').textContent='Zoom in +';renderRecords();
  }
  function updateUI(force=false){
    const chapter=chapterAt(), second=Math.floor(position*5);
    if(lastChapter!==chapter){lastChapter=chapter;if(story.plates[selected].chapter!==chapter){selected=story.chapters[chapter].featured[0];showPlate();}}
    if(force||second!==lastUI){
      lastUI=second;$('story-position').value=position.toFixed(2);$('story-time').value=`${position.toFixed(1)} / 32s`;
      chapterButtons.forEach((b,i)=>b.setAttribute('aria-current',String(i===chapter)));
      $('story-question').textContent=story.chapters[chapter].question;$('story-reading').textContent=story.chapters[chapter].reading;
      status.textContent=`${story.chapters[chapter].title} / ${running?'in motion':'held for reading'}`;
    }
  }
  function seek(value,pause=false){
    position=Math.max(0,Math.min(story.duration-.001,Number(value)));previous=null;if(pause)setRunning(false);
    const chapter=chapterAt();if(story.plates[selected].chapter!==chapter){selected=story.chapters[chapter].featured[0];showPlate();}
    updateUI(true);
  }
  function selectPlate(index){
    const plate=story.plates[index];if(chapterAt()!==plate.chapter)seek(plate.chapter*8,true);
    selected=index;setRunning(false);$('story-search').value='';showPlate();updateUI(true);
  }
  function togglePanel(value){
    open=value;panel.hidden=!value;document.body.classList.toggle('investigating',value);
    if(value){returnFocus=document.activeElement;setRunning(false);showPlate();panel.focus({preventScroll:true});}
    else if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
    window.dispatchEvent(new CustomEvent('storyboard-toggle',{detail:{open:value}}));
  }
  $('story-close').addEventListener('click',()=>togglePanel(false));
  $('story-search').addEventListener('input',renderRecords);
  document.querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click',()=>{
    const key=b.dataset.sort;sortDirection=sortKey===key?-sortDirection:(key==='amount'||key==='share'?-1:1);sortKey=key;
    document.querySelectorAll('[data-sort]').forEach(control=>{const active=control.dataset.sort===sortKey;control.parentElement.setAttribute('aria-sort',active?(sortDirection===1?'ascending':'descending'):'none');const labels={name:'Country',company:'Organization',amount:'IPv4',share:'Share %'};control.textContent=labels[control.dataset.sort]+(active?(sortDirection===1?' ↑':' ↓'):' ↕');});renderRecords();
  }));
  $('map-zoom').addEventListener('click',()=>{
    const zoomed=$('plate-viewport').classList.toggle('zoomed');$('map-zoom').setAttribute('aria-pressed',String(zoomed));$('map-zoom').textContent=zoomed?'Zoom out −':'Zoom in +';
  });
  $('story-export').addEventListener('click',()=>{
    const quote=value=>{const text=String(value??'');const safe=/^[=+@\-]/.test(text)?"'"+text:text;return '"'+safe.replaceAll('"','""')+'"';};
    const data=[['country_code','country_name','organization','ipv4_addresses','national_share_percent'],...filteredRecords().map(r=>[r.country,r.name,r.company,r.amount,r.share])];
    const blob=new Blob(['\ufeff'+data.map(row=>row.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download=`e-ntanglement-plate-${String(selected+1).padStart(2,'0')}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('story-position').addEventListener('input',e=>seek(e.target.value,true));
  $('story-prev').addEventListener('click',()=>selectPlate((selected+19)%20));
  $('story-next').addEventListener('click',()=>selectPlate((selected+1)%20));
  panel.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();togglePanel(false);return;}
    if(e.key==='Tab'){
      const focusable=[...panel.querySelectorAll('button:not(:disabled),a[href],input')];const first=focusable[0],last=focusable[focusable.length-1];
      if(e.shiftKey&&(document.activeElement===first||document.activeElement===panel)){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}return;
    }
    if(e.target.matches('input'))return;
    if(e.key==='ArrowRight'){e.preventDefault();selectPlate((selected+1)%20);}
    if(e.key==='ArrowLeft'){e.preventDefault();selectPlate((selected+19)%20);}
  });
  function cropMap(image,plate,x,y,w,h){
    // Each source is the verified full PDF preview. Comparisons retain their four panels.
    const sx=image.width*.045, sy=image.height*(plate.comparison?.235:.225), sw=image.width*.91, sh=image.height*.54;
    ctx.drawImage(image,sx,sy,sw,sh,x,y,w,h);
  }
  function mapCard(id,x,y,w,angle,alpha){
    const h=w*.51, plate=story.plates[id];
    cards.push({id,x,y,w,h,angle});ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalAlpha=alpha;
    ctx.fillStyle='#00000070';ctx.fillRect(-w/2+12,-h/2+14,w,h+29);
    ctx.fillStyle=ink;ctx.fillRect(-w/2,-h/2,w,h+29);
    cropMap(images[id],plate,-w/2,-h/2,w,h);
    // Screen blending lets geographic marks overlap without adding their numbers.
    ctx.globalCompositeOperation='screen';ctx.globalAlpha=.18;cropMap(images[id],plate,-w/2,-h/2,w,h);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=alpha;
    ctx.strokeStyle=id===selected?acid:violet;ctx.lineWidth=id===selected?2:1;ctx.strokeRect(-w/2,-h/2,w,h+29);
    ctx.fillStyle=id===selected?acid:paper;ctx.font='12px monospace';ctx.fillText(`${String(plate.number).padStart(2,'0')} / ${plate.title.toUpperCase()}`,12-w/2,h/2+19,w-24);ctx.restore();
  }
  function dataSlip(scope,company,x,y,angle,t,index){
    const data=records[scope].filter(r=>!company||r.company===company);if(!data.length)return;
    const w=310,h=130;ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle=index%2?'#f3f1dd':'#deff00';ctx.fillRect(0,0,w,h);
    ctx.beginPath();ctx.rect(8,8,w-16,h-16);ctx.clip();ctx.fillStyle=ink;ctx.font='11px monospace';
    const offset=t*(index%2?90:130), start=Math.floor(offset/20);
    for(let n=0;n<9;n++){
      const row=data[(start+n)%data.length], yy=15+n*20-offset%20;
      ctx.fillText(`${row.country} / ${row.company.slice(0,12)}`,8,yy);ctx.fillText(format.format(row.amount),190,yy);
    }ctx.restore();
  }
  function draw(time){
    requestAnimationFrame(draw);
    // Uploading 1200x600 textures does not need more than 30 frames per second.
    if(time-lastFrame<30)return;lastFrame=time;
    if(previous!==null&&running&&!document.hidden)position=(position+Math.min(time-previous,100)/1000)%story.duration;previous=time;
    const t=position, chapter=story.chapters[chapterAt()], phase=t%8;
    const ids=chapter.featured.includes(selected)||story.plates[selected].chapter!==chapterAt()?chapter.featured:[...chapter.featured.slice(0,-1),selected];
    cards=[];ctx.fillStyle=ink;ctx.fillRect(0,0,1200,600);
    ctx.strokeStyle='#31315b';ctx.lineWidth=.5;
    for(let x=-30;x<1240;x+=60){ctx.beginPath();ctx.moveTo(x+(phase*14)%60,0);ctx.lineTo(x+(phase*14)%60,600);ctx.stroke();}
    // Different views drift past each other, rather than nesting copies of one map.
    ids.forEach((id,i)=>{
      const x=240+(i%2)*500+Math.sin(t*.9+i*1.8)*100;
      const y=170+Math.floor(i/2)*210+Math.cos(t*.7+i)*55;
      const w=560+Math.sin(t*.6+i)*80;
      mapCard(id,x,y,w,Math.sin(t*.5+i)*.09,i===0?.88:.96);
    });
    const primary=story.plates[ids[0]];
    dataSlip(primary.scope,primary.company,45+(Math.sin(t*.8)+1)*310,140+(Math.cos(t*.7)+1)*100,Math.sin(t)*.055,t,0);
    const secondary=story.plates[ids[ids.length-1]];
    dataSlip(secondary.scope,secondary.company,580+Math.cos(t*.6)*160,290+Math.sin(t*.9)*130,-.08,t,1);
    ctx.fillStyle=ink;ctx.fillRect(0,0,1200,52);ctx.fillRect(0,558,1200,42);
    ctx.fillStyle=acid;ctx.font='bold 22px monospace';ctx.fillText(chapter.title,20,32);ctx.font='12px monospace';ctx.fillStyle=paper;ctx.fillText(`${t.toFixed(1)} / 32s   ${running?'IN MOTION':'HELD / SELECT A MAP'}`,865,31);
    ctx.font='12px monospace';ctx.fillText(chapter.question.toUpperCase(),20,581);ctx.fillStyle=violet;ctx.fillText('SEPARATE VIEWS / NOT ADDITIVE QUANTITIES',810,581);
    updateUI();
  }
  function hit(x,y){
    for(let i=cards.length-1;i>=0;i--){const c=cards[i],dx=x-c.x,dy=y-c.y,px=dx*Math.cos(c.angle)+dy*Math.sin(c.angle),py=-dx*Math.sin(c.angle)+dy*Math.cos(c.angle);if(Math.abs(px)<c.w/2&&py>-c.h/2&&py<c.h/2+29)return c.id;}return null;
  }

  selected=0;showPlate();updateUI(true);requestAnimationFrame(draw);
  return {inspectAt(u,v){const id=hit(u*1200,(1-v)*600);if(id!==null)selectPlate(id);togglePanel(true);},seek,setRunning,get position(){return position;},get selected(){return selected;}};
}
