/* Evidence card on the home record (Jack's proposal, feature 3, 10-26): the Opportunity Score with its breakdown, kept
   apart from how sure the evidence is (High / Medium / Unknown); roof age with its source; storm hits with date, size and
   source; roof size and pitch (an estimate); neighbors' re-roofs; this home's CRM history; contact eligibility; and when
   each source was refreshed. Plain words on the surface, the details one tap away. Reads lib/rc-scores.js (RCS.explain),
   the same call Nimbus makes. Addresses only, never owner names. Runs after rec.js (wraps window.renderRecord). */
(function () {
  'use strict';
  const RC = window.RC, esc = RC.esc, host = document.getElementById('evidPanel');
  if (!host || !window.RCS) return;
  const css = document.createElement('style');
  css.textContent = `.evid .evtop{display:flex;gap:14px;align-items:center;padding:4px 0 10px}
  .evid .evs{display:grid;place-items:center;min-width:64px;height:56px;border-radius:10px;background:#E7EEFF;color:#1F47C9;font-weight:700;font-size:26px;line-height:1}
  .evid .evs small{font-size:10.5px;font-weight:600;color:#5A6378;letter-spacing:.03em}
  .evid .evsum{font-size:13.5px;line-height:1.45;color:#2A3246}
  .evid .evc{display:inline-block;font-size:11.5px;font-weight:600;border-radius:999px;padding:2px 9px;border:1px solid #D5D9E0;margin-right:6px}
  .evid .evc.high{background:#E6F4EC;border-color:#BFE3CE;color:#11734B}.evid .evc.medium{background:#FFF5E0;border-color:#F1DDB0;color:#8A5A00}.evid .evc.low{background:#FFF0E6;border-color:#F3D2BC;color:#8A3B00}.evid .evc.unknown{background:#F1F2F5;color:#5A6378}
  .evid .evno{margin:0 0 10px;padding:8px 10px;border-radius:6px;background:#FDECEC;color:#9B1C1C;font-size:13px;font-weight:600}
  .evid .evok{color:#11734B;font-weight:600}
  .evid details{border-top:1px solid #E6E8ED;padding:9px 0}
  .evid summary{list-style:none;cursor:pointer;display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:center}
  .evid summary::-webkit-details-marker{display:none}
  .evid summary b{font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#5A6378;font-weight:600}
  .evid summary span{grid-column:1;font-size:14px;color:#0B1020;line-height:1.4}
  .evid summary em{grid-row:1 / span 2;grid-column:2;font-style:normal;font-size:13px;font-weight:650;color:#0B1020;white-space:nowrap}
  .evid summary i{grid-column:1 / span 2;display:block;height:5px;border-radius:3px;background:#E6E8ED;overflow:hidden}
  .evid summary i u{display:block;height:100%;background:#1F47C9}
  .evid .evd{font-size:12.5px;color:#465065;line-height:1.5;margin-top:7px}
  .evid .evd ul{margin:6px 0 0;padding-left:18px}
  .evid .evf{font-size:11.5px;color:#5A6378;line-height:1.5;padding-top:8px;border-top:1px solid #E6E8ED}
  .evid .evf a{color:#1F47C9}`;
  document.head.appendChild(css);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dl = iso => iso ? MON[+iso.slice(5, 7) - 1] + ' ' + (+iso.slice(8, 10)) + ', ' + iso.slice(0, 4) : '';
  const NAMES = { roofAge: 'Roof age', storm: 'Storm', roof: 'Roof', crm: 'Your contact', neighborhood: 'Neighbors' };
  let cur = null, open = {};
  const giNow = () => { const H = window.HOME; if (!H || !H.rec) return null; const g = H.rec.gi != null ? +H.rec.gi : /^m(\d+)$/.test(H.rawId || '') ? +H.rawId.slice(1) : null; return g >= 0 ? g : null; };

  function render(E) {
    if (!E) { host.innerHTML = '<div class="ph"><h3>Why this home</h3></div><p class="note">Reading the score and its evidence…</p>'; return; }
    const P = E.parts, part = (k, extra) => {
      const p = P[k], w = p.max ? Math.round(100 * p.pts / p.max) : 0;
      return `<details data-k="${k}"${open[k] ? ' open' : ''}><summary><b>${NAMES[k]}</b><span>${esc(p.plain)}</span><em>${Math.round(p.pts * 10) / 10} of ${p.max}</em><i><u style="width:${w}%"></u></i></summary>
        <div class="evd">${k === 'roofAge' ? `<span class="evc ${p.conf}">Evidence: ${esc(p.confWord)}</span>` : ''}${esc(p.detail)}${extra || ''}</div></details>`;
    };
    const storms = E.storms.length ? `<ul>${E.storms.map(s => `<li>${esc(s.label)}: ${s.inches.toFixed(2)} in${s.inches >= 1 ? '' : ' (under 1 in)'}</li>`).join('')}</ul><div>Source: NOAA MRMS radar hail, about 1 km grid. An estimate, not an inspection.</div>` : '';
    const crm = E.crm && E.crm.touches ? `<div>Stage: ${esc(E.crm.stage || 'new')}. ${E.crm.touches} touch${E.crm.touches > 1 ? 'es' : ''} on this device.</div>` : '';
    host.hidden = false;
    host.innerHTML = `<div class="ph"><h3>Why this home</h3><span class="pill">Opportunity score</span></div>
      ${E.eligibility.ok ? '' : `<p class="evno">Do not contact: ${esc(E.eligibility.reason)}. This always wins over the score.</p>`}
      <div class="evtop"><div class="evs">${E.score}<small>of 100</small></div>
        <div class="evsum"><span class="evc ${E.conf}">Evidence: ${esc(E.confWord)}</span>${E.eligibility.ok ? '<span class="evok">OK to contact</span>' : ''}<br>${esc(P.roofAge.plain)}. ${esc(P.storm.plain)}.</div></div>
      ${part('roofAge')}${part('storm', storms)}${part('roof')}${part('neighborhood')}${part('crm', crm)}
      <div class="evf">Score is a ranking, not proof of damage. Scores built ${esc(dl(E.refreshed.scores.slice(0, 10)))}; permits through ${esc(dl(E.refreshed.permits))}; radar through ${esc(dl(E.refreshed.radar))}.
        <a href="../audit/scores/index.html" target="_blank" rel="noopener">How the score is tested</a></div>`;
  }
  host.addEventListener('toggle', e => { const d = e.target.closest && e.target.closest('details'); if (d) open[d.dataset.k] = d.open; }, true);

  function update() {
    const gi = giNow(); if (gi == null) { host.hidden = true; return; }
    if (gi === cur) return; cur = gi; render(null);
    RCS.explain(gi).then(E => { if (gi === cur) render(E); }).catch(() => { if (gi === cur) host.hidden = true; });
  }
  const prev = window.renderRecord; window.renderRecord = function () { if (prev) prev.apply(this, arguments); update(); };
  RC.on(d => { if (d && ['pipe', 'optout', 'suppress'].includes(d.key)) { const g = cur; cur = null; if (g != null) update(); } });
  update(); setInterval(update, 1000);   // a home switched in place (rec.js switchTo) without a render call
  if (window.HOME_READY && window.HOME_READY.then) window.HOME_READY.then(update);
  window.EVIDENCE = { refresh: () => { cur = null; update(); } };
})();
