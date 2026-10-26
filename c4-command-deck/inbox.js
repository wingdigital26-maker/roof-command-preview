/* inbox.js: the Today screen's CRM inbox. One thread per home, newest first, built only from this device's real records
   (RC.activity(): texts opened in Messages and email drafts with their words, replies
   the rep logged, notes, bookings and stage moves, all from the shared pipeline history in lib/rc-state.js).
   Each row: the home, the owner when the private roll is loaded, last contact ("2 days ago"), the cadence step and its
   next due day (lib/rc-queue.js RC.cadence), the stage and the latest words.
   Filters: All / Due today / Overdue / Replied (the homeowner's reply is the latest record, so it needs an answer) /
   Opted out. Search by address or owner.
   Thread view: the whole history, the next touch drafted from lib/rc-copy.js (one tap = the sms: or mailto: hand-off to
   the rep's phone, and it goes on the record), "Log a reply" (the rep pastes what the homeowner said: STOP opts the home
   out and drafts the confirmation; who is this / call me / not interested / already have a roofer / how did you get my
   number get the library's suggested answer), Opt out, and Open in CRM. Nothing here sends.
   Scheduled texts (RC.scheduled) sit on top under "Scheduled" with a live countdown ([data-due], ticked by the page).
   Inbox.mount(host, { homeOf(id) -> home, draft(id, 'text'|'email') -> RC.copy result + {canSend, dayN},
     facts(id) -> RC.copy homeFacts, onOpen(id), onCount(homes), onSched(sid, act), onChange() }) -> { render, open } */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SV = p => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  const ICON = {
    call: SV('<path d="M5 4h3.2l1.6 4-2 1.3a11 11 0 0 0 6.9 6.9l1.3-2 4 1.6V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
    text: SV('<path d="M4 5h16v11H9l-5 4z"/>'),
    email: SV('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>'),
    booking: SV('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>'),
    note: SV('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>'),
    stage: SV('<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>'),
    sched: SV('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>'),
    reply: SV('<path d="M10 8 5 12l5 4"/><path d="M5 12h9a5 5 0 0 1 5 5v1"/>'),
    back: SV('<path d="M15 5l-7 7 7 7"/>'),
    search: SV('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>')
  };
  const LABEL = { call: 'Call', text: 'Text', email: 'Email', booking: 'Booking', note: 'Note', stage: 'Stage', reply: 'Reply' };
  const FILTERS = [['all', 'All'], ['due', 'Due today'], ['late', 'Overdue'], ['reply', 'Replied'], ['out', 'Opted out']];
  const EMPTY = {
    all: 'Nothing logged yet. Texts and emails you open from Today, replies you log, notes and bookings show here, newest first.',
    due: 'No follow-ups due today. A home comes due on day 3, 7 and 30 after its first contact, then every 30 days.',
    late: 'Nothing overdue.',
    reply: 'No replies waiting. When a homeowner answers, open the home and tap Log a reply.',
    out: 'No one has opted out.'
  };
  const OUTL = { no_answer: 'No answer', spoke: 'Spoke with the homeowner', booked: 'Inspection booked', wrong: 'Wrong number', note: 'Call note' };
  const FK = 'rc.inboxFilter';   // per device convenience, not an rc.t. key (no cross-frame churn)
  const TOUCH = a => a.ch === 'text' || a.ch === 'email';   // outreach is text and email only (old call records still show in a thread)
  const tm = iso => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const full = iso => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' + tm(iso);
  const dayFmt = key => new Date(key + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  // "just now", "12 min ago", "today, 11:02 am", "yesterday", "2 days ago"
  function rel(iso) {
    const t = Date.parse(iso), now = Date.now(), d0 = new Date(now); d0.setHours(0, 0, 0, 0);
    const m = Math.round((now - t) / 6e4);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    if (t >= +d0) return 'today, ' + tm(iso);
    const days = Math.round((+d0 - new Date(t).setHours(0, 0, 0, 0)) / 864e5);
    return days <= 1 ? 'yesterday' : days + ' days ago';
  }
  // the cadence in plain words: "Day 3 follow-up due Sat, Oct 10" | "... due today" | "..., 2 days overdue"
  function cadLine(c) {
    if (c.stopped) return { t: RC.cadenceStopText ? RC.cadenceStopText(c.stopped) : c.stopped === 'opted out' ? 'Opted out, no follow-ups' : c.stopped === 'won' ? 'Won, no follow-ups' : 'Not now, no follow-ups', k: 'c-stop' };
    if (!c.lastContact) return { t: 'Not contacted yet', k: '' };
    if (c.overdue) return { t: `Day ${c.step} follow-up, ${c.daysOverdue} day${c.daysOverdue === 1 ? '' : 's'} overdue`, k: 'c-late' };
    if (c.dueToday) return { t: `Day ${c.step} follow-up due today`, k: 'c-due' };
    return { t: `Day ${c.step} follow-up due ${dayFmt(c.nextDue)}`, k: '' };
  }
  // what the homeowner said -> the library's suggested answer (lib/rc-copy.js reply.*)
  const KINDS = [
    ['stop', /^\s*(stop|stopall|stop all|unsubscribe|cancel|end|quit|opt[\s-]?out|remove me)\b|\b(stop texting|stop messaging|don'?t text|do not text|do not contact|take me off|remove me from|unsubscribe)\b/i, 'STOP: opted out'],
    ['how_number', /how (did|do|'d) you (get|have|find)|where (did|do|'d) you get|got my (number|info|address)/i, 'Asked how you got the number'],
    ['who', /who('?s| is| are) (this|you)|who dis\b|who is it/i, 'Asked who this is'],
    ['call', /call me|give me a call|can you call|please call|call back|ring me/i, 'Wants a call'],
    ['have_roofer', /(already|got|have) (a |my own |our )?roofer|already (have|got|hired|using|went)|someone already|went with (another|someone)/i, 'Already has a roofer'],
    ['not_interested', /not interested|no thanks|no thank you|not right now|we'?re good|i'?m good|not at this time/i, 'Not interested'],
    // last, so "not interested" and "already have a roofer" win first: a yes, a time, a quote or an inspection ask
    ['interested', /^\s*(yes|yeah|yep|sure|ok(ay)?|please)\b|\b(interested|come (out|by|look)|take a look|look at (it|the roof)|when can|what time|available|quote|estimate|inspection|inspect|how much|schedule|set (it|that|a time) up)\b/i, 'Wants an inspection']
  ];
  const classify = t => { const k = KINDS.find(x => x[1].test(String(t || ''))); return k ? { kind: k[0], label: k[2] } : null; };
  const pretty = p => p && /^\+1\d{10}$/.test(p) ? `(${p.slice(2, 5)}) ${p.slice(5, 8)}-${p.slice(8)}` : (p || '');
  const smsHref = (to, body) => `sms:${to}?&body=${encodeURIComponent(body)}`;
  const mailHref = (subject, body) => `mailto:?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(body || '')}`;

  function mount(host, opts) {
    let filter = 'all', q = '', open = null, chan = 'text', replying = false, warmed = false, hold = false;
    const sugg = {};   // id -> { kind, label, body, said } the suggested answer after a logged reply (this view only)
    try { const f = localStorage.getItem(FK); if (FILTERS.some(x => x[0] === f)) filter = f; } catch (e) { }
    host.innerHTML = '<div class="iwrap"><label class="isearch"><span class="ic">' + ICON.search + '</span><input type="search" placeholder="Search address or owner" aria-label="Search the inbox by address or owner" autocomplete="off"></label>' +
      '<div class="ifil" role="group" aria-label="Show"></div><div class="ilist" role="list"></div></div><div class="ithread" hidden></div>';
    const wrap = host.querySelector('.iwrap'), fil = host.querySelector('.ifil'), list = host.querySelector('.ilist'), th = host.querySelector('.ithread'), sIn = host.querySelector('.isearch input');
    const homeOf = id => (opts.homeOf && opts.homeOf(id)) || RC.recall(id) || {};
    const addrOf = id => { const h = homeOf(id); return h.short || h.addr || 'Home on file'; };
    const ownerOf = id => { const h = homeOf(id); return h.owner || (h.gi != null && RC.ownerNow ? RC.ownerNow(h.gi) : null) || ''; };
    fil.onclick = e => { const b = e.target.closest('[data-f]'); if (!b) return; filter = b.dataset.f; try { localStorage.setItem(FK, filter); } catch (er) { } render(); };
    sIn.addEventListener('input', () => { q = sIn.value.trim().toLowerCase(); render(); });
    sIn.addEventListener('keydown', e => { if (e.key === 'Escape') { sIn.value = ''; q = ''; render(); } });
    list.addEventListener('click', e => {
      const a = e.target.closest('[data-s]'); if (a) { e.stopPropagation(); if (opts.onSched) opts.onSched(a.closest('[data-sid]').dataset.sid, a.dataset.s); return; }
      const r = e.target.closest('[data-id]'); if (r) openThread(r.dataset.id);
    });

    // ---------- threads ----------
    function threads() {
      const by = new Map();
      RC.activity().forEach(a => { let t = by.get(a.id); if (!t) by.set(a.id, t = { id: a.id, all: [] }); t.all.push(a); });
      return [...by.values()].map(t => {
        const touches = t.all.filter(TOUCH), c = RC.cadence(t.id);
        const last = touches[0] || t.all[0];
        return Object.assign(t, { touches, c, last, out: RC.optedOut(t.id), replied: !!(touches[0] && touches[0].dir === 'in') && !RC.optedOut(t.id),
          due: !c.stopped && !!c.lastContact && c.dueToday && !c.overdue, late: !c.stopped && !!c.lastContact && c.overdue });
      });
    }
    const pass = t => filter === 'all' || (filter === 'due' && t.due) || (filter === 'late' && t.late) || (filter === 'reply' && t.replied) || (filter === 'out' && t.out);
    const match = t => !q || addrOf(t.id).toLowerCase().includes(q) || String(homeOf(t.id).addr || '').toLowerCase().includes(q) || ownerOf(t.id).toLowerCase().includes(q);
    function lastWords(a) {
      if (!a) return '';
      if (a.dir === 'in') return 'Reply: “' + esc(a.body || '') + '”';
      if (a.ch === 'call') return esc(a.outcome ? 'Called: ' + OUTL[a.outcome].toLowerCase() : a.what) + (a.note ? ', “' + esc(a.note) + '”' : '');
      if (a.body) return (/^Text sent/.test(a.what || '') ? 'Sent: ' : 'Drafted: ') + '“' + esc(a.subject ? a.subject + ': ' : '') + esc(a.body) + '”';
      return esc(a.what);
    }
    function schedRows() {
      const ss = RC.scheduled().filter(s => !q || addrOf(s.id).toLowerCase().includes(q)); if (!ss.length) return '';
      const tmw = iso => new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).replace(/ (AM|PM)$/, (m, x) => ' ' + x.toLowerCase());
      return '<div class="ihead">Scheduled</div>' + ss.map(s => {
        const due = !(Date.parse(s.due) > Date.now());
        return `<div class="srow${due ? ' due' : ''}" role="listitem" data-sid="${esc(s.sid)}">` +
          `<span class="ich" data-ch="sched"><span class="ic">${ICON.sched}</span><b>Text</b></span>` +
          `<span class="ibody"><span class="itop"><b class="iad">${esc(addrOf(s.id))}</b><time datetime="${esc(s.due)}">${esc(tmw(s.due))}</time></span>` +
          `<span class="scd" data-due="${esc(s.due)}">${esc(RC.countdown(s.due))}</span>` +
          `<span class="snote2">Reminder, sends from your phone</span>` +
          `<span class="ilast">${esc(s.body)}</span>` +
          `<span class="sact"><button type="button" data-s="now" class="pri">Send now</button><button type="button" data-s="edit">Edit</button><button type="button" data-s="cancel">Cancel</button></span></span></div>`;
      }).join('') + '<div class="ihead">Homes in the CRM</div>';
    }
    function render() {
      if (hold) return;
      const ts = threads(), ss = RC.scheduled();
      if (opts.onCount) opts.onCount(new Set(ts.map(t => t.id).concat(ss.map(s => s.id))).size);
      const n = { all: ts.length, due: ts.filter(t => t.due).length, late: ts.filter(t => t.late).length, reply: ts.filter(t => t.replied).length, out: ts.filter(t => t.out).length };
      const fh = FILTERS.map(f => `<button type="button" data-f="${f[0]}" aria-pressed="${f[0] === filter}">${f[1]}${f[0] !== 'all' && n[f[0]] ? ' <i>' + n[f[0]] + '</i>' : ''}</button>`).join('');
      if (fil.__h !== fh) { fil.innerHTML = fh; fil.__h = fh; }
      const rows = ts.filter(t => pass(t) && match(t)).map(t => {
        const h = homeOf(t.id), owner = ownerOf(t.id), last = t.last, ch = last ? (last.dir === 'in' ? 'reply' : last.ch) : 'note';
        const cl = cadLine(t.c), stg = RC.stageName(RC.stage(t.id)), arch = (RC.pipeline()[t.id] || {}).archived;
        return `<button type="button" class="irow${t.replied ? ' rep' : ''}" role="listitem" data-id="${esc(t.id)}" aria-label="Open the thread for ${esc(addrOf(t.id))}">` +
          `<span class="ich" data-ch="${ch}"><span class="ic">${ICON[ch] || ICON.note}</span><b>${LABEL[ch] || 'Note'}</b></span>` +
          `<span class="ibody"><span class="itop"><b class="iad">${esc(addrOf(t.id))}</b><time datetime="${esc(last ? last.at : '')}">${last ? esc(rel(last.at)) : ''}</time></span>` +
          (owner ? `<span class="iwho">${esc(owner)}</span>` : '') +
          `<span class="imeta"><span class="icad ${cl.k}">${esc(cl.t)}</span><span class="istg">${esc(arch ? 'Not now' : stg)}</span></span>` +
          `<span class="ilast">${lastWords(last)}</span></span></button>`;
      }).join('');
      const sr = filter === 'all' ? schedRows() : '';
      const none = q ? `No home in the inbox matches "${esc(q)}".` : EMPTY[filter];
      const html = sr ? sr + (rows || `<p class="inone">Nothing sent yet.</p>`) : rows || `<p class="inone">${none}</p>`;
      if (list.__h !== html) { list.innerHTML = html; list.__h = html; }
      if (!warmed && ts.length && RC.ownersWarm) { warmed = true; RC.ownersWarm().then(ok => { if (ok) { list.__h = null; render(); } }); }
      if (open) paintThread();
    }

    // ---------- one home's thread ----------
    // the next touch's channel follows the cadence: day 1 is a text, every follow-up an email (RC.cadence().channel)
    function openThread(id) { open = id; chan = (RC.cadence && RC.cadence(id).channel) || 'text'; replying = false; wrap.hidden = true; th.hidden = false; paintThread(); th.scrollTop = 0; const b = th.querySelector('.iback'); b && b.focus({ preventScroll: true }); }
    function closeThread() { const id = open; open = null; th.hidden = true; th.innerHTML = ''; th.__h = null; wrap.hidden = false; render();
      const r = list.querySelector(`[data-id="${CSS.escape(id || '')}"]`); r && r.focus({ preventScroll: true }); }
    function histItem(a) {
      const ch = a.dir === 'in' ? 'reply' : a.ch;
      let head = a.dir === 'in' ? 'Reply from the homeowner' : a.what || LABEL[ch];
      if (a.ch === 'call' && a.outcome) head = 'Call: ' + OUTL[a.outcome].toLowerCase();
      const body = a.dir === 'in' || a.body ? `<p class="hbody${a.dir === 'in' ? ' in' : ''}">${a.subject ? '<b>' + esc(a.subject) + '</b><br>' : ''}${esc(a.body || '')}</p>` : a.note ? `<p class="hbody">${esc(a.note)}</p>` : '';
      return `<li class="hitem" data-ch="${ch}"><span class="ich" data-ch="${ch}"><span class="ic">${ICON[ch] || ICON.note}</span></span><div><div class="htop"><b>${esc(head)}</b><time datetime="${esc(a.at)}">${esc(full(a.at))}</time></div>${body}</div></li>`;
    }
    function nextHTML(id, c) {
      if ((c.stopped === 'replied' || c.stopped === 'in a deal') && sugg[id]) return '';   // the suggested answer above is the composer
      if (c.stopped === 'replied' || c.stopped === 'in a deal') {
        // the cold cadence is over: a plain answer box (the person writes it), still under hours, the 24 h cap and opt-out
        const h = homeOf(id), ct = RC.canText(id, h.phone || null), em = chan === 'email';
        const seg = `<div class="dseg" role="group" aria-label="Channel"><button type="button" data-ch="text" aria-pressed="${!em}">Text</button><button type="button" data-ch="email" aria-pressed="${em}">Email</button></div>`;
        const send = em ? `<a class="dbtn pri" data-t="send" data-mode="answer" href="${mailHref('', '')}">Open in Mail</a>` : ct.ok ? `<a class="dbtn pri" data-t="send" data-mode="answer" href="${smsHref(h.phone, '')}">Open in Messages</a>` : '';
        const why = !em && !ct.ok ? ct.reason + '.' : c.stopped === 'replied' ? 'Write your answer. Log a reply first to get a suggested one.' : 'The next step is on the home record in the CRM.';
        return `<section class="inext"><div class="ilab"><span>${esc(c.stopped === 'replied' ? 'They replied: answer them' : 'In a deal: no cold follow-ups')}</span>${seg}</div><textarea class="idraft" rows="3" aria-label="Your ${em ? 'email' : 'text'}" placeholder="Your ${em ? 'email' : 'text'} to the homeowner"></textarea>` +
          `<div class="iact"><p class="inote">${esc(why)}</p>${send}</div></section>`;
      }
      if (c.stopped === 'not a fit') return `<section class="inext nx-stop"><div class="ilab">No next touch</div><p class="inote">Skipped as not a fit. It stays off the Daily 50 until the skip is undone.</p></section>`;
      if (c.stopped) return `<section class="inext nx-stop"><div class="ilab">No next touch</div><p class="inote">${c.stopped === 'opted out' ? 'This homeowner opted out. No more texts, emails or follow-ups.' : c.stopped === 'won' ? 'Won. Follow-ups stop here.' : 'Moved to Not now. Follow-ups stop until the home is restored in the CRM.'}</p></section>`;
      const r = opts.draft(id, chan), h = homeOf(id);
      const when = !c.lastContact ? 'first touch' : c.overdue ? `${c.daysOverdue} day${c.daysOverdue === 1 ? '' : 's'} overdue` : c.dueToday ? 'due today' : 'due ' + dayFmt(c.nextDue);
      const seg = `<div class="dseg" role="group" aria-label="Channel"><button type="button" data-ch="text" aria-pressed="${chan === 'text'}">Text</button><button type="button" data-ch="email" aria-pressed="${chan === 'email'}">Email</button></div>`;
      let send = '', why = '';
      if (chan === 'text') {
        const ct = RC.canText(id, h.phone || null);   // texting hours, the 3 per 24 h cap, opt-out
        if (r.canSend && h.phone && ct.ok) send = `<a class="dbtn pri" data-t="send" href="${smsHref(h.phone, r.body)}">Open in Messages</a>`;
        why = r.blocked === 'opted out' ? 'Opted out.' : !h.phone ? 'Next: get the phone number.' : !r.canSend ? (r.blocked || 'Not ready to send.') : !ct.ok ? ct.reason + '.' : r.noCallback ? 'Goes from your phone, so replies come to you.' : '';
      } else {
        if (r.canSend) send = `<a class="dbtn pri" data-t="send" href="${mailHref(r.subject, r.body)}">Open in Mail</a>`;
        else send = `<button type="button" class="dbtn pri off" aria-disabled="true">Open in Mail</button>`;
        why = r.missing && r.missing.includes('mailingAddress') ? 'Add your mailing address to send emails.' : r.blocked || 'Your mail app opens with the draft. Type the address there.';
      }
      return `<section class="inext"><div class="ilab"><span>Next: Day ${r.dayN || c.step} ${chan}, ${esc(when)}</span>${seg}</div>` +
        (r.body ? (chan === 'email' && r.subject ? `<p class="isubj">${esc(r.subject)}</p>` : '') + `<textarea class="idraft" rows="${chan === 'email' ? 7 : 4}" aria-label="Next ${chan} draft" ${r.canSend ? '' : 'readonly'}>${esc(r.body)}</textarea>` : '') +
        `<div class="iact">${why ? `<p class="inote">${esc(why)}</p>` : '<span></span>'}${send}</div></section>`;
    }
    function suggHTML(id) {
      const s = sugg[id]; if (!s) return '';
      const h = homeOf(id), park = s.kind === 'not_interested' || s.kind === 'have_roofer';
      return `<section class="isugg"><div class="ilab"><span>${s.kind ? 'Suggested answer: ' + esc(s.label) : 'No suggested answer for that one'}</span></div>` +
        (s.kind === 'stop' ? `<p class="inote">Opted out. No more texts or follow-ups. One confirmation text is fine.</p>` : '') +
        (park ? `<p class="inote">Sending this also moves the home to Not now, so follow-ups stop.</p>` : '') +
        `<textarea class="isdraft" rows="3" aria-label="Answer">${esc(s.body || '')}</textarea>` +
        `<div class="iact"><button type="button" class="dbtn" data-t="dismiss">Dismiss</button>${!h.phone ? '<p class="inote">Get phone to text or call.</p>' : (ct => ct.ok || s.kind === 'stop' ? `<a class="dbtn pri" data-t="answer" href="${smsHref(h.phone, s.body || '')}">Open in Messages</a>` : `<p class="inote">${esc(ct.reason)}.</p>`)(RC.canText(id, h.phone))}</div></section>`;
    }
    function paintThread() {
      const id = open; if (!id) return;
      const h = homeOf(id), owner = ownerOf(id), c = RC.cadence(id), cl = cadLine(c), recs = RC.activity().filter(a => a.id === id);
      const arch = (RC.pipeline()[id] || {}).archived, out = RC.optedOut(id);
      const sub = [owner, h.city, h.phone ? pretty(h.phone) + ' (sample phone)' : ''].filter(Boolean).join(' · ');
      const html = `<div class="ith-h"><button type="button" class="iback" data-t="back" aria-label="Back to the inbox"><span class="ic">${ICON.back}</span></button><div class="ith-t"><b>${esc(h.addr || addrOf(id))}</b><small>${esc(sub)}</small></div></div>` +
        `<div class="ith-m"><span class="pill acc">${esc(arch ? 'Not now' : RC.stageName(RC.stage(id)))}</span><span class="icad ${cl.k}">${esc(cl.t)}</span></div>` +
        `<div class="ith-a"><button type="button" class="dbtn" data-t="home">Open in CRM</button><button type="button" class="dbtn" data-t="reply"${out ? ' disabled' : ''}>Log a reply</button><button type="button" class="dbtn${out ? '' : ' warn'}" data-t="optout">${out ? 'Opt back in' : 'Opt out'}</button></div>` +
        (replying ? `<section class="ireply"><label class="ilab" for="iRep">What did the homeowner say?</label><textarea id="iRep" rows="3" placeholder="Paste their text or email, or note what they said on the phone"></textarea><div class="iact"><button type="button" class="dbtn" data-t="rcancel">Cancel</button><button type="button" class="dbtn pri" data-t="rsave">Save reply</button></div></section>` : '') +
        suggHTML(id) + nextHTML(id, c) +
        `<section class="ihist"><div class="ilab">History</div>${recs.length ? '<ol>' + recs.map(histItem).join('') + '</ol>' : '<p class="inote">Nothing on record yet.</p>'}</section>`;
      // keep what the rep is typing: repaint only when the record changed
      if (th.__h === html) return;
      const keep = th.querySelector('#iRep') ? th.querySelector('#iRep').value : null;
      th.innerHTML = html; th.__h = html;
      if (keep != null && th.querySelector('#iRep')) th.querySelector('#iRep').value = keep;
    }
    function logAnswer(id, s, body) {
      RC.logText(id, s.kind === 'stop' ? 'Opt-out confirmation drafted in Messages' : 'Answer drafted in Messages', { body, to: homeOf(id).phone });
      if (s.kind === 'not_interested' || s.kind === 'have_roofer') {
        if (!(RC.pipeline()[id] || {}).archived) RC.setStage(id, RC.stage(id), 'Moved to Not now', { archived: new Date().toISOString() });
      }
    }
    th.addEventListener('click', e => {
      const b = e.target.closest('[data-t],[data-ch]'); if (!b) return; const id = open; if (!id) return;
      if (b.dataset.ch) { chan = b.dataset.ch; th.__h = null; paintThread(); return; }
      const t = b.dataset.t;
      if (t === 'back') return closeThread();
      if (t === 'home') return opts.onOpen(id);
      if (t === 'reply') { replying = true; th.__h = null; paintThread(); const r = th.querySelector('#iRep'); r && r.focus(); return; }
      if (t === 'rcancel') { replying = false; th.__h = null; paintThread(); return; }
      if (t === 'rsave') {
        const said = (th.querySelector('#iRep').value || '').trim(); if (!said) { th.querySelector('#iRep').focus(); return; }
        replying = false; const k = classify(said);
        let body = '';
        if (k) { try { body = RC.copy.render('reply.' + k.kind, opts.facts(id)).body; } catch (er) { body = ''; } }
        sugg[id] = { kind: k ? k.kind : null, label: k ? k.label : '', body, said };
        RC.logReply(id, said, 'text');
        if (k && k.kind === 'stop') RC.optOut(id, 'STOP');
        th.__h = null; render(); if (opts.onChange) opts.onChange(); return;
      }
      if (t === 'dismiss') { delete sugg[id]; th.__h = null; paintThread(); return; }
      // hand-offs: the link must still be in the page when the click finishes (a removed link never navigates), so the
      // record is written now with repaints held, and the thread repainted just after
      const after = f => { hold = true; try { f(); } finally { hold = false; } setTimeout(() => { th.__h = null; render(); if (opts.onChange) opts.onChange(); }, 30); };
      if (t === 'answer') { const s = sugg[id], body = (th.querySelector('.isdraft').value || '').trim() || s.body; b.href = smsHref(homeOf(id).phone, body);
        after(() => { delete sugg[id]; logAnswer(id, s, body); }); return; }
      if (t === 'send' && b.dataset.mode === 'answer') {   // only what the person typed goes
        const ta = th.querySelector('.idraft'), body = ta ? ta.value.trim() : '', to = homeOf(id).phone;
        if (!body) { e.preventDefault(); if (ta) ta.focus(); return; }
        if (chan === 'email') { b.href = mailHref('', body); after(() => RC.logEmail(id, 'Email answer drafted', { body })); }
        else { b.href = smsHref(to, body); after(() => RC.logText(id, 'Answer drafted in Messages', { body, to })); }
        return;
      }
      if (t === 'send') {
        const ta = th.querySelector('.idraft'), r = opts.draft(id, chan), body = (ta && ta.value.trim()) || r.body, to = homeOf(id).phone;
        if (chan === 'text') { b.href = smsHref(to, body); after(() => RC.logText(id, 'Text drafted in Messages', { body, to })); }
        else { b.href = mailHref(r.subject, body); after(() => RC.logEmail(id, 'Email drafted', { subject: r.subject, body })); }
        return;
      }
      if (t === 'optout') { if (RC.optedOut(id)) RC.optOut(id, 'manual', false); else RC.optOut(id, 'marked by you'); th.__h = null; render(); if (opts.onChange) opts.onChange(); return; }
    });
    th.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.target.closest('textarea')) { e.stopPropagation(); closeThread(); } });
    RC.on(d => { if (d.key === 'pipe' || d.key === 'att' || d.key === 'sched' || d.key === 'optout') render(); });
    render();
    return { render, open: openThread, close: closeThread, count: () => threads().length, isOpen: () => open };
  }
  window.Inbox = { mount, classify };
})();
