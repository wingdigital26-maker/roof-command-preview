/* rc-cloud.js: the CRM's cloud source of truth (Supabase, schema docs/CRM-SCHEMA.md). Loaded by lib/rc-state.js in the
   TOP window only (the shell, or a screen opened on its own), so one poller runs per tab; frames keep reading and writing
   localStorage "rc.t.*" as before and hear cloud changes through the 'storage' event.
   Signed in (localStorage "rc.session", same as lib/auth.js): reads/writes PostgREST with anon key + the user's JWT, so
   RLS limits it to the user's company. Pull every 15 s (and on focus), push 1.5 s after any local change.
   localStorage stays the offline cache; signed out (or ?dev=1 with no session, or ?cloud=0) = local only, nothing sent.
   Mapping: rc.t.pipe[homeId] -> crm_threads (home_key = homeId; stage mapped, the local stage + extras in meta.p);
   each history entry -> crm_messages (text/email/call, original entry in meta.h) or crm_events (stage/note/booking, data.h),
   keyed by a deterministic client_id (entry.cid), so a retry or a second device never duplicates.
   rc.t.optout / sched / daily / added -> crm_kv. The first sync pushes every local thread not yet in the cloud (one-time
   migration). Local change not yet pushed wins over the cloud; otherwise the cloud wins (snapshot rc.cloud.snap.<company>).
   window.RC_CLOUD: { status(), syncNow(), companyId } */
