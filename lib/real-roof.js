/* Real roof spec for a home, from its real building outline.
   Input: one entry of c4-command-deck/data/roofs-*.json ({ring_ft, sqft, source, pitch:{rise, measured}}),
   ring in local feet, x east, y north. Geometry comes from the app's roof solver (js/roofplan.js,
   window.RoofPlan.build, hip roof by default) and is converted to the drawn-roof SPEC the deck and Home use:
   feet, x east, y SOUTH, z = height above the eave; planes {id, name, rise, dir, pts, types}, edges typed
   ridge/hip/valley/eave/rake, fp (outline), drive/yb for the yard art, hit (planes facing the storm).
   Squares = real plan area x pitch factor / 100. Pitch: measured USGS LiDAR (2018) when the home has a good fit
   (lib/st-meta.js), else 6/12 assumed and labelled so. There is no per-plane hail data, so no plane is marked hit.
   No outline: RealRoof.none() gives {none:true} and the screens say so instead of drawing a roof. */
(function () {
  const r2 = v => Math.round(v * 100) / 100;
  const COMPASS = ['North', 'North-east', 'East', 'South-east', 'South', 'South-west', 'West', 'North-west'];
  function segDist(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1e-12; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }

  function label(entry) {
    const p = entry && entry.pitch;
    if (p && p.measured) return `Estimated from the building outline, pitch est. ${p.rise}/12 from LiDAR (2018)`;
    // Texas data (lib/brand.js dataRoot): say it plainly, the 6/12 is only the estimate's working number
    if ((p && p.gap) || (window.activeRoofer && activeRoofer().dataRoot)) return `Estimated from the building outline. Pitch est. ${p ? p.rise : 6}/12 (no LiDAR)`;
    return `Estimated from the building outline, ${p && p.note && /built/.test(p.note) ? p.note : 'assumed ' + (p ? p.rise : 6) + '/12 pitch'}`;
  }

  // the per-facet LiDAR record (lib/rc-roof.js via STM.facts) when the batch measured this home with good confidence (m 1):
  // its squares, pitch and edge lengths replace the outline estimate; m 2 / 0 / none keep the outline estimate
  const EST_TIP = 'Estimated from public building outlines and 2018 LiDAR. Verify on site.';
  const FACET_TIP = 'Measured from LiDAR roof facets (2018/2020). Verify on site.';
  const facetRec = entry => { const r = entry && entry.facts && entry.facts.roof; return r && r.sq > 0 && (r.facets || (r.est && r.report)) ? r : null; };
  const fpt = FR => (window.RCROOF ? RCROOF.words(FR).pitch : '') || FR.pitch + '/12';   // "12/12 + 7/12": main and secondary
  const tip = x => (x &&(x.facet || (x.M && x.M.facet) || (x.spec && x.spec.facet)) ? FACET_TIP : EST_TIP);

  // ---------- the measured roof: every LiDAR facet of the full report (meta/roof-detail) as its own plane ----------
  // geometry_ft: feet, x east, y north (the same frame the top-down diagram draws). Each facet is a plane at its own
  // measured pitch, facing its measured azimuth, its eave at its measured eave height; z here is height above the
  // lowest eave on the roof (eaveFt), which is where the outline walls stop. The facet rings are LiDAR pixel stairs
  // (0.82 ft): simplified (Douglas-Peucker, 1.2 ft) so the planes read as planes.
  function dp(r, tol) {
    if (r.length < 4) return r;
    const keep = new Array(r.length).fill(false); keep[0] = keep[r.length - 1] = true;
    const st = [[0, r.length - 1]];
    while (st.length) { const [i, j] = st.pop(); let md = 0, mi = -1;
      for (let k = i + 1; k < j; k++) { const d = segDist(r[k], r[i], r[j]); if (d > md) { md = d; mi = k; } }
      if (md > tol && mi > 0) { keep[mi] = true; st.push([i, mi], [mi, j]); } }
    return r.filter((p, k) => keep[k]);
  }
  function simplify(ring) {
    const r = ring.slice(); if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
    if (r.length < 4) return r;
    // split the closed ring at the point farthest from its first point so DP sees two open chains
    let far = 0, fd = -1; r.forEach((p, k) => { const d = Math.hypot(p[0] - r[0][0], p[1] - r[0][1]); if (d > fd) { fd = d; far = k; } });
    const A = dp(r.slice(0, far + 1), 1.2), B = dp(r.slice(far).concat([r[0]]), 1.2);
    return A.concat(B.slice(1, -1));
  }
  // ---------- the solid-model roof (scripts/dfw/roof_blocks.py, ROOF-BLOCKS-1014): geometry_ft.mesh ----------
  // The house was built as solid massing blocks and unioned, so the roof and the walls are ONE closed mesh: every roof
  // facet and every wall / soffit / fascia face comes as a 3D polygon (ft, x east, y north, z above ground). Nothing is
  // rebuilt here: the facets are drawn as given (plane ids, labels, click-to-measure as for any measured roof) and the
  // vertical faces are drawn as the walls, so there is no wall block to misplace under a facet and no seam to close.
  // z in the spec is height above the lowest roof edge (eaveFt), the frame every screen uses.
  // ---------- edges of a solid-model roof, from the facet polygons themselves (EDGE RULE, 10-14) ----------
  // A ridge / hip / valley is drawn ONLY where two roof facets actually share an edge, clipped to that shared run; every
  // other facet edge is an eave, a rake or a wall line (flashing against a wall face of the solid). Nothing is taken from
  // a precomputed edge list, so a bar can never run past where two facets meet, cross another, or sit on one facet only.
  // Input rings: ft, any frame, z up. Output: rings with sub-edge types, and one edge per shared run / open edge, each
  // with the facet ids it belongs to. scripts/dfw/check_edges.mjs runs this same code and fails on any fake edge.
  const ETOL = 0.05;   // ft: vertices closer than this are one corner, a point this close to an edge lies on it
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len3 = a => Math.sqrt(dot3(a, a)), cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  function newell(P) { const n = [0, 0, 0]; P.forEach((a, i) => { const b = P[(i + 1) % P.length]; n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]); }); const l = len3(n) || 1; return n.map(v => v / l); }
  // the facet rings on one shared vertex list: 1. one canonical vertex per corner (vertices within ETOL merge), consecutive
  // duplicates dropped; 2. a corner of another facet lying inside an edge splits that edge (a T junction), so shared runs
  // line up end to end. Returns { V, R: [{ id, ids, ty }] } (ty[k]: the given type of the edge ids[k] -> ids[k + 1]).
  function canonRings(roof) {
    const V = [], vid = p => { for (let i = 0; i < V.length; i++) if (len3(sub3(V[i], p)) < ETOL) return i; V.push(p.slice()); return V.length - 1; };
    const R = roof.map(r => { const ids = [], ty = []; r.pts.forEach((p, k) => { const i = vid(p); if (ids.length && ids[ids.length - 1] === i) return; ids.push(i); ty.push((r.types || [])[k] || 'eave'); });
      while (ids.length > 1 && ids[0] === ids[ids.length - 1]) { ids.pop(); ty.pop(); }
      return { id: r.id, ids, ty }; }).filter(r => r.ids.length >= 3);
    R.forEach(r => { const ids = [], ty = []; r.ids.forEach((i, k) => { const j = r.ids[(k + 1) % r.ids.length], a = V[i], d = sub3(V[j], a), L = len3(d); ids.push(i); ty.push(r.ty[k]);
      const on = []; V.forEach((p, m) => { if (m === i || m === j || L < ETOL) return; const w = sub3(p, a), t = dot3(w, d) / L; if (t <= ETOL || t >= L - ETOL) return; if (len3(sub3(w, d.map(x => x * t / L))) < ETOL) on.push([t, m]); });
      on.sort((x, y) => x[0] - y[0]).forEach(([, m]) => { ids.push(m); ty.push(r.ty[k]); }); }); r.ids = ids; r.ty = ty; });
    return { V, R };
  }
  // ---------- COPLANAR MERGE (10-14): one flat roof plane is one facet ----------
  // Overlapping massing blocks can leave two facets on the SAME plane meeting along a seam (Caleo: the main block's west
  // slope split in two where main-ew and main-ns overlap). Drawn as two facets, the seam gets trim on both sides, a cap and
  // an edge line: a fake band across a flat slope. Adjacent facets whose planes agree (normals within COPLANAR_DEG, plane
  // offsets within COPLANAR_FT) are unioned into one polygon before anything else is built from them. Returns
  // [{ id, pts, types, members }]: members = the original facet ids, largest first (id = members[0]).
  const COPLANAR_DEG = 2, COPLANAR_FT = 0.15, SEAM_DEG = 5;
  const plane3 = P => { const n = newell(P), c = P.reduce((s, p) => [s[0] + p[0] / P.length, s[1] + p[1] / P.length, s[2] + p[2] / P.length], [0, 0, 0]); return { n, off: dot3(n, c) }; };
  const angDeg = (n, m) => Math.acos(Math.max(-1, Math.min(1, dot3(n, m)))) * 180 / Math.PI;
  function mergeCoplanar(roof, areaOf) {
    const { V, R } = canonRings(roof);
    const PL = R.map(r => plane3(r.ids.map(i => V[i])));
    const key = (i, j) => i < j ? i + '_' + j : j + '_' + i, use = {};
    R.forEach((r, ri) => r.ids.forEach((i, k) => { const j = r.ids[(k + 1) % r.ids.length]; (use[key(i, j)] = use[key(i, j)] || []).push(ri); }));
    const par = R.map((_, k) => k), find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    Object.values(use).forEach(U => { for (let x = 0; x < U.length; x++) for (let y = x + 1; y < U.length; y++) { const a = U[x], b = U[y];
      if (a !== b && angDeg(PL[a].n, PL[b].n) < COPLANAR_DEG && Math.abs(PL[a].off - PL[b].off) < COPLANAR_FT) par[find(a)] = find(b); } });
    const groups = {}; R.forEach((_, k) => { (groups[find(k)] = groups[find(k)] || []).push(k); });
    const out = [];
    Object.values(groups).forEach(G => {
      G.sort((a, b) => (areaOf(R[b].id) - areaOf(R[a].id)) || (R[a].id < R[b].id ? -1 : 1));
      const one = k => ({ id: R[k].id, pts: R[k].ids.map(i => V[i].slice()), types: R[k].ty.slice(), members: [R[k].id] });
      if (G.length === 1) { out.push(one(G[0])); return; }
      // union: every directed ring edge of the group whose reverse is not also in the group (the seams cancel in pairs)
      const dir = []; G.forEach(k => { const r = R[k]; r.ids.forEach((i, m) => dir.push({ i, j: r.ids[(m + 1) % r.ids.length], t: r.ty[m] })); });
      const has = new Set(dir.map(e => e.i + '>' + e.j)), bnd = dir.filter(e => !has.has(e.j + '>' + e.i));
      const from = {}; bnd.forEach(e => { (from[e.i] = from[e.i] || []).push(e); });
      // chain into one loop; a group whose boundary is not one simple loop (a hole, a pinch) stays unmerged
      const ring = [], tys = []; let e = bnd[0], ok = bnd.length >= 3 && Object.values(from).every(l => l.length === 1);
      for (let n = 0; ok && n < bnd.length; n++) { ring.push(e.i); tys.push(e.t); e = from[e.j] && from[e.j][0]; if (!e) ok = false; else if (e === bnd[0] && n !== bnd.length - 1) ok = false; }
      if (!ok || e !== bnd[0]) { G.forEach(k => out.push(one(k))); return; }
      // drop the corners the seam left on a straight run of the same edge type (the T where the seam met the eave)
      let pts = ring.map(i => V[i].slice()), types = tys.slice();
      for (let again = true; again && pts.length > 3;) { again = false;
        for (let k = 0; k < pts.length; k++) { const p = pts[(k - 1 + pts.length) % pts.length], q = pts[k], s = pts[(k + 1) % pts.length], tp = types[(k - 1 + pts.length) % pts.length];
          const d1 = sub3(q, p), d2 = sub3(s, q), l1 = len3(d1), l2 = len3(d2);
          if (tp === types[k] && l1 > 0 && l2 > 0 && len3(cross3(d1, d2)) / (l1 * l2) < 1e-3 && dot3(d1, d2) > 0) { pts.splice(k, 1); types.splice(k, 1); again = true; break; } } }
      out.push({ id: R[G[0]].id, pts, types, members: G.map(k => R[k].id) });
    });
    return out;
  }
  function meshEdges(roof, walls) {
    const { V, R } = canonRings(roof);
    // 3. which facets use each edge
    const key = (i, j) => i < j ? i + '_' + j : j + '_' + i, use = {};
    R.forEach((r, ri) => r.ids.forEach((i, k) => { const j = r.ids[(k + 1) % r.ids.length]; (use[key(i, j)] = use[key(i, j)] || []).push({ ri, k }); }));
    const NR = R.map(r => newell(r.ids.map(i => V[i])));
    const wallEdges = []; (walls || []).forEach(w => { const P = w.pts, top = Math.max(...P.map(p => p[2])); P.forEach((a, k) => wallEdges.push({ a, b: P[(k + 1) % P.length], top })); });
    const onWall = (a, b) => wallEdges.some(e => { const d = sub3(e.b, e.a), L = len3(d); if (L < ETOL) return false;
      const off = p => { const w = sub3(p, e.a), t = dot3(w, d) / L; return t > -ETOL && t < L + ETOL && len3(sub3(w, d.map(x => x * t / L))) < ETOL; };
      return off(a) && off(b) && e.top > Math.max(a[2], b[2]) + 0.3; });   // a wall face standing above this edge: flashing
    const cen = r => { const P = r.ids.map(i => V[i]); return P.reduce((s, p) => [s[0] + p[0] / P.length, s[1] + p[1] / P.length, s[2] + p[2] / P.length], [0, 0, 0]); };
    const edges = [], typeAt = {};
    Object.keys(use).forEach(k => {
      const U = use[k], [i, j] = k.split('_').map(Number), a = V[i], b = V[j], flat = Math.abs(a[2] - b[2]) < 0.1;
      if (len3(sub3(a, b)) < ETOL) return;
      let type;
      // a shared edge is a ridge / hip / valley only where the roof actually folds (dihedral over SEAM_DEG); two facets on
      // (almost) one plane meet in a 'seam': no cap, no trim, no edge line (mergeCoplanar normally removes these first)
      const fold = U.length >= 2 ? Math.max(...U.map(u => angDeg(NR[U[0].ri], NR[u.ri]))) : 0;
      if (U.length >= 2 && new Set(U.map(u => u.ri)).size >= 2 && fold <= SEAM_DEG) type = 'seam';
      else if (U.length >= 2 && new Set(U.map(u => u.ri)).size >= 2) {
        const given = U.map(u => R[u.ri].ty[u.k]).find(t => /^(ridge|hip|valley)$/.test(t));
        if (given) type = given;
        else { // convex (both facets fall away from it) = ridge / hip, concave = valley
          const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], below = U.every(u => cen(R[u.ri])[2] < m[2]);
          type = below ? (flat ? 'ridge' : 'hip') : 'valley';
        }
      } else {
        const t0 = R[U[0].ri].ty[U[0].k];
        type = onWall(a, b) || /flashing|wall/.test(t0) ? 'wall' : flat ? 'eave' : 'rake';
      }
      U.forEach(u => { typeAt[u.ri + ':' + u.k] = type; });
      edges.push({ type, a: a.slice(), b: b.slice(), facets: [...new Set(U.map(u => R[u.ri].id))] });
    });
    const rings = R.map((r, ri) => ({ id: r.id, pts: r.ids.map(i => V[i].slice()), types: r.ids.map((_, k) => typeAt[ri + ':' + k] || 'eave') }));
    return { rings, edges };
  }
  // the part of a facet within w ft of one of its edges, between the edge's two ends: a flat strip that lies in the facet
  // and never leaves it (cap bars, trim lines, typed edge lines). facet: 3D ring, a/b: the edge's ends. Returns a 3D ring.
  function edgeStrip(facet, a, b, w) {
    const d = sub3(b, a), L = len3(d); if (L < ETOL || facet.length < 3) return null;
    const u = d.map(x => x / L), n = newell(facet); let v = cross3(n, u); const lv = len3(v) || 1; v = v.map(x => x / lv);
    const to2 = p => { const q = sub3(p, a); return [dot3(q, u), dot3(q, v)]; };
    let poly = facet.map(to2);
    // the facet's interior side of the edge: the side with more facet area next to the edge
    const inside = (x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const p = poly[i], q = poly[j]; if ((p[1] > y) !== (q[1] > y) && x < (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1]) + p[0]) c = !c; } return c; };
    let s = 0; for (let k = 1; k < 8; k++) { const x = L * k / 8; s += (inside(x, 0.02) ? 1 : 0) - (inside(x, -0.02) ? 1 : 0); }
    if (s < 0) { v = v.map(x => -x); poly = poly.map(p => [p[0], -p[1]]); }
    // Sutherland-Hodgman: the facet clipped to the rectangle [0, L] x [0, w]
    const clip = (P, f) => { const out = []; P.forEach((p, i) => { const q = P[(i + 1) % P.length], fp = f(p), fq = f(q);
      if (fp >= 0) out.push(p); if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); } }); return out; };
    [p => p[0], p => L - p[0], p => p[1], p => w - p[1]].forEach(f => { if (poly.length) poly = clip(poly, f); });
    poly = poly.filter((p, i) => { const q = poly[(i + 1) % poly.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4; });
    if (poly.length < 3) return null;
    let A = 0; poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length]; A += p[0] * q[1] - q[0] * p[1]; }); if (Math.abs(A) < 1e-4) return null;
    return poly.map(p => [a[0] + p[0] * u[0] + p[1] * v[0], a[1] + p[0] * u[1] + p[1] * v[1], a[2] + p[0] * u[2] + p[1] * v[2]]);
  }
  // the cap bars of a solid-model roof: on every ridge and hip, a strip on each of the two facets that share it
  const CAP_W = 0.87;   // ft each side of the edge (the 1.74 ft cap the plain roofs draw)
  function capStrips(spec) {
    const byId = {}; spec.planes.forEach(p => { byId[p.id] = p; });
    const out = []; spec.edges.forEach((e, ei) => { if (e.type !== 'ridge' && e.type !== 'hip') return;
      (e.facets || []).forEach(fid => { const P = byId[fid]; const s = P && edgeStrip(P.pts, e.a, e.b, CAP_W); if (s) out.push({ edge: ei, facet: fid, pts: s.map(p => p.map(r2)) }); }); });
    return out;
  }
  function meshSpec(entry, FR, opts) {
    const d = FR.report, g = d.geometry_ft, mesh = g.mesh; if (!mesh || !mesh.roof || !mesh.roof.length) return null;
    const byId = {}; (d.facets || []).forEach(f => { byId[f.id] = f; });
    const base = Math.min(...mesh.roof.flatMap(r => r.pts.map(p => p[2])));
    const S = p => [r2(p[0]), r2(-p[1])], P3 = p => { const q = S(p); return [q[0], q[1], r2(p[2] - base)]; };
    const TYPE = t => /flashing/.test(t) ? 'wall' : t;
    // COPLANAR MERGE first: facets on one plane become one facet (one polygon, one section, the members' areas summed),
    // so no seam reaches the planes, caps, trim, edge lines, edge pins, section pills or the section table
    const MG = mergeCoplanar(mesh.roof, id => (byId[id] && byId[id].area_sqft) || 0);
    MG.forEach(m => { if (m.members.length < 2) return; const F = m.members.map(id => byId[id] || {}), top = F[0];
      const sum = k => F.reduce((s, f) => s + (+f[k] || 0), 0);
      byId[m.id] = Object.assign({}, top, { plan_sqft: sum('plan_sqft'), area_sqft: sum('area_sqft'), eave_height_ft: Math.min(...F.map(f => f.eave_height_ft != null ? f.eave_height_ft : Infinity)), merged: m.members.slice() }); });
    const members = {}; MG.forEach(m => { members[m.id] = m.members; });
    // edges and edge types from the facet polygons (meshEdges), never from the precomputed list
    const ME = meshEdges(MG, mesh.walls);
    let planes = ME.rings.map(r => {
      const f = byId[r.id] || {}, n = r.pts.length;
      // the mesh rings run counter-clockwise seen from above; the plater (c5-home buildRoof) expects clockwise (edge types follow)
      let pts = r.pts.slice().reverse(), types = pts.map((_, k) => r.types[(n - 2 - k + n) % n] || 'eave');
      // start the ring on its longest low edge (the eave): the plater lays courses up from pts[0]-pts[1]
      const zmin = Math.min(...pts.map(p => p[2])); let st = 0, sc = -Infinity;
      pts.forEach((p, k) => { const q = pts[(k + 1) % n], L = Math.hypot(q[0] - p[0], q[1] - p[1]), zm = (p[2] + q[2]) / 2 - zmin; const score = L - 6 * zm; if (score > sc) { sc = score; st = k; } });
      const rot = a => a.slice(st).concat(a.slice(0, st));
      const a = (f.azimuth_deg || 0) * Math.PI / 180, dir = [Math.sin(a), Math.cos(a)];
      return { id: r.id, src: members[r.id] || [r.id], az: f.azimuth_deg || 0, dir: [r2(dir[0]), r2(-dir[1])], rise: Math.max(1, Math.round(f.pitch_x12 || 0)), pts: rot(pts.map(P3)), types: rot(types.map(TYPE)),
        plan: f.plan_sqft, areaFt: f.area_sqft, eaveFt: f.eave_height_ft };
    });
    // re-letter the sections A, B, C ... largest first (the report's own order), so merged sections leave no gap in the letters;
    // plane.src keeps the report's facet ids each section is made of
    planes.sort((p, q) => ((q.areaFt || 0) - (p.areaFt || 0)) || (p.src[0] < q.src[0] ? -1 : 1));
    const LET = k => (k >= 26 ? LET(Math.floor(k / 26) - 1) : '') + String.fromCharCode(65 + k % 26), rid = {};
    const used = {};
    planes.forEach((p, k) => { rid[p.id] = LET(k); p.id = rid[p.id];
      const ci = Math.round(p.az / 45) % 8; let name = COMPASS[ci] + ' slope'; used[name] = (used[name] || 0) + 1; if (used[name] > 1) name += ' ' + used[name]; p.name = name; delete p.az; });
    Object.keys(used).forEach(n => { if (used[n] > 1) { const first = planes.find(p => p.name === n); if (first) first.name = n + ' 1'; } });
    const edges = ME.edges.map(e => ({ type: TYPE(e.type), a: P3(e.a), b: P3(e.b), facets: e.facets.map(id => rid[id] || id) }));
    // the walls: every non-roof face of the solid, with its outward normal (y flipped with the frame)
    const meshWalls = (mesh.walls || []).map(w => ({ pts: w.pts.map(P3), n: [w.n[0], -w.n[1], w.n[2]], kind: w.kind || 'wall' }));
    const ring = g.walls && g.walls.length >= 3 ? g.walls : g.roof;   // the wall footprint: the plinth trim and the yard follow it
    const fp = ring.map(S); if (fp.length > 1 && fp[0][0] === fp[fp.length - 1][0] && fp[0][1] === fp[fp.length - 1][1]) fp.pop();
    const xs = fp.map(p => p[0]), ys = fp.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), yb = Math.max(...ys), dw = Math.min(11, (x1 - x0) * .3);
    const W = window.RCROOF ? RCROOF.words(FR) : null, pt = W && W.pitch ? W.pitch : FR.pitch + '/12';
    const out = {
      real: true, facet3d: true, mesh: true, seed: opts.seed || 1, w: r2(x1 - x0), h: r2(yb - Math.min(...ys)), rise: FR.pitch || planes[0].rise, mainStyle: W && W.shape ? W.shape : 'hip roof', wingKind: 'none',
      planes, edges, fp, drive: [r2(x1 - dw - 3), r2(x1 - 3)], yb: r2(yb), hit: [], eaveFt: r2(base), blocks: [], steps: [], meshWalls, clean: true,
      sqft: entry.sqft, source: entry.source || 'building outline', pitchMeasured: !!FR.facets,
      squares: FR.sq, waste: FR.waste != null ? FR.waste : null, pitchText: pt,
      label: `Measured from LiDAR roof facets (${FR.year || 2018}), built as one solid model: ${planes.length} facets, ${pt}`,
      pitchNote: `${pt}, measured from LiDAR roof facets ${FR.year || 2018}`,
      facet: !!FR.facets, facetRec: FR
    };
    out.caps = capStrips(out);   // cap bars as facet strips: drawn by c5-home, checked by scripts/dfw/check_edges.mjs
    return out;
  }
  function facetSpec(entry, FR, opts) {
    const d = FR.report, g = d && d.geometry_ft; if (!g || !g.facets || !d.facets || !d.facets.length) return null;
    if (g.mesh) { const ms = meshSpec(entry, FR, opts); if (ms) return ms; }
    const byId = {}; d.facets.forEach(f => { byId[f.id] = f; });
    const F = [];
    Object.keys(g.facets).forEach(id => {
      const f = byId[id], rings = g.facets[id]; if (!f || !rings || !rings.length) return;
      // per-home geometry packs (rc-roof geomReport, snapped) come simplified with shared vertices already meeting: kept as is
      // clean geometry (scripts/dfw/roof_clean.py, ROOF-CLEAN-1011): ring 0 is the facet's outline, shared vertices identical
      const outer = g.clean ? rings[0] : rings.slice().sort((p, q) => q.length - p.length)[0];
      let ring = (g.snapped || g.clean) ? outer.map(p => p.slice()) : simplify(outer);
      // vertices that rounding put on top of each other (a zero-length first edge gives the plater no direction)
      ring = ring.filter((p, k) => { const q = ring[(k + 1) % ring.length]; return ring.length < 2 || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.02; });
      if (ring.length < 3) return;
      // the clean rings run counter-clockwise; the plater (c5-home buildRoof) expects the LiDAR rings' clockwise order
      if (g.clean) { let A = 0; ring.forEach((p, k) => { const q = ring[(k + 1) % ring.length]; A += p[0] * q[1] - q[0] * p[1]; }); if (A > 0) ring.reverse(); }
      const a = (f.azimuth_deg || 0) * Math.PI / 180, dir = [Math.sin(a), Math.cos(a)], m = (f.pitch_x12 || 0) / 12;
      const dmax = Math.max(...ring.map(p => p[0] * dir[0] + p[1] * dir[1]));
      F.push({ id, f, ring, dir, m, eave: f.eave_height_ft || 0, dmax, rise: Math.max(1, Math.round(f.pitch_x12 || 0)) });
    });
    if (!F.length) return null;
    // close the seams between facets. Each facet is a plane (its measured pitch, azimuth and eave height); neighbours meet
    // where their planes meet. 1. vertices of different facets within 1.5 ft are one corner (each ring was simplified on its
    // own, so neighbours drift apart by up to the simplify tolerance). 2. each corner moves to where the planes of the facets
    // sharing it actually meet (least squares, pulled toward the corner, at most 3 ft), so neighbouring planes meet in 3D
    // with no seam and every facet stays flat. A real step (planes over 2.5 ft apart: an upper wall over a lower roof) is
    // left as a step.
    const base = Math.min(...F.map(x => x.eave));
    F.forEach(x => { x.pa = -x.m * x.dir[0]; x.pb = -x.m * x.dir[1]; x.pc = x.eave - base + x.m * x.dmax; });
    const zP = (x, p) => x.pa * p[0] + x.pb * p[1] + x.pc;
    if (!g.clean) {
      const V = []; F.forEach((x, fi) => x.ring.forEach(p => V.push({ fi, p })));
      const par = V.map((_, k) => k), find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
      for (let a = 0; a < V.length; a++) for (let b = a + 1; b < V.length; b++)
        if (V[a].fi !== V[b].fi && Math.abs(V[a].p[0] - V[b].p[0]) < 1.5 && Math.abs(V[a].p[1] - V[b].p[1]) < 1.5 && Math.hypot(V[a].p[0] - V[b].p[0], V[a].p[1] - V[b].p[1]) < 1.5) par[find(a)] = find(b);
      const groups = {}; V.forEach((v, k) => { (groups[find(k)] = groups[find(k)] || []).push(v); });
      Object.values(groups).forEach(G => {
        if (G.length < 2) return;
        const x0 = G.reduce((s, v) => s + v.p[0], 0) / G.length, y0 = G.reduce((s, v) => s + v.p[1], 0) / G.length;
        // facets at this corner, split into height levels (a step keeps its own level)
        const fs = [...new Set(G.map(v => v.fi))].map(fi => ({ fi, z: zP(F[fi], [x0, y0]) })).sort((a, b) => a.z - b.z);
        const lv = []; fs.forEach(f => { const L = lv[lv.length - 1]; if (L && f.z - L[L.length - 1].z < 2.5) L.push(f); else lv.push([f]); });
        lv.forEach(L => {
          let q = [x0, y0];
          if (L.length >= 2) {
            // minimise sum (a_i x + b_i y + c_i - z)^2 + lam ((x - x0)^2 + (y - y0)^2) over x, y, z
            const lam = 0.02, n = L.length; let Saa = lam, Sab = 0, Sbb = lam, Sa = 0, Sb = 0, Sac = lam * x0, Sbc = lam * y0, Sc = 0;
            L.forEach(({ fi }) => { const x = F[fi]; Saa += x.pa * x.pa; Sab += x.pa * x.pb; Sbb += x.pb * x.pb; Sa += x.pa; Sb += x.pb; Sac -= x.pa * x.pc; Sbc -= x.pb * x.pc; Sc += x.pc; });
            // z = (Sa x + Sb y + Sc) / n; substitute: (Saa - Sa^2/n) x + (Sab - Sa Sb/n) y = Sac + Sa Sc/n, same for y
            const A11 = Saa - Sa * Sa / n, A12 = Sab - Sa * Sb / n, A22 = Sbb - Sb * Sb / n, B1 = Sac + Sa * Sc / n, B2 = Sbc + Sb * Sc / n, det = A11 * A22 - A12 * A12;
            if (Math.abs(det) > 1e-9) { const sx = (B1 * A22 - B2 * A12) / det, sy = (A11 * B2 - A12 * B1) / det; if (Math.hypot(sx - x0, sy - y0) <= 3) q = [sx, sy]; }
          }
          const ids = new Set(L.map(f => f.fi));
          G.forEach(v => { if (ids.has(v.fi)) { v.p[0] = q[0]; v.p[1] = q[1]; } });
        });
      });
    }
    let zOf = (x, p) => Math.max(0, zP(x, p));
    // clean geometry: the facets share every vertex, so the roof is closed by giving each shared vertex one height (the
    // mean of the planes meeting there, when they agree within 2.5 ft); planes further apart are a real step, closed by a
    // vertical wall face (steps) instead of a seam
    const steps = [];
    if (g.clean) {
      const key = p => p[0].toFixed(2) + ',' + p[1].toFixed(2), at = {};
      F.forEach(x => x.ring.forEach(p => { const k = key(p); (at[k] = at[k] || []).push(Math.max(0, zP(x, p))); }));
      const Z = {};
      Object.keys(at).forEach(k => { const v = at[k], lo = Math.min(...v), hi = Math.max(...v); if (v.length > 1 && hi - lo < 2.5) Z[k] = v.reduce((s, q) => s + q, 0) / v.length; });
      zOf = (x, p) => { const z = Z[key(p)]; return z != null ? z : Math.max(0, zP(x, p)); };
      const E2 = {};
      F.forEach((x, fi) => x.ring.forEach((p, k) => { const q = x.ring[(k + 1) % x.ring.length]; E2[key(p) + '|' + key(q)] = { fi, p, q }; }));
      Object.keys(E2).forEach(k => {
        const e = E2[k], o = E2[key(e.q) + '|' + key(e.p)]; if (!o || o.fi < e.fi) return;
        const a1 = zOf(F[e.fi], e.p), b1 = zOf(F[e.fi], e.q), a2 = zOf(F[o.fi], e.p), b2 = zOf(F[o.fi], e.q);
        if (Math.abs(a1 - a2) < 0.3 && Math.abs(b1 - b2) < 0.3) return;
        steps.push([[e.p[0], e.p[1], a1], [e.q[0], e.q[1], b1], [e.q[0], e.q[1], b2], [e.p[0], e.p[1], a2]]);
      });
    }
    const S = p => [r2(p[0]), r2(-p[1])], P3 = (p, z) => { const q = S(p); return [q[0], q[1], r2(z)]; };
    const fid = {}; F.forEach(x => { fid[x.id] = x; });
    const TYPE = t => /flashing/.test(t) ? 'wall' : t;
    const used = {};
    const planes = F.map(x => {
      const ci = Math.round((x.f.azimuth_deg || 0) / 45) % 8; let name = COMPASS[ci] + ' slope'; used[name] = (used[name] || 0) + 1; if (used[name] > 1) name += ' ' + used[name];
      const zs = x.ring.map(p => zOf(x, p)), zmin = Math.min(...zs);
      const types = x.ring.map((p, k) => {
        const q = x.ring[(k + 1) % x.ring.length], za = zs[k], zb = zs[(k + 1) % zs.length];
        if (za - zmin < 0.9 && zb - zmin < 0.9) return 'eave';
        const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; let best = null, bd = 3.2;
        (d.edges || []).forEach(e => { if (!e.facets || e.facets.indexOf(x.id) < 0) return; const dd = segDist(mid, e.a_ft, e.b_ft); if (dd < bd) { bd = dd; best = e; } });
        if (best) return TYPE(best.type);
        return Math.abs(za - zb) < 0.6 ? 'ridge' : 'rake';
      });
      // start the ring on its longest low edge (the eave): the plater (c5-home buildRoof) lays courses up from pts[0]-pts[1]
      let st = 0, sc = -Infinity;
      x.ring.forEach((p, k) => { const q = x.ring[(k + 1) % x.ring.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]), zm = (zs[k] + zs[(k + 1) % zs.length]) / 2 - zmin;
        const score = L - 6 * zm; if (score > sc) { sc = score; st = k; } });
      const rot = a => a.slice(st).concat(a.slice(0, st));
      return { id: x.id, name, dir: [r2(x.dir[0]), r2(-x.dir[1])], rise: x.rise, pts: rot(x.ring.map((p, k) => P3(p, zs[k]))), types: rot(types),
        plan: x.f.plan_sqft, areaFt: x.f.area_sqft, eaveFt: x.eave };
    });
    Object.keys(used).forEach(n => { if (used[n] > 1) { const first = planes.find(p => p.name === n); if (first) first.name = n + ' 1'; } });
    // ridge / hip / valley lines from the report's fitted edges, at the height of the facets they join
    const zAt = (e, p) => { const zs = (e.facets || []).map(id => fid[id]).filter(Boolean).map(x => zOf(x, p)); return zs.length ? zs.reduce((s, v) => s + v, 0) / zs.length : 0; };
    const edges = (d.edges || []).map(e => ({ type: TYPE(e.type), a: P3(e.a_ft, zAt(e, e.a_ft)), b: P3(e.b_ft, zAt(e, e.b_ft)) }));
    // clean geometry: the walls stand under the roof's own edge, so every eave meets its wall
    const ring = g.clean && g.roof && g.roof.length >= 3 ? g.roof : g.outline && g.outline.length >= 3 ? g.outline : g.roof;
    const fp = ring.map(S); if (fp.length > 1 && fp[0][0] === fp[fp.length - 1][0] && fp[0][1] === fp[fp.length - 1][1]) fp.pop();
    const xs = fp.map(p => p[0]), ys = fp.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), yb = Math.max(...ys), dw = Math.min(11, (x1 - x0) * .3);
    // walls: the outline up to the lowest eave, then a block under every higher facet up to its own eave (a 2-story core
    // under 1-story wings reads as one); heights in ft above the lowest eave
    // the house model (scripts/dfw/roof_house.py, g.zones): one wall block per zone up to that zone's wall plate, so the
    // roof sits on the walls and a 2-story block rises above a 1-story roof only where the model says so
    const blocks = g.zones && g.zones.length
      ? g.zones.filter(z => z.eave - base > 0.3).map((z, i) => ({ id: 'zone' + i, ring: z.ring.map(S), top: r2(z.eave - base) }))
      : F.filter(x => x.eave - base > (g.clean ? 0.3 : 2)).map(x => ({ id: x.id, ring: x.ring.map(S), top: r2(x.eave - base) }));
    const W = window.RCROOF ? RCROOF.words(FR) : null, pt = W && W.pitch ? W.pitch : FR.pitch + '/12';
    return {
      real: true, facet3d: true, seed: opts.seed || 1, w: r2(x1 - x0), h: r2(yb - Math.min(...ys)), rise: FR.pitch || planes[0].rise, mainStyle: W && W.shape ? W.shape : 'hip roof', wingKind: 'none',
      planes, edges, fp, drive: [r2(x1 - dw - 3), r2(x1 - 3)], yb: r2(yb), hit: [], eaveFt: r2(base), blocks, clean: !!g.clean,
      steps: steps.map(q => q.map(p => P3(p, p[2]))),
      sqft: entry.sqft, source: entry.source || 'building outline', pitchMeasured: !!FR.facets,
      squares: FR.sq, waste: FR.waste != null ? FR.waste : null, pitchText: pt,
      label: FR.facets ? `Measured from LiDAR roof facets (${FR.year || 2018}): ${planes.length} facets, each at its own pitch and height, ${pt}` : `Estimated, lower confidence: roof planes drawn from LiDAR (${FR.year || 2018}), ${planes.length} facets, pitch est. ${pt}`,
      pitchNote: FR.facets ? `${pt}, measured from LiDAR roof facets ${FR.year || 2018}` : `pitch est. ${pt}, from LiDAR roof facets ${FR.year || 2018}`,
      facet: !!FR.facets, facetRec: FR
    };
  }

  // ---------- WHICH 3D MODEL A HOME GETS (one place, 10-15) ----------
  // 'model'  : a full measured model that passed the roof gate: a solid-block model (geometry_ft.mesh, scripts/dfw/roof_blocks.py
  //            or lib/roof-blocks/, gate r1-r6) on a full report (totals). Caleo (3312 Caleo Ct) is the first. Drawn facet by facet.
  // 'outline': everything else with a building outline: the clean house from the outline (walls + hip roof from the roof
  //            solver, js/roofplan.js) at the MEASURED pitch, total squares from the LiDAR record, sections scaled to that total.
  //            Raw per-facet LiDAR rings are never drawn as the 3D roof (they read as shards).
  // 'none'   : no outline on file.
  function modelFor(entry) {
    if (!entry || !entry.ring_ft) return 'none';
    const FR = facetRec(entry), d = FR && FR.report, g = d && d.geometry_ft;
    if (g && g.mesh && g.mesh.roof && g.mesh.roof.length && d.totals && (!d.gate || d.gate.pass !== false)) return 'model';
    return 'outline';
  }
  // ---------- the outline, made buildable: square, rectilinear, no jogs under JOG_FT ----------
  // turn the ring to its minimum-area rectangle, snap wall coordinates within JOG_FT to one line, keep the grid cells whose
  // centre is inside the outline (largest connected piece, holes filled), and trace that back into one ring. The walls and
  // the roof are both built from this ring, so every eave sits on its wall. A ring that is not near rectilinear (angled
  // walls: the cells miss the outline by over 18%) becomes its minimum-area rectangle: a plain box house, never a staircase.
  const JOG_FT = 3.6;
  function hull2(pts) { const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], hi = [];
    P.forEach(p => { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
    P.slice().reverse().forEach(p => { while (hi.length > 1 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); });
    return lo.slice(0, -1).concat(hi.slice(0, -1)); }
  const rot2 = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
  const area2 = r => { let A = 0; r.forEach((p, k) => { const q = r[(k + 1) % r.length]; A += p[0] * q[1] - q[0] * p[1]; }); return A / 2; };
  const inRing = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  function regularRing(ring) {
    const H = hull2(ring); if (H.length < 3) return null;
    let ang = 0, bestA = Infinity;
    H.forEach((a, i) => { const b = H[(i + 1) % H.length]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.5) return; const t = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const q = H.map(p => rot2(p, -t)), xs = q.map(p => p[0]), ys = q.map(p => p[1]), A = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)); if (A < bestA - 1e-6) { bestA = A; ang = t; } });
    const q = ring.map(p => rot2(p, -ang)), A0 = Math.abs(area2(q));
    const clus = vals => { const s = vals.slice().sort((a, b) => a - b), G = []; s.forEach(v => { const g = G[G.length - 1]; if (g && v - g[g.length - 1] <= JOG_FT) g.push(v); else G.push([v]); });
      // a cluster's line: the outer wall at the two ends of the house (so it keeps its full size), else the mean
      return G.map((g, k) => k === 0 ? Math.min(...g) : k === G.length - 1 ? Math.max(...g) : g.reduce((a, b) => a + b, 0) / g.length); };
    const X = clus(q.map(p => p[0])), Y = clus(q.map(p => p[1]));
    const box = () => { const x0 = X[0], x1 = X[X.length - 1], y0 = Y[0], y1 = Y[Y.length - 1]; return { ring: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(p => rot2(p, ang)), box: true }; };
    if (X.length < 2 || Y.length < 2) return null;
    const nx = X.length - 1, ny = Y.length - 1, occ = [];
    // a cell is in when most of it is inside the outline (5 samples), so a wall snapped across a cell decides by area
    for (let i = 0; i < nx; i++) { occ.push([]); for (let j = 0; j < ny; j++) { const x0 = X[i], x1 = X[i + 1], y0 = Y[j], y1 = Y[j + 1]; let n = 0;
      [[.5, .5], [.25, .25], [.75, .25], [.25, .75], [.75, .75]].forEach(([u, v]) => { if (inRing([x0 + u * (x1 - x0), y0 + v * (y1 - y0)], q)) n++; }); occ[i].push(n >= 3); } }
    // largest 4-connected piece of cells, then fill its holes (a courtyard is roofed over: a house, not a donut)
    const comp = occ.map(c => c.map(() => -1)); let best = -1, bestArea = 0, cid = 0;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) if (occ[i][j] && comp[i][j] < 0) { let ar = 0; const st = [[i, j]]; comp[i][j] = cid;
      while (st.length) { const [a, b] = st.pop(); ar += (X[a + 1] - X[a]) * (Y[b + 1] - Y[b]); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([da, db]) => { const u = a + da, v = b + db; if (u >= 0 && v >= 0 && u < nx && v < ny && occ[u][v] && comp[u][v] < 0) { comp[u][v] = cid; st.push([u, v]); } }); }
      if (ar > bestArea) { bestArea = ar; best = cid; } cid++; }
    if (best < 0) return box();
    const out = occ.map(c => c.map(() => false)), st = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) if ((i === 0 || j === 0 || i === nx - 1 || j === ny - 1) && comp[i][j] !== best) { out[i][j] = true; st.push([i, j]); }
    while (st.length) { const [a, b] = st.pop(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([da, db]) => { const u = a + da, v = b + db; if (u >= 0 && v >= 0 && u < nx && v < ny && !out[u][v] && comp[u][v] !== best) { out[u][v] = true; st.push([u, v]); } }); }
    const IN = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && !out[i][j];
    let cover = 0; for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) if (IN(i, j)) cover += (X[i + 1] - X[i]) * (Y[j + 1] - Y[j]);
    if (Math.abs(cover - A0) / Math.max(A0, 1) > 0.18) return box();
    // trace the boundary (counter-clockwise, cells on the left), vertex ids on the grid so every edge matches exactly
    const nxt = {}; const add = (a, b) => { (nxt[a] = nxt[a] || []).push(b); }, K = (i, j) => i + '_' + j;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) if (IN(i, j)) {
      if (!IN(i, j - 1)) add(K(i, j), K(i + 1, j)); if (!IN(i + 1, j)) add(K(i + 1, j), K(i + 1, j + 1));
      if (!IN(i, j + 1)) add(K(i + 1, j + 1), K(i, j + 1)); if (!IN(i - 1, j)) add(K(i, j + 1), K(i, j)); }
    const start = Object.keys(nxt).sort()[0], loop = [start]; let cur = start, guard = 0, prev = null;
    while (guard++ < 2000) { const l = nxt[cur]; if (!l || !l.length) break; let k = 0;
      if (l.length > 1 && prev) { // a pinch: keep turning left (stay on this piece's own outline)
        const P = prev.split('_').map(Number), C = cur.split('_').map(Number), d0 = [C[0] - P[0], C[1] - P[1]];
        let bs = -Infinity; l.forEach((n, m) => { const N = n.split('_').map(Number), d1 = [N[0] - C[0], N[1] - C[1]], s = d0[0] * d1[1] - d0[1] * d1[0]; if (s > bs) { bs = s; k = m; } }); }
      const n = l.splice(k, 1)[0]; if (n === start) break; loop.push(n); prev = cur; cur = n; }
    let pts = loop.map(s => { const [i, j] = s.split('_').map(Number); return [X[i], Y[j]]; });
    for (let again = true; again && pts.length > 4;) { again = false;   // straight runs: one edge
      for (let k = 0; k < pts.length; k++) { const a = pts[(k - 1 + pts.length) % pts.length], b = pts[k], c = pts[(k + 1) % pts.length];
        if (Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) < 1e-6) { pts.splice(k, 1); again = true; break; } } }
    if (pts.length < 4) return box();
    return { ring: pts.map(p => rot2(p, ang)), box: false };
  }

  function spec(entry, opts) {
    opts = opts || {};
    if (!entry || !entry.ring_ft || !window.RoofPlan) return none(opts.seed);
    const FR = facetRec(entry);
    if (FR && FR.report && !opts.outline && modelFor(entry) === 'model') { const fs = facetSpec(entry, FR, opts); if (fs) return fs; }
    const rise = (FR && FR.pitch >= 2 ? FR.pitch : 0) || (entry.pitch && entry.pitch.rise) || 6, m = rise / 12;
    // the clean outline (walls and roof from the same squared, jog-free ring); the raw ring only when it cannot be squared
    const style = opts.style || (FR && window.RCROOF && RCROOF.shape(FR) === 'gable roof' ? 'gable' : 'hip');   // measured all-gable roofs keep their gables
    const RG = opts.raw ? null : regularRing(entry.ring_ft), ringIn = RG ? RG.ring.map(p => [r2(p[0]), r2(p[1])]) : entry.ring_ft;
    let plan = window.RoofPlan.build(ringIn, rise, { style }), wallRing = ringIn;
    if ((!plan || !plan.facets || !plan.facets.length) && RG) { plan = window.RoofPlan.build(entry.ring_ft, rise, { style }); wallRing = entry.ring_ft; }
    if (!plan || !plan.facets || !plan.facets.length) return none(opts.seed);
    const S = p => [r2(p[0]), r2(-p[1])]; // north-up feet -> y-south feet
    // every facet is one roof plane: z = m * (max_d - d.p), d = its downslope direction; its eave sits at z 0
    const facets = plan.facets.map(f => {
      const a = f.angleDeg * Math.PI / 180, d = [Math.sin(a), Math.cos(a)]; // north-up downslope
      const dmax = Math.max(...f.ring.map(p => p[0] * d[0] + p[1] * d[1]));
      const z = p => Math.max(0, m * (dmax - (p[0] * d[0] + p[1] * d[1])));
      return { f, d, z };
    });
    const zAt = (p) => { // height of a plan point: from the facet it sits on (all facets agree on shared edges)
      let best = null, bd = Infinity;
      facets.forEach(F => { const r = F.f.ring; for (let i = 0; i < r.length; i++) { const dd = segDist(p, r[i], r[(i + 1) % r.length]); if (dd < bd) { bd = dd; best = F; } } });
      return best ? best.z(p) : 0;
    };
    const P3 = (p, z) => { const s = S(p); return [s[0], s[1], r2(z)]; };
    const typedSegs = [];
    ['ridges', 'hips', 'valleys', 'rakes'].forEach(k => (plan[k] || []).forEach(s => typedSegs.push({ type: k === 'ridges' ? 'ridge' : k === 'hips' ? 'hip' : k === 'valleys' ? 'valley' : 'rake', a: s.a, b: s.b })));
    const typeOf = (a, b, za, zb) => {
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      for (const s of typedSegs) if (segDist(mid, s.a, s.b) < 0.08 && segDist(a, s.a, s.b) < 0.08 && segDist(b, s.a, s.b) < 0.08) return s.type;
      return za < 0.05 && zb < 0.05 ? 'eave' : Math.abs(za - zb) < 0.05 ? 'ridge' : 'hip'; // sub-foot jogs the solver drops
    };
    const used = {};
    const planes = facets.map((F, i) => {
      const ang = F.f.angleDeg, ci = Math.round(ang / 45) % 8;
      let name = COMPASS[ci] + ' slope'; used[name] = (used[name] || 0) + 1; if (used[name] > 1) name += ' ' + used[name];
      const ring = F.f.ring;
      const pts = ring.map(p => P3(p, F.z(p)));
      const types = ring.map((p, k) => { const q = ring[(k + 1) % ring.length]; return typeOf(p, q, F.z(p), F.z(q)); });
      // same winding as the measured models (meshSpec): the plater (c5-home buildRoof) lays the shingles so they catch the light
      // the same way on every roof; the eave edge stays first (pts[0] -> pts[1] is the old first edge, reversed)
      const n = pts.length, rp = pts.map((_, k) => pts[(1 - k + n) % n]), rt = types.map((_, k) => types[(n - k) % n]);
      return { id: F.f.label, name, dir: [r2(F.d[0]), r2(-F.d[1])], rise, pts: rp, types: rt, plan: F.f.planSqft };
    });
    // names: number duplicates from 1 when a direction repeats
    Object.keys(used).forEach(n => { if (used[n] > 1) { const first = planes.find(p => p.name === n); if (first) first.name = n + ' 1'; } });
    const edges = [];
    typedSegs.forEach(s => edges.push({ type: s.type, a: P3(s.a, zAt(s.a)), b: P3(s.b, zAt(s.b)) }));
    (plan.eaves || []).forEach(s => edges.push({ type: 'eave', a: P3(s.a, 0), b: P3(s.b, 0) }));
    const fp = wallRing.map(S);
    // measured roof: the sections are the outline's planes, each scaled by (measured total / outline total) so the sections
    // add up to the LiDAR squares exactly (the largest section takes the last foot of rounding)
    if (FR && FR.sq > 0) {
      const f = Math.sqrt(1 + m * m), tot = planes.reduce((a, p) => a + (p.plan || 0) * f, 0), want = Math.round(FR.sq * 100);
      if (tot > 0) { const k = want / tot; planes.forEach(p => { p.areaFt = Math.max(1, Math.round((p.plan || 0) * f * k)); p.plan = Math.max(1, Math.round((p.plan || 0) * k)); });
        const big = planes.reduce((a, p) => (p.areaFt > a.areaFt ? p : a), planes[0]); big.areaFt += want - planes.reduce((a, p) => a + p.areaFt, 0); }
    }
    const xs = fp.map(p => p[0]), ys = fp.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), yb = Math.max(...ys);
    const dw = Math.min(11, (x1 - x0) * .3);
    const drive = [r2(x1 - dw - 3), r2(x1 - 3)];
    const hit = []; // no per-plane hail data exists: the home's radar hail is shown once, never painted on planes
    const t = plan.totals;
    return {
      real: true, seed: opts.seed || 1, w: r2(x1 - x0), h: r2(yb - Math.min(...ys)), rise, mainStyle: plan.style, wingKind: 'none',
      planes, edges, fp, drive, yb: r2(yb), hit, clean: true, outlineModel: true, boxed: !!(RG && RG.box),
      sqft: entry.sqft, source: entry.source || 'Microsoft building footprint', pitchMeasured: !!(FR || (entry.pitch && entry.pitch.measured)),
      squares: FR ? FR.sq : t.squares, waste: FR && FR.waste != null ? FR.waste : null, pitchText: FR ? fpt(FR) : null,
      // Jack 10-21/10-22: only a model that passed its soundness and LiDAR-fit gates shows a roof shape; every outline house is
      // the plain stand-in, "roof shape being checked", never a solver shape presented as this home's roof
      checking: true,
      label: FR ? `Roof shape being checked; squares and pitch estimated from ${FR.year || 2018} LiDAR` : 'Roof shape being checked; no LiDAR roof record for this home',
      sectionsNote: FR ? 'Sections from the building outline, total measured from LiDAR' : null,
      pitchNote: FR ? `${fpt(FR)}, measured from LiDAR roof facets ${FR.year || 2018}` : entry.pitch && entry.pitch.note || null,
      facet: !!FR, facetRec: FR || null
    };
  }
  function none(seed) {
    return { none: true, real: false, seed: seed || 1, planes: [], edges: [], hit: [], fp: [[0, 0], [1, 0], [1, 1], [0, 1]], drive: [0, 0], yb: 1, rise: 6,
      label: 'No outline on file for this home' };
  }
  // ---------- storm map homes ('m<global index>'): their own footprint from lib/st-data-dfw/fp tiles ----------
  // Same tiles the storm map draws (format in shoot_st_data.py). Resolves to a roofs-*.json style entry, or null
  // when the home has no outline on file. Pitch is assumed 6/12 (no LiDAR in the tour mirror).
  const DATA = window.rooferDataRoot ? rooferDataRoot() : new URL('st-data-dfw/', document.currentScript ? document.currentScript.src : location.href.replace(/[^/]*$/, '') + '../lib/').href;
  let catP = null; const tileP = {}, cache = {};
  const fetchBuf = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.arrayBuffer(); });
  function decode(buf, tr, tc) {
    const dv = new DataView(buf), n = dv.getUint32(0, true), out = new Map(), olon = tc * 0.05, olat = tr * 0.05; let o = 4;
    for (let k = 0; k < n; k++) { const idx = dv.getUint32(o, true), nv = dv.getUint8(o + 6); o += 7; const ring = new Array(nv);
      for (let v = 0; v < nv; v++) { ring[v] = [olon + dv.getUint16(o, true) * 1e-6, olat + dv.getUint16(o + 2, true) * 1e-6]; o += 4; }
      out.set(idx, ring); }
    return out;
  }
  function toEntry(ring) { // lon/lat ring -> local feet around its centroid, near-collinear points dropped (as build_roofs.py)
    const lon0 = ring.reduce((s, p) => s + p[0], 0) / ring.length, lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length, FT = 3.28084;
    const kx = 111320 * Math.cos(lat0 * Math.PI / 180) * FT, ky = 110574 * FT;
    let r = ring.map(p => [(p[0] - lon0) * kx, (p[1] - lat0) * ky]);
    if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
    for (let again = true; again && r.length > 3;) { again = false;
      for (let i = 0; i < r.length; i++) { const a = r[(i - 1 + r.length) % r.length], b = r[i], c = r[(i + 1) % r.length];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.3 || segDist(b, a, c) < 0.4) { r.splice(i, 1); again = true; break; } } }
    let A = 0, cx = 0, cy = 0;
    for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length], c = x1 * y2 - x2 * y1; A += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c; }
    A /= 2; cx /= 6 * A; cy /= 6 * A;
    // center: the ring's centroid in lon/lat (ring_ft is feet east / north of it), so a view can lay the outline on imagery
    return { ring_ft: r.map(p => [r2(p[0] - cx), r2(p[1] - cy)]), center: [lon0 + cx / kx, lat0 + cy / ky], sqft: Math.round(Math.abs(A)), source: window.rooferDataRoot ? 'Overture Maps building outline' : 'Microsoft building footprint', pitch: { rise: 6, measured: false } };
  }
  function mapEntry(i, lon, lat) {
    i = +i; if (!(i >= 0)) return Promise.resolve(null);
    if (i in cache) return Promise.resolve(cache[i]);
    // no position given (record opened cold by its id): look it up in homes.bin instead of calling it "no outline"
    if (!isFinite(+lon) || !isFinite(+lat) || lon === null || lat === null || lon === '' || lat === '')
      return window.STM && STM.lonlat ? STM.lonlat(i).then(p => (p && isFinite(p[0]) ? mapEntry(i, p[0], p[1]) : null)) : Promise.resolve(null);
    catP = catP || fetch(DATA + 'catalog.json').then(r => r.json());
    return catP.then(cat => {
      const R = cat.regions.slice().reverse().find(r => i >= r.offset); if (!R) return null;
      const tr0 = Math.floor(lat / 0.05), tc0 = Math.floor(lon / 0.05), keys = [];
      for (const [dr, dc] of [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]]) if ((R.tiles || []).some(t => t.tr === tr0 + dr && t.tc === tc0 + dc)) keys.push([tr0 + dr, tc0 + dc]);
      const next = k => { if (k >= keys.length) return null; const [tr, tc] = keys[k], key = R.id + '/' + tr + '_' + tc;
        tileP[key] = tileP[key] || fetchBuf(DATA + 'fp/' + key + '.bin').then(b => decode(b, tr, tc)).catch(() => new Map());
        return tileP[key].then(m => { const ring = m.get(i - R.offset); return ring && ring.length >= 3 ? toEntry(ring) : next(k + 1); }); };
      return next(0);
    }).catch(() => null).then(e => {
      if (!e || !window.STM) return e;
      return STM.facts(i, +lon, +lat).then(f => { e.pitch = f.pitch; e.facts = f; return e; }).catch(() => e);
    }).then(e => (cache[i] = e));
  }
  const mapCached = i => (+i in cache ? cache[+i] : undefined);
  // the numbers a roofer quotes from: squares, planes, edge lengths (3D, ft) and the wall lengths of the outline (ft)
  function measure(sp, entry) {
    if (!sp || sp.none) return null;
    const L = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], (a[2] || 0) - (b[2] || 0)), edges = { ridge: 0, hip: 0, valley: 0, eave: 0, rake: 0 };
    sp.edges.forEach(e => { if (e.type in edges) edges[e.type] += L(e.a, e.b); });
    Object.keys(edges).forEach(k => edges[k] = Math.round(edges[k]));
    const FR = sp.facetRec; if (FR) ['ridge', 'hip', 'valley', 'eave', 'rake'].forEach(k => { edges[k] = Math.round(FR[k] || 0); });
    const ring = (entry && entry.ring_ft) || sp.fp, walls = ring.map((p, k) => Math.round(Math.hypot(ring[(k + 1) % ring.length][0] - p[0], ring[(k + 1) % ring.length][1] - p[1]))).filter(w => w >= 1);
    return { squares: sp.squares, planes: sp.planes.length, edges, walls, perimeter: walls.reduce((a, b) => a + b, 0), footprint: entry ? entry.sqft : null,
      w: Math.round(sp.w), d: Math.round(sp.h), rise: sp.rise, measured: !!sp.pitchMeasured, label: sp.label, facet: !!sp.facet, facet3d: !!sp.facet3d, tip: tip(sp),
      pitchText: sp.pitchText || sp.rise + '/12', shape: FR && window.RCROOF ? RCROOF.shape(FR) : (sp.mainStyle === 'gable' ? 'gable roof' : 'hip roof'), waste: sp.waste != null ? sp.waste : null };
  }
  // ---------- top-down diagram of an outline-model roof (the proposal and the report draw the same shape as the 3D) ----------
  // spec frame: ft, x east, y south, so SVG y down is north up. Same look as RCROOF.diagramSVG (fills, edge colours, labels).
  const PFILL = ['#F3D9B1', '#CFE3F6', '#D7EDD2', '#F4CFD3', '#E5DAF2', '#FBE8A6', '#CDEDEA', '#E9E1D3', '#F7D6EA', '#DDE7C5'];
  const PEC = { ridge: '#C0262D', hip: '#E07B00', valley: '#2757E6', eave: '#1F8A4C', rake: '#7A3FB8' };
  function planSVG(sp, W) {
    if (!sp || sp.none || !sp.planes || !sp.planes.length) return '';
    W = W || 760; const num = v => (Math.round(v * 10) / 10).toFixed(1);
    const all = sp.fp.concat(...sp.planes.map(p => p.pts)), xs = all.map(p => p[0]), ys = all.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), pad = 4;
    const s = W / ((x1 - x0) + 2 * pad), H = ((y1 - y0) + 2 * pad) * s, T = p => [(p[0] - x0 + pad) * s, (p[1] - y0 + pad) * s];
    const o = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(W)} ${Math.round(H)}" class="rr-diag" role="img" aria-label="Top-down roof diagram, lengths in feet">`,
      '<defs><marker id="rpah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#0E1B3D"/></marker></defs>'];
    sp.planes.forEach((p, n) => o.push(`<polygon points="${p.pts.map(q => T(q).map(num).join(',')).join(' ')}" fill="${PFILL[n % PFILL.length]}" stroke="#fff" stroke-width="1"/>`));
    const L3 = e => Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1], (e.b[2] || 0) - (e.a[2] || 0));
    const eds = sp.edges.filter(e => PEC[e.type] && L3(e) > 0.5);
    eds.forEach(e => { const [ax, ay] = T(e.a), [bx, by] = T(e.b); o.push(`<line x1="${num(ax)}" y1="${num(ay)}" x2="${num(bx)}" y2="${num(by)}" stroke="${PEC[e.type]}" stroke-width="3.5" stroke-linecap="round"/>`); });
    eds.forEach(e => { const L = L3(e); if (L < 6) return; const [ax, ay] = T(e.a), [bx, by] = T(e.b); o.push(`<text x="${num((ax + bx) / 2)}" y="${num((ay + by) / 2)}" class="rr-el" fill="${PEC[e.type]}">${Math.round(L)}</text>`); });
    const placed = [], hit = (x, y, w, h) => placed.some(b => x < b[0] + b[2] && b[0] < x + w && y < b[1] + b[3] && b[1] < y + h);
    sp.planes.slice().sort((a, b) => (b.areaFt || b.plan || 0) - (a.areaFt || a.plan || 0)).forEach(p => {
      let A = 0, cx = 0, cy = 0; const r = p.pts;
      for (let k = 0; k < r.length; k++) { const a = r[k], b = r[(k + 1) % r.length], w = a[0] * b[1] - b[0] * a[1]; A += w; cx += (a[0] + b[0]) * w; cy += (a[1] + b[1]) * w; }
      if (Math.abs(A) < 1e-6) return; const [x, y] = T([cx / (3 * A), cy / (3 * A)]), lab = `${p.id} · ${p.rise}/12`, lw = lab.length * 7.5 + 6;
      if (hit(x - lw / 2, y - 16, lw, 50)) return; placed.push([x - lw / 2, y - 16, lw, 50]);
      const dl = Math.hypot(p.dir[0], p.dir[1]) || 1, dx = p.dir[0] / dl * 14, dy = p.dir[1] / dl * 14;
      o.push(`<text x="${num(x)}" y="${num(y - 2)}" class="rr-fl">${lab}</text><line x1="${num(x - dx)}" y1="${num(y + 16 - dy)}" x2="${num(x + dx)}" y2="${num(y + 16 + dy)}" stroke="#0E1B3D" stroke-width="1.5" marker-end="url(#rpah)"/>`);
    });
    o.push(`<g transform="translate(${Math.round(W - 30)},26)"><path d="M0,-16 L7,8 L0,3 L-7,8 z" fill="#0E1B3D"/><text y="22" class="rr-fl" text-anchor="middle">N</text></g>`);
    const L20 = 20 * s; o.push(`<g transform="translate(14,${Math.round(H - 14)})"><line x1="0" y1="0" x2="${num(L20)}" y2="0" stroke="#0E1B3D" stroke-width="2"/><text x="${num(L20 / 2)}" y="-5" class="rr-el" fill="#0E1B3D">20 ft</text></g>`);
    o.push('</svg>'); return o.join('');
  }
  window.RealRoof = { spec, modelFor, planSVG, regularRing, JOG_FT, none, label, mapEntry, mapCached, measure, tip, EST_TIP, FACET_TIP, meshSpec, meshEdges, mergeCoplanar, edgeStrip, capStrips, CAP_W, ETOL, COPLANAR_DEG, COPLANAR_FT, SEAM_DEG };
})();
