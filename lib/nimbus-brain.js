/* nimbus-brain.js: Nimbus's built-in brain. No server, no keys, nothing leaves the device: the public demo and the fallback
   when the local Claude brain (scripts/nimbus/server.py) is not running. It turns what the roofer said into tool calls on
   lib/nimbus-tools.js and short spoken answers from the app's own data and lib/nimbus-kb.json.
   NimbusBrain.think(text, state) -> Promise<{ calls: [{name, args}], say, ask?, state? }>
     calls run first (in order); say is spoken after them unless empty (a tool's own say is used then).
     state carries one pending question ("What time on Tuesday?") into the next turn. Plain script, window.NimbusBrain. */
(function () {
  'use strict';
  if (window.NimbusBrain) return;
  let KB = null;
  const kbP = fetch(new URL('lib/nimbus-kb.json', location.href)).then(r => r.ok ? r.json() : null).then(d => (KB = d)).catch(() => null);
  const norm = s => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9: ]/g, ' ').replace(/\s+/g, ' ').trim();
  const strip = h => String(h || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
  const any = (t, list) => list.some(k => t.indexOf(k) >= 0);
  const clean = s => String(s).replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();

  // ---------- explanations that read the home on screen ----------
  function dynamic(kind) {
    const T = window.NimbusTools, id = T && T.currentHome(), f = id && T.facts(id);
    if (kind === 'window') return RC.textWindow().line;
    if (!f) return null;
    if (kind === 'why') {
      const w = (f.why_on_list || []).slice(0, 3).map(clean);
      if (!w.length) return f.street + ' is not on today\'s list. It is in your CRM as ' + f.stage + '.';
      return f.street + ' is number ' + f.list_position + ' on your list because: ' + w.join('; ') + '.';
    }
    if (kind === 'roof') {
      if (f.roof_squares == null) return 'I do not have a roof size for this home yet. On its record, Draw the roof gives one in about a minute.';
      return 'This roof is about ' + Math.round(f.roof_squares) + ' squares' + (f.roof_measured ? ', from LiDAR' : ', estimated from the house size') + (f.roof_confidence != null ? ', and the model is ' + f.roof_confidence + ' percent sure of the shape' : '') + '. Treat it as within about 10 percent, and measure on the roof before you order.';
    }
    if (kind === 'hail') {
      if (f.hail_in == null) return 'No radar hail on file for this address.';
      return 'Radar shows about ' + f.hail_in + ' inch hail at ' + f.street + (f.storm ? ' on ' + new Date(f.storm + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '') + '. That is an estimate at the address, not proof of damage. Only a look on the roof tells you.';
    }
    return null;
  }
  function explain(t) {
    if (!KB) return null;
    let best = null, bestLen = 0;
    Object.keys(KB.topics).forEach(k => KB.topics[k].keys.forEach(key => { if (t.indexOf(key) >= 0 && key.length > bestLen) { best = k; bestLen = key.length; } }));
    if (!best) return null;
    const topic = KB.topics[best], d = topic.dynamic && dynamic(topic.dynamic);
    const noHome = topic.dynamic && topic.dynamic !== 'window' && !d;
    return { topic: best, say: noHome && best === 'why_on_list' ? topic.say + ' Open a home, or say open the next house, and ask me again.' : d && topic.dynamic !== 'window' ? d : topic.say + (d ? ' ' + d : ''), tab: topic.tab };
  }

  // starting the route: truck mode on a phone (lib/nimbus-truck.js), the route and the first house on a computer
  const startRoute = () => window.NimbusTruck && (innerWidth <= 599 || document.body.classList.contains('nb-phone')) ? [{ name: 'truck_mode', args: {} }] : [{ name: 'show_route', args: {} }, { name: 'open_next_house', args: {} }];
  // ---------- intents: what was said -> which tool ----------
  const ASKING = /^(what|whats|why|how|explain|tell me about|what does|whats the|is the|does)\b/;
  function think(raw, state) {
    return kbP.then(() => {
      const t = norm(raw), out = { calls: [], say: '' };
      if (!t) return { calls: [], say: 'I did not catch that. Try again.' };
      // a pending question from the last turn
      if (state && state.pending === 'time') {
        if (/\b(no|cancel|never mind|nevermind|forget it)\b/.test(t)) return { calls: [], say: 'Okay, no booking.' };
        return { calls: [{ name: 'book_inspection', args: { when: (state.day || '') + ' ' + raw } }] };
      }
      if (state && state.pending === 'offer') {
        if (/^(yes|yeah|yep|sure|ok|okay|do it|go|go ahead|lets go|start it|please|yes please)\b/.test(t)) return { calls: state.offer === 'inbox' ? [{ name: 'open_screen', args: { screen: 'inbox' } }] : startRoute() };
        if (/^(no|nope|not now|later|no thanks)\b/.test(t)) return { calls: [], say: 'Okay. I\'m here when you need me.' };
      }
      if (state && state.pending === 'customer') {
        if (/\b(no|cancel|never mind|nevermind)\b/.test(t)) return { calls: [], say: 'Okay, I did not add anyone.' };
        const p = parseCustomer(raw);
        return p.name && p.address ? { calls: [{ name: 'add_past_customer', args: p }] } : { calls: [], say: 'I need a name and a street address. For example: Maria Lopez, 412 Oak Street.', state: { pending: 'customer' } };
      }
      if (/^(stop|cancel|never mind|nevermind|quiet|shh|thats all|thanks|thank you|ok thanks)$/.test(t)) return { calls: [], say: /thank/.test(t) ? 'Anytime.' : '' };
      if (any(t, ['undo', 'take that back', 'reverse that'])) return { calls: [{ name: 'undo_last', args: {} }] };
      if (/\b(truck mode|drive mode|driving mode|hands free|handsfree)\b/.test(t)) return { calls: [{ name: 'truck_mode', args: {} }] };
      if (/\b(start|begin|lets do) (the |my |todays )?route\b/.test(t)) return { calls: startRoute() };
      if (/\b(whats (goin|going) on|whats up|whats new|catch me up|brief me|briefing|morning report|how are we looking|whats the plan|what do i have today|what have i got)\b/.test(t)) return { calls: [{ name: 'briefing', args: {} }] };
      if (any(t, ['walk me through', 'show me around', 'give me a tour', 'how do i use', 'how does this screen', 'teach me', 'what am i looking at'])) return { calls: [{ name: 'walkthrough', args: {} }] };

      // do things
      if (any(t, ['satellite', 'aerial', 'birds eye'])) return { calls: [{ name: 'set_map', args: { style: 'satellite' } }] };
      if (any(t, ['street map', 'normal map', 'regular map', 'map view', 'switch the map back', 'map mode'])) return { calls: [{ name: 'set_map', args: { style: 'map' } }] };
      if (/\b(text|message)\b/.test(t) && !ASKING.test(t) && !any(t, ['texting hours', 'when can i text', 'can you text', 'do you send', 'for me', 'automatic'])) return { calls: [{ name: 'draft_message', args: { channel: 'text' } }] };
      if (/\bemail\b/.test(t) && !ASKING.test(t)) return { calls: [{ name: 'draft_message', args: { channel: 'email' } }] };
      if (any(t, ['no answer', 'not home', 'didnt answer', 'did not answer', 'nobody answered', 'nobody came']) || /\b(nobody|no one|nobodys|noones)\b.*\bhome\b/.test(t)) return { calls: [{ name: 'log_knock', args: { outcome: 'not_home' } }] };
      if (any(t, ['not interested', 'said no', 'no thanks', 'not now'])) return { calls: [{ name: 'log_knock', args: { outcome: 'not_interested' } }] };
      if (any(t, ['talked to', 'spoke to', 'spoke with', 'talked with', 'they were home'])) return { calls: [{ name: 'log_knock', args: { outcome: 'talked' } }] };
      if ((/\b(book|schedule)\b/.test(t) && !/\bhow many\b/.test(t)) || (/\b(set up|put)\b/.test(t) && any(t, ['inspection', 'appointment']))) {
        const w = window.NimbusTools.parseWhen(raw);
        if (!w.iso) return { calls: [], say: w.needTime ? 'What time on ' + w.day.toLocaleDateString('en-US', { weekday: 'long' }) + '?' : 'Sure. What day and time?', state: { pending: 'time', day: w.day ? w.day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : '' } };
        return { calls: [{ name: 'book_inspection', args: { when: raw } }] };
      }
      if (/\badd\b/.test(t) && any(t, ['past customer', 'old customer', 'previous customer', 'customer'])) {
        const p = parseCustomer(raw.replace(/^.*?customer[s]?\b[:,]?\s*(named|called)?/i, ''));
        if (p.name && p.address) return { calls: [{ name: 'add_past_customer', args: p }] };
        return { calls: [], say: 'Sure. What is their name and street address?', state: { pending: 'customer' } };
      }
      if (/how many/.test(t) && any(t, ['inspection', 'appointment'])) return { calls: [{ name: 'count', args: { metric: /today/.test(t) ? 'inspections_today' : /next week/.test(t) ? 'inspections_next_week' : 'inspections_this_week' } }] };
      if (/how many/.test(t) && any(t, ['reached', 'texted', 'contacted'])) return { calls: [{ name: 'count', args: { metric: 'reached_today' } }] };
      if (any(t, ['how many jobs', 'how many won', 'jobs won', 'how did we do'])) return { calls: [{ name: 'count', args: { metric: 'won' } }] };
      if (any(t, ['my pipeline', 'pipeline look', 'where do things stand'])) return { calls: [{ name: 'count', args: { metric: 'pipeline' } }] };
      if (any(t, ['last night', 'what hit', 'any hail', 'new storm', 'latest storm', 'last storm', 'did it hail', 'hail yesterday', 'storm yesterday'])) return { calls: [{ name: 'latest_storm', args: {} }] };
      if (any(t, ['route', 'where do i go', 'where should i go', 'plan my day', 'start my day', 'start today'])) return { calls: [{ name: 'show_route', args: {} }] };
      if (any(t, ['next house', 'next home', 'next stop', 'next one', 'whos next', 'who is next', 'next door', 'next address'])) return { calls: [{ name: 'open_next_house', args: {} }] };
      const onSt = /\b(?:house|home|place|one|the)\s+(?:on|at)\s+((?:\d{2,6}\s+)?[a-z][a-z0-9 ]{2,30}?)(?:\s+(?:whos|who is|what|is|that|please|for me)\b.*)?$/.exec(t);
      if (onSt && !/\b(today|list|route|map)\b/.test(onSt[1])) return { calls: [{ name: 'open_home', args: { query: onSt[1].trim() } }], after: /\bwho/.test(t) ? 'The owner\'s name shows on the record once you message them; until then it is private.' : '' };
      const addr = /\b(open|show|pull up|find|go to)\b.*?\b(\d{2,6}\s+[a-z0-9 ]{3,40})$/.exec(t);
      if (addr) return { calls: [{ name: 'open_home', args: { query: addr[2] } }] };
      if (!ASKING.test(t) && any(t, ['open the record', 'open this house', 'open this home', 'full record', 'open it'])) return { calls: [{ name: 'open_home', args: {} }] };
      const scr = [['radar', ['turnover radar', 'radar tab']], ['storms', ['storm map', 'storms', 'hail map']], ['pipeline', ['pipeline', 'the board']], ['calendar', ['calendar', 'schedule for']], ['customers', ['past customers', 'customers']], ['inbox', ['inbox', 'replies', 'messages']], ['results', ['results', 'numbers', 'revenue']], ['seo', ['seo', 'website', 'blog']], ['today', ['today', 'home screen', 'my list', 'go back']]];
      if (/\b(open|show|go to|take me|pull up|bring up|switch to|back to)\b/.test(t) && !ASKING.test(t)) {
        for (const [k, keys] of scr) if (any(t, keys)) return { calls: [{ name: 'open_screen', args: { screen: k } }] };
      }

      // explain things
      if (/\bwhys?\b/.test(t) && /\b(list|on here|pick|picked|this one|this house|this home|chose|choose)\b/.test(t)) { const d = dynamic('why'); return { calls: [], say: d || 'Open a home, or say open the next house, and ask me again.' }; }
      if (/\broof\b/.test(t) && /\b(big|bigs|size|squares|legit|accurate|sure|right|real|trust|measure)\b/.test(t)) { const d = dynamic('roof'); return { calls: [], say: d || KB.topics.roof_size.say }; }
      if (/\bhail\b/.test(t) && /\b(this|here|house|home|how much|how big)\b/.test(t) && !/\b(last night|yesterday|new)\b/.test(t)) { const d = dynamic('hail'); if (d) return { calls: [], say: d }; }
      if (/\b(who|whos|owner|name)\b/.test(t) && /\b(house|home|that|this|live|lives|owns)\b/.test(t)) return { calls: [], say: 'Owner names stay private on the screen until you message the home. The record shows the first letter, and the full name once you have reached out.' };
      const ex = explain(t);
      if (ex) return { calls: ex.tab === 'radar' && window.NimbusTools.screen() === 'daily' ? [{ name: 'open_screen', args: { screen: 'radar' } }] : [], say: ex.say };
      // the older answers (who replied, what's due, biggest storm this month, coverage) from lib/nimbus-shell.js
      if (window.Nimbus && Nimbus.answer && /(repl|answered|wrote back|texted back|due|overdue|follow|this month|how many homes|counties|coverage|watching|best time|what time)/.test(t)) {
        const r = Nimbus.answer(raw);
        if (r && !r.fallback) { if (r.go) Nimbus.run(r.go.screen, r.go.params); return { calls: [], say: strip(r.html).replace(/\s*(Open|See it on the map|Open the inbox|Open today.s list|Back to the list|open the home)[^.]*\.\s*$/i, '') }; }
      }
      return { calls: [], say: 'I did not get that one. You can say things like: show me today\'s route, open the next house, book an inspection Tuesday at 3, or what is the Turnover Radar.', miss: true };
    });
  }
  // "Maria Lopez, 412 Oak Street, Plano, phone 972 555 0101" -> { name, address, city, phone }
  function parseCustomer(s) {
    s = String(s || '').replace(/^\s*(named|called|its|it is|thats|this is)\s+/i, '').trim();
    const ph = /(\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4})/.exec(s), phone = ph ? ph[1] : '';
    if (ph) s = s.replace(ph[0], ' ').replace(/\b(phone|number|cell)\b/ig, ' ');
    const m = /^(.*?)[,\s]+(?:at|on|lives at|address)?\s*(\d{1,6}\s+[A-Za-z0-9 .'-]+?)(?:,\s*([A-Za-z .'-]+))?\s*[,.]?\s*$/.exec(s.trim());
    if (!m) return { name: '', address: '', phone };
    const name = m[1].replace(/\b(at|on|lives)\s*$/i, '').replace(/[,.]+$/, '').trim();
    return { name: name.replace(/\b\w/g, c => c.toUpperCase()), address: m[2].trim().replace(/\b\w/g, c => c.toUpperCase()), city: (m[3] || '').trim(), phone };
  }
  window.NimbusBrain = { think, explain, parseCustomer, get kb() { return KB; }, ready: kbP };
})();
