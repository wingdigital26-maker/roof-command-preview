/* Storms: where storms hit hardest. Loaded after lib/st-map.js and uses its globals (map, STH, ST, STM, cur, hail, openList,
   flyBounds, labelId, MOB, setSheet, paintStat).
   The areas are neighbourhoods: the county roll's subdivisions with their phase / section suffix dropped ("Rockwall Lake
   Est #1" and "#2" are one area), per city, from meta/<region>/places.json row ranges (homes are stored city > ZIP >
   subdivision > street, so a subdivision is a few index ranges). Per area, from the app's per-home radar hail
   (meta/hail/<region>/<date>.bin): homes at 1 in or larger (residential only), the largest hail, the storm dates.
   Ranked by hail-weighted homes (each hit home counts its largest hail in inches), so a big area of 1.1 in and a smaller
   one of 2.3 in both rank. Nothing estimated.
   Two readings of the same ranking (Jack 10-17: show more of the hard-hit sections, for the working storm):
   - calm (no storm picked): every storm dated within 6 months of the newest one, the top 10 areas listed on the calm card
     and glowing blue on the map (a heatmap);
   - a storm picked: that storm's own hail, its top 8 areas (all of them when it hit fewer) outlined on the map with a
     numbered label each, listed on the "Hardest hit" panel. Pick one to fly there and list its homes. */
