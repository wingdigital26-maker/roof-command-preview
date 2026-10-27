// house3d.js: the Today card's house in 3D. The same model the CRM record draws (c5-home/home.js: the home's real
// building outline through lib/real-roof.js, walls, plated roof, caps, windows and door, the same palette), built here
// for the card with cheap materials (Lambert, no shadows, no environment map) so the first frame is quick and the
// shader compile never hitches the page. One renderer and one WebGL context for every stop: the canvas moves to the
// current card and the world is rebuilt in place (geometry disposed). Rendering pauses off screen, in a hidden tab and
// in a parked frame (lib/rc-frame-pause.js holds requestAnimationFrame). Loaded by dk.js after Today has painted.
import * as THREE from '../vendor/three@0.170.0/build/three.module.min.js';

const SCALE = 2.8, E1 = 3.0, BASE = .44, MARGIN = 1.9, STORY_U = 9.5 / 2.8;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isPhone = () => matchMedia('(max-width:640px)').matches;

// ---------- palette (c5-home/home.js) ----------
const lam = (color, extra) => new THREE.MeshLambertMaterial(Object.assign({ color }, extra || {}));
const wallMat = lam('#E3E7EE'), trimMat = lam('#AEB6C6'), plinthMat = lam('#DCE0E8'), winTrimMat = lam('#F6F7FA');
const glassMat = lam('#7F93AA', { emissive: '#1C2838', polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
const doorMat = lam('#2A3350'), capMat = lam('#D9DEE8', { side: THREE.DoubleSide });
const slabMat = lam('#1A2650'), slabRedMat = lam('#4A1412');
const roofTrimMat = lam('#C9D0DD');
const plateMat = lam('#ffffff');
const faceMat = lam('#E3E7EE', { side: THREE.DoubleSide }), soffitMat = lam('#AEB6C6', { side: THREE.DoubleSide });
const RED = new THREE.Color('#A3161F'), RED_HIT = new THREE.Color('#BE2A30');
const plateGeo = new THREE.BoxGeometry(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);
let contactMat = null;

// ---------- geometry helpers (ported from home.js) ----------
function squareAngle(pts) {
  const P = pts.map(p => [+p[0], +p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 3) return 0;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  P.forEach(p => { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
  P.slice().reverse().forEach(p => { while (hi.length > 1 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); });
  const H = lo.slice(0, -1).concat(hi.slice(0, -1));
  let best = 0, bestA = Infinity;
  H.forEach((a, i) => {
    const b = H[(i + 1) % H.length]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) < .5) return;
    const t = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(t), s = Math.sin(t);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    H.forEach(p => { const u = p[0] * c + p[1] * s, v = -p[0] * s + p[1] * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); });
    const A = (u1 - u0) * (v1 - v0); if (A < bestA - 1e-6) { bestA = A; best = t; }
  });
  const q = Math.PI / 2; return best - Math.round(best / q) * q;
}
function pointInPoly(p, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (((a.y > p.y) !== (b.y > p.y)) && (p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)) c = !c; } return c; }
function rand(s) { return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
function roundedRectShape(w, d, r) { const s = new THREE.Shape(), x = -w / 2, y = -d / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d); s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; }
function bar(a, b, up, w, h, mat, lift) {
  const d = b.clone().sub(a); const len = d.length(); d.normalize();
  const side = new THREE.Vector3().crossVectors(d, up).normalize(); const upn = new THREE.Vector3().crossVectors(side, d).normalize();
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, h, w), mat);
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(d, upn, side));
  m.position.copy(a).add(b).multiplyScalar(.5).addScaledVector(upn, lift);
  return m;
}
function stripMesh(pts, n, lift, thick, mat) {
  const p0 = pts[0], u = new THREE.Vector3(); for (let i = 1; i < pts.length && u.lengthSq() < 1e-8; i++) u.copy(pts[i]).sub(p0);
  u.normalize(); const v = new THREE.Vector3().crossVectors(n, u).normalize();
  const shape = new THREE.Shape(pts.map(p => { const d = p.clone().sub(p0); return new THREE.Vector2(d.dot(u), d.dot(v)); }));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  const M4 = new THREE.Matrix4().makeBasis(u, v, n.clone()); M4.setPosition(p0.clone().addScaledVector(n, lift)); g.applyMatrix4(M4);
  return new THREE.Mesh(g, mat);
}
function capSolid(pts, n, n2, a, b, h0, h1, mat) {
  const m = n2 ? n.clone().add(n2).normalize() : n.clone(), k = 1 / Math.max(.3, m.dot(n));
  const ab = b.clone().sub(a), L2 = ab.lengthSq();
  const onEdge = p => { const t = p.clone().sub(a).dot(ab) / L2; return p.distanceTo(a.clone().addScaledVector(ab, t)) < .02; };
  const lift = (p, h) => onEdge(p) ? p.clone().addScaledVector(m, h * k) : p.clone().addScaledVector(n, h);
  const p0 = pts[0], u = new THREE.Vector3(); for (let i = 1; i < pts.length && u.lengthSq() < 1e-8; i++) u.copy(pts[i]).sub(p0);
  u.normalize(); const v = new THREE.Vector3().crossVectors(n, u).normalize();
  const tris = THREE.ShapeUtils.triangulateShape(pts.map(p => { const d = p.clone().sub(p0); return new THREE.Vector2(d.dot(u), d.dot(v)); }), []);
  const top = pts.map(p => lift(p, h1)), bot = pts.map(p => lift(p, h0)), pos = [];
  const tri = (A, B, C, want) => { const nn = B.clone().sub(A).cross(C.clone().sub(A)); (nn.dot(want) >= 0 ? [A, B, C] : [A, C, B]).forEach(q => pos.push(q.x, q.y, q.z)); };
  tris.forEach(([i, j, l]) => { tri(top[i], top[j], top[l], n); tri(bot[i], bot[j], bot[l], n.clone().negate()); });
  const cen = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  pts.forEach((p, i) => { const j = (i + 1) % pts.length, out = p.clone().add(pts[j]).multiplyScalar(.5).sub(cen); tri(bot[i], bot[j], top[j], out); tri(bot[i], top[j], top[i], out); });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

// ---------- the model: spec (lib/real-roof.js, feet) to scene parts ----------
function compute(spec) {
  let E = E1;
  if (spec.facet3d && spec.eaveFt > 0) E = spec.eaveFt / SCALE;
  const rot = squareAngle(spec.fp), rc = Math.cos(-rot), rs = Math.sin(-rot);
  const RT = p => [p[0] * rc - p[1] * rs, p[0] * rs + p[1] * rc];
  const rfp = spec.fp.map(RT), xs = rfp.map(p => p[0]), ys = rfp.map(p => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const T = p => { const q = RT(p); return V((q[0] - cx) / SCALE + .7, E + (p[2] || 0) / SCALE, (q[1] - cy) / SCALE + 3.4); };
  const kk = p => (+p[0]).toFixed(2) + ',' + (+p[1]).toFixed(2) + ',' + (+(p[2] || 0)).toFixed(2);
  const typed = {}; spec.edges.forEach(e => { typed[[kk(e.a), kk(e.b)].sort().join('|')] = e.type; });
  const hits = spec.hit || [];
  const PLANES = spec.planes.map(pl => ({
    id: pl.id, rise: pl.rise, hit: hits[0] === pl.id ? 'heavy' : hits.includes(pl.id) ? 'light' : undefined,
    pts: pl.pts.map(T), spts: spec.mesh ? pl.pts : null,
    types: pl.types ? pl.types.slice() : pl.pts.map((a, i) => { const b = pl.pts[(i + 1) % pl.pts.length]; const t = typed[[kk(a), kk(b)].sort().join('|')]; if (t) return t; const za = a[2] || 0, zb = b[2] || 0; return za === 0 && zb === 0 ? 'eave' : Math.abs(za - zb) < .01 ? 'ridge' : 'hip'; })
  }));
  const CAPS = spec.mesh ? [] : spec.edges.filter(e => e.type === 'ridge' || e.type === 'hip').map(e => [T(e.a), T(e.b)]);
  const CAP_STRIPS = spec.mesh && spec.caps ? spec.caps.map(c => ({ facet: c.facet, edge: c.edge, pts: c.pts.map(T) })) : null;
  const FP = spec.fp.map(p => T([p[0], p[1], 0]));
  return { E, T, PLANES, CAPS, CAP_STRIPS, FP, spec };
}

function buildHouse(house, R) {
  const { E, T: FPT, FP, PLANES, spec } = R;
  const shp = new THREE.Shape(FP.map(p => new THREE.Vector2(p.x, -p.z)));
  const wg = new THREE.ExtrudeGeometry(shp, { depth: E, bevelEnabled: false }); wg.rotateX(-Math.PI / 2);
  const w = new THREE.Mesh(wg, wallMat); house.add(w);
  const tg = new THREE.ExtrudeGeometry(shp, { depth: .14, bevelEnabled: true, bevelSize: .15, bevelThickness: 0, bevelSegments: 1 }); tg.rotateX(-Math.PI / 2);
  house.add(new THREE.Mesh(tg, trimMat));
  if (spec.meshWalls) { w.visible = false; buildMeshWalls(house, R); return; }
  if (spec.blocks) spec.blocks.forEach(b => {
    const pts = b.ring.map(p => FPT([p[0], p[1], 0])); if (pts.length < 3) return;
    const bs = new THREE.Shape(pts.map(p => new THREE.Vector2(p.x, -p.z)));
    const bg = new THREE.ExtrudeGeometry(bs, { depth: b.top / SCALE + .02, bevelEnabled: false }); bg.rotateX(-Math.PI / 2); bg.translate(0, E - .01, 0);
    house.add(new THREE.Mesh(bg, wallMat));
  });
  if (spec.steps) spec.steps.forEach(q => {
    const v = q.map(p => FPT(p)), g = new THREE.BufferGeometry().setFromPoints([v[0], v[1], v[2], v[0], v[2], v[3]]); g.computeVertexNormals();
    house.add(new THREE.Mesh(g, faceMat));
  });
  PLANES.forEach(P => P.types.forEach((ty, i) => {
    if (ty !== 'rake') return; let a = P.pts[i], b = P.pts[(i + 1) % P.pts.length]; if (a.y > b.y) [a, b] = [b, a];
    const g = new THREE.BufferGeometry().setFromPoints([a, b, V(b.x, E, b.z)]); g.computeVertexNormals();
    const m = new THREE.Mesh(g, faceMat); m.position.y = -.02; house.add(m);
  }));
  // windows and the door by rule, as the record does (one row per story the wall is tall enough for)
  const STORIES = Math.max(1, Math.round((E - E1) / STORY_U) + 1);
  const inside = (x, z) => pointInPoly({ x, y: z }, FP.map(p => ({ x: p.x, y: p.z })));
  const SILL = E1 * .34, HEAD = E1 * .78, WW = 1.3, FR = .09, END = 1.1, GAP = 3.1;
  const walls = FP.map((a, i) => {
    const b = FP[(i + 1) % FP.length], L = a.distanceTo(b), along = b.clone().sub(a).normalize();
    let n = V(along.z, 0, -along.x); const mid = a.clone().add(b).multiplyScalar(.5);
    if (inside(mid.x + n.x * .3, mid.z + n.z * .3)) n.negate();
    const usable = L - 2 * END, cnt = usable < WW + 2 * FR ? 0 : Math.max(1, Math.floor((usable + GAP) / (WW + GAP)));
    return { a, along, n, L, usable, cnt };
  });
  const front = walls.filter(w => w.n.z > .7 && w.L >= 4).sort((p, q) => q.L - p.L)[0];
  if (front) { let c = front.cnt; if (c % 2 === 0) c = front.usable / (c + 1) >= WW + 1.6 ? c + 1 : Math.max(1, c - 1); front.cnt = c; front.door = (c - 1) / 2; }
  walls.forEach(w => {
    for (let s = 0; s < STORIES; s++) for (let k = 0; k < w.cnt; k++) {
      if (s * STORY_U + HEAD > E) continue;
      const p = w.a.clone().addScaledVector(w.along, END + w.usable * (k + .5) / w.cnt);
      const g = new THREE.Group(); g.position.set(p.x, s * STORY_U, p.z); g.rotation.y = Math.atan2(w.n.x, w.n.z); house.add(g);
      if (w.door === k && s === 0) doorAt(g); else windowAt(g);
    }
  });
}
function part(g, w, h, d, x, y, z, mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; }
function windowAt(g) {
  const SILL = E1 * .34, HEAD = E1 * .78, WW = 1.3, FR = .09, hh = HEAD - SILL, cy = (SILL + HEAD) / 2;
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(WW, hh), glassMat); gl.position.set(0, cy, .02); g.add(gl);
  part(g, WW + 2 * FR, FR, .08, 0, HEAD + FR / 2, .04, winTrimMat);
  part(g, WW + 2 * FR, FR, .08, 0, SILL - FR / 2, .04, winTrimMat);
  part(g, FR, hh, .08, -(WW + FR) / 2, cy, .04, winTrimMat); part(g, FR, hh, .08, (WW + FR) / 2, cy, .04, winTrimMat);
  part(g, WW + .34, .07, .17, 0, SILL - FR - .035, .085, winTrimMat);
  part(g, .035, hh, .025, 0, cy, .035, winTrimMat); part(g, WW, .035, .025, 0, cy, .035, winTrimMat);
}
function doorAt(g) {
  const HEAD = E1 * .78, FR = .09, dw = 1.2, top = HEAD + .05, y0 = .14, h = top - y0;
  part(g, dw, h, .05, 0, y0 + h / 2, .025, doorMat);
  part(g, dw + 2 * FR, FR, .1, 0, top + FR / 2, .05, winTrimMat);
  part(g, FR, h, .1, -(dw + FR) / 2, y0 + h / 2, .05, winTrimMat); part(g, FR, h, .1, (dw + FR) / 2, y0 + h / 2, .05, winTrimMat);
  const lite = new THREE.Mesh(new THREE.PlaneGeometry(dw * .62, h * .3), glassMat); lite.position.set(0, y0 + h * .76, .055); g.add(lite);
  part(g, .07, .07, .08, dw * .36, y0 + h * .46, .08, trimMat);
  part(g, dw + .9, .12, .6, 0, .06, .3, plinthMat);
}
// the solid model's wall, soffit and fascia faces, with windows and the door per face (home.js buildMeshWalls)
function buildMeshWalls(house, R) {
  const { T: FPT, spec } = R;
  const O3 = FPT([0, 0, 0]);
  const faces = spec.meshWalls.map(f => ({ pts: f.pts.map(p => FPT(p)), kind: f.kind, out: FPT(f.n).sub(O3).normalize() })).filter(f => f.pts.length >= 3);
  faces.forEach(f => {
    const P = f.pts, n = new THREE.Vector3();
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; n.x += (a.y - b.y) * (a.z + b.z); n.y += (a.z - b.z) * (a.x + b.x); n.z += (a.x - b.x) * (a.y + b.y); }
    if (n.lengthSq() < 1e-9) return; n.normalize(); if (n.dot(f.out) < 0) n.negate(); f.n = n;
    const ref = Math.abs(n.y) < .9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const e1 = new THREE.Vector3().crossVectors(ref, n).normalize(), e2 = new THREE.Vector3().crossVectors(n, e1).normalize();
    const o = P[0], poly = P.map(p => new THREE.Vector2(p.clone().sub(o).dot(e1), p.clone().sub(o).dot(e2)));
    const tris = THREE.ShapeUtils.triangulateShape(poly, []); const pos = [];
    tris.forEach(tr => { const [a, b, c] = tr.map(i => P[i]); const tn = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)); const o3 = tn.dot(n) >= 0 ? [a, b, c] : [a, c, b]; o3.forEach(p => pos.push(p.x, p.y, p.z)); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    house.add(new THREE.Mesh(g, f.kind === 'soffit' ? soffitMat : faceMat));
  });
  const SILL = E1 * .34, HEAD = E1 * .78, WW = 1.3, FR = .09, END = 1.1, GAP = 3.1;
  const runs = [];
  faces.filter(f => f.kind !== 'soffit' && f.n && Math.abs(f.n.y) < .05).forEach(f => {
    const n = f.n, along = new THREE.Vector3(-n.z, 0, n.x).normalize();
    const poly = f.pts.map(p => ({ x: p.dot(along), y: p.y }));
    const ys = poly.map(p => p.y), xs = poly.map(p => p.x);
    if (Math.max(...ys) - Math.min(...ys) < HEAD + .4) return;
    const fits = (cx, y0) => { const x0 = cx - WW / 2 - FR - .12, x1 = cx + WW / 2 + FR + .12, ya = y0 + SILL - FR - .25, yb = y0 + HEAD + FR + .3;
      return [[x0, ya], [x1, ya], [x1, yb], [x0, yb], [(x0 + x1) / 2, ya], [(x0 + x1) / 2, yb], [x0, (ya + yb) / 2], [x1, (ya + yb) / 2]].every(([x, y]) => pointInPoly({ x, y }, poly)); };
    for (let s = 0; s < 3; s++) {
      const y0 = s * STORY_U; let run = null;
      for (let x = Math.min(...xs) + END; x <= Math.max(...xs) - END + 1e-6; x += .1) {
        if (fits(x, y0)) { if (!run) run = { f, s, a: x, b: x }; else run.b = x; }
        else if (run) { runs.push(run); run = null; }
      }
      if (run) runs.push(run);
    }
  });
  const front = runs.filter(r => r.s === 0 && r.f.n.z > .7).sort((p, q) => (q.b - q.a) - (p.b - p.a))[0];
  runs.forEach(r => {
    const L = r.b - r.a; let cnt = Math.max(1, Math.floor((L + GAP) / (WW + GAP)));
    if (r === front && cnt % 2 === 0) cnt = L / (cnt + 1) >= WW + 1.2 ? cnt + 1 : Math.max(1, cnt - 1);
    const n = r.f.n, along = new THREE.Vector3(-n.z, 0, n.x).normalize(), o = r.f.pts[0];
    for (let k = 0; k < cnt; k++) {
      const x = cnt === 1 ? (r.a + r.b) / 2 : r.a + L * (k + .5) / cnt;
      const p = o.clone().addScaledVector(along, x - o.dot(along));
      const g = new THREE.Group(); g.position.set(p.x, r.s * STORY_U, p.z); g.rotation.y = Math.atan2(n.x, n.z); house.add(g);
      if (r === front && k === (cnt - 1) / 2) doorAt(g); else windowAt(g);
    }
  });
}
// the plated roof: a slab per plane, shingle plates as one instanced mesh (cobalt, roofer red where the hail hit), trim, caps
function buildRoof(roof, R) {
  const { PLANES, CAPS, CAP_STRIPS, T: FPT, spec } = R, RR = window.RealRoof;
  const groups = [];
  PLANES.forEach((P, idx) => {
    const p0 = P.pts[0], p1 = P.pts[1];
    const u = p1.clone().sub(p0).normalize(); let other = P.pts[2].clone().sub(p0), ob = -1;
    P.pts.forEach(q => { const d = q.clone().sub(p0), c = d.clone().cross(u).length(); if (c > ob) { ob = c; other = d; } });
    const n = new THREE.Vector3().crossVectors(u, other).normalize(); if (n.y < 0) n.negate();
    const v = new THREE.Vector3().crossVectors(n, u).normalize(); if (v.dot(other) < 0) v.negate();
    const to2 = q => { const d = q.clone().sub(p0); return new THREE.Vector2(d.dot(u), d.dot(v)); };
    const poly = P.pts.map(to2);
    const g = new THREE.Group(); roof.add(g);
    const basis = new THREE.Matrix4().makeBasis(u, n, v.clone());
    const shape = new THREE.Shape(poly.map(q => new THREE.Vector2(q.x, q.y)));
    const sg = new THREE.ExtrudeGeometry(shape, { depth: .12, bevelEnabled: false });
    const m = new THREE.Matrix4().makeBasis(u, v, n.clone().negate()); m.setPosition(p0); sg.applyMatrix4(m);
    const red = P.hit === 'heavy';
    g.add(new THREE.Mesh(sg, red ? slabRedMat : slabMat));
    const minX = Math.min(...poly.map(q => q.x)), maxX = Math.max(...poly.map(q => q.x)), maxY = Math.max(...poly.map(q => q.y)), minY = Math.min(0, ...poly.map(q => q.y));
    const W = .4, H = .26, gap = .035; const Rn = rand(7919 * (idx + 3));
    const mats = [], cols = [];
    for (let r = 0, y = minY + H / 2 + .03; y < maxY; r++, y += H) { const off = (r % 2) * W * .5; for (let x = minX - W + off; x < maxX + W; x += W) { const cx = x + W / 2; if (!pointInPoly({ x: cx, y }, poly)) continue; mats.push({ cx, cy: y, jitter: (Rn() - .5) }); cols.push(Rn()); } }
    if (mats.length) {
      const inst = new THREE.InstancedMesh(plateGeo, plateMat, mats.length);
      const MM = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(); const qBasis = new THREE.Quaternion().setFromRotationMatrix(basis);
      const RH = rand(4242 + idx), hailP = P.hit === 'heavy' ? .085 : P.hit === 'light' ? .03 : 0;
      const col = new THREE.Color(), tmpC = new THREE.Color();
      mats.forEach((pl, i) => {
        const hit = RH() < hailP;
        const tilt = .055 + pl.jitter * .02 + (hit ? (RH() - .5) * .22 : 0); const twist = hit ? (RH() - .5) * .18 : pl.jitter * .012;
        Q.copy(qBasis).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-tilt, twist, 0)));
        const pos = p0.clone().addScaledVector(u, pl.cx).addScaledVector(v, pl.cy).addScaledVector(n, .07);
        S.set(W - gap, .04, H + .05); MM.compose(pos, Q, S); inst.setMatrixAt(i, MM);
        const t = cols[i]; col.setHSL(.627 + t * .01, .70 + t * .06, .30 + t * .08);
        if (red) { const l = col.getHSL({}).l; tmpC.copy(hit ? RED_HIT : RED).offsetHSL(0, 0, (l - .34) * .45); col.copy(tmpC); }
        inst.setColorAt(i, col);
      });
      g.add(inst);
    }
    for (let i = 0; i < P.pts.length; i++) {
      if (P.spts && RR && RR.edgeStrip) { const s = RR.edgeStrip(P.spts, P.spts[i], P.spts[(i + 1) % P.spts.length], .42); if (s) g.add(stripMesh(s.map(p => FPT(p)), n, .065, .09, roofTrimMat)); }
      else g.add(bar(P.pts[i], P.pts[(i + 1) % P.pts.length], n, .3, .09, roofTrimMat, .11));
    }
    groups.push({ P, n });
  });
  CAPS.forEach(([a, b]) => roof.add(bar(a, b, UP, .62, .2, capMat, .2)));
  if (CAP_STRIPS) CAP_STRIPS.forEach(c => {
    const pg = groups.find(q => q.P.id === c.facet), e = spec.edges[c.edge]; if (!pg || !e) return;
    const other = (e.facets || []).filter(f => f !== c.facet).map(f => groups.find(q => q.P.id === f)).find(Boolean);
    roof.add(capSolid(c.pts, pg.n, other ? other.n : null, FPT(e.a), FPT(e.b), .03, .24, capMat));
  });
}

