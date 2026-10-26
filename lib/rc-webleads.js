/* rc-webleads.js: inbound web leads for the roofer's own site (10-26, docs/INTENT-LEADS.md). Plain script; load AFTER
   rc-state.js, brand.js and rc-proof.js. Exposes window.RCWL.

   What it holds:
     touch   where the visitor came from. Read once per page load from the URL and the referrer: utm_source / medium /
             campaign / term / content, the ad click ids (gclid, gbraid, wbraid, fbclid, msclkid), the referrer's host and
             the landing path. First touch is kept for 90 days (first touch wins, like 012's crm_threads.source); last
             touch is kept too. classify() turns it into one channel: google_lsa, google_ads, meta_ads, gbp,
             organic_search, nextdoor, facebook, qr, email, referral, direct.
     submit  one lead from the storm-check page: saves it to this browser's outbox (rc.t.webleads), puts the home on the
             Roof Command pipeline as a New lead with source "website" (Results: SEO / website form) and a note naming the
             channel, records consent through RCP.consent (the exact versioned words), and, only when
             window.RCWL_ENDPOINT is set, POSTs it to the web-lead Edge Function (supabase/functions/web-lead), which
             writes the secure contact store and the lead (Supabase 011/012). Off by default: nothing leaves the page.

   Never reads an owner name. Never loads a third-party pixel. Collects only what the homeowner typed plus the touch. */
