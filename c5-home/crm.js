/* crm.js: the CRM screen (Jack 10-09: "make Homes the full visual CRM"). Plain script, runs after rec.js and pipe.js.
   Three views, one page, one 3D house:
     inbox    = three panes. Left: one thread per home, built from RC.activity() (the same records Today's inbox reads,
                so a text opened on Today is here at once and the other way round), with search, filters and the
                cadence step. Middle: the conversation (texts, emails, the homeowner's logged replies, notes, bookings,
                a scheduled text), the next touch drafted from lib/rc-copy.js with a one-tap sms: / mailto: hand-off,
                Log a reply with the library's suggested answer, Opt out, the stage. Right: that home, with the record's
                own 3D roof (home.js's stage moves into this pane), the owner when loaded, hail, roof year and permit,
                squares, pitch, the stage strip and Book inspection. Clicking a thread or any message points the right
                pane at that home.
     pipeline = the board (pipe.js) across the whole screen.
     home     = the single-home record (rec.js + pipe.js), reached from a thread, a card, Today, Storms or Nimbus.
   Phone: list -> conversation -> home as stacked screens with Back; the house is a sheet.
   Routes (the shell): #/crm, #/crm/inbox/<id>, #/crm/pipeline, #/crm/home/<id>; #/home/<id> still opens the record.
   Nothing here sends: Text = an sms: draft the rep's phone sends, Email = a mailto: draft. */
