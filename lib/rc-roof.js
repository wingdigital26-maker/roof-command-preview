/* Per-home LiDAR roof facets for every screen (window.RCROOF). Read-only copies of what scripts/dfw/facet_batch.py writes:
   - meta/roof/index.json + meta/roof/<region>/tile_<r>_<c>.json  {row: [m, squares, plan sq ft, pitch/12, pitch2/12, facets,
     stories, story conf, conf, ridge, hip, valley, eave, rake, flashing, lidar year]}; m 1 = facets measured, 0 = outline estimate
   - meta/roof-detail/index.json {region: [row, ...]} + meta/roof-detail/<region>/<row>.json: the full report for one home
     (scripts/dfw/roof_report.py schema: totals, confidence, facets, edges, geometry_ft) when one was rendered
   - meta/roof-geom/index.json + meta/roof-geom/<region>/<row / 128>.json.gz: every facet home's facets, edges and rings
     (scripts/dfw/roof_geom_pack.py), loaded when a home is opened and decoded into the report's shape (no totals: the tile
     row keeps the figures); the diagram and the 3D roof draw it
   No file for a home = nothing shown; every screen keeps its outline estimate and its est. labels.
   Stories come from the LiDAR roof height (eave height over ground): shown as "2-story" when the batch is sure (conf at or
   over the index's good_conf, 60), "Stories: likely 2" when it is not, nothing when there is no record. */