// ---------- the one renderer ----------
let renderers = 0;
export function create(opts) {
  opts = opts || {};
  const canvas = document.createElement('canvas'); canvas.className = 'h3d'; canvas.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' }); renderers++;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 300);
  const key = new THREE.DirectionalLight('#FFF6EC', 1.9); key.position.set(26, 28, 14); scene.add(key);
  const fill = new THREE.DirectionalLight('#DDE6FF', 0.55); fill.position.set(-24, 10, 26); scene.add(fill);
  const rim = new THREE.DirectionalLight('#FFFFFF', 0.7); rim.position.set(-10, 18, -30); scene.add(rim);
  scene.add(new THREE.HemisphereLight('#FFFFFF', '#7F8A9F', 0.95));
  if (!contactMat) {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, 'rgba(11,16,32,.55)'); gr.addColorStop(.45, 'rgba(11,16,32,.22)'); gr.addColorStop(1, 'rgba(11,16,32,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    contactMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
  }
  const target = V(.7, 2.0, 3.4);
  let world = null, key_ = '', dist = 40, elev = .55, yaw = .68, radius = 0, turn = !REDUCE, dragging = false, holdUntil = 0;
  let visible = true, onScreen = true, want = 0, lastT = 0, lastDraw = 0, frames = 0, pending = false, compiled = false;
  const stats = { renderers: () => renderers, firstFrameAt: null, builds: 0, lastBuildMs: 0, lastSwitch: null, frames: () => frames, key: () => key_ };
  const fitPts = [];
  const setYaw = () => { camera.position.set(target.x + radius * Math.cos(elev) * Math.sin(yaw), target.y + radius * Math.sin(elev), target.z + radius * Math.cos(elev) * Math.cos(yaw)); camera.lookAt(target); };
  // back the view off until the whole plinth and roof stay in frame from every angle of the turn
  function fit() {
    if (!fitPts.length || !canvas.clientWidth || !canvas.clientHeight) return;
    camera.aspect = canvas.clientWidth / canvas.clientHeight; camera.updateProjectionMatrix();
    // the CLOSEST view that keeps everything in frame (10-27: it used to start at a fixed distance and only back off, so a
    // small house sat tiny in the band): from close in, step out 3% at a time, per angle, keep the farthest angle's answer
    const y0 = yaw; let best = 0;
    for (let a = 0; a < 8; a++) {
      yaw = y0 + a * Math.PI / 4; radius = dist * .15;
      for (let i = 0; i < 200; i++) { setYaw(); camera.updateMatrixWorld();
        if (fitPts.every(p => { const q = p.clone().project(camera); return Math.abs(q.x) < .94 && Math.abs(q.y) < .86; })) break; radius *= 1.03; }
      best = Math.max(best, radius);
    }
    yaw = y0; radius = best; setYaw();
  }
  function clear() {
    if (!world) return;
    scene.remove(world); world.traverse(o => { if (o.geometry && o.geometry !== plateGeo) o.geometry.dispose(); }); world = null;
  }
  // build the model for a spec (the deck's own h.spec, lib/real-roof.js); none / loading = nothing to draw
  function build(spec, k) {
    const t0 = performance.now(); clear(); key_ = k || ''; fitPts.length = 0; frames = 0; pending = true;
    if (!spec || spec.none || !spec.fp || spec.fp.length < 3 || !spec.planes || !spec.planes.length) { want = 0; return false; }
    let R; try { R = compute(spec); } catch (e) { want = 0; return false; }
    world = new THREE.Group(); scene.add(world);
    const FP = R.FP, x0 = Math.min(...FP.map(p => p.x)), x1 = Math.max(...FP.map(p => p.x)), z0 = Math.min(...FP.map(p => p.z)), z1 = Math.max(...FP.map(p => p.z));
    const PW = x1 - x0 + 2 * MARGIN, PD = z1 - z0 + 2 * MARGIN;
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(44 * PW / 25, 38 * PD / 21), contactMat); contact.rotation.x = -Math.PI / 2; contact.position.set(.7, .004, 3.4); world.add(contact);
    const plinthGeo = new THREE.ExtrudeGeometry(roundedRectShape(PW, PD, 1.0), { depth: .26, bevelEnabled: true, bevelSize: .12, bevelThickness: .12, bevelSegments: 3 }); plinthGeo.rotateX(-Math.PI / 2);
    const plinth = new THREE.Mesh(plinthGeo, plinthMat); plinth.position.set(.7, 0, 3.4); world.add(plinth);
    const house = new THREE.Group(); house.position.y = BASE; world.add(house); buildHouse(house, R);
    const roof = new THREE.Group(); roof.position.y = BASE; world.add(roof); buildRoof(roof, R);
    // the record's home view, scaled to the plinth, then fitted to the card
    const top = BASE + R.E + Math.max(0, ...R.PLANES.flatMap(P => P.pts.map(p => p.y - R.E)));
    FP.forEach(p => { fitPts.push(V(p.x, BASE, p.z), V(p.x, top, p.z)); });
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => fitPts.push(V(.7 + sx * PW / 2, 0, 3.4 + sz * PD / 2)));
    const home = isPhone() ? V(32.7, 23, 41) : V(26.2, 18.5, 32); target.set(.7, 2.0, 3.4);
    const kf = Math.min(2.3, Math.max(.85, Math.max(PW / 25, PD / 21) * 1.04)); home.sub(target).multiplyScalar(kf);
    dist = home.length(); elev = Math.asin(home.y / dist); radius = dist;
    fit(); want = 2; stats.builds++; stats.lastBuildMs = Math.round(performance.now() - t0);
    return true;
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);
    fit(); want = Math.max(want, 1);
  }
  const ro = new ResizeObserver(() => { resize(); }); ro.observe(canvas);
  const io = new IntersectionObserver(es => { es.forEach(e => { onScreen = e.isIntersecting; }); if (onScreen) want = Math.max(want, 1); }, { threshold: .05 }); io.observe(canvas);
  document.addEventListener('visibilitychange', () => { visible = document.visibilityState !== 'hidden'; if (visible) want = Math.max(want, 1); });
  // drag turns the house; a tap (no drag) is the card's own link
  let px = 0, moved = 0;
  // the canvas sits inside the card's Open-home link: never let the browser start a link drag (Jack 10-17: it "pulls out a link")
  canvas.addEventListener('dragstart', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => { if (e.button !== 0 && e.pointerType === 'mouse') return; if (e.pointerType === 'mouse') e.preventDefault();
    const a = canvas.closest('a'); if (a) a.draggable = false; dragging = true; moved = 0; px = e.clientX; try { canvas.setPointerCapture(e.pointerId); } catch (err) {} });
  canvas.addEventListener('pointermove', e => { if (!dragging) return; const dx = e.clientX - px; px = e.clientX; moved += Math.abs(dx); yaw -= dx * .009; setYaw(); want = Math.max(want, 1); });
  const end = () => { if (!dragging) return; dragging = false; holdUntil = performance.now() + 2600; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('lostpointercapture', end);
  canvas.addEventListener('click', e => { if (moved > 6) { e.preventDefault(); e.stopImmediatePropagation(); moved = 0; } }, true);
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
    if (!world || !visible || !onScreen || !canvas.clientWidth || !canvas.isConnected) return;
    if (window.__mapMoving && !dragging) return;   // the map is being dragged: give it the GPU (10-17)
    const turning = turn && !dragging && now > holdUntil;
    if (turning) { yaw += dt * .14; setYaw(); }
    if (!turning && want <= 0) return;
    if (turning && !dragging && want <= 0 && now - lastDraw < 31) return;   // the idle turn draws at about 30 fps
    if (want > 0) want--;
    lastDraw = now; renderer.render(scene, camera); frames++;
    if (!stats.firstFrameAt) stats.firstFrameAt = performance.now();
    if (pending) { pending = false; if (stats.lastSwitch && !stats.lastSwitch.frameAt) stats.lastSwitch.frameAt = performance.now(); if (opts.onFrame) opts.onFrame(key_); }
  }
  // the first frame waits for the shaders (compileAsync): no synchronous compile on the main thread
  function start() {
    if (compiled) return; compiled = true;
    const go = () => requestAnimationFrame(loop);
    if (renderer.compileAsync) renderer.compileAsync(scene, camera).then(go, go); else go();
  }
  return { canvas, renderer, scene, camera, build, clear, resize, start, stats, setTurn: v => { turn = !!v && !REDUCE; }, key: () => key_, markSwitch: () => { stats.lastSwitch = { at: performance.now(), frameAt: null }; } };
}
