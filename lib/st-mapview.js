// Storm map views (Jack 10-23): "Satellite | 3D houses", remembered per device (localStorage rc-mapview).
//  Satellite : a licensed aerial basemap (see BASEMAP below) with each house's measurement lines drawn flat on the photo:
//              lengths in ft. A measured model that passed the roof gates: every line (eaves, ridges, hips, valleys), solid.
//              Any other house: only its outline (eave) lengths, dashed, "~ ft" (no guessed ridges / hips / valleys)
//  3D houses : every house custom built from its own data (scripts/roofs/map_roofs.py -> st-data-dfw/roof3d): its squared
//              outline, its wall height from the LiDAR stories, a clean straight-skeleton hip roof at its LiDAR pitch, or
//              the measured model where it passed the gates. Walls stay the MapLibre 'fp' extrusion (picking, hover, hail
//              colour, selection as before); roofs are one deck mesh per ~1 km chunk, built once, never per frame.
// Loaded after lib/st-map.js and shares its globals (map, overlay, layers, fpFeature, fpPaint, refreshFp, fpSent, hail ...).
(function () {
  'use strict';
  if (typeof map === 'undefined' || !window.STH || !window.RCLINES) return;
  const KEY = 'rc-mapview', Qv = new URLSearchParams(location.search);
  let mode = Qv.get('view') === 'sat' || Qv.get('view') === '3d' ? Qv.get('view') : (() => { try { return localStorage.getItem(KEY) || '3d'; } catch (e) { return '3d'; } })();
  const DATA = window.rooferDataRoot ? rooferDataRoot() : 'lib/st-data-dfw/';
  const LINEZ = 16.2, LABELZ = 18.2;
  const FT = 3.28084, M_LAT = 110540, M_LON = lat => 111320 * Math.cos(lat * Math.PI / 180);

  // ---------- BASEMAP ----------
  // Esri World Imagery is the sharpest free option (Maxar Vivid, about 30 cm, fast tile cache) and commercial use is
  // allowed through an ArcGIS Location Platform API key (free tier: 2M basemap tiles a month; anonymous use in a paid app
  // is outside Esri's terms, docs/business/DATA-LICENSES.md). Key: ?esrikey=, localStorage rc-esri-key or
  // window.RC_MAP_KEYS.esri. With no key the map uses public-domain USDA NAIP from USGS The National Map (2024 refresh,
  // about 30 to 60 cm): no licence limits, slower to load (each close-in tile is rendered on request).
  const ESRI_KEY = Qv.get('esrikey') || (() => { try { return localStorage.getItem('rc-esri-key'); } catch (e) { return null; } })() || (window.RC_MAP_KEYS && RC_MAP_KEYS.esri) || '';
  // 10-26: the shared adapter (lib/rc-imagery.js) decides: a key = authenticated Esri; no key = keyless Esri in the local
  // build only (its KEYLESS flag is off in the public build, which then stays on NAIP)
  const ESRI_ON = !!ESRI_KEY || !!(window.RCIMG && RCIMG.esriOn());
  const BASEMAP = ESRI_ON ? {
    name: 'Esri World Imagery',
    credit: 'Powered by Esri. ' + (window.RCIMG ? RCIMG.ESRI_CREDIT : 'Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community'),
    sources: [{ id: 'sat-esri', tiles: [ESRI_KEY ? 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=' + encodeURIComponent(ESRI_KEY) : 'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19 }]
  } : {
    name: 'USDA NAIP',
    credit: 'Imagery: USDA NAIP via USGS The National Map (public domain)',
    sources: [
      { id: 'sat-lo', tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 16 },
      { id: 'sat-hi', tiles: ['naipr://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=jpg&interpolation=RSP_BilinearInterpolation&f=image'], tileSize: 512, minzoom: 15, maxzoom: 19 }]
  };

  // the NAIP image service renders each close-in tile on request (2 to 8 s) and answers 502 when pushed: tiles go through
  // a small queue (4 at a time) and a failed one is asked again up to 3 times before the coarser cached layer shows through
  if (!ESRI_ON && maplibregl.addProtocol) { let live = 0; const waitq = [];
    const slot = () => live < 4 ? (live++, Promise.resolve()) : new Promise(r => waitq.push(r)), done = () => { const n = waitq.shift(); if (n) n(); else live--; };
    maplibregl.addProtocol('naipr', async (params, ctl) => { await slot();
      try { for (let k = 0; k < 4; k++) { if (ctl.signal.aborted) throw new Error('aborted');
          try { const r = await fetch('https://' + params.url.slice(8), { signal: ctl.signal }); if (r.ok) return { data: await r.arrayBuffer() }; } catch (e) { if (ctl.signal.aborted) throw e; }
          await new Promise(r => setTimeout(r, 700 * (k + 1))); }
        throw new Error('NAIP tile failed');
      } finally { done(); } }); }

  // ---------- roof3d tiles ----------
  // records come from the shared per-home line source (lib/rc-lines.js, RCLINES): one decoder for the map and the record
  const R3 = window.R3 = { recs: RCLINES.recs, mode: () => mode };
  const isModel = h => !!(h.flags & 4) && RCLINES.passed(h);   // a measured model that passes the roof gates today
  function need(bb) { RCLINES.need(bb, arrived); }
  // homes already sent to the 'fp' source with their plain outline get re-sent with their own squared ring + wall height
  let arrT = null, arrQ = [];
  function arrived(recs) { arrQ = arrQ.concat(recs); if (arrT) return; arrT = setTimeout(() => { arrT = null; const q = arrQ; arrQ = [];
    q.forEach(h => fpSent.delete(h.i)); chunks.clear(); fpSync(); redraw(); syncLines(true); }, 120); }
  R3.ring = i => { const h = R3.recs.get(i); if (!h || h.ring.length < 3) return null; return h.ring.map(v => [h.ll[v * 2], h.ll[v * 2 + 1]]); };
  R3.of = i => R3.recs.get(i) || null;

  // ---------- st-map.js hooks (global function bindings, so its own calls pick these up) ----------
  const fpFeature0 = window.fpFeature, refreshFp0 = window.refreshFp, fpPaint0 = window.fpPaint, layers0 = window.layers;
  window.fpFeature = function (f) {
    const g = fpFeature0(f), h = R3.recs.get(f.i);
    if (h) { const r = R3.ring(f.i); if (r) g.geometry = { type: 'Polygon', coordinates: [r.concat([r[0]])] }; g.properties.eh = h.flags & 4 ? 0.3 : Math.round(h.eave / FT * 100) / 100; }   // a model mesh carries its own walls: its box stays a flat pick target
    return g;
  };
  window.refreshFp = function (force) { if (map.getZoom() >= FPZ) need(viewBBox()); return refreshFp0(force); };
  window.fpPaint = function () { fpPaint0(); if (!fpReady) return;
    if (mode === '3d') {   // real wall heights (hail shows as colour on the walls and roofs, not as a tower)
      map.setPaintProperty('fp', 'fill-extrusion-height', ['coalesce', ['get', 'eh'], ['+', 4.2, ['*', ['%', ['*', ['get', 'i'], 7], 5], 0.7]]]);
      const c = map.getPaintProperty('fp', 'fill-extrusion-color'); if (Array.isArray(c)) { const k = c.length - 1; if (c[k] === 'rgb(207,212,221)') { c[k] = WALL; map.setPaintProperty('fp', 'fill-extrusion-color', c); } else if (Array.isArray(c[k]) && c[k][c[k].length - 1] === 'rgb(207,212,221)') { c[k][c[k].length - 1] = WALL; map.setPaintProperty('fp', 'fill-extrusion-color', c); } }
    }
    paintFlat(); };
  // at house zoom the hail is colour on each house: the old hit columns (deck 'hit', drawn while outlines load) would stand
  // through the custom houses, so they stay off from FPZ in
  window.layers = function () { let L = layers0(); const z = map.getZoom(); if (z >= FPZ) L = L.filter(l => !/^hit/.test(l.id));
    if (mode === '3d' && z >= FPZ - 0.2) roofLayers().forEach(l => L.push(l)); return L; };
  const WALL = 'rgb(233,229,222)';

  // ---------- 3D roofs: one mesh per ~1 km chunk ----------
  const CH = 0.01, chunks = new Map();   // key -> {key, lon0, lat0, mesh, storm}
  const ROOF = [0.43, 0.46, 0.52], ROOF_M = [0.47, 0.42, 0.40];   // slate grey; measured models a touch warmer
  const WALL_F = [233 / 255, 229 / 255, 222 / 255];
  function stormKey() { return cur ? cur.iso : 'calm'; }
  function rgbOf(i) {
    const h = R3.recs.get(i); const base = h && isModel(h) ? ROOF_M : ROOF;
    if (hail && hail[i] >= 100) { const c = ramp(hail[i] / 100); return [c[0] / 255 * 0.92, c[1] / 255 * 0.92, c[2] / 255 * 0.92]; }
    return base;
  }
  function buildChunk(key, homes) {
    const [cx, cy] = key.split('_').map(Number), lon0 = (cx + 0.5) * CH, lat0 = (cy + 0.5) * CH, kx = M_LON(lat0);
    let nt = 0; homes.forEach(h => { nt += h.tri.length / 3; });
    const P = new Float32Array(nt * 9), N = new Float32Array(nt * 9), C = new Float32Array(nt * 9); let o = 0;
    homes.forEach(h => { const col = rgbOf(h.i), T = h.tri;
      for (let t = 0; t < T.length; t += 3) {
        const v = [T[t], T[t + 1], T[t + 2]].map(j => [(h.ll[j * 2] - lon0) * kx, (h.ll[j * 2 + 1] - lat0) * M_LAT, h.z[j] / FT]);
        const ux = v[1][0] - v[0][0], uy = v[1][1] - v[0][1], uz = v[1][2] - v[0][2], wx = v[2][0] - v[0][0], wy = v[2][1] - v[0][1], wz = v[2][2] - v[0][2];
        let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
        if (nz < -0.05) { nx = -nx; ny = -ny; nz = -nz; }   // roof planes face up; wall faces of the measured models stay sideways
        const wallF = nz < 0.2, cc = wallF ? WALL_F : col;
        // baked sun from the south-west so the hip planes read apart even under flat light
        const sh = 0.78 + 0.22 * Math.max(-1, Math.min(1, -0.55 * nx - 0.45 * ny + 0.7 * nz));
        for (let q = 0; q < 3; q++) { P[o] = v[q][0]; P[o + 1] = v[q][1]; P[o + 2] = v[q][2]; N[o] = nx; N[o + 1] = ny; N[o + 2] = nz; C[o] = cc[0] * sh; C[o + 1] = cc[1] * sh; C[o + 2] = cc[2] * sh; o += 3; }
      } });
    return { key, lon0, lat0, storm: stormKey(), mesh: { positions: { value: P, size: 3 }, normals: { value: N, size: 3 }, colors: { value: C, size: 3 } } };
  }
  function roofLayers() {
    const bb = viewBBox(), out = [], sk = stormKey();
    const byChunk = new Map();
    R3.recs.forEach(h => { const x = h.ll[0], y = h.ll[1]; if (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3]) return;
      const k = Math.floor(x / CH) + '_' + Math.floor(y / CH); if (!chunks.has(k) || chunks.get(k).storm !== sk) (byChunk.get(k) || byChunk.set(k, []).get(k)).push(h); });
    // only the chunks missing (or built for another storm) are gathered; each chunk takes every loaded home inside it
    byChunk.forEach((_, k) => { const [cx, cy] = k.split('_').map(Number), a = [cx * CH, cy * CH, (cx + 1) * CH, (cy + 1) * CH], hs = [];
      R3.recs.forEach(h => { const x = h.ll[0], y = h.ll[1]; if (x >= a[0] && x < a[2] && y >= a[1] && y < a[3]) hs.push(h); });
      chunks.set(k, buildChunk(k, hs)); });
    if (chunks.size > 80) [...chunks.keys()].slice(0, chunks.size - 80).forEach(k => chunks.delete(k));
    chunks.forEach(c => { const x0 = c.lon0 - CH / 2, y0 = c.lat0 - CH / 2; if (x0 > bb[2] || x0 + CH < bb[0] || y0 > bb[3] || y0 + CH < bb[1]) return;
      out.push(new deck.SimpleMeshLayer({ id: 'roof-' + c.key + '-' + c.storm, beforeId: labelId, data: [0], mesh: c.mesh, getPosition: () => [c.lon0, c.lat0, 0], getColor: [255, 255, 255],
        sizeScale: 1, pickable: false, opacity: fade, material: { ambient: 0.6, diffuse: 0.45, shininess: 6, specularColor: [40, 40, 40] } })); });
    return out;
  }

  // ---------- Satellite: imagery + flat measurement lines ----------
  const LINE_C = ['#FFD84D', '#FF5B4F', '#45D0FF', '#7DFF8A', '#FFA040', '#D8DCE4'];
  const NAME = ['Eave', 'Ridge', 'Hip', 'Valley', 'Rake', 'Wall'];
  let baseIds = null, symPaint = {}, linesShown = '';
  function addSat() {
    if (map.getSource(BASEMAP.sources[0].id)) return;
    const first = map.getStyle().layers.find(l => l.type !== 'background');
    BASEMAP.sources.forEach((s, k) => { map.addSource(s.id, { type: 'raster', tiles: s.tiles, tileSize: s.tileSize, maxzoom: s.maxzoom, minzoom: s.minzoom || 0, attribution: k === 0 ? BASEMAP.credit : '' });
      map.addLayer({ id: s.id, type: 'raster', source: s.id, minzoom: s.minzoom || 0, layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 150, 'raster-contrast': 0.06, 'raster-saturation': -0.05 } }, first && first.id); });
    map.addSource('r3-lines', { type: 'geojson', data: EMPTY, tolerance: 0 });
    map.addLayer({ id: 'r3-flat', type: 'fill', source: 'fp', minzoom: FPZ, layout: { visibility: 'none' }, paint: { 'fill-color': 'rgba(0,0,0,0)', 'fill-opacity': 1 } }, labelId);
    map.addLayer({ id: 'r3-line-m', type: 'line', source: 'r3-lines', minzoom: LINEZ, filter: ['==', ['get', 'm'], 1], layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['match', ['get', 't'], 0, LINE_C[0], 1, LINE_C[1], 2, LINE_C[2], 3, LINE_C[3], 4, LINE_C[4], LINE_C[5]], 'line-width': ['interpolate', ['linear'], ['zoom'], 16, 1.3, 19, 2.6] } }, labelId);
    map.addLayer({ id: 'r3-line-e', type: 'line', source: 'r3-lines', minzoom: LINEZ, filter: ['==', ['get', 'm'], 0], layout: { visibility: 'none', 'line-cap': 'butt', 'line-join': 'round' },
      paint: { 'line-color': ['match', ['get', 't'], 0, LINE_C[0], 1, LINE_C[1], 2, LINE_C[2], 3, LINE_C[3], 4, LINE_C[4], LINE_C[5]], 'line-width': ['interpolate', ['linear'], ['zoom'], 16, 1.1, 19, 2.2], 'line-dasharray': [3, 1.6] } }, labelId);
    map.addLayer({ id: 'r3-len', type: 'symbol', source: 'r3-lines', minzoom: LABELZ, filter: ['>=', ['get', 'L'], 6], layout: { visibility: 'none', 'symbol-placement': 'line-center', 'text-field': ['get', 's'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 18, 10, 20, 12.5], 'text-font': ['Noto Sans Regular'], 'text-allow-overlap': false, 'text-padding': 1, 'text-keep-upright': true },
      paint: { 'text-color': '#FFFFFF', 'text-halo-color': 'rgba(8,12,24,0.9)', 'text-halo-width': 1.4 } });
    // the flat house outline: the click / hover target in Satellite (feature state shared with the 'fp' layer)
    let hov = -1; const setHov = id => { if (hov === id) return; if (hov >= 0) map.setFeatureState({ source: 'fp', id: hov }, { hov: false }); hov = id; if (id >= 0) map.setFeatureState({ source: 'fp', id }, { hov: true }); };
    map.on('mousemove', 'r3-flat', e => { if (mode !== 'sat') return; const f = e.features && e.features[0]; if (!f) return; setHov(f.id); hover(f.id, { x: e.point.x, y: e.point.y }); map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'r3-flat', () => { if (mode !== 'sat') return; setHov(-1); hover(-1); map.getCanvas().style.cursor = ''; });
    map.on('click', 'r3-flat', e => { if (mode !== 'sat') return; const f = e.features && e.features[0]; if (f) selectHome(f.id, true); });
    baseIds = map.getStyle().layers.filter(l => l.type !== 'symbol' && l.type !== 'background' && l.source === 'openmaptiles').map(l => l.id);
  }
  function paintFlat() {
    if (!map.getLayer('r3-flat')) return;
    map.setPaintProperty('r3-flat', 'fill-color', ['case', ['boolean', ['feature-state', 'sel'], false], 'rgba(255,255,255,0.22)', ['boolean', ['feature-state', 'hov'], false], 'rgba(69,208,255,0.22)',
      ['>=', ['coalesce', ['feature-state', 'h'], 0], 1], 'rgba(39,87,230,0.28)', 'rgba(0,0,0,0)']);
  }
  function lineData() {
    if (map.getZoom() < LINEZ) return EMPTY;
    const bb = viewBBox(), c = map.getCenter(), F = [], hs = [];
    R3.recs.forEach(h => { const x = h.ll[0], y = h.ll[1]; if (x >= bb[0] && x <= bb[2] && y >= bb[1] && y <= bb[3]) hs.push(h); });
    if (hs.length > 3500) { const k = Math.cos(c.lat * Math.PI / 180); hs.sort((a, b) => ((a.ll[0] - c.lng) * k) ** 2 + (a.ll[1] - c.lat) ** 2 - ((b.ll[0] - c.lng) * k) ** 2 - (b.ll[1] - c.lat) ** 2); hs.length = 3500; }
    // honesty rule (Jack 10-22): ridges, hips and valleys only where a measured model passed; an estimate shows only its
    // outline (eave) lengths, dashed, "~ ft"
    hs.forEach(h => { const m = isModel(h) ? 1 : 0, kx = M_LON(h.ll[1]) * FT, ky = M_LAT * FT;
      h.lines.forEach(([a, b, t]) => { if (t === 5 || (!m && t !== 0)) return;
        const dx = (h.ll[b * 2] - h.ll[a * 2]) * kx, dy = (h.ll[b * 2 + 1] - h.ll[a * 2 + 1]) * ky, dz = h.z[b] - h.z[a], L = Math.hypot(dx, dy, dz);
        if (L < 1.5) return;
        F.push({ type: 'Feature', properties: { t, m, L: Math.round(L), s: (m ? '' : '~') + Math.round(L) + ' ft' }, geometry: { type: 'LineString', coordinates: [[h.ll[a * 2], h.ll[a * 2 + 1]], [h.ll[b * 2], h.ll[b * 2 + 1]]] } }); }); });
    return { type: 'FeatureCollection', features: F };
  }
  let lineT = null;
  // roof lines are off in Satellite (10-26 round 2): kept so they can come back once they line up with the photo
  function syncLines(force) { if (true || mode !== 'sat' || !map.getSource('r3-lines')) return; clearTimeout(lineT); lineT = setTimeout(() => {
    const z = map.getZoom(), b = map.getBounds(), sig = force ? Math.random() : [z.toFixed(1), b.getWest().toFixed(4), b.getSouth().toFixed(4), R3.recs.size].join();
    if (sig === linesShown) return; linesShown = sig; map.getSource('r3-lines').setData(lineData()); }, force ? 0 : 60); }

  // ---------- switching ----------
  function apply(first) {
    if (!map.getLayer('fp')) return;
    addSat();
    const sat = mode === 'sat';
    document.body.classList.toggle('view-sat', sat); document.body.classList.toggle('view-3d', !sat);
    BASEMAP.sources.forEach(s => map.setLayoutProperty(s.id, 'visibility', sat ? 'visible' : 'none'));
    (baseIds || []).forEach(id => { try { map.setLayoutProperty(id, 'visibility', sat ? 'none' : 'visible'); } catch (e) {} });
    map.getStyle().layers.forEach(l => { if (l.type !== 'symbol' || /^r3-/.test(l.id)) return; try {
      if (!symPaint[l.id]) symPaint[l.id] = { c: map.getPaintProperty(l.id, 'text-color'), h: map.getPaintProperty(l.id, 'text-halo-color'), o: map.getPaintProperty(l.id, 'text-opacity') };
      const p = symPaint[l.id]; map.setPaintProperty(l.id, 'text-color', sat ? '#F4F6FA' : p.c); map.setPaintProperty(l.id, 'text-halo-color', sat ? 'rgba(10,14,26,0.85)' : p.h); map.setPaintProperty(l.id, 'text-opacity', sat ? 0.95 : p.o);
    } catch (e) {} });
    map.setLayoutProperty('fp', 'visibility', sat ? 'none' : 'visible');
    // Jack 10-26 round 2: the drawn roof lines sat a few feet off the photo, so Satellite is the clean photo; the roof shapes live in 3D
    map.setLayoutProperty('r3-flat', 'visibility', sat ? 'visible' : 'none');
    ['r3-line-m', 'r3-line-e', 'r3-len'].forEach(id => map.setLayoutProperty(id, 'visibility', 'none'));
    ['den'].forEach(id => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', sat ? 'none' : 'visible'); });
    paintSeg(); paintLegend(); fpPaint(); redraw(); zhintWord = ''; zoomHint();
    // (no line data is built in Satellite any more: syncLines is not called)
    if (!first) { if (sat && map.getPitch() > 5) map.easeTo({ pitch: 0, duration: 500, easing: EASE }); else if (!sat && map.getPitch() < 10) map.easeTo({ pitch: MOB ? 45 : 50, duration: 500, easing: EASE }); }
  }
  function set(v) { if (v === mode) return; mode = v; try { localStorage.setItem(KEY, v); } catch (e) {} apply(false); }
  R3.set = set;

  // ---------- the toggle ----------
  const css = document.createElement('style');
  css.textContent = `
  .viewseg{display:flex;gap:2px;padding:2px;border-radius:999px;background:var(--panel-2);border:1px solid var(--hair)}
  .viewseg button{border:0;background:none;min-height:30px;padding:0 12px;border-radius:999px;font-weight:600;font-size:12.5px;color:var(--muted);cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;transition:background .2s ease,color .2s ease}
  .viewseg button svg{width:14px;height:14px}
  .viewseg button.on{background:var(--paper);color:#fff}
  .viewseg button:not(.on):hover{color:var(--paper)}
  .r3leg{position:fixed;right:24px;bottom:182px;z-index:5;display:none;padding:9px 12px;border-radius:14px;font-size:11.5px;line-height:1.35;color:var(--paper);max-width:330px}
  body.view-sat .r3leg,body.view-3d.r3z .r3leg{display:block}
  body.sel .r3leg{display:none!important}
  body.sel .viewseg:not(.mob) button{font-size:0;gap:0;padding:0 9px}
  .r3leg .k{display:flex;flex-wrap:wrap;gap:4px 12px;margin-bottom:4px}
  .r3leg .k span{display:inline-flex;align-items:center;gap:5px;font-weight:600}
  .r3leg .k i{display:inline-block;width:16px;height:3px;border-radius:2px}
  .r3leg small{display:block;color:var(--muted);font-size:10.5px}
  @media (max-width:599px){
    .viewseg.mob{position:fixed;top:calc(env(safe-area-inset-top,0px) + 118px);right:14px;z-index:6;box-shadow:0 6px 18px rgba(11,16,32,.16)}
    .viewseg.mob button{min-height:36px;padding:0 11px;font-size:12px}
    body.sheet-open .viewseg.mob{display:none}
    .r3leg{left:14px;right:72px;bottom:auto;top:calc(env(safe-area-inset-top,0px) + 162px);max-width:none;padding:7px 10px;font-size:10.5px}
    .r3leg .k{gap:3px 9px}
    body.sheet-open .r3leg{display:none}
  }`;
  document.head.appendChild(css);
  const seg = document.createElement('div'); seg.className = 'viewseg glass' + (MOB ? ' mob' : ''); seg.id = 'viewseg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Map view');
  seg.innerHTML = `<button data-v="sat" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 15l5-4 4 3 3-2 5 4"/></svg>Satellite</button><button data-v="3d" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 11 12 4l9 7"/><path d="M5.5 9.5V20h13V9.5"/></svg>3D houses</button>`;
  const nav = document.getElementById('nav');
  if (MOB || !nav) document.body.appendChild(seg); else nav.insertBefore(seg, nav.firstChild);
  seg.addEventListener('click', e => { const b = e.target.closest('button'); if (b) set(b.dataset.v); });
  function paintSeg() { seg.querySelectorAll('button').forEach(b => { const on = b.dataset.v === mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); }
  const leg = document.createElement('div'); leg.className = 'r3leg glass'; leg.id = 'r3leg'; document.body.appendChild(leg);
  function paintLegend() {
    const z = map.getZoom(); document.body.classList.toggle('r3z', z >= FPZ);
    const key = (items) => `<div class="k">${items.map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('')}</div>`;
    if (mode === '3d') { leg.innerHTML = key([['rgb(110,117,133)', 'Roof estimate'], ['rgb(120,107,102)', 'Measured model']]) + (MOB
      ? `<small>Own outline, LiDAR height and pitch per house.</small>`
      : `<small>Every house is its own outline, wall height from the LiDAR stories and a clean hip roof at its LiDAR pitch. Brown roofs are measured models that passed the roof checks.</small>`); return; }
    leg.innerHTML = `<small>${MOB ? 'Tap a house to open it. ' : 'The aerial photo. Click a house to open it; 3D houses shows each roof shape. '}${RC.esc(MOB && BASEMAP.name !== 'USDA NAIP' ? 'Powered by Esri, Maxar' : BASEMAP.credit)}</small>`;
  }
  R3.basemap = () => ({ name: BASEMAP.name, credit: BASEMAP.credit, key: !!ESRI_KEY });
  R3.stats = () => { let model = 0, pm = 0; R3.recs.forEach(h => { if (isModel(h)) model++; if (h.flags & 1) pm++; }); return { loaded: R3.recs.size, model, pitchMeasured: pm, chunks: chunks.size }; };

  // the hover tip says what the drawn roof is: measured, or which parts are estimates
  R3.roofLine = i => { const h = R3.recs.get(i); if (!h) return '';
    if (isModel(h)) return 'Roof: measured model (LiDAR, passed the roof checks)';
    return `Roof shape est. (hip) · pitch ${h.rise}/12 ${h.flags & 1 ? 'LiDAR' : 'assumed'} · ${h.eave >= 15 ? '2-story' : '1-story'}${h.flags & 2 ? '' : ' est.'}`; };
  const hover0 = window.hover;
  window.hover = function (i, info) { hover0(i, info); if (i < 0 || MOB) return; let e = document.getElementById('t-r3');
    if (!e) { e = document.createElement('em'); e.id = 't-r3'; e.style.cssText = 'display:block;font-style:normal;opacity:.75;font-size:11px;margin-top:2px'; tip.appendChild(e); }
    e.textContent = map.getZoom() >= FPZ ? R3.roofLine(i) : ''; };
  const zoomHint0 = window.zoomHint;
  window.zoomHint = function () { const z = map.getZoom(); if (z < FPZ) return zoomHint0();
    const w = mode === 'sat' ? 'Satellite' : 'Custom roofs'; if (w === zhintWord) return; zhintWord = w; document.getElementById('zhint').textContent = w; };
  const start = () => { apply(true); map.on('moveend', () => { syncLines(false); paintLegend(); }); };
  if (map.getLayer && map.getLayer('fp')) start(); else map.on('load', () => setTimeout(start, 0));
  paintSeg();
})();
