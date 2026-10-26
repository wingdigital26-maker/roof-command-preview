/* Wing Digital v4 piece engine.
   THE PIECE IS SCULPTURE V5 (creative-tools/wing-logo-3d/sculpture.html), ported line for line:
   same geometry, plate layout and counts, material, studio environment, lights, tone mapping,
   colour and motion code. Nothing about its look is changed here.
   What this file ADDS is direction only: scroll chapters (hero, frame, split4, orbit, assemble,
   finale), a pointer wake in the frame pose, document-level pointer work (the stage is
   pointer-events none), an intro gate, posters as fallback and a debug handle.
   One classic script, no build step: <script src="assets/piece-engine.js" defer></script> */
(function(){
'use strict';
if(window.__wingPieceEngine) return;
window.__wingPieceEngine = true;

// ---------- [INTRO API] window.WingPiece: the shell's contract for the first-load intro ----------
// pieceAPI is set by initPiece() once the live engine is up (null in the poster fallback). playIntro is safe to
// call the moment 'wingpiece:ready' fires / window.WingPiece.ready is true, whichever path booted.
window.WingPiece = window.WingPiece || {};
var pieceAPI = null, pieceReady = false;
function firePieceReady(){
  if(pieceReady) return;
  pieceReady = true;
  window.WingPiece.ready = true;
  try{ window.dispatchEvent(new Event('wingpiece:ready')); }catch(_){}
}
window.WingPiece.playIntro = function(opts){
  opts = opts || {};
  if(pieceAPI && pieceAPI.playIntro){ pieceAPI.playIntro(opts); return; }
  // [round 8] called before the live engine is up (three.js still loading): remember it, so the flock still plays
  // the moment the engine arrives instead of the shards sitting parked off-screen forever.
  window.WingPiece._pendingIntro = true;
  // no live engine (poster fallback, WebGL/Three unavailable, or called before boot decided): never leave the
  // shell's content gated on an animation that is not going to happen.
  try{ requestAnimationFrame(function(){ try{ if(opts.onDone) opts.onDone(); }catch(_){} }); }
  catch(_){ try{ if(opts.onDone) opts.onDone(); }catch(__){} }
};

var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';
var ASSET_BASE = SCRIPT_SRC ? SCRIPT_SRC.replace(/[^\/]*$/, '') : 'assets/';
var THREE_URL = ASSET_BASE + 'vendor/three.module.min.js';   // self-hosted, same version as v5 (r170 / 0.170.0)
var ADDONS_URL = ASSET_BASE + 'vendor/three-addons/';
var POSTER_FRAME = ASSET_BASE + 'piece/v5-poster-frame.webp';
var qs = new URLSearchParams(location.search);
var DEBUG = qs.get('debug') === '1';
// test hooks (plates, motion, yaw, beat) are honoured only with debug=1, and always clamped
function dbgNum(name, lo, hi){ if(!DEBUG) return NaN; var v = parseFloat(qs.get(name)); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : NaN; }
function finiteIn(v, lo, hi){ return typeof v === 'number' && isFinite(v) && v >= lo && v <= hi; }
var CENTRE_STATES = ['hero','split4','orbit','assemble','finale'];

// ---------- stage ----------
function makeStage(){
  var s = document.getElementById('stage');
  if(!s){
    s = document.createElement('div');
    s.id = 'stage';
    document.body.insertBefore(s, document.body.firstChild);
  }
  s.setAttribute('aria-hidden','true');
  s.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;';
  return s;
}

// ---------- chapters read from the DOM ----------
function normState(s){
  s = (s||'').trim().toLowerCase();
  if(CENTRE_STATES.indexOf(s) >= 0) return s;
  return 'frame';                              // frame, calm, dock and anything unknown
}
function heroPresence(){
  // cheap scroll-only measure used by the poster fallback
  var el = document.querySelector('[data-piece-state="hero"]');
  if(!el) return 0;
  var r = el.getBoundingClientRect(), H = window.innerHeight;
  var vc = H/2, d = vc < r.top ? r.top-vc : vc > r.bottom ? vc-r.bottom : 0;
  var inside = d === 0 ? Math.min(vc-r.top, r.bottom-vc) : 0;
  if(d > 0) return Math.max(0, 0.5 - d/(0.6*H));
  return Math.min(1, 0.5 + inside/(0.6*H));
}

// [ROUND 3, owner] where the homepage hero piece sits: rects = the hero's text boxes [l,t,r,b] (the words and the mono line, which is
// the lowest one), navB = the nav's lower edge, floorY = the fold, cx / halfW = the piece's column. Returns its centre y and the tallest
// it may be (px, whole moving envelope). Shared by the live fit and the poster fallback so both put the piece in the same place.
function heroRow(rects, navB, floorY, cx, halfW){
  if(rects.length < 3) return null;
  var wr = rects.slice().sort(function(A,B){ return A[1]-B[1]; }), line = wr.pop(), a = wr[0], b = wr[wr.length-1];
  if(b[1] > a[3] + 40 && Math.min(a[2],b[2]) > cx && Math.max(a[0],b[0]) < cx)                      // stacked: one word above, one below
    return {yc:(a[3]+b[1])/2, maxH:b[1]-a[3]-52};
  var wT = 1e9, wB = -1e9; wr.forEach(function(q){ wT = Math.min(wT,q[1]); wB = Math.max(wB,q[3]); });
  var wc = (wT+wB)/2, fl = (line[0] < cx+halfW && line[2] > cx-halfW) ? line[1] : floorY, fc = (navB+fl)/2;
  var yc = wc + Math.max(-12, Math.min(12, fc-wc));
  return {yc:yc, maxH:2*Math.min(yc-(navB+50), fl-16-yc)};
}

// ---------- poster fallback: never a blank stage ----------
// Posters are tight transparent crops captured from the live engine on the real page (.ja/engine-test/posters_r3.py):
// the piece takes PH of the image height and its centre sits at PCY from the top. One per centre-stage chapter.
var PH = 0.747, PCY = 0.448;
var POSTERS = {hero:['v5-poster-hero.webp',0.9009], split4:['v5-poster-split4.webp',0.7746], assemble:['v5-poster-assemble.webp',1.3084],
               finale:['v5-poster-finale.webp',0.9197], orbit:['v5-poster-finale.webp',0.9197]};
var posterEl = null, posterOnScroll = null;
function v5Region(W, H){
  // v5's own fit region, from its CSS (checked against sculpture.html at 18 viewports, within 1px: .ja/engine-test/v5region_r3.py)
  var mob = W <= 820, cl = function(a,v,b){ return Math.max(a, Math.min(b, v)); };
  var top = (mob ? 74 : 90)*0.55;
  var hfs = mob ? cl(32, 0.094*W, 50) : cl(34, 0.043*W, 64);
  var hLines = mob ? 2 : (14.1*hfs > W-80 ? 2 : 1);
  var sfs = cl(14, 0.0115*W, 17);
  var sLines = Math.max(1, Math.ceil(26.4*sfs/Math.min(mob ? 310 : 440, W-(mob ? 44 : 80)) - 0.001));
  var stack = hfs*1.06*hLines + sfs*1.366*sLines + (mob ? 18 : cl(18, 0.032*H, 40)) + (mob ? 127.75 : 141.9);
  var bottom = H - stack - 6;
  return {yc:(top+bottom)/2, rh:Math.max(80, bottom-top)};
}
function showPosters(stage, definitive){
  if(definitive) document.documentElement.setAttribute('data-piece-fallback','');     // the page may shorten its interludes with CSS
  if(posterEl) return;
  posterEl = document.createElement('div');
  posterEl.style.cssText = 'position:absolute;inset:0;transition:opacity .5s ease;';
  // the frame poster is two gutter strips side by side in one 480x900 image: left half, right half
  var l = document.createElement('div'), r = document.createElement('div');
  var side = 'position:absolute;top:0;bottom:0;width:calc(100vh * 240 / 900);background-image:url("'+POSTER_FRAME+'");background-repeat:no-repeat;background-size:auto 100%;';
  var narrow = window.innerWidth < 1100, off = narrow ? 'calc(26px - 100vh * 240 / 900)' : '0';
  l.style.cssText = side + 'left:'+off+';background-position:left center;';
  r.style.cssText = side + 'right:'+off+';background-position:right center;';
  posterEl.appendChild(l); posterEl.appendChild(r);
  var items = [];
  Array.prototype.forEach.call(document.querySelectorAll('[data-piece-state]'), function(el){
    var st = normState(el.getAttribute('data-piece-state')), P = POSTERS[st]; if(!P) return;
    var d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:0;top:0;opacity:0;will-change:transform,opacity;background:url("'+ASSET_BASE+'piece/'+P[0]+'") center/contain no-repeat;';
    posterEl.appendChild(d);
    var stg = el, all = el.querySelectorAll('*');
    for(var k=0;k<all.length && k<30;k++){ var ps = getComputedStyle(all[k]).position; if(ps==='sticky' || ps==='-webkit-sticky'){ stg = all[k]; break; } }
    var av = Array.prototype.slice.call(el.querySelectorAll('[data-piece-avoid]'));
    if(!av.length && st==='hero') av = Array.prototype.slice.call(el.querySelectorAll('.split-head span'));
    var sm = window.innerWidth < 820 && el.hasAttribute('data-piece-scale-sm');
    items.push({el:el, stg:stg, st:st, d:d, ar:P[1], av:av, sc:parseFloat(el.getAttribute(sm ? 'data-piece-scale-sm' : 'data-piece-scale'))});
  });
  stage.appendChild(posterEl);
  posterOnScroll = function(){
    var W = window.innerWidth, H = window.innerHeight, nav = document.getElementById('nav') || document.querySelector('body > nav, body > header nav');
    var nb = nav ? Math.min(140, nav.getBoundingClientRect().bottom) : 0, maxP = 0;
    items.forEach(function(it){
      var q = it.stg.getBoundingClientRect(), sec = it.el.getBoundingClientRect();
      if(sec.bottom < -H*0.3 || sec.top > H*1.3){ it.d.style.opacity = '0'; return; }
      // presence: the chapter owns the middle of the screen; the hero fades as it scrolls away
      var vc = H/2, dist = vc < sec.top ? sec.top-vc : vc > sec.bottom ? vc-sec.bottom : 0, p = Math.max(0, Math.min(1, 1 - dist/(0.3*H)));
      if(it.st==='hero') p = Math.max(0, Math.min(1, 1 + sec.top/(0.5*H)));
      var rects = it.av.map(function(n){ return n.getBoundingClientRect(); }).filter(function(b){ return b.width>2 && b.height>2; });
      var nomH = (isNaN(it.sc) ? 0.5 : it.sc)*H, ph, cy, cx = W/2;
      var top = q.height >= H*0.9 ? Math.max(q.top, nb) : q.top, bot = q.bottom;
      if(it.st==='hero'){ var v = v5Region(W,H); ph = Math.min(Math.max(0.8376*v.rh, 0.46*H), 0.8*W/0.94); cy = q.top + v.yc;
        var row = isNaN(it.sc) ? heroRow(rects.map(function(b){ return [b.left, b.top-q.top, b.right, b.bottom-q.top]; }), nb, Math.min(q.height, H)-25, cx, ph*0.47) : null;
        if(row && row.maxH > 40){ ph = Math.min(ph, row.maxH*0.9); cy = q.top + row.yc; }
        nomH = ph; }
      else { ph = Math.min(nomH, 0.62*W/0.94); cy = (top+bot)/2; }
      var hw = ph*0.94/2+10, hh = ph/2+10;
      var hit = rects.some(function(b){ return b.left < cx+hw && b.right > cx-hw && b.top < cy+hh+ph*0.2 && b.bottom > cy-hh; });
      if(hit || cy-ph/2 < top){
        // largest vertical gap in the middle band of the stage, between the nav and the text
        var ys = [[top,top]]; rects.forEach(function(b){ if(b.left < cx+ph*0.3 && b.right > cx-ph*0.3) ys.push([b.top,b.bottom]); }); ys.push([bot,bot]);
        ys.sort(function(a,b){ return a[0]-b[0]; });
        var g0 = top, g1 = top, edge = top;
        for(var k=0;k<ys.length;k++){ if(ys[k][0]-edge > g1-g0){ g0 = edge; g1 = ys[k][0]; } edge = Math.max(edge, ys[k][1]); }
        ph = Math.max(40, Math.min(nomH, (g1-g0)*0.74, 0.8*W/0.94)); cy = (g0+g1)/2 - ph*0.06;
      }
      var boxH = ph/PH, boxW = boxH*it.ar;
      if(boxW > 0.92*W){ boxH *= 0.92*W/boxW; boxW = 0.92*W; }
      it.d.style.width = boxW+'px'; it.d.style.height = boxH+'px';
      it.d.style.transform = 'translate(' + (cx-boxW/2) + 'px,' + (cy-boxH*PCY) + 'px)';
      it.d.style.opacity = String(p); if(p > maxP) maxP = p;
    });
    l.style.opacity = r.style.opacity = String(1-maxP);
  };
  posterOnScroll();
  window.addEventListener('scroll', posterOnScroll, {passive:true});
  window.addEventListener('resize', posterOnScroll);
  window.addEventListener('load', posterOnScroll);
}
function hidePosters(){
  if(!posterEl) return;
  var el = posterEl; posterEl = null;
  document.documentElement.removeAttribute('data-piece-fallback');
  window.removeEventListener('scroll', posterOnScroll);
  window.removeEventListener('resize', posterOnScroll);
  window.removeEventListener('load', posterOnScroll);
  el.style.opacity = '0';
  setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 600);
}

function hasWebGL(){
  try{ var c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }catch(_){ return false; }
}

// =====================================================================================
// v5, ported. Comments from v5 kept. Additions are marked  [DIRECTION].
// =====================================================================================
function initPiece(THREE, container){
const options = {};
// ---- analytic logo definition (unit square, v down) ----
const MA=0.46, MB=0.54, MR=0.26;
function inside(u,v){
  if(u<0||u>1||v<0||v>1) return false;
  if(u>MA&&v<MB){
    const cx=MA+MR, cy=MB-MR;
    if(!(u<cx&&v>cy&&Math.hypot(u-cx,v-cy)>MR)) return false;
  }
  if(u<1-MA&&v>1-MB){
    const cx=1-MA-MR, cy=1-MB+MR;
    if(!(u>cx&&v<cy&&Math.hypot(u-cx,v-cy)>MR)) return false;
  }
  return true;
}

const getW = ()=> container.clientWidth || window.innerWidth;
const getH = ()=> container.clientHeight || window.innerHeight;
const ASPECT = 63/66;
const isMobile = getW() < 820;
const LOGO_H = 4.1;
const LOGO_W = LOGO_H * ASPECT;
const DEPTH = LOGO_W * 0.28;
const densityParam = dbgNum('plates', 0.5, 1.5);
const plateDensity = !isNaN(densityParam) ? densityParam : 1.0;

const scene = new THREE.Scene();
const FOV = 32, CAM_D = 13;
const camera = new THREE.PerspectiveCamera(FOV, getW()/getH(), 0.1, 100);
camera.position.set(0,0,CAM_D);

const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
renderer.setSize(getW(), getH());
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));          // v5's DPR policy
renderer.toneMapping = THREE.NeutralToneMapping; // ACES drags bright blues toward lavender; Neutral keeps the hue
renderer.toneMappingExposure = 1.0;
renderer.setClearColor(0x000000, 0);
renderer.domElement.style.cssText = 'display:block;opacity:0;transition:opacity 0.6s ease;';
container.appendChild(renderer.domElement);

// ---------- studio environment: all-cool. A navy gradient dome (so no face ever reflects pure
// black) plus softboxes that are white, steel or Wing blue only. No warm sources anywhere. ----------
const envScene = new THREE.Scene();
{
  const g = new THREE.SphereGeometry(40, 32, 24);
  const cBot = new THREE.Color('#02040c'), cMid = new THREE.Color('#0a1538'), cTop = new THREE.Color('#1a2a5c');
  const colors = new Float32Array(g.attributes.position.count*3), c = new THREE.Color();
  for(let i=0;i<g.attributes.position.count;i++){
    const t = g.attributes.position.getY(i)/40; // -1..1
    if(t<0) c.copy(cMid).lerp(cBot, Math.min(1,-t*1.6)); else c.copy(cMid).lerp(cTop, t);
    colors.set([c.r,c.g,c.b], i*3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors,3));
  const m = new THREE.MeshBasicMaterial({vertexColors:true, side:THREE.BackSide, toneMapped:false});
  envScene.add(new THREE.Mesh(g,m));
}
function softbox(w,h,x,y,z,color,intensity){
  const g = new THREE.PlaneGeometry(w,h);
  const mm = new THREE.MeshBasicMaterial({color, toneMapped:false, side:THREE.DoubleSide});
  mm.color.multiplyScalar(intensity);
  const m = new THREE.Mesh(g, mm);
  m.position.set(x,y,z); m.lookAt(0,0,0);
  envScene.add(m);
}
softbox(8,5,   -7, 7, 8,  0xf1f5ff, 5.0);   // big key softbox, upper-left-front
softbox(3.2,14, 9, 1, 6,  0xffffff, 6.5);  // tall strip right-front: the long travelling highlight
softbox(1.6,14,-9, 0,-5,  0xcfe0ff, 4.0);   // tall strip left-rear: edge catch
softbox(1.6,12, 8, 3,-7,  0x9db8ff, 8.0);   // steel-blue strip right-rear: rim
softbox(14,2.2, 0,10,-1,  0xe6eeff, 3.5);   // overhead strip: top-edge catch
softbox(13,8,   5,-8, 3,  0x2757E6, 3.2);
softbox(16,4.0, 0,-5.0,12, 0xe8efff, 3.6);  // low front band
softbox(22,14,  0, 0,16,   0x4668c4, 0.55); // dim steel-blue front fill
const pmrem = new THREE.PMREMGenerator(renderer);
const envRT = pmrem.fromScene(envScene, 0.015);
scene.environment = envRT.texture;

const key = new THREE.DirectionalLight(0xf4f7ff, 1.1); key.position.set(-5,7,9); scene.add(key);
const rim = new THREE.DirectionalLight(0x6f95ff, 5.0); rim.position.set(7,3,-7); scene.add(rim);
const rim2 = new THREE.DirectionalLight(0xcfe0ff, 3.0); rim2.position.set(-8,2,-6); scene.add(rim2);

