/* rc-proof.js: Bet 3, the Homeowner Proof Page (10-23). One small library the public page (tour/proof/) and the app
   (home record, Today cards) share. Plain script; load AFTER rc-state.js, brand.js and rc-copy.js. Exposes window.RCP.

   What it holds:
     link    the per-home page link: ?h=<token>&s=<send id>. The token is the home index scrambled with a check, so a typo
             or a guessed number does not open a page. It is NOT a secret: the page shows only public records (radar,
             county roll, city permits, LiDAR), never an owner name, phone or email. Production should swap it for a
             random token the server issues (one row per send), see docs/proofpage/LEGAL-CHECKLIST.md.
     events  sent / opened / consent / inspection asked / opted out, per home. Kept on this device ("rc.t.proof") and
             written onto the home's pipeline history (RC.logText / RC.logEmail / RC.note), so the Home timeline, the
             owner-name rule (RC.messaged) and Today all see them. On a real phone the homeowner's browser is not the
             rep's, so a cloud sink is needed: set window.RCP_SINK = '<https endpoint>' and every event is also POSTed
             (navigator.sendBeacon). No backend is chosen yet (Supabase REST is restricted): Jack's decision.
     consent the express written consent wording (TCPA 47 CFR 64.1200(f)(9) style, Texas Bus. & Com. Code ch. 305),
             versioned so each record says exactly which words the homeowner agreed to.
     copy    the pitch: SMS and email templates per touch, 2 or 3 variants each, the lead one marked with why.
             Human-tapped only: nothing here sends, schedules or calls.

   Copy rules: roofer named in the first words, the Proof Page link on its own, a STOP line on every text, no em dashes,
   no damage claims, no insurance promises, nothing about the deductible, no fake urgency, never "I saw you opened it". */
