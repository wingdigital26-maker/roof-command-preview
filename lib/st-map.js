// Storm Map: every real home in the roofer's cities (STH) drawn with deck.gl interleaved into MapLibre; storms from the
// app catalog (ST). Camera, nav group, search, record panel, phone sheet. Timings follow st-INTERACTION.md.
applyRoofer(rooferKey());   // ?roofer= / rc-state pick (lib/brand.js); the homes and storms below are the loaded data's
const MOB=innerWidth<600, Q=new URLSearchParams(location.search);
const fmt=n=>n.toLocaleString();
const STAGES=[['new','Homes hit'],['called','Contacted'],['inspection','Inspection'],['proposal','Proposal'],['won','Won']];
const STAGE_LABEL={new:'New hit, not yet contacted',called:'Contacted',inspection:'Inspection booked',proposal:'Proposal sent',won:'Won'};
const OWNER=activeRoofer().owner;
// Jackson's own data (lib/brand.js dataRoot = Collin + Denton CAD, Texas): full CAD address lines, subdivision,
// owner names (RC.owner), city buttons and the home list.
const ROOF=activeRoofer(), DFW=true;
const AREA_WORD='the service area';
if(DFW){ const lt=document.getElementById('load-t'); if(lt) lt.textContent='Loading every home in '+ROOF.area; }
document.getElementById('greet').textContent=RC.greeting()+', '+OWNER;
const hid=i=>'m'+i;                              // one id per home, shared with Home and Daily 50 through RC
const inFrame=window.self!==window.top;
if(inFrame) document.body.classList.add('embedded');
// About Roof Command (the opening, held on its last beat) is a shell route (#/opening/about): the link shows only inside the shell
{ const a=document.getElementById('about'); if(a&&inFrame){ a.hidden=false; a.addEventListener('click',()=>RC.go('opening',{about:'1'})); } }
function postRoute(iso){ if(inFrame) try{ parent.postMessage({type:'route',screen:'storm',params:iso?{iso}:{}},location.origin); }catch(e){} }
let route=null;                                  // {idx:[home indexes in visiting order], path:[[lon,lat]...], mi}
const EASE=t=>1-Math.pow(1-t,2);                 // site: ease-out, no overshoot
const FPZ=14.6;                                  // footprints from here in; dots for homes without an outline
let LAST=null, RECENT=false;
let cur=null, hail=null, sel=-1, hoverI=-1, marker=null, camBefore=null, region='all', fade=0, fpItems=[], fpBox=null, tilt3d=true;
// crossfade between storms: the layers of the storm you were on stay up and fade out (prev, 1-xf) while the new one fades in (xf)
let xf=1, prev=null, xfRaf=0;
const XF_MS=450;
const daysSince=s=>Math.round((ST.today-s.t)/864e5);
// a storm's short date, with the year whenever it is not this year ("Jun 2" this year, "Aug 12, 2025" before)
const yd=s=>s?(s.iso.slice(0,4)===String(new Date(ST.today).getUTCFullYear())?s.d:s.d+', '+s.iso.slice(0,4)):'';
const tickH=s=>Math.min(44,MOB?6+Math.sqrt(s.n)*0.22:8+Math.sqrt(s.n)*0.3);
if(MOB){
  const body=document.getElementById('sheetbody'); body.appendChild(document.getElementById('peek')); body.appendChild(document.getElementById('stat')); body.appendChild(document.getElementById('hh')); body.appendChild(document.querySelector('.pipe'));
  const foot=document.createElement('div'); foot.className='sheet-foot'; foot.textContent=document.getElementById('ctag').textContent; body.appendChild(foot);
  document.getElementById('chips').style.display='flex'; document.getElementById('sheet').style.display='flex'; document.getElementById('cta').style.display='flex'; document.getElementById('ctafade').style.display='block'; }

// ---------- colours ----------
const RAMP=[[1.0,[199,212,250]],[1.2,[157,180,245]],[1.4,[111,143,238]],[1.6,[39,87,230]],[1.8,[31,71,201]],[2.1,[19,48,143]]];
function ramp(h){ if(cur){ const mx=Math.max(1.15,cur.max); h=1+(Math.min(h,mx)-1)/(mx-1)*1.1; } if(h<=RAMP[0][0]) return RAMP[0][1]; for(let k=1;k<RAMP.length;k++){ if(h<=RAMP[k][0]){ const [a,ca]=RAMP[k-1],[b,cb]=RAMP[k]; const t=(h-a)/(b-a); return [0,1,2].map(j=>Math.round(ca[j]+(cb[j]-ca[j])*t)); } } return RAMP[RAMP.length-1][1]; }
const GREY=[163,170,186], INK=[11,16,32];
let fpMaskOf=null;                              // fpItems the point colours were last masked for
// deck.gl uploads every attribute again whenever the data object is a new one, so the point and column data containers
// are built once per storm (and once per footprint mask) and handed to every redraw by reference: a fade, a storm swap
// or a moveend then only changes uniforms (opacity, radius), not 200k points of geometry
let homesData=null, homesDataFp=null, hitData=null;
const container=(n,cols)=>({length:n,attributes:{getPosition:{value:STH.xy,size:2},getFillColor:{value:cols,size:4}}});
// a home's point hides only once its own outline is actually drawn, so zooming in never leaves a gap
function pointColors(){ if(fpMaskOf===fpItems) return homesDataFp; colorsFp.set(colors); for(let j=0;j<fpItems.length;j++) colorsFp[fpItems[j].i*4+3]=0; fpMaskOf=fpItems; homesDataFp=container(STH.n,colorsFp); return homesDataFp; }
let colors=null, colorsFp=null, hitIdx=null, hitXY=null, hitEl=null, hitCol=null, bands=null, ribGeo=null, denGeo=null;
// everything a storm needs on screen (point colours, hit columns, swath ribbon, density hits, hail bands) is computed once
// per storm and kept, so coming back to a storm on the timeline costs nothing but the crossfade. Six storms kept (about 1.3 MB each).
const PRODUCTS=new Map(), PRODUCT_CAP=6;
function buildColors(){ const key=cur?cur.iso:'calm'; let P=PRODUCTS.get(key);
  if(!P){ P=computeProducts(); PRODUCTS.delete(key); PRODUCTS.set(key,P); if(PRODUCTS.size>PRODUCT_CAP){ const old=PRODUCTS.keys().next().value; if(old!=='calm') PRODUCTS.delete(old); else { const k2=[...PRODUCTS.keys()][1]; PRODUCTS.delete(k2); } } }
  colors=P.colors; hitIdx=P.hitIdx; hitXY=P.hitXY; hitEl=P.hitEl; hitCol=P.hitCol; hitData=P.hitData; homesData=P.homesData; bands=P.bands; ribGeo=P.ribGeo; denGeo=P.denGeo;
  if(!colorsFp) colorsFp=new Uint8Array(STH.n*4); fpMaskOf=null; homesDataFp=null; }
function computeProducts(){ const n=STH.n; const cols=new Uint8Array(n*4); const hits=[];
  const res=STH.type, H=hail;   // local refs: this loop runs 270k times
  for(let i=0;i<n;i++){ const o=i*4; const h=H?H[i]/100:0; const hit=H&&h>=1&&(res[i]&127)<=4;
    let c=GREY, a=H?70:165; if(hit){ c=ramp(h); a=235; hits.push(i); }
    cols[o]=c[0];cols[o+1]=c[1];cols[o+2]=c[2];cols[o+3]=a; }
  const xy=new Float32Array(hits.length*2), el=new Float32Array(hits.length), hc=new Uint8Array(hits.length*4);
  hits.forEach((i,k)=>{ xy[k*2]=STH.lon(i); xy[k*2+1]=STH.lat(i); const h=hail[i]/100; el[k]=10+Math.min(80,(h-1)/Math.max(0.15,cur.max-1)*42); const c=ramp(h); hc[k*4]=c[0];hc[k*4+1]=c[1];hc[k*4+2]=c[2];hc[k*4+3]=240; });
  return {colors:cols,hitIdx:hits,hitXY:xy,hitEl:el,hitCol:hc,homesData:container(n,cols),
    hitData:{length:hits.length,attributes:{getPosition:{value:xy,size:2},getElevation:{value:el,size:1},getFillColor:{value:hc,size:4}}},
    bands:H?ST.bands(H):null, ribGeo:H?ribbonFor(hits):EMPTY, denGeo:densityFor(hits)}; }
// warm a storm's products off the main path (its hail is already in memory or on its way): the neighbours on the timeline
function warmStorm(s){ if(!s||PRODUCTS.has(s.iso)) return; STH.hailFor(s).then(h=>{ if(PRODUCTS.has(s.iso)||!STH.xy) return; const run=()=>{ if(PRODUCTS.has(s.iso)) return;
  const c0=cur, h0=hail; const t=performance.now(); try{ cur=s; hail=h; const P=computeProducts(); PRODUCTS.set(s.iso,P); } finally { cur=c0; hail=h0; } if(window.__perf) window.__perf['warm:'+s.iso]=Math.round(performance.now()-t); };
  (window.requestIdleCallback||(f=>setTimeout(f,120)))(run); }); }

// ---------- density: every home binned into 380 m hexagons (the volume of the housing stock, readable at city zoom) ----------
// Built once from the real positions. Per storm, each cell also carries k = its hit homes, so a storm's swath reads as the share of
// each cell's homes that took 1 inch hail. A MapLibre fill layer (tessellated once in its worker) fades out by zoom as the dots take over.
const DEN={R:380,cells:null,cellOf:null,lon0:0,lat0:0,kx:1,ky:1};
function buildDensity(){ const n=STH.n, xy=STH.xy; const box=STH.cat.box; DEN.lon0=box[0]; DEN.lat0=box[1]; DEN.ky=110540; DEN.kx=111320*Math.cos((box[1]+box[3])/2*Math.PI/180);
  const R=DEN.R, S3=Math.sqrt(3); const cellOf=new Int32Array(n); const map_={}; const cells=[];
  for(let i=0;i<n;i++){ if((STH.type[i]&127)>4){ cellOf[i]=-1; continue; } const x=(xy[i*2]-DEN.lon0)*DEN.kx, y=(xy[i*2+1]-DEN.lat0)*DEN.ky;
    // flat-top hex grid, circumradius R: pixel to axial, then cube rounding
    const qf=(2/3*x)/R, rf=(-1/3*x+S3/3*y)/R; let q=Math.round(qf), r=Math.round(rf), s=Math.round(-qf-rf); const dq=Math.abs(q-qf), dr=Math.abs(r-rf), ds=Math.abs(s+qf+rf);
    if(dq>dr&&dq>ds) q=-r-s; else if(dr>ds) r=-q-s;
    const key=q*100000+r; let c=map_[key]; if(c===undefined){ c=cells.length; map_[key]=c; cells.push({q,r,n:0}); } cells[c].n++; cellOf[i]=c; }
  cells.forEach(c=>{ const cx=R*1.5*c.q, cy=R*(S3/2*c.q+S3*c.r); const ring=[]; for(let k=0;k<6;k++){ const a=Math.PI/3*k; ring.push([DEN.lon0+(cx+R*0.985*Math.cos(a))/DEN.kx, DEN.lat0+(cy+R*0.985*Math.sin(a))/DEN.ky]); } ring.push(ring[0]); c.ring=ring; });
  DEN.cells=cells; DEN.cellOf=cellOf; }
function densityFor(hits){ if(!DEN.cells) return EMPTY; const C=DEN.cells, k=new Int32Array(C.length); for(let j=0;j<hits.length;j++){ const c=DEN.cellOf[hits[j]]; if(c>=0) k[c]++; }
  return {type:'FeatureCollection',features:C.map((c,j)=>({type:'Feature',properties:{n:c.n,k:k[j]},geometry:{type:'Polygon',coordinates:[c.ring]}}))}; }
