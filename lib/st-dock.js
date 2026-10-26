// Storms dropdown + instant timeline (desktop). Loaded after lib/st-map.js on the Storms screen only and built on its
// globals (ST, cur, map, selectStorm, clearStorm, buildTimeline, readout, beginXfade, fitStorm, redraw, prev, xf, xfRaf,
// homesData, EASE, MOB, tilt3d, hitBounds, warmStorm, fmt, yd).
// Jack 10-17: the card's date ("Storm of Jun 2" / "Your service area") drops
// the storms down: the timeline (real time axis, as before), a list of the window's storms newest first, and the
// pipeline strip. Clicking or scrubbing the timeline is instant: the pointer lands on the nearest storm anywhere on the
// axis (no gaps between tiny buttons), the readout and ticks jump (no slide), the crossfade is 160 ms and draws only the
// homes layer twice (the hit columns were drawn twice for 450 ms), and the camera flight is 600 ms instead of 900.
(function () {
  if (MOB) return;                                   // the phone keeps its chip strip and bottom sheet
  const dock = document.getElementById('dock'), trig = document.getElementById('s-date'), scrub = document.getElementById('scrub'), list = document.getElementById('slist');
  if (!dock || !trig || !scrub || !list) return;
  const FADE = 160, FLY = 600;
  // Jack 10-17 (later): the timeline goes back across the bottom of the map as a slim bar; the date dropdown keeps the
  // storm list and the pipeline strip. Moving the node keeps every listener (scrub hover / click below).
  const bar = document.createElement('div'); bar.id = 'tbar'; bar.className = 'glass'; bar.setAttribute('aria-label', 'Storm timeline');
  document.body.appendChild(bar); bar.appendChild(scrub);

  // ---------- open / close ----------
  let open = false;
  function place() { const r = trig.getBoundingClientRect(); dock.style.top = Math.round(r.bottom + 8) + 'px'; }
  function setOpen(v) { open = !!v; document.body.classList.toggle('sdrop', open); trig.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { place(); if (window.readout) readout(cur); if (window.declutterTimeline) requestAnimationFrame(declutterTimeline); const on = list.querySelector('.srow.on'); if (on) on.scrollIntoView({ block: 'nearest' }); } }   // the readout is measured once the panel is on screen (it was placed at 0 width while hidden)
  trig.addEventListener('click', () => setOpen(!open));
  document.addEventListener('click', e => { if (!open) return; if (dock.contains(e.target) || trig.contains(e.target)) return; setOpen(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) { setOpen(false); e.stopImmediatePropagation(); } }, true);
  addEventListener('resize', () => { if (open) place(); });
  // a storm picked from the list or the axis stays in the dropdown (flip between storms and watch the map); Clear closes it
  document.getElementById('clear').addEventListener('click', () => setOpen(false));

  // ---------- the list: the window's storms newest first; the open one marked ----------
  function buildList() {
    const L = ST.shown().slice().reverse();
    list.innerHTML = L.map(s => `<button type="button" class="srow" role="option" data-i="${s.i}" aria-selected="${s === cur}"><b>${RC.esc(yd(s))}</b><span><i>${fmt(s.n)}</i> homes</span><span><i>${s.max.toFixed(2)}</i> in</span></button>`).join('')
      || '<div class="none" style="position:static;padding:10px 8px;font-size:12.5px;color:var(--muted)">No storm in this window</div>';
    paintList();
  }
  function paintList() { list.querySelectorAll('.srow').forEach(b => { const on = !!cur && ST.storms[+b.dataset.i] === cur; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); }); }
  list.addEventListener('click', e => { const b = e.target.closest('.srow'); if (!b) return; const s = ST.storms[+b.dataset.i]; if (!s) return; if (s === cur) clearStorm(); else selectStorm(s.i); });
  // lib/st-map.js rebuilds the timeline on a window change and repaints it on a storm change: ride on both
  const _bt = buildTimeline;
  buildTimeline = function () { const r = _bt.apply(this, arguments); buildList(); const _pt = window.paintTimeline; window.paintTimeline = function () { const x = _pt.apply(this, arguments); paintList(); return x; }; return r; };

  // ---------- scrubbing: the pointer anywhere on the axis lands on the nearest storm ----------
  let hov = null, ticks = null;
  function tickMap() { ticks = new Map(); const L = ST.shown(), t0 = ST.windowStart(), span = Math.max(1, ST.today - t0); const els = scrub.querySelectorAll('.tick');
    L.forEach((s, k) => { if (els[k]) ticks.set(s, { el: els[k], x: (s.t - t0) / span }); }); }
  function nearest(e) { if (!ticks || !ticks.size) return null; const r = scrub.getBoundingClientRect(); if (e.clientY < r.top + 24) return null;   // the header row (window toggle) is not the axis
    const x = (e.clientX - r.left) / Math.max(1, r.width); let best = null, bd = 1;
    ticks.forEach((t, s) => { const d = Math.abs(t.x - x); if (d < bd) { bd = d; best = s; } }); return bd <= 0.06 ? best : null; }
  function setHov(s) { if (s === hov) return; if (hov && ticks.get(hov)) ticks.get(hov).el.classList.remove('hov'); hov = s;
    if (s) { if (s !== cur) ticks.get(s).el.classList.add('hov'); readout(s, true); } else readout(cur); }
  scrub.addEventListener('pointermove', e => { if (!ticks || ticks.size !== ST.shown().length) tickMap(); setHov(nearest(e)); });
  scrub.addEventListener('pointerleave', () => setHov(null));
  scrub.addEventListener('click', e => { if (e.target.closest('.wseg')) return; if (!ticks) tickMap(); const s = nearest(e); if (!s) return; if (s === cur) clearStorm(); else selectStorm(s.i); });
  const _bt2 = buildTimeline; buildTimeline = function () { const r = _bt2.apply(this, arguments); ticks = null; hov = null; return r; };

  // ---------- a quicker pick: short crossfade of the homes only, shorter flight ----------
  beginXfade = function () { if (homesData) { prev = { homes: homesData, hit: null, storm: false }; xf = 0; } cancelAnimationFrame(xfRaf); const t0 = performance.now();
    const step = () => { xf = EASE(Math.min(1, (performance.now() - t0) / FADE)); redraw(); if (xf < 1) xfRaf = requestAnimationFrame(step); else { prev = null; } }; xfRaf = requestAnimationFrame(step); };
  // padding: the stat card on the left, the "Hardest hit" panel on the right (336 + 16 px), the nav row at the foot
  fitStorm = function (instant) { const b = hitBounds(); if (!b) return; const pad = { top: 110, bottom: 150, left: 370, right: 380 };
    region = 'all'; document.querySelectorAll('#counties button').forEach(x => x.classList.toggle('on', x.dataset.c === 'all'));
    map.fitBounds(b, { padding: pad, pitch: tilt3d ? 50 : 0, bearing: tilt3d ? 20 : 0, maxZoom: 14.2, duration: instant ? 0 : FLY, easing: EASE }); };
  // the window's storms are built ahead in idle time, so the first click on any of them pays no compute (the cache holds six)
  ST.ready.then(() => setTimeout(() => { const L = ST.shown().slice().reverse().slice(0, 5); let k = 0; const next = () => { const s = L[k++]; if (!s) return; warmStorm(s); setTimeout(next, 250); }; next(); }, 2500));

  // ---------- timing probe: click to the map's next frame, ms (read by the refine checks: window.__pickTiming) ----------
  window.__pickTiming = function (i) { return new Promise(res => { const t0 = performance.now(); const a0 = window.__applied || 0; selectStorm(i);
    const chk = () => { if ((window.__applied || 0) > a0) { const applied = window.__applied - t0; map.once('render', () => res({ appliedMs: Math.round(applied), frameMs: Math.round(performance.now() - t0) })); map.triggerRepaint(); } else if (performance.now() - t0 > 8000) res(null); else setTimeout(chk, 1); }; chk(); }); };
  window.__sdrop = setOpen;
})();