(function () {
  const TOP = 10, TOP_STORM = 8, MONTHS = 6;
  const fmt = n => Number(n).toLocaleString('en-US'), esc = s => RC.esc(s);
  const css = document.createElement('style');
  css.textContent = `
.hard{margin-top:16px;padding-top:14px;border-top:1px solid var(--hair)}
.hard .hh1{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.hard .hh1 b{font-weight:600;font-size:14px;letter-spacing:-.01em}
.hard .hh1 span{font-family:var(--c-mono,monospace);font-size:11px;color:var(--muted);white-space:nowrap}
.hard .hh2{font-size:12px;color:var(--muted);margin:3px 0 8px;line-height:1.4}
.hard ol{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.hard li button{display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:8px;align-items:center;width:100%;text-align:left;border:1px solid var(--hair);border-radius:6px;background:#fff;padding:7px 9px;cursor:pointer;min-height:44px;transition:border-color .12s ease,background .12s ease}
.hard li button:hover,.hard li button.on{border-color:rgba(39,87,230,.45);background:#F3F6FE;box-shadow:0 0 0 3px rgba(39,87,230,.10),0 0 18px -4px rgba(39,87,230,.45)}
.hard .rk{font-family:var(--c-mono,monospace);font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}
.hard .nm{min-width:0}.hard .nm b{display:block;font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hard .nm span{display:block;font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hard .nm span i{font-style:normal;font-family:var(--c-mono,monospace);font-size:11px}
.hard .fx{text-align:right;font-family:var(--c-mono,monospace);font-variant-numeric:tabular-nums;white-space:nowrap}
.hard .fx b{display:block;font-weight:600;font-size:13px;color:#1F47C9}
.hard .fx span{display:block;font-size:11px;color:var(--muted)}
.hard .wait{font-size:12.5px;color:var(--muted)}
.hh .hard li button{min-height:40px;padding:5px 8px}
@media (min-width:601px){ body:not(.storm) .stat{max-height:calc(100vh - 22px - 236px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}
  #hh.glass{max-height:calc(100vh - 68px - 132px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin} }   /* ends above the Nimbus row (orb + its line, bottom right) */`;
  document.head.appendChild(css);
  const calm = document.querySelector('.stat .calm'); if (!calm) return;
  const box = document.createElement('div'); box.className = 'hard'; box.id = 'hard';
  box.innerHTML = '<div class="hh1"><b>Hit hardest, past 6 months</b></div><p class="wait">Reading every home\'s radar hail</p>';
  const d50 = document.getElementById('c-d50'); (d50 || calm.firstChild).after(box);
  // the storm reading: a list under the "Hardest hit in view" panel's buttons
  const hh = document.getElementById('hh');
  const sbox = document.createElement('div'); sbox.className = 'hard'; sbox.id = 'hard-storm'; sbox.hidden = true;
  if (hh) hh.appendChild(sbox);
  // "Rockwall Lake Est #2" -> "Rockwall Lake Est"; "Richardson Heights 5" -> "Richardson Heights"; "Auburn Springs Phase Three" -> "Auburn Springs"
  const SUF = /\s*(#\s*\d+[a-z]?|\b(phase|ph|sec|section|unit|no|blk|block)\.?\s*[\w-]+|\b\d+[a-z]?|\b[ivx]+|\b[a-z]|\b(first|second|third|fourth|fifth|sixth)(\s+(installment|section|phase|filing))?|\b(one|two|three|four|five|six|seven|eight|nine|ten))\s*$/i;
  const base = s => { let t = s; for (let k = 0; k < 4; k++) t = t.replace(/[\s,&-]+$/, '').replace(SUF, '').replace(/[\s,&-]+$/, ''); return t || s; };
  const day = iso => { const d = new Date(iso + 'T12:00:00Z'); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) + (iso.slice(0, 4) !== String(new Date().getUTCFullYear()) ? ', ' + iso.slice(0, 4) : ''); };
  let AREAS = [], picked = -1, glowAll = null;          // calm reading
  let SAREAS = [], spicked = -1, sIso = null;            // storm reading (the picked storm)
  const EMPTY = { type: 'FeatureCollection', features: [] };

  // ---------- the neighbourhoods, once: [{name, city, zips, ranges}] ----------
  let groupsP = null;
  function groups() {
    if (groupsP) return groupsP;
    return groupsP = Promise.all(STH.regions.map(r => STM.places(r).then(p => [r, p]))).then(places => {
      const G = new Map();
      places.forEach(([r, p]) => { if (!p || !p.cities) return;
        Object.entries(p.cities).forEach(([city, cv]) => Object.entries(cv.zips || {}).forEach(([zip, zv]) => Object.entries(zv.subdivs || {}).forEach(([sd, a]) => {
          const k = base(sd) + '|' + city; let g = G.get(k); if (!g) G.set(k, g = { name: base(sd), city, zips: new Set(), ranges: [] });
          if (zip) g.zips.add(zip); g.ranges.push([r.offset + a[0], a[1]]); }))); });
      return [...G.values()];
    });
  }
  // rank every neighbourhood over a set of storms' hail arrays (one per storm in `win`); only areas with a hit home come back
  function rank(G, hails, win) {
    const ty = STH.type, out = [];
    G.forEach(g => { let hit = 0, sev = 0, mx = 0, homes = 0; const dates = new Set(), idx = [];
      g.ranges.forEach(([a, n]) => { for (let i = a; i < a + n; i++) { if ((ty[i] & 127) > 4) continue; homes++; let m = 0;
        for (let s = 0; s < hails.length; s++) { const h = hails[s][i]; if (h > m) m = h; if (h >= 100) dates.add(win[s].iso); }
        if (m >= 100) { hit++; sev += m / 100; idx.push(i); if (m > mx) mx = m; } } });
      if (hit) out.push({ name: g.name, city: g.city, zips: [...g.zips].sort(), hit, homes, sev, max: mx / 100, dates: [...dates].sort().reverse(), idx }); });
    out.sort((a, b) => b.sev - a.sev || b.hit - a.hit);
    return out;
  }
  function compute() {
    return ST.ready.then(() => {
      const all = (ST.all || ST.storms).slice().sort((a, b) => a.t - b.t), newest = all[all.length - 1]; if (!newest) return null;
      const d0 = new Date(newest.t); d0.setUTCMonth(d0.getUTCMonth() - MONTHS); const t0 = d0.getTime();
      const win = all.filter(s => s.t >= t0);
      return Promise.all([Promise.all(win.map(s => STH.hailFor(s))), groups()]).then(([hails, G]) => {
        const out = rank(G, hails, win);
        return { win, from: t0, newest, areas: out.slice(0, TOP), all: out.length };
      });
    });
  }
  // one storm's own ranking, kept per storm (about 10 ms of main thread the first time)
  const PER = new Map();
  function stormAreas(s) {
    if (PER.has(s.iso)) return PER.get(s.iso);
    const p = Promise.all([STH.hailFor(s), groups()]).then(([h, G]) => { const out = rank(G, [h], [s]); return { areas: out.slice(0, TOP_STORM), all: out.length, hitHomes: out.reduce((a, x) => a + x.hit, 0) }; });
    PER.set(s.iso, p); return p;
  }
  function paint(R) {
    if (!R) { box.innerHTML = '<div class="hh1"><b>Hit hardest, past 6 months</b></div><p class="wait">No storm on file.</p>'; return; }
    AREAS = R.areas;
    const from = new Date(R.from).toISOString().slice(0, 10);
    box.innerHTML = `<div class="hh1"><b>Hit hardest</b><span>${esc(day(from))} to ${esc(day(R.newest.iso))}</span></div>
      <p class="hh2">${R.areas.length ? `The past 6 months up to the newest storm: neighborhoods with 1 in+ radar hail from ${R.win.length} storm${R.win.length === 1 ? '' : 's'}, ranked by homes hit and hail size. They glow blue on the map. Pick one to fly there and list its homes.` : 'No neighborhood took 1 inch hail in these 6 months.'}</p>
      <ol>${rows(R.areas, true)}</ol>`;
    window.__hardAreas = R.areas.map(a => ({ name: a.name, city: a.city, zips: a.zips, hit: a.hit, homes: a.homes, max: a.max, dates: a.dates }));
    glowAll = { type: 'FeatureCollection', features: [] };
    R.areas.forEach(a => a.idx.forEach(i => glowAll.features.push({ type: 'Feature', properties: { i, w: 0.5 }, geometry: { type: 'Point', coordinates: [STH.lon(i), STH.lat(i)] } })));
    weigh(R);
    layers();
    frameAreas(R.areas);
  }
  // the opening view shows the hail (10-19): once the areas are known, frame the hardest-hit ones (the outliers of each
  // area dropped) unless the roofer already moved the map, picked a storm or opened a list
  let userMoved = false;
  map.on('movestart', e => { if (e && e.originalEvent) userMoved = true; });
  function frameAreas(areas) {
    if (userMoved || cur || picked >= 0 || !areas || !areas.length) return;
    const top = areas.slice(0, 5), xs = [], ys = [];
    top.forEach(a => { const ax = a.idx.map(i => STH.lon(i)).sort((p, q) => p - q), ay = a.idx.map(i => STH.lat(i)).sort((p, q) => p - q), m = ax.length;
      const lo = Math.floor(m * 0.05), hi = Math.max(lo, Math.ceil(m * 0.95) - 1); xs.push(ax[lo], ax[hi]); ys.push(ay[lo], ay[hi]); });
    const bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], w = bb[2] - bb[0], h = bb[3] - bb[1];
    const pad = MOB ? { top: 150, bottom: 260, left: 30, right: 30 } : { top: 150, bottom: 200, left: 400, right: 110 };
    try { map.fitBounds([[bb[0] - w * 0.04, bb[1] - h * 0.04], [bb[2] + w * 0.04, bb[3] + h * 0.04]], { padding: pad, maxZoom: 13.2, duration: 1400, easing: EASE }); } catch (e) { }
  }
  const rows = (areas, withDates) => areas.map((a, k) => `<li><button type="button" data-k="${k}" aria-label="${esc(a.name)}, ${esc(a.city)}: ${fmt(a.hit)} homes hit, largest hail ${a.max.toFixed(2)} in. Fly there and list its homes"><span class="rk">${k + 1}</span>
        <span class="nm"><b>${esc(a.name)}</b><span>${esc(a.city)} <i>${esc(a.zips.join(', '))}</i>${withDates ? ` · <i>${esc(a.dates.map(day).join(', '))}</i>` : ''}</span></span>
        <span class="fx"><b>${a.max.toFixed(2)} in</b><span>${fmt(a.hit)} homes</span></span></button></li>`).join('');
  function paintStorm(s, R) {
    SAREAS = R.areas; spicked = -1; sbox.hidden = false;
    sbox.innerHTML = `<div class="hh1"><b>Hit hardest, ${esc(day(s.iso))}</b><span>${R.all} neighborhood${R.all === 1 ? '' : 's'}</span></div>
      <p class="hh2">${R.areas.length ? `${R.all} neighborhood${R.all === 1 ? '' : 's'} took 1 in+ radar hail in this storm${R.all > R.areas.length ? `; the ${R.areas.length} hit hardest are outlined on the map` : `, outlined on the map`}, ranked by homes hit and hail size. Pick one to fly there and list its homes.` : 'No neighborhood took 1 inch hail in this storm.'}</p>
      <ol>${rows(R.areas, false)}</ol>`;
    window.__hardStorm = { iso: s.iso, all: R.all, areas: R.areas.map(a => ({ name: a.name, city: a.city, zips: a.zips, hit: a.hit, homes: a.homes, max: a.max })) };
  }
  function weigh(R) { Promise.all(R.win.map(s => STH.hailFor(s))).then(hs => { glowAll.features.forEach(f => { let m = 0; hs.forEach(h => { if (h[f.properties.i] > m) m = h[f.properties.i]; }); f.properties.w = Math.min(1, 0.45 + (m / 100 - 1) * 0.45); }); syncGlow(); }); }

  // ---------- the sections on the map: an outline (hull of the area's hit homes, far outliers dropped) and a label ----------
  // hull: Andrew's monotone chain over the points inside the 2nd to 98th percentile box of the area's hit homes
  function hull(idx) {
    const xs = idx.map(i => STH.lon(i)).sort((a, b) => a - b), ys = idx.map(i => STH.lat(i)).sort((a, b) => a - b), m = idx.length;
    const lo = Math.floor(m * 0.02), hi = Math.max(lo, Math.ceil(m * 0.98) - 1), x0 = xs[lo], x1 = xs[hi], y0 = ys[lo], y1 = ys[hi];
    let P = []; idx.forEach(i => { const x = STH.lon(i), y = STH.lat(i); if (x >= x0 && x <= x1 && y >= y0 && y <= y1) P.push([x, y]); });
    if (P.length < 3) P = idx.map(i => [STH.lon(i), STH.lat(i)]);
    if (P.length < 3) { const [x, y] = P[0] || [0, 0], d = 0.0006; return { ring: [[x - d, y - d], [x + d, y - d], [x + d, y + d], [x - d, y + d], [x - d, y - d]], c: [x, y] }; }
    P.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const L = []; for (const p of P) { while (L.length >= 2 && cross(L[L.length - 2], L[L.length - 1], p) <= 0) L.pop(); L.push(p); }
    const U = []; for (let k = P.length - 1; k >= 0; k--) { const p = P[k]; while (U.length >= 2 && cross(U[U.length - 2], U[U.length - 1], p) <= 0) U.pop(); U.push(p); }
    const ring = L.slice(0, -1).concat(U.slice(0, -1)); ring.push(ring[0]);
    // a touch of padding so the line clears the house outlines (about 35 m)
    let cx = 0, cy = 0; ring.slice(0, -1).forEach(p => { cx += p[0]; cy += p[1]; }); cx /= ring.length - 1; cy /= ring.length - 1;
    const kx = 0.00038 / Math.max(0.2, Math.cos(cy * Math.PI / 180)), ky = 0.00032;
    const pad = ring.map(p => { const dx = p[0] - cx, dy = p[1] - cy, d = Math.hypot(dx / kx, dy / ky) || 1; return [p[0] + dx / d * kx, p[1] + dy / d * ky]; });
    return { ring: pad, c: [cx, cy] };
  }
  let markers = [];
  function sections(areas, pickedK) {
    const src = ready && map.getSource('hard-sec'); if (!src) return;
    markers.forEach(m => m.remove()); markers = [];
    if (!areas.length) { src.setData(EMPTY); return; }
    const fc = { type: 'FeatureCollection', features: [] };
    areas.forEach((a, k) => { const h = a.hull || (a.hull = hull(a.idx));
      fc.features.push({ type: 'Feature', properties: { k, sel: k === pickedK ? 1 : 0 }, geometry: { type: 'Polygon', coordinates: [h.ring] } });
      const el = document.createElement('button'); el.type = 'button'; el.className = 'hsec' + (k === pickedK ? ' on' : ''); el.setAttribute('aria-label', `${a.name}, ${a.city}: ${fmt(a.hit)} homes hit, largest hail ${a.max.toFixed(2)} in`);
      el.innerHTML = `<i>${k + 1}</i><em>${esc(a.name)}</em><span>${a.max.toFixed(2)} in</span>`;
      el.addEventListener('click', e => { e.stopPropagation(); (cur ? spick : pick)(k); });
      markers.push(new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -4] }).setLngLat(h.c).addTo(map)); });
    src.setData(fc); requestAnimationFrame(declutter);
  }
  // labels never pile up: when two would touch, the lower-ranked one waits (its outline stays); re-read on every camera stop
  // (a touching label first tries a step up, then a step down, before it waits)
  function declutter() { const taken = []; const clash = r => taken.some(t => r.left < t.right + 3 && t.left < r.right + 3 && r.top < t.bottom + 2 && t.top < r.bottom + 2);
    markers.forEach(m => { const el = m.getElement(); el.style.visibility = ''; el.style.marginTop = ''; const r0 = el.getBoundingClientRect(); if (!r0.width) return; const h = r0.height + 6;
      for (const dy of [0, -h, h, -2 * h, 2 * h]) { const r = { left: r0.left, right: r0.right, top: r0.top + dy, bottom: r0.bottom + dy }; if (!clash(r)) { el.style.marginTop = dy ? dy + 'px' : ''; taken.push(r); return; } }
      el.style.visibility = 'hidden'; }); }
  map.on('moveend', declutter); map.on('zoomend', declutter);
  // ---------- the glow: two heatmap layers under the labels (all listed areas; the picked one brighter) ----------
  let ready = false;
  function layers() {
    if (ready || !map.getSource || !map.getSource('rib-b')) { if (!ready) setTimeout(layers, 300); return; }
    // soft and radiant, never a flat blob: low intensity, a wide radius, a translucent core that lightens toward the centre
    const P = (op, r, a) => ({ 'heatmap-weight': ['get', 'w'], 'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 11, 0.42, 14, 0.36, 16, 0.3],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 14 * r, 10, 24 * r, 12, 44 * r, 14, 80 * r, 16, 140 * r], 'heatmap-opacity': 0, 'heatmap-opacity-transition': { duration: 450 },
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(39,87,230,0)', 0.1, `rgba(70,120,250,${0.08 * a})`, 0.3, `rgba(52,104,246,${0.18 * a})`, 0.55, `rgba(39,87,230,${0.27 * a})`, 0.8, `rgba(72,128,255,${0.34 * a})`, 1, `rgba(130,172,255,${0.4 * a})`] });
    try {
      map.addSource('hard', { type: 'geojson', data: EMPTY }); map.addLayer({ id: 'hard', type: 'heatmap', source: 'hard', paint: P(1, 1, 1) }, labelId || undefined);
      map.addSource('hard-sel', { type: 'geojson', data: EMPTY }); map.addLayer({ id: 'hard-sel', type: 'heatmap', source: 'hard-sel', paint: P(1, 1.25, 1.35) }, labelId || undefined);
      // the sections: a light fill and a crisp outline per hard-hit neighbourhood, the picked one stronger
      map.addSource('hard-sec', { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'hard-sec-fill', type: 'fill', source: 'hard-sec', paint: { 'fill-color': '#2757E6', 'fill-opacity': ['case', ['==', ['get', 'sel'], 1], 0.16, 0.07] } }, labelId || undefined);
      map.addLayer({ id: 'hard-sec-line', type: 'line', source: 'hard-sec', layout: { 'line-join': 'round' }, paint: { 'line-color': ['case', ['==', ['get', 'sel'], 1], '#0B1020', '#1F47C9'], 'line-width': ['case', ['==', ['get', 'sel'], 1], 2.2, 1.4], 'line-opacity': 0.9 } }, labelId || undefined);
    } catch (e) { return; }
    ready = true; syncGlow(); syncMode();
    new MutationObserver(() => { syncGlow(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
  function syncGlow() {
    if (!ready) return; const calmNow = !document.body.classList.contains('storm');
    map.getSource('hard').setData(glowAll || EMPTY);
    const a = AREAS[picked]; map.getSource('hard-sel').setData(a && glowAll ? { type: 'FeatureCollection', features: glowAll.features.filter(f => inArea(a, f)) } : EMPTY);
    const op = v => ['interpolate', ['linear'], ['zoom'], 12, v, 16, v * 0.6];   // homes stay readable under the glow when zoomed in
    map.setPaintProperty('hard', 'heatmap-opacity', op(calmNow ? (picked >= 0 ? 0.6 : 1) : 0));
    map.setPaintProperty('hard-sel', 'heatmap-opacity', op(calmNow && picked >= 0 ? 1 : 0));
  }
  // which reading is on the map: the picked storm's sections, else the 6-month areas
  let modeGen = 0;
  function syncMode() {
    if (!ready) return; const s = cur; const my = ++modeGen;
    if (!s) { sIso = null; sbox.hidden = true; sections(AREAS, picked); return; }
    if (sIso === s.iso) { sections(SAREAS, spicked); return; }
    sections([], -1); sbox.hidden = false; sbox.innerHTML = `<div class="hh1"><b>Hit hardest, ${esc(day(s.iso))}</b></div><p class="wait">Ranking the neighborhoods</p>`;
    stormAreas(s).then(R => { if (my !== modeGen || cur !== s) return; sIso = s.iso; paintStorm(s, R); sections(SAREAS, -1); });
  }
  const areaSets = new Map();
  function inArea(a, f) { let s = areaSets.get(a); if (!s) { s = new Set(a.idx); areaSets.set(a, s); } return s.has(f.properties.i); }
  function flyTo(a) {
    const xs = a.idx.map(i => STH.lon(i)).sort((p, q) => p - q), ys = a.idx.map(i => STH.lat(i)).sort((p, q) => p - q), m = xs.length, lo = Math.floor(m * 0.02), hi = Math.max(lo, Math.ceil(m * 0.98) - 1);
    flyBounds([xs[lo], ys[lo], xs[hi], ys[hi]], 15.6);
  }
  function pick(k) {
    const a = AREAS[k]; if (!a) return; picked = k;
    box.querySelectorAll('li button').forEach((b, j) => b.classList.toggle('on', j === k));
    syncGlow(); if (!cur) sections(AREAS, k);
    openList(`${a.name}, ${a.city}`, a.idx.slice().sort((p, q) => p - q));
    document.getElementById('l-sub').textContent = `${fmt(a.hit)} homes at 1 in+ radar hail (largest ${a.max.toFixed(2)} in), ${a.dates.map(day).join(', ')}. Loading addresses`;
    showWalk(a, a.dates.slice().sort().pop());
    flyTo(a);
  }
  function spick(k) {
    const a = SAREAS[k]; if (!a || !cur) return; spicked = k;
    sbox.querySelectorAll('li button').forEach((b, j) => b.classList.toggle('on', j === k));
    sections(SAREAS, k);
    openList(`${a.name}, ${a.city}`, a.idx.slice().sort((p, q) => p - q));
    document.getElementById('l-sub').textContent = `${fmt(a.hit)} homes at 1 in+ radar hail in the ${day(cur.iso)} storm (largest ${a.max.toFixed(2)} in). Loading addresses`;
    showWalk(a, cur.iso);
    flyTo(a);
  }
  // a walk sheet for the picked neighbourhood (10-19): starts at the hit home nearest the area's middle, on that storm
  const walkA = document.createElement('a'); walkA.className = 'pill sm'; walkA.id = 'l-walk'; walkA.target = '_blank'; walkA.rel = 'noopener';
  walkA.textContent = 'Print a walk sheet'; walkA.style.cssText = 'display:none;align-items:center;margin-top:8px;text-decoration:none;width:max-content';
  const lsub = document.getElementById('l-sub'); if (lsub) lsub.after(walkA);
  if (typeof openList === 'function') { const _ol = openList; openList = function () { walkA.style.display = 'none'; return _ol.apply(this, arguments); }; }
  function showWalk(a, iso) {
    if (!iso || !a.idx.length) return;
    const n = a.idx.length, mx = a.idx.reduce((s, i) => s + STH.lon(i), 0) / n, my = a.idx.reduce((s, i) => s + STH.lat(i), 0) / n;
    let best = a.idx[0], d = Infinity; a.idx.forEach(i => { const e = (STH.lon(i) - mx) ** 2 + (STH.lat(i) - my) ** 2; if (e < d) { d = e; best = i; } });
    walkA.href = 'c5-home/walk-sheet.html?id=m' + best + '&iso=' + encodeURIComponent(iso) + (/[?&]dev=1/.test(location.search) ? '&dev=1' : '');
    walkA.style.display = 'inline-flex';
  }
  box.addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (b) pick(+b.dataset.k); });
  sbox.addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (b) spick(+b.dataset.k); });
  document.getElementById('l-close').addEventListener('click', () => { picked = -1; spicked = -1; box.querySelectorAll('li button').forEach(b => b.classList.remove('on')); sbox.querySelectorAll('li button').forEach(b => b.classList.remove('on')); syncGlow(); syncMode(); });
  window.__hardPick = pick; window.__hardStormPick = spick;
  // how many neighbourhoods a storm hit (for checks): resolves {all, top:[names]}
  window.__hardCount = iso => { const s = ST.storms.find(x => x.iso === iso); return s ? stormAreas(s).then(R => ({ iso, all: R.all, top: R.areas.map(a => `${a.name}, ${a.city} ${a.max.toFixed(2)} in ${a.hit} homes`) })) : Promise.resolve(null); };
  // a storm picked, switched or cleared: lib/st-map.js repaints the stat card each time, so that is the hook
  if (typeof paintStat === 'function') { const _ps = paintStat; paintStat = function () { const r = _ps.apply(this, arguments); syncMode(); return r; }; }
  // after the homes are on the map (the storm products come first), read the 6 months of hail
  // and warm the county roll copies, so a house clicked on the map names its address at once
  const start = () => compute().then(paint).catch(() => paint(null)).then(() => { syncMode(); if (window.STM) STM.search('qq', 1); });
  STH.ready.then(() => ST.ready).then(() => setTimeout(start, 400));
})();