function ribbonFor(hits){ const n=hits.length, step=Math.max(1,Math.floor(n/7000)); const f=[]; for(let k=0;k<n;k+=step){ const i=hits[k]; f.push({type:'Feature',properties:{w:Math.min(1,(hail[i]/100-0.9)/Math.max(0.3,cur.max-0.9))},geometry:{type:'Point',coordinates:[STH.lon(i),STH.lat(i)]}}); } return {type:'FeatureCollection',features:f}; }

// ---------- map ----------
// the map opens over the roofer's home city (Plano, lib/brand.js center)
const START=MOB?{center:ROOF.center,zoom:11.2,pitch:40,bearing:15}:{center:ROOF.center,zoom:11.8,pitch:45,bearing:20};
// coming back in the same session (or after a reload) keeps the camera where the user left it
const CAM=(()=>{ if(Q.get('storm')||Q.get('recent')) return null; try{ return JSON.parse(sessionStorage.getItem('st-cam')||'null'); }catch(e){ return null; } })();
const map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/positron',...START,...(CAM||{}),attributionControl:{compact:true},antialias:true,preserveDrawingBuffer:true,maxPitch:62,fadeDuration:200});
map.scrollZoom.setWheelZoomRate(1/520); map.scrollZoom.setZoomRate(1/140); map.dragRotate.enable(); map.touchZoomRotate.enableRotation(); map.keyboard.disable();
let overlay=null, labelId=null, gen=0, hideHomes=false, warm=true, warmStage=0, routeShown=null;   // warm: an invisible column layer compiles its program a few frames into the opening fade (warmStage)
const EMPTY={type:'FeatureCollection',features:[]};
function layers(){ if(!STH.xy||hideHomes) return []; const z=map.getZoom(); const fpOn=z>=FPZ; const storm=!!hail;
  const L=[]; const colR=z<12.5?11:z<13.5?8.5:6.5, colEl=z<12.5?2.2:z<13.5?1.5:1;
  // the storm you were on, fading out under the new one (same geometry containers it had, so nothing is re-uploaded)
  if(prev&&xf<1){ L.push(new deck.ScatterplotLayer({id:'homes-prev',beforeId:labelId,data:prev.homes,radiusUnits:'meters',getRadius:prev.storm?4.6:4.2,radiusMinPixels:z<12?0.9:1.3,radiusMaxPixels:4.5,stroked:false,antialiasing:true,pickable:false,opacity:fade*(1-xf)}));
    if(prev.storm&&prev.hit&&prev.hit.length) L.push(new deck.ColumnLayer({id:'hit-prev',beforeId:labelId,data:prev.hit,diskResolution:4,radius:colR,angle:45,extruded:true,elevationScale:colEl,radiusUnits:'meters',pickable:false,opacity:fade*0.96*(1-xf),material:{ambient:0.62,diffuse:0.5,shininess:12,specularColor:[255,255,255]}})); }
  L.push(new deck.ScatterplotLayer({id:'homes',beforeId:labelId,data:fpOn&&fpItems.length?pointColors():homesData,
    radiusUnits:'meters',getRadius:storm?4.6:4.2,radiusMinPixels:z<12?0.9:1.3,radiusMaxPixels:4.5,stroked:false,antialiasing:true,pickable:true,autoHighlight:true,highlightColor:[39,87,230,255],opacity:fade*xf,
    onHover:info=>deckHover(info.index,info,fpOn),onClick:info=>{ if(info.index>=0&&!(fpOn&&fpSent.has(info.index))) selectHome(info.index,true); return true; }}));
  if(storm&&hitIdx.length&&!(fpOn&&fpItems.length)) L.push(new deck.ColumnLayer({id:'hit',beforeId:labelId,data:hitData,
    diskResolution:4,radius:colR,angle:45,extruded:true,elevationScale:colEl,radiusUnits:'meters',pickable:true,opacity:fade*0.96*xf,material:{ambient:0.62,diffuse:0.5,shininess:12,specularColor:[255,255,255]},
    onHover:info=>deckHover(info.index>=0?hitIdx[info.index]:-1,info,fpOn),onClick:info=>{ if(info.index>=0) selectHome(hitIdx[info.index],true); return true; }}));
  if(warm&&warmStage>=1){ const p0=[STH.lon(0),STH.lat(0)];
    L.push(new deck.ColumnLayer({id:'warm-col',data:[0],getPosition:()=>p0,getElevation:1,getFillColor:[0,0,0,0],diskResolution:4,radius:1,extruded:true,radiusUnits:'meters',opacity:0,pickable:false})); }
  if(route){ L.push(new deck.ScatterplotLayer({id:'stops',data:route.idx,getPosition:i=>[STH.lon(i),STH.lat(i)],getFillColor:[255,255,255,255],getLineColor:[...INK,255],stroked:true,lineWidthUnits:'pixels',getLineWidth:2,radiusUnits:'pixels',getRadius:6,opacity:fade,pickable:true,onClick:info=>{ if(info.object!=null) selectHome(info.object,true); return true; }})); }
  if(sel>=0&&!(fpOn&&STH.hasFp(sel))) L.push(new deck.ScatterplotLayer({id:'sel',beforeId:labelId,data:[sel],getPosition:i=>[STH.lon(i),STH.lat(i)],getFillColor:[...INK,255],radiusUnits:'meters',getRadius:7,radiusMinPixels:3.5,radiusMaxPixels:8,opacity:1}));
  return L; }
function redraw(){ if(overlay) overlay.setProps({layers:layers()}); fpFade(); routeSync(); }
// the route line is a MapLibre line layer (its line program is already compiled for the roads): a deck PathLayer here cost
// a 0.3 to 0.7 s shader link the first time it drew, which the opening used to pay up front
function routeSync(){ const src=map.getSource&&map.getSource('route'); if(!src||routeShown===route) return; routeShown=route;
  src.setData(route?{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:route.path}}:EMPTY); }
// a deck miss while the outlines are up waits a tick: MapLibre reports the outline under the cursor in the same event, either side of deck
function deckHover(i,info,fpOn){ if(i>=0||!fpOn){ hover(i,info); return; } setTimeout(()=>{ if(fpHover<0&&hoverI>=0) hover(-1,info); },0); }

// ---------- roof outlines: a MapLibre fill-extrusion layer (source 'fp') ----------
// Outlines used to be a deck polygon layer rebuilt from every outline in the box: each rebuild (every tile landing,
// every pan out of the box) tessellated tens of thousands of extruded polygons on the main thread, a 0.3 to 5 s
// freeze. MapLibre tessellates GeoJSON in its worker and keeps it per tile, so outlines are sent once (per footprint
// tile, as it lands, with updateData) and a pan or zoom costs the main thread nothing. Hail per home and the picked
// home ride on feature state; the storm's colour ramp and heights are paint expressions set once per storm.
const fpSent=new Set();   // home indexes whose outline the source already holds (the whole session, capped below)
let fpHover=-1, fpSel=-1, fpFadeSet=-1, fpReady=false, fpHot=new Set();   // fpHot: outlines carrying a hail state right now
const FP_CAP=90000;       // outlines kept in the worker before the set is rebuilt from the current box
const fpH=['coalesce',['feature-state','h'],0];
const rgb=c=>`rgb(${c[0]},${c[1]},${c[2]})`;
// the same ramp as ramp(): h normalised to 1..2.1 over the storm's max, piecewise linear through RAMP
function fpPaint(){ if(!fpReady) return; const mx=cur?Math.max(1.15,cur.max):1.15, d=Math.max(0.15,(cur?cur.max:1.15)-1);
  const hn=['+',1,['*',['/',['-',['min',fpH,mx],1],mx-1],1.1]];
  const stops=[]; RAMP.forEach(([t,c])=>{ stops.push(t,rgb(c)); });
  const calm=rgb([207,212,221]);
  const color=['case',['boolean',['feature-state','sel'],false],rgb(INK),['boolean',['feature-state','hov'],false],'rgb(39,87,230)',cur?['case',['>=',fpH,1],['interpolate',['linear'],hn,...stops],calm]:calm];
  const base=['+',4.2,['*',['%',['*',['get','i'],7],5],0.7]];
  const height=cur?['case',['>=',fpH,1],['+',9,['min',60,['*',['/',['-',fpH,1],d],30]]],base]:base;
  map.setPaintProperty('fp','fill-extrusion-color',color); map.setPaintProperty('fp','fill-extrusion-height',height); }
function fpFade(){ if(!fpReady||fpFadeSet===fade) return; fpFadeSet=fade; map.setPaintProperty('fp','fill-extrusion-opacity',fade*0.97); }
function fpFeature(f){ return {type:'Feature',id:f.i,properties:{i:f.i},geometry:{type:'Polygon',coordinates:[f.ring.concat([f.ring[0]])]}}; }
// hail at a home as feature state: only hit homes (1 in+) carry one, the rest read as 0 in the expressions, so a storm
// change touches a few thousand outlines, not every outline the source holds
function fpHail(i,on){ map.setFeatureState({source:'fp',id:i},{h:on?hail[i]/100:0}); if(on) fpHot.add(i); else fpHot.delete(i); }
// the outlines in the current box that the source does not hold yet go to the worker nearest first, a slice per frame
// (perf 10-15: MapLibre serialises the GeoJSON on the main thread, 150 to 500 ms for one zoom's worth of outlines in one
// message; a slice is kept near 12 ms)
const fpQueued=new Set(); let fpQueue=[], fpQRaf=0, fpPer=0.02;   // fpPer: measured ms per outline
function fpSync(){ const src=fpReady&&map.getSource('fp'); if(!src) return;
  if(fpSent.size>FP_CAP){ fpSent.clear(); fpHot.clear(); fpQueued.clear(); fpQueue=[]; src.setData(EMPTY); }
  const add=[]; for(let j=0;j<fpItems.length;j++){ const f=fpItems[j]; if(fpSent.has(f.i)||fpQueued.has(f.i)) continue; fpQueued.add(f.i); add.push(f); }
  if(!add.length) return;
  const c=map.getCenter(), k=Math.cos(c.lat*Math.PI/180), d2=f=>{ const p=f.ring[0], x=(p[0]-c.lng)*k, y=p[1]-c.lat; return x*x+y*y; };
  fpQueue=fpQueue.concat(add).sort((a,b)=>d2(a)-d2(b));
  if(!fpQRaf) fpDrain(); }
function fpDrain(){ fpQRaf=0; const src=fpReady&&map.getSource('fp'); if(!src||!fpQueue.length) return;
  const n=Math.max(150,Math.min(fpQueue.length,Math.round(12/fpPer))), part=fpQueue.splice(0,n), t0=performance.now();
  const add=part.map(f=>{ fpQueued.delete(f.i); fpSent.add(f.i); return fpFeature(f); });
  src.updateData({add}); fpPer=Math.max(0.002,(performance.now()-t0)/add.length);
  if(hail) add.forEach(f=>{ if(hail[f.id]>=100) fpHail(f.id,true); }); if(fpSel>=0&&fpSent.has(fpSel)) map.setFeatureState({source:'fp',id:fpSel},{sel:true});
  if(fpQueue.length) fpQRaf=requestAnimationFrame(fpDrain); }
// a storm picked or cleared: the hit outlines the source holds get their hail, the ones that were hit before lose it
function fpStorm(){ if(!fpReady) return; fpPaint(); const next=new Set(); if(hail) fpSent.forEach(i=>{ if(hail[i]>=100) next.add(i); });
  [...fpHot].forEach(i=>{ if(!next.has(i)) fpHail(i,false); }); next.forEach(i=>fpHail(i,true)); }
