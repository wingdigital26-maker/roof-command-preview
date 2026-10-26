/* customers.js: Past customers (Jack 10-26), a CRM view (#/crm/customers) next to Inbox, Pipeline, Calendar and Home.
   The roofer's own past jobs: import a CSV (with a column mapper) or add one by hand. Each customer has three asks, all
   human-tapped (a tap opens Messages or the mail app with the words filled in, like the record's Text and Email dialogs):
     review       a Google review ask with the roofer's review link (set once here, kept on this device)
     referral     "know a neighbor who had hail damage?"; a referral can become a new lead in the pipeline
     testimonial  a short reply or a phone video
   Status per customer per ask (asked, replied, then review left / referral given / testimonial received) and a summary.
   Knock the neighbors: the homes around a past job (the app's own homes data), street by street, as a route.
   Texting your own past customers is the legal lane; texts still carry STOP wording. No insurance or deductible talk.
   Stored on this device only (localStorage rc.t.pastCust). Nothing here sends anything or writes to a server.
   The public preview build turns SAMPLE on: five obviously sample customers (fake names, 555 numbers) so the flow shows. */
(function () {
  'use strict';
  const RC = window.RC, esc = RC.esc, $ = (s, r) => (r || document).querySelector(s);
  const root = $('#pc'); if (!root) return;
  const SAMPLE = true;   // scripts/publish/build_preview.py flips this for the public preview only
  const B = window.activeRoofer ? activeRoofer() : {}, CO = B.name || 'our company', OWN = B.owner || '';
  const K = 'pastCust', RK = 'pcReviewUrl';
  const say = (m, u) => (window.homeSay || (() => { }))(m, u);
  const fmt = n => Number(n || 0).toLocaleString('en-US');
  const active = () => window.crmView && window.crmView() === 'customers';
  const FLOWS = [
    ['review', 'Review', [['asked', 'Asked'], ['replied', 'Replied'], ['done', 'Review left']]],
    ['referral', 'Referral', [['asked', 'Asked'], ['replied', 'Replied'], ['done', 'Referral given']]],
    ['testimonial', 'Testimonial', [['asked', 'Asked'], ['replied', 'Replied'], ['done', 'Testimonial in']]]
  ];
  const FIELDS = [['name', 'Name', /^(full ?)?name|customer|client|homeowner/i], ['first', 'First name', /first/i], ['last', 'Last name', /last|surname/i], ['phone', 'Phone', /phone|mobile|cell|tel/i], ['email', 'Email', /e-?mail/i],
    ['addr', 'Address', /address|street|addr/i], ['city', 'City', /^city|town/i], ['zip', 'ZIP', /zip|postal/i], ['jobDate', 'Job date', /date|completed|installed|finished|when/i], ['jobType', 'Job type', /type|job|work|service|product|scope/i], ['ok', 'OK to contact', /ok.?to|consent|contact|opt/i]];
  // the onboarding packet's template (tour/onboarding/past-customers-template.csv): first_name, last_name, ..., ok_to_contact

  // ---------- the list ----------
  const SEED = [
    { id: 'pc-s1', name: 'Alex Sample', phone: '(972) 555-0101', email: 'alex.sample@example.com', gi: 222352, addr: '3726 Navarro Way', city: 'Frisco', zip: '75034', jobDate: '2026-06-20', jobType: 'Full re-roof, architectural shingles', flows: { review: { s: 'done', at: '2026-07-02T15:00:00Z' }, referral: { s: 'asked', at: '2026-07-10T15:00:00Z' } } },
    { id: 'pc-s2', name: 'Jordan Sample', phone: '(972) 555-0102', email: 'jordan.sample@example.com', gi: 35368, addr: '8502 Holly St', city: 'Frisco', zip: '75034', jobDate: '2026-07-08', jobType: 'Full re-roof', flows: { review: { s: 'asked', at: '2026-07-15T15:00:00Z' } } },
    { id: 'pc-s3', name: 'Casey Sample', phone: '(972) 555-0103', email: '', gi: 243978, addr: '202 Dublin Dr', city: 'Richardson', zip: '75080', jobDate: '2026-05-12', jobType: 'Hail repair and gutters', flows: { review: { s: 'done', at: '2026-05-20T15:00:00Z' }, referral: { s: 'done', at: '2026-06-01T15:00:00Z', note: 'Neighbor on Dublin Dr' }, testimonial: { s: 'done', at: '2026-06-03T15:00:00Z' } } },
    { id: 'pc-s4', name: 'Morgan Sample', phone: '(972) 555-0104', email: 'morgan.sample@example.com', gi: 259636, addr: '174 Lakeside Dr', city: 'Rockwall', zip: '75032', jobDate: '2026-08-02', jobType: 'Full re-roof, impact-rated shingles', flows: {} },
    { id: 'pc-s5', name: 'Riley Sample', phone: '(972) 555-0105', email: 'riley.sample@example.com', gi: 34209, addr: '5706 Grosseto Dr', city: 'Frisco', zip: '75034', jobDate: '2026-09-15', jobType: 'Full re-roof', flows: { testimonial: { s: 'replied', at: '2026-09-25T15:00:00Z' } } }
  ].map(c => Object.assign(c, { sample: true }));
  function list() {
    let l = RC.__get(K, null);
    if (!Array.isArray(l)) { l = SAMPLE ? JSON.parse(JSON.stringify(SEED)) : []; if (SAMPLE) RC.__set(K, l); }
    return l;
  }
  const save = l => RC.__set(K, l);
  const byId = id => list().find(c => c.id === id);
  function patch(id, f) { const l = list(), c = l.find(x => x.id === id); if (!c) return null; f(c); save(l); return c; }
  const first = n => { const w = String(n || '').trim().split(/\s+/)[0] || ''; return /^[A-Za-z'-]{2,}$/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''; };
  const reviewUrl = () => (RC.__get(RK, '') || B.reviewUrl || B.review_url || '').trim();
  const flowOf = (c, k) => (c.flows && c.flows[k]) || { s: '' };
  const stLabel = (k, s) => { const f = FLOWS.find(x => x[0] === k); const o = f && f[2].find(x => x[0] === s); return o ? o[1] : 'Not asked'; };
  const day = iso => { const d = new Date(iso); return isFinite(d) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; };
  const jobDay = s => { if (!s) return ''; const d = /^\d{4}-\d\d-\d\d$/.test(s) ? new Date(s + 'T12:00:00') : new Date(s); return isFinite(d) ? d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : String(s); };

  // ---------- the words (the roofer's voice; no em dashes; no insurance or deductible promises) ----------
  function words(c, k, ch) {
    const f = first(c.name), hi = f ? 'Hi ' + f : 'Hi', me = OWN ? OWN + ' with ' + CO : CO, st = String(c.addr || '').replace(/^\d+\s+/, '');
    const url = reviewUrl() || '[your Google review link]';
    const T = {
      review: [`${hi}, this is ${me}. Thanks again for trusting us with your roof${st ? ' on ' + st : ''}. If you have a minute, a quick Google review helps your neighbors find a roofer they can trust: ${url}`,
        'Quick favor from ' + CO, `${hi},\n\nThis is ${me}. Thank you again for trusting us with your roof${st ? ' on ' + st : ''}.\n\nIf you have a minute, a short Google review would mean a lot to our crew and helps your neighbors find a roofer they can trust:\n${url}\n\nThank you,\n${OWN || CO}`],
      referral: [`${hi}, ${me} here. Hope the roof is treating you well. Do you know a neighbor who had hail damage or has a roof that needs a look? We would be glad to take care of them the same way we did for you. Just reply with their name and number.`,
        'Know a neighbor who needs a roof check?', `${hi},\n\n${me} here. Hope the new roof is treating you well.\n\nIf a neighbor, friend or family member had hail damage or has a roof that needs a look, we would be glad to take care of them the same way we took care of you. Just reply with their name and number, or pass along ours.\n\nThank you,\n${OWN || CO}`],
      testimonial: [`${hi}, it's ${me}. Would you share a sentence or two about how your roof job went? A short text back is perfect, or a 20 second phone video if you are up for it. With your OK we would share it, first name only.`,
        'Two sentences about your roof job?', `${hi},\n\nIt's ${me}. Would you share a sentence or two about how your roof job went? A short reply to this email is perfect, or a 20 second phone video if you are up for it.\n\nWith your OK we would share it on our site and pages, first name only.\n\nThank you,\n${OWN || CO}`]
    }[k];
    if (ch === 'sms') return { body: T[0] + '\n\nReply STOP to opt out.' };
    return { subject: T[1], body: T[2] + "\n\nIf you would rather not hear from us, just reply and say so." };
  }

  // ---------- paint ----------
  let q = '', show = 'all';
  function summary(l) {
    const n = k => l.filter(c => ['asked', 'replied', 'done'].includes(flowOf(c, k).s)).length, d = k => l.filter(c => flowOf(c, k).s === 'done').length;
    return [[fmt(l.length), 'Past customers'], [fmt(n('review')), 'Reviews asked'], [fmt(d('review')), 'Reviews left'], [fmt(d('referral')), 'Referrals in'], [fmt(d('testimonial')), 'Testimonials']];
  }
  function render() {
    if (!active()) return;
    const l = list();
    if (!l.length) {
      root.innerHTML = `<div class="pch"><h2>Past customers<small>Your past jobs: reviews, referrals and testimonials, plus the neighbors to knock.</small></h2></div>
        <div class="pcempty"><b>No past customers yet</b><p>Bring in your past jobs from a spreadsheet (CSV: name, phone, email, address, job date, job type) or add one by hand. They stay on this device.</p>
        <button type="button" class="pcb pri" data-p="import">Import a CSV</button><button type="button" class="pcb" data-p="add">Add a customer</button>
        <ol><li><b>Ask for a review.</b> One tap opens the text with your Google link filled in. You send it.</li><li><b>Ask for a referral.</b> A neighbor they send becomes a new lead on your pipeline.</li><li><b>Knock the neighbors.</b> The homes around each past job, street by street.</li></ol></div>`;
      fileInput(); return;
    }
    const ql = q.toLowerCase();
    const rows = l.filter(c => (!ql || [c.name, c.addr, c.city, c.phone, c.email, c.jobType].join(' ').toLowerCase().includes(ql)) &&
      (show === 'all' || (show === 'todo' ? FLOWS.some(f => !flowOf(c, f[0]).s) : FLOWS.some(f => flowOf(c, f[0]).s === 'replied'))))
      .sort((a, b) => String(b.jobDate || '').localeCompare(String(a.jobDate || '')));
    root.innerHTML = `<div class="pch"><h2>Past customers<small>Texts and emails open on your phone with the words filled in. You tap send.</small></h2>
        <button type="button" class="pcb" data-p="import">Import CSV</button><button type="button" class="pcb pri" data-p="add">Add a customer</button></div>
      <div class="pcsum">${summary(l).map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('')}</div>
      <div class="pcset"><span>Google review link</span><input id="pcRev" type="url" inputmode="url" placeholder="https://g.page/r/... (from your Google Business Profile, Ask for reviews)" value="${esc(reviewUrl())}" aria-label="Google review link"><button type="button" class="pcb sm" data-p="saverev">Save</button></div>
      <div class="pctools"><input type="search" id="pcQ" placeholder="Search name, address or job" value="${esc(q)}" aria-label="Search past customers"><select id="pcShow" aria-label="Show"><option value="all"${show === 'all' ? ' selected' : ''}>All customers</option><option value="todo"${show === 'todo' ? ' selected' : ''}>Something not asked yet</option><option value="replied"${show === 'replied' ? ' selected' : ''}>Replied, needs a follow up</option></select></div>
      <div class="pclist" role="list">${rows.map(row).join('') || '<p class="pcd note" style="padding:16px 0">No customer matches.</p>'}</div>`;
    fileInput();
  }
  function row(c) {
    const fl = FLOWS.map(([k, name]) => { const f = flowOf(c, k), s = f.s;
      return `<div class="pcf"><div class="t"><span>${name}</span>${f.at && s ? `<span>${esc(day(f.at))}</span>` : ''}</div><div class="s ${s === 'done' ? 'done' : s ? '' : 'off'}">${esc(stLabel(k, s))}</div>
        <div class="b"><button type="button" class="pcb sm" data-p="ask" data-k="${k}" data-id="${esc(c.id)}"${c.noContact ? ' disabled title="Marked not OK to contact"' : ''}>${s ? 'Again' : 'Ask'}</button><button type="button" class="pcb sm" data-p="status" data-k="${k}" data-id="${esc(c.id)}" aria-label="${name} status">Status</button></div></div>`; }).join('');
    return `<div class="pcrow" role="listitem"><div class="who"><b>${esc(c.name || 'No name')}${c.sample ? '<span class="tag">Sample</span>' : ''}${c.noContact ? '<span class="tag">Not OK to contact</span>' : ''}</b><span>${esc([c.addr, c.city].filter(Boolean).join(', ') || 'No address')}</span><span>${esc([jobDay(c.jobDate), c.jobType].filter(Boolean).join(', '))}</span></div>
      <div class="pcflows">${fl}</div>
      <div class="more"><button type="button" class="pcb sm" data-p="nbrs" data-id="${esc(c.id)}"${c.addr ? '' : ' disabled'}>Knock the neighbors</button><button type="button" class="pcb sm" data-p="edit" data-id="${esc(c.id)}">Edit</button></div></div>`;
  }

  // ---------- dialogs ----------
  let dlg = null;
  function open(html, onReady) {
    if (!dlg) { dlg = document.createElement('dialog'); dlg.className = 'pcd'; document.body.appendChild(dlg); dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); }); }
    dlg.innerHTML = html; if (!dlg.open) dlg.showModal(); if (onReady) onReady(dlg);
  }
  const close = () => dlg && dlg.open && dlg.close();
  const hd = (t, s) => `<div class="hd"><h3>${t}${s ? '<small>' + s + '</small>' : ''}</h3><button type="button" class="pcb sm" data-x>Close</button></div>`;

  function askDlg(id, k) {
    const c = byId(id); if (!c) return;
    const name = FLOWS.find(f => f[0] === k)[1];
    let ch = c.phone ? 'sms' : 'email';
    const draw = () => {
      const w = words(c, k, ch), tw = RC.textWindow ? RC.textWindow() : null, inHours = !RC.inTextWindow || RC.inTextWindow(new Date());
      const noTo = ch === 'sms' ? !c.phone : !c.email;
      open(hd(`${name} ask: ${esc(c.name || 'customer')}`, ch === 'sms' ? esc(c.phone || 'No phone on file') : esc(c.email || 'No email on file')) +
        `<div class="bd"><div class="seg" role="group" aria-label="Send by"><button type="button" data-ch="sms" aria-pressed="${ch === 'sms'}">Text</button><button type="button" data-ch="email" aria-pressed="${ch === 'email'}">Email</button></div>
        ${k === 'review' && !reviewUrl() ? '<p class="warn">Add your Google review link on the Past customers page first, so the text carries it.</p>' : ''}
        ${ch === 'sms' && !inHours && tw ? `<p class="warn">Outside your texting hours. ${esc(tw.label || '')}</p>` : ''}
        ${ch === 'email' ? `<label>Subject<input id="pcSj" value="${esc(w.subject)}"></label>` : ''}<label>Message<textarea id="pcBody">${esc(w.body)}</textarea></label>
        <p class="note">${ch === 'sms' ? 'Opens Messages on your phone with this filled in. You press send.' : 'Opens your mail app with this filled in. You press send.'} Marked Asked when you tap.</p></div>
        <div class="ft"><a class="pcb pri" id="pcGo" href="#"${noTo ? ' aria-disabled="true"' : ''}>${ch === 'sms' ? 'Open in Messages' : 'Open in email'}</a><button type="button" class="pcb" data-x>Cancel</button></div>`, d => {
        d.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => { ch = b.dataset.ch; draw(); });
        const go = d.querySelector('#pcGo');
        go.onclick = e => {
          if (noTo) { e.preventDefault(); say(ch === 'sms' ? 'No phone on file. Edit the customer to add one.' : 'No email on file. Edit the customer to add one.'); return; }
          const body = d.querySelector('#pcBody').value;
          go.href = ch === 'sms' ? 'sms:' + String(c.phone).replace(/[^\d+]/g, '') + '?&body=' + encodeURIComponent(body)
            : 'mailto:' + encodeURIComponent(c.email) + '?subject=' + encodeURIComponent(d.querySelector('#pcSj').value) + '&body=' + encodeURIComponent(body);
          patch(id, x => { x.flows = x.flows || {}; const f = x.flows[k] || {}; if (f.s !== 'replied' && f.s !== 'done') f.s = 'asked'; f.at = new Date().toISOString(); f.via = ch; x.flows[k] = f; (x.log = x.log || []).unshift({ at: f.at, k, ch, body }); });
          setTimeout(() => { close(); render(); }, 60);
        };
      });
    };
    draw();
  }

  function statusDlg(id, k) {
    const c = byId(id); if (!c) return;
    const [, name, opts] = FLOWS.find(f => f[0] === k), f = flowOf(c, k);
    open(hd(`${name}: ${esc(c.name || 'customer')}`, f.s ? esc(stLabel(k, f.s)) + (f.at ? ', ' + esc(day(f.at)) : '') : 'Not asked yet') +
      `<div class="bd"><div class="st" role="group" aria-label="${name} status"><button type="button" data-s="" aria-pressed="${!f.s}">Not asked</button>${opts.map(([s, l]) => `<button type="button" data-s="${s}" aria-pressed="${f.s === s}">${l}</button>`).join('')}</div>
      ${k === 'referral' ? `<div style="margin-top:16px"><b style="font-size:14px">Got a referral?</b><p class="note" style="margin:4px 0 10px">Add the neighbor and they go on your pipeline as a new lead (and on Today's list) when the address is one of your homes.</p>
        <label>Their address<input id="rfA" placeholder="1234 Main St" autocomplete="off"></label><div class="two"><label>Name (optional)<input id="rfN"></label><label>Phone (optional)<input id="rfP" inputmode="tel"></label></div>
        <button type="button" class="pcb pri" id="rfGo">Add as a new lead</button><p class="note" id="rfOut"></p></div>` : ''}</div>
      <div class="ft"><button type="button" class="pcb" data-x>Done</button></div>`, d => {
      d.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { const s = b.dataset.s;
        patch(id, x => { x.flows = x.flows || {}; x.flows[k] = Object.assign({}, x.flows[k] || {}, { s, at: new Date().toISOString() }); if (!s) delete x.flows[k]; });
        d.querySelectorAll('[data-s]').forEach(o => o.setAttribute('aria-pressed', o === b ? 'true' : 'false')); render(); });
      const go = d.querySelector('#rfGo'); if (go) go.onclick = () => referral(id, d);
    });
  }

  // a referral: find the address in the roofer's homes (the header search's county copy), then a new lead in the pipeline
  function referral(id, d) {
    const a = d.querySelector('#rfA').value.trim(), nm = d.querySelector('#rfN').value.trim(), ph = d.querySelector('#rfP').value.trim(), out = d.querySelector('#rfOut'), c = byId(id);
    if (!a) { out.textContent = 'Type the address first.'; return; }
    out.textContent = 'Looking it up...';
    const find = window.STM ? STM.search(a, 3) : Promise.resolve([]);
    find.then(hits => {
      const h = hits && hits[0];
      const mark = lead => patch(id, x => { x.flows = x.flows || {}; x.flows.referral = { s: 'done', at: new Date().toISOString(), note: a }; (x.referrals = x.referrals || []).push({ at: new Date().toISOString(), addr: a, name: nm, phone: ph, lead: lead || null }); });
      if (!h) { mark(null); out.textContent = `Saved on ${c.name || 'this customer'}. ${a} is not one of the homes in your area data, so it is not on the pipeline.`; render(); return; }
      const hid = 'm' + h.i, home = { id: hid, addr: h.addr, city: h.city, zip: h.zip, from: 'referral' };
      RC.remember(home);
      if (RC.stage(hid) === 'new') RC.setStage(hid, 'new', `Referral from past customer ${c.name || ''}${nm ? ': ' + nm : ''}${ph ? ', ' + ph : ''}`.trim());
      else RC.note(hid, `Referral from past customer ${c.name || ''}${nm ? ': ' + nm : ''}${ph ? ', ' + ph : ''}`.trim());
      RC.add(home); mark(hid);
      out.innerHTML = `${esc(h.addr)}, ${esc(h.city)} is on your pipeline as a new lead and on Today's list. <button type="button" class="pcb sm" data-open="${esc(hid)}">Open the record</button>`;
      const ob = out.querySelector('[data-open]'); if (ob) ob.onclick = () => { close(); if (window.crmOpenHome) window.crmOpenHome(hid); };
      render();
    }).catch(() => { out.textContent = 'Could not look the address up. Try again.'; });
  }

  // ---------- add / edit ----------
  function editDlg(id) {
    const c = id ? byId(id) : {}, v = k => esc((c && c[k]) || '');
    open(hd(id ? 'Edit customer' : 'Add a past customer', 'Your own past job. Kept on this device.') +
      `<div class="bd"><label>Name<input id="fName" value="${v('name')}" autocomplete="off"></label><div class="two"><label>Phone<input id="fPhone" inputmode="tel" value="${v('phone')}"></label><label>Email<input id="fEmail" type="email" value="${v('email')}"></label></div>
      <label>Address<input id="fAddr" value="${v('addr')}" placeholder="1234 Main St" autocomplete="off"></label><div class="two"><label>City<input id="fCity" value="${v('city')}"></label><label>ZIP<input id="fZip" inputmode="numeric" value="${v('zip')}"></label></div>
      <div class="two"><label>Job date<input id="fDate" type="date" value="${/^\d{4}-\d\d-\d\d$/.test((c && c.jobDate) || '') ? v('jobDate') : ''}"></label><label>Job type<input id="fType" value="${v('jobType')}" placeholder="Full re-roof"></label></div></div>
      <div class="ft"><button type="button" class="pcb pri" id="fSave">${id ? 'Save' : 'Add customer'}</button>${id ? '<button type="button" class="pcb" id="fDel">Remove</button>' : ''}<button type="button" class="pcb" data-x>Cancel</button></div>`, d => {
      d.querySelector('#fSave').onclick = () => {
        const g = s => d.querySelector(s).value.trim(), rec = { name: g('#fName'), phone: g('#fPhone'), email: g('#fEmail'), addr: g('#fAddr'), city: g('#fCity'), zip: g('#fZip'), jobDate: g('#fDate'), jobType: g('#fType') };
        if (!rec.name && !rec.addr) { say('Add at least a name or an address.'); return; }
        const l = list();
        if (id) { const x = l.find(y => y.id === id); if (x) { if (x.addr !== rec.addr) delete x.gi; Object.assign(x, rec); } }
        else l.unshift(Object.assign({ id: 'pc-' + Date.now().toString(36), flows: {}, added: new Date().toISOString() }, rec));
        save(l); close(); render(); say(id ? 'Customer saved.' : 'Customer added.');
      };
      const del = d.querySelector('#fDel'); if (del) del.onclick = () => { const l = list(), x = l.find(y => y.id === id); save(l.filter(y => y.id !== id)); close(); render(); say('Customer removed.', () => { const m = list(); m.unshift(x); save(m); render(); }); };
    });
  }

  // ---------- CSV import with a column mapper ----------
  function parseCSV(t) {
    const rows = []; let r = [], f = '', qd = false;
    t = String(t || '').replace(/^﻿/, '');
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (qd) { if (ch === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else qd = false; } else f += ch; continue; }
      if (ch === '"') qd = true; else if (ch === ',') { r.push(f); f = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; r.push(f); f = ''; if (r.some(x => x.trim())) rows.push(r); r = []; } else f += ch;
    }
    r.push(f); if (r.some(x => x.trim())) rows.push(r);
    return rows;
  }
  function fileInput() {
    let fi = $('#pcFile'); if (fi) return;
    fi = document.createElement('input'); fi.type = 'file'; fi.id = 'pcFile'; fi.accept = '.csv,text/csv'; fi.hidden = true; document.body.appendChild(fi);
    fi.onchange = () => { const f = fi.files && fi.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { fi.value = ''; mapper(f.name, parseCSV(rd.result)); }; rd.readAsText(f); };
  }
  function mapper(fname, rows) {
    if (rows.length < 2) { say('That file has no rows under its header.'); return; }
    const head = rows[0].map(h => h.trim()), body = rows.slice(1), used = new Set();
    const guess = {}; FIELDS.forEach(([k, , re]) => { const i = head.findIndex((h, j) => !used.has(j) && re.test(h)); if (i >= 0) { guess[k] = i; used.add(i); } });
    const opt = k => `<option value="-1">Not in this file</option>` + head.map((h, i) => `<option value="${i}"${guess[k] === i ? ' selected' : ''}>${esc(h || 'Column ' + (i + 1))}</option>`).join('');
    open(hd('Import past customers', `${esc(fname)}: ${fmt(body.length)} rows. Match your columns, then import.`) +
      `<div class="bd"><div class="two">${FIELDS.map(([k, l]) => `<label>${l}<select data-f="${k}">${opt(k)}</select></label>`).join('')}</div>
      <div class="grp"><span>First rows, as they will import</span></div><div id="pcPrev"></div>
      <p class="note">Rows with no name and no address are skipped. A row marked not OK to contact comes in with its asks turned off. A row whose phone, email or address is already on your list is skipped too. Kept on this device only.</p></div>
      <div class="ft"><button type="button" class="pcb pri" id="pcImp">Import</button><button type="button" class="pcb" data-x>Cancel</button></div>`, d => {
      const map = () => { const m = {}; d.querySelectorAll('[data-f]').forEach(s => m[s.dataset.f] = +s.value); return m; };
      const recOf = (r, m) => { const o = {}; FIELDS.forEach(([k]) => o[k] = m[k] >= 0 ? String(r[m[k]] || '').trim() : ''); if (!o.name && (o.first || o.last)) o.name = (o.first + ' ' + o.last).trim(); delete o.first; delete o.last;
        o.noContact = /^(no|n|false|0)$/i.test(o.ok || ''); delete o.ok; if (!o.noContact) delete o.noContact;
        const dd = o.jobDate && new Date(o.jobDate); if (dd && isFinite(dd) && !/^\d{4}-\d\d-\d\d$/.test(o.jobDate)) o.jobDate = dd.toISOString().slice(0, 10); return o; };
      const prev = () => { const m = map(); const PV = [['name', 'Name'], ['phone', 'Phone'], ['addr', 'Address'], ['city', 'City'], ['jobDate', 'Job date'], ['jobType', 'Job type']];
        d.querySelector('#pcPrev').innerHTML = `<table><tr>${PV.map(f => `<th>${f[1]}</th>`).join('')}<th>Contact</th></tr>${body.slice(0, 3).map(r => { const o = recOf(r, m); return `<tr>${PV.map(([k]) => `<td>${esc(o[k])}</td>`).join('')}<td>${o.noContact ? 'No' : 'OK'}</td></tr>`; }).join('')}</table>`; };
      d.querySelectorAll('[data-f]').forEach(s => s.onchange = prev); prev();
      d.querySelector('#pcImp').onclick = () => {
        const m = map(), l = list(), key = x => [String(x.phone || '').replace(/\D/g, '').slice(-10), String(x.email || '').toLowerCase(), String(x.addr || '').toLowerCase()];
        const seen = new Set(); l.forEach(x => key(x).forEach(v => v && seen.add(v)));
        let n = 0, skip = 0; const t = Date.now();
        body.forEach((r, i) => { const o = recOf(r, m); if (!o.name && !o.addr) { skip++; return; } if (key(o).some(v => v && seen.has(v))) { skip++; return; }
          key(o).forEach(v => v && seen.add(v)); l.push(Object.assign({ id: 'pc-' + t.toString(36) + '-' + i, flows: {}, added: new Date().toISOString(), from: fname }, o)); n++; });
        save(l); close(); render(); say(`${fmt(n)} past customers imported${skip ? `, ${fmt(skip)} skipped` : ''}.`);
      };
    });
  }

  // ---------- knock the neighbors: the homes around a past job, street by street ----------
  let hbP = null;
  const homesBin = () => hbP || (hbP = fetch((window.STM ? STM.BASE : '../lib/st-data-dfw/') + 'homes.bin').then(r => r.ok ? r.arrayBuffer() : null).catch(() => null));
  const catP = () => fetch((window.STM ? STM.BASE : '../lib/st-data-dfw/') + 'catalog.json').then(r => r.json());
  function resolve(c) {
    if (c.gi != null) return Promise.resolve(c.gi);
    if (!window.STM || !c.addr) return Promise.resolve(null);
    return STM.search(c.addr, 5).then(hits => { const h = (hits || []).find(x => (!c.city || String(x.city).toLowerCase() === c.city.toLowerCase()) && (!c.zip || x.zip === c.zip)) || (hits || [])[0];
      if (h) patch(c.id, x => { x.gi = h.i; }); return h ? h.i : null; });
  }
  function nbrs(id) {
    const c = byId(id); if (!c) return;
    open(hd(`Knock the neighbors: ${esc(c.addr || '')}`, 'Looking up the homes around this job...') + '<div class="bd"></div>');
    Promise.all([resolve(c), homesBin(), catP()]).then(([gi, hb, cat]) => {
      if (gi == null || !hb) { open(hd('Knock the neighbors', esc(c.addr || '')) + `<div class="bd"><p class="note">${esc(c.addr || 'This address')} is not one of the homes in your area data, so there is no neighbor list. Check the address and city on the customer.</p></div>`); return; }
      const n = cat.total, xy = new Float32Array(hb, 0, n * 2), type = new Uint8Array(hb, n * 8, n), lon = xy[gi * 2], lat = xy[gi * 2 + 1];
      const R = 250, mx = 111320 * Math.cos(lat * Math.PI / 180), my = 111320, near = [];
      for (let i = 0; i < n; i++) { if (i === gi || (type[i] & 127) > 4) continue; const dx = (xy[i * 2] - lon) * mx; if (dx > R || dx < -R) continue; const dy = (xy[i * 2 + 1] - lat) * my; if (dy > R || dy < -R) continue; const dd = Math.hypot(dx, dy); if (dd <= R) near.push([dd, i]); }
      near.sort((a, b) => a[0] - b[0]);
      // one stop per address, never the job's own address: a county roll can list a multi-unit building once per unit
      const key = i => xy[i * 2] + ',' + xy[i * 2 + 1], cnt = new Map(); near.forEach(([, i]) => cnt.set(key(i), (cnt.get(key(i)) || 0) + 1));
      const pick = near.filter(([dd, i]) => dd > 3 && cnt.get(key(i)) <= 4).slice(0, 80);
      return Promise.all(pick.map(([dd, i]) => STM.meta(i).then(m => m && m.addr ? { id: 'm' + i, gi: i, dist: dd, addr: m.addr, street: m.street, no: m.houseNo || 0, city: m.city, zip: m.zip, year: m.year } : null))).then(hs => {
        const seenA = new Set([String(c.addr || '').toLowerCase()]);
        hs = hs.filter(h => h && !seenA.has(h.addr.toLowerCase()) && seenA.add(h.addr.toLowerCase())).slice(0, 24);
        const groups = new Map(); hs.forEach(h => { const k = h.street + '|' + h.city; if (!groups.has(k)) groups.set(k, { street: h.street, city: h.city, d: h.dist, homes: [] }); const g = groups.get(k); g.homes.push(h); g.d = Math.min(g.d, h.dist); });
        const gl = [...groups.values()].sort((a, b) => a.d - b.d); let stop = 0; const ordered = [];
        const html = gl.map(g => { g.homes.sort((a, b) => (a.no % 2) - (b.no % 2) || a.no - b.no);
          return `<div class="grp"><span>${esc(g.street)}, ${esc(g.city)}</span><span>${g.homes.length}</span></div>` + g.homes.map(h => { ordered.push(h); stop++;
            return `<button type="button" class="row" data-home="${esc(h.id)}"><i>${stop}</i><span>${esc(h.addr)}<small>${h.year ? 'Built ' + h.year + ', ' : ''}${Math.round(h.dist)} m from the job</small></span><em>${RC.isAdded && RC.isAdded(h.id) ? 'On Today' : ''}</em></button>`; }).join(''); }).join('');
        open(hd(`Knock the neighbors: ${esc(c.addr)}`, `The ${ordered.length} nearest homes, street by street. Your yard sign and a finished roof are the best door opener on this block.`) +
          `<div class="bd">${html}<p class="note">Homes from your area data (county roll). Tap a home to open its record. Walk one side of a street, then the other.</p></div>
          <div class="ft"><button type="button" class="pcb pri" id="nbAdd">Put them on Today's list</button><button type="button" class="pcb" data-x>Close</button></div>`, d => {
          d.querySelectorAll('[data-home]').forEach(b => b.onclick = () => { close(); if (window.crmOpenHome) window.crmOpenHome(b.dataset.home); });
          d.querySelector('#nbAdd').onclick = () => { let k = 0; ordered.forEach((h, j) => { const home = { id: h.id, addr: h.addr, city: h.city, zip: h.zip, from: 'past customer neighbors', stop: j + 1 }; RC.remember(home); if (RC.add(home)) k++; });
            close(); say(k ? `${k} neighbors added to Today's list` : 'They are already on Today\'s list', k ? () => ordered.forEach(h => RC.unadd(h.id)) : null); };
        });
      });
    }).catch(() => open(hd('Knock the neighbors') + '<div class="bd"><p class="note">Could not load the homes data. Try again.</p></div>'));
  }

  // ---------- events ----------
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-p]'); if (!b) return; const p = b.dataset.p, id = b.dataset.id;
    if (p === 'import') { fileInput(); $('#pcFile').click(); }
    else if (p === 'add') editDlg(null);
    else if (p === 'edit') editDlg(id);
    else if (p === 'ask') askDlg(id, b.dataset.k);
    else if (p === 'status') statusDlg(id, b.dataset.k);
    else if (p === 'nbrs') nbrs(id);
    else if (p === 'saverev') { const v = ($('#pcRev').value || '').trim(); if (v && !/^https:\/\//i.test(v)) { say('The review link should start with https://'); return; } RC.__set(RK, v); say(v ? 'Review link saved.' : 'Review link cleared.'); }
  });
  root.addEventListener('input', e => { if (e.target.id === 'pcQ') { q = e.target.value; const pos = e.target.selectionStart; render(); const n = $('#pcQ'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (er) { } } } });
  root.addEventListener('change', e => { if (e.target.id === 'pcShow') { show = e.target.value; render(); } });
  document.addEventListener('click', e => { if (dlg && dlg.open && e.target.closest('.pcd [data-x]')) close(); });
  RC.on(d => { if (d && d.remote && (d.key === K || d.key === RK) && active()) render(); });
  window.renderPC = render;
  window.RCPast = { list, words, parseCSV };
  if (active()) render();   // the page opened on #/crm/customers: crm.js set the view before this file ran
})();
