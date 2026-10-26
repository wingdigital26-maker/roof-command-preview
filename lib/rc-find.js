/* The shell's header search (product.html #findIn, Ctrl K, the phone search icon). From any screen it searches the whole home
   database (lib/st-meta.js, the county roll copies every screen reads): an address ("7901 Windrose"), a street ("Windrose"),
   a subdivision, a ZIP, a city, an owner name (only where RC.owner may load names: signed in or local dev) and storm dates.
   A home opens its record in the CRM (#/crm/home/m<i>); a street, subdivision, ZIP or city opens the CRM Pipeline with the
   board search filled in and every home there listed (c5-home/find.js); a storm opens on Storms. Enter takes the first
   result (or the one picked with the arrows), even when pressed before the results have drawn.
   RCFind.mount({input, box, go, frameOf}) from product.html. Nothing leaves the machine: every read is a local data file. */
(function () {
  if (window.RCFind) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Number(n || 0).toLocaleString('en-US');
  const KIND = { home: 'Home', owner: 'Owner', street: 'Street', subdivision: 'Subdivision', zip: 'ZIP', city: 'City', storm: 'Storm' };
  let O = null, input, box, res, items = [], sel = 0, gen = 0, timer = null, busy = false, enterWaiting = false, lastQ = '';
  let catP = null;
  const storms = () => catP || (catP = fetch((window.STM ? STM.BASE : 'lib/st-data-dfw/') + 'catalog.json').then(r => r.ok ? r.json() : null).then(c => (c && c.storms) || []).catch(() => []));
  const css = document.createElement('style');
  css.textContent = `
.fres{position:fixed;z-index:60;background:#fff;border:1px solid var(--c-line,#D5D9E0);border-radius:6px;box-shadow:0 1px 2px rgba(11,16,32,.06),0 18px 40px -18px rgba(11,16,32,.35);padding:4px;display:none;max-height:min(560px,calc(100vh - 80px));overflow-y:auto;overscroll-behavior:contain}
.fres.on{display:block}
.fres button{display:grid;grid-template-columns:82px minmax(0,1fr) auto;align-items:center;gap:10px;width:100%;text-align:left;border:0;background:none;padding:8px 10px;border-radius:4px;cursor:pointer;font:inherit;color:#0B1020;min-height:44px}
.fres button:hover,.fres button.on{background:var(--c-tint,#F1F5FA)}
.fres .k{font-family:var(--c-mono,monospace);font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--c-slate,#5A6378)}
.fres .t{min-width:0}.fres .t b{display:block;font-weight:600;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fres .t span{display:block;font-size:12px;color:var(--c-slate,#5A6378);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
.fres .n{font-family:var(--c-mono,monospace);font-size:12px;color:var(--c-slate,#5A6378);font-variant-numeric:tabular-nums;white-space:nowrap}
.fres .none,.fres .wait{padding:12px;font-size:13px;color:var(--c-slate,#5A6378)}
.fres .foot{padding:6px 10px 4px;font-size:11.5px;color:var(--c-slate,#5A6378);border-top:1px solid var(--c-line-2,#E6E8ED);margin-top:4px}
@media (max-width:900px){
  body.finding>header .find{position:fixed;left:12px;right:12px;top:8px;width:auto!important;height:44px!important;padding:0 12px!important;justify-content:flex-start!important;z-index:61;background:#fff;box-shadow:0 0 0 3px rgba(39,87,230,.14)}
  body.finding>header .find input{display:block!important;font-size:16px}
  .fres{left:12px!important;right:12px;width:auto!important;top:60px!important}
  .fres button{grid-template-columns:70px minmax(0,1fr) auto;min-height:52px}
}`;
  document.head.appendChild(css);

  function place() {
    if (!res) return; const r = box.getBoundingClientRect(), narrow = matchMedia('(max-width:900px)').matches;
    if (narrow) { res.style.left = ''; res.style.width = ''; res.style.top = ''; return; }
    const w = Math.max(r.width, 460); res.style.top = (r.bottom + 6) + 'px'; res.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px'; res.style.width = w + 'px';
  }
  function draw() {
    place();
    if (!items.length) { res.innerHTML = busy ? '<div class="wait">Searching every home</div>' : `<div class="none">No home, street, ZIP or storm matches "${esc(lastQ)}"</div>`; res.classList.add('on'); return; }
    res.innerHTML = items.map((it, k) => `<button type="button" role="option" class="${k === sel ? 'on' : ''}" data-k="${k}" aria-selected="${k === sel}"><span class="k">${KIND[it.kind]}</span><span class="t"><b>${esc(it.title)}</b><span>${esc(it.sub || '')}</span></span><span class="n">${esc(it.n || '')}</span></button>`).join('')
      + `<div class="foot">Enter opens the first result in the CRM</div>`;
    res.classList.add('on');
  }
  function close() { if (res) res.classList.remove('on'); items = []; sel = 0; enterWaiting = false; document.body.classList.remove('finding'); }
  function choose(it) {
    if (!it) return; const q = input.value; close(); input.value = ''; input.blur();
    it.run(q);
  }
  // ---------- actions ----------
  function openHome(gi, m) {
    const id = 'm' + gi;
    if (m && window.RC && RC.remember) RC.remember({ id, gi, addr: m.addr, city: m.city, zip: m.zip, place: m.place, full: m.full, subdivision: m.subdivision || '', state: m.state });
    O.go('home', { view: 'home', id });
  }
  function openArea(f) {
    O.go('home', { view: 'pipeline' });
    const t0 = Date.now();
    const send = () => { const fr = O.frameOf('home'); let w = null; try { w = fr && fr.loaded && fr.el.contentWindow; } catch (e) { }
      if (w && w.__crmFind) { try { w.__crmFind(f); } catch (e) { } return; }
      if (Date.now() - t0 < 30000) setTimeout(send, 200); };
    setTimeout(send, 60);
  }
  // ---------- search ----------
  function homeItem(h, kind, sub) { return { kind: kind || 'home', title: h.full || h.addr, sub: sub || [h.subdivision, h.county].filter(Boolean).join(', '), run: () => openHome(h.i, h) }; }
  function stormItems(list, t) {
    const l = t.toLowerCase(), out = [];
    list.forEach(s => { const d = new Date(s.date + 'T12:00:00Z'), long = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }), short = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      if (!(l.length >= 3 && (long.toLowerCase().startsWith(l) || short.toLowerCase().startsWith(l) || s.date.startsWith(l) || ('storm ' + long).toLowerCase().startsWith(l) || ('storm of ' + long).toLowerCase().startsWith(l)))) return;
      out.push({ kind: 'storm', title: 'Storm of ' + long, sub: 'Opens on Storms', n: fmt(s.homes_1in) + ' homes', run: () => O.go('storm', { iso: s.date }) }); });
    return out.slice(0, 3);
  }
  function run(q) {
    const my = ++gen, t = q.trim(); lastQ = t;
    if (t.length < 2 || !window.STM) { close(); return; }
    busy = true; items = []; sel = 0; draw();
    const num = /^\d{1,5}\s+\S/.test(t), zipQ = /^\d{3,5}$/.test(t), word = !/\d/.test(t);
    Promise.all([
      num ? STM.search(t, 6) : Promise.resolve([]),
      num || zipQ ? Promise.resolve([]) : STM.streets(t, 3),
      num ? Promise.resolve([]) : STM.searchPlaces(t, 4),
      word || /^\d{4}-|^(storm|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(t) ? storms() : Promise.resolve([])
    ]).then(([hs, sts, pls, ss]) => {
      if (my !== gen) return;
      const out = [];
      hs.forEach(h => out.push(homeItem(h)));
      pls.filter(p => p.kind === 'zip').forEach(p => out.push(areaItem(p)));
      sts.forEach(s => out.push({ kind: 'street', title: s.street, sub: [s.city, s.zips.join(', ')].filter(Boolean).join(' ') + '. Opens the CRM on this street', n: fmt(s.count) + (s.count === 1 ? ' home' : ' homes'),
        run: () => openArea({ kind: 'street', title: s.street + ', ' + s.city, sub: s.zips.length ? 'ZIP ' + s.zips.join(', ') : '', q: s.street, ids: s.ids }) }));
      pls.filter(p => p.kind !== 'zip').forEach(p => out.push(areaItem(p)));
      stormItems(ss, t).forEach(x => out.push(x));
      items = out.slice(0, 9); busy = false; sel = 0; draw();
      if (enterWaiting && items.length) { enterWaiting = false; choose(items[0]); return; }
      // owner names come second (the county roll is a few MB, loaded on the first owner search)
      if (word && t.length >= 3 && window.RC && RC.ownersAllowed && RC.ownersAllowed()) RC.ownersWarm().then(() => {
        if (my !== gen) return; const os = RC.ownerFind(t, 4); if (!os.length) return;
        return Promise.all(os.map(o => STM.meta(o.gi).then(m => m ? Object.assign({}, m, { i: o.gi, owner: o.name }) : null))).then(ms => {
          if (my !== gen) return; const add = ms.filter(Boolean).map(m => homeItem(m, 'owner', [m.owner, m.subdivision].filter(Boolean).join(', ')));
          const keep = items.filter(x => x.kind !== 'owner'), seen = new Set(keep.map(x => x.title)), fresh = add.filter(x => !seen.has(x.title) && seen.add(x.title));
          if (!fresh.length) return; items = (keep.length ? keep.slice(0, 7).concat(fresh) : fresh).slice(0, 9); draw(); });
      });
    }).catch(() => { if (my === gen) { busy = false; items = []; draw(); } });
  }
  function areaItem(p) {
    const ranges = p.ranges || [[p.start, p.count]];
    const title = p.kind === 'city' ? p.title : p.kind === 'zip' ? 'ZIP ' + p.title : p.title;
    const sub = (p.kind === 'subdivision' ? 'Subdivision in ' + p.city + ' ' + p.zip : p.kind === 'zip' ? p.city : 'City') + '. Opens the CRM here';
    return { kind: p.kind, title, sub, n: fmt(p.count) + ' homes', run: () => openArea({ kind: p.kind, title: p.kind === 'subdivision' ? p.title + ', ' + p.city : title, sub: p.kind === 'subdivision' ? 'ZIP ' + p.zip : p.kind === 'zip' ? p.city : '', q: p.title, ranges }) };
  }
  // ---------- wiring ----------
  function open() { document.body.classList.add('finding'); setTimeout(() => { input.focus(); input.select(); place(); if (input.value.trim().length >= 2) run(input.value); }, 30); }
  function mount(o) {
    O = o; input = o.input; box = o.box;
    res = document.createElement('div'); res.className = 'fres'; res.id = 'fres'; res.setAttribute('role', 'listbox'); res.setAttribute('aria-label', 'Search results'); document.body.appendChild(res);
    input.setAttribute('placeholder', 'Search address, ZIP or owner'); input.setAttribute('aria-label', 'Search every home: address, street, subdivision, ZIP, city or owner'); box.title = 'Search every home. Results open in the CRM (Ctrl K)';
    input.addEventListener('input', () => { clearTimeout(timer); const q = input.value; if (q.trim().length < 2) { gen++; close(); if (document.activeElement === input && matchMedia('(max-width:900px)').matches) document.body.classList.add('finding'); return; } timer = setTimeout(() => run(q), 160); });
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); input.value = ''; close(); input.blur(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!items.length) return; sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; draw(); return; }
      if (e.key === 'Enter') { e.preventDefault(); if (input.value.trim().length < 2) return;
        if (items.length && !busy && lastQ === input.value.trim()) { choose(items[sel]); return; }
        enterWaiting = true; clearTimeout(timer); if (lastQ !== input.value.trim() || !busy) run(input.value); }
    });
    input.addEventListener('focus', () => { if (input.value.trim().length >= 2 && items.length) draw(); });
    input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input && !res.matches(':hover')) close(); }, 200));
    res.addEventListener('mousedown', e => e.preventDefault());   // a click on a result never blurs the box first
    res.addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (b) choose(items[+b.dataset.k]); });
    box.addEventListener('click', () => { if (getComputedStyle(input).display === 'none' || matchMedia('(max-width:900px)').matches) open(); });
    addEventListener('resize', place);
    // warm the county roll copies once the first screen is up, so the first search answers at once
    setTimeout(() => (window.requestIdleCallback || setTimeout)(() => { if (window.STM) { STM.search('qq', 1); STM.searchPlaces('qq', 1); } }, { timeout: 8000 }), 6000);
    document.addEventListener('pointerdown', e => { if (document.body.classList.contains('finding') && !box.contains(e.target) && !res.contains(e.target)) { input.value = ''; close(); } });
  }
  window.RCFind = { mount, open, close, run, items: () => items.map(x => ({ kind: x.kind, title: x.title, n: x.n })) };
})();
