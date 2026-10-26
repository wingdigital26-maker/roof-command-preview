/* Per-home roof lines for every screen (window.RCLINES): ONE source shared by the Storms map (Satellite lines, 3D houses)
   and the home record's LiDAR measurements view. Read-only copy of what scripts/roofs/map_roofs.py writes:
   - st-data-dfw/roof3d/<region>/<tr>_<tc>.bin.gz: one record per home with an outline (0.05 degree tiles, as fp/), the
     binary layout in map_roofs.py's docstring: vertices lon/lat + z (ft above ground), triangles, typed lines, wall ring
   - st-data-dfw/roof3d/passed.json {regions: {region: [row]}}: the measured models that pass lib/rc-roof.js gatePass today
   Two kinds of home (honesty rule, Jack 10-22):
   - source 'model' + passed: a measured block model that passed every roof gate. Its ridges, hips, valleys, eaves and rakes
     are measurements and may be drawn as such.
   - source 'outline': a squared outline with a straight-skeleton hip roof at the LiDAR pitch. Only the outline (eave)
     lengths may be shown, labelled estimate; the interior lines are a guess and come back with shown:false (the 3D shape
     can use them, a measurement view must not draw them).
   API
     RCLINES.lines(i)  -> Promise<rec | null>       (fetches the tile; null = no outline / no record for this home)
     RCLINES.now(i)    -> rec | null                (only if its tile is already loaded)
     RCLINES.need(bb, onArrive)                     (map: load the tiles under a lon/lat box; onArrive(raw records))
     RCLINES.raw(i)    -> the decoded record (ll Float64 [lon,lat,...], z Float32 ft, tri, lines [[a,b,type]], ring)
   rec = { i, source: 'model'|'outline', passed, pitch (rise/12), pitchFrom: 'lidar'|'assumed', stories, storiesFrom:
     'lidar'|'estimate', eaveFt, outlineFrom: 'county'|'microsoft', label,
     edges: [{ type: 'eave'|'ridge'|'hip'|'valley'|'rake', a: [lon, lat, zFt], b: [lon, lat, zFt], len_ft (true sloped length),
               measured, shown }],
     ring: [[lon, lat], ...] (wall outline), mesh: { verts: [[lon, lat, zFt]], tris: [[a, b, c]] } } */