const group = new THREE.Group();
const BASE_TILT_X = THREE.MathUtils.degToRad(10);
group.rotation.x = BASE_TILT_X;
scene.add(group);

// ---------- backdrop glow + contact glow (in-scene) ----------
function radialTex(stops){
  const c = document.createElement('canvas'); c.width=c.height=256;
  const x = c.getContext('2d'); const g = x.createRadialGradient(128,128,0,128,128,128);
  for(const [o,col] of stops) g.addColorStop(o,col);
  x.fillStyle=g; x.fillRect(0,0,256,256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// LIGHT STAGE: the backdrop is a soft white halo behind the form, and the floor sprite is a contact shadow, not a glow
const glowTex = radialTex([[0,'rgba(255,255,255,1)'],[0.4,'rgba(255,255,255,0.55)'],[0.75,'rgba(255,255,255,0.14)'],[1,'rgba(255,255,255,0)']]);
const shadowTex = radialTex([[0,'rgba(14,22,48,0.9)'],[0.4,'rgba(14,22,48,0.4)'],[0.75,'rgba(14,22,48,0.1)'],[1,'rgba(14,22,48,0)']]);
const glowMat = new THREE.SpriteMaterial({map:glowTex, transparent:true, opacity:0.2, depthWrite:false, depthTest:false, toneMapped:false});
const glow = new THREE.Sprite(glowMat); glow.renderOrder = -2; scene.add(glow);
const floorMat = new THREE.SpriteMaterial({map:shadowTex, transparent:true, opacity:0.34, depthWrite:false, depthTest:false, toneMapped:false});
const floorGlow = new THREE.Sprite(floorMat); floorGlow.renderOrder = -1; scene.add(floorGlow);

// ---------- plate records ----------
const sizeMul = (isMobile ? 1.3 : 1.0) / Math.sqrt(plateDensity);
const PITCH_X0 = 0.078*sizeMul, PITCH_Y0 = 0.048*sizeMul;
const SEAM = 0.005;                  // hairline gap between plates, world units
const SZ = 0.03;                     // face-plate thickness
const colsN = Math.round(LOGO_W/PITCH_X0), rowsN = Math.round(LOGO_H/PITCH_Y0);
const PITCH_X = LOGO_W/colsN, PITCH_Y = LOGO_H/rowsN;
const PLATE_W = PITCH_X;

const records = []; // {pos, quat, normal, sx,sy,sz}
const qBack = new THREE.Quaternion().setFromEuler(new THREE.Euler(0,Math.PI,0));
// inside spans of a row, found by fine sampling, so every plate is clipped to the true outline
function rowSpans(v){
  const S=800, spans=[]; let start=-1;
  for(let i=0;i<=S;i++){
    const u=(i+0.5)/S, inn = i<S && inside(u,v);
    if(inn && start<0) start=i/S;
    if(!inn && start>=0){ spans.push([start, i/S]); start=-1; }
  }
  return spans;
}
let frontBackCount = 0;
for(let r=0;r<rowsN;r++){
  const v = (r+0.5)/rowsN;
  const y = LOGO_H/2 - v*LOGO_H;
  const off = (r%2===0)?0:0.5;
  for(const [u0,u1] of rowSpans(v)){
    const xs0 = u0*LOGO_W, xs1 = u1*LOGO_W;
    for(let c=-1;c<=colsN;c++){
      let a = Math.max((c+off)*PITCH_X, xs0), b = Math.min((c+off+1)*PITCH_X, xs1);
      if(b-a < PITCH_X*0.22) continue;
      // absorb a sliver neighbour so edges stay clean
      if(a-xs0 < PITCH_X*0.22) a = xs0;
      if(xs1-b < PITCH_X*0.22) b = xs1;
      const x = -LOGO_W/2 + (a+b)/2;
      const sx = (b-a)-SEAM, sy = PITCH_Y-SEAM;
      records.push({pos:new THREE.Vector3(x,y,DEPTH/2+SZ/2), quat:new THREE.Quaternion(), normal:new THREE.Vector3(0,0,1), sx,sy,sz:SZ});
      records.push({pos:new THREE.Vector3(x,y,-DEPTH/2-SZ/2), quat:qBack.clone(), normal:new THREE.Vector3(0,0,-1), sx,sy,sz:SZ});
      frontBackCount += 2;
    }
  }
}

// side walls: walk the full outline (clockwise in uv)
function outlinePoints(spacingW){
  const pts = [];
  function addSeg(x0,y0,x1,y1){
    const dx=(x1-x0)*LOGO_W, dy=(y1-y0)*LOGO_H, len=Math.hypot(dx,dy);
    const n = Math.max(1, Math.round(len/spacingW));
    const tx=dx/len, ty=dy/len;
    for(let i=0;i<n;i++){ const t=(i+0.5)/n; pts.push({u:x0+(x1-x0)*t, v:y0+(y1-y0)*t, tx, ty, nx:ty, ny:-tx, pitch:len/n}); }
  }
  function addArc(cx,cy,r,a0,a1){
    // r is in u units; the mark is near-square so treat the fillet as circular in world space
    const rw = r*(LOGO_W+LOGO_H)/2;
    const len = Math.abs(a1-a0)*rw;
    const n = Math.max(1, Math.round(len/spacingW));
    const dir=Math.sign(a1-a0);
    for(let i=0;i<n;i++){
      const a=a0+(a1-a0)*(i+0.5)/n;
      const ca=Math.cos(a), sa=Math.sin(a);
      let tx=-sa*dir*LOGO_W, ty=ca*dir*LOGO_H; const tl=Math.hypot(tx,ty); tx/=tl; ty/=tl;
      pts.push({u:cx+r*ca, v:cy+r*sa, tx, ty, nx:ty, ny:-tx, pitch:len/n});
    }
  }
  addSeg(0,0, MA,0);
  addSeg(MA,0, MA,MB-MR);
  addArc(MA+MR, MB-MR, MR, Math.PI, Math.PI/2);
  addSeg(MA+MR,MB, 1,MB);
  addSeg(1,MB, 1,1);
  addSeg(1,1, 1-MA,1);
  addSeg(1-MA,1, 1-MA,1-MB+MR);
  addArc(1-MA-MR, 1-MB+MR, MR, 0, -Math.PI/2);
  addSeg(1-MA-MR,1-MB, 0,1-MB);
  addSeg(0,1-MB, 0,0);
  return pts;
}
const SIDE_SZ = 0.03;
const sideStackN = Math.max(4, Math.round(7/sizeMul));
const sideSpan = DEPTH + 2*SZ;
let sideCount = 0;
for(const p of outlinePoints(PLATE_W*1.25)){
  const wx = (p.u-0.5)*LOGO_W, wy = -(p.v-0.5)*LOGO_H;
  const normal3 = new THREE.Vector3(p.nx,-p.ny,0).normalize();
  const tangent3 = new THREE.Vector3(p.tx,-p.ty,0).normalize();
  const yAxis = new THREE.Vector3().crossVectors(normal3, tangent3).normalize();
  const baseQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(tangent3, yAxis, normal3));
  for(let s=0;s<sideStackN;s++){
    const depthOff = -sideSpan/2 + (s+0.5)*(sideSpan/sideStackN);
    const pos = new THREE.Vector3(wx+normal3.x*SIDE_SZ/2, wy+normal3.y*SIDE_SZ/2, depthOff);
    records.push({pos, quat:baseQ.clone(), normal:normal3.clone(), sx:p.pitch-SEAM, sy:sideSpan/sideStackN-SEAM, sz:SIDE_SZ});
    sideCount++;
  }
}
const OUTLINE = outlinePoints(0.12).map(p=>[(p.u-0.5)*LOGO_W, -(p.v-0.5)*LOGO_H]);
let NECK_IDX = 0; { let bd=1e9; OUTLINE.forEach((q,i)=>{ const d=Math.hypot(q[0]-(MA-0.5)*LOGO_W,q[1]-0.5*LOGO_H); if(d<bd){bd=d;NECK_IDX=i;} }); }
const plateCounts = {front: frontBackCount/2, back: frontBackCount/2, sides: sideCount, total: records.length};

// ---------- interior: NO solid core. The volume is packed with coarser, thicker fragments in the same
// InstancedMesh (3 layers of chunks through the depth). ----------
const OUTER_N = records.length;
{
  const INNER_LAYERS = 3, IK = 1.75;
  const iCols = Math.max(2, Math.round(colsN/IK)), iRows = Math.max(2, Math.round(rowsN/IK));
  const IPX = LOGO_W/iCols, IPY = LOGO_H/iRows, ISEAM = 0.012;
  const layerT = DEPTH/INNER_LAYERS;
  for(let L=0;L<INNER_LAYERS;L++){
    const z = -DEPTH/2 + (L+0.5)*layerT;
    const nzSign = L===0 ? -1 : 1;
    for(let r=0;r<iRows;r++){
      const v=(r+0.5)/iRows, y=LOGO_H/2 - v*LOGO_H;
      const off = ((r+L)%2===0)?0:0.5;
      for(const [u0,u1] of rowSpans(v)){
        const xs0=u0*LOGO_W, xs1=u1*LOGO_W;
        for(let c=-1;c<=iCols;c++){
          let a=Math.max((c+off)*IPX, xs0), b=Math.min((c+off+1)*IPX, xs1);
          if(b-a < IPX*0.22) continue;
          if(a-xs0 < IPX*0.22) a=xs0;
          if(xs1-b < IPX*0.22) b=xs1;
          records.push({pos:new THREE.Vector3(-LOGO_W/2+(a+b)/2, y, z), quat:(nzSign<0?qBack.clone():new THREE.Quaternion()), normal:new THREE.Vector3(0,0,nzSign), sx:(b-a)-ISEAM, sy:IPY-ISEAM, sz:layerT-ISEAM, inner:true, layer:L});
        }
      }
    }
  }
}
plateCounts.inner = records.length-OUTER_N; plateCounts.total = records.length;
window.__plateCounts = plateCounts;

// ---------- plate geometry: a box with chamfered top edges, so every tile has its own edge catch ----------
function chamferedPlate(cx, cy, cz){
  const X=0.5, Y=0.5, zt=0.5, zb=-0.5, zc=0.5-cz, xi=0.5-cx, yi=0.5-cy;
  const P=[]; const quad=(a,b,c,d)=>P.push(...a,...b,...c, ...a,...c,...d);
  quad([-xi,-yi,zt],[xi,-yi,zt],[xi,yi,zt],[-xi,yi,zt]);                 // top
  quad([-X,-Y,zc],[X,-Y,zc],[xi,-yi,zt],[-xi,-yi,zt]);                   // chamfers
  quad([X,-Y,zc],[X,Y,zc],[xi,yi,zt],[xi,-yi,zt]);
  quad([X,Y,zc],[-X,Y,zc],[-xi,yi,zt],[xi,yi,zt]);
  quad([-X,Y,zc],[-X,-Y,zc],[-xi,-yi,zt],[-xi,yi,zt]);
  quad([-X,-Y,zb],[X,-Y,zb],[X,-Y,zc],[-X,-Y,zc]);                       // walls
  quad([X,-Y,zb],[X,Y,zb],[X,Y,zc],[X,-Y,zc]);
  quad([X,Y,zb],[-X,Y,zb],[-X,Y,zc],[X,Y,zc]);
  quad([-X,Y,zb],[-X,-Y,zb],[-X,-Y,zc],[-X,Y,zc]);
  quad([-X,Y,zb],[X,Y,zb],[X,-Y,zb],[-X,-Y,zb]);                         // bottom
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P,3));
  g.computeVertexNormals();
  return g;
}
const CH = 0.0042; // chamfer width, world units
const geo = chamferedPlate(CH/PITCH_X, CH/PITCH_Y, 0.12);

const N = records.length;
const mat = new THREE.MeshPhysicalMaterial({
  color:0xffffff, metalness:1, roughness:0.24, envMapIntensity:1.0,
  clearcoat:0.42, clearcoatRoughness:0.08
});
// per-plate roughness offset so neighbouring tiles catch the same softbox differently
const leakUniform = {value:0};
const fillUniform = {value:0};   // [DIRECTION] split4: a navy fill light on every plate so dimmed or small slabs read as solid metal, never as a bright-edged mesh. 0 = v5 exactly.
const clusterBoost = {value:new THREE.Vector4(0,0,0,0)};   // [DIRECTION] split4: the active cluster catches more light. All zero = v5 exactly.
mat.onBeforeCompile = (sh)=>{
  sh.uniforms.uLeak = leakUniform;
  sh.uniforms.uCB = clusterBoost;
  sh.uniforms.uFill = fillUniform;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aRough;\nattribute float aInner;\nattribute float aCluster;\nvarying float vRough;\nvarying float vInner;\nvarying float vCluster;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRough = aRough;\nvInner = aInner;\nvCluster = aCluster;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vRough;\nvarying float vInner;\nvarying float vCluster;\nuniform float uLeak;\nuniform float uFill;\nuniform vec4 uCB;')
    .replace('#include <color_fragment>', '#include <color_fragment>\n{ float cb = vCluster < 0.5 ? uCB.x : vCluster < 1.5 ? uCB.y : vCluster < 2.5 ? uCB.z : uCB.w; diffuseColor.rgb *= 1.0 + cb; }')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vInner * uLeak * vec3(0.247,0.427,1.0) + uFill * vec3(0.03,0.07,0.24); { float cb2 = vCluster < 0.5 ? uCB.x : vCluster < 1.5 ? uCB.y : vCluster < 2.5 ? uCB.z : uCB.w; totalEmissiveRadiance += max(cb2, 0.0) * vec3(0.03,0.07,0.24); }')
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + vRough, 0.05, 1.0);');
};
const mesh = new THREE.InstancedMesh(geo, mat, N);
mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
mesh.frustumCulled = false;
group.add(mesh);

// ---------- per-plate typed arrays ----------
const homePos = new Float32Array(N*3), homeQuat = new Float32Array(N*4), normals = new Float32Array(N*3);
const scales = new Float32Array(N*3), randoms = new Float32Array(N*3);
const scatPos = new Float32Array(N*3), tAxis = new Float32Array(N*3), tBase = new Float32Array(N), tSpeed = new Float32Array(N);
const stagger = new Float32Array(N);   // 0..1 along the logo's own diagonal: the order tiles leave and return in
const prog = new Float32Array(N);      // 0 = home, 1 = out in the cloud
const lift = new Float32Array(N);      // damped push/wave lift along the normal
const aRough = new Float32Array(N), aInner = new Float32Array(N);
const flyDelay = new Float32Array(N), retDelay = new Float32Array(N), liftMul = new Float32Array(N), waveF = new Float32Array(N);

// [DIRECTION] per-plate arrays for the chapter poses
const fprog = new Float32Array(N);     // 0 = with the form, 1 = out in the frame
const fSide = new Float32Array(N), fT = new Float32Array(N), fY0 = new Float32Array(N), fZ = new Float32Array(N);
const fPar = new Float32Array(N), fSc = new Float32Array(N), fPh = new Float32Array(N);
const fDrift = new Float32Array(N), fGl = new Float32Array(N);   // slow vertical drift (ndc/s) and scroll-driven spin (rad per viewport)
const wakeX = new Float32Array(N), wakeY = new Float32Array(N);
const order = new Float32Array(N);     // assemble: build order, bottom up, 0..0.97
const aCluster = new Float32Array(N);  // split4: 0..3 in bands along the mark's own diagonal
const orbSel = new Uint8Array(N), orbA = new Float32Array(N), orbR = new Float32Array(N), orbY = new Float32Array(N), orbSt = new Float32Array(N), orbRXtra = new Float32Array(N);

