/* nimbus-assistant.js: talk to Nimbus and he runs Roof Command for you (Jack 10-26). The orb opens this panel.
   - TALK: hold the blue button (or the orb) to talk, let go to send. A quick tap listens until you stop. Tapping while he talks
     cuts him off. Typing works too. Answers are one or two short spoken sentences.
   - VOICE IN: the browser's own speech recognition (free); where a browser has none, the local server's /stt (Groq Whisper,
     free tier). VOICE OUT: the browser's voice (free) by default; ElevenLabs through the local server only when chosen in
     settings, and the server refuses before the free tier's cap.
   - BRAIN: Claude through the local server (scripts/nimbus/server.py, 127.0.0.1:4913: keys stay there) when it runs; else the
     built-in brain (lib/nimbus-brain.js). The public build never calls the server: it is demo mode, labelled so.
   - ACTIONS: every tool call is lib/nimbus-tools.js: it rings what it touches on screen, and this panel lists each action with
     Undo. Nothing sends: a text or email opens as a draft and a person taps Send.
   - LOG: each turn is logged per roofer, on the local server (scripts/nimbus/logs) or this device (rc.t.nimbusLog).
   Plain script, shell only (product.html), after nimbus-tools.js and nimbus-brain.js. window.NimbusVA. */
(function () {
  'use strict';
  if (window.NimbusVA || !window.NimbusTools || !window.NimbusBrain) return;
  const RC = window.RC, Tools = window.NimbusTools, Brain = window.NimbusBrain;
  const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const PUBLIC = (() => { try { return !!(window.RCT_AUTH && RCT_AUTH.public); } catch (e) { return false; } })();
  const SERVER = 'http://127.0.0.1:4913', USE_SERVER = LOCAL && !PUBLIC && new URLSearchParams(location.search).get('nimbus') !== 'local';
  const OWNER = (((window.ROOFERS || {})[RC.rooferKey()] || {}).owner) || '';
  const PREF = 'nbvPrefs', COACHED = 'nbvCoached', LOGK = 'nimbusLog';
  const prefs = Object.assign({ speak: true, voice: 'browser', brief: true }, RC.__get(PREF, {}) || {});
  const savePrefs = () => RC.__set(PREF, prefs);
  const esc = RC.esc, sleep = ms => new Promise(r => setTimeout(r, ms));
  const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  // ---------- the local server: is it up, which brain, how much ElevenLabs is left ----------
  let health = null, healthAt = 0;
  function checkHealth(force) {
    if (!USE_SERVER) return Promise.resolve(null);
    if (!force && Date.now() - healthAt < 20000) return Promise.resolve(health);
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 1500);
    return fetch(SERVER + '/health', { signal: ctl.signal }).then(r => r.ok ? r.json() : null).catch(() => null)
      .then(h => { health = h; healthAt = Date.now(); paintMode(); return h; });
  }
  const brainLive = () => !!(health && health.brain_ok);

  // ---------- voice out ----------
  let audio = null, speakingP = null, speakTok = 0;
  function bestVoice() {
    const vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [], en = vs.filter(v => /^en(-|_)US/i.test(v.lang)), pool = en.length ? en : vs.filter(v => /^en/i.test(v.lang));
    const rank = v => /natural|neural|online/i.test(v.name) ? 0 : /google us english/i.test(v.name) ? 1 : /samantha|aria|jenny|guy|ava|allison/i.test(v.name) ? 2 : v.localService ? 4 : 3;
    return pool.sort((a, b) => rank(a) - rank(b))[0] || null;
  }
  function stopSpeaking() {
    speakTok++;
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { }
    if (audio) { try { audio.pause(); } catch (e) { } audio = null; }
    setSpeaking(false);
  }
  function speakBrowser(text, tok) {
    return new Promise(res => {
      if (!window.speechSynthesis) return res();
      const u = new SpeechSynthesisUtterance(text), v = bestVoice();
      if (v) u.voice = v; u.lang = 'en-US'; u.rate = 1.03; u.pitch = 1;
      let done = false; const fin = () => { if (!done) { done = true; res(); } };
      u.onend = fin; u.onerror = fin; u.onstart = heard;
      setTimeout(fin, 1200 + text.length * 75);   // a voice that never fires onend does not hang the turn
      if (tok !== speakTok) return fin();
      speechSynthesis.speak(u);
    });
  }
  async function speakEleven(text, tok) {
    const r = await fetch(SERVER + '/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }).catch(() => null);
    if (!r || !r.ok) { const e = r ? await r.json().catch(() => ({})) : {}; if (e.error) note(e.error); checkHealth(true); return false; }
    const url = URL.createObjectURL(await r.blob());
    if (tok !== speakTok) return true;
    audio = new Audio(url);
    await new Promise(res => { audio.onended = res; audio.onerror = res; audio.play().catch(res); });
    URL.revokeObjectURL(url); checkHealth(true);
    return true;
  }
  /* speak one answer; resolves when it ends or is cut off */
  const ABBR = { Ln: 'Lane', Dr: 'Drive', St: 'Street', Ct: 'Court', Rd: 'Road', Ave: 'Avenue', Blvd: 'Boulevard', Pkwy: 'Parkway', Cir: 'Circle', Trl: 'Trail', Pl: 'Place', Ter: 'Terrace', Hwy: 'Highway', Fm: 'F M' };
  // what the voice reads: "Lassen Ln" -> "Lassen Lane", "S Hwy205" -> "South Highway 205", "1.00 in" -> "1 inch"
  function spoken(t) {
    return String(t || '').replace(/\s*[—–]\s*/g, ', ')
      .replace(/\b(Hwy|Fm)(\d+)/g, '$1 $2')
      .replace(/\b(N|S|E|W)\s+(?=(Hwy|Highway|[A-Z][a-z]))/g, m => ({ N: 'North ', S: 'South ', E: 'East ', W: 'West ' })[m.trim()])
      .replace(/\b(Ln|Dr|St|Ct|Rd|Ave|Blvd|Pkwy|Cir|Trl|Pl|Ter|Hwy)\b\.?/g, m => ABBR[m.replace('.', '')] || m)
      .replace(/\b1(?:\.0+)? in\b/g, '1 inch').replace(/\b(\d+(?:\.\d+)?) in\b/g, '$1 inches').replace(/\bin\+/g, 'inches or more');
  }
  /* Real-time speech (v2): an answer is spoken sentence by sentence. Each sentence's ElevenLabs clip is fetched the moment the
     sentence exists (all in parallel), so the first one plays while the rest are still being made. A streaming brain pushes
     sentences as they arrive (speakStart().push); a finished answer goes through speak(). lastLatency = ms from the turn's
     start (turnT0) to the first sound. */
  let turnT0 = 0, firstSound = 0;
  const lat = { last: null };
  const sentences = t => (String(t).match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [String(t)]).map(s => s.trim()).filter(Boolean);
  const elevenOn = n => prefs.voice === 'eleven' && USE_SERVER && health && health.voice && health.voice.elevenlabs && health.voice.left > n;
  const fetchClip = s => fetch(SERVER + '/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: s }) })
    .then(r => r.ok ? r.blob() : r.json().then(e => { if (e && e.error) note(e.error); return null; }, () => null)).catch(() => null);
  function heard() { if (!firstSound && turnT0) { firstSound = performance.now(); lat.last = Math.round(firstSound - turnT0); } }
  function playBlob(b, tok) {
    return new Promise(res => {
      if (tok !== speakTok) return res(true);
      const url = URL.createObjectURL(b); audio = new Audio(url);
      audio.onplaying = heard; audio.onended = () => { URL.revokeObjectURL(url); res(true); }; audio.onerror = () => res(false);
      audio.play().catch(() => res(false));
    });
  }
  function speakStart() {
    if (!prefs.speak) return { push() { }, end() { }, done: Promise.resolve() };
    stopSpeaking();
    const tok = ++speakTok, items = []; let ended = false, wake = null;
    setSpeaking(true);
    const push = s => { s = spoken(s).trim(); if (!s) return; items.push({ s, clip: elevenOn(s.length) ? fetchClip(s) : null }); if (wake) wake(); };
    const end = () => { ended = true; if (wake) wake(); };
    const done = (async () => {
      let i = 0;
      while (tok === speakTok) {
        if (i < items.length) {
          const it = items[i++]; let ok = false;
          if (it.clip) { const b = await it.clip; if (b && tok === speakTok) ok = await playBlob(b, tok); }
          if (!ok && tok === speakTok) await speakBrowser(it.s, tok);
        } else if (ended) break;
        else { await new Promise(r => { wake = r; }); wake = null; }
      }
      if (tok === speakTok) setSpeaking(false);
    })();
    speakingP = done;
    return { push, end, done };
  }
  function speak(text) {
    const st = speakStart(); sentences(text).forEach(st.push); st.end(); return st.done;
  }

  // ---------- voice in ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, recorder = null, chunks = [], listening = false, holdMode = false, finalText = '', liveEl = null, srBroken = false;
  function setListening(on) {
    listening = on; micBtn.classList.toggle('on', on);
    micBtn.setAttribute('aria-label', on ? 'Listening. Let go or tap to send.' : 'Hold to talk');
    hintEl.innerHTML = on ? '<b>Listening.</b> ' + (holdMode ? 'Let go when you are done.' : 'Tap again to stop.') : HINT;
    if (window.Nimbus && Nimbus.mascot) Nimbus.mascot.setState(on ? 'excited' : 'calm');
  }
  function setSpeaking(on) { if (micBtn) { micBtn.classList.toggle('speaking', on && !listening); } if (window.Nimbus && Nimbus.mascot && !listening) Nimbus.mascot.setState(on ? 'excited' : 'calm'); }
  function live(text) {
    if (!liveEl) { liveEl = bubble('you live', ''); }
    liveEl.textContent = text || '...';
    scrollEnd();
  }
  async function startListening(hold) {
    stopSpeaking();
    if (listening) return;
    holdMode = !!hold; finalText = '';
    if (SR && !srBroken) {
      rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = holdMode; rec.maxAlternatives = 1;
      rec.onresult = e => {
        let interim = '', fin = '';
        for (let i = 0; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) fin += t; else interim += t; }
        finalText = fin; live((fin + ' ' + interim).trim());
      };
      rec.onerror = e => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'network' || e.error === 'audio-capture') {
          srBroken = e.error !== 'not-allowed' || srBroken;
          if (e.error === 'not-allowed') note('The microphone is blocked here. Allow it in the browser, or type below.');
          else if (canServerStt()) { note('Switching to the backup speech service.'); srBroken = true; }
          else note('Voice input is not available in this browser. Type below instead.');
        }
      };
      rec.onend = () => { const t = finalText.trim(); rec = null; setListening(false); finishLive(t); if (t) handle(t, 'voice'); };
      try { rec.start(); setListening(true); } catch (e) { setListening(false); }
      return;
    }
    if (canServerStt() && navigator.mediaDevices && window.MediaRecorder) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chunks = []; recorder = new MediaRecorder(stream);
        recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
        recorder.onstop = async () => {
          stream.getTracks().forEach(t => t.stop()); setListening(false);
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }); recorder = null;
          if (blob.size < 2000) return finishLive('');
          live('...');
          const r = await fetch(SERVER + '/stt', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob }).then(x => x.ok ? x.json() : null).catch(() => null);
          const t = r && r.text ? r.text.trim() : '';
          finishLive(t); if (t) handle(t, 'voice'); else note('I did not catch that. Try again, or type it.');
        };
        recorder.start(); setListening(true);
        if (!holdMode) setTimeout(() => { if (recorder && recorder.state === 'recording') recorder.stop(); }, 8000);
      } catch (e) { note('The microphone is blocked here. Allow it in the browser, or type below.'); }
      return;
    }
    note('Voice input is not available in this browser. Type below instead.');
  }
  function stopListening() { if (rec) { try { rec.stop(); } catch (e) { } } else if (recorder && recorder.state === 'recording') recorder.stop(); else setListening(false); }
  const canServerStt = () => USE_SERVER && health && health.stt;
  function finishLive(t) { if (!liveEl) return; if (t) { liveEl.textContent = t; liveEl.classList.remove('live'); } else liveEl.remove(); liveEl = null; }

  // ---------- the panel ----------
  let panel, logEl, chipsEl, micBtn, hintEl, modeEl, setEl, input;
  const HINT = '<b>Hold</b> the blue button and talk, or tap it once. Nimbus opens drafts; you tap Send.';
  function build() {
    panel = document.createElement('section');
    panel.className = 'nbv'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Nimbus assistant'); panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `<div class="nbv-h"><div class="nbv-id"><b>Nimbus</b><span class="nbv-mode"></span></div>
        <button type="button" class="nbv-snd" aria-label="Speak answers aloud" aria-pressed="true" title="Speak answers">&#128264;</button>
        <button type="button" class="nbv-gear" aria-label="Nimbus settings" aria-expanded="false" title="Settings">&#9881;</button>
        <button type="button" class="nbv-x" aria-label="Close Nimbus">&times;</button></div>
      <div class="nbv-set" hidden></div>
      <div class="nbv-log" aria-live="polite"></div>
      <div class="nbv-chips" role="group" aria-label="Things to ask"></div>
      <div class="nbv-f"><button type="button" class="nbv-mic" aria-label="Hold to talk">${MIC}</button>
        <form class="nbv-type"><input type="text" enterkeyhint="send" autocomplete="off" placeholder="Or type to Nimbus" aria-label="Type to Nimbus"><button type="submit">Send</button></form></div>
      <div class="nbv-hint">${HINT}</div>`;
    document.body.appendChild(panel);
    logEl = panel.querySelector('.nbv-log'); chipsEl = panel.querySelector('.nbv-chips'); micBtn = panel.querySelector('.nbv-mic');
    hintEl = panel.querySelector('.nbv-hint'); modeEl = panel.querySelector('.nbv-mode'); setEl = panel.querySelector('.nbv-set'); input = panel.querySelector('input');
    panel.querySelector('.nbv-x').addEventListener('click', () => toggle(false));
    panel.querySelector('.nbv-h').addEventListener('click', e => { if (!e.target.closest('button')) panel.classList.toggle('nbv-peek'); });
    const snd = panel.querySelector('.nbv-snd');
    const paintSnd = () => { snd.setAttribute('aria-pressed', prefs.speak ? 'true' : 'false'); snd.innerHTML = prefs.speak ? '&#128264;' : '&#128263;'; };
    snd.addEventListener('click', () => { prefs.speak = !prefs.speak; savePrefs(); paintSnd(); if (!prefs.speak) stopSpeaking(); }); paintSnd();
    panel.querySelector('.nbv-gear').addEventListener('click', e => { const open = setEl.hidden; setEl.hidden = !open; e.currentTarget.setAttribute('aria-expanded', open ? 'true' : 'false'); if (open) paintSettings(); });
    panel.querySelector('form').addEventListener('submit', e => { e.preventDefault(); const t = input.value.trim(); if (!t) return; input.value = ''; handle(t, 'typed'); });
    // the mic: hold to talk (let go sends), or tap to start and tap to stop. Pressing it while he talks cuts him off.
    let downAt = 0, holdT = null;
    micBtn.addEventListener('pointerdown', e => {
      e.preventDefault(); stopSpeaking(); downAt = Date.now();
      if (listening) { stopListening(); downAt = 0; return; }
      holdT = setTimeout(() => startListening(true), 220);
    });
    const up = () => { clearTimeout(holdT); if (!downAt) return; const held = Date.now() - downAt; downAt = 0; if (held >= 220) stopListening(); else startListening(false); };
    micBtn.addEventListener('pointerup', up); micBtn.addEventListener('pointercancel', up); micBtn.addEventListener('pointerleave', () => { if (downAt && Date.now() - downAt >= 220) up(); });
    micBtn.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stopSpeaking(); if (listening) stopListening(); else startListening(false); } });
    chipsEl.addEventListener('click', e => { const b = e.target.closest('button'); if (b) handle(b.dataset.q || b.textContent, 'chip'); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) { if (listening) stopListening(); else if (speakingP) stopSpeaking(); toggle(false); } });
    addEventListener('resize', place);
    if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => { };
    paintMode(); chips();
  }
  function paintMode() {
    if (!modeEl) return;
    const brain = brainLive() ? 'Claude brain' : PUBLIC || !LOCAL ? 'Demo mode, built-in answers' : 'Built-in brain';
    const v = health && health.voice || {}, voice = prefs.voice === 'eleven' && v.elevenlabs ? 'ElevenLabs voice, ' + RC.fmt(v.left) + ' characters left' : 'browser voice';
    modeEl.className = 'nbv-mode' + (brainLive() ? ' live' : '');
    modeEl.innerHTML = '<i></i>' + esc(brain + ' · ' + voice);
    modeEl.title = health && health.brain_err ? 'Claude brain is off: ' + health.brain_err : '';
  }
  function paintSettings() {
    const v = health && health.voice || {};
    const el = USE_SERVER && v.elevenlabs;
    setEl.innerHTML = `<label><input type="checkbox" id="nbvBrief"${prefs.brief ? ' checked' : ''}> Morning briefing when I open the app</label>
      <label>Voice <select id="nbvVoice"><option value="browser">Browser voice (free)</option>${el ? `<option value="eleven">ElevenLabs (${RC.fmt(v.left)} of ${RC.fmt(v.cap)} characters left this month)</option>` : ''}</select></label>
      <p>${el ? 'ElevenLabs stops on its own before the free monthly limit, then the browser voice takes over.' : USE_SERVER ? 'Start the Nimbus server for the ElevenLabs voice and the Claude brain: python scripts/nimbus/server.py' : 'Demo mode: built-in answers and your browser\'s voice. No keys, nothing leaves this device.'}</p>
      <p>${brainLive() ? 'Brain: Claude (' + esc(health.model) + ') on this computer\'s Nimbus server.' : 'Brain: built-in. It knows the app and its buttons; open questions work best with the Claude brain.'}</p>
      <fieldset class="nbv-call"><legend>Nimbus can call me (you and your team only, never homeowners)</legend>
        <label>My cell <input type="tel" id="nbvCallPhone" autocomplete="tel" placeholder="(972) 555-0100" value="${esc((RC.setting('callMe', {}) || {}).phone || '')}"></label>
        <label><input type="checkbox" data-call="briefing"${((RC.setting('callMe', {}) || {}).calls || []).indexOf('briefing') >= 0 ? ' checked' : ''}> Morning briefing call</label>
        <label><input type="checkbox" data-call="reply_alert"${((RC.setting('callMe', {}) || {}).calls || []).indexOf('reply_alert') >= 0 ? ' checked' : ''}> Call me when a homeowner replies (8 am to 8 pm)</label>
        <label><input type="checkbox" data-call="inbound"${((RC.setting('callMe', {}) || {}).calls || []).indexOf('inbound') >= 0 ? ' checked' : ''}> Let me call Nimbus from this number</label>
        <p>Ticking a box is your OK for those calls. Calls start once Wing connects the Nimbus phone line.</p></fieldset>
      <p><button type="button" class="lnk" id="nbvTour">Walk me through this screen</button> &middot; <button type="button" class="lnk" id="nbvAsk">Street maps and reports</button> &middot; <button type="button" class="lnk" id="nbvClear">Clear the chat</button></p>`;
    const s = setEl.querySelector('#nbvVoice'); s.value = prefs.voice === 'eleven' && el ? 'eleven' : 'browser';
    s.addEventListener('change', () => { prefs.voice = s.value; savePrefs(); paintMode(); });
    const saveCall = () => { const calls = [...setEl.querySelectorAll('[data-call]')].filter(x => x.checked).map(x => x.dataset.call), phone = setEl.querySelector('#nbvCallPhone').value.trim();
      const st = RC.__get('settings', {}) || {}, m = Object.assign({}, st[RC.rooferKey()] || {});
      m.callMe = calls.length && phone ? { phone, calls, opted_in_at: new Date().toISOString() } : null; if (!m.callMe) delete m.callMe;
      st[RC.rooferKey()] = m; RC.__set('settings', st); };
    setEl.querySelectorAll('[data-call], #nbvCallPhone').forEach(x => x.addEventListener('change', saveCall));
    setEl.querySelector('#nbvBrief').addEventListener('change', e => { prefs.brief = e.target.checked; savePrefs(); });
    setEl.querySelector('#nbvTour').addEventListener('click', () => { setEl.hidden = true; handle('Walk me through this screen', 'chip'); });
    setEl.querySelector('#nbvAsk').addEventListener('click', () => { toggle(false); if (window.Nimbus && Nimbus.ask) Nimbus.ask(true); });
    setEl.querySelector('#nbvClear').addEventListener('click', () => { logEl.innerHTML = ''; history.length = 0; state = null; setEl.hidden = true; greet(false); });
  }
  const CHIPS = {
    daily: ["What's going on today?", 'Start truck mode', 'Show me today\'s route', 'Open the next house', 'Why is this house on my list?', 'Text this homeowner the storm message', 'Switch the map to satellite', 'What is the Turnover Radar?'],
    home: ['Why is this house on my list?', 'How sure is the roof size?', 'Mark this one no answer', 'Book an inspection Tuesday at 3', 'Text this homeowner'],
    storm: ['What hit last night?', 'Show me today\'s route', 'What does a dark house mean?'],
    other: ["What's going on today?", 'Show me today\'s route', 'How many inspections this week?', 'What hit last night?', 'Add a past customer']
  };
  function chips() { if (!chipsEl) return; const s = Tools.screen(); chipsEl.innerHTML = ['Talk to Nimbus'].concat(CHIPS[s] || CHIPS.other).map(q => `<button type="button">${esc(q)}</button>`).join(''); }
  function bubble(cls, text) { const d = document.createElement('div'); d.className = 'nbv-m ' + cls; d.textContent = text; logEl.appendChild(d); scrollEnd(); return d; }
  function note(text) { bubble('nb', text); }
  function action(r, name) {
    const d = document.createElement('div'); d.className = 'nbv-a' + (r.ok ? '' : ' fail');
    const span = document.createElement('span'); span.textContent = r.ok ? (r.label || name.replace(/_/g, ' ')) : (r.say || 'That did not work');
    d.appendChild(span);
    if (r.ok && r.undo) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Undo';
      b.addEventListener('click', () => { r.undo(); d.classList.add('undone'); b.remove(); speak('Undone.'); });
      d.appendChild(b);
    }
    logEl.appendChild(d); scrollEnd();
  }
  function choices(list) {
    const d = document.createElement('div'); d.className = 'nbv-btns';
    list.forEach(([label, fn, p]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (p) b.className = 'p'; b.addEventListener('click', () => { d.remove(); fn(); }); d.appendChild(b); });
    logEl.appendChild(d); scrollEnd(); return d;
  }
  const scrollEnd = () => { logEl.scrollTop = logEl.scrollHeight; };
  function place() {
    if (!panel) return;
    const phone = innerWidth <= 599 || document.body.classList.contains('nb-phone'), o = window.Nimbus && Nimbus.orb;
    panel.classList.toggle('nbv-sheet', phone);
    if (phone || !o) { panel.style.right = panel.style.bottom = ''; if (!phone) { panel.style.right = '24px'; panel.style.bottom = '100px'; } return; }
    panel.style.right = Math.max(12, innerWidth - o.right) + 'px'; panel.style.bottom = (innerHeight - o.top + 12) + 'px';
    const hb = document.querySelector('header') ? document.querySelector('header').getBoundingClientRect().bottom : 0;
    panel.style.height = Math.max(380, Math.min(640, o.top - 12 - hb - 12)) + 'px';
  }
  const isOpen = () => !!(panel && panel.classList.contains('open'));
  function toggle(force, quiet) {
    if (!panel) build();
    const open = force != null ? !!force : !isOpen();
    if (window.Nimbus && Nimbus.askOpen && Nimbus.askOpen() && open) Nimbus.ask(false);
    panel.classList.toggle('open', open); panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.classList.toggle('nbv-on', open);
    const hit = document.querySelector('.nb-hit'); if (hit) hit.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      if (pillEl) pillEl.classList.remove('on');
      if (window.Nimbus && Nimbus.hide) Nimbus.hide();
      place(); chips(); checkHealth(true);
      if (!logEl.children.length && !quiet) greet(true);
      setTimeout(() => micBtn.focus(), 60);
    } else { stopSpeaking(); if (listening) stopListening(); if (hit) hit.focus(); }
    return open;
  }

  // ---------- the morning briefing: the first open of the day, once (rc.t.nbvBriefed = that day) ----------
  const dayKey = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  async function briefNow(auto) {
    if (!panel) build();
    if (!isOpen()) toggle(true, true);
    const think = bubble('nb think', 'Getting your morning ready');
    const b = await Tools.briefing();
    think.remove();
    bubble('nb', b.text);
    if (b.offer) state = { pending: 'offer', offer: b.offer };
    logTurn({ at: new Date().toISOString(), screen: Tools.screen(), how: auto ? 'auto' : 'asked', said: '(morning briefing)', actions: [{ name: 'briefing', args: {}, ok: true }], brain: 'built-in', reply: b.text });
    const btns = [];
    // a browser speaks only after a tap on the page: until then the big Play button does it
    const canTalk = !auto || !navigator.userActivation || navigator.userActivation.hasBeenActive;
    if (prefs.speak && !canTalk) btns.push(['▶  Play briefing', () => { speak(b.text); offerBtns(b); }, true]);
    if (btns.length) { const d = choices(btns); d.classList.add('nbv-play'); }
    else { offerBtns(b); if (prefs.speak) await speak(b.text); }
  }
  function offerBtns(b) {
    if (b.offer === 'route') choices([['Start the route', () => handle('Yes, start the route', 'chip'), true], ['Not now', () => handle('Not now', 'chip')]]);
    else if (b.offer === 'inbox') choices([['Open the replies', () => handle('Yes', 'chip'), true], ['Not now', () => handle('Not now', 'chip')]]);
  }
  async function autoBrief() {
    const force = /[?&]brief=1\b/.test(location.search);
    if (!force && (!prefs.brief || RC.setting('briefing', true) === false || RC.__get('nbvBriefed', '') === dayKey())) return;
    // Today's list and alert live in the Today frame: when the app opens elsewhere (a record), the pill waits until Today has loaded
    const ok = await Tools.waitFor(() => window.Nimbus && Nimbus.isArrived && Nimbus.isArrived() && Tools.screen() !== 'opening' && Tools.dailyList().length, 20 * 60000);
    if (!ok || (!force && RC.__get('nbvBriefed', '') === dayKey())) return;
    RC.__set('nbvBriefed', dayKey());
    const b = await Tools.briefing();
    pill(b);
  }
  /* the briefing never opens the panel on its own (Jack 10-26: it covered the record and Today's map): a small pill by the
     orb, "Play morning briefing". A tap speaks it and shows the words in the pill with Start the route; x closes it. */
  let pillEl = null;
  function pill(b) {
    if (!pillEl) {
      pillEl = document.createElement('div'); pillEl.className = 'nbv-pill'; pillEl.setAttribute('role', 'status');
      document.body.appendChild(pillEl);
      addEventListener('resize', placePill);
    }
    pillEl.innerHTML = '<button type="button" class="nbv-pill-play">▶ Play morning briefing</button><button type="button" class="nbv-pill-x" aria-label="Close the briefing">×</button>';
    pillEl.classList.remove('open'); pillEl.classList.add('on'); placePill();
    pillEl.querySelector('.nbv-pill-x').addEventListener('click', () => { pillEl.classList.remove('on'); stopSpeaking(); });
    pillEl.querySelector('.nbv-pill-play').addEventListener('click', () => {
      pillEl.classList.add('open');
      pillEl.innerHTML = '<p></p><div class="nbv-pill-b">' + (b.offer ? '<button type="button" class="p" data-p="go">' + (b.offer === 'route' ? 'Start the route' : 'Open the replies') + '</button>' : '') +
        '<button type="button" data-p="x">Close</button></div>';
      pillEl.querySelector('p').textContent = b.text; placePill();
      pillEl.addEventListener('click', e => {
        const k = e.target.closest('[data-p]'); if (!k) return;
        pillEl.classList.remove('on'); stopSpeaking();
        if (k.dataset.p === 'go') { state = { pending: 'offer', offer: b.offer }; handle(b.offer === 'route' ? 'Yes, start the route' : 'Yes', 'chip'); }
      });
      logTurn({ at: new Date().toISOString(), screen: Tools.screen(), how: 'auto', said: '(morning briefing)', actions: [{ name: 'briefing', args: {}, ok: true }], brain: 'built-in', reply: b.text });
      const p = prefs.speak; prefs.speak = true; speak(b.text); prefs.speak = p;   // the roofer tapped Play: speak even with answers muted
    });
  }
  function placePill() {
    if (!pillEl || !window.Nimbus || !Nimbus.orb) return;
    const o = Nimbus.orb;
    pillEl.style.right = (innerWidth - o.left + 10) + 'px';
    pillEl.style.bottom = (innerHeight - o.bottom + (pillEl.classList.contains('open') ? 0 : Math.max(0, (o.size - 44) / 2))) + 'px';
    pillEl.style.maxWidth = Math.min(320, o.left - 22) + 'px';
  }

  // ---------- first use: a short spoken walkthrough of the screen ----------
  function greet(first) {
    const coached = !!RC.__get(COACHED, null);
    const hi = (RC.greeting ? RC.greeting() : 'Hello') + (OWNER ? ', ' + OWNER : '') + '.';
    if (!coached && first) {
      const t = hi + ' I\'m Nimbus. Talk to me and I\'ll run the app for you. Want a quick tour of this screen? It takes about half a minute.';
      bubble('nb', t); speak(t);
      choices([['Yes, show me', () => { RC.__set(COACHED, new Date().toISOString()); handle('Walk me through this screen', 'chip'); }, true],
        ['Not now', () => { RC.__set(COACHED, new Date().toISOString()); const s = 'Okay. Hold the blue button any time and tell me what you need.'; bubble('nb', s); speak(s); }]]);
      return;
    }
    bubble('nb', hi + ' What do you need? Hold the blue button and talk, or tap a suggestion.');
  }
  async function runTour(steps) {
    const tok = speakTok + 1;
    for (const s of steps) {
      let el = null; try { el = s.el(); } catch (e) { }
      if (!el && s.label !== 'Nimbus') continue;
      bubble('nb', s.say);
      if (el) Tools.point(el, s.label, 6000);
      await speak(s.say);
      if (speakTok > tok + steps.length * 2 || listening || !isOpen()) break;   // cut off: stop the tour
      if (!prefs.speak) await sleep(1800);
    }
  }

  // ---------- one turn: what was said -> brain -> tools on screen -> a short spoken answer ----------
  const history = [];   // Anthropic-format messages for the Claude brain (assistant content kept as returned)
  let state = null, busy = false, queued = null;
  function trimHistory() {
    while (history.length > 24) {   // drop whole old turns, never orphan a tool_result
      history.shift();
      while (history.length && !(history[0].role === 'user' && typeof history[0].content !== 'string' && history[0].content.some(b => b.type === 'text'))) history.shift();
    }
  }
  // opts.quiet: another surface (the Talk screen, lib/nimbus-talk.js) shows the turn; the panel stays closed
  const replyFns = [];
  async function handle(text, how, opts) {
    opts = opts || {};
    if (!panel) build();
    if (!isOpen() && !opts.quiet) toggle(true);
    if (busy) { queued = [text, how, opts]; return; }
    busy = true; stopSpeaking(); turnT0 = performance.now(); firstSound = 0; spokeStream = false;
    if (how !== 'voice' || !logEl.lastElementChild || logEl.lastElementChild.textContent !== text) bubble('you', text);
    const think = bubble('nb think', 'Working on it');
    const turn = { at: new Date().toISOString(), screen: Tools.screen(), how, said: text, actions: [], brain: '' };
    let reply = '', tours = [];
    const runCall = async (name, args) => {
      if (panel.classList.contains('nbv-sheet') && !/^(count|home_facts|walkthrough|undo_last)$/.test(name)) panel.classList.add('nbv-peek');   // phone: let the screen show
      const r = await Tools.run(name, args);
      if (r.ok && !/^(home_facts|walkthrough|count|briefing|truck_mode)$/.test(name)) action(r, name);   // a failed tool says why in the reply
      if (r.tour) tours = r.tour;
      turn.actions.push({ name, args, ok: !!r.ok });
      if (r.need === 'time') state = { pending: 'time', day: '' };
      if (r.need === 'customer') state = { pending: 'customer' };
      if (r.offer) state = { pending: 'offer', offer: r.offer };
      if (r.ok && r.undo && name === 'change_setting') state = { pending: 'keep' };   // Done. Want to keep it?   // the briefing asked "Want me to start it?" 
      return r;
    };
    try {
      if (!health) await checkHealth(); else checkHealth();   // a known server answers at once; the check refreshes in the background
      let usedClaude = false;
      if (brainLive()) {
        try { reply = await claudeTurn(text, runCall); usedClaude = true; turn.brain = 'claude'; }
        catch (e) { console.warn('[nimbus] Claude brain failed, using the built-in brain', e); checkHealth(true); }
      }
      if (!usedClaude) {
        turn.brain = 'built-in';
        const st = state; state = null;
        const r = await Brain.think(text, st);
        const says = [];
        for (const c of r.calls || []) { const x = await runCall(c.name, c.args); if (x.say) says.push(x.say); }
        reply = ((r.say || says.join(' ')) + (r.after ? ' ' + r.after : '')).trim();
        if (r.state) state = r.state;
        // keep the Claude history in step, so a brain that comes back later knows what happened
        history.push({ role: 'user', content: [{ type: 'text', text }] }, { role: 'assistant', content: [{ type: 'text', text: reply || 'Done.' }] });
      }
    } catch (e) { reply = 'Something went wrong on my side. Try that again.'; console.warn('[nimbus]', e); }
    think.remove();
    if (panel.classList.contains('nbv-sheet')) panel.classList.toggle('nbv-peek', turn.actions.some(x => x.ok && x.name !== 'count' && x.name !== 'home_facts'));
    if (reply) bubble('nb', reply);
    turn.reply = reply; logTurn(turn);
    busy = false;
    replyFns.forEach(f => { try { f(turn); } catch (e) { } });
    if (reply && !spokeStream) await speak(reply); else if (spokeStream && speakingP) await speakingP;
    if (tours.length) await runTour(tours);
    chips();
    if (queued) { const q = queued; queued = null; handle(q[0], q[1], q[2]); }
  }
  let spokeStream = false;
  // one streamed step (server /chat_stream, Server-Sent Events): text deltas are spoken a sentence at a time; the final
  // message (with any tool calls) arrives at the end. Falls back to /chat when the stream is not there.
  async function chatStep(body, st) {
    const r = await fetch(SERVER + '/chat_stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    if (!r || !r.ok || !r.body) { const x = await fetch(SERVER + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!x.ok) throw new Error('chat ' + x.status); return x.json(); }
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', said = '', final = null;
    for (;;) {
      const { value, done } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let k;
      while ((k = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, k).replace(/^data: ?/, ''); buf = buf.slice(k + 2);
        let ev = null; try { ev = JSON.parse(line); } catch (e) { continue; }
        if (ev.t) { said += ev.t; const m = said.match(/^([\s\S]*?[.!?])(\s+)([\s\S]*)$/); if (m && st) { st.push(m[1]); spokeStream = true; said = m[3]; } }
        if (ev.final) final = ev.final;
        if (ev.error) throw new Error(ev.error);
      }
    }
    if (said.trim() && st) { st.push(said); spokeStream = true; }
    if (!final) throw new Error('stream ended without a message');
    return final;
  }
  async function claudeTurn(text, runCall) {
    const ctx = Tools.context();
    history.push({ role: 'user', content: [{ type: 'text', text: '[On screen now: ' + JSON.stringify(ctx) + ']\n' + text }] });
    trimHistory();
    let spoken = '';
    for (let step = 0; step < 5; step++) {
      const st = prefs.speak ? speakStart() : null;
      let d;
      try { d = await chatStep({ roofer: RC.rooferKey(), messages: history, tools: Tools.schemas() }, st); }
      catch (e) { if (st) st.end(); if (step === 0) history.pop(); throw e; }
      if (st) st.end();
      const content = d.content || [];
      history.push({ role: 'assistant', content });
      const texts = content.filter(b => b.type === 'text' && b.text).map(b => b.text.trim());
      const uses = content.filter(b => b.type === 'tool_use');
      if (!uses.length) return (texts.join(' ') || spoken).trim();
      const results = [], says = [];
      for (const u of uses) {
        const x = await runCall(u.name, u.input || {});
        if (x.say) says.push(x.say);
        results.push({ type: 'tool_result', tool_use_id: u.id, is_error: !x.ok || undefined, content: JSON.stringify({ ok: !!x.ok, said: x.say || '', data: x.data || null }).slice(0, 4000) });
      }
      history.push({ role: 'user', content: results });
      if (d.stop_reason === 'plan') return (texts.join(' ') || says.join(' ')).trim();
      spoken = says.join(' ');
    }
    return spoken;
  }
  function logTurn(t) {
    const entry = Object.assign({ roofer: RC.rooferKey() }, t);
    if (USE_SERVER && health) fetch(SERVER + '/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roofer: RC.rooferKey(), entry }) }).catch(() => { });
    else { const l = RC.__get(LOGK, []) || []; l.push(entry); RC.__set(LOGK, l.slice(-200)); }
  }

  // ---------- the orb: a click opens the panel; a long press talks straight away ----------
  function hookOrb() {
    const hit = document.querySelector('.nb-hit'); if (!hit || hit.__nbv) return !!hit;
    hit.__nbv = true; hit.setAttribute('aria-label', 'Nimbus: talk to your assistant');
    let t = null, long = false;
    hit.addEventListener('pointerdown', () => { long = false; t = setTimeout(() => { long = true; toggle(true); startListening(true); }, 380); });
    const up = () => { clearTimeout(t); if (long && listening) stopListening(); };
    hit.addEventListener('pointerup', up); hit.addEventListener('pointercancel', up);
    hit.addEventListener('click', e => { e.stopImmediatePropagation(); e.preventDefault(); if (long) { long = false; return; } toggle(); }, true);
    return true;
  }
  const hookT = setInterval(() => { if (hookOrb()) clearInterval(hookT); }, 300);
  // Nimbus points at something under his own panel (desktop): the panel drops to a short bar until the ring is done
  let asideT = null;
  document.addEventListener('nimbus-point', e => {
    if (!isOpen() || panel.classList.contains('nbv-sheet')) return;
    const p = panel.getBoundingClientRect(), r = e.detail;
    if (r.left > p.right || r.right < p.left || r.top > p.bottom || r.bottom < p.top) return;
    panel.classList.add('nbv-aside'); clearTimeout(asideT);
    asideT = setTimeout(() => panel.classList.remove('nbv-aside'), Math.max(2600, r.ms || 0) + 400);
  });
  // screen changes: new suggestions for the new screen
  addEventListener('hashchange', () => setTimeout(chips, 400));
  checkHealth(true);
  autoBrief();

  window.NimbusVA = { latency: lat, onReply: f => replyFns.push(f), get busy() { return busy; }, spoken, brief: () => briefNow(false), toggle, open: () => toggle(true), handle, speak, stop: stopSpeaking, listen: startListening, health: () => health, history, isOpen,
    get state() { return state; } };
})();
