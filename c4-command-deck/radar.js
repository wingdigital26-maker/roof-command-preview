/* radar.js: Turnover Radar on Today (Jack 10-23, phase 2). The Radar tab in the left panel lists the streets where roofs
   are being replaced right now (public re-roof permits, last 90 days, lib/st-data-dfw/meta/turnover.json built by
   scripts/permits/build_turnover.py) with the homes next to them that have not re-roofed; the map shows each permit as an
   orange dot while the tab is open. Homes re-roofed in the last 5 years are left out. Nothing is sent from here. */
(function () {
  'use strict';
  if (window.Radar) return;
  const esc = s => RC.esc(s), MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = iso => iso ? MON[+iso.slice(5, 7) - 1] + ' ' + (+iso.slice(8, 10)) : '';
  const root = () => (window.rooferDataRoot ? rooferDataRoot() : '../lib/st-data-dfw/');
  let D = null, P = null, host = null, open = null, shown = 40, mapOn = false;
  const J = u => fetch(root() + u).then(r => r.ok ? r.json() : null).catch(() => null);
  // the list reads turnover-streets.json, already fetched at startup by the tidbits (RCTIP.turnover); the full turnover.json
  // (with the map events) loads only when the dots are drawn (visual check fixes 10-24: the tab sat 8 s on Loading on a phone)
  let F = null;
  const load = () => P || (P = (window.RCTIP && RCTIP.turnover ? RCTIP.turnover : J('meta/turnover-streets.json').then(t => t || J('meta/turnover.json'))).then(d => (D = d)));
  const full = () => F || (F = J('meta/turnover.json').then(d => { if (d && D && !D.events) D.events = d.events; return d; }));
  const lift = b => b ? Math.round(b.lift) : null;
  function head() {
    const b = D.bands, from = new Date(Date.parse(D.as_of) - D.days * 864e5).toISOString().slice(0, 10);
    return `<div class="rd-h"><b>Streets re-roofing now</b>
      <p>Re-roof permits ${esc(day(from))} to ${esc(day(D.as_of))} (city and county records). ${D.proof
        ? `Tested on ${D.proof.months} months the score never saw (${esc(D.proof.since)} on): homes with 2 or more re-roofs within about a block in 90 days re-roofed <b>${Math.round(D.proof.lift[2])} to ${Math.round(D.proof.lift[3])} times</b> as often as homes with none, and the top 500 homes held ${D.proof.top500} of ${D.proof.reroofs.toLocaleString('en-US')} re-roofs.`
        : `In past permit data, homes with 2 or more re-roofs within about a block in 90 days re-roofed <b>${lift(b[2])} to ${lift(b[3])} times</b> as often as homes with none.`}
      Homes re-roofed in the last ${D.just_years} years are left out. New permits show up 2 to 6 weeks after they are issued.</p></div>`;
  }
  function street(s, k) {
    const [name, city, permits, homes, newest, list] = s, isOpen = open === k;
    const why = (permits ? `${permits} re-roofed on this street` : 'Re-roofs right next to it') + (newest ? `, newest ${esc(day(newest))}` : '');
    const rows = isOpen ? `<div class="rd-homes">${list.map(([row, no, n, nd]) => `<button type="button" class="rd-home" data-row="${row}">
        <b>${no ? no + ' ' : ''}${esc(name)}</b><small>${n} neighbor${n === 1 ? '' : 's'} within about a block re-roofed in 90 days${nd ? ', newest ' + esc(day(nd)) : ''}</small></button>`).join('')}
        ${homes > list.length ? `<p class="rd-more">${homes - list.length} more homes on this street with a re-roof nearby.</p>` : ''}</div>` : '';
    return `<div class="rd-st${isOpen ? ' on' : ''}"><button type="button" class="rd-sh" data-k="${k}" aria-expanded="${isOpen}">
      <span class="rd-n">${permits || '·'}</span><span class="rd-t"><b>${esc(name)}</b><small>${esc(city)} · ${esc(why)}</small></span>
      <span class="rd-c">${homes}<small>to knock</small></span></button>${rows}</div>`;
  }
  function render() {
    if (!host) return;
    if (!D) { host.innerHTML = '<p class="rd-empty">Loading the re-roof permits...</p>'; return; }
    if (!D.streets || !D.streets.length) { host.innerHTML = head() + '<p class="rd-empty">No re-roof permits in the last 90 days near homes on file.</p>'; return; }
    host.innerHTML = head() + `<button type="button" class="rd-map">See every re-roof on the Storms map</button><div class="rd-list">${D.streets.slice(0, shown).map(street).join('')}</div>` +
      (D.streets.length > shown ? `<button type="button" class="rd-showmore">Show more streets</button>` : '') +
      (window.RCTIP ? RCTIP.lineHTML((RCTIP.list().find(t => t.k === 'skip') || RCTIP.list().find(t => t.k === 'radar')) && { text: 'Why this list: ' + [D.proof ? `the top 500 homes by this score held ${D.proof.top500} of ${D.proof.reroofs.toLocaleString('en-US')} re-roofs in ${D.proof.months} test months (a random 500: about ${Math.round(D.proof.random500 || 7)})` : '', (RCTIP.list().find(t => t.k === 'skip') || {}).text || ''].filter(Boolean).join('. '), src: 'Turnover Radar back-test and city and county re-roof permits.' }, 'ft') : '') +
      `<p class="rd-src">${esc(D.source)}</p>`;
  }
  function fit(rows) {
    if (typeof map === 'undefined' || !map || !window.STH || !STH.xy || !rows.length) return;
    let a = 180, b = 90, c = -180, d = -90; rows.forEach(r => { const x = STH.lon(r), y = STH.lat(r); a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); });
    try { map.fitBounds([[a - .002, b - .0015], [c + .002, d + .0015]], { padding: 60, maxZoom: 17, duration: 700 }); } catch (e) {}
  }
  // the opened street's homes on Today's map (visual check polish 10-24): the map used to fly to the street and show only a stray
  // spoke from the office; now each home to knock is a ringed dot, the re-roofs nearby are the orange dots
  function streetDots(rows) {
    if (typeof map === 'undefined' || !map || !window.STH || !STH.xy) return;
    const fc = { type: 'FeatureCollection', features: (rows || []).map(r => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [STH.lon(r), STH.lat(r)] }, properties: {} })) };
    const go = () => {
      if (!map.getSource('rd-st')) {
        map.addSource('rd-st', { type: 'geojson', data: fc });
        map.addLayer({ id: 'rd-st', type: 'circle', source: 'rd-st', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 17, 5.5], 'circle-color': '#fff', 'circle-stroke-color': '#0E6E9E', 'circle-stroke-width': 2 } });
      } else map.getSource('rd-st').setData(fc);
      map.setLayoutProperty('rd-st', 'visibility', rows && rows.length && mapOn ? 'visible' : 'none');
    };
    if (map.isStyleLoaded && map.isStyleLoaded()) go(); else map.once('load', go);
  }
  function layer(on) {
    mapOn = on; if (typeof map === 'undefined' || !map || !D) return;
    if (on && !D.events) { full().then(() => { if (mapOn && D.events) layer(true); }); return; }
    const go = () => {
      const fc = { type: 'FeatureCollection', features: D.events.map(e => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [e[0], e[1]] }, properties: { d: e[2] } })) };
      if (!map.getSource('rd-ev')) {
        map.addSource('rd-ev', { type: 'geojson', data: fc });
        map.addLayer({ id: 'rd-halo', type: 'circle', source: 'rd-ev', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 5, 16, 22], 'circle-color': '#F08A24', 'circle-opacity': .18 } });
        map.addLayer({ id: 'rd-dot', type: 'circle', source: 'rd-ev', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 16, 6], 'circle-color': '#E06A00', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });
      }
      ['rd-halo', 'rd-dot'].forEach(id => map.setLayoutProperty(id, 'visibility', mapOn ? 'visible' : 'none'));
      if (map.getLayer('rd-st')) map.setLayoutProperty('rd-st', 'visibility', mapOn && open != null ? 'visible' : 'none');
    };
    if (map.isStyleLoaded && map.isStyleLoaded()) go(); else map.once('load', go);
  }
  function mount(el) {
    host = el; render(); load().then(() => { render(); if (mapOn) layer(true); });
    el.addEventListener('click', e => {
      const sh = e.target.closest('.rd-sh'); if (sh) { const k = +sh.dataset.k; open = open === k ? null : k; render();
        const rs = open != null && D ? D.streets[k][5].map(h => h[0]) : []; if (window.STH && STH.ready) STH.ready.then(() => { streetDots(rs); if (rs.length) fit(rs); }); return; }
      const h = e.target.closest('.rd-home'); if (h) { RC.go('home', { id: 'm' + h.dataset.row }); return; }
      if (e.target.closest('.rd-showmore')) { shown += 60; render(); }
      if (e.target.closest('.rd-map')) { try { localStorage.setItem('rc.rdOnce', String(Date.now())); } catch (er) {} RC.go('storm', {}); }
    });
  }
  const css = `
.rd-h{padding:4px 14px 10px}.rd-h b{font-size:15px}.rd-h p{margin:6px 0 0;font-size:12.5px;line-height:1.45;color:var(--muted)}
.rd-list{display:flex;flex-direction:column}
.rd-st{border-top:1px solid var(--rule,#E4E7EC)}.rd-st.on{background:var(--panel-2,#F5F6F8)}
.rd-sh{all:unset;box-sizing:border-box;display:grid;grid-template-columns:30px 1fr auto;gap:10px;align-items:center;width:100%;padding:10px 14px;cursor:pointer}
.rd-sh:focus-visible{outline:2px solid var(--accent,#0E6E9E);outline-offset:-2px}
.rd-n{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#FFE7D1;color:#9A4300;font-weight:700;font-size:13px}
.rd-t{min-width:0}.rd-t b{display:block;font-size:14px}.rd-t small{display:block;font-size:12px;color:var(--muted);line-height:1.35}
.rd-c{text-align:right;font-weight:700;font-size:15px}.rd-c small{display:block;font-size:11px;font-weight:500;color:var(--muted)}
.rd-homes{padding:0 10px 10px 54px;display:flex;flex-direction:column;gap:4px}
.rd-home{all:unset;box-sizing:border-box;display:block;padding:7px 10px;border-radius:10px;background:#fff;border:1px solid var(--rule,#E4E7EC);cursor:pointer}
.rd-home:hover{border-color:var(--ink,#0B1020)}.rd-home b{display:block;font-size:13px}.rd-home small{display:block;font-size:11.5px;color:var(--muted)}
.rd-more,.rd-empty,.rd-src{font-size:12px;color:var(--muted);padding:6px 14px;margin:0;line-height:1.45}
.rd-map{all:unset;box-sizing:border-box;display:block;margin:0 14px 10px;font:600 12.5px/1.4 inherit;color:#9A4300;cursor:pointer}.rd-map:hover{text-decoration:underline}
.rd-showmore{display:block;margin:8px 14px;padding:8px 12px;border-radius:10px;border:1px solid var(--rule,#E4E7EC);background:#fff;font:600 13px/1 inherit;cursor:pointer}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  window.Radar = { mount, layer, load };
})();
