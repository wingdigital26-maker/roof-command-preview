/* At the door (upgrade 10-19): one tap logs a door knock on the home's record, and a "Not home" is never a dead end.
   Not home  -> "Knocked: not home" on the record, a better time to come back (evenings and Saturday mornings), and the
                text draft one tap away (the record's own Text dialog: a person sends it, inside texting hours)
   Talked    -> "Knocked: talked with the homeowner"; a New hit moves to Contacted
   No thanks -> "Knocked: not interested"; the home is parked in the board's Not now lane (restorable there)
   Book      -> the record's Book dialog (Inspection booked needs a time)
   Every tap has Undo. Knocks live in the pipeline history like every other touch (RC.history), so the Activity tab, the
   board and the cloud copy see them. Nothing sends. */
(function () {
  'use strict';
  const RC = window.RC, esc = RC.esc, $ = s => document.querySelector(s);
  const host = $('#knockPanel'); if (!host) return;
  const id = () => (window.HOME && (window.HOME.rawId || window.HOME.id)) || '';
  const KN = /^Knocked: /;
  const knocks = () => RC.history(id()).filter(h => KN.test(h.what || ''));
  const say = (m, u) => window.homeSay ? window.homeSay(m, u) : null;
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  // a weekday daytime knock found nobody home: most people are home weekday evenings or Saturday morning
  function comeBack(now) {
    const d = now.getDay(), h = now.getHours();
    if (d >= 1 && d <= 5 && h < 16) return 'today after 5 pm';
    if (d >= 1 && d <= 4) return DAYS[d + 1] + ' after 5 pm, or Saturday morning';
    if (d === 5) return 'Saturday morning';
    if (d === 6 && h < 12) return 'Monday after 5 pm';
    return 'Monday after 5 pm';
  }
  // drop one history line again (Undo)
  function unlog(at) {
    const all = RC.__get('pipe', {}) || {}, p = all[id()]; if (!p) return;
    p.history = (p.history || []).filter(h => h.at !== at); RC.__set('pipe', all);
  }
  function log(what) { RC.note(id(), what); const h = RC.history(id())[0]; return h ? h.at : null; }

  function render() {
    const k = knocks(), last = k[0], nh = k.filter(h => /not home/.test(h.what)).length;
    const when = last ? new Date(last.at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
    host.innerHTML = `<div class="kh"><h3>At the door</h3><span>${last ? `${k.length} knock${k.length > 1 ? 's' : ''}, last ${esc(when)}: ${esc(last.what.replace(KN, '').split('.')[0])}` : 'No knocks yet'}</span></div>
      <div class="kb" role="group" aria-label="Log a door knock">
        <button type="button" data-k="nothome"><b>Not home</b><small>Log it, plan a return</small></button>
        <button type="button" data-k="talked"><b>Talked</b><small>Moves to Contacted</small></button>
        <button type="button" data-k="no"><b>Not interested</b><small>Parks it in Not now</small></button>
        <button type="button" data-k="book" class="p"><b>Book inspection</b><small>Pick a time</small></button>
      </div>
      ${last && /not home/.test(last.what) ? `<div class="kn"><p><b>Come back ${esc(comeBack(new Date(last.at)))}.</b>${nh >= 3 ? ' Three tries with nobody home: a text or an email may reach them first.' : ' Or send the text draft now; it goes from your phone.'}</p><button type="button" data-k="text">Text draft</button></div>` : ''}`;
  }
  host.addEventListener('click', e => {
    const b = e.target.closest('[data-k]'); if (!b || !id()) return;
    const k = b.dataset.k, tid = id();
    if (k === 'book') { const bb = document.querySelector('[data-act="book"]'); if (bb) bb.click(); return; }
    if (k === 'text') { const tb = document.querySelector('[data-act="text"]'); if (tb) tb.click(); return; }
    if (k === 'nothome') { const at = log('Knocked: not home. Come back ' + comeBack(new Date()) + '.'); say('Logged: not home. Come back ' + comeBack(new Date()) + '.', () => unlog(at)); }
    else if (k === 'talked') {
      const prev = RC.stage(tid), at = log('Knocked: talked with the homeowner.');
      if (prev === 'new') RC.setStage(tid, 'called', 'Talked at the door');
      say('Logged: talked at the door.' + (prev === 'new' ? ' Moved to Contacted.' : ''), () => { unlog(at); if (prev === 'new') RC.setStage(tid, 'new', 'Moved back to New hit'); });
    } else if (k === 'no') {
      const prev = RC.stage(tid), prevA = (RC.pipeline()[tid] || {}).archived || null, at = log('Knocked: not interested.');
      RC.setStage(tid, prev, 'Moved to Not now', { archived: new Date().toISOString() });
      say('Logged: not interested. Parked in Not now.', () => { unlog(at); RC.setStage(tid, prev, 'Back from Not now', { archived: prevA }); });
    }
    render();
  });
  let lastId = null;
  const tick = () => { if (id() !== lastId) { lastId = id(); render(); } };
  RC.on(render); setInterval(tick, 1000); render();
})();
