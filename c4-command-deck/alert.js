/* alert.js: the morning-after storm card on Today (Jack 10-26: "the morning-after storm alert is a core feature").
   Reads lib/st-data-dfw/meta/alerts.json (scripts/alerts/morning_after.py, run by the daily StormWatch job after a 1 in+ storm).
   A card shows at the top of Today only on the morning a storm hit and the next day (alert_day = today or yesterday);
   a quiet day shows nothing at all. ?alert=YYYY-MM-DD on Today or the shell shows that alert as this morning's (the owner's
   text and email link carry it). The card opens the storm route (homes with 1 in+ hail, old roofs, no re-roof permit, street
   by street) and the alert history. Nothing here sends anything. */
(function () {
  'use strict';
  const RC = window.RC; if (!RC) return;
  const esc = RC.esc || (s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const fmt = n => Number(n || 0).toLocaleString('en-US');
  const inch = x => String(+(+x).toFixed(2));
  const plainIn = x => window.RCPLAIN ? RCPLAIN.hail(x) : inch(x) + ' in';   // "1.4 inches" on the surface (Jack 10-26)
  const HK = 'alertHidden';
  const PREVIEW_LATEST = true;   // scripts/publish/build_preview.py: the public preview shows the newest alert on file (labelled with its date)
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const lbl = (iso, y) => { const [a, b, c] = iso.split('-').map(Number); return MON[b - 1] + ' ' + c + (y ? ', ' + a : ''); };
  const wk = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const dayKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const param = k => { let v = null; try { v = new URLSearchParams(location.search).get(k); } catch (e) { } if (!v) try { v = new URLSearchParams(window.parent.location.search).get(k); } catch (e) { } return v; };

  const css = document.createElement('style');
  css.textContent = `
.ma{flex:0 1 900px;min-width:0;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 20px;align-items:center;position:relative;background:#fff;border:1px solid var(--c-line,#D5D9E0);border-left:3px solid var(--accent,#0D6C99);border-radius:8px;padding:12px 14px 12px 16px;box-shadow:0 1px 2px rgba(11,16,32,.06);font-family:inherit;color:var(--c-ink,#0B1020)}
.ma .k{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--c-slate,#5A6378);display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.ma .k b{color:var(--c-ink,#0B1020);font-weight:600;letter-spacing:.04em}
.ma .k i{font-style:normal}
.ma h2{margin:3px 0 0;font-size:17px;font-weight:600;letter-spacing:-.01em;line-height:1.3;text-wrap:balance}
.ma h2 .h2b{color:var(--c-slate,#5A6378);font-weight:500}
.ma .acts{display:flex;gap:6px;align-items:center}
.ma button{font:inherit;font-size:13px;font-weight:600;border-radius:6px;min-height:36px;padding:0 14px;cursor:pointer;border:1px solid var(--c-line,#D5D9E0);background:#fff;color:var(--c-ink,#0B1020);white-space:nowrap}
.ma button.pri{background:#fff;border:1.5px solid var(--c-ink,#0B1020);color:var(--c-ink,#0B1020)}
.ma button.pri:hover{background:var(--c-tint,#F1F5FA)}
.ma button:not(.pri):hover{background:var(--c-tint,#F1F5FA)}
.ma .lnk,.head .mtog{border:0;background:none;color:var(--c-slate,#5A6378);font-weight:500;min-height:32px;padding:0 8px;display:inline-flex;align-items:center;gap:5px}
.head .mtog svg{transition:transform .2s ease}.head .mtog[aria-expanded="true"] svg{transform:rotate(180deg)}
.ma .more{display:none;grid-column:1/-1;border-top:1px solid var(--c-line-2,#E6E8ED);margin-top:8px;padding-top:8px}
.head.open .ma .more{display:block}
.ma .nums{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--c-slate,#5A6378)}
.ma .nums b{color:var(--c-ink,#0B1020);font-weight:600;font-variant-numeric:tabular-nums}
.ma .st{margin-top:5px;font-size:12.5px;color:var(--c-slate,#5A6378);line-height:1.45}
.ma .mlinks{display:flex;gap:4px;margin:4px 0 -6px -8px}
.madlg{margin:auto;border:0;padding:0;border-radius:8px;background:#fff;color:var(--c-ink,#0B1020);width:min(560px,calc(100% - 24px));max-height:calc(100dvh - 60px);box-shadow:0 30px 60px -20px rgba(11,16,32,.4);font-family:inherit}
.madlg::backdrop{background:rgba(11,16,32,.35)}
.madlg .hd{display:flex;align-items:flex-start;gap:12px;padding:18px 20px 10px;border-bottom:1px solid var(--c-line-2,#E6E8ED)}
.madlg .hd h3{margin:0;font-size:17px;font-weight:600;flex:1;line-height:1.3}
.madlg .hd small{display:block;font-size:12.5px;color:var(--c-slate,#5A6378);font-weight:400;margin-top:3px}
.madlg .hd button{font:inherit;font-size:13px;border:1px solid var(--c-line,#D5D9E0);background:#fff;border-radius:6px;min-height:34px;padding:0 12px;cursor:pointer}
.madlg .bd{padding:6px 20px 14px;overflow:auto;max-height:calc(100dvh - 220px)}
.madlg .ft{display:flex;gap:8px;flex-wrap:wrap;padding:12px 20px 16px;border-top:1px solid var(--c-line-2,#E6E8ED)}
.madlg .ft button{font:inherit;font-size:13px;font-weight:600;border-radius:6px;min-height:40px;padding:0 14px;cursor:pointer;border:1px solid var(--c-line,#D5D9E0);background:#fff;color:var(--c-ink,#0B1020)}
.madlg .ft button.pri{background:var(--c-ink,#0B1020);border-color:var(--c-ink,#0B1020);color:#fff}
.madlg .grp{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--c-slate,#5A6378);margin:14px 0 4px;display:flex;justify-content:space-between;gap:8px}
.madlg .row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:10px;align-items:center;width:100%;text-align:left;font:inherit;font-size:13.5px;border:0;border-bottom:1px solid var(--c-line-2,#E6E8ED);background:none;padding:9px 2px;min-height:44px;cursor:pointer;color:inherit}
.madlg .row:hover{background:var(--c-tint,#F1F5FA)}
.madlg .row i{font-style:normal;font-size:12px;color:var(--c-slate,#5A6378);font-variant-numeric:tabular-nums}
.madlg .row span small{display:block;font-size:12px;color:var(--c-slate,#5A6378)}
.madlg .row em{font-style:normal;font-size:12.5px;color:var(--c-slate,#5A6378);font-variant-numeric:tabular-nums;white-space:nowrap}
.madlg .note{font-size:12px;color:var(--c-slate,#5A6378);line-height:1.45;margin:12px 0 0}
.madlg .hist{display:block;width:100%;text-align:left;font:inherit;border:1px solid var(--c-line,#D5D9E0);border-radius:6px;background:#fff;padding:10px 12px;margin:10px 0 0;cursor:pointer;color:inherit}
.madlg .hist:hover{background:var(--c-tint,#F1F5FA)}
.madlg .hist b{display:block;font-size:14px;font-weight:600}
.madlg .hist span{display:block;font-size:12.5px;color:var(--c-slate,#5A6378);margin-top:2px}
@media (max-width:640px){
  .ma{margin-top:8px;grid-template-columns:minmax(0,1fr);gap:8px;padding:11px 12px 12px 13px}
  .ma h2{font-size:15px}
  .ma .k{flex-wrap:nowrap;white-space:nowrap}.ma .k .wd{display:none}
  .ma .nums{gap:4px 12px;font-size:12.5px}
  .ma .acts button{min-height:44px}
  .ma .acts .pri{flex:1 1 auto}
  .ma .lnk,.head .mtog{min-height:44px}
  .madlg{width:100%;max-width:none;margin:auto 0 0;border-radius:12px 12px 0 0;max-height:88dvh}
  .madlg .bd{max-height:calc(88dvh - 200px)}
  .madlg .ft{gap:6px;padding:10px 14px 14px}
  .madlg .ft button{flex:1 1 40%;min-height:44px;padding:0 10px}
  .madlg .ft button.pri{flex-basis:100%}
  .ma .st,.ma .nums .n075{display:none}
}`;
  document.head.appendChild(css);

  let ALL = [], cur = null, dlg = null;
  const hidden = () => (RC.__get ? RC.__get(HK, null) : null);

  function active(list) {
    const want = param('alert');
    if (want) return list.find(a => a.id === want) || null;
    const t = new Date(), y = new Date(t); y.setDate(t.getDate() - 1);
    const ok = new Set([dayKey(t), dayKey(y)]);
    const a = list.find(x => ok.has(x.alert_day));
    if (!a && PREVIEW_LATEST) return list[0] || null;
    return a && hidden() !== a.id ? a : null;
  }

  /* Today simplified (Jack 10-26: "I like all of the information but it needs to be more simple"): the card shows the one
     headline (hail, homes hit, old roofs) and one action; the rest (0.75 in+ count, cities, top streets, past alerts, hide)
     sits behind Details, which also opens the greeting's proof line and stat strip (one toggle for the whole top area). */
  function card(a) {
    const head = document.querySelector('.head'); if (!head) return;
    let el = document.getElementById('maCard');
    if (!el) { el = document.createElement('section'); el.id = 'maCard'; el.className = 'ma'; el.setAttribute('aria-label', 'Morning-after storm alert'); head.appendChild(el); }
    const sts = (a.top_streets || []).slice(0, 3).map(s => esc(s.street) + ' (' + esc(s.city) + ')').join(', ');
    const today = a.alert_day === dayKey(new Date()), open = head.classList.contains('open');
    el.innerHTML = `<div class="mh"><div class="k"><b>Morning after</b><span>Storm on <i class="wd">${esc(wk(a.storm))}, </i>${esc(lbl(a.storm, false))}</span></div>
      <h2>Hail up to ${plainIn(a.max_in)} hit ${fmt(a.homes_hit)} of your homes.<span class="h2b"> ${oldLine(a)}.</span></h2></div>
      <div class="acts"><button type="button" class="pri" data-ma="route">Start today's route (${(a.route || []).length})</button>${moreBtn(open)}</div>
      <div class="more" id="maMore"><div class="nums"><span><b>${fmt(a.old_no_permit)}</b> roofs 15+ years old on record${a.age_unknown != null ? ` (${fmt(a.old_documented || 0)} by permit, ${fmt(a.old_likely || 0)} by year built in a city with full permit records)` : ''}</span>${a.age_unknown != null ? `<span><b>${fmt(a.age_unknown)}</b> older houses, roof age unknown (no full permit records in that city)</span>` : ''}<span class="n075"><b>${fmt(a.homes_075)}</b> took ${plainIn(0.75)} hail or more</span>${(a.cities || []).length ? `<span>${(a.cities || []).slice(0, 2).map(c => esc(c.city) + ' <b>' + fmt(c.homes) + '</b>').join(', ')}</span>` : ''}</div>
      ${sts ? `<div class="st">Top streets: ${sts}</div>` : ''}
      <div class="mlinks"><button type="button" class="lnk" data-ma="hist">Past alerts</button><button type="button" class="lnk" data-ma="hide">Hide for today</button></div></div>`;
    const t = document.getElementById('hdMore'); if (t) t.remove();   // the card carries the one Details toggle
  }
  const moreBtn = open => `<button type="button" class="lnk mtog" data-ma="more" aria-expanded="${open}" aria-controls="maMore">${open ? 'Less' : 'Details'}<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
  function toggleMore() {
    const head = document.querySelector('.head'); if (!head) return;
    const on = !head.classList.contains('open'); head.classList.toggle('open', on);
    document.querySelectorAll('.head [data-ma="more"]').forEach(b => { b.setAttribute('aria-expanded', on); b.firstChild.textContent = on ? 'Less' : 'Details'; });
  }
  /* a quiet day (no alert card): the greeting keeps a small Details toggle for the proof line and the stat strip */
  function quietToggle() {
    const h1 = document.querySelector('.hello h1'); if (!h1 || document.getElementById('maCard') || document.getElementById('hdMore')) return;
    const w = document.createElement('span'); w.id = 'hdMore'; w.innerHTML = moreBtn(false); h1.after(w);
    w.addEventListener('click', e => { if (e.target.closest('[data-ma="more"]')) toggleMore(); });
  }

  function openDlg(html) {
    if (!dlg) { dlg = document.createElement('dialog'); dlg.className = 'madlg'; dlg.setAttribute('aria-labelledby', 'maT'); document.body.appendChild(dlg);
      dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); }); dlg.addEventListener('click', onClick); }
    dlg.innerHTML = html; if (!dlg.open) dlg.showModal();
  }

  function route(a) {
    cur = a;
    const groups = []; let g = null;
    (a.route || []).forEach((h, k) => { if (!g || g.key !== h.street + '|' + h.city) { g = { key: h.street + '|' + h.city, street: h.street, city: h.city, homes: [] }; groups.push(g); } g.homes.push([k + 1, h]); });
    const body = groups.map(g => `<div class="grp"><span>${esc(g.street)}, ${esc(g.city)}</span><span>${g.homes.length} home${g.homes.length > 1 ? 's' : ''}</span></div>` +
      g.homes.map(([n, h]) => `<button type="button" class="row" data-openhome="${esc(h.id)}"><i>${n}</i><span>${esc(h.addr)}<small>${esc(h.city)}${h.zip ? ' ' + esc(h.zip) : ''}${h.year ? ', built ' + h.year : ''}</small></span><em>${inch(h.hail)} in</em></button>`).join('')).join('');
    const added = (a.route || []).filter(h => RC.isAdded && RC.isAdded(h.id)).length;
    openDlg(`<div class="hd"><h3 id="maT">Storm route, ${esc(lbl(a.storm, true))}<small>${(a.route || []).length} homes with ${inch(1)} in+ hail on houses 15+ years old (old roofs on record first, then roof age unknown), best streets first, each street by house number.</small></h3><button type="button" data-ma="close">Close</button></div>
      <div class="bd">${body || '<p class="note">No homes on file for this storm.</p>'}<p class="note">Radar hail is NOAA's estimate per home, not an inspection. Old roof: ${esc(a.old_rule || '')}${/unknown/.test(a.old_rule || '') ? '' : '. A missing permit does not prove an old roof'}. Tap a home to open its record.</p></div>
      <div class="ft"><button type="button" class="pri" data-ma="add">${added === (a.route || []).length && added ? 'On Today\'s list' : 'Put the route on Today\'s list'}</button><button type="button" data-ma="map">See the storm on the map</button><button type="button" data-ma="hist">Past alerts</button></div>`);
  }

  // roofs 15+ years old ON RECORD (a re-roof permit, or built that long ago in a city with a complete permit list) vs older
  // houses whose roof age is unknown (no complete permit list there: Plano, Frisco). Alerts before v2 had one number.
  function oldLine(a, short) {
    const old = a.old_no_permit || 0, unk = a.age_unknown;
    if (unk == null) return short ? `${fmt(old)} older houses` : `${fmt(old)} older houses, no re-roof permit on file`;
    if (short) return old ? `${fmt(old)} old roofs on record` + (unk ? `, ${fmt(unk)} roof age unknown` : '') : `${fmt(unk)} older houses, roof age unknown`;
    return old ? `${fmt(old)} have roofs 15+ years old on record` + (unk ? `, ${fmt(unk)} more are older houses with roof age unknown` : '')
      : `${fmt(unk)} are older houses, roof age unknown`;
  }

  function history() {
    const rows = ALL.map(a => `<button type="button" class="hist" data-ma-open="${esc(a.id)}"><b>${esc(wk(a.storm))}, ${esc(lbl(a.storm, true))}: up to ${inch(a.max_in)} in</b><span>${fmt(a.homes_hit)} homes hit, ${oldLine(a, true)}. Alert ${esc(lbl(a.alert_day, true))}${(a.top_streets || [])[0] ? ', top street ' + esc(a.top_streets[0].street) : ''}.</span></button>`).join('');
    openDlg(`<div class="hd"><h3 id="maT">Storm alerts<small>Every morning-after alert on file, newest first. One goes out the morning after 1 in+ hail hits your homes.</small></h3><button type="button" data-ma="close">Close</button></div>
      <div class="bd">${rows}</div>`);
  }

  function addRoute(a) {
    let n = 0; (a.route || []).forEach((h, k) => { const home = { id: h.id, addr: h.addr, city: h.city, zip: h.zip, lon: h.lon, lat: h.lat, hail: h.hail, storm: a.storm, from: 'morning-after alert', stop: k + 1 };
      RC.remember(home); if (RC.add(home)) n++; });
    if (typeof window.relist === 'function') try { window.relist(false); } catch (e) { }
    if (dlg && dlg.open) dlg.close();
    if (typeof window.showToast === 'function') window.showToast(n ? `${n} storm homes added to Today's list` : 'The route is already on Today\'s list',
      n ? () => { (a.route || []).forEach(h => RC.unadd(h.id)); if (typeof window.relist === 'function') window.relist(false); } : null);
  }

  function onClick(e) {
    const o = e.target.closest('[data-ma-open]'); if (o) { const a = ALL.find(x => x.id === o.dataset.maOpen); if (a) route(a); return; }
    const b = e.target.closest('[data-ma]'); if (!b) return;
    const k = b.dataset.ma, a = cur || active(ALL) || ALL[0];
    if (k === 'more') toggleMore();
    else if (k === 'route') route(a);
    else if (k === 'hist') history();
    else if (k === 'close') dlg && dlg.close();
    else if (k === 'add') addRoute(a);
    else if (k === 'map') { if (dlg) dlg.close(); RC.go('storm', { iso: a.storm }); }
    else if (k === 'hide') { if (RC.__set) RC.__set(HK, a.id); const el = document.getElementById('maCard'); if (el) el.remove(); quietToggle(); }
  }
  document.addEventListener('click', e => { if (e.target.closest('#maCard')) onClick(e); });

  (RC.factsReady || Promise.resolve()).then(() => fetch((RC.dataRoot || '../lib/st-data-dfw/') + 'meta/alerts.json', { cache: 'no-cache' }))
    .then(r => r.ok ? r.json() : null).then(d => {
      ALL = (d && Array.isArray(d.alerts) ? d.alerts : []).filter(a => a && a.id && a.storm).sort((a, b) => a.id < b.id ? 1 : -1);
      const a = active(ALL); cur = a; if (a) card(a); else quietToggle();
      window.RCAlerts = { all: () => ALL.slice(), active: () => cur, route, history };
    }).catch(() => quietToggle());   // no alerts file = a quiet app: nothing drawn
})();