function fpSelect(i){ if(!fpReady) { fpSel=i; return; } if(fpSel>=0) map.setFeatureState({source:'fp',id:fpSel},{sel:false}); fpSel=i; if(i>=0) map.setFeatureState({source:'fp',id:i},{sel:true}); }
// each deck program links synchronously on its first draw (luma.gl 9.0 reads the program's attributes right after
// linkProgram, which waits for the driver): linking the homes, column and path programs in one frame was a single
// 0.6 to 1.6 s task on Storms open. Now the homes link on the first frame and the column a few frames later, each its
// own task. The path program (the slowest link, 0.35 to 0.7 s) is no longer used: the route is a MapLibre line and the
// Replay front a thin polygon.
function fadeIn(){ const t0=performance.now(); let first=true, frame=0; const step=()=>{ fade=Math.min(1,(performance.now()-t0)/700); fade=EASE(fade); frame++; if(frame===3){ warmStage=1; if(window.__perf) window.__perf.warmColAt=Math.round(performance.now()); } const a=performance.now(); if(first&&window.__perf) window.__perf.firstDrawAt=Math.round(a); redraw(); if(first){ first=false; if(window.__perf) window.__perf.firstDraw=Math.round(performance.now()-a); } if(fade<1||frame<6) requestAnimationFrame(step); else { warm=false; redraw(); window.__ready=true; } }; requestAnimationFrame(step); }
function viewBBox(){ const W=innerWidth,H=innerHeight; const pts=[[0,0],[W,0],[0,H],[W,H],[W/2,0],[W/2,H],[0,H/2],[W,H/2]].map(p=>map.unproject(p));
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9; pts.forEach(p=>{ x0=Math.min(x0,p.lng);x1=Math.max(x1,p.lng);y0=Math.min(y0,p.lat);y1=Math.max(y1,p.lat); });
  const px=(x1-x0)*0.15, py=(y1-y0)*0.15; return [x0-px,y0-py,x1+px,y1+py]; }
const contains=(a,b)=>a&&b[0]>=a[0]&&b[1]>=a[1]&&b[2]<=a[2]&&b[3]<=a[3];
function refreshFp(force){ if(map.getZoom()<FPZ){ if(fpItems.length){ fpItems=[]; fpBox=null; } return; } const bb=viewBBox(); if(!force&&contains(fpBox,bb)) return;
  const wide=[bb[0]-(bb[2]-bb[0])*0.4,bb[1]-(bb[3]-bb[1])*0.4,bb[2]+(bb[2]-bb[0])*0.4,bb[3]+(bb[3]-bb[1])*0.4];
  // tiles arriving later always re-read the CURRENT box (no generation gate: a storm pick used to cancel this and leave holes)
  const r=STH.footprints(wide,fpArrived); fpItems=r.items; fpBox=wide; fpSync(); }
// tiles land one by one; fold them into one rebuild per 150 ms so the outlines are tessellated once, not once per tile
let fpTimer=null;
function fpArrived(){ if(fpTimer) return; fpTimer=setTimeout(()=>{ fpTimer=null; if(!fpBox||map.getZoom()<FPZ) return; fpItems=STH.footprints(fpBox,fpArrived).items; fpSync(); redraw(); },150); }
map.on('load',()=>{
  map.getStyle().layers.forEach(l=>{ try{
    if(l.type==='background') map.setPaintProperty(l.id,'background-color','#E3E6EC');
    if(l.type==='fill' && /water/.test(l.id)) map.setPaintProperty(l.id,'fill-color','#CDD3DC');
    else if(l.type==='fill' && /landuse|park|wood|grass|residential/.test(l.id)) map.setPaintProperty(l.id,'fill-color','#E8EBF0');
    else if(l.type==='fill') map.setPaintProperty(l.id,'fill-opacity',0.5);
    if(l.type==='line' && /road|highway|street|bridge|tunnel|path|rail/.test(l.id)) map.setPaintProperty(l.id,'line-color','#FFFFFF');
    if(l.type==='line' && /boundary|admin/.test(l.id)) map.setPaintProperty(l.id,'line-color','#C9CED8');
    if(l.type==='symbol' && /poi|housenum|shield|oneway|airport|transit|station|ferry/.test(l.id)) { map.setLayoutProperty(l.id,'visibility','none'); return; }
    // place, area, water and street names stay on (they used to vanish once this restyle ran because city and town labels
    // carry a dot icon); only the dot goes, the name stays
    if(l.type==='symbol' && l.layout && l.layout['icon-image']) { map.setLayoutProperty(l.id,'icon-image',''); }
    if(l.type==='symbol') { if(!labelId) labelId=l.id; try{ map.setPaintProperty(l.id,'text-color','#737B8F');map.setPaintProperty(l.id,'text-opacity',0.75); map.setPaintProperty(l.id,'text-halo-color','#ECEEF2'); }catch(e){} }
    if(/building/.test(l.id)) map.setLayoutProperty(l.id,'visibility','none');
  }catch(e){} });
  // density hexagons: the housing stock as a whole (grey by homes per cell); in a storm the hit cells turn blue by the share hit
  map.addSource('den',{type:'geojson',data:EMPTY,tolerance:0.1});
  map.addLayer({id:'den',type:'fill',source:'den',maxzoom:13.6,paint:{
    'fill-color':['case',['>',['get','k'],0],['interpolate',['linear'],['/',['get','k'],['max',1,['get','n']]],0.02,'rgb(199,212,250)',0.35,'rgb(111,143,238)',0.8,'rgb(39,87,230)'],
      ['interpolate',['linear'],['get','n'],1,'rgb(226,229,235)',40,'rgb(204,208,218)',160,'rgb(176,182,197)',400,'rgb(146,154,176)']],
    'fill-opacity':['interpolate',['linear'],['zoom'],8,0.6,11,0.44,12.4,0.24,13.4,0],'fill-opacity-transition':{duration:300},'fill-antialias':false}},labelId);
  // two swath ribbons (a / b): a storm change writes the new swath into the idle one and crossfades their opacity
  const RIBP={'heatmap-weight':['get','w'],'heatmap-intensity':['interpolate',['linear'],['zoom'],9,0.2,12,0.4,14.5,0.6],'heatmap-radius':['interpolate',['linear'],['zoom'],9,14,12,30,14,56],'heatmap-opacity':0,'heatmap-opacity-transition':{duration:XF_MS},
    'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(39,87,230,0)',0.15,'rgba(39,87,230,0.08)',0.4,'rgba(39,87,230,0.18)',0.7,'rgba(39,87,230,0.3)',1,'rgba(31,71,201,0.4)']};
  ['rib','rib-b'].forEach(id=>{ map.addSource(id,{type:'geojson',data:EMPTY}); map.addLayer({id,type:'heatmap',source:id,paint:RIBP},labelId); });
  map.setLight({anchor:'map',position:[1.5,200,38],color:'#FFFFFF',intensity:0.42});
  map.addSource('fp',{type:'geojson',data:EMPTY,buffer:16,tolerance:0.2});
  map.addLayer({id:'fp',type:'fill-extrusion',source:'fp',minzoom:FPZ,paint:{'fill-extrusion-opacity':0,'fill-extrusion-opacity-transition':{duration:0},'fill-extrusion-vertical-gradient':true,'fill-extrusion-color':'rgb(207,212,221)','fill-extrusion-height':4.2}},labelId);
  fpReady=true; fpPaint();
  // a hovered house lights up blue and the cursor is a pointer: every house is a click (or a tap) from its card
  const fpHov=id=>{ if(fpHover===id) return; if(fpHover>=0) map.setFeatureState({source:'fp',id:fpHover},{hov:false}); fpHover=id; if(id>=0) map.setFeatureState({source:'fp',id},{hov:true}); };
  map.on('mousemove','fp',e=>{ const f=e.features&&e.features[0]; if(!f) return; fpHov(f.id); hover(f.id,{x:e.point.x,y:e.point.y}); });
  map.on('mouseleave','fp',()=>{ fpHov(-1); hover(-1); });
  map.on('click','fp',e=>{ const f=e.features&&e.features[0]; if(f) selectHome(f.id,true); });
  map.addSource('route',{type:'geojson',data:EMPTY}); map.addLayer({id:'route',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'rgba(11,16,32,0.9)','line-width':3}});
  overlay=new deck.MapboxOverlay({interleaved:true,layers:[]}); map.addControl(overlay);
  // a drag is not a hover (perf 10-15): deck skips its hover pick while a button is held, but the interleaved overlay's
  // events carry no button flags, so every drag frame ran a picking pass over every home plus a readPixels GPU stall
  // (0.5 s at a time mid-pan on this laptop). While the map moves (drag, wheel, fly) the last hover waits for moveend.
  try{ const dk=overlay._deck, pm=dk&&dk._onPointerMove; let waiting=null;
    if(pm){ dk._onPointerMove=e=>{ if(e&&e.type==='pointermove'){ const o=e.srcEvent&&e.srcEvent.originalEvent; if((o&&o.buttons)||map.isMoving()){ waiting=e; return; } } waiting=null; pm(e); };
      map.on('moveend',()=>{ const e=waiting; waiting=null; if(e) pm(e); }); } }catch(e){}
  const m=document.createElement('div'); m.className='marker'; marker=new maplibregl.Marker({element:m}).setLngLat([0,0]).addTo(map);
  requestAnimationFrame(()=>document.querySelectorAll('.rv').forEach(el=>el.classList.add('in')));
  map.on('move',()=>{ zoomHint(); }); map.on('moveend',()=>{ hhWait=false; refreshFp(false); redraw(); paintHH();
    try{ const c=map.getCenter(); sessionStorage.setItem('st-cam',JSON.stringify({center:[c.lng,c.lat],zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing()})); }catch(e){} });
  map.on('zoom',()=>{ const z=map.getZoom(); if((z>=FPZ)!==(fpItems.length>0||fpBox!==null)) { refreshFp(true); redraw(); } });
  map.on('pitchend',()=>paintTilt());
  ST.ready.then(()=>{ LAST=ST.storms[ST.storms.length-1]; if(Q.get('recent')) ST.today=LAST.t+1.5*864e5; RECENT=ST.today-LAST.t<72*3600e3;
    // the storm overlay shows only when one is picked: ?storm=<iso> (or ?storm=1 for the showcase storm) or ?recent=1
    const qs=Q.get('storm'); let want=-1; if(qs){ const iso=/^\d{4}-\d{2}-\d{2}$/.test(qs)?qs:RC.SHOWCASE; want=ST.storms.findIndex(s=>s.iso===iso); }
    if(want<0&&RECENT) want=ST.storms.length-1;
    try{ sessionStorage.setItem('st-intro-seen','1'); }catch(e){}
    // load timing per step (window.__perf), read by the refine probes: which step owns a long task
    const PERF=window.__perf={}; const step=(k,f)=>{ const t=performance.now(); f(); PERF[k]=Math.round(performance.now()-t); };
    step('density',buildDensity); step('colors',buildColors); step('den',setDen); window.__loadMs=Math.round(performance.now()); document.body.classList.add('loaded');
    step('paint',()=>{ paintStat(); paintPipe(); buildTimeline(); paintTimeline(); if(MOB) buildChips(); zoomHint(); paintTilt(); });
    step('fp',()=>refreshFp(true)); fadeIn(); ST.warm();
    if(want>=0) selectStorm(want,true,true); else ST.shown().slice(-2).forEach(warmStorm); });
});