(function () {
  'use strict';
  if (window.RCLINES) return;
  const src = document.currentScript && document.currentScript.src;
  const BASE = () => window.rooferDataRoot ? rooferDataRoot() : (src ? new URL('st-data-dfw/', src).href : new URL('lib/st-data-dfw/', location.href).href);
  const J = u => fetch(BASE() + u).then(r => r.ok ? r.json() : null).catch(() => null);
  const TYPES = ['eave', 'ridge', 'hip', 'valley', 'rake', 'wall'];
  const FT = 3.28084, M_LAT = 110540, M_LON = lat => 111320 * Math.cos(lat * Math.PI / 180);
  let catP = null; const cat = () => catP || (catP = J('catalog.json'));
  let passP = null; const passedSet = () => passP || (passP = J('roof3d/passed.json').then(d => { const S = new Set(); if (d && d.regions) Object.entries(d.regions).forEach(([rid, rows]) => rows.forEach(r => S.add(rid + ':' + r))); return S; }));
  const R = new Map(), tiles = {};
  let PASSED = null; passedSet().then(S => { PASSED = S; });
  let tileIndex = null, regions = null;
  function index(c) {
    if (tileIndex) return; regions = c.regions; tileIndex = {};
    c.regions.forEach(r => r.tiles.forEach(t => { (tileIndex[t.tr + '_' + t.tc] = tileIndex[t.tr + '_' + t.tc] || []).push(r); }));
  }
  const regOf = i => { for (let k = regions.length - 1; k >= 0; k--) if (i >= regions[k].offset) return regions[k]; return regions[0]; };

  function decode(buf, tr, tc) {
    const dv = new DataView(buf), n = dv.getUint32(0, true), olon = tc * 0.05, olat = tr * 0.05, out = []; let o = 4;
    for (let k = 0; k < n; k++) {
      const i = dv.getUint32(o, true), flags = dv.getUint8(o + 4), rise = dv.getUint8(o + 5) / 4, eave = dv.getUint16(o + 6, true) / 30.48, nv = dv.getUint16(o + 8, true); o += 10;
      const ll = new Float64Array(nv * 2), z = new Float32Array(nv);
      for (let v = 0; v < nv; v++) { ll[v * 2] = olon + dv.getUint16(o, true) * 1e-6; ll[v * 2 + 1] = olat + dv.getUint16(o + 2, true) * 1e-6; z[v] = dv.getUint16(o + 4, true) / 30.48; o += 6; }
      const W = flags & 16, id = () => { const v = W ? dv.getUint16(o, true) : dv.getUint8(o); o += W ? 2 : 1; return v; };
      const nt = dv.getUint16(o, true); o += 2; const tri = new Uint16Array(nt * 3); for (let t = 0; t < nt * 3; t++) tri[t] = id();
      const nl = dv.getUint16(o, true); o += 2; const lines = []; for (let l = 0; l < nl; l++) lines.push([id(), id(), 0]); for (let l = 0; l < nl; l++) lines[l][2] = dv.getUint8(o++);
      const nr = dv.getUint16(o, true); o += 2; const ring = []; for (let r = 0; r < nr; r++) ring.push(id());
      out.push({ i, flags, rise, eave, ll, z, tri, lines, ring });
    }
    return out;
  }
  const gunzip = x => !x.ok ? null : x.headers.get('content-encoding') === 'gzip' || !window.DecompressionStream ? x.arrayBuffer()
    : new Response(x.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  function loadTile(rid, tr, tc) {
    const k = rid + '/' + tr + '_' + tc;
    if (!tiles[k]) tiles[k] = fetch(`${BASE()}roof3d/${k}.bin.gz`).then(gunzip).then(buf => { const recs = buf ? decode(buf, tr, tc) : []; recs.forEach(h => R.set(h.i, h)); return recs; }).catch(() => []);
    return tiles[k];
  }
  // the map: every tile under a lon/lat box, each tile's records handed over as it lands
  function need(bb, onArrive) {
    return Promise.all([cat(), passedSet()]).then(([c]) => { if (!c) return; index(c);
      const r0 = Math.floor(bb[1] / 0.05), r1 = Math.floor(bb[3] / 0.05), c0 = Math.floor(bb[0] / 0.05), c1 = Math.floor(bb[2] / 0.05);
      for (let tr = r0; tr <= r1; tr++) for (let tc = c0; tc <= c1; tc++) (tileIndex[tr + '_' + tc] || []).forEach(r => {
        const k = r.id + '/' + tr + '_' + tc, fresh = !tiles[k]; const p = loadTile(r.id, tr, tc); if (fresh && onArrive) p.then(onArrive); }); });
  }
  // a home's own position: the map's homes (STH), else STM.lonlat (record screens)
  function pos(i) {
    if (window.STH && STH.xy) return Promise.resolve([STH.lon(i), STH.lat(i)]);
    if (window.STM && STM.lonlat) return STM.lonlat(i);
    return Promise.resolve(null);
  }
  function passedOf(h) { if (!(h.flags & 4) || !PASSED || !regions) return false; const r = regOf(h.i); return PASSED.has(r.id + ':' + (h.i - r.offset)); }
  // a decoded record -> the shape every screen reads
  function shape(h) {
    if (!h) return null;
    const model = !!(h.flags & 4), passed = passedOf(h), source = model && passed ? 'model' : 'outline';
    const P = v => [h.ll[v * 2], h.ll[v * 2 + 1], Math.round(h.z[v] * 100) / 100];
    const kx = M_LON(h.ll[1]) * FT, ky = M_LAT * FT;
    const edges = [];
    h.lines.forEach(([a, b, t]) => { if (t === 5) return;
      const dx = (h.ll[b * 2] - h.ll[a * 2]) * kx, dy = (h.ll[b * 2 + 1] - h.ll[a * 2 + 1]) * ky, dz = h.z[b] - h.z[a], L = Math.hypot(dx, dy, dz);
      if (L < 1.5) return;
      const measured = source === 'model';
      edges.push({ type: TYPES[t], a: P(a), b: P(b), len_ft: Math.round(L * 10) / 10, measured, shown: measured || t === 0 }); });
    const verts = []; for (let v = 0; v < h.z.length; v++) verts.push(P(v));
    const tris = []; for (let t = 0; t < h.tri.length; t += 3) tris.push([h.tri[t], h.tri[t + 1], h.tri[t + 2]]);
    const stories = h.eave >= 15 ? 2 : 1;
    // a model that no longer passes keeps its drawn shape (it is what the tile holds) but every figure is an estimate
    const label = source === 'model' ? 'Measured roof model (LiDAR, passed the roof checks)'
      : `Roof shape estimate (hip) at ${h.rise}/12 ${h.flags & 1 ? 'LiDAR pitch' : 'assumed pitch'}; outline lengths are estimates`;
    return { i: h.i, source, passed, pitch: h.rise, pitchFrom: h.flags & 1 ? 'lidar' : 'assumed', stories, storiesFrom: h.flags & 2 ? 'lidar' : 'estimate',
      eaveFt: Math.round(h.eave * 10) / 10, outlineFrom: h.flags & 8 ? 'microsoft' : 'county', label, edges,
      ring: h.ring.map(v => [h.ll[v * 2], h.ll[v * 2 + 1]]), mesh: { verts, tris } };
  }
  function lines(i) {
    i = +i; if (!(i >= 0)) return Promise.resolve(null);
    if (R.has(i)) return passedSet().then(() => shape(R.get(i)));
    return Promise.all([cat(), pos(i), passedSet()]).then(([c, p]) => {
      if (!c || !p) return null; index(c); const r = regOf(i), tr = Math.floor(p[1] / 0.05), tc = Math.floor(p[0] / 0.05);
      // the record sits in its outline's tile, usually the home point's tile; a home near a tile edge can sit next door
      const keys = [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]].map(([a, b]) => [tr + a, tc + b]).filter(([a, b]) => (tileIndex[a + '_' + b] || []).includes(r));
      const next = k => k >= keys.length ? null : loadTile(r.id, keys[k][0], keys[k][1]).then(() => R.has(i) ? shape(R.get(i)) : next(k + 1));
      return next(0);
    });
  }
  window.RCLINES = { lines, now: i => R.has(+i) ? shape(R.get(+i)) : null, need, raw: i => R.get(+i) || null, passed: h => passedOf(h), shape, recs: R };
})();
