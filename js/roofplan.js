/* Roof Plan geometry: builds a roof MODEL (facets, ridges, hips, valleys, eaves, rakes) from a
   simplified footprint polygon given in LOCAL FEET, north-up (x = east ft, y = north ft).
   Pure geometry, no DOM. window.RoofPlan.build(pts, pitch, {style}) with style "hip" (default),
   "gable" or "auto" (auto = gable only when opts.roofType === "gable", e.g. an assessor roof type).

   Method: rotate the footprint to its minimum-area-rectangle axis, snap near-equal wall
   coordinates, take every MAXIMAL rectangle of the rectilinear footprint, and define the roof
   height as the max over those rectangles of each rectangle's own roof height. For a hip roof
   that is exactly the L-infinity distance to the walls (= the straight skeleton of a rectilinear
   outline), so L/T/U shapes get proper hips and valleys with no overlapping facets. Gable: each
   rectangle ridges along its long axis (cross wings trimmed at the main roof's centerline), the
   short ends become RAKES. Facets are the exact regions where one roof plane wins; creases
   (ridge/hip/valley) come from edges shared by two facets, eaves/rakes from outer edges.
   Non-rectilinear footprints (cell coverage off by more than 10%) fall back to one roof over the
   minimum-area bounding rectangle. */
(function () {
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function rot(p, a) { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; }
  function shoelaceArea(pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; s += x1 * y2 - x2 * y1; }
    return Math.abs(s) / 2;
  }
  function convexHull(points) {
    const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    lower.pop(); upper.pop();
    return lower.concat(upper);
  }
  // minimum-area bounding rectangle via rotating calipers over the convex hull's own edges
  function minAreaRect(pts) {
    const H = convexHull(pts);
    if (H.length < 3) return { angle: 0, w: 1, h: 1 };
    let best = null;
    for (let i = 0; i < H.length; i++) {
      const e = [H[(i + 1) % H.length][0] - H[i][0], H[(i + 1) % H.length][1] - H[i][1]];
      const a = Math.atan2(e[1], e[0]);
      const q = H.map(p => rot(p, -a));
      const xs = q.map(p => p[0]), ys = q.map(p => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const area = (x1 - x0) * (y1 - y0);
      if (!best || area < best.area) best = { area, angle: a, w: x1 - x0, h: y1 - y0 };
    }
    return best;
  }
  // point-to-segment distance, then min over every edge of a ring: "is this point effectively on
  // the ring's own boundary" (within tol feet)
  function distToSeg(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy || 1e-9;
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }
  function distToRing(p, ring) {
    let m = Infinity;
    for (let i = 0; i < ring.length; i++) m = Math.min(m, distToSeg(p, ring[i], ring[(i + 1) % ring.length]));
    return m;
  }
  function onBoundary(a, b, ring, tol) {
    // sample a few interior points along a-b (skip the exact corners) and require all of them to
    // sit within tol of the real footprint boundary
    const n = 3;
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (distToRing(p, ring) > tol) return false;
    }
    return true;
  }
  // ---- convex polygon helpers (q-space, CCW rings) ----
  function ringArea(r) { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  // keep the part of a convex polygon where a*x + b*y + c >= 0 (Sutherland-Hodgman)
  function clipHP(poly, a, b, c) {
    if (!poly || poly.length < 3) return null;
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const dp = a * p[0] + b * p[1] + c, dq = a * q[0] + b * q[1] + c;
      if (dp >= 0) out.push(p);
      if ((dp >= 0) !== (dq >= 0)) { const t = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    const ded = out.filter((v, i) => { const w = out[(i + 1) % out.length]; return Math.hypot(v[0] - w[0], v[1] - w[1]) > 1e-6; });
    return ded.length >= 3 && Math.abs(ringArea(ded)) > 1e-7 ? ded : null;
  }
  // convex piece minus the convex set {all hp >= 0}: returns convex pieces (hp = [a,b,c])
  function subtractHPs(piece, hps) {
    const res = []; let cur = piece;
    for (const [a, b, c] of hps) {
      if (!cur) break;
      if (Math.abs(a) < 1e-9 && Math.abs(b) < 1e-9) { if (c >= 0) continue; res.push(cur); cur = null; break; } // constant: always in / always out
      const outside = clipHP(cur, -a, -b, -c);
      if (outside) res.push(outside);
      cur = clipHP(cur, a, b, c);
    }
    return res; // whatever is left in cur is inside the subtracted set and dropped
  }
  function polyHPs(poly) { // CCW convex polygon -> its inside half-planes
    return poly.filter((p, i) => { const q = poly[(i + 1) % poly.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-6; }).map((p) => { const q = poly[(poly.indexOf(p) + 1) % poly.length]; const a = -(q[1] - p[1]), b = q[0] - p[0]; return [a, b, -(a * p[0] + b * p[1])]; });
  }
  // merge disjoint convex pieces into outer rings by cancelling shared edges (T-junction safe)
  function mergePieces(pieces) {
    const canon = []; const cv = p => { for (const c of canon) if (Math.abs(c[0] - p[0]) < 2e-3 && Math.abs(c[1] - p[1]) < 2e-3) return c; canon.push(p.slice()); return canon[canon.length - 1]; };
    const polys = pieces.map(pc => pc.map(cv));
    const onSeg = (p, a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; if (l2 < 1e-12) return false;
      const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2; if (t < 1e-6 || t > 1 - 1e-6) return false;
      return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)) < 3e-3;
    };
    const id = new Map(); canon.forEach((c, i) => id.set(c, i));
    const edges = new Map();
    for (const poly of polys) for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length]; if (a === b) continue;
      const mids = canon.filter(p => p !== a && p !== b && onSeg(p, a, b)).sort((p, q) => Math.hypot(p[0] - a[0], p[1] - a[1]) - Math.hypot(q[0] - a[0], q[1] - a[1]));
      const chain = [a, ...mids, b];
      for (let k = 0; k + 1 < chain.length; k++) {
        const u = id.get(chain[k]), v = id.get(chain[k + 1]), rk = v + "|" + u;
        if (edges.has(rk)) edges.delete(rk); else edges.set(u + "|" + v, [u, v]);
      }
    }
    const next = new Map(); edges.forEach(([u, v]) => { if (!next.has(u)) next.set(u, []); next.get(u).push(v); });
    const rings = [];
    for (const [u0] of [...next]) {
      while (next.get(u0) && next.get(u0).length) {
        const ring = [u0]; let u = u0, guard = 0, ok = false;
        while (guard++ < 500) {
          const lst = next.get(u); if (!lst || !lst.length) break;
          const v = lst.shift(); if (v === u0) { ok = true; break; } ring.push(v); u = v;
        }
        if (ok && ring.length >= 3) {
          let pts = ring.map(i => canon[i]);
          // drop collinear vertices
          let ch = true;
          while (ch && pts.length > 3) {
            ch = false;
            for (let i = 0; i < pts.length; i++) {
              const p = pts[(i + pts.length - 1) % pts.length], q = pts[i], r = pts[(i + 1) % pts.length];
              if (Math.abs((q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0])) < 2e-3 * Math.max(1, Math.hypot(r[0] - p[0], r[1] - p[1]))) { pts.splice(i, 1); ch = true; break; }
            }
          }
          if (pts.length >= 3 && ringArea(pts) > 1e-4) rings.push(pts);
        }
      }
    }
    return rings;
  }
  // cluster nearby coordinate values (single linkage, gap <= tol ft) -> map each value to its cluster mean
  function clusterMap(vals, tol) {
    const s = vals.slice().sort((a, b) => a - b), groups = [];
    for (const v of s) { const g = groups[groups.length - 1]; if (g && v - g[g.length - 1] <= tol) g.push(v); else groups.push([v]); }
    const reps = groups.map(g => g.reduce((a, b) => a + b, 0) / g.length);
    return v => { let bi = 0, bd = Infinity; reps.forEach((r, i) => { const d = Math.abs(r - v); if (d < bd) { bd = d; bi = i; } }); return reps[bi]; };
  }
  function inPoly(p, ring) {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  // maximal full rectangles of the occupied cell grid (exact for L-infinity roof height)
  function maximalRects(X, Y, occ, minSide) {
    const nx = X.length - 1, ny = Y.length - 1;
    const P = Array.from({ length: nx + 1 }, () => new Array(ny + 1).fill(0));
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) P[i + 1][j + 1] = P[i][j + 1] + P[i + 1][j] - P[i][j] + (occ[i][j] ? 1 : 0);
    const full = (i0, j0, i1, j1) => i0 >= 0 && j0 >= 0 && i1 < nx && j1 < ny && (P[i1 + 1][j1 + 1] - P[i0][j1 + 1] - P[i1 + 1][j0] + P[i0][j0]) === (i1 - i0 + 1) * (j1 - j0 + 1);
    const out = [];
    for (let i0 = 0; i0 < nx; i0++) for (let i1 = i0; i1 < nx; i1++) for (let j0 = 0; j0 < ny; j0++) for (let j1 = j0; j1 < ny; j1++) {
      if (!full(i0, j0, i1, j1)) break;
      if (full(i0 - 1, j0, i1, j1) || full(i0, j0, i1 + 1, j1) || full(i0, j0 - 1, i1, j1) || full(i0, j0, i1, j1 + 1)) continue;
      const r = [X[i0], Y[j0], X[i1 + 1], Y[j1 + 1]]; r.cells = [i0, j0, i1, j1];
      if (Math.min(r[2] - r[0], r[3] - r[1]) >= minSide) out.push(r);
    }
    return out;
  }
  function planeKey(nx, ny, c) { return nx + "," + ny + "," + Math.round(c * 200); }

  function build(ptsIn, pitchArg, optsIn) {
    let pitch = pitchArg, opts = optsIn || {};
    if (pitchArg && typeof pitchArg === "object") { opts = pitchArg; pitch = opts.pitch; }
    if (!(pitch >= 0)) pitch = 6;
    let style = opts.style || "hip";
    if (style === "auto") style = opts.roofType === "gable" ? "gable" : "hip"; // assessor roof_type, when known, decides; else hip
    if (style !== "gable") style = "hip";
    const pts = ptsIn.slice();
    const footArea = shoelaceArea(pts);
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const mar = minAreaRect(pts);
    const centered = pts.map(p => [p[0] - cx, p[1] - cy]);
    let q = centered.map(p => rot(p, -mar.angle));
    // snap vertex coordinates: values within 1.6 ft of each other collapse to their mean (axis-aligned walls)
    const sx = clusterMap(q.map(p => p[0]), 1.6), sy = clusterMap(q.map(p => p[1]), 1.6);
    q = q.map(p => [sx(p[0]), sy(p[1])]);
    const X = [...new Set(q.map(p => Math.round(p[0] * 1000) / 1000))].sort((a, b) => a - b);
    const Y = [...new Set(q.map(p => Math.round(p[1] * 1000) / 1000))].sort((a, b) => a - b);
    let rects = [], fellBack = false;
    if (X.length > 2 && Y.length > 2 && X.length <= 40 && Y.length <= 40) {
      const occ = []; let cover = 0;
      for (let i = 0; i < X.length - 1; i++) { occ.push([]); for (let j = 0; j < Y.length - 1; j++) { const o = inPoly([(X[i] + X[i + 1]) / 2, (Y[j] + Y[j + 1]) / 2], q); occ[i].push(o); if (o) cover += (X[i + 1] - X[i]) * (Y[j + 1] - Y[j]); } }
      if (Math.abs(cover - footArea) / Math.max(footArea, 1) <= 0.10) {
        rects = maximalRects(X, Y, occ, 3.5);
        if (style === "gable" && rects.length > 2) {
          // gable wants as few roofs as possible: greedy cover by the rectangles that add the most new area,
          // stop once under 3% of the footprint is left (tiny shoulders and steps get absorbed by the walls)
          const done = occ.map(c => c.map(() => false)), pick = [];
          const gain = r => { let g = 0; const [i0, j0, i1, j1] = r.cells; for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (!done[i][j]) g += (X[i + 1] - X[i]) * (Y[j + 1] - Y[j]); return g; };
          let left = cover;
          while (left > cover * 0.03 && pick.length < rects.length) {
            let best = null, bg = 0; for (const r of rects) { if (pick.includes(r)) continue; const g = gain(r); if (g > bg) { bg = g; best = r; } }
            if (!best || bg < 12) break;
            pick.push(best); left -= bg; const [i0, j0, i1, j1] = best.cells; for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) done[i][j] = true;
          }
          if (pick.length) rects = pick;
        }
      }
    }
    if (!rects.length) {
      fellBack = true;
      const xs = q.map(p => p[0]), ys = q.map(p => p[1]);
      rects = [[Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]];
    }
    // gable: trim each cross wing at the centerline of the bigger roof it runs into
    if (style === "gable" && rects.length > 1) {
      rects.sort((a, b) => (b[2] - b[0]) * (b[3] - b[1]) - (a[2] - a[0]) * (a[3] - a[1]));
      rects.forEach(r => { r.horiz = (r[2] - r[0]) >= (r[3] - r[1]); }); // ridge axis fixed before trimming
      for (let i = 1; i < rects.length; i++) {
        const R = rects[i], horiz = R.horiz;
        for (let k = 0; k < i; k++) {
          const M = rects[k], mh = M.horiz;
          if (mh === horiz) continue;
          if (horiz) { // R ridge runs in x, M ridge runs in y: trim R's x ends at M's centerline x
            const xm = (M[0] + M[2]) / 2; if (!(R[1] >= M[1] - 0.5 && R[3] <= M[3] + 0.5) || xm <= R[0] || xm >= R[2]) continue;
            if (R[0] >= M[0] - 0.5) R[0] = xm; else if (R[2] <= M[2] + 0.5) R[2] = xm;
          } else {
            const ym = (M[1] + M[3]) / 2; if (!(R[0] >= M[0] - 0.5 && R[2] <= M[2] + 0.5) || ym <= R[1] || ym >= R[3]) continue;
            if (R[1] >= M[1] - 0.5) R[1] = ym; else if (R[3] <= M[3] + 0.5) R[3] = ym;
          }
        }
      }
    }
    // planes (unit inward normal + offset; height above eave = pitch/12 x d(p)); rect -> competing planes
    const planes = [], pIdx = new Map();
    const getPlane = (nx, ny, c) => { const k = planeKey(nx, ny, c); if (!pIdx.has(k)) { pIdx.set(k, planes.length); planes.push({ nx, ny, c }); } return pIdx.get(k); };
    const rInfo = rects.map(r => {
      const [x0, y0, x1, y1] = r, w = x1 - x0, h = y1 - y0;
      const all = [getPlane(1, 0, x0), getPlane(-1, 0, -x1), getPlane(0, 1, y0), getPlane(0, -1, -y1)];
      const horizAxis = r.horiz !== undefined ? r.horiz : w >= h;
      const ids = style === "gable" ? (horizAxis ? [all[2], all[3]] : [all[0], all[1]]) : all;
      return { r, ids, poly: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], hps: [[1, 0, -x0], [-1, 0, x1], [0, 1, -y0], [0, -1, y1]] };
    });
    const dOf = (pl, p) => pl.nx * p[0] + pl.ny * p[1] - pl.c;
    const diffHP = (pa, pb) => [pb.nx - pa.nx, pb.ny - pa.ny, -(pb.c - pa.c)]; // d_b - d_a >= 0
    const m = pitch / 12, slopeFactor = Math.sqrt(1 + m * m);
    const back = p => { const u = rot(p, mar.angle); return [u[0] + cx, u[1] + cy]; };

    // facet regions per plane
    const facetsQ = [];
    planes.forEach((L, li) => {
      let pieces = [];
      for (const R of rInfo) {
        if (!R.ids.includes(li)) continue;
        let cell = R.poly;
        for (const t of R.ids) if (t !== li) { const hp = diffHP(L, planes[t]); cell = clipHP(cell, hp[0], hp[1], hp[2]); if (!cell) break; }
        if (!cell) continue;
        let add = [cell];
        for (const pc of pieces) { const hps = polyHPs(pc); add = add.flatMap(a => subtractHPs(a, hps)); }
        pieces = pieces.concat(add);
      }
      for (const R of rInfo) {
        if (R.ids.includes(li)) continue;
        const hps = R.hps.concat(R.ids.map(t => diffHP(L, planes[t])));
        pieces = pieces.flatMap(pc => subtractHPs(pc, hps));
      }
      pieces = pieces.filter(pc => ringArea(pc) > 0.02);
      if (!pieces.length) return;
      for (const ring of mergePieces(pieces)) facetsQ.push({ ring, plane: li });
    });

    // build facets (true frame), eave edge first
    const facets = [];
    for (const f of facetsQ) {
      const L = planes[f.plane];
      let ring = f.ring.slice(); const area = ringArea(ring); if (area < 0) ring.reverse();
      let bi = -1, bl = 0;
      for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; if (Math.abs(dOf(L, a)) < 0.03 && Math.abs(dOf(L, b)) < 0.03) { const l = dist(a, b); if (l > bl) { bl = l; bi = i; } } }
      if (bi > 0) ring = ring.slice(bi).concat(ring.slice(0, bi));
      const planSqft = Math.abs(area); if (planSqft < 1) continue;
      const dirTrue = rot([-L.nx, -L.ny], mar.angle);
      const angleDeg = (Math.atan2(dirTrue[0], dirTrue[1]) * 180 / Math.PI + 360) % 360;
      facets.push({ ring: ring.map(back), qring: ring, plane: f.plane, planSqft, slopeSqft: planSqft * slopeFactor, angleDeg });
    }

    // ---- creases and boundary from shared facet edges ----
    const canonV = []; const cvq = p => { for (const c of canonV) if (Math.abs(c[0] - p[0]) < 2e-3 && Math.abs(c[1] - p[1]) < 2e-3) return c; canonV.push(p.slice()); return canonV[canonV.length - 1]; };
    facets.forEach(f => { f.qring = f.qring.map(cvq); });
    const sub = new Map();
    facets.forEach((f, fi) => {
      const r = f.qring;
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
        const mids = canonV.filter(p => { if (p === a || p === b) return false; const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2; return t > 1e-6 && t < 1 - 1e-6 && Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)) < 3e-3; })
          .sort((p, q2) => Math.hypot(p[0] - a[0], p[1] - a[1]) - Math.hypot(q2[0] - a[0], q2[1] - a[1]));
        const chain = [a, ...mids, b];
        for (let k = 0; k + 1 < chain.length; k++) {
          const u = chain[k], v = chain[k + 1], key = [canonV.indexOf(u), canonV.indexOf(v)].sort((x, y) => x - y).join("|");
          if (!sub.has(key)) sub.set(key, { a: u, b: v, fs: [] });
          sub.get(key).fs.push(fi);
        }
      }
    });
    const uOf = (fi, p) => dOf(planes[facets[fi].plane], p);
    const ridgesQ = [], hipsQ = [], valleysQ = [], eavesQ = [], rakesQ = [];
    const E = 0.05;
    sub.forEach(s => {
      const { a, b } = s;
      const sl = dist(a, b);
      if (sl < 0.3) return; // sub-foot jogs from near-equal wing widths are model noise, not roof parts
      if (s.fs.length === 1) {
        if (sl < 0.5) return;
        const fi = s.fs[0], ua = uOf(fi, a), ub = uOf(fi, b);
        const seg = { a, b, ua: Math.max(0, ua), ub: Math.max(0, ub) };
        (ua < E && ub < E ? eavesQ : rakesQ).push(seg);
      } else if (s.fs.length === 2) {
        const [i, j] = s.fs, uai = uOf(i, a), ubi = uOf(i, b);
        if (Math.abs(uai - uOf(j, a)) > E || Math.abs(ubi - uOf(j, b)) > E) return; // step between roofs of different height: not a crease
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ex = b[0] - a[0], ey = b[1] - a[1], el = Math.hypot(ex, ey);
        let px = -ey / el, py = ex / el;
        if (!inPoly([mid[0] + px * 0.04, mid[1] + py * 0.04], facets[i].qring)) { px = -px; py = -py; }
        const P = [mid[0] + px * 0.04, mid[1] + py * 0.04];
        const dd = uOf(j, P) - uOf(i, P);
        if (Math.abs(dd) < 1e-6) return;
        const seg = { a, b, ua: uai, ub: ubi };
        if (dd > 0) (Math.abs(uai - ubi) < E ? ridgesQ : hipsQ).push(seg); else valleysQ.push(seg);
      }
    });
    // merge collinear touching segments of one type
    const mergeSegs = list => {
      let segs = list.map(s => Object.assign({}, s)), again = true;
      while (again) {
        again = false;
        outer: for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
          const A = segs[i], B = segs[j];
          for (const [ea, eb] of [["a", "a"], ["a", "b"], ["b", "a"], ["b", "b"]]) {
            if (A[ea] !== B[eb]) continue;
            const oa = ea === "a" ? "b" : "a", ob = eb === "a" ? "b" : "a";
            const v1 = [A[ea][0] - A[oa][0], A[ea][1] - A[oa][1]], v2 = [B[ob][0] - B[eb][0], B[ob][1] - B[eb][1]];
            const cr = v1[0] * v2[1] - v1[1] * v2[0], dt = v1[0] * v2[0] + v1[1] * v2[1];
            if (Math.abs(cr) < 1e-3 * Math.hypot(...v1) * Math.hypot(...v2) && dt > 0) {
              const nu = { a: A[oa], b: B[ob] }; nu.ua = A[oa === "a" ? "ua" : "ub"]; nu.ub = B[ob === "a" ? "ua" : "ub"];
              segs.splice(j, 1); segs[i] = nu; again = true; break outer;
            }
          }
        }
      }
      return segs;
    };
    const fin = (list, kind) => (kind === "rake" ? list : mergeSegs(list)).map(s => { // rakes stay one per roof slope (a gable end is a V in 3D, collinear in plan)
      const lenPlanFt = dist(s.a, s.b), dh = m * Math.abs(s.ua - s.ub);
      const o = { a: back(s.a), b: back(s.b), lenPlanFt, lenFt: kind === "eave" ? lenPlanFt : Math.hypot(lenPlanFt, dh) };
      if (kind === "rake") { o.ua = s.ua; o.ub = s.ub; }
      return o;
    }).sort((x, y) => y.lenFt - x.lenFt);
    const ridges = fin(ridgesQ, "ridge"), hipLines = fin(hipsQ, "hip"), valleyLines = fin(valleysQ, "valley"), rakes = fin(rakesQ, "rake");
    let eaveLines;
    if (style === "hip" && !fellBack) eaveLines = pts.map((a, i) => { const b = pts[(i + 1) % pts.length]; return { a, b, lenFt: dist(a, b) }; });
    else eaveLines = fin(eavesQ, "eave");
    // facets: drop the q-space helper rings, sort, label
    facets.forEach(f => { delete f.qring; delete f.plane; });
    facets.sort((a, b) => b.slopeSqft - a.slopeSqft);
    facets.forEach((f, i) => f.label = i < 26 ? String.fromCharCode(65 + i) : "F" + (i + 1));

    const sum = (arr, k) => arr.reduce((s, x) => s + x[k], 0);
    const planSum = sum(facets, "planSqft");
    const totals = {
      planSqft: Math.round(planSum * 10) / 10,
      slopeSqft: Math.round(sum(facets, "slopeSqft") * 10) / 10,
      ridgeFt: Math.round(sum(ridges, "lenFt")),
      hipFt: Math.round(sum(hipLines, "lenFt")),
      valleyFt: Math.round(sum(valleyLines, "lenFt")),
      eaveFt: Math.round(sum(eaveLines, "lenFt")),
      rakeFt: Math.round(sum(rakes, "lenFt")),
      facetCount: facets.length,
      ridgeCount: ridges.length,
      hipCount: hipLines.length,
      valleyCount: valleyLines.length,
      rakeCount: rakes.length,
      squares: Math.round((sum(facets, "slopeSqft") / 100) * 10) / 10,
      footprintSqft: Math.round(footArea * 10) / 10,
      areaErrPct: Math.round((planSum - footArea) / Math.max(footArea, 1) * 1000) / 10,
      fellBack
    };
    return { facets, ridges, hips: hipLines, valleys: valleyLines, eaves: eaveLines, rakes, totals, pitch, style, slopeFactor, hipFactor: Math.sqrt(1 + (m * m) / 2) };
  }
  // Display orientation (2026-10-03): angle theta (radians, CCW from east) of the house's main axis,
  // chosen so rotating the drawing by -theta puts the LONG side of the footprint's minimum-area
  // rectangle horizontal. Near-square footprints (sides within 4%) take the smaller turn instead
  // (within +-45 deg) so they never flip arbitrarily. Display only: lengths/areas never change.
  function orient(pts) {
    if (!pts || pts.length < 3) return 0;
    const m = minAreaRect(pts);
    let a = m.angle;
    const nearSquare = Math.abs(m.w - m.h) / Math.max(m.w, m.h, 1e-9) < 0.04;
    if (!nearSquare && m.h > m.w) a += Math.PI / 2;
    const lim = nearSquare ? Math.PI / 4 : Math.PI / 2, step = nearSquare ? Math.PI / 2 : Math.PI;
    while (a > lim) a -= step;
    while (a <= -lim) a += step;
    return a;
  }
  // Deep copy of a plan (and its footprint ring) with every coordinate rotated by -theta.
  function rotatePlan(plan, ptsIn, theta) {
    const R = p => rot(p, -theta);
    const seg = s => Object.assign({}, s, { a: R(s.a), b: R(s.b) });
    return {
      pts: ptsIn.map(R),
      plan: plan && Object.assign({}, plan, {
        facets: plan.facets.map(f => Object.assign({}, f, { ring: f.ring.map(R) })),
        ridges: plan.ridges.map(seg), hips: plan.hips.map(seg), valleys: plan.valleys.map(seg), eaves: plan.eaves.map(seg), rakes: (plan.rakes || []).map(seg)
      })
    };
  }
  window.RoofPlan = { build, orient, rotatePlan, STYLES: ["hip", "gable", "auto"] };
})();
