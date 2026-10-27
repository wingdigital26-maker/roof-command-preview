/* condense.js: the house page, condensed (Jack's voice notes 10-26: "too scattered, too dense, a million things"; the users
   are roofers who are bad with technology: one obvious action per screen, detail one tap away).
   Top: the address, the opportunity score big ("78 of 100") and "Why it fits" in 3 or 4 short plain reasons.
   One action: Text. Email, Book, Proof page and Proposal sit in the More menu (rec.js).
   The right column is This home only (the Pipeline has its own screen) and every section folds: Home facts open, the rest
   closed with its name showing. Activity and Notes leave the Roof tabs for their own Activity section.
   Runs after rec.js, evidence.js and pipe.js; reads RCS.explain (lib/rc-scores.js), the same call the score details use. */
(function () {
  'use strict';
  const RC = window.RC, esc = RC.esc, $ = s => document.querySelector(s);
  const rt = $('.rh .rt'), addr = $('#addr'), pane = $('#homePane');
  if (!rt || !addr || !pane) return;

  const css = document.createElement('style');
  css.textContent = `
/* top: address, then the score and why it fits */
.rt .fit{display:flex;gap:16px;align-items:flex-start;margin-top:14px;max-width:760px}
.rt .fit[hidden]{display:none}
.rt .fsc{flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:104px;padding:12px 10px;border-radius:12px;background:#fff;border:1px solid var(--hair,#D5D9E0);box-shadow:0 1px 2px rgba(11,16,32,.05)}
.rt .fsc b{font-size:40px;font-weight:650;letter-spacing:-.03em;line-height:1;color:var(--accent,#1F47C9);font-variant-numeric:tabular-nums}
.rt .fsc span{font-size:13px;font-weight:600;color:var(--muted,#465065);margin-top:3px}
.rt .fsc small{font-size:11px;color:var(--muted,#465065);margin-top:4px;text-align:center;line-height:1.25}
.rt .fwhy h2{margin:2px 0 6px;font-size:13px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#465065)}
.rt .fwhy ul{margin:0;padding:0;list-style:none;display:grid;gap:5px}
.rt .fwhy li{position:relative;padding-left:20px;font-size:15.5px;line-height:1.35;color:var(--ink,#0B1020)}
.rt .fwhy li::before{content:"";position:absolute;left:3px;top:.5em;width:8px;height:8px;border-radius:50%;background:var(--accent,#1F47C9)}
.rt .fwhy li i{font-style:normal;color:var(--muted,#465065);font-size:13.5px}
.rt .fwhy .fno{color:#9B1C1C;font-weight:600}
.rt .fwhy .fno::before{background:#C53030}
#keyf{display:none!important}
/* one action: Text, then More */
.acts [data-act="email"],.acts [data-act="book"],.acts [data-act="proof"],.acts #bProposal,
.stick [data-act="email"],.stick [data-act="book"],.stick [data-act="proof"],.stick #bProposal{display:none!important}
.acts #bMore{width:auto!important;padding:0 16px!important;gap:6px}
.acts #bMore .mlbl,.stick .smore .mlbl{font-weight:600}
.stick .smore{flex:1!important}
/* the stage bar: one slim line */
.steps .st small{display:none}
.steps .st{min-height:0!important;padding-top:9px!important;padding-bottom:9px!important}
/* the right column is This home (the Pipeline is its own screen) */
body[data-view="home"] #ptab{display:none!important}
/* every section folds; the header is the switch */
#homePane .panel>:is(.ph,.kh){cursor:pointer;user-select:none;position:relative;padding-right:30px}
#homePane .panel>:is(.ph,.kh)::after{content:"";position:absolute;right:6px;top:50%;width:8px;height:8px;border-right:2px solid var(--muted,#465065);border-bottom:2px solid var(--muted,#465065);transform:translateY(-70%) rotate(45deg);transition:transform .15s}
#homePane .panel.fold>:is(.ph,.kh)::after{transform:translateY(-30%) rotate(-45deg)}
#homePane .panel.fold>:not(.ph,.kh){display:none!important}
#homePane .panel.fold{padding-bottom:12px}
#homePane .panel>:is(.ph,.kh):focus-visible{outline:2px solid var(--accent,#1F47C9);outline-offset:2px;border-radius:6px}
#actPanel .afil{margin-bottom:8px}
#homePane .knock.fold .kh span{display:none}
/* the photo needs no heading: the roof size is in Why it fits */
#stage.aerial .aer-h{display:none!important}
@media (max-width:640px){
  .rt .fit{gap:12px;margin-top:10px}
  .rt .fsc{min-width:86px;padding:10px 8px}
  .rt .fsc b{font-size:32px}
  .rt .fwhy li{font-size:15px}
}`;
  document.head.appendChild(css);

  // ---------- top: score + why it fits ----------
  const fit = document.createElement('div'); fit.className = 'fit'; fit.hidden = true; fit.setAttribute('aria-live', 'polite');
  addr.insertAdjacentElement('afterend', fit);
  const P = window.RCPLAIN;
  const SURE = { high: 'on record', medium: 'likely', low: 'not sure', unknown: 'not sure' };
  function reasons(E) {
    const out = [], p = E.parts || {};
    if (!E.eligibility.ok) out.push(`<li class="fno">Do not contact: ${esc(E.eligibility.reason)}</li>`);
    const big = (E.storms || []).filter(s => s.inches >= 1).sort((a, b) => b.inches - a.inches);
    if (big.length) out.push(`<li>${esc(P ? P.hail(big[0].inches) : big[0].inches.toFixed(2) + ' in')} hail, ${esc(big[0].label)}${big.length > 1 ? ` <i>(${big.length} storms)</i>` : ''}</li>`);
    else if ((E.storms || []).length) out.push(`<li>Small hail only <i>(under 1 inch)</i></li>`);
    const ra = p.roofAge || {}, m = /about (\d+) years/.exec(ra.plain || ''), conf = String(ra.conf || E.conf || '').toLowerCase();
    if (m) out.push(`<li>Roof ~${m[1]} yrs <i>(${SURE[conf] || 'likely'})</i></li>`);
    else if (/just re-roofed|New roof \d{4}/.test(ra.plain || '')) out.push(`<li>Roof is new <i>(on record)</i></li>`);
    else out.push(`<li>Roof age not sure <i>(no permit list here)</i></li>`);
    const nb = /^(\d+) neighbor/.exec((p.neighborhood || {}).plain || '');
    if (nb && +nb[1] > 0) out.push(`<li>${nb[1]} neighbor${+nb[1] === 1 ? '' : 's'} got a new roof lately</li>`);
    const sq = /About (\d+) squares/.exec((p.roof || {}).plain || '');
    if (sq && out.length < 4) out.push(`<li>${esc(P ? P.size(sq[1]) : 'About ' + sq[1] + ' squares')}</li>`);
    return out.slice(0, 4).join('');
  }
  let cur = null;
  const giNow = () => { const H = window.HOME; if (!H) return null; const g = H.rec && H.rec.gi != null ? +H.rec.gi : /^m(\d+)$/.test(H.rawId || '') ? +H.rawId.slice(1) : null; return g >= 0 ? g : null; };
  function update() {
    const gi = giNow(); if (gi === cur) return; cur = gi;
    if (gi == null || !window.RCS) { fit.hidden = true; return; }
    RCS.explain(gi).then(E => { if (gi !== cur || !E) return;
      fit.innerHTML = `<div class="fsc" title="Opportunity score: roof age, storm, roof size, your contact and neighbors. A ranking, not proof of damage."><b>${E.score}</b><span>of 100</span><small>Opportunity score</small></div>
        <div class="fwhy"><h2>Why it fits</h2><ul>${reasons(E)}</ul></div>`;
      fit.hidden = false; }).catch(() => { if (gi === cur) fit.hidden = true; });
  }
  const prev = window.renderRecord; window.renderRecord = function () { if (prev) prev.apply(this, arguments); update(); };
  setInterval(update, 1000);   // a home switched in place (rec.js switchTo)
  if (window.HOME_READY && window.HOME_READY.then) window.HOME_READY.then(update);
  RC.on && RC.on(d => { if (d && ['pipe', 'optout', 'suppress'].includes(d.key)) { cur = null; update(); } });
  update();

  // ---------- one action: More holds the rest ----------
  const more = $('#bMore');
  if (more) { more.insertAdjacentHTML('beforeend', '<span class="mlbl">More</span>'); more.setAttribute('aria-label', 'More: email, book, proof page, proposal'); }
  const stick = $('.stick');
  if (stick && more) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'smore'; b.innerHTML = '<span class="mlbl">More</span>';
    b.onclick = () => more.click(); stick.appendChild(b);
  }

  // ---------- Activity: its own section (Activity and Notes leave the Roof tabs) ----------
  const actTab = document.querySelector('.tab[data-t="act"]'), notesTab = document.querySelector('.tab[data-t="notes"]');
  const actPanel = document.createElement('section'); actPanel.className = 'panel act'; actPanel.id = 'actPanel'; actPanel.setAttribute('aria-label', 'Activity');
  actPanel.innerHTML = '<div class="ph"><h3>Activity</h3><span class="pill" id="actPill">0</span></div><div class="actb"></div><div class="noteb"></div>';
  if (actTab) [...actTab.children].forEach(c => actPanel.querySelector('.actb').appendChild(c));
  if (notesTab) [...notesTab.children].forEach(c => actPanel.querySelector('.noteb').appendChild(c));
  document.querySelectorAll('#tabs [data-t="act"], #tabs [data-t="notes"]').forEach(b => { b.hidden = true; b.style.display = 'none'; });
  const pill = () => { const a = +(($('#actN') || {}).textContent || 0), n = +(($('#noteN') || {}).textContent || 0); actPanel.querySelector('#actPill').textContent = a + n ? (a + n) + ' on file' : 'Nothing yet'; };
  ['#actN', '#noteN'].forEach(s => { const el = $(s); if (el) new MutationObserver(pill).observe(el, { childList: true, characterData: true, subtree: true }); });
  pill();

  // ---------- order and folding ----------
  const order = ['next', 'factsPanel', 'hailPanel', 'actPanel', 'evidPanel', 'knockPanel', 'measPanel', 'proposal'];
  const els = { actPanel };
  order.forEach(id => { const el = els[id] || document.getElementById(id); if (el) pane.appendChild(el); });
  const OPEN = { factsPanel: 1, next: 1, proposal: 1 };   // the rest start folded, their names showing
  [...pane.querySelectorAll(':scope>.panel')].forEach(p => { if (!OPEN[p.id]) p.classList.add('fold'); });
  function setPh() { pane.querySelectorAll(':scope>.panel>.ph, :scope>.panel>.kh').forEach(ph => { if (ph.getAttribute('role') !== 'button') { ph.setAttribute('role', 'button'); ph.tabIndex = 0; }
    ph.setAttribute('aria-expanded', String(!ph.parentElement.classList.contains('fold'))); }); }
  // evidence.js and hailpanel.js redraw their own headers: keep them switches
  new MutationObserver(setPh).observe(pane, { childList: true, subtree: true }); setPh();
  function toggle(ph) { const p = ph.parentElement; p.classList.toggle('fold'); setPh(); if (p.id === 'measPanel' && !p.classList.contains('fold')) dispatchEvent(new Event('resize')); }
  pane.addEventListener('click', e => { const ph = e.target.closest('.panel>.ph, .panel>.kh'); if (!ph || !pane.contains(ph) || e.target.closest('a,button:not(.ph)')) return; toggle(ph); });
  pane.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const ph = e.target.closest && e.target.closest('.panel>.ph, .panel>.kh'); if (ph && e.target === ph) { e.preventDefault(); toggle(ph); } });
  const unfold = el => { if (el && el.classList.contains('fold')) { el.classList.remove('fold'); setPh(); } };

  // a record tab asked for (Add a note, a plane picked on the roof): unfold its section
  const prevTab = window.setTab;
  if (prevTab) window.setTab = t => {
    if (t === 'act' || t === 'notes') { if (window.showPane) showPane('home'); unfold(actPanel); actPanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
    unfold($('#measPanel')); prevTab(t);
  };
})();