(function (root) {
  'use strict';
  if (root.RCP) return;
  const RC = root.RC;
  const LS = 'rc.t.proof';

  // ---------- link token ----------
  const K = 0x5A17C3;
  const chk = n => (((n % 1291) * 31 + 7) % 1296).toString(36).padStart(2, '0');
  function token(gi) { gi = +gi; return ((gi ^ K) >>> 0).toString(36) + chk(gi); }
  function decode(t) {
    t = String(t || '').toLowerCase(); if (!/^[0-9a-z]{3,12}$/.test(t)) return null;
    const gi = (parseInt(t.slice(0, -2), 36) ^ K) >>> 0;
    return chk(gi) === t.slice(-2) ? gi : null;
  }
  // where the page lives: the roofer's own domain once set (brand.js proofBase, e.g. https://check.<roofer>.com/), else
  // this app's own copy (tour/proof/). A public shortener (bit.ly and friends) is never used: carriers filter them.
  function base() {
    const r = (root.activeRoofer && root.activeRoofer()) || {};
    if (r.proofBase) return r.proofBase;
    const b = typeof root.BRAND_BASE === 'string' ? root.BRAND_BASE : (typeof BRAND_BASE !== 'undefined' ? BRAND_BASE : '');
    return (b || location.href.replace(/[^/]*$/, '')) + 'proof/';
  }
  const newSid = via => (via === 'email' ? 'e' : via === 'door' ? 'd' : 't') + Date.now().toString(36).slice(-6);
  function link(gi, sid) { return base() + '?h=' + token(gi) + (sid ? '&s=' + sid : ''); }

  // ---------- event store ----------
  const load = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { return {}; } };
  const save = d => { try { localStorage.setItem(LS, JSON.stringify(d)); } catch (e) { } try { root.dispatchEvent(new CustomEvent('rc-proof', { detail: d })); } catch (e) { } };
  const rec = (d, gi) => (d[gi] = d[gi] || { sends: [], opens: [], consent: null, ask: null, optout: null });
  // text/plain: a beacon to another origin may not carry application/json (proof-intake reads either)
  function sink(ev) {
    const u = root.RCP_SINK; if (!u) return false;
    try { return navigator.sendBeacon(u, new Blob([JSON.stringify(ev)], { type: 'text/plain' })); } catch (e) { return false; }
  }
  const hid = gi => 'm' + gi;
  const pretty = p => { const d = String(p || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : ''; };
  const TOUCH_NAME = { storm: 'first touch after the storm', follow: 'follow-up', door: 'after the door knock', viewed: 'after they opened the page' };

  // the rep tapped Open in Messages / Open in Mail on a Proof Page draft. The text or email goes on the home's record
  // (kind text/email, dir out), which is what unlocks the owner's full name (RC.messaged).
  function sent(gi, o) {
    o = o || {}; const d = load(), r = rec(d, gi), at = new Date().toISOString(), via = o.via === 'email' ? 'email' : 'text';
    r.sends.unshift({ sid: o.sid, at, via, touch: o.touch || 'storm', variant: o.variant || 'A' });
    save(d);
    const what = `Proof Page ${via === 'email' ? 'email drafted' : 'text opened in Messages'} (${TOUCH_NAME[o.touch] || 'proof page'}, version ${o.variant || 'A'})`;
    if (RC) { if (via === 'email') RC.logEmail(hid(gi), what, { subject: o.subject, body: o.body, proof: o.sid }); else RC.logText(hid(gi), what, { body: o.body, to: o.to, proof: o.sid }); }
    sink({ type: 'sent', gi, sid: o.sid, via, at });
  }
  // the homeowner's browser loaded the page (?preview=1, the rep's own look, never counts)
  function opened(gi, sid) {
    const d = load(), r = rec(d, gi), at = new Date().toISOString();
    const first = !r.opens.some(x => x.sid === (sid || null));
    r.opens.unshift({ at, sid: sid || null }); if (r.opens.length > 50) r.opens.length = 50;
    save(d);
    if (RC && first) RC.note(hid(gi), 'Homeowner opened the Proof Page' + (sid ? ' (from ' + (sid[0] === 'e' ? 'the email' : sid[0] === 'd' ? 'the door' : 'the text') + ')' : ''));
    sink({ type: 'opened', gi, sid, at });
  }
  // the consent box: phone and/or email, which channels, the exact words shown, when, and from which send
  function consent(gi, o) {
    o = o || {}; const d = load(), r = rec(d, gi), at = new Date().toISOString(), ph = pretty(o.phone);
    const c = { at, phone: ph || null, email: o.email || null, text: !!(ph && o.agree), version: CONSENT_VERSION, words: consentText(), sid: o.sid || null, page: o.page || null, ua: (navigator.userAgent || '').slice(0, 120) };
    r.consent = c; r.optout = null; save(d);
    if (RC) {
      const id = hid(gi), was = RC.recall(id) || {};
      // a fresh written yes overrides an older STOP (the homeowner opted back in, in writing)
      if (c.text && RC.optedOut(id)) RC.optOut(id, 'Proof Page', false);
      RC.remember(Object.assign({ id, gi }, c.text ? { optin: true, optinAt: at, optinHow: 'Proof Page consent box' } : {},
        ph && !was.phone ? { phone: ph, phoneBy: 'homeowner (Proof Page)' } : {}, o.email ? { email: o.email } : {}));
      RC.note(id, c.text ? `Written consent on the Proof Page: texts and calls from ${rname()} to ${ph} (wording ${CONSENT_VERSION})` : `Left ${[ph, o.email].filter(Boolean).join(' and ')} on the Proof Page (no consent to marketing texts)`);
    }
    sink({ type: 'consent', gi, at, phone: c.phone, email: c.email, text: c.text, version: c.version, words: c.text ? c.words : null, sid: c.sid });
    return c;
  }
  // "Book a free inspection": a request, not a booking (the rep confirms the time). Moves a New or Contacted home to the
  // hand-off stage ("Sent to <owner>") so it shows on the board.
  function ask(gi, o) {
    o = o || {}; const d = load(), r = rec(d, gi), at = new Date().toISOString();
    r.ask = { at, when: o.when || '', sid: o.sid || null }; save(d);
    if (RC) { const id = hid(gi), st = RC.stage(id);
      const what = 'Asked for a free inspection on the Proof Page' + (o.when ? ' (' + o.when + ')' : '');
      if (st === 'new' || st === 'called') RC.setStage(id, 'handoff', what); else RC.note(id, what); }
    sink({ type: 'ask', gi, at, when: o.when || '', sid: o.sid || null });
  }
  function optout(gi) {
    const d = load(), r = rec(d, gi), at = new Date().toISOString(); r.optout = { at }; save(d);
    if (RC) RC.optOut(hid(gi), 'Proof Page');
    sink({ type: 'optout', gi, at });
  }
  // what the app shows: { sends, lastSent, opens, lastOpen, consent, ask, optout } or null
  function status(gi) { const r = load()[gi]; if (!r) return null;
    return Object.assign({}, r, { lastSent: r.sends[0] || null, lastOpen: r.opens[0] || null }); }

  // ---------- consent wording ----------
  // Versioned: change the words, bump the version. The record keeps both.
  const CONSENT_VERSION = 'tx-1.0-2026-10-23';
  const rname = () => ((root.activeRoofer && root.activeRoofer()) || {}).name || 'this roofing company';
  function consentText() {
    const r = (root.activeRoofer && root.activeRoofer()) || {}, w = r.textWindow || r.callWindow || { monSat: [9, 20], sun: [12, 20] };
    const t = x => x === 12 ? 'noon' : (x % 12 || 12) + (x < 12 ? ' am' : ' pm');
    return `By checking this box and tapping the button below, I agree that ${rname()} may text and call me at the number I entered ` +
      `about a roof inspection and roofing services, including marketing messages, which may be sent using automated technology. ` +
      `I can reply STOP to any text to stop, or HELP for help. Consent is not a condition of any purchase. Message frequency varies; ` +
      `message and data rates may apply. Texts and calls only ${t(w.monSat[0])} to ${t(w.monSat[1])} Monday to Saturday and ${t(w.sun[0])} to ${t(w.sun[1])} Sunday, Central time. ` +
      `${rname()} will not sell or share my number. I agree this is my electronic signature.`;
  }

  // ---------- the pitch: templates per touch ----------
  const C = () => (RC && RC.copy) || root.RC_COPY || null;
  const sd = f => (C() ? C().stormDate(f) : '');
  const hs = h => (C() ? C().hailSize(h) : (h ? h + ' in' : ''));
  const streetName = s => String(s || '').replace(/^\s*\d+[A-Za-z]?\s+/, '');
  const hi = f => (f.first ? 'Hi ' + f.first : 'Hi');
  const STOP = 'Text STOP to opt out.', STOP_R = 'Reply STOP to opt out.';
  const join = a => a.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  // gates: 'any' = a cold homeowner is fine (a person taps send); 'warm' = only after the homeowner replied, gave consent
  // on the page, is a past customer or opted in. Cold follow-ups go by email (the app's rule since 10-09).
  const hailLine = f => { const d = sd(f), s = hs(f.hail); return d && s && f.hail >= 0.75 ? `Radar put about ${s} of hail at ${f.street} on ${d}.` : d ? `${f.street} was inside the ${d} storm on the radar map.` : ''; };
  const streetLine = f => f.hitNear > 2 && f.areaN ? `${f.hitNear} of ${f.areaN} homes around ${streetName(f.street)} took 1 inch or bigger hail on ${sd(f)}, by radar.` : '';
  function emailFrame(f, paras) {
    const sign = [f.rep, f.roofer + (f.phone ? ', ' + f.phone : '')].join('\n');
    const foot = `This is a marketing email from ${f.roofer}, ${f.mailingAddress || '[your mailing address]'}.\nTo stop these emails, reply "unsubscribe" and we'll take you off the list.`;
    return [f.first ? `Hi ${f.first},` : 'Hi,', ...paras.filter(Boolean), sign, foot].join('\n\n');
  }
  const T = {
    storm: {
      label: 'First touch after a storm', short: 'After the storm',
      text: [
        { v: 'B', lead: true, gate: 'any', name: 'Ask first, link on yes', fn: f => join([`${hi(f)}, this is ${f.rep} with ${f.roofer}.`, hailLine(f),
          `I made a one page storm record for your house: radar, roof size and your street. Want me to text it over?`, STOP]),
          then: f => join([`Here it is: ${f.link}`, `It's all public records, no login. If you want the free inspection there's a button at the bottom.`]),
          why: 'Best for cold texts. No link in the first text from an unknown number (the app\'s rule since 10-09, and links from strangers read as spam). A reply turns it into a conversation, and the link then goes to someone who asked for it.' },
        { v: 'A', gate: 'any', name: 'Link in the first text', fn: f => join([`${hi(f)}, ${f.rep} with ${f.roofer}${f.rooferCity ? ' in ' + f.rooferCity : ''}.`, hailLine(f),
          `Here's the storm record for your house, no login: ${f.link}`, `Free inspection if you want one.`, STOP]),
          why: 'Most direct. Use it when the number is warm (a referral, a past lead) or once the link is on the roofer\'s own domain.' },
        { v: 'C', gate: 'any', name: 'Your street', fn: f => join([`${hi(f)}, ${f.rep} with ${f.roofer}.`, streetLine(f) || hailLine(f),
          `Here's what it showed at your house: ${f.link}`, `Happy to look at the roof for free.`, STOP]),
          why: 'The neighbor angle, counts only. Test it against A once there are 100 sends of each.' }
      ],
      email: [
        { v: 'A', lead: true, gate: 'any', name: 'The record, plainly', fn: f => ({ subject: sd(f) ? `The ${sd(f)} storm record for ${f.street}` : `Storm record for ${f.street}`,
          body: emailFrame(f, [join([`I'm ${f.rep} with ${f.roofer}${f.rooferCity ? ' in ' + f.rooferCity : ''}.`, hailLine(f)]),
            `I put everything public about that storm and your roof on one page: the radar hail at your address, the nearest weather service hail report, roof age and size, and how many homes nearby were re-roofed since. No login, nothing to fill in:\n${f.link}`,
            `None of that means your roof is damaged. Only an inspection can tell, and ours are free. If you want one, reply with a day that works or use the button on the page.`]) }),
          why: 'Leads: the subject names the storm and the street (specific, not salesy), and the body says what the page is before asking for anything.' },
        { v: 'B', gate: 'any', name: 'Short question', fn: f => ({ subject: `Quick question about ${f.street}`,
          body: emailFrame(f, [join([`${f.rep} with ${f.roofer} here.`, hailLine(f), `Has anyone looked at the roof since?`]),
            `If not, here's the storm record for your house so you can see what radar showed: ${f.link}`,
            `Free inspection if you want one. Just reply.`]) }),
          why: 'Shorter, ends on a question. Test against A.' }
      ]
    },
    follow: {
      label: 'Follow-up', short: 'Follow-up',
      text: [
        { v: 'A', lead: true, gate: 'warm', name: 'Nudge with the record', fn: f => join([`${hi(f)}, ${f.rep} at ${f.roofer}. Following up on ${f.street}.`,
          `The storm record is here if it helps: ${f.link}`, `Want me to come look at the roof? It's free.`, STOP_R]),
          why: 'Only for homes that replied or gave consent: cold follow-ups go by email.' },
        { v: 'B', gate: 'warm', name: 'Pick a day', fn: f => join([`${hi(f)}, ${f.rep} with ${f.roofer} again. No pressure on ${f.street}.`,
          `If you'd like a free roof check, reply with a day that works.`, STOP_R]),
          why: 'No link the second time; just the ask.' }
      ],
      email: [
        { v: 'A', lead: true, gate: 'any', name: 'One line and the link', fn: f => ({ subject: `Following up on ${f.street}`,
          body: emailFrame(f, [`Following up once on the storm record for ${f.street}${sd(f) ? ' and the ' + sd(f) + ' hail' : ''}: ${f.link}`,
            `If you'd like the roof looked at, reply with a day and I'll set up a free inspection. If not, no problem and I won't keep emailing.`]) }),
          why: 'Leads: short, says it is the one follow-up, easy to say no to.' },
        { v: 'B', gate: 'any', name: 'Neighbours', fn: f => ({ subject: f.reroofs > 1 ? `${f.reroofs} homes near ${streetName(f.street)} re-roofed since the storm` : `Following up on ${f.street}`,
          body: emailFrame(f, [f.reroofs > 1 ? `Since the ${sd(f)} storm, ${f.reroofs} homes within a quarter mile of you have pulled re-roof permits (city permit records, counts only).` : `Following up on the storm record for ${f.street}.`,
            `Your record is here: ${f.link}`, `A free inspection tells you whether yours needs anything. Reply if you want one.`]) }),
          why: 'Only when the permit count is real and above one; otherwise it falls back to a plain follow-up.' }
      ]
    },
    door: {
      label: 'After a door knock', short: 'After the door',
      text: [
        { v: 'A', lead: true, gate: 'warm', name: 'As promised', fn: f => join([`${hi(f)}, it's ${f.rep} from ${f.roofer}. Thanks for talking with me today.`,
          `Here's the storm record for ${f.street} I mentioned: ${f.link}`, `Reply with a day for the free inspection.`, STOP_R]),
          why: 'Leads: it keeps a promise made in person. Send it after the homeowner ticks the consent box on your phone at the door, or texts you first.' },
        { v: 'B', gate: 'warm', name: 'Button on the page', fn: f => join([`${hi(f)}, ${f.rep} with ${f.roofer}, we met at your door.`,
          `The radar record for your house: ${f.link}`, `If you want the free inspection, there's a button at the bottom.`, STOP_R]),
          why: 'Lets them book without replying.' }
      ],
      email: [
        { v: 'A', lead: true, gate: 'any', name: 'As promised', fn: f => ({ subject: `The storm record for ${f.street}`,
          body: emailFrame(f, [`Thanks for talking with me today. Here's the storm record for your house I mentioned: ${f.link}`,
            `If you'd like the free inspection, reply with a day and time and I'll confirm it.`]) }),
          why: 'Leads: the homeowner gave the email at the door, so it is expected.' },
        { v: 'B', gate: 'any', name: 'Recap', fn: f => ({ subject: `What we talked about at ${f.street}`,
          body: emailFrame(f, [join([`Good to meet you today.`, hailLine(f)]), `Everything I showed you is on this page, so you can look again or share it: ${f.link}`,
            `Free inspection whenever you're ready. Just reply.`]) }),
          why: 'For a longer talk at the door.' }
      ]
    },
    viewed: {
      label: 'After they opened the page', short: 'After they opened it',
      text: [
        { v: 'A', lead: true, gate: 'warm', name: 'Thanks, pick a day', fn: f => join([`${hi(f)}, ${f.rep} with ${f.roofer}.`, f.consented ? `Thanks for saving your storm record for ${f.street}.` : `Following up on the storm record for ${f.street}.`,
          `What day works for a free inspection?`, STOP_R]),
          why: 'Leads: one clear ask while the record is fresh in their mind. Only after consent on the page or a reply, and never say you saw them open it.' },
        { v: 'B', gate: 'warm', name: 'Any questions', fn: f => join([`${hi(f)}, ${f.rep} at ${f.roofer}. Any questions on the storm record for ${f.street}?`,
          `Happy to answer by text or come look at the roof for free.`, STOP_R]),
          why: 'Softer, for someone who has not asked for anything yet.' }
      ],
      email: [
        { v: 'A', lead: true, gate: 'any', name: 'Questions welcome', fn: f => ({ subject: `Questions about the ${sd(f) || 'storm'} record?`,
          body: emailFrame(f, [`Following up on the storm record for ${f.street}: ${f.link}`,
            `If anything on it raised a question, reply here and I'll answer it straight. If you'd like the roof looked at, the inspection is free.`]) }),
          why: 'Leads: helpful, and it does not reveal that the page was opened.' },
        { v: 'B', gate: 'any', name: 'One fact', fn: f => ({ subject: `Your roof at ${f.street}`,
          body: emailFrame(f, [join([f.year ? `One thing from your record: the house was built in ${f.year}.` : '', f.squares ? `We estimate the roof at about ${Math.round(f.squares)} squares (an estimate; we measure before any quote).` : '']) || `Following up on the storm record for ${f.street}.`,
            `The full record: ${f.link}`, `Free inspection if you want one. Reply any time.`]) }),
          why: 'Leads with a fact from the page, not a pitch.' }
      ]
    }
  };
  const TOUCHES = ['storm', 'follow', 'door', 'viewed'];
  // render one template. f: { street, city, first, stormISO, hail, link, rep, roofer, rooferCity, phone, mailingAddress,
  // hitNear, areaN, reroofs, year, squares, consented }. -> { text|subject+body, v, lead, gate, name, why, then?, chars }
  function render(touch, ch, v, f) {
    const r = (root.activeRoofer && root.activeRoofer()) || {};
    f = Object.assign({ roofer: r.name || 'our roofing company', rep: r.owner || 'the owner', rooferCity: r.city || '', phone: r.phone || '', mailingAddress: r.mailingAddress || '' }, f || {});
    if (f.first) f.first = String(f.first).trim().split(/\s+/)[0];
    const list = (T[touch] || {})[ch] || [], t = list.find(x => x.v === v) || list.find(x => x.lead) || list[0]; if (!t) return null;
    const out = t.fn(f), body = typeof out === 'string' ? out : out.body;
    return { touch, ch, v: t.v, lead: !!t.lead, gate: t.gate, name: t.name, why: t.why, subject: typeof out === 'string' ? null : out.subject, body,
      then: t.then ? t.then(f) : null, chars: body.length, emDash: new RegExp("[" + String.fromCharCode(8211, 8212) + "]").test(body + (out.subject || '')) };
  }
  const variants = (touch, ch) => ((T[touch] || {})[ch] || []).map(x => ({ v: x.v, lead: !!x.lead, name: x.name, gate: x.gate }));

  // ---------- the send dialog (home record + Today cards) ----------
  // opts: { gi, street, city, first, phone, stormISO, hail, warm (replied / opted in / past customer), onSent(msg) }
  const CSS = `.rcp-dlg{position:fixed;inset:0;margin:auto;height:fit-content;background:#fff;border:0;border-radius:16px;padding:0;width:min(560px,calc(100vw - 24px));max-height:calc(100vh - 32px);box-shadow:0 24px 60px rgba(11,16,32,.28);color:#0B1020;font:14px/1.45 Inter,system-ui,sans-serif}
.rcp-dlg::backdrop{background:rgba(11,16,32,.42)}
.rcp-dlg .rh{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 8px}.rcp-dlg .rh b{font-size:16px}
.rcp-dlg .rx{border:0;background:#F1F3F6;border-radius:9px;width:32px;height:32px;font-size:18px;cursor:pointer}
.rcp-dlg .rb{padding:0 16px 16px;overflow:auto;max-height:calc(100vh - 100px)}
.rcp-dlg .seg{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}.rcp-dlg .seg button{border:1px solid #D5DAE1;background:#fff;border-radius:999px;padding:6px 11px;font:600 12.5px Inter,system-ui,sans-serif;cursor:pointer;color:#2A3346}
.rcp-dlg .seg button[aria-pressed=true]{background:var(--accent,#0D6C99);border-color:var(--accent,#0D6C99);color:#fff}
.rcp-dlg .seg button .ld{font-size:10.5px;font-weight:700;margin-left:5px;padding:1px 5px;border-radius:5px;background:#E3F6FE;color:#07547A}
.rcp-dlg .seg button[aria-pressed=true] .ld{background:rgba(255,255,255,.22);color:#fff}
.rcp-dlg .lab{font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#5B6478;margin:10px 0 4px}
.rcp-dlg textarea,.rcp-dlg input.sj{width:100%;box-sizing:border-box;border:1px solid #D5DAE1;border-radius:10px;padding:10px 12px;font:15px/1.45 Inter,system-ui,sans-serif;color:#0B1020;resize:vertical}
.rcp-dlg .why{font-size:12.5px;color:#465065;background:#F6F8FA;border-radius:10px;padding:8px 10px;margin:8px 0}
.rcp-dlg .why b{color:#0B1020}
.rcp-dlg .nt{font-size:12.5px;color:#465065;margin:6px 0}.rcp-dlg .nt.no{color:#9A3412}
.rcp-dlg .rcp-st{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 6px;padding:0}.rcp-dlg .rcp-st span{font-size:12px;border-radius:999px;padding:3px 9px;background:#F1F3F6;color:#2A3346}
.rcp-dlg .rcp-st span.on{background:#E7F6EC;color:#14532D}
.rcp-dlg .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.rcp-dlg .row a,.rcp-dlg .row button{flex:1 1 auto;text-align:center;text-decoration:none;border:1px solid #D5DAE1;background:#fff;border-radius:10px;padding:11px 14px;font:600 14px Inter,system-ui,sans-serif;color:#0B1020;cursor:pointer;min-height:44px;box-sizing:border-box}
.rcp-dlg .row .pri{background:var(--accent,#0D6C99);border-color:var(--accent,#0D6C99);color:#fff}
.rcp-dlg .row .off{opacity:.45;pointer-events:none}
.rcp-dlg .lk{font-size:12.5px;word-break:break-all}.rcp-dlg .lk a{color:var(--accent-ink,#07547A)}`;
  function css() { if (document.getElementById('rcp-css')) return; const s = document.createElement('style'); s.id = 'rcp-css'; s.textContent = CSS; document.head.appendChild(s); }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ago = iso => { const m = Math.round((Date.now() - Date.parse(iso)) / 6e4); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  function statusChips(gi) {
    const s = status(gi), out = [];
    if (!s) return '<div class="rcp-st"><span>Not sent yet</span></div>';
    if (s.lastSent) out.push(`<span>Sent ${esc(ago(s.lastSent.at))} by ${s.lastSent.via}</span>`);
    out.push(s.opens.length ? `<span class="on">Opened ${s.opens.length === 1 ? 'once' : s.opens.length + ' times'}, last ${esc(ago(s.lastOpen.at))}</span>` : '<span>Not opened yet</span>');
    if (s.consent) out.push(`<span class="on">${s.consent.text ? 'Consent to texts ' + esc(ago(s.consent.at)) : 'Left contact, no text consent'}</span>`);
    if (s.ask) out.push(`<span class="on">Asked for an inspection${s.ask.when ? ': ' + esc(s.ask.when) : ''}</span>`);
    if (s.optout) out.push('<span>Opted out on the page</span>');
    return `<div class="rcp-st">${out.join('')}</div>`;
  }
  // which touch fits now: opened -> 'viewed', sent before -> 'follow', else 'storm'
  function suggestTouch(gi) { const s = status(gi); return s && s.opens.length ? 'viewed' : s && s.sends.length ? 'follow' : 'storm'; }
  function sendDialog(o) {
    o = o || {}; css();
    const gi = +o.gi, id = hid(gi);
    let touch = o.touch || suggestTouch(gi), ch = o.ch || (o.phone ? 'text' : 'email'), v = null, sid = newSid(ch === 'email' ? 'email' : 'text');
    const d = document.createElement('dialog'); d.className = 'rcp-dlg'; d.setAttribute('aria-labelledby', 'rcpT');
    document.body.appendChild(d); d.addEventListener('close', () => d.remove());
    const facts = () => Object.assign({}, o.facts || {}, { street: o.street, city: o.city, first: o.first, stormISO: o.stormISO, hail: o.hail, link: link(gi, sid),
      consented: !!((status(gi) || {}).consent || {}).text });
    function paint() {
      const st = status(gi) || {}, warm = !!(o.warm || (st.consent && st.consent.text) || (RC && RC.replied && RC.replied(id)));
      const vs = variants(touch, ch); if (!v || !vs.some(x => x.v === v)) v = (vs.find(x => x.lead) || vs[0]).v;
      const r = render(touch, ch, v, facts());
      const opted = RC && RC.optedOut(id), w = RC ? RC.textWindow() : { isOpen: true, line: '' };
      const gateNo = r.gate === 'warm' && !warm ? (ch === 'text' ? 'This text is for homes that replied or ticked the consent box. Cold follow-ups go by email.' : '') : '';
      const block = opted ? 'This homeowner opted out. No more texts or emails.' : ch === 'text' && !o.phone ? 'Get the phone first, or send it by email.'
        : ch === 'text' && !w.isOpen ? w.line + ' You can text ' + (w.label || '') + ' only (Texas law).' : gateNo ? gateNo
        : ch === 'email' && !(facts().mailingAddress || ((root.activeRoofer && root.activeRoofer()) || {}).mailingAddress) ? 'Add your mailing address to send emails (CAN-SPAM). The draft shows where it goes.' : '';
      d.innerHTML = `<div class="rh"><b id="rcpT">Send the Proof Page</b><button type="button" class="rx" aria-label="Close">&times;</button></div><div class="rb">
        <p class="nt">${esc(o.street || '')}${o.city ? ', ' + esc(o.city) : ''}. You send it yourself from your phone or mail app. Nothing sends on its own.</p>
        ${statusChips(gi)}
        <div class="lab">Which touch</div><div class="seg" data-g="touch">${TOUCHES.map(k => `<button type="button" data-k="${k}" aria-pressed="${k === touch}">${esc(T[k].short)}</button>`).join('')}</div>
        <div class="lab">Channel</div><div class="seg" data-g="ch"><button type="button" data-k="text" aria-pressed="${ch === 'text'}">Text</button><button type="button" data-k="email" aria-pressed="${ch === 'email'}">Email</button></div>
        <div class="lab">Version</div><div class="seg" data-g="v">${vs.map(x => `<button type="button" data-k="${x.v}" aria-pressed="${x.v === r.v}">${x.v}: ${esc(x.name)}${x.lead ? '<span class="ld">Lead</span>' : ''}</button>`).join('')}</div>
        <p class="why"><b>${r.lead ? 'Why this one leads: ' : 'When to use it: '}</b>${esc(r.why.replace(/^Leads: /, ''))}</p>
        ${r.subject != null ? `<div class="lab">Subject</div><input class="sj" id="rcpS" value="${esc(r.subject)}">` : ''}
        <div class="lab">${ch === 'text' ? 'Text' : 'Email'} <span style="text-transform:none;font-weight:500">${r.chars} characters</span></div>
        <textarea id="rcpB" rows="${ch === 'text' ? 5 : 10}">${esc(r.body)}</textarea>
        ${r.then ? `<p class="nt"><b>When they reply yes, send:</b> ${esc(r.then)}</p>` : ''}
        <p class="lk">Link: <a href="${esc(link(gi, sid))}&preview=1" target="_blank" rel="noopener">${esc(link(gi, sid))}</a> (opens as a preview, not counted as a view)</p>
        ${block ? `<p class="nt no" id="rcpWhy">${esc(block)}</p>` : `<p class="nt">${ch === 'text' ? esc(w.line) + ' ' : ''}Sending it puts it on the home's record${RC && RC.messaged && !RC.messaged(gi) ? ', and the owner\'s full name shows from then on' : ''}.</p>`}
        <div class="row"><button type="button" data-x>Close</button><button type="button" id="rcpC">Copy</button>${ch === 'text' ? `<a class="pri${block ? ' off' : ''}" id="rcpGo" href="#"${block ? ' aria-disabled="true" aria-describedby="rcpWhy"' : ''}>Open in Messages</a>` : `<a class="pri${block ? ' off' : ''}" id="rcpGo" href="#"${block ? ' aria-disabled="true" aria-describedby="rcpWhy"' : ''}>Open in Mail</a>`}</div></div>`;
      d.querySelector('.rx').onclick = d.querySelector('[data-x]').onclick = () => d.close();
      d.querySelectorAll('.seg').forEach(g => g.onclick = e => { const b = e.target.closest('button[data-k]'); if (!b) return; const k = b.dataset.k;
        if (g.dataset.g === 'touch') { touch = k; v = null; } else if (g.dataset.g === 'ch') { ch = k; v = null; sid = newSid(k); } else v = k; paint(); });
      d.querySelector('#rcpC').onclick = () => { try { navigator.clipboard.writeText(d.querySelector('#rcpB').value); } catch (e) { } d.querySelector('#rcpC').textContent = 'Copied'; };
      const go = d.querySelector('#rcpGo');
      if (go && !block) go.onclick = () => { const body = d.querySelector('#rcpB').value.trim(), sj = d.querySelector('#rcpS') ? d.querySelector('#rcpS').value.trim() : null;
        go.href = ch === 'text' ? `sms:${o.phone}?&body=${encodeURIComponent(body)}` : `mailto:${o.email || ''}?subject=${encodeURIComponent(sj || '')}&body=${encodeURIComponent(body)}`;
        sent(gi, { sid, via: ch, touch, variant: r.v, body, subject: sj, to: o.phone });
        if (o.onSent) o.onSent(`Proof Page ${ch === 'text' ? 'text opened in Messages' : 'email opened in Mail'}.`);
        setTimeout(() => d.close(), 60); };
    }
    paint(); d.showModal();
    // fill in what the caller did not have: this home's newest 1 in+ storm (a map-opened home has none on its record),
    // then how many homes within a quarter mile took 1 in+ and were re-roofed since (counts only, for versions C and B)
    let edited = false; d.addEventListener('input', () => { edited = true; });
    const R = root.RCH; if (R) (o.stormISO ? Promise.resolve() : R.history(gi).then(h => { const hit = (h || []).filter(x => x.inches >= 1).sort((a, b) => a.iso < b.iso ? 1 : -1)[0];
      if (hit) { o.stormISO = hit.iso; o.hail = hit.inches; } })).then(() => o.stormISO ? R.area(gi, { radius: 402, iso: o.stormISO }) : null).then(A => {
      if (A) { const ot = A.homes.filter(x => !x.self); o.facts = Object.assign({}, o.facts, { hitNear: ot.filter(x => x.inches >= 1).length, areaN: ot.length, reroofs: ot.filter(x => x.reroofed).length }); }
      if (d.open && !edited) paint(); }).catch(() => {});
    return d;
  }

  root.RCP = { token, decode, link, base, newSid, sent, opened, consent, ask, optout, status, statusChips, suggestTouch, consentText, CONSENT_VERSION,
    templates: T, TOUCHES, variants, render, sendDialog };
})(typeof window !== 'undefined' ? window : globalThis);
