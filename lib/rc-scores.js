/* rc-scores.js: Property Opportunity Score, evidence, search, saved segments and rep assignments (Jack's proposal,
   features 3 and 4, 10-26). Plain script, window.RCS. Needs lib/rc-state.js (window.RC) first; uses lib/st-meta.js (STM)
   for addresses when it is on the page.

   Data (built by scripts/scores/build_scores.py, weights in scripts/scores/weights.json):
     lib/st-data-dfw/meta/scores/scores.json  weights, columns, lists, sources and refresh times
     lib/st-data-dfw/meta/scores/homes.bin    one row per home (global index gi), columns in scores.json "cols"
     lib/st-data-dfw/meta/scores/hits.bin     every 0.75 in+ radar hail hit (gi, storm, size)
     lib/st-data-dfw/meta/scores/blocks.json  the ranked blocks (neighborhood scores)
   On this device (localStorage rc.t.*): segments, assign, settings[roofer].reps, suppress (a cache of the secure store's
   do-not-contact list, filled by the cloud sync when signed in).

   Rules:
     - The score (0 to 100) and the evidence confidence (High / Medium / Unknown) are separate numbers. 90 points come from
       the data build; the 10 CRM points are added here from this device's pipeline.
     - A missing permit is "roof age unknown", never "old roof" (RC.roofEvidence).
     - Contact eligibility is independent of the score: opt-outs, do-not-call and suppression always win. Ineligible homes
       still show in results, greyed, with the reason; they are never assigned or queued for outreach.
     - Property and project facts only: no demographic or protected-trait filters, and none are accepted.

   FUNCTIONS FOR NIMBUS (every call is local and sends nothing; all return plain objects; async ones return Promises):
     RCS.ready()                         -> Promise<RCS>, loads the score files once
     RCS.search(filters)                 -> Promise<{total, shown, homes:[row], counts, filters}>   (filters below)
     RCS.score(gi)                       -> {gi, score, data, crm, parts:{roofAge,storm,roof,crm,neighborhood}, conf, confWord, built}
     RCS.explain(gi)                     -> Promise<evidence>: plain-word lines + details for every part, sources, refresh time
     RCS.eligibility(gi)                 -> {ok, reason, source}
     RCS.parse(text)                     -> {filters, limit, rep, understood[]}: a plain-English request as filters
     RCS.saveSegment({name, filters, queue, alert}) -> segment;  RCS.segments(); RCS.deleteSegment(id)
     RCS.segmentQueue(id, n)             -> Promise<{segment, homes}>: today's work queue (eligible, not contacted in 14 days)
     RCS.segmentAlerts()                 -> Promise<[{segment, newHomes}]>: segments with the alert on and new matches
     RCS.reps(); RCS.addRep(name); RCS.removeRep(id)
     RCS.assign(target, repId, {limit})  -> Promise<{assigned, skipped:[{gi, reason}], rep}>; target = [gi] | {segment:id} | {filters}
     RCS.unassign([gi]);  RCS.myList(repId) -> Promise<[row]>
     RCS.neighborhoods({limit, city})    -> Promise<[block]>: ranked blocks, engagement added from this device
     RCS.describe([gi])                  -> Promise<[{gi, addr, city, zip, year}]> (addresses, no owner names)

   filters (all optional):
     roofAgeMin, roofAgeMax   years (by permit, else year built)
     conf                     ['high','medium','low','unknown']  evidence confidence (meta/roof-evidence.json)
     hailMin                  inches (0.75 and up); stormFrom, stormTo: ISO dates for the hail
     types                    [0..4] Single family, Duplex, Townhome, Condo, Mobile home
     sqMin, sqMax             roof squares (an estimate)
     cities, zips             names / 5-digit ZIPs; area: {poly:[[lon,lat],...]} or {center:[lon,lat], miles}
     crm                      ['none','new','contacted','replied','deal','won','lost']
     scoreMin, scoreMax       0 to 100
     eligible                 'only' | 'not' | (absent = all, ineligible greyed)
     assigned                 rep id | 'none' | 'any'
     sort                     'score' (default) | 'hail' | 'age';  limit (default 200)
*/
(function () {
  'use strict';
  if (window.RCS || !window.RC) return;
  const RC = window.RC;
  const DATA = (window.STM && STM.BASE) || (window.rooferDataRoot ? rooferDataRoot() : RC.base + 'lib/st-data-dfw/');
  const J = u => fetch(DATA + u).then(r => r.ok ? r.json() : null).catch(() => null);
  const B = u => fetch(DATA + u).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null);
  const get = (k, d) => RC.__get ? RC.__get(k, d) : d, set = (k, v) => RC.__set && RC.__set(k, v);
  const CONF = ['', 'high', 'medium', 'low', 'unknown'], WORD = { high: 'High', medium: 'Medium', low: 'Low', unknown: 'Unknown' };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dlong = iso => MON[+iso.slice(5, 7) - 1] + ' ' + (+iso.slice(8, 10)) + ', ' + iso.slice(0, 4);
  const inch = v => (v / 100).toFixed(2).replace(/0$/, '').replace(/\.0$/, '');
  const DAY = 864e5;
  let M = null, C = null, XY = null, TYP = null, HITS = null, BLOCKS = null, loading = null;

  function ready() {
    if (loading) return loading;
    loading = Promise.all([J('meta/scores/scores.json'), B('meta/scores/homes.bin'), window.STH && STH.xy ? null : B('homes.bin')]).then(([m, hb, xb]) => {
      if (!m || !hb) throw new Error('The score files are not built yet (scripts/scores/build_scores.py).');
      M = m; C = {};
      m.cols.forEach(([k, t, o]) => { C[k] = t === 'u2' ? new Uint16Array(hb, o, m.n) : new Uint8Array(hb, o, m.n); });
      if (xb) { XY = new Float32Array(xb, 0, m.n * 2); TYP = new Uint8Array(xb, m.n * 8, m.n); }
      else { XY = STH.xy; TYP = STH.typ || null; }
      return RCS;
    });
    loading.catch(() => { loading = null; });
    return loading;
  }
  function hits() {
    return HITS || (HITS = B('meta/scores/hits.bin').then(b => {
      const k = M.hits.k; return { gi: new Uint32Array(b, 0, k), st: new Uint8Array(b, k * 4, k), v: new Uint8Array(b, k * 5, k), k };
    }));
  }
  function hitsOf(H, gi) {   // binary search: this home's hits [{iso, inches}]
    let lo = 0, hi = H.k; while (lo < hi) { const m = (lo + hi) >> 1; if (H.gi[m] < gi) lo = m + 1; else hi = m; }
    const out = []; for (let i = lo; i < H.k && H.gi[i] === gi; i++) out.push({ iso: M.storms[H.st[i]], inches: H.v[i] / 100 });
    return out.sort((a, b) => a.iso < b.iso ? 1 : -1);
  }
  const blocks = () => BLOCKS || (BLOCKS = J('meta/scores/blocks.json'));
  const id = gi => 'm' + gi;

  // ---------- CRM (this device) ----------
  const DEAL = { handoff: 1, inspection: 1, proposal: 1 };
  function crmOf(gi, pipe) {
    const p = (pipe || RC.pipeline())[id(gi)];
    if (!p) return { status: 'none', pts: 0, word: 'No contact yet', last: null };
    const h = p.history || [], last = h[0] ? h[0].at : null;
    const replied = RC.replied ? RC.replied(id(gi)) : h.some(x => x.dir === 'in');
    const talked = h.some(x => x.kind === 'knock' && /talk|book/i.test(x.what || ''));
    const status = p.stage === 'won' ? 'won' : p.stage === 'lost' || p.archived ? 'lost' : DEAL[p.stage] ? 'deal' : replied ? 'replied' : p.stage === 'new' ? 'new' : 'contacted';
    const f = DEAL[p.stage] || replied ? 1 : talked ? 0.5 : h.length ? 0.25 : 0;
    const word = { won: 'Customer (won)', lost: 'Not now', deal: 'In a deal (' + p.stage + ')', replied: 'Replied', new: 'In the pipeline, not contacted', contacted: talked ? 'Talked at the door' : 'Contacted, no answer yet' }[status];
    return { status, pts: Math.round(f * ((M && M.config.weights.crm) || 10) * 10) / 10, word, last, stage: p.stage, touches: h.length };
  }

  // ---------- contact eligibility: independent of the score, always wins ----------
  function eligibility(gi) {
    const k = id(gi);
    if (RC.optedOut && RC.optedOut(k)) { const o = (get('optout', {}) || {})[k] || {}; return { ok: false, reason: 'Opted out' + (o.how ? ' (' + o.how + ')' : ''), source: 'this device, sent to the secure contact store' }; }
    const sup = (get('suppress', {}) || {})[k];
    if (sup) return { ok: false, reason: { dnc: 'Do not call list', stop: 'Opted out (STOP)', tcpa: 'Do not contact (TCPA)', litigator: 'Do not contact', bounce: 'Email bounced, no other way to reach', manual: 'Do not contact' }[sup.reason] || 'Do not contact', source: 'secure contact store (suppression list)' };
    const h = RC.recall ? RC.recall(k) : null;
    if (h && (h.dnc || h.doNotContact)) return { ok: false, reason: 'Do not call list', source: 'home record' };
    return { ok: true, reason: '', source: '' };
  }

  // ---------- one home's score ----------
  function score(gi, pipe) {
    if (!M) return null;
    const pt = M.pt, crm = crmOf(gi, pipe), data = C.score[gi];
    const parts = { roofAge: C.pAge[gi] / pt, storm: C.pStorm[gi] / pt, roof: C.pRoof[gi] / pt, crm: crm.pts, neighborhood: C.pNbhd[gi] / pt };
    const conf = CONF[C.conf ? C.conf[gi] : 4] || 'unknown';
    return { gi, score: Math.min(100, Math.round(data + crm.pts)), data, crm: crm.pts, parts, conf, confWord: WORD[conf], built: M.built };
  }
  function roofEv(gi) {
    // confidence comes from the permits-v2 roof record (meta/roof-evidence.json) through the score build; the words follow the rule
    const ev = C.ev[gi], k = ev & 7, city = M.cities[C.city[gi]] || '', y = C.roofYear[gi], conf = CONF[C.conf ? C.conf[gi] : 4] || 'unknown';
    const set = o => Object.assign(o, { conf, confWord: WORD[conf] });
    if (k === 1) { const e = RC.roofEvidence(city, null, String(y));
      if (ev & 64) Object.assign(e, { text: `Roofing permit ${y}, may be a repair`, why: 'a roofing permit whose scope is unclear (repair or partial possible)', old: false });
      return set(Object.assign(e, { source: M.permitSrc[C.permitSrc[gi]] || 'Re-roof permit records', just: !!(ev & 32) })); }
    const e = RC.roofEvidence(city, y || null, null);
    if (k === 2 && (ev & 16)) Object.assign(e, { text: `Original roof, built ${y}`, original: true });
    return set(Object.assign(e, { source: k === 2 ? `County year built; City of ${city} re-roof permits since ${M.coverage[city] || ''} (none for this home)` : 'County year built only (no complete re-roof permit list here)' }));
  }
  const ptype = gi => M.types[(TYP ? TYP[gi] : C.ptype[gi]) & 127] || '';

  // a result row (no owner names)
  function row(gi, pipe, asg) {
    const s = score(gi, pipe), e = eligibility(gi), r = roofEv(gi), a = (asg || get('assign', {}))[gi];
    return { gi, id: id(gi), score: s.score, conf: s.conf, confWord: s.confWord, parts: s.parts, roof: r.text, roofAge: r.age, roofKind: r.kind,
      hail: C.hailMax[gi] ? C.hailMax[gi] / 100 : 0, hailDate: C.hailStorm[gi] < 255 ? M.storms[C.hailStorm[gi]] : null,
      squares: C.sq[gi] || null, pitch: C.pitch[gi] || null, nbr: C.nbr[gi], city: M.cities[C.city[gi]] || '', zip: M.zips[C.zip[gi]] || '',
      type: ptype(gi), block: C.block[gi] < 65535 ? C.block[gi] : null, eligible: e.ok, why: e.reason, crm: crmOf(gi, pipe).status,
      rep: a ? a.rep : null, lon: XY ? XY[gi * 2] : null, lat: XY ? XY[gi * 2 + 1] : null };
  }

  // ---------- search ----------
  const BANNED = /race|ethnic|religio|national|origin|color|sex|gender|famil|marital|disab|age of owner|owner age|income|credit|language|children|elderly|senior/i;
  function inPoly(x, y, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
  function search(filters) {
    const F = Object.assign({}, filters || {});
    Object.keys(F).forEach(k => { if (BANNED.test(k)) throw new Error('Roof Command searches property and project facts only; "' + k + '" is not a filter.'); });
    return ready().then(() => (F.hailMin || F.stormFrom || F.stormTo ? hits() : null)).then(H => {
      const n = M.n, yr = new Date().getFullYear(), pipe = RC.pipeline(), asg = get('assign', {});
      let hailOK = null;
      if (H) {   // best hail per home inside the storm date range
        const lo = F.stormFrom || '0000', hi = F.stormTo || '9999', minv = Math.round((F.hailMin || 0.75) * 100), ok = new Set();
        const sOK = M.storms.map(d => d >= lo && d <= hi);
        for (let i = 0; i < H.k; i++) if (sOK[H.st[i]] && H.v[i] >= minv) ok.add(H.gi[i]);
        hailOK = ok;
      }
      const conf = F.conf && F.conf.length ? new Set(F.conf) : null, types = F.types && F.types.length ? new Set(F.types.map(Number)) : null;
      const cities = F.cities && F.cities.length ? new Set(F.cities.map(c => M.cities.findIndex(x => x.toLowerCase() === String(c).toLowerCase())).filter(i => i >= 0)) : null;
      const zips = F.zips && F.zips.length ? new Set(F.zips.map(z => M.zips.indexOf(String(z))).filter(i => i >= 0)) : null;
      const crm = F.crm && F.crm.length ? new Set(F.crm) : null;
      let circ = null; if (F.area && F.area.center) { const [cx, cy] = F.area.center, r = (F.area.miles || 1) / 69; circ = [cx, cy, r, r / Math.cos(cy * Math.PI / 180)]; }
      const poly = F.area && F.area.poly && F.area.poly.length > 2 ? F.area.poly : null;
      let bb = null; if (poly) { bb = [Infinity, Infinity, -Infinity, -Infinity]; poly.forEach(([x, y]) => { bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], y); }); }
      const out = []; const counts = { matched: 0, eligible: 0, ineligible: 0, conf: { high: 0, medium: 0, low: 0, unknown: 0 } };
      for (let gi = 0; gi < n; gi++) {
        const ev = C.ev[gi]; if (!ev) continue;                               // not a house
        if (cities && !cities.has(C.city[gi])) continue;
        if (zips && !zips.has(C.zip[gi])) continue;
        if (types && !types.has(C.ptype[gi])) continue;
        const cf = CONF[C.conf ? C.conf[gi] : 4]; if (conf && !conf.has(cf)) continue;
        if (F.roofAgeMin != null || F.roofAgeMax != null) { const y = C.roofYear[gi]; if (!y) continue; const age = yr - y; if (F.roofAgeMin != null && age < F.roofAgeMin) continue; if (F.roofAgeMax != null && age > F.roofAgeMax) continue; }
        if (F.sqMin != null && C.sq[gi] < F.sqMin) continue; if (F.sqMax != null && (!C.sq[gi] || C.sq[gi] > F.sqMax)) continue;
        if (hailOK && !hailOK.has(gi)) continue;
        if (poly || circ) { if (!XY) continue; const x = XY[gi * 2], y = XY[gi * 2 + 1];
          if (circ && (((x - circ[0]) / circ[3]) ** 2 + ((y - circ[1]) / circ[2]) ** 2 > 1)) continue;
          if (poly && (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3] || !inPoly(x, y, poly))) continue; }
        if (F.scoreMin != null && C.score[gi] + 10 < F.scoreMin) continue;     // cheap pre-check (CRM adds at most 10)
        if (crm) { const st = pipe[id(gi)] ? crmOf(gi, pipe).status : 'none'; if (!crm.has(st)) continue; }
        if (F.assigned) { const a = asg[gi]; if (F.assigned === 'none' ? a : F.assigned === 'any' ? !a : !a || a.rep !== F.assigned) continue; }
        const s = pipe[id(gi)] ? score(gi, pipe).score : C.score[gi];
        if (F.scoreMin != null && s < F.scoreMin) continue; if (F.scoreMax != null && s > F.scoreMax) continue;
        const e = eligibility(gi); if (F.eligible === 'only' && !e.ok) continue; if (F.eligible === 'not' && e.ok) continue;
        counts.matched++; counts.conf[cf]++; e.ok ? counts.eligible++ : counts.ineligible++;
        out.push([s, gi]);
      }
      const key = F.sort === 'hail' ? (a => C.hailMax[a[1]]) : F.sort === 'age' ? (a => -(C.roofYear[a[1]] || 9999)) : (a => a[0]);
      out.sort((a, b) => key(b) - key(a) || b[0] - a[0] || a[1] - b[1]);
      const lim = F.limit || 200;
      return { total: out.length, shown: Math.min(lim, out.length), homes: out.slice(0, lim).map(([, gi]) => row(gi, pipe, asg)), counts, filters: F, built: M.built };
    });
  }

  // ---------- evidence (the card on the home record, and what Nimbus reads out) ----------
  function explain(gi) {
    return Promise.all([ready(), STM_facts(gi)]).then(([, f]) => hits().then(H => {
      const s = score(gi), r = roofEv(gi), crm = crmOf(gi), e = eligibility(gi), W = M.config.weights, src = M.sources;
      const storms = hitsOf(H, gi).map(h => ({ date: h.iso, label: dlong(h.iso), inches: h.inches, source: 'NOAA MRMS radar hail (1 km grid), an estimate' }));
      const big = storms.filter(h => h.inches >= 1);
      const sq = C.sq[gi], pit = C.pitch[gi], nbr = C.nbr[gi];
      const lines = {
        roofAge: { pts: s.parts.roofAge, max: W.roofAge, conf: r.conf, confWord: r.confWord,
          plain: r.kind === 'documented' ? (r.just ? `New roof ${r.year}, just re-roofed` : `Roof about ${r.age} years old (re-roofed ${r.year})`) : r.kind === 'likely' ? `Roof likely about ${r.age} years old (${r.text.toLowerCase()})` : r.text,
          detail: r.why + '. Source: ' + r.source + '.' + (f && f.reroof && f.reroof.permit ? ` Permit ${f.reroof.permit}, ${f.reroof.means || ''}.` : '') },
        storm: { pts: s.parts.storm, max: W.storm,
          plain: big.length ? `${big[0].inches.toFixed(2)} in hail on ${big[0].label}` + (big.length > 1 ? `, hit by ${big.length} storms of 1 in+` : '') : storms.length ? `Up to ${Math.max(...storms.map(x => x.inches)).toFixed(2)} in hail, under 1 in` : 'No hail of 0.75 in or more on file',
          detail: 'Radar hail at this house for every storm on file (NOAA MRMS MESH, about 1 km), not an inspection. Points count the best hit in the last 24 months, not before a later re-roof.' },
        roof: { pts: s.parts.roof, max: W.roof,
          plain: sq ? `About ${sq} squares${pit >= 7 ? ', steep (' + pit + '/12)' : pit ? ', ' + pit + '/12 pitch' : ''} (estimate)` : 'Roof size not on file',
          detail: 'Size from the building outline or the 2018 LiDAR facets; an estimate until measured on site.' },
        crm: { pts: s.parts.crm, max: W.crm, plain: crm.word, detail: crm.last ? `Last touch ${dlong(crm.last.slice(0, 10))}, ${crm.touches} on file (this device).` : 'Nothing logged on this device.' },
        neighborhood: { pts: s.parts.neighborhood, max: W.neighborhood,
          plain: nbr ? `${nbr} neighbor${nbr === 1 ? '' : 's'} within about a block re-roofed in the last ${M.config.neighborhood.days} days` : `No re-roofs within about a block in the last ${M.config.neighborhood.days} days`,
          detail: `Re-roof permits within ${M.config.neighborhood.radiusM} m, permits through ${src.permits_through}. Where a city has no complete permit list, neighbors' re-roofs are undercounted.` }
      };
      const b = C.block[gi] < 65535 ? C.block[gi] : null;
      return { gi, id: id(gi), score: s.score, conf: s.conf, confWord: s.confWord, parts: lines, roof: r, storms, eligibility: e, crm,
        address: f ? { addr: f.addr || '', city: f.city, zip: f.zip, year: f.year } : null,
        type: ptype(gi), block: b, refreshed: { scores: M.built, permits: src.permits_through, radar: src.radar_through },
        summary: `${s.score} of 100. ${lines.roofAge.plain}. ${lines.storm.plain}. Evidence ${s.confWord.toLowerCase()}.` + (e.ok ? '' : ` Do not contact: ${e.reason}.`),
        evidenceUrl: 'tour/audit/scores/index.html' };
    }));
  }
  function STM_facts(gi) { return window.STM && STM.facts ? STM.facts(gi).catch(() => null) : Promise.resolve(null); }
  function describe(gis) {
    if (!window.STM) return Promise.resolve(gis.map(gi => ({ gi })));
    return Promise.all(gis.map(gi => STM.meta(gi).then(m => ({ gi, addr: (m && m.addr) || '', city: m && m.city, zip: m && m.zip, year: m && m.year })).catch(() => ({ gi }))));
  }

  // ---------- plain-language request -> filters (Nimbus's fallback when it has no model) ----------
  function parse(text) {
    const t = String(text || '').toLowerCase(), F = {}, U = []; let limit = null, rep = null;
    const m = t.match(/\b(\d{1,4})\s+(homes|houses|leads|doors|roofs)/); if (m) { limit = +m[1]; U.push(limit + ' homes'); }
    (M ? M.cities : []).forEach(c => { if (c && new RegExp('\\b' + c.toLowerCase() + '\\b').test(t)) { (F.cities = F.cities || []).push(c); U.push('in ' + c); } });
    const z = t.match(/\b7[5-6]\d{3}\b/g); if (z) { F.zips = z; U.push('ZIP ' + z.join(', ')); }
    const y = t.match(/(\d{1,2})\+?\s*(?:years?|yr)/); if (y && /roof/.test(t)) { F.roofAgeMin = +y[1]; U.push('roof ' + y[1] + '+ years'); }
    else if (/\b(old|older|aging|aged)\b.*roof/.test(t)) { F.roofAgeMin = 15; U.push('roof 15+ years'); }
    if (/documented|on record|by permit|proven/.test(t)) { F.conf = ['high', 'medium']; U.push('roof age documented (High or Medium evidence)'); }
    if (/\bhail\b|storm/.test(t)) { F.hailMin = 1; U.push('1 in+ hail'); const h = t.match(/(\d(?:\.\d+)?)\s*(?:in|inch)/); if (h) { F.hailMin = +h[1]; U[U.length - 1] = h[1] + ' in+ hail'; } }
    if (/recent|last (few )?(weeks|months)|this (spring|summer|year)/.test(t) && F.hailMin) { const d = new Date(Date.now() - 180 * DAY).toISOString().slice(0, 10); F.stormFrom = d; U.push('since ' + dlong(d)); }
    if (/no (prior |previous )?contact|never contacted|not contacted|fresh|new leads?/.test(t)) { F.crm = ['none']; U.push('no prior contact'); }
    if (/big roof|large roof/.test(t)) { F.sqMin = 35; U.push('35+ squares'); }
    if (/single.?family/.test(t)) { F.types = [0]; U.push('single family'); }
    const r = t.match(/(?:for|to|assign(?:ments)? (?:for|to))\s+([a-z][a-z'-]+)\b/); if (r && !/^(the|my|me|today|tomorrow)$/.test(r[1])) {
      const hit = reps().find(x => x.name.toLowerCase().split(' ')[0] === r[1]); rep = hit ? hit.id : null; U.push('for ' + (hit ? hit.name : r[1] + ' (not on the rep list yet)')); }
    F.eligible = 'only';
    return { filters: F, limit: limit || 30, rep, understood: U };
  }

  // ---------- saved segments ----------
  const segs = () => get('segments', []) || [];
  function saveSegment(s) {
    const all = segs(), now = new Date().toISOString();
    const x = Object.assign({ id: 'sg' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), created: now, queue: true, alert: false, seen: [] }, all.find(a => a.id === s.id) || {}, s, { updated: now });
    x.name = String(x.name || 'My search').slice(0, 60); x.filters = Object.assign({}, x.filters); delete x.filters.limit;
    set('segments', all.filter(a => a.id !== x.id).concat([x])); return x;
  }
  function deleteSegment(sid) { set('segments', segs().filter(a => a.id !== sid)); }
  function segmentQueue(sid, n) {
    const s = segs().find(a => a.id === sid); if (!s) return Promise.resolve(null);
    return search(Object.assign({}, s.filters, { eligible: 'only', limit: 5000 })).then(r => {
      const pipe = RC.pipeline(), now = Date.now();
      const fresh = r.homes.filter(h => { const p = pipe[h.id], last = p && p.history && p.history[0] ? Date.parse(p.history[0].at) : 0; return !(last && now - last < 14 * DAY) && h.crm !== 'won' && h.crm !== 'deal'; });
      return { segment: s, total: r.total, homes: fresh.slice(0, n || 25) };
    });
  }
  function segmentAlerts() {
    return Promise.all(segs().filter(s => s.alert).map(s => search(Object.assign({}, s.filters, { eligible: 'only', limit: 5000 })).then(r => {
      const seen = new Set(s.seen || []), nu = r.homes.filter(h => !seen.has(h.gi));
      return { segment: s, newHomes: nu.length, homes: nu.slice(0, 25), markSeen: () => saveSegment({ id: s.id, seen: r.homes.map(h => h.gi).slice(0, 5000), lastLook: new Date().toISOString() }) };
    }))).then(a => a.filter(x => x.newHomes));
  }

  // ---------- reps + assignments ----------
  function settings() { const a = get('settings', {}) || {}; return a; }
  function reps() { return (settings()[RC.rooferKey()] || {}).reps || []; }
  function saveReps(list) { const a = settings(), k = RC.rooferKey(); a[k] = Object.assign({}, a[k], { reps: list }); set('settings', a); }
  function addRep(name) { name = String(name || '').trim().slice(0, 40); if (!name) return null; const l = reps(), ex = l.find(r => r.name.toLowerCase() === name.toLowerCase()); if (ex) return ex;
    const r = { id: 'rep' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name }; saveReps(l.concat([r])); return r; }
  function removeRep(rid) { saveReps(reps().filter(r => r.id !== rid)); const a = get('assign', {}); Object.keys(a).forEach(g => { if (a[g].rep === rid) delete a[g]; }); set('assign', a); }
  function assign(target, repId, opts) {
    const o = opts || {}, rep = reps().find(r => r.id === repId);
    if (!rep) return Promise.reject(new Error('That rep is not on the rep list (Settings, Reps).'));
    const list = Array.isArray(target) ? ready().then(() => target.map(Number))
      : target && target.segment ? segmentQueue(target.segment, o.limit || 50).then(q => q ? q.homes.map(h => h.gi) : [])
      : search(Object.assign({}, target && target.filters, { limit: o.limit || 50 })).then(r => r.homes.map(h => h.gi));
    return list.then(gis => {
      const a = get('assign', {}), skipped = [], now = new Date().toISOString(); let n = 0;
      gis.forEach(gi => { const e = eligibility(gi); if (!e.ok) { skipped.push({ gi, reason: e.reason }); return; }
        a[gi] = { rep: rep.id, at: now, segment: target && target.segment || null }; n++; });
      set('assign', a); return { assigned: n, skipped, rep };
    });
  }
  function unassign(gis) { const a = get('assign', {}); (gis || []).forEach(g => delete a[g]); set('assign', a); }
  function myList(repId) {
    return ready().then(() => { const a = get('assign', {}), pipe = RC.pipeline();
      return Object.keys(a).filter(g => a[g].rep === repId).map(Number).map(gi => row(gi, pipe, a)).sort((x, y) => y.score - x.score); });
  }

  // ---------- neighborhoods (blocks) ----------
  function neighborhoods(o) {
    o = o || {};
    return Promise.all([ready(), blocks()]).then(([, D]) => {
      if (!D) return [];
      const pipe = RC.pipeline(), W = D.weights;
      return D.blocks.filter(b => !o.city || b.city.toLowerCase() === String(o.city).toLowerCase()).map(b => {
        const eng = b.gis.reduce((t, gi) => t + (crmOf(gi, pipe).status === 'replied' || crmOf(gi, pipe).status === 'deal' ? 1 : 0), 0);
        const ineligible = b.gis.filter(gi => !eligibility(gi).ok).length;
        const pe = Math.round(W.engagement * Math.min(1, eng / 2) * 10) / 10;
        return Object.assign({}, b, { label: `${b.h} block of ${b.street}`, engagement: eng, ineligible, pts: b.pts.concat([pe]), total: Math.round((b.score + pe) * 10) / 10 });
      }).sort((x, y) => y.total - x.total).slice(0, o.limit || 50);
    });
  }

  const RCS = window.RCS = { ready, search, score: gi => score(+gi), explain: gi => explain(+gi), eligibility: gi => eligibility(+gi), parse, describe,
    saveSegment, segments: segs, deleteSegment, segmentQueue, segmentAlerts, reps, addRep, removeRep, assign, unassign, myList, neighborhoods,
    row: gi => row(+gi), meta: () => M, TYPES: ['Single family', 'Duplex', 'Townhome', 'Condo', 'Mobile home'] };
})();
