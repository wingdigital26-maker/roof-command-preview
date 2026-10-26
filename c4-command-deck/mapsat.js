/* mapsat.js: Today's map gets a "Map | Satellite" switch (Jack 10-26). Satellite is the same imagery as the home record
   (lib/rc-imagery.js: Esri World Imagery live, about 0.3 m, NAIP if Esri is off or fails), drawn under the place names, with
   the imagery credit on the map. The choice is remembered on this device (localStorage rc-todaymap). The pins get a white
   ring on the photo so they stay readable. Nothing is stored: tiles are shown live only. */
(function () {
  'use strict';
  const KEY = 'rc-todaymap', SRC = 'rcsat';
  let want = (() => { try { return localStorage.getItem(KEY) === 'sat' ? 'sat' : 'map'; } catch (e) { return 'map'; } })();
  const css = document.createElement('style');
  css.textContent = `
.mseg{display:inline-flex;gap:2px;padding:2px;border-radius:6px;background:#fff;border:1px solid var(--c-line,#D5D9E0);margin-left:auto;height:28px;align-items:stretch}
.mseg button{font:inherit;font-size:12px;font-weight:600;border:0;border-radius:4px;padding:0 10px;background:none;color:var(--c-slate,#5A6378);cursor:pointer;white-space:nowrap}
.mseg button[aria-pressed="true"]{background:var(--c-ink,#0B1020);color:#fff}
.mtag .mseg + .mexp{margin-left:0}
.satcredit{position:absolute;left:8px;bottom:6px;z-index:2;max-width:calc(100% - 120px);font-size:10.5px;line-height:1.3;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.8);pointer-events:none}
.satcredit[hidden]{display:none}
html.mapsat .stop{box-shadow:0 0 0 2px #fff,0 2px 8px rgba(0,0,0,.5)!important}
html.mapsat .stop:not(.now):not(.reached){border-color:#0B1020!important;color:#0B1020!important}
html.mapsat .hqm .hqd{box-shadow:0 0 0 2px #fff,0 2px 8px rgba(0,0,0,.5)}
@media (max-width:640px){ .mseg{height:44px} .mseg button{padding:0 14px;font-size:13px} }`;
  document.head.appendChild(css);

  function seg() {
    const tag = document.querySelector('.mtag'); if (!tag || tag.querySelector('.mseg')) return;
    const s = document.createElement('div'); s.className = 'mseg'; s.setAttribute('role', 'group'); s.setAttribute('aria-label', 'Map style');
    s.innerHTML = '<button type="button" data-ms="map">Map</button><button type="button" data-ms="sat">Satellite</button>';
    const exp = tag.querySelector('.mexp'); tag.insertBefore(s, exp || null);
    s.onclick = e => { const b = e.target.closest('[data-ms]'); if (!b) return; want = b.dataset.ms; try { localStorage.setItem(KEY, want); } catch (er) { } apply(); };
  }
  let credit = null, fails = 0, img = null, saved = null;
  // place names: dark grey on the light map, white with a dark halo on the photo (restored exactly when switching back)
  function labels(M, sat) {
    const sym = (M.getStyle().layers || []).filter(l => l.type === 'symbol' && l.layout && l.layout['text-field']);
    if (sat && !saved) { saved = {}; sym.forEach(l => { saved[l.id] = [M.getPaintProperty(l.id, 'text-color'), M.getPaintProperty(l.id, 'text-halo-color'), M.getPaintProperty(l.id, 'text-halo-width')];
      M.setPaintProperty(l.id, 'text-color', '#FFFFFF'); M.setPaintProperty(l.id, 'text-halo-color', 'rgba(11,16,32,.8)'); M.setPaintProperty(l.id, 'text-halo-width', 1.4); }); }
    else if (!sat && saved) { sym.forEach(l => { const v = saved[l.id]; if (!v) return; M.setPaintProperty(l.id, 'text-color', v[0]); M.setPaintProperty(l.id, 'text-halo-color', v[1]); M.setPaintProperty(l.id, 'text-halo-width', v[2]); }); saved = null; }
  }
  function apply() {
    document.querySelectorAll('.mseg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ms === want)));
    document.documentElement.classList.toggle('mapsat', want === 'sat');
    const M = typeof map !== 'undefined' ? map : null; if (!M || !M.isStyleLoaded || !window.RCIMG) return;
    const host = M.getContainer().parentElement;
    if (!credit) { credit = document.createElement('div'); credit.className = 'satcredit'; credit.hidden = true; host.appendChild(credit); }
    if (want === 'sat') {
      if (!M.getSource(SRC)) {
        img = img || RCIMG.tiles();
        M.addSource(SRC, { type: 'raster', tiles: img.tiles, tileSize: 256, maxzoom: img.maxzoom, attribution: img.credit });
        const first = (M.getStyle().layers || []).find(l => l.type === 'symbol');
        M.addLayer({ id: SRC, type: 'raster', source: SRC, paint: { 'raster-fade-duration': 0 } }, first ? first.id : undefined);
      }
      credit.textContent = img.credit; credit.hidden = false; labels(M, true);
    } else {
      if (M.getLayer(SRC)) M.removeLayer(SRC);
      if (M.getSource(SRC)) M.removeSource(SRC);
      credit.hidden = true; labels(M, false);
    }
  }
  // Esri failing (no network to it, or refused): the same switch shows NAIP instead
  function watch(M) {
    M.on('error', e => { if (!e || e.sourceId !== SRC || !img || img.source !== 'esri') return;
      if (++fails < 6) return;
      img = { source: 'naip', credit: RCIMG.NAIP_CREDIT, maxzoom: 16, tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'] };
      if (M.getLayer(SRC)) M.removeLayer(SRC); if (M.getSource(SRC)) M.removeSource(SRC); apply(); });
    M.on('styledata', () => { if (want === 'sat' && !M.getSource(SRC)) apply(); });
  }
  seg(); apply();
  const t0 = Date.now(), iv = setInterval(() => {
    const M = typeof map !== 'undefined' ? map : null;
    if (M && M.isStyleLoaded && M.isStyleLoaded()) { clearInterval(iv); seg(); watch(M); apply(); }
    else if (Date.now() - t0 > 60000) clearInterval(iv);
  }, 300);
})();