// ---------- hover / select ----------
const tip=document.getElementById('tip'), mapEl=document.getElementById('map');
function hover(i,info){ if(i===hoverI&&i>=0){ tip.style.left=info.x+'px'; tip.style.top=info.y+'px'; return; } hoverI=i;
  if(i<0||MOB){ tip.classList.remove('on'); mapEl.classList.remove('hot'); return; }
  const r=ST.recordFor(i,hail), mm=window.STM&&STM.metaNow(i); document.getElementById('t-addr').textContent=mm&&mm.addr?(DFW?mm.full:mm.addr):STH.residential(i)?`${r.type} home`:`${r.type} building`; const hs=cur?null:ST.stormsAt(i).length;
  if(!mm&&window.STM) STM.meta(i).then(m=>{ if(hoverI===i&&m&&m.addr){ document.getElementById('t-addr').textContent=DFW?m.full:m.addr; tipSub(i,m); } });
  tipSub(i,mm);
  document.getElementById('t-hail').textContent=cur?(r.h>=1?`${r.h.toFixed(2)} in hail`:'outside the swath'):(hs?`${hs} storm${hs>1?'s':''} this season`:'no 1 inch hail this season');
  tip.style.left=info.x+'px'; tip.style.top=info.y+'px'; tip.classList.add('on'); mapEl.classList.add('hot'); }
// the second line of the hover tip on Texas data: subdivision and owner (or "Owner not loaded")
function tipSub(i,m){ let e=document.getElementById('t-sub'); if(!DFW){ if(e) e.remove(); return; } if(!e){ e=document.createElement('em'); e.id='t-sub'; tip.appendChild(e); }
  const own=RC.ownerNow(i); e.textContent=[m&&m.subdivision,own||RC.OWNER_NONE].filter(Boolean).join('. ');
  if(!own&&RC.ownersAllowed()) RC.owner(i).then(o=>{ if(o&&hoverI===i) e.textContent=[m&&m.subdivision,o.name].filter(Boolean).join('. '); }); }
function selectHome(i,fly){ sel=i; fpSelect(i); document.body.classList.add('sel'); paintRecord(i); marker.setLngLat([STH.lon(i),STH.lat(i)]); redraw();
  if(fly){ const z=map.getZoom(); map.easeTo({center:[STH.lon(i),STH.lat(i)],zoom:z<15.2?16.2:z,duration:700,easing:EASE,offset:MOB?[0,-120]:[0,0]}); }
  if(MOB){ paintCta(); if(fly) setSheet('half'); } }
function closeRecord(){ sel=-1; fpSelect(-1); document.body.classList.remove('sel'); redraw(); if(MOB) paintCta(); paintHH(); }
// the home as every other screen knows it (Home, Daily 50): same id, same fields
function homeFor(i){ const r=ST.recordFor(i,hail); const hits=ST.stormsAt(i); const peak=hits.length?hits.reduce((a,b)=>b.h>a.h?b:a):null;
  const h=cur&&r.h>=1?r.h:(peak?peak.h:0), d=cur&&r.h>=1?cur.d:(peak?peak.s.d:null);
  const m=(window.STM&&STM.metaNow(i))||{}, f=FACTS[i]||{};
  return {id:hid(i),gi:i,addr:m.addr||((STH.residential(i)?`${r.type} home`:`${r.type} building`)+', '+r.county.replace(' County','')),city:m.city||'',zip:m.zip||'',year:m.year||null,place:m.place||'',county:r.county,
    state:m.state||'',full:m.full||'',subdivision:m.subdivision||'',sqft:m.sqft||null,
    hail:+h.toFixed(2),lon:+r.lon.toFixed(6),lat:+r.lat.toFixed(6),sq:f.M?f.M.squares:null,pitch:f.M?f.M.rise+'/12':null,roofAge:f.roofAge||null,storm:d}; }
// real facts per home (address, permit, LiDAR pitch, roof measured from its own outline), filled in by paintRecord
const FACTS={};
function openRecord(){ if(sel<0) return; const h=homeFor(sel); RC.remember(h); RC.go('home',{id:h.id}); }
function paintAdd(){ const b=document.getElementById('add'); if(sel<0) return; const on=RC.isAdded(hid(sel)); b.textContent=on?"On today's list":'Add to Daily 50'; b.setAttribute('aria-pressed',on); }
document.getElementById('open').addEventListener('click',openRecord);
document.getElementById('cta').addEventListener('click',openRecord);
document.getElementById('add').addEventListener('click',()=>{ if(sel<0) return; const h=homeFor(sel);
  if(RC.isAdded(h.id)){ RC.unadd(h.id); toast("Taken off today's list",()=>RC.add(Object.assign({},h,{from:'storm map'}))); }
  else { RC.remember(h); RC.add(Object.assign({},h,{from:'storm map'})); toast("Added to today's Daily 50",()=>RC.unadd(h.id)); }
  paintAdd(); });
RC.on(()=>{ if(sel>=0) paintRecord(sel); });
// toast with Undo
let toastT=null, undoFn=null; const toastEl=document.getElementById('toast');
function toast(text,undo){ document.getElementById('toast-t').textContent=text; undoFn=undo||null; document.getElementById('undo').style.display=undo?'':'none'; toastEl.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(()=>toastEl.classList.remove('on'),5000); }
document.getElementById('undo').addEventListener('click',()=>{ if(undoFn) undoFn(); undoFn=null; toastEl.classList.remove('on'); paintAdd(); });
document.getElementById('close').addEventListener('click',closeRecord);
document.getElementById('clear').addEventListener('click',()=>clearStorm());
document.getElementById('show').addEventListener('click',()=>selectStorm(ST.storms.length-1));
function roofBox(){ let b=document.getElementById('p-roof'); if(!b){ b=document.createElement('div'); b.id='p-roof'; b.className='roofm'; const f=document.querySelector('#rec .facts')||document.getElementById('p-sq').closest('.facts'); f.after(b); } return b; }
function paintFacts(i){ const f=FACTS[i], h=ST.recordFor(i,hail), esc=RC.esc, box=roofBox();
  const kind=STH.residential(i)?`${h.type} home`:`${h.type} building`;
  if(!f){ document.getElementById('p-addr').textContent=kind; document.getElementById('p-sub').textContent=`${h.county}. Loading the county record`; document.getElementById('p-sq').textContent='...'; document.getElementById('p-age').textContent='...'; box.innerHTML=''; paintOwner(i); return; }
  document.getElementById('p-addr').textContent=f.addr||kind; if(MOB&&f.addr) document.getElementById('cta-sub').textContent=f.addr;
  document.getElementById('p-sub').textContent=DFW?[f.place||null,f.subdivision||null,h.county,f.year?'built '+f.year:null,f.sqft?fmt(f.sqft)+' sq ft living':null].filter(Boolean).join('. ').replace(/\. built/,', built')
    :[f.addr?kind:null,f.place||null,h.county,f.year?'built '+f.year:null].filter(Boolean).join('. ').replace(/\. built/,', built');
  // the LiDAR story count (lib/rc-roof.js) as a chip after the county line; nothing when the batch has no record
  { const chip=window.RCROOF?RCROOF.chip(f.roof):''; if(chip){ const s=document.createElement('span'); s.className='p-story'; s.innerHTML=' '+chip; document.getElementById('p-sub').appendChild(s); } }
  paintOwner(i);
  // last re-roof only from the sources the lead card uses (lib/st-meta.js reroof); else the year built, no permit claim (10-22)
  const rr=f.reroof&&!f.reroof.none?f.reroof:null;
  document.getElementById('p-age').textContent=rr?rr.when.slice(0,4):f.year?String(f.year):'None'; document.querySelector('#p-age+span').textContent=rr?(rr.done?'re-roof permit':'permit, not confirmed'):f.year?'built, '+(new Date().getFullYear()-f.year)+' yrs':'year built';
  if(f.loading){ document.getElementById('p-sq').textContent='...'; box.innerHTML='<p class="rm-l">Measuring the roof from its outline</p>'; return; }
  if(!f.M){ document.getElementById('p-sq').textContent='None'; box.innerHTML=`<p class="rm-l"><b>No outline on file for this home.</b> No roof numbers without one.</p><p class="rm-l">${esc(f.roofAge)}</p>`; return; }
  // roof size and pitch only from the home's LiDAR record (estimates); the outline's planes and edges are not this roof's (10-22)
  const W=window.RCROOF&&f.roof?RCROOF.words(f.roof):null, ly=f.roof?f.roof.year||2018:null;
  document.getElementById('p-sq').textContent=W&&W.sq>0?'~'+W.sq+' sq':'Not measured';
  box.innerHTML=(W&&W.sq>0?`<p class="rm-l"><b>~${W.sq} squares, pitch ${esc(W.pitch||'not measured')}</b>, ${RCROOF.SQ_NOTE} (${ly} LiDAR). Roof shape being checked; verify on site.</p>`
    :`<p class="rm-l"><b>Roof size not measured.</b> ${f.lidarBefore?'Built '+f.year+', after the '+f.lidarBefore+' LiDAR flew.':'No LiDAR roof record covers this home.'}</p>`)
    +(f.reroof?`<p class="rm-l">${esc(f.reroof.text)}${f.reroof.none?'':', '+esc(f.reroof.means)} (${esc(f.reroof.src)}).</p>`:'');
  return;
  const M=f.M, E=M.edges;
  if(M.facet){ box.innerHTML=`<p class="rm-l"><b>Pitch ${esc(M.pitchText)}, measured from LiDAR roof facets</b>. ${M.planes} facets, ${esc(M.shape)}, ${fmt(M.footprint)} sq ft footprint.</p>
    <p class="rm-l">Ridge ${E.ridge} ft, hip ${E.hip} ft, valley ${E.valley} ft, eave ${E.eave} ft, rake ${E.rake} ft.</p>
    <p class="rm-l">${esc(f.roofAge)}. Measured from public LiDAR roof returns, not a field measurement. Verify on site.</p>`; return; }
  box.innerHTML=`<p class="rm-l"><b>${M.measured?'Pitch est. '+M.rise+'/12, LiDAR estimate':DFW?'Pitch est. '+M.rise+'/12'+(M.facet3d?' (LiDAR, lower confidence)':' (no LiDAR)'):'Pitch est. '+M.rise+'/12, assumed'}</b>${f.pitch&&/built/.test(f.pitch.note||'')?', '+esc(f.pitch.note.replace(/^assumed 6\/12, /,'')):''}. ${M.planes} planes, ${M.w} x ${M.d} ft, ${fmt(M.footprint)} sq ft footprint.</p>
    <p class="rm-l">Ridge ${E.ridge} ft, hip ${E.hip} ft, valley ${E.valley} ft, eave ${E.eave} ft, rake ${E.rake} ft.</p>
    <p class="rm-l">Walls ${M.walls.join(', ')} ft (${fmt(M.perimeter)} ft around).</p>
    <p class="rm-l">${esc(f.roofAge)}. Roof estimated from public building outlines and 2018 LiDAR. Verify on site.</p>`; }
// owner line: the county roll name when RC.owner can load it (signed in, not the public build), else "Owner not loaded"
function paintOwner(i){ const el=document.getElementById('p-own'); if(!el) return; if(!DFW){ el.hidden=true; return; } el.hidden=false;
  const now=RC.ownerNow(i); el.innerHTML=now?`<i>Owner</i> ${RC.blurHTML(now)}`:`<i>${RC.OWNER_NONE}</i>`;
  if(!now) RC.owner(i).then(o=>{ if(o&&sel===i) el.innerHTML=`<i>Owner</i> ${RC.blurHTML(o.name)}${o.homestead?' <i>(homestead)</i>':''}`; }); }
function loadFacts(i){ if(!window.STM||FACTS[i]&&!FACTS[i].loading) return; if(FACTS[i]) return;
  const lon=STH.lon(i), lat=STH.lat(i);
  STM.facts(i,lon,lat).then(f=>{ FACTS[i]=Object.assign(f,{loading:true}); if(sel===i) paintFacts(i);
    const done=M=>{ FACTS[i]=Object.assign(f,{loading:false,M}); if(sel===i) paintFacts(i); };
    if(!STH.hasFp(i)||!window.RealRoof) return done(null);
    RealRoof.mapEntry(i,lon,lat).then(e=>done(e?RealRoof.measure(RealRoof.spec(e,{seed:i%9973}),e):null)).catch(()=>done(null)); }); }
