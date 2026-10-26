/* rc-copy.js: the outreach copy library (RC.copy). Plain script for the browser, and a CommonJS module for node
   (tour/audit/_copy_check.py renders every template through node).

   Load AFTER rc-state.js and brand.js. If window.RC already exists this sets RC.copy; it never creates window.RC
   itself (rc-state.js bails out when RC exists), so before rc-state loads the library waits on window.RC_COPY.

   Nothing here sends. Every function returns words for a human (cold) or for a scheduler that is not wired yet
   (opt-ins). No roofer is hardcoded: the roofer name, rep and phone come from the home's facts or the active
   roofer in brand.js.

   Two audiences:
     cold   skip-traced homeowners who were never contacted. A person taps Send, one at a time.
     optin  homeowners who opted in on the roofer's check page, and past customers. Can be automatic,
            except texts to a past customer who has not said yes to texts (blocked, email instead).

   Cadence: step 0 = day 1, 1 = day 3, 2 = day 7, 3 = day 30, then every 30 days (step 4 = day 60, 5 = day 90 ...).
   Steps 4 and up are light check-ins that alternate between two wordings so nobody gets the same text twice running.

   homeFacts (every field optional except street; a template leaves out any sentence whose fact is missing):
     id, first (first name if known, else no name), street ("3704 Morning Dove Dr"), city, zip,
     stormISO ("2025-08-12"), hail (inches at the home, radar estimate), roofYear (year built / roof year),
     permit (year of the last reroof permit on record; null = none on record), squares, pitch (rise, 10 = 10/12),
     rep, roofer, rooferCity, phone (roofer's call/text number), mailingAddress (roofer's physical address, emails),
     source ('form' | 'past'), pastJobYear, textConsent (past customer said yes to texts), onRoute (the home is on a
     real knock/inspection route this week), optedOut, now (Date, for tests).

   Rules baked into the words: no damage claims, no insurance promises, nothing about the deductible, no fake
   urgency, "around your street" only when onRoute is true, no links in any cold text, no em dashes. */
