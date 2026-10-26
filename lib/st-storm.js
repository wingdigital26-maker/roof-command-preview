// Storm Map storm module: the app's real storm catalog (dates, counts at 1 inch or larger, radar maximum) from
// lib/st-data-dfw/catalog.json via STH. ST.storms = every storm on file that put 1 inch hail on at least one home
// (indexes are stable: routes, chips and the timeline all point into this list). ST.shown() = the storms inside the
// current window (past 6 months by default, Jack 10-10; 'all' = everything on file). Nothing is invented: when the
// window holds no storm it widens to everything on file and says so.
// Per-home hail is the app's radar value (lib/st-meta.js). Pipeline stages come from the shared device pipeline (RC).
(function(){
  const now=new Date(); const todayUTC=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate(),12);   // today at noon UTC, like the storm dates
  const ST={storms:[],all:[],today:todayUTC,ready:null,win:'6m'};
  ST.season='2024-01-01';                   // the DFW data reaches back to 2024
  ST.MONTHS=6;
  const STAGE=i=>(window.RC&&RC.stage('m'+i))||'new';   // the one shared pipeline (lib/rc-state.js); nothing invented
  ST.ready=STH.ready.then(()=>{ ST.all=STH.storms.slice(); ST.storms=STH.storms.filter(s=>s.iso>=ST.season).sort((a,b)=>a.t-b.t); ST.storms.forEach((s,i)=>s.i=i);
    if(!ST.inWindow('6m').length) ST.win='all'; return ST; });
  // the window's start (ms): 6 months back from today, or 40 days before the first storm on file
  ST.windowStart=w=>{ w=w||ST.win; if(w==='all') return ST.storms.length?ST.storms[0].t-40*864e5:ST.today-365*864e5; const d=new Date(ST.today); d.setUTCMonth(d.getUTCMonth()-ST.MONTHS); return d.getTime(); };
  ST.inWindow=w=>{ const t0=ST.windowStart(w); return ST.storms.filter(s=>s.t>=t0); };
  ST.shown=()=>ST.inWindow(ST.win);
  ST.setWindow=w=>{ if(w!=='6m'&&w!=='all') return false; if(ST.win===w) return false; ST.win=w; return true; };
  // hail per home for a storm (Uint8, 1/100 in). Promise.
  ST.hail=s=>STH.hailFor(s);
  // precompute the whole season in the background so the record panel can list every storm at a home.
  // Newest first, so the storms on the timeline are ready before the old ones.
  ST.warm=()=>{ const q=ST.storms.slice().reverse(); const next=()=>{ const s=q.shift(); if(!s) return; STH.hailFor(s).then(()=>setTimeout(next,60)); }; next(); };
  // the storms either side of one on the timeline (within the window), so a switch to a neighbour never waits on the network
  ST.neighbours=s=>{ const L=ST.shown(); const k=L.indexOf(s); const out=[]; if(k>0) out.push(L[k-1]); if(k>=0&&k<L.length-1) out.push(L[k+1]); return out; };
  ST.prefetch=s=>ST.neighbours(s).forEach(n=>STH.hailFor(n));
  ST.stage=STAGE;
  // record for a home index: real position, county, footprint when a tile has it; stage from the shared pipeline
  ST.recordFor=(i,hail)=>{ const r=STH.regionOf(i); const fp=STH.footprintOf(i); const t=STH.type[i]&127;
    return {i,lon:STH.lon(i),lat:STH.lat(i),county:r.name,region:r.id,h:hail?hail[i]/100:0,fp:!!fp,sq:fp&&fp.sq?Math.round(fp.sq*1.118/100*10)/10:null,footSq:fp?fp.sq:null,
      type:['Single-family','Duplex','Townhome','Condo','Mobile home','Multifamily','Commercial','Industrial','Institutional','Ag','Other'][t]||'Residential',stage:STAGE(i)}; };
  // storms this season with 1 inch or larger hail at this home (only storms already computed)
  ST.stormsAt=i=>ST.storms.map(s=>{ const h=STH.hailCached(s); return h?{s,h:h[i]/100}:null; }).filter(x=>x&&x.h>=1);
  ST.unknownAt=()=>ST.storms.filter(s=>!STH.hailCached(s)).length;
  // hail size bands for the stat card: real counts of residential homes per band from the storm's own per-home radar values
  ST.BANDS=[[1,1.25,'1 to 1.25 in'],[1.25,1.5,'1.25 to 1.5'],[1.5,1.75,'1.5 to 1.75'],[1.75,99,'1.75 in and up']];
  ST.bands=hail=>{ const out=ST.BANDS.map(b=>({lo:b[0],hi:b[1],label:b[2],n:0})); const ty=STH.type;
    for(let i=0;i<hail.length;i++){ const h=hail[i]; if(h<100||(ty[i]&127)>4) continue; const x=h/100; for(let k=0;k<out.length;k++) if(x<out[k].hi){ out[k].n++; break; } } return out; };
  window.ST=ST;
})();
