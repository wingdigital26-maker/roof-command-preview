/* features.js: the kept Today trials (Jack 10-11), switches in lib/rc-features.js.
   Loaded after deck.html's own script, so it reads that page's state by name (HOMES, QREADY, map, R, RM, SHOWN, relist, showToast).
   Nothing here invents a number: every figure is read from the Daily 50 on screen (HOMES) or the storm catalog (RC).
   Reduced motion: no counting, the end states only.
     daylight   the light map's tints follow the roofer's clock (dawn / day / dusk / night); ?hour=19 previews one
     briefing   the Daily 50 counts in under the greeting, then settles
     newStorm   a takeover sheet when latest-storm.json names a storm this user has not seen; once per storm per user
                (RC key stormSeen: crm_kv when signed in, this device otherwise); ?replay=storm previews it */
(function () {
  'use strict';
  const F = window.RC_FEATURES; if (!F) return;
  const q = new URLSearchParams(location.search);
  const REPLAY = q.get('replay') || '', HOLD = q.get('hold') === '1';   // hold=1: a replayed sheet waits for a tap (review only)
  const reduced = () => (typeof RM !== 'undefined' ? RM : matchMedia('(prefers-reduced-motion: reduce)')).matches;
  const roofer = () => (window.activeRoofer && activeRoofer()) || {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ready = (test, f, max) => { const t0 = performance.now(); (function w() { let ok = false; try { ok = test(); } catch (e) { } if (ok) return f(true); if (performance.now() - t0 > (max || 15000)) return f(false); setTimeout(w, 120); })(); };
  const homes = () => (typeof HOMES !== 'undefined' && typeof QREADY !== 'undefined' && QREADY) ? HOMES : null;
  const shown = () => (typeof SHOWN === 'undefined') || SHOWN;   // the opening holds Today until the reveal (deck.html SHOWN)
  const stormDate = () => (typeof R !== 'undefined' && R.storm && R.storm.date) || (RC.facts && RC.facts.storm.d) || '';

  /* ---------- real facts about today's list ---------- */
  function facts() {
    const H = homes() || [];
    const cities = [...new Set(H.map(h => h.city).filter(Boolean))];
    const hail = H.reduce((m, h) => h.hail != null ? Math.max(m, +h.hail) : m, 0);
    return { n: H.length, cities, hail, storm: stormDate() };
  }

  /* ---------- the takeover sheet ---------- */
  function sheet(inner, opts) {
    const el = document.createElement('div'); el.className = 'idw'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', opts.label);
    el.innerHTML = (opts.hail ? '<canvas aria-hidden="true"></canvas>' : '') + '<div class="idc">' + inner + '</div>';
    document.body.appendChild(el);
    const mk = el.querySelector('.idmk'); if (mk && window.rooferMark) { rooferMark(mk, roofer()); mk.classList.remove('rc-wide'); mk.style.background = roofer().markBg || '#000'; }
    let done = false, stop = null;
    const close = () => { if (done) return; done = true; if (stop) stop(); el.classList.remove('in'); el.classList.add('out'); setTimeout(() => el.remove(), 520); if (opts.onClose) opts.onClose(); };
    if (opts.hail && !reduced()) stop = hail(el.querySelector('canvas'));
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    if (opts.ms && !HOLD) setTimeout(close, opts.ms);
    return { el, close };
  }
  // falling hail: the opening's own streaks (intro-assets/intro.js), fewer and lighter, kept off the centre
  function hail(c) {
    const g = c.getContext('2d'); let run = true;
    const size = () => { c.width = c.clientWidth; c.height = c.clientHeight; }; size(); addEventListener('resize', size);
    let s = 7; const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const P = []; for (let i = 0; i < (c.width < 600 ? 110 : 190); i++) P.push({ x: R() * c.width, y: R() * c.height, len: 10 + R() * 22, a: .06 + R() * .26, v: 1.4 + R() * 2.2, w: R() < .14 ? 1.4 : .9 });
    (function draw() {
      if (!run) return; g.clearRect(0, 0, c.width, c.height); const cx = c.width / 2, cy = c.height * .46, kx = Math.min(330, c.width * .3), ky = c.height * .27;
      for (const p of P) { const depth = p.y / c.height; if (!(Math.abs(p.x - cx) < kx && Math.abs(p.y - cy) < ky)) { const a = p.a * (.25 + .75 * depth);
        g.strokeStyle = 'rgba(70,80,101,' + a + ')'; g.lineWidth = p.w; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.len * .18, p.y - p.len); g.stroke();
        g.fillStyle = 'rgba(39,87,230,' + Math.min(1, a + .2) + ')'; g.beginPath(); g.arc(p.x, p.y, .9 + depth * 1.3, 0, 7); g.fill(); }
        p.y += p.v * (.5 + depth); p.x -= p.v * .18; if (p.y > c.height + 30) { p.y = -30; p.x = R() * c.width; } }
      requestAnimationFrame(draw);
    })();
    return () => { run = false; };
  }

  /* ---------- new storm takeover: only when latest-storm.json names a storm this user has not seen ---------- */
  function stormTakeover(l) {
    const s = RC.catalog && RC.catalog.storms.find(x => x.date === l.iso) || {};
    const cities = Object.keys(l.cities_1in || {}).filter(c => l.cities_1in[c] > 0).sort((a, b) => l.cities_1in[b] - l.cities_1in[a]);
    const homesN = l.homes_1in != null ? l.homes_1in : s.homes_1in || 0, max = l.max_in != null ? l.max_in : s.max_in;
    const d = l.date || (typeof R !== 'undefined' && R.storm && R.storm.iso === l.iso ? R.storm.date : l.iso);
    const html = `<div class="idmk" aria-hidden="true"></div><span class="ideb">New storm in your area</span><h1>New storm: ${esc(d)}, ${RC.fmt(homesN)} homes</h1>` +
      `<p class="idsub"><b>${RC.fmt(homesN)}</b> homes in your service area took 1 in or larger radar hail${cities.length ? ' in <b>' + esc(window.cityLine ? cityLine(cities) : cities.join(', ')) + '</b>' : ''}. Radar-estimated size, not confirmed damage.</p>` +
      `<div class="idfacts"><span><b>${RC.fmt(homesN)}</b><small>homes, 1 in and up</small></span>${max != null ? `<span><b>${Number(max).toFixed(2)} in</b><small>biggest hail</small></span>` : ''}${cities.length ? `<span><b>${cities.length}</b><small>${cities.length === 1 ? 'city' : 'cities'} hit</small></span>` : ''}</div>` +
      `<div class="idbtns"><button type="button" class="idbtn pri" data-build>Add this storm to today's 50</button><button type="button" class="idbtn sec" data-later>Not now</button></div>`;
    const sh = sheet(html, { label: 'New storm', hail: true });
    const seen = () => { if (REPLAY !== 'storm') F.stormSeen.set(l.iso); };   // seen once, for good: never shown again for this storm
    sh.el.querySelector('[data-later]').onclick = () => { seen(); sh.close(); };
    sh.el.querySelector('[data-build]').onclick = () => { seen(); sh.close();
      // the Daily 50 engine already ranks from the newest storm (RC.SHOWCASE); rebuild the list from it and show the result
      try { if (typeof relist === 'function') relist(true); } catch (e) { }
      // the 50 are scored over every storm in the last 24 months; this storm's hail now counts (it is the newest)
      try { if (typeof showToast === 'function') showToast(`Today's 50 rebuilt. The ${esc(d)} storm's hail now counts.`); } catch (e) { } };
    return sh;
  }
  function newStormDue() {
    const l = RC.latestStorm; if (!l || !l.iso) return null;
    if (REPLAY === 'storm') return l;
    const seen = F.stormSeen.get();
    if (!seen) { F.stormSeen.set(l.iso); return null; }   // first visit for this user: nothing is "new" yet
    return l.iso > seen ? l : null;
  }

  /* ---------- mission briefing: the Daily 50 counts in under the greeting, then settles ---------- */
  function briefing() {
    const host = document.querySelector('.hello'); if (!host || document.getElementById('rcBrief')) return Promise.resolve();
    const f = facts(); if (!f.n) return Promise.resolve();
    const p = document.createElement('p'); p.className = 'idb count'; p.id = 'rcBrief'; p.setAttribute('aria-live', 'polite');
    const items = [[f.n, 'homes', 0], [f.cities.length, f.cities.length === 1 ? 'city' : 'cities', 0]];
    if (f.hail) items.push([f.hail, 'in, biggest hail on the list', 2]);
    p.innerHTML = items.map(([v, l, dp]) => `<span class="f"><b data-v="${v}" data-dp="${dp}">${dp ? (0).toFixed(dp) : 0}</b>${esc(l)}</span>`).join('') + (f.storm ? `<span class="f">newest storm <b>${esc(f.storm)}</b></span>` : '');
    host.appendChild(p);
    const fs = [...p.querySelectorAll('.f')], nums = [...p.querySelectorAll('b[data-v]')];
    return new Promise(res => {
      const settle = () => { nums.forEach(b => { b.textContent = (+b.dataset.v).toFixed(+b.dataset.dp); }); p.classList.remove('count'); res(); };
      if (reduced()) { fs.forEach(x => x.classList.add('in')); settle(); return; }
      fs.forEach((x, i) => setTimeout(() => x.classList.add('in'), 120 + i * 160));
      // a timer, not requestAnimationFrame: the map's first draw can starve frames, and the count must still land
      const t0 = performance.now() + 140, D = 1250, ease = t => 1 - Math.pow(1 - t, 3); let settled = false;
      const end = () => { if (settled) return; settled = true; clearInterval(iv); settle(); };
      const iv = setInterval(() => { const k = Math.min(1, Math.max(0, (performance.now() - t0) / D));
        nums.forEach((b, i) => { const kk = Math.min(1, Math.max(0, (k * D - i * 90) / (D - i * 90))); b.textContent = (+b.dataset.v * ease(kk)).toFixed(+b.dataset.dp); });
        if (k >= 1) setTimeout(end, 350); }, 33);
      setTimeout(end, D + 1200);   // whatever the frame rate, the real numbers are on screen by here
    });
  }

  /* ---------- time-of-day lighting: the light map's tints follow the roofer's clock ---------- */
  const TOD = {
    dawn: { bg: '#E6E3E8', water: '#CDD1DF', land: '#ECE9EE', road: '#FFFBF7', text: '#7A7E92', halo: '#F1EEF2', light: '#FFE7D2', inten: .5 },
    day: null,
    dusk: { bg: '#E4E0E2', water: '#C8CEDB', land: '#E9E5E7', road: '#FFF8F1', text: '#767A8C', halo: '#F0ECEC', light: '#FFD8B6', inten: .46 },
    night: { bg: '#D7DCE7', water: '#C1C9D9', land: '#DDE2EB', road: '#F3F6FB', text: '#6E768C', halo: '#E5E9F1', light: '#D9E3FF', inten: .34 }
  };
  const DAY = { bg: '#E3E6EC', water: '#CDD3DC', land: '#E8EBF0', road: '#FFFFFF', text: '#737B8F', halo: '#ECEEF2', light: '#FFFFFF', inten: .42 };
  function localHour() { const h = q.get('hour'); if (h != null && h !== '') return +h;
    try { return +new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: roofer().tz || 'America/Chicago' }).format(new Date()) % 24; } catch (e) { return new Date().getHours(); } }
  const todOf = h => h >= 5 && h < 8 ? 'dawn' : h >= 8 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'dusk' : 'night';
  function daylight() {
    ready(() => typeof map !== 'undefined' && map, ok => { if (!ok) return;
      const tint = document.createElement('div'); tint.className = 'idtint'; tint.setAttribute('aria-hidden', 'true'); map.getCanvas().after(tint);
      let cur = '', force = '';
      F.tod = t => { force = TOD.hasOwnProperty(t) ? t : ''; cur = ''; apply(); return force || 'day'; };   // review hook: hold one time of day
      const apply = () => { if (!map.isStyleLoaded()) return; const tod = force || todOf(localHour()); if (tod === cur) return; cur = tod; const T = TOD[tod] || DAY;
        map.getStyle().layers.forEach(l => { try {
          if (l.type === 'background') map.setPaintProperty(l.id, 'background-color', T.bg);
          if (l.type === 'fill' && /water/.test(l.id)) map.setPaintProperty(l.id, 'fill-color', T.water);
          else if (l.type === 'fill' && /landuse|park|wood|grass|residential/.test(l.id)) map.setPaintProperty(l.id, 'fill-color', T.land);
          if (l.type === 'line' && /road|highway|street|bridge|tunnel|path|rail/.test(l.id)) map.setPaintProperty(l.id, 'line-color', T.road);
          if (l.type === 'symbol' && map.getLayoutProperty(l.id, 'visibility') !== 'none') { map.setPaintProperty(l.id, 'text-color', T.text); map.setPaintProperty(l.id, 'text-halo-color', T.halo); }
        } catch (e) { } });
        try { map.setLight({ anchor: 'map', position: [1.5, 200, 38], color: T.light, intensity: T.inten }); } catch (e) { }
        tint.dataset.tod = tod; tint.classList.toggle('on', tod !== 'day'); document.documentElement.dataset.tod = tod; };
      // after deck.html's own restyle (its 'load' handler ran first), then on the clock
      if (map.loaded()) apply(); map.on('load', () => setTimeout(apply, 0)); map.once('idle', apply);
      setInterval(() => { cur = ''; apply(); }, 5 * 60 * 1000);
    });
  }

  /* ---------- run ---------- */
  if (F.daylight) daylight();
  // the list first (real numbers), then the reveal, then the takeover (if a storm is new), then the briefing
  ready(() => homes() && homes().length && shown(), ok => {
    let open = null;
    if (F.newStorm && ok) { const l = newStormDue(); if (l) open = stormTakeover(l); }
    const after = () => { if (F.briefing && ok) setTimeout(briefing, open ? 200 : 900); };   // after the reveal's crossfade
    if (open) { const prev = open.el; const t = setInterval(() => { if (!document.body.contains(prev)) { clearInterval(t); after(); } }, 150); }
    else after();
  }, 40000);
  // review hooks: RC_FEATURES.replay('storm' | 'brief')
  F.replay = what => { if (what === 'storm' && RC.latestStorm) return stormTakeover(RC.latestStorm); if (what === 'brief') { const b = document.getElementById('rcBrief'); if (b) b.remove(); return briefing(); } };
})();
