/* Draw the roof (c5-home/draw.js). For a home with no building outline on file (or one whose outline looks wrong),
   the roofer traces the roof's corners on the satellite view of the parcel. Plain script, runs before home.js.
   - Imagery: the same USDA NAIP export (USGS The National Map) the empty state shows, re-fetched tighter as the roofer zooms in
     (zoom buttons; no map library). Pixels <-> lon/lat through the known image frame, so corners survive a zoom.
   - Corners: tap or click to add, drag a corner to move it, tap the first corner (or Close shape) to finish,
     Undo, Start over, Square corners (snap each new edge parallel or square to the last; Shift on a keyboard).
   - Measurements: geodesic edge lengths in feet, footprint sq ft; the roof plan, squares and 3D come from the
     app's own roof solver (home.js runs RealRoof.spec on the drawn ring, exactly as for a county outline).
     Pitch is never invented: 6/12 is the estimate's working number unless LiDAR measured this home.
   - Storage: RC key "drawn.<homeId>" (localStorage rc.t.drawn.<id>). Signed in, lib/rc-cloud.js mirrors every
     drawn.* key to crm_kv for the roofer's company (docs/CRM-SCHEMA.md); dev=1 / signed out stays local.
   window.RoofDraw = { mount(stage, opts) -> { destroy }, read(id), write(id, pts), erase(id), entry(pts, pitch),
                       areaSqft(pts), perimeterFt(pts), imageUrl(lon, lat, halfW) } */
