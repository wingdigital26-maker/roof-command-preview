/* nimbus-settings.js: "change the software by talking" (Jack 10-26). A safe settings layer the roofer edits by voice or tap.
   Not code: every setting is a validated value the app already knows how to read (RC.setting in lib/rc-state.js):
     routeSize     10 to 100 homes on Today's route                       (lib/rc-queue.js rebuilds today's list)
     cities        only these cities on Today's route, [] = all           (lib/rc-queue.js)
     textWindow    texting hours, never wider than the Texas window       (lib/rc-state.js textWindow / inTextWindow)
     stageNames    the pipeline stage names                               (lib/rc-state.js STAGES)
     tone          'casual' | 'standard' for the text drafts              (lib/rc-copy.js; the STOP line never changes)
     briefing      the morning briefing pill on or off                    (lib/nimbus-assistant.js)
     customFields  the roofer's own fields on every home record           (drawn here into the record; values in rc.t.fields)
   Each change returns { ok, label, say, undo }: Nimbus says it, asks "Want to keep it?" and Undo puts the old value back.
   Stored per roofer in rc.t.settings[<roofer>] (lib/rc-cloud.js syncs it per company when signed in).
   Anything outside this layer is a request to Wing: rc.t.wingRequests (synced) + scripts/nimbus/requests.jsonl via the local
   server, so Jack sees it. Plain script, shell only. window.NimbusSettings. */