// deep anodized navy. Metal takes its colour from reflections, so the base has to sit well above the
// page colour or it reads black; per-plate variation is kept to a few percent of lightness.
const baseCol = new THREE.Color('#122c80'), tmpCol = new THREE.Color();
const _e = new THREE.Euler(), _tq = new THREE.Quaternion(), _hq = new THREE.Quaternion();
const MICRO_TILT = THREE.MathUtils.degToRad(0.38), PILLOW = THREE.MathUtils.degToRad(7);
const FY_WRAP = 1.34;                  // frame plates live in ndc y [-FY_WRAP, FY_WRAP] and wrap, invisibly, off-screen
const THIN = isMobile ? 0.34 : 0.5;   // [DIRECTION] share of plates the frame parks off-screen so it stays loose
const diagVals = new Float32Array(N);
for(let i=0;i<N;i++){
  const r = records[i];
  const lx = r.quat.w<0.5 && r.normal.z<0 ? -r.pos.x : r.pos.x;
  const isFace = Math.abs(r.normal.z)>0.5 && !r.inner;
  const pilY = isFace ? (lx/LOGO_W)*2*PILLOW : 0, pilX = isFace ? (-r.pos.y/LOGO_H)*2*PILLOW : (r.inner ? 0 : (r.pos.z/DEPTH)*2*PILLOW*0.6);
  _e.set(pilX+(Math.random()-0.5)*2*MICRO_TILT, pilY+(Math.random()-0.5)*2*MICRO_TILT, 0);
  _hq.copy(r.quat).multiply(_tq.setFromEuler(_e));
  homePos.set([r.pos.x,r.pos.y,r.pos.z], i*3);
  homeQuat.set([_hq.x,_hq.y,_hq.z,_hq.w], i*4);
  normals.set([r.normal.x,r.normal.y,r.normal.z], i*3);
  scales.set([r.sx,r.sy,r.sz], i*3);
  const rx=Math.random()-0.5, ry=Math.random()-0.5, rz=Math.random()-0.5;
  randoms.set([rx,ry,rz], i*3);
  const dist = 0.55 + Math.abs(rx)*1.5;
  // the cloud keeps the mark's silhouette: tiles drift out along their own normal plus a modest jitter
  scatPos.set([r.pos.x*1.1 + r.normal.x*dist + rx*0.9, r.pos.y*1.0 + r.normal.y*dist*0.7 + ry*0.6, r.pos.z + r.normal.z*dist*1.3 + rz*1.6], i*3);
  if(r.inner){ // interior chunks spread wide through the cloud instead of clumping where the body was
    scatPos[i*3] = r.pos.x*1.25 + rx*2.4; scatPos[i*3+1] = r.pos.y*1.12 + ry*1.9; scatPos[i*3+2] = r.pos.z*1.6 + rz*3.4;
  }
  const al = Math.hypot(rx,ry,rz)||1;
  tAxis.set([rx/al, ry/al, rz/al], i*3);
  tBase[i] = 1.2 + Math.random()*3.2;
  tSpeed[i] = (0.25 + Math.random()*0.55) * (Math.random()<0.5?-1:1);
  stagger[i] = THREE.MathUtils.clamp(((r.pos.x/LOGO_W) - (r.pos.y/LOGO_H) + 1)/2 + (Math.random()-0.5)*0.08, 0, 1);
  aRough[i] = (Math.random()-0.5)*0.07 + (r.inner ? 0.14 : 0);
  const inn = !!r.inner;
  aInner[i] = inn ? 1 : 0;
  flyDelay[i] = inn ? 0.42 + (r.layer===1 ? 0.22 : 0) + Math.random()*0.15 : 0;
  retDelay[i] = inn ? 0 : 0.32;
  liftMul[i] = inn ? (r.layer===1 ? 0.3 : 0.55) : 1;
  // the wave is a 3D field: along the logo's diagonal AND through the depth
  waveF[i] = ((r.pos.x/LOGO_W) - (r.pos.y/LOGO_H) + 1)/2 - (r.pos.z/DEPTH)*0.16;
  const l = (1 + (Math.random()-0.5)*0.06) * (inn ? 0.72 : 1);
  tmpCol.copy(baseCol).multiplyScalar(l);
  mesh.setColorAt(i, tmpCol);

  // [DIRECTION] static pose data
  fSide[i] = Math.abs(r.pos.x) < 0.18 ? (Math.random()<0.5?-1:1) : Math.sign(r.pos.x);
  const u = Math.random();
  fT[i] = Math.random() < THIN ? 1.35 + Math.random()*0.8 : (isMobile ? u*u : 1 - u*u);      // denser toward the outer edge, sparse near the column
  fY0[i] = (Math.random()*2-1)*FY_WRAP;
  // depth layering: most plates small and far, a middle field, and a few near, larger ones that hug the outer edge
  const lay = Math.random();
  if(lay < 0.62){ fZ[i] = -10 + Math.random()*6.5; fSc[i] = 0.62 + Math.random()*0.3; }
  else if(lay < 0.955){ fZ[i] = -3.5 + Math.random()*5; fSc[i] = 0.62 + Math.random()*0.38; }
  else { fZ[i] = 3.2 + Math.random()*3.2; fSc[i] = 0.9 + Math.random()*0.3; if(fT[i] < 1) fT[i] = 0.72 + Math.random()*0.4; }
  const near01 = (fZ[i]+10)/16.4;
  fPar[i] = 0.05 + near01*near01*0.4;                                       // scroll parallax: share of the page's own travel
  fDrift[i] = (0.006 + near01*0.016)*(0.6+Math.random()*0.8);
  fGl[i] = (1.2 + Math.random()*2.6)*(Math.random()<0.5?-1:1);
  fPh[i] = Math.random()*Math.PI*2;
  order[i] = THREE.MathUtils.clamp(((r.pos.y/LOGO_H)+0.5)*0.86 + (inn?0:0.05) + Math.random()*0.06, 0, 0.97);
  diagVals[i] = ((r.pos.x/LOGO_W) - (r.pos.y/LOGO_H) + 1)/2;
  // [INTRO API round 5] EVERY plate gets ring parameters (so the opening spiral carries the whole piece and
  // nothing sits in the centre at t=0); orbSel still marks only the 85% non-inner subset that the small
  // ambient "orbit" chapter lifts. orbRXtra is now a unitless spread (1..1.45) multiplied per frame by the
  // viewport-aware start radius introR0 (see updatePlates), so the spiral starts beyond the frame on any width.
  orbA[i] = Math.random()*Math.PI*2; orbR[i] = 2.85 + Math.random()*0.55 + (Math.random()<0.2?Math.random()*0.5:0);
  orbY[i] = (Math.random()-0.5)*0.7; orbSt[i] = Math.random();
  orbRXtra[i] = 0.35 + 0.65*Math.sqrt(Math.random());   // [round 7] this plate's radius FRACTION inside the intro field disc (sqrt = uniform over the disc area)
  if(!inn && Math.random() < 0.85) orbSel[i] = 1;
}
{ // four clusters: each of the mark's two blocks cut in two by a horizontal plane. Gaps between horizontal slabs are
  // vertical air, which no sway angle can close, so it reads as four from the front at any yaw.
  for(let i=0;i<N;i++){ const v = 0.5 - homePos[i*3+1]/LOGO_H; aCluster[i] = v<0.25 ? 0 : v<0.5 ? 1 : v<0.75 ? 2 : 3; }
}
geo.setAttribute('aRough', new THREE.InstancedBufferAttribute(aRough,1));
geo.setAttribute('aInner', new THREE.InstancedBufferAttribute(aInner,1));
geo.setAttribute('aCluster', new THREE.InstancedBufferAttribute(aCluster,1));
mesh.instanceColor.needsUpdate = true;

// ---------- layout ----------
const EXT_H = LOGO_H*Math.cos(BASE_TILT_X) + DEPTH*Math.sin(BASE_TILT_X) + 0.1;
const EXT_W = LOGO_W*0.86 + DEPTH*0.62; // widest silhouette over the idle sway
let restYpx = 0, anchorY = 0;
let fitScale = 1, baseY = 0, visH = 1, visW = 1, navBottom = 0;
// [DIRECTION] the size of the piece per chapter, as a share of viewport height (hero is Jack's approved large centred piece)
const STATE_FILL = {hero:0.64, split4:0.5, orbit:0.4, assemble:0.56, finale:0.68};
const STATE_WMAX = {hero:0.8, split4:0.62, orbit:0.5, assemble:0.8, finale:0.8};   // share of viewport width the silhouette may take
let chapters = [], colHalfPx = 480, docH = 0;
// [DIRECTION] FREE-RECT FIT. In every centre-stage chapter the piece is sized and placed from the space that is actually free:
// the chapter's stage (its sticky child, else the section) minus the rects of its visible text ([data-piece-avoid] elements,
// else every element that directly holds text: headings, labels, pill rows, captions). The piece takes the largest free
// rectangle, with a margin, and never grows past its nominal scale (STATE_FILL, data-piece-scale, data-piece-scale-sm under 820px).
const STATE_EXT = {hero:[EXT_W,EXT_H], finale:[EXT_W,EXT_H], assemble:[EXT_W,EXT_H], split4:[EXT_W+0.5,EXT_H+1.45], orbit:[6.6,EXT_H+0.5]};
// [ROUND 3] ZERO CROP. The REAL silhouette of each state, measured from rendered pixels (.visual/round-3/calib.py), in engine units:
// [width, height] is the symmetric envelope around the anchor over the idle sway, float and beats, and it INCLUDES what the state adds
// around the core (the orbit ring, the parted slabs and the stepped-forward slab). REST_H is the lit height at rest, for the minimum size.
// The v5-framed homepage hero keeps STATE_EXT (its framing is v5's and must not move); every free-rect fit uses these.
const REAL_EXT = {hero:[4.6,4.95], finale:[4.5,4.8], assemble:[4.5,4.8], split4:[5.35,6.65], orbit:[8.12,4.9]};
const REST_H = {hero:4.3, finale:4.25, assemble:4.25, split4:5.45, orbit:4.3};
// Off the screen centre the fixed camera sees the form's depth as extra width / height (the ring's near side slides outward): the
// envelope grows with the view angle k = tan(angle off axis). Z_HALF is each state's half depth in engine units.
// Z_FWD / Z_BACK: how far each state reaches toward / away from the camera (split4's lit slab steps 1.25 forward). What reaches forward
// slides OUTWARD from the screen centre, so the envelope is lopsided: the third and fourth values shift the anchor back toward the centre.
const Z_FWD = {hero:0.62, finale:0.62, assemble:0.62, split4:2.5, orbit:3.95}, Z_BACK = {hero:0.62, finale:0.62, assemble:0.62, split4:0.8, orbit:3.95};
function extAt(state, rext, kx, ky){
  const zf = Z_FWD[state] || 0.62, zb = Z_BACK[state] || 0.62;
  if(state==='orbit') return [Math.hypot(rext[0], 2*zf*kx)*1.05, Math.max(rext[1], 3.1 + 2*zf*ky), 0, 0];
  return [rext[0] + (zf+zb)*kx, rext[1] + (zf+zb)*ky, (zf-zb)/2*kx, (zf-zb)/2*ky];
}
const EDGE_M = 24;                   // the silhouette keeps at least this many px from every viewport edge
// [DIRECTION] THE HERO IS FRAMED LIKE V5'S OWN PAGE. v5 fits the piece into the region between its topbar and its type stack
// (region top = 0.55 x topbar bottom, bottom = type stack top - 6; scale = min(0.84 x region, 0.8 x width); centre = region centre),
// which puts it ABOVE screen centre, seen slightly from below by the fixed camera. This reproduces that region from v5's own CSS
// (checked against sculpture.html at 18 viewports, within 1px: .ja/engine-test/v5region_r3.py) so the site hero is the same picture.
function v5HeroScale(W, H){ return Math.min(0.80*(v5Region(W,H).rh/H)*visH/EXT_H, 0.8*visW/EXT_W); }
// On short viewports v5's own headline and CTA stack (which this page does not have) would squeeze the piece to a sliver.
// There the hero falls back to the free-rect fit with this floor as its nominal size. Normal desktop and phone viewports
// sit above the floor, so they keep v5's exact framing.
const HERO_FLOOR = 0.46;
function heroFloorScale(){ return Math.min(HERO_FLOOR*visH/EXT_H, 0.8*visW/EXT_W); }
function heroIsV5(W, H){ return v5HeroScale(W,H) >= heroFloorScale()*0.999; }
function scaleFor(state, custom){
  if(state==='hero' && !(custom && custom>0.05 && custom<0.95)) return Math.max(v5HeroScale(getW(), getH()), heroFloorScale());
  const fh = (custom && custom>0.05 && custom<0.95) ? custom : STATE_FILL[state];
  return Math.min(fh*visH/EXT_H, STATE_WMAX[state]*visW/EXT_W);
}
function textEls(root){
  let els = Array.prototype.slice.call(root.querySelectorAll('[data-piece-avoid]'));
  if(els.length) return els;
  const seen = new Set(), tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n; while((n = tw.nextNode())){
    if(!n.nodeValue || !n.nodeValue.trim()) continue;
    const e = n.parentElement; if(!e || seen.has(e)) continue;
    const tag = e.tagName; if(tag==='SCRIPT' || tag==='STYLE' || tag==='NOSCRIPT') continue;
    seen.add(e); if(seen.size >= 40) break;
  }
  return Array.from(seen);
}
function stageOf(el){
  let n = 0;
  for(const ch of el.querySelectorAll('*')){ if(++n > 30) break; const p = getComputedStyle(ch).position; if(p==='sticky' || p==='-webkit-sticky') return ch; }
  return el;
}
const pushR = [];                    // this frame's text rects in viewport px [l,t,r,b], for bending loose plates around text
function fitChapter(c, W, H){
  const sr = c.stageEl.getBoundingClientRect();
  const raw = c.fitRaw, els = c.avoid; let changed = c.fit === null || Math.abs(c.fitW-sr.width)>0.5 || Math.abs(c.fitH-sr.height)>0.5, k = 0;
  for(let i=0;i<els.length && k<160;i++){
    const q0 = els[i].getBoundingClientRect(), none = q0.width<2||q0.height<2;
    // [STAGE 7] avoid the TEXT, not the block box: a heading is a full-width block, its words are not. Insets are cached per element size.
    let ti = c.tight[i];
    if(!none && (!ti || Math.abs(ti[4]-q0.width)>0.5 || Math.abs(ti[5]-q0.height)>0.5)){
      ti = [0,0,0,0,q0.width,q0.height];
      try{ const rg = document.createRange(); rg.selectNodeContents(els[i]); const rr = rg.getBoundingClientRect();
        if(rr.width>=2 && rr.height>=2){ ti[0]=Math.max(0,rr.left-q0.left); ti[1]=Math.max(0,rr.top-q0.top); ti[2]=Math.max(0,q0.right-rr.right); ti[3]=Math.max(0,q0.bottom-rr.bottom); } }catch(_){}
      c.tight[i] = ti;
    }
    const q = none ? q0 : {left:q0.left+ti[0], top:q0.top+ti[1], right:q0.right-ti[2], bottom:q0.bottom-ti[3]};
    const l = none ? 0 : q.left-sr.left, t = none ? 0 : q.top-sr.top, r = none ? 0 : q.right-sr.left, b = none ? 0 : q.bottom-sr.top;
    if(Math.abs(raw[k]-l)>0.6 || Math.abs(raw[k+1]-t)>0.6 || Math.abs(raw[k+2]-r)>0.6 || Math.abs(raw[k+3]-b)>0.6) changed = true;
    raw[k]=l; raw[k+1]=t; raw[k+2]=r; raw[k+3]=b; k+=4;
  }
  if(changed){
    c.fitW = sr.width; c.fitH = sr.height;
    // [STAGE 7] the usable stage: below the nav (plus a margin) and above the fold, measured where the chapter RESTS:
    // a pinned stage rests at the top of the screen, a page head rests where it is at scroll 0.
    const pinned = c.stageEl !== c.el || sr.height >= H*0.9, sy_ = window.scrollY || window.pageYOffset || 0;
    const restTop = c.isHead && !pinned ? sr.top+sy_ : 0, navM = 16;
    const y0v5 = sr.height >= H*0.9 ? navBottom : 0;
    // [ROUND 3] the stage stops EDGE_M short of every viewport edge (the fit margin m counts toward it), so nothing rests against an edge
    const m = Math.max(10, Math.min(W,H)*0.03), eIn = Math.max(0, EDGE_M+1-m);
    const pad = Math.max(3, 19-m), padX = pad;   // text keeps pad + m >= 19px from the silhouette
    const x0 = Math.max(0, eIn-sr.left), x1 = Math.min(sr.width, W-eIn-sr.left), y0 = (pinned || c.isHead) ? Math.max(0, navBottom+navM-restTop) : 0;
    const y1 = c.isHead && !pinned ? Math.min(sr.height, H-eIn-restTop) : pinned ? Math.min(sr.height, H-eIn) : sr.height;
    // merge text rects into bands
    let rs = [];
    for(let i=0;i<k;i+=4){ if(raw[i+2]-raw[i] < 2) continue; rs.push([Math.max(x0,raw[i]-padX), Math.max(y0,raw[i+1]-pad), Math.min(x1,raw[i+2]+padX), Math.min(y1,raw[i+3]+pad)]); }
    rs = rs.filter((r)=> r[2]>r[0] && r[3]>r[1]);
    for(let again=true; again;){
      again = false;
      for(let i=0;i<rs.length && !again;i++) for(let j=i+1;j<rs.length;j++){
        const A = rs[i], B = rs[j];
        if(A[0] <= B[2]+28 && B[0] <= A[2]+28 && A[1] <= B[3]+14 && B[1] <= A[3]+14){ rs[i] = [Math.min(A[0],B[0]),Math.min(A[1],B[1]),Math.max(A[2],B[2]),Math.max(A[3],B[3])]; rs.splice(j,1); again = true; break; }
      }
    }
    while(rs.length > 8){ rs.sort((A,B)=>(A[2]-A[0])*(A[3]-A[1])-(B[2]-B[0])*(B[3]-B[1])); rs.shift(); }
    // largest free rectangle for this chapter's silhouette
    const ext = STATE_EXT[c.state] || STATE_EXT.hero, rext = REAL_EXT[c.state] || REAL_EXT.hero;
    const nomPx = scaleFor(c.state, c.custom)*H/visH;
    const xs = [x0,x1], ys = [y0,y1];
    for(const r of rs){ xs.push(r[0],r[2]); ys.push(r[1],r[3]); }
    const isHero = c.state==='hero';
    const v5ok = isHero && heroIsV5(W,H);
    let dcx = (x0+x1)/2, dcy = v5ok ? v5Region(W,H).yc : (y0+y1)/2, heroPx = 0;
    // [ROUND 3, owner] THE HOMEPAGE HERO SITS LOWER THAN V5'S OWN PAGE. v5 framed the piece above centre, over a tall type stack this
    // page does not have, so it rode up under the nav. Vertical placement only (size logic, camera and look stay v5's): the piece is
    // level with the hero words (nudged at most 12px toward the middle of the free band between the nav and the mono line under it),
    // never closer than 48px to the nav, shrinking a little on short windows if that is what it takes. Where the words stack above
    // and below the piece (phones), it sits midway between them, at least 24px clear of each.
    if(isHero && c.isHead && !(c.custom > 0.05 && c.custom < 0.95) && k >= 12){
      const wr = []; for(let i=0;i<k;i+=4) if(raw[i+2]-raw[i] >= 2) wr.push([raw[i],raw[i+1],raw[i+2],raw[i+3]]);
      const row = heroRow(wr, navBottom, y1, dcx, ext[0]*nomPx/2);
      if(row){ const u = Math.min(nomPx, row.maxH/REAL_EXT.hero[1]); if(u > 8){ heroPx = u; dcy = row.yc; } }
    }
    let best = null, bestEff = -1, bestD = -1, bestExt = rext, bestOff = [0,0];
    // [STAGE 7] never tiny: the silhouette must reach a minimum share of the screen, else this chapter falls back to the frame pose
    const restH = REST_H[c.state] || REST_H.hero;
    const minPx = Math.min((W < 820 ? 0.162 : 0.222)*H/restH, nomPx);   // the lit pixels at rest reach 16 / 22 percent of the screen height
    let tTop = 1e9, tBot = -1e9; for(const r of rs){ tTop = Math.min(tTop, r[1]); tBot = Math.max(tBot, r[3]); }
    const onScreenX = Math.abs(sr.left) < 1 && Math.abs(sr.width-W) < 2;
    if(heroPx > 0 || (v5ok && dcy - ext[1]*nomPx/2 >= y0v5)){                     // never under the nav
      // v5's size and look first. Only when text would truly be covered does the search below run.
      const hPx = heroPx > 0 ? heroPx : nomPx, hw = ext[0]*hPx/2, hh = ext[1]*hPx/2; let hit = false;
      for(const r of rs){ if(r[0] < dcx+hw && r[2] > dcx-hw && r[1] < dcy+hh && r[3] > dcy-hh){ hit = true; break; } }
      if(!hit){ best = [x0, Math.min(y0v5, dcy-hh), x1, Math.max(y1, dcy+hh)]; bestEff = hPx; bestD = 1e9; }
    }
    if(!best) for(let a=0;a<xs.length;a++) for(let b=0;b<xs.length;b++){
      const xa = xs[a], xb = xs[b]; if(xb-xa < 40) continue;
      for(let e=0;e<ys.length;e++) for(let f=0;f<ys.length;f++){
        const ya = ys[e], yb = ys[f]; if(yb-ya < 40) continue;
        let hit = false;
        for(const r of rs){ if(r[0] < xb-0.5 && r[2] > xa+0.5 && r[1] < yb-0.5 && r[3] > ya+0.5){ hit = true; break; } }
        if(hit) continue;
        // [ROUND 3] zero crop: the REAL silhouette shrinks to fit the free rectangle; it never runs off an edge
        let eX = rext, eff = 0, hw = 0, hh = 0, px_ = 0, py_ = 0;
        for(let pass=0; pass<3; pass++){                // the envelope depends on where the form ends up, which depends on its size
          const sfit = Math.min((xb-xa-2*m)/eX[0], (yb-ya-2*m)/eX[1]);
          eff = Math.min(sfit, nomPx); if(eff <= 0) break;
          hw = eX[0]*eff/2+m; hh = eX[1]*eff/2+m;
          px_ = Math.max(xa+hw, Math.min(xb-hw, dcx)); py_ = Math.max(ya+hh, Math.min(yb-hh, dcy));
          if(pass < 2){
            const ox = Math.abs(px_+sr.left-W/2), oy = Math.abs(py_+restTop-H/2);
            eX = extAt(c.state, rext, ox/(W/2)*(visW/2)/CAM_D, oy/(H/2)*(visH/2)/CAM_D);
          }
        }
        if(eff <= 0) continue;
        // biggest wins, but a slightly smaller piece near the stage centre beats a slightly bigger one in a corner
        // the size it allows decides; nearness to the stage centre breaks ties; page heads on wide screens prefer the side gutters
        const side = rs.length && (ya+yb)/2 > tTop && (ya+yb)/2 < tBot && W >= 1024 && c.isHead;
        const d = Math.hypot(px_-dcx, py_-dcy), score = eff*(1 - 0.25*Math.min(1, d/(0.5*Math.hypot(x1-x0, y1-y0))))*(side ? 1.15 : 1)*(eff < minPx*0.999 ? 0.2 : 1) + (xb-xa)*(yb-ya)*1e-9;
        if(score > bestD){ best = [xa, ya, xb, yb]; bestEff = eff; bestD = score; bestExt = eX; bestOff = [(eX[2]||0)*eff*(px_+sr.left > W/2 ? -1 : 1), (eX[3]||0)*eff*(py_+restTop > H/2 ? -1 : 1)]; }
      }
    }
    let noFit = false;
    if(!best){ best = [x0,y0,x1,y1]; bestEff = nomPx*0.5; noFit = true; }   // nowhere free: the frame pose takes this chapter
    c.fit = {l:best[0], t:best[1], r:best[2], b:best[3], px:Math.max(bestEff, 8), rects:rs, ext: bestD===1e9 ? ext : bestExt, off: bestD===1e9 ? [0,0] : bestOff, m: bestD===1e9 ? 0 : m, restY: bestD===1e9 ? dcy : null,
             asFrame: noFit || (bestD!==1e9 && bestEff < minPx*0.98)};
  }
  const ft = c.fit;
  for(const r of ft.rects){ const t = r[1]+sr.top, b = r[3]+sr.top; if(b > -40 && t < H+40 && pushR.length < 6) pushR.push([r[0]+sr.left, t, r[2]+sr.left, b]); }
  return {l:ft.l+sr.left, t:ft.t+sr.top, r:ft.r+sr.left, b:ft.b+sr.top, px:ft.px, m:ft.m, ext:ft.ext, off:ft.off, rest: ft.restY===null ? null : ft.restY+sr.top, asFrame:ft.asFrame};
}
function measure(){
  const W=getW(), H=getH(), sy = window.scrollY || window.pageYOffset || 0;
  chapters = Array.prototype.map.call(document.querySelectorAll('[data-piece-state]'), (el)=>{
    const r = el.getBoundingClientRect();
    const rectOf = (n)=>{ const q = n.getBoundingClientRect(); return {el:n, top:q.top+sy, bottom:q.bottom+sy}; };
    const state = normState(el.getAttribute('data-piece-state'));
    const sm = W < 820 ? parseFloat(el.getAttribute('data-piece-scale-sm')) : NaN;
    return {el, state, top:r.top+sy, bottom:r.bottom+sy, isHead: r.top+sy < 0.5*H, tight:[],
      custom: !isNaN(sm) ? sm : parseFloat(el.getAttribute('data-piece-scale')),
      stageEl: state==='frame' ? el : stageOf(el), avoid: state==='frame' ? [] : textEls(el), fit:null, fitW:0, fitH:0, fitRaw:new Float32Array(160),
      steps: Array.prototype.map.call(el.querySelectorAll('[data-piece-step]'), rectOf),
      clusters: Array.prototype.map.call(el.querySelectorAll('[data-piece-cluster]'), (n)=>{ const o = rectOf(n); o.k = Math.max(0, Math.min(3, parseInt(n.getAttribute('data-piece-cluster'),10)||0)); return o; })};
  });
  // the clear centre column: the widest [data-piece-column]. When the attribute sits on a full-width section,
  // use that section's widest child that is narrower than the viewport. Fallback: a centred 960px column.
  let colW = 0;
  document.querySelectorAll('[data-piece-column]').forEach((el)=>{
    let w = el.getBoundingClientRect().width;
    if(w > W*0.92){
      w = 0;
      for(const ch of el.children){ const cw = ch.getBoundingClientRect().width; if(cw <= W*0.92 && cw > w) w = cw; }
    }
    if(w > colW) colW = w;
  });
  if(!colW) colW = Math.min(960, W);
  colHalfPx = colW/2 + 34;
  const nav = document.getElementById('nav') || document.querySelector('body > nav, body > header nav');
  navBottom = 0;
  if(nav){ const cs = getComputedStyle(nav), nr = nav.getBoundingClientRect(); if((cs.position==='fixed'||cs.position==='sticky') && nr.top<=1 && nr.height<140) navBottom = nr.bottom; }
  docH = document.documentElement.scrollHeight;
  // [DIRECTION] touch: a vertical pan always scrolls; a clearly horizontal drag on a centre-stage chapter belongs to the piece
  for(const c of chapters) if(c.state!=='frame' && !c.el.style.touchAction) c.el.style.touchAction = 'pan-y pinch-zoom';
}
function layout(){
  const W=getW(), H=getH();
  camera.aspect = W/H; camera.updateProjectionMatrix();
  renderer.setSize(W,H);
  visH = 2*CAM_D*Math.tan(THREE.MathUtils.degToRad(FOV/2)); visW = visH*W/H;
  measure();
  restYpx = (navBottom + H)/2;
  // page hook: where v5's framing puts the hero piece (px from the top of the hero), so CSS can line the hero words up with it:
  // top:var(--piece-hero-cy). Bounds of the piece: --piece-hero-top / --piece-hero-bottom. Removed when the short-viewport fit is in charge.
  { const de = document.documentElement.style;
    if(heroIsV5(W,H)){ const yc = v5Region(W,H).yc, hh = EXT_H*v5HeroScale(W,H)*H/visH/2; de.setProperty('--piece-hero-cy', yc.toFixed(1)+'px'); de.setProperty('--piece-hero-top', (yc-hh).toFixed(1)+'px'); de.setProperty('--piece-hero-bottom', (yc+hh+0.5*v5HeroScale(W,H)*H/visH).toFixed(1)+'px'); }
    else { de.removeProperty('--piece-hero-cy'); de.removeProperty('--piece-hero-top'); de.removeProperty('--piece-hero-bottom'); } }
  baseY = (0.5-restYpx/H)*visH;
}
layout();
fitScale = scaleFor('hero');
let ro = null;
if('ResizeObserver' in window){ ro = new ResizeObserver(layout); ro.observe(container); ro.observe(document.body); }
window.addEventListener('resize', layout);
window.addEventListener('load', layout);
if(document.fonts && document.fonts.ready) document.fonts.ready.then(layout);

