/* Home record: who, where, stage, calls, texts, booking, notes. Plain script, runs before home.js (the 3D).
   Reads ?home=<id> (or ?id=, what RC.go('home') writes). 'm<i>' = home i of the roofer's data. A home on TODAY's list
   (RC.todayPick, the same kept list Today shows) is "Stop n of 50" and takes its address, hail, storm and squares from
   that pick, so the record says exactly what Today's card says. No id = stop 1 of today's list. An old route id
   ('d<roofer>-<n>', the retired fixed Aug 12, 2025 route) opens stop n of today's list. House facts are real: county
   address, radar hail, reroof permits, roof from the LiDAR record (lib/st-meta.js). People, phones and opt-ins are sample.
   Nothing here sends and nothing starts a call (10-09: outreach is text and email only). Text = an sms: draft a human
   sends inside the roofer's texting hours (RC.canText); Email = a mailto: draft from lib/rc-copy.js. */
(function () {
  'use strict';
  // inside the tour shell the shell is the one roofer-branded header, so this page drops its own bar
  try { if (window.self !== window.top) document.documentElement.classList.add('embedded'); } catch (e) { document.documentElement.classList.add('embedded'); }
  const RC = window.RC, esc = RC.esc, $ = (s, r) => (r || document).querySelector(s);
  const embedded = document.documentElement.classList.contains('embedded');
  const STORM = RC.facts.storm; // the working storm (RC.SHOWCASE, the newest): named by the shell header, never a home's own hail date
  // the active roofer (lib/brand.js, ?roofer= / rc-state) brands this page
  const B = activeRoofer();
  const AC = B.areaCode || '972';
  const DEF = rooferKey();
  const ST8 = B.state || 'TX';    // state of the addresses on screen (the roofer's own data)
  // a storm day carries its year when the storm was not this year: "Aug 12, 2025" in sentences, "Aug 12 ’25" in tight
  // spots (stage strip, board cards); this year's storms stay "Jun 2"
  const sday = (iso, short) => { iso = String(iso || ''); if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
    const d = new Date(iso.slice(0, 10) + 'T12:00:00Z'), y = d.getUTCFullYear(), md = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    return y === new Date().getFullYear() ? md : short ? md + ' ’' + String(y).slice(2) : md + ', ' + y; };
  window.homeDay = sday;   // pipe.js: the same storm day on the board cards
  // a home's OWN storm day (the storm its hail came from); no storm = no date (never the working storm's date by default)
  const hailDay = v => { if (!v) return ''; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return sday(v); return v; };
  // a roofer with its own data (lib/brand.js dataRoot; Jackson): CAD address line + subdivision in the header, the real
  // owner from RC.owner (private county roll) instead of a sample name, "Owner not loaded" when it is not available
  const OWNDATA = !!B.dataRoot;
  const LIC = B.licence ? 'Licence ' + B.licence + ' (sample)' : '';   // Texas has no roofing licence: no licence line at all
  const REP = B.owner, CO = B.name;
  // per-home state; load() swaps it in place when the shell routes to another home (no page reload)
  let rawId, mm, kind, id, rec, n, hail, hailTxt, place, tel, first, optin, dflt, pendingStop = 0;
  const today = () => (RC.daily ? RC.daily() : []);
  const defId = () => { const l = today(); return l.length ? l[0].id : ''; };   // stop 1 of today's list
  const hailOk = v => v != null && v !== '' && v !== 'null' && isFinite(+v);
  // the facts today's list holds for this home (the same pick Today's card is drawn from): address, hail, its storm, squares
  function applyPick() {
    const p = rawId && RC.todayPick ? RC.todayPick(rawId) : null;
    if (p) {
      Object.assign(rec, { gi: p.gi, addr: p.street || String(p.address || '').split(',')[0] || rec.addr, city: p.city || rec.city, zip: p.zip || rec.zip,
        place: p.city ? `${p.city}, ${ST8}${p.zip ? ' ' + p.zip : ''}` : rec.place, hail: hailOk(p.hail) ? +p.hail : null, storm: p.storm || null,
        lon: p.lon != null ? p.lon : rec.lon, lat: p.lat != null ? p.lat : rec.lat, subdivision: p.subdivision || rec.subdivision, sq: p.squares, sqMeasured: !!p.measured });
      kind = 'daily'; n = p.stop;
    }
    hail = hailOk(rec.hail) ? +rec.hail : null;
    hailTxt = hail != null ? hail.toFixed(2) + ' in' : 'No 1 in+ hail on file';
    if (window.HOME && window.HOME.rec === rec) Object.assign(window.HOME, { kind, hail, hailTxt, hailDate: hail != null ? hailDay(rec.storm) : '' });
    return !!p;
  }
  function load(newId) {
    rawId = newId || defId();
    // the retired fixed route's ids (d<roofer>-<n>) open stop n of today's list (once the list is built)
    const old = /^d([a-z]+)-(\d+)$/.exec(rawId || '');
    if (old) { const l = today(); if (l.length) rawId = (l[+old[2] - 1] || l[0]).id; else { pendingStop = +old[2]; rawId = ''; } }
    mm = /^m(\d+)$/.exec(rawId);
    kind = mm ? 'map' : 'sample'; n = 0;
    id = rawId || 'c5-sample';
    const got = rawId ? RC.recall(rawId) : null;
    rec = Object.assign({}, got || {});
    if (!rawId) rec.addr = "Today's list is loading";
    else if (!got) rec.addr = 'Home from the storm map';
    if (!hailOk(rec.hail)) rec.hail = null;
    applyPick();
    const st = ST8;
    if (OWNDATA) { rec.person = null; rec.owner = null; }   // never a sample name on a home whose real owner can be loaded
    place = rec.place || (rec.city ? rec.city + ', ' + st : rec.county ? rec.county + ' County, ' + st : st);
    // a fictional 555-01xx number saved by an older Today build is not a phone (10-22)
    if (rec.phone && /5550\d{3}$/.test(String(rec.phone).replace(/\D/g, '')) && !rec.phoneBy) rec.phone = null;
    const digits = String(rec.phone || '').replace(/\D/g, '');
    tel = digits.length === 10 ? '+1' + digits : digits.length === 11 ? '+' + digits : '';
    first = rec.person ? String(rec.person).split(/\s+/)[0] : '';
    optin = !!(rec.optin || rec.optIn || rec.optedIn || rec.past || rec.pastCustomer || rec.customer);
    rec.customer = !!(rec.past || rec.pastCustomer || rec.customer);
    dflt = 'new';   // stage always comes from the shared pipeline (RC.stage); a clean device shows New hit
    // shared with home.js (3D): the roof spec if the Daily 50 drew one, and this home's hail
    window.HOME = { id, rawId, kind, rec, hail, hailTxt, hailDate: hail != null ? hailDay(rec.storm) : '', spec: rec.spec && rec.spec.planes ? rec.spec : null };
    // the county record for this home (address, zip, year built, reroof permit, LiDAR pitch), then re-render
    // county facts: a storm map pick's own index, or a Daily 50 stop's gi (its row in lib/st-data-dfw)
    const gi = mm ? +mm[1] : rec.gi != null ? +rec.gi : null, me = rawId;
    if (OWNDATA && gi != null) RC.owner(gi).then(o => { if (me !== rawId || !o) return; rec.owner = o.name; rec.homestead = o.homestead;
      first = ownerFirst(o.name); if (window.renderRecord) window.renderRecord(); });
    window.HOME_READY = gi != null && window.STM ? STM.facts(gi, rec.lon, rec.lat).then(f => {
      if (me !== rawId) return;
      if (f.addr) { rec.addr = f.addr; rec.place = f.place; }
      if ((rec.lon == null || rec.lat == null) && isFinite(f.lon) && isFinite(f.lat)) { rec.lon = f.lon; rec.lat = f.lat; }   // opened cold by id
      Object.assign(rec, { subdivision: f.subdivision || rec.subdivision, sqft: f.sqft || rec.sqft, year: f.year, permit: f.permit, reroof: f.reroof || null, lidarBefore: f.lidarBefore || null, roofAge: f.roofAge, pitchNote: f.pitch.note, county: f.county || rec.county, gi, roof: f.roof || null });
      window.HOME.roof = rec.roof;   // home.js: the eave rises to the LiDAR story count; the stories chip and the Roof report read it too
      place = rec.place || place; if (window.renderRecord) window.renderRecord();
    }).catch(() => {}) : Promise.resolve();
  }
  // "Rudloff, Paula Jean" -> "Paula"; a trust, company or LLC gives no first name
  function ownerFirst(n) { n = String(n || ''); if (/▒/.test(n)) return '';   // hidden until messaged: no first name in a draft if (/\b(trust|llc|inc|ltd|lp|co|company|estate|bank|homes|properties)\b/i.test(n)) return '';
    const m = /^[^,]+,\s*([A-Za-z'-]+)/.exec(n); const w = m ? m[1] : n.split(/\s+/)[0]; return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''; }
  const urlId = () => { const q = new URLSearchParams(location.search); return q.get('home') || q.get('id') || ''; };
  load(urlId());

  // ---------- icons ----------
  const I = {
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h3.2l1.6 4-2 1.3a11 11 0 0 0 6.9 6.9l1.3-2 4 1.6V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/></svg>',
    text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    hail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="15" r="3"/><circle cx="16.5" cy="9" r="4"/><circle cx="16" cy="18.5" r="1.6"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5v4h4M10 12h5M10 15.5h5"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 19.5h14M14.5 5.5l3 3L9 17H6v-3z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    roof: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 12 12 4.5 21 12M6 10v9.5h12V10"/></svg>',
    door: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 20.5V4.5h11v16M4 20.5h16"/><circle cx="14" cy="12.5" r="1" fill="currentColor"/></svg>'
  };
  const ic = k => `<span class="ic">${I[k]}</span>`;

  // ---------- header bits (per home) ----------
  const crumb = $('#crumb'), stopnav = $('#stopnav');
  function renderHead() {
  document.title = (window.crmView && crmView() !== 'home' ? 'CRM' : rec.addr) + ' | Roof Command';
  if (kind === 'daily') crumb.innerHTML = `<button type="button" class="lnk" data-go="daily">Today's 50</button><span>/</span>Stop ${n}<span>/</span><em>${esc(rec.addr)}</em>`;
  else if (kind === 'map') crumb.innerHTML = `<button type="button" class="lnk" data-go="storm">Storm map</button><span>/</span><em>${esc(rec.addr)}</em>`;
  else crumb.innerHTML = `Today's 50<span>/</span><em>${esc(rec.addr)}</em>`;
  $('#addr').textContent = OWNDATA && place && rec.addr && !/^(Stop|Home from|Today's list)/.test(rec.addr) ? rec.addr + ', ' + place : rec.addr;
  stopnav.hidden = kind === 'sample'; stopnav.innerHTML = '';
  if (kind === 'daily') {
    stopnav.hidden = false;
    // the same count Today's cards say ("Home n of 50"): today's list plus homes added by hand (RC.queue, set by Today)
    const Q = Math.max(RC.queue(), today().length), more = n < today().length;
    stopnav.innerHTML = `<button type="button" data-go="daily">${ic('back')}<span class="lng">Back to </span>Today</button><span>Stop ${n} of ${Q}</span>` + (more ? `<button type="button" data-go="next">Next<span class="lng"> stop</span>${ic('next')}</button>` : '');
  }
  else if (kind === 'map') { stopnav.hidden = false;   // a home with a thread came from the CRM inbox; one without came from the storm map
    const inInbox = window.crmView && RC.history(id).length > 0;
    stopnav.innerHTML = inInbox ? `<button type="button" data-go="inbox">${ic('back')}Back to inbox</button>` : `<button type="button" data-go="storm">${ic('back')}Back to storm map</button>`; }
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-go]'); if (!b) return;
    const g = b.dataset.go;
    if (g === 'inbox') { if (window.crmSetView) window.crmSetView('inbox', false, rawId); return; }
    if (g === 'daily') RC.go('daily', { n });
    else if (g === 'storm') RC.go('storm', { iso: rec.storm || STORM.iso });
    else if (g === 'next') { const nx = today()[n]; if (nx) switchTo(nx.id); }
  });

  // ---------- switch home in place: shell route messages, Next stop, browser Back ----------
  // The CRM (crm.js) owns the view: 'inbox' (three panes), 'pipeline' (the board) or 'home' (this record). Every route
  // this page announces carries the view with the id, so the shell's URL (#/crm/inbox/<id>, #/crm/home/<id>) stays true.
  const curView = () => (window.crmView ? window.crmView() : 'home');
  function announce(push) {
    const view = curView(), u = new URL(location.href); u.searchParams.delete('id');
    if (rawId) u.searchParams.set('home', rawId); else u.searchParams.delete('home');
    u.searchParams.set('view', view);
    try { if (embedded || !push) history.replaceState({ home: rawId, view }, '', u); else history.pushState({ home: rawId, view }, '', u); } catch (e) { }
    if (embedded) window.parent.postMessage({ type: 'route', screen: 'home', params: { id: rawId, view } }, location.origin);
  }
  window.homeAnnounce = announce;
  function switchTo(newId, quiet) {
    newId = newId || defId();
    if (newId === rawId) return;
    if (dlg.open) dlg.close();
    toast.hidden = true; filter = 'all';
    load(newId); renderAll();
    if (window.__switchHome) window.__switchHome();
    if (quiet) return;
    announce(true);
  }
  window.switchHome = switchTo;
  addEventListener('message', e => {
    if (e.origin !== location.origin) return; const d = e.data || {};
    if (d.type === 'route' && (!d.screen || d.screen === 'home')) {
      d.params = d.params || {}; d.params.id = d.params.id || '';   // no id = the default house
      if (d.token && e.source) try { e.source.postMessage({ type: 'routed', token: d.token }, e.origin); } catch (err) { }
      switchTo(d.params.id, true);
      if (window.crmSetView) window.crmSetView(d.params.view || (d.params.id ? 'home' : 'inbox'), true, d.params.id);
      try { const u = new URL(location.href); u.searchParams.delete('id'); if (d.params.id) u.searchParams.set('home', d.params.id); else u.searchParams.delete('home'); u.searchParams.set('view', curView()); history.replaceState({ home: d.params.id, view: curView() }, '', u); } catch (err) { }
    }
  });
  addEventListener('popstate', () => { const q = new URLSearchParams(location.search); switchTo(urlId(), true); if (window.crmSetView) window.crmSetView(q.get('view') || (urlId() ? 'home' : 'inbox'), true, urlId()); if (embedded) window.parent.postMessage({ type: 'route', screen: 'home', params: { id: urlId(), view: curView() } }, location.origin); });

  // ---------- toast with Undo ----------
  const toast = $('#toast'); let toastT = 0;
  window.homeSay = (m, u) => say(m, u);   // the pipeline board (pipe.js) uses the same toast and Undo
  function say(msg, undo) {
    toast.innerHTML = `<span>${esc(msg)}</span>` + (undo ? '<button type="button">Undo</button>' : '');
    toast.hidden = false; clearTimeout(toastT);
    if (undo) toast.querySelector('button').onclick = () => { undo(); toast.hidden = true; };
    toastT = setTimeout(() => { toast.hidden = true; }, 6000);
  }

  // ---------- dialog (text draft, email draft, booking, more) ----------
  const dlg = $('#dlg'), dlgBody = $('#dlgBody'), dlgTitle = $('#dlgTitle');
  function open(title, html, wire) {
    dlgTitle.textContent = title; dlgBody.innerHTML = html;
    if (!dlg.open) dlg.showModal();
    if (wire) wire(dlgBody);
  }
  $('#dlgClose').onclick = () => dlg.close();
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

  // ---------- text ----------
  function draft() {
    // this home's own storm day (the inbox composer and the Next task already use it); the catalog default only when the record has none
    // a home with no 1 in+ hail on file gets no storm line (never another storm's date)
    const hs = hail != null && /^\d{4}-\d{2}-\d{2}/.test(rec.storm || '') ? ` The ${sday(rec.storm)} storm dropped hail on your street.` : '';
    return `Hi${first ? ' ' + first : ''}, this is ${REP} with ${CO}.${hs} Want a free roof check this week?${LIC ? ' ' + LIC + '.' : ''} Reply STOP to opt out.`;
  }
  function textDlg() {
    const c = RC.canText(id, tel || null), can = c.ok;
    open('Text draft', `<p class="dl">${optin ? (rec.customer ? 'Past customer, texts allowed.' : 'Opted in to texts.') : 'Cold homeowner: you send it yourself from your phone, one home at a time.'} ${esc(RC.textWindow().line)}</p>
      <textarea id="smsBody" rows="4" class="draft">${esc(draft())}</textarea>
      <div class="drow">${can ? `<a class="pbtn" id="smsGo" href="#">${ic('text')}Open in Messages</a>` : `<button type="button" class="pbtn" disabled>${ic('text')}${esc(c.reason)}</button>`}<button type="button" id="smsCopy">Copy draft</button></div>`, body => {
      const go = body.querySelector('#smsGo');
      if (go) go.onclick = () => { go.href = 'sms:' + tel + '?&body=' + encodeURIComponent(body.querySelector('#smsBody').value); (RC.logText ? RC.logText(id, 'Text opened in Messages', { body: body.querySelector('#smsBody').value, to: tel }) : RC.note(id, 'Text opened in Messages')); setTimeout(() => dlg.close(), 50); };
      body.querySelector('#smsCopy').onclick = () => { try { navigator.clipboard.writeText(body.querySelector('#smsBody').value); } catch (e) { } say('Draft copied.'); };
    });
  }
  document.querySelectorAll('[data-act="text"]').forEach(b => b.onclick = textDlg);
  // ---------- Proof Page (Bet 3, 10-23): this home's public storm record, sent by hand as a text or email ----------
  // lib/rc-proof.js drafts it (4 touches, lead version marked), the rep taps Open in Messages / Mail, and the send goes
  // on this record (so the owner's full name shows from then on). Opens, consent and inspection asks come back here.
  const proofGi = () => mm ? +mm[1] : rec.gi != null ? +rec.gi : null;
  function proofDlg() {
    const g = proofGi(); if (g == null || !window.RCP) { say('Open a home from the map or Today to send its Proof Page.'); return; }
    // the county address lands a moment after the record opens: never draft "Home from the storm map" as the street
    if (/^(Home from|Stop |Today's list)/.test(rec.addr || '') && window.HOME_READY && !proofDlg.waited) { proofDlg.waited = true; say('Loading the address...'); window.HOME_READY.then(() => { proofDlg(); proofDlg.waited = false; }); return; }
    RCP.sendDialog({ gi: g, street: String(rec.addr || '').split(',')[0], city: rec.city || String(rec.place || '').split(',')[0], first, phone: tel, stormISO: rec.storm, hail,
      warm: optin, facts: { year: rec.year, squares: rec.roof && rec.roof.sq }, onSent: m => { say(m); renderAll(); } });
  }
  document.querySelectorAll('[data-act="proof"]').forEach(b => b.onclick = proofDlg);
  function renderProof() {
    const el = $('#proofSt'), g = proofGi(); if (!el || !window.RCP) return;
    const s = g != null ? RCP.status(g) : null; el.hidden = !s;
    if (s) el.innerHTML = `<b>Proof Page</b>${RCP.statusChips(g)}`;
  }
  addEventListener('rc-proof', renderProof);
  addEventListener('storage', e => { if (e.key === 'rc.t.proof') { renderProof(); renderActivity(); } });   // the page opened in another tab

  // ---------- add a phone the homeowner gave the rep (at the door, a call back): saved with this home on this device ----------
  function phoneDlg() {
    open('Get phone', `<p class="dl">Type a number the homeowner gave you, or one from a source you are allowed to text. It is saved with this home and the Text button uses it. Or ask Wing to find it.</p>
      <input id="phIn" type="tel" inputmode="tel" autocomplete="off" placeholder="(972) 555-1234" class="draft" style="width:100%;box-sizing:border-box;font-size:16px;padding:10px 12px">
      <p class="dl" id="phWhy" hidden></p><div class="drow"><button type="button" class="pbtn" id="phSave">Save phone</button><button type="button" class="pbtn" id="phAsk">Ask Wing to find it</button></div>`, body => {
      const inp = body.querySelector('#phIn'), why = body.querySelector('#phWhy'); inp.value = rec.phone || ''; inp.focus();
      body.querySelector('#phAsk').onclick = () => { RC.remember({ id, phoneAsked: new Date().toISOString().slice(0, 10) }); RC.note(id, 'Asked Wing for the phone'); dlg.close(); say('Asked. Wing will add it to this home.'); };   // records the request only: no lookup runs, nothing is bought
      body.querySelector('#phSave').onclick = () => {
        const d = inp.value.replace(/\D/g, ''), ok = d.length === 10 || (d.length === 11 && d[0] === '1');
        if (!ok) { why.hidden = false; why.textContent = 'Type a 10 digit US number.'; return; }
        const p = d.slice(-10), pretty = `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}`;
        RC.remember({ id, phone: pretty, phoneBy: 'you' }); rec.phone = pretty; rec.phoneBy = 'you'; tel = '+1' + p;
        RC.note(id, 'Phone added: ' + pretty); dlg.close(); say('Phone saved. Text is ready.'); renderAll();
      };
    });
  }

  // ---------- email: the outreach library's draft (lib/rc-copy.js), a mailto: hand-off; held back honestly ----------
  function emailDlg() {
    const C = RC.copy, f = C ? C.factsFromStop(rec, { id, street: rec.addr ? String(rec.addr).split(',')[0] : '', stormISO: rec.storm || null, optedOut: RC.optedOut(id) }) : null;
    const r = C ? C.next(f, 0, optin ? 'optin' : 'cold', 'email') : { blocked: 'no outreach library' };
    const ok = !!r.body && !r.blocked;
    const why = r.blocked === 'opted out' ? 'This homeowner opted out. No more emails.' : r.missing && r.missing.includes('mailingAddress') ? 'Add your mailing address to send emails.' : r.blocked ? 'Email is held back: ' + r.blocked + '.' : '';
    open('Email draft', `<p class="dl">Your mail app opens with the draft. Type the homeowner's address there.</p>
      ${r.body ? `<input id="mSubj" class="draft" value="${esc(r.subject || '')}" aria-label="Subject"><textarea id="mBody" rows="7" class="draft" aria-label="Email">${esc(r.body)}</textarea>` : ''}
      ${why ? `<p class="dl">${esc(why)}</p>` : ''}
      <div class="drow">${ok ? `<a class="pbtn" id="mGo" href="#">${ic('mail')}Open in Mail</a>` : `<button type="button" class="pbtn" disabled>${ic('mail')}Open in Mail</button>`}</div>`, body => {
      const go = body.querySelector('#mGo');
      if (go) go.onclick = () => { const sj = body.querySelector('#mSubj').value, bd = body.querySelector('#mBody').value;
        go.href = 'mailto:?subject=' + encodeURIComponent(sj) + '&body=' + encodeURIComponent(bd); RC.logEmail(id, 'Email drafted', { subject: sj, body: bd }); setTimeout(() => dlg.close(), 50); };
    });
  }
  document.querySelectorAll('[data-act="email"]').forEach(b => b.onclick = emailDlg);

  // ---------- book / reschedule ----------
  const pad = x => String(x).padStart(2, '0');
  const archivedOf = tid => (RC.pipeline()[tid] || {}).archived || null;   // parked in the board's Not now lane (pipe.js)
  // book(): this home. book({ id, addr, onCancel }) books any home (the pipeline board's hand-off when a card is dropped
  // on Inspection booked); closing the dialog without booking calls onCancel, so the card goes back where it was.
  function book(t) {
    t = t && t.id ? t : null;
    const tid = t ? t.id : id, taddr = t ? t.addr : rec.addr;
    const cur = RC.booking(tid), base = cur ? new Date(cur) : new Date(Date.now() + 864e5);
    const ds = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
    const slots = []; for (let h = 8; h <= 19; h++) for (const m of [0, 30]) slots.push(`${pad(h)}:${pad(m)}`);
    const curT = cur ? `${pad(base.getHours())}:${pad(base.getMinutes())}` : '17:30';
    const now = new Date(), today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const lbl = t => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'am' : 'pm'}`; };
    let done = false;
    open(cur ? 'Reschedule the inspection' : 'Book an inspection', `<p class="dl">${esc(taddr)}. ${cur ? 'Booked for ' + esc(RC.when(cur)) + '.' : 'Pick a day and time with the homeowner.'}</p>
      <div class="pick"><label class="fl">Day<input type="date" id="bkD" value="${ds < today ? today : ds}" min="${today}"></label><label class="fl">Time<select id="bkT">${slots.map(t => `<option value="${t}"${t === curT ? ' selected' : ''}>${lbl(t)}</option>`).join('')}</select></label></div>
      <div class="drow"><button type="button" class="pbtn" id="bkGo">${ic('cal')}${cur ? 'Move the inspection' : 'Book it'}</button>${t ? '<button type="button" id="bkNo">Cancel</button>' : ''}</div>`, body => {
      const no = body.querySelector('#bkNo'); if (no) no.onclick = () => dlg.close();
      body.querySelector('#bkGo').onclick = () => {
        const dIn = body.querySelector('#bkD'), d = dIn.value, tm = body.querySelector('#bkT').value;
        // a day is required and the time cannot already be past (an inspection is booked ahead, never backdated)
        const at = d ? new Date(`${d}T${tm}:00`) : null;
        if (!at || isNaN(at) || at.getTime() < Date.now()) { dIn.setCustomValidity(d ? 'Pick a day and time that is still ahead.' : 'Pick a day.'); dIn.reportValidity(); dIn.addEventListener('input', () => dIn.setCustomValidity(''), { once: true }); return; }
        // no double booking: the calendar (cal.js) holds the one rule every booking goes through (another home's slot, same length)
        const tIn = body.querySelector('#bkT'); if (window.calTaken && window.calTaken(at.toISOString(), tid)) { tIn.setCustomValidity('That time is already booked for another home. Pick another.'); tIn.reportValidity(); tIn.addEventListener('change', () => tIn.setCustomValidity(''), { once: true }); return; }
        const iso = at.toISOString(), prev = RC.stage(tid, dflt), prevB = RC.booking(tid), prevA = archivedOf(tid);
        done = true;
        // same history line as RC.book; a home parked in Not now comes back to the board when it is booked
        RC.setStage(tid, 'inspection', 'Inspection booked for ' + RC.when(iso) + ', with ' + REP, { booked: iso, archived: null });
        dlg.close(); say((t ? taddr + ': i' : 'I') + 'nspection booked for ' + RC.when(iso) + '.', () => RC.setStage(tid, prev, 'Booking undone', { booked: prevB || null, archived: prevA || null }));
      };
    });
    dlg.addEventListener('close', () => { if (!done && t && t.onCancel) t.onCancel(); }, { once: true });
  }
  // the booked inspection as a calendar file (.ics) the roofer opens in their own calendar app. Built on this device,
  // nothing is sent anywhere; one hour, the address as the location.
  function icsFile(tid) {
    const b = RC.booking(tid); if (!b) return false;
    const r = tid === id ? rec : (RC.recall(tid) || {}), p = tid !== id && RC.todayPick ? RC.todayPick(tid) : null;
    const addr = tid === id ? rec.addr : p ? p.street || r.addr || 'Home' : r.addr || 'Home';
    const where = tid === id ? place : p && p.city ? `${p.city}, ${ST8} ${p.zip || ''}`.trim() : r.place || r.city || '';
    const z = t => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ex = s => String(s).replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n');
    const start = Date.parse(b);
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Roof Command//Homes//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:' + tid + '-' + z(start) + '@roofcommand', 'DTSTAMP:' + z(Date.now()), 'DTSTART:' + z(start), 'DTEND:' + z(start + 36e5),
      'SUMMARY:' + ex('Roof inspection, ' + addr), 'LOCATION:' + ex(addr + (where ? ', ' + where : '')),
      'DESCRIPTION:' + ex(`Inspection booked in Roof Command for ${RC.when(b)}, with ${REP}.`),
      'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:' + ex('Roof inspection, ' + addr), 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
    const url = URL.createObjectURL(new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar' }));
    const a = document.createElement('a'); a.href = url; a.download = 'inspection-' + addr.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.ics';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  }
  window.homeIcs = icsFile;   // pipe.js: the same calendar file from a booked card
  window.homeBook = book;     // pipe.js: a card dropped on Inspection booked always gets a time
  window.homeDialog = open;   // pipe.js: the Won confirmation uses the same dialog
  window.homeDialogEl = dlg;
  document.querySelectorAll('[data-act="book"]').forEach(b => b.onclick = () => book());

  // ---------- more ----------
  $('#bMore').onclick = () => open('More', `<div class="menu">
      <button type="button" data-m="note">${ic('note')}Add a note</button>
      ${/^m\d+$/.test(rawId || '') ? `<a href="hail-report.html?id=${encodeURIComponent(rawId)}${/[?&]dev=1/.test(location.search) ? '&dev=1' : ''}" target="_blank" rel="noopener">${ic('doc')}Storm report for the homeowner</a>` : ''}
      ${/^m\d+$/.test(rawId || '') ? `<a href="walk-sheet.html?id=${encodeURIComponent(rawId)}${/[?&]dev=1/.test(location.search) ? '&dev=1' : ''}" target="_blank" rel="noopener">${ic('roof')}Walk sheet for this street</a>` : ''}
      <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rec.addr + ', ' + place)}" target="_blank" rel="noopener">${ic('roof')}Directions in Maps</a>
      ${kind === 'daily' ? `<button type="button" data-go="daily">${ic('back')}Back to Daily 50</button>` : ''}</div>`, body => {
      body.querySelector('[data-m="note"]').onclick = () => { dlg.close(); setTab('notes'); openNote(); };
    });

  // ---------- stage stepper ----------
  const stepsEl = $('#steps');
  function stepSub(k, hist) {
    const last = re => { const h = hist.find(x => re.test(x.what)); return h ? fmtDay(h.at) : ''; };
    if (k === 'new') return hail != null && /^\d{4}-\d{2}-\d{2}$/.test(rec.storm || '') ? `${sday(rec.storm, true)}, ${hail.toFixed(2)} in hail` : hail != null ? hail.toFixed(2) + ' in hail' : 'No hail on file';
    if (k === 'called') { const a = hist.find(x => x.dir !== 'in' && (x.kind === 'text' || x.kind === 'email')); if (a) return fmtDay(a.at) + ', ' + (a.kind === 'email' ? 'email' : 'text');
      const mv = hist.find(x => x.kind === 'stage' && /^Moved to (Called|Contacted)/.test(x.what)); return RC.stage(id) !== 'new' && mv ? 'Moved here ' + fmtDay(mv.at) : 'Not yet'; }
    if (k === 'inspection') { const b = RC.booking(id); return b ? RC.when(b) : RC.stage(id) === 'inspection' ? 'Time not set' : 'Not yet'; }
    if (k === 'proposal') return last(/proposal|Moved to Proposal|Inspection done/i) || 'After inspection';
    if (k === 'handoff') { const d = last(/^Moved to Sent to|handoff|handed/i); return d ? 'Handed over ' + d : 'Handed to ' + (REP || 'the owner'); }
    return 'Signed contract';
  }
  function renderSteps() {
    const st = RC.stage(id, dflt), idx = RC.STAGES.findIndex(s => s[0] === st), hist = RC.history(id);
    stepsEl.innerHTML = RC.STAGES.map((s, i) => `<button type="button" class="st${i < idx ? ' dn' : ''}${i === idx ? ' on' : ''}" data-s="${s[0]}" aria-current="${i === idx ? 'step' : 'false'}"><span class="d">${i < idx ? I.check : i + 1}</span><span><b>${s[1]}</b><small>${esc(stepSub(s[0], hist))}</small></span></button>`).join('');
  }
  stepsEl.onclick = e => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    const k = b.dataset.s, prev = RC.stage(id, dflt); if (k === prev) return;
    if (k === 'inspection' && !RC.booking(id)) { book(); return; }
    const prevA = archivedOf(id);
    RC.setStage(id, k, 'Moved to ' + RC.stageName(k), { archived: null });
    say('Moved to ' + RC.stageName(k) + '.', () => RC.setStage(id, prev, 'Moved back to ' + RC.stageName(prev), { archived: prevA || null }));
  };

  // ---------- header sub line, contact ----------
  function renderSub() {
    const st = RC.stage(id, dflt);
    $('#rsub').innerHTML = `<span class="stagepill">${esc(RC.stageName(st))}</span>${archivedOf(id) ? '<span class="stagepill nn" title="Parked in Not now on the pipeline board. Restore it there, or move it on the stage bar.">Not now</span>' : ''}${window.RCROOF ? RCROOF.chip(rec.roof) : ''}<span>${esc(place)}</span>${OWNDATA && rec.subdivision ? `<span>${esc(rec.subdivision)}</span>` : ''}<span>${OWNDATA ? (rec.owner ? RC.blurHTML(rec.owner) : RC.OWNER_NONE) : rec.person ? esc(rec.person) + ' <i class="smp">sample</i>' : 'Owner name not available'}</span>`;
    const c = RC.canText(id, tel || null);
    document.querySelectorAll('.callwhy').forEach(w => { w.hidden = c.ok; w.innerHTML = esc(c.reason) + (tel ? '' : ' <button type="button" class="addph" data-act="addphone">Get phone</button>'); });
    document.querySelectorAll('[data-act="addphone"]').forEach(b => b.onclick = phoneDlg);
    document.querySelectorAll('.bookLbl').forEach(l => { l.textContent = RC.booking(id) ? 'Reschedule' : 'Book'; });
    const kv = [['Owner', OWNDATA ? (rec.owner ? RC.blurHTML(rec.owner) + (rec.homestead ? ', homestead' : '') + ' (on file)' : RC.OWNER_NONE) : rec.person ? esc(rec.person) + ' (sample)' : 'Owner name not available'], ['Phone', rec.phone ? esc(rec.phone) + (rec.phoneBy === 'you' ? ' <i class="src">added by you</i>' : '') : '<button type="button" class="addph" data-act="addphone">Get phone</button>'],
      ['Texts', optin ? (rec.customer ? 'Past customer' : 'Opted in') : 'Not yet opted in'], ['Texting hours', esc(RC.textWindow().label)],
      ['Hail here', hail != null ? hail.toFixed(2) + ' in' + (window.HOME.hailDate ? ', ' + esc(window.HOME.hailDate) : '') + ' <i class="src">NOAA MRMS radar</i>' : 'No 1 in+ hail on file (last 24 months) <i class="src">NOAA MRMS radar</i>'],
    ].concat(LIC ? [['License on texts', LIC]] : []);
    const row = r => `<div><span>${r[0]}</span><b>${r[1]}</b></div>`;
    $('#kv').innerHTML = kv.map(row).join('') + (RC.tracedRows ? RC.tracedRows(rec.addr, rec.zip) : '');
    keyFacts();
    const fx = $('#facts'); if (fx) fx.innerHTML = [kv.find(r => r[0] === 'Hail here')].concat(houseFacts()).map(row).join('');
  }
  // ---------- key facts first (Jack 10-23): the row under the address, every figure from its source ----------
  let lastHail = { id: null, v: undefined };
  function keyFacts() {
    const el = $('#keyf'); if (!el) return;
    const gi = rec.gi != null ? +rec.gi : mm ? +mm[1] : null, me = rawId;
    if (gi != null && window.RCH && lastHail.id !== me) { lastHail = { id: me, v: undefined };
      RCH.history(gi).then(h => { if (lastHail.id !== me) return; const hit = (h || []).filter(x => x.inches >= 1).sort((a, b) => a.iso < b.iso ? 1 : -1)[0];
        lastHail.v = hit || null; lastHail.since = h && h.length ? h[h.length - 1].date : ''; keyFacts(); }).catch(() => { lastHail.v = null; keyFacts(); }); }
    const cell = (a, v, s, c) => `<div${c ? ` class="${c}"` : ''}><span>${a}</span><b>${v}</b>${s ? `<i>${s}</i>` : ''}</div>`, out = [];
    const own = OWNDATA ? (rec.owner || null) : (rec.person || null);
    out.push(cell('Owner', own ? RC.blurHTML(own) : 'Not loaded', own ? (/▒/.test(own) ? 'name on file, unlocks when you message this home' : 'county roll') : ''));
    if (rec.year) out.push(cell('House', 'Built ' + rec.year, (new Date().getFullYear() - rec.year) + ' yrs, county record'));
    const lh = lastHail.v;
    out.push(cell('Last 1 in+ hail', lh === undefined ? 'Checking' : lh ? lh.inches.toFixed(2) + ' in' : 'None on file', lh ? esc(lh.date) + ', radar' : lh === null && lastHail.since ? 'radar, storms since ' + esc(lastHail.since) : ''));
    const R = rec.reroof; if (R && !R.none) out.push(cell('Last re-roof', esc(R.date), R.done ? 'permit ' + esc(R.permit) : 'permit, work not confirmed'));
    else if (R && R.none) out.push(cell('Last re-roof', 'No permit', 'on file since ' + R.since));
    const W = window.RCROOF && rec.roof ? RCROOF.words(rec.roof) : null;
    if (W && W.sq > 0) out.push(cell('Roof size', '~' + W.sq + ' sq', RCROOF.SQ_NOTE, 'kf-sq'));   // wider card: the note no longer stretches the row (visual check 10-23)
    el.innerHTML = out.join('');
  }
  // the house facts on the lead card (Jack 10-22): each line only when its source has it, always naming the source, never a guess
  function houseFacts() {
    const out = [], cad = rec.county ? String(rec.county).replace(/ County.*$/, '') + ' CAD' : 'county appraisal roll';
    const W = window.RCROOF && rec.roof ? RCROOF.words(rec.roof) : null, ly = rec.roof && rec.roof.year ? rec.roof.year : 2018;
    // roof size: the LiDAR roof record (footprint over the pitch, plus overhang); median 6 to 8% off the roofer's own count on
    // 30 Frisco permits (tour/audit/roof-accuracy/answer-key/REPORT.md)
    if (W && W.sq > 0) out.push(['Roof size', `~${W.sq} squares <i class="src">${RCROOF.SQ_NOTE} (${ly} LiDAR)</i>`]);
    if (!W && rec.lidarBefore) out.push(['Roof size', `Not measured <i class="src">built ${rec.year}, after the ${rec.lidarBefore} LiDAR flew</i>`]);
    if (W && W.pitch) out.push(['Pitch', `${esc(W.pitch)} <i class="src">${ly} LiDAR, to the nearest 12th</i>`]);
    if (rec.year) out.push(['Year built', `${rec.year} <i class="src">${esc(cad)}</i>`]);
    if (rec.sqft) out.push(['Living area', `${(+rec.sqft).toLocaleString('en-US')} sq ft <i class="src">${esc(cad)}</i>`]);
    const R = rec.reroof;
    if (R) out.push(['Last re-roof', R.none ? `${esc(R.text)} <i class="src">${esc(R.src)}</i>`
      : `${esc(R.text)} <i class="src">${esc(R.means)}; ${R.conf} confidence; ${esc(R.src)}</i>`]);
    return out;
  }

  // ---------- next task (+ proposal stage block from the old record page) ----------
  function measures() { return window.HOME.measure || null; }
  function renderNext() {
    const st = RC.stage(id, dflt), b = RC.booking(id), hist = RC.history(id);
    let t;
    // the last door knock found nobody home (knock.js): the next task is the return visit, the text stays one tap away (10-19)
    const kn = (st === 'new' || st === 'called') ? hist.find(x => /^Knocked: /.test(x.what || '')) : null, km = kn && /not home/.test(kn.what) ? /Come back (.+?)\.?$/.exec(kn.what) : null;
    if (km) t = { due: 'Come back ' + km[1], h: 'Knock again', why: 'Nobody was home on ' + fmtDay(kn.at) + '. Or send the text draft now: it goes from your phone, inside texting hours.', done: 'Knocked', alt: 'Book' };
    else if (st === 'new') t = { due: 'Today, ' + RC.textWindow().today, h: 'Send the first text', why: `${hail != null ? hail.toFixed(2) + ' in hail here' + (window.HOME.hailDate ? ' on ' + esc(window.HOME.hailDate) : '') + ' (radar)' : 'No 1 in+ hail on file for this home'}.${rec.roofAge ? ' ' + esc(rec.roofAge) + '.' : ''} ${esc(RC.textWindow().line)}`, done: 'Texted', alt: 'Book' };
    else if (st === 'called') {
      // the cadence decides the next touch (lib/rc-queue.js RC.cadence): day 3 / 7 / 30 email, or stopped by a reply
      const c = RC.cadence ? RC.cadence(id) : null, dayF = k => new Date(k + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
      if (c && c.stopped === 'replied') t = { due: 'Now', h: 'They replied: answer them and book the inspection', why: 'The cold follow-ups stopped when they wrote back. Answer from the CRM inbox.', alt: 'Book' };
      else if (c && c.stopped) t = { due: 'No follow-ups', h: RC.cadenceStopText ? RC.cadenceStopText(c.stopped) : 'No follow-ups', why: esc((hist[0] || {}).what || 'Contacted') + '.', alt: 'Book' };
      else if (c && c.lastContact) t = { due: c.overdue ? c.daysOverdue + ' day' + (c.daysOverdue === 1 ? '' : 's') + ' overdue' : c.dueToday ? 'Today' : dayF(c.nextDue), h: 'Day ' + c.step + ' ' + (c.channel || 'email') + ' follow-up', why: 'Last contact ' + fmtDay(c.lastContact) + '. ' + (c.channel === 'text' ? esc(RC.textWindow().line) : 'Follow-ups after the first text go by email.'), alt: 'Book' };
      else t = { due: 'Next follow-up', h: 'Follow up by text or email and book the inspection', why: esc((hist[0] || {}).what || 'Contacted') + '.', alt: 'Book' };
    }
    else if (st === 'handoff') { const o = RC.stageName('handoff').replace(/^Sent to /, ''); t = { due: 'Handed over', h: o + ' calls the homeowner, then book the inspection', why: esc((hist[0] || {}).what || 'Handed over') + '. Book the time here once they have talked.', alt: 'Book' }; }   // was falling through to Won's "Schedule the install"
    else if (st === 'inspection') t = { due: b ? RC.when(b) : 'Not booked yet', h: 'Inspect the roof', why: 'Walk the slopes that faced the storm, photos of every hail mark, check the ridge caps.', done: 'Inspection done', alt: 'Reschedule' };
    else if (st === 'proposal') { const ps = RC.proposalSentAt ? RC.proposalSentAt(id) : null;
      t = ps ? { due: 'Sent ' + fmtDay(ps), h: 'Follow up on the proposal. Ask if they want to walk through it.', why: 'No price promises by text.', alt: 'Reschedule' }
        : { due: 'Not sent yet', h: 'Send the proposal', why: 'Open the proposal, print or save it as a PDF for the homeowner, then mark it sent.', done: 'Proposal sent', alt: 'Reschedule' }; }
    else t = { due: 'Signed', h: 'Schedule the install', why: 'Order materials from the estimated squares plus waste, after a site check.', alt: 'Reschedule' };
    $('#next').innerHTML = `<div class="nh"><span class="pill soft">Next task</span><span class="due">${ic('clock')}${esc(t.due)}</span></div><h4>${t.h}</h4><p class="why">${t.why}</p>
      <div class="row"><button type="button" id="tDone">Done</button><button type="button" data-act="book">${t.alt}</button></div>${st === 'inspection' && b ? `<button type="button" class="calx" id="tCal">${ic('cal')}Add to calendar<small>.ics file</small></button>` : ''}`;
    const tc = $('#tCal'); if (tc) tc.onclick = () => { if (icsFile(id)) say('Calendar file saved. Open it to add the inspection to your calendar.'); };
    $('#tDone').onclick = () => {
      if (km) { const kp = $('#knockPanel'); if (kp) kp.scrollIntoView({ behavior: 'smooth', block: 'center' }); say('Log how the knock went under At the door.'); return; }
      const prev = RC.stage(id, dflt);
      if (st === 'inspection') { RC.setStage(id, 'proposal', 'Inspection done, proposal next'); say('Inspection done. Moved to Proposal.', () => RC.setStage(id, prev, 'Moved back to ' + RC.stageName(prev))); }
      else if (st === 'proposal' && RC.proposalSent && !RC.proposalSentAt(id)) { RC.proposalSent(id); say('Proposal marked sent.'); }
      else { RC.note(id, 'Task done: ' + t.h.replace(/\..*$/, '')); say('Task marked done.'); }
    };
    $('#next [data-act="book"]').onclick = () => book();
    // proposal block
    const pb = $('#proposal'), M = measures();
    pb.hidden = st !== 'proposal';
    if (st === 'proposal') {
      const sq = M ? M.squares : rec.sq, waste = M ? M.waste : 15, order = sq ? Math.round(sq * (1 + waste / 100) * 10) / 10 : null;
      const ps = RC.proposalSentAt ? RC.proposalSentAt(id) : null;
      pb.innerHTML = `<div class="ph"><h3>Proposal</h3><span class="pill">${ps ? 'Sent ' + fmtDay(ps) : 'Not sent yet'}</span></div>
        <div class="kv pk">
        <div><span>${M && M.drawn ? 'Drawn by you' : M && M.facet ? 'Measured' : 'Estimated'}</span><b title="${window.RealRoof ? RealRoof.tip(M) : 'Estimated from public building outlines and 2018 LiDAR. Verify on site.'}">${sq != null ? (M && M.facet ? sq + ' sq, LiDAR roof facets, pitch ' + esc(M.pitch) : '~' + sq + ' sq (est.)') + (M && M.drawn && !M.pitchMeasured ? ', pitch estimated' : '') : 'Not estimated'}</b></div>
        <div><span>Waste</span><b>${waste}%, from the hips and valleys</b></div>
        <div><span>Order</span><b>${order != null ? (M && M.facet ? order + ' sq, verify on site' : '~' + order + ' sq (est.)') : 'After the site check'}</b></div>
        </div>
        <p class="note">Quantities come from the drawing. Price, claim amounts and deductibles are set with the homeowner, never promised here.</p>`;
    }
  }

  // ---------- activity + notes ----------
  // the only event not in RC.history is the storm itself (real date); calls, texts and notes come from the shared pipeline
  // only when the home has its own storm on file: a home with no 1 in+ hail gets no storm event
  const BASE_EV = () => hail != null && /^\d{4}-\d{2}-\d{2}$/.test(rec.storm || '') ? [
    { at: rec.storm + 'T21:30:00Z', what: `Storm hit this home. ${hailTxt} hail here on radar.`, kind: 'storm', hot: true }
  ] : [];
  const BASE_NOTES = () => [];
  const isCall = h => /^(Called|Call|Wrong number)/.test(h.what);
  const isText = h => /^Text/.test(h.what);
  const isKnock = h => /^Knocked: /.test(h.what || '');   // At the door (knock.js), 10-19
  const isNote = h => h.kind === 'note' && !isCall(h) && !isText(h) && !isKnock(h) && !/^(Task done|Email)/.test(h.what);
  let filter = 'all';
  function fmtDay(iso) { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  function evHTML(h) {
    const d = new Date(h.at), icon = h.kind === 'storm' ? 'hail' : isKnock(h) ? 'door' : isCall(h) ? 'phone' : isText(h) ? 'text' : h.kind === 'email' ? 'mail' : h.kind === 'stage' ? 'check' : h.kind === 'doc' ? 'doc' : 'note';
    return `<div class="ev${h.hot ? ' hot' : ''}"><div class="dt"><small>${d.toLocaleDateString('en-US', { month: 'short' })}${d.getFullYear() !== new Date().getFullYear() ? ' ’' + String(d.getFullYear()).slice(2) : ''}</small><b>${d.getDate()}</b></div><div><div class="et">${ic(icon)}<span>${esc(h.what.split('. ')[0])}</span><time>${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()}</time></div>${h.what.indexOf('. ') > 0 ? `<div class="ed">${esc(h.what.slice(h.what.indexOf('. ') + 2))}</div>` : ''}<div class="who">By ${esc(h.who || REP)}</div></div></div>`;
  }
  function renderActivity() {
    const all = RC.history(id).concat(BASE_EV().map(e => Object.assign({ base: 1 }, e)), BASE_NOTES());
    const list = all.filter(h => filter === 'all' ? true : filter === 'emails' ? (h.kind === 'email' || /^Email/.test(h.what)) : filter === 'texts' ? isText(h) : filter === 'knocks' ? isKnock(h) : isNote(h));
    $('#tl').innerHTML = list.length ? list.map(evHTML).join('') : `<p class="empty">${filter === 'emails' ? 'No emails yet.' : filter === 'texts' ? 'No texts yet.' : filter === 'knocks' ? 'No door knocks yet. Log one under At the door.' : filter === 'notes' ? 'No notes yet.' : 'Nothing here yet.'}</p>`;
    $('#afil').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.f === filter ? 'true' : 'false'));
    $('#actN').textContent = all.length;
    const notes = RC.history(id).filter(isNote).concat(BASE_NOTES());
    $('#noteN').textContent = notes.length;
    $('#notelist').innerHTML = notes.map(h => `<div class="notecard">${esc(h.what)}<small>${esc(h.who || REP)}, ${fmtDay(h.at)}</small></div>`).join('');
  }
  $('#afil').onclick = e => { const b = e.target.closest('[data-f]'); if (b) { filter = b.dataset.f; renderActivity(); } };
  const nf = $('#noteform'), addBtn = $('#addNote');
  function openNote() { nf.hidden = false; addBtn.hidden = true; $('#noteText').focus(); }
  addBtn.onclick = openNote;
  $('#noteCancel').onclick = () => { nf.hidden = true; addBtn.hidden = false; $('#noteText').value = ''; };
  nf.onsubmit = e => { e.preventDefault(); const v = $('#noteText').value.trim(); if (!v) return; RC.note(id, v); $('#noteText').value = ''; nf.hidden = true; addBtn.hidden = false; say('Note saved.'); };

  // tabs (Measurements / Activity / Notes / Contact), shared with home.js
  const tabs = $('#tabs');
  function setTab(t) {
    tabs.querySelectorAll('button').forEach(b => { const on = b.dataset.t === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    document.querySelectorAll('.tab').forEach(p => p.classList.toggle('on', p.dataset.t === t));
  }
  window.setTab = setTab;
  // the 3D toolbar's LiDAR measurements chip: the measurements tab, scrolled into view
  { const bm = $('#bMeasure'); if (bm) bm.onclick = () => { (window.setTab || setTab)('report'); const t = $('#measPanel'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }; }
  tabs.onclick = e => { const b = e.target.closest('button'); if (b) setTab(b.dataset.t); };

  // ---------- Roof report tab: the per-facet LiDAR report (lib/rc-roof.js); a home without one keeps its outline estimate ----------
  const reportEl = $('#report');
  // the report's top-down drawing is the roof the 3D view draws (lib/real-roof.js spec: the chosen model, or the clean house),
  // never the raw LiDAR facet rings; memoised per home and per roof record
  let repSV = { k: null, svg: '' };
  function reportSVG() {
    const RR = window.RealRoof, gi = rec.gi != null ? +rec.gi : mm ? +mm[1] : null; if (!RR || gi == null || !RR.mapCached) return '';
    const e = RR.mapCached(gi); if (!e || !e.facts || !e.facts.roof) return '';
    const k = gi + ':' + (e.facts.roof.sq || '') + ':' + RR.modelFor(e); if (repSV.k === k) return repSV.svg;
    let svg = ''; try { const sp = RR.spec(e, { seed: gi % 9973 }); svg = sp && !sp.none ? RR.planSVG(sp, 760) : ''; } catch (err) { svg = ''; }
    repSV = { k, svg }; return svg;
  }
  const linesAsked = new Set();   // homes whose shared roof lines were requested once (a home with no record stays on the fallback)
  function renderReport() {
    if (!reportEl || !window.RCROOF) return;
    const me = rawId, M = measures(), est = M ? { squares: M.squares, pitch: M.pitch, planes: M.planes ? M.planes.length : 0 } : {};
    const paint = d => { if (me !== rawId) return; const h = RCROOF.reportHTML(rec.roof, d, est, { svg: reportSVG() }); if (reportEl.__h !== h) { reportEl.innerHTML = h; reportEl.__h = h; } };
    // roof shape being checked (no model passed its gates): the LiDAR total and pitch only, no drawing, facets or edge lengths
    if (M && M.checking && window.RCMEASURE) { if (me !== rawId) return;
      const gi = rec.gi != null ? +rec.gi : mm ? +mm[1] : null, e = gi != null && window.RealRoof && RealRoof.mapCached ? RealRoof.mapCached(gi) : null;
      if (gi != null && window.RCLINES && RCLINES.lines && !RCLINES.now(gi) && !linesAsked.has(gi)) linesAsked.add(gi), RCLINES.lines(gi).then(() => { reportEl.__h = null; renderReport(); }).catch(() => {});   // shared roof lines, once their tile is in
      const h = RCMEASURE.viewHTML({ gi, entry: e, words: rec.roof && window.RCROOF ? RCROOF.words(rec.roof) : null, year: rec.roof && rec.roof.year });
      if (h) { if (reportEl.__h !== h) { reportEl.innerHTML = h; reportEl.__h = h; } return; } }
    if (M && M.checking) { if (me !== rawId) return; const W = rec.roof && window.RCROOF ? RCROOF.words(rec.roof) : null;
      const h = `<div class="rr-none"><b>Roof shape being checked</b><p>${W && W.sq > 0 ? `Roof size ~${W.sq} squares and pitch ${esc(W.pitch)}, from ${rec.roof.year || 2018} LiDAR: ${RCROOF.SQ_NOTE}.` : 'No LiDAR roof record covers this home, so there is no roof size.'} The roof drawing, facets and edge lengths show once this home's roof shape passes its soundness and LiDAR fit checks. Verify on site.</p></div>`;
      if (reportEl.__h !== h) { reportEl.innerHTML = h; reportEl.__h = h; } return; }
    if (!rec.roof || (!rec.roof.facets && !rec.roof.est)) return paint(null);
    RCROOF.detail(rec.gi).then(paint, () => paint(null));
  }
  function renderAll() { renderHead(); renderSub(); renderProof(); renderSteps(); renderNext(); renderActivity(); renderReport(); if (window.renderPipe) window.renderPipe(); if (window.renderCRM) window.renderCRM(); }
  // the stage control the CRM thread and home pane share with the stage bar (same rules: Inspection booked needs a time)
  window.homeSetStage = function (tid, k) {
    const prev = RC.stage(tid, dflt); if (k === prev && !archivedOf(tid)) return;
    if (k === 'inspection' && !RC.booking(tid)) { book(tid === id ? null : { id: tid, addr: (RC.recall(tid) || {}).addr || 'Home' }); return; }
    const prevA = archivedOf(tid);
    RC.setStage(tid, k, 'Moved to ' + RC.stageName(k), { archived: null });
    say('Moved to ' + RC.stageName(k) + '.', () => RC.setStage(tid, prev, 'Moved back to ' + RC.stageName(prev), { archived: prevA || null }));
  };
  window.renderRecord = renderAll;
  // the roofer's own catalog lands after the first paint: paint again with it
  RC.factsReady.then(() => renderAll());
  // today's list lands after the first paint: a home on it becomes "Stop n of 50" with the list's own facts, an old route
  // id or no id opens its stop, and the 3D redraws when the hail it shows changed
  if (RC.queueReady) RC.queueReady.then(() => {
    if (!rawId) { const l = today(), t = pendingStop ? (l[pendingStop - 1] || l[0]) : l[0]; pendingStop = 0; if (t) { switchTo(t.id, true); announce(false); } return; }
    const h0 = hail; if (applyPick()) { renderAll(); if (h0 !== hail && window.__switchHome) window.__switchHome(); }
  });
  RC.on(renderAll);
  renderAll();
  setInterval(renderSub, 60000); // texting hours open and close on the clock
})();
