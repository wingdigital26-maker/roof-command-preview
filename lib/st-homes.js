// Storm Map homes module. Real homes from the roofer's data (lib/st-data-dfw: catalog.json + homes.bin + fp tiles,
// built by scripts/dfw from the county appraisal rolls). No owner names are loaded here.
// Per-home hail, addresses, permits and LiDAR pitch: lib/st-meta.js (read-only copies of the app's own files).
(function(){
  const DATA=window.rooferDataRoot?rooferDataRoot():'lib/st-data-dfw/';   // the roofer's own data (lib/brand.js dataRoot)
  const H={ n:0, xy:null, type:null, cat:null, regions:[], storms:[], ready:null };
  const fetchBuf=u=>fetch(u).then(r=>{ if(!r.ok) throw new Error(u+' '+r.status); return r.arrayBuffer(); });
  H.ready=Promise.all([fetch(DATA+'catalog.json').then(r=>r.json()),fetchBuf(DATA+'homes.bin')]).then(([cat,buf])=>{
    H.cat=cat; H.n=cat.total; H.regions=cat.regions; H.xy=new Float32Array(buf,0,H.n*2); H.type=new Uint8Array(buf,H.n*8,H.n);
    H.storms=cat.storms.map(s=>{ const t=Date.parse(s.date+'T12:00:00Z'); const dt=new Date(t);
      return {iso:s.date,t,n:s.homes_1in,n075:s.homes_075,max:s.max_in,regions:s.regions,lsr:cat.lsr[s.date]||[],
        d:dt.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}),
        long:dt.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})}; });
    return H; });
  H.regionOf=i=>{ const R=H.regions; for(let k=R.length-1;k>=0;k--) if(i>=R[k].offset) return R[k]; return R[0]; };
  H.lon=i=>H.xy[i*2]; H.lat=i=>H.xy[i*2+1]; H.hasFp=i=>(H.type[i]&128)!==0; H.residential=i=>(H.type[i]&127)<=4;
  H.bbox=(pred)=>{ let a=1e9,b=1e9,c=-1e9,d=-1e9; const xy=H.xy; for(let i=0;i<H.n;i++){ if(pred&&!pred(i)) continue; const x=xy[i*2],y=xy[i*2+1]; if(x<a)a=x; if(x>c)c=x; if(y<b)b=y; if(y>d)d=y; } return a>c?null:[a,b,c,d]; };
  // where the homes are (2nd to 98th percentile), so a few rural outliers do not pull a county fit out
  H.regionBounds=id=>{ const r=id==='all'?{offset:0,count:H.n}:H.regions.find(r=>r.id===id); if(!r) return null; const m=r.count, xs=new Float32Array(m), ys=new Float32Array(m); const xy=H.xy;
    for(let k=0;k<m;k++){ xs[k]=xy[(r.offset+k)*2]; ys[k]=xy[(r.offset+k)*2+1]; } xs.sort(); ys.sort(); const lo=Math.floor(m*0.02), hi=Math.ceil(m*0.98)-1; return [xs[lo],ys[lo],xs[hi],ys[hi]]; };
  // nearest loaded home to a point (brute force over every home is a few ms)
  H.nearest=(lon,lat,maxDeg)=>{ let best=-1,bd=(maxDeg||0.01)**2; const xy=H.xy, c=Math.cos(lat*Math.PI/180); for(let i=0;i<H.n;i++){ const dx=(xy[i*2]-lon)*c, dy=xy[i*2+1]-lat; const d=dx*dx+dy*dy; if(d<bd){bd=d;best=i;} } return best; };

  // ---------- per-home hail ----------
  // The app's own radar values per home (lib/st-meta.js reads meta/hail/<region>/<date>.bin). No modelled field.
  H.hailFor=s=>window.STM?STM.hailFor(s.iso):Promise.resolve(new Uint8Array(H.n));
  H.hailCached=()=>null;

  // ---------- footprint tiles (0.05 degree grid, per region) ----------
  const tiles={}; const tileIndex={};
  H.ready.then(()=>H.regions.forEach(r=>r.tiles.forEach(t=>{ (tileIndex[t.tr+'_'+t.tc]=tileIndex[t.tr+'_'+t.tc]||[]).push(r); })));
  function decodeTile(buf,r,tr,tc){ const dv=new DataView(buf); const cnt=dv.getUint32(0,true); let o=4; const out=[]; const olon=tc*0.05, olat=tr*0.05;
    for(let k=0;k<cnt;k++){ const idx=dv.getUint32(o,true), sq=dv.getUint16(o+4,true), nv=dv.getUint8(o+6); o+=7; const ring=new Array(nv);
      for(let v=0;v<nv;v++){ ring[v]=[olon+dv.getUint16(o,true)*1e-6, olat+dv.getUint16(o+2,true)*1e-6]; o+=4; }
      out.push({i:r.offset+idx,sq,ring}); } return out; }
  // all footprints in a lon/lat bbox; fetches missing tiles and calls onLoad when more arrive
  H.footprints=(bb,onLoad)=>{ const r0=Math.floor(bb[1]/0.05), r1=Math.floor(bb[3]/0.05), c0=Math.floor(bb[0]/0.05), c1=Math.floor(bb[2]/0.05); const out=[]; let loading=0;
    for(let tr=r0;tr<=r1;tr++) for(let tc=c0;tc<=c1;tc++){ const key=tr+'_'+tc; const regs=tileIndex[key]; if(!regs) continue;
      regs.forEach(r=>{ const k=r.id+'/'+key; const t=tiles[k];
        if(t===undefined){ tiles[k]=null; loading++; fetchBuf(`${DATA}fp/${r.id}/${key}.bin`).then(buf=>{ tiles[k]=decodeTile(buf,r,tr,tc); onLoad&&onLoad(); }).catch(()=>{ tiles[k]=[]; }); }
        else if(t) for(let j=0;j<t.length;j++){ const f=t[j]; const c=f.ring[0]; if(c[0]>=bb[0]&&c[0]<=bb[2]&&c[1]>=bb[1]&&c[1]<=bb[3]) out.push(f); } }); }
    return {items:out,loading}; };
  H.footprintOf=i=>{ for(const k in tiles){ const t=tiles[k]; if(!t) continue; for(let j=0;j<t.length;j++) if(t[j].i===i) return t[j]; } return null; };
  window.STH=H;
})();