const yawNum = dbgNum('yaw', -Math.PI, Math.PI);
const yawParam = !isNaN(yawNum);

// ---------- interaction state ----------
const motionParam = dbgNum('motion', 0, 3);
const MOTION = !isNaN(motionParam) ? motionParam : 1.5;   // 1.0 = v4 amplitude
const MK = MOTION/1.5;
const RESUME_MS = 1.1*1000;
const POINTER_TILT = THREE.MathUtils.degToRad(10);
let paused = false, expanded = false, userExpanded = false, dragging = false;
let lastX=0, lastY=0, lastMoveT=0, yawVel=0, pitchVel=0;   // velocities in rad/s
let baseYaw = yawParam ? yawNum : 0.12, basePitch = BASE_TILT_X;
let tiltYaw = 0, tiltPitch = 0, tiltTX = 0, tiltTY = 0, pointerOver = false;
let resumeEase = 1;
let lastInteract = -99999;
let swayT = 0;
const PITCH_MAX = THREE.MathUtils.degToRad(70);

// [DIRECTION] multi-page hand-off: carry the sway through sessionStorage so the piece does not restart between pages
try{
  const h = JSON.parse(sessionStorage.getItem('wing-piece-handoff')||'null');
  const age = h && typeof h==='object' ? Date.now()-h.t : NaN;
  // every field is checked: a tampered or corrupt value is ignored, it can never reach the transforms
  if(finiteIn(age, 0, 8000) && finiteIn(h.swayT, 0, 1e7) && finiteIn(h.yaw, -Math.PI, Math.PI) && !yawParam){ swayT = h.swayT + age/1000; baseYaw = h.yaw; }
}catch(_){}
function handOff(){ try{ if(!isFinite(swayT) || !isFinite(baseYaw)) return; sessionStorage.setItem('wing-piece-handoff', JSON.stringify({swayT: swayT % 1e6, yaw:Math.atan2(Math.sin(baseYaw),Math.cos(baseYaw)), t:Date.now()})); }catch(_){} }
window.addEventListener('pagehide', handOff);

// ---------- autopilot: about half rest, half beats; the first beat follows the assemble directly ----------
const beatRaw = DEBUG ? qs.get('beat') : null; // none|wave|ghost|ghostside|burst|expand, for testing (debug=1 only)
const beatOverride = ['none','wave','ghost','ghostside','burst','expand'].indexOf(beatRaw) >= 0 ? beatRaw : null;
const PROGRAM = [['wave',2600],['rest',3200],['ghost',4600],['rest',3400],['expand',5600],['rest',4200],['burst',1800],['rest',3000],['ghost',4600],['rest',2800]];
let progIdx = -1, ghostCount = 0, ghostSide = false, ghostStart = 0;
let autoMode = 'intro', autoModeStart = performance.now(), autoDur = 2700;
let burstCenter = null;

const raycaster = new THREE.Raycaster();
let scatterPoint = null, scatterActive = 0, scatterStrength = 1;

