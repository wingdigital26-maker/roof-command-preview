/* rc-hail.js (window.RCH): one home's hail across every storm on file, and the neighbors who took the same hail.
   Reads only the app's own data (lib/st-data-dfw via STM.BASE): catalog.json (storms, regions), meta/hail/<region>/<date>.bin
   (radar hail per home, NOAA MRMS MESH, 1/100 in, one byte per home), homes.bin (Float32 lon,lat per home, then one type
   byte per home), meta/permits.json (reroof permits). Never loads owner names. Nothing here sends anything.

   RCH.history(gi)            -> Promise<[{ iso, date, inches }]> every storm on file, newest first (0 = no hail at the house)
   RCH.neighbors(gi, opts)    -> Promise<{ storm, list:[{ gi, id, addr, dist, inches, iso, year, permit }] }>
                                 homes within opts.radius metres (default 400) that took 1 in+ on one of this home's own
                                 1 in+ storms (the biggest one), not reroofed since, nearest bigger hail first
   RCH.claimLine(iso)         -> "4 months ago. One year from the storm: Jun 2, 2027." (a check, never legal advice)
   RCH.fmtDay(iso)            -> "Jun 2, 2026" */
(function () {
  if (window.RCH) return;
  const base = () => (window.STM && STM.BASE) || (window.rooferDataRoot ? rooferDataRoot() : new URL('st-data-dfw/', document.currentScript ? document.currentScript.src : location.href).href);
  const J = u => fetch(base() + u).then(r => r.ok ? r.json() : null).catch(() => null);
  const B1 = u => fetch(base() + u).then(r => r.ok ? r.arrayBuffer() : null).catch(() => undefined);
  // one retry after a short pause: a busy local server can refuse a burst of requests (that is not a missing file)
  const B = u => B1(u).then(b => b !== undefined ? b : new Promise(res => setTimeout(res, 600)).then(() => B1(u)).then(b => b || null));
  let catP = null; const cat = () => catP || (catP = J('catalog.json'));
  const regOf = (c, i) => { for (let k = c.regions.length - 1; k >= 0; k--) if (i >= c.regions[k].offset) return c.regions[k]; return c.regions[0]; };
  const hailC = {};
  // one region's radar hail for one storm (one byte per home of that region), or null when the file is missing
  const regionHail = (r, iso) => hailC[r.id + '|' + iso] || (hailC[r.id + '|' + iso] = B(`meta/hail/${r.id}/${iso}.bin`).then(b => b && b.byteLength === r.count ? new Uint8Array(b) : null));
  let xyP = null; const homesBin = () => xyP || (xyP = B('homes.bin'));
  let permP = null; const permits = () => permP || (permP = J('meta/permits.json').then(d => d || {}));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDay = iso => { iso = String(iso || ''); return iso.length >= 10 ? MON[+iso.slice(5, 7) - 1] + ' ' + (+iso.slice(8, 10)) + ', ' + iso.slice(0, 4) : iso; };

  function history(gi) {
    gi = +gi; if (!(gi >= 0)) return Promise.resolve([]);
    return cat().then(c => {
      if (!c) return [];
      const r = regOf(c, gi), j = gi - r.offset;
      const storms = c.storms.filter(s => !s.regions || s.regions[r.id] !== undefined).map(s => s.date).sort().reverse();
      return Promise.all(storms.map(iso => regionHail(r, iso).then(h => ({ iso, date: fmtDay(iso), inches: h ? h[j] / 100 : null }))))
        .then(l => l.filter(x => x.inches != null));
    });
  }

  // metres between two lon/lat points (short distances: equirectangular is plenty)
  const metres = (lo1, la1, lo2, la2) => { const k = Math.PI / 180, x = (lo2 - lo1) * k * Math.cos((la1 + la2) / 2 * k), y = (la2 - la1) * k; return Math.sqrt(x * x + y * y) * 6371000; };

  function neighbors(gi, opts) {
    opts = opts || {}; gi = +gi; const R = opts.radius || 400, LIMIT = opts.limit || 12;
    return Promise.all([cat(), homesBin(), permits(), history(gi)]).then(([c, hb, P, hist]) => {
      if (!c || !hb) return { storm: null, list: [] };
      // this home's biggest 1 in+ storm (the one a neighbor would recognise); none = no neighbor list
      // opts.iso: a given storm (a Storms neighbourhood's walk sheet); else this home's biggest 1 in+ storm
      const big = opts.iso ? hist.find(h => h.iso === opts.iso) : hist.filter(h => h.inches >= 1).sort((a, b) => b.inches - a.inches || (a.iso < b.iso ? 1 : -1))[0];
      if (!big) return { storm: null, list: [] };
      const n = c.total, xy = new Float32Array(hb, 0, n * 2), type = new Uint8Array(hb, n * 8, n);
      const r = regOf(c, gi), lon = xy[gi * 2], lat = xy[gi * 2 + 1];
      return regionHail(r, big.iso).then(H => {
        if (!H) return { storm: big, list: [] };
        const dLat = R / 111320, dLon = R / (111320 * Math.cos(lat * Math.PI / 180)), out = [];
        for (let j = 0; j < r.count; j++) {
          const i = r.offset + j; if (i === gi) continue;
          const x = xy[i * 2], y = xy[i * 2 + 1];
          if (Math.abs(y - lat) > dLat || Math.abs(x - lon) > dLon) continue;
          if ((type[i] & 127) > 4) continue;              // homes only, not other buildings
          const inches = H[j] / 100; if (inches < 1) continue;
          const permit = P[r.id + ':' + j] || null; if (permit && permit > big.iso) continue;   // reroofed after that storm
          const dist = metres(lon, lat, x, y); if (dist > R) continue;
          out.push({ gi: i, id: 'm' + i, lon: x, lat: y, dist, inches, iso: big.iso, permit });
        }
        out.sort((a, b) => a.dist - b.dist);
        const total = out.length, list = out.slice(0, LIMIT);
        // addresses and year built for the shown ones (STM.meta, same county copy every screen reads)
        return Promise.all(list.map(h => window.STM ? STM.meta(h.gi).then(m => { if (m) { h.addr = m.addr; h.place = m.place; h.year = m.year; h.county = m.county; h.city = m.city; h.zip = m.zip; } }) : null))
          .then(() => ({ storm: big, total, list: list.filter(h => h.addr) }));
      });
    });
  }

  // every home around this one on one storm, for the dot map (10-19): positions in metres from the house (x east, y north),
  // the radar hail at each, and whether it was reroofed after that storm. iso defaults to the home's biggest 1 in+ storm.
  function area(gi, opts) {
    opts = opts || {}; gi = +gi; const R = opts.radius || 300;
    return Promise.all([cat(), homesBin(), permits(), opts.iso ? null : history(gi)]).then(([c, hb, P, hist]) => {
      if (!c || !hb) return null;
      const big = opts.iso ? { iso: opts.iso } : (hist || []).filter(h => h.inches >= 1).sort((a, b) => b.inches - a.inches || (a.iso < b.iso ? 1 : -1))[0] || (hist || []).slice().sort((a, b) => b.inches - a.inches)[0];
      if (!big) return null;
      const n = c.total, xy = new Float32Array(hb, 0, n * 2), type = new Uint8Array(hb, n * 8, n), r = regOf(c, gi);
      const lon = xy[gi * 2], lat = xy[gi * 2 + 1], k = Math.PI / 180, mx = 6371000 * k * Math.cos(lat * k), my = 6371000 * k;
      return regionHail(r, big.iso).then(H => {
        if (!H) return null;
        const homes = [];
        for (let j = 0; j < r.count; j++) {
          const i = r.offset + j, x = (xy[i * 2] - lon) * mx, y = (xy[i * 2 + 1] - lat) * my;
          if (Math.abs(x) > R || Math.abs(y) > R || x * x + y * y > R * R) continue;
          if ((type[i] & 127) > 4) continue;
          const permit = P[r.id + ':' + j] || null;
          homes.push({ gi: i, x, y, inches: H[j] / 100, reroofed: !!(permit && permit > big.iso), self: i === gi });
        }
        return { iso: big.iso, date: fmtDay(big.iso), radius: R, homes };
      });
    });
  }
  // the dot map as an SVG string: one dot per home, coloured by the radar hail at it, the house ringed, a scale bar
  const SHADE = v => v >= 1.75 ? '#0B3D66' : v >= 1.25 ? '#0D6C99' : v >= 1 ? '#3D98C4' : v >= 0.75 ? '#A9CFE3' : '#DCE1E8';
  function areaSVG(A, size) {
    size = size || 320; const R = A.radius, s = size / (2 * R), c = size / 2, P = (x, y) => [(c + x * s).toFixed(1), (c - y * s).toFixed(1)];
    const me = A.homes.find(h => h.self), ft500 = 152.4 * s;
    const dots = A.homes.filter(h => !h.self).map(h => { const [x, y] = P(h.x, h.y);
      return h.reroofed ? `<circle cx="${x}" cy="${y}" r="2.6" fill="#fff" stroke="#9AA3B2" stroke-width="1"/>` : `<circle cx="${x}" cy="${y}" r="2.9" fill="${SHADE(h.inches)}"/>`; }).join('');
    const [hx, hy] = me ? P(me.x, me.y) : [c, c];
    return `<svg viewBox="0 0 ${size} ${size}" width="100%" role="img" aria-label="Homes within ${Math.round(R * 3.28084)} ft and the radar hail at each on ${A.date}">
      <circle cx="${c}" cy="${c}" r="${c - 1}" fill="#F6F8FA" stroke="rgba(11,16,32,.12)"/>${dots}
      <circle cx="${hx}" cy="${hy}" r="8" fill="none" stroke="#0B1020" stroke-width="2"/><circle cx="${hx}" cy="${hy}" r="3.6" fill="#0B1020"/>
      <g transform="translate(10 ${size - 12})"><rect width="${ft500.toFixed(1)}" height="3" fill="#0B1020"/><text x="0" y="-5" font-size="10" fill="#465065" font-family="Inter,system-ui,sans-serif">500 ft</text></g></svg>`;
  }
  const LEGEND = [['1.75 in+', '#0B3D66'], ['1.25 to 1.75', '#0D6C99'], ['1 to 1.25', '#3D98C4'], ['0.75 to 1', '#A9CFE3'], ['under 0.75', '#DCE1E8']];

  // how old the storm is, and the one-year mark from it (many Texas policies set a filing window; the homeowner's policy decides)
  function claimLine(iso) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(iso || ''))) return '';
    const d = new Date(iso.slice(0, 10) + 'T12:00:00'), now = new Date(), days = Math.floor((now - d) / 864e5);
    const y1 = new Date(d); y1.setFullYear(d.getFullYear() + 1);
    const ago = days < 14 ? days + ' days ago' : days < 60 ? Math.round(days / 7) + ' weeks ago' : days < 730 ? Math.round(days / 30.4) + ' months ago' : (days / 365).toFixed(1) + ' years ago';
    const left = Math.ceil((y1 - now) / 864e5);
    return { ago, days, oneYear: fmtDay(y1.toISOString().slice(0, 10)), left, text: `${ago}. One year from the storm: ${fmtDay(y1.toISOString().slice(0, 10))}${left > 0 ? ' (' + left + ' days left)' : ' (passed)'}.` };
  }

  window.RCH = { history, neighbors, area, areaSVG, LEGEND, claimLine, fmtDay, metres };
})();
