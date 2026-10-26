/* nimbus-tools.js: the action layer Nimbus drives the app through (Jack 10-26: "runs the software for them").
   One registry of tools over RC (lib/rc-state.js) and the screens in the product shell. Every tool:
     - says what it does on screen while it does it (NimbusTools.point rings the button or card it touches, with a label)
     - returns { ok, say, detail?, data?, undo? }: say = one or two short spoken sentences, no em dashes
   The same registry serves both brains: the Claude brain on the local server (tool_use blocks, scripts/nimbus/server.py) and
   the built-in brain (lib/nimbus-brain.js, demo and offline). NimbusTools.schemas() is what the model is told.
   Hard rules kept here, not in a prompt: nothing sends (texts and emails open as drafts a person sends), every write has
   Undo, owner names and phone numbers are never put into tool results (they stay on this device).
   Plain script, shell only (product.html), after nimbus-shell.js. window.NimbusTools. */
(function () {
  'use strict';
  if (window.NimbusTools || !window.RC) return;
  const RC = window.RC, DAY = 864e5;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WD = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const short = a => String(a || '').split(',')[0].trim();
  const dayLabel = iso => { const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z'); return MON[d.getUTCMonth()] + ' ' + d.getUTCDate() + (d.getUTCFullYear() !== new Date().getFullYear() ? ', ' + d.getUTCFullYear() : ''); };
  const spokenWhen = iso => new Date(iso).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(':00', '');
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

  // ---------- the screens ----------
  const screen = () => document.body.dataset.screen || 'daily';
  const frameEl = s => document.querySelector('#f iframe[data-screen="' + s + '"]');
  const win = s => { try { const f = frameEl(s); return f && f.contentWindow && f.contentDocument && f.contentDocument.body ? f.contentWindow : null; } catch (e) { return null; } };
  async function waitFor(fn, ms) {
    const t0 = Date.now();
    for (;;) { let v = null; try { v = fn(); } catch (e) { } if (v) return v; if (Date.now() - t0 > (ms || 6000)) return null; await sleep(120); }
  }
  function go(s, params) { if (window.Nimbus && Nimbus.run) Nimbus.run(s, params || {}); else location.hash = '#/' + s; }
  // the Today frame's RC carries the daily list (lib/rc-queue.js)
  const dailyRC = () => { const w = win('daily'); return w && w.RC && w.RC.daily ? w.RC : null; };
  const dailyList = () => { const R = dailyRC(); try { return R ? R.daily() : []; } catch (e) { return []; } };

  // ---------- showing what Nimbus touches: a ring on the element and a label, in the shell's coordinates ----------
  let ringEl = null, ringT = 0;
  function ring() {
    if (ringEl) return ringEl;
    ringEl = document.createElement('div'); ringEl.className = 'nbv-ring'; ringEl.setAttribute('aria-hidden', 'true');
    ringEl.innerHTML = '<span></span>'; document.body.appendChild(ringEl); return ringEl;
  }
  function rectIn(el) {
    const r = el.getBoundingClientRect(), d = el.ownerDocument;
    if (d === document) return r;
    const fr = [...document.querySelectorAll('#f iframe')].find(f => { try { return f.contentDocument === d; } catch (e) { return false; } });
    const o = fr ? fr.getBoundingClientRect() : { left: 0, top: 0 };
    return { left: r.left + o.left, top: r.top + o.top, width: r.width, height: r.height };
  }
  async function point(el, label, ms) {
    if (!el) return;
    try { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { }
    await sleep(260);
    const r = rectIn(el), g = ring(), pad = 6;
    document.dispatchEvent(new CustomEvent('nimbus-point', { detail: { left: r.left, top: r.top, right: r.left + r.width, bottom: r.top + r.height, ms: ms || 2600 } }));   // the panel steps aside
    g.style.left = (r.left - pad) + 'px'; g.style.top = (r.top - pad) + 'px';
    g.style.width = (r.width + pad * 2) + 'px'; g.style.height = (r.height + pad * 2) + 'px';
    g.querySelector('span').textContent = label || '';
    g.classList.toggle('below', r.top < 70);
    g.classList.remove('on'); void g.offsetWidth; g.classList.add('on');
    clearTimeout(ringT); ringT = setTimeout(() => g.classList.remove('on'), ms || 2600);
    await sleep(420);
  }
  // click an element after pointing at it: the roofer sees the ring, then the thing happens
  async function press(el, label) { if (!el) return false; await point(el, label, 2200); el.click(); return true; }

  // ---------- the home on screen ----------
  let lastHome = null;   // the last home Nimbus opened or acted on, for "this one" when no home is on screen
  let focusId = null;    // truck mode (lib/nimbus-truck.js): the stop on its screen is "this one", whatever is behind it
  function currentHome() {
    if (focusId) return focusId;
    const s = screen();
    if (s === 'home') { const w = win('home'); const H = w && w.HOME; if (H && (H.rawId || H.id) && w.crmView && w.crmView() === 'home') return String(H.rawId || H.id); }
    if (s === 'daily') { const w = win('daily'); const c = w && w.document.querySelector('.card[data-d="0"]'); if (c && c.dataset.id) return c.dataset.id; }
    return lastHome;
  }
  // facts about a home, for answers and for the model: never the owner's name or a phone number
  function facts(id) {
    if (!id) return null;
    const dl = dailyList(), di = dl.findIndex(x => x.id === id), d = di >= 0 ? dl[di] : null, w = win('home'), H = w && w.HOME && String(w.HOME.rawId || w.HOME.id) === id ? w.HOME : null;
    const rec = (H && H.rec) || RC.recall(id) || {}, roof = (H && H.roof) || rec.roof || null;
    const sq = d ? d.squares : roof && roof.sq || rec.sq || null;
    const pipe = RC.pipeline()[id] || {};
    const out = {
      id, address: d ? d.address : [rec.addr, rec.place || rec.city].filter(Boolean).join(', ') || null,
      street: d ? d.street : short(rec.addr), city: d ? d.city : rec.city || null,
      year_built: d ? d.yearBuilt : rec.year || null, roof_permit: d ? (d.permit || null) : rec.reroof ? rec.reroof.text : null,
      hail_in: d ? d.hail : rec.hail != null ? rec.hail : null, storm: d ? d.storm : rec.storm || null,
      roof_squares: sq != null ? Math.round(sq * 10) / 10 : null, roof_measured: d ? !!d.measured : !!(rec.sqMeasured || (roof && !roof.est)),
      roof_confidence: roof && roof.conf != null ? roof.conf : null, pitch: d ? d.pitch : roof ? roof.pitch : null,
      owner_lives_here: d ? !!d.ownerOccupied : !!rec.homestead, neighbors_reroofed_90d: d ? d.neighbours : null,
      why_on_list: d ? d.why : null, list_position: d ? di + 1 : null,
      stage: RC.stageName(RC.stage(id)), booked: pipe.booked || null, opted_out: RC.optedOut(id),
      has_phone: !!rec.phone, last_touch: (RC.history(id)[0] || {}).what || null
    };
    return out;
  }

  // ---------- counts from the pipeline on this device ----------
  function weekBounds(now) {
    const d = new Date(now || Date.now()); d.setHours(0, 0, 0, 0);
    const mon = new Date(d.getTime() - ((d.getDay() + 6) % 7) * DAY);
    return [mon.getTime(), mon.getTime() + 7 * DAY];
  }
  function bookings() {
    const p = RC.pipeline(); return Object.keys(p).filter(id => p[id] && p[id].booked && p[id].stage !== 'won' && !p[id].archived)   // the calendar's one store (c5-home/cal.js)
      .map(id => ({ id, at: p[id].booked, street: short((RC.recall(id) || {}).addr) || (facts(id) || {}).street || 'a home on the list' }))
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }

  // ---------- when: "Tuesday at 3", "tomorrow 10am", "Oct 30 at 2:30", "next Monday at 9" ----------
  function parseWhen(text, now) {
    const t = String(text || '').toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ');
    now = new Date(now || Date.now());
    let day = null;
    if (/\btoday\b|this afternoon|this evening|tonight/.test(t)) day = new Date(now);
    else if (/\btomorrow\b/.test(t)) day = new Date(now.getTime() + DAY);
    const wd = WD.findIndex(w => new RegExp('\\b' + w + '\\b|\\b' + w.slice(0, 3) + '\\b').test(t));
    if (!day && wd >= 0) {
      let add = (wd - now.getDay() + 7) % 7; if (add === 0) add = 7;
      if (/\bnext\b/.test(t) && add < 7 && new RegExp('next ' + WD[wd]).test(t) && add <= 2) add += 7;
      day = new Date(now.getTime() + add * DAY);
    }
    const md = new RegExp('\\b(' + MON.map(m => m.toLowerCase()).join('|') + ')[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b').exec(t);
    if (!day && md) {
      day = new Date(now.getFullYear(), MON.findIndex(m => m.toLowerCase() === md[1]), +md[2]);
      if (day.getTime() < now.getTime() - DAY) day.setFullYear(day.getFullYear() + 1);
    }
    let h = null, m = 0;
    if (/\bnoon\b/.test(t)) h = 12;
    const tm = /\b(?:(?:at|around|about|by)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a m|p m|in the morning|in the afternoon|in the evening)?\b(?!\s*(?:st|nd|rd|th|squares|in\b))/.exec(t.replace(md ? md[0] : '\u0000', ' '));
    if (h == null && tm && (tm[3] || /\b(at|around|about|by)\s+\d/.test(t) || tm[2])) {
      h = +tm[1]; m = tm[2] ? +tm[2] : 0;
      const ap = tm[3] || '';
      if (/p|afternoon|evening/.test(ap) && h < 12) h += 12;
      else if (/a m|am|morning/.test(ap) && h === 12) h = 0;
      else if (!ap && h >= 1 && h <= 6) h += 12;   // "at 3" means 3 pm for an inspection
    }
    if (h == null || h > 23 || m > 59) return { day, iso: null, needTime: !!day };
    if (!day) { day = new Date(now); if (h * 60 + m <= now.getHours() * 60 + now.getMinutes()) day = new Date(now.getTime() + DAY); }
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
    return { day: at, iso: at.toISOString(), needTime: false };
  }

  // ---------- the tools ----------
  const SCREENS = { today: ['daily', {}], storms: ['storm', {}], inbox: ['home', { view: 'inbox' }], pipeline: ['home', { view: 'pipeline' }],
    calendar: ['home', { view: 'calendar' }], customers: ['home', { view: 'customers' }], results: ['results', {}], seo: ['seo', {}], radar: ['daily', {}], crm: ['home', { view: 'inbox' }] };
  const NAMES = { today: 'Today', storms: 'Storms', inbox: 'the inbox', pipeline: 'the pipeline', calendar: 'the calendar', customers: 'Past customers', results: 'Results', seo: 'SEO', radar: 'Turnover Radar', crm: 'the CRM' };
  async function openTodayTab(tab) {
    const w = await waitFor(() => win('daily') && win('daily').document.getElementById('tab' + tab[0].toUpperCase() + tab.slice(1)) && win('daily'), 8000);
    const b = w && w.document.getElementById('tab' + tab[0].toUpperCase() + tab.slice(1));
    try { localStorage.setItem('rc.todayTab', tab); } catch (e) { }   // Today restores its tab from here while it loads
    if (b && b.getAttribute('aria-selected') !== 'true') await press(b, tab === 'radar' ? 'Turnover Radar' : tab === 'inbox' ? 'Inbox' : 'Up next');
    else if (b) await point(b, tab === 'radar' ? 'Turnover Radar' : 'Up next');
    await sleep(700);
    if (b && b.getAttribute('aria-selected') !== 'true') b.click();   // a Today still loading put its saved tab back over the click
    return !!b;
  }

  const T = {};
  T.open_screen = {
    description: 'Open a screen of the app: today (the day\'s homes and route), storms (hail map and timeline), inbox, pipeline (the board), calendar, customers (past customers), results, seo, radar (Turnover Radar on Today).',
    input_schema: { type: 'object', properties: { screen: { type: 'string', enum: Object.keys(SCREENS) } }, required: ['screen'], additionalProperties: false },
    async run(a) {
      const s = SCREENS[a.screen]; if (!s) return { ok: false, say: 'I do not have a screen called ' + a.screen + '.' };
      go(s[0], s[1]);
      if (a.screen === 'radar') await openTodayTab('radar');
      else if (a.screen === 'today') await openTodayTab('next');
      return { ok: true, say: 'Here is ' + NAMES[a.screen] + '.', label: 'Opened ' + NAMES[a.screen] };
    }
  };
  T.show_route = {
    description: 'Show today\'s route: the homes to work today in driving order on the Today map, with how many are left and the first stop.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    async run() {
      go('daily', {});
      await openTodayTab('next');
      const w = win('daily'), list = await waitFor(() => dailyList().length && dailyList(), 8000) || [];
      const open = list.filter(x => x.status === 'open');
      const start = w && [...w.document.querySelectorAll('button,a')].find(b => b.offsetParent && /start today|today.s route|start route/i.test(b.textContent));
      const mapEl = w && (w.document.querySelector('[data-nb-clear]') || w.document.querySelector('.maplibregl-map'));
      if (start) await press(start, 'Today\'s route'); else if (mapEl) await point(mapEl, 'Today\'s route', 3000);
      if (!list.length) return { ok: true, say: 'Here is Today. The route is still loading.' };
      const first = open[0];
      return { ok: true, label: 'Showed today\'s route', say: open.length ? plural(open.length, 'stop') + ' left of ' + list.length + ' today. First up is ' + short(first.address) + ' in ' + first.city + '.' : 'All ' + list.length + ' homes on today\'s route are done. Nice work.',
        data: { left: open.length, total: list.length, first: first ? short(first.address) : null } };
    }
  };
  T.open_next_house = {
    description: 'Open the next open home on today\'s list (the next stop), with its card on screen.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    async run() {
      go('daily', {});
      const list = await waitFor(() => dailyList().length && dailyList(), 15000) || [];
      const k = list.findIndex(x => x.status === 'open');
      if (k < 0) return { ok: true, say: list.length ? 'Every home on today\'s list is done.' : 'Today\'s list is still loading. Try again in a second.' };
      const h = list[k]; lastHome = h.id;
      go('daily', { n: String(k + 1) });
      const card = await waitFor(() => { const w = win('daily'); const c = w && w.document.querySelector('.card[data-d="0"]'); return c && c.dataset.id === h.id ? c : null; }, 5000);
      if (card) await point(card, 'Next home', 2600);
      return { ok: true, label: 'Opened ' + short(h.address), say: 'Next is ' + short(h.address) + ' in ' + h.city + '. ' + (h.why && h.why[0] ? h.why[0].replace(/\s*\(.*?\)/g, '') + '.' : ''),
        data: facts(h.id) };
    }
  };
  T.open_home = {
    description: 'Open one home\'s full record in the CRM (roof, hail, history, Text, Book). Without a query it opens the home on screen. With a query it finds the address first.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'An address like "1008 Merribrook" (optional)' } }, additionalProperties: false },
    async run(a) {
      let id = null, label = '';
      // a street with no number ("the house on Merribrook"): the home on today's list on that street first
      const onList = a.query && !/\d/.test(a.query) ? dailyList().find(x => String(x.street || '').toLowerCase().indexOf(String(a.query).toLowerCase().trim()) >= 0) : null;
      if (onList) { id = onList.id; label = short(onList.address); }
      else if (a.query) {
        const r = window.STM && STM.search ? await STM.search(a.query, 3) : [];
        if (!r || !r.length) return { ok: false, say: 'I could not find ' + a.query + '. Try the house number and the street.' };
        id = 'm' + r[0].i; label = r[0].addr;
      } else { id = currentHome(); if (!id) return { ok: false, say: 'Which home? Say the address, or open one first.' }; label = (facts(id) || {}).street || 'the home'; }
      lastHome = id; go('home', { view: 'home', id });
      await waitFor(() => { const w = win('home'); return w && w.HOME && String(w.HOME.rawId || w.HOME.id) === id; }, 8000);
      return { ok: true, label: 'Opened ' + label, say: 'Here is ' + label + '.', data: facts(id) };
    }
  };
  T.latest_storm = {
    description: 'What hail hit most recently ("what hit last night?"): the newest storm, how many homes got 1 inch or more, the largest hail, opened on the Storms map.',
    input_schema: { type: 'object', properties: { open_map: { type: 'boolean' } }, additionalProperties: false },
    async run(a) {
      await RC.factsReady;
      const c = RC.catalog; if (!c || !c.storms || !c.storms.length) return { ok: false, say: 'The storm list has not loaded yet.' };
      const s = c.storms.slice().sort((x, y) => x.date < y.date ? 1 : -1)[0];
      const age = Math.round((Date.now() - Date.parse(s.date + 'T12:00:00')) / DAY);
      if (a.open_map !== false) go('storm', { iso: s.date });
      const lead = age <= 1 ? 'Yes. Hail hit on ' + dayLabel(s.date) + '.' : 'Nothing new last night. The latest hail was ' + dayLabel(s.date) + ', ' + plural(age, 'day') + ' ago.';
      return { ok: true, label: 'Opened the ' + dayLabel(s.date) + ' storm', say: lead + ' ' + (s.homes_1in ? RC.fmt(s.homes_1in) + ' homes got an inch or more' : 'No homes got an inch or more') + ', largest about ' + (s.max_in || 0) + ' inches on radar.',
        data: { date: s.date, days_ago: age, homes_1in: s.homes_1in || 0, max_in: s.max_in || 0 } };
    }
  };
  T.draft_message = {
    description: 'Open the text (or email) to the home on screen with the words already filled in, so the roofer can read it and tap Send. Nimbus NEVER sends: a person always taps Send.',
    input_schema: { type: 'object', properties: { channel: { type: 'string', enum: ['text', 'email'] } }, additionalProperties: false },
    async run(a) {
      const ch = a.channel === 'email' ? 'email' : 'text', id = currentHome();
      if (!id) return { ok: false, say: 'Open a home first, or say open the next house.' };
      lastHome = id;
      const f = facts(id);
      if (ch === 'text' && f.opted_out) return { ok: false, say: 'This homeowner opted out. No more texts to them.' };
      let btn = null;
      // Today: the card on top must be this home (truck mode may be on a later stop): route Today to it first
      const k = dailyList().findIndex(x => x.id === id);
      if (k >= 0) {
        if (screen() !== 'daily') go('daily', {});
        const topId = () => { const w = win('daily'), c = w && w.document.querySelector('.card[data-d="0"]'); return c ? c.dataset.id : null; };
        if (topId() !== id) { go('daily', { n: String(k + 1) }); await waitFor(() => topId() === id, 6000); }
        const w = win('daily'), card = w && w.document.querySelector('.card[data-d="0"]');
        btn = card && card.dataset.id === id ? card.querySelector('[data-a="' + ch + '"]') : null;
      }
      if (!btn) {
        if (screen() !== 'home') { go('home', { view: 'home', id }); await waitFor(() => { const w = win('home'); return w && w.HOME && String(w.HOME.rawId || w.HOME.id) === id; }, 8000); }
        const w = win('home'); btn = w && [...w.document.querySelectorAll('[data-act="' + ch + '"]')].find(b => b.offsetParent);
      }
      if (!btn) return { ok: false, say: 'I could not find the ' + ch + ' button for this home.' };
      if (btn.disabled) return { ok: false, say: (btn.title || btn.getAttribute('aria-label') || 'Texting is not open for this home right now') + '.' };
      await press(btn, ch === 'text' ? 'Text draft' : 'Email draft');
      const w = RC.textWindow();
      return { ok: true, label: (ch === 'text' ? 'Opened the text' : 'Opened the email') + ' for ' + f.street + ' (you tap Send)',
        say: 'The ' + ch + ' for ' + f.street + ' is open with the words filled in. Read it over and tap Send when you\'re ready. I never send it for you.' + (ch === 'text' && !f.has_phone ? ' There is no phone number on file yet, so tap Get phone first.' : '') + (ch === 'text' && !w.isOpen ? ' ' + w.line : '') };
    }
  };
  T.book_inspection = {
    description: 'Book a roof inspection for the home on screen (or the last home talked about) at a day and time. Pass when as the roofer said it ("Tuesday at 3", "tomorrow 10am", "Oct 30 at 2:30"). Has Undo.',
    input_schema: { type: 'object', properties: { when: { type: 'string' }, query: { type: 'string', description: 'Optional address when it is not the home on screen' } }, required: ['when'], additionalProperties: false },
    async run(a) {
      let id = null;
      if (a.query) { const r = window.STM && STM.search ? await STM.search(a.query, 1) : []; if (r && r[0]) id = 'm' + r[0].i; }
      id = id || currentHome();
      if (!id) return { ok: false, say: 'Which home is the inspection for? Open it, or say the address.' };
      const w = parseWhen(a.when);
      if (!w.iso) return { ok: false, need: 'time', say: w.needTime ? 'What time on ' + w.day.toLocaleDateString('en-US', { weekday: 'long' }) + '?' : 'What day and time should I book?' };
      if (Date.parse(w.iso) < Date.now()) return { ok: false, say: 'That time has already passed. What day and time?' };
      const f = facts(id), prevStage = RC.stage(id), prevBooked = RC.booking(id);
      if (!RC.recall(id) && f) RC.remember({ id, addr: f.street, city: f.city, hail: f.hail_in, storm: f.storm });
      RC.book(id, w.iso, 'by Nimbus');
      lastHome = id;
      const hour = new Date(w.iso).getHours(), odd = hour < 7 || hour >= 20;
      const btn = screen() === 'home' && win('home') ? [...win('home').document.querySelectorAll('[data-act="book"]')].find(b => b.offsetParent) : null;
      if (btn) point(btn, 'Booked');
      return { ok: true, label: 'Booked an inspection ' + RC.when(w.iso) + ' at ' + (f.street || 'this home'),
        say: 'Booked. Inspection at ' + (f.street || 'this home') + ' on ' + spokenWhen(w.iso) + '.' + (odd ? ' That is outside normal hours, so double check it.' : ''),
        data: { home: f.street, at: w.iso },
        undo: () => { RC.setStage(id, prevStage, 'Booking undone', { booked: prevBooked }); } };
    }
  };
  const KNOCK = {
    not_home: k => 'Knocked: not home. Come back ' + k + '.', talked: () => 'Knocked: talked with the homeowner.', not_interested: () => 'Knocked: not interested.'
  };
  function comeBack(now) {
    const d = now.getDay(), h = now.getHours(), D = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    if (d >= 1 && d <= 5 && h < 16) return 'today after 5 pm';
    if (d >= 1 && d <= 4) return D[d + 1] + ' after 5 pm, or Saturday morning';
    if (d === 5) return 'Saturday morning';
    return 'Monday after 5 pm';
  }
  T.log_knock = {
    description: 'Log what happened at the door of the home on screen: not_home ("no answer", "nobody home"), talked, or not_interested. Has Undo.',
    input_schema: { type: 'object', properties: { outcome: { type: 'string', enum: ['not_home', 'talked', 'not_interested'] } }, required: ['outcome'], additionalProperties: false },
    async run(a) {
      const id = currentHome(); if (!id) return { ok: false, say: 'Which home? Open it first.' };
      lastHome = id;
      const f = facts(id), k = { not_home: 'nothome', talked: 'talked', not_interested: 'no' }[a.outcome];
      // on the record, press the real At the door button so the screen does its own thing (Undo there too)
      const w = screen() === 'home' ? win('home') : null, b = w && w.document.querySelector('#knockPanel [data-k="' + k + '"]');
      const before = RC.history(id).length, p0 = RC.pipeline()[id] || {}, prevStage = p0.stage || 'new', prevArch = p0.archived || null;
      if (b && b.offsetParent) await press(b, a.outcome === 'not_home' ? 'Not home' : a.outcome === 'talked' ? 'Talked' : 'Not interested');
      else {
        const prev = RC.stage(id);
        RC.note(id, KNOCK[a.outcome](comeBack(new Date())));
        if (a.outcome === 'talked' && prev === 'new') RC.setStage(id, 'called', 'Talked at the door');
        if (a.outcome === 'not_interested') RC.setStage(id, prev, 'Moved to Not now', { archived: new Date().toISOString() });
      }
      const added = RC.history(id).length - before;
      // one Undo for both paths (the record's own button or the note here): drop the lines it added, put stage and Not now back
      const undo = () => { const all = RC.__get('pipe', {}) || {}, p = all[id]; if (!p) return; p.history = (p.history || []).slice(Math.max(0, added)); p.stage = prevStage; p.archived = prevArch; RC.__set('pipe', all); };
      const say = a.outcome === 'not_home' ? 'Logged no answer at ' + f.street + '. Best time to come back is ' + comeBack(new Date()) + '.'
        : a.outcome === 'talked' ? 'Logged. You talked with the homeowner at ' + f.street + '.' : 'Logged not interested at ' + f.street + '. I parked it in Not now.';
      return { ok: true, label: 'Logged ' + (a.outcome === 'not_home' ? 'no answer' : a.outcome === 'talked' ? 'talked at the door' : 'not interested') + ' at ' + f.street, say, undo };
    }
  };
  T.add_past_customer = {
    description: 'Add a past customer (a job the roofer already did) to Past customers. Needs at least a name and the street address. Stays on this device.',
    input_schema: { type: 'object', properties: { name: { type: 'string' }, address: { type: 'string' }, city: { type: 'string' }, phone: { type: 'string' }, job_type: { type: 'string' }, job_date: { type: 'string' } }, required: ['name', 'address'], additionalProperties: false },
    async run(a) {
      if (!a.name || !a.address) return { ok: false, need: 'customer', say: 'Sure. What is their name and the street address?' };
      const l = RC.__get('pastCust', null), list = Array.isArray(l) ? l : [];
      const c = { id: 'pc-' + Date.now().toString(36), name: String(a.name).slice(0, 80), addr: String(a.address).slice(0, 120), city: a.city || '', zip: '', phone: a.phone || '', email: '',
        jobDate: a.job_date || '', jobType: a.job_type || '', flows: {}, added: new Date().toISOString(), from: 'nimbus' };
      list.unshift(c); RC.__set('pastCust', list);
      go('home', { view: 'customers' });
      const row = await waitFor(() => { const w = win('home'); return w && [...w.document.querySelectorAll('article,li,tr,.pc,.pcrow,[data-id]')].find(e => e.offsetParent && e.textContent.indexOf(c.addr) >= 0); }, 6000);
      if (row) await point(row, 'Added', 2600);
      return { ok: true, label: 'Added past customer at ' + c.addr, say: 'Added ' + c.name.split(' ')[0] + ' at ' + c.addr + ' to your past customers.' + (a.phone ? '' : ' Add a phone number when you have it, so you can ask for a review.'),
        undo: () => RC.__set('pastCust', (RC.__get('pastCust', []) || []).filter(x => x.id !== c.id)) };
    }
  };
  T.count = {
    description: 'Count from the roofer\'s own pipeline on this device: inspections_this_week, inspections_today, inspections_next_week, reached_today (homes texted or emailed today), replied, won, pipeline (homes at each stage).',
    input_schema: { type: 'object', properties: { metric: { type: 'string', enum: ['inspections_this_week', 'inspections_today', 'inspections_next_week', 'reached_today', 'replied', 'won', 'pipeline'] } }, required: ['metric'], additionalProperties: false },
    async run(a) {
      const b = bookings(), [w0, w1] = weekBounds(), t0 = new Date().setHours(0, 0, 0, 0);
      const inRange = (x, s, e) => { const t = Date.parse(x.at); return t >= s && t < e; };
      if (/^inspections/.test(a.metric)) {
        const r = a.metric === 'inspections_today' ? [t0, t0 + DAY] : a.metric === 'inspections_next_week' ? [w1, w1 + 7 * DAY] : [w0, w1];
        const l = b.filter(x => inRange(x, r[0], r[1])), when = a.metric === 'inspections_today' ? 'today' : a.metric === 'inspections_next_week' ? 'next week' : 'this week';
        const nxt = l.find(x => Date.parse(x.at) >= Date.now());
        return { ok: true, say: (l.length ? 'You have ' + plural(l.length, 'inspection') + ' ' + when + '.' : 'No inspections booked ' + when + '.') + (nxt ? ' Next is ' + nxt.street + ', ' + spokenWhen(nxt.at) + '.' : ''), data: { n: l.length, list: l.map(x => ({ street: x.street, at: x.at })) } };
      }
      if (a.metric === 'reached_today') {
        const n = RC.contacted().reduce((m, x) => (m[x.id] = 1, m), {}), k = Object.keys(n).length;
        return { ok: true, say: 'You have reached ' + plural(k, 'home') + ' today.', data: { n: k } };
      }
      const p = RC.pipeline(), ids = Object.keys(p);
      if (a.metric === 'replied') { const k = ids.filter(id => RC.replied(id) && !RC.optedOut(id)).length; return { ok: true, say: k ? plural(k, 'homeowner') + ' replied.' : 'No replies logged yet.', data: { n: k } }; }
      if (a.metric === 'won') { const k = ids.filter(id => p[id].stage === 'won').length; return { ok: true, say: k ? 'You have won ' + plural(k, 'job') + ' from the app so far.' : 'No won jobs logged yet.', data: { n: k } }; }
      const by = {}; ids.forEach(id => { const s = RC.stageName(p[id].stage); by[s] = (by[s] || 0) + 1; });
      const parts = Object.keys(by).map(s => by[s] + ' ' + s.toLowerCase());
      return { ok: true, say: parts.length ? 'In your pipeline: ' + parts.join(', ') + '.' : 'Nothing has moved in the pipeline yet.', data: by };
    }
  };
  T.set_map = {
    description: 'Switch the Today map between satellite photos and the street map.',
    input_schema: { type: 'object', properties: { style: { type: 'string', enum: ['satellite', 'map'] } }, required: ['style'], additionalProperties: false },
    async run(a) {
      if (screen() !== 'daily') go('daily', {});
      const k = a.style === 'satellite' ? 'sat' : 'map';
      const b = await waitFor(() => { const w = win('daily'); return w && [...w.document.querySelectorAll('[data-ms="' + k + '"]')].find(x => x.offsetParent); }, 8000);
      if (!b) return { ok: false, say: 'I could not find the map switch on this screen.' };
      if (b.getAttribute('aria-pressed') === 'true') { await point(b, a.style === 'satellite' ? 'Satellite' : 'Map'); return { ok: true, label: 'Map already on ' + (a.style === 'satellite' ? 'satellite' : 'the street map'), say: 'The map is already on ' + (a.style === 'satellite' ? 'satellite.' : 'the street map.') }; }
      await press(b, a.style === 'satellite' ? 'Satellite' : 'Map');
      return { ok: true, label: 'Switched the map to ' + (a.style === 'satellite' ? 'satellite' : 'the street map'), say: a.style === 'satellite' ? 'Switched to satellite.' : 'Switched to the street map.' };
    }
  };
  T.home_facts = {
    description: 'Read the facts about the home on screen (address, year built, re-roof permit, hail at the address, roof size and how it was measured, pitch, owner lives there, neighbors re-roofing, why it is on today\'s list, stage). Use before explaining a home. Never includes owner names or phone numbers.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    async run() { const id = currentHome(); if (!id) return { ok: false, say: 'No home is open right now.' }; const f = facts(id); return { ok: true, say: '', data: f }; }
  };
  T.undo_last = {
    description: 'Undo the last change Nimbus made (a booking, a knock, a past customer).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    async run() { const u = undoStack[undoStack.length - 1]; if (!u) return { ok: false, say: 'There is nothing of mine to undo.' }; u.fn(); return { ok: true, label: 'Undid: ' + u.label, say: 'Done. I undid that.' }; }
  };
  T.briefing = {
    description: 'The morning briefing ("what\'s going on today?", "catch me up"): newest storm and homes hit (only when it is new), today\'s route count, inspections today, replies waiting, and one suggestion.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    async run() { const b = await briefing(); return { ok: true, say: b.text, data: b.data, offer: b.offer }; }
  };
  T.truck_mode = {
    description: 'Start truck mode: the hands-free route screen for a rep between doors (one stop at a time, big buttons, read aloud, directions in the phone\'s maps app). Best on a phone.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    async run() { if (!window.NimbusTruck) return { ok: false, say: 'Truck mode is not loaded here.' }; await NimbusTruck.open(); return { ok: true, label: 'Started truck mode', say: '' }; }
  };
  T.walkthrough = {
    description: 'Give a short spoken tour of the screen that is open now, pointing at each part. Use when the roofer is new or asks how to use a screen.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    async run() { return { ok: true, say: '', tour: tourFor(screen()) }; }
  };

  // ---------- the screen tour (first use, or "walk me through this") ----------
  function tourFor(s) {
    const D = sel => () => { const w = win('daily'); return w && [...w.document.querySelectorAll(sel)].find(e => e.offsetParent); };
    const H = sel => () => { const w = win('home'); return w && [...w.document.querySelectorAll(sel)].find(e => e.offsetParent); };
    const S = sel => () => { const w = win('storm'); return w && [...w.document.querySelectorAll(sel)].find(e => e.offsetParent); };
    if (s === 'daily') return [
      { el: D('.card[data-d="0"]'), label: 'Your next home', say: 'This is Today. Each morning you get the best homes to work, one at a time. This card is the home up next, with the reasons it made the list.' },
      { el: D('.card[data-d="0"] [data-a="text"]'), label: 'Text', say: 'Text opens the message with the words filled in. You read it and tap Send on your phone. Nothing ever sends on its own.' },
      { el: D('.card[data-d="0"] [data-a="proof"]'), label: 'Proof', say: 'Proof is a one page hail report for the homeowner.' },
      { el: D('.card[data-d="0"] [data-a="skip"]'), label: 'Skip', say: 'Skip moves on to the next home.' },
      { el: D('[data-ms="sat"]'), label: 'Map or satellite', say: 'The map shows today\'s route. Switch to satellite to see the roofs.' },
      { el: D('#tabInbox'), label: 'Inbox', say: 'Inbox has replies and follow-ups that are due.' },
      { el: () => document.querySelector('.nb-hit'), label: 'Nimbus', say: 'And you can always just ask me. Try, open the next house, or, book an inspection Tuesday at 3.' }
    ];
    if (s === 'home') return [
      { el: H('[data-act="text"]'), label: 'Text', say: 'This is a home\'s record. Text and Email open a draft you send yourself.' },
      { el: H('[data-act="book"]'), label: 'Book', say: 'Book puts an inspection on your calendar.' },
      { el: H('#knockPanel'), label: 'At the door', say: 'At the door, tap what happened: not home, talked, or not interested. I can log it for you too.' },
      { el: () => document.querySelector('.nb-hit'), label: 'Nimbus', say: 'Ask me why this house is on your list, or how sure the roof size is.' }
    ];
    if (s === 'storm') return [
      { el: S('.maplibregl-map,#map'), label: 'Storm map', say: 'This is Storms. Every hail storm, and every home it hit. Darker houses got bigger hail.' },
      { el: () => document.querySelector('.nb-hit'), label: 'Nimbus', say: 'Ask me, what hit last night, any time.' }
    ];
    return [{ el: () => document.querySelector('.nb-hit'), label: 'Nimbus', say: 'Ask me anything about this screen, or tell me what to open.' }];
  }

  // ---------- the morning briefing: real data only, short, nothing on a quiet day beyond the route ----------
  function spokenDay(iso) {
    const d = new Date(String(iso).slice(0, 10) + 'T12:00:00'), t = new Date(); t.setHours(12, 0, 0, 0);
    const n = Math.round((t - d) / DAY);
    return n === 0 ? 'today' : n === 1 ? 'yesterday' : n < 7 ? d.toLocaleDateString('en-US', { weekday: 'long' }) : 'on ' + dayLabel(iso);
  }
  async function briefing() {
    await RC.factsReady;
    const list = await waitFor(() => dailyList().length && dailyList(), 9000) || [];
    const owner = (((window.ROOFERS || {})[RC.rooferKey()] || {}).owner) || '';
    const g = RC.greeting ? RC.greeting().replace(/^Good /, '') : 'Hello';
    const parts = [g.charAt(0).toUpperCase() + g.slice(1) + (owner ? ' ' + owner : '') + '.'], data = {};
    // storm: the morning-after alert when Today shows one (storm day or the next), else a 1 in+ storm in the last 3 days
    await waitFor(() => { const x = win('daily'); return x && x.RCAlerts; }, 6000);   // Today's alert card loads its file after the list
    const w = win('daily'), al = w && w.RCAlerts && w.RCAlerts.active ? w.RCAlerts.active() : null;
    const c = RC.catalog, newest = c && c.storms && c.storms.length ? c.storms.slice().sort((a, b) => a.date < b.date ? 1 : -1)[0] : null;
    if (al && al.homes_hit) { parts.push('Hail hit ' + RC.fmt(al.homes_hit) + ' of your homes ' + spokenDay(al.storm) + ', up to ' + al.max_in + ' inches.'); data.storm = { date: al.storm, homes: al.homes_hit, max_in: al.max_in }; }
    else if (newest && newest.homes_1in && (Date.now() - Date.parse(newest.date + 'T12:00:00')) / DAY <= 3) { parts.push('Hail hit ' + RC.fmt(newest.homes_1in) + ' of your homes ' + spokenDay(newest.date) + '.'); data.storm = { date: newest.date, homes: newest.homes_1in }; }
    // route: Today's own list (open = not reached, skipped or closed today)
    const open = list.filter(x => x.status === 'open').length;
    if (list.length) parts.push(open === list.length ? 'Your ' + list.length + ' home route is ready.' : open ? open + ' of ' + list.length + ' homes left on your route.' : 'Your route is done for today.');
    data.route = { total: list.length, open };
    // inspections today (the calendar's one store), replies waiting (the inbox's Replied)
    const t0 = new Date().setHours(0, 0, 0, 0), today = bookings().filter(x => { const t = Date.parse(x.at); return t >= t0 && t < t0 + DAY; });
    if (today.length) parts.push(plural(today.length, 'inspection') + ' today, first at ' + new Date(today[0].at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00', '').toLowerCase() + ' on ' + today[0].street.replace(/^\d+\s+/, '') + '.');
    data.inspections_today = today.length;
    const rep = window.Nimbus && Nimbus.actions && Nimbus.actions.replied ? Nimbus.actions.replied().length : 0;
    if (rep) parts.push(rep === 1 ? 'One homeowner replied.' : rep + ' homeowners replied.');
    data.replies = rep;
    const offer = open ? 'route' : rep ? 'inbox' : null;
    if (offer === 'route') parts.push('Want me to start it?');
    else if (offer === 'inbox') parts.push('Want me to open the replies?');
    return { text: parts.join(' '), data, offer };
  }

  // ---------- running a tool: one place that logs, keeps Undo and tells the panel ----------
  const undoStack = [], listeners = [];
  async function run(name, args) {
    const t = T[name];
    if (!t) return { ok: false, say: 'I do not know how to do that yet.', error: 'unknown tool ' + name };
    let r;
    try { r = await t.run(args || {}); } catch (e) { console.warn('[nimbus tool]', name, e); r = { ok: false, say: 'That did not work. ' + String(e && e.message || e).slice(0, 80), error: String(e) }; }
    r = r || { ok: false, say: '' };
    if (r.undo) {   // once only, whether from the panel's Undo button or "undo that"
      const fn = r.undo; let done = false;
      r.undo = () => { if (done) return; done = true; fn(); const k = undoStack.findIndex(u => u.fn === r.undo); if (k >= 0) undoStack.splice(k, 1); };
      undoStack.push({ fn: r.undo, label: r.label || name });
    }
    if (undoStack.length > 20) undoStack.shift();
    listeners.forEach(f => { try { f({ name, args, result: r }); } catch (e) { } });
    return r;
  }
  // what the model is told: the tool list, Anthropic tool format
  const schemas = () => Object.keys(T).map(k => ({ name: k, description: T[k].description, input_schema: T[k].input_schema }));
  // what is on screen right now, for the model and the built-in brain (no owner names, no phone numbers)
  function context() {
    const id = currentHome(), list = dailyList(), w = RC.textWindow();
    return { screen: { daily: 'Today', storm: 'Storms', home: 'CRM ' + ((win('home') && win('home').crmView && win('home').crmView()) || ''), results: 'Results', seo: 'SEO', opening: 'About' }[screen()] || screen(),
      now: new Date().toString().slice(0, 21), texting: w.line, home_on_screen: id ? facts(id) : null,
      today: list.length ? { total: list.length, open: list.filter(x => x.status === 'open').length } : null,
      inspections_this_week: bookings().filter(x => { const [a, b] = weekBounds(); const t = Date.parse(x.at); return t >= a && t < b; }).length,
      newest_storm: RC.facts.storm ? { date: RC.facts.storm.iso, homes_1in: RC.facts.storm.homes, max_in: RC.facts.storm.max } : null };
  }

  window.NimbusTools = { T, run, schemas, context, facts, currentHome, point, parseWhen, tourFor, dailyList, screen, win, briefing, bookings, go, waitFor,
    focus: id => { focusId = id || null; if (id) lastHome = id; },
    on: f => listeners.push(f), get canUndo() { return undoStack.length > 0; } };
})();