(function () {
  'use strict';
  if (window.RoofDraw) return;
  const NS = 'http://www.w3.org/2000/svg', FT = 3.28084, IMG_W = 1200, IMG_H = 750;
  const el = (t, a, p) => { const e = document.createElementNS(NS, t); for (const k in a || {}) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- geometry (lon/lat) ----------
  function distFt(a, b) {
    const R = 6371008.8, r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))) * FT;
  }
  function areaSqft(pts) {
    if (!pts || pts.length < 3) return 0;
    const lat0 = pts[0][1], my = 110574 * FT, mx = 111320 * Math.cos(lat0 * Math.PI / 180) * FT;
    let s = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += (a[0] * mx) * (b[1] * my) - (b[0] * mx) * (a[1] * my); }
    return Math.abs(s) / 2;
  }
  function perimeterFt(pts) { let s = 0; for (let i = 0; i < pts.length; i++) s += distFt(pts[i], pts[(i + 1) % pts.length]); return s; }
  // snap p (px) so the edge from prev runs parallel or square to the previous edge (prev2 -> prev); first edge: screen axes
  function snap(prev2, prev, p) {
    const base = prev2 ? Math.atan2(prev[1] - prev2[1], prev[0] - prev2[0]) : 0, dx = p[0] - prev[0], dy = p[1] - prev[1];
    const len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    let best = base, bd = 9;
    for (let k = 0; k < 4; k++) { const c = base + k * Math.PI / 2; const d = Math.abs(Math.atan2(Math.sin(ang - c), Math.cos(ang - c))); if (d < bd) { bd = d; best = c; } }
    return [prev[0] + Math.cos(best) * len, prev[1] + Math.sin(best) * len];
  }
  function segX(a, b, c, d) {
    const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return (o(a, b, c) > 0) !== (o(a, b, d) > 0) && (o(c, d, a) > 0) !== (o(c, d, b) > 0);
  }
  function selfCrosses(pts) {
    const n = pts.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segX(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
    return false;
  }
  function badShape(pts) {
    if (pts.length < 3) return '';
    if (selfCrosses(pts)) return 'This outline crosses itself';
    const a = Math.round(areaSqft(pts));
    if (a < 300) return `Too small for a house roof (${fmt(a)} sq ft)`;
    if (a > 15000) return `Too large for a house roof (${fmt(a)} sq ft)`;
    return '';
  }

  // ---------- imagery frame: a 4326 box around the home, IMG_W x IMG_H, halfW metres across ----------
  function frame(lon, lat, halfW) {
    const dx = halfW / (111320 * Math.cos(lat * Math.PI / 180)), dy = (halfW * IMG_H / IMG_W) / 110574;
    return { lon, lat, dx, dy, bbox: [lon - dx, lat - dy, lon + dx, lat + dy] };
  }
  function imageUrl(lon, lat, halfW) {
    const f = frame(lon, lat, halfW);
    // USDA NAIP via USGS The National Map (public domain), the one imagery source the whole app uses (js/imagery.js)
    return 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage?bbox=' + f.bbox.map(v => v.toFixed(6)).join(',') +
      '&bboxSR=4326&imageSR=3857&size=' + IMG_W + ',' + IMG_H + '&format=jpgpng&f=image';
  }
  const LEVELS = [75, 45, 27, 16];   // half-width in metres: 150 m wide (the empty state) down to a 32 m close-up

  // ---------- storage (RC = lib/rc-state.js) ----------
  const key = id => 'drawn.' + String(id);
  function read(id) { try { const v = window.RC && RC.__get(key(id), null); return v && Array.isArray(v.pts) && v.pts.length >= 3 ? v : null; } catch (e) { return null; } }
  function write(id, pts) { if (!window.RC) return false; RC.__set(key(id), { pts: pts.map(p => [+p[0].toFixed(7), +p[1].toFixed(7)]), at: new Date().toISOString(), by: 'hand' }); return true; }
  function erase(id) { if (!window.RC) return; try { localStorage.removeItem('rc.t.' + key(id)); } catch (e) { } RC.__set(key(id), null); }

  // ---------- a drawn ring -> the roofs-*.json style entry RealRoof.spec reads (local feet, x east, y north) ----------
  function entry(pts, pitch) {
    const lon0 = pts.reduce((s, p) => s + p[0], 0) / pts.length, lat0 = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const kx = 111320 * Math.cos(lat0 * Math.PI / 180) * FT, ky = 110574 * FT;
    let r = pts.map(p => [(p[0] - lon0) * kx, (p[1] - lat0) * ky]);
    let A = 0, cx = 0, cy = 0;
    for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length], c = x1 * y2 - x2 * y1; A += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c; }
    A /= 2; cx /= 6 * A; cy /= 6 * A;
    if (A < 0) r = r.slice().reverse();   // the solver wants one winding
    const r2 = v => Math.round(v * 100) / 100;
    const p = pitch && pitch.measured ? pitch : { rise: 6, measured: false, gap: true, note: 'Pitch not measured, 6/12 used for the estimate' };
    return { ring_ft: r.map(q => [r2(q[0] - cx), r2(q[1] - cy)]), sqft: Math.round(Math.abs(A)), source: 'Drawn by you', drawn: true, pitch: p };
  }

  // ---------- the tool ----------
  function mount(stage, o) {
    o = o || {};
    const S = { pts: (o.pts || []).map(p => p.slice()), closed: !!(o.pts && o.pts.length >= 3), lvl: o.level != null ? o.level : 2, sq: false, shift: false, drag: -1, dragged: false, err: '', loading: true };
    const root = document.createElement('div'); root.className = 'dr'; root.setAttribute('role', 'application'); root.setAttribute('aria-label', 'Draw the roof');
    root.innerHTML = `<img class="dr-img" alt="Satellite view of the parcel"><span class="dr-home" aria-hidden="true" title="The home's recorded position"></span>
      <div class="dr-zoom"><button type="button" data-a="zin" aria-label="Zoom in">+</button><button type="button" data-a="zout" aria-label="Zoom out">&minus;</button></div>
      <div class="dr-top"><div class="dr-tt"><b>${o.redraw ? 'Fix the outline' : 'Draw the roof'}</b><button type="button" class="dr-cancel" data-a="cancel">Cancel</button></div><span class="dr-hint"></span></div>
      <div class="dr-bar"></div><small class="dr-credit">Imagery: USDA NAIP via USGS The National Map</small>`;
    const svg = el('svg', { class: 'dr-svg', 'aria-hidden': 'true' }); root.insertBefore(svg, root.querySelector('.dr-zoom'));
    stage.appendChild(root);
    const img = root.querySelector('.dr-img'), bar = root.querySelector('.dr-bar'), hint = root.querySelector('.dr-hint'), homePin = root.querySelector('.dr-home');
    let F = frame(o.lon, o.lat, LEVELS[S.lvl]);
    // displayed image geometry (object-fit: cover): scale s, offsets ox/oy
    const geo = () => { const W = root.clientWidth, H = root.clientHeight, s = Math.max(W / IMG_W, H / IMG_H); return { W, H, s, ox: (W - IMG_W * s) / 2, oy: (H - IMG_H * s) / 2 }; };
    const px = ll => { const g = geo(); return [g.ox + ((ll[0] - F.lon) / (2 * F.dx) + .5) * IMG_W * g.s, g.oy + (.5 - (ll[1] - F.lat) / (2 * F.dy)) * IMG_H * g.s]; };
    const ll = p => { const g = geo(); return [F.lon + ((p[0] - g.ox) / (IMG_W * g.s) - .5) * 2 * F.dx, F.lat + (.5 - (p[1] - g.oy) / (IMG_H * g.s)) * 2 * F.dy]; };
    function loadImg() {
      S.loading = true; root.classList.add('loading'); F = frame(o.lon, o.lat, LEVELS[S.lvl]);
      const u = imageUrl(o.lon, o.lat, LEVELS[S.lvl]);
      img.onload = () => { S.loading = false; root.classList.remove('loading'); draw(); };
      img.onerror = () => { S.loading = false; root.classList.remove('loading'); root.classList.add('noimg'); hint.textContent = 'Satellite imagery did not load. Check the connection and try again.'; };
      img.src = u; draw();
    }
    function draw() {
      const g = geo(); svg.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`); svg.innerHTML = '';
      const hp = px([o.lon, o.lat]); homePin.style.left = hp[0] + 'px'; homePin.style.top = hp[1] + 'px';
      const P = S.pts.map(px), n = P.length;
      if (n >= 2) el(S.closed ? 'polygon' : 'polyline', { class: S.closed ? 'dr-poly' : 'dr-line', points: P.map(p => p.join(',')).join(' ') }, svg);
      let rubber = null;
      if (!S.closed && n && S.mouse) { rubber = (S.sq || S.shift) ? snap(n > 1 ? P[n - 2] : null, P[n - 1], S.mouse) : S.mouse; el('line', { class: 'dr-rub', x1: P[n - 1][0], y1: P[n - 1][1], x2: rubber[0], y2: rubber[1] }, svg); }
      const lab = (a, b, A, B) => {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 30) return;
        const t = fmt(distFt(A, B)) + ' ft', mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, w = t.length * 6.8 + 12;
        el('rect', { class: 'dr-lbg', x: mx - w / 2, y: my - 10, width: w, height: 20, rx: 7 }, svg);
        const tx = el('text', { class: 'dr-lab', x: mx, y: my + 4, 'text-anchor': 'middle' }, svg); tx.textContent = t;
      };
      for (let i = 0; i < n - 1 + (S.closed ? 1 : 0); i++) lab(P[i], P[(i + 1) % n], S.pts[i], S.pts[(i + 1) % n]);
      if (rubber) lab(P[n - 1], rubber, S.pts[n - 1], ll(rubber));
      P.forEach((p, i) => {
        const first = i === 0 && !S.closed && n >= 3;
        el('circle', { class: 'dr-vh', cx: p[0], cy: p[1], r: 18, 'data-i': i }, svg);   // generous touch target
        el('circle', { class: 'dr-v' + (first ? ' dr-first' : ''), cx: p[0], cy: p[1], r: first ? 9 : 6.5, 'data-i': i }, svg);
      });
      renderBar();
    }
    // pointer handling on the root: tap = add a corner (or close on the first), press on a corner = drag it
    let down = null;
    const rel = e => { const r = root.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    root.addEventListener('pointerdown', e => {
      if (e.target.closest('.dr-bar, .dr-zoom, button')) return;
      const vi = e.target.closest && e.target.closest('[data-i]');
      e.preventDefault();
      if (vi) {
        const i = +vi.dataset.i;
        if (i === 0 && !S.closed && S.pts.length >= 3) { close(); return; }
        S.drag = i; S.dragged = false;
        try { root.setPointerCapture(e.pointerId); } catch (x) { }
        return;
      }
      down = rel(e);
    });
    root.addEventListener('pointermove', e => {
      const p = rel(e);
      if (S.drag >= 0) { S.dragged = true; S.pts[S.drag] = ll(p); S.err = ''; draw(); return; }
      if (e.pointerType !== 'touch') { S.mouse = p; S.shift = !!e.shiftKey; if (!S.closed && S.pts.length) draw(); }
    });
    root.addEventListener('pointerup', e => {
      if (S.drag >= 0) { try { root.releasePointerCapture(e.pointerId); } catch (x) { } S.drag = -1; if (S.closed) { S.err = badShape(S.pts); draw(); } return; }
      if (!down || e.target.closest('.dr-bar, .dr-zoom, button')) { down = null; return; }
      const p = rel(e), moved = Math.hypot(p[0] - down[0], p[1] - down[1]); down = null;
      if (moved > 8 || S.closed || S.loading) return;
      let q = p; const n = S.pts.length, P = S.pts.map(px);
      if (n >= 3 && Math.hypot(p[0] - P[0][0], p[1] - P[0][1]) < 16) { close(); return; }
      if ((S.sq || e.shiftKey) && n >= 1) q = snap(n > 1 ? P[n - 2] : null, P[n - 1], p);
      S.pts.push(ll(q)); S.err = ''; draw();
    });
    root.addEventListener('pointerleave', () => { S.mouse = null; if (!S.closed && S.pts.length) draw(); });
    const onKey = e => { if (e.key === 'Shift') { S.shift = e.type === 'keydown'; if (S.mouse) draw(); } if (e.type === 'keydown' && e.key === 'Escape') act('cancel'); if (e.type === 'keydown' && (e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); } };
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => draw()) : null; if (ro) ro.observe(root);

    function dedupe() { S.pts = S.pts.filter((p, i) => !i || distFt(S.pts[i - 1], p) >= 1.5); if (S.pts.length > 1 && distFt(S.pts[0], S.pts[S.pts.length - 1]) < 1.5) S.pts.pop(); }
    function close() { if (S.pts.length < 3) return; dedupe(); if (S.pts.length < 3) { draw(); return; } S.closed = true; S.mouse = null; S.err = badShape(S.pts); draw(); }
    function undo() { S.err = ''; if (S.closed) S.closed = false; else S.pts.pop(); draw(); }
    function renderBar() {
      const n = S.pts.length;
      hint.textContent = S.loading ? 'Loading the satellite view.' : S.closed ? (S.err ? S.err + '.' : 'Drag any corner to adjust, then use this outline.')
        : n === 0 ? 'Tap each corner of the roof, one by one.' : n < 3 ? `${n} corner${n === 1 ? '' : 's'}. Keep going round the roof.` : `${n} corners. Tap the first corner to close the shape.`;
      const info = S.closed ? `${n} corners &middot; ${fmt(areaSqft(S.pts))} sq ft footprint &middot; ${fmt(perimeterFt(S.pts))} ft around` : '';
      const phone = matchMedia('(max-width:640px)').matches;   // phone: the numbers ride in the top card, the bar stays two rows
      if (phone && info && !S.err) hint.innerHTML = info;
      bar.innerHTML = `${info && !phone ? `<div class="dr-info">${info}</div>` : ''}<div class="dr-btns">
        <button type="button" data-a="undo" ${n ? '' : 'disabled'}>${S.closed ? 'Reopen' : 'Undo'}</button>
        <button type="button" data-a="clear" ${n ? '' : 'disabled'}>Start over</button>
        <button type="button" data-a="sq" class="${S.sq ? 'on' : ''}" aria-pressed="${S.sq}">Square corners</button>
        ${S.closed ? `<button type="button" class="dr-use" data-a="use" ${S.err ? 'disabled' : ''}>Use this outline</button>` : `<button type="button" class="dr-use" data-a="close" ${n >= 3 ? '' : 'disabled'}>Close shape</button>`}</div>`;
      root.querySelectorAll('[data-a]').forEach(b => { b.onclick = ev => { ev.stopPropagation(); act(b.dataset.a); }; });
      root.querySelector('[data-a="zin"]').disabled = S.lvl >= LEVELS.length - 1; root.querySelector('[data-a="zout"]').disabled = S.lvl <= 0;
    }
    function act(a) {
      if (a === 'undo') undo();
      else if (a === 'close') close();
      else if (a === 'clear') { S.pts = []; S.closed = false; S.err = ''; draw(); }
      else if (a === 'sq') { S.sq = !S.sq; draw(); }
      else if (a === 'zin') { if (S.lvl < LEVELS.length - 1) { S.lvl++; loadImg(); } }
      else if (a === 'zout') { if (S.lvl > 0) { S.lvl--; loadImg(); } }
      else if (a === 'cancel') o.onCancel && o.onCancel();
      else if (a === 'use') { dedupe(); S.err = badShape(S.pts); if (S.err || !S.closed || S.pts.length < 3) { draw(); return; } o.onUse && o.onUse(S.pts.map(p => p.slice())); }
    }
    loadImg();
    return { destroy() { if (ro) ro.disconnect(); window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); root.remove(); }, state: S };
  }
  window.RoofDraw = { mount, read, write, erase, entry, areaSqft, perimeterFt, distFt, imageUrl, LEVELS };
})();
