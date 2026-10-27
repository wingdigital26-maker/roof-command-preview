/* reach.js: the Today map's outreach layer, drawn as BEAMS of light from the roofer's base (lib/brand.js hq).
   One beam runs from the base to every home contacted from this device (RC.contacted: calls logged, texts opened in
   Messages, email drafts), one per home and channel: a blue glow, a white core with a moving digital tick, and a light
   pulse travelling from the base to the home. A fainter chained stroke links the base and today's homes in message order
   (base -> home 1 -> home 2 ..., the order of the Daily 50; nobody drives it). A scheduled text (RC.scheduled, a reminder: nothing sends on its own) is a dimmer
   dashed beam with a countdown label. Nothing here is sample: with no contacts the map shows only the route chain.
   Click a beam (or the reached home's pin, via openFor) -> a popover with exactly what was sent; hover -> one-line tip.
   Keyboard: a visually hidden list of the beams (focus highlights a beam, Enter opens its popover, Esc closes).
   Drawn as an SVG in screen space under the pins, so a beam always ends on its pin even when pins are nudged apart.
   Reach.mount(map, opts) -> { draw, update, extraLocs, hqLoc, legend, has(id), openFor(id, pt), close() }
   opts: homes() -> [{id,n,loc,addr,short,gi,phone}] (every pinned home), route() -> the same in route order (the chain;
         default homes()), pinOf(id) -> {x,y} | null (pin centre in map pixels), pinEl(id),
         visible() -> bool, legendHost, onLayout(), top(), homeOf(id), onOpenHome(id) */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  // pin and footprint colours per channel (the beams themselves are all blue and white light)
  const CH = {
    text: { label: 'Text', color: '#0D6C99', bow: .07, lift: .42 },
    email: { label: 'Email', color: '#5B4BA8', bow: .11, lift: .5 },
    call: { label: 'Call', color: '#8A5A00', bow: .03, lift: .34 }
  };
  const SV = p => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  const ICON = {
    call: SV('<path d="M5 4h3.2l1.6 4-2 1.3a11 11 0 0 0 6.9 6.9l1.3-2 4 1.6V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
    text: SV('<path d="M4 5h16v11H9l-5 4z"/>'),
    email: SV('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>'),
    sched: SV('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>'),
    x: SV('<path d="M6 6l12 12M18 6 6 18"/>'),
    go: SV('<path d="M5 12h14M13 6l6 6-6 6"/>')
  };
  const OUTL = { no_answer: 'No answer', spoke: 'Spoke with the homeowner', booked: 'Inspection booked', wrong: 'Wrong number', note: 'Call note' };
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  const DAYK = 'rc.reachDay2';   // this device's chosen day: 'all' (default) | 'today' | a date (not an rc.t. key)
  const el = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a || {}) e.setAttribute(k, a[k]); return e; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const tm = iso => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const full = iso => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' + tm(iso);
  const pretty = p => p && /^\+1\d{10}$/.test(p) ? `(${p.slice(2, 5)}) ${p.slice(5, 8)}-${p.slice(8)}` : (p || '');

  function mount(map, opts) {
    const r = (window.activeRoofer && activeRoofer()) || {};
    const hq = r.hq && r.hq.loc ? r.hq : { name: (r.name || 'Base') + (r.city ? ', ' + r.city : ''), loc: r.center || [-96.75, 33.02], approx: true };
    let day = 'all'; try { day = localStorage.getItem(DAYK) || 'all'; } catch (e) { }
    const dayOf = at => new Date(at).toDateString(), TODAY = () => new Date().toDateString();
    const dayName = d => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const homeOf = id => (opts.homeOf && opts.homeOf(id)) || RC.recall(id) || {};
    const addrOf = id => { const h = homeOf(id); return h.short || h.addr || 'Home on file'; };

    // ---- SVG layer, just above the map canvas and under every marker ----
    const svg = el('svg', { class: 'reach', 'aria-hidden': 'true' });
    const gS = el('g', { class: 'rs' }), gC = el('g', { class: 'rc' }), gQ = el('g', { class: 'rq' }), gA = el('g', { class: 'ra' }), gX = el('g', { class: 'rx' }), gP = el('g', { class: 'rp' });
    // direction B (Jack 10-09): the glow runs as one gradient from the base (blue) to the homes (teal), in screen space so
    // a near-vertical beam gets the same colours as a flat one (draw() points it from the base at today's homes)
    const defs = el('defs'), grad = el('linearGradient', { id: 'reachGrad', gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: 1, y2: 0 });
    grad.append(el('stop', { offset: '0', 'stop-color': '#1F6FE0' }), el('stop', { offset: '1', 'stop-color': '#0D6C99' })); defs.appendChild(grad);
    svg.append(defs, gS, gC, gQ, gA, gX, gP);
    const canvas = map.getCanvas();
    // the fan (Jack 10-10): one thin arc from the base to EVERY home on today's list, in list order, each drawing out
    // after the one before with a bright head and a soft trail, landing on its pin with a small pulse. One 2D canvas
    // under the SVG (not 50 animated DOM nodes): the intro runs once (about 5 s), after that the fan is redrawn only
    // when the map moves. A reached home's arc is replaced by its sent beam (the SVG above).
    const fan = document.createElement('canvas'); fan.className = 'fan'; fan.setAttribute('aria-hidden', 'true');
    canvas.after(fan); fan.after(svg);
    const chainCase = el('path', { class: 'chc' }), chain = el('path', { class: 'chn' }); gC.append(chainCase, chain);
    const wrap = map.getContainer().parentElement;
    const labs = document.createElement('div'); labs.className = 'rlab'; labs.setAttribute('aria-hidden', 'true'); wrap.appendChild(labs);
    const tip = document.createElement('div'); tip.className = 'btip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true; wrap.appendChild(tip);
    const pop = document.createElement('div'); pop.className = 'bpop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'What was sent'); pop.hidden = true; wrap.appendChild(pop);
    const blist = document.createElement('div'); blist.className = 'blist'; blist.setAttribute('role', 'group'); blist.setAttribute('aria-label', 'Messages on the map'); wrap.appendChild(blist);

    // ---- base marker ----
    const hqEl = document.createElement('div'); hqEl.className = 'hqm';
    hqEl.setAttribute('role', 'img'); hqEl.setAttribute('aria-label', hq.name + (hq.approx ? ', approximate location' : ''));
    hqEl.title = hq.name + (hq.approx ? '. Approximate: central ' + (r.city || 'city') + ' until the shop address is on file.' : '');
    hqEl.innerHTML = '<span class="hqd"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 11 12 4l8 7v9h-5.5v-6h-5v6H4z"/></svg></span><span class="hql">' + esc(hq.name) + '</span>';
    new maplibregl.Marker({ element: hqEl }).setLngLat(hq.loc).addTo(map);
    // the base's name sits on the side away from today's homes (on screen, the map is turned), so the beams never cross it
    function labelSide() { const hs = opts.homes().filter(h => h.loc); if (!hs.length) return; const a = map.project(hq.loc), mx = hs.reduce((s, h) => s + map.project(h.loc).x, 0) / hs.length; hqEl.classList.toggle('lft', mx > a.x); }
    labelSide();

    // ---- legend (direction B, Jack 10-09): Lines, then Homes, the note and the day chips under them ----
    const leg = document.createElement('div'); leg.className = 'mleg';
    leg.innerHTML = '<div class="lk">' +
      '<div class="lh">Lines</div>' +
      '<div class="k"><i class="bm"></i>Sent</div><div class="k"><i class="pd"></i>Scheduled</div><div class="k"><i class="chl"></i>To each home, in order</div>' +
      '<div class="lh">Homes</div>' + (opts.keys || '') +
      '<div class="k pins"><i class="dt" style="--c:' + CH.text.color + '"></i><i class="dt" style="--c:' + CH.email.color + '"></i>Reached by text, email</div></div>' +
      '<div class="l2"><span class="lnote"></span><div class="days" role="group" aria-label="Which day to show"></div></div>';
    const host = opts.legendHost || wrap, br = document.createElement('i'); br.className = 'mleg-br';
    host.append(br, leg);
    /* a narrow map column (Today at 1024 wide): the key folds into a "Map key" button so it never covers the map (10-15) */
    if (opts.legendHost && !matchMedia('(max-width:640px)').matches && window.ResizeObserver) {
      const tog = document.createElement('button'); tog.type = 'button'; tog.className = 'mleg-tog'; tog.setAttribute('aria-expanded', 'false');
      tog.textContent = 'Map key'; host.insertBefore(tog, br);
      tog.onclick = () => { const on = !host.classList.contains('legopen'); host.classList.toggle('legopen', on); tog.setAttribute('aria-expanded', on ? 'true' : 'false'); tog.textContent = on ? 'Hide key' : 'Map key'; };
      new ResizeObserver(() => { const w = wrap.getBoundingClientRect().width; host.classList.toggle('legmin', w > 0 && w < 440 && !document.documentElement.classList.contains('mapbig')); }).observe(wrap);
    }
    const note = leg.querySelector('.lnote'), daysEl = leg.querySelector('.days');
    daysEl.onclick = e => { const b = e.target.closest('[data-day]'); if (!b) return; day = b.dataset.day; try { localStorage.setItem(DAYK, day); } catch (er) { } update(); };

    // ---- state ----
    let list = [], beams = {}, pend = {}, extra = {}, seen = null;
    const pt = () => map.project(hq.loc);
    function endOf(c) { const p = opts.pinOf(c.id); if (p) return p; const loc = c.loc || (() => { const h = RC.recall(c.id); return h && isFinite(h.lon) ? [+h.lon, +h.lat] : null; })(); return loc ? map.project(loc) : null; }
    // quadratic curve from the base to a home that rises up the screen (on the tilted map, up reads as height), spread a
    // little sideways so beams to neighbouring homes do not sit on top of each other; the apex stays inside the frame
    function curve(a, b, bow, side, lift, top) {
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
      if (top == null) top = opts.top ? opts.top() : 24;   // callers inside a frame pass the frame's one layout read
      const up = Math.max(0, Math.min(d * (lift || 0), (Math.min(a.y, b.y) - top) * 2));
      const cx = (a.x + b.x) / 2 + nx * d * bow * side, cy = (a.y + b.y) / 2 + ny * d * bow * side - up;
      return `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
    }
    const sideOf = (a, b, mid) => ((mid.x - a.x) * (b.y - a.y) - (mid.y - a.y) * (b.x - a.x)) > 0 ? -1 : 1;
    const latest = (id, ch) => RC.activity().find(a => a.id === id && (ch ? a.ch === ch : (a.ch === 'text' || a.ch === 'email')));
    const tipLine = c => { const a = latest(c.id, c.channel); return CH[c.channel].label + ', ' + (a ? (dayOf(a.at) === TODAY() ? tm(a.at) : full(a.at)) : tm(c.at)) + ', ' + addrOf(c.id); };

    function mkBeam(c) {
      const g = el('g', { class: 'beam', 'data-ch': c.channel, 'data-id': c.id });
      const sh = el('path', { class: 'bs' }), halo = el('path', { class: 'bh', pathLength: '100' }), glow = el('path', { class: 'bg', pathLength: '100' }), core = el('path', { class: 'bc', pathLength: '100' }),
        tex = el('path', { class: 'bt' }), p2 = el('path', { class: 'bp2', pathLength: '100' }), p1 = el('path', { class: 'bp1', pathLength: '100' }), hit = el('path', { class: 'hit' });
      const delay = (-Math.random() * 3.4).toFixed(2) + 's'; p1.style.animationDelay = p2.style.animationDelay = delay;
      gS.appendChild(sh); g.append(halo, glow, core, tex, p2, p1, hit); gA.appendChild(g);
      const b = { g, sh, paths: [halo, glow, core, tex, p2, p1, hit], hit, c };
      hit.addEventListener('mouseenter', e => showTip(tipLine(b.c), e));
      hit.addEventListener('mousemove', e => showTip(null, e));
      hit.addEventListener('mouseleave', hideTip);
      hit.addEventListener('click', e => { e.stopPropagation(); hideTip(); openPop(b.c.id, b.c.channel, local(e)); });
      return b;
    }
    function mkPend(s) {
      const g = el('g', { class: 'pend' }), cas = el('path', { class: 'pc' }), ln = el('path', { class: 'pl' }), hit = el('path', { class: 'hit' });
      g.append(cas, ln, hit); gQ.appendChild(g);
      const lab = document.createElement('span'); lab.className = 'plab'; labs.appendChild(lab);
      const p = { g, paths: [cas, ln, hit], lab, s };
      hit.addEventListener('mouseenter', e => showTip('Scheduled text, ' + RC.countdown(p.s.due, 'short') + ', ' + addrOf(p.s.id), e));
      hit.addEventListener('mousemove', e => showTip(null, e));
      hit.addEventListener('mouseleave', hideTip);
      hit.addEventListener('click', e => { e.stopPropagation(); hideTip(); openPop(p.s.id, 'sched', local(e)); });
      // the countdown chip opens it too: on a phone the sent beams to nearby stops lie over this line, the chip never does
      lab.addEventListener('click', e => { e.stopPropagation(); hideTip(); openPop(p.s.id, 'sched', local(e)); });
      return p;
    }
    const local = e => { const b = wrap.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };

    function update() {
      const today = RC.contacted(), every = RC.contacted({ all: true });
      // day chips: All (default), Today, each earlier day this device holds a contact for (newest first, up to 3)
      const past = [...new Set(every.map(c => dayOf(c.at)).filter(d => d !== TODAY()))].sort((x, y) => new Date(y) - new Date(x)).slice(0, 3);
      if (day !== 'today' && day !== 'all' && !past.includes(day)) day = 'all';
      const chips = [['all', 'All'], ['today', 'Today']].concat(past.map(d => [d, dayName(d)]));
      const chh = chips.map(([k, l]) => `<button type="button" data-day="${esc(k)}" aria-pressed="${k === day}">${esc(l)}</button>`).join('');
      if (daysEl.__h !== chh) { daysEl.innerHTML = chh; daysEl.__h = chh; }
      list = (day === 'today' ? today : day === 'all' ? every : every.filter(c => dayOf(c.at) === day)).filter(c => c.loc || opts.pinOf(c.id));
      const ids = new Set(list.map(c => c.id + '|' + c.channel));
      const fresh = seen ? list.filter(c => !seen.has(c.id + '|' + c.channel)) : [];
      seen = new Set([...(seen || []), ...ids]);
      Object.keys(beams).forEach(k => { if (!ids.has(k)) { beams[k].g.remove(); beams[k].sh.remove(); delete beams[k]; } });
      list.forEach(c => { const k = c.id + '|' + c.channel; const b = beams[k] || (beams[k] = mkBeam(c)); b.c = c;
        b.old = day === 'all' && dayOf(c.at) !== TODAY(); b.g.classList.toggle('old', b.old); });
      const vis = !opts.visible || opts.visible();
      fresh.forEach(c => { const b = beams[c.id + '|' + c.channel]; if (!b || RM.matches || !vis) return;
        b.g.classList.add('born'); setTimeout(() => { b.g.classList.remove('born'); ripple(b); }, 1150); });
      // scheduled texts (reminders): dimmer dashed beams with a countdown
      const ss = RC.scheduled().filter(s => opts.pinOf(s.id) || RC.recall(s.id));
      const sids = new Set(ss.map(s => s.sid));
      Object.keys(pend).forEach(k => { if (!sids.has(k)) { pend[k].g.remove(); pend[k].lab.remove(); delete pend[k]; } });
      ss.forEach(s => { const p = pend[s.sid] || (pend[s.sid] = mkPend(s)); p.s = s;
        p.lab.innerHTML = '<span class="ic">' + ICON.sched + '</span>Text <span data-due="' + esc(s.due) + '" data-fmt="short">' + esc(RC.countdown(s.due, 'short')) + '</span>'; });
      // earlier homes that are not on today's list: a small dot of their own
      Object.keys(extra).forEach(id => { if (!list.some(c => c.id === id && !opts.pinOf(id))) { extra[id].remove(); delete extra[id]; } });
      list.forEach(c => { if (opts.pinOf(c.id) || extra[c.id] || !c.loc) return;
        const d = el('circle', { class: 'xd', r: '6' }); d.addEventListener('click', e => { e.stopPropagation(); openPop(c.id, null, local(e)); }); gX.appendChild(d); extra[c.id] = d; });
      // pins: filled in the channel of the latest contact; the rest stay quiet
      const last = {}; list.forEach(c => { last[c.id] = c; });
      opts.homes().forEach(h => { const e = opts.pinEl && opts.pinEl(h.id); if (!e) return; const c = last[h.id], s = ss.find(x => x.id === h.id);
        e.classList.toggle('reached', !!c); e.classList.toggle('wait', !c); e.classList.toggle('sched', !!s); if (c) e.dataset.ch = c.channel; else delete e.dataset.ch;
        e.setAttribute('aria-label', 'Stop ' + h.n + ', ' + h.addr + (c ? ', ' + CH[c.channel].label.toLowerCase() + ' ' + (c.channel === 'call' ? 'logged' : 'sent') + '. Shows what was sent' : s ? ', text scheduled' : ', queued')); });
      Object.keys(extra).forEach(id => { const c = last[id]; extra[id].setAttribute('fill', c ? CH[c.channel].color : '#5A6378'); });
      // keyboard list: one button per beam and per scheduled text
      const items = list.slice().reverse().map(c => ({ k: c.id + '|' + c.channel, id: c.id, ch: c.channel, t: tipLine(c) }))
        .concat(ss.map(s => ({ k: 's|' + s.sid, id: s.id, ch: 'sched', t: 'Scheduled text, ' + addrOf(s.id) })));
      const bh = items.map(i => `<button type="button" data-k="${esc(i.k)}" data-id="${esc(i.id)}" data-ch="${i.ch}">${esc(i.t)}</button>`).join('');
      if (blist.__h !== bh) { blist.innerHTML = bh; blist.__h = bh; }
      // legend line
      const when = day === 'today' ? 'today' : day === 'all' ? 'on this device' : 'on ' + dayName(day);
      if (!list.length) note.textContent = (day === 'all' || day === 'today' ? 'Nothing sent yet. A beam lights up for every text or email.' : 'Nothing reached ' + when + '.') + (ss.length ? ' ' + plural(ss.length, 'text') + ' scheduled.' : '');
      else { const n = { text: 0, email: 0, call: 0 }; list.forEach(c => n[c.channel]++); const homes = new Set(list.map(c => c.id)).size;
        const parts = []; if (n.call) parts.push(plural(n.call, 'call')); if (n.text) parts.push(plural(n.text, 'text')); if (n.email) parts.push(plural(n.email, 'email'));
        note.textContent = plural(homes, 'home') + ' reached ' + when + ': ' + parts.join(', ') + '.' + (ss.length ? ' ' + ss.length + ' scheduled.' : ''); }
      draw();
      if (!pop.hidden && pop.__k) refreshPop();
      if (opts.onLayout) opts.onLayout();
    }

    // ---- the fan: base -> every home, drawn on the canvas ----
    // Budget (10-15): everything here draws AT MOST ONCE PER ANIMATION FRAME. Every caller (map move, resize, a state
    // change, the pins nudged apart) asks for a frame with draw() = requestDraw; drawNow runs inside that one frame.
    // Layout is read once per frame (the map box, the pill row's bottom edge); each arc's samples and gradient are kept
    // until its pin, the base or the pill row moves; arcs that have landed are painted once onto an offscreen canvas and
    // blitted, so a running frame strokes only the arcs still in flight. Before this, map 'move' and the loop each
    // redrew all 50 arcs with two forced layouts per arc: about 270,000 strokes and one 12 to 20 s task on first open.
    const FAN = { gap: 90, dur: 720, pulse: 650, n: 26 };   // ms between arcs, ms one arc takes, ms the landing pulse lasts, samples per arc
    let fanT0 = null, fanRaf = 0, fanSeek = null;
    const fanTime = () => fanSeek != null ? fanSeek : fanT0 == null ? Infinity : performance.now() - fanT0;
    const fanTotal = n => FAN.gap * Math.max(0, n - 1) + FAN.dur + FAN.pulse;
    // the arc's samples (quadratic, same shape as the beams: bowed to one side, lifted up the screen); bow varies a
    // little with the home's place in the list so arcs to neighbouring homes fan apart instead of stacking
    function arcPts(a, b, i, mid, top) {
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
      const bow = (.05 + (i % 3) * .022) * sideOf(a, b, mid), up = Math.max(0, Math.min(d * .36, (Math.min(a.y, b.y) - top) * 2));
      const cx = (a.x + b.x) / 2 + nx * d * bow, cy = (a.y + b.y) / 2 + ny * d * bow - up, out = [];
      for (let k = 0; k <= FAN.n; k++) { const t = k / FAN.n, u = 1 - t; out.push(u * u * a.x + 2 * u * t * cx + t * t * b.x, u * u * a.y + 2 * u * t * cy + t * t * b.y); }
      return out;
    }
    const ease = t => 1 - Math.pow(1 - t, 3);
    // per-home cache: samples and gradients, valid while the geometry key (base, pin, pin centre, pill row) holds
    const arcCache = new Map();
    function arcFor(h, i, a, b, mid, top) {
      const key = a.x.toFixed(1) + ',' + a.y.toFixed(1) + ',' + b.x.toFixed(1) + ',' + b.y.toFixed(1) + ',' + mid.x.toFixed(1) + ',' + mid.y.toFixed(1) + ',' + i + ',' + top;
      let c = arcCache.get(h.id);
      if (!c || c.key !== key) { c = { key, pts: arcPts(a, b, i, mid, top), ax: a.x, ay: a.y, bx: b.x, by: b.y, lg: new WeakMap() }; arcCache.set(h.id, c); }
      return c;
    }
    const gradOf = (g, c) => { let lg = c.lg.get(g); if (!lg) { lg = g.createLinearGradient(c.ax, c.ay, c.bx, c.by); lg.addColorStop(0, 'rgba(31,111,224,.38)'); lg.addColorStop(1, 'rgba(13,108,153,.62)'); c.lg.set(g, lg); } return lg; };
    // the arc up to sample m plus the head point: the soft glow, then the line
    function strokeArc(g, c, m, hx, hy) {
      const p = c.pts; g.beginPath(); g.moveTo(p[0], p[1]); for (let j = 1; j < m; j++) g.lineTo(p[j * 2], p[j * 2 + 1]); g.lineTo(hx, hy);
      g.strokeStyle = 'rgba(31,111,224,.09)'; g.lineWidth = 5; g.stroke();
      g.strokeStyle = gradOf(g, c); g.lineWidth = 1.3; g.stroke();
      if (m >= FAN.n) arrow(g, p);
    }
    // the direction cue (Jack 10-26 round 2): a small arrowhead on each landed line, stopped just short of the home's pin
    function arrow(g, p) {
      const n = p.length / 2 - 1, ex = p[n * 2], ey = p[n * 2 + 1]; let j = n, d = 0;
      while (j > 1 && d < 15) { j--; d = Math.hypot(ex - p[j * 2], ey - p[j * 2 + 1]); }
      if (d < 8) return;
      const tx = p[j * 2], ty = p[j * 2 + 1], bx = p[(j - 1) * 2], by = p[(j - 1) * 2 + 1], L = Math.hypot(tx - bx, ty - by) || 1, ux = (tx - bx) / L, uy = (ty - by) / L, s = 6;
      g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx - ux * s - uy * s * .6, ty - uy * s + ux * s * .6); g.lineTo(tx - ux * s + uy * s * .6, ty - uy * s - ux * s * .6); g.closePath();
      g.fillStyle = 'rgba(13,108,153,.78)'; g.fill();
    }
    // landed arcs live on this offscreen canvas; it is rebuilt only when the geometry changes, and grows by one arc as each lands
    const still = document.createElement('canvas'); let stillGeo = '', stillIds = new Set();
    function sizeCanvas(cv, W, H, dpr) { const w = Math.round(W * dpr), h = Math.round(H * dpr); if (cv.width === w && cv.height === h) return false; cv.width = w; cv.height = h; return true; }
    function fanDraw(a, hs, mid, top, box, pinAt) {
      const W = box.width, H = box.height; if (!W) return true;
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      if (sizeCanvas(fan, W, H, dpr)) { fan.style.width = W + 'px'; fan.style.height = H + 'px'; }
      if (sizeCanvas(still, W, H, dpr)) stillGeo = '';
      const g = fan.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      const hidden = !!opts.visible && !opts.visible(); if (hidden) return true;   // out of sight (phone sheet closed): nothing to animate
      const now = fanTime(), final = RM.matches || now === Infinity; let busy = false;
      // sort today's homes into landed (full arc, on the still canvas) and in flight (drawn this frame)
      const landed = [], flying = [], pulses = [];
      hs.forEach((h, i) => {
        if (beams[h.id + '|text'] || beams[h.id + '|email'] || beams[h.id + '|call']) return;   // its sent beam carries the line
        const b = pinAt.get(h.id); if (!b) return;
        const t0 = i * FAN.gap, k = final ? 1 : Math.max(0, Math.min(1, (now - t0) / FAN.dur));
        if (k <= 0) { busy = true; return; }
        const c = arcFor(h, i, a, b, mid, top);
        if (k < 1) { busy = true; flying.push({ c, k }); return; }
        landed.push({ id: h.id, c });
        if (!final) { const q = (now - t0 - FAN.dur) / FAN.pulse; if (q >= 0 && q < 1) { busy = true; pulses.push({ b, q }); } }
      });
      // the still layer: same geometry and only new arrivals -> stroke just those; anything else -> repaint it
      const geo = a.x.toFixed(1) + ',' + a.y.toFixed(1) + ',' + mid.x.toFixed(1) + ',' + mid.y.toFixed(1) + ',' + top + ',' + W + 'x' + H;
      const sg = still.getContext('2d'); sg.setTransform(dpr, 0, 0, dpr, 0, 0); sg.lineCap = 'round'; sg.lineJoin = 'round';
      const byId = new Map(landed.map(l => [l.id, l.c]));
      let keep = geo === stillGeo;
      if (keep) for (const id of stillIds) { const c = byId.get(id); if (!c || c.drawnKey !== c.key) { keep = false; break; } }
      if (!keep) { sg.clearRect(0, 0, W, H); stillIds = new Set(); stillGeo = geo; }
      landed.forEach(l => { if (stillIds.has(l.id)) return; strokeArc(sg, l.c, FAN.n, l.c.pts[FAN.n * 2], l.c.pts[FAN.n * 2 + 1]); l.c.drawnKey = l.c.key; stillIds.add(l.id); });
      g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(still, 0, 0); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.lineCap = 'round'; g.lineJoin = 'round';
      flying.forEach(({ c, k }) => {   // the arc so far, then the head: a bright dot with a short white trail behind it
        const p = c.pts, e = ease(k), m = Math.min(FAN.n, Math.floor(e * FAN.n)), f = e * FAN.n - m;
        const hx = m < FAN.n ? p[m * 2] + (p[m * 2 + 2] - p[m * 2]) * f : p[FAN.n * 2], hy = m < FAN.n ? p[m * 2 + 1] + (p[m * 2 + 3] - p[m * 2 + 1]) * f : p[FAN.n * 2 + 1];
        strokeArc(g, c, m, hx, hy);
        const tr = Math.max(0, m - 3); g.beginPath(); g.moveTo(p[tr * 2], p[tr * 2 + 1]); for (let j = tr + 1; j < m; j++) g.lineTo(p[j * 2], p[j * 2 + 1]); g.lineTo(hx, hy);
        g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2.2; g.stroke();
        g.beginPath(); g.arc(hx, hy, 2.6, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
        g.beginPath(); g.arc(hx, hy, 5.5, 0, Math.PI * 2); g.fillStyle = 'rgba(31,111,224,.28)'; g.fill();
      });
      pulses.forEach(({ b, q }) => {   // landed: one small ring opens and fades on the pin
        g.beginPath(); g.arc(b.x, b.y, 5 + 15 * q, 0, Math.PI * 2); g.strokeStyle = `rgba(13,108,153,${(.55 * (1 - q)).toFixed(3)})`; g.lineWidth = 1.8; g.stroke();
      });
      return !busy;
    }
    // ONE animation frame handle for the whole layer: a requested draw and the running intro share it
    function fanLoop() { fanRaf = 0; const done = drawNow(); if (!done && fanSeek == null && !fanRaf) fanRaf = requestAnimationFrame(fanLoop); }
    function requestDraw() { if (!fanRaf) fanRaf = requestAnimationFrame(fanLoop); }
    function fanStart() { if (RM.matches) return; fanT0 = performance.now(); fanSeek = null; requestDraw(); }
    const fanApi = {
      replay: fanStart,
      seek: ms => { fanSeek = ms; if (fanRaf) { cancelAnimationFrame(fanRaf); fanRaf = 0; } drawNow(); },   // audits: pin the intro clock
      time: fanTime, total: () => fanTotal((opts.route ? opts.route() : opts.homes()).length)
    };

    let svgW = 0, svgH = 0;
    function drawNow() {
      svg.classList.toggle('still', !!opts.visible && !opts.visible());   // no light pulses while the map is out of sight (phone sheet closed)
      const box = map.getContainer().getBoundingClientRect(); if (!box.width) return true;
      if (box.width !== svgW || box.height !== svgH) { svgW = box.width; svgH = box.height; svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`); svg.setAttribute('width', box.width); svg.setAttribute('height', box.height); }
      const top = opts.top ? opts.top() : 24;   // the one layout read of the frame (the pill row's bottom edge)
      const a = pt(), hs = opts.route ? opts.route() : opts.homes();   // the fan follows the list order when the page gives one
      const pinAt = new Map(); hs.forEach(h => pinAt.set(h.id, opts.pinOf(h.id)));
      const pins = [...pinAt.values()].filter(Boolean);
      const mid = pins.length ? { x: pins.reduce((s, p) => s + p.x, 0) / pins.length, y: pins.reduce((s, p) => s + p.y, 0) / pins.length } : a;
      // the beam gradient points from the base at the homes (the base's name side is set by labelSide, once per fit)
      grad.setAttribute('x1', a.x.toFixed(1)); grad.setAttribute('y1', a.y.toFixed(1)); grad.setAttribute('x2', (mid === a ? a.x + 1 : mid.x).toFixed(1)); grad.setAttribute('y2', mid.y.toFixed(1));
      // the fan: the first time the map is on screen with pins, the arcs start drawing out one after another
      const vis = !opts.visible || opts.visible();
      if (fanT0 == null && fanSeek == null && pins.length && vis) fanStart();
      const done = fanDraw(a, hs, mid, top, box, pinAt);
      if (!done && fanSeek == null) requestDraw();
      chain.setAttribute('d', ''); chainCase.setAttribute('d', '');   // the old dashed base -> 1 -> 2 chain is retired by the fan
      Object.keys(extra).forEach(id => { const c = list.find(x => x.id === id); if (!c || !c.loc) return; const b = map.project(c.loc); extra[id].setAttribute('cx', b.x); extra[id].setAttribute('cy', b.y); });
      Object.values(beams).forEach(r => {
        const b = endOf(r.c); if (!b) { r.g.style.display = 'none'; r.sh.style.display = 'none'; return; } r.g.style.display = ''; r.sh.style.display = '';
        const d = curve(a, b, CH[r.c.channel].bow, sideOf(a, b, mid), CH[r.c.channel].lift, top);
        r.paths.forEach(p => p.setAttribute('d', d)); r.end = b;
        r.sh.setAttribute('d', `M${a.x.toFixed(1)},${a.y.toFixed(1)} L${b.x.toFixed(1)},${b.y.toFixed(1)}`);   // its footprint on the ground
      });
      Object.values(pend).forEach(p => {
        const b = endOf({ id: p.s.id }); if (!b) { p.g.style.display = 'none'; p.lab.style.display = 'none'; return; } p.g.style.display = ''; p.lab.style.display = '';
        const d = curve(a, b, -.06, sideOf(a, b, mid), .3, top); p.paths.forEach(x => x.setAttribute('d', d)); p.end = b;
        p.lab.style.left = b.x.toFixed(1) + 'px'; p.lab.style.top = b.y.toFixed(1) + 'px';
      });
      if (!pop.hidden && pop.__ll) placePop(map.project(pop.__ll));
      return done;
    }
    const draw = requestDraw;   // every caller gets one coalesced frame
    function ripple(r) {   // a single soft ring where the beam lands
      if (RM.matches || !r.end) return;
      const c = el('circle', { class: 'rip', cx: r.end.x, cy: r.end.y, r: '8' }); gP.appendChild(c);
      const s = performance.now(); (function f(n) { const k = Math.min(1, (n - s) / 900); c.setAttribute('r', String(8 + 22 * k)); c.style.opacity = String(.7 * (1 - k)); if (k < 1) requestAnimationFrame(f); else c.remove(); })(s);
    }

    // ---- tooltip ----
    function showTip(text, e) {
      if (text != null) tip.textContent = text;
      if (!tip.textContent) return; tip.hidden = false;
      const p = e && e.clientX != null ? local(e) : e, W = wrap.clientWidth, w = tip.offsetWidth;
      tip.style.left = Math.max(8, Math.min(W - w - 8, p.x - w / 2)) + 'px'; tip.style.top = Math.max(8, p.y - tip.offsetHeight - 14) + 'px';
    }
    function hideTip() { tip.hidden = true; }

    // ---- popover: exactly what went out ----
    let lastFocus = null;
    function bodyHTML(a) {
      if (!a) return '<p class="bp-none">No record found on this device.</p>';
      if (a.ch === 'call') {
        const o = a.outcome ? OUTL[a.outcome] : (a.what || 'Called').replace(/^Called, /, '').replace(/: .*$/, '');
        const n = a.note != null ? a.note : (/: (.+)$/.exec(a.what || '') || [])[1];
        return `<p class="bp-out"><span>Outcome</span><b>${esc(o.charAt(0).toUpperCase() + o.slice(1))}</b></p>` + (n ? `<p class="bp-msg note">${esc(n)}</p>` : '<p class="bp-none">No note on this call.</p>');
      }
      const sch = a.scheduled ? `<p class="bp-sub">Scheduled for ${esc(full(a.scheduled))}, sent from your phone</p>` : '';
      if (a.ch === 'email') return (a.subject ? `<p class="bp-subj">${esc(a.subject)}</p>` : '') + (a.body ? `<p class="bp-msg">${esc(a.body)}</p>` : '<p class="bp-none">The email text was not kept with this record (logged before message text was saved).</p>');
      return sch + (a.body ? `<p class="bp-msg">${esc(a.body)}</p>` : '<p class="bp-none">The words were not kept with this record (logged before message text was saved).</p>');
    }
    function openPop(id, ch, at, kb) {
      pop.__k = { id, ch }; pop.__ll = map.unproject([at.x, at.y]); lastFocus = kb ? document.activeElement : null;
      refreshPop(); pop.hidden = false; placePop(at); hideTip();
      if (kb) { const x = pop.querySelector('.bp-x'); x && x.focus(); }
    }
    function refreshPop() {
      const { id, ch } = pop.__k, h = homeOf(id), gi = h.gi;
      const owner = gi != null && RC.ownerNow ? RC.ownerNow(gi) : null;
      let head, body, more = '', time = '';
      if (ch === 'sched') {
        const s = RC.scheduledFor(id); if (!s) { closePop(); return; }
        head = `<span class="bp-ch" data-ch="sched"><span class="ic">${ICON.sched}</span>Scheduled text</span>`;
        time = `<time datetime="${esc(s.due)}">${esc(full(s.due))}</time>`;
        body = `<p class="bp-cd"><span data-due="${esc(s.due)}">${esc(RC.countdown(s.due))}</span></p><p class="bp-sub">Reminder, sends from your phone. Texting is not connected, so nothing sends on its own.</p><p class="bp-msg">${esc(s.body)}</p>`;
      } else {
        const recs = RC.activity().filter(a => a.id === id && (a.ch === 'text' || a.ch === 'email'));
        const a = (ch ? recs.filter(x => x.ch === ch) : recs)[0];
        const c = a ? a.ch : ch || 'text';
        head = `<span class="bp-ch" data-ch="${c}"><span class="ic">${ICON[c]}</span>${CH[c].label}</span>`;
        time = a ? `<time datetime="${esc(a.at)}">${esc(full(a.at))}</time>` : '';
        body = bodyHTML(a);
        const rest = recs.filter(x => x !== a).slice(0, 3);
        if (rest.length) more = `<div class="bp-more"><b>Also sent to this home</b>${rest.map(x => `<span>${CH[x.ch].label}, ${esc(dayOf(x.at) === TODAY() ? tm(x.at) : full(x.at))}${x.ch === 'call' && x.outcome ? ', ' + esc(OUTL[x.outcome].toLowerCase()) : ''}</span>`).join('')}</div>`;
      }
      const ph = h.phone ? pretty(h.phone) + ' (sample phone)' : '';
      const to = `<div class="bp-to"><span class="bp-l">To</span><b>${esc(h.addr || addrOf(id))}</b><span class="bp-who">${esc(owner || (RC.ownersAllowed && RC.ownersAllowed() ? RC.OWNER_NONE : ''))}${owner && ph ? ', ' : (!owner && RC.ownersAllowed && RC.ownersAllowed() && ph ? ', ' : '')}${esc(ph)}</span></div>`;
      const html = `<div class="bp-h">${head}<button type="button" class="bp-x" aria-label="Close">${ICON.x}</button></div>${time ? '<div class="bp-t">' + time + '</div>' : ''}${to}<div class="bp-b">${body}</div>${more}<div class="bp-f"><a href="#" class="bp-open" data-id="${esc(id)}">Open home<span class="ic">${ICON.go}</span></a></div>`;
      if (pop.__h !== html) { pop.innerHTML = html; pop.__h = html; }
      if (!owner && gi != null && RC.owner) RC.owner(gi).then(o => { if (o && !pop.hidden && pop.__k && pop.__k.id === id) { pop.__h = null; refreshPop(); } });
    }
    function placePop(at) {
      const W = wrap.clientWidth, H = wrap.clientHeight, w = pop.offsetWidth, hgt = pop.offsetHeight;
      const nx = wrap.querySelector('.mnext'), bot = nx && nx.offsetHeight ? nx.offsetTop - 8 : H - 10;
      let x = Math.max(10, Math.min(W - w - 10, at.x - w / 2)), y = at.y + 16;
      if (y + hgt > bot) y = at.y - hgt - 16;
      if (y < 10) y = Math.max(10, Math.min(bot - hgt, 10));
      // Nimbus's corner (his orb and the update bubble that hangs to his left) stays clear
      const zx = W - 440, zy = H - 260;
      if (W > 600 && x + w > zx && y + hgt > zy) { if (zy - hgt - 8 >= 10) y = zy - hgt - 8; else x = Math.max(10, zx - w - 8); }
      pop.style.left = x + 'px'; pop.style.top = y + 'px';
    }
    function closePop() {
      if (pop.hidden) return; pop.hidden = true; pop.__k = null; pop.__ll = null;
      blist.querySelectorAll('.kf').forEach(x => x.classList.remove('kf')); gA.querySelectorAll('.kf').forEach(x => x.classList.remove('kf'));
      if (lastFocus && document.contains(lastFocus)) lastFocus.focus(); lastFocus = null;
    }
    pop.addEventListener('click', e => {
      if (e.target.closest('.bp-x')) { closePop(); return; }
      const o = e.target.closest('.bp-open'); if (o) { e.preventDefault(); const id = o.dataset.id; closePop(); if (opts.onOpenHome) opts.onOpenHome(id); }
    });
    // outside click and Escape close it (Escape first, before the expanded map hears it)
    document.addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('.blist')) closePop();
      // back on a pointer: the keyboard list (visible only while focused) steps aside so it never covers the beams being tapped
      if (blist.contains(document.activeElement) && !blist.contains(e.target) && !pop.contains(e.target)) document.activeElement.blur(); }, true);
    addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) { e.stopImmediatePropagation(); e.preventDefault(); closePop(); } }, true);
    map.on('dragstart', closePop); map.on('zoomstart', e => { if (e.originalEvent) closePop(); });

    // ---- keyboard list ----
    function beamOf(k) { return k.startsWith('s|') ? pend[k.slice(2)] : beams[k]; }
    blist.addEventListener('focusin', e => { const b = e.target.closest('[data-k]'); if (!b) return; const r = beamOf(b.dataset.k); gA.querySelectorAll('.kf').forEach(x => x.classList.remove('kf')); gQ.querySelectorAll('.kf').forEach(x => x.classList.remove('kf'));
      if (r && r.end) { r.g.classList.add('kf'); showTip(b.textContent, { x: r.end.x, y: r.end.y }); } });
    blist.addEventListener('focusout', () => { hideTip(); gA.querySelectorAll('.kf').forEach(x => x.classList.remove('kf')); gQ.querySelectorAll('.kf').forEach(x => x.classList.remove('kf')); });
    blist.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (!b) return; const r = beamOf(b.dataset.k); const at = r && r.end ? r.end : { x: wrap.clientWidth / 2, y: wrap.clientHeight / 2 };
      openPop(b.dataset.id, b.dataset.ch === 'sched' ? 'sched' : b.dataset.ch, at, true); });

    map.on('move', draw); map.on('resize', draw);
    RC.on(d => { if (d.key === 'att' || d.key === 'pipe' || d.key === 'sched') update(); });
    return {
      draw, update, legend: leg, hqLoc: hq.loc, hqEl, relabel: labelSide, close: closePop, fan: fanApi,
      // homes reached on earlier days that are not on today's list (fit them too when shown)
      extraLocs: () => list.filter(c => c.loc && !opts.pinOf(c.id)).map(c => c.loc),
      has: id => list.some(c => c.id === id),
      // a reached home's pin was clicked: show what went out (latest channel), anchored at the pin
      openFor: (id, at) => { const p = at || opts.pinOf(id); if (p) openPop(id, null, p); }
    };
  }
  window.Reach = { mount, CH };
})();
