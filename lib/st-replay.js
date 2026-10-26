// Storm replay (kept trial, 10-11; switch RC_FEATURES.stormReplay). Loaded after st-map.js on the Storms screen and
// built on its globals (cur, hail, hitIdx, hitXY, colors, map, overlay, layers, redraw, fitStorm, fmt, ramp, STH, deck).
// Play: a front sweeps the WHOLE map, west edge to east edge, top to bottom, over about 6 s (the hail catalog carries
// no MRMS timing per home, so position stands in for time and the card says so); each hit home lights the instant the
// front crosses it, white for a beat then its radar colour; the homes-hit counter rises in real numbers to the storm's
// own count. Nothing is invented: the set of hit homes and their hail are the storm's own.
// prefers-reduced-motion: no sweep, the end state at once. Esc, a new storm, Clear or the button stop it.
(function(){
  if(!window.RC_FEATURES||!RC_FEATURES.stormReplay) return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DUR=6000, BAND=0.10, FLASH=0.05, END=1.06;   // the front runs a little past the east edge so the last homes finish their flash
  const BLUE=[39,87,230], WHITE=[255,255,255];
  let on=false, t0=0, xs=null, calm=null, calmData=null, repCol=null, raf=0, lit=0, lblWas='', timerStop=null;
  const nav=document.getElementById('nav'), fit=document.getElementById('fit');
  const btn=document.createElement('button'); btn.className='nb only-storm'; btn.id='replay'; btn.setAttribute('aria-pressed','false'); btn.title='Replay the storm across the map';
  const ICON_PLAY='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l10.5-6.5z"/></svg>', ICON_STOP='<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="6.5" width="11" height="11" rx="2"/></svg>';
  btn.innerHTML=ICON_PLAY+'<span>Replay</span>';
  if(fit&&fit.parentNode===nav) nav.insertBefore(btn,fit.nextSibling); else if(nav) nav.appendChild(btn);
  /* the front's readout while it plays, under the big number */
  const lbl=document.querySelector('.stat .only-storm .lbl');

  /* the map's own edges, re-read every frame so the sweep always spans the view (fitStorm may still be flying) */
  function view(){ const b=map.getBounds(); const W=b.getWest(), E=b.getEast(), S=b.getSouth(), N=b.getNorth(); return {W,E:Math.max(E,W+1e-6),S,N}; }
  function prep(){ const n=hitIdx.length; if(!n) return false;
    xs=new Float32Array(n); for(let k=0;k<n;k++) xs[k]=hitXY[k*2];
    /* while it plays the hit homes rest grey until the front reaches them */
    calm=new Uint8Array(colors); for(let k=0;k<n;k++){ const o=hitIdx[k]*4; calm[o]=GREY[0]; calm[o+1]=GREY[1]; calm[o+2]=GREY[2]; calm[o+3]=60; }
    calmData={length:STH.n,attributes:{getPosition:{value:STH.xy,size:2},getFillColor:{value:calm,size:4}}};   // one container: deck uploads it once, not per frame
    repCol=new Uint8Array(n*4); return true; }
  function paintFrame(front){ const n=hitIdx.length, v=view(), span=v.E-v.W; let count=0;
    for(let k=0;k<n;k++){ const o=k*4, p=(xs[k]-v.W)/span;
      if(p>front){ repCol[o+3]=0; continue; } count++;
      const age=front-p, c=ramp(hail[hitIdx[k]]/100);
      if(age<FLASH){ const u=age/FLASH; repCol[o]=Math.round(WHITE[0]+(c[0]-WHITE[0])*u); repCol[o+1]=Math.round(WHITE[1]+(c[1]-WHITE[1])*u); repCol[o+2]=Math.round(WHITE[2]+(c[2]-WHITE[2])*u); repCol[o+3]=255; }
      else { repCol[o]=c[0]; repCol[o+1]=c[1]; repCol[o+2]=c[2]; repCol[o+3]=238; } }
    lit=count; const sn=document.getElementById('s-n'); if(sn) sn.textContent=fmt(count);
    const hn=document.getElementById('hh-n'); if(hn&&!document.body.classList.contains('sel')) hn.textContent=fmt(count); }
  /* the layers while it plays: homes greyed, no columns, the lit homes and a front across the whole view */
  const base=layers;
  layers=function(){ const L=base(); if(!on||!xs) return L;
    const z=map.getZoom(), fpOn=z>=FPZ;
    const out=L.filter(l=>l.id!=='hit').map(l=>l.id==='homes'&&!fpOn?new deck.ScatterplotLayer(Object.assign({},l.props,{data:calmData})):l);
    const v=view(), span=v.E-v.W, front=frontAt(), fx=v.W+front*span, bx=v.W+Math.max(-0.2,front-BAND)*span;
    const pad=(v.N-v.S)*1.5, yA=v.S-pad, yB=v.N+pad;   // well past the top and bottom edges: the line crosses the whole screen, tilted or not
    out.push(new deck.PolygonLayer({id:'replay-band',beforeId:labelId,data:[[[bx,yA],[fx,yA],[fx,yB],[bx,yB]]],getPolygon:d=>d,getFillColor:[...BLUE,14],stroked:false,filled:true,pickable:false,opacity:1}));
    // the front is a 1.5 px band in the same polygon layer type as the swept band (a PathLayer here meant a second,
    // slow shader link the moment Replay started)
    const hw=span/Math.max(1,map.getCanvas().clientWidth)*0.75;
    out.push(new deck.PolygonLayer({id:'replay-front',beforeId:labelId,data:[[[fx-hw,yA],[fx+hw,yA],[fx+hw,yB],[fx-hw,yB]]],getPolygon:d=>d,getFillColor:[...BLUE,120],stroked:false,filled:true,pickable:false,opacity:1}));
    out.push(new deck.ScatterplotLayer({id:'replay-lit',beforeId:labelId,data:{length:hitIdx.length,attributes:{getPosition:{value:hitXY,size:2},getFillColor:{value:repCol,size:4}}},
      radiusUnits:'meters',getRadius:5.4,radiusMinPixels:z<12?1.2:1.7,radiusMaxPixels:5.5,stroked:false,antialiasing:true,pickable:false,opacity:fade}));
    return out; };
  let hold=null;   // capture tooling only: a held front position
  function frontAt(){ if(hold!=null) return hold; if(reduced) return END; return Math.min(END,(performance.now()-t0)/DUR*END); }
  function tick(){ if(!on) return; const front=frontAt(); paintFrame(front); redraw();
    if(front>=END){ finish(); return; } raf=requestAnimationFrame(tick); }
  function start(){ if(on||!cur||!hitIdx||!hitIdx.length||!prep()) return false;
    on=true; btn.classList.add('on'); btn.setAttribute('aria-pressed','true'); btn.innerHTML=ICON_STOP+'<span>Stop</span>';
    try{ map.setPaintProperty('rib','heatmap-opacity',0.1); }catch(e){}
    if(lbl){ lblWas=lbl.textContent; lbl.textContent='homes hit so far, sweeping west to east'; }
    if(map.getZoom()>=FPZ) fitStorm(false);
    t0=performance.now()+(reduced?0:350);
    if(reduced){ paintFrame(END); redraw(); timerStop=setTimeout(finish,1200); } else raf=requestAnimationFrame(tick);
    return true; }
  function finish(){ if(!on) return; on=false; hold=null; cancelAnimationFrame(raf); clearTimeout(timerStop);
    btn.classList.remove('on'); btn.setAttribute('aria-pressed','false'); btn.innerHTML=ICON_PLAY+'<span>Replay</span>';
    try{ map.setPaintProperty('rib','heatmap-opacity',0.32); }catch(e){}
    if(lbl&&lblWas) lbl.textContent=lblWas;
    const sn=document.getElementById('s-n'); if(sn&&cur) sn.textContent=fmt(cur.n);
    xs=null; calm=null; repCol=null; redraw(); if(typeof paintHH==='function') paintHH(); }
  btn.addEventListener('click',()=>{ on?finish():start(); });
  /* a storm change or Clear ends the replay first */
  const _sel=selectStorm; selectStorm=function(){ finish(); return _sel.apply(this,arguments); };
  const _clr=clearStorm; clearStorm=function(){ finish(); return _clr.apply(this,arguments); };
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&on){ finish(); e.stopImmediatePropagation(); } },true);
  window.__replay=()=>start(); window.__replayOn=()=>on; window.__replayLit=()=>lit; window.__replayStop=finish;
  /* capture tooling: hold the front at f (0..END) with the clock stopped, so a slow software GPU can still shoot the sweep */
  window.__replayAt=f=>{ if(!on&&!start()) return false; cancelAnimationFrame(raf); clearTimeout(timerStop); hold=f; paintFrame(f); redraw(); return true; };
})();
