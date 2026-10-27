/* aerial.js: the home record opens on the AERIAL PHOTO with the measured roof edges on it (Jack 10-26: "I don't think the 3D
   model is that accurate"). The 3D model stays one tap away ("3D model"); the choice is remembered on this device
   (localStorage rc-recview). The photo view is the same drawing as the LiDAR measurements tab (lib/rc-measure.js, imagery from
   lib/rc-imagery.js), mirrored here at stage size so the two never disagree. A home with no photo drawing stays on 3D.
   Nimbus's updates never sit on the photo (data-nb-clear, lib/nimbus-shell.js). */
(function () {
  'use strict';
  const stage = document.getElementById('stage'), report = document.getElementById('report'), dock = document.getElementById('dock');
  if (!stage || !report || !dock) return;
  let view = '3d';   // Jack 10-26 round 2: 3D is the default on every load; the photo is one tap away and not remembered (KEY unused)
  const css = document.createElement('style');
  css.textContent = `
#stage .aer{position:absolute;left:16px;right:16px;top:96px;display:none;flex-direction:column;align-items:center;gap:6px;z-index:3}
#stage.aerial{height:clamp(560px,calc(100vh - 150px),900px)}
#stage.aerial .aer{display:flex}
#stage .aer svg{border-radius:10px;box-shadow:0 1px 2px rgba(11,16,32,.08),0 12px 32px -18px rgba(11,16,32,.35);display:block}
#stage .aer .ms-l{font-size:14px;stroke-width:4px}
#stage .aer-ph svg{display:block}
aside.col{padding-bottom:96px}
@media (min-width:1101px){ body[data-view="home"] aside.col{margin-right:56px} }   /* a clear lane for Nimbus's corner: no fact row ends under him (10-26) */
#stage .aer.noline .ms-ol{display:none}
#stage .aer-tog{font:inherit;font-size:13px;font-weight:600;border:1px solid var(--hair,#D5D9E0);border-radius:6px;background:#fff;color:var(--ink,#0B1020);min-height:32px;padding:0 10px;margin-left:6px;cursor:pointer}
@media (max-width:640px){ #stage .aer-tog{min-height:44px} }
#stage .aer-cap{display:flex;flex-direction:column;gap:2px;font-size:14px;line-height:1.35;color:var(--muted,#465065)}
#stage .aer-cap b{color:var(--ink,#0B1020);font-weight:600}
#stage .aer-cap .img-credit{margin:0;font-size:10.5px}
#stage.aerial #gl,#stage.aerial #labels,#stage.aerial #legend{visibility:hidden}
#stage.aerial #chips,#stage.aerial .dock .ctl,#stage.aerial #titleP,#stage.aerial #titleH,#stage.aerial #areaTotal{display:none}
#stage .aer-h{display:none;margin:0;font-size:24px;font-weight:600;letter-spacing:-.01em;line-height:1.2}
#stage.aerial .aer-h{display:block}
@media (max-width:640px){ #stage .aer-h{font-size:21px} }
#stage .aseg{display:inline-flex;gap:2px;padding:3px;border-radius:8px;background:var(--panel-2,#F1F3F6);border:1px solid var(--hair,#D5D9E0);margin-right:8px;flex:none}
#stage .aseg[hidden]{display:none}
#stage .aseg button{font:inherit;font-size:13px;font-weight:600;border:0;border-radius:6px;min-height:34px;padding:0 12px;background:none;color:var(--muted,#465065);cursor:pointer;white-space:nowrap}
#stage .aseg button[aria-pressed="true"]{background:#fff;color:var(--ink,#0B1020);box-shadow:0 1px 2px rgba(11,16,32,.14),0 0 0 1px var(--hair,#D5D9E0)}
@media (max-width:640px){ #stage .aer{left:10px;right:10px} #stage .aseg button{min-height:44px} #stage.aerial{min-height:0} }`;
  document.head.appendChild(css);

  const aer = document.createElement('div'); aer.className = 'aer'; aer.id = 'aer'; aer.setAttribute('data-nb-clear', ''); stage.appendChild(aer);
  report.setAttribute('data-nb-clear', '');
  // 10-26: Nimbus's updates never sit on the record's right column (Next task, Home facts), and the column ends with room
  // for his corner so its last line can always be scrolled clear of him
  document.querySelectorAll('aside.col').forEach(el => el.setAttribute('data-nb-clear', ''));
  const seg = document.createElement('div'); seg.className = 'aseg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Roof view'); seg.hidden = true;
  seg.innerHTML = '<button type="button" data-rv="3d" aria-pressed="false">3D</button><button type="button" data-rv="aerial" aria-pressed="false">Photo</button>';
  dock.insertBefore(seg, dock.firstChild);
  // the photo view's own plain heading ("Big roof, about 44 squares. Steep."); the measured numbers stay in its tooltip
  const ah = document.createElement('h2'); ah.className = 'aer-h'; ah.setAttribute('aria-live', 'polite');
  const title = document.getElementById('title'); if (title) title.insertBefore(ah, title.firstChild);
  function heading() {
    const src = document.getElementById('titleH'), s = src ? src.textContent : '', P = window.RCPLAIN;
    const m = /~?\s*([\d.]+)\s*sq/.exec(s), size = m && P ? P.size(m[1]) : '', w = /\b(steep|medium slope|low slope)\b/i.exec(s), sl = P ? P.slope(s) || (w ? w[1][0].toUpperCase() + w[1].slice(1).toLowerCase() : '') : '';   // the plain-words sweep may already have said 'steep'
    const txt = size ? size + '.' + (sl ? ' ' + sl + '.' : '') : (s || 'The roof from above');
    if (ah.textContent !== txt) ah.textContent = txt;
    ah.title = (s ? s + '. ' : '') + 'Estimates: order a measurement report before you quote.';
  }
  { const src = document.getElementById('titleH'); if (src) new MutationObserver(heading).observe(src, { childList: true, characterData: true, subtree: true }); }

  let has = false, last = '';
  const phone = () => matchMedia('(max-width:640px)').matches;
  /* the photo fills the stage between the title and the dock, at the stage's own shape (wide on a desktop), drawn at its
     real pixel size so the edge labels read at 14px; it is redrawn only when that size really changes */
  let drawn = '';
  function place() {
    if (!has) return;
    stage.style.height = '';
    const s = stage.getBoundingClientRect(), ph = phone(), side = ph ? 10 : 16;
    let top = 56;
    [...stage.children].forEach(el => {
      if (el === aer || el === dock || /^(gl|labels|legend)$/.test(el.id)) return;
      if (!ph && el.id !== 'title') return;
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const r = el.getBoundingClientRect(); if (!r.height || r.top - s.top > 200) return;
      top = Math.max(top, r.bottom - s.top);
    });
    top = Math.round(top + 10);
    let w = Math.floor(s.width - 2 * side);
    if (!(w > 40)) { if ((place.retry = (place.retry || 0) + 1) < 25) setTimeout(place, 300); return; }   // stage not laid out yet (slow render, hidden tab): never draw a negative-size SVG, try again shortly
    place.retry = 0;
    const capEl = aer.querySelector('.aer-cap'); if (capEl) capEl.style.width = w + 'px';
    const capH = (capEl ? capEl.offsetHeight : 40) + 14, dockH = dock.getBoundingClientRect().height + 22;
    let h;
    if (ph) { h = Math.round(w * 0.95); stage.style.height = Math.round(top + h + capH + dockH) + 'px'; }
    else h = Math.floor(Math.max(260, s.height - top - capH - dockH));
    if (!ph) w = Math.min(w, Math.round(h * 1.3));   // the house's own box, not the whole street (Jack 10-26)
    aer.style.top = top + 'px';
    const key = Math.round(w / 24) + 'x' + Math.round(h / 24) + ':' + last;   // (the stage height above is re-set every time)
    if (key === drawn) return; drawn = key;
    const svg = window.RCMEASURE && RCMEASURE.stageSVG ? RCMEASURE.stageSVG(w, h) : '';
    const holder = aer.querySelector('.aer-ph'); if (!holder) return;
    holder.innerHTML = svg || last;   // last = the side panel's square drawing (a fallback)
    const sv = holder.querySelector('svg'); if (sv) { sv.style.width = w + 'px'; sv.style.height = (svg ? h : w) + 'px'; }
    aer.querySelector('.aer-cap').style.width = w + 'px';
  }
  function apply() {
    const on = has && view === 'aerial';
    stage.classList.toggle('aerial', on); seg.hidden = !has;
    seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.rv === (on ? 'aerial' : '3d'))));
    if (on) requestAnimationFrame(place); else stage.style.height = '';
  }
  function sync() {
    const svg = report.querySelector('.ms .ms-svg'), cr = report.querySelector('.ms .img-credit');
    has = !!(svg && svg.querySelector('image'));   // the photo drawing only (a passed model's line diagram has no photo)
    const html = has ? svg.outerHTML : '';
    if (html !== last) { last = html; drawn = '';
      aer.innerHTML = has ? `<div class="aer-ph"></div><div class="aer-cap"><span>The roof from above. <button type="button" class="aer-tog" aria-pressed="false">Show outline</button></span>${cr ? cr.outerHTML : ''}</div>` : '';
      aer.classList.add('noline'); }   // Jack 10-26: a clean photo, no lines drawn over the house; the outline is one tap away
    heading(); apply();
  }
  // the outline comes from public building maps and can sit a few feet off the roof: one tap shows the photo alone
  aer.addEventListener('click', e => { const b = e.target.closest('.aer-tog'); if (!b) return; const off = !aer.classList.contains('noline');
    aer.classList.toggle('noline', off); b.textContent = off ? 'Show outline' : 'Hide outline'; b.setAttribute('aria-pressed', String(!off)); });
  seg.onclick = e => { const b = e.target.closest('[data-rv]'); if (!b) return; view = b.dataset.rv;
    apply(); if (view === '3d') dispatchEvent(new Event('resize')); };
  new MutationObserver(sync).observe(report, { childList: true, subtree: true });
  addEventListener('resize', () => { if (stage.classList.contains('aerial')) place(); });
  sync();
})();