(function () {
  'use strict';
  if (window.RC_CLOUD || !window.RC || !RC.__set) return;
  const URL_ = 'https://preview.invalid';
  const KEY = 'preview-no-key';
  const POLL = 15000, KV_KEYS = ['optout', 'sched', 'daily', 'added', 'stormSeen', 'd50skip'];   // d50skip: Today's Skip (Not a fit keeps a home off every later list)   // stormSeen: the newest storm this user has seen (Today's takeover shows once per storm)
  // drawn.<home_key>: a roof outline the roofer drew on the satellite view (c5-home/draw.js), one crm_kv row per home
  const isKv = k => KV_KEYS.indexOf(k) >= 0 || /^drawn\.[A-Za-z0-9_-]+$/.test(k);
  const localKvKeys = () => { const out = KV_KEYS.slice(); try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('rc.t.drawn.') === 0) out.push(k.slice(5)); } } catch (e) { } return out; };
  try { const q = new URLSearchParams(location.search).get('cloud'); if (q === '0') sessionStorage.setItem('rc.cloud.off', '1'); else if (q === '1') sessionStorage.removeItem('rc.cloud.off'); } catch (e) { }
  const off = () => { try { return sessionStorage.getItem('rc.cloud.off') === '1'; } catch (e) { return false; } };
  const sess = () => { try { const v = JSON.parse(localStorage.getItem('rc.session') || 'null'); return v && v.access_token && (!v.expires_at || v.expires_at > Date.now() / 1000 + 20) ? v : null; } catch (e) { return null; } };

  // local stage keys (RC.STAGES) <-> cloud enum crm_stage
  const TO_CLOUD = { new: 'new', called: 'contacted', handoff: 'sent_to_chris', inspection: 'booked', proposal: 'wants_quote', won: 'won', lost: 'lost' };
  const FROM_CLOUD = { new: 'new', contacted: 'called', replied: 'called', wants_quote: 'proposal', booked: 'inspection', sent_to_chris: 'handoff', called_chris: 'handoff', won: 'won', lost: 'new' };
  // a Contacted home the homeowner answered reads Replied in the cloud (the engine's own stage), still 'called' here
  const cloudStage = p => p.archived ? 'lost' : p.stage === 'called' && p.replied ? 'replied' : (TO_CLOUD[p.stage] || 'new');

  // deterministic id for one history entry (FNV-1a, 2 x 32 bit)
  function hash(s) { let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619) >>> 0; b = Math.imul(b ^ c, 2246822519) >>> 0; } return a.toString(36) + b.toString(36); }
  const cidOf = (id, h) => 'h' + hash(JSON.stringify([id, h.at, h.kind, h.dir || '', h.what || '', h.body || ''])).slice(0, 20);
  const extras = p => { const o = {}; Object.keys(p || {}).forEach(k => { if (k !== 'history') o[k] = p[k]; }); return o; };
  const sig = p => JSON.stringify(extras(p));

  let company = null, snap = null, since = { t: null, m: null, e: null, k: null }, busy = false, dirty = false, last = { ok: null, at: null, err: null };
  const SNAPK = () => 'rc.cloud.snap.' + company;
  const loadSnap = () => { try { snap = JSON.parse(localStorage.getItem(SNAPK()) || 'null'); } catch (e) { snap = null; } snap = snap || { t: {}, k: {} }; };
  const saveSnap = () => { try { localStorage.setItem(SNAPK(), JSON.stringify(snap)); } catch (e) { } };

  function api(path, opt) {
    const s = sess(); if (!s) return Promise.reject(new Error('signed out'));
    opt = opt || {};
    const h = { apikey: KEY, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' };
    if (opt.prefer) h.Prefer = opt.prefer;
    return fetch(URL_ + '/rest/v1/' + path, { method: opt.method || 'GET', headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined, cache: 'no-store' })
      .then(r => r.text().then(t => { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 200)); return t ? JSON.parse(t) : null; }));
  }

  function findCompany() {
    return api('companies?select=id,slug').then(rows => {
      if (!rows || !rows.length) return null;
      const want = RC.rooferKey && RC.rooferKey();
      return (rows.find(r => r.slug === want) || rows[0]).id;
    });
  }

  // ---------- pull: cloud -> localStorage (cloud wins unless a local change is waiting to be pushed) ----------
  // rows written by the automation engine (supabase/functions/roof-engine) carry meta.what and ai_generated:
  // the timeline says "... sent by AI" / "Automation", a draft held for review shows as a note, never as a sent text
  function entryFromMsg(m) {
    if (m.meta && m.meta.h) return Object.assign({}, m.meta.h, { cid: m.client_id || ('s' + m.id) });
    const kind = m.channel === 'sms' ? 'text' : m.channel, mt = m.meta || {}, cid = m.client_id || ('s' + m.id);
    const who = m.ai_generated ? 'AI (automation)' : mt.auto ? 'Automation' : undefined;
    if (m.status === 'needs_review') return { at: m.created_at, kind: 'note', what: (mt.what || 'Draft waiting for review') + (m.body ? '. Draft: ' + m.body : ''), who: who || 'Automation', ai: !!m.ai_generated, cid };
    const what = mt.what ? mt.what + (m.status === 'failed' ? ' (failed: ' + (mt.error || 'provider error') + ')' : '') :
      m.direction === 'in' ? 'Reply from the homeowner' : (kind === 'text' ? 'Text sent' : kind === 'email' ? 'Email sent' : 'Call');
    return { at: m.sent_at || m.created_at, kind, dir: kind === 'call' ? 'out' : m.direction, body: m.body || '', subject: m.subject || undefined, what, who, ai: !!m.ai_generated, cid };
  }
  function entryFromEvent(e) {
    if (e.data && e.data.h) return Object.assign({}, e.data.h, { cid: e.client_id || ('s' + e.id) });
    const what = e.note || (e.type === 'stage_change' && e.data && e.data.to ? 'Moved to ' + e.data.to : e.type.replace(/_/g, ' '));
    const kind = e.type === 'note' || e.type === 'handoff' || e.type === 'notify_chris' ? 'note' : e.type === 'call_ended' ? 'call' : 'stage';
    const o = { at: e.created_at, kind, what, who: e.actor ? undefined : 'Automation', cid: e.client_id || ('s' + e.id) };
    // the homeowner's booking page (roof-engine/booking): the slot becomes this home's inspection time (RC.booking)
    if (e.type === 'booking' && e.data && e.data.slot_start) o.slotStart = e.data.slot_start;
    return o;
  }
  const maxAt = (rows, f, cur) => rows.reduce((m, r) => (r[f] && (!m || r[f] > m) ? r[f] : m), cur);

  function pull() {
    const q = (t, f, s) => api(t + (s ? (t.indexOf('?') < 0 ? '?' : '&') + f + '=gt.' + encodeURIComponent(s) : '') + (t.indexOf('?') < 0 ? '?' : '&') + 'order=' + f + '.asc&limit=5000');
    return Promise.all([
      q('crm_threads?select=id,home_key,stage,meta,paused,automation_state,updated_at&company_id=eq.' + company, 'updated_at', since.t),
      q('crm_messages?select=id,thread_id,direction,channel,body,subject,status,sent_at,client_id,meta,created_at,ai_generated&company_id=eq.' + company, 'created_at', since.m),
      q('crm_events?select=id,thread_id,type,data,note,client_id,created_at,actor&company_id=eq.' + company, 'created_at', since.e),
      q('crm_kv?select=key,value,updated_at&company_id=eq.' + company, 'updated_at', since.k)
    ]).then(([T, M, E, K]) => {
      const ids = snap.ids || (snap.ids = {});
      T.forEach(t => { ids[t.id] = t.home_key; });
      const all = RC.__get('pipe', {}); let changed = false;
      // a STOP the engine took (Twilio / email webhook) is an opt-out here too, so a person can never text that home by hand
      const oo = RC.__get('optout', {}) || {}; let ooChanged = false;
      T.forEach(t => { const st = t.automation_state || {}; if (st.opted_out && !oo[t.home_key]) { oo[t.home_key] = { at: st.opted_out, how: 'STOP (automation)' }; ooChanged = true; } });
      if (ooChanged) RC.__set('optout', oo);
      T.forEach(t => {
        const id = t.home_key, p = all[id], s = snap.t[id];
        const localPending = p && s !== undefined && sig(p) !== s;
        const freshLocal = p && s === undefined;   // never synced: pushed after this pull, local wins
        if (localPending || freshLocal) return;
        const mp = (t.meta && t.meta.p) || {};
        const next = Object.assign({}, mp, { history: (p && p.history) || [] });
        // the cloud stage rules (another device or the engine may have moved it); the local key rides in meta.p.stage
        if (t.stage === 'lost') { next.archived = next.archived || t.updated_at; next.stage = next.stage || 'new'; }
        else { delete next.archived; next.stage = (mp.stage && TO_CLOUD[mp.stage] === t.stage) ? mp.stage : (FROM_CLOUD[t.stage] || 'new'); }
        if (t.stage === 'replied' && !next.replied) next.replied = t.updated_at;
        if (!p || sig(p) !== sig(next)) { all[id] = next; changed = true; }
        snap.t[id] = sig(next);
      });
      const addEntry = (tid, h) => {
        const id = ids[tid]; if (!id) return;
        const isNew = !all[id], p = all[id] = all[id] || { stage: 'new', history: [] };
        if (p.history.some(x => x.cid === h.cid)) return;
        const twin = p.history.find(x => !x.cid && cidOf(id, x) === h.cid);   // pushed from here, cid not written back yet
        if (twin) { twin.cid = h.cid; changed = true; return; }
        p.history.push(h); p.history.sort((a, b) => a.at < b.at ? 1 : a.at > b.at ? -1 : 0); changed = true;
        if (h.dir === 'in' && (!p.replied || p.replied < h.at)) p.replied = h.at;
        if (h.slotStart && (!p.booked || p.booked !== h.slotStart) && !(p.history.some(x => x !== h && /^Booking undone/.test(x.what || '') && x.at > h.at))) { p.booked = h.slotStart; if (!p.stage || p.stage === 'new' || p.stage === 'called' || p.stage === 'handoff') p.stage = 'inspection'; }
        if (isNew) snap.t[id] = sig(p);
      };
      M.forEach(m => addEntry(m.thread_id, entryFromMsg(m)));
      E.forEach(e => e.thread_id && e.type !== 'call_started' && addEntry(e.thread_id, entryFromEvent(e)));   // the call row itself shows the start
      since.t = maxAt(T, 'updated_at', since.t); since.m = maxAt(M, 'created_at', since.m); since.e = maxAt(E, 'created_at', since.e);
      if (changed) RC.__set('pipe', all);
      K.forEach(k => {
        if (!isKv(k.key)) return;
        const cur = JSON.stringify(RC.__get(k.key, null)), s = snap.k[k.key];
        if (s !== undefined && cur !== s) return;              // local change pending: push wins
        if (s === undefined && cur !== 'null' && cur !== JSON.stringify(k.value)) return; // first sync with local data: push merges
        if (cur !== JSON.stringify(k.value)) RC.__set(k.key, k.value);
        snap.k[k.key] = JSON.stringify(k.value);
      });
      since.k = maxAt(K, 'updated_at', since.k);
      saveSnap();
    });
  }

  // ---------- push: localStorage -> cloud (threads whose stage/extras changed, history entries without a cid) ----------
  function push() {
    const all = RC.__get('pipe', {}), work = [];
    Object.keys(all).forEach(id => {
      const p = all[id]; if (!p) return;
      const news = (p.history || []).filter(h => !h.cid);
      if (snap.t[id] !== sig(p) || news.length) work.push(id);
    });
    let chain = Promise.resolve(), done = {};
    work.slice(0, 200).forEach(id => { chain = chain.then(() => pushThread(id).then(r => { done[id] = r; })); });
    return chain.then(() => {
      if (work.length) {
        // write the cids back onto the CURRENT local records (the user may have acted meanwhile)
        const cur = RC.__get('pipe', {});
        Object.keys(done).forEach(id => { const r = done[id], p = cur[id]; if (!p) return;
          (p.history || []).forEach(h => { if (!h.cid && r.cids[cidOf(id, h)]) h.cid = cidOf(id, h); });
          if (sig(p) === r.sig) snap.t[id] = r.sig; });
        snap.ids = snap.ids || {}; Object.keys(done).forEach(id => { snap.ids[done[id].tid] = id; });
        saveSnap(); RC.__set('pipe', cur);
      }
      return pushKv();
    }).then(() => { if (work.length > 200) dirty = true; });
  }
  function pushThread(id) {
    const p = RC.__get('pipe', {})[id] || { stage: 'new', history: [] }, s = sig(p);
    const lastAt = (p.history || []).reduce((m, h) => h.at && (!m || h.at > m) ? h.at : m, null);
    const home = RC.recall ? RC.recall(id) : null;
    const meta = { p: extras(p) }; if (home) meta.home = { addr: home.addr || home.address || null, city: home.city || null, county: home.county || null, lon: home.lon, lat: home.lat, gi: home.gi };
    return api('crm_threads?on_conflict=company_id,home_key', { method: 'POST', prefer: 'resolution=merge-duplicates,return=representation',
      // an opt-out marked here pauses the thread, so the cloud engine never sends to it either (STOP from the homeowner
      // pauses it on the engine side). Opting back in does not unpause: a person turns automation back on for that home.
      body: [Object.assign({ company_id: company, home_key: String(id), stage: cloudStage(p), meta, last_activity_at: lastAt }, RC.optedOut && RC.optedOut(id) ? { paused: true } : {})] })
      .then(rows => {
        const tid = rows[0].id, msgs = [], evs = [], cids = {};
        (p.history || []).filter(h => !h.cid).forEach(h => {
          const cid = cidOf(id, h); cids[cid] = 1;
          const ch = h.kind === 'text' ? 'sms' : h.kind === 'email' ? 'email' : /^(Called|Wrong number|Call note)/.test(h.what || '') || h.kind === 'call' ? 'call' : null;
          if (ch) msgs.push({ company_id: company, thread_id: tid, direction: h.dir === 'in' ? 'in' : 'out', channel: ch, body: h.body || null, subject: h.subject || null,
            status: h.dir === 'in' ? 'received' : (ch === 'call' ? 'logged' : 'sent'), sent_at: h.at, ai_generated: false, client_id: cid, meta: { h } });
          else evs.push({ company_id: company, thread_id: tid, type: h.kind === 'note' ? 'note' : /^Inspection booked/.test(h.what || '') ? 'booking' : 'stage_change',
            data: { h, to: h.kind === 'stage' ? cloudStage(p) : undefined }, note: h.what || null, client_id: cid });
        });
        const ins = (t, rows) => rows.length ? api(t + '?on_conflict=company_id,client_id', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: rows }) : null;
        return Promise.all([ins('crm_messages', msgs), ins('crm_events', evs)]).then(() => ({ tid, cids, sig: s }));
      });
  }
  function pushKv() {
    const rows = [];
    localKvKeys().forEach(k => {
      const v = RC.__get(k, null), j = JSON.stringify(v);
      if (snap.k[k] === j) return;
      if (v == null && (KV_KEYS.indexOf(k) >= 0 || snap.k[k] === undefined)) return;   // a removed drawing (null) is pushed so the other devices drop it too
      rows.push({ company_id: company, key: k, value: v }); snap.k[k] = j;
    });
    if (!rows.length) return Promise.resolve();
    return api('crm_kv?on_conflict=company_id,key', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: rows }).then(saveSnap);
  }

  function sync() {
    if (busy) { dirty = true; return Promise.resolve(); }
    if (off() || !sess()) return Promise.resolve();
    busy = true; dirty = false;
    const go = company ? Promise.resolve(company) : findCompany().then(c => { company = c; if (c) { loadSnap(); window.RC_CLOUD.companyId = c; } return c; });
    return go.then(c => c ? pull().then(push) : null)
      .then(() => { last = { ok: true, at: new Date().toISOString(), err: null }; })
      .catch(e => { last = { ok: false, at: new Date().toISOString(), err: String(e && e.message || e) }; console.warn('[rc-cloud]', last.err); })
      .then(() => { busy = false; if (dirty) setTimeout(sync, 500); });
  }

  let t = null;
  RC.on(d => { if (!d || !(d.key === 'pipe' || isKv(d.key)) || d.cloud) return; clearTimeout(t); t = setTimeout(sync, 1500); });
  window.RC_CLOUD = { status: () => Object.assign({ on: !!(sess() && !off()), company }, last), syncNow: sync, companyId: null };
  setInterval(() => { if (document.visibilityState !== 'hidden') sync(); }, POLL);
  addEventListener('focus', () => sync());
  setTimeout(sync, 300);
})();
