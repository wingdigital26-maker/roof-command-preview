// Command Deck shared system: roofer themes, Wing mark, icons, the drawn-roof component, home data.
(function () {
  const DK_SRC = document.currentScript && document.currentScript.src;   // where this file lives (house3d.js sits beside it)
  // Wing mark: analytic master path from creative-tools/wing-logo-3d (not restyled).
  const WING = (fill) => `<svg viewBox="0 0 63 66" aria-hidden="true"><path fill="${fill || 'currentColor'}" d="M 0 3 Q 0 0 3 0 L 27 0 Q 30.5 0 30.5 3.5 L 30.5 28.5 Q 30.5 33.5 35.5 33.5 L 60 33.5 Q 63 33.5 63 36.5 L 63 63 Q 63 66 60 66 L 36 66 Q 32.5 66 32.5 62.5 L 32.5 37.5 Q 32.5 32.5 27.5 32.5 L 3 32.5 Q 0 32.5 0 29.5 Z"/></svg>`;

  // The roofer: lib/brand.js ROOFERS (this build: Jackson Roofing only). Its storm is its own route's
  // (data/routes-dfw.js ROUTES.jackson.storm), numbers filled from its own catalog by the page (RC.factsReady).
  // Every stop's address, hail, roof and pitch are real (data/build_dfw_route.py). Pipeline counts and people are sample.
  const SAMPLE = { pipe: [['New hit', 0], ['Contacted', 0], ['Inspection booked', 0], ['Proposal', 0], ['Won', 0]], ring: { done: 0, total: 50, booked: 0, texts: 0 }, seed: 3 };
  const ROOFERS = {};
  (function () {
    const B = window.ROOFERS || {};
    Object.keys(B).forEach((k) => {
      // the working storm (RC.SHOWCASE, the newest storm in the roofer's data), never the old fixed route's storm
      const b = B[k], rs = (window.RC && RC.SHOWCASE) || '';
      const dt = rs ? new Date(rs + 'T12:00:00Z') : null, md = dt ? dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
      // a storm from another year says its year ("Aug 12, 2025"), so a rep never reads last year's hail as this week's
      const d = dt && dt.getUTCFullYear() !== new Date().getFullYear() ? md + ', ' + dt.getUTCFullYear() : md;
      ROOFERS[k] = { key: k, name: b.name, rep: b.owner, city: b.city, zip: b.zip || '', area: b.area, licence: b.licence || null, state: b.state, areaCode: b.areaCode,
        accent: b.accent, accentHi: b.accentHi || b.accent, soft: b.soft, ink: b.ink, ownData: !!b.dataRoot,
        storm: { date: d, iso: rs, mon: md.split(' ')[0] || '', day: md.split(' ')[1] || '', year: dt ? dt.getUTCFullYear() : null, homes: '', max: '', county: b.area },
        prior: [], pipe: SAMPLE.pipe.map((p) => p.slice()), ring: Object.assign({}, SAMPLE.ring), logo: b.logo, wide: !!b.wide, markBg: b.markBg || '', seed: SAMPLE.seed };
    });
  })();
  const DEFAULT_KEY = window.rooferKey ? window.rooferKey() : 'jackson';
  // the key whose route and roofs the deck draws for this roofer (its own data only)
  const dataKey = (key) => key;

  const I = {
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h3.2l1.6 4-2 1.3a11 11 0 0 0 6.9 6.9l1.3-2 4 1.6V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
    text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5v4h4M10 12h5M10 15.5h5"/></svg>',   // Proof Page (Bet 3)
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/></svg>',
    skip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l7 6-7 6M16 6v12"/></svg>',
    hail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="15" r="3"/><circle cx="16.5" cy="9" r="4"/><circle cx="16" cy="18.5" r="1.6"/></svg>',
    roof: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 12 12 4.5 21 12M6 10v9.5h12V10"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5v4h4M10 12h5M10 15.5h5"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 19.5h14M14.5 5.5l3 3L9 17H6v-3z"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    ruler: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3.5 16 16 3.5l4.5 4.5L8 20.5z"/><path d="M7 12.5l2 2M10 9.5l2 2M13 6.5l2 2"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 11 12 4l8 7v9h-5.5v-6h-5v6H4z"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 6.5 9 4l6 2.5 6-2.5v13l-6 2.5-6-2.5-6 2.5zM9 4v13M15 6.5v13"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m12 4 8 4.5-8 4.5-8-4.5zM4 13l8 4.5 8-4.5M4 17l8 4.5 8-4.5"/></svg>',
    expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/></svg>'
  };


  // Real roofs: the app's roof solver (js/roofplan.js), the spec converter (lib/real-roof.js) and every stop's
  // real building outline (data/roofs-dfw.js, built by data/build_dfw_route.py). Loaded in order right after this file
  // while the page is still parsing, so the page's own script sees them; pages that already loaded them skip this.
  (function load() {
    const cs = document.currentScript;
    if (!cs || !cs.src || document.readyState !== 'loading') return;
    const need = [['RCROOF', '../lib/rc-roof.js'], ['STM', '../lib/st-meta.js'], ['RoofPlan', '../js/roofplan.js'], ['RealRoof', '../lib/real-roof.js'], ['ROOFS_DFW', 'data/roofs-dfw.js']].filter(([g]) => g === 'ROOFS_DFW' ? !(window.ROOFS && ROOFS.jackson) : !window[g]);
    need.forEach(([, path]) => document.write('<script src="' + new URL(path, cs.src).href + '"><\/script>'));
  })();

  /* ----------------------------------------------------------------------------------
     Drawn roof component. A roof is a SPEC: planes as polygons in feet (x east, y south,
     z height above the eave), each with a pitch; edges typed ridge/hip/valley/eave/rake.
     Everything shown is COMPUTED from the spec: plane area = plan area x pitch factor,
     edge length = 3D distance. Concept numbers from a drawing, not a field measurement.
  ---------------------------------------------------------------------------------- */
  const P = (x, y, z) => [x, y, z || 0];

  const factor = (rise) => Math.sqrt(1 + (rise / 12) ** 2);
  function planArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; }
  const len3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  function roofMeasure(spec) {
    if (!spec || spec.none) return { none: true, planes: [], area: 0, squares: null, edges: { ridge: 0, hip: 0, valley: 0, eave: 0, rake: 0 }, waste: 0, predominant: '', facets: 0, order: null };
    const planes = spec.planes.map(pl => { const plan = planArea(pl.pts), area = Math.round(plan * factor(pl.rise)); return { id: pl.id, name: pl.name, rise: pl.rise, plan: Math.round(plan), area, squares: Math.round(area / 10) / 10, hit: spec.hit.includes(pl.id) }; });
    const area = planes.reduce((s, p) => s + p.area, 0);
    const squares = Math.round(planes.reduce((s, p) => s + p.squares * 10, 0)) / 10;
    const edges = {};
    ['ridge', 'hip', 'valley', 'eave', 'rake'].forEach(t => { edges[t] = Math.round(spec.edges.filter(e => e.type === t).reduce((s, e) => s + len3(e.a, e.b), 0)); });
    const complexity = (spec.edges.filter(e => e.type === 'hip').length + 2 * spec.edges.filter(e => e.type === 'valley').length);
    const waste = complexity === 0 ? 10 : complexity <= 4 ? 12 : complexity <= 8 ? 15 : 18;
    const byPitch = {}; planes.forEach(p => byPitch[p.rise] = (byPitch[p.rise] || 0) + p.area);
    const predominant = Object.entries(byPitch).sort((a, b) => b[1] - a[1])[0][0];
    // a real home: its squares (measured facets or the outline estimate) drive the order, never the drawn planes' own sum;
    // a measured home keeps the report's waste and its full pitch line ("12/12 + 7/12")
    if (spec.real) { const sq = spec.squares != null ? spec.squares : squares, w = spec.waste != null ? spec.waste : waste;
      return { planes, area, squares: sq, edges, waste: w, predominant: spec.facet && spec.pitchText ? spec.pitchText : predominant + '/12', facets: planes.length, order: Math.round(sq * (1 + w / 100) * 10) / 10, real: true, label: spec.label, measured: !!spec.facet }; }
    return { planes, area, squares, edges, waste, predominant: predominant + '/12', facets: planes.length, order: Math.round(squares * (1 + waste / 100) * 10) / 10 };
  }

  // Shading: light from the north-west. Cool greys from the Wing site palette family.
  const LIGHT = [-0.6, -0.8];
  function planeFill(dir) { const b = dir[0] * LIGHT[0] + dir[1] * LIGHT[1]; const L = 77 + b * 7.5; return `hsl(222 16% ${L.toFixed(1)}%)`; }
  const EDGE_COL = { ridge: 'var(--ink)', hip: 'var(--blue)', valley: 'var(--accent)', eave: 'var(--edge)', rake: 'var(--brass)' };
  const EDGE_LABEL = { ridge: 'Ridge', hip: 'Hip', valley: 'Valley', eave: 'Eave', rake: 'Rake' };

  function inPoly(x, y, pts) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
  function dims(spec, fs) {
    // dimension lines along every eave segment, offset outward from the footprint centroid
    const fp = spec.fp, cx = fp.reduce((s, p) => s + p[0], 0) / fp.length, cy = fp.reduce((s, p) => s + p[1], 0) / fp.length;
    let out = '';
    spec.edges.filter(e => e.type === 'eave').forEach(e => {
      const [ax, ay] = e.a, [bx, by] = e.b, L = Math.hypot(bx - ax, by - ay); if (L < 6) return;
      let nx = -(by - ay) / L, ny = (bx - ax) / L; const mx = (ax + bx) / 2, my = (ay + by) / 2;
      if ((mx - cx) * nx + (my - cy) * ny < 0) { nx = -nx; ny = -ny; }
      const off = 5, ax2 = ax + nx * off, ay2 = ay + ny * off, bx2 = bx + nx * off, by2 = by + ny * off;
      const t = 1.4, tx = ax2 + nx * t, ty = ay2 + ny * t, lx = mx + nx * (off + 2.6), ly = my + ny * (off + 2.6);
      out += `<g class="dim"><line x1="${ax + nx * 1.2}" y1="${ay + ny * 1.2}" x2="${ax2 + nx * .8}" y2="${ay2 + ny * .8}"/><line x1="${bx + nx * 1.2}" y1="${by + ny * 1.2}" x2="${bx2 + nx * .8}" y2="${by2 + ny * .8}"/><line class="dl" x1="${ax2}" y1="${ay2}" x2="${bx2}" y2="${by2}"/><text x="${lx}" y="${ly}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle">${Math.round(L)}'</text></g>`;
    });
    return out;
  }

  // Returns the SVG markup. opts.simple = card thumbnail (no labels, no interaction hooks).
  function roofSVG(spec, opts) {
    opts = opts || {};
    if (!spec || spec.none) return noneSVG(spec);
    const pad = opts.simple ? 4 : 12, xs = spec.fp.map(p => p[0]), ys = spec.fp.map(p => p[1]);
    const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, x1 = Math.max(...xs) + pad, y1 = Math.max(...ys) + pad + (opts.simple ? 4 : 2);
    const vw = x1 - x0, vh = y1 - y0, fs = Math.max(2.2, vw / 34);
    const id = 'r' + spec.seed;
    const planes = spec.planes.map(pl => `<polygon class="pl${spec.hit.includes(pl.id) ? ' hit' : ''}" data-plane="${pl.id}" points="${pl.pts.map(p => p[0] + ',' + p[1]).join(' ')}" fill="${planeFill(pl.dir)}"/>`).join('');
    const edges = spec.edges.map(e => `<line class="eg ${e.type}" x1="${e.a[0]}" y1="${e.a[1]}" x2="${e.b[0]}" y2="${e.b[1]}" stroke="${EDGE_COL[e.type]}"/>`).join('');
    const fpPts = spec.fp.map(p => p.join(',')).join(' ');
    const drive = `<rect class="drive" x="${spec.drive[0]}" y="${spec.yb}" width="${spec.drive[1] - spec.drive[0]}" height="${pad + 40}" rx=".8"/>`;
    const walk = `<path class="walk" d="M${spec.drive[0] - 3} ${spec.yb + 6}h${-(spec.drive[0] - 3 - (spec.fp[0][0] + 10))}v${-6}" />`;
    const street = `<rect class="street" x="${x0 - 200}" y="${y1 - (opts.simple ? 3 : 0) + 200 - 200}" width="${vw + 400}" height="200"/>`;
    return `<svg class="roofsvg${opts.simple ? ' simple' : ''}" viewBox="${x0} ${y0} ${vw} ${vh}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-label="Roof drawing">
      <defs><filter id="${id}sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx=".9" dy="1.6" stdDeviation="1.3" flood-color="#0B1020" flood-opacity=".22"/></filter></defs>
      <rect class="yard" x="${x0 - 400}" y="${y0 - 400}" width="${vw + 800}" height="${vh + 800}"/>
      ${opts.simple ? '' : street + drive}
      <polygon class="fp" points="${fpPts}" filter="url(#${id}sh)"/>
      <g class="planes">${planes}</g>
      <g class="edges">${edges}</g>
      ${opts.simple ? '' : `<g class="dims">${dims(spec, fs)}</g>`}
    </svg>`;
  }

  // Mounts the interactive version into el. Returns a controller.
  function mountRoof(el, spec, opts) {
    opts = opts || {};
    const M = roofMeasure(spec);
    el.classList.add('roofwrap');
    if (!spec || spec.none) { // honest empty state: no outline, so no drawing and no squares
      el.innerHTML = `<div class="rnone" style="position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:24px;color:var(--slate,#5B6475);font-size:14px;line-height:1.45"><div><b style="display:block;color:var(--ink,#0B1020);font-size:16px;margin-bottom:4px">No outline on file for this home</b>No building outline sits within 25 m of this stop, so there is no roof to measure yet.</div></div>`;
      const noop = () => {};
      return { M, state: { mode: 'planes', hail: false, selected: null, hover: null }, el, setMode: noop, toggleHail: noop, select: noop, hover: noop, refresh: noop };
    }
    el.innerHTML = roofSVG(spec, {}) + `<div class="rtip" hidden></div>
      <div class="rcompass" aria-hidden="true"><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="14.5" fill="#fff" stroke="rgba(11,16,32,.14)"/><path d="M16 6l4 11-4-2.4L12 17z" fill="var(--ink)"/><path d="M16 26l-4-11 4 2.4 4-2.4z" fill="rgba(11,16,32,.18)"/></svg><span>N</span></div>
      <div class="rscale" aria-hidden="true"><i></i><span>20 ft</span></div>`;
    const svg = el.querySelector('svg'), tip = el.querySelector('.rtip');
    const state = { mode: 'planes', hail: false, selected: null, hover: null };
    const byId = (id) => M.planes.find(p => p.id === id);
    function scale() { const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal; const s = Math.min(r.width / vb.width, r.height / vb.height); el.querySelector('.rscale i').style.width = (20 * s) + 'px'; }
    function apply() {
      el.dataset.mode = state.mode; el.classList.toggle('hail-on', state.hail);
      svg.querySelectorAll('.pl').forEach(p => { p.classList.toggle('sel', p.dataset.plane === state.selected); p.classList.toggle('hov', p.dataset.plane === state.hover); });
      if (opts.onChange) opts.onChange(state, M);
    }
    function showTip(id, x, y) {
      const p = byId(id); if (!p) return;
      tip.innerHTML = `<b>${p.name}</b><span>Pitch est. ${p.rise}/12</span><span>~${p.area.toLocaleString()} sq ft</span><span class="sq">~${p.squares} sq (est.)</span>${p.hit ? '<span class="hit">Hail marks</span>' : ''}`;
      tip.hidden = false; const r = el.getBoundingClientRect(); const tx = Math.min(r.width - tip.offsetWidth - 10, Math.max(10, x - r.left + 14)); const ty = Math.max(10, y - r.top - tip.offsetHeight - 14);
      tip.style.transform = `translate(${tx}px, ${ty}px)`;
    }
    svg.addEventListener('pointermove', (e) => { const pl = e.target.closest('.pl'); const id = pl ? pl.dataset.plane : null; if (id !== state.hover) { state.hover = id; apply(); } if (id && e.pointerType !== 'touch') showTip(id, e.clientX, e.clientY); else if (!id) tip.hidden = true; });
    svg.addEventListener('pointerleave', () => { state.hover = null; tip.hidden = true; apply(); });
    svg.addEventListener('click', (e) => { const pl = e.target.closest('.pl'); state.selected = pl ? (state.selected === pl.dataset.plane ? null : pl.dataset.plane) : null; apply(); if (opts.onSelect) opts.onSelect(state.selected ? byId(state.selected) : null, M); });
    const ctl = {
      M, state, el,
      setMode(m) { state.mode = m; apply(); }, toggleHail(v) { state.hail = v === undefined ? !state.hail : v; apply(); },
      select(id) { state.selected = id; apply(); if (opts.onSelect) opts.onSelect(id ? byId(id) : null, M); },
      hover(id) { state.hover = id; apply(); if (id) { const p = svg.querySelector(`[data-plane="${id}"]`); const b = p.getBoundingClientRect(); showTip(id, b.left + b.width / 2, b.top + b.height / 2); } },
      refresh: scale
    };
    window.addEventListener('resize', scale); requestAnimationFrame(scale); apply();
    return ctl;
  }

  // Today's homes: each stop is a real home that took 1 inch or larger hail on the showcase storm by the app's own
  // per-home radar value, with its county address, its own building outline, LiDAR pitch and reroof-permit lookup
  // (data/build_dfw_route.py). People, phones and opt-ins are added by the page and labelled sample.
  const ABBR = { Avenue: 'Ave', Street: 'St', Drive: 'Dr', Lane: 'Ln', Boulevard: 'Blvd', Court: 'Ct', Parkway: 'Pkwy', Terrace: 'Ter', Road: 'Rd', Place: 'Pl', Circle: 'Cir' };
  const short = (s) => s.replace(/\b(Avenue|Street|Drive|Lane|Boulevard|Court|Parkway|Terrace|Road|Place|Circle)\b/g, (m) => ABBR[m]);
  // the roof-age rule (RC.roofEvidence, 10-26): no permit outside a complete-permit city = roof age unknown, never an old roof
  function roofAge(s) { return s.permit ? 'Reroof permit ' + s.permit.slice(0, 4) : RC.roofEvidence(s.city, s.year, null).text; }
  function homes(key) {
    const r = ROOFERS[key] || ROOFERS[DEFAULT_KEY]; key = dataKey(key); const route = (window.ROUTES || {})[key];
    const out = route.stops.map((s, i) => {
      const addr = `${s.num} ${s.name}`;
      const seed = (r.seed || 1) * 50 + i, spec = realSpec(key, i + 1, seed), M = roofMeasure(spec);
      return {
        n: 1 + i, addr, short: short(addr), street: s.name, loc: s.loc, fp: s.fp, city: s.city || null, zip: s.zip || null,
        hail: s.hail != null ? Number(s.hail).toFixed(2) : null, year: s.year || null, permit: s.permit || null, roofAge: roofAge(s),
        sq: M.squares, pitch: M.predominant || null, pitchMeasured: !!spec.pitchMeasured, spec, M, seed,
        gi: s.gi != null ? s.gi : null, subdivision: s.subdivision || null, sqft: s.living_sqft || null, state: s.state || null
      };
    });
    patchPage();
    return out;
  }
  // this stop's real roof: its building outline (data/roofs-dfw.js) through the app's roof solver; none = no outline on file
  function realSpec(key, n, seed) {
    const all = window.ROOFS && window.ROOFS[key], entry = all ? all['stop' + n] : null;
    return window.RealRoof ? window.RealRoof.spec(entry, { seed }) : { none: true, planes: [], edges: [], hit: [], fp: [[0, 0], [1, 0], [1, 1], [0, 1]], drive: [0, 0], yb: 1, seed, label: 'No outline on file for this home' };
  }
  function noneSVG(spec) {
    const t1 = spec && spec.loading ? 'Loading the outline' : 'No outline on file', t2 = spec && spec.loading ? 'for this home' : 'for this home';
    return `<svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid meet" role="img" aria-label="No outline on file for this home"><rect x="18" y="16" width="124" height="68" rx="10" fill="rgba(11,16,32,.04)" stroke="rgba(11,16,32,.28)" stroke-width="1.4" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/><text x="80" y="47" text-anchor="middle" font-size="9.5" font-weight="700" fill="#0B1020">${t1}</text><text x="80" y="60" text-anchor="middle" font-size="7.5" fill="#5B6475">${t2}</text></svg>`;
  }
  // The deck page draws its own card art and labels. Its functions are plain page globals, so the real-roof
  // wording is added around them here (once, before the page first renders): no-outline stops get the honest
  // empty state, real roofs say where the numbers come from. If the page markup changes, the original text stays.
  let patched = false;
  function patchPage() {
    if (patched) return; patched = true;
    const w = window;
    if (typeof w.platedRoof === 'function') { const o = w.platedRoof; w.platedRoof = function (spec) { return !spec || spec.none ? noneSVG(spec) : o.apply(this, arguments); }; }
    if (typeof w.phHTML === 'function') {
      const o = w.phHTML;
      w.phHTML = function (h) {
        const html = o.apply(this, arguments); if (!h || !h.spec) return html;
        // Jack 10-17: one short line, the squares and what red means; no facet count, no storey chip (easier to read)
        const sq = h.sq != null ? Math.round(h.sq * 10) / 10 : null;   // one decimal, like the CRM and the Proof Page (visual check 10-23)
        // 10-22: squares only from the LiDAR record (an estimate), and the stand-in house says its shape is being checked
        const lidar = !!(h.spec.facetRec || h.spec.facet3d), chk = h.spec.checking ? ', shape being checked' : '';
        // chip: the short form of RCROOF.SQ_NOTE (Jack 10-23: about 10% of permit records, order a report before quoting)
        const txt = h.spec.loading ? 'Loading the outline' : h.spec.none ? 'No outline on file' : !lidar && !h.spec.drawn ? 'Roof size not measured' + chk : `<span>${window.RCPLAIN ? RCPLAIN.size(sq) : '~' + sq + ' sq'}<em class="lw"></em><em class="ls"></em><i>, an estimate: order a measurement report before you quote</i></span>`;   // no 'red took the hail': no plane is drawn red on these stops (10-17)
        return html.replace(/(<div class="bl"><span class="sw"><\/span>)[\s\S]*?(<\/div>)/, (m, a, b) => a + txt + b);
      };
    }
    // (the page's own why() states the no-outline case since the Daily 50 engine; no wrap here)
    // homes added from the storm map ('m<index>'): their own footprint through the same converter, never the generator
    if (typeof w.addedHomes === 'function' && window.RealRoof && RealRoof.mapEntry) {
      const o = w.addedHomes; let pending = 0;
      w.addedHomes = function () {
        const list = o.apply(this, arguments), want = [];
        list.forEach(h => {
          const m = /^m(\d+)$/.exec(h.id || ''), got = m ? RealRoof.mapCached(m[1]) : null;
          if (m && got === undefined) { want.push([m[1], h.loc]); h.spec = Object.assign(RealRoof.none(h.seed), { loading: true, label: 'Loading the outline' }); }
          else h.spec = got ? RealRoof.spec(got, { seed: h.seed }) : RealRoof.none(h.seed);
          h.M = roofMeasure(h.spec); h.sq = h.M.squares; h.pitch = h.M.predominant || null; h.pitchMeasured = !!h.spec.pitchMeasured;
          const f = got && got.facts; if (f) { if (f.addr) { h.addr = f.addr; h.short = short(f.addr); } h.city = f.city || h.city; h.zip = f.zip || h.zip; h.year = f.year; h.permit = f.permit; h.roofAge = f.roofAge; }
        });
        if (want.length) { pending++; Promise.all(want.map(([i, loc]) => RealRoof.mapEntry(i, loc[0], loc[1]))).then(() => {
          if (--pending) return; try { w.buildList(); w.buildCards(); w.layout(false); } catch (e) { /* page shape changed: next render picks the outlines up */ } }); }
        return list;
      };
    }
    patchMapSpeed(w);
    patchHouse3D(w);
    if (typeof w.renderTab === 'function') {
      const o = w.renderTab;
      w.renderTab = function (h) {
        const tab = document.getElementById('rsTab');
        if (h && h.spec && h.spec.none) { if (tab) tab.innerHTML = '<p>No outline on file for this home, so there are no planes, squares or edge lengths to show.</p>'; return; }
        o.apply(this, arguments);
        if (tab && h && h.spec && h.spec.real) tab.querySelectorAll('p').forEach(p => { p.innerHTML = p.innerHTML.replace('Measured from the drawing, sample.', h.spec.label + '.'); });
      };
    }
  }

  // Map speed (10-10, measured in DATA-TRUTH-1010 / map profile): the 'every home in the area' dot layer drew all
  // ~271k homes on every frame, at every zoom, and its data object was rebuilt on every redraw (a 2 MB re-upload).
  // Zoomed out, 271k one-pixel dots sit on top of each other, so the layer now draws a thinned set there (every 8th home
  // out at the county, every 2nd near street level, alpha raised to keep the same tone) and, zoomed in, only the homes
  // in view. Same look, a fraction of the GPU work per frame. The data objects are cached so a redraw re-uploads nothing.
  // Lives here (not in deck.html) like the other wraps: the page's functions and BULK/map are plain page globals.
  function patchMapSpeed(w) {
    if (typeof w.bulkLayers !== 'function' || typeof w.startMap !== 'function' || param('fulldots')) return;   // ?fulldots=1: the old layer, for A/B
    const orig = w.bulkLayers; let src = null, sets = {}, view = null, lastKey = '';
    const stepAt = z => z < 10.5 ? 8 : z < 11.5 ? 4 : z < 12.5 ? 2 : 1;
    function setFor(map) {
      const all = BULK.all, n = BULK.nAll; if (src !== all) { src = all; sets = {}; view = null; }
      const z = map.getZoom(), step = stepAt(z);
      if (step > 1) {
        if (!sets[step]) { const m = Math.ceil(n / step), a = new Float32Array(m * 2); let k = 0;
          for (let i = 0; i < n; i += step) { a[k * 2] = all[i * 2]; a[k * 2 + 1] = all[i * 2 + 1]; k++; }
          sets[step] = { key: 's' + step, step, data: { length: k, attributes: { getPosition: { value: a.subarray(0, k * 2), size: 2 } } } }; }
        return sets[step];
      }
      // street level: only the homes in (and just around) the view
      const b = map.getBounds(), px = (b.getEast() - b.getWest()) * .5, py = (b.getNorth() - b.getSouth()) * .5;
      const x0 = b.getWest() - px, x1 = b.getEast() + px, y0 = b.getSouth() - py, y1 = b.getNorth() + py;
      if (view && x0 >= view.box[0] && x1 <= view.box[2] && y0 >= view.box[1] && y1 <= view.box[3]) return view;
      const out = new Float32Array(n * 2); let k = 0;
      for (let i = 0; i < n; i++) { const x = all[i * 2], y = all[i * 2 + 1]; if (x < x0 || x > x1 || y < y0 || y > y1) continue; out[k * 2] = x; out[k * 2 + 1] = y; k++; }
      view = { key: 'v' + x0.toFixed(4) + y0.toFixed(4), step: 1, box: [x0, y0, x1, y1], data: { length: k, attributes: { getPosition: { value: out.slice(0, k * 2), size: 2 } } } };
      return view;
    }
    const hitData = { src: null, data: null };
    w.bulkLayers = function () {
      const L = orig.apply(this, arguments);
      try {
        if (!L.length || typeof map === 'undefined' || !map || !BULK.all) return L;
        const s = setFor(map); lastKey = s.key;
        return L.map(l => {
          if (l.id === 'homes-all') {
            const c = l.props.getFillColor, a = s.step > 1 ? Math.min(255, Math.round(c[3] * (1 + .3 * Math.log2(s.step)))) : c[3];
            return l.clone({ data: s.data, getFillColor: [c[0], c[1], c[2], a] });
          }
          if (l.id === 'homes-hit') {
            if (hitData.src !== BULK.hit) { hitData.src = BULK.hit; hitData.data = { length: BULK.nHit, attributes: { getPosition: { value: BULK.hit, size: 2 } } }; }
            return l.clone({ data: hitData.data });
          }
          return l;
        });
      } catch (e) { return L; }
    };
    // the page redraws its layers only when the outlines change: redraw the dots when the zoom band or the view set changes
    const os = w.startMap;
    w.startMap = function () {
      const r = os.apply(this, arguments);
      try {
        if (typeof map !== 'undefined' && map) map.on('moveend', () => {
          if (!BULK.all || typeof fpRedraw !== 'function') return;
          const s = setFor(map); if (s.key !== lastKey) fpRedraw();
        });
      } catch (e) { }
      return r;
    };
    w.__mapSpeed = () => ({ key: lastKey, drawn: (typeof map !== 'undefined' && map && BULK.all) ? setFor(map).data.length : null, all: BULK.nAll });
  }

  // The house in 3D on the stop card (10-17): the CRM record's model (house3d.js, the same lib/real-roof.js spec the
  // card's flat drawing uses) replaces the top-down picture once it has drawn. three.js loads only after Today has
  // painted (two frames, then idle time); until the first frame the flat drawing stays. One renderer for every stop:
  // the canvas follows the current card (layout) and the model is rebuilt when the stop or its outline changes
  // (paintRoof repaints the band when an outline lands). ?no3d=1 keeps the flat picture.
  function patchHouse3D(w) {
    const no3d = () => { try { w.document.documentElement.classList.add('no3d'); } catch (e) { } };   // the flat drawing shows again (dk.css)
    if (param('no3d') || typeof w.layout !== 'function' || !w.WebGLRenderingContext) { no3d(); return; }
    const here = new URL('house3d.js', DK_SRC || location.href).href;   // next to this file (currentScript is gone by the time the page patches)
    let ctl = null, kicked = false, lastSpec = null, lastId = null, loadedAt = 0;
    const after = (name, fn) => { if (typeof w[name] !== 'function') return; const o = w[name]; w[name] = function () { const r = o.apply(this, arguments); try { fn(); } catch (e) { } return r; }; };
    function sync() {
      if (!ctl || typeof w.__deckState !== 'function') return;
      const st = w.__deckState(); if (!st || !st.homes || !st.homes.length) return;
      const h = st.homes[st.cur]; if (!h) return;
      const card = document.querySelector('.card[data-i="' + st.cur + '"]'), link = card && card.querySelector('.ph .rlink'); if (!link) return;
      const ph = link.parentNode;
      if (ctl.canvas.parentNode !== link) { const old = ctl.canvas.parentNode && ctl.canvas.parentNode.parentNode; if (old && old.classList) old.classList.remove('has3d'); link.appendChild(ctl.canvas); ctl.resize(); }
      if (h.spec === lastSpec && h.id === lastId) { if (ctl.stats.frames() > 0 && ctl.key() === h.id) ph.classList.add('has3d'); return; }   // same model, a repainted band: the picture is already drawn
      ph.classList.remove('has3d'); ctl.markSwitch();
      const flat = !h.spec || h.spec.none || h.spec.loading; ph.classList.toggle('flat', !!flat);   // no outline yet / on file: the band's own text shows
      if (flat) { lastSpec = h.spec; lastId = h.id; return; }
      lastSpec = h.spec; lastId = h.id;
      ctl.build(h.spec, h.id);
    }
    let loading = false;
    function load() {
      if (loading) return; loading = true;
      import(here).then(m => {
        ctl = m.create({ onFrame: () => { const ph = ctl.canvas.parentNode && ctl.canvas.parentNode.parentNode; if (ph && ph.classList) ph.classList.add('has3d'); } });
        loadedAt = performance.now();
        w.__house3d = { ctl, loadedAt, stats: ctl.stats, sync };
        sync(); ctl.start();
      }).catch(() => { ctl = null; no3d(); });
    }
    function kick() {
      if (kicked) return; kicked = true;
      requestAnimationFrame(() => requestAnimationFrame(() => { if (w.requestIdleCallback) w.requestIdleCallback(load, { timeout: 3000 }); else setTimeout(load, 800); }));
      setTimeout(load, 4000);   // a frame whose animation frames are held (parked, background tab) still gets the model once it is shown
    }
    after('layout', () => { kick(); sync(); });
    after('paintRoof', sync);
  }

  function theme(key, root) {
    const r = ROOFERS[key] || ROOFERS[DEFAULT_KEY], el = root || document.documentElement;
    el.style.setProperty('--accent', r.accent); el.style.setProperty('--accent-hi', r.accentHi);
    el.style.setProperty('--accent-soft', r.soft); el.style.setProperty('--accent-ink', r.ink);
    document.querySelectorAll('[data-r]').forEach((n) => { const k = n.dataset.r; n.textContent = k.split('.').reduce((o, p) => o[p], r); });
    document.querySelectorAll('[data-logo]').forEach((n) => { n.innerHTML = r.logo; n.classList.toggle('rc-wide', !!r.wide); n.style.background = r.markBg || ''; });
    document.querySelectorAll('[data-wing]').forEach((n) => { n.innerHTML = WING(n.dataset.wing || '#2757E6'); });
    document.querySelectorAll('[data-i]').forEach((n) => { n.innerHTML = I[n.dataset.i] || ''; });
    document.title = r.name + ' | Roof Command';
    return r;
  }
  const param = (k, d) => new URLSearchParams(location.search).get(k) || d;
  // the active roofer: ?roofer= on this page, else the one the shell keeps in rc-state, else jackson
  const rooferKey = () => { const k = param('roofer', DEFAULT_KEY); return ROOFERS[k] ? k : DEFAULT_KEY; };
  window.DK = { WING, ROOFERS, I, realSpec, roofMeasure, roofSVG, mountRoof, EDGE_LABEL, EDGE_COL, homes, theme, param, short, rooferKey, dataKey, patch: patchPage };
})();
