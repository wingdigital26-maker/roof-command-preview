/* nimbus-truck.js: truck mode (Jack 10-26), a hands-free route screen for a rep between doors. Phone first.
   One stop at a time from Today's list (the Today frame's RC.daily, lib/rc-queue.js), big text, and Nimbus reads the stop in one
   sentence: "Next: 1208 Lassen Lane, built 1991, inch and a half hail, no new roof since 2015."
   The rep taps or says: "knocked, no answer" / "talked, book Thursday at 2" / "not interested" / "skip" / "next" / "text them" /
   "directions" / "repeat" / "exit". Directions open the phone's own maps app. The screen stays awake (Wake Lock).
   Every write goes through lib/nimbus-tools.js (same Undo, same history lines as the record's At the door buttons). Nothing sends:
   "text them" opens the filled text on Today and a person taps Send. Plain script, shell only. window.NimbusTruck. */
(function () {
  'use strict';
  if (window.NimbusTruck || !window.NimbusTools) return;
  const RC = window.RC, Tools = window.NimbusTools, DAY = 864e5;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const esc = RC.esc, short = a => String(a || '').split(',')[0].trim();
  const isToday = iso => iso && new Date(iso).toDateString() === new Date().toDateString();
  let root = null, list = [], at = 0, lock = null, rec = null, listening = false, lastSay = '', hidden = false;

  // ---------- the route: Today's list, minus what is done today on this device ----------
  function doneToday(id) {
    const sk = (RC.__get('d50skip', {}) || {})[id];
    if (sk && isToday(sk.at)) return true;
    const p = RC.pipeline()[id] || {};
    if (p.stage === 'won' || p.archived) return true;
    return RC.history(id).some(h => isToday(h.at) && (/^Knocked: /.test(h.what || '') || ((h.kind === 'text' || h.kind === 'email') && h.dir !== 'in')));
  }
  const openStops = () => list.filter(h => !doneToday(h.id));
  const cur = () => list[at] || null;
  function advance() {   // the next stop not done today, after the current one, wrapping once
    for (let k = 1; k <= list.length; k++) { const i = (at + k) % list.length; if (!doneToday(list[i].id)) { at = i; return true; } }
    return false;
  }

  // ---------- what Nimbus says about a stop: one sentence ----------
  function hailWords(x) {
    if (x == null) return '';
    const v = Math.round(x * 4) / 4;
    return v >= 1 && v < 1.25 ? 'inch hail' : v === 1.5 ? 'inch and a half hail' : v === 1.25 ? 'inch and a quarter hail' : v === 1.75 ? 'inch and three quarter hail'
      : v === 0.75 ? 'three quarter inch hail' : v === 2 ? '2 inch hail' : (+x).toFixed(2).replace(/0$/, '') + ' inch hail';
  }
  function sentence(h, lead) {
    const bits = [short(h.address)];
    if (h.yearBuilt) bits.push('built ' + h.yearBuilt);
    if (h.hail) bits.push(hailWords(h.hail));
    if (h.permit) bits.push('re-roofed ' + String(h.permit).slice(0, 4));
    else { const w = (h.why || []).find(s => /no re-roof permit on file since (\d{4})/.test(s)); const m = w && /since (\d{4})/.exec(w); if (m) bits.push('no new roof since ' + m[1]); }
    return (lead || 'Next') + ': ' + bits.join(', ') + '.';
  }
  function say(t) { lastSay = t; return window.NimbusVA ? NimbusVA.speak(t) : Promise.resolve(); }

  // ---------- the screen ----------
  function build() {
    root = document.createElement('section');
    root.className = 'nbt'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'false'); root.setAttribute('aria-label', 'Truck mode');
    root.innerHTML = `<div class="nbt-top"><span class="nbt-n" aria-live="polite"></span><button type="button" class="nbt-x" data-t="exit">Exit</button></div>
      <div class="nbt-card" aria-live="polite"></div>
      <div class="nbt-say" aria-live="polite"></div>
      <button type="button" class="nbt-mic" data-t="talk" aria-label="Hold to talk"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Hold to talk</span></button>
      <div class="nbt-grid">
        <button type="button" data-t="nothome"><b>No answer</b><small>Knocked, nobody home</small></button>
        <button type="button" data-t="talked"><b>Talked</b><small>Then book or move on</small></button>
        <button type="button" data-t="book"><b>Book</b><small>Say a day and time</small></button>
        <button type="button" data-t="no"><b>Not interested</b><small>Parks it</small></button>
        <a class="nbt-dir" data-t="dir" target="_blank" rel="noopener"><b>Directions</b><small>Opens your maps app</small></a>
        <button type="button" data-t="text"><b>Text</b><small>Opens it, you tap Send</small></button>
        <button type="button" data-t="skip"><b>Skip</b><small>Try later</small></button>
        <button type="button" data-t="next" class="p"><b>Next</b><small>Next house</small></button>
      </div>
      <p class="nbt-foot">Screen stays on in truck mode. Nothing sends without your tap.</p>`;
    document.body.appendChild(root);
    root.addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b || b.dataset.t === 'talk') return; if (b.dataset.t !== 'dir') e.preventDefault(); act(b.dataset.t); });
    const mic = root.querySelector('.nbt-mic');
    let down = 0;
    mic.addEventListener('pointerdown', e => { e.preventDefault(); if (window.NimbusVA) NimbusVA.stop(); down = Date.now(); listen(true); });
    const up = () => { if (!down) return; const held = Date.now() - down; down = 0; if (held > 350) stopListen(); };
    mic.addEventListener('pointerup', up); mic.addEventListener('pointercancel', up);
    mic.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); listening ? stopListen() : listen(false); } });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && isOpen()) wake(); });
  }
  const isOpen = () => !!(root && root.classList.contains('open'));
  function paint(note) {
    const h = cur(), left = openStops().length;
    root.querySelector('.nbt-n').textContent = h ? 'Stop ' + (at + 1) + ' of ' + list.length + ' · ' + left + ' left' : 'Route done';
    const card = root.querySelector('.nbt-card');
    if (!h) { card.innerHTML = '<h2>Route done</h2><p>Every home on today\'s list is handled. Nice work.</p>'; return; }
    const sq = h.squares ? Math.round(h.squares) + ' squares' : '';
    card.innerHTML = `<h2>${esc(short(h.address))}</h2><p class="nbt-city">${esc(h.city || '')}</p>
      <ul class="nbt-facts">${h.hail ? `<li><b>${esc(String(+(+h.hail).toFixed(2)))}"</b> hail</li>` : ''}${h.yearBuilt ? `<li>Built <b>${h.yearBuilt}</b></li>` : ''}${sq ? `<li><b>${esc(sq)}</b> roof</li>` : ''}</ul>
      ${doneToday(h.id) ? '<p class="nbt-done">Done today</p>' : ''}`;
    const d = root.querySelector('[data-t="dir"]');
    const dest = isFinite(h.lat) && isFinite(h.lon) ? h.lat + ',' + h.lon : encodeURIComponent(h.address);
    d.href = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document ? 'https://maps.apple.com/?daddr=' + dest + '&dirflg=d' : 'https://www.google.com/maps/dir/?api=1&destination=' + dest + '&travelmode=driving';
    if (note != null) root.querySelector('.nbt-say').textContent = note;
  }
  async function wake() { try { if ('wakeLock' in navigator && (!lock || lock.released)) lock = await navigator.wakeLock.request('screen'); } catch (e) { lock = null; } }

  // ---------- doing things: taps and words end up here ----------
  async function act(k, extra) {
    const h = cur();
    if (k === 'exit') return close();
    if (k === 'repeat') { paint(lastSay); return say(lastSay); }
    if (k === 'dir') { if (h) { const t = 'Opening directions to ' + short(h.address) + '.'; paint(t); say(t); } return; }
    if (!h) { paint('Route done.'); return say('Your route is done for today.'); }
    Tools.focus(h.id);
    if (k === 'next') return next();
    if (k === 'skip') {
      const m = RC.__get('d50skip', {}) || {}; m[h.id] = { at: new Date().toISOString(), reason: 'Try later' }; RC.__set('d50skip', m);
      return next('Skipped. ');
    }
    if (k === 'nothome') { const r = await Tools.run('log_knock', { outcome: 'not_home' }); return next(r.ok ? 'Logged no answer. ' : r.say + ' '); }
    if (k === 'no') { const r = await Tools.run('log_knock', { outcome: 'not_interested' }); return next(r.ok ? 'Logged not interested. ' : r.say + ' '); }
    if (k === 'talked') {
      const r = await Tools.run('log_knock', { outcome: 'talked' });
      if (extra && extra.when) return act('book', extra);
      const t = r.ok ? 'Logged. Want to book an inspection? Say book and a day and time, or say next.' : r.say; paint(t); return say(t);
    }
    if (k === 'book') {
      if (!extra || !extra.when) { const t = 'What day and time? Hold the button and say it, like Thursday at 2.'; paint(t); pendingBook = true; return say(t); }
      const r = await Tools.run('book_inspection', { when: extra.when });
      if (r.ok) return next(r.say + ' ');
      paint(r.say); await say(r.say);
      if (r.need === 'time') pendingBook = true;
      return;
    }
    if (k === 'text') {
      hide(true);
      const r = await Tools.run('draft_message', { channel: 'text' });
      showBack(r.say);
      return;
    }
  }
  let pendingBook = false;
  async function next(prefix) {
    const moved = advance();
    Tools.focus(cur() ? cur().id : null);
    if (!moved && !openStops().length) { const t = (prefix || '') + 'That was the last one. Your route is done for today.'; paint(t); return say(t); }
    const t = (prefix || '') + sentence(cur());
    paint(t); return say(t);
  }

  // ---------- "text them": the filled text opens on Today behind truck mode; a pill brings truck mode back ----------
  let back = null;
  function hide(on) { hidden = on; root.classList.toggle('away', on); }
  function showBack(msg) {
    if (!back) { back = document.createElement('button'); back.type = 'button'; back.className = 'nbt-back'; back.textContent = 'Back to truck mode'; document.body.appendChild(back);
      back.addEventListener('click', () => { back.classList.remove('on'); hide(false); next(''); }); }
    back.classList.add('on');
    if (msg) say(msg);
  }

  // ---------- words: the same few things a rep says between doors ----------
  function heard(raw) {
    const t = String(raw || '').toLowerCase().replace(/[^a-z0-9: ]/g, ' ').replace(/\s+/g, ' ').trim();
    root.querySelector('.nbt-say').textContent = '“' + raw + '”';
    if (!t) return;
    const when = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b|\b\d{1,2}(:\d\d)?\s*(am|pm)?\b/.test(t) ? raw : '';
    if (pendingBook && when) { pendingBook = false; return act('book', { when }); }
    pendingBook = false;
    if (/\b(exit|stop truck|end truck|done for the day|quit)\b/.test(t)) return act('exit');
    if (/\b(repeat|say (that|it) again|again|what was that)\b/.test(t)) return act('repeat');
    if (/\b(direction|navigate|take me|drive|map)/.test(t)) { const d = root.querySelector('[data-t="dir"]'); act('dir'); return d && d.click(); }
    if (/\b(no answer|not home|nobody|no one)\b/.test(t)) return act('nothome');
    if (/\bnot interested\b|\bsaid no\b|\bno thanks\b/.test(t)) return act('no');
    if (/\b(talked|spoke|talk to|they were home)\b/.test(t)) return act('talked', { when: /\bbook\b/.test(t) && when ? when : '' });
    if (/\b(book|schedule|inspection|appointment)\b/.test(t)) return act('book', { when });
    if (/\b(text|message)\b/.test(t)) return act('text');
    if (/\bskip\b|\blater\b/.test(t)) return act('skip');
    if (/\b(next|go on|move on|keep going)\b/.test(t)) return act('next');
    const s = 'Say no answer, talked, book and a day, skip, next, directions, or text them.'; root.querySelector('.nbt-say').textContent = s; say(s);
  }
  function listen(hold) {
    if (!SR) { const s = 'Voice is not available in this browser. Use the buttons.'; root.querySelector('.nbt-say').textContent = s; return; }
    if (listening) return;
    let fin = '';
    rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = !!hold;
    rec.onresult = e => { let f = '', i = ''; for (let k = 0; k < e.results.length; k++) { const x = e.results[k][0].transcript; if (e.results[k].isFinal) f += x; else i += x; } fin = f; root.querySelector('.nbt-say').textContent = (f + ' ' + i).trim() + '...'; };
    rec.onerror = e => { if (e.error === 'not-allowed') root.querySelector('.nbt-say').textContent = 'The microphone is blocked. Allow it, or use the buttons.'; };
    rec.onend = () => { listening = false; root.querySelector('.nbt-mic').classList.remove('on'); rec = null; if (fin.trim()) heard(fin.trim()); };
    try { rec.start(); listening = true; root.querySelector('.nbt-mic').classList.add('on'); } catch (e) { listening = false; }
  }
  function stopListen() { if (rec) try { rec.stop(); } catch (e) { } }

  // ---------- open and close ----------
  async function open() {
    if (!root) build();
    if (window.NimbusVA && NimbusVA.isOpen()) NimbusVA.toggle(false);
    Tools.go('daily', {});
    root.classList.add('open'); document.body.classList.add('nbt-on'); hide(false);
    root.querySelector('.nbt-card').innerHTML = '<h2>Loading your route</h2>';
    list = await Tools.waitFor(() => Tools.dailyList().length && Tools.dailyList(), 15000) || [];
    const saved = RC.__get('truckAt', null);
    at = Math.max(0, list.findIndex(h => !doneToday(h.id)));
    if (saved && isToday(saved.at)) { const k = list.findIndex(h => h.id === saved.id); if (k >= 0 && !doneToday(saved.id)) at = k; }
    wake();
    Tools.focus(cur() ? cur().id : null);
    const h = cur();
    const t = !list.length ? 'Today\'s list did not load. Try again in a moment.' : !openStops().length ? 'Your route is done for today.' : 'Truck mode. ' + openStops().length + ' stops left. ' + sentence(h, 'First');
    paint(t); say(t);
    setTimeout(() => { const b = root.querySelector('.nbt-mic'); if (b) b.focus(); }, 80);
  }
  function close() {
    if (!root) return;
    const h = cur(); if (h) RC.__set('truckAt', { id: h.id, at: new Date().toISOString() });
    root.classList.remove('open'); document.body.classList.remove('nbt-on'); hide(false);
    if (back) back.classList.remove('on');
    Tools.focus(null); stopListen();
    if (window.NimbusVA) NimbusVA.stop();
    if (lock) { try { lock.release(); } catch (e) { } lock = null; }
  }
  addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen() && !hidden) close(); });

  window.NimbusTruck = { open, close, isOpen, heard, act, get stop() { return cur(); } };
})();