function paintRecord(i){ const h=ST.recordFor(i,hail);
  paintFacts(i); loadFacts(i);
  const li=[]; const hits=ST.stormsAt(i), unknown=ST.unknownAt();
  // stage and history come from the one shared pipeline (RC), so the card matches Home and Daily 50
  const id=hid(i), st=RC.stage(id), past=RC.history(id).slice(0,3).reverse(), added=RC.isAdded(id), esc=RC.esc;
  const NEXT={new:added?"Next: text from today's Daily 50":'Next: add to the Daily 50 and text',called:'Next: book the inspection',inspection:'Next: build the proposal after inspection',proposal:'Next: follow up on the proposal',won:'Won, job scheduled'};
  const tail=()=>{ past.forEach(x=>li.push(`<li class="done">${esc(x.what)}<small>${esc(RC.when(x.at))}</small></li>`)); li.push(st==='won'?`<li class="done">${NEXT.won}</li>`:`<li class="next">${NEXT[st]}<small>Task for ${OWNER}</small></li>`); };
  if(cur&&h.h>=1){ document.getElementById('p-stage').textContent=STAGE_LABEL[st]; document.getElementById('p-f1').textContent=h.h.toFixed(2)+' in'; document.getElementById('p-f1l').textContent='hail here';
    li.push(`<li class="done">Storm hit, ${h.h.toFixed(2)} in hail<small>${yd(cur)}</small></li>`); tail(); }
  else { document.getElementById('p-stage').textContent=hits.length?`Hit by ${hits.length} storm${hits.length>1?'s':''} this season`:(unknown?'Checking this season':'No 1 inch hail this season');
    document.getElementById('p-f1').textContent=hits.length?Math.max(...hits.map(x=>x.h)).toFixed(2)+' in':'0 in'; document.getElementById('p-f1l').textContent=hits.length?'peak hail':'hail this season';
    hits.slice().reverse().forEach(x=>li.push(`<li class="done">${x.h.toFixed(2)} in hail<small>${yd(x.s)}</small></li>`));
    if(unknown) li.push(`<li><span style="color:var(--muted)">Checking ${unknown} more storm${unknown>1?'s':''}</span></li>`);
    if(hits.length||st!=='new'||added) tail(); else li.push(`<li class="next">Next: nothing due. Knock when you work this street<small>No task</small></li>`); }
  document.getElementById('p-tl').innerHTML=li.join(''); paintAdd();
  if(MOB) document.getElementById('cta-sub').textContent=FACTS[i]&&FACTS[i].addr?FACTS[i].addr:`${h.type}, ${h.county.replace(' County','')}`; }

// ---------- storms ----------
// frame where the storm actually is: 3rd to 97th percentile of the hit homes, so a few far-off hits do not pull the camera out
function hitBounds(){ const m=hitIdx.length; if(!m) return null; const xs=new Float32Array(m), ys=new Float32Array(m); hitIdx.forEach((i,k)=>{ xs[k]=STH.lon(i); ys[k]=STH.lat(i); }); xs.sort(); ys.sort();
  const lo=Math.floor(m*0.03), hi=Math.max(lo,Math.ceil(m*0.97)-1); const px=Math.max(0.004,(xs[hi]-xs[lo])*0.08), py=Math.max(0.003,(ys[hi]-ys[lo])*0.08); return [[xs[lo]-px,ys[lo]-py],[xs[hi]+px,ys[hi]+py]]; }
// the swath ribbon and the density cells for the current products (ribbon crossfades between its two sources)
let ribOn='rib-b';
function setRib(geo){ if(!map.getSource('rib')) return; const next=ribOn==='rib'?'rib-b':'rib'; map.getSource(next).setData(geo||EMPTY); map.setPaintProperty(next,'heatmap-opacity',geo&&geo!==EMPTY?0.32:0); map.setPaintProperty(ribOn,'heatmap-opacity',0); ribOn=next; }
function setDen(){ const s=map.getSource('den'); if(s&&denGeo) s.setData(denGeo); }
function fitStorm(instant){ const b=hitBounds(); if(!b) return; const pad=MOB?{top:150,bottom:220,left:30,right:30}:{top:120,bottom:200,left:390,right:120};
  // the camera leaves the city you picked for the swath: the city chip highlight goes with it (it used to stay lit on Frisco over a Rockwall storm)
  region='all'; document.querySelectorAll('#counties button').forEach(x=>x.classList.toggle('on',x.dataset.c==='all'));
  map.fitBounds(b,{padding:pad,pitch:tilt3d?(MOB?48:50):0,bearing:tilt3d?(MOB?15:20):0,maxZoom:14.2,duration:instant?0:900,easing:EASE}); }
document.getElementById('fit').addEventListener('click',()=>fitStorm(false));
// a storm pick: no blink. The old layers fade out while the new fade in (beginXfade) and the camera eases to the swath at the
// same time; the storm's products come from the cache when it was seen (or warmed as a neighbour), else are computed once.
function selectStorm(i,instant,fromUrl){ const s=ST.storms[i]; if(!s||s===cur) return; const my=++gen; if(!fromUrl) postRoute(s.iso);
  ST.hail(s).then(h=>{ if(my!==gen) return;
    if(!instant) beginXfade(); cur=s; hail=h; route=null; document.body.classList.add('storm'); closeRecord(); buildColors(); setRib(ribGeo); setDen(); fpStorm(); refreshFp(true); redraw(); window.__applied=performance.now();
    paintStat(); paintPipe(); paintTimeline(); if(MOB) paintChips();
    if(!camBefore) camBefore={center:map.getCenter(),zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing()};
    hhWait=true; fitStorm(instant); if(instant){ hhWait=false; paintHH(); }
    ST.prefetch(s); ST.neighbours(s).forEach(warmStorm); }); }
function beginXfade(){ if(homesData){ prev={homes:homesData,hit:hitData,storm:!!hail}; xf=0; } cancelAnimationFrame(xfRaf); const t0=performance.now();
  const step=()=>{ xf=EASE(Math.min(1,(performance.now()-t0)/XF_MS)); redraw(); if(xf<1) xfRaf=requestAnimationFrame(step); else prev=null; }; xfRaf=requestAnimationFrame(step); }
function clearStorm(quiet){ if(!cur) return; gen++; if(quiet!==true) postRoute(null); beginXfade(); cur=null; hail=null; route=null; document.body.classList.remove('storm'); closeRecord(); buildColors(); setRib(EMPTY); setDen(); fpStorm(); redraw(); paintStat(); paintPipe(); paintTimeline(); if(MOB) paintChips();
  if(camBefore){ map.easeTo(Object.assign({duration:800,easing:EASE},camBefore)); camBefore=null; } }
// the strip is ONE storm's homes (the picked one, else the latest; summing storms double-counts homes): Homes hit = that storm's
// 1 inch homes, the rest = those same homes you moved on in the one shared store (RC.pipeline). The Homes board counts every
// home you moved, from any storm, so the header names the storm to keep the two apart.
function paintPipe(){ const p=document.getElementById('pipe'); const pipe=RC.pipeline(); const counts={}; STAGES.forEach(([k])=>counts[k]=0); let total=0, wait=false;
  if(cur){ total=hitIdx.length; hitIdx.forEach(i=>{ const e=pipe[hid(i)]; if(e&&e.stage!=='new') counts[e.stage]=(counts[e.stage]||0)+1; }); }
  else if(LAST){ total=LAST.n; const H=STH.hailCached(LAST);
    if(H) Object.keys(pipe).forEach(k=>{ const e=pipe[k], m=/^m(\d+)$/.exec(k); if(m&&e.stage!=='new'&&H[+m[1]]>=100) counts[e.stage]=(counts[e.stage]||0)+1; });
    else { wait=true; STH.hailFor(LAST).then(()=>{ if(!cur) paintPipe(); }); } }
  const s=cur||LAST; document.getElementById('ph').textContent=s?`${yd(s)} storm, your pipeline`:'Your pipeline';
  p.innerHTML=STAGES.map(([k,l],i)=>`${i?'<div class="chev"></div>':''}<div class="stage${i===0?' on':''}"><b>${i&&wait?'…':fmt(i===0?total:(counts[k]||0))}</b><span>${l}</span></div>`).join(''); }
function paintStat(){ const d=document.getElementById('s-date');
  if(cur){ d.textContent='Storm of '+cur.long.replace(/^[A-Za-z]+day, /,''); document.getElementById('s-n').textContent=fmt(cur.n); document.getElementById('s-max').textContent=cur.max.toFixed(2)+' in'; paintBands();
    const days=daysSince(cur); document.getElementById('s-days').textContent=days+(days===1?' day':' days'); document.getElementById('greet-sub').textContent=`${days} days since the ${yd(cur)} storm`; }
  else { const days=daysSince(LAST); d.textContent='Your service area'; document.getElementById('c-ttl').textContent=RECENT?'Hail in the last 3 days':'No hail in the last 3 days';
    const w6=ST.inWindow('6m').length, all=ST.storms.length;
    // counties from the loaded catalog when the shared facts have not landed yet (the phone painted "in 0 counties")
    const nc=RC.facts.counties||(STH.regions||[]).length; document.getElementById('c-sub').textContent=`${fmt(RC.facts.homes||STH.n)} homes ${nc?`in ${['','one','two','three','four','five','six','seven'][nc]||nc} count${nc===1?'y':'ies'}`:'in your service area'}. ${w6?`${w6} storm${w6===1?'':'s'} put 1 inch hail on homes here in the past 6 months`:'No storm put 1 inch hail on homes here in the past 6 months'}, ${all} on file since ${ST.season.slice(0,4)}. Last storm ${yd(LAST)}, ${days} days ago, ${fmt(LAST.n)} homes took 1 inch hail or larger.`;
    document.getElementById('show').textContent=`Show the ${yd(LAST)} storm`; document.getElementById('greet-sub').textContent=`Last storm ${yd(LAST)}, ${days} days ago`;
    paintD50(); } }
// real counts of hit homes per hail band from this storm's per-home radar values; bar = share of the fullest band
function paintBands(){ const el=document.getElementById('s-bands'); if(!el||!bands||!cur) return; const mx=Math.max(1,...bands.map(b=>b.n));
  el.innerHTML=bands.map(b=>{ const c=ramp(Math.min(b.lo+0.12,Math.max(1.15,cur.max))); return `<div><i style="height:${Math.max(4,Math.round(4+40*b.n/mx))}px;background:rgb(${c.join(',')})${b.n?'':';opacity:.3'}"></i><b>${fmt(b.n)}</b><span>${b.label}</span></div>`; }).join('');
  const sh=document.getElementById('s-share'); if(sh) sh.textContent=`${(cur.n/STH.n*100).toFixed(1)}% of ${fmt(STH.n)} homes`; }
// how this storm relates to Today's 50: the list is scored over every storm in the last 24 months (each home with its own
// hail), and the newest storm (RC.SHOWCASE, the one the shell header names) is the working storm. Never "built from" one storm.
function paintD50(){ const el=document.getElementById('c-d50'); if(!el) return; RC.factsReady.then(()=>{ const s=(ST.all||ST.storms).find(x=>x.iso===RC.SHOWCASE);
  el.textContent=!s?'':s===LAST?"The newest storm. Its hail counts on Today's 50, with every storm from the last 24 months.":`The newest storm is ${yd(s)}. Today's 50 count hail from every storm in the last 24 months.`; el.hidden=!s; }); }

