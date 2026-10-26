/* st-radar-layer.js: Turnover Radar on the Storms map (Jack 10-23). A "Re-roofs" button in the map controls turns on every
   re-roof permit of the last 90 days (lib/st-data-dfw/meta/turnover.json events, city and county records) as an orange dot;
   a tap on a dot says what it is. Off by default. Uses the page's map (lib/st-map.js); adds its own source and layers only. */
(function () {
  'use strict';
  if (typeof map === 'undefined' || !map) return;
  const btn = document.getElementById('rdBtn'); if (!btn) return;
  const root = window.rooferDataRoot ? rooferDataRoot() : 'lib/st-data-dfw/';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], day = iso => MON[+iso.slice(5, 7) - 1] + ' ' + (+iso.slice(8, 10));
  let D = null, on = false, pop = null;
  const load = () => D ? Promise.resolve(D) : fetch(root + 'meta/turnover.json').then(r => r.ok ? r.json() : null).then(d => (D = d)).catch(() => null);
  function add() {
    if (!D || map.getSource('rd-ev')) return;
    map.addSource('rd-ev', { type: 'geojson', data: { type: 'FeatureCollection', features: D.events.map(e => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [e[0], e[1]] }, properties: { d: e[2], c: e[3] } })) } });
    map.addLayer({ id: 'rd-halo', type: 'circle', source: 'rd-ev', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 13, 9, 17, 26], 'circle-color': '#F08A24', 'circle-opacity': .2 } });
    map.addLayer({ id: 'rd-dot', type: 'circle', source: 'rd-ev', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 1.6, 13, 3.5, 17, 7], 'circle-color': '#E06A00', 'circle-stroke-color': '#fff', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 9, 0, 13, 1] } });
    map.on('click', 'rd-dot', e => { const f = e.features && e.features[0]; if (!f) return;
      if (pop) pop.remove(); pop = new maplibregl.Popup({ closeButton: false, offset: 8, className: 'rd-pop' }).setLngLat(f.geometry.coordinates)
        .setHTML(`<b>Re-roof permit, ${day(f.properties.d)}</b><br>${f.properties.c || ''} &middot; homes within about a block of a re-roof re-roofed ${D.proof ? Math.round(D.proof.lift[2]) + ' to ' + Math.round(D.proof.lift[3]) + 'x' : 'many times'} as often in our test`).addTo(map); });
    map.on('mouseenter', 'rd-dot', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'rd-dot', () => { map.getCanvas().style.cursor = ''; });
  }
  function set(v, keep) {
    on = v; btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (keep) try { localStorage.setItem('rc.rdMap', on ? '1' : '0'); } catch (e) {}
    if (!on) { ['rd-halo', 'rd-dot'].forEach(id => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', 'none')); if (pop) pop.remove(); return; }
    load().then(() => { const go = () => { add(); ['rd-halo', 'rd-dot'].forEach(id => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', 'visible')); };
      if (map.isStyleLoaded()) go(); else map.once('idle', go); });
  }
  btn.addEventListener('click', () => set(!on, true));
  // arriving from Today's Radar tab (radar.js sets rc.rdOnce): the dots come on for this visit, the saved choice stays as it is
  const fresh = () => { try { return Date.now() - (+localStorage.getItem('rc.rdOnce') || 0) < 120000; } catch (e) { return false; } };
  addEventListener('storage', e => { if (e.key === 'rc.rdOnce' && fresh() && !on) set(true); });
  if (fresh()) set(true);
  // keep the dots above whatever the map adds later (the Satellite view's photo, the 3D houses): checked when the map settles
  map.on('idle', () => { if (!on || !map.getLayer('rd-dot')) return; const ids = map.getStyle().layers.map(l => l.id);
    if (ids[ids.length - 1] !== 'rd-dot') { map.moveLayer('rd-halo'); map.moveLayer('rd-dot'); } });
  load().then(d => { if (d) btn.title = `Re-roof permits from ${day(new Date(Date.parse(d.as_of) - d.days * 864e5).toISOString().slice(0, 10))} to ${day(d.as_of)} (city and county records): ${d.events.length} homes. Homes near them are the Radar list on Today.`; });
  let saved = null; try { saved = localStorage.getItem('rc.rdMap'); } catch (e) {}
  if (saved === '1') set(true);
  const st = document.createElement('style'); st.textContent = '.rd-pop .maplibregl-popup-content{font:12.5px/1.45 Inter,system-ui,sans-serif;padding:8px 10px;border-radius:10px;max-width:240px}#rdBtn[aria-pressed="true"]{color:#9A4300;background:#FFE7D1}#rdBtn .rdd{display:inline-block;width:9px;height:9px;border-radius:50%;background:#E06A00;box-shadow:0 0 0 3px rgba(240,138,36,.25)}';
  document.head.appendChild(st);
})();
