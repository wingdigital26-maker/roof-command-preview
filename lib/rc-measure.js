/* rc-measure.js (window.RCMEASURE): the home record's "LiDAR measurements" view (Jack 10-23). The best lines we have per
   home, honestly labelled:
   - a roof model that passed its soundness + LiDAR fit gates (lib/rc-roof.js gatePass): its top view, every ridge / hip /
     valley / eave / rake with its length in ft and each face's pitch (RCROOF.diagramSVG of the model's report);
   - every other home: the building outline over the USDA NAIP photo, each wall run with its length in ft (outline lengths,
     estimate), plus the roof size and pitch from the home's LiDAR record. No ridge, hip or valley is drawn: not measured.
   Imagery: lib/rc-imagery.js (Esri World Imagery live, about 0.3 m, NAIP fallback); lengths read "41 ft" (Jack 10-26). */
(function () {
  'use strict';
  if (window.RCMEASURE) return;
  const FT = 3.28084, esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n1 = v => (Math.round(v * 10) / 10).toFixed(1);
  function naip(lon, lat, halfM, px) {
    const dx = halfM / (111320 * Math.cos(lat * Math.PI / 180)), dy = halfM / 110574;
    const bbox = [lon - dx, lat - dy, lon + dx, lat + dy];
    return 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage?bbox=' + bbox.map(v => v.toFixed(7)).join(',') +
      '&bboxSR=4326&imageSR=4326&size=' + px + ',' + px + '&format=jpgpng&interpolation=RSP_BilinearInterpolation&f=image';
  }
  // the sharpest photo we may show (lib/rc-imagery.js: Esri live, NAIP fallback); NAIP alone when the adapter is not on the page
  const photoTag = (lon, lat, hx, W, H, hy) => window.RCIMG ? RCIMG.svgImage(lon, lat, hx, W, H, hy)
    : `<image href="${naip(lon, lat, hx, 640)}" x="0" y="0" width="${W}" height="${H || W}" preserveAspectRatio="none"/>`;
  // W x H drawing (H defaults to W): the house fills the shorter side with 14 ft around it, the photo fills the rest
  const frame = (ext, W, H) => { const s = Math.min(W, H) / (2 * ext); return { s, hx: W / (2 * s) / FT, hy: H / (2 * s) / FT, T: q => [W / 2 + q[0] * s, H / 2 - q[1] * s] }; };
  const north = (W) => `<g transform="translate(${W - 26},26)"><path d="M0,-14 L6,7 L0,3 L-6,7 z" fill="#fff" stroke="#0B1020" stroke-width="1"/><text y="22" class="ms-l" style="font-size:11px">N</text></g>`;
  let last = null;   // the last home drawn (so the record's stage can draw the same home at its own size)
  const credit = () => `<p class="img-credit">${esc(window.RCIMG ? RCIMG.credit() : 'Imagery: USDA NAIP via USGS The National Map (public domain)')}</p>`;
  /* outline view: ring_ft (feet east, north of center), center [lon, lat] */
  function outlineSVG(entry, W, H) {
    const ring = entry && entry.ring_ft; if (!ring || ring.length < 3) return '';
    W = W || 640; H = H || W; last = { kind: 'outline', entry };
    const ext = Math.max(...ring.map(p => Math.max(Math.abs(p[0]), Math.abs(p[1])))) + 14, F = frame(ext, W, H), T = F.T, s = F.s;
    const pts = ring.map(p => T(p).map(n1).join(',')).join(' ');
    const img = entry.center ? photoTag(entry.center[0], entry.center[1], F.hx, W, H, F.hy) : '';
    const lab = [];
    ring.forEach((a, k) => { const b = ring[(k + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 6) return;
      const [ax, ay] = T(a), [bx, by] = T(b), mx = (ax + bx) / 2, my = (ay + by) / 2;
      lab.push(`<text x="${n1(mx)}" y="${n1(my)}" class="ms-l">${Math.round(L)} ft</text>`); });
    const L20 = 20 * s;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="ms-svg" role="img" aria-label="Building outline over the aerial photo, lengths in feet">
      <rect width="${W}" height="${H}" fill="#E9ECF1"/>${img}
      <polygon class="ms-ol" points="${pts}" fill="rgba(255,255,255,.12)" stroke="#FFD43B" stroke-width="3" stroke-linejoin="round"/><g class="ms-ol">${lab.join('')}</g>
      <g class="ms-ol">${north(W)}</g>
      <g class="ms-ol" transform="translate(14,${H - 14})"><line x1="0" y1="0" x2="${n1(L20)}" y2="0" stroke="#fff" stroke-width="3"/><text x="${n1(L20 / 2)}" y="-6" class="ms-l" style="font-size:11px">20 ft</text></g></svg>`;
  }
  /* the shared roof lines (window.RCLINES, tour/lib/rc-lines.js from the map work, 10-23): every edge with shown true, over the
     aerial photo, each with its true sloped length. A passed model shows all its lines; an outline estimate only its eaves
     (shown is false for its guessed ridges / hips / valleys, which are never drawn here). */
  const COL = { eave: '#FFD43B', ridge: '#E5484D', hip: '#F08A24', valley: '#3E7BFA', rake: '#A970FF' };
  function linesSVG(L, W, H) {
    const E = (L && L.edges || []).filter(e => e.shown); if (!E.length) return '';
    W = W || 640; H = H || W; last = { kind: 'lines', L };
    const pts = E.flatMap(e => [e.a, e.b]).concat(L.ring || []), lon0 = pts.reduce((s, p) => s + p[0], 0) / pts.length, lat0 = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const kx = 111320 * Math.cos(lat0 * Math.PI / 180) * FT, ky = 110574 * FT, Fp = p => [(p[0] - lon0) * kx, (p[1] - lat0) * ky];
    const ext = Math.max(...pts.map(p => { const q = Fp(p); return Math.max(Math.abs(q[0]), Math.abs(q[1])); })) + 14, F = frame(ext, W, H);
    const T = p => F.T(Fp(p));
    const lines = E.map(e => { const [ax, ay] = T(e.a), [bx, by] = T(e.b); return `<line x1="${n1(ax)}" y1="${n1(ay)}" x2="${n1(bx)}" y2="${n1(by)}" stroke="${COL[e.type] || '#FFD43B'}" stroke-width="3" stroke-linecap="round"/>`; }).join('');
    const labs = E.filter(e => e.len_ft >= 6).map(e => { const [ax, ay] = T(e.a), [bx, by] = T(e.b); return `<text x="${n1((ax + bx) / 2)}" y="${n1((ay + by) / 2)}" class="ms-l">${Math.round(e.len_ft)} ft</text>`; }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="ms-svg" role="img" aria-label="Roof lines over the aerial photo, lengths in feet">
      <rect width="${W}" height="${H}" fill="#E9ECF1"/>${photoTag(lon0, lat0, F.hx, W, H, F.hy)}<g class="ms-ol">${lines}${labs}</g>
      <g class="ms-ol">${north(W)}</g></svg>`;
  }
  /* the last home's photo drawing at any size (the record's big stage view) */
  function stageSVG(W, H) { if (!last) return ''; const L0 = last; const svg = L0.kind === 'lines' ? linesSVG(L0.L, W, H) : outlineSVG(L0.entry, W, H); last = L0; return svg; }
  const legend = L => [...new Set((L.edges || []).filter(e => e.shown).map(e => e.type))].map(t => `<span class="rr-lg"><i style="background:${COL[t] || '#FFD43B'}"></i>${esc(t)}</span>`).join('');
  /* the view: passed = the model's report (RCROOF.detail) when gate passed, else null; words = RCROOF.words(row);
     gi = the home's index, so the shared RCLINES record is used when that file is on the page and its tile is loaded */
  function viewHTML(o) {
    const W = o.words, ly = o.year || 2018;
    const L = o.gi != null && window.RCLINES && RCLINES.now ? RCLINES.now(o.gi) : null, ls = L ? linesSVG(L, 640) : '';
    if (ls) return `<div class="ms"><p class="ms-h"><b>${L.passed ? 'Measured roof lines' : 'Roof edges over the aerial photo'}</b> <span>${L.passed ? 'model passed its soundness and LiDAR fit checks' : 'roof shape being checked'}</span></p>${ls}
      <div class="rr-leg">${legend(L)}</div>${credit()}
      <p class="ms-n">${L.passed ? `Every line measured from ${ly} LiDAR, lengths in feet along the slope. Verify on site.` : `Eave lengths from the building outline, in feet, an estimate. Ridge, hip and valley lines show once this roof's shape passes its checks.`} ${W && W.sq > 0 ? `Roof ~${W.sq} squares (${esc(window.RCROOF ? RCROOF.SQ_NOTE : 'LiDAR estimate')}), pitch ${esc(W.pitch)}.` : ''} Imagery: USDA NAIP via USGS The National Map.</p></div>`;
    if (o.passed && o.report && window.RCROOF) {
      const svg = RCROOF.diagramSVG(o.report, 640);
      return `<div class="ms"><p class="ms-h"><b>Measured roof lines</b> <span>model passed its soundness and LiDAR fit checks</span></p>${svg}
        <div class="rr-leg">${Object.entries(RCROOF.EDGE_COLORS || {}).map(([k, c]) => `<span class="rr-lg"><i style="background:${c}"></i>${esc(k.replace('_', ' '))}</span>`).join('')}</div>
        <p class="ms-n">Top view, lengths in feet, each face with its pitch. From ${ly} LiDAR, verify on site.</p></div>`;
    }
    const svg = outlineSVG(o.entry, 640);
    if (!svg) return '';
    return `<div class="ms"><p class="ms-h"><b>Building outline over the aerial photo</b> <span>roof lines being checked</span></p>${svg}${credit()}
      <p class="ms-n">${W && W.sq > 0 ? `Roof ~${W.sq} squares (${esc(window.RCROOF ? RCROOF.SQ_NOTE : 'LiDAR estimate')}, ${ly}), pitch ${esc(W.pitch)}. ` : 'No LiDAR roof size for this home. '}Yellow: the building outline (${esc(o.entry.source || 'public building outline')}); lengths in feet are outline lengths, an estimate. Ridge, hip and valley lines show once this roof's shape passes its checks. Imagery: USDA NAIP via USGS The National Map.</p></div>`;
  }
  const css = `.ms{display:flex;flex-direction:column;gap:8px}.ms-h{margin:0;font-size:14px}.ms-h span{color:var(--muted,#465065);font-size:12.5px;margin-left:6px}
.ms-svg,.ms .rr-diag{width:100%;height:auto;border-radius:12px;display:block}
.ms-l{font:700 12px Inter,system-ui,sans-serif;fill:#0B1020;text-anchor:middle;dominant-baseline:middle;paint-order:stroke;stroke:#fff;stroke-width:3.5px}
.img-credit{margin:-2px 0 0;font-size:10.5px;line-height:1.35;color:var(--muted,#465065)}
.ms-n{margin:0;font-size:12.5px;line-height:1.5;color:var(--muted,#465065)}`;
  const st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st);
  window.RCMEASURE = { viewHTML, outlineSVG, naip, stageSVG };
})();
