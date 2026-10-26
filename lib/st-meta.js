/* Real house facts for every tour screen (window.STM). All read-only copies of the Roof Command app's own data:
   - meta/<region>/homes_meta.bin + streets.json + cities.json: county address, zip and year built per home
     (same layout as the app's js/modules/core.js regionHomeMeta), plus subdivision, living sq ft and CAD id (homes_ext.bin).
   - meta/hail/<region>/<date>.bin: the app's per-home radar hail (MRMS MESH, 1/100 in). STH.hailFor uses these,
     so storm counts, swaths and every home's hail are the app's radar values, not a model.
   - meta/permits.json + permits-detail.json: reroof permits keyed region:index (date; detail = precision, city, status,
     source: Collin CAD permit list 2023 on, McKinney city permit layer about 2015 on; scripts/permits/).
   - meta/pitch/<region>/tile_<r>_<c>.json: measured pitch from USGS 3DEP LiDAR (2018), {index: [rise/12, fit 0-100]}.
   Never loads owner names. Home index = global index into lib/st-data-dfw/homes.bin (region offset + row). */
(function () {
  if (window.STM) return;
  const src = document.currentScript && document.currentScript.src;
  const BASE = window.rooferDataRoot ? rooferDataRoot() : (src ? new URL('st-data-dfw/', src).href : new URL('lib/st-data-dfw/', location.href).href);   // the roofer's data (lib/brand.js dataRoot)
  const J = u => fetch(BASE + u).then(r => r.ok ? r.json() : null).catch(() => null);
  const B = u => fetch(BASE + u).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null);
  let catP = null; const cat = () => catP || (catP = J('catalog.json'));
  let STATE = 'TX'; cat().then(c => { if (c && c.state) STATE = c.state; });   // the data's state (catalog.state)
  const regOf = (c, i) => { for (let k = c.regions.length - 1; k >= 0; k--) if (i >= c.regions[k].offset) return c.regions[k]; return c.regions[0]; };

  // ---------- address + year built ----------
  const metaP = {}, metaD = {};
  function regionMeta(r) {
    // homes_ext.bin + subdivs.json (DFW builds only): subdivision, living sq ft, CAD property id per home
    return metaP[r.id] || (metaP[r.id] = cat().then(c => { const ext = !!c; return Promise.all([J(`meta/${r.id}/streets.json`), J(`meta/${r.id}/cities.json`), B(`meta/${r.id}/homes_meta.bin`), c,
      ext ? J(`meta/${r.id}/subdivs.json`) : null, ext ? B(`meta/${r.id}/homes_ext.bin`) : null]); })
      .then(([st, ci, buf, c, sub, ext]) => (metaD[r.id] = st && buf && buf.byteLength === r.count * 16 ? { st, ci: ci || [], v: new DataView(buf), n: r.count, r, state: (c && c.state) || 'TX',
        sub: sub || null, x: ext && ext.byteLength === r.count * 8 ? new DataView(ext) : null } : null)));
  }
  const ABBR = { Avenue: 'Ave', Street: 'St', Drive: 'Dr', Lane: 'Ln', Boulevard: 'Blvd', Court: 'Ct', Parkway: 'Pkwy', Terrace: 'Ter', Road: 'Rd', Place: 'Pl', Circle: 'Cir' };
  function streetName(raw, city) { // county roll "Nw 17Th St Plano" -> "NW 17th St"
    let s = String(raw || '').trim();
    if (city && s.endsWith(' ' + city)) s = s.slice(0, -city.length - 1);
    return s.replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (m, a, b) => a + b.toLowerCase()).replace(/\b(Nw|Ne|Sw|Se)\b/g, m => m.toUpperCase())
      .replace(/\b(Avenue|Street|Drive|Lane|Boulevard|Court|Parkway|Terrace|Road|Place|Circle)\b/g, m => ABBR[m]);
  }
  function read(M, j) {
    const n = M.n, v = M.v;
    const year = v.getUint16(j * 2, true), no = v.getUint16(n * 6 + j * 2, true), sid = v.getUint16(n * 8 + j * 2, true);
    const zip = v.getUint32(n * 10 + j * 4, true), cid = v.getUint16(n * 14 + j * 2, true);
    const city = M.ci[cid] || '', street = streetName(M.st[sid], city);
    const z = zip ? String(zip).padStart(5, '0') : '', S = M.state || 'TX';
    let subdivision = null, sqft = null, cadId = null;
    if (M.x) { const sd = M.x.getUint16(j * 2, true); subdivision = (M.sub && M.sub[sd]) || null; sqft = M.x.getUint16(n * 2 + j * 2, true) || null; cadId = M.x.getUint32(n * 4 + j * 4, true) || null; }
    const addr = no ? `${no} ${street}` : (street || null), place = [city || null, (S + ' ' + z).trim()].filter(Boolean).join(', ');
    // full: "123 Main St, Frisco, TX 75034" (the one line every screen shows)
    return { addr, street, houseNo: no || null, city, zip: z, state: S, year: year || null, subdivision, sqft, cadId,
      place, full: addr ? addr + ', ' + place : place, county: M.r.name, region: M.r.id };
  }
  function meta(i) { return cat().then(c => { if (!c) return null; const r = regOf(c, i); return regionMeta(r).then(M => M ? read(M, i - r.offset) : null); }); }
  function metaNow(i) { if (!catP) return null; let out = null; Object.values(metaD).forEach(M => { if (M && i >= M.r.offset && i < M.r.offset + M.n) out = read(M, i - M.r.offset); }); return out; }

  // ---------- reroof permits ----------
  // permits.json: latest date per home; permits-detail.json (scripts/permits/build_permits.py): [date, precision, city,
  // status, source, count]. Sources: the Collin CAD permit list (2023 on) and McKinney's city permit layer (about 2015 on).
  let permP = null; const permits = () => permP || (permP = J('meta/permits.json').then(d => d || {}));
  let permDP = null; const permitsD = () => permDP || (permDP = J('meta/permits-detail.json').then(d => d || {}));
  function permit(i) { return cat().then(c => { const r = regOf(c, i); return permits().then(p => p[r.id + ':' + (i - r.offset)] || null); }); }
  // v2 (compact): only homes that differ from the plain case are listed; the rest are the state list, exact day, issued, one permit
  function permitDetail(i) { return cat().then(c => { const r = regOf(c, i), k = r.id + ':' + (i - r.offset);
    return Promise.all([permitsD(), permits(), meta(i)]).then(([D, P, m]) => { const d = P[k]; if (!d) return null;
      if (!D || D.v !== 2) return D && D[k] || [d, 'day', (m && m.city) || '', 'issued', 'collin', 1];
      const x = D.rows[k]; if (!x) return [d, 'day', (m && m.city) || '', 'issued', 'collin', 1];
      return [d, D.prec[x[0]], x[1] >= 0 ? D.cities[x[1]] : (m && m.city) || '', D.status[x[2]], D.source[x[3]], x[4]]; }); }); }
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const ST = { complete: 'finished', issued: 'issued', approved: 'approved' };
  function permitWhen(d, prec) { return prec === 'year' ? d.slice(0, 4) : MON[+d.slice(5, 7) - 1] + ' ' + d.slice(0, 4); }
  // how far back this home's city publishes reroof permits (Plano's list is known to be incomplete)
  function since(city) { const c = String(city || '').toLowerCase(); return c === 'mckinney' ? 'since 2015' : c === 'plano' ? 'since 2023 (Plano records are incomplete)' : 'since 2023'; }
  // ---------- last re-roof, McKinney + Allen (meta/reroof-ma.json, scripts/permits/build_reroof_ma.py) ----------
  // the city's own re-roof permits joined to the home by CAD id: McKinney's EnergovRecords layer (about 2015 on, older HTE
  // numbers carry only "that year or earlier") and Allen's EnerGov portal (about 2017 on). Only these two cities: elsewhere
  // there is no complete permit list, so the lead card shows no re-roof line at all (never "original roof").
  const RR_SINCE = { McKinney: '2015', Allen: '2017' };
  let rmaP = null; const rma = () => rmaP || (rmaP = J('meta/reroof-ma.json'));
  // city status -> [what it means, confidence]; anything not issued or finished is a permit only, work not confirmed
  const RR_ST = { Complete: ['permit completed', 'high'], Completed: ['permit completed', 'high'], Issued: ['permit issued, not finaled', 'medium'],
    'Permit Issued': ['permit issued, not finaled', 'medium'], Approved: ['permit approved, not finaled', 'medium'], 'Incomplete Inspections': ['permit issued, inspections incomplete', 'medium'],
    Expired: ['permit expired, work not confirmed', 'low'], Cancelled: ['permit cancelled, work not confirmed', 'low'],
    'Payment Pending': ['permit not yet issued (payment pending)', 'low'], 'Revisions Necessary': ['permit not yet issued (revisions needed)', 'low'] };
  // other Collin cities: the Collin CAD permit list (meta/reroof-cad.json, 2023 on, not complete), so a permit when there is
  // one and nothing when there is none
  let rcadP = null; const rcad = () => rcadP || (rcadP = J('meta/reroof-cad.json'));
  function reroof(i, m) {
    const city = m && m.region === 'collin-tx' ? (m.city === 'Mckinney' ? 'McKinney' : m.city) : '';
    if (city && !RR_SINCE[city]) return Promise.all([cat(), rcad()]).then(([c, D]) => {
      const x = D && D.rows && D.rows[String(i - regOf(c, i).offset)]; if (!x) return null;
      const [d, permitNo, pc] = x, date = MON[+d.slice(5, 7) - 1] + ' ' + d.slice(0, 4);
      return { city: pc, when: d.slice(0, 7), date, prec: 'month', permit: permitNo, status: 'Issued', means: 'permit issued, final not on the list', conf: 'medium',
        count: 1, done: true, src: 'Collin CAD permit list', text: `Re-roofed ${date} (permit ${permitNo}, ${pc})` };
    });
    if (!RR_SINCE[city]) return Promise.resolve(null);
    return Promise.all([cat(), rma()]).then(([c, D]) => {
      if (!D || !D.rows) return null;
      const r = regOf(c, i), x = D.rows[String(i - r.offset)];
      if (!x) return { city, none: true, since: RR_SINCE[city], text: `No re-roof permit on file since ${RR_SINCE[city]}`, src: `City of ${city} permit records` };
      const [when, pi, permitNo, , ci, si, count] = x, prec = D.prec[pi], status = D.status[si], pc = D.cities[ci] || city;
      const [means, conf] = RR_ST[status] || ['permit status ' + String(status).toLowerCase(), 'low'];
      const date = prec === 'month' ? MON[+when.slice(5, 7) - 1] + ' ' + when.slice(0, 4) : when.slice(0, 4) + ' or earlier';
      const done = conf !== 'low';
      return { city: pc, when, date, prec, permit: permitNo, status, means, conf, count, done, src: `City of ${pc} permit records`,
        text: `${done ? 'Re-roofed' : 'Re-roof permit'} ${date} (permit ${permitNo}, ${pc})` };
    });
  }
  function roofAge(m, per, det, rr) {
    if (rr) return rr.none ? rr.text : `${rr.text}, ${rr.means}`;
    // other cities: no complete re-roof permit list, so no re-roof claim either way
    return m && m.year ? `Built ${m.year}` : '';
  }

  // ---------- measured pitch (USGS LiDAR 2018) ----------
  let pidxP = null; const pidx = () => pidxP || (pidxP = J('meta/pitch/index.json').then(d => d || { tiles: {} }));
  const ptile = {};
  function pitchRaw(i, lon, lat) {
    return Promise.all([cat(), pidx()]).then(([c, ix]) => {
      const r = regOf(c, i), have = new Set((ix.tiles || {})[r.id] || []), j = String(i - r.offset);
      if (!have.size || !isFinite(lon) || !isFinite(lat)) return null;
      const tr = Math.floor(lat / 0.05), tc = Math.floor(lon / 0.05), keys = [];
      [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) => { const k = (tr + a) + '_' + (tc + b); if (have.has(k)) keys.push(k); });
      const next = k => { if (k >= keys.length) return null; const key = r.id + '/' + keys[k];
        ptile[key] = ptile[key] || J(`meta/pitch/${r.id}/tile_${keys[k]}.json`).then(d => d || {});
        return ptile[key].then(d => d[j] ? d[j] : next(k + 1)); };
      return next(0);
    });
  }
  // the pitch a screen should use: measured when the fit is good and the house stood when the LiDAR flew, else 6/12 assumed
  function pitchInfo(raw, year) {
    // Texas data: say plainly the pitch was not measured (LiDAR gap); 6/12 is only the estimate's working number
    const gap = STATE === 'TX';
    if (raw && year && year > 2018) return { rise: 6, measured: false, gap, note: gap ? `Pitch not measured (built ${year}, after the 2018 LiDAR)` : `assumed 6/12, built ${year}, after the 2018 LiDAR` };
    if (raw && raw[0] >= 2 && raw[1] >= 40) return { rise: raw[0], measured: true, conf: raw[1], note: `${raw[0]}/12 est., LiDAR 2018` };
    return { rise: 6, measured: false, gap, note: gap ? 'Pitch not measured (LiDAR gap)' : 'assumed 6/12' };
  }

  // a home's position from homes.bin (Float32 lon,lat per home) when the caller has none: a record opened cold by its
  // id (#/crm/home/m<i>, a fresh device, a CRM thread synced from the cloud) carries no lon/lat, and without them the
  // outline tile and the LiDAR pitch tile can't be found
  let xyP = null;
  function lonlat(i) {
    i = +i; if (!(i >= 0)) return Promise.resolve(null);
    if (window.STH && STH.xy) return Promise.resolve([STH.lon(i), STH.lat(i)]);
    return (xyP = xyP || B('homes.bin')).then(buf => { if (!buf || (i + 1) * 8 > buf.byteLength) return null; const f = new Float32Array(buf, i * 8, 2); return [f[0], f[1]]; });
  }
  // everything known about one home
  function facts(i, lon, lat) {
    const pos = isFinite(lon) && isFinite(lat) ? Promise.resolve([+lon, +lat]) : lonlat(i).then(p => p || [NaN, NaN]);
    // roof: the per-facet LiDAR record (lib/rc-roof.js, squares, pitches, facets, stories, edge lengths) when the batch has one, else null
    return pos.then(([x, y]) => Promise.all([meta(i), permit(i), pitchRaw(i, x, y), window.RCROOF ? RCROOF.lookup(i, x, y) : null, permitDetail(i)]).then(([m, per, raw, roof, det]) => {
      m = m || {}; const pitch = pitchInfo(raw, m.year);
      // a house built after its LiDAR flew: that roof record is not this house (an older house or an empty lot), so no figures from it
      const after = roof && m.year && m.year > (roof.year || 2018) ? roof.year || 2018 : null; if (after) roof = null;
      return reroof(i, m).catch(() => null).then(rr =>
        Object.assign({ i, id: 'm' + i, lon: x, lat: y }, m, { permit: per, permitDetail: det || null, reroof: rr, lidarBefore: after, roofAge: roofAge(m, per, det, rr), pitch, roof: roof || null }));
    }));
  }

  // ---------- real per-home hail (the app's radar values) ----------
  const hc = {}, hp = {};
  function hailFor(iso) {
    if (hc[iso]) return Promise.resolve(hc[iso]);
    return hp[iso] || (hp[iso] = cat().then(c => {
      const out = new Uint8Array(c.total), st = c.storms.find(s => s.date === iso), regs = st ? Object.keys(st.regions || {}) : [];
      // one retry after a short pause: a refused or dropped connection (busy dev server, flaky signal) is not a missing file
      const once = u => B(u).then(buf => buf || new Promise(res => setTimeout(res, 500)).then(() => B(u)));
      return Promise.all(c.regions.filter(r => regs.includes(r.id)).map(r => once(`meta/hail/${r.id}/${iso}.bin`).then(buf => {
        if (buf && buf.byteLength === r.count) out.set(new Uint8Array(buf), r.offset); else STM.hailMissing.push(r.id + ' ' + iso);
      }))).then(() => (hc[iso] = out));
    }));
  }
  function hookSTH() { if (!window.STH || STH.__realHail) return; STH.__realHail = true; STH.hailFor = s => hailFor(s.iso); STH.hailCached = s => hc[s.iso] || null; }

  // ---------- address search: "7901 Windrose" -> homes with that house number on a matching street ----------
  const norm = s => String(s || '').toLowerCase().replace(/[.,#]/g, ' ').replace(/\b(northwest)\b/g, 'nw').replace(/\b(northeast)\b/g, 'ne').replace(/\b(southwest)\b/g, 'sw').replace(/\b(southeast)\b/g, 'se')
    .replace(/\bnorth\b/g, 'n').replace(/\bsouth\b/g, 's').replace(/\beast\b/g, 'e').replace(/\bwest\b/g, 'w').replace(/\bstreet\b/g, 'st').replace(/\bavenue\b/g, 'ave').replace(/\bdrive\b/g, 'dr')
    .replace(/\broad\b/g, 'rd').replace(/\blane\b/g, 'ln').replace(/\bboulevard\b/g, 'blvd').replace(/\bcourt\b/g, 'ct').replace(/\bplace\b/g, 'pl').replace(/\bcircle\b/g, 'cir').replace(/\bterrace\b/g, 'ter')
    .replace(/\b(\d+)(st|nd|rd|th)\b/g, '$1').replace(/\s+/g, ' ').trim();
  // the roofer's home city first (Plano), then its first region (Collin)
  function rankOf(h, M) {
    const R = window.activeRoofer ? activeRoofer() : null, home = R ? R.city : 'Plano', reg = M.r.offset === 0;
    return h.city === home ? 0 : reg ? 1 : 2;
  }
  // a city, ZIP or subdivision name (catalog regions' places.json): "Frisco", "75034", "Starwood"
  const placesP = {};
  function places(r) { return placesP[r.id] || (placesP[r.id] = J(`meta/${r.id}/places.json`)); }
  function searchPlaces(q, limit) {
    const t = String(q || '').toLowerCase().trim(); if (t.length < 2) return Promise.resolve([]);
    return cat().then(c => Promise.all(c.regions.map(r => places(r).then(p => [r, p])))).then(list => {
      const out = [];
      list.forEach(([r, p]) => { if (!p || !p.cities) return;
        Object.entries(p.cities).forEach(([city, cv]) => {
          if (city.toLowerCase().startsWith(t)) out.push({ kind: 'city', title: city, city, count: cv.count, start: r.offset + cv.start, region: r.id, rank: 0 });
          Object.entries(cv.zips || {}).forEach(([zip, zv]) => {
            if (zip && zip.startsWith(t)) out.push({ kind: 'zip', title: zip, city, zip, count: zv.count, start: r.offset + zv.start, region: r.id, rank: 1 });
            Object.entries(zv.subdivs || {}).forEach(([sd, a]) => { if (sd.toLowerCase().includes(t)) out.push({ kind: 'subdivision', title: sd, city, zip, count: a[1], start: r.offset + a[0], region: r.id, rank: 2 }); });
          });
        });
      });
      // a city split across two counties (Frisco, Plano) lists once with both counts
      const m = new Map(); out.forEach(o => { const k = o.kind + '|' + o.title + '|' + (o.kind === 'subdivision' ? o.zip : ''); const e = m.get(k); if (e) { e.count += o.count; (e.ranges = e.ranges || [[e.start, e.count - o.count]]).push([o.start, o.count]); } else m.set(k, o); });
      return [...m.values()].sort((a, b) => a.rank - b.rank || b.count - a.count).slice(0, limit || 5);
    });
  }
  function search(q, limit) {
    limit = limit || 6;
    const m = /^\s*(\d{1,5})\s+(.+)$/.exec(q || ''); const num = m ? +m[1] : null, text = norm(m ? m[2] : q);
    if (text.length < 2) return Promise.resolve([]);
    return cat().then(c => Promise.all(c.regions.map(regionMeta))).then(list => {
      const out = [];
      list.forEach(M => { if (!M) return;
        const want = new Set(); M.st.forEach((s, k) => { const n = norm(s); if (n.includes(text) || (' ' + n).includes(' ' + text)) want.add(k); });
        if (!want.size) return;
        const n = M.n, v = M.v; let got = 0;
        for (let j = 0; j < n && got < 400; j++) {
          const sid = v.getUint16(n * 8 + j * 2, true); if (!want.has(sid)) continue;
          const no = v.getUint16(n * 6 + j * 2, true); if (num != null && no !== num) continue; if (!no) continue;
          const h = read(M, j); got++;
          out.push(Object.assign(h, { i: M.r.offset + j, rank: rankOf(h, M) + (num != null && no === num ? 0 : 0.5) }));
        }
      });
      out.sort((a, b) => a.rank - b.rank || (a.houseNo - b.houseNo));
      const seen = new Set(); return out.filter(h => { const k = h.addr + h.place; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, limit);
    });
  }

  // streets by name (no house number): "Windrose" -> [{street, city, zips, count, ids}], one per street and city, every home on it
  // (the global header search lists a street and opens the CRM on it with these homes)
  function streets(q, limit) {
    const text = norm(String(q || '').replace(/^\s*\d{1,5}\s+/, '')); if (text.length < 2) return Promise.resolve([]);
    return cat().then(c => Promise.all(c.regions.map(regionMeta))).then(list => {
      const g = new Map();
      list.forEach(M => { if (!M) return;
        const want = new Set(); M.st.forEach((s, k) => { const n = norm(s); if (n.startsWith(text) || n.includes(' ' + text) || n.includes(text)) want.add(k); });
        if (!want.size) return;
        const n = M.n, v = M.v;
        for (let j = 0; j < n; j++) {
          const sid = v.getUint16(n * 8 + j * 2, true); if (!want.has(sid)) continue;
          const cid = v.getUint16(n * 14 + j * 2, true), city = M.ci[cid] || '', zip = v.getUint32(n * 10 + j * 4, true);
          const key = M.r.id + '|' + sid + '|' + city; let e = g.get(key);
          if (!e) { e = { street: streetName(M.st[sid], city), city, zips: new Set(), ids: [], rank: rankOf({ city }, M) + (norm(M.st[sid]).startsWith(text) ? 0 : 0.5) }; g.set(key, e); }
          if (zip) e.zips.add(String(zip).padStart(5, '0')); e.ids.push(M.r.offset + j);
        }
      });
      // the same street name split across two counties (a city on a county line) lists once
      const m = new Map(); [...g.values()].forEach(e => { const k = e.street + '|' + e.city, o = m.get(k); if (o) { o.ids = o.ids.concat(e.ids); e.zips.forEach(z => o.zips.add(z)); o.rank = Math.min(o.rank, e.rank); } else m.set(k, e); });
      return [...m.values()].map(e => ({ street: e.street, city: e.city, zips: [...e.zips].sort(), count: e.ids.length, ids: e.ids, rank: e.rank }))
        .sort((a, b) => a.rank - b.rank || b.count - a.count).slice(0, limit || 4);
    });
  }

  const STM = window.STM = { BASE, places, searchPlaces, meta, metaNow, permit, permitDetail, roofAge, pitchRaw, pitchInfo, facts, lonlat, hailFor, search, streets, hookSTH, streetName, hailMissing: [] };
  hookSTH(); if (!window.STH) document.addEventListener('DOMContentLoaded', hookSTH);
})();