const _inv = new THREE.Matrix4(), _lray = new THREE.Ray();
// pointer -> the true 3D point where the ray meets the FORM (local space): march the ray through the extruded outline.
const HZ = DEPTH/2 + SZ;
function insideLocal(x,y,z){ return Math.abs(z)<=HZ && inside(x/LOGO_W+0.5, 0.5-y/LOGO_H); }
function pointerToLocal(clientX, clientY){
  const rect = container.getBoundingClientRect();
  const nx = ((clientX-rect.left)/rect.width)*2-1, ny = -((clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera({x:nx,y:ny}, camera);
  group.updateMatrixWorld();
  _lray.copy(raycaster.ray).applyMatrix4(_inv.copy(group.matrixWorld).invert());
  _lray.direction.normalize();
  const o=_lray.origin, d=_lray.direction;
  const tc = -(o.x*d.x+o.y*d.y+o.z*d.z), R = Math.hypot(LOGO_W,LOGO_H,DEPTH)*0.5+0.2;
  const STEP = 0.03;
  for(let t=Math.max(0,tc-R); t<tc+R; t+=STEP){
    const x=o.x+d.x*t, y=o.y+d.y*t, z=o.z+d.z*t;
    if(insideLocal(x,y,z)){
      let t0=t-STEP, t1=t;
      for(let k=0;k<5;k++){ const tm=(t0+t1)/2; if(insideLocal(o.x+d.x*tm,o.y+d.y*tm,o.z+d.z*tm)) t1=tm; else t0=tm; }
      return {point:new THREE.Vector3(o.x+d.x*t1,o.y+d.y*t1,o.z+d.z*t1), strength:1};
    }
  }
  // missed the form: fall back to the nearest tile to the ray, fading with distance
  let best=-1, bd=1e9;
  for(let i=0;i<OUTER_N;i+=5){
    const i3=i*3, vx=homePos[i3]-o.x, vy=homePos[i3+1]-o.y, vz=homePos[i3+2]-o.z;
    const tt=vx*d.x+vy*d.y+vz*d.z;
    const ex=vx-d.x*tt, ey=vy-d.y*tt, ez=vz-d.z*tt, dd=ex*ex+ey*ey+ez*ez;
    if(dd<bd){ bd=dd; best=i; }
  }
  const NEAR = 1.1, dist=Math.sqrt(bd);
  if(best<0 || dist>NEAR) return null;
  const f = 1-dist/NEAR;
  return {point:new THREE.Vector3(homePos[best*3],homePos[best*3+1],homePos[best*3+2]), strength:f*f*(3-2*f)};
}
function userTouched(now){
  lastInteract = now;
  if(autoMode==='expand' && !userExpanded) expanded = false; // the autopilot yields
}

// [DIRECTION] the stage is pointer-events none, so all pointer work happens at document level.
// A drag only grabs the piece when it starts over the piece's screen bounds, the piece is centre stage,
// and the press is not on a link, control or a text selection. Touch never grabs: a finger scrolls the page.
let centrePresence = 1;             // 1 = the form is centre stage, 0 = everything is out in the frame
const NO_GRAB = 'a,button,input,textarea,select,label,summary,option,[contenteditable],[role="button"],[data-piece-nograb]';
function overPiece(x,y){
  const W=getW(), H=getH();
  const cx = W/2 + group.position.x/visW*W, cy = H/2 - group.position.y/visH*H;
  const hw = EXT_W*fitScale/visH*H*0.53, hh = EXT_H*fitScale/visH*H*0.53;
  return Math.abs(x-cx)<=hw && Math.abs(y-cy)<=hh;
}
function canGrab(e){
  if(e.button!==0) return false;
  if(centrePresence < 0.6) return false;
  const t = e.target;
  if(t && t.closest && t.closest(NO_GRAB)) return false;
  const sel = window.getSelection && window.getSelection();
  if(sel && !sel.isCollapsed) return false;
  return overPiece(e.clientX, e.clientY);
}
let downTime=0, downPos=[0,0], savedSelect = '';
// [DIRECTION] touch: a press on the piece is only a candidate. It becomes a rotate when the finger has clearly gone
// sideways, a ripple when it lifts without moving, and nothing at all when it goes vertical (the page scrolls).
let touchCand = null, touchDrag = false;
let tapC = null, tapT0 = -1e9;                       // tap ripple: local-space centre and start time
const TAP_LIFE = 1.25;
function fireTap(x, y, now){
  emit('tap', {x:x/Math.max(1,getW()), y:y/Math.max(1,getH())});
  if(centrePresence > 0.35){
    const hit = pointerToLocal(x, y);
    if(hit){ tapC = hit.point; tapT0 = now; userTouched(now); return; }
  }
  // out in the frame: a tap stirs the plates around the finger
  const rect = container.getBoundingClientRect();
  const nx = ((x-rect.left)/rect.width)*2-1, ny = -(((y-rect.top)/rect.height)*2-1);
  for(let k=0;k<4;k++){ wkX[wkHead] = nx + Math.cos(k*1.57)*0.05; wkY[wkHead] = ny + Math.sin(k*1.57)*0.05; wkT[wkHead] = now; wkHead = (wkHead+1)%WAKE_N; }
  wakeLiveUntil = now + (WAKE_LIFE+1.2)*1000;
}
function onPointerDown(e){
  if(e.pointerType==='touch'){
    touchCand = null;
    if(e.isPrimary !== false){
      const t = e.target;
      if(!(t && t.closest && t.closest(NO_GRAB))) touchCand = {id:e.pointerId, x:e.clientX, y:e.clientY, t:performance.now(), on:centrePresence>=0.6 && overPiece(e.clientX, e.clientY)};
    }
    return;
  }
  if(!canGrab(e)) return;
  dragging = true; lastX = e.clientX; lastY = e.clientY;
  downTime = lastMoveT = performance.now(); downPos = [e.clientX, e.clientY];
  yawVel = pitchVel = 0;
  savedSelect = document.documentElement.style.userSelect;
  document.documentElement.style.userSelect = 'none';
  document.documentElement.style.webkitUserSelect = 'none';
  userTouched(downTime);
}
// pointer wake: the frame remembers where the pointer has been (last 12 samples)
const WAKE_N = 12, WAKE_LIFE = 1.15;
const wkX = new Float32Array(WAKE_N), wkY = new Float32Array(WAKE_N), wkT = new Float64Array(WAKE_N).fill(-1e9);
let wkHead = 0, wkLast = 0, wakeLiveUntil = 0;
function onPointerMove(e){
  const now = performance.now();
  if(e.pointerType==='touch' && touchCand && e.pointerId===touchCand.id && !dragging){
    const mx = e.clientX-touchCand.x, my = e.clientY-touchCand.y;
    if(Math.abs(my) > 10 && Math.abs(my) >= Math.abs(mx)*0.8) touchCand = null;          // vertical: the page has it
    else if(touchCand.on && Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(my)*1.8){
      dragging = true; touchDrag = true; lastX = e.clientX; lastY = e.clientY;
      downTime = touchCand.t; lastMoveT = now; downPos = [touchCand.x, touchCand.y]; yawVel = pitchVel = 0;
      savedSelect = document.documentElement.style.userSelect;
      userTouched(now);
    }
  }
  const rect = container.getBoundingClientRect();
  pointerOver = e.pointerType!=='touch' && e.clientX>=rect.left && e.clientX<=rect.right && e.clientY>=rect.top && e.clientY<=rect.bottom;
  tiltTX = THREE.MathUtils.clamp(((e.clientX-rect.left)/rect.width)*2-1, -1, 1);
  tiltTY = THREE.MathUtils.clamp(((e.clientY-rect.top)/rect.height)*2-1, -1, 1);
  if(centrePresence < 0.85 && now-wkLast > 38){
    wkLast = now; wkX[wkHead] = tiltTX; wkY[wkHead] = -tiltTY; wkT[wkHead] = now; wkHead = (wkHead+1)%WAKE_N;
    wakeLiveUntil = now + (WAKE_LIFE+1.2)*1000;
  }
  if(dragging){
    const dx = e.clientX-lastX, dy = e.clientY-lastY;
    const dts = Math.max(0.004, (now-lastMoveT)/1000);
    lastX = e.clientX; lastY = e.clientY; lastMoveT = now;
    // 1:1 feel: dragging across the object's own width turns it about half a turn
    const k = Math.PI / Math.max(220, objectPx());
    baseYaw += dx*k;                                           // free, full 360
    if(!touchDrag){ basePitch = THREE.MathUtils.clamp(basePitch + dy*k, -PITCH_MAX, PITCH_MAX); pitchVel = pitchVel*0.5 + (dy*k/dts)*0.5; }
    yawVel = yawVel*0.5 + (dx*k/dts)*0.5;
    userTouched(now);
  }
  if(centrePresence > 0.35){
    const hit = pointerToLocal(e.clientX, e.clientY);
    if(hit){ scatterPoint = hit.point; scatterStrength = hit.strength; scatterActive = 1; if(hit.strength>0.6) userTouched(now); }
  }
}
function objectPx(){ return LOGO_W*fitScale/visH*getH(); }
function onPointerUp(e){
  if(e.pointerType==='touch' && !dragging){
    const c = touchCand; touchCand = null;
    if(c && e.pointerId===c.id && e.type!=='pointercancel'){
      const now = performance.now();
      if(now-c.t < 350 && Math.abs(e.clientX-c.x) < 9 && Math.abs(e.clientY-c.y) < 9 && (c.on || centrePresence < 0.6)) fireTap(e.clientX, e.clientY, now);
    }
    return;
  }
  if(!dragging) return;
  const wasTouch = touchDrag; touchDrag = false; touchCand = null;
  const now = performance.now();
  const dt = now - downTime;
  const dx = Math.abs(e.clientX-downPos[0]), dy = Math.abs(e.clientY-downPos[1]);
  dragging = false;
  if(grabSent){ grabSent = false; emit('release'); }
  document.documentElement.style.userSelect = savedSelect;
  document.documentElement.style.webkitUserSelect = savedSelect;
  if(now-lastMoveT > 90){ yawVel = pitchVel = 0; }             // he stopped before letting go: it stays put
  yawVel = THREE.MathUtils.clamp(yawVel, -14, 14); pitchVel = THREE.MathUtils.clamp(pitchVel, -8, 8);
  lastInteract = now;
  if(e.type!=='pointercancel' && !wasTouch && dt < 300 && dx < 6 && dy < 6){ emit('tap', {x:e.clientX/Math.max(1,getW()), y:e.clientY/Math.max(1,getH())}); toggleExpand(); }
}
// touch moves keep arriving here while the page scrolls natively (pointer events are cancelled by then): feed the wake
function onTouchMove(e){
  if(centrePresence >= 0.85 || !e.touches || !e.touches.length) return;
  const now = performance.now(); if(now-wkLast < 38) return;
  const t = e.touches[0], rect = container.getBoundingClientRect();
  wkLast = now; wkX[wkHead] = ((t.clientX-rect.left)/rect.width)*2-1; wkY[wkHead] = -(((t.clientY-rect.top)/rect.height)*2-1); wkT[wkHead] = now; wkHead = (wkHead+1)%WAKE_N;
  wakeLiveUntil = now + (WAKE_LIFE+1.2)*1000;
}
window.addEventListener('touchmove', onTouchMove, {passive:true});
function onDocLeave(){ pointerOver = false; scatterActive = Math.min(scatterActive, 0.5); }
document.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove, {passive:true});
window.addEventListener('pointerup', onPointerUp);
window.addEventListener('pointercancel', onPointerUp);
document.documentElement.addEventListener('pointerleave', onDocLeave);

function toggleExpand(){ expanded = !expanded; userExpanded = expanded; lastInteract = performance.now(); }

const clock = new THREE.Clock();
let visible = !document.hidden;
document.addEventListener('visibilitychange', ()=>{ visible = !document.hidden; });

let fpsFrames=0, fpsTime=0, fpsNow=0;

function enterMode(mode, dur, now){
  autoMode = mode; autoModeStart = now; autoDur = dur;
  if(mode==='burst'){
    let idx = Math.floor(Math.random()*OUTER_N);              // any surface: front face or a side wall
    if(normals[idx*3+2] < -0.5) idx -= 1;
    burstCenter = [homePos[idx*3], homePos[idx*3+1], homePos[idx*3+2]];
  }
  if(mode==='ghost' || mode==='ghostside'){
    ghostSide = mode==='ghostside' || (ghostCount++ % 2 === 1);
    ghostStart = Math.floor(Math.random()*OUTLINE.length);
    if(mode==='ghostside'){ ghostStart = NECK_IDX; }
  }
  if(!userExpanded) expanded = (mode==='expand');
}
function nextBeat(now){
  if(beatOverride){ enterMode(beatOverride, 1e12, now); return; }
  progIdx = (progIdx+1) % PROGRAM.length;
  enterMode(PROGRAM[progIdx][0], PROGRAM[progIdx][1], now);
}

// =========================== [DIRECTION] chapter weights from scroll ===========================
const Wt = {hero:0, frame:1, split4:0, orbit:0, assemble:0, finale:0};     // targets
const Wd = {hero:0, frame:1, split4:0, orbit:0, assemble:0, finale:0};     // damped
const STATES = Object.keys(Wt);
let anchorPx = (navBottom + getH())/2, anchorXpx = getW()/2;
let asmTarget = 0, asmProg = 0, activeCluster = -1, scaleTarget = fitScale, lastActiveEl = null;
const clusterAct = [0,0,0,0];
let scrollVel = 0, lastScrollY = window.scrollY || 0, jumpUntil = 0;
// [ROUND 3] the free rectangle (viewport px, margin already taken off) the form rests in, and the form's half size in px: the idle
// "expand" cloud (and a click-to-expand) is scaled down to stay inside it, so the cloud never leaves the screen or drifts over the text
let freeRect = null, cloudK = 1;
const CLOUD_HALF = [4.6, 3.5];       // half extent of the full cloud in engine units (measured, calib.py expand)
function computeWeights(){
  const H = getH(), sy = window.scrollY || window.pageYOffset || 0, vc = sy + H/2;
  for(const k of STATES) Wt[k] = 0;
  let sum = 0, bestAsm = null, bestAsmW = 0, best4 = null, best4W = 0, sSum = 0, sW = 0, aSum = 0, axSum = 0;
  const W_ = getW(); pushR.length = 0; let dbgW = 0, dbgPlace = null, freeW = 0; freeRect = null;
  for(const c of chapters){
    // a centre-stage chapter owns only its middle: it has let go by the time its edge reaches the middle of the screen,
    // so the coming apart and the re-forming both happen in view, not after the form has scrolled away
    // [STAGE 7] PACING BY SCROLL DISTANCE. Only centre-stage chapters carry weight; the frame is whatever they leave.
    // Each owns a DWELL zone where its form holds still, and comes apart / re-forms over T of scroll on either side, eased.
    // A pinned interlude: T = 0.6 screens, dwell = its height less 0.6 screens (at least 0.35). A page head or the hero rests
    // fully formed at scroll 0, holds for the first 0.15 screens, and lets go over 0.45 (it rides away with its section, so
    // a longer goodbye would happen off screen).
    if(c.state==='frame') continue;
    const span = c.bottom-c.top;
    const T = c.isHead ? 0.45*H : 0.6*H;
    const inset = Math.min(0.22*H, Math.max(0, (span-0.5*H)/2));
    const ct = c.isHead ? -1e9 : c.top+inset, cb = c.isHead ? Math.max(c.bottom-inset, 0.65*H) : c.bottom-inset;
    const d = vc < ct ? ct-vc : vc > cb ? vc-cb : 0;
    const ft0 = (d < T || (c.bottom > sy-40 && c.top < sy+H+40)) ? fitChapter(c, W_, H) : null;
    const wl = ft0 && ft0.asFrame ? 0 : Math.max(0, 1-d/T), w = wl*wl*(3-2*wl);
    c.w = w;
    if(w<=0) continue;                                 // (still on screen: fitChapter above keeps its text pushing loose plates)
    Wt[c.state] += w; sum += w;
    if(c.state==='assemble' && w>bestAsmW){ bestAsm = c; bestAsmW = w; }
    if(c.state==='split4' && w>best4W){ best4 = c; best4W = w; }
    if(c.state!=='frame'){
      const ft = ft0;
      const ext = ft.ext;
      sSum += w*ft.px*visH/H; sW += w;
      // inside its free rect the form rests at the stage centre and only rides when the rect's edge reaches it
      const hw = ext[0]*ft.px/2 + ft.m, hh = ext[1]*ft.px/2 + ft.m;
      const lo = ft.t+hh, hi = ft.b-hh, xl = ft.l+hw, xh = ft.r-hw;
      const rest = ft.rest !== null ? ft.rest : Math.max(restYpx, navBottom+hh-ft.m);   // the hero rests at v5's own centre, riding with its section
      let ay = lo > hi ? (lo+hi)/2 : Math.max(lo, Math.min(hi, rest));
      // never under the nav, EXCEPT once a pinned stage has let go: then the piece rides away with its stage instead of
      // parking under the nav while the stage's own caption scrolls up through it
      const letGo = !c.isHead && c.stageEl !== c.el && c.stageEl.getBoundingClientRect().top < -2;
      if(ft.rest === null && !letGo && (c.isHead || c.stageEl !== c.el)) ay = Math.max(ay, navBottom+16+hh-ft.m);
      ay += ft.off[1];
      aSum += w*ay;
      if(w > freeW){ freeW = w; freeRect = ft.rest !== null ? null : [ft.l+ft.m+12, ft.t+ft.m+12, ft.r-ft.m-12, ft.b-ft.m-12, ext[0]*ft.px/2, ext[1]*ft.px/2]; }   // v5's own hero keeps v5's full cloud
      if(DEBUG && w > dbgW){ dbgW = w; dbgPlace = {state:c.state, l:ft.l, t:ft.t, r:ft.r, b:ft.b, px:ft.px, hw:hw-ft.m, hh:hh-ft.m}; }
      axSum += w*((xl > xh ? (xl+xh)/2 : Math.max(xl, Math.min(xh, W_/2))) + ft.off[0]);
    }
  }
  if(sW > 0.001){ anchorPx = aSum/sW; anchorXpx = axSum/sW; }
  if(DEBUG && window.__piece){ window.__piece.place = dbgW > 0 ? dbgPlace : null; window.__piece.bbox = dbgW > 0 ? [anchorXpx-dbgPlace.hw, anchorPx-dbgPlace.hh, anchorXpx+dbgPlace.hw, anchorPx+dbgPlace.hh] : null; }
  if(sum < 1){ Wt.frame += 1-sum; sum = 1; }        // no chapter here (or no chapters at all): the frame
  for(const k of STATES) Wt[k] /= sum;
  if(sW > 0.001) scaleTarget = sSum/sW;
  if(bestAsm){
    const c = bestAsm;
    if(c.steps.length){
      let a = 0; for(const s of c.steps) a += THREE.MathUtils.clamp((vc-s.top)/Math.max(1,s.bottom-s.top), 0, 1);
      asmTarget = a/c.steps.length;
    } else {
      // no steps: scrub through the chapter, finished a little before its end so the built piece gets a beat
      asmTarget = THREE.MathUtils.clamp((vc-c.top)/Math.max(1,(c.bottom-c.top)*0.85), 0, 1);
    }
  }
  let act = -1, actEl = null;
  if(best4 && best4W > 0.3){
    const c = best4;
    if(c.clusters.length){
      let lo=1e9, hi=-1e9; for(const q of c.clusters){ const m=(q.top+q.bottom)/2; lo=Math.min(lo,m); hi=Math.max(hi,m); }
      if(hi-lo < Math.max(40, (c.bottom-c.top)*0.35)){   // the cluster labels sit in one row: step through them with scroll progress instead
        const span = c.bottom-c.top;      // a pinned (taller than the screen) chapter steps its clusters across the pinned travel
        const v0 = Math.max(c.top, H/2);
        const p = THREE.MathUtils.clamp(span > H*1.15 ? (vc-c.top-H/2)/(span-H) : (vc-v0)/Math.max(1,c.bottom-v0), 0, 0.999);
        const sorted = c.clusters.slice().sort((a,b)=>a.k-b.k);
        const q = sorted[Math.floor(p*sorted.length)]; act = q.k; actEl = q.el;
      } else {
        let bd=1e9; for(const q of c.clusters){ const dd=Math.abs((q.top+q.bottom)/2-vc); if(dd<bd){ bd=dd; act=q.k; actEl=q.el; } }
      }
    } else act = Math.floor(THREE.MathUtils.clamp((vc-c.top)/Math.max(1,c.bottom-c.top),0,0.999)*4);
  }
  activeCluster = act; cluster4 = act >= 0 ? best4 : null;
}
// [STAGE 7] each of the four gets its own beat: the lit cluster walks toward the one the scroll asks for, one step at a time,
// never faster than CLUSTER_DWELL per step, so a quick wheel still shows all four in order. The label follows what is lit.
const CLUSTER_DWELL = 420;
let shownCluster = -1, shownSince = 0, cluster4 = null;
function stepCluster(now){
  if(activeCluster < 0) shownCluster = -1;
  else if(shownCluster < 0){ shownCluster = activeCluster; shownSince = now; }
  else if(shownCluster !== activeCluster && now-shownSince >= CLUSTER_DWELL){ shownCluster += activeCluster > shownCluster ? 1 : -1; shownSince = now; }
  let actEl = null;
  if(shownCluster >= 0 && cluster4) for(const q of cluster4.clusters) if(q.k === shownCluster){ actEl = q.el; break; }
  if(actEl !== lastActiveEl){
    if(lastActiveEl) lastActiveEl.removeAttribute('data-piece-active');
    if(actEl) actEl.setAttribute('data-piece-active','');
    lastActiveEl = actEl;
  }
}
computeWeights(); stepCluster(performance.now());
for(const k of STATES) Wd[k] = Wt[k];
asmProg = asmTarget; fitScale = scaleTarget;

// intro: first visit this session the piece lands from the cloud (v5's own intro, about 2 s);
// later visits a quick settle. Loading mid-page skips it: the plates are simply where the chapter wants them.
const introParam = qs.get('intro');
// [INTRO API round 6] Jack wants the intro on EVERY homepage load, so the sessionStorage first-visit gate is gone:
// firstVisit is true on every load unless ?intro=0 forces the quiet settle. (Reduced motion and the poster
// fallback are still handled by playIntro / the shell, not here.)
let firstVisit = true;
try{ sessionStorage.setItem('wing-piece-intro','1'); }catch(_){}
if(introParam==='0') firstVisit = false;
const atCentre = (1-Wt.frame-Wt.assemble) > 0.6;
const skipIntro = !!beatOverride || !atCentre;
let seam = 0, leak = 0;
let flyClock = 0; // seconds since the current fly-out / return started
if(!skipIntro){
  if(firstVisit){ prog.fill(1); seam = 1; }
  else { prog.fill(0.6); seam = 1; flyClock = 3; autoDur = 1100; }      // later visits: a 0.7 s settle
} else if(beatOverride) nextBeat(performance.now());

// [INTRO API] on a genuine first-session load the plates above start scattered (prog=1) and then sit frozen,
// waiting for the shell to call window.WingPiece.playIntro(). Later visits and mid-page loads keep their own
// quiet settle (untouched) and never gate on the shell at all. Convergence, once playIntro fires, is driven by
// its OWN deterministic per-plate clock (introConvT below), not by the generic scroll fly/return system: that
// keeps the landing bounded and provable instead of depending on flyClock/canFly/expanded interactions.
let introArmed = !skipIntro && firstVisit;
// [INTRO API round 5] introOrbBoost is 1 for the WHOLE armed intro (waiting + spiral + landing) so every plate is
// pinned to the ring from the very first painted frame (off-screen) instead of ramping in from the visible scatter
// cloud; it drops straight to 0 at introDone (all plates are home by then, so nothing jumps).
let introRunning = false, introCallAt = -1, introOrbBoost = introArmed ? 1 : 0, introDoneCB = null, introDone = false, introReadyFired = false, lastMaxProg = introArmed ? 1 : 0;
let introConvT = 0, introConvStart = 0;
// [INTRO API round 5] the opening beat: the screen starts EMPTY (plates parked beyond the viewport corners on a
// screen-plane ring of radius introR0 x orbRXtra[i], viewport-aware, see updatePlates), then for INTRO_ORBIT_MS each
// plate (staggered by orbSt[i] over the first INTRO_STAGGER_F of the window) spirals inward, sweeping INTRO_SWEEP
// radians as its radius eases down to the small orbR ring hugging the form, THEN the deterministic per-plate
// landing clock below runs. Round 4 was a 1.4s / 288deg ring-in that started visible; now ~2.2s and >1 revolution.
// [INTRO API round 6] Jack: "all of the pieces spiraling around the screen, then make the logo, smooth". The window is
// now one continuous radius curve (fractions of INTRO_ORBIT_MS): 0..A_END ease in from off-screen to the big on-screen
// ring, A_END..C_START dwell swirling at the big ring, C_START..C_END ease down to the small ring; the angle sweeps
// INTRO_SWEEP (2 full turns) under a single smoother over the same span. Per-plate stagger is a small phase offset.
// [INTRO API round 7] Jack: "not an actual spiral: pieces moving across the screen in a circular motion, big covering
// a lot of the screen to small, then into the logo". The plates now fill a DISC (per-plate fraction orbRXtra 0.35..1 of
// the field radius, own angle), the whole field rotates ~0.8 turn under one smoother, and the field radius eases
// off-screen -> big -> small over INTRO_ORBIT_MS, then the landing. Fewer hard turns, more flow.
const FLOCK_LAG = 0.16;
// [round 11] which opening flight this page gets: 0 home, 1 work pages, 2 services pages, 3 about/contact, 4 city/blog
const FLOCK_KIND = (function(){
  const f = qs.get('flock'); if(DEBUG && f !== null) return Math.max(0, Math.min(4, +f||0));
  const n = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  if(n === '' || n === 'index.html') return 0;
  if(/^work/.test(n)) return 1;
  if(/^(services|local-seo|lead-generation|website-design|social-media)\.html$/.test(n)) return 2;
  if(/^(about|contact)\.html$/.test(n)) return 3;
  return 4;
})();
const INTRO_ORBIT_MS = 1600*(DEBUG ? Math.min(20, Math.max(1, +qs.get("slow")||1)) : 1), INTRO_STAGGER_F = 0.04, INTRO_SWEEP = Math.PI*1.6;
const INTRO_A_END = 0.22, INTRO_C_START = 0.4, INTRO_C_END = 0.96;
const INTRO_R0_MARGIN = 1.25/0.35;   // field radius at t=0: the INNERMOST plate (fraction 0.35) sits 1.25 x half-diagonal out, so the first frame is empty
const INTRO_BIG_K = 0.88;            // big field radius = 0.88 x half-diagonal: outer plates near the corners, inner ones ~30% out -> the disc covers most of the screen
const INTRO_CONV_STAGGER = 0.45, INTRO_CONV_SPAN = 1.0;   // seconds: per-plate landing clock, staggered along the diagonal (stagger[i])
function introWaiting(){ return introArmed && !introRunning && !introDone; }
function introBusy(){ return introArmed && !introDone; }
// [INTRO API round 4] Jack watched round 3's converge-straight-to-solid-then-3.5s-dead-hold and asked for: spiral in ->
// assemble LOOSE (the same cracked-open "seam" look the ambient wave/ghost/burst/expand chapters use, which is already
// what's on screen for free here because seam opens to 1 the instant plates start moving and only eases back to 0 over
// OPEN_S once the LAST plate's per-plate clock reaches home -- see the seamTarget/seam lines above updatePlates's loop)
// -> settle to solid over that same natural seam-close -> then go. onDone (nav/words/tagline reveal) fires at
// INTRO_READ_T, while the mark is still loose but already reads clearly; INTRO_LAND_T is when the last plate is home
// and the natural seam-close settle begins; INTRO_SETTLE_MS is a short beat covering that settle before ambient
// breathing is allowed back, replacing the old 3.5s dead hold on solid.
const INTRO_READ_T = INTRO_CONV_STAGGER + INTRO_CONV_SPAN*0.92;      // ~1.19s into convergence: shards have met, loose mark reads as the logo (chrome stays hidden through the whole spiral)
const INTRO_LAND_T = INTRO_CONV_STAGGER + INTRO_CONV_SPAN + 0.05;    // ~1.30s into convergence: every plate is home, solid
const INTRO_SETTLE_MS = 750;                                          // covers seam's ~0.6s close + a hair of buffer
let introHoldUntil = 0;

const INTRO_HOLD = skipIntro ? 0 : 0.4;   // [STAGE 7] the landing waits until the canvas has faded in enough to be seen
const smoother = (t)=> t*t*t*(t*(t*6-15)+10);
const PUSH_R = 1.2, PUSH_F = 0.63, RIP_R = 2.5;
const OPEN_S = 0.6, FLY_S = 1.25, FLY_STAGGER = 0.75, RET_S = 1.15, RET_STAGGER = 0.9;
const FRAME_K = 1.15, FRAME_S = 0.95;     // [DIRECTION] stagger share of the scrub, and the fastest a plate may cross (s): weight
let lastDir = expanded;
const _gInv = new THREE.Matrix4();
const avR = new Float32Array(28);
// plates already out when the page loads mid-document
for(let i=0;i<N;i++){
  const asm = order[i] > asmProg ? 1 : 0;
  fprog[i] = THREE.MathUtils.clamp((Wd.frame + Wd.assemble*asm)*(1+FRAME_K) - stagger[i]*FRAME_K, 0, 1);
}

function updatePlates(dt, now, timeS){
  const el = (now-autoModeStart)/1000;
  const waving = autoMode==='wave', ghosting = autoMode==='ghost'||autoMode==='ghostside', bursting = autoMode==='burst' && burstCenter;
  const WAVE_H = 0.3*MK, WAVE_PERIOD = 1.55;
  const waveFront = waving ? THREE.MathUtils.lerp(-0.3, 1.3, ((el*Math.max(0.6,MK))%(WAVE_PERIOD+0.35))/WAVE_PERIOD) : 0;
  let ghostX=0, ghostY=0, ghostZ=DEPTH/2;
  if(ghosting){
    if(ghostSide){
      const f = ghostStart + el*OUTLINE.length*0.11*Math.max(0.6,MK);
      const a = OUTLINE[Math.floor(f)%OUTLINE.length], b = OUTLINE[(Math.floor(f)+1)%OUTLINE.length], ft = f-Math.floor(f);
      ghostX = a[0]+(b[0]-a[0])*ft; ghostY = a[1]+(b[1]-a[1])*ft; ghostZ = Math.sin(el*1.9)*DEPTH*0.32;
    } else {
      const cov = Math.min(0.46, 0.42*MK);
      ghostX = Math.sin(el*1.65)*LOGO_W*cov; ghostY = Math.sin(el*2.55+1.1)*LOGO_H*cov;
    }
  }
  const burstEnv = bursting ? Math.sin(THREE.MathUtils.clamp((el%2.4)/1.5,0,1)*Math.PI) : 0;
  const GH_R = LOGO_W*0.3, GH_H = 0.46*MK, BU_R = LOGO_W*0.45*Math.min(1.2,MK), BU_H = 0.95*MK;

  // [DIRECTION] chapter inputs for this frame
  const wF = Wd.frame, wA = Wd.assemble;
  const w4 = Wd.split4 < 0.002 ? 0 : smoother(Math.min(1, Wd.split4*1.15));
  const wO = Wd.orbit < 0.002 ? 0 : Math.min(1, Wd.orbit*1.1);
  const frameLive = wF > 0.002 || wA > 0.002;
  const dirOpen = wF > 0.01 || (wA > 0.01 && asmProg < 0.985) || w4 > 0.01 || wO > 0.01;

  // seam: opens before anything flies, closes only after everything is home
  if(expanded !== lastDir){ lastDir = expanded; flyClock = 0; }
  let maxProg = 0, maxF = 0;
  for(let i=0;i<N;i+=37){ if(prog[i]>maxProg) maxProg = prog[i]; if(fprog[i]>maxF) maxF = fprog[i]; }
  lastMaxProg = maxProg;   // [INTRO API] sampled landing progress, watched by playIntro's onDone check
  // split4 does NOT open the seams: each slab stays a tight, solid plated block (open seams read as see-through mesh with moire)
  const seamOpen = wF > 0.01 || (wA > 0.01 && asmProg < 0.985) || wO > 0.01;
  const seamTarget = (expanded || maxProg>0.004 || maxF>0.004 || seamOpen) ? 1 : 0;
  seam = THREE.MathUtils.clamp(seam + (seamTarget>seam?(seamOpen&&!expanded?2.2:1):-1)*dt/OPEN_S, 0, 1);   // scroll opens the seams faster than the autopilot does
  const seamE = smoother(seam);
  const canFly = expanded && seam>=0.999;
  if((canFly || !expanded) && timeS >= INTRO_HOLD) flyClock += dt;
  const frameMayLeave = seam >= 0.3;

  { let k = 1;
    if(freeRect){
      const u = Math.max(1e-3, fitScale*getH()/visH), fw = freeRect[4], fh = freeRect[5];
      const ax = Math.min(anchorXpx-freeRect[0], freeRect[2]-anchorXpx), ay = Math.min(anchorPx-freeRect[1], freeRect[3]-anchorPx);
      // the cloud is deep (about 2.6 units either way), so off the screen centre it also leans outward: count that in
      const W2 = getW()/2, H2 = getH()/2, kxv = Math.abs(anchorXpx-W2)/W2*(visW/2)/CAM_D, kyv = Math.abs(anchorPx-H2)/H2*(visH/2)/CAM_D;
      const cx = (CLOUD_HALF[0] + 2.6*kxv)*1.1*u, cy = (CLOUD_HALF[1] + 2.6*kyv)*1.1*u;
      k = Math.min(1, Math.max(0, (ax-fw)/Math.max(1, cx-fw)), Math.max(0, (ay-fh)/Math.max(1, cy-fh)));
      if(k < 0.2) k = 0;
    }
    cloudK += (k-cloudK)*(1-Math.exp(-6*dt)); }
  const cK = cloudK;
  // split4 cluster offsets: the four bands slide apart along the mark's own diagonal; the active one steps forward
  const cOX=[0,0,0,0], cOY=[0,0,0,0], cOZ=[0,0,0,0];
  group.updateMatrixWorld();
  _gInv.copy(group.matrixWorld).invert();
  const gm = _gInv.elements, ge = group.matrixWorld.elements;
  if(w4>0){
    // four slabs part vertically (real air between them, which yaw cannot close) with a slight stair-step sideways;
    // the active one steps straight at the camera, whatever the sway angle, the others sit back a touch
    let tx = gm[8], ty = gm[9], tz = gm[10]; const tl = Math.hypot(tx,ty,tz)||1; tx/=tl; ty/=tl; tz/=tl;
    for(let k=0;k<4;k++){
      const a = clusterAct[k]*w4, back = (1-clusterAct[k])*w4*0.22, f = a*1.25 - back;
      cOX[k] = (k-1.5)*0.16*w4 + tx*f; cOY[k] = (1.5-k)*0.46*w4 + ty*f; cOZ[k] = tz*f;
    }
  }
  // frame band in ndc: from the edge of the clear column out past the screen edge
  const W = getW(), H = getH(), halfWpx = W/2;
  const gutter = halfWpx - colHalfPx;
  let bandIn, bandOut;
  if(gutter >= 90){ bandIn = colHalfPx/halfWpx; bandOut = 1.1; }
  else { bandIn = 1 - 15/halfWpx; bandOut = 1 + 70/halfWpx; }               // narrow screens: hug the very edges, mostly off-screen
  const bandW = bandOut-bandIn;
  const halfVW = visW/2, halfVH = visH/2, aspect = W/H;
  // avoid rects in ndc (hero words, nav): anything that is out of the form bends around them
  const sy_ = window.scrollY || 0;
  let avN = 0;
  // the nav goes first, so text that sits right under it has the last word (a plate pushed out of the nav must not land on it)
  if(navBottom > 0){ avR[0] = -3; avR[1] = 3; avR[2] = 1-navBottom/(H/2) - 0.02; avR[3] = 3; avN = 1; }
  for(const r of pushR){
    const o = avN*4; avR[o] = r[0]/halfWpx-1 - 0.03; avR[o+1] = r[2]/halfWpx-1 + 0.03; avR[o+2] = 1-r[3]/(H/2) - 0.035; avR[o+3] = 1-r[1]/(H/2) + 0.035;   // grown by about one plate so no plate body reaches the glyphs
    avN++;
  }
  if(DEBUG) window.__piece.avoid = Array.prototype.slice.call(avR, 0, avN*4).map((v)=>+v.toFixed(3));
  // [DIRECTION] the reading column is never crossed by a visible plate. A plate in flight shrinks to nothing at the column's edge
  // and grows back at the other side ("fades in at the gutter") whenever its route would cross copy: the view is a reading block,
  // the form is docked beside the column (inner-page heads), or the page has just jumped several screens.
  const formOff = Math.abs(anchorXpx - W/2) > colHalfPx*0.7;
  let hideK = wF <= 0.75 ? 0 : wF >= 0.97 ? 1 : (wF-0.75)/0.22; hideK = hideK*hideK*(3-2*hideK);
  if(formOff || now < jumpUntil) hideK = 1;
  const colIn = bandIn - 0.1;
  const frameNorm = (isMobile ? 0.55 : 0.95)/Math.max(0.05, fitScale);
  const navTopN = navBottom > 0 ? 1-navBottom/(H/2) : 1;
  const tapAge = tapC ? (now-tapT0)/1000 : 9;
  const tapOn = tapAge < TAP_LIFE;
  const scrollTurns = sy_/H;
  const wakeOn = now < wakeLiveUntil;
  const WK_R = 0.34, wkK = 1-Math.exp(-7*dt);
  const wkAge = [];
  if(wakeOn) for(let s=0;s<WAKE_N;s++){ const a = (now-wkT[s])/1000; wkAge[s] = a < WAKE_LIFE ? (1-a/WAKE_LIFE) : 0; }
  const sv = THREE.MathUtils.clamp(scrollVel, -3, 3)*0.03;
  const fRate = dt/FRAME_S;
  const WRAP2 = FY_WRAP*2;

  // [INTRO API round 5] spiral-in: from the first painted frame until the per-plate landing clock takes over,
  // every plate rides a screen-plane ring whose radius shrinks from orbR[i]+introR0*orbRXtra[i] (beyond the
  // viewport corners) down to orbR[i] (the small ring the ambient "orbit" chapter uses) while INTRO_SWEEP of
  // extra angle unwinds to 0 -- a real revolution AND an inward spiral at once. Untouched (spT=-1, ki=1) on
  // every other path: ambient orbit chapter, repeat visits, reduced motion.
  // [INTRO API round 5] spT: -1 = no spiral (ambient/repeat/reduced), 0 = waiting for playIntro (parked off-screen),
  // 0..1 = spiral window progress. introR0 = viewport half-diagonal in plate units x margin, recomputed per frame
  // from visW/visH/fitScale so the start radius clears the frame at 1440x900 AND ultrawide (fitScale is the live
  // group scale, so plate units x fitScale = world units; visW/visH are the world-unit viewport at the group's depth).
  let spT = -1, introR0 = 0, introRBig = 0;
  const introRing = introBusy();
  if(introRing && !introRunning){
    spT = introCallAt < 0 ? 0 : Math.min(1, (now-introCallAt)/INTRO_ORBIT_MS);
  }
  // [round 8] flock clock + viewport half-extents in plate units. Unclamped through the landing.
  let flT = -1, flW = 0, flH = 0, flS = 0;
  if(introRing){
    flT = introCallAt < 0 ? 0 : (now-introCallAt)/INTRO_ORBIT_MS;
    const fs = Math.max(0.05, fitScale);
    flW = 0.5*visW/fs; flH = 0.5*visH/fs; flS = Math.min(flW*1.25, flH*1.75);
  }
  // [INTRO API round 4] the Wing/Digital wordmark's data-piece-avoid rects would otherwise deflect plates
  // during the opening spiral/converge/settle and look wrong; suppress that push entirely until the intro
  // (spiral through the short post-land settle) has fully handed off to the ambient loop.
  const introAvoidOff = (introArmed && !introDone) || now < introHoldUntil;
  const arr = mesh.instanceMatrix.array;
  let busy = waving||ghosting||bursting||scatterActive>0.01||seam>0||tapOn;
  const dampK = 1-Math.exp(-8*dt);
  const sp = scatterPoint;
  let sumF = 0;
  for(let i=0;i<N;i++){
    const i3=i*3, i4=i*4;
    const hx=homePos[i3], hy=homePos[i3+1], hz=homePos[i3+2];
    const nx=normals[i3], ny=normals[i3+1], nz=normals[i3+2];
    const st = stagger[i];

    // --- fly progress, in order along the diagonal ---
    let p = prog[i];
    if(introRunning){
      // [INTRO API] deterministic landing: a per-plate clock staggered along the same diagonal as everything
      // else (stagger[i]), so it reads as one continuous build like assemble/frame, not a generic scroll return.
      const localT = introConvT - st*INTRO_CONV_STAGGER;
      const cp = localT <= 0 ? 0 : localT >= INTRO_CONV_SPAN ? 1 : localT/INTRO_CONV_SPAN;
      p = 1 - smoother(cp);
    } else if(introWaiting()){ /* [INTRO API] scattered and held until playIntro() starts the beat */ }
    else if(canFly){ if(flyClock > st*FLY_STAGGER + flyDelay[i] && p<1) p = Math.min(1, p + dt/FLY_S); }
    else if(!expanded && p>0){ if(timeS >= INTRO_HOLD && flyClock > st*RET_STAGGER + retDelay[i]) p = Math.max(0, p - dt/RET_S); }
    prog[i] = p;
    const pe = p<=0 ? 0 : p>=1 ? 1 : smoother(p);

    // --- [DIRECTION] frame progress: scrubbed by scroll, staggered along the same diagonal, rate limited so it has weight ---
    let fp = fprog[i];
    if(frameLive || fp>0){
      const g = wF + (wA>0 ? wA*(order[i] > asmProg ? 1 : 0) : 0);
      let tg = g*(1+FRAME_K) - st*FRAME_K - (aInner[i] ? 0.06 : 0);
      tg = tg<0 ? 0 : tg>1 ? 1 : tg;
      if(tg>fp){ if(frameMayLeave) fp = Math.min(tg, fp+fRate); }
      else if(tg<fp) fp = Math.max(tg, fp-fRate);
      fprog[i] = fp;
    }
    // routed flight: sideways first at the form's own height, then along the gutter, so the reading column is never crossed.
    // Scrubbed backwards it is the same path reversed: along the gutter, then in.
    let pf = 0, ex = 0, ey = 0, hov = 0;
    if(fp > 0){
      if(fp >= 1){ pf = ex = ey = 1; }
      else {
        const a = fp/0.62, b = (fp-0.27)/0.73, c = (fp-0.1)/0.9;
        ex = a>=1 ? 1 : smoother(a); ey = b<=0 ? 0 : smoother(b); pf = c<=0 ? 0 : smoother(c);
        // lift-off and landing: a plate hovers off its seat, settles, presses in a hair and comes to rest
        const h1 = fp>=0.3 ? 1 : fp<=0.05 ? 0 : (fp-0.05)/0.25;
        hov = 0.2*h1*h1*(3-2*h1) - (fp<0.09 ? 0.03*Math.sin(fp/0.09*Math.PI) : 0);
      }
    }
    sumF += ex;

    // --- lift target (push / wave / ghost / burst) ---
    let lt = 0;
    if(waving){ const d = waveF[i]-waveFront; lt = WAVE_H*Math.exp(-(d*d)/0.014); }
    else if(ghosting){ const d = Math.hypot(hx-ghostX, hy-ghostY, hz-ghostZ); if(d<GH_R){ const f=1-d/GH_R; lt = f*f*GH_H; } }
    else if(bursting){ const d = Math.hypot(hx-burstCenter[0], hy-burstCenter[1], hz-burstCenter[2]); if(d<BU_R){ const f=1-d/BU_R; lt = f*f*burstEnv*BU_H; } }
    if(sp && scatterActive>0.01){
      const d = Math.hypot(hx-sp.x, hy-sp.y, hz-sp.z), sa = scatterActive*scatterStrength;
      if(d<PUSH_R){ const f=1-d/PUSH_R; lt += f*f*(3-2*f)*sa*PUSH_F; }
      if(d<RIP_R){ const g=1-d/RIP_R; lt += g*g*sa*0.085*(0.5+0.5*Math.sin(d*7.5 - timeS*9)); }   // neighbours ripple outward
    }
    if(tapOn){   // a tap: a small burst under the finger and one ring that travels out across every surface
      const d = Math.hypot(hx-tapC.x, hy-tapC.y, hz-tapC.z), env = 1-tapAge/TAP_LIFE, rr = d - tapAge*4.2;
      lt += 0.5*MK*env*env*Math.exp(-rr*rr/0.09);
      if(d < 0.9 && tapAge < 0.6){ const f = 1-d/0.9; lt += f*f*0.55*Math.sin(tapAge/0.6*Math.PI); }
    }
    lt *= liftMul[i];
    let l = lift[i]; l += (lt-l)*dampK; if(l<0.0004 && lt===0) l=0; lift[i]=l;
    if(l>0) busy = true;

    // --- position ---
    let out = pe;                                   // how far "out of the form" this plate is, for tumble / shrink
    const seamLift = seamE*0.035*(1-pe) + l;
    const rx=randoms[i3], ry=randoms[i3+1], rz=randoms[i3+2];
    const sl2 = seamLift + hov*(1-ex);
    let px = hx + nx*sl2 + rx*l*0.25, py = hy + ny*sl2 + ry*l*0.25, pz = hz + nz*sl2 + rz*l*0.25;
    let qx=homeQuat[i4], qy=homeQuat[i4+1], qz=homeQuat[i4+2], qw=homeQuat[i4+3];
    if(pe>0){
      const drift = pe*0.12;
      px += (hx + (scatPos[i3]-hx)*cK   + Math.sin(timeS*0.5+rx*9)*drift*cK - px)*pe;
      py += (hy + (scatPos[i3+1]-hy)*cK + Math.cos(timeS*0.43+ry*9)*drift*cK - py)*pe;
      pz += (hz + (scatPos[i3+2]-hz)*cK - pz)*pe;
    }
    // [DIRECTION] split4: clusters slide apart as rigid groups
    if(w4>0){ const k = aCluster[i], m = 1-pe; px += cOX[k]*m; py += cOY[k]*m; pz += cOZ[k]*m; }
    // [DIRECTION] orbit: a share of the skin loosens into a slow ring around the form
    const wOeff = introOrbBoost > wO ? introOrbBoost : wO;   // [INTRO API] the orbit-in beat borrows the orbit chapter's own ring
    if(wOeff>0 && (orbSel[i] || introRing)){
      let po = wOeff*1.6 - orbSt[i]*0.6; po = po<=0 ? 0 : po>=1 ? 1 : smoother(po);
      // [INTRO API round 5] during the landing each plate leaves the ring exactly as its own clock brings it home
      // (po follows pe), instead of the whole ring fading while late plates drifted back out to the scatter cloud.
      if(introRunning) po = pe;
      if(po>0){
        // [INTRO API round 5] per-plate spiral ease: staggered start (orbSt) so shards stream in and gather,
        // all reaching the small ring exactly when the window ends. ki=1 outside the intro (ambient ring unchanged).
        // [INTRO API round 6] one continuous C1 radius curve per plate: off-screen (introR0 x spread) -> ease in to a
        // BIG on-screen ring (introRBig x spread, ~56-84% of the half-diagonal) by INTRO_A_END -> dwell there swirling
        // until INTRO_C_START -> ease down to the small orbR ring by INTRO_C_END. Every segment is smoother()-eased so
        // the radial velocity is 0 at each joint (no snap); the angle unwinds through INTRO_SWEEP with ONE smoother over
        // the whole window, so angular speed rises, peaks during the dwell and falls to ~0 exactly as the plate reaches
        // the ring -- matching the zero-velocity start of the landing clock. ki (plane tilt) follows the final ease.
        // [INTRO API round 7] NOT a spiral coil: the plates fill a DISC (each at its own fraction orbRXtra[i] of the
        // field radius, its own angle orbA[i]) and the whole field rotates as one (shared aAdd) with a light organic
        // wobble, while the field radius eases off-screen -> big (covers the screen) -> small, then hands to the landing.
        // [INTRO API round 8] Jack: no spiral, no circle. A MURMURATION: the shards are one flock that enters from
        // off-screen, swoops across the screen and back, breathing and folding, then gathers over the mark and lands.
        // Each plate follows the same flight path with its own small lag (orbSt), so leaders bank first and the body
        // trails behind them. flT keeps running through the landing so laggards finish the path as they come home.
        let ox, oy, oz;
        if(flT >= 0){
          const rf = orbRXtra[i], a0 = orbA[i];
          let tau = flT - orbSt[i]*FLOCK_LAG; tau = tau<0 ? 0 : tau>1 ? 1 : tau;
          const amp = tau <= 0.58 ? 1 : 1 - smoother((tau-0.58)/0.42);          // path amplitude: full, then home to centre
          const ent = tau >= 0.24 ? 0 : 1 - smoother(tau/0.24);                 // entry: starts beyond the left edge
          // [round 9] two half-flocks: one pours in from the left edge, one from the right; they sweep THROUGH each other,
          // swing back and merge over the mark. Straight crossing passes with a wave, no circular travel.
          const g = smoother(tau);                                              // body: wide flock -> tight cloud over the mark
          const br = Math.sin(tau*10.5 + 0.8);                                  // breathing: stretches on the run, bunches on the turn
          const S = flS + (orbR[i]*0.9/rf - flS)*g;
          // [round 11] one flock idea, five flights. FLOCK_KIND is picked from the page name so the work, service,
          // about/contact and city/blog pages each open with their own motion instead of the homepage crossing.
          let cx, cy, tw, mo, spread = 1, squash = 0;
          if(FLOCK_KIND === 1){
            // WORK: a tide. The flock surges up from below the frame, crests, folds over and rolls back down
            // across the screen twice before it settles. Leaders crest first, the body follows.
            const side = Math.cos(a0) >= 0 ? 1 : -1;
            cx = flW*0.5*Math.sin(tau*6.3 + side*0.6)*amp;
            cy = -flH*2.4*ent + flH*0.55*Math.sin(tau*8.4 + 1.1)*amp;
            tw = a0 + 0.6*Math.sin(tau*4.5) + 0.2*Math.sin(timeS*1.3 + orbSt[i]*6.28);
            mo = 0.5 + 0.5*Math.sin(tau*9 + 2.0); spread = 1.15; squash = 0.35;
          } else if(FLOCK_KIND === 2){
            // SERVICES: four streams. The flock arrives from all four corners at once, the streams spiral past
            // each other through the centre in a figure of eight, then knot together over the mark.
            const q = Math.floor(((a0/(Math.PI*2))%1+1)%1*4), qx = (q&1) ? 1 : -1, qy = (q&2) ? 1 : -1;
            cx = qx*flW*2.4*ent + flW*0.6*Math.sin(tau*7.0 + q*1.57)*amp;
            cy = qy*flH*2.2*ent + flH*0.4*Math.sin(tau*14.0 + q*1.57)*amp;
            tw = a0 + 0.9*Math.sin(tau*5.2 + q) + 0.25*Math.sin(timeS*1.1 + orbSt[i]*6.28);
            mo = 0.5 + 0.5*Math.sin(tau*11 + q); spread = 0.7;
          } else if(FLOCK_KIND === 3){
            // ABOUT / CONTACT: one long ribbon. A single snake of shards enters top right, S-curves down and
            // across the whole screen, and coils in on itself over the mark. Lag is what makes it a ribbon.
            const lagT = Math.max(0, Math.min(1, flT - orbSt[i]*0.55));
            cx = flW*2.6*ent + flW*0.7*Math.cos(lagT*5.5 + 0.4)*amp;
            cy = flH*2.0*ent + flH*0.6*Math.sin(lagT*11.0)*amp;
            tw = a0 + 0.3*Math.sin(lagT*7.0) + 0.2*Math.sin(timeS*1.4 + orbSt[i]*6.28);
            mo = 0.85; spread = 0.45;
          } else if(FLOCK_KIND === 4){
            // CITY / BLOG: a fall. The shards drift down from above like leaves, swaying side to side and
            // slowly rotating, then draw together over the mark and settle.
            cx = flW*0.55*Math.sin(tau*5.0 + a0)*amp;
            cy = flH*2.5*ent + flH*0.5*Math.cos(tau*6.0 + a0*0.5)*amp;
            tw = a0 + tau*4.0 + 0.35*Math.sin(timeS*0.9 + orbSt[i]*6.28);
            mo = 0.25 + 0.25*Math.sin(tau*8 + a0); spread = 1.3;
          } else {
            // HOME: two half-flocks pour in from the left and right edges, sweep THROUGH each other, swing back
            // and merge over the mark. Straight crossing passes with a wave, no circular travel.
            const side = Math.cos(a0) >= 0 ? 1 : -1;
            cx = side*(flW*0.55*Math.cos(tau*7.6)*amp + flW*2.7*ent);
            cy = flH*0.32*Math.sin(tau*9.5 + side*1.3)*amp;
            tw = a0 + 0.35*Math.sin(tau*6.0) + 0.25*Math.sin(timeS*1.1 + orbSt[i]*6.28);
            mo = 0.5 + 0.5*Math.sin(tau*13 + 1.2);
          }
          const Sx = S*(1 + (spread-1)*(1-g));
          // shape morph: the body shifts between a round cloud and a long banking ribbon / crescent as it flies
          const c1 = Math.cos(tw), s1 = Math.sin(tw);
          const bx = c1*rf*Sx*(1 + 0.45*br*(1-g)), by = s1*rf*Sx*(0.62 - 0.22*br - squash*(1-g))*(1 - 0.3*g);
          const rx2 = c1*rf*Sx*1.25, ry2 = s1*rf*Sx*0.16 + Math.sin(c1*rf*2.6 + tau*9)*Sx*0.34;
          const mk = mo*(1-g);
          ox = cx + bx + (rx2-bx)*mk;
          oy = cy + by + (ry2-by)*mk;
          oz = Math.sin(a0*2 + tau*5)*0.5*(0.4 + g);
        } else {
          const a = orbA[i] + timeS*0.17, r = orbR[i];
          ox = Math.cos(a)*r; oy = orbY[i] + Math.sin(a)*0.5; oz = Math.sin(a)*r;
        }
        px += (ox-px)*po; py += (oy-py)*po; pz += (oz-pz)*po;
        if(po>out) out = po;
      }
    }
    // [DIRECTION] frame: out to the left and right gutters, fixed in screen space whatever the form is doing
    let fsc = 1, glint = 0;
    if(fp>0 || (avN>0 && out>0.02)){
      // to world space
      let wX = ge[0]*px + ge[4]*py + ge[8]*pz + ge[12], wY = ge[1]*px + ge[5]*py + ge[9]*pz + ge[13], wZ = ge[2]*px + ge[6]*py + ge[10]*pz + ge[14];
      if(fp>0){
        let wx_ = 0, wy_ = 0;
        // slow drift + true scroll parallax (near plates travel more), wrapped off-screen
        let fy = fY0[i] + timeS*fDrift[i] + scrollTurns*fPar[i]*2;
        fy = fy - WRAP2*Math.floor((fy+FY_WRAP)/WRAP2);
        const edge = FY_WRAP - (fy<0?-fy:fy);                      // shrinks to nothing right at the wrap, so the jump is never seen
        const bx = fSide[i]*(bandIn + bandW*fT[i]);
        if(wakeOn || wakeX[i]!==0 || wakeY[i]!==0){
          let tx = 0, ty = 0;
          if(wakeOn && ex>0.3){
            if(bx>-1.3 && bx<1.3) for(let s=0;s<WAKE_N;s++){
              const ag = wkAge[s]; if(ag<=0) continue;
              const dx = (bx-wkX[s])*aspect, dy = fy-wkY[s], dd = dx*dx+dy*dy;
              if(dd < WK_R*WK_R){ const d = Math.sqrt(dd)||0.001, f = 1-d/WK_R, m = f*f*ag*0.2/d; tx += dx*m/aspect; ty += dy*m; }
            }
            if(tx>0.12) tx=0.12; else if(tx<-0.12) tx=-0.12; if(ty>0.2) ty=0.2; else if(ty<-0.2) ty=-0.2;
          }
          wx_ = wakeX[i] + (tx-wakeX[i])*wkK; wy_ = wakeY[i] + (ty-wakeY[i])*wkK;
          if(tx===0 && ty===0 && Math.abs(wx_)<0.0004 && Math.abs(wy_)<0.0004){ wx_ = 0; wy_ = 0; }
          wakeX[i] = wx_; wakeY[i] = wy_;
        }
        const ph = fPh[i], z = fZ[i], persp = (CAM_D - z)/CAM_D;
        const fnx = bx + Math.sin(timeS*0.13+ph)*0.012 + wx_;
        const fny = fy + Math.cos(timeS*0.11+ph*1.7)*0.02 + sv*fPar[i]*4 + wy_;
        wX += (fnx*halfVW*persp - wX)*ex; wZ += (z - wZ)*ex; wY += (fny*halfVH*persp - wY)*ey;
        if(pf>out) out = pf;
        // frame plates have ONE size, whatever chapter the form last was (the group scale differs per chapter and per scroll direction)
        fsc = 1 + (fSc[i]*(edge<0.12 ? edge/0.12 : 1)*frameNorm - 1)*pf;
        if(hideK > 0 && fp < 1){
          const p2 = (CAM_D - wZ)/CAM_D, ax = Math.abs(wX/(halfVW*p2));
          if(ax < bandIn){ let v = ax <= colIn ? 0 : (ax-colIn)/0.1; v = v*v*(3-2*v); fsc *= 1 - hideK*(1-v)*Math.min(1, ex*12); }
        }
        glint = scrollTurns*fGl[i]*pf;
      }
      // text rects are hard exclusion zones for anything that is not seated in the form: in flight (ex counts from the very
      // first sideways move), in the cloud, in the intro, and at rest in the frame when a word reaches into the gutter
      const loose = out > ex ? out : ex, ringOnly = fp<=0 && ((pe<=0 && wO>0) || freeRect !== null);   // the ring, and a cloud already held inside the free rect
      if(avN>0 && loose>0.02 && !introAvoidOff){
        const persp = (CAM_D - wZ)/CAM_D, sxn = wX/(halfVW*persp); let syn = wY/(halfVH*persp);
        for(let a=0;a<avN;a++){
          // near plates are drawn larger, so the zone grows with nearness; the sideways ramp lies OUTSIDE the text, so the push is full by the first glyph
          const o = a*4, gr = a===0 && navBottom>0 ? 0 : Math.max(0, 0.045/persp - 0.03), x0 = avR[o]-0.06-gr, x1 = avR[o+1]+0.06+gr, y0 = avR[o+2]-gr, y1 = avR[o+3]+gr;
          if(ringOnly && !(a===0 && navBottom>0)) continue;   // [ROUND 3] the ring rests inside the free rect the fit gave it (clear of the text by construction): it stays a ring
          if(sxn<=x0 || sxn>=x1 || syn<=y0 || syn>=y1) continue;
          let m = Math.min(sxn-x0, x1-sxn)/0.06; if(m>1) m = 1; m = m*m*(3-2*m);
          const mid = (y0+y1)/2, up = (y1 > 2 || y1 > navTopN - 0.14) ? false : syn >= mid;       // the nav only ever pushes down, and so does text right under it (no room above)
          const k = Math.min(1, loose*14)*m;
          const dy = up ? (y1 + 0.025 + (0.5+ry)*0.1 - syn) : (y0 - 0.025 - (0.5+ry)*0.1 - syn);
          wY += dy*k*halfVH*persp; syn += dy*k;                        // the next zone sees where this one left the plate
        }
      }
      // back to the group's local space
      px = gm[0]*wX + gm[4]*wY + gm[8]*wZ + gm[12]; py = gm[1]*wX + gm[5]*wY + gm[9]*wZ + gm[13]; pz = gm[2]*wX + gm[6]*wY + gm[10]*wZ + gm[14];
    }
    const ang = out*(tBase[i] + timeS*tSpeed[i]) + glint + l*rx*1.6;
    if(ang!==0){
      const h=ang*0.5, s=Math.sin(h), ax=tAxis[i3]*s, ay=tAxis[i3+1]*s, az=tAxis[i3+2]*s, aw=Math.cos(h);
      const bx=qx, by=qy, bz=qz, bw=qw;
      qx = bw*ax + bx*aw + by*az - bz*ay;
      qy = bw*ay - bx*az + by*aw + bz*ax;
      qz = bw*az + bx*ay - by*ax + bz*aw;
      qw = bw*aw - bx*ax - by*ay - bz*az;
    }
    // --- seams crack open: plates shrink a touch so the light leaks between them ---
    const shrink = 1 - 0.17*seamE*(1-out);
    const fs = (aInner[i] ? 1-0.42*out : 1)*fsc;   // interior chunks slim down in flight so the cloud reads as fragments, not slabs
    const sx=scales[i3]*shrink*fs, sy=scales[i3+1]*shrink*fs, sz=scales[i3+2]*fs;
    const x2=qx+qx, y2=qy+qy, z2=qz+qz;
    const xx=qx*x2, xy=qx*y2, xz=qx*z2, yy=qy*y2, yz=qy*z2, zz=qz*z2, wx=qw*x2, wy=qw*y2, wz=qw*z2;
    const o=i*16;
    arr[o]=(1-(yy+zz))*sx; arr[o+1]=(xy+wz)*sx; arr[o+2]=(xz-wy)*sx; arr[o+3]=0;
    arr[o+4]=(xy-wz)*sy; arr[o+5]=(1-(xx+zz))*sy; arr[o+6]=(yz+wx)*sy; arr[o+7]=0;
    arr[o+8]=(xz+wy)*sz; arr[o+9]=(yz-wx)*sz; arr[o+10]=(1-(xx+yy))*sz; arr[o+11]=0;
    arr[o+12]=px; arr[o+13]=py; arr[o+14]=pz; arr[o+15]=1;
  }
  mesh.instanceMatrix.needsUpdate = true;
  centrePresence = 1 - sumF/N;

  // --- light leak without a body: the INNER FRAGMENTS glow cool blue through the seams as they open,
  // and drop to a smoulder once everything is flying. Nothing solid exists at any point. ---
  let sumP = 0, cnt = 0; for(let i=0;i<N;i+=23){ sumP += prog[i]; cnt++; }
  const away = sumP/cnt;
  const flying = canFly || maxProg>0.004 || maxF>0.004 || w4>0.3 || wO>0.3;
  const leakTarget = seamE*(flying ? 0.04 : 1);
  leak += (leakTarget-leak)*(1-Math.exp(-10*dt));
  leakUniform.value = leak*1.6;
  // the backdrop glow belongs to the assembled form: it leaves with the plates so the reading column stays dark
  glowMat.opacity = (0.2 + leak*0.5)*centrePresence;
  floorMat.opacity = (0.34*(1-away*0.6) + leak*0.3)*centrePresence*centrePresence;
  return busy || expanded || dirOpen || maxF>0;
}

// [SOUND] ADDENDUM 3 event contract. Cheap: a few compares per frame, events only on change (progress at most 20 Hz).
const snd = {state:null, cluster:-1, step:-1, peak:0, lastProg:0, settleDue:false};
let grabSent = false;
function emit(name, detail){ try{ window.dispatchEvent(new CustomEvent('piece:'+name, {detail:detail||{}})); }catch(_){} }
function emitSound(now){
  let s1='frame', v1=-1, v2=-1;
  for(const k of STATES){ const v=Wd[k]; if(v>v1){ v2=v1; s1=k; v1=v; } else if(v>v2){ v2=v; } }
  const progress = v2>0.02 ? v2/(v1+v2) : 0, burst = Math.min(1, progress*2);
  if(s1!==snd.state){ emit('state', {state:s1, prev:snd.state}); snd.state = s1; }
  if(now-snd.lastProg > 50 && (burst>0.001 || Math.abs(scrollVel)>0.01 || snd.peak>0)){
    snd.lastProg = now; emit('progress', {state:s1, progress:progress, burst:burst, scrollVelocity:scrollVel});
  }
  if(burst>snd.peak) snd.peak = burst;
  // settle = fully re-formed: the blend ends first, the last plates land a moment later, so the event waits for them
  if(burst>0.3 || s1==='frame') snd.settleDue = false;
  if(burst<0.04){ if(snd.peak>0.3 && s1!=='frame') snd.settleDue = true; if(snd.peak>0){ snd.peak = 0; emit('progress', {state:s1, progress:0, burst:0, scrollVelocity:scrollVel}); } }
  if(snd.settleDue && centrePresence>0.97 && (s1!=='assemble' || asmProg>0.97)){ snd.settleDue = false; emit('settle', {state:s1}); }
  const c = Wd.split4>0.5 ? activeCluster : -1;
  if(c!==snd.cluster){ snd.cluster = c; if(c>=0) emit('cluster', {index:c}); }
  const st = Wd.assemble>0.5 && asmProg>0.02 ? Math.min(3, Math.floor(asmProg*4-0.02)) : -1;
  if(st!==snd.step){ if(st>snd.step && st>=0) emit('step', {index:st}); snd.step = st; }
  // a mouse press only becomes a grab once it is clearly a hold or a drag, so a click-to-expand never sounds like grab + release
  if(dragging && !grabSent && (now-downTime > 500 || Math.abs(lastX-downPos[0]) > 6 || Math.abs(lastY-downPos[1]) > 6)){ grabSent = true; emit('grab'); }
}

let disposed = false, rafId = null, timeS = 0, idleFrames = 0, firstFrame = true;
function frame(){
  if(disposed) return;
  rafId = requestAnimationFrame(frame);
  if(!visible){ clock.getDelta(); return; }                   // tab hidden: pause
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();
  timeS += dt;

  fpsFrames++; fpsTime += dt;
  if(fpsTime>0.5){ fpsNow = Math.round(fpsFrames/fpsTime); window.__fps = fpsNow; fpsFrames=0; fpsTime=0; }

  // [INTRO API] advance the orbit-in beat then the deterministic landing clock (both independent of scroll),
  // and fire onDone exactly once, on the frame the last plate's clock reaches home.
  if(introCallAt >= 0){
    introOrbBoost = 1;   // [INTRO API round 5] ring pinned for the whole intro; per-plate po follows pe during the landing
    if(!introRunning){
      const el = now - introCallAt;
      // [round 10] the landing starts while the flock is still in flight (no gather-and-pause): each shard peels off its
      // moving path and eases home, so flight and logo are one continuous motion.
      if(el >= INTRO_ORBIT_MS*0.62){ introRunning = true; introConvStart = now; introConvT = 0; }
    } else {
      introConvT = (now - introConvStart)/1000;
    }
    // [INTRO API round 5] onDone fires only once the shards have met in the middle and the (still loose) mark
    // reads as the logo: never during the empty start or the spiral, so chrome stays hidden through the sweep.
    if(introRunning && !introReadyFired && introConvT >= INTRO_READ_T){
      introReadyFired = true;
      const cb = introDoneCB; introDoneCB = null;
      if(cb){ try{ cb(); }catch(_){} }
    }
    // the last plate is home: flip introDone (releases text-avoid + intro-only gating) and give the natural
    // seam-close settle a short window before ambient breathing is allowed back.
    if(introRunning && !introDone && introConvT >= INTRO_LAND_T){
      introDone = true; introCallAt = -1; introOrbBoost = 0;
      introHoldUntil = now + INTRO_SETTLE_MS;
    }
  }

  // ---- [DIRECTION] scroll -> chapter weights, damped ----
  if(docH !== document.documentElement.scrollHeight) measure();
  computeWeights(); stepCluster(now);
  // [STAGE 7] a wheel notch reads as a glide: about 0.7 s to settle after the input stops (was 0.5 s)
  const kw = 1-Math.exp(-4.2*dt);
  for(const k of STATES) Wd[k] += (Wt[k]-Wd[k])*kw;
  asmProg += (asmTarget-asmProg)*(1-Math.exp(-4.5*dt));
  const sy = window.scrollY || 0;
  if(Math.abs(sy-lastScrollY) > 1.5*getH()) jumpUntil = now + 900;      // an anchor link or a scripted jump
  if(dt>0) scrollVel += (((sy-lastScrollY)/dt/getH()) - scrollVel)*(1-Math.exp(-5*dt));
  lastScrollY = sy;
  for(let k=0;k<4;k++){ clusterAct[k] += ((k===shownCluster?1:0)-clusterAct[k])*(1-Math.exp(-5*dt)); }
  const w4 = Wd.split4;
  { const any = Math.max(clusterAct[0],clusterAct[1],clusterAct[2],clusterAct[3]), cb = (k)=> (clusterAct[k]*0.95 - (1-clusterAct[k])*any*0.3)*w4;
    clusterBoost.value.set(cb(0), cb(1), cb(2), cb(3)); fillUniform.value = 0.5*w4; }
  fitScale += (scaleTarget-fitScale)*(1-Math.exp(-4*dt));
  group.scale.setScalar(fitScale);
  renderer.toneMappingExposure = 1.0 + 0.1*Wd.finale;          // finale: a touch more light
  const heroOn = Wd.hero > 0.6;

  const spinning = Math.abs(yawVel)>0.25 || Math.abs(pitchVel)>0.25;
  if(!dragging && spinning) lastInteract = now;               // a flick counts as his until it settles
  const userInteracting = dragging || (now-lastInteract) < RESUME_MS;
  const autopilotOn = !paused && !userInteracting && !introBusy() && now >= introHoldUntil;   // [INTRO API] no beat fights the landing, then a still beat once it has formed

  // ---- orientation = base (autopilot sway OR where he put it) + pointer lean + float ----
  if(!paused){
    if(dragging){ resumeEase = 0; }
    else if(userInteracting){
      resumeEase = 0;
      const dec = Math.exp(-2.4*dt);                           // inertia: flick to spin
      baseYaw += yawVel*dt; basePitch = THREE.MathUtils.clamp(basePitch + pitchVel*dt, -PITCH_MAX, PITCH_MAX);
      yawVel *= dec; pitchVel *= dec;
    } else if(!yawParam){
      yawVel = pitchVel = 0;
      resumeEase = Math.min(1, resumeEase + dt/1.6);           // ease back from wherever he left it, no snap
      swayT += dt;
      const targetYaw = THREE.MathUtils.clamp(0.12 + 0.09*MOTION + Math.sin(swayT*0.3+0.9)*0.5*MOTION + Math.sin(swayT*0.71)*0.06*MOTION, -0.55, 1.08);
      const targetPitch = BASE_TILT_X + Math.sin(swayT*0.21+1)*0.05*MOTION;
      baseYaw = Math.atan2(Math.sin(baseYaw), Math.cos(baseYaw)); // unwind after a big spin
      const k = (1-Math.exp(-1.7*dt))*smoother(resumeEase);
      baseYaw += (targetYaw-baseYaw)*k;
      basePitch += (targetPitch-basePitch)*k;
    }
    const wantTilt = pointerOver && !dragging && POINTER_TILT>0 && centrePresence>0.4;
    const kt = 1-Math.exp(-(wantTilt?5:2.5)*dt);
    tiltYaw += ((wantTilt ? tiltTX*POINTER_TILT : 0)-tiltYaw)*kt;
    tiltPitch += ((wantTilt ? tiltTY*POINTER_TILT*0.8 : 0)-tiltPitch)*kt;
    const fl = yawParam ? 0 : 1;
    if(!isFinite(baseYaw)) baseYaw = 0.12; if(!isFinite(basePitch)) basePitch = BASE_TILT_X; if(!isFinite(swayT)) swayT = 0;
    group.rotation.y = baseYaw + tiltYaw;
    group.rotation.x = basePitch + tiltPitch;
    group.rotation.z = fl*Math.sin(timeS*0.43+2)*0.014*MOTION;
    baseY = (0.5-anchorPx/getH())*visH;                                          // [DIRECTION] rides with its chapter, locked to the scroll
    group.position.y = baseY + fl*Math.sin(timeS*0.62)*0.055*MOTION*fitScale;   // gentle float
    group.position.x = (anchorXpx/getW()-0.5)*visW + fl*Math.sin(timeS*0.37+1)*0.03*MOTION*fitScale;
  }
  const glowX = (anchorXpx/getW()-0.5)*visW;                  // 0 whenever the form is centred, as in v5
  glow.position.set(glowX, group.position.y, -2.5); glow.scale.set(11*fitScale, 9*fitScale, 1);
  floorGlow.position.set(glowX, group.position.y-(EXT_H/2+0.42)*fitScale, -0.5); floorGlow.scale.set(5.4*fitScale, 0.5*fitScale, 1);

  // ---- autopilot program: the full performance belongs to the hero; elsewhere the chapter directs ----
  if(autopilotOn){
    if(userExpanded && (now-lastInteract) > 6500){ userExpanded = false; expanded = false; enterMode('rest', 2600, now); }
    else if(!userExpanded && now-autoModeStart > autoDur){
      if(heroOn || beatOverride) nextBeat(now); else enterMode('rest', 1200, now);
    }
    if(!heroOn && !beatOverride && !userExpanded && autoMode!=='rest' && autoMode!=='intro') enterMode('rest', 1200, now);
  } else if(userInteracting && autoMode!=='rest' && autoMode!=='intro' && !beatOverride){
    enterMode('rest', 700, now);   // beats pick up again soon after he lets go
  }
  if(userExpanded && centrePresence < 0.5){ userExpanded = false; expanded = false; }
  scatterActive *= Math.exp(-1.5*dt);

  // skip the per-plate loop entirely once everything has been home and still for a few frames
  const dirMoving = Wd.frame>0.002 || Wd.assemble>0.002 || Wd.split4>0.002 || Wd.orbit>0.002;
  const mightMove = dirMoving || (tapC && now-tapT0 < TAP_LIFE*1000+200) || expanded || seam>0 || scatterActive>0.01 || autoMode==='wave' || autoMode==='ghost' || autoMode==='ghostside' || autoMode==='burst';
  if(mightMove || idleFrames<=4){
    const busy = updatePlates(dt, now, timeS);
    idleFrames = (busy || mightMove) ? 0 : idleFrames+1;
  }
  renderer.render(scene, camera);
  emitSound(now);

  if(firstFrame){
    firstFrame = false;
    renderer.domElement.style.opacity = '1';
    hidePosters();
    try{ window.dispatchEvent(new CustomEvent('piece:ready', {detail:{plates:N}})); }catch(_){}
  }
  if(DEBUG){
    let s1='frame', v1=-1, s2='frame', v2=-1;
    for(const k of STATES){ const v=Wd[k]; if(v>v1){ s2=s1; v2=v1; s1=k; v1=v; } else if(v>v2){ s2=k; v2=v; } }
    const d = window.__piece;
    d.state = s1; d.next = v2>0.02 ? s2 : null; d.progress = v2>0.02 ? +(v2/(v1+v2)).toFixed(3) : 0;
    d.fps = fpsNow; d.plates = N; d.drawCalls = renderer.info.render.calls; d.plateDrawCalls = 1;
    d.assemble = +asmProg.toFixed(3); d.cluster = shownCluster; d.clusterWant = activeCluster; d.centre = +centrePresence.toFixed(3);
    d.mode = autoMode; d.seam = +seam.toFixed(2); d.yaw = group.rotation.y; d.scale = fitScale; d.counts = plateCounts;
  }
}
if(DEBUG) window.__piece = {state:'hero', next:null, progress:0, fps:0, plates:N, drawCalls:0,
  expand(){ expanded = true; userExpanded = true; lastInteract = performance.now(); },
  reset(){ expanded = false; userExpanded = false; lastInteract = performance.now(); }};
updatePlates(0, performance.now(), 0);
frame();

// [INTRO API] window.WingPiece.playIntro: orbit-in beat then converge to the exact hero rest state, once,
// on a genuine first-session load. Idempotent: safe to call again while running or after it has finished.
function playIntro(opts){
  opts = opts || {};
  const done = function(){ try{ if(opts.onDone) opts.onDone(); }catch(_){} };
  if(opts.reducedMotion){
    introArmed = false; introRunning = false; introCallAt = -1; introOrbBoost = 0; introDone = true;
    prog.fill(0); seam = 0; flyClock = 3; lastMaxProg = 0;
    try{ requestAnimationFrame(done); }catch(_){ done(); }
    return;
  }
  if(!introArmed || introDone){ try{ requestAnimationFrame(done); }catch(_){ done(); } return; }
  if(introCallAt >= 0){ introDoneCB = opts.onDone || introDoneCB; return; }   // already playing: adopt the newest callback
  introDoneCB = opts.onDone || null;
  introCallAt = performance.now();
}
pieceAPI = {playIntro: playIntro};
// [round 8] never leave the piece parked: play a call that arrived early, and self-start if the shell never calls.
if(window.WingPiece._pendingIntro) playIntro({});
else setTimeout(function(){ if(introWaiting()) playIntro({}); }, 1500);

return {plates:N};
}