(function () {
  'use strict';
  if (window.NimbusSettings || !window.RC) return;
  const RC = window.RC;
  const NIMBUS_LOCAL = 'http://127.0.0.1:4913';   // the laptop's Nimbus server: local dev only (never in the public build)
  const LEGAL = { monSat: [9, 20], sun: [12, 20] };   // Texas: 9 am to 8 pm, Sunday noon to 8 pm (roof-command-clients/TEXAS-RULES.md)
  const all = () => RC.__get('settings', {}) || {};
  const mine = () => Object.assign({}, all()[RC.rooferKey()] || {});
  function put(k, v) {
    const a = all(), m = Object.assign({}, a[RC.rooferKey()] || {});
    if (v == null) delete m[k]; else m[k] = v;
    a[RC.rooferKey()] = m; RC.__set('settings', a);
  }
  const hr = h => h === 12 ? 'noon' : (h % 12 || 12) + (h < 12 ? ' am' : ' pm');
  const title = s => String(s).toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

  // ---------- the cities the roofer's data covers (for "only show me Allen and McKinney") ----------
  let cityList = null;
  function cities() {
    if (cityList) return Promise.resolve(cityList);
    return RC.factsReady.then(() => Promise.all(((RC.catalog || {}).regions || []).map(r => fetch(RC.dataRoot + 'meta/' + r.id + '/cities.json').then(x => x.ok ? x.json() : null).catch(() => null))))
      .then(ls => { const set = new Set(); ls.forEach(l => (Array.isArray(l) ? l : (l && (l.cities || l.names)) || []).forEach(c => { if (typeof c === 'string' && c.trim()) set.add(c.trim()); })); cityList = [...set].sort(); return cityList; });
  }

  // ---------- after a change: the screens that read it draw again ----------
  function refresh(keys) {
    const frames = { daily: /routeSize|cities|stageNames|tone|textWindow/, home: /stageNames|customFields|tone|textWindow/ };
    Object.keys(frames).forEach(s => {
      if (!keys.some(k => frames[s].test(k))) return;
      const f = document.querySelector('#f iframe[data-screen="' + s + '"]');
      try { if (f && f.contentWindow && f.src !== 'about:blank' && f.getAttribute('src') !== null) f.contentWindow.location.reload(); } catch (e) { }
    });
    if (keys.indexOf('customFields') >= 0) drawFields(true);
  }

  // ---------- changing one setting: validate, keep the old value, apply, say it plainly ----------
  async function change(key, value) {
    const before = mine()[key], did = (label, say, after) => {
      put(key, after); refresh([key]);
      const undo = () => { put(key, before == null ? null : before); refresh([key]); };
      return { ok: true, label, say, undo, data: { setting: key, before: before == null ? null : before, after } };
    };
    if (key === 'routeSize') {
      const n = Math.round(+value);
      if (!(n >= 10 && n <= 100)) return { ok: false, say: 'The route can be 10 to 100 homes.' };
      return did('Route set to ' + n + ' homes', 'Done. Your route is now ' + n + ' homes a day. Want to keep it?', n);
    }
    if (key === 'cities') {
      const want = (Array.isArray(value) ? value : String(value || '').split(/,| and /)).map(s => String(s).trim()).filter(Boolean);
      if (!want.length || want.some(w => /^(all|every|any)( cities)?$/i.test(w))) return did('Route shows every city', 'Done. Your route covers every city again. Want to keep it?', null);
      const known = await cities(), got = [], miss = [];
      want.forEach(w => { const k = known.find(c => c.toLowerCase() === w.toLowerCase()) || known.find(c => c.toLowerCase().indexOf(w.toLowerCase()) === 0); if (k) got.push(k); else miss.push(w); });
      if (!got.length) return { ok: false, say: 'I could not find ' + miss.join(' or ') + ' in your area. Your cities include ' + known.slice(0, 6).join(', ') + '.' };
      return did('Route only in ' + got.join(', '), 'Done. Your route now only shows ' + got.join(' and ') + (miss.length ? '. I could not find ' + miss.join(' or ') : '') + '. Want to keep it?', got.map(c => c.toLowerCase()));
    }
    if (key === 'textWindow') {
      let o = +value.open, c = +value.close;
      if (!(o >= 0 && c > o && c <= 24)) return { ok: false, say: 'Say the hours like 10 to 7.' };
      if (o < LEGAL.monSat[0] || c > LEGAL.monSat[1]) return { ok: false, say: 'Texas allows texts only from 9 in the morning to 8 at night, noon on Sunday. Pick hours inside that.' };
      const w = { monSat: [o, c], sun: [Math.max(o, LEGAL.sun[0]), Math.min(c, LEGAL.sun[1])] };
      return did('Texting hours ' + hr(o) + ' to ' + hr(c), 'Done. Texting hours are now ' + hr(o) + ' to ' + hr(c) + (w.sun[0] !== o ? ', and noon to ' + hr(w.sun[1]) + ' on Sunday' : '') + '. Want to keep it?', w);
    }
    if (key === 'stageNames') {
      const from = String(value.from || '').toLowerCase().trim(), to = String(value.to || '').trim().slice(0, 32);
      const st = RC.STAGES.find(s => s[1].toLowerCase() === from) || RC.STAGES.find(s => s[1].toLowerCase().indexOf(from) >= 0);
      if (!st) return { ok: false, say: 'Your stages are ' + RC.STAGES.map(s => s[1]).join(', ') + '. Which one should I rename?' };
      if (!to) return { ok: false, say: 'What should I call ' + st[1] + '?' };
      const m = Object.assign({}, mine().stageNames || {}); m[st[0]] = to;
      return did('Renamed ' + st[1] + ' to ' + to, 'Done. ' + st[1] + ' is now called ' + to + '. Want to keep it?', m);
    }
    if (key === 'tone') {
      const t = /casual|friendly|relaxed|loose/i.test(String(value)) ? 'casual' : 'standard';
      return did('Text tone: ' + t, t === 'casual' ? 'Done. Your text drafts sound more casual now. The company name and the STOP line stay. Want to keep it?' : 'Done. Your text drafts are back to the standard wording. Want to keep it?', t);
    }
    if (key === 'briefing') {
      const on = !(value === false || /off|no|stop|disable/i.test(String(value)));
      return did('Morning briefing ' + (on ? 'on' : 'off'), on ? 'Done. The morning briefing is back on. Want to keep it?' : 'Done. No more morning briefing. Want to keep it?', on);
    }
    if (key === 'customFields') {
      const label = title(String(value.label || value || '').replace(/^(a |an )/i, '').trim()).slice(0, 40);
      const list = (mine().customFields || []).slice();
      if (value.remove) { const k = list.findIndex(f => f.label.toLowerCase() === label.toLowerCase()); if (k < 0) return { ok: false, say: 'There is no field called ' + label + '.' }; list.splice(k, 1); return did('Removed the ' + label + ' field', 'Done. I took the ' + label + ' field off the record. Want to keep it?', list); }
      if (!label) return { ok: false, say: 'What should the new field be called?' };
      if (list.some(f => f.label.toLowerCase() === label.toLowerCase())) return { ok: false, say: 'You already have a ' + label + ' field.' };
      if (list.length >= 10) return { ok: false, say: 'You have 10 fields already, the most I keep. Remove one first.' };
      list.push({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30), label });
      return did('Added a ' + label + ' field', 'Done. Every home record now has ' + (/^[aeiou]/i.test(label) ? 'an ' : 'a ') + label + ' field. Tell me the value on a home, like ' + label.toLowerCase() + ' is State Farm. Want to keep it?', list);
    }
    return { ok: false, say: 'That is not a setting I can change. I can send it to Wing as a request.' };
  }

  // ---------- custom field values on a home (rc.t.fields = { homeId: { key: value } }) ----------
  function setField(homeId, label, value) {
    const f = (mine().customFields || []).find(x => x.label.toLowerCase() === String(label || '').toLowerCase().trim() || x.key === label);
    if (!f) return { ok: false, say: 'There is no ' + label + ' field yet. Say add a field for ' + label + ' first.' };
    if (!homeId) return { ok: false, say: 'Open the home first.' };
    const all = RC.__get('fields', {}) || {}, before = (all[homeId] || {})[f.key];
    all[homeId] = Object.assign({}, all[homeId] || {}, { [f.key]: String(value || '').slice(0, 120) }); RC.__set('fields', all);
    drawFields(true);
    return { ok: true, label: f.label + ': ' + value, say: 'Saved. ' + f.label + ' is ' + value + '.', undo: () => { const a = RC.__get('fields', {}) || {}; a[homeId] = Object.assign({}, a[homeId] || {}); if (before == null) delete a[homeId][f.key]; else a[homeId][f.key] = before; RC.__set('fields', a); drawFields(true); } };
  }
  // the record shows the roofer's own fields under its facts (drawn from the shell into the record frame; no edit to c5-home)
  let lastDrawn = '';
  function drawFields(force) {
    const fr = document.querySelector('#f iframe[data-screen="home"]'); let w = null; try { w = fr && fr.contentWindow; } catch (e) { }
    const d = w && w.document; if (!d || !d.body) return;
    const H = w.HOME, id = H && String(H.rawId || H.id), list = mine().customFields || [];
    let box = d.getElementById('nbvFields');
    if (!id || !list.length || !(w.crmView && w.crmView() === 'home')) { if (box) box.remove(); lastDrawn = ''; return; }
    const vals = (RC.__get('fields', {}) || {})[id] || {}, sig = id + JSON.stringify(list) + JSON.stringify(vals);
    if (!force && box && sig === lastDrawn) return;
    lastDrawn = sig;
    const anchor = d.getElementById('knockPanel') || d.querySelector('main') || d.body;
    if (!box) {
      box = d.createElement('section'); box.id = 'nbvFields';
      box.style.cssText = 'margin:12px 0;padding:12px 14px;border:1px solid #D5D9E0;border-radius:8px;background:#fff;font:14px/1.4 Inter,system-ui,sans-serif;color:#0B1020';
      anchor.parentNode.insertBefore(box, anchor.nextSibling);
      box.addEventListener('change', e => { const i = e.target.closest('input[data-k]'); if (!i) return; const a = RC.__get('fields', {}) || {}; a[id] = Object.assign({}, a[id] || {}, { [i.dataset.k]: i.value.slice(0, 120) }); RC.__set('fields', a); });
    }
    box.innerHTML = '<h3 style="margin:0 0 8px;font-size:15px;font-weight:600">Your fields</h3>' + list.map(f =>
      '<label style="display:grid;grid-template-columns:minmax(90px,140px) minmax(0,1fr);gap:8px;align-items:center;margin:6px 0"><span style="color:#465065">' + RC.esc(f.label) + '</span>' +
      '<input data-k="' + RC.esc(f.key) + '" value="' + RC.esc(vals[f.key] || '') + '" style="font:inherit;padding:7px 9px;border:1px solid #C9CFD9;border-radius:6px;min-height:36px;width:100%;min-width:0;box-sizing:border-box"></label>').join('') +
      '<p style="margin:6px 0 0;font-size:12px;color:#465065">Added by you through Nimbus. Say "remove the ' + RC.esc(list[0].label.toLowerCase()) + ' field" to take one off.</p>';
  }
  setInterval(() => drawFields(false), 1500);

  // ---------- requests to Wing: anything the settings cannot do ----------
  function request(text, ctx) {
    const l = RC.__get('wingRequests', []) || [], it = { id: 'r' + Date.now().toString(36), at: new Date().toISOString(), roofer: RC.rooferKey(), text: String(text || '').slice(0, 500), screen: ctx || '', status: 'new' };
    l.push(it); RC.__set('wingRequests', l.slice(-100));
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !(window.RCT_AUTH && RCT_AUTH.public)) fetch(NIMBUS_LOCAL + '/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(it) }).catch(() => { });
    return { ok: true, label: 'Sent to Wing: ' + it.text.slice(0, 60), say: 'That one needs Wing. I sent it to Jack as a request, and it is on your list in Nimbus settings.', undo: () => RC.__set('wingRequests', (RC.__get('wingRequests', []) || []).filter(x => x.id !== it.id)) };
  }
  const requests = () => (RC.__get('wingRequests', []) || []).filter(r => r.roofer === RC.rooferKey());

  // plain words for the settings panel and for "what have I changed?"
  function describe() {
    const m = mine(), out = [];
    if (m.routeSize) out.push('Route: ' + m.routeSize + ' homes');
    if (m.cities && m.cities.length) out.push('Cities: ' + m.cities.map(title).join(', '));
    if (m.textWindow) out.push('Texting hours: ' + hr(m.textWindow.monSat[0]) + ' to ' + hr(m.textWindow.monSat[1]));
    if (m.stageNames) Object.keys(m.stageNames).forEach(k => out.push('Stage renamed: ' + m.stageNames[k]));
    if (m.tone) out.push('Text tone: ' + m.tone);
    if (m.briefing === false) out.push('Morning briefing: off');
    (m.customFields || []).forEach(f => out.push('Field: ' + f.label));
    return out;
  }
  window.NimbusSettings = { change, setField, request, requests, describe, cities, get: mine, LEGAL };
})();
