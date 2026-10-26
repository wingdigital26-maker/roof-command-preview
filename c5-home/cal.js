/* cal.js: the built-in calendar (Jack 10-17: a calendar inside the app, so a roofer never needs another calendar app).
   Plain script, runs after crm.js. One more CRM view ('calendar', #/crm/calendar) next to Inbox, Pipeline and Home.
   WHERE APPOINTMENTS LIVE: there is ONE store, the pipeline record's `booked` field (lib/rc-state.js RC.booking(id),
   written by RC.setStage(id, 'inspection', ..., { booked: iso }) from the record's Book button, the board and here).
   This file never invents a second store: every event on the calendar is RC.pipeline()[id].booked, and booking from
   the calendar writes the very same history line the record's Book button writes, so the home moves to Inspection
   booked everywhere at once. Cancel clears `booked` and moves the home back to Contacted (undo on the toast).
   WORKING HOURS: the same shape the public booking page's engine uses (supabase/functions/roof-engine engine.ts
   DEFAULT_CONFIG: hours {"1":[9,17] .. "6":[9,17]} with 0 = Sunday, slot_minutes 60). The cloud config is not readable
   from the browser without a sign-in, so this reads, in order: the roofer's lib/brand.js entry (`booking: {hours,
   slot_minutes}`), a device override RC.__get('calcfg'), else the engine default. Slots outside the hours, in the
   past, or overlapping another booking cannot be picked (the same rule as tour/book/index.html).
   Nothing here sends: no text, no email, no confirmation. Add to my phone calendar = the record's .ics file (rec.js). */