// ---------- boot: lazy, after first paint ----------
function boot(){
  var stage = makeStage();
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(qs.get('poster')==='1') reduced = true;                     // test hook for the fallback
  if(reduced || !hasWebGL()){ showPosters(stage, true); firePieceReady(); return; }
  // same importmap v5 uses; added only when the page has none. The engine also falls back to the full URL.
  if(!document.querySelector('script[type="importmap"]')){
    try{
      var im = document.createElement('script'); im.type = 'importmap';
      im.textContent = JSON.stringify({imports:{'three':THREE_URL, 'three/addons/':ADDONS_URL}});
      document.head.appendChild(im);
    }catch(_){}
  }
  var slow = setTimeout(function(){ showPosters(stage); }, 1400);    // slow network: a poster holds the stage until three arrives
  function start(){
    import(THREE_URL).then(function(THREE){
      clearTimeout(slow);
      try{ initPiece(THREE, stage); firePieceReady(); }
      catch(err){ if(window.console) console.warn('[piece-engine] init failed, showing posters', err); var c = stage.querySelector('canvas'); if(c) c.remove(); showPosters(stage, true); firePieceReady(); }
    }).catch(function(err){
      clearTimeout(slow);
      if(window.console) console.warn('[piece-engine] three.js did not load, showing posters', err);
      showPosters(stage, true);
      firePieceReady();
    });
  }
  requestAnimationFrame(function(){ requestAnimationFrame(function(){
    if('requestIdleCallback' in window) requestIdleCallback(start, {timeout:500}); else setTimeout(start, 60);
  }); });
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
