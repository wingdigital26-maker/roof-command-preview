/* Homes pipeline: the roofer's deals as a board on the right of the home record (plain script, runs after rec.js).
   Columns are RC.STAGES (New hit, Called, Inspection booked, Proposal, Won) plus a collapsed "Not now" lane for deals
   that went quiet (parked, never deleted, restorable). Cards are real homes: today's 50 (RC.daily, the same list and
   order Today shows, each card with its stop number, hail, storm and squares from that list), homes added to today's
   list (RC.added) and homes with any pipeline history on this device (RC.pipeline). Opening a home does not put it on
   the board (10-15: New hit counts moved 12 -> 50 -> 51 as homes were opened). A move writes RC.setStage, the same history the stage strip reads, so the strip and the board
   always agree. Drag (mouse, pen, touch long-press) or the Move to menu on each card. A card dropped on Inspection
   booked opens the record's booking picker (cancel = it stays put); a card dropped on Won asks for the date signed.
   Card facts are only what the device and the data hold: hail (radar), squares (the measured roof outline), time in
   stage (pipeline history, else when the home first showed on this board), last action, text/email counts.
   Clicking a card opens that home in the record on the left. Nothing here sends anything. */
(function () {
  'use strict';
  const RC = window.RC, esc = RC.esc, $ = (s, r) => (r || document).querySelector(s);
  const DEF = window.rooferKey ? rooferKey() : RC.rooferKey();
  const OPENED = 'rc.t.hopened';   // homes opened on this screen (this device), newest first
  const SEEN = 'rc.pipe.seen';     // when each home first showed on this board (this device): time in New hit without history
  const VIEW = 'rc.pipe.view';     // this viewer's sort and lane choice (a convenience, safe to lose)
  const DAY = 864e5, STALE_DAYS = 3;
  const fmtDay = iso => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  // storm day with its year when it was not this year (rec.js homeDay), the same words as the stage strip
  const stormDay = (iso, short) => window.homeDay ? window.homeDay(iso, short) : fmtStorm(iso);
  const fmtStorm = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const jget = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const opened = () => jget(OPENED, []);
  function markOpened(id) {
    if (!id || /^d[a-z]+-\d+$/.test(id)) return;
    const l = opened().filter(x => x !== id); l.unshift(id);
    jset(OPENED, l.slice(0, 40));
  }
  const say = (m, u) => (window.homeSay || (() => { }))(m, u);
  const ICON = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
    expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
    shrink: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>',
    call: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
    text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    email: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 10 5 5 5-5"/></svg>'
  };

  // ---------- the homes on the board ----------
  // a card's facts: today's pick when the home is on today's list (the same address, hail, storm, squares and stop Today's
  // card shows; nothing remembered elsewhere overrides them), else what this device remembered about the home
  const okNum = v => v != null && v !== '' && v !== 'null' && isFinite(+v);
  function homeInfo(id) {
    const q = DP.get(id), r = RC.recall(id) || {}, a = RC.added().find(x => x.id === id) || {};
    const mm = /^m(\d+)$/.exec(id);
    if (q) return { id, addr: q.street || String(q.address || '').split(',')[0], city: q.city || '', hail: okNum(q.hail) ? +q.hail : null, gi: q.gi, stop: q.stop,
      sub: q.subdivision || '', zip: q.zip || '', storm: okNum(q.hail) ? q.storm || null : null, sq: q.squares != null ? +q.squares : null, sqMeasured: !!q.measured };
    const addr = r.addr || a.addr || null;
    if (!addr) return null;   // nothing on file to show: never a placeholder card
    const hail = okNum(r.hail) ? +r.hail : okNum(a.hail) ? +a.hail : null;
    const gi = r.gi != null ? r.gi : mm ? +mm[1] : null;
    const storm = hail == null ? null : /^\d{4}-\d{2}-\d{2}$/.test(r.storm || '') ? r.storm : /^\d{4}-\d{2}-\d{2}$/.test(a.storm || '') ? a.storm : null;
    return { id, addr, city: r.city || a.city || '', hail, gi, stop: null, sub: r.subdivision || a.subdivision || '', zip: r.zip || a.zip || '', storm };
  }
  // New hit = today's Daily 50 (lib/rc-queue.js RC.daily, the same 50 Today shows; closed picks only when they have a
  // deal here), then every home with a record. The old fixed route stops (dk.js ROUTES) are no longer the list.
  let DP = new Map();
  const pos = h => { let i = 0; for (const k of DP.keys()) { if (k === h.id) return i + 1; i++; } return 999; };
  function homeIds() {
    const ids = [];
    const put = id => { if (id && id !== 'c5-sample' && ids.indexOf(id) < 0) ids.push(id); };
    const picks = RC.daily ? RC.daily() : [], pipe0 = RC.pipeline();
    DP = new Map(picks.map((p, i) => [p.id, Object.assign({ stop: i + 1 }, p)]));
    picks.forEach(p => { if (p.status !== 'closed' || pipe0[p.id]) put(p.id); });
    RC.added().forEach(a => put(a.id));
    Object.keys(pipe0).forEach(put);
    return ids;
  }
  const lastAction = id => { const h = RC.history(id)[0]; return h ? { t: h.what.split('. ')[0], at: h.at } : null; };
  const archived = id => (RC.pipeline()[id] || {}).archived || null;
  const parkLine = /^(Moved to Not now|Restored to |Back from Not now)/;
  // when the home entered its stage: the newest stage move (parking and restoring don't count), else first seen here
  function stageSince(id) {
    const e = RC.history(id).find(h => h.kind === 'stage' && !parkLine.test(h.what || ''));
    return e ? e.at : (jget(SEEN, {})[id] || null);
  }
  function channels(id) {
    const c = { text: 0, email: 0 };
    RC.history(id).forEach(h => {
      const w = h.what || '';
      if (h.kind === 'text' || (h.kind === 'note' && /^Text (drafted|opened|sent)/.test(w))) c.text++;
      else if (h.kind === 'email' || (h.kind === 'note' && /^Email (drafted|opened|sent)/.test(w))) c.email++;
    });
    return c;
  }
  // squares from the home's measured roof: a route stop's outline through the roof solver (the same number the 3D
  // shows), the open home's live measure, or squares a screen kept for this home. Unknown stays unknown.
  // one figure per home: today's list's squares (the LiDAR facet measure when there is one, else the outline estimate)
  // for a home on it; else the open record's measure, else squares a screen kept for this home. Unknown stays unknown.
  function squares(h) {
    if (h.sq !== undefined) return h.sq;
    const H = window.HOME;
    if (H && H.rawId === h.id && H.measure && H.measure.squares) return H.measure.squares;
    const r = RC.recall(h.id); return r && r.sq != null && isFinite(+r.sq) ? +r.sq : null;
  }
  function nextStep(h, st) {
    if (archived(h.id)) return 'Restore when the homeowner is ready';
    // a door knock that found nobody home (knock.js) sets the next step: come back at the time it named (10-19)
    const k = (st === 'new' || st === 'called') ? RC.history(h.id).find(x => /^Knocked: /.test(x.what || '')) : null;
    if (k && /not home/.test(k.what)) { const m = /Come back (.+?)\.?$/.exec(k.what); return 'Knock again' + (m ? ' ' + m[1].replace(/^today /, '') : ''); }
    if (st === 'new') return 'Send the first text';
    if (st === 'called') return 'Book inspection';
    if (st === 'handoff') { const o = RC.stageName('handoff').replace(/^Sent to /, ''); return o + ' calls, then book the inspection'; }   // was falling through to Won's line
    if (st === 'inspection') { const b = RC.booking(h.id); return b ? 'Inspect ' + new Date(b).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Set the inspection time'; }
    if (st === 'proposal') return 'Follow up on the proposal';
    return 'Schedule the install';
  }
  const signedOn = id => { const p = RC.pipeline()[id] || {}; if (p.signed) return p.signed; const e = RC.history(id).find(x => x.kind === 'stage' && /^(Won|Moved to Won)/.test(x.what || '')); return e ? e.at.slice(0, 10) : null; };

  // ---------- view state: search, filters, sort, lane ----------
  const view = Object.assign({ sort: 'new', lane: false }, jget(VIEW, {}));
  if (['new', 'hail', 'age'].indexOf(view.sort) < 0) view.sort = 'new';
  const F = { q: '', city: '', storm: '', sub: '', route: false, knock: false };
  const saveView = () => jset(VIEW, { sort: view.sort, lane: !!view.lane });
  const filtering = () => !!(F.q || F.city || F.storm || F.sub || F.route || F.knock);
  const nFilters = () => (F.city ? 1 : 0) + (F.storm ? 1 : 0) + (F.sub ? 1 : 0) + (F.route ? 1 : 0) + (F.knock ? 1 : 0);
  function matches(h) {
    if (F.city && h.city !== F.city) return false;
    if (F.storm && h.storm !== F.storm) return false;
    if (F.sub && h.sub !== F.sub) return false;
    if (F.route && h.stop == null && !DP.has(h.id)) return false;   // today's list: the Daily 50 picks (old route stops still count)
    if (F.knock) { const k = RC.history(h.id).find(x => /^Knocked: /.test(x.what || '')); if (!k || !/not home/.test(k.what)) return false; }   // knock again (10-19)
    if (F.q) {
      const own = h.gi != null && RC.ownerNow ? RC.ownerNow(h.gi) : '';
      const hay = (h.addr + ' ' + h.city + ' ' + h.sub + ' ' + (h.zip || '') + ' ' + (own || '')).toLowerCase();
      if (F.q.toLowerCase().split(/\s+/).some(w => w && hay.indexOf(w) < 0)) return false;
    }
    return true;
  }

  // ---------- markup ----------
  const counts = $('#pcount'), cols = $('#pcols'), tabN = $('#pipeN'), pane = $('#pipePane');
  const tools = document.createElement('div'); tools.className = 'ptools'; tools.id = 'ptools';
  tools.innerHTML = `<label class="psrch">${ICON.search}<span class="vh">Search the board</span><input type="search" id="pq" placeholder="Address or owner" autocomplete="off" enterkeyhint="search"></label>
    <button type="button" class="ptb" id="pfBtn" aria-expanded="false" aria-controls="pfp">${ICON.filter}<span>Filter</span><i id="pfN" hidden></i></button>
    <label class="ptb psort"><span class="vh">Sort</span><select id="psort" aria-label="Sort cards"><option value="new">Newest</option><option value="hail">Most hail</option><option value="age">Longest in stage</option></select>${ICON.chev}</label>
    <button type="button" class="ptb pfb" id="pfullBtn" aria-pressed="false" title="Open full board" aria-label="Open full board">${ICON.expand}<span>Open full board</span></button>`;
  const fp = document.createElement('div'); fp.className = 'pfp'; fp.id = 'pfp'; fp.hidden = true; fp.setAttribute('role', 'group'); fp.setAttribute('aria-label', 'Filters');
  const shown = document.createElement('p'); shown.className = 'pshow'; shown.hidden = true; shown.setAttribute('aria-live', 'polite');
  counts.before(tools, fp, shown);
  // the columns sit in a wrapper that carries the side fades and the arrow buttons (the columns themselves scroll)
  const wrap = document.createElement('div'); wrap.className = 'pwrap'; cols.before(wrap); wrap.appendChild(cols);
  const navL = document.createElement('button'), navR = document.createElement('button');
  navL.type = navR.type = 'button'; navL.className = 'pnav l'; navR.className = 'pnav r';
  navL.setAttribute('aria-label', 'Earlier stages'); navR.setAttribute('aria-label', 'Later stages'); navL.title = 'Earlier stages'; navR.title = 'Later stages';
  navL.innerHTML = ICON.left; navR.innerHTML = ICON.right; navL.hidden = navR.hidden = true; wrap.append(navL, navR);
  const step = dir => { const c = cols.querySelector('.pcol'); cols.scrollBy({ left: dir * (c ? c.offsetWidth + 10 : 200), behavior: 'smooth' }); };
  navL.addEventListener('click', () => step(-1)); navR.addEventListener('click', () => step(1));
  const q = $('#pq'), sortSel = $('#psort'), pfBtn = $('#pfBtn'), pfN = $('#pfN'), fullBtn = $('#pfullBtn');
  sortSel.value = view.sort;

  let dragging = null, lastHTML = '', optKey = '';
  function staleTip(st, days) { return `Over ${STALE_DAYS} days in ${RC.stageName(st)} (${days} days). Homes that sit more than ${STALE_DAYS} days in New hit or Called get an amber edge.`; }
  function cardHTML(h, cur, st) {
    const own = h.gi != null && RC.ownerNow ? RC.ownerNow(h.gi) : null;
    const la = lastAction(h.id), arch = archived(h.id), sq = squares(h), ch = channels(h.id);
    // the same qualifier the inbox and the record use: a per-facet LiDAR roof is measured, an outline is an estimate
    // (only when the card's own figure is that record's: a route stop's outline estimate stays an estimate even when a facet row exists)
    const rr = h.gi != null && window.RCROOF && RCROOF.cached ? RCROOF.cached(h.gi) : null, meas = h.sqMeasured != null ? h.sqMeasured && sq != null : !!(rr && rr.facets && sq != null && Math.abs(+rr.sq - +sq) < 0.05);
    const since = stageSince(h.id), days = since ? Math.floor((Date.now() - Date.parse(since)) / DAY) : null;
    const stale = !arch && (st === 'new' || st === 'called') && since && Date.now() - Date.parse(since) > STALE_DAYS * DAY;
    const sName = RC.stageName(st);
    // short on the card (the column names the stage), the full sentence in its tooltip
    const age = arch ? 'Parked ' + fmtDay(arch) : days == null ? '' : days < 1 ? 'Here since today' : days + (days === 1 ? ' day' : ' days') + ' here';
    const ageTip = arch ? 'In Not now since ' + fmtDay(arch) + ', was in ' + sName : days == null ? '' : days < 1 ? 'In ' + sName + ' since today' : days + (days === 1 ? ' day' : ' days') + ' in ' + sName;
    const won = st === 'won' && !arch, sd = won ? signedOn(h.id) : null;
    const chip = (k, n, label) => `<span class="${n ? '' : 'z'}" title="${n} ${label}${n === 1 ? '' : 's'} logged on this device">${ICON[k]}${n}</span>`;
    return `<article class="pc${cur ? ' cur' : ''}${stale ? ' stale' : ''}${won ? ' won' : ''}${arch ? ' parked' : ''}" data-id="${esc(h.id)}" title="${stale ? esc(staleTip(st, days)) : arch ? 'Parked in Not now. Restore puts it back in ' + esc(sName) + '.' : 'Drag to a new stage, click to open'}">
      <button type="button" class="pco"${cur ? ' aria-current="true"' : ''}>${won ? `<span class="pwon">Won${sd ? ', signed ' + fmtDay(sd + (sd.length === 10 ? 'T12:00:00' : '')) : ''}</span>` : ''}<b>${esc(h.addr)}</b>${h.city ? `<small class="pcc">${esc(h.city)}${h.stop ? ', stop ' + h.stop : ''}</small>` : ''}${own ? `<span class="pown">${esc(own)}</span>` : ''}
        <span class="pmeta">${h.hail != null ? `<span class="phail"${h.storm ? ` title="${h.hail.toFixed(2)} in hail on radar, storm of ${esc(stormDay(h.storm))}"` : ' title="Hail on radar"'}>${h.hail.toFixed(2)} in${h.storm ? `<i>${esc(stormDay(h.storm, true))}</i>` : ' hail'}</span>` : ''}${sq != null ? (meas ? `<span class="psq" title="Measured from LiDAR roof facets. Verify on site.">${sq} sq measured</span>` : `<span class="psq" title="Estimated from public building outlines and 2018 LiDAR. Verify on site.">~${sq} sq (est.)</span>`) : ''}</span>
        <span class="prow"><span class="page${stale ? ' late' : ''}" title="${esc(ageTip)}">${esc(age)}</span><span class="pch" aria-label="${ch.text} texts, ${ch.email} emails">${chip('text', ch.text, 'text')}${chip('email', ch.email, 'email')}</span></span>
        <span class="plast"${la ? ` title="${esc(la.t)}, ${esc(fmtDay(la.at))}"` : ''}>${la ? `<time>${esc(fmtDay(la.at))}</time>` + esc(st === 'inspection' && RC.booking(h.id) ? la.t.replace(/^(Inspection booked) for .*$/, '$1') : la.t) : 'No action yet'}</span>
        <span class="pnext"><em>Next</em>${esc(nextStep(h, st))}</span></button>
      <div class="pfoot">${arch ? `<button type="button" class="prs" data-restore="1">Restore to ${esc(sName)}</button>` : ''}<button type="button" class="pmv" aria-haspopup="menu" aria-label="Move ${esc(h.addr)} to another stage">Move to${ICON.chev}</button>${st === 'inspection' && !arch && RC.booking(h.id) && window.homeIcs ? `<button type="button" class="pcal" data-ics="1" title="Save the inspection as a calendar file (.ics) for your calendar app" aria-label="Add the ${esc(h.addr)} inspection to your calendar">${ICON.cal}Calendar</button>` : ''}</div>
    </article>`;
  }
  const sqText = l => { const k = l.filter(h => squares(h) != null), t = Math.round(k.reduce((a, h) => a + squares(h), 0));   // a stage total in whole squares (visual check 10-23)
    return { t: k.length ? '~' + t.toLocaleString('en-US') + ' sq (est.)' : l.length ? 'Not estimated' : '', tip: k.length ? `~${t} estimated squares in this stage${k.length < l.length ? ', ' + (l.length - k.length) + ' not estimated yet' : ''}. Estimated from public building outlines and 2018 LiDAR. Verify on site. No prices set, so squares only.` : '' }; };
  function sortList(l) {
    const rec = h => { const la = lastAction(h.id); return la ? la.at : stageSince(h.id) || ''; };
    if (view.sort === 'hail') return l.sort((a, b) => (b.hail == null ? -1 : b.hail) - (a.hail == null ? -1 : a.hail) || (a.stop || pos(a)) - (b.stop || pos(b)));
    if (view.sort === 'age') return l.sort((a, b) => (stageSince(a.id) || '9').localeCompare(stageSince(b.id) || '9') || (a.stop || pos(a)) - (b.stop || pos(b)));
    return l.sort((a, b) => rec(b).localeCompare(rec(a)) || (a.stop || pos(a)) - (b.stop || pos(b)));
  }
  function filterOptions(all) {
    const uniq = f => [...new Set(all.map(f).filter(Boolean))].sort();
    const cities = uniq(h => h.city), storms = uniq(h => h.storm).reverse(), subs = uniq(h => h.sub);
    const key = JSON.stringify([cities, storms, subs]);
    if (key === optKey) return; optKey = key;
    const sel = (id, label, all, vals, fmt) => `<select id="${id}" aria-label="${label}" title="${label}"><option value="">${all}</option>${vals.map(v => `<option value="${esc(v)}">${esc(fmt ? fmt(v) : v)}</option>`).join('')}</select>`;
    fp.innerHTML = sel('pfCity', 'City', 'All cities', cities) + sel('pfStorm', 'Storm', 'All storms', storms, fmtStorm) + sel('pfSub', 'Neighborhood', 'All neighborhoods', subs)
      + `<label class="pfr"><input type="checkbox" id="pfRoute"><span>Only today's 50</span></label><label class="pfr"><input type="checkbox" id="pfKnock"><span>Knock again (nobody home last time)</span></label><span class="pfc" id="pfCount" aria-live="polite"></span><button type="button" class="pfx" id="pfClear">Clear filters</button>`;
    $('#pfCity', fp).value = F.city; $('#pfStorm', fp).value = F.storm; $('#pfSub', fp).value = F.sub; $('#pfRoute', fp).checked = F.route; $('#pfKnock', fp).checked = F.knock;
  }
  function render(force) {
    if (dragging) return;
    markOpened(window.HOME && window.HOME.rawId);
    const ids = homeIds(), seen = jget(SEEN, {}); let fresh = false;
    ids.forEach(id => { if (!seen[id]) { seen[id] = new Date().toISOString(); fresh = true; } });
    if (fresh) jset(SEEN, seen);
    const all = ids.map(homeInfo).filter(Boolean), cur = window.HOME && window.HOME.rawId;
    // keep the open home's measured squares, so its card shows them after the record moves on
    const H = window.HOME; if (H && H.rawId && H.measure && H.measure.squares && !DP.has(H.rawId)) { const r = RC.recall(H.rawId); if (r && r.sq !== H.measure.squares) RC.remember({ id: H.rawId, sq: H.measure.squares }); }
    filterOptions(all);
    const list = all.filter(matches), by = {}, lane = [];
    RC.STAGES.forEach(s => by[s[0]] = []);
    list.forEach(h => { if (archived(h.id)) lane.push(h); else { const st = RC.stage(h.id); (by[st] || by.new).push(h); } });
    Object.keys(by).forEach(k => sortList(by[k])); sortList(lane);
    const live = all.filter(h => !archived(h.id)).length, total = list.length - lane.length;
    const month = new Date().toISOString().slice(0, 7), wonMonth = by.won.filter(h => (signedOn(h.id) || '').slice(0, 7) === month).length;
    const cHTML = RC.STAGES.map(s => { const n = by[s[0]].length; return `<button type="button" class="pcn" data-drop="${s[0]}" data-jump="${s[0]}" title="${esc(s[1])}: ${n}"><b>${n}</b><span>${esc(s[1])}</span><i style="--w:${total ? Math.round(n / total * 100) : 0}%"></i></button>`; }).join('');
    const kHTML = RC.STAGES.map(s => { const l = by[s[0]], n = l.length, sq = sqText(l);
      return `<section class="pcol" data-drop="${s[0]}" aria-label="${esc(s[1])}, ${n} ${n === 1 ? 'home' : 'homes'}">
      <h4><span class="pnm">${esc(s[1])}</span><span class="pnum">${n}</span></h4>
      <p class="psub">${sq.t ? `<span title="${esc(sq.tip)}">${esc(sq.t)}</span>` : ''}${s[0] === 'won' ? `<span class="pmo">${wonMonth} this month</span>` : ''}</p>
      <div class="pls">${n ? l.map(h => cardHTML(h, h.id === cur, s[0])).join('') + (n > 1 ? `<p class="pend">End of ${esc(s[1])}, ${n} homes</p>` : '') : `<p class="pempty">${filtering() ? 'No homes match here' : 'No homes here yet'}</p>`}</div></section>`; }).join('')
      + `<section class="pcol plane${view.lane ? ' open' : ''}" data-drop="lost" aria-label="Not now, ${lane.length} parked">
      <h4><button type="button" class="plt" aria-expanded="${view.lane ? 'true' : 'false'}" title="Deals that went quiet. Parked here, never deleted."><span class="pnm">Not now</span><span class="pnum">${lane.length}</span>${ICON.chev}</button></h4>
      ${view.lane ? `<p class="psub"><span>Parked, never deleted</span></p><div class="pls">${lane.length ? lane.map(h => cardHTML(h, h.id === cur, RC.stage(h.id))).join('') : `<p class="pempty">${filtering() ? 'No parked homes match' : 'Nothing parked. Use Move to, Not now, when a homeowner says not now.'}</p>`}</div>` : ''}</section>`;
    const sHTML = filtering() ? `Showing ${list.length} of ${all.length} homes` : '';
    const html = cHTML + '|' + kHTML + '|' + sHTML;
    pfN.hidden = !nFilters(); pfN.textContent = nFilters();
    tabN.textContent = live;
    if (!force && html === lastHTML) return;
    lastHTML = html;
    const keep = cols.scrollLeft, keepV = [...cols.querySelectorAll('.pls')].map(l => l.scrollTop);
    counts.innerHTML = cHTML; cols.innerHTML = kHTML;
    const pc = $('#pfCount', fp); if (pc) pc.textContent = sHTML;
    shown.hidden = !sHTML || !fp.hidden; shown.innerHTML = sHTML ? `<span>${esc(sHTML)}</span><button type="button" id="pClearAll">Clear</button>` : '';
    cols.scrollLeft = keep; cols.querySelectorAll('.pls').forEach((l, i) => { l.scrollTop = keepV[i] || 0; });
    // the open home moved stage (Book, the strip, Move to) or another home opened (first paint, Next stop, a reload):
    // bring its column and card into view
    const curSt = cur ? (archived(cur) ? 'lost' : RC.stage(cur)) : null;
    // (or the list re-sorted under a kept scroll position, e.g. the record's measure arriving, and the open card slid out of view)
    const hidden = () => { const c = cols.querySelector(`.pc[data-id="${CSS.escape(cur)}"]`), l = c && c.closest('.pls'); return !!(c && l && (c.offsetTop - l.offsetTop < l.scrollTop || c.offsetTop - l.offsetTop + c.offsetHeight > l.scrollTop + l.clientHeight)); };
    if (cur && (cur !== seenCur.id || curSt !== seenCur.st || hidden())) showCard(cur, cur === seenCur.id);   // a move glides, an open jumps
    seenCur.id = cur; seenCur.st = curSt;
    edges();
  }
  const seenCur = { id: null, st: null };
  function showCard(id, glide) {
    const how = glide ? 'smooth' : 'auto';
    const c = cols.querySelector(`.pc[data-id="${CSS.escape(id)}"]`); if (!c) return;
    const col = c.closest('.pcol'), l = c.closest('.pls');
    const vis = col.offsetLeft - cols.offsetLeft >= cols.scrollLeft && col.offsetLeft - cols.offsetLeft + col.offsetWidth <= cols.scrollLeft + cols.clientWidth;
    if (!vis) cols.scrollTo({ left: col.offsetLeft - cols.offsetLeft - 16, behavior: how });
    if (l && (c.offsetTop - l.offsetTop < l.scrollTop || c.offsetTop - l.offsetTop + c.offsetHeight > l.scrollTop + l.clientHeight)) l.scrollTo({ top: Math.max(0, c.offsetTop - l.offsetTop - 8), behavior: how });
    setTimeout(edges, 450);
  }
  // scroll cues: a soft fade on the side with more columns (plus arrows on desktop), and at the foot of a column that
  // has more cards below; the last card is followed by "End of <stage>"
  function edges() {
    const max = cols.scrollWidth - cols.clientWidth, sl = cols.scrollLeft;
    const more = sl < max - 18;   // the last 16px are the board's own right padding, not a hidden column
    wrap.classList.toggle('fl', sl > 4); wrap.classList.toggle('fr', more);
    navL.hidden = !(sl > 4); navR.hidden = !more;
    // more than the list's own 10px foot padding still below = more cards: fade the foot
    cols.querySelectorAll('.pls').forEach(l => l.classList.toggle('fb', l.scrollHeight - l.clientHeight - l.scrollTop > 14));
  }
  window.renderPipe = render;
  if (RC.queueReady) RC.queueReady.then(ok => { if (ok) render(true); });   // the day's 50 land after the first paint

  // ---------- toolbar ----------
  let qT = 0;
  q.addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(() => { F.q = q.value.trim(); render(true); }, 120); });
  q.addEventListener('keydown', e => { if (e.key === 'Escape' && q.value) { e.stopPropagation(); q.value = ''; F.q = ''; render(true); } });
  sortSel.addEventListener('change', () => { view.sort = sortSel.value; saveView(); render(true); });
  pfBtn.addEventListener('click', () => { const open = fp.hidden; fp.hidden = !open; pfBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); render(true); if (open) { const f = fp.querySelector('select'); if (f) f.focus(); } });
  fp.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'pfCity') F.city = t.value; else if (t.id === 'pfStorm') F.storm = t.value; else if (t.id === 'pfSub') F.sub = t.value; else if (t.id === 'pfRoute') F.route = t.checked; else if (t.id === 'pfKnock') F.knock = t.checked;
    render(true);
  });
  function clearFilters() { F.q = F.city = F.storm = F.sub = ''; F.route = false; F.knock = false; q.value = ''; optKey = ''; render(true); }
  fp.addEventListener('click', e => { if (e.target.closest('#pfClear')) clearFilters(); });
  shown.addEventListener('click', e => { if (e.target.closest('#pClearAll')) { clearFilters(); q.focus(); } });

  // ---------- one move, with undo (same history the stage strip writes) ----------
  // to: a stage key or 'lost' (Not now). Inspection booked goes through the booking picker, Won asks for the date signed.
  function move(id, to, how) {
    const prev = RC.stage(id), parked = archived(id), h = homeInfo(id), name = h ? h.addr : 'Home';
    if (to === 'lost') {
      if (parked) return false;
      RC.setStage(id, prev, 'Moved to Not now', { archived: new Date().toISOString() });
      render(true);
      say(name + ' moved to Not now.', () => { RC.setStage(id, prev, 'Back from Not now', { archived: null }); render(true); refocus(id); });
      if (how === 'key') refocus(id);
      return true;
    }
    if (prev === to && !parked) return false;
    if (prev === to && parked) return restore(id, how);
    if (to === 'inspection' && window.homeBook) {
      window.homeBook({ id, addr: name, onCancel: () => { render(true); say('No time picked. ' + name + ' stays in ' + (parked ? 'Not now' : RC.stageName(prev)) + '.'); refocus(id); } });
      return true;
    }
    if (to === 'won' && window.homeDialog) { confirmWon(id, name, prev, parked, how); return true; }
    RC.setStage(id, to, 'Moved to ' + RC.stageName(to), { archived: null });
    render(true);
    say(name + ' moved to ' + RC.stageName(to) + '.', () => { RC.setStage(id, prev, 'Moved back to ' + RC.stageName(prev), { archived: parked || null }); render(true); refocus(id); });
    if (how === 'key') refocus(id);
    return true;
  }
  function restore(id, how) {
    const st = RC.stage(id), parked = archived(id), h = homeInfo(id), name = h ? h.addr : 'Home';
    if (!parked) return false;
    RC.setStage(id, st, 'Restored to ' + RC.stageName(st), { archived: null });
    render(true);
    say(name + ' restored to ' + RC.stageName(st) + '.', () => { RC.setStage(id, st, 'Moved to Not now', { archived: parked }); render(true); });
    if (how === 'key') refocus(id);
    return true;
  }
  const pad = x => String(x).padStart(2, '0');
  function confirmWon(id, name, prev, parked, how) {
    const d = new Date(), today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    let done = false;
    window.homeDialog('Mark as won', `<p class="dl">${esc(name)}. Confirm the homeowner signed, and the day they signed.</p>
      <label class="fl">Date signed<input type="date" id="wonD" value="${today}" max="${today}"></label>
      <div class="drow"><button type="button" class="pbtn" id="wonGo">Mark won</button><button type="button" id="wonNo">Cancel</button></div>`, body => {
      body.querySelector('#wonNo').onclick = () => window.homeDialogEl.close();
      body.querySelector('#wonGo').onclick = () => {
        const v = body.querySelector('#wonD').value; if (!v) { body.querySelector('#wonD').focus(); return; }
        const prevSigned = (RC.pipeline()[id] || {}).signed || null;
        done = true;
        RC.setStage(id, 'won', 'Won, contract signed ' + fmtDay(v + 'T12:00:00'), { signed: v, archived: null });
        window.homeDialogEl.close(); render(true);
        say(name + ' marked won.', () => { RC.setStage(id, prev, 'Moved back to ' + RC.stageName(prev), { signed: prevSigned, archived: parked || null }); render(true); refocus(id); });
        if (how === 'key') refocus(id);
      };
    });
    window.homeDialogEl.addEventListener('close', () => { if (!done) { render(true); say(name + ' stays in ' + (parked ? 'Not now' : RC.stageName(prev)) + '.'); refocus(id); } }, { once: true });
  }
  function refocus(id) { const c = cols.querySelector(`.pc[data-id="${CSS.escape(id)}"]`); if (c) { c.scrollIntoView({ block: 'nearest', inline: 'nearest' }); c.querySelector('.pmv').focus({ preventScroll: true }); } }

  // ---------- open a card in the record ----------
  cols.addEventListener('click', e => {
    if (suppress) { suppress = false; e.preventDefault(); return; }
    const lt = e.target.closest('.plt'); if (lt) { view.lane = !view.lane; saveView(); render(true); const b = cols.querySelector('.plt'); if (b) b.focus(); if (view.lane) { const l = cols.querySelector('.plane'); if (l) cols.scrollTo({ left: l.offsetLeft - cols.offsetLeft - 12, behavior: 'smooth' }); } return; }
    const rs = e.target.closest('[data-restore]'); if (rs) { restore(rs.closest('.pc').dataset.id, e.detail === 0 ? 'key' : 'click'); return; }
    const mv = e.target.closest('.pmv'); if (mv) { openMenu(mv); return; }
    const ic = e.target.closest('[data-ics]'); if (ic) { if (window.homeIcs(ic.closest('.pc').dataset.id)) say('Calendar file saved. Open it to add the inspection to your calendar.'); return; }
    const o = e.target.closest('.pco'); if (!o) return;
    const id = o.closest('.pc').dataset.id;
    if (document.body.classList.contains('pfull')) setFull(false);
    if (window.crmOpenHome) window.crmOpenHome(id);   // the CRM: a card opens that home's record
    else if (window.switchHome) window.switchHome(id);
    if (matchMedia('(max-width:640px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  counts.addEventListener('click', e => {
    const b = e.target.closest('[data-jump]'); if (!b || suppress) { suppress = false; return; }
    const c = cols.querySelector(`.pcol[data-drop="${b.dataset.jump}"]`);
    if (c) cols.scrollTo({ left: c.offsetLeft - cols.offsetLeft - 12, behavior: 'smooth' });
  });

  // ---------- Move to menu (keyboard and screen reader path) ----------
  let menu = null, menuFrom = null;
  function closeMenu(back) { if (!menu) return; menu.remove(); menu = null; document.removeEventListener('pointerdown', outside, true); if (back && menuFrom) menuFrom.focus(); menuFrom = null; }
  const outside = e => { if (menu && !menu.contains(e.target) && e.target !== menuFrom) closeMenu(false); };
  function openMenu(btn) {
    if (menu) { const same = menuFrom === btn; closeMenu(false); if (same) return; }
    const id = btn.closest('.pc').dataset.id, st = RC.stage(id), parked = archived(id);
    menuFrom = btn;
    menu = document.createElement('div'); menu.className = 'pmenu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Move to stage');
    menu.innerHTML = RC.STAGES.map(s => { const here = s[0] === st && !parked;
      return `<button type="button" role="menuitemradio" aria-checked="${here}" data-to="${s[0]}"${here ? ' aria-disabled="true"' : ''}>${esc(s[1])}${here ? '<small>Here now</small>' : s[0] === st ? '<small>Restore here</small>' : s[0] === 'inspection' ? '<small>Pick a time</small>' : s[0] === 'won' ? '<small>Date signed</small>' : ''}</button>`; }).join('')
      + `<hr><button type="button" role="menuitemradio" aria-checked="${!!parked}" data-to="lost"${parked ? ' aria-disabled="true"' : ''}>Not now${parked ? '<small>Here now</small>' : '<small>Park it, keep it</small>'}</button>`;
    document.body.appendChild(menu);
    const r = btn.getBoundingClientRect(), mh = menu.offsetHeight, mw = menu.offsetWidth;
    const top = r.bottom + 6 + mh > innerHeight - 8 ? Math.max(8, r.top - 6 - mh) : r.bottom + 6;
    menu.style.top = top + 'px'; menu.style.left = Math.max(8, Math.min(innerWidth - mw - 8, r.right - mw)) + 'px';
    const items = [...menu.querySelectorAll('button')];
    (items.find(b => b.getAttribute('aria-disabled') !== 'true') || items[0]).focus();
    menu.addEventListener('keydown', e => {
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
      else if (e.key === 'Tab') closeMenu(false);
    });
    menu.addEventListener('click', e => {
      const b = e.target.closest('[data-to]'); if (!b || b.getAttribute('aria-disabled') === 'true') return;
      const kb = e.detail === 0; closeMenu(false); move(id, b.dataset.to, kb ? 'key' : 'menu');
    });
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  }
  addEventListener('resize', () => closeMenu(false));
  cols.addEventListener('scroll', () => { closeMenu(false); edges(); }, true);
  addEventListener('resize', edges);
  if (window.ResizeObserver) new ResizeObserver(() => edges()).observe(cols);

  // ---------- drag and drop (pointer events: mouse and pen move to start, touch long-presses) ----------
  let pd = null, suppress = false, ghost = null, over = null, raf = 0;
  cols.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.pmv,.prs,.plt,.pcal')) return;
    const card = e.target.closest('.pc'); if (!card) return;
    pd = { card, id: card.dataset.id, x: e.clientX, y: e.clientY, pid: e.pointerId, touch: e.pointerType === 'touch', t: 0 };
    if (pd.touch) pd.t = setTimeout(() => { if (pd) start(pd.x, pd.y); }, 300);
  });
  addEventListener('pointermove', e => {
    if (!pd || e.pointerId !== pd.pid) return;
    const dx = e.clientX - pd.x, dy = e.clientY - pd.y;
    if (!dragging) {
      if (pd.touch) { if (Math.hypot(dx, dy) > 8) { clearTimeout(pd.t); pd = null; } return; }   // a swipe scrolls the board
      if (Math.hypot(dx, dy) < 6) return;
      start(pd.x, pd.y);
    }
    pd.x = e.clientX; pd.y = e.clientY; follow();
  });
  // a touch drag must not scroll the page while the card is held
  document.addEventListener('touchmove', e => { if (dragging) e.preventDefault(); }, { passive: false });
  function start(x, y) {
    dragging = pd; const r = pd.card.getBoundingClientRect();
    pd.ox = x - r.left; pd.oy = y - r.top;
    ghost = pd.card.cloneNode(true); ghost.classList.add('ghost'); ghost.removeAttribute('data-id');
    ghost.style.width = r.width + 'px'; document.body.appendChild(ghost);
    pd.card.classList.add('lift'); document.body.classList.add('pdrag'); closeMenu(false);
    try { navigator.vibrate && pd.touch && navigator.vibrate(12); } catch (e) { }
    follow(); raf = requestAnimationFrame(edge);
  }
  function follow() {
    if (!dragging) return;
    ghost.style.transform = `translate(${pd.x - pd.ox}px,${pd.y - pd.oy}px) rotate(-1.5deg)`;
    const el = document.elementFromPoint(pd.x, pd.y), t = el && el.closest('[data-drop]');
    if (t !== over) { if (over) over.classList.remove('hot'); over = t; if (over) over.classList.add('hot'); }
  }
  // near an edge of the board the columns scroll on their own, so a card can reach any stage
  function edge() {
    if (!dragging) return;
    const r = cols.getBoundingClientRect(), z = 44;
    if (pd.y > r.top && pd.y < r.bottom) {
      if (pd.x < r.left + z) cols.scrollLeft -= 10; else if (pd.x > r.right - z) cols.scrollLeft += 10;
      const l = over && over.classList.contains('pcol') ? over.querySelector('.pls') : null;
      if (l) { const lr = l.getBoundingClientRect(); if (pd.y < lr.top + 30) l.scrollTop -= 8; else if (pd.y > lr.bottom - 30) l.scrollTop += 8; }
      follow();
    }
    raf = requestAnimationFrame(edge);
  }
  function end(drop) {
    if (pd) clearTimeout(pd.t);
    if (!dragging) { pd = null; return; }
    const d = dragging, to = drop && over ? over.dataset.drop : null;
    cancelAnimationFrame(raf); ghost.remove(); ghost = null; d.card.classList.remove('lift'); document.body.classList.remove('pdrag');
    if (over) over.classList.remove('hot'); over = null; dragging = null; pd = null; suppress = true; setTimeout(() => { suppress = false; }, 0);
    if (!to || !move(d.id, to, 'drag')) render(true);
  }
  addEventListener('pointerup', e => { if (pd && e.pointerId === pd.pid) end(true); });
  addEventListener('pointercancel', e => { if (pd && e.pointerId === pd.pid) end(false); });
  cols.addEventListener('contextmenu', e => { if (e.target.closest('.pc') && (dragging || pd)) e.preventDefault(); });
  cols.addEventListener('dragstart', e => e.preventDefault());

  // ---------- full board: the pipeline takes the whole Homes area, the record folds to a slim header ----------
  function fitFull() {
    if (!document.body.classList.contains('pfull')) { pane.style.removeProperty('--pfh'); return; }
    const phone = matchMedia('(max-width:640px)').matches;
    if (phone) { pane.style.removeProperty('--pfh'); return; }
    // ends above the bottom-right 120 px corner (Nimbus), whatever the window height
    const top = pane.getBoundingClientRect().top + scrollY;
    pane.style.setProperty('--pfh', Math.max(360, innerHeight - top - 136) + 'px');
  }
  function setFull(on) {
    document.body.classList.toggle('pfull', on);
    fullBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    fullBtn.title = on ? 'Back to the home (Esc)' : 'Open full board';
    fullBtn.setAttribute('aria-label', on ? 'Close full board' : 'Open full board');
    fullBtn.innerHTML = (on ? ICON.shrink : ICON.expand) + `<span>${on ? 'Close full board' : 'Open full board'}</span>`;
    if (on) { showPane('pipe'); window.scrollTo(0, 0); }
    fitFull(); closeMenu(false);
    fullBtn.focus({ preventScroll: true });
  }
  fullBtn.addEventListener('click', () => setFull(!document.body.classList.contains('pfull')));
  addEventListener('resize', fitFull);
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (dragging) { end(false); return; }
    if (menu) return;
    const dlg = window.homeDialogEl; if (dlg && dlg.open) return;
    if (document.body.classList.contains('pfull')) { e.preventDefault(); setFull(false); }
  });

  // ---------- right column: Pipeline | This home ----------
  const ptab = $('#ptab'), panes = { pipe: pane, home: $('#homePane') };
  function showPane(p) {
    ptab.querySelectorAll('[data-p]').forEach(b => { const on = b.dataset.p === p; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
    Object.keys(panes).forEach(k => panes[k].classList.toggle('on', k === p));
    document.body.dataset.pane = p;
  }
  ptab.addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) showPane(b.dataset.p); });
  ptab.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const n = ptab.querySelector('[aria-selected="false"]'); if (n) { n.focus(); showPane(n.dataset.p); }
  });
  // a plane picked on the roof (home.js), or a record tab asked for, shows This home
  const recTab = window.setTab;
  if (recTab) window.setTab = t => { if (document.body.classList.contains('pfull')) setFull(false); showPane('home'); recTab(t); };
  window.showPane = showPane;
  // a home record opens on This home (its hail, next task, roof); the board has its own Pipeline view (10-19)
  showPane('home');

  // ---------- keep in step: this screen, other screens (storage event), owner names loading, the clock ----------
  RC.on(() => render());
  RC.factsReady.then(() => { render(true); if (RC.ownersWarm) RC.ownersWarm().then(ok => { if (ok) render(true); }); });
  setInterval(() => render(), 60000);   // time in stage and the stale edge move with the clock
  render(true);
})();
