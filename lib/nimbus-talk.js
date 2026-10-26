/* nimbus-talk.js: Talk to Nimbus, the voice-first home (Jack 10-26: "they talk to Nimbus instead of interacting with the
   actual interface"). One big orb, the live words, Nimbus's answer, and the cards he pulls up. The roofer runs his day by
   talking; the normal app is one tap away ("Open the app", or tap any card to go to that screen).
   - Keep listening: after Nimbus answers, the orb listens again on its own, so it is a back-and-forth conversation. Tapping
     the orb while he talks cuts him off (barge-in). "Stop", "thanks" or "that's all" ends the conversation.
   - Same brain, tools and log as the panel (lib/nimbus-assistant.js handle(..., { quiet: true })): every action still rings
     what it touches on the screen behind, and has Undo on its card.
   - Opens from the panel's "Talk to Nimbus" chip, ?talk=1, or the setting "Start in Talk mode".
   Plain script, shell only. window.NimbusTalk. */
(function () {
  'use strict';
  if (window.NimbusTalk || !window.NimbusVA || !window.NimbusTools) return;
  const RC = window.RC, Tools = window.NimbusTools, VA = window.NimbusVA, esc = RC.esc;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let root, orb, liveEl, replyEl, cardsEl, state = 'idle', rec = null, keep = true, turnCards = [], convo = false;
  const CHIPS = ['What\'s going on today?', 'Start my route', 'What\'s on my calendar this week?', 'Any replies?', 'How are we doing this month?', 'Make my route 30 homes', 'Who\'s the lady on Merribrook?'];

  function build() {
    root = document.createElement('section');
    root.className = 'nbk'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Talk to Nimbus');
    root.innerHTML = `<header class="nbk-h"><b>Talk to Nimbus</b><span class="nbk-mode"></span>
        <label class="nbk-keep"><input type="checkbox" checked> Keep listening</label>
        <button type="button" class="nbk-app">Open the app</button></header>
      <div class="nbk-main">
        <button type="button" class="nbk-orb" aria-label="Talk to Nimbus"><span class="nbk-ring"></span><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
        <p class="nbk-state" aria-live="polite">Tap and talk</p>
        <p class="nbk-live" aria-live="polite"></p>
        <p class="nbk-reply" aria-live="polite"></p>
        <form class="nbk-type"><input type="text" placeholder="Or type here" aria-label="Type to Nimbus" autocomplete="off"><button type="submit">Send</button></form>
        <div class="nbk-chips"></div>
      </div>
      <div class="nbk-cards" aria-label="What Nimbus pulled up"></div>`;
    document.body.appendChild(root);
    orb = root.querySelector('.nbk-orb'); liveEl = root.querySelector('.nbk-live'); replyEl = root.querySelector('.nbk-reply'); cardsEl = root.querySelector('.nbk-cards');
    root.querySelector('.nbk-app').addEventListener('click', () => close());
    root.querySelector('.nbk-keep input').addEventListener('change', e => { keep = e.target.checked; });
    root.querySelector('.nbk-chips').innerHTML = CHIPS.map(c => `<button type="button">${esc(c)}</button>`).join('');
    root.querySelector('.nbk-chips').addEventListener('click', e => { const b = e.target.closest('button'); if (b) ask(b.textContent, 'chip'); });
    root.querySelector('.nbk-type').addEventListener('submit', e => { e.preventDefault(); const i = root.querySelector('.nbk-type input'); if (i.value.trim()) { ask(i.value.trim(), 'typed'); i.value = ''; } });
    // the orb: tap to talk, tap again to stop; tap while he talks = cut him off and listen (barge-in)
    orb.addEventListener('click', () => {
      if (state === 'listening') return stopListen();
      VA.stop(); convo = true; listen();
    });
    cardsEl.addEventListener('click', onCard);
    addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) { if (state === 'listening') stopListen(); else close(); } });
    VA.onReply(t => { if (!isOpen() || t.how === 'panel') return; showReply(t); });
    Tools.on(({ name, args, result }) => { if (isOpen()) turnCards.push(cardFor(name, args, result)); });
  }
  const isOpen = () => !!(root && root.classList.contains('open'));
  function setState(s, label) {
    state = s; root.dataset.state = s;
    root.querySelector('.nbk-state').textContent = label || { idle: 'Tap and talk', listening: 'Listening...', thinking: 'Working on it', speaking: 'Tap to cut in' }[s];
  }
  function paintMode() {
    const h = VA.health && VA.health(), brain = h && h.brain_ok ? 'Claude brain' : /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'Built-in brain' : 'Demo mode';
    root.querySelector('.nbk-mode').textContent = brain;
  }

  // ---------- one turn ----------
  async function ask(text, how) {
    if (!text) return;
    VA.stop(); turnCards = [];
    liveEl.textContent = '“' + text + '”'; replyEl.textContent = '';
    setState('thinking');
    await VA.handle(text, how || 'voice', { quiet: true });
  }
  async function showReply(t) {
    replyEl.textContent = t.reply || '';
    const cards = turnCards.filter(Boolean); turnCards = [];
    if (cards.length) { const wrap = document.createElement('div'); wrap.className = 'nbk-turn'; wrap.innerHTML = cards.map(renderCard).join(''); cards.forEach((c, i) => { wrap.children[i]._card = c; }); cardsEl.prepend(wrap); }
    setState('speaking');
    // speech runs in handle() after this; wait for it, then listen again when the conversation is on
    await waitSpeech();
    if (!isOpen()) return;
    const end = /^(stop|thanks|thank you|thats all|that's all|bye|goodbye|never mind|nevermind)\b/i.test(String(t.said || '').trim());
    if (end) convo = false;
    setState('idle');
    if (keep && convo && t.how === 'voice') listen();
  }
  function waitSpeech() {
    return new Promise(res => { const t0 = Date.now(); const tick = () => { const busy = window.speechSynthesis && speechSynthesis.speaking; if ((!busy && Date.now() - t0 > 400) || Date.now() - t0 > 30000) res(); else setTimeout(tick, 150); }; setTimeout(tick, 300); });
  }

  // ---------- voice in (browser speech recognition; the panel's backup service handles browsers without it) ----------
  function listen() {
    if (!SR) { setState('idle', 'Voice is not available in this browser. Type below.'); return; }
    if (rec) return;
    let fin = '', heardAny = false;
    rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = false;
    rec.onresult = e => { let f = '', i = ''; for (let k = 0; k < e.results.length; k++) { const x = e.results[k][0].transcript; if (e.results[k].isFinal) f += x; else i += x; } fin = f; heardAny = true; liveEl.textContent = (f + ' ' + i).trim(); };
    rec.onerror = e => { if (e.error === 'not-allowed') { convo = false; setState('idle', 'The microphone is blocked. Allow it, or type below.'); } };
    rec.onend = () => { rec = null; if (fin.trim()) ask(fin.trim(), 'voice'); else { if (state === 'listening') setState('idle'); if (!heardAny) convo = false; } };
    try { rec.start(); setState('listening'); } catch (e) { rec = null; }
  }
  function stopListen() { if (rec) try { rec.stop(); } catch (e) { } }

  // ---------- cards: what a tool pulled up ----------
  function cardFor(name, args, r) {
    if (!r) return null;
    if (r.card) return Object.assign({ undo: r.undo, ok: r.ok }, r.card);
    if (!r.ok) return null;
    const f = r.data && r.data.street && r.data.id ? r.data : null;
    if (f) return { kind: 'home', title: f.street, sub: f.city || '', facts: [f.hail_in != null ? f.hail_in + '" hail' : '', f.year_built ? 'Built ' + f.year_built : '', f.roof_squares ? Math.round(f.roof_squares) + ' squares' : '', f.stage || ''].filter(Boolean),
      why: (f.why_on_list || []).slice(0, 3).map(s => s.replace(/\s*\(.*?\)/g, '')), go: { screen: 'home', params: { view: 'home', id: f.id } } };
    if (name === 'latest_storm' && r.data) return { kind: 'stat', big: RC.fmt(r.data.homes_1in), title: 'homes with inch hail', sub: r.data.date + ', up to ' + r.data.max_in + ' in', go: { screen: 'storm', params: { iso: r.data.date } } };
    if (name === 'count' && r.data && r.data.n != null) return { kind: 'stat', big: String(r.data.n), title: r.say.replace(/\.$/, '') };
    if (name === 'show_route' && r.data) return { kind: 'stat', big: String(r.data.left), title: 'stops left of ' + r.data.total, sub: r.data.first ? 'First: ' + r.data.first : '', go: { screen: 'daily', params: {} } };
    if (r.label) return { kind: 'done', title: r.label, undo: r.undo };
    return null;
  }
  function renderCard(c) {
    const go = c.go ? ' data-go="1"' : '';
    if (c.kind === 'stat') return `<article class="nbk-card stat"${go}><b>${esc(c.big)}</b><span>${esc(c.title)}</span>${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</article>`;
    if (c.kind === 'stats') return `<article class="nbk-card stats"><h4>${esc(c.title)}</h4><div>${c.stats.map(s => `<p><b>${esc(String(s[1]))}</b><span>${esc(s[0])}</span></p>`).join('')}</div></article>`;
    if (c.kind === 'home') return `<article class="nbk-card home"${go}><h4>${esc(c.title)}</h4><small>${esc(c.sub)}</small><ul>${c.facts.map(x => `<li>${esc(x)}</li>`).join('')}</ul>${c.why && c.why.length ? `<p>${esc(c.why.join('. '))}.</p>` : ''}<span class="nbk-open">Open the record</span></article>`;
    if (c.kind === 'memory') { const h = c.home;
      return `<article class="nbk-card memory"><h4>${esc(h.street)}</h4><small>${esc(h.stage)}${h.booked ? ', inspection ' + esc(new Date(h.booked).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) : ''}${h.replied ? ', replied' : ''}</small>
        <p class="nbk-who" data-home="${esc(h.id)}"><button type="button" data-reveal="${esc(h.id)}">Show name and phone</button><em>Every look is logged</em></p>
        <ol>${h.history.map(x => `<li><time>${esc(new Date(x.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</time> ${esc(x.what)}</li>`).join('')}</ol>
        <button type="button" class="nbk-link" data-open="${esc(h.id)}">Open the record</button>${(c.more || []).map(r => `<button type="button" class="nbk-link" data-open="${esc(r.id)}">${esc(r.t)}, ${esc(r.s)}</button>`).join('')}</article>`; }
    if (c.kind === 'list') return `<article class="nbk-card list"><h4>${esc(c.title)}</h4>${c.rows.length ? `<ul>${c.rows.slice(0, 8).map((r, i) => `<li${r.go || r.href ? ` data-row="${i}"` : ''}><b>${esc(r.t)}</b>${r.s ? `<span>${esc(r.s)}</span>` : ''}</li>`).join('')}</ul>${c.rows.length > 8 ? `<small>and ${c.rows.length - 8} more</small>` : ''}` : `<small>${esc(c.empty || 'Nothing')}</small>`}</article>`;
    if (c.kind === 'done') return `<article class="nbk-card done"><span>${esc(c.title)}</span>${c.undo ? '<button type="button" data-undo="1">Undo</button>' : ''}</article>`;
    return '';
  }
  function onCard(e) {
    const card = e.target.closest('.nbk-card'), c = card && card._card; if (!c) return;
    if (e.target.closest('[data-undo]')) { c.undo && c.undo(); card.classList.add('undone'); e.target.remove(); VA.speak('Undone.'); return; }
    const rv = e.target.closest('[data-reveal]');
    if (rv) { reveal(rv.dataset.reveal, rv.parentNode); return; }
    const op = e.target.closest('[data-open]');
    if (op) { close(); Tools.go('home', { view: 'home', id: op.dataset.open }); return; }
    const row = e.target.closest('[data-row]');
    if (row && c.rows) { const r = c.rows[+row.dataset.row]; if (r.href) window.open(r.href, '_blank', 'noopener'); else if (r.go) { close(); Tools.go(r.go.screen, r.go.params); } return; }
    if (c.go) { close(); Tools.go(c.go.screen, c.go.params); }
  }
  // the name and phone come from the secure contact store; the server logs every look
  async function reveal(id, host) {
    if (window.RC_VAULT && RC_VAULT.status && RC_VAULT.status().on) {
      host.innerHTML = '<em>Looking it up...</em>';
      const r = await RC_VAULT.reveal(id).catch(() => null);
      if (!r) { host.innerHTML = '<em>No contact on file for this home yet.</em>'; return; }
      const phones = r.phones || (r.phone ? [r.phone] : []), name = r.owner_name || r.name || '';
      host.innerHTML = `<b>${esc(name || 'Name not on file')}</b>${phones.length ? ' <a href="tel:' + esc(String(phones[0]).replace(/\D/g, '')) + '">' + esc(phones[0]) + '</a>' : ''}<em>Logged in your contact audit</em>`;
      return;
    }
    host.innerHTML = '<em>Contact details open when you are signed in to your account (they live in the secure contact store).</em>';
  }

  // ---------- open and close ----------
  function open() {
    if (!root) build();
    if (VA.isOpen()) VA.toggle(false);
    root.classList.add('open'); document.body.classList.add('nbk-on');
    paintMode(); setState('idle');
    if (!cardsEl.children.length) { replyEl.textContent = 'Ask me anything about your day, or tell me what to change.'; }
    setTimeout(() => orb.focus(), 60);
  }
  function close() { if (!root) return; stopListen(); VA.stop(); convo = false; root.classList.remove('open'); document.body.classList.remove('nbk-on'); }
  if (/[?&]talk=1\b/.test(location.search) || (RC.setting && RC.setting('talkFirst', false))) setTimeout(() => { const t = setInterval(() => { if (window.Nimbus && Nimbus.isArrived && Nimbus.isArrived()) { clearInterval(t); open(); } }, 400); }, 300);
  window.NimbusTalk = { open, close, isOpen, ask };
})();