// ---------- desktop timeline ----------
// the dock timeline: the storms in the window (past 6 months by default, or everything on file) on a real time axis that ends
// today, with month marks so a quiet stretch reads as time passing, not as missing data. Rebuilt when the window changes.
const thisYear=()=>String(new Date(ST.today).getUTCFullYear());
function buildTimeline(){ const el=document.getElementById('scrub'); el.querySelectorAll('.tick,.tlab,.hit,.read,.mlab,.mtick,.none').forEach(e=>e.remove());
  const L=ST.shown(), t1=ST.today, t0=ST.windowStart(), span=Math.max(1,t1-t0);
  const sh=document.getElementById('sh-t'); if(sh) sh.textContent=ST.win==='6m'?'Storms, past 6 months':'Storms since '+ST.season.slice(0,4);
  document.querySelectorAll('#wseg button').forEach(b=>b.classList.toggle('on',b.dataset.w===ST.win));
  const pos=t=>((t-t0)/span)*100;
  // month marks (first of each month inside the window); labels skip where a storm label sits
  const m0=new Date(t0); m0.setUTCDate(1); m0.setUTCHours(12,0,0,0); if(m0.getTime()<t0) m0.setUTCMonth(m0.getUTCMonth()+1);
  const months=[]; while(m0.getTime()<=t1){ months.push(m0.getTime()); m0.setUTCMonth(m0.getUTCMonth()+1); }
  const every=months.length>18?3:months.length>8?2:1; const stormX=L.filter(s=>s.n>=400||s===L[L.length-1]).map(s=>pos(s.t));
  months.forEach((t,k)=>{ const x=pos(t); const tk=document.createElement('div'); tk.className='mtick'; tk.style.left=x+'%'; el.appendChild(tk);
    if(k%every||x<1.5||x>97||stormX.some(sx=>Math.abs(sx-x)<4.5)) return; const dt=new Date(t); const l=document.createElement('div'); l.className='mlab'; l.style.left=x+'%';
    // on the all-on-file axis (more than a year) every month mark carries its year: two plain "Dec" marks read as the same month
    l.textContent=dt.toLocaleDateString('en-US',{month:'short',timeZone:'UTC'})+(ST.win==='all'||dt.getUTCMonth()===0||k===0?" '"+String(dt.getUTCFullYear()).slice(2):''); el.appendChild(l); });
  const read=document.createElement('div'); read.className='read'; el.appendChild(read); const ticks=new Map(); let lastLab=-99;
  L.forEach(s=>{ const h=tickH(s), x=pos(s.t);
    const t=document.createElement('div'); t.className='tick'; t.style.left=x+'%'; t.style.height=h+'px'; t.style.marginLeft='-1.5px'; el.appendChild(t); ticks.set(s,t);
    const wantLab=(s.n>=400||s===L[L.length-1])&&x-lastLab>9; if(wantLab){ lastLab=x; const l=document.createElement('div'); l.className='tlab'; l.dataset.iso=s.iso; l.style.left=x+'%'; l.textContent=s.iso.slice(0,4)!==thisYear()?s.d+" '"+s.iso.slice(2,4):s.d; el.appendChild(l); }
    const hit=document.createElement('button'); hit.className='hit'; hit.style.width='26px'; hit.setAttribute('aria-label',`${yd(s)} storm, ${fmt(s.n)} homes`); hit.style.left=x+'%'; hit.addEventListener('click',()=>s===cur?clearStorm():selectStorm(s.i));
    hit.addEventListener('mouseenter',()=>{ readout(s,true); if(s!==cur) t.classList.add('hov'); }); hit.addEventListener('mouseleave',()=>{ readout(cur); t.classList.remove('hov'); }); el.appendChild(hit); });
  // a month mark whose label would touch a storm label hides (all on file: "Dec '24" ran into "Sep 24 '24"); measured in px after layout
  window.declutterTimeline=function(){ const tl=[...el.querySelectorAll('.tlab')].map(l=>l.getBoundingClientRect()).filter(r=>r.width);
    el.querySelectorAll('.mlab').forEach(m=>{ m.style.visibility=''; const r=m.getBoundingClientRect(); if(r.width&&tl.some(t=>r.left<t.right+8&&t.left<r.right+8)) m.style.visibility='hidden'; }); };
  requestAnimationFrame(declutterTimeline);
  if(!L.length){ const n=document.createElement('div'); n.className='none'; n.textContent='No storm put 1 inch hail on a home here in this window'; el.appendChild(n); }
  // the readout is centred on its tick but never runs past the dock's edges (the first and last storms used to clip): clamp in px after it is filled
  window.readout=function(s,hover){ if(!s||!ticks.has(s)){ read.classList.remove('show'); return; } const x=pos(s.t); read.style.bottom=Math.min(58,37+tickH(s)+6)+'px'; read.innerHTML=`${yd(s)}, ${fmt(s.n)} homes<span>${s.max.toFixed(2)} in hail</span>`;
    const W=el.clientWidth||1, w=read.offsetWidth||0; read.style.left=Math.max(w/2+2,Math.min(W-w/2-2,x/100*W))+'px'; read.classList.toggle('hov',!!hover&&s!==cur); read.classList.add('show'); };
  window.paintTimeline=function(){ ticks.forEach((t,s)=>t.classList.toggle('on',s===cur)); el.querySelectorAll('.tlab').forEach(l=>l.classList.toggle('on',!!cur&&l.dataset.iso===cur.iso)); readout(cur); }; }
function setWindow(w){ if(!ST.setWindow(w)) return; buildTimeline(); paintTimeline(); if(MOB) buildChips(); paintStat(); }
addEventListener('resize',()=>{ if(window.declutterTimeline) declutterTimeline(); });
document.getElementById('wseg').addEventListener('click',e=>{ const b=e.target.closest('button'); if(b) setWindow(b.dataset.w); });

// ---------- nav group ----------
let zhintWord='';
function zoomHint(){ const z=map.getZoom(); const w=z>=FPZ?'Roof outlines':z>=12.8?'Streets':z>=10.8?'City':'Counties'; if(w===zhintWord) return; zhintWord=w; document.getElementById('zhint').textContent=w; }
document.getElementById('counties').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; flyRegion(b.dataset.c); });
function flyRegion(id){ region=id; document.querySelectorAll('#counties button').forEach(b=>b.classList.toggle('on',b.dataset.c===id));
  const bb=STH.regionBounds(id); if(!bb) return; const pad=MOB?{top:140,bottom:220,left:24,right:24}:{top:110,bottom:200,left:380,right:90};
  map.fitBounds([[bb[0],bb[1]],[bb[2],bb[3]]],{padding:pad,pitch:tilt3d?(id==='all'?28:42):0,bearing:tilt3d?(id==='all'?0:18):0,duration:1300,easing:EASE,maxZoom:12.6}); }
function paintTilt(){ const on=map.getPitch()>5||Math.abs(map.getBearing())>1; tilt3d=on; const b=document.getElementById('tilt'); b.classList.toggle('on',on); b.setAttribute('aria-pressed',on); b.querySelector('span').textContent=on?'3D':'2D'; }
document.getElementById('tilt').addEventListener('click',()=>{ const on=map.getPitch()>5||Math.abs(map.getBearing())>1; map.easeTo(on?{pitch:0,bearing:0,duration:600,easing:EASE}:{pitch:MOB?45:50,bearing:20,duration:600,easing:EASE}); tilt3d=!on; });
document.getElementById('zin').addEventListener('click',()=>map.zoomTo(map.getZoom()+1,{duration:400,easing:EASE}));
document.getElementById('zout').addEventListener('click',()=>map.zoomTo(map.getZoom()-1,{duration:400,easing:EASE}));
document.addEventListener('keydown',e=>{ const inInput=e.target.matches('input,textarea'); if(e.key==='Escape'){ if(inInput){ closeSearch(); e.target.blur(); return; } if(sel>=0) closeRecord(); else if(cur) clearStorm(); return; }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){ e.preventDefault(); if(!inFrame) document.getElementById('q').focus(); return; } if(inInput) return;
  const P=90; const pan={ArrowLeft:[-P,0],ArrowRight:[P,0],ArrowUp:[0,-P],ArrowDown:[0,P]}[e.key]; if(pan){ e.preventDefault(); map.panBy(pan,{duration:250,easing:EASE}); return; }
  if(e.key==='+'||e.key==='='){ map.zoomTo(map.getZoom()+1,{duration:400,easing:EASE}); } if(e.key==='-'||e.key==='_'){ map.zoomTo(map.getZoom()-1,{duration:400,easing:EASE}); } });

// ---------- search: storms by date, counties, then a bounded Nominatim geocode snapped to the nearest loaded home ----------
const qEl=document.getElementById('q'), res=document.getElementById('res'), ask=document.getElementById('ask'); let qTimer=null, qGen=0, qItems=[], qSel=0;
function closeSearch(){ res.classList.remove('on'); ask.classList.remove('open'); qItems=[]; }
function showResults(items){ qItems=items; qSel=0; res.innerHTML=items.length?items.map((it,k)=>`<button class="${k===0?'on':''}" data-k="${k}"><b>${RC.esc(it.title)}</b><span>${RC.esc(it.sub)}</span></button>`).join(''):`<div class="none">Nothing found inside ${AREA_WORD}</div>`; res.classList.add('on'); ask.classList.add('open'); }
res.addEventListener('click',e=>{ const b=e.target.closest('button'); if(b) go(qItems[+b.dataset.k]); });
function go(it){ if(!it) return; closeSearch(); qEl.blur(); it.run(); }
// streets other screens name (Nimbus names Windrose Ave): offered first, no network round trip
function localMatches(q){ const t=q.toLowerCase().trim(); const out=[];
  ST.storms.slice().reverse().forEach(s=>{ if(s.d.toLowerCase().startsWith(t)||s.iso.includes(t)||s.long.toLowerCase().includes(t)) out.push({title:`Storm of ${s.long}`,sub:`${fmt(s.n)} homes at 1 inch or larger, ${s.max.toFixed(2)} in radar`,run:()=>selectStorm(s.i)}); });
  STH.regions.forEach(r=>{ if(r.name.toLowerCase().includes(t)) out.push({title:r.name,sub:`${fmt(r.count)} homes`,run:()=>flyRegion(r.id)}); });
  return out.slice(0,5); }
qEl.addEventListener('input',()=>{ clearTimeout(qTimer); const q=qEl.value; if(q.trim().length<2){ closeSearch(); return; } const my=++qGen; const loc=localMatches(q); showResults(loc);
  if(/storm|county/i.test(q)&&loc.length) return;
  qTimer=setTimeout(()=>{ Promise.all([window.STM?STM.search(q,6):Promise.resolve([]),DFW&&window.STM?STM.searchPlaces(q,4):Promise.resolve([])]).then(([hs,pl])=>{ if(my!==qGen) return;
    // Texas data: a city, ZIP or subdivision flies there and lists its homes (city > subdivision > street order)
    const pls=pl.map(p=>({title:p.kind==='city'?`${p.title}, ${ROOF.state}`:p.kind==='zip'?`ZIP ${p.title}`:p.title,sub:`${p.kind==='subdivision'?'Subdivision in '+p.city+' '+p.zip+', ':p.kind==='zip'?p.city+', ':''}${fmt(p.count)} homes`,run:()=>openPlace(p)}));
    if(hs.length||pls.length){ showResults(loc.concat(pls,hs.map(h=>({title:DFW?h.full:h.addr,sub:DFW?[h.subdivision,h.county].filter(Boolean).join(', '):`${h.place}, ${h.county}`,run:()=>selectHome(h.i,true)}))).slice(0,DFW?8:6)); return; }
    nominatim(q,my,loc); }); },250); });