(function (root) {
  'use strict';
  if (root.RCWL) return;
  const RC = root.RC, LS_FIRST = 'rc.t.wl.first', LS_LAST = 'rc.t.wl.last', LS_OUT = 'rc.t.webleads', DAYS = 90;
  const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const cap = (v, n) => v == null ? null : String(v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) || null;

  // ---------- touch ----------
  const KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'src'];
  function readTouch() {
    const q = new URLSearchParams(location.search), t = { at: new Date().toISOString(), landing: cap(location.pathname, 200) };
    KEYS.forEach(k => { const v = cap(q.get(k), 150); if (v) t[k] = v; });
    let ref = ''; try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) { }
    if (ref && ref !== location.hostname) t.ref = cap(ref, 120);
    return t;
  }
  function classify(t) {
    t = t || {}; const s = (t.utm_source || t.src || '').toLowerCase(), m = (t.utm_medium || '').toLowerCase(), c = (t.utm_campaign || '').toLowerCase(), r = (t.ref || '').toLowerCase();
    const paid = /^(cpc|ppc|paid|paidsearch|paid_search|paid-social|paid_social|paidsocial|display|cpm|ads?)$/.test(m);
    if (/lsa|local.?services/.test(s + ' ' + c)) return 'google_lsa';
    if (t.gclid || t.gbraid || t.wbraid || (/google/.test(s) && paid)) return 'google_ads';
    if (t.msclkid) return 'bing_ads';
    if ((/facebook|meta|instagram|fb|ig/.test(s) && paid) || (t.fbclid && paid)) return 'meta_ads';
    if (/gbp|business.?profile|gmb|maps/.test(c + ' ' + s + ' ' + m)) return 'gbp';
    if (/nextdoor/.test(s + ' ' + r)) return 'nextdoor';
    if (/facebook|instagram|fb|ig/.test(s) || /facebook\.com|instagram\.com/.test(r) || t.fbclid) return 'facebook';
    if (/qr|sign|door.?hanger|flyer|truck/.test(s + ' ' + m)) return 'qr';
    if (/email|newsletter/.test(s + ' ' + m)) return 'email';
    if (/(^|\.)(google|bing|duckduckgo|yahoo)\./.test(r) || /organic/.test(m)) return 'organic_search';
    if (r) return 'referral';
    return s ? 'referral' : 'direct';
  }
  const LABEL = { google_lsa: 'Google Local Services Ads', google_ads: 'Google Ads', bing_ads: 'Bing Ads', meta_ads: 'Facebook / Instagram ads',
    gbp: 'Google Business Profile', organic_search: 'Google search (organic)', nextdoor: 'Nextdoor', facebook: 'Facebook / Instagram (not paid)',
    qr: 'QR code / yard sign', email: 'Email', referral: 'Another website', direct: 'Typed in or bookmarked' };
  // first touch wins for DAYS; a touch with no campaign info never replaces a real one as "last"
  const now = readTouch(), hasInfo = KEYS.some(k => now[k]) || !!now.ref;
  let first = lsGet(LS_FIRST, null);
  if (!first || Date.now() - Date.parse(first.at) > DAYS * 864e5) { first = now; lsSet(LS_FIRST, first); }
  if (hasInfo || !lsGet(LS_LAST, null)) lsSet(LS_LAST, now);
  function touch() { const f = lsGet(LS_FIRST, now), l = lsGet(LS_LAST, now); return { first: f, last: l, channel: classify(f), lastChannel: classify(l) }; }
  // what 012's crm_threads.source_detail holds (120 chars): "gbp / storm-plano-1026 / google"
  function detail(t) { t = t || touch(); const f = t.first || {}; return [t.channel, f.utm_campaign, f.utm_source || f.ref].filter((v, k, a) => v && a.indexOf(v) === k).join(' / ').slice(0, 120); }

  // ---------- submit ----------
  // a home outside the data still gets a stable key: 'w' + a short hash of the typed address (never 'm', which is a data index)
  function addrKey(a) { let h = 2166136261; String(a || '').toLowerCase().replace(/\W+/g, ' ').trim().split('').forEach(ch => { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }); return 'w' + (h >>> 0).toString(36); }
  const digits = p => { const d = String(p || '').replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d.length === 10 ? d : ''; };
  const pretty = d => d ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : '';

  // o: { gi (data home index or null), addr, city, zip, name, phone, email, when, note, agree (text consent box), hail: {date, inches}, ballpark }
  function submit(o) {
    o = o || {}; const at = new Date().toISOString(), T = touch(), ph = digits(o.phone), em = cap(o.email, 200);
    const gi = Number.isInteger(o.gi) ? o.gi : null, key = gi != null ? 'm' + gi : addrKey(o.addr);
    const words = root.RCP ? RCP.consentText() : '', version = root.RCP ? RCP.CONSENT_VERSION : null;
    const lead = { id: key + '-' + Date.now().toString(36), at, home_key: key, gi, addr: cap(o.addr, 300), city: cap(o.city, 60), zip: cap(o.zip, 10),
      name: cap(o.name, 120), phone: ph || null, email: em, when: cap(o.when, 60), note: cap(o.note, 1000), hail: o.hail || null,
      consent: { text: !!(o.agree && ph), words: o.agree && ph ? words : null, version: o.agree && ph ? version : null, at: o.agree && ph ? at : null },
      touch: T, source: 'website', source_detail: detail(T), page: location.pathname, sent: null };
    const out = lsGet(LS_OUT, []); out.unshift(lead); if (out.length > 200) out.length = 200; lsSet(LS_OUT, out);

    // onto the pipeline (this device). The consent record and the "Left a number" note come from RCP.consent; the
    // source stamp on the pipeline entry is what RCR.sourceOf reads first (first touch wins: never overwrite one).
    if (RC) {
      const pipe = RC.pipeline(), had = pipe[key];
      RC.remember(Object.assign({ id: key, addr: lead.addr, city: lead.city, zip: lead.zip, from: 'website' }, gi != null ? { gi } : {},
        lead.name ? { webName: lead.name } : {}, ph && !(RC.recall(key) || {}).phone ? { phone: pretty(ph), phoneBy: 'homeowner (storm-check page)' } : {}));
      // an inspection request is a hot lead: straight to the hand-off stage, like the Proof Page's Book button (RCP.ask)
      if (!had || had.stage === 'new' || had.stage === 'called') RC.setStage(key, 'handoff', (lead.name ? lead.name + ' (their own name, typed on the form) asked' : 'Asked') + ' for a free inspection on the storm-check page' + (lead.when ? ' (' + lead.when.toLowerCase() + ')' : ''),
        had && had.source ? {} : { source: 'website', sourceDetail: lead.source_detail });
      else RC.note(key, 'Asked again for a free inspection on the storm-check page');
      RC.note(key, `Came from ${LABEL[T.channel] || T.channel}${T.first.utm_campaign ? ', campaign "' + T.first.utm_campaign + '"' : ''}${T.channel !== T.lastChannel ? ' (last visit: ' + (LABEL[T.lastChannel] || T.lastChannel) + ')' : ''}`);
      // consent, recorded the way RCP.consent does it, named for this page: a fresh written yes overrides an older STOP
      if (lead.consent.text) {
        if (RC.optedOut && RC.optedOut(key)) RC.optOut(key, 'storm-check page', false);
        RC.remember({ id: key, optin: true, optinAt: at, optinHow: 'storm-check page consent box', optinVersion: version });
        RC.note(key, `Written consent on the storm-check page: texts and calls from ${(root.activeRoofer && activeRoofer().name) || 'the roofer'} to ${pretty(ph)} (wording ${version})`);
      } else RC.note(key, `Left ${[pretty(ph), em].filter(Boolean).join(' and ')} on the storm-check page (no consent to marketing texts: reply by email${ph ? ' or a call about this request' : ''} only)`);
      if (em && !(RC.recall(key) || {}).email) RC.remember({ id: key, email: em });
    }
    return send(lead).then(r => { lead.sent = r; const l = lsGet(LS_OUT, []), x = l.find(y => y.id === lead.id); if (x) { x.sent = r; lsSet(LS_OUT, l); } return lead; });
  }
  // cloud: only with an endpoint (the web-lead Edge Function) and a roofer slug (?company=). Returns 'cloud' | 'local' | 'failed'
  function send(lead) {
    const u = root.RCWL_ENDPOINT, slug = (new URLSearchParams(location.search).get('company') || root.RCWL_COMPANY || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 60);
    if (!u || !slug) return Promise.resolve('local');
    const body = { company: slug, home_key: lead.home_key, address: lead.addr, city: lead.city, zip: lead.zip, name: lead.name, phone: lead.phone, email: lead.email,
      best_time: lead.when, message: lead.note, text_consent: lead.consent.text, consent_text: lead.consent.words, consent_version: lead.consent.version,
      hail: lead.hail, touch: lead.touch, page: lead.page, hp: '' };
    const k = root.RC_CONFIG && root.RC_CONFIG.SUPABASE_ANON_KEY;
    return fetch(u, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, k ? { apikey: k, Authorization: 'Bearer ' + k } : {}), body: JSON.stringify(body) })
      .then(r => r.ok ? 'cloud' : 'failed').catch(() => 'failed');
  }

  root.RCWL = { touch, classify, detail, submit, leads: () => lsGet(LS_OUT, []), LABEL, addrKey };
})(window);
