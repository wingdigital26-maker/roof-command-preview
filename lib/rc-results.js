/* rc-results.js: where each lead came from, and the Results numbers (10-26). Plain script, load AFTER rc-state.js.
   window.RCR = { SOURCES, sourceOf(id), compute(fromMs, toMs, extra) }
   Local mode (cloud=0 or signed out): every number is counted from this device's own records (rc.t.pipe, homes, added,
   pastCust). Cloud mode: the Results page asks Supabase rc_results() (migration 012) instead, same shape.
   Counts only: nothing here reads or returns a name, phone or email. */
(function () {
  'use strict';
  if (window.RCR || !window.RC) return;
  const G = (k, d) => RC.__get(k, d);
  // the lead sources, in the order the report lists them
  const SOURCES = [
    ['daily50', 'Daily 50'], ['turnover_radar', 'Turnover Radar'], ['morning_after_alert', 'Morning-after alert'], ['storms_map', 'Storms map'],
    ['proof_page', 'Proof Page'], ['past_customer_referral', 'Past-customer referral'], ['seo_website_form', 'SEO / website form'],
    ['nimbus', 'Ask Nimbus'], ['neighbors', 'Neighbors'], ['manual', 'Manual']];
  const FROM = { 'daily50': 'daily50', 'daily 50': 'daily50', 'storm map': 'storms_map', 'morning-after alert': 'morning_after_alert', 'turnover radar': 'turnover_radar',
    'ask nimbus': 'nimbus', 'neighbors': 'neighbors', 'referral': 'past_customer_referral', 'past customer neighbors': 'past_customer_referral',
    'proof page': 'proof_page', 'website': 'seo_website_form', 'website form': 'seo_website_form', 'manual': 'manual' };
  const norm = s => { if (!s) return null; const k = String(s).toLowerCase().trim(); return SOURCES.some(x => x[0] === k) ? k : FROM[k] || null; };

  // first touch wins: a source stamped on the pipeline entry, else the list the home was added from, else what the
  // home record says, else the Proof Page when the homeowner came in there, else manual
  function sourceOf(id) {
    const p = G('pipe', {})[id] || {};
    let s = norm(p.source); if (s) return s;
    const a = (G('added', []) || []).find(x => x && x.id === id); s = a && norm(a.from); if (s) return s;
    const h = G('homes', {})[id] || {}; s = norm(h.from); if (s) return s;
    if (/proof page/i.test(h.phoneBy || '') || /proof page/i.test(h.optinHow || '')) return 'proof_page';
    if (h.past || h.pastCustomer) return 'past_customer_referral';
    return 'manual';
  }

  const inR = (iso, a, b) => { const t = Date.parse(iso); return t >= a && t < b; };
  const day = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s + 'T00:00:00' : s;   // a signed day counts from its start (noon sits in the future all morning)
  // -> { by_source: [{src, leads, reached, replies, inspections, proposals, won, revenue}], totals, alerts, asks }
  function compute(a, b, extra) {
    extra = extra || {};
    const pipe = G('pipe', {}), rows = {};
    const row = s => rows[s] || (rows[s] = { src: s, leads: 0, reached: 0, replies: 0, inspections: 0, proposals: 0, won: 0, revenue: 0 });
    Object.keys(pipe).forEach(id => {
      const p = pipe[id] || {}, hist = (p.history || []).slice().sort((x, y) => x.at < y.at ? -1 : 1), r = row(sourceOf(id));
      const first = hist[0] && hist[0].at; if (first && inR(first, a, b)) r.leads++;
      const out = hist.find(h => h.dir !== 'in' && (h.kind === 'text' || h.kind === 'email')); if (out && inR(out.at, a, b)) r.reached++;
      const rep = hist.find(h => h.dir === 'in'); if (rep && inR(rep.at, a, b)) r.replies++;
      const ins = hist.find(h => /^Inspection booked/.test(h.what || '')); if (ins && inR(ins.at, a, b)) r.inspections++;
      if (p.proposalSent && inR(p.proposalSent, a, b)) r.proposals++;
      if (p.stage === 'won') { const w = day(p.signed) || (hist.filter(h => h.kind === 'stage' && /^Won/.test(h.what || '')).pop() || {}).at;
        if (w && inR(w, a, b)) { r.won++; r.revenue += Math.max(0, +p.jobValue || 0); } }
    });
    const list = SOURCES.map(s => rows[s[0]]).filter(Boolean);
    const sum = k => list.reduce((t, r) => t + r[k], 0);
    const al = rows.morning_after_alert || row('morning_after_alert');
    const alerts = (extra.alerts || []).filter(x => x && x.alert_day && inR(x.alert_day + 'T12:00:00', a, b));
    const pc = Array.isArray(G('pastCust', null)) ? G('pastCust', []) : [];
    const fl = (k, s) => pc.filter(c => { const f = c.flows && c.flows[k]; return f && (s ? f.s === s : ['asked', 'replied', 'done'].includes(f.s)) && f.at && inR(f.at, a, b); }).length;
    return {
      from: new Date(a).toISOString(), to: new Date(b).toISOString(), mode: 'local',
      by_source: list,
      totals: { leads: sum('leads'), reached: sum('reached'), replies: sum('replies'), inspections: sum('inspections'), proposals: sum('proposals'), won: sum('won'), revenue: sum('revenue') },
      alerts: { sent: alerts.length, generated: alerts.length, leads: al.leads, inspections: al.inspections, won: al.won, revenue: al.revenue },
      asks: { reviews_asked: fl('review'), reviews_left: fl('review', 'done'), referrals_asked: fl('referral'), referrals_in: fl('referral', 'done'), testimonials_in: fl('testimonial', 'done') }
    };
  }
  window.RCR = { SOURCES, sourceOf, compute, label: k => (SOURCES.find(s => s[0] === k) || [k, k])[1] };
})();