(function (root) {
  "use strict";

  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const TEXT_MAX = 300;

  // ---------- fact helpers ----------
  const nowOf = f => (f && f.now ? new Date(f.now) : new Date());
  // "Aug 12" this year, "Aug 12, 2025" any other year
  function stormDate(f) {
    if (!f || !f.stormISO) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f.stormISO)); if (!m) return '';
    const y = +m[1], s = MON[+m[2] - 1] + ' ' + (+m[3]);
    return y === nowOf(f).getFullYear() ? s : s + ', ' + y;
  }
  // radar hail at the home, rounded to a tenth, with the coin/ball size people know
  function hailSize(h) {
    if (h == null || !isFinite(h) || h <= 0) return '';
    const n = (Math.round(h * 10) / 10).toFixed(1).replace(/\.0$/, '');
    return n + (n === '1' ? ' inch' : ' inches');
  }
  function hailName(h) {
    if (h == null || !isFinite(h)) return '';
    return h >= 2.5 ? 'tennis ball size' : h >= 1.75 ? 'golf ball size' : h >= 1.5 ? 'ping pong ball size'
      : h >= 1.25 ? 'half dollar size' : h >= 1.0 ? 'quarter size' : h >= 0.88 ? 'nickel size' : h >= 0.75 ? 'penny size' : '';
  }
  const hi = f => (f.first ? 'Hi ' + f.first : 'Hi');
  const sqText = s => (Math.round(s * 10) / 10).toString();
  const sqFt = s => Math.round(s * 100).toLocaleString('en-US');

  // one short sentence per fact, or '' when the fact is missing
  const S = {
    // the storm at this address (the only storm sentence; a radar estimate, never a damage claim)
    hailAt(f) {
      const d = stormDate(f), sz = hailSize(f.hail);
      if (d && sz) return `Radar put hail around ${sz}${hailName(f.hail) ? ' (' + hailName(f.hail) + ')' : ''} at ${f.street} on ${d}.`;
      if (d) return `${f.street} was inside the ${d} hail storm on the radar map.`;
      return '';
    },
    // the roof's age, from records only
    // permit records only cover recent years and only some cities, so a missing permit is never a claim about the roof (10-22)
    roofShort(f) {
      if (f.permit) return `Last re-roof permit in public records is from ${String(f.permit).slice(0, 4)}.`;
      if (f.roofYear) return `Built ${f.roofYear}.`;
      return '';
    },
    roofLong(f) {
      if (f.permit) return `The last re-roof permit we can find in public records is from ${String(f.permit).slice(0, 4)}.`;
      if (f.roofYear) return `The house was built in ${f.roofYear}.`;
      return '';
    },
    measureShort(f) {
      if (!f.squares) return '';
      return `We estimate the roof at about ${sqText(f.squares)} squares${f.pitch ? ', ' + f.pitch + '/12 pitch' : ''}.`;
    },
    measureLong(f) {
      if (!f.squares) return '';
      return `From mapping data we estimate the roof at about ${sqText(f.squares)} squares (around ${sqFt(f.squares)} sq ft)${f.pitch ? ' with a ' + f.pitch + '/12 pitch' : ''}.`;
    },
    // only when the home really is on this week's route
    route(f) { return f.onRoute ? `We're doing inspections near ${streetName(f.street)} this week.` : ''; },
    callLine(f) { return f.phone ? `Call or text ${f.phone}.` : ''; },
    // check-ins: Mar to Jun is hail season in North Texas; outside it the line is plain
    season(f) {
      const m = nowOf(f).getMonth();
      return m >= 2 && m <= 5 ? `Hail season is here again in ${f.city || 'town'}.` : '';
    }
  };
  const streetName = s => String(s || '').replace(/^\s*\d+[A-Za-z]?\s+/, '');
  const who = f => `${f.rep} with ${f.roofer}`;
  const whoIn = f => `${f.rep} with ${f.roofer}${f.rooferCity ? ' in ' + f.rooferCity : ''}`;
  const STOP_COLD = 'Text STOP and I won\'t text again.';
  const STOP_OPT = 'Reply STOP to opt out.';
  const join = parts => parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  // a text over the limit drops its optional sentences (marked with a leading '?') from the end until it fits
  function fit(parts) {
    let p = parts.slice();
    const txt = () => join(p.map(x => (x && x[0] === '?' ? x.slice(1) : x)));
    for (let i = p.length - 1; i >= 0 && txt().length > TEXT_MAX; i--) if (p[i] && p[i][0] === '?') p[i] = '';
    return txt();
  }
  const opt = s => (s ? '?' + s : '');

  // ---------- email frame ----------
  function emailBody(f, aud, paras) {
    const greet = f.first ? `Hi ${f.first},` : 'Hi,';
    const sign = [f.rep, f.roofer + (f.phone ? ', ' + f.phone : '')].join('\n');
    const addr = f.mailingAddress || '[your mailing address]';
    const foot = (aud === 'cold' ? `This is a marketing email from ${f.roofer}, ${addr}.` : `${f.roofer}, ${addr}.`) +
      `\nTo stop these emails, reply "unsubscribe"${f.unsubUrl ? ' or use ' + f.unsubUrl : ''} and we'll take you off the list.`;
    return [greet, ...paras.filter(Boolean), sign, foot].join('\n\n');
  }

  // ---------- templates ----------
  // each: { aud, ch, step, kind, fn(f) -> text body | { subject, body } }
  const T = {};
  const add = (id, aud, ch, step, fn, kind) => { T[id] = { id, aud, ch, step, kind: kind || 'sequence', fn }; };

  // ===== cold, text (no links, roofer named in the first words, STOP line on every one) =====
  add('cold.text.d1', 'cold', 'text', 'd1', f => fit([
    `${hi(f)}, this is ${whoIn(f)}.`, S.hailAt(f), opt(S.roofShort(f)), opt(S.route(f)),
    'Would you want a free inspection?', STOP_COLD]));
  add('cold.text.d3', 'cold', 'text', 'd3', f => fit([
    `${hi(f)}, ${f.rep} at ${f.roofer} again about ${f.street}.`,
    `If you'd like someone to look at the roof after the ${stormDate(f) || 'last'} hail, I can set up a free inspection.`,
    opt(S.callLine(f)), STOP_COLD]));
  add('cold.text.d7', 'cold', 'text', 'd7', f => fit([
    `${hi(f)}, it's ${who(f)}. Last note on ${f.street} for a while.`, opt(S.measureShort(f)),
    'If you ever want it looked at in person, the free inspection offer stands.', opt(S.callLine(f)), STOP_COLD]));
  add('cold.text.d30', 'cold', 'text', 'd30', f => fit([
    `${hi(f)}, ${who(f)} checking in on ${f.street}.`,
    `If anything has come up with the roof since the ${stormDate(f) || 'last'} storm, a free inspection is still on the table.`,
    opt(S.callLine(f)), STOP_COLD]), 'checkin');
  add('cold.text.checkin_a', 'cold', 'text', 'd60+', f => fit([
    `${hi(f)}, ${who(f)}.`, S.season(f) || 'Quick check-in.',
    `If you'd like the roof at ${f.street} looked at, the free inspection still stands.`, opt(S.callLine(f)), STOP_COLD]), 'checkin');
  add('cold.text.checkin_b', 'cold', 'text', 'd60+', f => fit([
    `${hi(f)}, it's ${who(f)}.`,
    `If a storm comes through and you want someone to check the roof at ${f.street}, ${f.phone ? 'call or text ' + f.phone + ' and ' : ''}we'll come look at no charge.`,
    STOP_COLD]), 'checkin');

  // ===== cold, email (a person sends it; CAN-SPAM ad line, physical address, unsubscribe) =====
  add('cold.email.d1', 'cold', 'email', 'd1', f => ({
    subject: stormDate(f) ? `The ${stormDate(f)} hail at ${f.street}` : `The roof at ${f.street}`,
    body: emailBody(f, 'cold', [
      join([`I'm ${whoIn(f)}.`, /^Radar /.test(S.hailAt(f)) ? S.hailAt(f).replace(/^Radar /, "I'm writing because radar ") : stormDate(f) ? `I'm writing because ${f.street} was inside the ${stormDate(f)} hail storm on the radar map.` : `I'm writing about the roof at ${f.street}.`]),
      join([S.roofLong(f), S.measureLong(f)]),
      join(["That doesn't mean anything is wrong with it. The only way to know is to have someone look, and our inspections are free.", S.route(f)]),
      join([`If you'd like one, reply here${f.phone ? ' or call ' + f.phone : ''}.`])
    ])
  }));
  add('cold.email.d3', 'cold', 'email', 'd3', f => ({
    subject: `Following up on ${f.street}`,
    body: emailBody(f, 'cold', [
      `Following up on my note about ${f.street}${stormDate(f) ? ' and the ' + stormDate(f) + ' hail' : ''}.`,
      `If you'd like the roof looked at, reply with a day that works and I'll set up a free inspection. If not, no problem.`
    ])
  }));
  add('cold.email.d7', 'cold', 'email', 'd7', f => ({
    subject: `Roof facts for ${f.street}`,
    body: emailBody(f, 'cold', [
      join(["Here's what we pulled for your house from county records and mapping data, in case it's useful.", S.measureLong(f), S.roofLong(f)]),
      `This is the last email from me for a while. The free inspection offer stands${f.phone ? ', and ' + f.phone + ' is the number' : ''}.`
    ])
  }));
  add('cold.email.d30', 'cold', 'email', 'd30', f => ({
    subject: `Checking in on ${f.street}`,
    body: emailBody(f, 'cold', [
      `Checking in once. If anything has come up with the roof at ${f.street} since the ${stormDate(f) || 'last'} storm, a free inspection is still available. Just reply to this email.`
    ])
  }), 'checkin');
  add('cold.email.checkin_a', 'cold', 'email', 'd60+', f => ({
    subject: S.season(f) ? 'Hail season check-in' : `Checking in on ${f.street}`,
    body: emailBody(f, 'cold', [join([S.season(f), `If you'd like the roof at ${f.street} looked at, the free inspection still stands. Reply here any time.`])])
  }), 'checkin');
  add('cold.email.checkin_b', 'cold', 'email', 'd60+', f => ({
    subject: `If a storm hits ${f.street}`,
    body: emailBody(f, 'cold', [`If a storm comes through and you want someone to check the roof at ${f.street}, reply here${f.phone ? ' or call ' + f.phone : ''} and we'll come look at no charge.`])
  }), 'checkin');

  // ===== opted in / past customers, text =====
  // the thank-you line is the first thing dropped when a long street or roofer name pushes past 300
  const optThanks = f => (f.source === 'past'
    ? (f.pastJobYear ? `Thanks again for having us out in ${f.pastJobYear}.` : '')
    : 'Thanks for checking your address with us.');
  add('optin.text.d1', 'optin', 'text', 'd1', f => fit([
    `${hi(f)}, it's ${who(f)}.`, opt(optThanks(f)), S.hailAt(f), opt(S.route(f)), 'Want me to set up a free inspection? Reply with a day that works.', STOP_OPT]));
  add('optin.text.d3', 'optin', 'text', 'd3', f => fit([
    `${hi(f)}, ${f.rep} at ${f.roofer}. Following up on the free inspection for ${f.street}. What day works for you?`, STOP_OPT]));
  add('optin.text.d7', 'optin', 'text', 'd7', f => fit([
    `${hi(f)}, ${f.rep} at ${f.roofer}.`, opt(S.measureShort(f)), opt(S.roofShort(f)),
    `Happy to look at ${f.street} in person whenever you're ready.`, STOP_OPT]));
  add('optin.text.d30', 'optin', 'text', 'd30', f => fit([
    `${hi(f)}, ${who(f)} checking in. The free inspection for ${f.street} is still open if you want it.`, opt(S.callLine(f)), STOP_OPT]), 'checkin');
  add('optin.text.checkin_a', 'optin', 'text', 'd60+', f => fit([
    `${hi(f)}, ${who(f)}.`, S.season(f) || 'Just checking in.',
    `If you want the roof at ${f.street} looked at, reply and we'll set a time.`, STOP_OPT]), 'checkin');
  add('optin.text.checkin_b', 'optin', 'text', 'd60+', f => fit([
    `${hi(f)}, ${who(f)}. If a storm comes through and you want someone to check ${f.street}, reply here${f.phone ? ' or call ' + f.phone : ''}.`, STOP_OPT]), 'checkin');

  // ===== opted in / past customers, email =====
  const optIntro = f => (f.source === 'past'
    ? `It's ${whoIn(f)}.${f.pastJobYear ? ` Thanks again for having us out in ${f.pastJobYear}.` : ''}`
    : `It's ${whoIn(f)}. Thanks for checking your address on our site.`);
  add('optin.email.d1', 'optin', 'email', 'd1', f => ({
    subject: stormDate(f) ? `Your ${stormDate(f)} hail check for ${f.street}` : `Your roof check for ${f.street}`,
    body: emailBody(f, 'optin', [
      join([optIntro(f), S.hailAt(f)]),
      join([S.roofLong(f), S.measureLong(f)]),
      join(["None of that means the roof has a problem. If you'd like a free inspection, reply with a day that works and I'll get it on the calendar.", S.route(f)])
    ])
  }));
  add('optin.email.d3', 'optin', 'email', 'd3', f => ({
    subject: `Free inspection for ${f.street}`,
    body: emailBody(f, 'optin', [`Following up on the free inspection for ${f.street}. Reply with a day and a rough time and I'll confirm it${f.phone ? ', or call ' + f.phone : ''}.`])
  }));
  add('optin.email.d7', 'optin', 'email', 'd7', f => ({
    subject: `Roof facts for ${f.street}`,
    body: emailBody(f, 'optin', [
      join(["Here's what we have on file for your roof.", S.measureLong(f), S.roofLong(f)]),
      `Whenever you want it looked at in person, reply here and I'll set it up.`
    ])
  }));
  add('optin.email.d30', 'optin', 'email', 'd30', f => ({
    subject: `Checking in on ${f.street}`,
    body: emailBody(f, 'optin', [`Checking in. The free inspection for ${f.street} is still open whenever it suits you. Just reply to this email.`])
  }), 'checkin');
  add('optin.email.checkin_a', 'optin', 'email', 'd60+', f => ({
    subject: S.season(f) ? 'Hail season check-in' : `Checking in on ${f.street}`,
    body: emailBody(f, 'optin', [join([S.season(f), `If you want the roof at ${f.street} looked at, reply here and we'll set a time.`])])
  }), 'checkin');
  add('optin.email.checkin_b', 'optin', 'email', 'd60+', f => ({
    subject: `If a storm hits ${f.street}`,
    body: emailBody(f, 'optin', [`If a storm comes through and you want someone to check the roof at ${f.street}, reply here${f.phone ? ' or call ' + f.phone : ''} and we'll come look.`])
  }), 'checkin');

  // ===== replies (texts a person sends back; same words work for either audience) =====
  add('reply.stop', 'any', 'text', 'reply', f => `You're opted out and won't get more texts from ${f.roofer}.`, 'reply');
  add('reply.unsubscribe', 'any', 'email', 'reply', f => ({ subject: 'Unsubscribed', body: `You're off the list and won't get more emails from ${f.roofer}.\n\n${f.rep}` }), 'reply');
  add('reply.who', 'any', 'text', 'reply', f => join([
    `This is ${whoIn(f)}.`, stormDate(f) ? `I reached out about the ${stormDate(f)} hail at ${f.street}.` : `I reached out about the roof at ${f.street}.`,
    `Happy to answer anything, or text STOP and I won't text again.`]), 'reply');
  add('reply.call', 'any', 'text', 'reply', f => `Sure. I'll call you${f.phone ? ' from ' + f.phone : ''}. What time works best?`, 'reply');
  // a yes / a time / an inspection ask: the one goal is a booked free roof check (no price, no insurance talk by text)
  add('reply.interested', 'any', 'text', 'reply', f => `Great, thanks. What day and time this week works for a free roof check at ${f.street}?`, 'reply');
  add('reply.not_interested', 'any', 'text', 'reply', f => `No problem, thanks for letting me know. I won't reach out again.`, 'reply');
  add('reply.have_roofer', 'any', 'text', 'reply', f => `Good to hear, thanks for telling me. I'll take you off my list.${f.phone ? ` If you ever want a second opinion, we're at ${f.phone}.` : ''}`, 'reply');
  add('reply.how_number', 'any', 'text', 'reply', f => `Fair question. Your address and the home's details come from public county property records, and the number came from a data company that matches phone numbers to property owners. I can take you off the list right now if you'd like.`, 'reply');

  // ---------- facts ----------
  // fill roofer fields from the active roofer (brand.js) when the caller left them out
  function withDefaults(f) {
    const r = (root.activeRoofer && root.activeRoofer()) || {};
    const o = Object.assign({}, f || {});
    if (!o.roofer) o.roofer = r.name || 'our roofing company';
    if (!o.rep) o.rep = r.owner || 'the owner';
    if (!o.rooferCity && r.city) o.rooferCity = r.city;
    if (!o.phone && r.phone) o.phone = r.phone;
    if (!o.mailingAddress && r.mailingAddress) o.mailingAddress = r.mailingAddress;
    if (o.first) o.first = String(o.first).trim().split(/\s+/)[0];
    // when the county's permit records start (the Daily 50 engine knows it per home); unknown = no "since" claim
    if (o.permitsFrom === undefined && o.id != null && root.RC && root.RC.permitCoverage) { const pc = root.RC.permitCoverage(o.id); o.permitsFrom = pc && pc.from ? pc.from : null; }
    return o;
  }
  // a Daily 50 route stop (data/route-dfw.json) or a home record -> homeFacts
  function factsFromStop(s, extra) {
    s = s || {};
    return Object.assign({
      id: s.id || s.gi || s.fp, street: s.street || [s.num, s.name].filter(Boolean).join(' ') || s.addr,
      city: s.city, zip: s.zip, hail: s.hail, roofYear: s.year || s.roofYear, permit: s.permit || null,
      squares: s.squares, pitch: s.pitch && typeof s.pitch === 'object' ? s.pitch.rise : s.pitch,
      first: s.first || (s.person ? String(s.person).split(' ')[0] : null)
    }, extra || {});
  }

  // what a render still needs before a person (or a scheduler) can send it
  function missing(t, f) {
    const m = [];
    if (!f.street) m.push('street');
    if (!f.phone && t.ch === 'text' && t.kind !== 'reply') m.push('phone');
    if (t.ch === 'email' && t.kind !== 'reply' && !f.mailingAddress) m.push('mailingAddress');
    return m;
  }

  // ---------- public API ----------
  function render(templateId, homeFacts) {
    const t = T[templateId]; if (!t) throw new Error('rc-copy: no template ' + templateId);
    const f = withDefaults(homeFacts);
    const out = t.fn(f), isText = t.ch === 'text';
    const res = { id: t.id, audience: t.aud, channel: t.ch, step: t.step, kind: t.kind,
      subject: isText ? null : out.subject, body: isText ? out : out.body };
    res.chars = res.body.length;
    const miss = missing(t, f);
    if (miss.length) res.missing = miss;
    if (isText && res.chars > TEXT_MAX) res.blocked = 'text is over ' + TEXT_MAX + ' characters';
    else if (miss.length) res.blocked = 'needs ' + miss.join(', ');
    return res;
  }

  const DAYS = [1, 3, 7, 30];
  const dayOf = step => (step < DAYS.length ? DAYS[step] : 30 * (step - 2));
  const keyOf = step => (step < DAYS.length ? 'd' + DAYS[step] : (step % 2 === 0 ? 'checkin_a' : 'checkin_b'));
  // the channel of each touch is fixed (Jack 10-09): one text on day 1 (step 0), then email only (day 3, 7, 30, every 30)
  const channelFor = step => (Math.max(0, Math.floor(+step || 0)) === 0 ? 'text' : 'email');
  const AUD = { cold: 'cold', optin: 'optin', 'opted-in': 'optin', opted_in: 'optin', past: 'optin' };

  const api = {
    TEXT_MAX, templates: T, stormDate, hailSize, factsFromStop, dayOf, channelFor,
    // the cadence: step index -> day, the template key and the fixed channel for that touch
    cadence: [0, 1, 2, 3, 4, 5].map(s => ({ step: s, day: dayOf(s), key: keyOf(s), channel: channelFor(s) })),
    // set these to look homes up by id and to read the opt-out list (the Daily 50 owns both)
    factsFor: null, isOptedOut: null,
    render,
    // the touch for one home: next(homeIdOrFacts, step, 'cold' | 'optin' | 'past', channel?)
    // channel left out (or 'auto') = the step's own channel (step 0 text, later steps email). A text asked for on a later
    // step returns { blocked, useChannel: 'email' } with no words: follow-ups never go by text. An email on day 1 is only
    // the fallback when the text can't go (no phone, a past customer without a yes to texts); it comes back fallback: true.
    next(homeId, cadenceStep, audience, channel) {
      const aud = AUD[audience]; if (!aud) throw new Error('rc-copy: unknown audience ' + audience);
      const step = Math.max(0, Math.floor(+cadenceStep || 0)), fixed = channelFor(step);
      if (channel == null || channel === 'auto') channel = fixed;
      if (channel !== 'text' && channel !== 'email') throw new Error('rc-copy: unknown channel ' + channel);
      let f = homeId && typeof homeId === 'object' ? homeId : (api.factsFor ? api.factsFor(homeId) : null);
      if (!f) return { blocked: 'no facts for home ' + homeId };
      if (audience === 'past') f = Object.assign({ source: 'past' }, f);
      const id = `${aud}.${channel}.${keyOf(step)}`, day = dayOf(step);
      if (f.optedOut || (api.isOptedOut && api.isOptedOut(f.id || homeId, channel))) return { id, day, blocked: 'opted out' };
      if (channel === 'text' && fixed === 'email')
        return { id, day, channel, useChannel: 'email', body: null, blocked: `day ${day} goes by email: only the first touch is a text, every follow-up is an email` };
      if (aud === 'optin' && channel === 'text' && f.source === 'past' && !f.textConsent)
        return { id, day, blocked: 'past customer has not said yes to texts: email instead' };
      if (channel !== fixed) return Object.assign(render(id, f), { day, fallback: true });
      return Object.assign(render(id, f), { day });
    }
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && typeof root === 'object') {
    root.RC_COPY = api;
    if (root.RC) root.RC.copy = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