function nominatim(q,my,loc){ { const bb=STH.cat.box; const u=`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&bounded=1&viewbox=${bb[0]},${bb[3]},${bb[2]},${bb[1]}&q=${encodeURIComponent(q)}`;
    const ctl=new AbortController(); setTimeout(()=>ctl.abort(),6000);
    fetch(u,{signal:ctl.signal}).then(r=>r.ok?r.json():[]).then(list=>{ if(my!==qGen) return; const seen=new Set(); list=list.filter(p=>{ const k=p.display_name.split(',').slice(0,3).join(','); if(seen.has(k)) return false; seen.add(k); return true; }); const geo=list.map(p=>{ const lon=+p.lon,lat=+p.lat; const name=p.display_name.split(',').slice(0,3).join(','); const home=STH.nearest(lon,lat,0.004);
      // the home city (Plano) first, then anything with a loaded home nearby, then bare places (a same-named town ranks last)
      const rank=(new RegExp('\\b'+ROOF.city+'\\b').test(p.display_name)?0:2)+(home>=0?0:1)+(p.category==='highway'||p.addresstype==='road'?0:0.5);
      return {rank,title:name,sub:home>=0?`Nearest loaded home, ${STH.regionOf(home).name}`:'Place, no loaded home within a block',run:()=>{ if(home>=0) selectHome(home,true); else map.easeTo({center:[lon,lat],zoom:15.5,duration:900,easing:EASE}); }}; });
      geo.sort((a,b)=>a.rank-b.rank);
      const norm=t=>t.toLowerCase().replace(/^(west|east) /,m=>m[0]+' ').replace(/ street\b/,' st').split(',').slice(0,2).join(',').trim(); const have=new Set(loc.map(x=>norm(x.title)));
      showResults(loc.concat(geo.filter(g=>!have.has(norm(g.title)))).slice(0,6)); }).catch(()=>{ if(my===qGen) showResults(loc); }); } }
qEl.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); go(qItems[qSel]); } if(e.key==='ArrowDown'||e.key==='ArrowUp'){ e.preventDefault(); if(!qItems.length) return; qSel=(qSel+(e.key==='ArrowDown'?1:-1)+qItems.length)%qItems.length; res.querySelectorAll('button').forEach((b,k)=>b.classList.toggle('on',k===qSel)); } });
qEl.addEventListener('blur',()=>setTimeout(()=>{ closeSearch(); ask.classList.remove('wide'); },180));
if(MOB) ask.addEventListener('click',()=>{ if(!ask.classList.contains('wide')){ ask.classList.add('wide'); setTimeout(()=>qEl.focus(),30); } });

// ---------- phone: bottom sheet (peek / half / full) + storm chips ----------
let sheetState='peek';
function paintCta(){ fitBody(); const on=MOB&&sel>=0&&sheetState!=='peek'; document.getElementById('cta').classList.toggle('show',on); document.getElementById('ctafade').classList.toggle('show',on); }
// the sheet body ends above the Open record bar, so nothing runs under it (half shows 58% of the sheet)
function fitBody(){ if(!MOB) return; const sh=document.getElementById('sheet'), b=sh.querySelector('.body'); const H=sh.getBoundingClientRect().height||innerHeight*0.92;
  const vis=sheetState==='full'?H:sheetState==='half'?H*0.58:H; const cta=sel>=0&&sheetState!=='peek'?80:0; b.style.height=Math.max(120,vis-44-cta)+'px'; }
addEventListener('resize',fitBody);
document.getElementById('scrim').addEventListener('click',()=>setSheet('half'));
function setSheet(st){ if(!MOB) return; const sh=document.getElementById('sheet'); sheetState=st; document.body.classList.toggle('sheet-open',st!=='peek'); document.body.classList.toggle('sheet-full',st==='full'); fitBody(); if(st!=='peek') sh.querySelector('.body').scrollTop=0; sh.classList.remove('s-peek','s-half','s-full','drag'); sh.classList.add('s-'+st); sh.style.transform=''; paintCta(); if(st==='peek') sh.querySelector('.body').scrollTop=0; }
// phone chips: your area, then the window's storms newest first, then one chip that widens to everything on file (or back)
function buildChips(){ const chips=document.getElementById('chips'); chips.innerHTML=''; const area=document.createElement('button'); area.className='chip-s'; area.dataset.i=-1; area.innerHTML=`<b>Your area</b><span>${fmt(STH.n)} homes</span>`; area.addEventListener('click',()=>clearStorm()); chips.appendChild(area);
  const L=ST.shown(); L.slice().reverse().forEach(s=>{ const c=document.createElement('button'); c.className='chip-s'; c.dataset.i=s.i; c.innerHTML=`<b>${s.iso.slice(0,4)!==thisYear()?s.d+" '"+s.iso.slice(2,4):s.d}</b><span>${fmt(s.n)} homes</span>`; c.addEventListener('click',()=>selectStorm(s.i)); chips.appendChild(c); });
  const more=ST.storms.length-L.length; if(ST.win==='6m'&&more>0){ const c=document.createElement('button'); c.className='chip-s'; c.dataset.i=-2; c.innerHTML=`<b>Older storms</b><span>${more} since ${ST.season.slice(0,4)}</span>`; c.addEventListener('click',()=>setWindow('all')); chips.appendChild(c); }
  else if(ST.win==='all'){ const c=document.createElement('button'); c.className='chip-s'; c.dataset.i=-2; c.innerHTML=`<b>Past 6 months</b><span>${ST.inWindow('6m').length} storms</span>`; c.addEventListener('click',()=>setWindow('6m')); chips.appendChild(c); }
  window.paintChips=function(){ let on=null; [...chips.children].forEach(c=>{ const i=+c.dataset.i; const o=i===-1?!cur:i>=0&&ST.storms[i]===cur; c.classList.toggle('on',o); if(o) on=c; }); if(on) chips.scrollTo({left:Math.max(0,on.offsetLeft-14),behavior:'smooth'}); };
  paintChips(); }
if(MOB){ const sh=document.getElementById('sheet'), hd=document.getElementById('handle'); let y0=0,t0=0,start=0,drag=false,moved=false; const H=()=>sh.getBoundingClientRect().height; const offs=()=>({peek:H()-186,half:H()*0.42,full:0});
  const down=e=>{ drag=true; moved=false; y0=e.clientY; t0=performance.now(); start=offs()[sheetState]; sh.classList.add('drag'); };
  const move=e=>{ if(!drag) return; if(Math.abs(e.clientY-y0)>4) moved=true; const d=Math.max(0,Math.min(H()-120,start+(e.clientY-y0))); sh.style.transform=`translateY(${d}px)`; };
  const up=e=>{ if(!drag) return; drag=false; if(!moved){ setSheet(sheetState==='peek'?'half':sheetState); return; } const d=start+(e.clientY-y0), v=(e.clientY-y0)/Math.max(1,performance.now()-t0); const o=offs(); let best='peek',bd=1e9; for(const k in o){ const dist=Math.abs(o[k]-d); if(dist<bd){bd=dist;best=k;} } if(Math.abs(v)>0.6){ const order=['full','half','peek']; let i=order.indexOf(sheetState); i=v>0?Math.min(2,i+1):Math.max(0,i-1); best=order[i]; } setSheet(best); };
  hd.addEventListener('pointerdown',down); sh.querySelector('.body').addEventListener('pointerdown',e=>{ if(sheetState==='peek') down(e); });
  window.addEventListener('pointermove',move); window.addEventListener('pointerup',up); window.addEventListener('pointercancel',up); }
window.__setSheet=setSheet;

// ---------- hardest hit in view + a straight-line route through the top 12 ----------
const ROUTE_N=12;
function inView(){ const b=map.getBounds(); const W=b.getWest(),E=b.getEast(),S=b.getSouth(),N=b.getNorth(); const xy=STH.xy, ty=STH.type, out=[];
  for(let k=0;k<hitIdx.length;k++){ const i=hitIdx[k], x=xy[i*2], y=xy[i*2+1]; if(x>=W&&x<=E&&y>=S&&y<=N&&(ty[i]&127)<=4) out.push(i); } return out; }
const miles=(a,b)=>{ const R=3958.8, r=Math.PI/180; const dLat=(STH.lat(b)-STH.lat(a))*r, dLon=(STH.lon(b)-STH.lon(a))*r; const x=Math.sin(dLat/2)**2+Math.cos(STH.lat(a)*r)*Math.cos(STH.lat(b)*r)*Math.sin(dLon/2)**2; return 2*R*Math.asin(Math.sqrt(x)); };
let hhWait=false;   // true from a storm's apply() until the first moveend after fitStorm: the counts would be from the old camera
function paintHH(){ if(!cur||!hitIdx) return; const hh0=document.getElementById('hh'); const waiting=hhWait||(map.isMoving&&map.isMoving()); hh0.classList.toggle('wait',waiting);
  if(waiting){ document.getElementById('hh-sub').textContent=`${yd(cur)} storm. Fitting the map to the swath.`; return; }
  const v=inView(); const top=v.reduce((m,i)=>Math.max(m,hail[i]),0)/100; const stops=Math.min(ROUTE_N,v.length);
  document.getElementById('hh-n').textContent=fmt(v.length); document.getElementById('hh-max').textContent=v.length?top.toFixed(2)+' in':'None'; document.getElementById('hh-top').textContent=route?route.idx.length:stops;
  document.getElementById('hh-sub').textContent=v.length?`${yd(cur)} storm, homes at 1 inch or larger in this part of the map.`:'No homes at 1 inch or larger in this part of the map. Fit storm to see the swath.';
  // no hit home in view: the primary button fits the storm instead of sitting there disabled (it looked live and did nothing)
  const pl=document.getElementById('plan'); pl.disabled=false; pl.dataset.fit=v.length?'':'1'; pl.textContent=!v.length?'Fit storm to plan a route':stops<ROUTE_N?`Plan a route through ${stops}`:'Plan a route';
  document.getElementById('hh').classList.toggle('routed',!!route);
  if(route){ const n=route.idx.length, all=route.idx.every(i=>RC.isAdded(hid(i)));
    document.getElementById('rt-meta').innerHTML=`${n} stops, ${route.mi.toFixed(1)} mi <span>straight-line order, hardest hit first</span>`;
    const b=document.getElementById('rt-add'); b.textContent=all?`All ${n} on today's list`:`Add these ${n} to Daily 50`; b.disabled=all; } }
function planRoute(){ const top=inView().sort((a,b)=>hail[b]-hail[a]||a-b).slice(0,ROUTE_N); if(!top.length) return; const left=top.slice(1), order=[top[0]]; let mi=0;
  while(left.length){ const a=order[order.length-1]; let bi=0,bd=1e9; left.forEach((b,k)=>{ const d=miles(a,b); if(d<bd){bd=d;bi=k;} }); mi+=bd; order.push(left.splice(bi,1)[0]); }
  route={idx:order,path:order.map(i=>[STH.lon(i),STH.lat(i)]),mi}; redraw(); paintHH(); }
document.getElementById('plan').addEventListener('click',e=>{ if(e.currentTarget.dataset.fit) fitStorm(false); else planRoute(); });
document.getElementById('rt-clear').addEventListener('click',()=>{ route=null; redraw(); paintHH(); });
document.getElementById('rt-add').addEventListener('click',()=>{ if(!route) return; const ids=[];
  route.idx.forEach((i,k)=>{ const h=homeFor(i); RC.remember(h); if(RC.add(Object.assign({},h,{from:'storm map',stop:k+1}))) ids.push(h.id); });
  toast(`${ids.length} home${ids.length===1?'':'s'} added to today's Daily 50`,()=>ids.forEach(id=>RC.unadd(id))); });
RC.on(()=>paintHH());

// ---------- the shell keeps this frame alive and can switch the storm in place: {type:'route', params:{iso}} ----------
addEventListener('message',e=>{ if(e.origin!==location.origin) return; const d=e.data||{}; if(d.type!=='route'||(d.screen&&d.screen!=='storm')) return;
  if(d.token&&e.source) try{ e.source.postMessage({type:'routed',token:d.token},e.origin); }catch(err){}
  ST.ready.then(()=>{ const iso=d.params&&d.params.iso; if(!iso){ clearStorm(true); return; } const k=ST.storms.findIndex(s=>s.iso===iso); if(k>=0) selectStorm(k,false,true); }); });

