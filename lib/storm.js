// Illustrative Sep 12 2026 swath + homes for concept frames (shape is illustrative; counts match the app: 1,755 homes at 1in+, 1.78in max).
(function(){
  const SH=window.STORM_SHIFT||[0,0]; const A=[-97.625+SH[0],35.268+SH[1]], B=[-97.355+SH[0],35.402+SH[1]];
  function rng(seed){ let s=seed>>>0; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }
  const dx=B[0]-A[0], dy=B[1]-A[1], L=Math.hypot(dx,dy), ux=dx/L, uy=dy/L, nx=-uy, ny=ux;
  function hailAt(lon,lat){
    const px=lon-A[0], py=lat-A[1]; const t=(px*ux+py*uy)/L; const d=px*nx+py*ny;
    if(t<-0.05||t>1.05) return 0;
    const taper=Math.sin(Math.PI*Math.min(1,Math.max(0,t)))**0.6;
    const wob=0.0045*Math.sin(t*9.0)+0.003*Math.sin(t*23);
    const w=0.0125*(0.7+0.5*taper);
    const core=Math.exp(-Math.pow((d-wob)/w,2));
    return 0.55+1.23*core*taper; // 0.55..1.78
  }
  function homes(){
    const r=rng(912); const hit=[], miss=[];
    const ang=0.22; const ca=Math.cos(ang), sa=Math.sin(ang);
    // street lattice rotated slightly, block size ~ 110m
    for(let i=-120;i<=120;i++) for(let j=-90;j<=90;j++){
      if(r()<0.3) continue;
      const bx=i*0.00118, by=j*0.00092;
      const lon=-97.49+SH[0]+bx*ca-by*sa+(r()-0.5)*0.0005, lat=35.335+SH[1]+bx*sa+by*ca+(r()-0.5)*0.0004;
      const h=hailAt(lon,lat);
      if(h>=1.0) hit.push({lon,lat,h}); else if(r()<0.35) miss.push({lon,lat,h});
    }
    const r2=rng(5); for(let k=hit.length-1;k>0;k--){const q=Math.floor(r2()*(k+1));[hit[k],hit[q]]=[hit[q],hit[k]];} const extra=hit.splice(1755); extra.forEach(e=>miss.push(e)); window.__hitCount=hit.length;
    return {hit, miss};
  }
  function ribbonPoints(n){
    const r=rng(77); const pts=[];
    for(let k=0;k<n;k++){
      const t=r(); const d=(r()-0.5)*0.06;
      const lon=A[0]+dx*t+nx*d, lat=A[1]+dy*t+ny*d; const h=hailAt(lon,lat);
      if(h>0.75) pts.push({type:'Feature',properties:{w:(h-0.75)},geometry:{type:'Point',coordinates:[lon,lat]}});
    }
    return {type:'FeatureCollection',features:pts};
  }
  function squares(list, size){
    return {type:'FeatureCollection',features:list.map((p,i)=>{ const s=size*(0.8+0.4*((i*37)%10)/10), c=Math.cos(0.22), sn=Math.sin(0.22);
      const pts=[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]].map(([a,b])=>[p.lon+(a*c-b*sn)*s*1.22,p.lat+(a*sn+b*c)*s]);
      return {type:'Feature',properties:{h:p.h},geometry:{type:'Polygon',coordinates:[pts]}}; })};
  }
  function pointsFC(list){ return {type:'FeatureCollection',features:list.map(p=>({type:'Feature',properties:{h:p.h},geometry:{type:'Point',coordinates:[p.lon,p.lat]}}))}; }
  window.STORM={A,B,hailAt,homes,ribbonPoints,squares,pointsFC,
    storms:[{d:'Jul 11',iso:'2026-07-11',n:2,max:1.12},{d:'Aug 7',iso:'2026-08-07',n:988,max:2.15},{d:'Aug 16',iso:'2026-08-16',n:254,max:1.79},{d:'Aug 17',iso:'2026-08-17',n:97,max:1.57},{d:'Aug 21',iso:'2026-08-21',n:640,max:2.26},{d:'Sep 12',iso:'2026-09-12',n:1755,max:1.78}]};
})();