(function () {
  'use strict';
  const RC = window.RC, esc = RC.esc, $ = (s, r) => (r || document).querySelector(s);
  const phoneMQ = matchMedia('(max-width:640px)'), isPhone = () => phoneMQ.matches;
  const B = window.activeRoofer ? activeRoofer() : {}, DEF = window.rooferKey ? rooferKey() : RC.rooferKey(), OWNDATA = !!B.dataRoot;
  const SV = p => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  const ICON = {
    text: SV('<path d="M4 5h16v11H9l-5 4z"/>'), email: SV('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>'),
    call: SV('<path d="M5 4h3.2l1.6 4-2 1.3a11 11 0 0 0 6.9 6.9l1.3-2 4 1.6V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
    booking: SV('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>'), note: SV('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>'),
    stage: SV('<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>'), sched: SV('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>'),
    reply: SV('<path d="M10 8 5 12l5 4"/><path d="M5 12h9a5 5 0 0 1 5 5v1"/>'), back: SV('<path d="M15 5l-7 7 7 7"/>'), close: SV('<path d="M6 6l12 12M18 6 6 18"/>'),
    search: SV('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>'), roof: SV('<path d="M3 12 12 4.5 21 12M6 10v9.5h12V10"/>'),
    layers: SV('<path d="m12 4 8 4.5-8 4.5-8-4.5zM4 13l8 4.5 8-4.5M4 17l8 4.5 8-4.5"/>'), hail: SV('<circle cx="8" cy="15" r="3"/><circle cx="16.5" cy="9" r="4"/><circle cx="16" cy="18.5" r="1.6"/>'),
    cal: SV('<rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/>'), check: SV('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
    doc: SV('<path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5v4h4M10 12h5M10 15.5h5"/>'),
    more: SV('<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>'),
    send: SV('<path d="M4 12 20 4l-4 16-4-7z"/><path d="M12 13 20 4"/>'), chev: SV('<path d="m6 9 6 6 6-6"/>')
  };
  document.querySelectorAll('[data-ci]').forEach(n => { n.innerHTML = ICON[n.dataset.ci] || ''; });
  const LABEL = { call: 'Call', text: 'Text', email: 'Email', booking: 'Booking', note: 'Note', stage: 'Stage', reply: 'Reply' };
  const FILTERS = [['all', 'All conversations'], ['reply', 'Needs an answer'], ['due', 'Due today'], ['late', 'Overdue'], ['out', 'Opted out']];
  // quick replies (10-17): the outreach library's reply.* templates, tucked in a small menu under the composer
  const QUICK = [['interested', 'They want a roof check'], ['call', 'They want a call'], ['who', 'Who is this?'], ['how_number', 'How did you get my number?'], ['have_roofer', 'They have a roofer'], ['not_interested', 'Not interested'], ['stop', 'Stop texting']];
  const HK = 'rc.crmHome';   // the home pane on desktop: 'off' = hidden so the conversation breathes
  const EMPTY = {
    all: 'Nothing logged yet. Texts and emails you open from Today or here, replies you log, notes and bookings show up as one thread per home.',
    due: 'No follow-ups due today. A home comes due on day 3, 7 and 30 after its first contact, then every 30 days.',
    late: 'Nothing overdue.', reply: 'No replies waiting. When a homeowner answers, open the thread and tap Log a reply.', out: 'No one has opted out.'
  };
  const OUTL = { no_answer: 'No answer', spoke: 'Spoke with the homeowner', booked: 'Inspection booked', wrong: 'Wrong number', note: 'Call note' };
  const FK = 'rc.crmFilter';
  const TOUCH = a => a.ch === 'text' || a.ch === 'email';
  const tm = iso => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const full = iso => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' + tm(iso);
  const dayHead = iso => { const d = new Date(iso), y = new Date(); y.setHours(0, 0, 0, 0); const t = new Date(d); t.setHours(0, 0, 0, 0);
    const n = Math.round((+y - +t) / 864e5); return n === 0 ? 'Today' : n === 1 ? 'Yesterday' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); };
  const dayFmt = key => new Date(key + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  function rel(iso) {
    const t = Date.parse(iso), now = Date.now(), d0 = new Date(now); d0.setHours(0, 0, 0, 0);
    const m = Math.round((now - t) / 6e4);
    if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; if (t >= +d0) return 'today, ' + tm(iso);
    const days = Math.round((+d0 - new Date(t).setHours(0, 0, 0, 0)) / 864e5); return days <= 1 ? 'yesterday' : days + ' days ago';
  }
  function cadLine(c) {
    if (c.stopped) return { t: RC.cadenceStopText ? RC.cadenceStopText(c.stopped) : c.stopped === 'opted out' ? 'Opted out, no follow-ups' : c.stopped === 'won' ? 'Won, no follow-ups' : 'Not now, no follow-ups', k: 'c-stop' };
    if (!c.lastContact) return { t: 'Not contacted yet', k: '' };
    if (c.overdue) return { t: `Day ${c.step} follow-up, ${c.daysOverdue} day${c.daysOverdue === 1 ? '' : 's'} overdue`, k: 'c-late' };
    if (c.dueToday) return { t: `Day ${c.step} follow-up due today`, k: 'c-due' };
    return { t: `Day ${c.step} follow-up due ${dayFmt(c.nextDue)}`, k: '' };
  }
  // the street's initials for the thread avatar (3405 O Malley Ct -> OM), the house number and suffix skipped
  const SUFFIX = /^(ct|dr|ln|rd|st|ave|blvd|way|cir|pl|trl|pkwy|hwy|loop|cv|ter|run|pt|bnd|xing|path|row|sq|aly)$/i;
  function initials(addr) {
    const w = String(addr || '').split(/\s+/).filter(x => x && !/^\d/.test(x)), keep = w.length > 1 ? w.filter((x, i) => !(i === w.length - 1 && SUFFIX.test(x))) : w;
    const s = keep.map(x => x.charAt(0)).join('').slice(0, 2).toUpperCase(); return s || '#';
  }
  const pretty = p => p && /^\+1\d{10}$/.test(p) ? `(${p.slice(2, 5)}) ${p.slice(5, 8)}-${p.slice(8)}` : (p || '');
  const telOf = p => { const d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? '+1' + d : d.length === 11 ? '+' + d : ''; };
  const smsHref = (to, body) => `sms:${to}?&body=${encodeURIComponent(body)}`;
  const mailHref = (subject, body) => `mailto:?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(body || '')}`;
  const say = (m, u) => (window.homeSay || (() => { }))(m, u);
  const sday = (iso, short) => window.homeDay ? window.homeDay(iso, short) : iso;

  // ---------- what this device knows about a home: today's list first (RC.todayPick: the same address, hail, storm, squares
  // and stop Today's card shows), then the open record, then what was remembered ----------
  const hailOk = v => v != null && v !== '' && v !== 'null' && isFinite(+v);
  function homeOf(id) {
    const r = RC.recall(id) || {}, mm = /^m(\d+)$/.exec(id), s = RC.todayPick ? RC.todayPick(id) : null;
    const o = { id, addr: s ? s.street || String(s.address || '').split(',')[0] : r.addr || 'Home on file', city: s ? s.city : r.city || '', zip: s ? s.zip : r.zip || '',
      hail: s ? (hailOk(s.hail) ? +s.hail : null) : hailOk(r.hail) ? +r.hail : null,
      gi: s && s.gi != null ? s.gi : r.gi != null ? r.gi : mm ? +mm[1] : null, phone: telOf(r.phone) || null,
      storm: s ? s.storm || null : /^\d{4}-\d{2}-\d{2}/.test(r.storm || '') ? r.storm : null, stop: s ? s.stop : null,
      year: (s && s.yearBuilt) || r.year || null, permit: (s && s.permit) || r.permit || null, roofAge: r.roofAge || null,
      sq: s ? s.squares : r.sq != null ? +r.sq : null, sqMeasured: s ? !!s.measured : null, pitch: null,
      optin: !!(r.optin || r.optIn), past: !!(r.past || r.pastCustomer), textConsent: !!r.textConsent, subdivision: (s && s.subdivision) || r.subdivision || '', owner: null, place: '' };
    const H = window.HOME;
    if (H && H.rawId === id && H.rec) {
      const rc = H.rec;
      Object.assign(o, { addr: rc.addr || o.addr, city: rc.city || o.city, zip: rc.zip || o.zip, year: rc.year || o.year, permit: rc.permit || o.permit, roofAge: rc.roofAge || o.roofAge,
        owner: rc.owner || null, homestead: !!rc.homestead, subdivision: rc.subdivision || o.subdivision, place: rc.place || '', phone: telOf(rc.phone) || o.phone, hail: s ? o.hail : H.hail != null ? H.hail : o.hail, hailDate: s ? '' : H.hailDate || '' });
      // the open record's measured roof: its squares are the list's own when the home is on today's list (one figure)
      if (H.measure) { if (!s || o.sq == null) { o.sq = H.measure.squares; o.sqMeasured = !!H.measure.facet; } o.pitch = H.measure.pitch; }
      o.roof = rc.roof || null;   // the per-facet LiDAR record (stories, squares) when the batch has one
    }
    if (o.roof === undefined && o.gi != null && window.RCROOF) {
      // the thread is not the loaded record: the per-facet roof from the cache, customer and opt-in from what this
      // device remembered (r), never from the open record (a ReferenceError here used to kill every inbox repaint)
      o.roof = RCROOF.cached(o.gi) || null;
      o.customer = !!r.customer; o.past = o.past || !!r.customer; o.optin = o.optin || !!(r.optin || r.optIn);
    }
    if (!o.owner && o.gi != null && RC.ownerNow) o.owner = RC.ownerNow(o.gi);
    if (!o.hailDate) o.hailDate = o.hail != null && o.storm ? sday(o.storm) : '';   // the home's own storm, never the working storm by default
    return o;
  }
  // the outreach library's facts (same shape Today builds, so the same words come out)
  const BIZ = /\b(LLC|L L C|INC|TRUST|TRUSTEE|TRUSTEES|ESTATE|LP|LTD|CORP|CORPORATION|COMPANY|BANK|PARTNERS|PARTNERSHIP|HOLDINGS|PROPERTIES|INVESTMENTS|ASSOCIATION|CHURCH|CITY OF|COUNTY|HOMES|REALTY|FUND|REVOCABLE|LIVING)\b/i;
  const firstName = o => { if (!o || BIZ.test(o)) return null; const m = /,\s*([A-Za-z'-]{2,})/.exec(String(o)) || /^([A-Za-z'-]{2,})\b/.exec(String(o).trim()); return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() : null; };
  function facts(h) {
    return { id: h.id, street: h.addr, city: h.city, zip: h.zip, stormISO: h.storm || null, hail: h.hail != null ? +h.hail : null, roofYear: h.year || null,
      permit: h.permit ? String(h.permit).slice(0, 4) : null, squares: h.sq || null, pitch: null, first: firstName(h.owner),
      source: h.past ? 'past' : h.optin ? 'form' : undefined, textConsent: !!h.textConsent, optedOut: RC.optedOut(h.id) };
  }
  const audOf = h => h.past ? 'past' : h.optin ? 'optin' : 'cold';
  const stepIdx = day => !day || day <= 1 ? 0 : day <= 3 ? 1 : day <= 7 ? 2 : day < 60 ? 3 : Math.round(day / 30) + 2;
  function draftFor(h, ch) {
    if (!RC.copy) return { blocked: 'no outreach library', canSend: false };
    const c = RC.cadence(h.id), day = c.stopped ? null : c.step || 1;
    // ch = 'auto' asks the library for the step's own channel (10-09: one cold text on day 1, then email only); the
    // CRM shows whatever comes back, r.eff is the channel the draft is really for
    const r = RC.copy.next(facts(h), stepIdx(day), audOf(h), ch); r.dayN = day; r.cad = c;
    r.eff = r.channel || r.useChannel || (ch === 'auto' ? 'text' : ch);
    const onlyPhone = r.eff === 'text' && r.missing && r.missing.length === 1 && r.missing[0] === 'phone' && /^needs phone/.test(r.blocked || '');
    r.canSend = !!r.body && (!r.blocked || onlyPhone); r.noCallback = onlyPhone; return r;
  }

  // ---------- state ----------
  let VIEW = 'inbox', SEL = null, MSG = null, filter = 'all', stageF = '', q = '', chan = 'auto', replying = false, hold = false, warmed = false, qrKind = null;
  const sugg = {};
  try { const f = localStorage.getItem(FK); if (FILTERS.some(x => x[0] === f)) filter = f; } catch (e) { }
  try { if (localStorage.getItem(HK) === 'off') document.getElementById('crm').dataset.home = 'off'; } catch (e) { }
  const crm = $('#crm'), clist = $('#clist'), cfil = $('#cfil'), cq = $('#cq'), clN = $('#clN'), cvh = $('#cvh'), cvm = $('#cvm'), cvf = $('#cvf'), chh = $('#chh'), chf = $('#chf'), chstage = $('#chstage'), vtabs = $('#vtabs');
  const curId = () => (window.HOME && window.HOME.rawId) || null;

  // ---------- threads: one per home with any record (or a scheduled text), newest first ----------
  function threads() {
    const by = new Map();
    RC.activity().forEach(a => { let t = by.get(a.id); if (!t) by.set(a.id, t = { id: a.id, all: [] }); t.all.push(a); });
    RC.scheduled().forEach(s => { if (!by.has(s.id)) by.set(s.id, { id: s.id, all: [] }); });
    const pipe = RC.pipeline();
    return [...by.values()].map(t => {
      const touches = t.all.filter(TOUCH), c = RC.cadence(t.id), last = touches[0] || t.all[0], out = RC.optedOut(t.id), p = pipe[t.id] || {};
      const replied = !!(touches[0] && touches[0].dir === 'in') && !out;
      return Object.assign(t, { touches, c, last, out, replied, sched: RC.scheduledFor(t.id), stage: p.archived ? 'lost' : RC.stage(t.id),
        due: !c.stopped && !!c.lastContact && c.dueToday && !c.overdue, late: !c.stopped && !!c.lastContact && c.overdue });
    }).sort((a, b) => { const ta = a.last ? a.last.at : a.sched ? a.sched.created : '', tb = b.last ? b.last.at : b.sched ? b.sched.created : ''; return ta < tb ? 1 : ta > tb ? -1 : 0; });
  }
  const pass = t => (filter === 'all' || (filter === 'due' && t.due) || (filter === 'late' && t.late) || (filter === 'reply' && t.replied) || (filter === 'out' && t.out)) && (!stageF || t.stage === stageF);
  const match = t => { if (!q) return true; const h = homeOf(t.id); return [h.addr, h.city, h.subdivision, h.owner || ''].join(' ').toLowerCase().includes(q); };
  // the row's one line: what was said last, plain (a reply as the homeowner wrote it, yours with "You:")
  function lastWords(a) {
    if (!a) return 'Scheduled text';
    if (a.dir === 'in') return esc(a.body || 'Replied');
    if (a.ch === 'call') return esc(a.outcome ? 'Call, ' + (OUTL[a.outcome] || '').toLowerCase() : a.what) + (a.note ? ': ' + esc(a.note) : '');
    if (a.body) return 'You: ' + esc(a.subject ? a.subject + '. ' : '') + esc(a.body);
    return esc(a.what);
  }
  // the time on a row, short (iMessage style): minutes today, else the weekday or the date
  function when(iso) {
    const t = Date.parse(iso), d0 = new Date(); d0.setHours(0, 0, 0, 0);
    if (t >= +d0) return tm(iso);
    const days = Math.round((+d0 - new Date(t).setHours(0, 0, 0, 0)) / 864e5);
    return days <= 1 ? 'Yesterday' : days < 7 ? new Date(t).toLocaleDateString('en-US', { weekday: 'short' }) : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function paintList() {
    const ts = threads(), n = { all: ts.length, due: ts.filter(t => t.due).length, late: ts.filter(t => t.late).length, reply: ts.filter(t => t.replied).length, out: ts.filter(t => t.out).length };
    // one compact control: what to show, or one stage
    const cur = stageF ? 's:' + stageF : filter;
    const fh = `<label class="cshow"><span class="vh">Show</span><select id="cshow" aria-label="Show">` +
      FILTERS.map(f => `<option value="${f[0]}"${cur === f[0] ? ' selected' : ''}>${f[1]}${f[0] !== 'all' && n[f[0]] ? ' (' + n[f[0]] + ')' : ''}</option>`).join('') +
      `<optgroup label="Stage">${RC.STAGES.map(s => `<option value="s:${s[0]}"${cur === 's:' + s[0] ? ' selected' : ''}>${esc(s[1])}</option>`).join('')}<option value="s:lost"${cur === 's:lost' ? ' selected' : ''}>Not now</option></optgroup></select><span class="ic">${ICON.chev}</span></label>`;
    if (cfil.__h !== fh) { cfil.innerHTML = fh; cfil.__h = fh; }
    const shown = ts.filter(t => pass(t) && match(t));
    const rows = shown.map(t => {
      const h = homeOf(t.id), last = t.last, ch = last ? (last.dir === 'in' ? 'reply' : last.ch) : 'sched', first = firstName(h.owner);
      const at = last ? when(last.at) : t.sched ? RC.countdown(t.sched.due, 'short') : '';
      return `<button type="button" class="crow${t.replied ? ' rep' : ''}${t.id === SEL ? ' sel' : ''}" role="listitem" data-id="${esc(t.id)}" aria-current="${t.id === SEL ? 'true' : 'false'}" aria-label="Open the thread for ${esc(h.addr)}${t.replied ? ', a reply is waiting' : ''}">` +
        `<span class="cav" data-ch="${ch}"><span class="ic">${esc(initials(h.addr))}</span></span>` +
        `<span class="cb"><span class="ct"><span class="cad"><b>${esc(h.addr)}</b>${first ? `<i>${esc(first)}</i>` : ''}</span><time datetime="${esc(last ? last.at : '')}">${esc(at)}</time></span>` +
        `<span class="clast">${lastWords(last)}</span></span></button>`;
    }).join('');
    const none = q ? `No home in the inbox matches "${esc(q)}".` : stageF && filter === 'all' ? 'No homes in that stage have a thread yet.' : EMPTY[filter];
    // empty list: the same calm block the other two panes use (icon, one bold line, the rest as a sentence)
    const cut = none.indexOf('. '), nh = cut > 0 ? none.slice(0, cut) : none.replace(/\.$/, ''), nb = cut > 0 ? none.slice(cut + 2) : '';
    const html = rows || (isPhone() && !q && !stageF && filter === 'all' && !threads().length ? startHTML(RC.daily ? RC.daily() : []) : '') || `<div class="cempty cnone"><span class="ic">${ICON[filter === 'reply' ? 'reply' : filter === 'out' ? 'stop' : 'text'] || ICON.text}</span><b>${nh}</b>${nb ? `<p>${nb}</p>` : ''}</div>`;
    if (clist.__h !== html) { clist.innerHTML = html; clist.__h = html; }
    clN.textContent = ts.length ? ts.length + (ts.length === 1 ? ' home' : ' homes') : '';
    const act = n.due + n.late + n.reply, vi = $('#vInN'); vi.hidden = !act; vi.textContent = act;
    const pn = $('#pipeN'), vp = $('#vPipeN'); if (pn) { vp.hidden = !pn.textContent || pn.textContent === '0'; vp.textContent = pn.textContent; }
    if (!warmed && ts.length && RC.ownersWarm) { warmed = true; RC.ownersWarm().then(ok => { if (ok) { clist.__h = null; paint(); } }); }
    return ts;
  }

  // ---------- the conversation ----------
  function bubble(a) {
    const inb = a.dir === 'in', sys = !inb && !(a.ch === 'text' || a.ch === 'email');
    const at = esc(a.at), on = a.at === MSG ? ' on' : '';
    if (sys) { const head = a.ch === 'call' && a.outcome ? 'Call: ' + (OUTL[a.outcome] || '').toLowerCase() : a.what;
      return `<button type="button" class="msg sys${on}" data-at="${at}"><span class="ic">${ICON[a.ch] || ICON.note}</span><span>${esc(head)}${a.note ? ' “' + esc(a.note) + '”' : ''}</span><time>${esc(tm(a.at))}</time></button>`; }
    const kind = inb ? 'Reply from the homeowner' : a.what || LABEL[a.ch];
    // the meta line stays light: the channel only when it is email (a text is the default), then the time
    return `<button type="button" class="msg ${inb ? 'in' : 'out'} ${a.ch}${on}" data-at="${at}" aria-label="${esc(kind)}, ${esc(full(a.at))}" title="${esc(kind)}">` +
      `<span class="mb">${a.subject ? '<b>' + esc(a.subject) + '</b>' : ''}${esc(a.body || a.what || '')}</span>` +
      `<span class="mm">${a.ch === 'email' ? 'Email · ' : ''}${esc(tm(a.at))}</span></button>`;
  }
  // the composer's one menu: a quick reply drops the library's answer into the draft
  const quickHTML = h => RC.copy ? `<details class="cqr"><summary><span class="ic">${ICON.reply}</span>Quick replies</summary><div class="cqr-l" role="menu">${QUICK.map(k => `<button type="button" role="menuitem" data-qr="${k[0]}">${esc(k[1])}</button>`).join('')}</div></details>` : '';
  function stageSelect(id) {
    const p = RC.pipeline()[id] || {}, st = p.archived ? 'lost' : RC.stage(id);
    return `<label class="cstage"><span class="vh">Stage</span><select class="cvStage${st === 'lost' ? ' lost' : ''}" aria-label="Stage">${RC.STAGES.map(s => `<option value="${s[0]}"${st === s[0] ? ' selected' : ''}>${esc(s[1])}</option>`).join('')}<option value="lost"${st === 'lost' ? ' selected' : ''}>Not now</option></select></label>`;
  }
  // a reply or a deal in progress ends the cold cadence: the composer turns into a plain answer box (no library draft,
  // the person writes it), still under the texting hours, the 3 per 24 h cap and the opt-out
  function answerHTML(id, h, c) {
    const ai = aiDraftFor(id), ch = chan === 'email' || (chan === 'auto' && ai && ai.ch === 'email') ? 'email' : 'text', ct = RC.canText(id, h.phone || null);
    const lab = ai ? 'Nimbus drafted an answer, check it before it goes' : c.stopped === 'replied' ? 'They replied' : 'In a deal, ' + RC.stageName(RC.stage(id));
    const seg = `<div class="cseg" role="group" aria-label="Channel"><button type="button" data-ch="text" aria-pressed="${ch === 'text'}">Text</button><button type="button" data-ch="email" aria-pressed="${ch === 'email'}">Email</button></div>`;
    const send = ch === 'text' ? (ct.ok ? `<a class="cbtn pri" data-a="send" data-mode="answer" href="${smsHref(h.phone, '')}"><span class="ic">${ICON.send}</span>Open in Messages</a>` : `<button type="button" class="cbtn pri off" aria-disabled="true"><span class="ic">${ICON.send}</span>Open in Messages</button>`)
      : `<a class="cbtn pri" data-a="send" data-mode="answer" href="${mailHref('', '')}"><span class="ic">${ICON.send}</span>Open in Mail</a>`;
    const why = ch === 'text' && !ct.ok ? ct.reason + '.' : '';
    return `<section class="cnext"><div class="clab"><span>${esc(lab)}</span>${seg}</div><textarea class="cdraft" rows="3" aria-label="Your ${ch}" placeholder="Write your ${ch === 'text' ? 'text' : 'email'}">${ai ? esc(ai.body) : ''}</textarea>` +
      `<div class="cact">${quickHTML(h)}${why ? `<p class="cnote">${esc(why)}</p>` : ''}${send}</div></section>`;
  }
  function nextHTML(id, h, c) {
    if (c.stopped === 'replied' || c.stopped === 'in a deal') return sugg[id] ? '' : answerHTML(id, h, c);   // the suggested answer above is the composer
    if (c.stopped === 'not a fit') return `<section class="cnext nx-stop"><div class="clab">No next touch</div><p class="cnote">Skipped on Today as not a fit. It stays off the Daily 50 until the skip is undone.</p></section>`;
    if (c.stopped) return `<section class="cnext nx-stop"><div class="clab">No next touch</div><p class="cnote">${c.stopped === 'opted out' ? 'This homeowner opted out. No more texts, emails or follow-ups.' : c.stopped === 'won' ? 'Won. Follow-ups stop here.' : 'Moved to Not now. Follow-ups stop until the home is restored on the Pipeline.'}</p></section>`;
    // a reply Nimbus drafted from Ask (lib/rc-ask.js, scripts/voice/server.py) waits here until something newer goes out
    const r0 = draftFor(h, chan), ai = aiDraftFor(id), r = ai ? Object.assign({}, r0, { body: ai.body, subject: ai.subject || r0.subject }) : r0, ch = chan === 'auto' ? (ai ? ai.ch : r.eff) : chan;   // the segment shows the channel the library chose unless the user picked one
    const when = !c.lastContact ? 'first touch' : c.overdue ? `${c.daysOverdue} day${c.daysOverdue === 1 ? '' : 's'} overdue` : c.dueToday ? 'due today' : 'due ' + dayFmt(c.nextDue);
    const seg = `<div class="cseg" role="group" aria-label="Channel"><button type="button" data-ch="text" aria-pressed="${ch === 'text'}">Text</button><button type="button" data-ch="email" aria-pressed="${ch === 'email'}">Email</button></div>`;
    let send = '', why = '';
    if (ch === 'text') {
      const ct = RC.canText(id, h.phone || null);   // texting hours, the 3 per 24 h cap, opt-out
      if (r.canSend && h.phone && ct.ok) send = `<a class="cbtn pri" data-a="send" href="${smsHref(h.phone, r.body)}"><span class="ic">${ICON.send}</span>Open in Messages</a>`;
      else send = `<button type="button" class="cbtn pri off" aria-disabled="true"><span class="ic">${ICON.send}</span>Open in Messages</button>`;
      why = r.blocked === 'opted out' ? 'Opted out.' : !h.phone ? 'Next: get the phone number.' : !r.canSend ? (r.blocked || 'Not ready to send.') : !ct.ok ? ct.reason + '.' : '';
    } else {
      if (r.canSend) send = `<a class="cbtn pri" data-a="send" href="${mailHref(r.subject, r.body)}"><span class="ic">${ICON.send}</span>Open in Mail</a>`;
      else send = `<button type="button" class="cbtn pri off" aria-disabled="true"><span class="ic">${ICON.send}</span>Open in Mail</button>`;
      why = r.missing && r.missing.includes('mailingAddress') ? 'Add your mailing address to send emails.' : r.blocked || '';
    }
    why = why ? why.charAt(0).toUpperCase() + why.slice(1) : '';   // the library's reasons start lowercase ("day 3 goes by email"); here they are sentences
    return `<section class="cnext"><div class="clab"><span>Day ${r.dayN || c.step} ${ch}, ${esc(when)}</span>${seg}</div>` +
      (r.body ? (ch === 'email' && r.subject ? `<p class="csubj">${esc(r.subject)}</p>` : '') + `<textarea class="cdraft" rows="${ch === 'email' ? 5 : 3}" aria-label="Next ${ch} draft" ${r.canSend ? '' : 'readonly'}>${esc(r.body)}</textarea>` : '') +
      `<div class="cact">${quickHTML(h)}${why ? `<p class="cnote">${why}</p>` : ''}${send}</div></section>`;
  }
  function aiDraftFor(id) {
    let all = {}; try { all = JSON.parse(localStorage.getItem('rc.t.aidraft') || '{}'); } catch (e) { }
    const d = all[id]; if (!d || !d.body) return null;
    const last = RC.history(id).find(x => x.dir !== 'in' && (x.kind === 'text' || x.kind === 'email'));
    return last && last.at > d.at ? null : d;
  }
  function suggHTML(id, h) {
    const s = sugg[id]; if (!s) return '';
    const park = s.kind === 'not_interested' || s.kind === 'have_roofer';
    return `<section class="csugg"><div class="clab"><span>${s.kind ? 'Suggested answer, ' + esc(s.label).toLowerCase() : 'Write your answer'}</span><button type="button" class="clink" data-a="dismiss">Dismiss</button></div>` +
      (s.kind === 'stop' ? `<p class="cnote">Opted out. One confirmation text is fine, then nothing more.</p>` : '') +
      (park ? `<p class="cnote">Sending this also moves the home to Not now.</p>` : '') +
      `<textarea class="csdraft" rows="3" aria-label="Answer">${esc(s.body || '')}</textarea>` +
      `<div class="cact">${quickHTML(h)}${!h.phone ? '<p class="cnote">Get phone to text or call.</p>' : (ct => ct.ok || s.kind === 'stop' ? `<a class="cbtn pri" data-a="answer" href="${smsHref(h.phone, s.body || '')}"><span class="ic">${ICON.send}</span>Open in Messages</a>` : `<p class="cnote">${esc(ct.reason)}.</p>`)(RC.canText(id, h.phone))}</div></section>`;
  }
  // a fresh account: the first morning in three steps (the conversation pane on desktop, the list on a phone; 10-19)
  function startHTML(l) { return `<div class="cempty cstart"><span class="ic">${ICON.text}</span><b>Start with Today's 50</b><p>Nothing is logged yet. Your first morning, in three steps:</p><ol class="csteps"><li><i>1</i><span><b>Text the first home</b>One tap on Today opens the draft on your phone. You send it.</span></li><li><i>2</i><span><b>Answer here</b>Each home's texts, emails and replies become one thread, with the next touch ready.</span></li><li><i>3</i><span><b>Book the inspection</b>From the thread or the home. It lands on your calendar.</span></li></ol>${l.length ? `<div class="cact"><button type="button" class="cbtn pri" data-a="today">Open Today's 50</button><button type="button" class="cbtn" data-a="stop1">Stop 1: ${esc(l[0].street || 'first home')}</button></div>` : ''}</div>`; }
  function paintThread() {
    const id = SEL;
    if (!id) {
      const none = !threads().length, l = none && RC.daily ? RC.daily() : [];
      const e = none ? startHTML(l)
        : `<div class="cempty"><span class="ic">${ICON.text}</span><b>Pick a home on the left</b><p>Its texts, emails and replies show here, with the next touch ready to send. The house and its roof sit on the right.</p></div>`;
      if (cvh.__h !== '') { cvh.innerHTML = ''; cvh.__h = ''; } if (cvm.__h !== e) { cvm.innerHTML = e; cvm.__h = e; } if (cvf.__h !== '') { cvf.innerHTML = ''; cvf.__h = ''; } return;
    }
    const h = homeOf(id), c = RC.cadence(id), cl = cadLine(c), out = RC.optedOut(id);
    // one line under the address: who, where, and where the follow-ups stand; everything else is on the home pane or the record
    const sub = [firstName(h.owner) || h.owner || (OWNDATA ? RC.OWNER_NONE : ''), h.city, cl.t].filter(Boolean);
    const homeOff = crm.dataset.home === 'off';
    const head = `<div class="cvt-r"><button type="button" class="cback" data-a="back" aria-label="Back to the inbox"><span class="ic">${ICON.back}</span></button>` +
      `<div class="cvt"><b>${esc(h.addr)}</b><small>${sub.map((s, i) => i === sub.length - 1 && cl.k ? `<span class="${cl.k}">${esc(s)}</span>` : esc(s)).join(' · ')}</small></div>` +
      stageSelect(id) +
      `<button type="button" class="cico house" data-a="house" aria-label="${homeOff ? 'Show the home' : 'Hide the home'}" aria-pressed="${!homeOff}" title="${homeOff ? 'Show the home' : 'Hide the home'}"><span class="ic">${ICON.roof}</span></button>` +
      `<details class="cmenu"><summary aria-label="More" title="More"><span class="ic">${ICON.more}</span></summary><div class="cmenu-l" role="menu">` +
      `<button type="button" role="menuitem" data-a="reply"${out ? ' disabled' : ''}>Log a reply</button>` +
      `<button type="button" role="menuitem" data-a="record">Open the home record</button>` +
      `<button type="button" role="menuitem" class="${out ? '' : 'warn'}" data-a="optout">${out ? 'Opt back in' : 'Opt out'}</button></div></details></div>`;
    if (cvh.__h !== head) { cvh.innerHTML = head; cvh.__h = head; }
    // messages oldest first, grouped by day; a scheduled text last with its countdown
    const recs = RC.activity().filter(a => a.id === id).reverse(), sc = RC.scheduledFor(id);
    let body = '', day = '';
    recs.forEach(a => { const d = dayHead(a.at); if (d !== day) { day = d; body += `<div class="mday"><span>${esc(d)}</span></div>`; } body += bubble(a); });
    if (sc) body += `<div class="msg sched" data-sid="${esc(sc.sid)}"><span class="mb">${esc(sc.body)}</span><span class="mm">Scheduled, <span data-due="${esc(sc.due)}">${esc(RC.countdown(sc.due))}</span>, from your phone<button type="button" data-a="unsched">Cancel</button></span></div>`;
    if (!recs.length && !sc) body = `<p class="cnote mnone">Nothing on record yet for this home.</p>`;
    let pin = false;   // scroll to the newest message only after the composer below has its height (it shrinks the thread)
    if (cvm.__h !== body) { const atEnd = cvm.scrollHeight - cvm.scrollTop - cvm.clientHeight < 40; cvm.innerHTML = body; cvm.__h = body; pin = atEnd || !cvm.__id || cvm.__id !== id; cvm.__id = id; }
    const foot = (replying ? `<section class="creply"><div class="clab"><label for="iRep">What did the homeowner say?</label><button type="button" class="clink" data-a="rcancel">Cancel</button></div><textarea id="iRep" rows="3" placeholder="Paste their text or email, or note what they said"></textarea><div class="cact"><button type="button" class="cbtn pri" data-a="rsave">Save reply</button></div></section>` : '') + suggHTML(id, h) + nextHTML(id, h, c);
    if (cvf.__h !== foot) { const keep = cvf.querySelector('#iRep') ? cvf.querySelector('#iRep').value : null; cvf.innerHTML = foot; cvf.__h = foot; if (keep != null && cvf.querySelector('#iRep')) cvf.querySelector('#iRep').value = keep; }
    if (pin) cvm.scrollTop = cvm.scrollHeight;
  }

  // ---------- the home pane: the record's 3D house plus its facts ----------
  function paintHome() {
    const id = SEL;
    if (!id) { const e = `<div class="cempty"><span class="ic">${ICON.roof}</span><b>The house shows here</b><p>Pick a thread and the home's roof, hail, roof record and stage follow.</p></div>`; if (chh.__h !== '') { chh.innerHTML = ''; chh.__h = ''; } if (chf.__h !== e) { chf.innerHTML = e; chf.__h = e; } return; }
    const h = homeOf(id), H = window.HOME, mine = !!(H && H.rawId === id), st = RC.stage(id), idx = RC.STAGES.findIndex(s => s[0] === st), b = RC.booking(id), arch = (RC.pipeline()[id] || {}).archived;
    const head = `<button type="button" class="cback" data-a="tothread" aria-label="Back to the conversation"><span class="ic">${ICON.back}</span></button><div class="cvt"><b>${esc(h.addr)}</b><small>${esc([h.place || [h.city, h.zip].filter(Boolean).join(' '), h.subdivision].filter(Boolean).join(' · '))}</small></div>` +
      `<button type="button" class="cico" data-a="house" aria-label="Hide the home" title="Hide the home"><span class="ic">${ICON.close}</span></button>`;
    if (chh.__h !== head) { chh.innerHTML = head; chh.__h = head; }
    const roof = h.roofAge || (h.year ? 'Built ' + h.year : mine ? 'Checking the county record' : 'Not on file');
    // re-roof line only where the city's permit list is complete (McKinney, Allen: lib/st-meta.js reroof), else nothing
    const rr = mine && H.rec && H.rec.reroof, permit = rr ? (rr.none ? 'No re-roof permit since ' + rr.since : (rr.done ? 'Re-roofed ' : 'Re-roof permit ') + rr.date) : '';
    const meas = h.sqMeasured != null ? h.sqMeasured : !!(mine && H.measure && H.measure.facet);   // measured from LiDAR roof facets: no ~, no est.
    const sq = h.sq != null ? String(h.sq) : mine && H.measure === null ? 'No outline' : mine && H.measure && H.measure.squares == null ? 'Not measured' : 'Measuring';
    const pitch = h.pitch ? h.pitch : (mine && H.measure === null ? 'No outline' : 'Measuring');
    const tip = window.RealRoof ? RealRoof.tip(mine && H.measure) : 'Estimated from public building outlines and 2018 LiDAR. Verify on site.';
    const strip = RC.STAGES.map((s, i) => `<button type="button" class="cst${i < idx ? ' dn' : ''}${i === idx && !arch ? ' on' : ''}" data-s="${s[0]}" aria-current="${i === idx ? 'step' : 'false'}"><span class="d">${i < idx ? ICON.check : i + 1}</span><b>${esc(s[1])}</b></button>`).join('');
    // 10-17: the few facts a roofer needs while texting (hail, roof, squares), Book, then the rest behind More
    const facts = `<div class="cstg-row"><span>Stage</span>${stageSelect(id)}</div><div class="ckpi">` +   // the stage row shows on the phone sheet, where the thread header has no room for it
      `<div><span>Hail</span>${h.hail != null ? `<b>${h.hail.toFixed(2)} in</b><small>${esc(h.hailDate)}</small>` : '<b class="sm">Not on file</b>'}</div>` +
      `<div><span>Roof</span>${h.year ? `<b>${esc(String(h.year))}</b><small>${esc(permit)}</small>` : `<b class="sm">${esc(roof)}</b><small>${esc(permit)}</small>`}</div>` +
      `<div><span>Squares</span><b${/^\d/.test(sq) ? '' : ' class="sm"'} title="${esc(tip)}">${esc(sq)}</b><small>${h.sq != null ? 'estimate, LiDAR' : ''}</small></div></div>` +
      `<div class="cact book">${b ? `<p class="cnote"><span class="ic">${ICON.cal}</span>Inspection ${esc(RC.when(b))}</p><button type="button" class="cbtn" data-a="ics"><span class="ic">${ICON.cal}</span>Add to calendar</button><button type="button" class="cbtn pri" data-a="book">Reschedule</button>` : `<button type="button" class="cbtn pri" data-a="book"><span class="ic">${ICON.cal}</span>Book inspection</button>`}</div>` +
      `<details class="cmore"${chf.__more ? ' open' : ''}><summary><span>More about this home</span><span class="ic">${ICON.chev}</span></summary>` +
      `<div class="cfg">` +
      `<div><span>Owner</span><b>${OWNDATA ? (h.owner ? RC.blurHTML(h.owner) + (h.homestead ? ', homestead' : '') : RC.OWNER_NONE) : 'Owner name not available'}</b></div>` +
      (RC.tracedRows ? RC.tracedRows(h.addr, h.zip) : '') +
      `<div><span>Pitch</span><b title="${esc(tip)}">${esc(String(pitch))}${h.pitch ? ', LiDAR' : ''}</b></div>` +
      `<div><span>Roof shape</span><b>${esc(mine && H.measure && H.measure.checking ? 'Being checked' : mine && H.measure && H.measure.shape ? H.measure.shape : 'Not on file')}</b></div>` +
      `<div><span>Texts</span><b>${h.past ? 'Past customer' : h.optin ? 'Opted in' : RC.optedOut(id) ? 'Opted out' : 'Not yet opted in'}</b></div></div>` +
      `<div class="cstrip" role="group" aria-label="Stage">${strip}</div>${arch ? '<p class="cnote">Parked in Not now on the Pipeline.</p>' : ''}` +
      (/^m\d+$/.test(id) ? `<button type="button" class="cbtn wide" data-a="hailrep"><span class="ic">${ICON.doc}</span>Storm report for the homeowner</button>` : '') +
      `<button type="button" class="cbtn wide" data-a="record"><span class="ic">${ICON.roof}</span>Open the home record</button></details>`;
    if (chf.__h !== facts) { chf.innerHTML = facts; chf.__h = facts; }
  }
  // the one 3D stage lives in the home pane while a thread is open, else in the record
  function placeStage() {
    const st = $('#stage'); if (!st) return;
    const want = VIEW === 'inbox' && SEL ? chstage : $('.left'); if (!want) return;
    if (st.parentNode !== want) { want.appendChild(st); requestAnimationFrame(() => { if (window.__refit) window.__refit(); }); }
  }
  let auto = false;
  function paint() {
    if (hold) return;
    // desktop: the first thread opens on its own when nothing is open (a new thread arriving from Today, the frame
    // waking up after a prefetch, a resize from a phone)
    // (an empty inbox opens nothing: the middle pane says start with Today's 50, never an unrelated home's thread)
    if (VIEW === 'inbox' && !SEL && !isPhone() && !auto && !document.hidden) { const t = threads()[0], id = t ? t.id : null; if (id) { auto = true; try { select(id, 'auto'); } finally { auto = false; } return; } }
    if (VIEW !== 'inbox') { const vp = $('#vPipeN'), pn = $('#pipeN'); if (pn) { vp.hidden = !pn.textContent || pn.textContent === '0'; vp.textContent = pn.textContent; } const vi = $('#vInN'), n = threads().filter(t => t.due || t.late || t.replied).length; vi.hidden = !n; vi.textContent = n; return; }
    paintList(); paintThread(); paintHome();
  }
  window.renderCRM = paint;

  // ---------- selection, views, routes ----------
  function select(id, how) {   // how: 'click' (a history entry) | 'auto' (replace) | 'route' (the shell asked; nothing announced)
    SEL = id; MSG = null; chan = 'auto'; replying = false;
    if (id) try { localStorage.setItem('rc.t.lastThread', JSON.stringify(id)); } catch (e) { }   // Ask's "this homeowner"
    if (id && curId() !== id && window.switchHome) window.switchHome(id, true);
    if (isPhone() && id) crm.dataset.screen = 'thread';
    placeStage(); paint();
    if (how === 'click' && window.homeAnnounce) window.homeAnnounce(true); else if (how === 'auto' && window.homeAnnounce) window.homeAnnounce(false);
    const r = clist.querySelector(`.crow[data-id="${CSS.escape(id || '')}"]`); if (r && how === 'click') r.focus({ preventScroll: true });
  }
  function setView(v, quiet, id) {
    v = v === 'pipeline' || v === 'home' || v === 'calendar' || v === 'customers' ? v : 'inbox';
    const was = VIEW; VIEW = v; document.body.dataset.view = v;
    vtabs.querySelectorAll('[data-v]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'));
    if (v === 'inbox') {
      if (id) SEL = id;
      else if (!SEL && !isPhone()) { const t = threads()[0]; SEL = t ? t.id : null; }   // an empty inbox selects nothing
      if (SEL && curId() !== SEL && window.switchHome) window.switchHome(SEL, true);
      crm.dataset.screen = isPhone() ? (id ? 'thread' : 'list') : 'list';
    }
    // the board lives in the right column's Pipeline pane: show it for the Pipeline view (desktop hid every pane, 10-22), and
    // put This home back when leaving it
    if (window.showPane) { if (v === 'pipeline') window.showPane('pipe'); else if (was === 'pipeline') window.showPane('home'); }
    if (v === 'pipeline' && window.renderPipe) setTimeout(() => { window.renderPipe(true); dispatchEvent(new Event('resize')); }, 30);
    if (v === 'home') { const H = window.HOME; $('#vHomeLbl').textContent = !isPhone() && H && H.rec && H.rec.addr ? H.rec.addr : 'Home'; }
    if (v === 'calendar' && window.renderCal) window.renderCal();   // cal.js paints the calendar view
    if (v === 'customers' && window.renderPC) window.renderPC();   // customers.js paints Past customers
    placeStage(); paint();
    if (v !== 'inbox' && window.__refit) requestAnimationFrame(() => window.__refit());
    try { document.title = (v === 'home' && window.HOME && window.HOME.rec ? window.HOME.rec.addr : v === 'pipeline' ? 'Pipeline' : v === 'calendar' ? 'Calendar' : v === 'customers' ? 'Past customers' : 'CRM') + ' | Roof Command'; } catch (e) { }
    if (!quiet && window.homeAnnounce) window.homeAnnounce(was !== v);
  }
  window.crmView = () => VIEW;
  window.crmFacts = id => facts(homeOf(id));   // the check script compares drafts with the same facts
  addEventListener('message', e => { if (e.origin !== location.origin) return; const d = e.data || {}; if (d.type === 'visibility' && d.hidden === false) setTimeout(paint, 50); });
  window.crmSetView = setView;
  window.crmOpenHome = id => { if (id && curId() !== id && window.switchHome) window.switchHome(id, true); SEL = SEL || id; setView('home'); };
  vtabs.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; if (b.dataset.v === 'inbox' && VIEW === 'inbox' && isPhone()) crm.dataset.screen = 'list'; setView(b.dataset.v); });

  // ---------- list: filters, search, rows ----------
  // the one Show control: a view (all, needs an answer, due, overdue, opted out) or one stage
  cfil.addEventListener('change', e => {
    if (e.target.id !== 'cshow') return; const v = e.target.value;
    if (/^s:/.test(v)) { stageF = v.slice(2); filter = 'all'; } else { filter = FILTERS.some(x => x[0] === v) ? v : 'all'; stageF = ''; }
    try { localStorage.setItem(FK, filter); } catch (er) { } paint();
  });
  cq.addEventListener('input', () => { q = cq.value.trim().toLowerCase(); paint(); });
  cq.addEventListener('keydown', e => { if (e.key === 'Escape') { cq.value = ''; q = ''; paint(); } });
  clist.addEventListener('click', e => { if (e.target.closest('[data-a="today"],[data-a="stop1"]')) { onAct(e); return; } const r = e.target.closest('[data-id]'); if (r) select(r.dataset.id, 'click'); });
  clist.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return; const rows = [...clist.querySelectorAll('.crow')], i = rows.indexOf(document.activeElement); if (i < 0) return;
    e.preventDefault(); const n = rows[(i + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]; n.focus(); select(n.dataset.id, 'click');
  });

  // ---------- conversation: messages point the home pane at this home; the composer hands off and logs ----------
  // the thread keeps its newest message in view when the composer or the phone's list -> thread switch resizes it
  if (window.ResizeObserver) { let end = true; cvm.addEventListener('scroll', () => { end = cvm.scrollHeight - cvm.scrollTop - cvm.clientHeight < 40; }, { passive: true }); new ResizeObserver(() => { if (end) cvm.scrollTop = cvm.scrollHeight; }).observe(cvm); }
  cvm.addEventListener('click', e => {
    if (e.target.closest('[data-a="today"],[data-a="stop1"]')) { onAct(e); return; }
    const un = e.target.closest('[data-a="unsched"]'); if (un) { const sid = un.closest('[data-sid]').dataset.sid, it = RC.cancelScheduled(sid); if (it) say('Scheduled text cancelled.', () => RC.restoreScheduled(it)); paint(); return; }
    const m = e.target.closest('.msg[data-at]'); if (!m) return;
    MSG = m.dataset.at === MSG ? null : m.dataset.at;
    if (SEL && curId() !== SEL && window.switchHome) window.switchHome(SEL, true);
    placeStage(); paint();
    if (isPhone()) crm.dataset.screen = 'home';
    else { const ch = $('#ch'); ch.classList.remove('flash'); void ch.offsetWidth; ch.classList.add('flash'); }
  });
  function logAnswer(id, s, body) {
    RC.logText(id, s.kind === 'stop' ? 'Opt-out confirmation drafted in Messages' : 'Answer drafted in Messages', { body, to: homeOf(id).phone });
    if (s.kind === 'not_interested' || s.kind === 'have_roofer') { if (!(RC.pipeline()[id] || {}).archived) RC.setStage(id, RC.stage(id), 'Moved to Not now', { archived: new Date().toISOString() }); }
  }
  function onAct(e) {
    const b = e.target.closest('[data-a],[data-ch],[data-s],[data-qr]'); if (!b) return; const id = SEL;
    const menu = b.closest('details.cmenu,details.cqr'); if (menu) menu.open = false;   // a pick closes its menu
    if (b.dataset.ch) { chan = b.dataset.ch; cvf.__h = null; paint(); return; }
    if (b.dataset.s) { if (id && window.homeSetStage) window.homeSetStage(id, b.dataset.s); return; }
    if (b.dataset.qr) {   // a quick reply: the library's answer goes into the draft, nothing is sent
      if (!id || !RC.copy) return; const ta = cvf.querySelector('.csdraft,.cdraft'); if (!ta) return;
      let body = ''; try { body = RC.copy.render('reply.' + b.dataset.qr, facts(homeOf(id))).body || ''; } catch (er) { body = ''; }
      if (body) { ta.readOnly = false; ta.value = body; qrKind = b.dataset.qr; ta.focus(); }
      return;
    }
    const a = b.dataset.a;
    if (a === 'back') { crm.dataset.screen = 'list'; if (isPhone()) { SEL = null; MSG = null; placeStage(); paint(); if (window.homeAnnounce) window.homeAnnounce(false); } return; }
    if (a === 'tothread') { crm.dataset.screen = 'thread'; return; }
    if (a === 'house') {   // phone: the house sheet; desktop: show or hide the home pane so the conversation breathes
      if (isPhone()) { crm.dataset.screen = 'home'; return; }
      const off = crm.dataset.home !== 'off'; if (off) crm.dataset.home = 'off'; else delete crm.dataset.home;
      try { localStorage.setItem(HK, off ? 'off' : 'on'); } catch (er) { }
      cvh.__h = null; paint(); if (!off) { requestAnimationFrame(() => { if (window.__refit) window.__refit(); }); const ch = $('#ch'); ch.classList.remove('flash'); void ch.offsetWidth; ch.classList.add('flash'); }
      return;
    }
    if (a === 'record') { if (id) window.crmOpenHome(id); return; }
    if (a === 'hailrep') { if (id) window.open('hail-report.html?id=' + encodeURIComponent(id) + (/[?&]dev=1/.test(location.search) ? '&dev=1' : ''), '_blank'); return; }   // the printable Storm report (10-19)
    if (a === 'today') { RC.go('daily', {}); return; }
    if (a === 'stop1') { const l = RC.daily ? RC.daily() : []; if (l[0]) select(l[0].id, 'click'); return; }
    if (!id) return;
    if (a === 'reply') { replying = true; cvf.__h = null; paint(); const r = cvf.querySelector('#iRep'); r && r.focus(); return; }
    if (a === 'rcancel') { replying = false; cvf.__h = null; paint(); return; }
    if (a === 'rsave') {
      const said = (cvf.querySelector('#iRep').value || '').trim(); if (!said) { cvf.querySelector('#iRep').focus(); return; }
      replying = false; const k = window.Inbox && Inbox.classify ? Inbox.classify(said) : null; let body = '';
      if (k) { try { body = RC.copy.render('reply.' + k.kind, facts(homeOf(id))).body; } catch (er) { body = ''; } }
      sugg[id] = { kind: k ? k.kind : null, label: k ? k.label : '', body, said };
      RC.logReply(id, said, chan === 'email' ? 'email' : 'text');
      if (k && k.kind === 'stop') RC.optOut(id, 'STOP');
      cvf.__h = null; paint(); return;
    }
    if (a === 'dismiss') { delete sugg[id]; cvf.__h = null; paint(); return; }
    if (a === 'optout') { if (RC.optedOut(id)) RC.optOut(id, 'manual', false); else RC.optOut(id, 'marked by you'); paint(); return; }
    if (a === 'book') { if (window.homeBook) window.homeBook({ id, addr: homeOf(id).addr, onCancel: paint }); return; }
    if (a === 'ics') { if (window.homeIcs && window.homeIcs(id)) say('Calendar file saved. Open it to add the inspection to your calendar.'); return; }
    // hand-offs: the link must still be in the page when the click finishes, so the record is written with repaints
    // held and the thread repainted just after
    const after = f => { hold = true; try { f(); } finally { hold = false; } setTimeout(() => { cvf.__h = null; paint(); }, 30); };
    if (a === 'answer') { const s = sugg[id], body = (cvf.querySelector('.csdraft').value || '').trim() || s.body; b.href = smsHref(homeOf(id).phone, body); after(() => { delete sugg[id]; logAnswer(id, s, body); }); return; }
    if (a === 'send') {
      if (b.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
      if (b.dataset.mode === 'answer') {   // a free answer after a reply / in a deal: only what the person typed goes
        const ta = cvf.querySelector('.cdraft'), h = homeOf(id), body = ta ? ta.value.trim() : '';
        if (!body) { e.preventDefault(); if (ta) ta.focus(); return; }
        const ai = aiDraftFor(id), em = chan === 'email' || (chan === 'auto' && ai && ai.ch === 'email'), qk = qrKind; qrKind = null;
        if (!em) { b.href = smsHref(h.phone, body); after(() => { if (qk) logAnswer(id, { kind: qk }, body); else RC.logText(id, 'Answer drafted in Messages', { body, to: h.phone }); }); }
        else { b.href = mailHref(ai && ai.subject || '', body); after(() => RC.logEmail(id, 'Email answer drafted', { subject: ai && ai.subject || undefined, body })); }
        return;
      }
      const ta = cvf.querySelector('.cdraft'), h = homeOf(id), r = draftFor(h, chan), body = (ta && ta.value.trim()) || r.body;
      if ((chan === 'auto' ? r.eff : chan) === 'text') { b.href = smsHref(h.phone, body); after(() => RC.logText(id, 'Text drafted in Messages', { body, to: h.phone })); }
      else { b.href = mailHref(r.subject, body); after(() => RC.logEmail(id, 'Email drafted', { subject: r.subject, body })); }
    }
  }
  cvh.addEventListener('click', onAct); cvf.addEventListener('click', onAct); chh.addEventListener('click', onAct); chf.addEventListener('click', onAct);
  chf.addEventListener('toggle', e => { if (e.target.classList.contains('cmore')) chf.__more = e.target.open; }, true);   // More stays open across repaints
  // the header's More menu closes on a click elsewhere or Escape
  document.addEventListener('click', e => { document.querySelectorAll('#crm details[open]').forEach(d => { if (!d.contains(e.target) && !d.classList.contains('cmore')) d.open = false; }); });
  const onStage = e => { if (e.target.classList.contains('cvStage') && SEL) { const k = e.target.value; if (k === 'lost') { if (!(RC.pipeline()[SEL] || {}).archived) { RC.setStage(SEL, RC.stage(SEL), 'Moved to Not now', { archived: new Date().toISOString() }); say(homeOf(SEL).addr + ' moved to Not now.'); } } else if (window.homeSetStage) window.homeSetStage(SEL, k); cvh.__h = null; chf.__h = null; paint(); } };
  cvh.addEventListener('change', onStage); chf.addEventListener('change', onStage);
  addEventListener('keydown', e => { if (e.key === 'Escape') { const o = document.querySelector('#crm details.cmenu[open],#crm details.cqr[open]'); if (o) { o.open = false; return; } } if (e.key === 'Escape' && VIEW === 'inbox' && isPhone() && !e.target.closest('textarea,input')) { const s = crm.dataset.screen; if (s === 'home') crm.dataset.screen = 'thread'; else if (s === 'thread') onAct({ target: cvh.querySelector('[data-a="back"]') || cvh }); } });
  // the scheduled text's countdown ticks
  setInterval(() => { cvm.querySelectorAll('[data-due]').forEach(e => { e.textContent = RC.countdown(e.dataset.due); }); }, 1000);
  setInterval(() => { if (VIEW === 'inbox') { clist.__h = null; paint(); } }, 60000);   // "2 min ago" and due days move with the clock
  RC.on(d => { if (d.key === 'sched' || d.key === 'optout' || d.key === 'homes' || d.key === 'pipe') paint(); if (d.key === 'aidraft') { cvf.__h = null; paint(); } });
  phoneMQ.addEventListener('change', () => { if (VIEW === 'inbox') { if (!isPhone() && !SEL) { const t = threads()[0]; if (t) select(t.id, 'auto'); } crm.dataset.screen = isPhone() && SEL ? 'thread' : 'list'; } placeStage(); });

  // ---------- first paint: ?view= (the shell), else the record when an id was asked for, else the inbox ----------
  // the view the page was opened with = what the inline script in index.html read from the URL before any script ran:
  // when today's list lands before this file runs, rec.js has already announced 'home' and rewritten ?view=, which
  // used to open the record over a #/crm/pipeline or #/crm/calendar deep link; the announce below puts the hash right
  const q0 = new URLSearchParams(location.search), id0 = q0.get('home') || q0.get('id') || '', v0 = document.body.dataset.view || q0.get('view') || (id0 ? 'home' : 'inbox');
  setView(v0, true, v0 === 'inbox' && id0 ? id0 : null);
  if (window.homeAnnounce && ((VIEW === 'inbox' && SEL) || VIEW === 'pipeline' || VIEW === 'calendar')) window.homeAnnounce(false);
})();
