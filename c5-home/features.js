/* features.js: the kept CRM and home-record trials (Jack 10-11), switches in lib/rc-features.js. Plain script, runs
   after crm.js, before home.js. Only adds to the page: nothing here edits crm.js, rec.js or pipe.js markup; the odometer
   re-reads the counts after each paint (MutationObserver). Real data only.
     roofBuild  the stamp that labels the finished 3D roof with its estimated numbers (home.js animates; stage fires rc:roofbuilt)
     rollup     pipeline counts roll like an odometer when they change (up or down, any digit count, rapid changes, reduced motion) */
(function () {
  'use strict';
  const F = window.RC_FEATURES; if (!F) return;
  const on = k => !!F[k];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, r) => (r || document).querySelector(s);
  const RM = matchMedia('(prefers-reduced-motion: reduce)');

  // ---------- Booked roll-up: counts roll like an odometer when they change ----------
  // The old digit lives in a data attribute (CSS ::before), so the element's textContent is only ever the new value and
  // a re-read mid-roll never sees "45" for 4 -> 5. Each change rebuilds the digits, so a rapid run of changes restarts
  // from the latest value. Digits that did not change stay still; a grown number rolls its new leading digit in from blank.
  const lastN = {};
  function odo(el, from, to) {
    const f = String(from), t = String(to), len = Math.max(f.length, t.length), fp = f.padStart(len, ' '), tp = t.padStart(len, ' ');
    const up = to > from;
    el.innerHTML = tp.split('').map((d, i) => { const a = fp[i];
      if (a === d) return `<span>${d === ' ' ? '' : d}</span>`;
      return `<span class="rc-roll${up ? '' : ' dn'}" data-from="${a.trim()}"><i>${d.trim()}</i></span>`; }).join('');
    el.classList.add('rc-odo');
    // once the roll is over the count is plain text again (10-19: the badge's own "i" styles boxed the rolling digit,
    // so "50" read as a boxed 5 over a 0 for as long as the digits stayed)
    const tok = el.__odo = (el.__odo || 0) + 1;
    setTimeout(() => { if (el.__odo === tok) el.textContent = t; }, 700);
  }
  function rollCounts() {
    if (!on('rollup')) return;
    document.querySelectorAll('#pcount .pcn').forEach(p => {
      const k = p.dataset.drop, b = p.querySelector('b'); if (!b || !k) return;
      const n = parseInt(b.textContent, 10); if (isNaN(n)) return;
      if (lastN[k] != null && lastN[k] !== n && !RM.matches) { odo(b, lastN[k], n); p.classList.remove('rc-bump'); void p.offsetWidth; p.classList.add('rc-bump'); }
      lastN[k] = n;
    });
    const tab = $('#pipeN'); if (tab) { const n = parseInt(tab.textContent, 10); if (!isNaN(n)) { if (lastN.__tab != null && lastN.__tab !== n && !RM.matches) odo(tab, lastN.__tab, n); lastN.__tab = n; } }
  }

  // ---------- the roof-build stamp: the finished roof labels itself with its estimated numbers ----------
  function stampHTML(d) {
    const hail = d.hail != null ? `<div class="rc-sh"><i style="--d:${Math.max(10, Math.min(34, Math.round(d.hail * 16)))}px"></i><b>${d.hail.toFixed(2)} in</b><small>hail, ${esc(d.hailDate)}, radar</small></div>` : `<div class="rc-sh"><b class="sm">No hail on file</b><small>for this address</small></div>`;
    // a measured home (LiDAR roof facets) says measured and shows both pitches; an outline estimate keeps est.
    // roof shape being checked: the LiDAR record's squares and pitch only (estimates), no section count; no record, no size
    if (d.checking) return d.lidarYear ? `${hail}<div class="rc-sm" title="Estimated from ${d.lidarYear} LiDAR. Verify on site."><div><b>~${esc(String(d.squares))}</b><small>sq est., LiDAR</small></div><div><b>${esc(d.pitch)}</b><small>pitch, LiDAR</small></div></div>`
      : `${hail}<div class="rc-sm"><div><b class="sm">Roof size not measured</b><small>no LiDAR for this home</small></div></div>`;
    if (d.facet) return `${hail}<div class="rc-sm" title="Measured from LiDAR roof facets. Verify on site."><div><b>${esc(String(d.squares))}</b><small>sq est., LiDAR</small></div><div><b>${esc(d.pitch)}</b><small>pitch, LiDAR</small></div><div><b>${d.planes}</b><small>${d.outline ? 'sections' : 'facets'}</small></div></div>`;
    const pitch = d.pitchGap ? `<b>No LiDAR</b><small>pitch est.</small>` : `<b>${esc(d.pitch)}</b><small>pitch est.${d.pitchMeasured ? ', LiDAR' : ''}</small>`;
    return `${hail}<div class="rc-sm" title="Estimated from public building outlines and 2018 LiDAR. Verify on site."><div><b>~${esc(String(d.squares))}</b><small>sq (est.)</small></div><div>${pitch}</div><div><b>${d.planes}</b><small>planes</small></div></div>`;
  }
  function onBuilt(e) {
    if (!on('roofBuild')) return;
    const d = e.detail || {}, stage = $('#stage'); if (!stage || d.none) return;
    let el = stage.querySelector('.rc-built'); if (!el) { el = document.createElement('div'); el.className = 'rc-built'; el.setAttribute('aria-live', 'polite'); stage.appendChild(el); }
    el.innerHTML = stampHTML(d); el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
  }
  const stage0 = $('#stage'); if (stage0) stage0.addEventListener('rc:roofbuilt', onBuilt);
  // the stamp stays until the user starts working the roof (drag, click a plane) or the home changes
  document.addEventListener('pointerdown', e => { const s = $('#stage .rc-built.in'); if (s && e.target.closest('#stage')) s.classList.remove('in'); }, true);

  // ---------- run after every paint ----------
  let raf = 0;
  const run = () => { raf = 0; rollCounts(); };
  F.rollNow = () => { rollCounts(); return true; };   // review hook: re-read the counts now
  const schedule = () => { if (!raf) raf = requestAnimationFrame(run); };
  const mo = new MutationObserver(schedule);
  ['#pcount'].forEach(s => { const n = $(s); if (n) mo.observe(n, { childList: true, subtree: true, characterData: true }); });
  const tab = $('#pipeN'); if (tab) mo.observe(tab, { childList: true, characterData: true, subtree: true });
  run();
})();
