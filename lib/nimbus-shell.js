/* Nimbus across the Roof Command tour. Concept only, sample data.
 * Uses the real lib/wing-mascot.js (mount, setState, flare, chat). One bubble at a time,
 * auto-dismissed, mood matched to the news. Exposes window.Nimbus for the shell.
 * Every number comes from window.RC (lib/rc-state.js): the real home and storm counts and the one
 * pipeline shared by every screen. Nimbus.answer(q) is the brain; it is pure and also used by the
 * Ask Nimbus page, so loading this file without calling Nimbus.init() is safe. */
(function () {
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var RC = window.RC;
  var fmt = function (n) { return RC ? RC.fmt(n) : String(n); };
  var F = function () { return RC ? RC.facts : { homes: 0, counties: 0, storm: { d: 'Jun 2', iso: '2026-06-02', homes: 0, max: 0 } }; };
  var S = function () { return F().storm; };
  /* homes reached today on this device: a text or email handed off (outreach is text and email only, 10-09) */
  var reachedIds = function () { var m = {}; if (!RC) return m; RC.activity().forEach(function (a) { if (a.dir === 'out' && (a.ch === 'text' || a.ch === 'email') && new Date(a.at).toDateString() === new Date().toDateString()) m[a.id] = 1; }); return m; };
  var called = function () { return Object.keys(reachedIds()).length; };
  var queue = function () { return RC ? RC.queue() : 50; };
  var OWNER = (window.activeRoofer && activeRoofer().owner) || 'Chris';

  /* pipeline on this device, counted by stage */
  function pipeCounts() {
    var out = { called: 0, inspection: 0, proposal: 0, won: 0, booked: [] };
    if (!RC) return out;
    var p = RC.pipeline();
    Object.keys(p).forEach(function (id) {
      var e = p[id];
      if (out[e.stage] !== undefined) out[e.stage]++;
      if (e.booked) { var h = RC.recall(id); out.booked.push({ id: id, at: e.booked, addr: h && h.addr ? h.addr : 'a home on the list' }); }
    });
    out.booked.sort(function (a, b) { return Date.parse(a.at) - Date.parse(b.at); });
    return out;
  }

  /* links the brain puts in answers: the shell routes them, the Ask page sends them through RC.go */
  function link(label, screen, params) {
    var p = params || {};
    var hash = '#/' + screen + (p.iso ? '/' + p.iso : p.n ? '/' + p.n : p.id ? '/' + p.id : '');
    return '<a href="' + hash + '" data-go="' + screen + '" data-params=\'' + JSON.stringify(p).replace(/'/g, '&#39;') + '\'>' + label + '</a>';
  }

  /* ---------- the brain: plain-word questions answered from RC, with the action they imply ---------- */
  /* the showcase storm named in a question: "aug 12", "aug 12 2025" or "aug 12 25" (t is lowercased, punctuation gone).
     s.d may carry the year ("Aug 12, 2025"); a different year typed ("aug 12 2024") is not this storm. */
  function namesStorm(t, s) {
    if (!s || !s.d) return false;
    var md = String(s.d).toLowerCase().replace(/,?\s*\d{4}\s*$/, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    var y = String(s.iso || '').slice(0, 4), m = new RegExp('(^| )' + md + '(?![0-9])(?: (\\d{4}|\\d{2})(?![0-9]))?').exec(t);
    if (!m) return false;
    return !m[2] || !y || m[2] === y || m[2] === y.slice(2);
  }
  var FALLBACK = 'I do not have that one yet. I can open the storm map, show the latest storm, bring up today\'s list or your next stop, and count what you have reached and booked.';

  /* ---------- live actions (10-09): things he can do from the chat with the data on this device ---------- */
  /* the Today frame's RC when the shell has loaded it: it carries RC.cadence (lib/rc-queue.js), the one follow-up clock */
  function dailyRC() {
    /* asked from the shell, or from a screen inside it (the Ask page): the shell's Today frame either way */
    try { var d = document.getElementById('f') ? document : (window.parent !== window ? window.parent.document : document);
      var fr = d.querySelector('#f iframe[data-screen="daily"]'); var w = fr && fr.contentWindow; return w && w.RC && w.RC.cadence ? w.RC : null; } catch (e) { return null; }
  }
  /* one thread per home from the texts and emails on this device: newest record first */
  function threads() {
    var by = {}; if (!RC) return by;
    RC.activity().forEach(function (a) { if (a.ch !== 'text' && a.ch !== 'email') return; (by[a.id] = by[a.id] || []).push(a); });
    return by;
  }
  var addrOf = function (id) { var h = RC && RC.recall(id); return shortAddr(h && h.addr ? h.addr : '') || 'a home on the list'; };
  /* homes whose latest text or email is the homeowner's reply (the inbox's Replied filter), not opted out */
  function repliedList() {
    var by = threads(), out = [];
    Object.keys(by).forEach(function (id) { var l = by[id]; if (l[0].dir === 'in' && !RC.optedOut(id)) out.push({ id: id, addr: addrOf(id), at: l[0].at }); });
    return out.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  }
  /* follow-ups due today and overdue, by RC.cadence (day 1, 3, 7, 30, then every 30) on every home reached from this device */
  function dueCounts() {
    var R = dailyRC(); if (!R) return null;
    var by = threads(), due = 0, late = 0;
    Object.keys(by).forEach(function (id) {
      if (!by[id].some(function (a) { return a.dir === 'out'; })) return;
      var c = R.cadence(id); if (!c || c.stopped) return;
      if (c.overdue) late++; else if (c.dueToday) due++;
    });
    return { due: due, late: late };
  }
  /* the storm with the most homes at 1 in+ this month; with no hail this month, the latest month that had some */
  function biggestThisMonth() {
    var c = RC && RC.catalog; if (!c || !c.storms || !c.storms.length) return null;
    var ym = new Date().toISOString().slice(0, 7), list = c.storms.filter(function (s) { return s.date && s.date.slice(0, 7) === ym; }), thisMonth = true;
    if (!list.length) { var latest = c.storms.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0]; ym = latest.date.slice(0, 7); list = c.storms.filter(function (s) { return s.date.slice(0, 7) === ym; }); thisMonth = false; }
    var best = list.reduce(function (a, b) { return (b.homes_1in || 0) > (a.homes_1in || 0) ? b : a; });
    var monthName = new Date(ym + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: thisMonth ? undefined : 'numeric', timeZone: 'UTC' });
    return { s: best, thisMonth: thisMonth, month: monthName };
  }
  /* the next open stop on today's list: from the Today frame's kept list when it has run, else stop 1 */
  function nextDraft() {
    /* the Today frame's own list (RC.daily, lib/rc-queue.js): stop n = position in the list, open = not reached today */
    var R = dailyRC();
    if (R && R.daily) { try { var d = R.daily(), open = d.filter(function (p) { return p.status === 'open'; }), k = d.findIndex(function (p) { return p.status === 'open'; });
      if (d.length) return k < 0 ? { n: 0, left: 0, total: d.length } : { n: k + 1, id: d[k].id, addr: shortAddr(d[k].address), left: open.length, total: d.length }; } catch (e) {} }
    var r = routeToday();
    if (r && r.next) return { n: r.next.n, id: r.next.id, addr: r.next.addr, left: r.left, total: r.total };
    if (r && !r.left) return { n: 0, left: 0, total: r.total };
    return { n: Math.min(50, called() + 1), left: null, total: queue() };
  }
  var INBOX_LABEL = { reply: 'Replied', due: 'Due today', late: 'Overdue' };
  function actions(t, has, q) {
    /* Draft today's texts: open the next open stop on Today, with its text draft */
    if (has('draft', 'todays texts', 'today s texts', 'next text', 'start texting', 'texts for today')) {
      var w = RC.textWindow(), d = nextDraft();
      if (!d.n) return { html: 'All ' + d.total + ' homes on today\'s list are done. ' + link('Open today\'s list', 'daily', {}) + '.', mood: 'excited', go: { screen: 'daily', params: {} } };
      var who = d.addr ? '<b>' + RC.esc(d.addr) + '</b>, stop ' + d.n : 'stop <b>' + d.n + '</b>';
      var left = d.left != null ? d.left + ' of ' + d.total + ' left today. ' : '';
      return { html: 'Next up: ' + who + '. ' + left + (w.isOpen ? 'Opening the text draft; it goes from your phone.' : RC.esc(w.line) + ' Opening the stop so the draft is ready.'), mood: 'excited', go: { screen: 'daily', params: { n: d.n, after: w.isOpen ? 'text' : '' } } };
    }
    /* Who replied: the inbox on Replied */
    if (has('who replied', 'replied', 'replies', 'who answered', 'wrote back', 'texted back', 'any reply')) {
      var rl = repliedList();
      if (!rl.length) return { html: 'No replies waiting. A reply you log on a thread (Log a reply) shows up here. ' + link('Open the inbox', 'daily', { after: 'inbox:all' }) + '.', mood: 'calm', go: { screen: 'daily', params: { after: 'inbox:all' } } };
      var names = rl.slice(0, 3).map(function (x) { return RC.esc(x.addr); }).join(', ');
      return { html: '<b>' + rl.length + '</b> home' + (rl.length === 1 ? '' : 's') + ' replied and ' + (rl.length === 1 ? 'is' : 'are') + ' waiting on you: ' + names + (rl.length > 3 ? ' and ' + (rl.length - 3) + ' more' : '') + '. Opening the inbox on Replied.', mood: 'excited', go: { screen: 'daily', params: { after: 'inbox:reply' } } };
    }
    /* What's due today: follow-up counts, then the inbox on Due today or Overdue */
    if (has('due today', 'what s due', 'whats due', 'overdue', 'follow ups', 'follow up', 'due now', 'what is due')) {
      var dc = dueCounts();
      if (!dc) return { html: 'Open ' + link('Today', 'daily', {}) + ' first; its follow-up clock counts what is due.', mood: 'calm', go: { screen: 'daily', params: {} } };
      if (!dc.due && !dc.late) return { html: 'Nothing due today and nothing overdue. Follow-ups come back on day 3, 7 and 30 after the first text or email, then every 30 days. ' + link('Open today\'s list', 'daily', {}) + '.', mood: 'calm' };
      var f = dc.late ? 'late' : 'due';
      return { html: '<b>' + dc.due + '</b> due today, <b>' + dc.late + '</b> overdue. Opening the inbox on ' + INBOX_LABEL[f] + '.', mood: dc.late ? 'alert' : 'excited', go: { screen: 'daily', params: { after: 'inbox:' + f } } };
    }
    /* Biggest storm this month: the storm map on it */
    if (has('this month', 'biggest this month', 'month s biggest')) {
      var b = biggestThisMonth();
      if (!b) return null;
      var sd = dayLabel(b.s.date);
      return { html: (b.thisMonth ? 'Biggest storm this month: ' : 'No hail this month. The biggest in ' + b.month + ': ') + '<b>' + sd + '</b>, <b>' + fmt(b.s.homes_1in || 0) + '</b> homes at 1 in or more, largest hail ' + (b.s.max_in || 0) + ' in on radar. ' + link('See it on the map', 'storm', { iso: b.s.date }) + '.', mood: 'alert', go: { screen: 'storm', params: { iso: b.s.date } } };
    }
    return null;
  }
  function answer(q) {
    var s = S(), f = F(), t = String(q || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    var has = function () { for (var i = 0; i < arguments.length; i++) if (t.indexOf(arguments[i]) !== -1) return true; return false; };
    var wantsOpen = has('open', 'show', 'go to', 'take me', 'bring up', 'pull up');
    var n = Math.min(50, called() + 1);
    if (!t) return { html: FALLBACK, mood: 'calm' };
    var act = actions(t, has, q); if (act) return act;

    if (has('next stop', 'who is next', 'whos next', 'next home', 'next call', 'next one') || t === 'next')
      return { html: 'Next stop is number <b>' + n + '</b> on today\'s list. ' + link('Open it', 'daily', { n: n }) + '.', mood: 'excited', go: { screen: 'daily', params: { n: n } } };

    // a year asked for ("last year", "this year", "in 2025", "ever"): the storm with the most homes at 1 in+ in it (10-22)
    var yr = /\blast year\b/.test(t) ? new Date().getFullYear() - 1 : /\bthis year\b/.test(t) ? new Date().getFullYear() : (/\b(20\d\d)\b/.exec(t) || [])[1];
    var ever = has('ever', 'all time', 'on file');
    if ((yr || ever) && has('storm', 'hail') && RC && RC.catalog && RC.catalog.storms) {
      var inY = RC.catalog.storms.filter(function (x) { return x.date && (ever || x.date.slice(0, 4) === String(yr)); });
      if (!inY.length) return { html: 'No storm with 1 in+ hail on a home here in ' + yr + '. ' + link('See every storm on the map', 'storm', {}) + '.', mood: 'calm' };
      var bs = inY.reduce(function (a2, b2) { return (b2.homes_1in || 0) > (a2.homes_1in || 0) ? b2 : a2; });
      return { html: 'Biggest storm ' + (ever ? 'on file' : 'in ' + yr) + ': <b>' + dayLabel(bs.date) + '</b>, <b>' + fmt(bs.homes_1in || 0) + '</b> homes at 1 in or more, largest hail ' + (bs.max_in || 0) + ' in on radar (' + inY.length + ' storm' + (inY.length === 1 ? '' : 's') + (ever ? ' on file' : ' that year') + '). ' + link('See it on the map', 'storm', { iso: bs.date }) + '.', mood: 'alert', go: wantsOpen ? { screen: 'storm', params: { iso: bs.date } } : null };
    }
    if (namesStorm(t, s) || has('last storm', 'latest storm', 'biggest storm', 'most homes', 'hit the most')) {
      var html = 'The <b>' + s.d + '</b> storm hit <b>' + fmt(s.homes) + '</b> homes at 1 in or more. Largest hail on radar was <b>' + s.max + ' in</b>. ' + link('See it on the map', 'storm', { iso: s.iso }) + '.';
      return { html: html, mood: 'alert', go: wantsOpen ? { screen: 'storm', params: { iso: s.iso } } : null };
    }

    if (has('storm map', 'the map', 'storms', 'hail map') || (wantsOpen && has('map', 'storm')))
      return { html: 'Opening the storm map. Every storm on the timeline, every home it touched.', mood: 'calm', go: { screen: 'storm', params: {} } };

    if (has('today', 'daily 50', 'my list', 'the list', 'call list', 'todays'))
      return { html: '<b>' + called() + ' of ' + queue() + '</b> reached today. The list is the homes most likely to say yes, with hail from every storm in the last 24 months; the newest is ' + s.d + '. ' + link('Open today\'s list', 'daily', {}) + '.', mood: 'excited', go: wantsOpen || has('list') ? { screen: 'daily', params: {} } : null };

    if (has('how far', 'progress', 'how many reached', 'texts today', 'reached today', 'have we texted', 'have i texted'))
      return { html: '<b>' + called() + ' of ' + queue() + '</b> reached today on this device. ' + link('Back to the list', 'daily', {}) + '.', mood: 'calm' };

    if (has('book', 'inspection', 'pipeline', 'proposal', 'won', 'appointments')) {
      var c = pipeCounts(), parts = [];
      if (c.called) parts.push(c.called + ' contacted');
      if (c.inspection) parts.push(c.inspection + ' inspection' + (c.inspection === 1 ? '' : 's') + ' booked');
      if (c.proposal) parts.push(c.proposal + ' at proposal');
      if (c.won) parts.push(c.won + ' won');
      if (!parts.length) return { html: 'Today\'s <b>' + queue() + '</b> homes are in New hit; none has moved on yet. A text, email or booking moves a home along. ' + link('Open today\'s list', 'daily', {}) + '.', mood: 'calm' };
      var nb = c.booked[0];
      return { html: 'On this device: <b>' + parts.join(', ') + '</b>.' + (nb ? ' Next inspection ' + RC.when(nb.at) + ' at ' + RC.esc(nb.addr) + ' (' + link('open the home', 'home', { id: nb.id }) + ').' : ''), mood: 'excited' };
    }

    if (has('how many homes', 'homes watched', 'homes do you', 'watching', 'counties', 'coverage', 'how big'))
      return { html: '<b>' + fmt(f.homes) + '</b> homes across <b>' + f.counties + '</b> counties. Last storm ' + s.d + ': ' + fmt(s.homes) + ' homes at 1 in or more.', mood: 'calm' };

    if (has('text', 'send', 'message', 'email', 'call them', 'call for me', 'dial'))
      return { html: 'No. Nothing here sends and nothing makes calls. Your team taps Text or Email on a home and sends it from their own phone or mail app, inside texting hours (' + RC.esc(RC.textWindow().label) + ').', mood: 'calm' };

    if (has('what is roof command', 'what is this', 'what does this do'))
      return { html: 'One place for every storm, every hit home and today\'s 50 best homes to text. Homes, addresses, hail at each home and roofs are real for the ' + F().counties + ' counties on the map; the <b>people</b> are samples.', mood: 'calm' };

    if (has('where does', 'data come', 'hail data', 'source', 'radar'))
      return { html: 'Radar hail at every home, matched to the county address. Homes, hail, roofs and permits are real; the people and phones are samples.', mood: 'calm' };

    if (has('dark house', 'dark home', 'darker'))
      return { html: 'A darker house means bigger hail at that address. Click any house on the map for its size, date and roof age.', mood: 'calm' };

    if (has('when should', 'best time', 'what time', 'pickup'))
      return { html: 'Texts go out ' + RC.esc(RC.textWindow().label) + ' (state law). ' + RC.esc(RC.textWindow().line) + ' Mornings are better for knocking.', mood: 'calm' };

    if (has('find ', 'address', 'look up', 'lookup', 'search')) {
      var addr = String(q || '').replace(/^\s*(find|look up|lookup|search( for)?)\s*/i, '').trim();
      return { html: (addr ? 'Looking for <b>' + RC.esc(addr) + '</b>. ' : '') + 'Address search lives on ' + link('today\'s list', 'daily', {}) + ' (the 50 queued for today) and the ' + link('storm map', 'storm', {}) + ' (every home watched). Pick one and type it there.', mood: 'calm' };
    }
    if (has('home', 'house', 'record')) {
      var ids = RC ? Object.keys(RC.pipeline()) : [];
      if (ids.length) return { html: 'The last home you touched is ' + link(RC.esc((RC.recall(ids[0]) || {}).addr || ids[0]), 'home', { id: ids[0] }) + '.', mood: 'calm', go: wantsOpen ? { screen: 'home', params: { id: ids[0] } } : null };
      return { html: 'Pick a home on the storm map or today\'s list and I will open its record: roof, storm and people. ' + link('Open today\'s list', 'daily', {}) + '.', mood: 'calm' };
    }

    if (has('hello', 'hi ', 'hey') || t === 'hi')
      return { html: (RC ? RC.greeting() : 'Hello') + ', ' + OWNER + '. Ask me about a storm, today\'s list or a home.', mood: 'excited' };

    return { html: FALLBACK, mood: 'alert', fallback: true };
  }

  /* what Nimbus says when you land on each screen: only things that are true in RC */
  function context(id) {
    var s = S(), f = F();
    if (id === 'storm') return { t: fmt(f.homes) + ' homes watched across ' + f.counties + ' counties. Last storm ' + s.d + ', ' + fmt(s.homes) + ' homes hit.', m: 'calm', k: 'Storms' };
    if (id === 'daily') return { t: called() + ' of ' + queue() + ' reached today. Newest storm ' + s.d + '.', m: 'excited', k: 'Today' };
    if (id === 'ask') return { t: 'Ask me about a storm, today\'s list or a home.', m: 'calm', k: 'Ask' };
    return null;
  }
  /* ---------- updates: short, true-right-now lines from the app's own data (RC, the catalog, today's route) ---------- */
  var SKIPK = 'rc.t.d50skip';
  function isToday(iso) { return iso && new Date(iso).toDateString() === new Date().toDateString(); }
  function skipMap() { try { return JSON.parse(localStorage.getItem(SKIPK)) || {}; } catch (e) { return {}; } }
  function calledTodayId(id) { return !!reachedIds()[id]; }
  function shortAddr(a) { return String(a || '').split(',')[0].trim(); }
  function dayLabel(iso) {
    var d = new Date(iso + 'T12:00:00Z'), y = d.getUTCFullYear();
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) + (y !== new Date().getFullYear() ? ', ' + y : '');
  }
  /* today's route as the deck stored it on this device (RC.remember from c4-command-deck); null until the deck has run */
  function routeToday() {
    if (!RC) return null;
    var key = RC.rooferKey(), first = RC.recall('d' + key + '-1');
    if (!first) return null;
    var q = RC.queue(), sk = skipMap(), skipped = 0, next = null;
    for (var n = 1; n <= q; n++) {
      var id = 'd' + key + '-' + n, h = RC.recall(id);
      if (!h) continue;
      var s = sk[id], skd = s && isToday(s.at), done = calledTodayId(id);   // 'done', not 'called': that name is the helper below
      if (skd && !done) skipped++;
      if (!next && !done && !skd && RC.stage(id) !== 'won') next = { n: n, id: id, addr: shortAddr(h.addr), hail: h.hail };
    }
    var left = Math.max(0, q - called() - skipped);
    return { total: q, left: left, next: next };
  }
  function latestStorm() {
    var c = RC && RC.catalog; if (!c || !c.storms || !c.storms.length) return null;
    var s = c.storms.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0];
    return s;
  }
  function updates() {
    var out = [];
    if (!RC) return out;
    /* texting hours (the roofer's own state window, RC.textWindow) */
    var w = RC.textWindow();
    out.push({ key: 'window', t: w.line, k: 'Sending hours', m: 'calm', go: { screen: 'daily', params: {} } });
    var r = routeToday();
    if (r) {
      out.push({ key: 'queue', t: r.left ? r.left + ' of ' + r.total + ' homes left on today\'s route.' : 'All ' + r.total + ' homes on today\'s route are done.', k: 'Today', m: r.left ? 'calm' : 'excited', go: { screen: 'daily', params: {} } });
      if (r.next) out.push({ key: 'next', t: r.next.addr + (r.next.hail != null ? ', ' + (+r.next.hail).toFixed(2) + ' in hail.' : '.'), k: 'Next stop', m: 'excited', go: { screen: 'daily', params: { n: r.next.n } } });
    }
    var c = pipeCounts();
    var todayB = c.booked.filter(function (b) { return isToday(b.at); });
    if (todayB.length === 1) out.push({ key: 'booked', t: 'Inspection today at ' + new Date(todayB[0].at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase() + ', ' + shortAddr(todayB[0].addr) + '.', k: 'Booked', m: 'excited', go: { screen: 'home', params: { id: todayB[0].id } } });
    else if (todayB.length > 1) out.push({ key: 'booked', t: todayB.length + ' inspections booked today. First at ' + new Date(todayB[0].at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase() + '.', k: 'Booked', m: 'excited', go: { screen: 'home', params: { id: todayB[0].id } } });
    var s = latestStorm();
    var quiet = s && (Date.now() - Date.parse(s.date + 'T12:00:00Z')) / 864e5 > 3;   // same reading as the storm map's 'No hail in the last 3 days'
    if (s) out.push({ key: 'storm', t: (quiet ? 'No hail in 3 days. Last: ' : 'Last hail: ') + dayLabel(s.date) + (s.homes_1in ? ', ' + fmt(s.homes_1in) + ' homes at 1 in+.' : ', largest ' + s.max_in + ' in on radar.'), k: 'Storms', m: 'calm', go: { screen: 'storm', params: { iso: s.date } } });
    return out;
  }

  /* the questions Nimbus offers on each screen */
  /* the four actions sit on every screen; chips answer from live data when tapped (ask() in setup), not from here */
  var ACTIONS = ['Draft today\'s texts', 'Who replied?', 'What\'s due today?', 'Biggest storm this month'];
  function chatFor(id) {
    var s = S();
    var all = {
      opening: { g: 'Hi, I am Nimbus. I watch the storms and the homes so your team knows where to knock.', q: ['What is Roof Command?', 'Do you text homeowners?'] },
      storm: { g: 'This is the storm map. Every storm on the timeline, every home it touched.', q: ['Which storm hit the most homes?', 'What does a dark house mean?'] },
      daily: { g: 'Your Daily 50: the best homes to text today, in route order.', q: ['How far along are we?', 'Who is next?'] },
      home: { g: 'Here is one home: the roof, the storm and the people.', q: ['How many homes did ' + s.d + ' hit?', 'What is booked?'] },
      ask: { g: 'Ask in plain words. I answer from the storms, the homes and your pipeline.', q: ['Show the ' + s.d + ' storm', 'Can you send messages for me?'] }
    };
    var c = all[id] || all.opening;
    /* each chip's answer is worked out when it is read (a tap), not here: this runs on every tab switch and every state
       change in any frame, and the six answers (the Daily 50 view among them) cost ~0.2 s of main thread each time (perf 10-15) */
    return { greeting: c.g, items: ACTIONS.concat(c.q).map(function (q) { return { q: q, get a() { return answer(q).html; } }; }) };
  }

  var hitBtn, dock, mascot, chat, chatOpts, bubbleEl, bubbleTxt, bubbleX, bubbleTimer, moodTimer, rotTimer, onGo, safeProbe;
  var screen = 'opening', arrived = false, upd = 0, pendingGo = null, hovering = false, dismissed = false, hiddenScreen = false;
  var lastSigs = null, shownOnce = false, holdUntil = 0;
  var ROTATE = 8000, PHONE_MS = 5000, ART = 1.8;
  function sizeArt(sz) {
    var R = Math.round(sz * ART), off = Math.round((sz - R) / 2);
    mascot.el.style.width = mascot.el.style.height = R + 'px';
    mascot.el.style.position = 'absolute';
    mascot.el.style.left = off + 'px';
    mascot.el.style.top = (off + Math.round(R * 0.02)) + 'px';   // the orb's centre sits 2% above the box centre
  }

  function chatOpen() { return chat && chat.el.classList.contains('open'); }

  /* ---------- the Ask panel (product shell only): the Ask Nimbus page in a panel by the orb ---------- */
  var SHELL = !!document.getElementById('f');   // product.html's frame stage; a page opened on its own has none
  var askEl = null, askFrame = null;
  function askOpen() { return !!(askEl && askEl.classList.contains('open')); }
  function buildAsk() {
    askEl = document.createElement('section');
    askEl.className = 'nb-ask'; askEl.setAttribute('role', 'dialog'); askEl.setAttribute('aria-label', 'Ask Nimbus'); askEl.setAttribute('aria-hidden', 'true');
    askEl.innerHTML = '<div class="nb-ask-h"><b>Ask Nimbus</b><span>Storms, homes and your pipeline, in plain words</span>' +
      '<button type="button" class="nb-ask-x" aria-label="Close Ask Nimbus">×</button></div>';
    askFrame = document.createElement('iframe');
    askFrame.className = 'nb-ask-f'; askFrame.title = 'Ask Nimbus'; askFrame.setAttribute('loading', 'eager');
    askEl.appendChild(askFrame);
    document.body.appendChild(askEl);
    askEl.querySelector('.nb-ask-x').addEventListener('click', function () { toggleAsk(false); });
  }
  var ASK_URL = function (q) { return new URL('c2-nimbus/index.html?panel=1' + (q ? '&q=' + encodeURIComponent(q) : ''), location.href).href; };
  /* warm: the shell loads the Ask page hidden under the opening (product.html startLoading); returns the iframe to poll */
  function warmAsk() {
    if (!askEl) buildAsk();
    if (!askFrame.getAttribute('src')) {
      askFrame.src = ASK_URL('');
      /* once its first view has drawn (or 10 s), a warmed panel that is still closed parks like a screen (lib/rc-frame-pause.js) */
      var t0 = Date.now(), park = function () {
        var w = null; try { w = askFrame.contentWindow; } catch (e) {}
        if (!(w && w.__ready) && Date.now() - t0 < 10000) return setTimeout(park, 250);
        if (!askOpen()) { try { w.postMessage({ type: 'visibility', hidden: true }, location.origin); } catch (e) {} }
      };
      askFrame.addEventListener('load', function () { setTimeout(park, 250); }, { once: true });
    }
    return askFrame;
  }
  function toggleAsk(force, q) {
    if (!askEl) buildAsk();
    var open = force != null ? !!force : !askOpen();
    if (open && !askFrame.getAttribute('src')) askFrame.src = ASK_URL(q);
    else if (open && q) { try { askFrame.contentWindow.postMessage({ type: 'ask', q: q }, location.origin); } catch (e) {} }
    askEl.classList.toggle('open', open);
    askEl.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (askFrame.getAttribute('src')) { try { askFrame.contentWindow.postMessage({ type: 'visibility', hidden: !open }, location.origin); } catch (e) {} }   /* closed = its map stops drawing (lib/rc-frame-pause.js) */
    if (hitBtn) hitBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('nb-ask-on', open);
    if (open) { hide(); clearTimeout(rotTimer); placeAsk(); if (mascot) mascot.flare(); setTimeout(function () { try { askFrame.contentWindow.focus(); } catch (e) {} }, 60); }
    else { scheduleRotate(); if (hitBtn) hitBtn.focus(); }
  }
  function placeAsk() {
    if (!askEl || !orbBox) return;
    var st = askEl.style, hb = document.querySelector('header') ? document.querySelector('header').getBoundingClientRect().bottom : 0;
    st.left = st.top = st.right = st.bottom = st.width = st.height = '';
    if (isPhone()) {
      var vv = window.visualViewport, vh = vv ? vv.height : innerHeight;
      askEl.classList.add('sheet');
      st.left = '0px'; st.right = '0px'; st.bottom = '0px'; st.height = Math.round(vh * 0.86) + 'px';
    } else {
      askEl.classList.remove('sheet');
      st.right = Math.max(12, innerWidth - orbBox.right) + 'px';
      st.bottom = (innerHeight - orbBox.top + 12) + 'px';
      st.width = Math.min(480, innerWidth - 32) + 'px';
      st.height = Math.max(360, Math.min(780, orbBox.top - 12 - hb - 12)) + 'px';
    }
  }
  addEventListener('keydown', function (e) { if (e.key === 'Escape' && askOpen()) toggleAsk(false); });
  function isPhone() { return innerWidth <= 599 || document.body.classList.contains('nb-phone'); }
  function orbSize() { return isPhone() ? 52 : 64; }   // 10-09: smaller (Jack); the hit button is the whole box, over 44px
  function gap() { return isPhone() ? 20 : 24; }

  function setup() {
    dock = document.createElement('div');
    dock.className = 'nb-dock';
    document.body.appendChild(dock);
    var sz = orbSize();
    dock.style.width = dock.style.height = sz + 'px';
    /* the mascot's art fills about 55% of its box (glow around it), so the box is drawn larger than the orb and
       centred on it; a round native button the size of the orb takes the clicks and the keyboard */
    mascot = WingMascot.mount(dock, { size: Math.round(sz * ART), intro: true });
    mascot.el.setAttribute('tabindex', '-1');
    mascot.el.setAttribute('aria-hidden', 'true');
    mascot.el.removeAttribute('role');
    sizeArt(sz);
    hitBtn = document.createElement('button');
    hitBtn.type = 'button'; hitBtn.className = 'nb-hit';
    hitBtn.setAttribute('aria-label', 'Nimbus: open the assistant');
    hitBtn.setAttribute('aria-haspopup', 'dialog');
    hitBtn.setAttribute('aria-expanded', 'false');
    /* in the product shell the orb opens the full Ask Nimbus experience (c2-nimbus: the eight question types, chips, streets map)
       as a panel above him, a bottom sheet on a phone; elsewhere (a page opened on its own) the small chat */
    hitBtn.addEventListener('click', function () { if (SHELL) toggleAsk(); else mascot.el.click(); });
    hitBtn.addEventListener('mouseenter', function () { mascot.el.classList.add('wm-excited'); });
    hitBtn.addEventListener('mouseleave', function () { mascot.el.classList.remove('wm-excited'); });
    dock.appendChild(hitBtn);
    if (WingMascot.autoMood) { try { WingMascot.autoMood(mascot); } catch (e) {} }
    var c0 = chatFor('opening');
    chatOpts = { greeting: c0.greeting, items: c0.items, kb: [{ k: ['__rc__'], a: '' }], fallback: FALLBACK };
    chat = WingMascot.chat(mascot, chatOpts);
    /* the real input: swap the library's keyword box for the RC brain */
    var ask = chat.el.querySelector('.wmp-ask');
    var input = ask.querySelector('input'), btn = ask.querySelector('button');
    var ni = input.cloneNode(true), nb = btn.cloneNode(true);
    ni.placeholder = 'Ask about a storm, today\'s list or a home';
    input.replaceWith(ni); btn.replaceWith(nb);
    /* one path for a typed question and a tapped chip: answered from the data as it is right now, then the screen it implies */
    function askNimbus(q) {   // not 'ask': that is the panel's input row above
      var r = answer(q);
      mascot.flare();
      chat.say(r.html);
      mood(r.mood || 'calm', 3000);
      if (r.go) { pendingGo = r.go; setTimeout(function () { if (pendingGo === r.go) { pendingGo = null; runGo(r.go.screen, r.go.params); } }, 900); }
    }
    function submit() { var q = ni.value.trim(); if (!q) return; ni.value = ''; askNimbus(q); }
    nb.addEventListener('click', submit);
    ni.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    /* chips: the library would replay the answer it was built with; take the tap first and answer live */
    chat.el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.wmp-q button');
      if (!b) return; e.stopPropagation(); e.preventDefault();
      askNimbus(b.textContent);
    }, true);
    chat.el.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[data-go]');
      if (!a) return; e.preventDefault();
      var p = {}; try { p = JSON.parse(a.getAttribute('data-params') || '{}'); } catch (err) {}
      runGo(a.getAttribute('data-go'), p);
    });
    var foot = document.createElement('div');
    foot.className = 'nb-foot';
    foot.textContent = 'Homes, hail and roofs are real. People, phones and messages are sample.';
    chat.el.appendChild(foot);
    /* the library toggles the chat on the orb's click; the bubble steps aside and the panel is placed by the orb */
    mascot.el.addEventListener('click', function () { hide(); setTimeout(function () { place(); syncChat(); }, 0); });
    new MutationObserver(syncChat).observe(chat.el, { attributes: true, attributeFilter: ['class'] });

    /* the update bubble: text (a link when it has somewhere to go) + a dismiss button */
    bubbleEl = document.createElement('div');
    bubbleEl.className = 'nb-bubble';
    bubbleEl.setAttribute('role', 'status');
    bubbleEl.setAttribute('aria-live', 'polite');
    bubbleTxt = document.createElement('button');
    bubbleTxt.type = 'button'; bubbleTxt.className = 'nb-txt';
    bubbleX = document.createElement('button');
    bubbleX.type = 'button'; bubbleX.className = 'nb-x'; bubbleX.setAttribute('aria-label', 'Dismiss Nimbus updates'); bubbleX.textContent = '×';
    bubbleEl.appendChild(bubbleTxt); bubbleEl.appendChild(bubbleX);
    bubbleTxt.addEventListener('click', function () { var g = bubbleEl._go; hide(); if (g) runGo(g.screen, g.params); scheduleRotate(); });
    bubbleX.addEventListener('click', function () { dismissed = true; hide(); clearTimeout(rotTimer); });
    [bubbleEl, dock].forEach(function (el) {
      el.addEventListener('mouseenter', function () { hovering = true; clearTimeout(rotTimer); clearTimeout(bubbleTimer); });
      el.addEventListener('mouseleave', function () { hovering = false; if (bubbleEl.classList.contains('on')) scheduleRotate(); });
    });
    bubbleEl.addEventListener('focusin', function () { hovering = true; clearTimeout(rotTimer); clearTimeout(bubbleTimer); });
    bubbleEl.addEventListener('focusout', function () { hovering = false; scheduleRotate(); });
    document.body.appendChild(bubbleEl);

    safeProbe = document.createElement('div');
    safeProbe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom,0px)';
    document.body.appendChild(safeProbe);

    addEventListener('resize', place);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', place);   // the keyboard: keep the chat input in view
    setInterval(function () { if (arrived && !document.hidden) place(); }, 700);   // a dialog or sheet opens or closes under him: step out, come back to the corner
    if (RC) RC.on(function () { if (!chatOpen()) { var c = chatFor(screen); chatOpts.greeting = c.greeting; chatOpts.items = c.items; } checkEvents(); });
    setInterval(checkEvents, 60000);   // texting hours open and close on the clock
  }

  /* ---------- going somewhere with a follow-through: params.after = 'text' (open the stop's text draft) or
     'inbox:<all|due|late|reply>' (the Today inbox on that filter). The Today screen keeps its tab and filter in
     localStorage (rc.todayTab, rc.inboxFilter), so a cold load lands right; a frame already open is tapped through. */
  var keepAnswer = 0;   // a screen change Nimbus himself caused keeps his answer on show instead of re-greeting
  function runGo(screen, params) {
    params = params || {};
    keepAnswer = Date.now() + 4000;
    var after = params.after || '';
    if (after.indexOf('inbox:') === 0) { try { localStorage.setItem('rc.todayTab', 'inbox'); localStorage.setItem('rc.inboxFilter', after.slice(6)); } catch (e) {} }
    if (onGo) onGo(screen, params);
    if (after && screen === 'daily') afterGo(after);
  }
  function afterGo(after) {
    var t0 = Date.now(), tries = 0;
    var tick = function () {
      var doc = null; try { var fr = document.querySelector('#f iframe[data-screen="daily"]'); doc = fr && fr.contentDocument; } catch (e) {}
      var done = false;
      if (doc && doc.body) {
        if (after.indexOf('inbox:') === 0) {
          var tab = doc.getElementById('tabInbox'), f = doc.querySelector('#paneInbox [data-f="' + after.slice(6) + '"]');
          if (tab && f) { if (tab.getAttribute('aria-selected') !== 'true') tab.click(); if (f.getAttribute('aria-pressed') !== 'true') f.click(); done = true; }
        } else if (after === 'text') {
          /* the Text button of the card on top (the stop just routed to), only once that card is the one on show */
          var card = doc.querySelector('.card[data-d="0"]'), b = card && card.querySelector('[data-a="text"]');
          if (b && !b.disabled && b.offsetParent && !doc.querySelector('dialog[open]')) { b.click(); done = true; }
        }
      }
      if (!done && ++tries < 40 && Date.now() - t0 < 6000) setTimeout(tick, 150);
    };
    setTimeout(tick, 350);
  }
  /* a screen inside the shell asking to go (the Ask page's RC.go posts {type:'go'}): the shell routes it, the follow-through runs here */
  addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'go' || !document.getElementById('f')) return;
    var p = e.data.params || {}; if (p.after && e.data.screen === 'daily') { if (p.after.indexOf('inbox:') === 0) { try { localStorage.setItem('rc.todayTab', 'inbox'); localStorage.setItem('rc.inboxFilter', p.after.slice(6)); } catch (err) {} } afterGo(p.after); }
  });

  /* ---------- where he sits: the bottom-right corner, 24px in (20px on a phone), always. The obstacle maps below are
     used only by the update BUBBLE (so a line of news does not sit on a button); the orb itself never dodges. ---------- */
  var SEL_BLOCKS = '.act,.acts,.stick,#mnext .go,.peek,.dock,.wmp-ask,.mleg,.hqm,.maplibregl-ctrl-group,.maplibregl-ctrl-attrib,.maplibregl-ctrl-scale';   // action bars, then the map's legend and controls
  var SEL_HIT = 'a[href],button,input,select,textarea,[role="button"],[data-a],[data-act]';
  var SEL_ROWS = '.cfg > div,.kv > div,.crow,.card .facts > div,.fact,.st,.pcard,.qrow';
  function visible(el, win) {
    var cs = win.getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05 && cs.pointerEvents !== 'none';
  }
  /* the part of an element you can see: cut by every scrolling or clipping box it sits in (a board column, a list),
     so a card scrolled out of its column is not in the way. A fixed box (a sheet, a bar) ends the walk. */
  function seenRect(el, win, cache) {
    var r = el.getBoundingClientRect(), l = r.left, t = r.top, rr = r.right, b = r.bottom;
    if (win.getComputedStyle(el).position === 'fixed') return r;
    var d = el.ownerDocument, p = el.parentElement;
    while (p && p !== d.body && p !== d.documentElement) {
      var c = cache.get(p);
      if (c === undefined) {
        var cs = win.getComputedStyle(p);
        c = { clip: cs.overflowX !== 'visible' || cs.overflowY !== 'visible' ? p.getBoundingClientRect() : null, fixed: cs.position === 'fixed' };
        cache.set(p, c);
      }
      if (c.clip) { l = Math.max(l, c.clip.left); t = Math.max(t, c.clip.top); rr = Math.min(rr, c.clip.right); b = Math.min(b, c.clip.bottom); }
      if (rr - l < 4 || b - t < 4) return null;
      if (c.fixed) break;
      p = p.parentElement;
    }
    return { left: l, top: t, right: rr, bottom: b, width: rr - l, height: b - t, full: r.width * r.height };
  }
  /* the active screen's document and where its frame sits in this window */
  function screenFrame() {
    var fr = document.querySelector('#f .frame.on');
    if (fr) { try { return fr.contentDocument && fr.contentDocument.body ? { doc: fr.contentDocument, win: fr.contentWindow, fb: fr.getBoundingClientRect() } : null; } catch (e) { return null; } }
    if (document.getElementById('f')) return null;   // the shell with no screen on show yet
    return { doc: document, win: window, fb: { top: 0, left: 0, right: innerWidth, bottom: innerHeight, width: innerWidth, height: innerHeight } };   // a screen opened on its own
  }
  function collect(sf, sel, isBar, out, cache) {
    var doc = sf.doc, win = sf.win, fb = sf.fb, area = fb.width * fb.height;
    doc.querySelectorAll(sel).forEach(function (el) {
      if (doc === document && el.closest('.nb-dock,.nb-bubble,.wmp')) return;
      var r0 = el.getBoundingClientRect();
      if (r0.width < 4 || r0.height < 4 || r0.width * r0.height > area * 0.4) return;
      var r = seenRect(el, win, cache); if (!r) return;
      var t = r.top + fb.top, b = r.bottom + fb.top, l = r.left + fb.left, rr = r.right + fb.left;
      if (b <= fb.top || t >= fb.bottom || rr <= fb.left || l >= fb.right) return;
      if (!visible(el, win)) return;
      out.push({ top: Math.max(t, fb.top), bottom: Math.min(b, fb.bottom), left: Math.max(l, fb.left), right: Math.min(rr, fb.right), el: el, bar: isBar });
    });
    return out;
  }
  /* rects of the active screen's buttons and action bars, in this window's coordinates */
  function obstacles(cache) {
    var out = [], sf = screenFrame(); if (!sf) return out;
    cache = cache || new Map();
    collect(sf, SEL_BLOCKS, true, out, cache);
    collect(sf, SEL_HIT, false, out, cache);
    return collect(sf, SEL_ROWS, false, out, cache);   // fact and contact rows, list rows, street cards: content he must not sit on
  }
  /* the active screen's documents: the shell and the frame on show (or the page itself when there is no shell) */
  function screenDocs() {
    var out = [document], fr = document.querySelector('#f .frame.on');
    if (fr) { try { if (fr.contentDocument) out.push(fr.contentDocument); } catch (e) {} }
    return out;
  }
  /* a dialog or sheet is open on the screen (Book, Messages, a phone sheet): no bubble over it */
  var SEL_MODAL = 'dialog[open],.sheet.open,.rsheet.open,.psheet.open,[aria-modal="true"]';
  function modalOpen() {
    return screenDocs().some(function (d) {
      var els = d.querySelectorAll(SEL_MODAL), win = d.defaultView || window;
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (d === document && el.closest('.wmp,.nb-dock,.nb-bubble')) continue;
        var r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        var cs = win.getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) continue;
        return true;
      }
      return false;
    });
  }
  /* what the bubble must not cover: the buttons and bars above, plus the screen's cards and list rows */
  var SEL_CARDS = 'article,.card,.pc,.qrow,.stc,[data-id],p,h1,h2,h3,li';   /* sentences too: the bubble never sits on text the roofer is reading (phone sheet, 10-15) */
  function bubbleObstacles() {
    var cache = new Map(), obs = obstacles(cache), sf = screenFrame();
    return sf ? collect(sf, SEL_CARDS, false, obs, cache) : obs;
  }
  function overlapCost(box, obs) {
    var a = 0;
    obs.forEach(function (o) {
      var w = Math.min(box.right, o.right) - Math.max(box.left, o.left), h = Math.min(box.bottom, o.bottom) - Math.max(box.top, o.top);
      if (w > 0 && h > 0) a += w * h / Math.max(1, (o.right - o.left) * (o.bottom - o.top));   // share of that control he would cover
    });
    return a;
  }
  function hits(box, obs, pad) {
    pad = pad || 8;
    return obs.filter(function (o) { return o.left < box.right + pad && o.right > box.left - pad && o.top < box.bottom + pad && o.bottom > box.top - pad; });
  }
  function anchorBox() {
    if (document.body.classList.contains('nb-phone')) { var r = document.getElementById('f').getBoundingClientRect(); return { right: r.right, bottom: r.bottom, left: r.left, top: r.top }; }
    var vv = window.visualViewport;
    return { right: innerWidth, bottom: vv ? Math.min(innerHeight, vv.height + vv.offsetTop) : innerHeight, left: 0, top: 0 };
  }
  var orbBox = null;
  /* the shell's own bottom nav bar, when it has one (a nav fixed to the bottom of the window): he sits just above it so he
     never covers navigation. The shell's nav lives in the header today, so this returns 0; it is here for a phone bar. */
  function shellBottomBar(a) {
    var nav = document.querySelector('body > nav, header ~ nav, nav#nav');
    if (!nav) return 0;
    var cs = getComputedStyle(nav), r = nav.getBoundingClientRect();
    if (cs.position !== 'fixed' || r.height < 4 || r.bottom < a.bottom - 4) return 0;
    return a.bottom - r.top;
  }
  /* phone only: a screen's own full-width bottom bar (Today's Inbox / Map / Pipeline peek bar, the CRM record's fixed
     Text / Email / Book bar) is the screen's nav, so he sits just above it. Only a bar that spans the width and sits on the
     bottom edge counts; a dot, a button or a row never lifts him. */
  var SEL_BAR = '.peek,.stick,.tabbar,nav.bottom,[data-bottom-bar]';
  function phoneBottomBar(a) {
    if (!isPhone()) return 0;
    var sf = screenFrame(); if (!sf) return 0;
    var lift = 0;
    sf.doc.querySelectorAll(SEL_BAR).forEach(function (el) {
      if (!visible(el, sf.win)) return;
      var r = el.getBoundingClientRect(), b = r.bottom + sf.fb.top;
      if (r.width < sf.fb.width * 0.7 || r.height < 4 || Math.abs(b - sf.fb.bottom) > 6) return;
      lift = Math.max(lift, Math.min(120, sf.fb.bottom - (r.top + sf.fb.top)));
    });
    return lift;
  }
  /* Jack (10-10): Nimbus ALWAYS sits in the bottom-right corner. No dodging rows or buttons, no header docking, no drift
     toward the middle. He may cover something unimportant. The only things that move him: the safe-area inset and a
     full-width bottom nav bar on a phone (he sits just above it). He steps out while a dialog or sheet is open and comes
     back to the same corner. */
  function place() {
    if (!dock) return;
    var size = orbSize();
    if (dock.offsetWidth !== size) { dock.style.width = dock.style.height = size + 'px'; sizeArt(size); }
    var a = anchorBox(), safe = safeProbe ? parseFloat(getComputedStyle(safeProbe).paddingBottom) || 0 : 0;
    var g = gap(), right = a.right - g, bar = shellBottomBar(a) || phoneBottomBar(a), bottom = a.bottom - (bar ? bar + 8 : g + safe);
    var tuck = !hiddenScreen && modalOpen();   // a dialog or sheet is open (Text, Email, Book, a phone sheet): he steps out until it closes
    dock.classList.toggle('tuck', tuck);
    hitBtn.tabIndex = tuck ? -1 : 0;
    dock.style.left = (right - size) + 'px';
    dock.style.top = (bottom - size) + 'px';
    orbBox = { left: right - size, right: right, top: bottom - size, bottom: bottom, size: size };
    placeChat();
    placeAsk();
    fitBubble();
  }
  function placeChat() {
    if (!chat || !orbBox) return;
    var st = chat.el.style, hb = document.querySelector('header') ? document.querySelector('header').getBoundingClientRect().bottom : 0;
    st.left = st.top = st.right = st.bottom = '';
    if (isPhone() && !document.body.classList.contains('nb-phone')) {
      document.body.classList.add('nb-sheet');
      st.left = '0px'; st.right = '0px'; st.bottom = '0px'; st.top = 'auto';
      st.setProperty('width', 'auto', 'important');
      var vv = window.visualViewport, vh = vv ? vv.height : innerHeight;
      st.setProperty('max-height', Math.round(vh * 0.82) + 'px', 'important');
    } else {
      document.body.classList.remove('nb-sheet');
      var w = Math.min(360, innerWidth - 32);
      st.right = Math.max(12, innerWidth - orbBox.right) + 'px';
      st.bottom = (innerHeight - orbBox.top + 12) + 'px';
      st.left = 'auto'; st.top = 'auto';
      st.setProperty('width', w + 'px', 'important');
      st.setProperty('max-height', Math.max(260, orbBox.top - 12 - hb - 12) + 'px', 'important');
    }
  }
  function syncChat() {
    var open = chatOpen();
    hitBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open && document.activeElement && chat.el.contains(document.activeElement)) hitBtn.focus();
    document.body.classList.toggle('nb-chat-on', open);
    if (open) { hide(); clearTimeout(rotTimer); placeChat(); }
    else scheduleRotate();
  }
  /* the bubble sits to his left; if that would cover a button, above him; never wider than the room there */
  function placeBubble(obs) {
    if (!bubbleEl || !orbBox) return true;
    var b = bubbleEl.style, a = anchorBox();
    var maxW = Math.max(160, Math.min(320, orbBox.left - a.left - 12 - 16));
    b.maxWidth = maxW + 'px';
    b.left = 'auto'; b.top = 'auto';
    var bw = bubbleEl.offsetWidth || maxW, bh = bubbleEl.offsetHeight || 48;
    var side = { right: innerWidth - orbBox.left + 10, bottom: innerHeight - orbBox.bottom + Math.max(0, (orbBox.size - bh) / 2) };
    var sideBox = { left: orbBox.left - 10 - bw, right: orbBox.left - 10, bottom: innerHeight - side.bottom, top: innerHeight - side.bottom - bh };
    /* try: to his left; above him; then to his left, stepped up past whatever is there (legend, map controls, buttons) */
    var aboveW = Math.min(320, innerWidth - 32);
    var aboveBox = { right: orbBox.right, left: orbBox.right - Math.min(bw, aboveW), bottom: orbBox.top - 10, top: orbBox.top - 10 - bh };
    var pick = null, top0 = Math.max(80, (document.querySelector('header') ? document.querySelector('header').getBoundingClientRect().bottom : 0) + 8);
    var fits = function (bx) { return bx.left >= a.left + 8 && bx.top >= top0 && !hits(bx, obs, 6).length; };
    /* desktop (Jack 10-17): the line sits beside him, level with the orb, never floating up over the screen above a bar.
       If buttons or a bar are in that spot he keeps the news to himself (the chat still has it); plain text or a card
       under the spot does not move him. */
    if (!isPhone()) {
      var blockers = obs ? hits(sideBox, obs, 6).filter(function (o) { return o.bar || (o.el && o.el.matches && o.el.matches(SEL_HIT)); }) : [];
      if (!obs || (fits(sideBox) || !blockers.length) && sideBox.left >= a.left + 8) pick = { right: side.right, bottom: side.bottom, above: false };
      if (!pick) return false;
      bubbleEl.classList.remove('above');
      b.right = pick.right + 'px'; b.bottom = pick.bottom + 'px';
      return true;
    }
    if (!obs || fits(sideBox)) pick = { right: side.right, bottom: side.bottom, above: false };
    else if (fits(aboveBox)) pick = { right: innerWidth - orbBox.right, bottom: innerHeight - aboveBox.bottom, above: true, w: aboveW };
    else {
      var bx = { left: sideBox.left, right: sideBox.right, top: sideBox.top, bottom: sideBox.bottom };
      for (var i = 0; i < 8; i++) {
        var hh = hits(bx, obs, 6); if (!hh.length) break;
        var mt = Math.min.apply(null, hh.map(function (o) { return o.top; }));
        bx.bottom = mt - 10; bx.top = bx.bottom - bh;
      }
      if (fits(bx) && bx.top >= orbBox.top - 140) pick = { right: side.right, bottom: innerHeight - bx.bottom, above: true };   // never climbs far from him over the screen
    }
    /* nowhere clear of the screen's buttons and cards: he keeps the news to himself (the chat still has it) */
    if (!pick) return false;
    bubbleEl.classList.toggle('above', !!pick.above);
    b.right = pick.right + 'px'; b.bottom = pick.bottom + 'px';
    if (pick.w) b.maxWidth = pick.w + 'px';
    return true;
  }
  /* the bubble only stays while it has a clear spot and no dialog or sheet is open */
  function fitBubble() {
    if (!bubbleEl || !bubbleEl.classList.contains('on') && !document.body.classList.contains('nb-bubble-on')) return;
    if (chatOpen()) return;
    if (modalOpen() || !placeBubble(bubbleObstacles())) { hide(); scheduleRotate(); }
  }

  function mood(m, ms) {
    clearTimeout(moodTimer);
    mascot.setState(m);
    if (m === 'party' && !reduced) mascot.flare();
    moodTimer = setTimeout(function () { mascot.setState('calm'); }, ms || 4000);
  }
  function hide() {
    clearTimeout(bubbleTimer);
    if (bubbleEl) { bubbleEl.classList.remove('on'); bubbleEl._go = null; bubbleEl._key = null; }
    document.body.classList.remove('nb-bubble-on');
  }
  /* one bubble at a time: a new one replaces the old. ms = how long it stays when nothing rotates it away */
  function say(item, ms) {
    if (!arrived || !item || chatOpen() || hiddenScreen) return;
    if (modalOpen()) { hide(); return; }   // a dialog or sheet is open: the news waits
    clearTimeout(bubbleTimer);
    bubbleTxt.textContent = '';
    var label = document.createElement('small');
    label.textContent = item.k || 'Nimbus';
    var txt = document.createElement('span');
    txt.textContent = item.t;
    bubbleTxt.appendChild(label); bubbleTxt.appendChild(txt);
    bubbleTxt.setAttribute('aria-label', (item.k ? item.k + ': ' : '') + item.t + (item.go ? ' Open.' : ''));
    bubbleEl.classList.toggle('alert', item.m === 'alert');
    bubbleEl.classList.toggle('link', !!item.go);
    bubbleTxt.disabled = false;
    bubbleEl._go = item.go || null;
    bubbleEl._key = item.key || null;
    place();
    if (!placeBubble(bubbleObstacles())) { hide(); return; }   // no clear spot on this screen right now
    document.body.classList.add('nb-bubble-on');
    requestAnimationFrame(function () { bubbleEl.classList.add('on'); fitBubble(); });
    mood(item.m || 'calm', 3500);
    shownOnce = true;
    if (ms) { holdUntil = Date.now() + ms; bubbleTimer = setTimeout(function () { if (!hovering) { hide(); scheduleRotate(); } }, ms); }
  }

  /* desktop: rotate every 8 s while visible. Phone: one, then only on new events. Paused on hover, stopped by the x. */
  function rotate() {
    if (!arrived || dismissed || hovering || chatOpen() || hiddenScreen || document.hidden) return scheduleRotate();
    if (Date.now() < holdUntil) return scheduleRotate();
    var list = updates();
    if (!list.length) { hide(); return; }
    if (isPhone()) {
      if (shownOnce) { hide(); return; }
      say(list[0], PHONE_MS);
      return;
    }
    var it = list[upd % list.length]; upd++;
    say(it, 0);
    scheduleRotate();
  }
  function scheduleRotate(ms) {
    clearTimeout(rotTimer);
    if (dismissed || !arrived) return;
    if (isPhone() && shownOnce) return;
    rotTimer = setTimeout(rotate, ms || ROTATE);
  }
  /* a new event (a text sent, a stop done, a booking, the window opening) shows once, even on a phone or after the x */
  function sigs() { var m = {}; updates().forEach(function (u) { m[u.key] = u; }); return m; }
  function checkEvents() {
    if (!arrived) return;
    var now = sigs();
    if (!lastSigs) { lastSigs = now; return; }
    var fresh = null;
    ['booked', 'next', 'queue', 'window', 'storm'].forEach(function (k) { if (!fresh && now[k] && (!lastSigs[k] || lastSigs[k].t !== now[k].t)) fresh = now[k]; });
    lastSigs = now;
    if (!fresh || chatOpen() || hiddenScreen) return;
    say(fresh, isPhone() ? PHONE_MS : ROTATE);
  }

  function arrive(greet) {
    if (arrived && !hiddenScreen) return;
    var first = !arrived;
    arrived = true; hiddenScreen = false;
    place();
    dock.classList.add('in');
    if (!first) { scheduleRotate(2000); return; }
    if (!reduced) setTimeout(function () { mascot.flare(); }, 300);
    if (greet) say(typeof greet === 'string' ? { t: greet, m: 'excited', k: 'Nimbus' } : greet, greet.ms || 7000);
    var startUpd = function () { lastSigs = sigs(); scheduleRotate(2000); };
    if (RC && RC.factsReady) RC.factsReady.then(startUpd, startUpd); else startUpd();
  }
  /* the opening is his own show: the orb and bubble step away until it hands off */
  function hideAll() { hiddenScreen = true; hide(); clearTimeout(rotTimer); if (dock) dock.classList.remove('in'); if (chatOpen()) chat.toggle(false); if (askOpen()) toggleAsk(false); }

  function setScreen(id, quiet) {
    if (askOpen() && id !== screen) toggleAsk(false);   // an answer in the Ask panel opened a screen: the panel steps aside
    screen = id;
    var c = chatFor(id);
    chatOpts.greeting = c.greeting;
    chatOpts.items = c.items;
    if (chatOpen() && Date.now() > keepAnswer) chat.toggle(true);   // a screen he opened from an answer keeps that answer
    if (!arrived || quiet) return;
    setTimeout(place, 450);   // the new screen may have a sheet open: step out or come back
  }

  /* the morning brief, one line, after the opening */
  function brief() {
    var s = S();
    return { t: (RC ? RC.greeting() : 'Good morning') + ', ' + OWNER + '. ' + called() + ' of ' + queue() + ' reached. Newest storm ' + s.d + '.', m: 'excited', k: 'Today', go: { screen: 'daily', params: {} }, ms: 8000 };
  }

  addEventListener('keydown', function (e) { if (e.key === 'Escape' && bubbleEl && bubbleEl.classList.contains('on')) { hide(); scheduleRotate(); } });

  window.Nimbus = {
    init: function (opts) { onGo = opts && opts.go; setup(); place(); },
    answer: answer, chatFor: chatFor, context: context, updates: updates, brief: brief, pipeCounts: pipeCounts, run: runGo,
    actions: { replied: repliedList, due: dueCounts, biggestThisMonth: biggestThisMonth, nextDraft: nextDraft, list: ACTIONS },
    arrive: arrive, setScreen: setScreen, place: place, say: say, check: say, hide: hide, hideAll: hideAll,
    ask: toggleAsk, askOpen: askOpen, warm: warmAsk,
    obstacles: obstacles, get orb() { return orbBox; },
    get mascot() { return mascot; }, get chat() { return chat; },
    isArrived: function () { return arrived && !hiddenScreen; }
  };
})();
