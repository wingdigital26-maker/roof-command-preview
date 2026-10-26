/* rc-tips.js (window.RCTIP): small "how Roof Command helps" tidbits (Jack 10-23: "don't make it too noticeable and make it
   visually appealing"). Every number comes from a data file the daily job rebuilds, never typed in here:
   - meta/turnover.json proof: the Turnover Radar back-test on held-out months (scripts/permits/turnover_backtest.py)
   - meta/daily/cands.json justSkipped: homes left off the Daily 50 because they re-roofed recently (scripts/dfw/daily_cands.py)
   - meta/refresh.json: the morning job's radar and permit check (scripts/permits/write_stamp.py)
   - this device's pipeline (RC.pipeline): homes texted or emailed this week, inspections booked
   One tidbit shows at a time; a tap shows its source. No dashboard, no banner, no status dots. */
(function () {
  'use strict';
  if (window.RCTIP) return;
  const root = () => (window.rooferDataRoot ? rooferDataRoot() : (document.currentScript ? new URL('st-data-dfw/', document.currentScript.src).href : '../lib/st-data-dfw/'));
  const ROOT = root();
  const J = u => fetch(ROOT + u).then(r => r.ok ? r.json() : null).catch(() => null);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = iso => iso ? MON[+iso.slice(5, 7) - 1] + ' ' + (+iso.slice(8, 10)) : '';
  const fmt = n => (+n).toLocaleString('en-US');
  let T = null, C = null, S = null;
  // Turnover Radar without the per-home rows and map events (turnover-streets.json, half the bytes), shared with Today's
  // Radar tab so it is fetched once at startup (visual check fixes 10-24); the full file is the fallback
  const turnover = J('meta/turnover-streets.json').then(t => t || J('meta/turnover.json'));
  const ready = Promise.all([turnover, J('meta/daily/cands.json'), J('meta/refresh.json')]).then(([t, c, s]) => { T = t; C = c; S = s; });
  // per-band lift on held-out months (index: 0 none, 1 one, 2 two to three, 3 four or more)
  function lift(n) { const p = T && T.proof; if (!p || !n) return null; const k = n === 1 ? 1 : n <= 3 ? 2 : 3; return p.lift[k] || null; }
  function mine() {
    const P = (window.RC && RC.pipeline ? RC.pipeline() : {}) || {}, wk = Date.now() - 7 * 864e5; let reached = 0, booked = 0;
    Object.entries(P).forEach(([id, p]) => {
      if ((p.history || []).some(e => (e.kind === 'text' || e.kind === 'email') && e.dir !== 'in' && Date.parse(e.at) >= wk)) reached++;
      if (window.RC && RC.booking && RC.booking(id)) booked++;
    });
    return { reached, booked };
  }
  // every tidbit the data supports today: { k, text, src }
  function list() {
    const out = [], p = T && T.proof;
    if (p && p.top500 && p.random500) out.push({ k: 'radar', text: `Radar's top 500 homes held ${fmt(p.top500)} of ${fmt(p.reroofs)} re-roofs in ${p.months} test months, about ${Math.round(p.top500 / p.random500)}x a random list.`,
      src: `Back-test on public re-roof permits, ${p.since} on, months the score never saw (rebuilt monthly).` });
    if (C && C.justSkipped) out.push({ k: 'skip', text: `${fmt(C.justSkipped)} homes re-roofed in the last ${C.justYears || 5} years are skipped, so fewer wasted doors.`,
      src: 'City and county re-roof permits, checked every morning.' });
    if (S && S.radar_through) out.push({ k: 'watch', text: `Hail radar checked every morning, through ${day(S.radar_through)}. Newest hail on file: ${day(S.newest_storm)}.`,
      src: 'NOAA MRMS radar hail, the daily storm watcher.' });
    out.push({ k: 'sq', text: 'Roof sizes come from LiDAR, typically within about 10% of permit records.', src: '36-home Frisco answer key: our squares against roofer permit squares.' });
    const m = mine();
    if (m.reached) out.push({ k: 'you', text: `You reached ${m.reached} home${m.reached === 1 ? '' : 's'} this week${m.booked ? `, ${m.booked} inspection${m.booked === 1 ? '' : 's'} booked` : ''}.`, src: 'Your texts, emails and bookings on this device.' });
    return out;
  }
  // today's one tidbit: rotates by the day (the same all day, a new one tomorrow)
  function today() { const L = list(); if (!L.length) return null; const d = Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4) / 864e5); return L[d % L.length]; }
  const ICON = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M8 1.8l1.6 3.5 3.8.4-2.9 2.6.8 3.8L8 10.2 4.7 12.1l.8-3.8L2.6 5.7l3.8-.4z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
  // a quiet line: icon, text, tap for the source
  function lineHTML(t, cls) {
    if (!t) return '';
    const e = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    return `<button type="button" class="rc-tip${cls ? ' ' + cls : ''}" aria-expanded="false" title="${e(t.src)}">${ICON}<span>${e(t.text)}</span><small>${e(t.src)}</small></button>`;
  }
  document.addEventListener('click', ev => { const b = ev.target.closest('.rc-tip'); if (!b) return; const on = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', on); });
  const css = `.rc-tip{all:unset;box-sizing:border-box;display:inline-grid;grid-template-columns:14px minmax(0,1fr);column-gap:6px;align-items:start;max-width:100%;cursor:pointer;font:500 12.5px/1.45 Inter,system-ui,sans-serif;color:var(--muted,#5A6478);letter-spacing:.005em}
.rc-tip svg{margin-top:2px;color:#C08A2E;opacity:.9}
.rc-tip span{min-width:0}.rc-tip small{display:none;grid-column:2;font-size:11.5px;color:var(--muted,#5A6478);opacity:.85}
.rc-tip[aria-expanded="true"] small{display:block}.rc-tip:focus-visible{outline:2px solid var(--accent,#0E6E9E);outline-offset:3px;border-radius:6px}
.rc-tip.hd{margin-top:8px}.rc-tip.ft{padding:6px 14px 2px}.rc-tip.in{display:grid;margin-top:6px;font-size:12px}`;
  const st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st);
  window.RCTIP = { ready, list, today, lift, lineHTML, proof: () => T && T.proof, turnover };
})();
