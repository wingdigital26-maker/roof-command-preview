/* rc-ask.js: the eight Ask questions Jack approved (10-10), answered from the roofer's REAL data on this device.
   Needs lib/rc-state.js and lib/brand.js (and lib/rc-queue.js for the Daily 50 reasons). Plain script, window.RCAsk.
     RCAsk.match(q)            -> intent key ('replies','draft','route','history','report','streets','oldroofs','why') or null
     RCAsk.answer(q, ui)       -> Promise<{ head, html, say, stops?, line? }>; ui = { map, maplibregl, root } (the Ask page)
     RCAsk.CHIPS               -> [[label, question]] for the suggestion chips
   Data: homes.bin (where every home is), meta/<region>/homes_meta.bin + streets.json + cities.json (address, year built),
   meta/hail/<region>/<storm>.bin (radar hail per home), meta/permits.json (county reroof permits), the pipeline on this
   device (RC.pipeline / RC.activity), the send log (GET /inbox on 127.0.0.1:4911 when it runs) and the voice draft service
   (POST roof-engine/draft in the cloud when signed in, else POST /draft on 127.0.0.1:4912, scripts/voice/server.py). Nothing here sends: drafts land in the thread composer, a
   human sends them. Where data does not exist yet the answer says so. */
(function () {
  'use strict';
  if (!window.RC || window.RCAsk) return;
  const esc = RC.esc, fmt = RC.fmt, DAY = 864e5;
  const SEND_URL = 'http://127.0.0.1:4911', VOICE_URL = 'http://127.0.0.1:4912';
  const ENGINE_URL = 'https://preview.invalid/functions/v1/roof-engine';
  const cloudCtx = () => { try {
    const s = JSON.parse(localStorage.getItem('rc.session') || 'null'), cl = (window.top && window.top.RC_CLOUD) || window.RC_CLOUD;
    return s && s.access_token && (!s.expires_at || s.expires_at > Date.now() / 1000 + 20) && cl && cl.companyId ? { jwt: s.access_token, company: cl.companyId } : null;
  } catch (e) { return null; } };
  const roofer = () => (window.ROOFERS || {})[RC.rooferKey()] || {};
  const OWNER = () => roofer().owner || 'the owner';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const FULLMON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dshort = iso => MON[+iso.slice(5, 7) - 1] + ' ' + (+iso.slice(8, 10)) + (iso.slice(0, 4) === String(new Date().getFullYear()) ? '' : ', ' + iso.slice(0, 4));
  // calendar days from the storm to today (local), the same count Storms prints ("135 days ago"); counting from this
  // moment instead said 136 in the evening while Storms said 135 (10-15)
  const daysAgo = iso => { const d = new Date(); return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12) - Date.parse(iso.slice(0, 10) + 'T12:00:00Z')) / DAY); };
  const ago = at => { const m = Math.round((Date.now() - Date.parse(at)) / 6e4); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  const when = at => new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  function miles(a, b) {
    const R = 3958.8, r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const retry = go => go().catch(() => new Promise(res => setTimeout(res, 300)).then(go)).catch(() => null);
  const fetchJ = u => retry(() => fetch(u).then(r => r.ok ? r.json() : null));
  const fetchB = u => retry(() => fetch(u).then(r => r.ok ? r.arrayBuffer() : null));
  const ABBR = { Avenue: 'Ave', Street: 'St', Drive: 'Dr', Lane: 'Ln', Boulevard: 'Blvd', Court: 'Ct', Parkway: 'Pkwy', Terrace: 'Ter', Road: 'Rd', Place: 'Pl', Circle: 'Cir' };
  function streetName(raw, city) {
    if (window.STM && STM.streetName) return STM.streetName(raw, city);
    let s = String(raw || '').trim(); if (city && s.endsWith(' ' + city)) s = s.slice(0, -city.length - 1);
    return s.replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (m, a, b) => a + b.toLowerCase()).replace(/\b(Nw|Ne|Sw|Se)\b/g, m => m.toUpperCase())
      .replace(/\b(Avenue|Street|Drive|Lane|Boulevard|Court|Parkway|Terrace|Road|Place|Circle)\b/g, m => ABBR[m]);
  }
  const normAddr = s => String(s || '').toLowerCase().replace(/[.,#]/g, ' ').replace(/\b(street)\b/g, 'st').replace(/\b(drive)\b/g, 'dr').replace(/\b(lane)\b/g, 'ln')
    .replace(/\b(avenue)\b/g, 'ave').replace(/\b(court)\b/g, 'ct').replace(/\b(road)\b/g, 'rd').replace(/\b(boulevard)\b/g, 'blvd').replace(/\b(circle)\b/g, 'cir')
    .replace(/\b(parkway)\b/g, 'pkwy').replace(/\b(place)\b/g, 'pl').replace(/\b(terrace)\b/g, 'ter').replace(/\s+/g, ' ').trim();

  // ---------- every home (lazy, once) ----------
  let HD = null;
  function homes() {
    if (HD) return HD;
    HD = RC.factsReady.then(() => {
      const c = RC.catalog, root = RC.dataRoot; if (!c || !root) throw new Error('The storm catalog did not load.');
      return Promise.all([fetchB(root + 'homes.bin'), fetchJ(root + 'meta/permits.json'),
        Promise.all(c.regions.map(r => Promise.all([fetchJ(`${root}meta/${r.id}/streets.json`), fetchJ(`${root}meta/${r.id}/cities.json`), fetchB(`${root}meta/${r.id}/homes_meta.bin`)])))])
        .then(([hb, permits, metas]) => {
          if (!hb) throw new Error('The home list (homes.bin) did not load.');
          const n = c.total;
          return { c, root, n, xy: new Float32Array(hb, 0, n * 2), type: new Uint8Array(hb, n * 8, n), permits: permits || {},
            permitRegions: new Set(Object.keys(permits || {}).map(k => k.split(':')[0])),
            regs: c.regions.map((r, k) => { const [streets, cities, mb] = metas[k] || []; return { r, streets: streets || [], cities: cities || [], M: mb && mb.byteLength === r.count * 16 ? new DataView(mb) : null }; }) };
        });
    });
    HD.catch(() => { HD = null; });
    return HD;
  }
  const HAIL = {};
  function hailFor(D, iso) {
    if (HAIL[iso]) return HAIL[iso];
    return HAIL[iso] = Promise.all(D.regs.map(g => fetchB(`${D.root}meta/hail/${g.r.id}/${iso}.bin`).then(b => b && b.byteLength === g.r.count ? new Uint8Array(b) : null)));
  }
  const isHome = (D, gi) => (D.type[gi] & 127) <= 4;
  function rec(D, gi) {
    let k = D.regs.length - 1; while (k > 0 && gi < D.regs[k].r.offset) k--;
    const g = D.regs[k], j = gi - g.r.offset, M = g.M, cnt = g.r.count;
    const city = M ? g.cities[M.getUint16(cnt * 14 + j * 2, true)] || '' : '';
    const no = M ? M.getUint16(cnt * 6 + j * 2, true) : 0, st = M ? streetName(g.streets[M.getUint16(cnt * 8 + j * 2, true)] || '', city) : '';
    const zip = M ? M.getUint32(cnt * 10 + j * 4, true) : 0, year = M ? M.getUint16(j * 2, true) || null : null;
    const permit = D.permits[g.r.id + ':' + j] || null;
    return { gi, id: 'm' + gi, region: g.r.id, j, lon: D.xy[gi * 2], lat: D.xy[gi * 2 + 1], no, street: st, city, zip: zip ? String(zip).padStart(5, '0') : '',
      addr: (no ? no + ' ' : '') + st, year, permit, permitsKnown: D.permitRegions.has(g.r.id) };
  }
  const roofYear = h => h.permit ? +String(h.permit).slice(0, 4) : h.year;
  // the storms in the catalog with 1 in+ hail on a home, newest first
  const storms = () => ((RC.catalog && RC.catalog.storms) || []).filter(s => (s.homes_1in || 0) > 0).map(s => s.date).sort().reverse();

  // ---------- the pipeline on this device ----------
  const outTouch = h => h.dir !== 'in' && (h.kind === 'text' || h.kind === 'email' || /^(Text|Email) (drafted|opened|sent)/.test(h.what || ''));
  const reached = id => RC.stage(id) !== 'new' || RC.history(id).some(outTouch) || RC.optedOut(id);
  const QUOTE = /\b(quote|estimate|bid|price|pricing|how much|cost|come (out|by|look)|take a look|look at (it|my|the)|inspect|inspection|schedule|set (it|something) up|available|when can you|yes|yeah|yep|sure|interested|sounds good|please do|send someone)\b/i;
  const NOTQ = /\b(not interested|no thanks|no thank you|stop|unsubscribe|already (have|got)|remove me|don'?t text|do not)\b/i;
  const wantsQuote = body => QUOTE.test(body || '') && !NOTQ.test(body || '');
  function sendLog() {   // the send service's log (sent + received), when it runs; null when it does not
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 2500);
    return Promise.reject(new Error('off')).then(r => r.ok ? r.json() : null).then(d => d && d.messages || null).catch(() => null);
  }
  function lastThread() { try { return JSON.parse(localStorage.getItem('rc.t.lastThread') || 'null'); } catch (e) { return null; } }

  // ---------- finding the home a question is about ----------
  const ADDR = /\b(\d{2,6})\s+([a-z0-9][a-z0-9 .'-]*?)(?=\s*(?:,|\?|$|\bin\b|\bplease\b|\btoday\b|\bon\b))/i;
  function pipeIds() { return Object.keys(RC.pipeline()); }
  function findHome(q) {
    const m = ADDR.exec(q);
    const ref = /\b(this|that) (house|home|homeowner|thread|one)\b|\bthem\b|\bhim\b|\bher\b/i.test(q);
    const nth = /(?:#|number |no\.? ?|stop )(\d{1,2})\b/i.exec(q);
    if (nth && RC.daily) { const p = RC.daily()[+nth[1] - 1]; if (p) return Promise.resolve({ id: p.id, addr: p.street || p.address, how: 'daily' }); }
    if (m && !nth) {
      const want = normAddr(m[1] + ' ' + m[2]);
      const ids = new Set(pipeIds().concat(RC.added().map(a => a.id)));
      for (const id of ids) { const r = RC.recall(id) || {}; if (r.addr && normAddr(r.addr).startsWith(want)) return Promise.resolve({ id, addr: r.addr, how: 'address' }); }
      // not on this device yet: look it up in the county address list
      return homes().then(D => {
        const no = +m[1], wantSt = normAddr(m[2]);
        for (let gi = 0; gi < D.n; gi++) {
          let k = D.regs.length - 1; while (k > 0 && gi < D.regs[k].r.offset) k--;
          const g = D.regs[k], j = gi - g.r.offset; if (!g.M || g.M.getUint16(g.r.count * 6 + j * 2, true) !== no) continue;
          const h = rec(D, gi); if (normAddr(h.street).startsWith(wantSt) || wantSt.startsWith(normAddr(h.street))) return { id: h.id, addr: h.addr, how: 'county', rec: h };
        }
        return { miss: m[1] + ' ' + m[2] };
      });
    }
    const lt = lastThread();
    if (lt && (ref || !m)) { const r = RC.recall(lt) || {}; return Promise.resolve({ id: lt, addr: r.addr || 'the home you last opened', how: 'thread' }); }
    return Promise.resolve(null);
  }
  function facts(id) {   // what this device and the county record know about one home
    const r = RC.recall(id) || {}, gi = /^m(\d+)$/.test(id) ? +id.slice(1) : null;
    const base = { id, gi, addr: r.addr || null, city: r.city || '', zip: r.zip || '', hail: r.hail != null && r.hail !== '' && isFinite(+r.hail) ? +r.hail : null,
      storm: /^\d{4}-\d{2}-\d{2}/.test(r.storm || '') ? r.storm.slice(0, 10) : null, phone: r.phone || null, year: r.year || null, permit: r.permit || null, sq: r.sq != null ? +r.sq : null, owner: r.owner || null };
    if (gi == null) return Promise.resolve(base);
    return homes().then(D => {
      const h = rec(D, gi); Object.assign(base, { addr: base.addr || h.addr, city: base.city || h.city, zip: base.zip || h.zip, year: base.year || h.year, permit: base.permit || h.permit, lon: h.lon, lat: h.lat });
      const cand = RC.queue && RC.queue.engine && RC.queue.engine._state && RC.queue.engine._state.byGi && RC.queue.engine._state.byGi.get(gi);
      if (cand) { if (base.hail == null) { base.hail = cand.hail; base.storm = cand.lead && cand.lead.iso; } if (base.sq == null && cand.sq && !cand.shared && cand.sq <= 100) base.sq = cand.sq; }
      if (base.hail != null) return base;
      // newest storm that put 1 in+ on this home
      const ss = storms().slice(0, 6);
      return Promise.all(ss.map(iso => hailFor(D, iso))).then(all => {
        let k = D.regs.length - 1; while (k > 0 && gi < D.regs[k].r.offset) k--; const j = gi - D.regs[k].r.offset;
        for (let i = 0; i < ss.length; i++) { const H = all[i][k]; if (H && H[j] >= 100) { base.hail = H[j] / 100; base.storm = ss[i]; break; } }
        return base;
      });
    }).catch(() => base);
  }
  const ownerOf = f => f.owner ? Promise.resolve(f.owner) : (f.gi != null && RC.owner ? RC.owner(f.gi).then(o => o && o.name || null).catch(() => null) : Promise.resolve(null));
  const factLine = f => [f.hail != null && f.storm ? `${f.hail.toFixed(2)} in hail on ${dshort(f.storm)}` : 'No 1 in+ hail on file',
    f.permit ? `reroof permit ${String(f.permit).slice(0, 4)}` : f.year ? RC.roofEvidence(f.city, f.year, null).text.replace(/^./, c => c.toLowerCase()) : 'year built not on file', f.sq ? `about ${Math.round(f.sq)} squares (est.)` : null].filter(Boolean).join(' · ');
  function convo(id) {   // oldest first
    return RC.history(id).slice().reverse().filter(h => h.body || h.kind === 'text' || h.kind === 'email' || h.dir === 'in')
      .map(h => ({ at: h.at, dir: h.dir === 'in' ? 'in' : 'out', ch: h.kind === 'email' ? 'email' : 'text', body: h.body || h.what || '', subject: h.subject || null }));
  }

  // ---------- small render helpers ----------
  const card = (eyebrow, body, cls) => `<section class="ak-card${cls ? ' ' + cls : ''}">${eyebrow ? `<div class="ak-eye">${esc(eyebrow)}</div>` : ''}${body}</section>`;
  const stat = (n, l) => `<div class="ak-stat"><b>${n}</b><span>${esc(l)}</span></div>`;
  const empty = (title, line) => card('', `<div class="ak-empty"><b>${esc(title)}</b><p>${line}</p></div>`);
  const btn = (label, attrs, pri) => `<button type="button" class="ak-btn${pri ? ' pri' : ''}" ${attrs}>${esc(label)}</button>`;
  const bubbles = list => list.map(m => `<div class="ak-msg ${m.dir}"><span class="ak-mb">${m.subject ? `<i>${esc(m.subject)}</i><br>` : ''}${esc(m.body)}</span><span class="ak-mm">${m.dir === 'in' ? 'Homeowner' : 'You'} · ${m.ch} · ${esc(when(m.at))}</span></div>`).join('');

  // ---------- 1. who replied today and wants a quote ----------
  function replies() {
    const today = new Date().toDateString();
    const local = RC.activity().filter(a => a.dir === 'in').map(a => ({ id: a.id, at: a.at, body: a.body || '', ch: a.ch, src: 'device' }));
    return sendLog().then(log => {
      const remote = (log || []).filter(m => m.direction === 'in').map(m => ({ id: /^m\d+$/.test(m.home_key || '') ? m.home_key : null, at: m.ts, body: m.body || '', ch: m.channel || 'text', from: m.from_addr, name: m.name, src: 'send log' }));
      const all = local.concat(remote).filter(r => r.at);
      const todays = all.filter(r => new Date(r.at).toDateString() === today);
      const quote = todays.filter(r => wantsQuote(r.body));
      const head = quote.length ? `${quote.length} ${quote.length === 1 ? 'homeowner' : 'homeowners'} replied today asking for a quote.` : todays.length ? `${todays.length} ${todays.length === 1 ? 'reply' : 'replies'} today, none asking for a quote yet.` : 'No replies yet today.';
      const srcLine = `Checked the replies logged on this device${log ? ' and the send log' : ' (the send service on this computer is not running, so its log was not checked)'}.`;
      if (!quote.length) {
        const older = all.filter(r => new Date(r.at).toDateString() !== today).sort((a, b) => a.at < b.at ? 1 : -1);
        return { head, say: head, html: empty(head, esc(srcLine) + (older.length ? ` The last reply came ${esc(ago(older[0].at))}.` : ' Nothing has come back from a homeowner yet. A reply shows here as soon as it is logged in the CRM or arrives on the texting line.')) };
      }
      return Promise.all(quote.map(r => r.id ? facts(r.id).then(f => ownerOf(f).then(o => Object.assign(r, { f, owner: o }))) : Promise.resolve(Object.assign(r, { f: null, owner: r.name })))).then(rows => {
        const html = rows.map(r => {
          const f = r.f || {}, sent = r.id && RC.stage(r.id) === 'handoff';
          return card(`Replied ${ago(r.at)} by ${r.ch}`, `<div class="ak-row"><div><b class="ak-addr">${esc(f.addr || r.from || 'Unknown home')}</b><small>${esc(r.owner || RC.OWNER_NONE || 'Owner not loaded')}${f.phone || r.from ? ' · ' + esc(f.phone || r.from) : ''}</small></div></div>` +
            `<p class="ak-quote">"${esc(r.body)}"</p><p class="ak-sub">${esc(factLine(f))}</p>` +
            `<div class="ak-acts">${r.id ? btn(sent ? 'Sent to ' + OWNER() : 'Send to ' + OWNER(), `data-ak="handoff" data-id="${esc(r.id)}"${sent ? ' data-done="1"' : ''}`, !sent) + btn('Open thread', `data-ak="thread" data-id="${esc(r.id)}"`) : '<span class="ak-sub">This reply is not tied to a home on this device yet.</span>'}</div><div class="ak-hand" data-for="${esc(r.id || '')}"></div>`);
        }).join('');
        return { head, say: head, html: html + `<p class="ak-src">${esc(srcLine)}</p>` };
      });
    });
  }
  function handoff(id, slot) {
    return facts(id).then(f => ownerOf(f).then(owner => {
      const conv = convo(id);
      if (RC.stage(id) !== 'handoff') RC.setStage(id, 'handoff', 'Sent to ' + OWNER() + ': wants a quote');
      const lines = [`${f.addr}${f.city ? ', ' + f.city : ''}`, `Owner: ${owner || 'not loaded'}`, `Phone: ${f.phone || 'to get'}`, `House: ${factLine(f)}`, 'Conversation:']
        .concat(conv.map(m => `  ${m.dir === 'in' ? 'Homeowner' : 'Us'} (${m.ch}, ${when(m.at)}): ${m.body}`));
      const text = lines.join('\n');
      slot.innerHTML = `<div class="ak-eye">Handoff for ${esc(OWNER())}</div><dl class="ak-dl"><dt>Name</dt><dd>${esc(owner || 'Owner not loaded')}</dd><dt>Phone</dt><dd>${esc(f.phone || 'Get phone')}</dd><dt>House</dt><dd>${esc(factLine(f))}</dd></dl>` +
        `<div class="ak-conv">${bubbles(conv) || '<p class="ak-sub">No messages on record.</p>'}</div><div class="ak-acts">${btn('Copy summary', 'data-ak="copy"')}</div><textarea class="ak-copy" hidden>${esc(text)}</textarea>`;
      return text;
    }));
  }

  // ---------- 2. draft a reply in the roofer's voice ----------
  function draftReply(q) {
    return findHome(q).then(t => {
      if (!t) return { head: 'Which homeowner?', say: 'Open a thread in the CRM, or give me the address.', html: empty('Which homeowner?', 'Open a thread in the CRM first, or ask with the address, for example "Draft a reply to 4512 Pinecrest Dr".') };
      if (t.miss) return { head: `I could not find ${t.miss}.`, say: `No home at ${t.miss} on file.`, html: empty(`No home at ${t.miss}`, 'That address is not in the county list for your area. Check the number and street.') };
      return facts(t.id).then(f => {
        const conv = convo(t.id), lastIn = conv.filter(m => m.dir === 'in').pop(), ch = lastIn ? lastIn.ch : 'text';
        const home = { home_key: t.id, street: f.addr, city: f.city, zip: f.zip, storm_date: f.storm, hail_in: f.hail, year_built: f.year, roof_permit_year: f.permit ? String(f.permit).slice(0, 4) : null, squares: f.sq };
        const ctl = new AbortController(); setTimeout(() => ctl.abort(), 200000);
        const pending = card('Drafting', `<div class="ak-row"><div><b class="ak-addr">${esc(f.addr || t.addr)}</b><small>${esc(factLine(f))}</small></div></div><p class="ak-sub ak-wait">Writing a ${ch} in ${esc(roofer().name || 'your')} voice. This takes up to a minute.</p>`, 'ak-draft');
        const payload = { roofer: RC.rooferKey(), channel: ch, home, conversation: conv.map(m => ({ dir: m.dir, ch: m.ch, body: m.body, at: m.at })) };
        const local = () => Promise.reject(new Error('off'))
          .then(r => r.json().then(d => ({ ok: r.ok, d })));
        // cloud first (roof-engine/draft, Haiku + the voice file in crm_kv, works with the PC off); the local :4912 server
        // when signed out, or when the cloud has no AI key yet (503 fallback) or does not answer
        const cloud = () => { const c = cloudCtx(); if (!c) return Promise.reject(new Error('no cloud session'));
          return fetch(`${ENGINE_URL}/draft`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.jwt }, signal: ctl.signal,
            body: JSON.stringify(Object.assign({ company_id: c.company }, payload)) })
            .then(r => r.json().then(d => { if (!r.ok && (d && d.fallback || r.status >= 500)) throw new Error('cloud fallback'); return { ok: r.ok, d }; })); };
        const done = cloud().catch(() => local())
          .then(({ ok, d }) => {
            if (!ok || !d.body) throw new Error(d && d.error || 'no draft came back');
            const all = (() => { try { return JSON.parse(localStorage.getItem('rc.t.aidraft') || '{}'); } catch (e) { return {}; } })();
            all[t.id] = { body: d.body, subject: d.subject || null, ch: d.channel || ch, at: new Date().toISOString(), status: d.status, flags: d.flags || [] };
            try { localStorage.setItem('rc.t.aidraft', JSON.stringify(all)); } catch (e) { }
            return card(`Draft ${d.channel || ch}, not sent`, `<div class="ak-row"><div><b class="ak-addr">${esc(f.addr || t.addr)}</b><small>${esc(factLine(f))}</small></div></div>` +
              (lastIn ? `<p class="ak-quote">They said: "${esc(lastIn.body)}"</p>` : '<p class="ak-sub">No reply from them on record, so this is a first note.</p>') +
              (d.subject ? `<p class="ak-subj">${esc(d.subject)}</p>` : '') + `<div class="ak-draftbody">${esc(d.body)}</div>` +
              (d.flags && d.flags.length ? `<p class="ak-sub ak-warn">Check before sending: ${esc(d.flags.join('; '))}</p>` : '') +
              `<div class="ak-acts">${btn('Open in thread', `data-ak="thread" data-id="${esc(t.id)}"`, true)}</div><p class="ak-src">Written from ${esc(roofer().name || 'the roofer')}'s voice file and this home's record. It waits in the thread's composer; nothing sends until you tap send.</p>`, 'ak-draft');
          }).catch(e => card('Draft not written', `<div class="ak-empty"><b>The draft service did not answer</b><p>${esc(/abort|fetch|network/i.test(String(e && e.message || e)) ? 'It is not running on this computer. Start it with: python scripts/voice/server.py' : String(e.message || e))}</p></div>`));
        return { head: `Drafting a reply to ${f.addr || t.addr}.`, say: 'Writing it in your voice.', html: pending, later: done };
      });
    });
  }

  // ---------- 3. a knock route ----------
  function knockRoute(q) {
    return homes().then(D => {
      const cityList = [...new Set([].concat(...D.regs.map(g => g.cities)))].filter(Boolean).sort((a, b) => b.length - a.length);
      const city = cityList.find(c => new RegExp('\\b' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(q)) || roofer().city || 'Plano';
      const hrs = +(/(\d(?:\.\d)?)\s*(?:-|\s)?\s*(?:hour|hr)/i.exec(q) || [])[1] || 3, budget = hrs * 60;
      const day = /today/i.test(q) ? new Date() : new Date(Date.now() + DAY), dayTxt = day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      const ss = storms();
      // newest storm that put 1 in+ hail on homes in this city
      const tryStorm = i => i >= ss.length ? Promise.resolve(null) : hailFor(D, ss[i]).then(H => {
        const hit = [];
        D.regs.forEach((g, k) => { const A = H[k]; if (!A || !g.M) return; const ci = g.cities.indexOf(city); if (ci < 0) return;
          for (let j = 0; j < g.r.count; j++) { if (A[j] < 100) continue; if (g.M.getUint16(g.r.count * 14 + j * 2, true) !== ci) continue; const gi = g.r.offset + j; if (!isHome(D, gi)) continue; hit.push([gi, A[j] / 100]); } });
        return hit.length ? { iso: ss[i], hit } : tryStorm(i + 1);
      });
      return tryStorm(0).then(s => {
        if (!s) return { head: `No 1 in+ hail on file for ${city}.`, say: `No hail in ${city} on file.`, html: empty(`No hail on file in ${city}`, `None of the ${ss.length} storms in your data put 1 in or larger hail on a home in ${esc(city)}.`) };
        // one door per address (a condo or apartment building lists many homes under one number)
        const seenA = new Set();
        const pool = s.hit.map(([gi, h]) => Object.assign(rec(D, gi), { hail: h })).filter(h => { if (!h.street || !h.no || reached(h.id) || seenA.has(h.addr)) return false; seenA.add(h.addr); return true; });
        const by = new Map(); pool.forEach(h => { const k = h.street; const e = by.get(k) || { name: k, homes: [], max: 0 }; e.homes.push(h); e.max = Math.max(e.max, h.hail); by.set(k, e); });
        const streets = [...by.values()].sort((a, b) => b.max - a.max || b.homes.length - a.homes.length);
        const DOOR = 5, take = []; let si = 0;
        while (take.length < 80 && si < streets.length) { take.push(...streets[si].homes); si++; }
        // nearest neighbour from the hardest-hit home
        take.sort((a, b) => b.hail - a.hail);
        const route = [], left = take.slice(); let cur = left.shift(), t = DOOR; route.push(Object.assign(cur, { leg: 0, eta: 0 }));
        while (left.length) {
          let bi = 0, bd = Infinity; left.forEach((h, i) => { const d = miles([cur.lon, cur.lat], [h.lon, h.lat]); if (d < bd) { bd = d; bi = i; } });
          const move = bd < 0.25 ? bd / 3 * 60 : bd / 25 * 60 + 2;   // walk under a quarter mile (3 mph), else drive (25 mph + 2 min to park)
          if (t + move + DOOR > budget) break;
          const nx = left.splice(bi, 1)[0]; nx.leg = move; nx.eta = t + move; t += move + DOOR; route.push(nx); cur = nx;
        }
        const usedSt = [...new Set(route.map(h => h.street))];
        const old = daysAgo(s.iso);
        const list = route.map((h, i) => `<li><span class="ak-n">${i + 1}</span><div><b>${esc(h.addr)}</b><small>${h.hail.toFixed(2)} in · ${roofYear(h) ? 'roof ' + roofYear(h) : 'year not on file'} · arrive ~${Math.round(h.eta)} min</small></div></li>`).join('');
        const head = `${route.length} doors in ${city} for ${dayTxt}, about ${Math.round(t)} minutes.`;
        return { head, say: `${route.length} doors on ${usedSt.length} streets in ${city}.`,
          stops: route.map((h, i) => ({ lon: h.lon, lat: h.lat, label: String(i + 1), title: h.addr })), line: true,
          html: card(`Knock route · ${dayTxt}`, `<div class="ak-stats">${stat(route.length, 'doors')}${stat(Math.round(t) + ' min', 'with driving')}${stat(DOOR + ' min', 'per door')}</div>` +
            `<p class="ak-sub">Hardest-hit streets first from the ${esc(dshort(s.iso))} storm${old > 30 ? ` (${old} days ago, the newest with hail in ${esc(city)})` : ''}: ${esc(usedSt.slice(0, 4).join(', '))}${usedSt.length > 4 ? ' and ' + (usedSt.length - 4) + ' more' : ''}. Homes not contacted yet, in driving order.</p><ol class="ak-list">${list}</ol>`) +
            `<p class="ak-src">Order is nearest next door from the worst-hit home. Time = ${DOOR} min a door, walking under a quarter mile, driving beyond. ${fmt(pool.length)} uncontacted homes in ${esc(city)} took 1 in or more on ${esc(dshort(s.iso))}.</p>` };
      });
    });
  }

  // ---------- 4. message history for one home ----------
  function history(q) {
    return findHome(q).then(t => {
      if (!t) return { head: 'Which home?', say: 'Give me the address.', html: empty('Which home?', 'Ask with the address, for example "What did we say to 4512 Pinecrest Dr?"') };
      if (t.miss) return { head: `I could not find ${t.miss}.`, say: `No home at ${t.miss}.`, html: empty(`No home at ${t.miss}`, 'That address is not in the county list for your area.') };
      const conv = convo(t.id), stage = RC.stageName(RC.stage(t.id));
      return Promise.all([facts(t.id), sendLog()]).then(([f, log]) => {
        const extra = (log || []).filter(m => m.home_key === t.id).map(m => ({ at: m.ts, dir: m.direction === 'in' ? 'in' : 'out', ch: m.channel || 'text', body: m.body || '', subject: m.subject || null }));
        const all = conv.concat(extra).sort((a, b) => a.at < b.at ? -1 : 1);
        const head = all.length ? `${all.length} ${all.length === 1 ? 'message' : 'messages'} with ${f.addr || t.addr}.` : `Nothing sent to ${f.addr || t.addr} yet.`;
        return { head, say: head, stops: f.lon != null ? [{ lon: f.lon, lat: f.lat, label: '1', title: f.addr }] : null,
          html: card(`${stage}${RC.optedOut(t.id) ? ' · opted out' : ''}`, `<div class="ak-row"><div><b class="ak-addr">${esc(f.addr || t.addr)}</b><small>${esc(factLine(f))}</small></div>${btn('Open thread', `data-ak="thread" data-id="${esc(t.id)}"`)}</div>` +
            `<div class="ak-conv">${all.length ? bubbles(all) : '<p class="ak-sub">No text or email to this home is on record on this device' + (log ? ' or in the send log.' : '. The send service is not running, so its log was not checked.') + '</p>'}</div>`) };
      });
    });
  }

  // ---------- 5. this month's leads for the owner ----------
  function report() {
    const now = new Date(), m0 = new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), mon = FULLMON[now.getMonth()];
    const pipe = RC.pipeline(), c = { contacted: 0, replied: 0, quote: 0, handoff: 0, won: 0, booked: 0 };
    Object.keys(pipe).forEach(id => {
      const H = (pipe[id].history || []).filter(h => h.at >= m0);
      if (H.some(outTouch)) c.contacted++;
      const ins = H.filter(h => h.dir === 'in'); if (ins.length) c.replied++; if (ins.some(h => wantsQuote(h.body))) c.quote++;
      if (H.some(h => h.kind === 'stage' && /^Sent to /.test(h.what || ''))) c.handoff++;
      if (H.some(h => /^Inspection booked/.test(h.what || ''))) c.booked++;
      if (H.some(h => h.kind === 'stage' && /Won/.test(h.what || '')) || (pipe[id].stage === 'won' && H.length)) c.won++;
    });
    const o = OWNER();
    const pl = (n, a, b) => n + ' ' + (n === 1 ? a : b);
    const line = c.contacted ? `In ${mon} we contacted ${pl(c.contacted, 'homeowner', 'homeowners')} for ${roofer().name || 'you'}, ${c.replied} replied, ${c.quote} asked for a quote, ${c.handoff} went to ${o}${c.booked ? ', ' + c.booked + ' booked an inspection' : ''} and ${c.won} ${c.won === 1 ? 'was' : 'were'} won.`
      : `No homeowners contacted yet in ${mon}, so there are no leads for ${o} to count.`;
    const head = c.handoff ? `${pl(c.handoff, 'lead', 'leads')} sent to ${o} in ${mon}.` : `No leads sent to ${o} yet in ${mon}.`;
    return Promise.resolve({ head, say: head, html: card(`${mon} so far`, `<div class="ak-stats ak-5">${stat(c.contacted, 'contacted')}${stat(c.replied, 'replied')}${stat(c.quote, 'wants quote')}${stat(c.handoff, 'sent to ' + o)}${stat(c.won, 'won')}</div>` +
      `<div class="ak-eye" style="margin-top:14px">Ready to paste</div><div class="ak-draftbody">${esc(line)}</div><div class="ak-acts">${btn('Copy sentence', 'data-ak="copy"')}</div><textarea class="ak-copy" hidden>${esc(line)}</textarea>`) +
      `<p class="ak-src">Counted from the pipeline on this device since ${esc(MON[now.getMonth()])} 1: a home counts once per stage.</p>` });
  }

  // ---------- 6. biggest-hail streets not contacted ----------
  function bigStreets() {
    return homes().then(D => {
      const ss = storms(); if (!ss.length) return { head: 'No storms on file.', say: 'No storms on file.', html: empty('No storms on file', 'The storm list has no 1 in+ storm yet.') };
      const recent = ss.filter(iso => daysAgo(iso) <= 30), use = recent.length ? recent : [ss[0]];
      return Promise.all(use.map(iso => hailFor(D, iso))).then(all => {
        const by = new Map(); let missing = 0;
        use.forEach((iso, si) => D.regs.forEach((g, k) => { const A = all[si][k]; if (!A) { if (((RC.catalog.storms.find(s => s.date === iso) || {}).regions || {})[g.r.id]) missing++; return; } if (!g.M) return;
          for (let j = 0; j < g.r.count; j++) { if (A[j] < 100) continue; const gi = g.r.offset + j; if (!isHome(D, gi) || reached('m' + gi)) continue;
            const h = rec(D, gi); if (!h.street) continue; const key = h.street + '|' + h.city; const e = by.get(key) || { name: h.street, city: h.city, n: 0, max: 0, lon: 0, lat: 0, iso };
            e.n++; e.max = Math.max(e.max, A[j] / 100); e.lon += h.lon; e.lat += h.lat; by.set(key, e); } }));
        const rows = [...by.values()].filter(e => e.n >= 2).sort((a, b) => b.max - a.max || b.n - a.n).slice(0, 8);
        rows.forEach(e => { e.lon /= e.n; e.lat /= e.n; });
        const note = recent.length ? `Storms in the last 30 days: ${recent.map(dshort).join(', ')}.` : `No storm in the last 30 days. The newest storm with 1 in+ hail was ${dshort(ss[0])}, ${daysAgo(ss[0])} days ago, so these are from it.`;
        if (!rows.length) return { head: 'Every hit street has been contacted.', say: note, html: empty('Nothing left to contact', esc(note) + ' Every street with two or more hit homes has been reached.') };
        const head = recent.length ? `${rows[0].name} took the biggest hail in the last 30 days.` : `Nothing new in 30 days. On ${dshort(ss[0])}, ${rows[0].name} took the biggest hail.`;
        const list = rows.map((e, i) => `<li><span class="ak-n">${i + 1}</span><div><b>${esc(e.name)}</b><small>${esc(e.city)}</small></div><div class="ak-r"><b>${e.max.toFixed(2)} in</b><small>${e.n} homes</small></div></li>`).join('');
        return { head, say: note, stops: rows.map((e, i) => ({ lon: e.lon, lat: e.lat, label: String(i + 1), title: e.name })),
          html: card(recent.length ? 'Last 30 days, not contacted' : `${dshort(ss[0])} · not contacted`, `<p class="ak-sub${recent.length ? '' : ' ak-warn'}">${esc(note)}</p><ol class="ak-list">${list}</ol>`) +
            `<p class="ak-src">Radar hail per home (NOAA MRMS), 1 in or more. Homes already texted, emailed or moved on the pipeline are left out. Streets with at least two such homes, biggest hail first.${missing ? ' Some county hail files are missing for this storm.' : ''}</p>` };
      });
    });
  }

  // ---------- 7. old roofs near the owner's past jobs ----------
  function oldRoofs() {
    return homes().then(D => {
      const pipe = RC.pipeline(), nowY = new Date().getFullYear();
      let jobs = Object.keys(pipe).filter(id => pipe[id].stage === 'won' && /^m\d+$/.test(id)).map(id => rec(D, +id.slice(1)));
      let basis = 'won';
      if (!jobs.length) {   // no past-jobs list: the newest county reroof permits stand in, and the answer says so
        basis = 'permits';
        jobs = Object.entries(D.permits).sort((a, b) => a[1] < b[1] ? 1 : -1).slice(0, 10).map(([k, d]) => { const [rid, j] = k.split(':'); const g = D.regs.find(x => x.r.id === rid); return g ? Object.assign(rec(D, g.r.offset + +j), { pdate: d }) : null; }).filter(Boolean);
      }
      if (!jobs.length) return { head: `No past jobs for ${OWNER()} on file.`, say: 'I need his past job addresses.', html: empty(`No past jobs for ${OWNER()} on file`, `Send a list of ${esc(OWNER())}'s last 20 to 50 job addresses (a spreadsheet is fine) and this answer will use them.`) };
      const R = 0.5, dLat = R / 69, out = new Map();
      jobs.forEach((jb, ji) => {
        const dLon = R / (69 * Math.cos(jb.lat * Math.PI / 180));
        for (let gi = 0; gi < D.n; gi++) {
          const la = D.xy[gi * 2 + 1]; if (la < jb.lat - dLat || la > jb.lat + dLat) continue; const lo = D.xy[gi * 2]; if (lo < jb.lon - dLon || lo > jb.lon + dLon) continue;
          if (gi === jb.gi || !isHome(D, gi) || out.has(gi)) continue;
          const d = miles([jb.lon, jb.lat], [lo, la]); if (d > R) continue;
          const h = rec(D, gi), y = roofYear(h); if (!y || nowY - y < 20) continue;
          out.set(gi, Object.assign(h, { age: nowY - y, near: ji, d }));
        }
      });
      const list = [...out.values()].sort((a, b) => b.age - a.age || a.d - b.d);
      const isPermits = basis === 'permits';
      const head = isPermits ? `No past-jobs list for ${OWNER()} yet. ${fmt(list.length)} roofs 20+ years old sit near the newest reroof permits instead.` : `${fmt(list.length)} roofs 20+ years old within half a mile of ${OWNER()}'s ${jobs.length} won jobs.`;
      const top = list.slice(0, 12).map((h, i) => `<li><span class="ak-n">${i + 1}</span><div><b>${esc(h.addr)}</b><small>${esc(h.city)} · ${h.d.toFixed(2)} mi from ${esc(jobs[h.near].addr)}</small></div><div class="ak-r"><b>${h.age} yrs</b><small>${h.permit ? 'permit ' + String(h.permit).slice(0, 4) : 'built ' + h.year}</small></div></li>`).join('');
      return { head, say: isPermits ? `I need ${OWNER()}'s past job addresses to do this right.` : head,
        stops: jobs.map((j, i) => ({ lon: j.lon, lat: j.lat, label: isPermits ? 'P' : 'J', title: j.addr })).concat(list.slice(0, 12).map((h, i) => ({ lon: h.lon, lat: h.lat, label: String(i + 1), title: h.addr, small: true }))),
        html: (isPermits ? card('What is needed', `<p class="ak-sub ak-warn">No list of ${esc(OWNER())}'s past jobs is on file, and no home is marked Won on this device. The county permits below are reroofs by any roofer, not necessarily ${esc(OWNER())}'s. Send his last 20 to 50 job addresses (a spreadsheet is fine) and this list will center on his own jobs.</p>`) : '') +
          card(isPermits ? `Near the ${jobs.length} newest reroof permits` : `Near ${jobs.length} won jobs`, `<div class="ak-stats">${stat(fmt(list.length), 'roofs 20+ yrs')}${stat(jobs.length, isPermits ? 'permits used' : 'jobs')}${stat('0.5 mi', 'radius')}</div><ol class="ak-list">${top}</ol>`) +
          `<p class="ak-src">Roof age = years since the last county reroof permit (records from ${esc((Object.values(D.permits).sort()[0] || '').slice(0, 4) || 'n/a')}), else since the house was built. Oldest first.</p>` };
    });
  }

  // ---------- 8. why is this house on today's list ----------
  function why(q) {
    if (!RC.queueReady) return Promise.resolve({ head: 'The Daily 50 engine is not loaded on this page.', say: 'The list engine is not loaded.', html: empty('No list engine', 'This page did not load lib/rc-queue.js.') });
    return RC.queueReady.then(ok => {
      if (!ok) return { head: 'Today\'s list could not be built.', say: 'The list did not build.', html: empty('No list today', esc((RC.queueStats() || {}).err || 'The storm data did not load.')) };
      const list = RC.daily();
      return findHome(q).then(t => {
        let i = t && !t.miss ? list.findIndex(p => p.id === t.id) : -1;
        if (!t && list.length) i = 0;
        if (i < 0) { const a = t && (t.addr || t.miss) || 'That home'; return { head: `${a} is not on today's list.`, say: 'It is not on today\'s list.', html: empty(`${a} is not on today's Daily 50`, `Today's ${list.length} homes are the ones most likely to say yes across the whole service area (roof age, hail, neighbours reroofing, roof size, owner lives there), spread across streets. Ask "why is #3 on today's list" or open one from Today.`) }; }
        const p = list[i], W = RC.queueWeights || {}, st = RC.queueStats() || {}, sp = st.spread || {};
        const NAMES = { hail: 'Hail history', roofAge: 'Roof age', neighbours: 'Neighbors re-roofing', size: 'Roof size', owner: 'Owner lives here', recency: 'Storm recency', storms: 'Repeat storms', distance: 'Distance from base' };
        const bars = p.parts ? Object.keys(W).map(k => { const v = p.parts[k] || 0, max = W[k].pts; return `<div class="ak-bar"><span>${NAMES[k] || k}</span><i><em style="width:${Math.round(v / max * 100)}%"></em></i><b>${v.toFixed(1)} / ${max}</b></div>`; }).join('') : '';
        const reasons = (p.why || []).map(w => `<li>${esc(w)}</li>`).join('');
        const spread = p.reason === 'cadence' ? `It is a follow-up: day ${p.step} of the touch cadence (one text, then email on day 3, 7, 30) is due, so it goes ahead of new homes.`
          : `New homes are picked best score first, then spread out: at most ${sp.streetCap || 3} per street and ${sp.neighbourhoodCap || 4} per neighbourhood, each city held to its share of the area's homes${p.city && sp.cityCap && sp.cityCap[p.city] ? ` (${p.city}: at most ${sp.cityCap[p.city]} of the 50)` : ''}, one home per ~2 km cell per round, so the list covers the whole service area instead of one pocket.`;
        const head = `#${i + 1} ${p.street || p.address}: score ${p.score != null ? p.score.toFixed(1) : 'n/a'} of 100.`;
        return { head, say: (p.why || [])[0] || head, stops: p.lon != null ? [{ lon: p.lon, lat: p.lat, label: String(i + 1), title: p.address }] : null,
          html: card(`Daily 50 · #${i + 1} of ${list.length}`, `<div class="ak-row"><div><b class="ak-addr">${esc(p.address || p.street)}</b><small>${esc(p.reason === 'cadence' ? 'Follow-up' : 'New home')} · score ${p.score != null ? p.score.toFixed(1) : 'n/a'} / 100</small></div>${btn('Open thread', `data-ak="thread" data-id="${esc(p.id)}"`)}</div>` +
            `<ul class="ak-why">${reasons}</ul>${bars ? `<div class="ak-eye" style="margin-top:12px">Where the points come from</div><div class="ak-bars">${bars}</div>` : ''}<div class="ak-eye" style="margin-top:12px">Spread rule</div><p class="ak-sub">${esc(spread)}</p>`) +
            `<p class="ak-src">Scored every day over every house in the service area, storm or not. Roof age from county reroof permits (else year built), hail from NOAA radar at the address (last 24 months), neighbours from county reroof permits within 1/4 mile (last 12 months), roof size from LiDAR or the building outline, owner-occupied from the county homestead flag (no names). Homes touched in the last 30 days or in an active deal are left off. Every reason above is true for this home.</p>` };
      });
    });
  }

  // ---------- 9. hail at one address (10-19): every storm on file at the house (lib/rc-hail.js), the Storm report ----------
  function hailAt(q) {
    if (!window.RCH) return { head: 'The hail history is not loaded here.', say: 'The hail history is not loaded here.', html: empty('Not loaded', 'Open the home record: its Hail at this address panel has every storm.') };
    return findHome(q).then(f => {
      if (!f || f.miss || !/^m\d+$/.test(f.id || '')) { const head = f && f.miss ? `I could not find ${f.miss} in the county address list.` : 'Which address? Try "hail at 1524 Yorkshire".';
        return { head, say: head, html: empty(head, 'Type the house number and street, for example: how much hail at 1524 Yorkshire?') }; }
      const gi = +f.id.slice(1);
      return RCH.history(gi).then(h => {
        const big = h.filter(x => x.inches >= 1).sort((a, b) => b.inches - a.inches || (a.iso < b.iso ? 1 : -1))[0], hits = h.filter(x => x.inches >= 1).length;
        const head = big ? `${f.addr}: ${big.inches.toFixed(2)} in on ${big.date}${hits > 1 ? `, and 1 in+ on ${hits - 1} more storm${hits > 2 ? 's' : ''}` : ''}.` : `${f.addr}: no 1 in+ hail in the ${h.length} storms on file.`;
        const c = big ? RCH.claimLine(big.iso) : null;
        const rows = h.filter(x => x.inches >= 0.5).map((x, i) => `<li><span class="ak-n">${i + 1}</span><div><b>${esc(x.date)}</b><small>${x.inches >= 1 ? '1 in or more' : 'under 1 in'}</small></div><div class="ak-r"><b>${x.inches.toFixed(2)} in</b></div></li>`).join('');
        return { head, say: head, html: card(`Hail at this address · ${h.length} storms on file`, `<div class="ak-row"><div><b class="ak-addr">${esc(f.addr)}</b><small>${c ? 'Biggest storm ' + esc(c.ago) + ', one year from it ' + esc(c.oneYear) : 'No 1 in+ storm here'}</small></div></div>` +
          (rows ? `<ol class="ak-list">${rows}</ol>` : `<p class="ak-sub">No storm on file put half an inch or more on this house.</p>`) +
          `<div class="ak-acts">${btn('Storm report', `data-ak="hailrep" data-id="${esc(f.id)}"`, true)}${btn('Open the home', `data-ak="home" data-id="${esc(f.id)}"`)}</div>`) +
          `<p class="ak-src">NOAA MRMS radar hail at this house for every storm on file (storms with half an inch or more listed). A radar estimate, not a certified report; an inspection confirms damage.</p>` };
      });
    });
  }

  // ---------- intent matching ----------
  const INTENTS = [
    ['hailat', /\bhail\b.*\b(at|on|for|history)\b.*\b\d{2,6}\s+[a-z]|\b\d{2,6}\s+[a-z][a-z .'-]*\b(hail|storm) (history|report)|\bhail (history|report)\b.*\b(this|that) (house|home)|\bhow much hail\b/i],
    ['draft', /\b(draft|write|compose|reply to|respond to|answer)\b.*\b(reply|response|text|email|message|homeowner|them|him|her|\d{2,6} )|\bdraft (a |an )?(reply|response|text|email)/i],
    ['replies', /\b(who|anyone|any(body)?|which|homeowners?|people)\b.*\b(repl(y|ied|ies)|respond(ed)?|wrote back|answered|texted back|got back)|\b(repl(y|ies)|responses)\b.*\b(today|quote)|\bwants? (a )?(quote|estimate)/i],
    ['route', /\b(route|knock|door ?knock|canvass|doors?)\b/i],
    ['history', /\bwhat (did|have) (we|i|you) (say|said|send|sent|text|texted|email|emailed)|\b(history|conversation|messages?|thread)\b.*\b(with|for|to|at)\b.*\d{2,6}|\bwhat('?s| is| was) (been )?(said|sent) to\b/i],
    ['report', /\bhow many (leads|homeowners|quotes|people)|\b(leads?|report|numbers|stats)\b.*\b(this|the|last) (month|week)|\bmonthly (report|numbers)|\bleads? (did )?we (get|got|send|sent)/i],
    ['streets', /\b(street|streets|road|roads)\b.*\b(hail|hit|biggest|hardest|worst)|\b(biggest|largest|hardest|worst) hail\b|\bhaven'?t (contacted|reached|texted)\b/i],
    ['oldroofs', /\b(old|older|aging|ageing|\d{2}\+? ?(years?|yrs?))\b.*\broofs?\b|\broofs? (over|older than|at least) \d+|\bnear (chris'?s?|his|our|my|the) (last |past |recent )?jobs?\b|\bpast jobs?\b/i],
    ['why', /\bwhy (is|was|did)\b.*\b(on|in|make|made|pick|picked|list|daily|today)|\bwhy (this|that) (house|home|one)\b|\bscore (for|of|breakdown)|\bexplain (the )?score/i]
  ];
  function match(q) { q = String(q || ''); const hit = INTENTS.find(x => x[1].test(q)); return hit ? hit[0] : null; }
  function answer(q) {
    const k = match(q);
    const f = { hailat: hailAt, replies, draft: draftReply, route: knockRoute, history, report, streets: bigStreets, oldroofs: oldRoofs, why }[k];
    if (!f) return null;
    return Promise.resolve().then(() => f(q)).catch(e => ({ head: 'Something went wrong reading the data.', say: 'I could not read the data.', html: empty('Could not answer', esc(String(e && e.message || e))) }))
      .then(r => Object.assign({ intent: k }, r));
  }
  // clicks inside an answer (Send to Chris, Copy, Open thread)
  function onClick(e) {
    const b = e.target.closest('[data-ak]'); if (!b) return;
    const a = b.dataset.ak, id = b.dataset.id;
    if (a === 'hailrep' && id) { window.open(new URL('../c5-home/hail-report.html?id=' + encodeURIComponent(id), document.currentScript ? document.currentScript.src : location.href).href, '_blank'); return; }
    if (a === 'home' && id) { RC.go('home', { id }); return; }
    if (a === 'thread' && id) { try { localStorage.setItem('rc.t.lastThread', JSON.stringify(id)); } catch (er) { } RC.go('home', { id, view: 'inbox' }); return; }
    if (a === 'copy') { const t = b.closest('.ak-card, .ak-hand').querySelector('.ak-copy'); if (t) { (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).then(() => { b.textContent = 'Copied'; }, () => { t.hidden = false; t.select(); }); } return; }
    if (a === 'handoff' && id) { const slot = b.closest('.ak-card').querySelector('.ak-hand'); handoff(id, slot).then(() => { b.textContent = 'Sent to ' + OWNER(); b.classList.remove('pri'); b.dataset.done = '1'; }); }
  }
  const CHIPS = () => [['Replies wanting a quote', 'Who replied today and wants a quote?'], ['Draft a reply', 'Draft a reply to this homeowner'], ['Knock route tomorrow', 'Plan me a 3-hour knock route in Plano tomorrow'],
    ['What did we say?', 'What did we say to this house?'], ['Leads this month', `How many leads did we get ${OWNER()} this month?`], ['Big hail, not contacted', 'Which streets got the biggest hail in the last 30 days that we haven\'t contacted?'],
    ['Old roofs near jobs', 'Find roofs over 20 years old near Chris\'s last jobs'], ['Why on today\'s list?', 'Why is this house on today\'s list?'],
    ['Hail at an address', 'How much hail at ' + (((RC.daily && RC.daily()[0]) || {}).street || '1524 Yorkshire Dr') + '?']];

  // ---------- look: the CRM's glass deck, light ----------
  const css = `
.ak-wrap{display:flex;flex-direction:column;gap:12px;margin-top:14px}
.ak-card{background:rgba(255,255,255,.86);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.9);border-radius:20px;padding:16px 16px 14px;box-shadow:0 18px 40px -26px rgba(11,16,32,.45),0 1px 2px rgba(11,16,32,.06)}
.ak-eye{font:500 10.5px/1.2 var(--font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:10px}
.ak-row{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.ak-addr{font-size:15px;font-weight:600;letter-spacing:-.01em;display:block}
.ak-row small,.ak-list small{display:block;font-size:12px;color:var(--muted);margin-top:2px;line-height:1.35}
.ak-sub{font-size:12.5px;color:var(--muted);line-height:1.45;margin:8px 0 0}
.ak-warn{color:var(--brass)}
.ak-quote{font-size:14px;line-height:1.45;margin:10px 0 0;padding:10px 12px;border-radius:14px 14px 14px 4px;background:var(--panel-2)}
.ak-subj{font-weight:600;font-size:13px;margin:10px 0 0}
.ak-draftbody{white-space:pre-wrap;font-size:13.5px;line-height:1.5;margin-top:8px;padding:12px 14px;border-radius:14px;background:linear-gradient(135deg,rgba(39,87,230,.08),rgba(39,87,230,.03));border:1px solid rgba(39,87,230,.18)}
.ak-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.ak-btn{font:600 13px var(--font-text);padding:9px 14px;border-radius:999px;background:var(--panel-2);color:var(--paper);border:1px solid var(--hair);cursor:pointer}
.ak-btn.pri{background:linear-gradient(135deg,var(--roofer),color-mix(in srgb,var(--roofer) 70%,#000));color:#fff;border-color:transparent;box-shadow:0 8px 18px -10px var(--roofer)}
.ak-btn[data-done]{color:var(--muted)}
.ak-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.ak-stats.ak-5{grid-template-columns:repeat(5,1fr)}
.ak-stat{background:var(--panel-2);border-radius:14px;padding:10px 10px 9px}
.ak-stat b{display:block;font-size:20px;font-weight:600;letter-spacing:-.02em;line-height:1.1}
.ak-stat span{display:block;font-size:11px;color:var(--muted);margin-top:3px;line-height:1.25}
.ak-list{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:2px;max-height:340px;overflow:auto}
.ak-list li{display:flex;align-items:center;gap:10px;padding:8px 4px;border-top:1px solid var(--hair)}
.ak-list li:first-child{border-top:0}
.ak-list li>div:nth-child(2){flex:1;min-width:0}
.ak-list b{font-size:13.5px;font-weight:600}
.ak-r{text-align:right}
.ak-n{width:24px;height:24px;flex:none;border-radius:50%;background:var(--paper);color:#fff;font:600 11.5px var(--font-text);display:grid;place-items:center}
.ak-empty b{display:block;font-size:15px;font-weight:600}
.ak-empty p{font-size:13px;color:var(--muted);line-height:1.5;margin:6px 0 0}
.ak-src{font-size:11.5px;color:var(--muted);line-height:1.45;margin:2px 4px 0}
.ak-conv{display:flex;flex-direction:column;gap:8px;margin-top:12px;max-height:360px;overflow:auto}
.ak-msg{display:flex;flex-direction:column;max-width:88%}
.ak-msg.out{align-self:flex-end;align-items:flex-end}
.ak-mb{font-size:13px;line-height:1.45;padding:9px 12px;border-radius:16px 16px 4px 16px;background:linear-gradient(135deg,var(--roofer),color-mix(in srgb,var(--roofer) 72%,#000));color:#fff;white-space:pre-wrap}
.ak-msg.in .ak-mb{background:var(--panel-2);color:var(--paper);border-radius:16px 16px 16px 4px}
.ak-mm{font-size:10.5px;color:var(--muted);margin-top:3px}
.ak-dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:13px;margin:0}
.ak-dl dt{color:var(--muted)}.ak-dl dd{margin:0;font-weight:500}
.ak-hand:not(:empty){margin-top:14px;padding-top:12px;border-top:1px solid var(--hair)}
.ak-why{margin:10px 0 0;padding-left:18px;font-size:13px;line-height:1.5}
.ak-bars{display:flex;flex-direction:column;gap:6px}
.ak-bar{display:grid;grid-template-columns:118px 1fr 64px;align-items:center;gap:8px;font-size:12px}
.ak-bar span{color:var(--muted)}.ak-bar b{text-align:right;font-weight:600}
.ak-bar i{height:6px;border-radius:9px;background:var(--panel-2);overflow:hidden}
.ak-bar em{display:block;height:100%;border-radius:9px;background:var(--blue)}
.ak-wait::before{content:"";display:inline-block;width:10px;height:10px;border-radius:50%;border:2px solid var(--blue);border-right-color:transparent;margin-right:8px;vertical-align:-1px;animation:akspin .8s linear infinite}
@keyframes akspin{to{transform:rotate(360deg)}}
.ak-pin{width:26px;height:26px;border-radius:50%;background:var(--paper);color:#fff;font:600 12px var(--font-text);display:grid;place-items:center;box-shadow:0 0 0 3px #fff,0 6px 14px rgba(11,16,32,.35)}
.ak-pin.sm{width:20px;height:20px;font-size:10px;background:var(--blue)}
.ak-pin.job{background:var(--roofer)}
@media (max-width:900px){.ak-stats.ak-5{grid-template-columns:repeat(3,1fr)}.ak-bar{grid-template-columns:96px 1fr 58px}}
@media (prefers-reduced-motion:reduce){.ak-wait::before{animation:none}}`;
  const st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st);

  // ---------- the hardest-hit streets of ONE storm (the Nimbus page's map and street cards) ----------
  // Built here from the same per-home radar files every screen reads, for the working storm (RC.SHOWCASE) by default, so
  // the Ask page never shows another storm's streets (it used to read a fixed Aug 12, 2025 file, 10-15).
  // -> { date, homes (1 in+ homes), max, hits: [[lon, lat, in]], streets: top 5 by homes hit [{ name, city, county, homes,
  //      max, mid: [lon, lat], list: [{ i, addr, lon, lat, hail }] }], bbox: [w, s, e, n] of those streets' homes }
  const SS = {};
  function stormStreets(iso) {
    iso = iso || RC.SHOWCASE;
    if (SS[iso]) return SS[iso];
    return SS[iso] = homes().then(D => hailFor(D, iso).then(all => {
      const by = new Map(), hits = []; let n = 0, max = 0;
      D.regs.forEach((g, k) => { const A = all[k]; if (!A) return;
        for (let j = 0; j < g.r.count; j++) { if (A[j] < 100) continue; const gi = g.r.offset + j; if (!isHome(D, gi)) continue;
          const v = A[j] / 100; n++; if (v > max) max = v; hits.push([D.xy[gi * 2], D.xy[gi * 2 + 1], v]);
          if (!g.M) continue; const h = rec(D, gi); if (!h.street) continue;
          const key = h.street + '|' + h.city; let e = by.get(key);
          if (!e) by.set(key, e = { name: h.street, city: h.city, county: g.r.name || g.r.id, list: [], max: 0 });
          e.list.push({ i: gi, addr: h.addr, lon: h.lon, lat: h.lat, hail: v }); if (v > e.max) e.max = v; } });
      const streets = [...by.values()].sort((a, b) => b.list.length - a.list.length || b.max - a.max || (a.name + a.city < b.name + b.city ? -1 : 1)).slice(0, 5);
      const med = a => { const x = a.slice().sort((p, q) => p - q); return x[x.length >> 1]; };
      let w = 180, so = 90, e2 = -180, no = -90;
      streets.forEach(e => { e.homes = e.list.length; e.list.sort((a, b) => b.hail - a.hail || a.i - b.i);
        e.mid = [med(e.list.map(h => h.lon)), med(e.list.map(h => h.lat))];
        e.list.forEach(h => { w = Math.min(w, h.lon); e2 = Math.max(e2, h.lon); so = Math.min(so, h.lat); no = Math.max(no, h.lat); }); });
      return { date: iso, homes: n, max, hits, streets, bbox: streets.length ? [w, so, e2, no] : null };
    }));
  }

  window.RCAsk = { match, answer, onClick, stormStreets, get CHIPS() { return CHIPS(); }, _homes: homes };
})();