(function () {
  'use strict';
  const RC = window.RC, esc = RC.esc, $ = (s, r) => (r || document).querySelector(s);
  const root = $('#cal'); if (!root) return;
  const B = window.activeRoofer ? activeRoofer() : {}, REP = B.owner || 'the owner';
  const phoneMQ = matchMedia('(max-width:640px)'), isPhone = () => phoneMQ.matches;
  const say = (m, u) => (window.homeSay || (() => { }))(m, u);
  const DAY = 864e5, pad = x => String(x).padStart(2, '0'), VK = 'rc.cal.view';
  const SV = p => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  const I = { prev: SV('<path d="M15 5l-7 7 7 7"/>'), next: SV('<path d="M9 5l7 7-7 7"/>'), cal: SV('<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/>'),
    more: SV('<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>'), hail: SV('<circle cx="8" cy="15" r="3"/><circle cx="16.5" cy="9" r="4"/><circle cx="16" cy="18.5" r="1.6"/>') };

  // ---------- working hours and slot length (see the header) ----------
  const DEFAULT = { hours: { 1: [9, 17], 2: [9, 17], 3: [9, 17], 4: [9, 17], 5: [9, 17], 6: [9, 17] }, slot_minutes: 60 };
  function config() {
    const dev = RC.__get ? RC.__get('calcfg', null) : null, c = Object.assign({}, DEFAULT, B.booking || {}, dev || {});
    if (!c.hours || typeof c.hours !== 'object') c.hours = DEFAULT.hours;
    c.slot_minutes = +c.slot_minutes > 0 ? Math.min(240, +c.slot_minutes) : 60;
    return c;
  }
  const win = (cfg, d) => { const w = cfg.hours[String(d.getDay())]; return Array.isArray(w) && w.length === 2 && w[1] > w[0] ? w : null; };
  // the hour rows the grids draw: the earliest opening to the latest closing across the week, one hour of room each side
  function range(cfg) {
    let lo = 24, hi = 0; Object.keys(cfg.hours).forEach(k => { const w = cfg.hours[k]; if (Array.isArray(w) && w[1] > w[0]) { lo = Math.min(lo, w[0]); hi = Math.max(hi, w[1]); } });
    if (lo >= hi) { lo = 9; hi = 17; }
    return [Math.max(0, Math.floor(lo) - 1), Math.min(24, Math.ceil(hi) + 1)];
  }
  const inHours = (cfg, t) => { const d = new Date(t), w = win(cfg, d); if (!w) return false; const m = d.getHours() * 60 + d.getMinutes(); return m >= w[0] * 60 && m + cfg.slot_minutes <= w[1] * 60; };
  const hoursLine = cfg => {
    const t = h => h === 12 ? 'noon' : (h % 12 || 12) + (h < 12 ? ' am' : ' pm'), N = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = [1, 2, 3, 4, 5, 6, 0].filter(d => cfg.hours[String(d)] && cfg.hours[String(d)][1] > cfg.hours[String(d)][0]); if (!days.length) return 'No working hours set.';
    const w0 = cfg.hours[String(days[0])], same = days.every(d => cfg.hours[String(d)][0] === w0[0] && cfg.hours[String(d)][1] === w0[1]);
    const run = days.length > 2 && days.every((d, i) => i === 0 || d === (days[i - 1] + 1) % 7) ? N[days[0]] + ' to ' + N[days[days.length - 1]] : days.map(d => N[d]).join(', ');
    return 'Working hours ' + run + (same ? ', ' + t(w0[0]) + ' to ' + t(w0[1]) : '') + '. ' + (cfg.slot_minutes === 60 ? 'One hour per inspection.' : cfg.slot_minutes + ' minutes per inspection.');
  };

  // ---------- the bookings (RC.pipeline()[id].booked) and what the device knows about each home ----------
  const BIZ = /\b(llc|inc|trust|trustee|estate|lp|ltd|corp|company|bank|partners|holdings|properties|investments|association|church|city of|county|homes|realty|fund|revocable|living)\b/i;
  const firstOf = n => { if (!n || BIZ.test(n)) return ''; const w = String(n).trim().split(/\s+/)[0] || ''; return /^[A-Za-z'-]{2,}$/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''; };
  const okNum = v => v != null && v !== '' && v !== 'null' && isFinite(+v);
  function homeOf(id) {
    const p = RC.todayPick ? RC.todayPick(id) : null, r = RC.recall(id) || {}, a = (RC.added ? RC.added() : []).find(x => x.id === id) || {}, mm = /^m(\d+)$/.exec(id);
    const H = window.HOME, mine = H && H.rawId === id && H.rec ? H.rec : null;
    const addr = (p && (p.street || String(p.address || '').split(',')[0])) || (mine && mine.addr) || r.addr || a.addr || '';
    const gi = p && p.gi != null ? p.gi : r.gi != null ? r.gi : mm ? +mm[1] : null;
    const hail = p ? (okNum(p.hail) ? +p.hail : null) : okNum(r.hail) ? +r.hail : okNum(a.hail) ? +a.hail : null;
    const owner = (mine && mine.owner) || (gi != null && RC.ownerNow ? RC.ownerNow(gi) : null) || '';
    return { id, addr: addr && !/^(Stop|Home from|Today's list)/.test(addr) ? addr : '', city: (p && p.city) || r.city || a.city || '', zip: (p && p.zip) || r.zip || a.zip || '', hail, gi, first: firstOf(owner), stop: p ? p.stop : null };
  }
  function bookings() {
    const cfg = config(), pipe = RC.pipeline(), out = [];
    Object.keys(pipe).forEach(id => { const p = pipe[id]; if (!p || !p.booked) return; const t = Date.parse(p.booked); if (!isFinite(t)) return;
      out.push({ id, t, end: t + cfg.slot_minutes * 6e4, stage: p.stage, done: p.stage !== 'inspection' }); });
    return out.sort((a, b) => a.t - b.t);
  }
  // a slot overlaps another home's booking (the public page's rule; the home being moved does not block itself)
  function taken(iso, skipId) { const cfg = config(), t = Date.parse(iso), e = t + cfg.slot_minutes * 6e4; return bookings().some(b => b.id !== skipId && b.t < e && b.end > t); }
  window.calTaken = taken;   // rec.js: the record's Book dialog refuses a time another home already holds
  // the homes a roofer can book: today's 50, homes added by hand, every home with a record (the same list the board shows)
  function homeIds() {
    const ids = [], put = id => { if (id && id !== 'c5-sample' && ids.indexOf(id) < 0) ids.push(id); };
    (RC.daily ? RC.daily() : []).forEach(p => put(p.id)); (RC.added ? RC.added() : []).forEach(a => put(a.id)); Object.keys(RC.pipeline()).forEach(put);
    const H = window.HOME; if (H && H.rawId) put(H.rawId);
    return ids;
  }

  // ---------- state ----------
  let view = isPhone() ? 'day' : 'week', anchor = new Date(), warmed = false;
  try { const v = JSON.parse(localStorage.getItem(VK) || 'null'); if (v && /^(day|week|month)$/.test(v.view)) view = v.view; } catch (e) { }
  anchor.setHours(0, 0, 0, 0);
  // opened after today's working hours (or on a day off): start on the next working day, not a column of Past (10-19)
  try { const cfg = config(), now = new Date(), w = win(cfg, now);
    if (!w || now.getHours() * 60 + now.getMinutes() + cfg.slot_minutes > w[1] * 60)
      for (let i = 1; i <= 7; i++) { const n = new Date(now); n.setDate(now.getDate() + i); if (win(cfg, n)) { anchor = n; anchor.setHours(0, 0, 0, 0); break; } } } catch (e) { }
  const keep = () => { try { localStorage.setItem(VK, JSON.stringify({ view })); } catch (e) { } };
  const active = () => window.crmView && window.crmView() === 'calendar';
  const d0 = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const monday = d => { const x = d0(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const at = (d, h, m) => { const x = new Date(d); x.setHours(h, m || 0, 0, 0); return x; };
  const tm = t => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(':00', '');
  const hour = h => { const d = new Date(2000, 0, 1, h); return d.toLocaleTimeString('en-US', { hour: 'numeric' }).toLowerCase(); };
  const md = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const title = () => {
    if (view === 'day') return anchor.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
    if (view === 'month') return anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const a = monday(anchor), b = new Date(a); b.setDate(a.getDate() + 6);
    return (a.getMonth() === b.getMonth() ? a.toLocaleDateString('en-US', { month: 'short' }) + ' ' + a.getDate() + ' to ' + b.getDate() : md(a) + ' to ' + md(b)) + ', ' + b.getFullYear();
  };
  const spanOf = () => {
    if (view === 'day') return [d0(anchor), new Date(+d0(anchor) + DAY)];
    if (view === 'month') { const a = new Date(anchor.getFullYear(), anchor.getMonth(), 1); return [a, new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1)]; }
    const a = monday(anchor); return [a, new Date(+a + 7 * DAY)];
  };
  const shift = n => { const d = new Date(anchor); if (view === 'month') d.setMonth(d.getMonth() + n); else d.setDate(d.getDate() + n * (view === 'week' ? 7 : 1)); anchor = d0(d); render(); };

  // ---------- one event block (the same words everywhere: time, address, first name when known, hail) ----------
  function evHTML(b, cls, style) {
    const h = homeOf(b.id), bits = [h.first, h.hail != null ? h.hail.toFixed(2) + ' in hail' : ''].filter(Boolean).join(' · ');
    return `<div class="calev${b.done ? ' done' : ''}${cls ? ' ' + cls : ''}" data-id="${esc(b.id)}" draggable="${b.done || b.t < Date.now() ? 'false' : 'true'}"${style ? ` style="${style}"` : ''} role="button" tabindex="0" aria-label="Open ${esc(h.addr || 'this home')}, inspection ${esc(RC.when(b.t))}">` +
      `<b>${esc(tm(b.t))}</b><span class="cadr">${esc(h.addr || 'Home on file')}</span>${bits ? `<small>${esc(bits)}</small>` : ''}` +
      `<button type="button" class="calmore" data-menu="${esc(b.id)}" aria-label="Options for ${esc(h.addr || 'this home')}">${I.more}</button></div>`;
  }
  const cellCls = (cfg, t, now) => 'calc' + (inHours(cfg, t) ? ' wk' : '') + (t < now ? ' past' : '') + (taken(new Date(t).toISOString()) ? ' full' : '');
  const openable = (cfg, t, now) => inHours(cfg, t) && t >= now && !taken(new Date(t).toISOString());
  const cellAttr = (cfg, t, now) => `data-t="${new Date(t).toISOString()}"` + (openable(cfg, t, now) ? ` data-open="1" tabindex="0" role="button" aria-label="Book ${esc(RC.when(t))}"` : '');

  // ---------- week: Mon to Sun columns, working hours white, the rest shaded, today marked ----------
  function weekHTML(cfg, evs, now) {
    const a = monday(anchor), [h0, h1] = range(cfg), days = []; for (let i = 0; i < 7; i++) { const d = new Date(a); d.setDate(a.getDate() + i); days.push(d); }
    const tod = new Date();
    let html = `<div class="calw" style="--rows:${h1 - h0}"><div class="calhd"><span class="caltc"></span>${days.map(d => `<span class="caldh${sameDay(d, tod) ? ' today' : ''}"><small>${d.toLocaleDateString('en-US', { weekday: 'short' })}</small><b>${d.getDate()}</b></span>`).join('')}</div><div class="calgrid">`;
    for (let h = h0; h < h1; h++) {
      html += `<span class="caltc">${esc(hour(h))}</span>`;
      days.forEach(d => { const t = +at(d, h), inside = evs.filter(b => b.t >= t && b.t < t + 36e5);
        html += `<div class="${cellCls(cfg, t, now)}${sameDay(d, tod) ? ' tod' : ''}" ${cellAttr(cfg, t, now)}>${inside.map(b => evHTML(b, '', `top:${(b.t - t) / 36e5 * 100}%;height:${Math.max(40, cfg.slot_minutes / 60 * 100)}%`)).join('')}</div>`; });
    }
    return html + '</div></div>';
  }
  // ---------- day: one list of slots (phone and desktop), an Open button on every free working slot ----------
  function dayHTML(cfg, evs, now) {
    const [h0, h1] = range(cfg), step = cfg.slot_minutes, rows = [];
    for (let m = h0 * 60; m < h1 * 60; m += step) {
      const t = +at(anchor, Math.floor(m / 60), m % 60), e = t + step * 6e4, inside = evs.filter(b => b.t >= t && b.t < e);
      const open = openable(cfg, t, now), wk = inHours(cfg, t);
      rows.push(`<div class="cald-r${wk ? ' wk' : ''}${t < now ? ' past' : ''}"><span class="caltc">${esc(tm(t))}</span><div class="cald-c">${inside.map(b => evHTML(b)).join('')}` +
        (inside.length ? '' : open ? `<button type="button" class="calopen" data-t="${new Date(t).toISOString()}">Open, book it</button>` : `<span class="calno">${!wk ? 'Outside working hours' : t < now ? 'Past' : 'Taken'}</span>`) + '</div></div>');
    }
    return `<div class="cald">${rows.join('')}</div>`;
  }
  // ---------- month: a day cell per date, the first three inspections as chips, click a day to open it ----------
  function monthHTML(cfg, evs) {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1), start = monday(first), tod = new Date(), cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i); if (i >= 35 && d.getMonth() !== anchor.getMonth()) break;
      const inside = evs.filter(b => sameDay(new Date(b.t), d)), off = d.getMonth() !== anchor.getMonth();
      cells.push(`<div class="calm-c${off ? ' off' : ''}${sameDay(d, tod) ? ' today' : ''}${win(cfg, d) ? '' : ' closed'}" data-day="${d.toISOString()}" role="button" tabindex="0" aria-label="${esc(d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))}, ${inside.length} booked"><b>${d.getDate()}</b>` +
        inside.slice(0, 3).map(b => { const h = homeOf(b.id); return `<span class="calchip${b.done ? ' done' : ''}" data-id="${esc(b.id)}">${esc(tm(b.t))} ${esc(h.addr || 'Home')}</span>`; }).join('') + (inside.length > 3 ? `<small>+${inside.length - 3} more</small>` : '') + '</div>');
    }
    return `<div class="calm"><div class="calm-h">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => `<span>${x}</span>`).join('')}</div><div class="calm-g">${cells.join('')}</div></div>`;
  }

  function render() {
    if (!active()) return;
    const cfg = config(), now = Date.now(), span = spanOf(), s0 = span[0], s1 = span[1], evs = bookings().filter(b => b.t >= +s0 && b.t < +s1);
    const unit = view === 'day' ? 'on this day' : view === 'week' ? 'this week' : 'this month', n = evs.length;
    const line = n ? `${n} inspection${n === 1 ? '' : 's'} ${unit}.` : `No inspections booked ${unit}.`;
    root.innerHTML = `<div class="calh"><div class="calnav"><button type="button" data-c="today">Today</button><button type="button" data-c="prev" aria-label="Earlier">${I.prev}</button><button type="button" data-c="next" aria-label="Later">${I.next}</button><h2>${esc(title())}</h2></div>` +
      `<div class="calseg" role="group" aria-label="View">${['day', 'week', 'month'].map(v => `<button type="button" data-v="${v}" aria-pressed="${v === view}">${v.charAt(0).toUpperCase() + v.slice(1)}</button>`).join('')}</div>` +
      `<button type="button" class="calbook" data-c="book"><span class="ic">${I.cal}</span>Book inspection</button></div>` +
      `<p class="calnote"><b>${esc(line)}</b> ${esc(hoursLine(cfg))} ${(() => { const c = matchMedia('(pointer:coarse)').matches ? 'Tap' : 'Click';   // phone wording (visual check 10-23)
        return view === 'month' ? c + ' a day to open it.' : c + ' an open hour to book, drag an inspection to move it.'; })()}${view === 'day' ? dirLink(evs) : ''}</p>` +
      (view === 'week' ? weekHTML(cfg, evs, now) : view === 'day' ? dayHTML(cfg, evs, now) : monthHTML(cfg, evs));
    if (!warmed && RC.ownersWarm) { warmed = true; RC.ownersWarm().then(ok => { if (ok) render(); }); }
  }
  window.renderCal = render;
  // the day's inspections in time order as one Maps route (10-19): from where the roofer is now, every stop in booked
  // order (Maps takes up to 9 stops in between). Opens Maps; nothing is sent.
  function dirLink(evs) {
    const st = evs.filter(b => !b.done).map(b => { const h = homeOf(b.id), m = !h.addr && h.gi != null && window.STM ? STM.metaNow(h.gi) : null;   // the county copy when this device kept no address
      return m && m.addr ? { addr: m.addr, city: m.city, zip: m.zip } : h; }).filter(h => h.addr).map(h => h.addr + (h.city ? ', ' + h.city : '') + ', TX' + (h.zip ? ' ' + h.zip : ''));
    if (!st.length) return '';
    const dest = st[st.length - 1], way = st.slice(0, -1).slice(0, 9);
    const u = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + encodeURIComponent(dest) + (way.length ? '&waypoints=' + encodeURIComponent(way.join('|')) : '');
    return ` <a class="caldir" href="${u}" target="_blank" rel="noopener">Directions for the day, ${st.length} stop${st.length === 1 ? '' : 's'} in time order</a>`;
  }

  // ---------- book or move: one dialog (the record's, rec.js homeDialog); the time list holds only free working slots ----------
  function slotsFor(dayStr, cfg, skipId) {
    const d = new Date(dayStr + 'T00:00:00'); if (isNaN(d)) return []; const w = win(cfg, d), out = []; if (!w) return out;
    for (let m = w[0] * 60; m + cfg.slot_minutes <= w[1] * 60; m += cfg.slot_minutes) { const t = at(d, Math.floor(m / 60), m % 60); if (+t >= Date.now() && !taken(t.toISOString(), skipId)) out.push(t); }
    return out;
  }
  function bookDlg(iso, fixedId) {
    if (!window.homeDialog) return;
    const cfg = config(), cur = fixedId ? RC.booking(fixedId) : null, now = new Date(), dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, today = dstr(now);
    let base = iso ? new Date(iso) : cur ? new Date(cur) : null;
    // no time picked yet: the next day with an open working slot (never a Sunday or a full day), up to two weeks out
    if (!base) { base = new Date(Date.now() + DAY); for (let i = 1; i <= 14; i++) { const d = new Date(Date.now() + i * DAY); if (slotsFor(dstr(d), cfg, fixedId).length) { base = d; break; } } }
    let dayStr = dstr(base); if (dayStr < today) dayStr = today;
    let pick = fixedId || null, want = iso || cur || null;
    const fh = fixedId ? homeOf(fixedId) : null;
    const timeOpts = () => { const l = slotsFor(dayStr, cfg, fixedId); return l.length ? l.map(t => `<option value="${t.toISOString()}"${want && Math.abs(Date.parse(want) - +t) < 6e4 ? ' selected' : ''}>${esc(tm(t))}</option>`).join('') : '<option value="">No open times that day</option>'; };
    window.homeDialog(fixedId ? (cur ? 'Move the inspection' : 'Book an inspection') : 'Book an inspection',
      `<p class="dl">${fixedId ? esc(fh.addr || 'This home') + (cur ? ', booked for ' + esc(RC.when(cur)) + '.' : '.') : 'Pick the home, then a day and an open time.'} ${esc(hoursLine(cfg))}</p>` +
      (fixedId ? '' : `<label class="fl">Home<input type="search" id="calQ" placeholder="Search by address" autocomplete="off" aria-label="Search the homes on file by address"></label><div class="callist" id="calRes" role="listbox" aria-label="Homes"></div>`) +
      `<div class="pick"><label class="fl">Day<input type="date" id="calD" value="${dayStr}" min="${today}"></label><label class="fl">Time<select id="calT">${timeOpts()}</select></label></div>` +
      `<div class="drow"><button type="button" class="pbtn" id="calGo"${pick ? '' : ' disabled'}><span class="ic">${I.cal}</span>${cur ? 'Move it' : 'Book it'}</button><button type="button" id="calNo">Cancel</button></div>`, body => {
        const q = body.querySelector('#calQ'), res = body.querySelector('#calRes'), dIn = body.querySelector('#calD'), tIn = body.querySelector('#calT'), go = body.querySelector('#calGo');
        body.querySelector('#calNo').onclick = () => window.homeDialogEl.close();
        const list = () => {
          const s = (q.value || '').trim().toLowerCase(), rows = homeIds().map(homeOf).filter(h => h.addr && (!s || (h.addr + ' ' + h.city + ' ' + h.zip + ' ' + h.first).toLowerCase().includes(s))).slice(0, 8);
          res.innerHTML = rows.length ? rows.map(h => { const b = RC.booking(h.id), st = RC.stage(h.id); return `<button type="button" role="option" data-id="${esc(h.id)}" aria-selected="${h.id === pick}"><b>${esc(h.addr)}</b><small>${esc([h.city, RC.stageName(st) + (b ? ', ' + RC.when(b) : ''), h.hail != null ? h.hail.toFixed(2) + ' in' : ''].filter(Boolean).join(' · '))}</small></button>`; }).join('')
            : `<p class="calnone">${s ? 'No home on file matches that.' : 'No homes on file yet. Open Today or the storm map first.'}</p>`;
        };
        if (q) { list(); q.oninput = list; q.focus(); res.onclick = e => { const b = e.target.closest('[data-id]'); if (!b) return; pick = b.dataset.id; go.disabled = false; res.querySelectorAll('[data-id]').forEach(x => x.setAttribute('aria-selected', x.dataset.id === pick)); tIn.innerHTML = timeOpts(); }; }
        dIn.onchange = () => { dayStr = dIn.value; want = null; tIn.innerHTML = timeOpts(); };
        go.onclick = () => {
          const t = tIn.value; if (!pick) { if (q) q.focus(); return; }
          if (!t) { tIn.setCustomValidity('No open time on that day. Pick another day.'); tIn.reportValidity(); tIn.addEventListener('change', () => tIn.setCustomValidity(''), { once: true }); return; }
          if (Date.parse(t) < Date.now() || !inHours(cfg, t) || taken(t, pick)) { tIn.setCustomValidity('That time is not open any more. Pick another.'); tIn.reportValidity(); tIn.innerHTML = timeOpts(); return; }
          window.homeDialogEl.close(); book(pick, t);
        };
      });
  }
  // the same history line the record's Book button writes (rec.js book): stage Inspection booked, booked = the time
  function book(id, iso) {
    const h = homeOf(id), prev = RC.stage(id), prevB = RC.booking(id), prevA = (RC.pipeline()[id] || {}).archived || null, moved = !!prevB;
    RC.setStage(id, 'inspection', (moved ? 'Inspection moved to ' : 'Inspection booked for ') + RC.when(iso) + ', with ' + REP, { booked: new Date(iso).toISOString(), archived: null });
    say((h.addr || 'Home') + ': inspection ' + (moved ? 'moved to ' : 'booked for ') + RC.when(iso) + '.', () => RC.setStage(id, prev, moved ? 'Move undone' : 'Booking undone', { booked: prevB || null, archived: prevA }));
  }
  function cancel(id) {
    const h = homeOf(id), prevB = RC.booking(id); if (!prevB) return;
    const prevA = (RC.pipeline()[id] || {}).archived || null;
    RC.setStage(id, 'called', 'Inspection cancelled (was ' + RC.when(prevB) + ')', { booked: null });
    say((h.addr || 'Home') + ': inspection cancelled. The home is back in ' + RC.stageName('called') + '.', () => RC.setStage(id, 'inspection', 'Booking restored for ' + RC.when(prevB), { booked: prevB, archived: prevA }));
  }
  function menuDlg(id) {
    const h = homeOf(id), b = RC.booking(id); if (!b || !window.homeDialog) return;
    window.homeDialog(h.addr || 'Home', `<p class="dl">Inspection ${esc(RC.when(b))}${h.first ? ', ' + esc(h.first) : ''}${h.hail != null ? ', ' + h.hail.toFixed(2) + ' in hail' : ''}. Nothing here sends a text or an email.</p><div class="menu">` +
      `<button type="button" data-m="open">Open the home record</button><button type="button" data-m="move">Move to another time</button>` +
      `<button type="button" data-m="ics"><span class="ic">${I.cal}</span>Add to my phone calendar (.ics)</button><button type="button" data-m="cancel" class="warn">Cancel the inspection</button></div>`, body => {
        body.onclick = e => { const m = e.target.closest('[data-m]'); if (!m) return; window.homeDialogEl.close(); const k = m.dataset.m;
          if (k === 'open') openHome(id); else if (k === 'move') bookDlg(null, id); else if (k === 'cancel') cancel(id);
          else if (k === 'ics') { if (window.homeIcs && window.homeIcs(id)) say('Calendar file saved. Open it to add the inspection to your phone calendar.'); } };
      });
  }
  const openHome = id => { if (window.crmOpenHome) window.crmOpenHome(id); };

  // ---------- clicks, keys, drag ----------
  root.addEventListener('click', e => {
    const c = e.target.closest('[data-c]'); if (c) { const k = c.dataset.c; if (k === 'today') { anchor = d0(new Date()); render(); } else if (k === 'prev') shift(-1); else if (k === 'next') shift(1); else if (k === 'book') bookDlg(null, null); return; }
    const v = e.target.closest('[data-v]'); if (v) { view = v.dataset.v; keep(); render(); return; }
    const mn = e.target.closest('[data-menu]'); if (mn) { menuDlg(mn.dataset.menu); return; }
    const ev = e.target.closest('.calev,.calchip'); if (ev) { openHome(ev.dataset.id); return; }
    const op = e.target.closest('.calopen'); if (op) { bookDlg(op.dataset.t, null); return; }
    const cell = e.target.closest('[data-open]'); if (cell) { bookDlg(cell.dataset.t, null); return; }
    const day = e.target.closest('[data-day]'); if (day) { anchor = d0(new Date(day.dataset.day)); view = 'day'; keep(); render(); }
  });
  root.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const t = e.target.closest('[role="button"]'); if (!t || t.tagName === 'BUTTON') return; e.preventDefault(); t.click(); });
  let drag = null;
  root.addEventListener('dragstart', e => { const ev = e.target.closest('.calev'); if (!ev || ev.getAttribute('draggable') !== 'true') { e.preventDefault(); return; } drag = ev.dataset.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', drag); } catch (er) { } ev.classList.add('lift'); });
  root.addEventListener('dragend', () => { drag = null; root.querySelectorAll('.lift,.over').forEach(x => x.classList.remove('lift', 'over')); });
  root.addEventListener('dragover', e => { if (!drag) return; const cell = e.target.closest('.calc[data-t]'); if (!cell) return; const t = cell.dataset.t;
    if (inHours(config(), t) && Date.parse(t) >= Date.now() && !taken(t, drag)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; root.querySelectorAll('.over').forEach(x => x.classList.remove('over')); cell.classList.add('over'); } });
  root.addEventListener('drop', e => { if (!drag) return; const cell = e.target.closest('.calc[data-t]'); if (!cell) return; e.preventDefault(); const t = cell.dataset.t, id = drag; drag = null;
    if (inHours(config(), t) && Date.parse(t) >= Date.now() && !taken(t, id)) book(id, t); else say('That time is not open.'); });

  if (active()) render();   // the page opened on #/crm/calendar: crm.js set the view before this file ran
  RC.on(d => { if (d.key === 'pipe' || d.key === 'homes' || d.key === 'added' || d.key === 'calcfg') render(); });
  phoneMQ.addEventListener('change', () => { if (isPhone() && view === 'week') view = 'day'; render(); });
  setInterval(() => { if (active() && !document.hidden) render(); }, 60000);   // "past" moves with the clock
})();