(function () {
  'use strict';
  if (window.RCROOF) return;
  const src = document.currentScript && document.currentScript.src;
  const BASE = () => window.rooferDataRoot ? rooferDataRoot() : (src ? new URL('st-data-dfw/', src).href : new URL('lib/st-data-dfw/', location.href).href);
  const J = u => fetch(BASE() + u).then(r => r.ok ? r.json() : null).catch(() => null);
  let catP = null; const cat = () => catP || (catP = J('catalog.json'));
  const regOf = (c, i) => { for (let k = c.regions.length - 1; k >= 0; k--) if (i >= c.regions[k].offset) return c.regions[k]; return c.regions[0]; };
  let idxP = null; const idx = () => idxP || (idxP = J('meta/roof/index.json').then(d => d || { tiles: {} }));
  let didxP = null; const didx = () => didxP || (didxP = J('meta/roof-detail/index.json').then(d => d || {}));
  // solid-block roof models that passed every gate rule (scripts/roofs/build_blocks.py): lib/roof-blocks/index.json
  // {regions: {region: [row, ...]}} + lib/roof-blocks/<region>/<row>.json (same shape as a roof-detail file, with gate.pass).
  // An approved roof-detail file (Caleo) wins; a home in neither keeps its outline view.
  const BLK = src ? new URL('roof-blocks/', src).href : new URL('lib/roof-blocks/', location.href).href;
  const BJ = u => fetch(BLK + u, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
  let bidxP = null; const bidx = () => bidxP || (bidxP = BJ('index.json').then(d => (d && d.regions) || {}));
  const tiles = {}, C = {}, D = {}, P = {};
  let GOOD = 60;

  // a tile row -> a plain record
  function parse(a, extra) {
    if (!a || !a.length) return null;
    const r = { facets: a[0] === 1, est: a[0] === 2, sq: a[1], plan: a[2], pitch: a[3] || 0, pitch2: a[4] || 0, nFacets: a[5] || 0, stories: a[6] || 0, storyConf: a[7] || 0, conf: a[8] || 0,
      ridge: a[9] || 0, hip: a[10] || 0, valley: a[11] || 0, eave: a[12] || 0, rake: a[13] || 0, flashing: a[14] || 0, year: a[15] || 2018 };
    return Object.assign(r, extra || {});
  }
  // the full report's totals -> the same record, plus everything the report tab shows
  function fromDetail(d) {
    const t = d && d.totals; if (!t) return null;
    const mix = t.pitch_mix || {}, ks = Object.keys(mix).sort((a, b) => mix[b] - mix[a]);
    const rise = s => parseInt(String(s || '').split('/')[0], 10) || 0;
    const c = d.confidence || {};
    return { facets: true, sq: t.squares, plan: t.plan_area_sqft, pitch: rise(t.predominant_pitch), pitch2: ks[1] ? rise(ks[1]) : 0, nFacets: t.facets || 0,
      stories: t.stories || 0, storyConf: t.stories_confidence || 0, conf: c.squares || 0,
      ridge: t.ridges_ft || 0, hip: t.hips_ft || 0, valley: t.valleys_ft || 0, eave: t.eaves_ft || 0, rake: t.rakes_ft || 0,
      flashing: (t.step_flashing_ft || 0) + (t.wall_flashing_ft || 0), year: +(d.lidar_year || (d.source && /2020/.test(d.source) ? 2020 : 0)) || 2018,
      mix, range: t.squares_range || null, waste: t.suggested_waste_pct, order: t.squares_with_waste, area: t.roof_area_sqft,
      drip: t.drip_edge_ft, starter: t.starter_ft, starterEaves: t.starter_eaves_only_ft, ridgeCap: t.ridge_cap_ft, step: t.step_flashing_ft || 0, wall: t.wall_flashing_ft || 0,
      confidence: c, detail: true };
  }
  function tileRow(i, lon, lat) {
    return Promise.all([cat(), idx()]).then(([c, ix]) => {
      if (!c) return null;
      if (ix && ix.good_conf) GOOD = ix.good_conf;
      const r = regOf(c, i), have = new Set((ix.tiles || {})[r.id] || []), j = String(i - r.offset);
      if (!have.size || !isFinite(lon) || !isFinite(lat)) return null;
      const tr = Math.floor(lat / 0.05), tc = Math.floor(lon / 0.05), keys = [];
      [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) => { const k = (tr + a) + '_' + (tc + b); if (have.has(k)) keys.push(k); });
      const next = k => { if (k >= keys.length) return null; const key = r.id + '/' + keys[k];
        tiles[key] = tiles[key] || J(`meta/roof/${r.id}/tile_${keys[k]}.json`).then(d => d || {});
        return tiles[key].then(d => d[j] ? d[j] : next(k + 1)); };
      return next(0);
    });
  }
  // ---------- per-home facet geometry (ROOF-GEOM-1011, scripts/dfw/roof_geom_pack.py): every facet-measured home ----------
  // meta/roof-geom/index.json {block, packs: {region: [block]}} + meta/roof-geom/<region>/<row / block>.json.gz {row: home},
  // fetched only when a home is opened (one pack of up to 128 homes, about 150 KB). Decimetre ints, delta coded; decoded
  // here into the full report's shape (facets, edges, geometry_ft) so the top-down diagram and the 3D roof draw it as they
  // draw a full report. No pack for the home = null (the summary row and the outline estimate stay).
  let gidxP = null; const gidx = () => gidxP || (gidxP = J('meta/roof-geom/index.json').then(d => d || { packs: {} }));
  const packs = {}, Gm = {};
  function gunzip(r) {
    if (!r || !r.ok) return null;
    return r.arrayBuffer().then(b => {
      const u = new Uint8Array(b);
      if (u[0] === 0x1f && u[1] === 0x8b && window.DecompressionStream)   // served as a plain .gz (no Content-Encoding)
        return new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
      return JSON.parse(new TextDecoder().decode(u));                     // already decoded by the server / browser
    });
  }
  const DMF = 0.328084, CMP = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], ETYPE = ['ridge', 'hip', 'valley', 'eave', 'rake', 'step_flashing', 'wall_flashing'];
  const fid = n => n < 26 ? String.fromCharCode(65 + n) : 'F' + n;
  function ringFt(r) { const out = []; let x = 0, y = 0; for (let k = 0; k + 1 < r.length; k += 2) { x += r[k]; y += r[k + 1]; out.push([Math.round(x * DMF * 100) / 100, Math.round(y * DMF * 100) / 100]); } return out; }
  function geomReport(h) {
    if (!h || !h.f || !h.f.length) return null;
    const r1 = v => Math.round(v * 10) / 10, facets = [], polys = {};
    h.f.forEach((x, n) => {
      const id = fid(n), p = x[0] / 10, az = x[1];
      facets.push({ id, pitch_x12: r1(p), pitch: Math.round(p) + '/12', azimuth_deg: az >= 0 ? az : null, faces: az >= 0 ? CMP[Math.floor(((az + 22.5) % 360) / 45)] : null,
        plan_sqft: x[4], area_sqft: x[5], eave_height_ft: r1(x[2] * DMF), top_height_ft: r1(x[3] * DMF) });
      polys[id] = x.slice(6).map(ringFt).filter(r => r.length >= 3);
    });
    const edges = []; let px = 0, py = 0; const e = h.e || [];
    for (let k = 0; k + 7 < e.length; k += 8) {
      const ax = px + e[k + 3], ay = py + e[k + 4], bx = ax + e[k + 5], by = ay + e[k + 6]; px = bx; py = by;
      edges.push({ type: ETYPE[e[k]] || 'eave', facets: e[k + 2] >= 0 ? [fid(e[k + 1]), fid(e[k + 2])] : [fid(e[k + 1])], len_ft: r1(e[k + 7] * DMF),
        a_ft: [r1(ax * DMF), r1(ay * DMF)], b_ft: [r1(bx * DMF), r1(by * DMF)] });
    }
    const close = r => r.length ? r.concat([r[0]]) : r;
    // snapped: the rings are already simplified (0.3 m) and the vertices neighbouring facets share already meet (real-roof.js keeps them);
    // c 1 (scripts/dfw/roof_clean.py): reconstructed, the facets tile the roof outline with shared vertices (no gaps, no overlaps)
    return { facets, edges, geometry_ft: { roof: close(ringFt(h.r || [])), outline: close(ringFt(h.o || [])), facets: polys, snapped: true, clean: !!h.c }, source: { geometry: 'meta/roof-geom' } };
  }
  function geom(i) {
    i = +i; if (Gm[i] !== undefined) return Promise.resolve(Gm[i]);
    return Promise.all([cat(), gidx()]).then(([c, gx]) => {
      if (!c || !gx) return (Gm[i] = null);
      const r = regOf(c, i), row = i - r.offset, B = gx.block || 128, b = Math.floor(row / B);
      if (((gx.packs || {})[r.id] || []).indexOf(b) < 0) return (Gm[i] = null);
      const key = r.id + '/' + b;
      packs[key] = packs[key] || fetch(BASE() + `meta/roof-geom/${key}.json.gz`).then(gunzip).catch(() => null);
      return packs[key].then(p => (Gm[i] = p && p[row] ? geomReport(p[row]) : null));
    }).catch(() => (Gm[i] = null));
  }
  // a block model is shown only when it passed AND every one of its rules passed (solid, walls, lines, sizes, measure =
  // LiDAR fit, looks) and it is not flagged as still being checked; gate.pass with a failed rule (e.g. r5_measure, a poor
  // LiDAR fit) is not enough (lead card 10-22)
  function gatePass(g) {
    if (!g || g.pass !== true || g.checking) return false;
    const r = g.rules; return !!r && Object.keys(r).length > 0 && Object.values(r).every(v => v === true);
  }
  // the full report for one home when one was rendered (listed in meta/roof-detail/index.json), else the home's facet
  // geometry (no totals: the figures stay the summary row's) when the geometry run measured it, else null
  function detail(i) {
    i = +i; if (D[i] !== undefined) return Promise.resolve(D[i]);
    return Promise.all([cat(), didx(), bidx()]).then(([c, dx, bx]) => {
      if (!c) return (D[i] = null);
      const r = regOf(c, i), row = i - r.offset, list = (dx || {})[r.id] || [];
      const hit = list.find(e => e === row || (e && e.row === row));   // a row number, or {row, url} (url relative to the data root)
      if (hit === undefined && ((bx || {})[r.id] || []).indexOf(row) >= 0)    // a passing block model
        return BJ(`${r.id}/${row}.json`).then(d => d && d.totals && gatePass(d.gate) ? (D[i] = d) : geom(i).then(g => {
          // a model that did not pass every gate rule (or is still being checked): carry the flag so no shape is shown as measured
          if (g) g.gate = Object.assign({}, g.gate || {}, { checking: true });
          return (D[i] = g); }));
      if (hit === undefined) return geom(i).then(g => (D[i] = g));
      return J(hit && hit.url ? hit.url : `meta/roof-detail/${r.id}/${row}.json`).then(d => d && d.totals ? (D[i] = d) : geom(i).then(g => (D[i] = g)));
    });
  }
  // everything known about one home's roof from the facet batch (tile row, or the full report's totals when the tile has none)
  function lookup(i, lon, lat) {
    i = +i; if (!(i >= 0)) return Promise.resolve(null);
    if (P[i]) return P[i];
    return (P[i] = Promise.all([tileRow(i, lon, lat), detail(i)]).then(([a, d]) => {
      // one source of truth per home: the full report (the one the top-down diagram is drawn from) wins over the batch
      // tile row for every figure; the tile row is the source only when no report was rendered for the home
      // (a home with only its facet geometry, no full report: the tile row keeps every figure, the geometry draws the roof)
      const full = d && d.totals, row = full ? Object.assign(a ? parse(a) : {}, fromDetail(d)) : a ? parse(a) : null;
      if (row && d) Object.defineProperty(row, 'report', { value: d, enumerable: false });
      if (row && d && !full && row.waste == null && row.sq > 0) {   // roof_report.py's waste rule from the facet count and valleys, so 3D and report agree
        const nf = row.nFacets || d.facets.length, nv = d.edges.filter(e => e.type === 'valley').length;
        let w = nf <= 4 ? 10 : nf <= 8 ? 12 : nf <= 14 ? 15 : 17; if (nv >= 4) w = Math.min(17, w + 2);
        row.waste = w; row.order = Math.round(row.sq * (1 + w / 100) * 10) / 10;
      }   // the 3D roof builds its planes from it (not serialized)
      C[i] = row || null; return C[i];
    }).catch(() => (C[i] = null)));
  }
  const cached = i => C[+i];

  // ---------- stories ----------
  function stories(row) {
    if (!row || !(row.stories >= 1)) return null;
    const n = Math.min(3, Math.round(row.stories)), sure = row.storyConf >= GOOD;
    if (!sure) return null;   // a low-confidence count ('likely 3' on a one-story house) is a guess: not shown (10-22)
    return { n, conf: row.storyConf, sure, label: sure ? n + '-story' : 'Stories: likely ' + n, tip: 'Detected from LiDAR roof height' + (sure ? '' : ' (low confidence, ' + row.storyConf + '%)') };
  }
  const ICON = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M2 14h12M3 14V7l5-4 5 4v7M6 10.5h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function chip(row, cls) {
    const s = stories(row); if (!s) return '';
    return `<span class="rc-story${s.sure ? '' : ' soft'}${cls ? ' ' + cls : ''}" title="${s.tip}">${ICON}${s.label}</span>`;
  }
  // ---------- the words every screen uses for one home's roof (one place, so the screens agree) ----------
  // measured: the batch marked the home's facets measured (m 1) or the full report is on file; else every figure says est.
  function pitches(row) {
    if (!row) return [];
    if (row.mix) { const ks = Object.keys(row.mix).sort((a, b) => row.mix[b] - row.mix[a]); return ks.filter((k, n) => n === 0 || row.mix[k] >= 15).slice(0, 2); }
    return [row.pitch, row.pitch2].filter(v => v >= 1).map(v => v + '/12');
  }
  function shape(row) {
    if (!row) return '';
    const hip = row.hip || 0, rake = row.rake || 0, ridge = row.ridge || 0;
    if (hip + rake < 1) return '';
    if (rake < 0.12 * (hip + rake)) return 'hip roof';
    if (hip < 0.12 * (hip + rake)) return ridge > 0 ? 'gable roof' : 'shed roof';
    return 'hip and gable roof';
  }
  function words(row) {
    if (!row || !(row.sq > 0)) return null;
    const measured = !!row.facets, p = pitches(row);
    return { measured, tag: measured ? 'measured' : 'est.', sq: row.sq, sqText: measured ? row.sq + ' sq' : '~' + row.sq + ' sq (est.)',
      pitch: p.join(' + '), pitchMain: p[0] || '', pitchList: p, shape: shape(row), facets: row.nFacets || 0,
      waste: row.waste != null ? row.waste : null, order: row.order != null ? row.order : null,
      tip: measured ? 'Measured from LiDAR roof facets (' + (row.year || 2018) + '). Verify on site.' : 'Estimated from public building outlines and 2018 LiDAR. Verify on site.' };
  }

  // eave height for the 3D house: about 9.5 ft per story, null when the batch has no story count
  const eaveFt = row => { const s = stories(row); return s ? s.n * 9.5 : null; };

  // ---------- the top-down facet / edge diagram (scripts/dfw/report_render.py diagram_svg, in JS) ----------
  const EC = { ridge: '#C0262D', hip: '#E07B00', valley: '#2757E6', eave: '#1F8A4C', rake: '#7A3FB8', step_flashing: '#0E9AA7', wall_flashing: '#5A6478' };
  const ENAME = { ridge: 'Ridge', hip: 'Hip', valley: 'Valley', eave: 'Eave', rake: 'Rake', step_flashing: 'Step flashing', wall_flashing: 'Wall flashing' };
  const FILLS = ['#F3D9B1', '#CFE3F6', '#D7EDD2', '#F4CFD3', '#E5DAF2', '#FBE8A6', '#CDEDEA', '#E9E1D3', '#F7D6EA', '#DDE7C5'];
  const num = v => (Math.round(v * 10) / 10).toFixed(1);
  function diagramSVG(d, W) {
    const g = d && d.geometry_ft; if (!g || !g.roof || !g.roof.length) return '';
    W = W || 760;
    const ring = g.roof, xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), pad = 4;
    const s = W / ((x1 - x0) + 2 * pad), H = ((y1 - y0) + 2 * pad) * s;
    const T = p => [(p[0] - x0 + pad) * s, (y1 + pad - p[1]) * s];
    const pts = r => r.map(p => T(p).map(num).join(',')).join(' ');
    const o = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(W)} ${Math.round(H)}" class="rr-diag" role="img" aria-label="Top-down roof diagram, lengths in feet">`,
      '<defs><marker id="rrah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#0E1B3D"/></marker></defs>'];
    const ids = Object.keys(g.facets || {}), byId = {}; (d.facets || []).forEach(f => { byId[f.id] = f; });
    ids.forEach((id, n) => {
      const rings = g.facets[id] || []; if (!rings.length) return;
      const path = rings.map(r => 'M' + r.map(p => T(p).map(num).join(' ')).join('L') + 'Z').join('');
      o.push(`<path d="${path}" fill="${FILLS[n % FILLS.length]}" fill-rule="evenodd" stroke="#fff" stroke-width="1"/>`);
    });
    if (g.outline && g.outline.length) o.push(`<polygon points="${pts(g.outline)}" fill="none" stroke="#0E1B3D" stroke-width="1" stroke-dasharray="3 3" opacity=".45"/>`);
    (d.edges || []).forEach(e => {
      const [ax, ay] = T(e.a_ft), [bx, by] = T(e.b_ft), dash = /flashing/.test(e.type) ? ' stroke-dasharray="6 4"' : '';
      o.push(`<line x1="${num(ax)}" y1="${num(ay)}" x2="${num(bx)}" y2="${num(by)}" stroke="${EC[e.type] || '#5A6478'}" stroke-width="3.5" stroke-linecap="round"${dash}/>`);
    });
    (d.edges || []).forEach(e => {
      if (!(e.len_ft >= 6)) return;
      const [ax, ay] = T(e.a_ft), [bx, by] = T(e.b_ft);
      o.push(`<text x="${num((ax + bx) / 2)}" y="${num((ay + by) / 2)}" class="rr-el" fill="${EC[e.type] || '#5A6478'}">${Math.round(e.len_ft)}</text>`);
    });
    // facet labels: biggest first; a facet under 60 sq ft plan or a label that would overlap one already placed is skipped
    // (the facet keeps its colour and its row in the tables)
    const placed = [], hitBox = (x, y, w, h) => placed.some(b => x < b[0] + b[2] && b[0] < x + w && y < b[1] + b[3] && b[1] < y + h);
    ids.slice().sort((a, b) => ((byId[b] || {}).plan_sqft || 0) - ((byId[a] || {}).plan_sqft || 0)).forEach(id => {
      const r = (g.facets[id] || [])[0]; if (!r || r.length < 3) return;
      if (ids.length > 4 && ((byId[id] || {}).plan_sqft || 0) < 60) return;
      // label at the ring's centroid (area weighted), nudged inside for a thin or L shaped facet by the nearest ring point
      let A = 0, cx = 0, cy = 0;
      for (let k = 0; k < r.length; k++) { const p = r[k], q = r[(k + 1) % r.length], w = p[0] * q[1] - q[0] * p[1]; A += w; cx += (p[0] + q[0]) * w; cy += (p[1] + q[1]) * w; }
      if (Math.abs(A) < 1e-6) return; cx /= 3 * A; cy /= 3 * A;
      const [x, y] = T([cx, cy]), f = byId[id] || {};
      const lw = (String(id).length + (f.pitch ? f.pitch.length + 3 : 0)) * 7.5 + 6;
      if (hitBox(x - lw / 2, y - 16, lw, f.azimuth_deg != null ? 50 : 18)) return;
      placed.push([x - lw / 2, y - 16, lw, f.azimuth_deg != null ? 50 : 18]);
      let arrow = '';
      if (f.azimuth_deg != null) { const a = f.azimuth_deg * Math.PI / 180, dx = Math.sin(a) * 14, dy = -Math.cos(a) * 14;
        arrow = `<line x1="${num(x - dx)}" y1="${num(y + 16 - dy)}" x2="${num(x + dx)}" y2="${num(y + 16 + dy)}" stroke="#0E1B3D" stroke-width="1.5" marker-end="url(#rrah)"/>`; }
      o.push(`<text x="${num(x)}" y="${num(y - 2)}" class="rr-fl">${id}${f.pitch ? ' · ' + f.pitch : ''}</text>${arrow}`);
    });
    o.push(`<g transform="translate(${Math.round(W - 30)},26)"><path d="M0,-16 L7,8 L0,3 L-7,8 z" fill="#0E1B3D"/><text y="22" class="rr-fl" text-anchor="middle">N</text></g>`);
    const L20 = 20 * s;
    o.push(`<g transform="translate(14,${Math.round(H - 14)})"><line x1="0" y1="0" x2="${num(L20)}" y2="0" stroke="#0E1B3D" stroke-width="2"/><text x="${num(L20 / 2)}" y="-5" class="rr-el" fill="#0E1B3D">20 ft</text></g>`);
    o.push('</svg>');
    return o.join('');
  }
  const legend = () => Object.keys(EC).map(k => `<span class="rr-lg"><i style="background:${EC[k]}"></i>${ENAME[k]}</span>`).join('');

  // ---------- the report tab ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => n == null || isNaN(+n) ? '' : (+n).toLocaleString('en-US');
  function cbar(v) { if (v == null) return '<span class="rr-cn">no figure</span>'; const c = v >= 70 ? '#1F8A4C' : v >= 45 ? '#B07A00' : '#B3262E';
    return `<span class="rr-cf" style="--c:${c}"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></span><span class="rr-cn">${v}%</span>`; }
  /* row: the facet record (lookup); d: the full report when there is one; est: the screen's current estimate
     { squares, pitch (text), planes, label } so a home without facet data keeps its est. figures */
  // opts.svg: the top-down drawing of the roof the 3D view draws (RealRoof.planSVG of the chosen model / clean house), used in
  // place of the raw LiDAR facet diagram so the report shows the same roof as the record, the proposal and the Today thumbnail
  function reportHTML(row, d, est, opts) {
    const soft = !!(row && !row.facets && row.est && d && d.geometry_ft);   // m 2: geometry drawn, figures stay estimates
    if (!row || (!row.facets && !soft)) {
      const e = est || {};
      return `<div class="rr-none"><b>Per-facet LiDAR report not on file for this home yet.</b><p>The roof below is the outline estimate: ${e.squares != null ? '~' + e.squares + ' sq (est.)' : 'no squares without an outline'}${e.pitch ? ', pitch est. ' + esc(e.pitch) : ''}${e.planes ? ', ' + e.planes + ' planes' : ''}. Estimated from public building outlines and 2018 LiDAR. Verify on site.</p></div>`;
    }
    const st = stories(row), mix = row.mix || null, conf = row.confidence || {};
    const waste = row.waste != null ? row.waste : 15, order = row.order != null ? row.order : Math.round(row.sq * (1 + waste / 100) * 10) / 10;
    const pitchLine = mix ? Object.keys(mix).sort((a, b) => mix[b] - mix[a]).map(k => `<span>${esc(k)} <i>${mix[k]}%</i></span>`).join('')
      : `<span>${row.pitch}/12 <i>main</i></span>${row.pitch2 ? `<span>${row.pitch2}/12 <i>secondary</i></span>` : ''}`;
    const kpis = `<div class="rr-kpis">
      <div><span>${soft ? 'Squares, est.' : 'Squares, LiDAR est.'}</span><b>${soft ? '~' : ''}${row.sq}</b><small>${row.area ? fmt(row.area) + ' sq ft of roof' : fmt(row.plan) + ' sq ft plan'}${row.range ? ', range ' + row.range[0] + ' to ' + row.range[1] : ''}</small></div>
      <div><span>Order with waste</span><b>${order}</b><small>${waste}% waste, hips and valleys</small></div>
      <div class="rr-pitch"><span>Pitch${shape(row) ? ', ' + shape(row) : ''}</span><b>${pitches(row).join(' + ') || row.pitch + '/12'}</b><small class="rr-mix">${pitchLine}</small></div>
      <div><span>Facets</span><b>${row.nFacets || '—'}</b><small>${row.nFacets ? (soft ? 'planes, est.' : 'planes measured') : 'count not on file'}</small></div>
      <div><span>Stories</span><b>${st ? st.n : '—'}</b><small title="${st ? esc(st.tip) : ''}">${st ? (st.sure ? 'from LiDAR roof height' : 'likely, low confidence') : 'not detected'}</small></div></div>`;
    const svg = opts && opts.svg ? opts.svg : d ? diagramSVG(d) : '';
    const diag = svg ? `<div class="rr-card"><h4>Top-down diagram <small>lengths in ft</small></h4>${svg}<div class="rr-leg">${legend()}</div></div>`
      : `<div class="rr-card rr-nodiag"><h4>Top-down diagram</h4><p>The facet drawing for this home has not been rendered yet. The lengths below are measured; the picture follows the next batch.</p></div>`;
    const E = [['Ridges', row.ridge, 'ridges_ft'], ['Hips', row.hip, 'hips_ft'], ['Valleys', row.valley, 'valleys_ft'], ['Eaves', row.eave, 'eaves_ft'], ['Rakes', row.rake, 'rakes_ft']];
    if (row.detail) E.push(['Step flashing', row.step, 'step_flashing_ft'], ['Wall flashing', row.wall, 'wall_flashing_ft']); else E.push(['Flashing', row.flashing, null]);
    const edges = `<div class="rr-card"><h4>Edge lengths</h4><table class="rr-t"><thead><tr><th>Edge</th><th class="n">Length</th><th>Confidence</th></tr></thead><tbody>${E.map(([a, v, k]) => `<tr><td>${a}</td><td class="n">${fmt(Math.round(v || 0))} ft</td><td>${k && conf[k] != null ? cbar(conf[k]) : cbar(row.conf)}</td></tr>`).join('')}</tbody></table></div>`;
    const drip = row.drip != null ? row.drip : Math.round((row.eave || 0) + (row.rake || 0)), starter = row.starter != null ? row.starter : drip, cap = row.ridgeCap != null ? row.ridgeCap : Math.round((row.ridge || 0) + (row.hip || 0));
    const mats = `<div class="rr-card"><h4>Materials</h4><table class="rr-t"><tbody>
      <tr><td>Drip edge <small>eaves + rakes</small></td><td class="n">${fmt(drip)} ft</td></tr>
      <tr><td>Starter <small>eaves + rakes${row.starterEaves != null ? ', eaves only ' + fmt(row.starterEaves) + ' ft' : ''}</small></td><td class="n">${fmt(starter)} ft</td></tr>
      <tr><td>Ridge cap <small>ridges + hips</small></td><td class="n">${fmt(cap)} ft</td></tr>
      <tr><td>Shingles <small>${waste}% waste</small></td><td class="n">${order} sq</td></tr></tbody></table></div>`;
    const risks = d && d.what_could_be_wrong ? d.what_could_be_wrong.slice(0, 3).map(r => `<li>${esc(r)}</li>`).join('') : '';
    const confBlock = `<div class="rr-card rr-conf"><h4>Confidence</h4><div class="rr-cg">
      <div><span>Squares</span>${cbar(conf.squares != null ? conf.squares : row.conf)}</div><div><span>Pitch</span>${cbar(conf.predominant_pitch != null ? conf.predominant_pitch : row.conf)}</div>
      <div><span>Facets</span>${cbar(conf.facets != null ? conf.facets : row.conf)}</div><div><span>Stories</span>${cbar(row.storyConf || null)}</div></div>
      ${soft ? '<p class="rr-low"><b>Lower confidence.</b> The roof planes are drawn from LiDAR, but the figures here are shown as estimates (est.).</p>' : ''}
      <p class="rr-verify"><b>Verify on site.</b> ${soft ? 'Estimated' : 'Measured'} from ${row.year} LiDAR roof returns and the building outline, not a field measurement. Order from these numbers only after the roof is walked.</p>${risks ? `<ul class="rr-risks">${risks}</ul>` : ''}</div>`;
    return `<div class="rr">${kpis}<div class="rr-grid">${diag}<div class="rr-side">${edges}${mats}</div></div>${confBlock}</div>`;
  }

  // ---------- styles shared by every page ----------
  const css = `
.rc-story{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:999px;background:#EAF0FF;color:#1F47C9;font:600 12px/1 'Inter',system-ui,sans-serif;letter-spacing:.01em;white-space:nowrap;vertical-align:middle;cursor:help}
.rc-story svg{flex:none}
.rc-story.soft{background:#F1F3F6;color:#465065}
.rc-story.sm{height:20px;padding:0 7px;font-size:11px}
.cvt b .rc-story{margin-left:8px;vertical-align:2px}
.tr.has-story{display:flex;gap:6px;align-items:center}
.p-story .rc-story{margin-left:2px}
.rr{display:flex;flex-direction:column;gap:12px;font-variant-numeric:tabular-nums}
.rr-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.rr-kpis>div{background:var(--panel-2,#F1F3F6);border-radius:14px;padding:10px 12px;min-width:0}
.rr-kpis span{display:block;font-size:11.5px;color:var(--muted,#465065)}
.rr-kpis b{display:block;font-size:24px;font-weight:600;letter-spacing:-.02em;line-height:1.1;margin:3px 0 2px}
.rr-kpis small{display:block;font-size:11.5px;color:var(--muted,#465065);line-height:1.35}
.rr-mix span{display:inline-block;margin-right:8px}.rr-mix i{font-style:normal;color:var(--ink,#0B1020);font-weight:600}
.rr-grid{display:grid;grid-template-columns:1fr;gap:12px;align-items:start}   /* the record's right column is about 500 px wide at 1440: the diagram takes the full width, the tables follow */
.rr-side{display:flex;flex-direction:column;gap:12px;min-width:0}
.rr-card{background:var(--panel,#fff);border:1px solid var(--hair-2,rgba(11,16,32,.08));border-radius:14px;padding:12px 14px;min-width:0}
.rr-card h4{margin:0 0 8px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#465065);font-weight:600}
.rr-card h4 small{text-transform:none;letter-spacing:0;font-weight:500;margin-left:6px}
.rr-diag{width:100%;height:auto;display:block;border-radius:10px;background:#FAFAF7}
.rr-el{font:600 11px Inter,system-ui,sans-serif;text-anchor:middle;paint-order:stroke;stroke:#fff;stroke-width:3px}
.rr-fl{font:700 12px Inter,system-ui,sans-serif;fill:#0E1B3D;text-anchor:middle;paint-order:stroke;stroke:#fff;stroke-width:3px}
.rr-leg{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:8px}
.rr-lg{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-2,#2A3246)}.rr-lg i{width:16px;height:4px;border-radius:2px;display:inline-block}
.rr-t{width:100%;border-collapse:collapse}.rr-t td,.rr-t th{padding:6px 4px;border-bottom:1px solid var(--rule,#E4E7EC);text-align:left;font-size:13px;vertical-align:middle}
.rr-t th{font-size:11.5px;color:var(--muted,#465065);font-weight:600}.rr-t tr:last-child td{border-bottom:0}.rr-t .n{text-align:right;white-space:nowrap;font-weight:600}
.rr-t td small{display:block;font-size:11px;color:var(--muted,#465065);font-weight:400}
.rr-cf{display:inline-block;width:56px;height:6px;border-radius:3px;background:#E4E7EC;vertical-align:middle;overflow:hidden}.rr-cf i{display:block;height:100%;background:var(--c)}
.rr-cn{font-size:11.5px;color:var(--muted,#465065);margin-left:6px}
.rr-cg{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.rr-cg>div{display:flex;flex-direction:column;gap:4px;font-size:12px}.rr-cg span{color:var(--muted,#465065)}
.rr-verify{margin:10px 0 0;font-size:12.5px;line-height:1.5;color:var(--ink-2,#2A3246)}
.rr-low{margin:10px 0 0;font-size:12.5px;line-height:1.5;color:#8A5A00;background:#FFF6E0;border-radius:8px;padding:8px 10px}
.rr-risks{margin:8px 0 0;padding-left:18px;font-size:12px;line-height:1.45;color:var(--muted,#465065)}.rr-risks li{margin:3px 0}
.rr-none{background:var(--panel-2,#F1F3F6);border-radius:14px;padding:14px 16px;font-size:13.5px;line-height:1.5}.rr-none b{display:block;margin-bottom:4px}.rr-none p{margin:0;color:var(--muted,#465065)}
.rr-nodiag p{margin:0;font-size:13px;color:var(--muted,#465065);line-height:1.5}
@media (max-width:640px){.rr-kpis{grid-template-columns:repeat(2,1fr)}.rr-kpis b{font-size:20px}.rr-cg{grid-template-columns:repeat(2,1fr)}.rr-card{padding:10px 12px}}`;
  const st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st);

  // Jack 10-23: the one line every screen puts by a squares figure (36-home Frisco answer key, tour/audit/roof-accuracy/answer-key/REPORT.md)
  const SQ_NOTE = 'LiDAR estimate, typically within about 10% of permit records; order a measurement report before you quote';   // Jack 10-23: the safer wording
  window.RCROOF = { SQ_NOTE, lookup, cached, detail, geom, stories, chip, eaveFt, diagramSVG, reportHTML, words, shape, pitches, EDGE_COLORS: EC };
})();