// the shell's header search box drives this page's search (same results, same keyboard): {type:'find', q} per keystroke,
// {type:'find-key', key} for Enter / arrows / Escape, {type:'find-close'}, and {type:'find-open'} on a phone (the wide box)
addEventListener('message',e=>{ if(e.origin!==location.origin) return; const d=e.data||{};
  if(d.type==='find'){ qEl.value=String(d.q||''); qEl.dispatchEvent(new Event('input')); }
  else if(d.type==='find-key'){ if(d.key==='Escape'){ closeSearch(); return; } qEl.dispatchEvent(new KeyboardEvent('keydown',{key:d.key,bubbles:true})); }
  else if(d.type==='find-close'){ if(document.activeElement!==qEl) closeSearch(); }
  else if(d.type==='find-open'){ ask.classList.add('wide'); setTimeout(()=>qEl.focus(),30); } });

// ---------- demo hooks for the capture script ----------
function demoPoint(pred){ const W=innerWidth,H=innerHeight; let best=null,bd=1e9; const n=STH.n, step=cur?1:3;
  const list=cur?hitIdx:null; const m=list?list.length:n;
  for(let k=0;k<m;k+=step){ const i=list?list[k]:k; if(pred&&!pred(i)) continue; const p=map.project([STH.lon(i),STH.lat(i)]); if(p.x<W*0.3||p.x>W*0.78||p.y<H*0.3||p.y>H*0.74) continue; const d=Math.hypot(p.x-W*0.54,p.y-H*0.52); if(d<bd){bd=d;best={x:p.x,y:p.y,i};} }
  return best; }
window.__selectDemo=function(){ return demoPoint(i=>cur?hail[i]/100>=Math.max(1,cur.max-0.35):true); };
window.__hoverDemo=function(){ const s=sel; return demoPoint(i=>(cur?hail[i]/100>=1.2:true)&&(s<0||Math.hypot(STH.lon(i)-STH.lon(s),STH.lat(i)-STH.lat(s))>0.0012)); };
window.__show=()=>selectStorm(ST.storms.length-1,true); window.__route=()=>route; window.__sel=()=>sel; window.__plan=planRoute; window.__clear=clearStorm; window.__fly=flyRegion; window.__select=i=>selectHome(i,true);
// pixels the homes layers add in the middle of the view: draw with and without them and diff (two renders, no picking passes)
window.__visibleHomes=async()=>{ if(!overlay) return 0; const c=map.getCanvas(), W=c.width, H=c.height, x=Math.round(W*0.25), y=Math.round(H*0.3), w=Math.round(W*0.5), h=Math.round(H*0.4);
  const frame=()=>new Promise(r=>{ map.once('render',()=>requestAnimationFrame(()=>r())); map.triggerRepaint(); });
  const grab=()=>{ const k=document.createElement('canvas'); k.width=w; k.height=h; const g=k.getContext('2d'); g.drawImage(c,x,y,w,h,0,0,w,h); return g.getImageData(0,0,w,h).data; };
  await frame(); const a=grab(); hideHomes=true; redraw(); await frame(); const b=grab(); hideHomes=false; redraw(); await frame();
  let n=0; for(let i=0;i<a.length;i+=4) if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>24) n++; return n; };
window.__zoomTo=(z,p)=>map.jumpTo(p==null?{zoom:z}:{zoom:z,pitch:p});
window.__count=()=>STH.n; window.__hits=()=>hitIdx?hitIdx.length:0; window.__fp=()=>fpItems.length; window.__fpSent=()=>fpSent.size;
window.__shown=()=>ST.shown().map(s=>s.iso); window.__pick=i=>selectStorm(i); window.__win=setWindow; window.__bands=()=>bands; window.__cells=()=>DEN.cells?DEN.cells.length:0; window.__cached=()=>[...PRODUCTS.keys()];

// ---------- city buttons, places and the home list ----------
// Homes in the DFW build are stored sorted city > ZIP > subdivision > street > house number (meta/<region>/places.json
// holds the row ranges), so a place is a few index ranges and any list in index order is already in that order.
function rangesBounds(ranges){ let m=0; ranges.forEach(r=>m+=r[1]); if(!m) return null; const xs=new Float32Array(m), ys=new Float32Array(m); let k=0;
  ranges.forEach(([a,n])=>{ for(let j=0;j<n;j++){ xs[k]=STH.lon(a+j); ys[k]=STH.lat(a+j); k++; } }); xs.sort(); ys.sort();
  const lo=Math.floor(m*0.02), hi=Math.max(lo,Math.ceil(m*0.98)-1); return [xs[lo],ys[lo],xs[hi],ys[hi]]; }
function flyBounds(bb,maxZoom){ if(!bb) return; const pad=MOB?{top:140,bottom:220,left:24,right:24}:{top:110,bottom:200,left:document.body.classList.contains('list')?420:380,right:90};
  const w=Math.max(0.004,bb[2]-bb[0]), h=Math.max(0.003,bb[3]-bb[1]);
  map.fitBounds([[bb[0]-w*0.02,bb[1]-h*0.02],[bb[2]+w*0.02,bb[3]+h*0.02]],{padding:pad,pitch:tilt3d?42:0,bearing:tilt3d?18:0,duration:1300,easing:EASE,maxZoom:maxZoom||15.5}); }
const CITY={};   // city -> [[start,count] per region]
function cityRanges(){ if(Object.keys(CITY).length) return Promise.resolve(CITY);
  return Promise.all(STH.regions.map(r=>STM.places(r).then(p=>{ if(!p||!p.cities) return; Object.entries(p.cities).forEach(([c,v])=>(CITY[c]=CITY[c]||[]).push([r.offset+v.start,v.count])); }))).then(()=>CITY); }
function flyCity(name){ region='city:'+name; document.querySelectorAll('#counties button').forEach(b=>b.classList.toggle('on',b.dataset.c===region)); cityRanges().then(C=>{ if(C[name]) flyBounds(rangesBounds(C[name]),12.6); }); }
function openPlace(p){ const ranges=p.ranges||[[p.start,p.count]]; flyBounds(rangesBounds(ranges),p.kind==='city'?12.6:15.2);
  const idx=[]; ranges.slice().sort((a,b)=>a[0]-b[0]).forEach(([a,n])=>{ for(let j=0;j<n;j++) if(STH.residential(a+j)) idx.push(a+j); });
  openList(p.kind==='city'?`${p.title}, ${ROOF.state}`:p.kind==='zip'?`ZIP ${p.title}`:p.title, idx); }
if(DFW){
  // city buttons from the data (catalog regions' by_city), Plano first (lib/brand.js rooferCities)
  STH.ready.then(()=>{ const names=rooferCities(STH.cat);
    const seg=document.getElementById('counties'); seg.innerHTML=`<button data-c="all" class="on">All</button>`+names.map(c=>`<button data-c="city:${RC.esc(c)}">${RC.esc(c)}</button>`).join(''); });
  const _fly=flyRegion; flyRegion=function(id){ if(String(id).startsWith('city:')) return flyCity(id.slice(5)); return _fly(id); };
  document.getElementById('l-open').hidden=false; document.getElementById('l-open-calm').hidden=false;
  document.getElementById('l-open').addEventListener('click',()=>{ if(!hitIdx) return; openList(`Hit homes, ${yd(cur)}`,hitIdx.filter(i=>STH.residential(i)).sort((a,b)=>a-b)); });
  document.getElementById('l-open-calm').addEventListener('click',()=>{ const idx=[]; for(let i=0;i<STH.n;i++) if(STH.residential(i)) idx.push(i); openList('Every home, '+ROOF.area,idx); });
}
// the list: a virtual scroller (only the rows on screen exist), so 200k homes scroll without freezing the page
let LIST={all:[],idx:[],sel:-1}; const ROWH=()=>MOB?62:58;
const lvp=document.getElementById('l-vp'), lin=document.getElementById('l-in'), lq=document.getElementById('l-q');
function rowText(i){ const m=STM.metaNow(i)||{}, o=RC.ownerNow(i); return {m,o}; }
function openList(title,idx){ document.getElementById('l-ttl').textContent=title; LIST={all:idx,idx,sel:-1,title}; lq.value='';
  document.body.classList.add('list'); if(MOB) setSheet('peek');
  document.getElementById('l-sub').textContent='Loading addresses';
  // addresses first (the list shows at once), owner names fill in when the private roll has loaded
  Promise.all(STH.regions.map(r=>STM.meta(r.offset))).then(()=>{ if(LIST.all!==idx) return;
    paintListSub(); lvp.scrollTop=0; renderList(true);
    RC.ownersWarm().then(()=>{ if(LIST.all!==idx) return; paintListSub(); renderList(true); }); }); }
function paintListSub(){ const n=LIST.idx.length, haveOwn=LIST.idx.length&&RC.ownersAllowed()&&LIST.idx.slice(0,50).some(i=>RC.ownerNow(i));
  document.getElementById('l-sub').textContent=`${fmt(n)} home${n===1?'':'s'}, by city, subdivision and street. ${haveOwn?'Owners from the county roll.':RC.OWNER_NONE+'.'}`; }
function renderList(force){ const H=ROWH(), n=LIST.idx.length; lin.style.height=(n*H)+'px'; lin.style.position='relative';
  if(!n){ lin.innerHTML=`<div class="empty">No homes match.</div>`; lin.style.height='auto'; document.getElementById('l-grp').textContent=''; return; }
  const top=lvp.scrollTop, vh=lvp.clientHeight||600, a=Math.max(0,Math.floor(top/H)-6), b=Math.min(n,Math.ceil((top+vh)/H)+6);
  if(!force&&LIST.a===a&&LIST.b===b) return; LIST.a=a; LIST.b=b; const out=[], esc=RC.esc;
  for(let k=a;k<b;k++){ const i=LIST.idx[k], {m,o}=rowText(i), h=hail?hail[i]/100:0;
    out.push(`<button class="row${i===sel?' on':''}" data-i="${i}" style="top:${k*H}px"><b>${esc(m.addr?m.addr+', '+m.city+' '+m.zip:'Home '+i)}</b><span>${esc([o||RC.OWNER_NONE,m.subdivision].filter(Boolean).join(' · '))}</span>${h>=1?`<i class="h">${h.toFixed(2)} in</i>`:''}</button>`); }
  lin.innerHTML=out.join('');
  const f=STM.metaNow(LIST.idx[Math.min(n-1,Math.floor(top/H))])||{}; document.getElementById('l-grp').textContent=[f.city,f.zip,f.subdivision].filter(Boolean).join(' › '); }
lvp.addEventListener('scroll',()=>requestAnimationFrame(()=>renderList(false)),{passive:true});
lin.addEventListener('click',e=>{ const b=e.target.closest('.row'); if(!b) return; const i=+b.dataset.i; if(MOB) document.body.classList.remove('list'); selectHome(i,true); renderList(true); });
document.getElementById('l-close').addEventListener('click',()=>document.body.classList.remove('list'));
let lqT=null; lq.addEventListener('input',()=>{ clearTimeout(lqT); lqT=setTimeout(()=>{ const t=lq.value.toLowerCase().trim();
  LIST.idx=!t?LIST.all:LIST.all.filter(i=>{ const {m,o}=rowText(i); return ((m.addr||'')+' '+(m.city||'')+' '+(m.zip||'')+' '+(m.subdivision||'')+' '+(o||'')).toLowerCase().includes(t); });
  lvp.scrollTop=0; paintListSub(); renderList(true); },180); });
window.__openList=()=>{ if(hitIdx&&cur) document.getElementById('l-open').click(); else document.getElementById('l-open-calm').click(); };
window.__listRows=()=>[...lin.querySelectorAll('.row')].slice(0,5).map(r=>r.innerText);
