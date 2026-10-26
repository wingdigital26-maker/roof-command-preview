/* rc-queue.js: the Daily 50 engine (plain script, needs lib/rc-state.js and lib/brand.js loaded first).
   Every day it picks the top 50 homes for the active roofer from the roofer's own data (lib/st-data-dfw via RC.dataRoot):
     1. homes due a follow-up today by the touch cadence (day 1, 3, 7, 30, then every 30 days after first contact) go first,
     2. then the never-contacted homes most likely to say yes (Jack 10-11: "We aren't going to wait for storms. Just 50
        people a day that would be likely to say yes"), scored over EVERY house in the roofer's service area, every day,
        storm or no storm: roof age, hail in the last 24 months, neighbours reroofing, roof size, owner-occupied (WEIGHTS),
        spread across the WHOLE area (Jack 10-10): the homes are bucketed into ~2 km cells and each round takes the best remaining home from every
        cell, so the 50 cover many neighbourhoods and cities instead of one pocket; at most STREET_CAP per street, NB_CAP
        per neighbourhood and half the list per city (relaxed only when the caps leave the list short).
   Storms: a storm boosts a home (hail points, recency) but is not required. stats.storm stays the newest storm (the
   deck's header); a new storm is picked up by the next daily rebuild of the candidate file.
   Cooldown: a home touched in any way (text, email, call, note, reply) in the last COOLDOWN_DAYS, or in an active deal
   (stage past New), or won / not now / opted out, is never a new pick; homes already texted follow the cadence.
   Data: the precomputed candidate file meta/daily/cands.json (scripts/dfw/daily_cands.py, rebuilt every day in the
   cloud) carries every fact; without it a slower scan of the hail files (hail-hit homes only, no neighbour / owner facts).
   The score is transparent: WEIGHTS below, one line of reasoning per factor; every pick lists ALL its reasons (true facts
   only). Same 50 all day: the first build of a day is kept on this device (rc.t.daily). Outreach is text and email only:
   the cadence's first touch is a text, every later touch is an email (RC.cadence().channel). Nothing here sends.
   API (all on window.RC; RC.queue(n) stays the deck's stop count, the engine also hangs off it as RC.queue.engine):
     RC.queueReady            Promise, resolves when the homes are scored (starts on load)
     RC.daily(dateISO?, opts) -> [{ id, gi, address, street, city, zip, subdivision, lon, lat, score, why:[every reason],
                                  reason:'cadence'|'new', step (cadence day 1/3/7/30/60...), touch, channel:'text'|'email',
                                  status:'open'|'done'|'closed', hail, storm (the home's storm), storms (1 in+ storms at the
                                  home, whole catalog), stormDates, roofYear, yearBuilt, permit, squares, pitch, miles, parts }]
                                [] until RC.queueReady resolves. opts: { rebuild:true } ignores the day's kept list.
     RC.cadence(id, nowMs?)   -> { step, touch, channel, firstContact, lastContact, nextDue, overdue, dueToday, daysOverdue, stopped }
     RC.queueStats()          -> counts behind the list (storm, window storms, candidates, eligible, caps, exclusions, timings) */
