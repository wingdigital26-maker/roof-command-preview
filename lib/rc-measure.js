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
  /* ALIGN (roof-accuracy 10-26): the satellite photo sits 1 to 2.5 m off the true ground per scene (Esri's own accuracy
     figure is 8.5 m; measured on 10 DFW homes against the LiDAR, tour/audit/roof-accuracy/imagery-bench), while the
     building outline sits within about 0.3 m. So the PHOTO is moved onto the outline, never the outline onto the photo.
     Live and display-only: the photo already on screen is read into a small canvas (0.3 m cells), matched to the roof
     template (each face's slope direction, or the outline) by mutual information over +-3 m, and moved only when the
     match is sure (best score 20% above any other shift 1.5 m away, not at the edge of the search, at least 0.3 m).
     Nothing is stored except the shift in metres. A mouse drag on the photo lines it up by hand (kept per home in this
     browser); Undo puts it back. */
  const ALIGN = (() => {
    const S = new Map(), TP = new Map(), busy = new Set(); let tid = 0;
    const LS = 'rc-photo-shift:';
    const key = (lon, lat, src) => lon.toFixed(4) + ',' + lat.toFixed(4) + ':' + src;   // one per home (about 10 m), so every size of the drawing shares it
    const shift = k => { if (S.has(k)) return S.get(k); try { const v = JSON.parse(localStorage.getItem(LS + k) || 'null'); if (v) { S.set(k, v); return v; } } catch (e) {} return null; };
    const tpl = faces => { const id = 't' + (++tid); TP.set(id, faces); if (TP.size > 40) TP.delete(TP.keys().next().value); return id; };
    const G = 0.3, R = 10, SURE = 1.2;   // metres per cell, search radius in cells (3 m), sureness to move on its own (10-27 test on 10 homes: at 1.2 the moves that happened matched the LiDAR within 0.75 m; 1.10 to 1.15 let a 1.5 m miss through)
    function grid(W, H, s) { const c = G * FT * s; return { c, w: Math.max(8, Math.round(W / c)), h: Math.max(8, Math.round(H / c)) }; }
    function labels(faces, g) {
      const cv = document.createElement('canvas'); cv.width = g.w; cv.height = g.h; const x = cv.getContext('2d');
      faces.forEach(f => { x.fillStyle = `rgb(${f.lab * 40},0,0)`; x.beginPath(); f.pts.forEach((p, i) => x[i ? 'lineTo' : 'moveTo'](p[0] / g.c, p[1] / g.c)); x.closePath(); x.fill(); });
      const d = x.getImageData(0, 0, g.w, g.h).data, L = new Uint8Array(g.w * g.h);
      for (let i = 0; i < L.length; i++) L[i] = Math.min(5, Math.round(d[i * 4] / 40));
      return L;
    }
    function grey(img, g, p) {
      const cv = document.createElement('canvas'); cv.width = g.w; cv.height = g.h; const x = cv.getContext('2d');
      try { x.filter = 'blur(0.6px)'; } catch (e) {}
      x.drawImage(img, -p / g.c, -p / g.c, g.w + 2 * p / g.c, g.h + 2 * p / g.c);   // the photo reaches p SVG px past each edge
      const d = x.getImageData(0, 0, g.w, g.h).data, Q = new Uint8Array(g.w * g.h);
      for (let i = 0; i < Q.length; i++) Q[i] = Math.min(15, ((d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3) >> 4);
      return Q;
    }
    // the shift (cells) that best explains the photo's grey levels by the template's labels, and how sure
    function match(L, Q, g) {
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (L[y * g.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) return null;
      const P = 20; x0 = Math.max(R, x0 - P); y0 = Math.max(R, y0 - P); x1 = Math.min(g.w - 1 - R, x1 + P); y1 = Math.min(g.h - 1 - R, y1 + P);
      const ix = [], lab = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { ix.push(y * g.w + x); lab.push(L[y * g.w + x]); }
      const n = ix.length; if (n < 200) return null;
      const pl = new Float64Array(6); lab.forEach(l => pl[l]++); for (let l = 0; l < 6; l++) pl[l] /= n;
      const D = 2 * R + 1, M = new Float64Array(D * D), J = new Float64Array(96), pg = new Float64Array(16);
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        J.fill(0); pg.fill(0); const o = dy * g.w + dx;
        for (let i = 0; i < n; i++) { const q = Q[ix[i] + o]; J[lab[i] * 16 + q]++; pg[q]++; }
        let mi = 0; for (let l = 0; l < 6; l++) { if (!pl[l]) continue; for (let q = 0; q < 16; q++) { const j = J[l * 16 + q] / n; if (j > 0) mi += j * Math.log(j / (pl[l] * pg[q] / n)); } }
        M[(dy + R) * D + dx + R] = mi;
      }
      let b = 0; for (let i = 1; i < M.length; i++) if (M[i] > M[b]) b = i;
      const by = Math.floor(b / D) - R, bx = b % D - R; let sec = 0;
      for (let i = 0; i < M.length; i++) { const yy = Math.floor(i / D) - R, xx = i % D - R; if (Math.hypot(yy - by, xx - bx) > 1.5 / G && M[i] > sec) sec = M[i]; }
      return { dx: bx, dy: by, sure: M[b] / (sec || 1e-9), edge: Math.abs(bx) >= R || Math.abs(by) >= R };
    }
    function put(k, v, save) {
      S.set(k, v); if (save) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) {} }
      document.querySelectorAll(`g.ms-ph[data-al="${k}"]`).forEach(apply);
    }
    function apply(gEl) {
      const v = S.get(gEl.dataset.al), s = +gEl.dataset.s;
      if (v && (v.e || v.n)) gEl.setAttribute('transform', `translate(${n1(v.e * FT * s)},${n1(-v.n * FT * s)})`); else gEl.removeAttribute('transform');
      note(gEl); dispatchEvent(new CustomEvent('rc:photoshift', { detail: { k: gEl.dataset.al } }));   // the 3D view's ground photo follows
    }
    // the credit line under the photo: when it was taken, and whether it was moved
    function note(gEl) {
      const svg = gEl.ownerSVGElement; if (!svg) return; const box = svg.parentElement;
      const cr = box && (box.querySelector('.img-credit') || (box.parentElement && box.parentElement.querySelector('.img-credit'))); if (!cr) return;
      let sp = cr.querySelector('.img-al'); if (!sp) { sp = document.createElement('span'); sp.className = 'img-al'; cr.appendChild(sp); }
      const k = gEl.dataset.al, v = S.get(k), dt = gEl.dataset.dt;
      const moved = v && (v.e || v.n) ? `${v.how === 'manual' ? 'Photo lined up by hand' : 'Photo lined up to the building outline'} (moved ${(Math.hypot(v.e, v.n) * FT).toFixed(0)} ft). <button type="button" class="img-undo" data-k="${k}">Undo</button>` : '';
      const hint = !moved && v && window.matchMedia && matchMedia('(pointer: fine)').matches ? ' Photo a few feet off the outline? Drag it to line it up.' : '';
      const d21 = Z21.get(base(k)), sw = d21 ? (old(k) ? ` <button type="button" class="img-z21" data-b="${base(k)}">Show the newest photo</button>`
        : ` <button type="button" class="img-z21" data-b="${base(k)}">Sharpest photo (city aerial, ${esc(d21)})</button>`) : '';
      const html = (dt ? `. Photo taken ${esc(dt)}${old(k) ? ': an older photo, the roof may have changed since' : ''}.` : '.') + (moved ? ' ' + moved : hint) + sw;
      if (sp.innerHTML !== html) sp.innerHTML = html;
    }
    /* ALLEN 2017 (roof-accuracy 10-27): where Esri's zoom 21 exists (Allen's 2017 3-inch city aerial, inside Esri's basemap,
       shown live like every Esri photo), the credit line offers it as the sharper but OLDER photo, always with its date.
       It is never the default: the roof in it may have been replaced since. Its own alignment key (':esri21'). */
    const Z21 = new Map(), OLD = new Set();
    const base = k => k.split(':')[0];
    const old = k => OLD.has(base(k));
    const sizeAt = (hx, hy, mpp) => Math.min(4000, Math.round(2 * hx / mpp)) + ',' + Math.min(4000, Math.round(2 * hy / mpp));
    function as2017(html) {   // the same <g> asking for 0.075 m pixels (zoom 21)
      return html.replace(/data-al="([^"]+):esri"/, 'data-al="$1:esri21"').replace(/data-mpp="[^"]*"/, 'data-mpp="0.075"')
        .replace(/size=\d+,\d+/, () => { const hx = +(/data-hx="([^"]+)"/.exec(html) || [])[1], hy = +(/data-hy="([^"]+)"/.exec(html) || [])[1]; return 'size=' + sizeAt(hx, hy, 0.075); })
        .replace(/ transform="translate\([^)]*\)"(?=[^<]*>)/, '');
    }
    function retarget(gEl, on) {
      const k0 = base(gEl.dataset.al), im = gEl.querySelector('image'); if (!im) return;
      gEl.dataset.al = k0 + (on ? ':esri21' : ':esri'); gEl.dataset.mpp = on ? '0.075' : String(Math.max(0.15, 2 * +gEl.dataset.hx / 1600));
      im.setAttribute('href', im.getAttribute('href').replace(/size=\d+,\d+/, 'size=' + (on ? sizeAt(+gEl.dataset.hx, +gEl.dataset.hy, 0.075) : sizeAt(+gEl.dataset.hx, +gEl.dataset.hy, +gEl.dataset.mpp))));
      delete gEl.dataset.dt; gEl.removeAttribute('transform'); run(gEl);
    }
    function run(gEl) {
      const k = gEl.dataset.al;
      if (window.RCIMG && RCIMG.meta && /:esri(21)?$/.test(k)) {
        const ll = base(k).split(',').map(Number);
        RCIMG.meta(ll[0], ll[1], +gEl.dataset.mpp).then(m => { if (m) document.querySelectorAll(`g.ms-ph[data-al="${k}"]`).forEach(e => { e.dataset.dt = m.date; note(e); }); });
        if (!Z21.has(base(k))) { Z21.set(base(k), null);
          RCIMG.meta(ll[0], ll[1], 0.075).then(m => { if (m && m.res && m.res < 0.1) { Z21.set(base(k), m.date); document.querySelectorAll('g.ms-ph[data-al^="' + base(k) + ':"]').forEach(note); } }); }
      }
      if (shift(k)) return apply(gEl);
      const faces = TP.get(gEl.dataset.tp), im = gEl.querySelector('image'); if (!faces || !im || busy.has(k)) return;
      busy.add(k);
      const g = grid(+gEl.dataset.w, +gEl.dataset.h, +gEl.dataset.s), img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { try {
        const r = match(labels(faces, g), grey(img, g, +gEl.dataset.p || 0), g);
        // the photo's roof sits (dx, dy) cells from the template: move it back by that much
        const ok = r && !r.edge && r.sure >= SURE && Math.hypot(r.dx, r.dy) * G >= 0.3;
        S.set(k, ok ? { e: -r.dx * G, n: r.dy * G, how: 'auto', sure: +r.sure.toFixed(2) } : { e: 0, n: 0, how: 'none', sure: r ? +r.sure.toFixed(2) : 0 });
        document.querySelectorAll(`g.ms-ph[data-al="${k}"]`).forEach(apply);
      } catch (e) { S.set(k, { e: 0, n: 0, how: 'none', err: String(e).slice(0, 80) }); } busy.delete(k); };
      img.onerror = () => busy.delete(k);
      img.src = im.getAttribute('href');
    }
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
      const scan = () => document.querySelectorAll('g.ms-ph[data-al]:not([data-on])').forEach(e => { e.setAttribute('data-on', '1'); run(e); });
      new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
      document.addEventListener('click', e => { const z = e.target.closest && e.target.closest('.img-z21'); if (!z) return;
        const b = z.dataset.b, on = !OLD.has(b); if (on) OLD.add(b); else OLD.delete(b);
        document.querySelectorAll('g.ms-ph[data-al^="' + b + ':esri"]').forEach(g => retarget(g, on)); });
      document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('.img-undo'); if (!b) return;
        const k = b.dataset.k; try { localStorage.removeItem(LS + k); } catch (x) {} put(k, { e: 0, n: 0, how: 'undone' }, false); });
      // hand alignment: drag the photo with a mouse or pen (touch keeps scrolling the page)
      let drag = null;
      document.addEventListener('pointerdown', e => {
        if (e.pointerType === 'touch' || e.button) return; const svg = e.target.closest && e.target.closest('svg.ms-svg'); const gEl = svg && svg.querySelector('g.ms-ph'); if (!gEl) return;
        const v = S.get(gEl.dataset.al) || { e: 0, n: 0 }, sc = svg.getBoundingClientRect().width / (+gEl.dataset.w || 1);
        drag = { gEl, k: gEl.dataset.al, x: e.clientX, y: e.clientY, e0: v.e, n0: v.n, f: 1 / (FT * +gEl.dataset.s * sc), moved: false }; e.preventDefault();
      });
      addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) > 3) drag.moved = true;
        if (drag.moved) { S.set(drag.k, { e: drag.e0 + dx * drag.f, n: drag.n0 - dy * drag.f, how: 'manual' }); apply(drag.gEl); } });
      addEventListener('pointerup', () => { if (drag && drag.moved) put(drag.k, S.get(drag.k), true); drag = null; });
    }
    return { key, shift, tpl, match, S, old, as2017 };
  })();
  function naip(lon, lat, halfM, px) {
    const dx = halfM / (111320 * Math.cos(lat * Math.PI / 180)), dy = halfM / 110574;
    const bbox = [lon - dx, lat - dy, lon + dx, lat + dy];
    return 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage?bbox=' + bbox.map(v => v.toFixed(7)).join(',') +
      '&bboxSR=4326&imageSR=4326&size=' + px + ',' + px + '&format=jpgpng&interpolation=RSP_BilinearInterpolation&f=image';
  }
  // the sharpest photo we may show (lib/rc-imagery.js: Esri live, NAIP fallback); NAIP alone when the adapter is not on the page.
  // The photo sits in <g class="ms-ph"> so it can be lined up with the outline (roof-accuracy 10-26, see ALIGN below); tpl = the
  // roof template in SVG pixels ([{ pts, lab }], lab 1-4 = face sloping N/E/S/W, 5 = flat, 1 for a plain outline).
  const photoTag = (lon, lat, hx, W, H, hy, tpl) => {
    // the photo reaches PAD metres past every edge, so a lined-up (moved) photo never shows an empty strip
    const s = W / (2 * hx * FT), PAD = window.RCIMG ? 4 : 0, p = PAD * FT * s; H = H || W; hy = hy == null ? hx : hy;
    const img = window.RCIMG ? `<g transform="translate(${n1(-p)},${n1(-p)})">${RCIMG.svgImage(lon, lat, hx + PAD, W + 2 * p, H + 2 * p, hy + PAD)}</g>`
      : `<image href="${naip(lon, lat, hx, 640)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>`;
    const src = window.RCIMG && RCIMG.esriOn() ? 'esri' : 'naip', k = ALIGN.key(lon, lat, src), id = tpl ? ALIGN.tpl(tpl) : '';
    const sh = ALIGN.shift(k), mpp = src === 'esri' ? Math.max(0.15, 2 * (hx + PAD) / 1600) : 0.6;
    const tr = sh && (sh.e || sh.n) ? ` transform="translate(${n1(sh.e * FT * s)},${n1(-sh.n * FT * s)})"` : '';
    const g = `<g class="ms-ph" data-al="${k}" data-tp="${id}" data-s="${s.toFixed(4)}" data-w="${W}" data-h="${H}" data-p="${n1(p)}" data-mpp="${mpp}" data-hx="${(hx + PAD).toFixed(2)}" data-hy="${(hy + PAD).toFixed(2)}"${tr}>${img}</g>`;
    return ALIGN.old(k) ? ALIGN.as2017(g) : g;
  };
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
    const img = entry.center ? photoTag(entry.center[0], entry.center[1], F.hx, W, H, F.hy, [{ pts: ring.map(T), lab: 1 }]) : '';
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
      <rect width="${W}" height="${H}" fill="#E9ECF1"/>${photoTag(lon0, lat0, F.hx, W, H, F.hy, faceTpl(L, T, kx, ky))}<g class="ms-ol">${lines}${labs}</g>
      <g class="ms-ol">${north(W)}</g></svg>`;
  }
  /* the roof template for lining up the photo: each mesh triangle labelled by the way it slopes (1-4 = N/E/S/W, 5 = flat),
     or the wall ring as one piece when there is no mesh */
  function faceTpl(L, T, kx, ky) {
    const M = L.mesh, out = [];
    if (M && M.tris && M.tris.length) M.tris.forEach(([a, b, c]) => {
      const A = M.verts[a], B = M.verts[b], C = M.verts[c]; if (!A || !B || !C) return;
      const u = [(B[0] - A[0]) * kx, (B[1] - A[1]) * ky, B[2] - A[2]], v = [(C[0] - A[0]) * kx, (C[1] - A[1]) * ky, C[2] - A[2]];
      let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
      if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const sl = Math.hypot(nx, ny) / (nz || 1e-9); if (sl > 4) return;   // walls
      const ang = (Math.atan2(nx, ny) * 180 / Math.PI + 405) % 360, lab = sl < 0.1 ? 5 : Math.floor(ang / 90) + 1;
      out.push({ pts: [T(A), T(B), T(C)], lab });
    });
    if (!out.length && L.ring && L.ring.length > 2) out.push({ pts: L.ring.map(T), lab: 1 });
    return out;
  }
  /* the last home's photo drawing at any size (the record's big stage view) */
  function stageSVG(W, H) { if (!last) return ''; const L0 = last; const svg = L0.kind === 'lines' ? linesSVG(L0.L, W, H) : outlineSVG(L0.entry, W, H); last = L0; return svg; }
  // each line type with its total length (the figures a roofer orders ridge cap, drip edge and valley metal by)
  const legend = L => { const T = {}; (L.edges || []).filter(e => e.shown).forEach(e => { T[e.type] = (T[e.type] || 0) + (e.len_ft || 0); });
    return Object.keys(T).map(t => `<span class="rr-lg"><i style="background:${COL[t] || '#FFD43B'}"></i>${esc(t)} ${Math.round(T[t])} ft</span>`).join(''); };
  /* the view: passed = the model's report (RCROOF.detail) when gate passed, else null; words = RCROOF.words(row);
     gi = the home's index, so the shared RCLINES record is used when that file is on the page and its tile is loaded */
  function viewHTML(o) {
    const W = o.words, ly = o.year || 2018;
    const L = o.gi != null && window.RCLINES && RCLINES.now ? RCLINES.now(o.gi) : null, ls = L ? linesSVG(L, 640) : '';
    if (ls) return `<div class="ms"><p class="ms-h"><b>${L.passed ? 'Measured roof lines' : 'Roof edges over the aerial photo'}</b> <span>${L.passed ? 'model passed its soundness and LiDAR fit checks' : 'roof shape being checked'}</span></p>${ls}
      <div class="rr-leg">${legend(L)}</div>${credit()}
      <p class="ms-n">${L.passed ? `Every line measured from ${ly} LiDAR, lengths in feet along the slope. Verify on site.` : `Eave lengths from the building outline, in feet, an estimate. Ridge, hip and valley lines show once this roof's shape passes its checks.`} ${W && W.sq > 0 ? `Roof ~${W.sq} squares (${esc(window.RCROOF ? RCROOF.SQ_NOTE : 'LiDAR estimate')}), pitch ${esc(W.pitch)}.` : ''}</p></div>`;
    if (o.passed && o.report && window.RCROOF) {
      const svg = RCROOF.diagramSVG(o.report, 640);
      return `<div class="ms"><p class="ms-h"><b>Measured roof lines</b> <span>model passed its soundness and LiDAR fit checks</span></p>${svg}
        <div class="rr-leg">${Object.entries(RCROOF.EDGE_COLORS || {}).map(([k, c]) => `<span class="rr-lg"><i style="background:${c}"></i>${esc(k.replace('_', ' '))}</span>`).join('')}</div>
        <p class="ms-n">Top view, lengths in feet, each face with its pitch. From ${ly} LiDAR, verify on site.</p></div>`;
    }
    const svg = outlineSVG(o.entry, 640);
    if (!svg) return '';
    return `<div class="ms"><p class="ms-h"><b>Building outline over the aerial photo</b> <span>roof lines being checked</span></p>${svg}${credit()}
      <p class="ms-n">${W && W.sq > 0 ? `Roof ~${W.sq} squares (${esc(window.RCROOF ? RCROOF.SQ_NOTE : 'LiDAR estimate')}, ${ly}), pitch ${esc(W.pitch)}. ` : 'No LiDAR roof size for this home. '}Yellow: the building outline (${esc(o.entry.source || 'public building outline')}); lengths in feet are outline lengths, an estimate. Ridge, hip and valley lines show once this roof's shape passes its checks.</p></div>`;
  }
  const css = `.ms{display:flex;flex-direction:column;gap:8px}.ms-h{margin:0;font-size:14px}.ms-h span{color:var(--muted,#465065);font-size:12.5px;margin-left:6px}
.ms-svg,.ms .rr-diag{width:100%;height:auto;border-radius:12px;display:block}
.ms-l{font:700 12px Inter,system-ui,sans-serif;fill:#0B1020;text-anchor:middle;dominant-baseline:middle;paint-order:stroke;stroke:#fff;stroke-width:3.5px}
.img-credit{margin:-2px 0 0;font-size:10.5px;line-height:1.35;color:var(--muted,#465065)}
.ms-n{margin:0;font-size:12.5px;line-height:1.5;color:var(--muted,#465065)}
.ms-svg g.ms-ph{cursor:grab}.img-al .img-z21{margin-left:4px;border:1px solid currentColor;border-radius:6px;background:none;padding:0 6px;color:inherit;font:inherit;cursor:pointer}.img-al .img-undo{border:0;background:none;padding:0;color:inherit;text-decoration:underline;font:inherit;cursor:pointer}`;
  const st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st);
  window.RCMEASURE = { viewHTML, outlineSVG, naip, stageSVG, align: ALIGN };
})();