(function () {
  'use strict';
  if (!window.RC || RC.daily) return;
  const P = 'rc.t.';
  const get = (k, d) => { try { const v = localStorage.getItem(P + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const put = (k, v) => { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) { } };
  const DAY = 864e5, SIZE = 50, VERSION = 3;
  const HAIL_DAYS = 730, COOLDOWN_DAYS = 30, STREET_CAP = 3, NB_CAP = 4;
  const CELL = 0.02;   // spread cell, degrees (about 2 km): each round of picks takes at most one home per cell (build)

  // ---------- the score: 100 points, five factors, each 0..1 times its points (same formula as scripts/dfw/daily_cands.py) ----------
  const WEIGHTS = {
    roofAge:    { pts: 33, name: 'Roof age', why: 'The strongest signal: an older roof is closer to replacement. Years since the last reroof permit, else since the house was built (city re-roof permits: McKinney about 2015 on, Allen about 2017 on; elsewhere in Collin the county list, 2023 on, so an older re-roof would not show): 0 under 12 years, full at 22 years or more. Where there is no complete permit list (outside McKinney and Allen) the house age counts at 70%.' },
    hail:       { pts: 21, name: 'Hail history', why: 'Any 1 in+ radar hail at the home in the last 24 months (not before a later reroof): half at 1 in, full at 2 in or more, times recency (full within 2 months, 40% at 24 months). A storm boosts a home, it is not required (NOAA radar per home).' },
    neighbours: { pts: 30,   /* Jack 10-23: 15 -> 30 after the held-out sweep (scripts/permits/turnover_checks.py) */ name: 'Neighbours re-roofing', why: 'Turnover Radar: re-roof permits within about a block (100 m) in the last 90 days, scored by how often homes re-roofed next to that many in past permit data (1 nearby 18%, 2 to 3 55%, 4 or more full) (permit records exist for Collin County only).' },
    size:       { pts: 8, name: 'Roof size', why: 'A bigger roof is a bigger job: 0 at 15 squares, full at 45 squares or more. The LiDAR facet measurement counts in full when its confidence is good (60+), the building outline at 80%; an outline over 100 squares or 2.5 times the living area likely covers more than one home and gets no points.' },
    owner:      { pts: 8, name: 'Owner lives here', why: 'Owner-occupied homes decide on their own roof: the homestead exemption on the county roll or the tax bill mailing to the home itself; likely investors (company owner or out-of-state mailing address) score -10. Read as a flag only, no names.' }
  };
  const CADENCE = [1, 3, 7, 30];          // then every 30 days: 60, 90, 120 ...
  const chanOf = step => step == null ? null : step <= 1 ? 'text' : 'email';   // one cold text on day 1, email from then on
  const lin = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)));

  // ---------- days in the roofer's own time zone ----------
  const tz = () => ((window.ROOFERS || {})[RC.rooferKey()] || {}).tz || 'America/Chicago';
  const DKF = {};
  const dayKey = ms => (DKF[tz()] || (DKF[tz()] = new Intl.DateTimeFormat('en-CA', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit' }))).format(new Date(ms));
  const dayNum = key => { const [y, m, d] = key.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); };
  const keyOf = n => new Date(n * DAY).toISOString().slice(0, 10);
  function dayStart(key) {   // the ms at 00:00 of that day in the roofer's zone
    const g = dayNum(key) * DAY, f = new Intl.DateTimeFormat('en-US', { timeZone: tz(), hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    const p = {}; f.formatToParts(new Date(g)).forEach(x => { p[x.type] = +x.value; });
    return g - (Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute) - g);
  }
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DC = {};
  // "Jun 2" this year, "Apr 27, 2025" another year (memoised: this runs for every candidate)
  const fmtDate = iso => DC[iso] || (DC[iso] = MON[+iso.slice(5, 7) - 1] + ' ' + (+iso.slice(8, 10)) + (iso.slice(0, 4) === String(new Date(Date.now()).getFullYear()) ? '' : ', ' + iso.slice(0, 4)));
  const fmtMonth = iso => MON[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4);

  // ---------- data ----------
  const S = { ready: false, storm: null, newest: null, cands: [], byGi: new Map(), loadMs: 0, err: null, hq: null, reroofed: 0, source: null,
    window: [], permitRegions: new Set(), missing: [], built: null, fileStale: null };
  let lastBuild = { ms: 0 };
  // one retry on a dropped connection (a busy server); a 404 is an answer, not retried
  const retry = (go) => go().catch(() => new Promise(res => setTimeout(res, 300)).then(go)).catch(() => null);
  const fetchJ = (u, o) => retry(() => fetch(u, o).then(r => r.ok ? r.json() : null));
  const fetchB = u => retry(() => fetch(u).then(r => r.ok ? r.arrayBuffer() : null));
  const ABBR = { Avenue: 'Ave', Street: 'St', Drive: 'Dr', Lane: 'Ln', Boulevard: 'Blvd', Court: 'Ct', Parkway: 'Pkwy', Terrace: 'Ter', Road: 'Rd', Place: 'Pl', Circle: 'Cir' };
  function streetName(raw, city) {   // same cleanup as lib/st-meta.js: "Nw 17Th St Plano" -> "NW 17th St"
    if (window.STM && STM.streetName) return STM.streetName(raw, city);
    let s = String(raw || '').trim(); if (city && s.endsWith(' ' + city)) s = s.slice(0, -city.length - 1);
    return s.replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (m, a, b) => a + b.toLowerCase()).replace(/\b(Nw|Ne|Sw|Se)\b/g, m => m.toUpperCase())
      .replace(/\b(Avenue|Street|Drive|Lane|Boulevard|Court|Parkway|Terrace|Road|Place|Circle)\b/g, m => ABBR[m]);
  }
  function miles(a, b) {
    const R = 3958.8, r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  // neighbourhood = the subdivision without its phase / section / number (same rule as scripts/dfw/daily_cands.py)
  const KW = new Set('phase ph section sec unit no addition add addn blk block replat revised rev rv amended amd inst installment tract lot lots the'.split(' '));
  function nbKey(name, lat, lon) {
    const toks = String(name || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean), out = [];
    for (const t of toks) { if (out.length && (KW.has(t) || /^(\d+[a-z]?|\d+(st|nd|rd|th)|[ivx]+|[a-z])$/.test(t))) break; out.push(t); }
    return out.length ? out.join(' ') : 'cell:' + Math.floor(lat / 0.01) + '_' + Math.floor(lon / 0.01);
  }
  // footprint tile -> { local index: footprint sq ft } (skips the outline rings)
  function tileSq(buf) {
    const dv = new DataView(buf), cnt = dv.getUint32(0, true), m = new Map(); let o = 4;
    for (let k = 0; k < cnt; k++) { const idx = dv.getUint32(o, true), sq = dv.getUint16(o + 4, true), nv = dv.getUint8(o + 6); o += 7 + nv * 4; m.set(idx, sq); }
    return m;
  }
  const regionOf = (c, gi) => { for (let k = c.regions.length - 1; k >= 0; k--) if (gi >= c.regions[k].offset) return c.regions[k]; return c.regions[0]; };

  // the candidate file starts downloading the moment this script runs (brand.js has already set RC.dataRoot);
  // no-cache = revalidate, so a rebuilt file is never served stale
  const candsP = RC.dataRoot ? fetchJ(RC.dataRoot + 'meta/daily/cands.json', { cache: 'no-cache' }) : Promise.resolve(null);

  function load() {
    const t0 = performance.now();
    return Promise.all([RC.factsReady, candsP]).then(([, file]) => {
      const c = RC.catalog, root = RC.dataRoot; if (!c || !root) throw new Error('no catalog');
      const dates = c.storms.map(s => s.date).sort();
      const primary = RC.SHOWCASE && dates.includes(RC.SHOWCASE) ? RC.SHOWCASE
        : (c.storms.filter(s => s.homes_1in > 0).map(s => s.date).sort().pop() || dates[dates.length - 1]);
      if (!primary) throw new Error('no storm in the catalog');
      const today = dayKey(Date.now()), win0 = keyOf(dayNum(today) - HAIL_DAYS);
      const win = new Set(dates.filter(d => d >= win0 && d <= today));
      const hqR = (window.ROOFERS || {})[RC.rooferKey()] || {}, hq = (hqR.hq && hqR.hq.loc) || hqR.center || [-96.75, 33.02];
      Object.assign(S, { storm: primary, newest: c.storms.filter(s => s.homes_1in > 0).map(s => s.date).sort().pop() || primary, hq, window: [...win].sort().reverse(), reroofed: 0 });
      // the file is used whenever it is this version (always-on: a day-old file or one missing the newest storm is still
      // every home's real record; stats.fileStale says so and the daily cloud rebuild catches up)
      const usable = file && file.v === VERSION && Array.isArray(file.rows);
      S.fileStale = file ? (!usable ? 'old format' : file.built !== today ? 'built ' + file.built : Array.isArray(file.storms) && file.storms.join() !== dates.join() ? 'storm list changed' : false) : null;
      const p = usable ? Promise.resolve(fromFile(file, c)) : scan(c, root, dates, win);
      return p.then(cands => {
        // hail files the newest storm needs (a storm's homes are only known where its per-home file exists). With none of
        // them on file the list falls back to the newest storm that has its files, and says so (stats.fallback).
        const need = iso => { const st = c.storms.find(s => s.date === iso); return Object.keys((st && st.regions) || {}).filter(r => (st.regions[r].homes_1in || 0) > 0); };
        S.missing = need(primary).filter(r => !(S.hailFiles[primary] || []).includes(r)); S.fallback = null;
        if (S.missing.length && S.missing.length === need(primary).length) {
          const alt = c.storms.filter(s => s.homes_1in > 0 && s.date < primary && need(s.date).every(r => (S.hailFiles[s.date] || []).includes(r))).map(s => s.date).sort().pop();
          if (alt) { S.fallback = { newest: primary, used: alt, missing: S.missing.map(r => `meta/hail/${r}/${primary}.bin`) }; S.storm = alt; win.add(alt); S.window = [...win].sort().reverse(); }
        }
        S.cands = cands; S.byGi = new Map(cands.map(h => [h.gi, h])); S.win = win;
        rescore(today);
        S.ready = true; S.loadMs = Math.round(performance.now() - t0);
        return S;
      });
    });
  }
  // score every candidate for one day (REF = noon that day) and sort: same day, same scores, same order. Ties go to the
  // bigger roof, then the lower home index (the id), so the order never depends on the file's row order or the clock.
  function rescore(key) {
    REF = dayStart(key) + DAY / 2; S.reroofed = 0;
    const cs = S.cands;
    cs.forEach(h => { lead(h, S.win); if (h.reroofedAfter) S.reroofed++; score(h); });
    cs.sort((a, b) => b.raw - a.raw || (b.sq || 0) - (a.sq || 0) || a.gi - b.gi);
    S.scoredFor = key;
  }
  // the precomputed file -> candidates
  function fromFile(f, c) {
    S.source = 'precomputed'; S.built = f.built; S.permitRegions = new Set(f.permitRegions || []); S.hailFiles = f.hailFiles || {}; S.permitsFrom = f.permitsFrom || null;
    S.scoredHomes = f.scored || null; S.fileNewest = f.newest || null;
    return f.rows.map(r => {
      const [gi, lon, lat, no, st, ci, zip, nb, sub, year, permit, sq10, pitch, hits, living, nbr, occ, msq10, mconf] = r, reg = regionOf(c, gi);
      return { gi, region: reg.id, lon, lat, no, street: f.streets[st] || '', city: f.cities[ci] || '', zip: zip ? String(zip).padStart(5, '0') : '',
        nb: f.nbs[nb], sub: f.subs[sub] || null, year: year || null, permit: permit || null, sq: sq10 ? Math.abs(sq10) / 10 : null, shared: sq10 < 0, living: living || null, pitch: pitch || null,
        hits: hits.map(([i, h]) => [f.storms[i], h / 100]), nbr: nbr == null ? null : nbr, occ: occ || 0,
        msq: msq10 ? msq10 / 10 : null, mconf: mconf != null && mconf >= 0 ? mconf : null };
    });
  }
  // no fresh file: read every hail file and scan (same rules; no LiDAR pitch on this path)
  function scan(c, root, dates, win) {
    S.source = 'scan'; S.hailFiles = {};
    const xyP = window.STH && STH.xy ? Promise.resolve(null) : fetchB(root + 'homes.bin');
    return Promise.all([xyP, fetchJ(root + 'meta/permits.json'),
      Promise.all(c.regions.map(r => Promise.all(dates.map(d => fetchB(`${root}meta/hail/${r.id}/${d}.bin`))))),
      Promise.all(c.regions.map(r => Promise.all([fetchJ(`${root}meta/${r.id}/streets.json`), fetchJ(`${root}meta/${r.id}/cities.json`), fetchB(`${root}meta/${r.id}/homes_meta.bin`),
        fetchJ(`${root}meta/${r.id}/subdivs.json`), fetchB(`${root}meta/${r.id}/homes_ext.bin`)])))
    ]).then(([hb, permits, hails, metas]) => {
      const n = c.total, xy = hb ? new Float32Array(hb, 0, n * 2) : STH.xy, type = hb ? new Uint8Array(hb, n * 8, n) : STH.type;
      permits = permits || {}; S.permitRegions = new Set(Object.keys(permits).map(k => k.split(':')[0]));
      S.permitsFrom = Object.values(permits).reduce((m, d) => !m || d < m ? d : m, null); if (S.permitsFrom) S.permitsFrom = S.permitsFrom.slice(0, 4);
      const out = [], tilesWanted = {};
      c.regions.forEach((r, k) => {
        const H = dates.map((d, i) => { const b = hails[k][i]; if (b && b.byteLength === r.count) { (S.hailFiles[d] = S.hailFiles[d] || []).push(r.id); return new Uint8Array(b); } return null; });
        const wi = dates.map((d, i) => win.has(d) && H[i] ? i : -1).filter(i => i >= 0);
        const [streets, cities, mb, subs, xb] = metas[k] || [], M = mb && mb.byteLength === r.count * 16 ? new DataView(mb) : null, X = xb && xb.byteLength === r.count * 8 ? new DataView(xb) : null;
        const tiles = new Set((r.tiles || []).map(t => t.tr + '_' + t.tc));
        for (let j = 0; j < r.count; j++) {
          let hit = false; for (const i of wi) if (H[i][j] >= 100) { hit = true; break; }
          if (!hit) continue;
          const gi = r.offset + j; if ((type[gi] & 127) > 4) continue;   // homes, not other buildings
          const lon = xy[gi * 2], lat = xy[gi * 2 + 1], cityN = M ? (cities || [])[M.getUint16(r.count * 14 + j * 2, true)] || '' : '';
          const sub = X && subs ? subs[X.getUint16(j * 2, true)] || null : null, zip = M ? M.getUint32(r.count * 10 + j * 4, true) : 0;
          const h = { gi, region: r.id, lon, lat, no: M ? M.getUint16(r.count * 6 + j * 2, true) : 0, street: M ? (streets || [])[M.getUint16(r.count * 8 + j * 2, true)] || '' : '',
            city: cityN, zip: zip ? String(zip).padStart(5, '0') : '', sub, nb: nbKey(sub, lat, lon), year: M ? M.getUint16(j * 2, true) || null : null,
            permit: permits[r.id + ':' + j] || null, sq: null, pitch: null, hits: [], living: X ? X.getUint16(r.count * 2 + j * 2, true) || null : null };
          dates.forEach((d, i) => { if (H[i] && H[i][j] >= 100) h.hits.push([d, H[i][j] / 100]); });
          if (type[gi] & 128) { const key = Math.floor(lat / 0.05) + '_' + Math.floor(lon / 0.05); if (tiles.has(key)) (tilesWanted[r.id + '/' + key] = tilesWanted[r.id + '/' + key] || []).push([h, j]); }
          out.push(h);
        }
      });
      return Promise.all(Object.keys(tilesWanted).map(k => fetchB(root + 'fp/' + k + '.bin').then(buf => {
        if (!buf) return; const m = tileSq(buf);
        tilesWanted[k].forEach(([h, j]) => { const fs = m.get(j); if (fs) { h.sq = Math.round(fs * 1.118 / 100 * 10) / 10; h.shared = !!(h.living && h.sq * 100 > 2.5 * h.living); } });   // same 6/12 factor as lib/st-storm.js
      }))).then(() => out);
    });
  }

  // ---------- one home's hail, score and reasons ----------
  // ages are counted from noon of the list's own day (roofer's zone), never from the moment of the build, so a list built
  // at 8 am and one built at 9 pm on the same day score every home the same and come out in the same order (10-15)
  let REF = Date.now();
  const ageDays = iso => (REF - Date.parse(iso + 'T12:00:00Z')) / DAY;
  const hailF = (in_, iso) => (0.5 + 0.5 * lin(in_, 1, 2)) * (1 - 0.6 * lin(ageDays(iso), 60, HAIL_DAYS));
  // the home's hail: of its 1 in+ storms in the last HAIL_DAYS (not before a later reroof permit), the one worth the most
  // points. No hail is fine: the home is still scored on everything else (always-on, Jack 10-11).
  function lead(h, win) {
    let best = null, bv = -1, any = false;
    h.hits.forEach(([iso, in_]) => {
      if (!win.has(iso)) return; any = true;
      if (h.permit && h.permit > iso) return;   // reroofed after that storm
      const v = hailF(in_, iso);
      if (v > bv) { bv = v; best = { iso, hail: in_ }; }
    });
    h.reroofedAfter = any && !best;
    h.lead = best; h.hail = best ? best.hail : null; h.mi = miles(S.hq, [h.lon, h.lat]);
    return true;
  }
  const inch = x => String(+(+x).toFixed(2));
  function score(h) {
    const nowY = new Date(REF).getUTCFullYear();
    // a complete re-roof permit list only for McKinney (about 2015 on) and Allen (about 2017 on): elsewhere no permit is not evidence
    const permits = S.permitRegions.has(h.region) && /^(mckinney|allen)$/i.test(h.city || '');
    const roofY = h.permit ? +h.permit.slice(0, 4) : h.year, age = roofY ? nowY - roofY : null, n = h.hits.length;
    const measured = h.msq != null && h.msq > 0, sq = measured ? h.msq : h.sq, good = measured && h.mconf != null && h.mconf >= 60;
    const sizeOk = sq != null && sq > 0 && sq <= 100 && !(!measured && h.shared);
    const f = {
      roofAge: age == null ? 0 : lin(age, 12, 22) * (permits ? 1 : 0.7),
      hail: h.lead ? hailF(h.hail, h.lead.iso) : 0,
      neighbours: !h.nbr ? 0 : h.nbr === 1 ? 0.18 : h.nbr <= 3 ? 0.55 : 1,   // Turnover Radar bands (back-test rates, 10-23)
      size: sizeOk ? lin(sq, 15, 45) * (good ? 1 : 0.8) : 0,
      owner: h.occ === 1 ? 1 : h.occ === 2 ? -1 : 0   // +10 likely owner-occupied, -10 likely investor
    };
    const parts = {}; let total = 0;
    Object.keys(WEIGHTS).forEach(k => { parts[k] = Math.round(f[k] * WEIGHTS[k].pts * 10) / 10; total += f[k] * WEIGHTS[k].pts; });
    h.age = age; h.parts = parts; h.raw = total; h.score = Math.round(total * 10) / 10; h.squares = sizeOk ? Math.round(sq * 10) / 10 : (h.sq || null);
    // every reason that is true for this home, plain English, each with the points it carries (biggest first)
    const R = [];
    if (parts.roofAge > 0 && h.permit) R.push([parts.roofAge, `Last re-roof permit ${roofY}, ${age} years ago`]);
    else if (parts.roofAge > 0 && permits) R.push([parts.roofAge, `Built ${h.year}, no re-roof permit on file since ${/allen/i.test(h.city) ? 2017 : 2015}`]);
    else if (parts.roofAge > 0) R.push([parts.roofAge, `Built ${h.year}`]);
    if (h.lead) R.push([parts.hail, `${inch(h.hail)} in hail on ${fmtDate(h.lead.iso)}${h.lead.iso === S.newest ? ', the newest storm' : ''}`]);
    if (h.nbr > 0) R.push([parts.neighbours, `${h.nbr} neighbor${h.nbr === 1 ? '' : 's'} within about a block re-roofed in the last 90 days`]);
    if (parts.owner > 0) R.push([parts.owner, 'Owner lives here (homestead exemption or tax bill mails to the home)']);
    if (sizeOk && sq >= 15) R.push([parts.size, `${sq >= 35 ? 'Large roof, about' : 'About'} ${Math.round(sq)} squares (${good ? 'LiDAR measured, ' : ''}est.)`]);
    if (h.pitch && h.pitch >= 8) R.push([0.02, `Steep roof, pitch est. ${h.pitch}/12 (LiDAR estimate)`]);
    if (n >= 2) R.push([0.01, `Hit by ${n} storms of 1 in or more (${h.hits.map(x => fmtMonth(x[0])).join(', ')})`]);
    h.why = R.sort((a, b) => b[0] - a[0]).map(x => x[1]);
    return h;
  }
  function address(h) {
    const city = h.city || '', street = streetName(h.street, city), st = (RC.catalog && RC.catalog.state) || 'TX';
    const line = h.no ? `${h.no} ${street}` : street || null;
    return { address: line ? `${line}, ${[city, (st + ' ' + (h.zip || '')).trim()].filter(Boolean).join(', ')}` : null, street: line, city, zip: h.zip || '' };
  }

  // ---------- who was reached and when (RC.activity: texts and emails a human handed off; lastContact = the last one) ----------
  function contactsMap() {
    const m = new Map();
    RC.activity().forEach(a => { if (a.dir !== 'out' || !(a.ch === 'text' || a.ch === 'email')) return;
      const t = Date.parse(a.at); if (!isFinite(t)) return; const l = m.get(a.id); if (l) l.push(t); else m.set(a.id, [t]); });
    m.forEach(l => l.sort((a, b) => a - b));
    return m;
  }
  // why the cold cadence is over for a home (null = still running). A reply, a deal in progress (handed to the owner,
  // inspection booked, proposal) or a "Not a fit" skip ends it, same as the cloud engine (supabase/functions/roof-engine):
  // from then on a person answers the homeowner; no more cold follow-ups and no Daily 50 cadence slot.
  const DEAL = { handoff: 1, inspection: 1, proposal: 1 };
  const skipsOf = () => get('d50skip', {}) || {};
  // Skip on the Today card (rc.t.d50skip): "Not a fit" keeps the home off every later list until undone; the others
  // keep it off new picks for SKIP_DAYS, then it can be picked again
  const SKIP_DAYS = { 'No one home': 2, 'Try later': 3 };
  function stoppedWhy(id, pipe, sk) {
    const p = pipe[id];
    if (RC.optedOut && RC.optedOut(id)) return 'opted out';
    if (p && p.stage === 'won') return 'won';
    if (p && p.archived) return 'not now';
    if (p && DEAL[p.stage]) return 'in a deal';
    if (RC.replied ? RC.replied(id) : !!(p && (p.history || []).some(h => h.dir === 'in'))) return 'replied';
    const s = (sk || skipsOf())[id]; if (s && s.reason === 'Not a fit') return 'not a fit';
    return null;
  }
  // the plain words every screen shows for a stopped cadence
  const STOP_TEXT = { 'opted out': 'Opted out, no follow-ups', won: 'Won, no follow-ups', 'not now': 'Not now, no follow-ups',
    'in a deal': 'In a deal, no cold follow-ups', replied: 'Replied, answer them', 'not a fit': 'Skipped as not a fit, no follow-ups' };
  RC.cadenceStopText = why => STOP_TEXT[why] || 'No follow-ups';
  function cadenceFrom(times, nowMs, stopped) {
    const today = dayKey(nowMs);
    if (stopped) return { step: null, touch: null, channel: null, firstContact: times && times.length ? new Date(times[0]).toISOString() : null, lastContact: times && times.length ? new Date(times[times.length - 1]).toISOString() : null, nextDue: null, overdue: false, dueToday: false, daysOverdue: 0, stopped };
    if (!times || !times.length) return { step: 1, touch: 1, channel: 'text', firstContact: null, lastContact: null, nextDue: today, overdue: false, dueToday: true, daysOverdue: 0, stopped: null, fresh: true };
    const d0 = dayNum(dayKey(times[0])), dl = dayNum(dayKey(times[times.length - 1])) - d0 + 1;   // cadence day of the last touch (first touch = day 1)
    let step = CADENCE.find(d => d > dl); if (step == null) step = (Math.floor(dl / 30) + 1) * 30;
    const touch = step <= 30 ? CADENCE.indexOf(step) + 1 : 4 + step / 30 - 1;
    const due = d0 + step - 1, nowN = dayNum(today);
    return { step, touch, channel: chanOf(step), firstContact: new Date(times[0]).toISOString(), lastContact: new Date(times[times.length - 1]).toISOString(),
      nextDue: keyOf(due), overdue: nowN > due, dueToday: nowN >= due, daysOverdue: Math.max(0, nowN - due), stopped: null };
  }

  // ---------- the day's list ----------
  let stats = {};
  function build(key, ref) {
    const t0 = performance.now(), pipe = RC.pipeline(), cm = contactsMap(), out = [], seen = new Set();
    const ex = { won: 0, notNow: 0, optedOut: 0, replied: 0, inDeal: 0, notAFit: 0, skippedRecently: 0, contacted24h: 0, inCadenceNotDue: 0, reroofedAfterStorm: S.reroofed, cooldown: 0, activeDeal: 0 };
    const BUMP = { won: 'won', 'not now': 'notNow', 'opted out': 'optedOut', replied: 'replied', 'in a deal': 'inDeal', 'not a fit': 'notAFit' };
    const bump = s => { ex[BUMP[s] || 'optedOut']++; };
    const sk = skipsOf();
    // 1. cadence: every home ever reached, due today or overdue, first (most overdue, then score, then id)
    const due = [];
    cm.forEach((times, id) => {
      const s = stoppedWhy(id, pipe, sk); if (s) { bump(s); return; }
      const last = times.filter(t => t <= ref).pop(); if (last == null) return;
      const c = cadenceFrom(times.filter(t => t <= ref), ref, null);
      if (ref - last < DAY) { ex.contacted24h++; return; }
      if (dayNum(c.nextDue) > dayNum(key)) { ex.inCadenceNotDue++; return; }
      const gi = /^m\d+$/.test(id) ? +id.slice(1) : null, h = gi != null ? S.byGi.get(gi) : null;
      due.push({ id, h, c, gi });
    });
    due.sort((a, b) => b.c.daysOverdue - a.c.daysOverdue || ((b.h ? b.h.score : -1) - (a.h ? a.h.score : -1)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    due.forEach(d => { if (out.length >= SIZE) return; seen.add(d.id); out.push({ id: d.id, h: d.h, gi: d.gi, reason: 'cadence', c: d.c }); });
    const dueCount = due.length;
    // 2. new picks: never texted / emailed, not closed, no touch of any kind (call, note, reply) in the last COOLDOWN_DAYS,
    //    not in an active deal; best "likely to say yes" score first, spread across streets and neighbourhoods
    const lastTouch = new Map();
    RC.activity().forEach(a => { const t = Date.parse(a.at); if (isFinite(t) && t <= ref && !(lastTouch.get(a.id) >= t)) lastTouch.set(a.id, t); });
    const pool = [];
    for (const h of S.cands) {
      const id = 'm' + h.gi; if (seen.has(id)) continue;
      if (cm.has(id)) continue;                                        // reached before: the cadence decides when, not the score
      const s = stoppedWhy(id, pipe, sk); if (s) { bump(s); continue; }
      if (pipe[id] && pipe[id].stage && pipe[id].stage !== 'new') { ex.activeDeal++; continue; }   // an active thread / deal, not a cold pick
      const sv = sk[id]; if (sv && SKIP_DAYS[sv.reason] && ref - Date.parse(sv.at) < SKIP_DAYS[sv.reason] * DAY) { ex.skippedRecently++; continue; }
      const lt = lastTouch.get(id); if (lt != null && ref - lt < COOLDOWN_DAYS * DAY) { ex.cooldown++; continue; }
      pool.push(h);
    }
    // Spread (Jack 10-10: "we're always hitting a small pocket of 50 people, spread it out around the whole area"): the
    // pool is bucketed into ~2 km cells (CELL degrees). Each round takes the best remaining home from every cell, cells in
    // order of their best score, under the street and neighbourhood caps and a per-city share (no city over half the list
    // while another city still has homes), so the 50 land all over the storms' footprint and still prefer the best homes.
    // Only homes that really took 1 in+ hail are in the pool: a city the storms missed stays off the list (stats say so).
    const skOf = h => h.street + '|' + h.city, nkOf = h => h.nb || skOf(h);
    const cells = new Map(); pool.forEach(h => { const k = Math.floor(h.lat / CELL) + '_' + Math.floor(h.lon / CELL); const c = cells.get(k); if (c) c.push(h); else cells.set(k, [h]); });
    // cells take turns by city (10-11): the best cell of every city, then every city's second best, ..., each turn in order
    // of score, so every city in the area is on the list (up to its share) instead of the cities with the densest records
    const byCityCells = new Map();
    [...cells.values()].sort((a, b) => b[0].raw - a[0].raw).forEach(c => { const k = c[0].city || '?'; if (!byCityCells.has(k)) byCityCells.set(k, []); byCityCells.get(k).push(c); });
    const order = [];
    for (let t = 0, more = true; more; t++) { more = false; const turn = [];
      byCityCells.forEach(l => { if (l[t]) { turn.push(l[t]); more = true; } });
      turn.sort((a, b) => b[0].raw - a[0].raw).forEach(c => order.push(c)); }
    // city share (10-11, always-on): each city's cap follows its share of the area's homes (1.5x slack, at least 3, at most
    // half the list), so a city with sparse permit records (Plano) is not crowded out by one with dense records (Allen)
    const byCity = {}; let allHomes = 0;
    ((RC.catalog && RC.catalog.regions) || []).forEach(r => Object.entries(r.by_city || {}).forEach(([c, n]) => { byCity[c] = (byCity[c] || 0) + n; allHomes += n; }));
    const cityCap = city => allHomes && byCity[city] ? Math.min(Math.ceil(SIZE / 2), Math.max(3, Math.ceil(SIZE * byCity[city] / allHomes * 1.5))) : Math.ceil(SIZE / 2);
    const nS = {}, nN = {}, nC = {}, took = new Set(), passes = [[STREET_CAP, NB_CAP, 1], [STREET_CAP * 2, NB_CAP * 2, 2], [Infinity, Infinity, Infinity]];
    let pass = 0, rounds = 0, capSkips = 0;
    for (; pass < passes.length && out.length < SIZE; pass++) {
      const [sc, nc, cc] = passes[pass];
      let more = true;
      while (more && out.length < SIZE) {   // one round: at most one home from each cell
        more = false; rounds++;
        for (const cell of order) {
          if (out.length >= SIZE) break;
          let h = null;
          for (const x of cell) { if (took.has(x.gi)) continue; if ((nS[skOf(x)] || 0) >= sc || (nN[nkOf(x)] || 0) >= nc || (nC[x.city] || 0) >= cityCap(x.city) * cc) { if (pass === 0) capSkips++; continue; } h = x; break; }
          if (!h) continue;
          nS[skOf(h)] = (nS[skOf(h)] || 0) + 1; nN[nkOf(h)] = (nN[nkOf(h)] || 0) + 1; nC[h.city] = (nC[h.city] || 0) + 1; took.add(h.gi); more = true;
          out.push({ id: 'm' + h.gi, h, gi: h.gi, reason: 'new', c: null });
        }
      }
    }
    lastBuild = { ms: Math.round((performance.now() - t0) * 10) / 10 };
    const news = out.filter(o => o.reason === 'new');
    stats = { ready: true, date: key, storm: S.storm, newest: S.newest, windowStorms: S.window.slice(), source: S.source, fileBuilt: S.built, fileStale: S.fileStale,
      missingHail: S.missing.slice(), fallback: S.fallback, candidates: S.cands.length, scored: S.cands.length, eligibleNew: pool.length, dueToday: dueCount,
      picked: out.length, cadenceSlots: out.length - news.length, newSlots: news.length,
      spread: { streetCap: STREET_CAP, neighbourhoodCap: NB_CAP, cityCap: Object.fromEntries(Object.keys(byCity).map(c => [c, cityCap(c)])), cellDeg: CELL, passes: pass, rounds, skippedByCaps: capSkips,
        poolCells: cells.size, cells: new Set(news.map(o => Math.floor(o.h.lat / CELL) + '_' + Math.floor(o.h.lon / CELL))).size,
        streets: new Set(news.map(o => o.h.street + '|' + o.h.city)).size, neighbourhoods: new Set(news.map(o => o.h.nb)).size,
        cities: news.reduce((m, o) => { m[o.h.city || '?'] = (m[o.h.city || '?'] || 0) + 1; return m; }, {}) },
      fromStorm: news.reduce((m, o) => { const k = o.h.lead ? o.h.lead.iso : 'no hail'; m[k] = (m[k] || 0) + 1; return m; }, {}),
      mode: 'always-on', homesScored: S.scoredHomes, cooldownDays: COOLDOWN_DAYS, hailDays: HAIL_DAYS,
      factors: news.reduce((m, o) => { Object.keys(WEIGHTS).forEach(k => { if (o.h.parts[k] > 0) m[k] = (m[k] || 0) + 1; }); return m; }, {}),
      excluded: ex, loadMs: S.loadMs, buildMs: lastBuild.ms };
    return out.map(o => ({ id: o.id, reason: o.reason }));
  }
  // live view of a kept pick: facts, words and today's status
  function view(p, key, ref, pipe, cm) {
    const gi = /^m\d+$/.test(p.id) ? +p.id.slice(1) : null, h = gi != null ? S.byGi.get(gi) : null, rec = RC.recall(p.id) || {};
    const times = (cm.get(p.id) || []).filter(t => t <= Math.max(ref, Date.now()));
    const stop = stoppedWhy(p.id, pipe), c = p.reason === 'cadence' ? cadenceFrom(times.filter(t => t < dayStart(key)), dayStart(key), null) : null;
    const today = times.some(t => dayKey(t) === key);
    const a = h ? address(h) : { address: rec.addr ? [rec.addr, rec.city].filter(Boolean).join(', ') : null, city: rec.city || '', zip: rec.zip || '' };
    let w = h ? h.why.slice() : [];
    if (c) w = [c.daysOverdue ? `Day ${c.step} follow-up, ${c.daysOverdue} day${c.daysOverdue === 1 ? '' : 's'} overdue` : `Day ${c.step} follow-up, due today`].concat(w);
    const step = c ? c.step : 1;
    return Object.assign({ id: p.id, gi, address: a.address, street: a.street || null, city: a.city, zip: a.zip, subdivision: h ? h.sub : null, neighbourhood: h ? h.nb : null,
      lon: h ? h.lon : rec.lon != null ? +rec.lon : null, lat: h ? h.lat : rec.lat != null ? +rec.lat : null,
      score: h ? h.score : null, why: w, reason: p.reason, step, touch: c ? c.touch : 1, channel: chanOf(step), nextDue: c ? c.nextDue : key,
      status: stop ? 'closed' : today ? 'done' : 'open', closedBy: stop || null,
      hail: h ? h.hail : null, storm: h && h.lead ? h.lead.iso : null, queueStorm: S.storm, storms: h ? h.hits.length : null, stormDates: h ? h.hits.map(x => x[0]) : [],
      roofYear: h ? (h.permit ? +h.permit.slice(0, 4) : h.year) : null, yearBuilt: h ? h.year : null, permit: h ? h.permit : null,
      squares: h ? h.squares : null, measured: h ? !!(h.msq && h.mconf != null && h.mconf >= 60) : false, neighbours: h ? h.nbr : null, ownerOccupied: h ? h.occ === 1 : null, pitch: h ? h.pitch : null, miles: h ? Math.round(h.mi * 10) / 10 : null, parts: h ? Object.assign({}, h.parts) : null });
  }

  RC.daily = function (dateISO, opts) {
    opts = opts || {};
    if (!S.ready) { stats = { ready: false, err: S.err }; return []; }
    const key = /^\d{4}-\d{2}-\d{2}$/.test(dateISO || '') ? dateISO : dayKey(Date.now()), isToday = key === dayKey(Date.now());
    const ref = isToday ? Date.now() : dayStart(key);
    const kept = get('daily', {}), k = kept[key];
    let picks;
    // a kept list is reused only when it was built by this engine version for this roofer (same 50 all day, storm or not)
    if (!opts.rebuild && k && k.v === VERSION && k.roofer === RC.rooferKey() && Array.isArray(k.picks)) { picks = k.picks; stats = Object.assign({}, k.stats || {}, { kept: true, buildMs: 0 }); }
    else {
      if (S.scoredFor !== key) rescore(key);
      picks = build(key, ref);
      if (opts.keep !== false) { kept[key] = { v: VERSION, storm: S.storm, roofer: RC.rooferKey(), built: new Date(Date.now()).toISOString(), picks, stats };
        Object.keys(kept).sort().slice(0, -7).forEach(d => delete kept[d]); put('daily', kept); }
    }
    const t0 = performance.now(), pipe = RC.pipeline(), cm = contactsMap();
    const out = picks.map(p => view(p, key, ref, pipe, cm));
    stats.viewMs = Math.round((performance.now() - t0) * 10) / 10;
    return out;
  };
  // ONE answer to "which stop of today's list is this home, and what does the list say about it" for every screen (Today's
  // card, the record's "Stop n of 50", the pipeline card, the inbox, Nimbus): the same kept list RC.daily() returns.
  // RC.todayPick(id) -> the pick (address, hail, storm, squares, measured, ...) with .stop (1-based), or null when the home
  // is not on today's list; RC.stopOf(id) -> its stop number or null.
  RC.todayPick = function (id) {
    if (!S.ready || !id) return null;
    const l = RC.daily(), i = l.findIndex(p => p.id === id);
    return i < 0 ? null : Object.assign({ stop: i + 1, of: l.length }, l[i]);
  };
  RC.stopOf = id => { const p = RC.todayPick(id); return p ? p.stop : null; };
  RC.cadence = function (id, nowMs) {
    const now = nowMs != null ? nowMs : Date.now(), times = (contactsMap().get(id) || []).filter(t => t <= now);
    return cadenceFrom(times, now, stoppedWhy(id, RC.pipeline()));
  };
  RC.cadenceChannel = chanOf;
  // homes added by hand (storm map, Nimbus) ride on Today's list until their first touch: a home reached on an earlier
  // day leaves it (the cadence brings it back when its follow-up is due), a stopped home (opted out, won, not now, in a
  // deal, replied, not a fit) leaves it at once. A home reached today stays, shown as done. RC.added() keeps the raw list.
  RC.addedOpen = function () {
    const pipe = RC.pipeline(), cm = contactsMap(), sk = skipsOf(), d0 = dayStart(dayKey(Date.now()));
    return RC.added().filter(a => !stoppedWhy(a.id, pipe, sk) && !(cm.get(a.id) || []).some(t => t < d0));
  };
  // does the county have reroof permit records for this home, and from when (rc-copy words the roof line by it)
  RC.permitCoverage = id => {
    const gi = /^m\d+$/.test(String(id || '')) ? +String(id).slice(1) : null;
    if (!S.ready || !RC.catalog || gi == null) return null;
    return S.permitRegions.has(regionOf(RC.catalog, gi).id) ? { from: S.permitsFrom } : false;
  };
  // textHours: when the day's texts can go (RC.textWindow, the roofer's state window); the list itself is the same all day
  RC.queueStats = () => Object.assign({ weights: WEIGHTS, cadence: CADENCE.concat(['every 30 days']), channels: { 'day 1': 'text', 'day 3 on': 'email' } }, stats,
    { ready: S.ready, storm: S.storm, newest: S.newest, source: S.source, loadMs: S.loadMs, textHours: RC.textWindow ? RC.textWindow().label : null });
  RC.queueWeights = WEIGHTS;
  RC.queueReady = load().then(() => true).catch(e => { S.err = String(e && e.message || e); console.warn('rc-queue', e); return false; });
  if (typeof RC.queue === 'function') RC.queue.engine = { weights: WEIGHTS, cadence: CADENCE, daily: RC.daily, cadenceOf: RC.cadence, stats: RC.queueStats, ready: RC.queueReady, _state: S };
})();
