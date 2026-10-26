/* Find homes screen (c10-find). All logic lives in lib/rc-scores.js (window.RCS, the same functions Nimbus calls);
   this file is only the screen: filters, results list + map, saved searches, best blocks, rep lists. Nothing sends. */
(function () {
  'use strict';
  const RC = window.RC, RCS = window.RCS, esc = RC.esc, fmt = RC.fmt, $ = s => document.querySelector(s);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dshort = iso => iso ? MON[+iso.slice(5, 7) - 1] + ' ' + (+iso.slice(8, 10)) + ', ' + iso.slice(0, 4) : '';
  const CONFW = { high: 'On record', medium: 'Likely', low: 'Weak record', unknown: 'Unknown' };
  const CONFT = { high: 'Re-roof permit tied to this house (High)', medium: 'A permit with a looser match, or an original roof in a city with full permit records (Medium)', low: 'A permit that may be a repair, or an older house with no re-roof since the city list starts (Low)', unknown: 'Year built only: no full permit records here, the roof may have been replaced (Unknown)' };
  const LS = 'rc.find.filters';
  let F = {}, last = null, sel = new Set(), map = null, drawing = null, view = 'search', shown = 100;
  try { F = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { F = {}; }
  const toast = t => { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 3200); };
  const go = gi => RC.go ? RC.go('home', { id: 'm' + gi }) : null;

  // ---------- filters ----------
  const PRESETS = [
    ['15+ year roofs after hail', { roofAgeMin: 15, conf: ['high', 'medium', 'low'], hailMin: 1 }],
    ['Roof age on record', { conf: ['high', 'medium'], roofAgeMin: 10 }],
    ['Big roofs, recent hail', { sqMin: 35, hailMin: 1, stormFrom: ago(365) }],
    ['Not contacted yet', { crm: ['none'], scoreMin: 45 }]];
  function ago(d) { return new Date(Date.now() - d * 864e5).toISOString().slice(0, 10); }
  function chips(key, opts, multi) {
    const cur = F[key];
    return `<div class="chips" data-k="${key}" data-multi="${multi ? 1 : 0}">${opts.map(([v, l]) => {
      const on = multi ? (cur || []).map(String).includes(String(v)) : String(cur == null ? '' : cur) === String(v);
      return `<button type="button" data-v="${esc(v)}" aria-pressed="${on}">${esc(l)}</button>`; }).join('')}</div>`;
  }
  function renderFilters() {
    const M = RCS.meta(), cities = M ? M.cities.filter(Boolean).sort() : [], storms = M ? M.storms.slice().reverse() : [];
    const stormSel = (k, lbl) => `<label style="display:grid;gap:3px;font-size:12px;color:var(--slate)">${lbl}<select data-sel="${k}"><option value="">Any time</option>${storms.map(s => `<option value="${s}"${F[k] === s ? ' selected' : ''}>${dshort(s)}</option>`).join('')}</select></label>`;
    $('#filters').innerHTML = `
      <div class="fg"><h3>Quick starts</h3><div class="chips">${PRESETS.map(([l], i) => `<button type="button" data-preset="${i}">${esc(l)}</button>`).join('')}</div></div>
      <div class="fg"><h3>Where</h3>${chips('cities', cities.map(c => [c, c]), true)}
        <div class="row2" style="margin-top:8px"><input type="text" id="zipIn" placeholder="ZIP codes" value="${esc((F.zips || []).join(', '))}" aria-label="ZIP codes"><button type="button" class="btn" id="drawBtn">${F.area ? 'Clear area' : 'Draw an area'}</button></div></div>
      <div class="fg"><h3>Roof age</h3>${chips('roofAgeMin', [['', 'Any'], [10, '10+ yrs'], [15, '15+ yrs'], [20, '20+ yrs'], [25, '25+ yrs']])}
        <h3 style="margin-top:10px">How sure we are</h3>${chips('conf', [['high', 'On record'], ['medium', 'Likely'], ['low', 'Weak record'], ['unknown', 'Unknown']], true)}
        <small>On record = a re-roof permit on this house. Likely = a looser permit match, or an original roof in a city with full permit records. Weak = a permit that may be a repair, or no re-roof since the city list starts. Unknown = no full permit records, so the roof may be newer than the house.</small></div>
      <div class="fg"><h3>Storm</h3>${chips('hailMin', [['', 'Any'], [0.75, '0.75 in+'], [1, '1 in+'], [1.5, '1.5 in+'], [2, '2 in+']])}
        <div class="row2" style="margin-top:8px">${stormSel('stormFrom', 'From')}${stormSel('stormTo', 'To')}</div><small>Radar hail at the house (NOAA), an estimate.</small></div>
      <div class="fg"><h3>Roof size (estimate)</h3>${chips('sqMin', [['', 'Any'], [20, '20+ sq'], [30, '30+ sq'], [40, '40+ sq']])}</div>
      <div class="fg"><h3>Property</h3>${chips('types', RCS.TYPES.map((t, i) => [i, t]), true)}</div>
      <div class="fg"><h3>In your CRM</h3>${chips('crm', [['none', 'No contact yet'], ['contacted', 'Contacted'], ['replied', 'Replied'], ['deal', 'In a deal'], ['won', 'Won']], true)}</div>
      <div class="fg"><h3>Score</h3>${chips('scoreMin', [['', 'Any'], [40, '40+'], [50, '50+'], [60, '60+'], [70, '70+']])}</div>
      <div class="fg"><h3>OK to contact</h3>${chips('eligible', [['', 'Show all'], ['only', 'Only OK to contact'], ['not', 'Only do not contact']])}
        <small>Opt-outs, do not call and do not contact lists always win over the score. Those homes stay in the list, greyed, with the reason.</small></div>
      <div class="fg"><h3>Given to</h3>${chips('assigned', [['', 'Anyone']].concat([['none', 'Not given out']]).concat(RCS.reps().map(r => [r.id, r.name])))}</div>
      <div class="fg"><h3>Sort</h3>${chips('sort', [['', 'Best score'], ['hail', 'Biggest hail'], ['age', 'Oldest roof']])}<div style="margin-top:10px"><button type="button" class="btn" id="clearF">Clear all filters</button></div></div>`;
  }
  $('#filters').addEventListener('click', e => {
    const p = e.target.closest('[data-preset]');
    if (p) { F = Object.assign({}, PRESETS[+p.dataset.preset][1]); F._name = PRESETS[+p.dataset.preset][0]; return changed(); }
    const b = e.target.closest('.chips[data-k] button'); if (b) {
      const g = b.parentNode, k = g.dataset.k, v = b.dataset.v, num = /^-?[\d.]+$/.test(v) && k !== 'zips' ? +v : v;
      if (g.dataset.multi === '1') { const a = (F[k] || []).map(String); F[k] = a.includes(String(v)) ? (F[k] || []).filter(x => String(x) !== String(v)) : (F[k] || []).concat([num]); if (!F[k].length) delete F[k]; }
      else if (v === '') delete F[k]; else F[k] = num;
      delete F._name; return changed();
    }
    if (e.target.id === 'clearF') { F = {}; return changed(); }
    if (e.target.id === 'drawBtn') { if (F.area) { delete F.area; drawClear(); return changed(); } startDraw(); }
  });
  $('#filters').addEventListener('change', e => { const s = e.target.closest('[data-sel]'); if (s) { s.value ? F[s.dataset.sel] = s.value : delete F[s.dataset.sel]; delete F._name; changed(); }
    if (e.target.id === 'zipIn') { const z = e.target.value.match(/\d{5}/g); z ? F.zips = z : delete F.zips; changed(); } });
  function changed() { try { localStorage.setItem(LS, JSON.stringify(F)); } catch (e) { } renderFilters(); sel.clear(); shown = 100; run(); }
  $('#fTog').addEventListener('click', () => { const f = $('#filters'), o = f.classList.toggle('open'); $('#fTog').setAttribute('aria-expanded', o); $('#fTog').textContent = o ? 'Hide filters' : 'Filters'; });

  // ---------- results ----------
  let runN = 0;
  function run() {
    const n = ++runN, q = Object.assign({}, F, { limit: 600 }); delete q._name;
    $('#count').textContent = 'Searching…';
    RCS.search(q).then(r => { if (n !== runN) return; last = r; renderList(); drawMap(); }).catch(e => { $('#count').textContent = e.message; });
  }
  function line(h) {
    const bits = [h.roof];
    if (h.hail >= 0.75) bits.push(`${h.hail.toFixed(2)} in hail ${dshort(h.hailDate)}`);
    if (h.squares) bits.push(`about ${h.squares} squares`);
    if (h.nbr) bits.push(`${h.nbr} re-roof${h.nbr > 1 ? 's' : ''} nearby`);
    return bits.join(' · ');
  }
  function renderList() {
    const r = last; if (!r) return;
    const c = r.counts, reps = RCS.reps(), rn = id => (reps.find(x => x.id === id) || {}).name;
    $('#count').textContent = `${fmt(r.total)} home${r.total === 1 ? '' : 's'} match${r.total === 1 ? 'es' : ''}`;
    $('#countSub').textContent = r.total ? `${fmt(c.eligible)} OK to contact${c.ineligible ? ', ' + fmt(c.ineligible) + ' do not contact' : ''}. Evidence: on record ${fmt(c.conf.high)}, likely ${fmt(c.conf.medium)}, weak ${fmt(c.conf.low)}, unknown ${fmt(c.conf.unknown)}.` : '';
    $('#assignBtn').disabled = !r.total;
    $('#assignBtn').textContent = sel.size ? `Give ${sel.size} to a rep` : 'Give to a rep';
    if (!r.total) { $('#list').innerHTML = '<p class="empty">No homes match. Take off a filter or two.</p>'; return; }
    const rows = r.homes.slice(0, shown);
    $('#list').innerHTML = rows.map(h => `<div class="h${h.eligible ? '' : ' ineligible'}" data-gi="${h.gi}">
        <input type="checkbox" aria-label="Select" ${sel.has(h.gi) ? 'checked' : ''} ${h.eligible ? '' : 'disabled title="Do not contact"'}>
        <div class="sc${h.score >= 50 && h.eligible ? ' hi' : ''}" title="Opportunity score, 0 to 100">${h.score}<small>score</small></div>
        <div class="ad"><b data-addr="${h.gi}">${esc(h.city)}${h.zip ? ' ' + esc(h.zip) : ''}</b>${h.rep ? `<span class="rep">${esc(rn(h.rep) || 'Rep')}</span>` : ''}
          <p>${esc(line(h))}</p>${h.eligible ? '' : `<span class="no">Do not contact: ${esc(h.why)}</span>`}</div>
        <span class="cfw"><span class="cf ${h.conf}" title="${esc(CONFT[h.conf])}">${CONFW[h.conf]}</span></span></div>`).join('')
      + (r.homes.length > shown ? `<div class="more"><button type="button" class="btn" id="moreBtn">Show more</button></div>` : r.total > r.homes.length ? `<p class="more">Showing the top ${fmt(r.homes.length)}. Add a filter to narrow it down.</p>` : '');
    RCS.describe(rows.map(h => h.gi)).then(D => D.forEach(d => { const el = document.querySelector(`[data-addr="${d.gi}"]`); if (el && d.addr) el.innerHTML = esc(d.addr) + `<span style="font-weight:400;color:var(--slate)">, ${esc(d.city || '')}</span>`; }));
    const M = RCS.meta();
    $('#foot').textContent = `Scores built ${M.built.replace('T', ' ')}. Permits through ${M.sources.permits_through}, radar through ${M.sources.radar_through}. Score = roof age ${M.config.weights.roofAge} + storm ${M.config.weights.storm} + roof ${M.config.weights.roof} + CRM ${M.config.weights.crm} + neighborhood ${M.config.weights.neighborhood}. Tap a home for its evidence.`;
  }
  $('#list').addEventListener('click', e => {
    if (e.target.id === 'moreBtn') { shown += 100; return renderList(); }
    const h = e.target.closest('.h'); if (!h) return; const gi = +h.dataset.gi;
    if (e.target.matches('input[type=checkbox]')) { e.target.checked ? sel.add(gi) : sel.delete(gi); $('#assignBtn').textContent = sel.size ? `Give ${sel.size} to a rep` : 'Give to a rep'; return; }
    go(gi);
  });

  // ---------- map (results + drawn area) ----------
  function ensureMap(el, cb) {
    if (!window.maplibregl) return null;
    const m = new maplibregl.Map({ container: el, style: 'https://tiles.openfreemap.org/styles/positron', center: [-96.72, 33.1], zoom: 9.3, attributionControl: false });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.on('load', () => cb && cb(m));
    return m;
  }
  function fc(homes) { return { type: 'FeatureCollection', features: homes.filter(h => h.lon != null).map(h => ({ type: 'Feature', properties: { gi: h.gi, s: h.score, ok: h.eligible ? 1 : 0 }, geometry: { type: 'Point', coordinates: [h.lon, h.lat] } })) }; }
  function drawMap() {
    if (!last || $('#map').classList.contains('off')) return;
    if (!map) { map = ensureMap('map', m => {
      m.addSource('res', { type: 'geojson', data: fc([]) });
      m.addLayer({ id: 'res', type: 'circle', source: 'res', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 2.5, 15, 7],
        'circle-color': ['case', ['==', ['get', 'ok'], 0], '#9AA1AF', ['interpolate', ['linear'], ['get', 's'], 20, '#9DB4F2', 50, '#1F47C9', 75, '#0B1E66']], 'circle-stroke-width': 1, 'circle-stroke-color': '#fff' } });
      m.addSource('area', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'area-f', type: 'fill', source: 'area', paint: { 'fill-color': '#1F47C9', 'fill-opacity': 0.08 } });
      m.addLayer({ id: 'area-l', type: 'line', source: 'area', paint: { 'line-color': '#1F47C9', 'line-width': 2, 'line-dasharray': [2, 1] } });
      m.on('click', 'res', ev => { if (!drawing && ev.features[0]) go(ev.features[0].properties.gi); });
      m.on('mouseenter', 'res', () => m.getCanvas().style.cursor = 'pointer'); m.on('mouseleave', 'res', () => m.getCanvas().style.cursor = '');
      m.on('click', ev => { if (!drawing) return; drawing.push([ev.lngLat.lng, ev.lngLat.lat]); areaShow(drawing); note(`${drawing.length} point${drawing.length > 1 ? 's' : ''}. Tap Done when the area is closed.`, true); });
      if (F.area && F.area.poly) areaShow(F.area.poly);
      drawMap();
    }); return; }
    if (!map.getSource('res')) return;
    map.getSource('res').setData(fc(last.homes));
    const pts = last.homes.filter(h => h.lon != null); if (pts.length && !drawing) {
      const b = pts.reduce((a, h) => [Math.min(a[0], h.lon), Math.min(a[1], h.lat), Math.max(a[2], h.lon), Math.max(a[3], h.lat)], [180, 90, -180, -90]);
      map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 30, maxZoom: 15, duration: 0 }); }
  }
  function areaShow(P) { if (!map || !map.getSource('area')) return; map.getSource('area').setData({ type: 'FeatureCollection', features: P.length > 2 ? [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [P.concat([P[0]])] } }] : P.length ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: P } }] : [] }); }
  function drawClear() { drawing = null; areaShow([]); note('', false); }
  function note(t, done) { const n = $('#mapNote'); n.hidden = !t; n.innerHTML = esc(t) + (done ? ' <button type="button" class="btn" id="drawDone" style="height:28px;margin-left:6px">Done</button> <button type="button" class="btn" id="drawCancel" style="height:28px">Cancel</button>' : ''); }
  function startDraw() { if ($('#map').classList.contains('off')) toggleMap(); drawing = []; note('Tap the map to outline an area.', true); }
  $('#mapNote').addEventListener('click', e => {
    if (e.target.id === 'drawDone') { if (drawing && drawing.length > 2) { F.area = { poly: drawing }; drawing = null; note('', false); changed(); } else toast('Tap at least 3 points on the map.'); }
    if (e.target.id === 'drawCancel') { drawClear(); if (F.area) areaShow(F.area.poly); }
  });
  function toggleMap() { const m = $('#map'), off = m.classList.toggle('off'); $('#mapTog').textContent = off ? 'Show map' : 'Hide map'; $('#mapTog').setAttribute('aria-pressed', !off); if (!off) { drawMap(); map && map.resize(); } }
  $('#mapTog').addEventListener('click', toggleMap);
  if (matchMedia('(max-width:860px)').matches) { $('#map').classList.add('off'); $('#mapTog').textContent = 'Show map'; }

  // ---------- dialogs ----------
  function dlg(title, body, foot) { $('#dlgT').textContent = title; $('#dlgB').innerHTML = body; $('#dlgF').innerHTML = foot; $('#dlg').showModal(); }
  $('#dlg').addEventListener('click', e => { if (e.target.dataset.x === 'close' || e.target === $('#dlg')) $('#dlg').close(); });
  function repOptions(selId) { return RCS.reps().map(r => `<option value="${r.id}"${r.id === selId ? ' selected' : ''}>${esc(r.name)}</option>`).join(''); }
  function assignDialog(target, label, count) {
    const reps = RCS.reps();
    if (!reps.length) { dlg('Add a rep first', '<p style="margin:0">Add your reps in Rep lists (for example Jake). Then you can give them homes.</p>', '<button class="btn" data-x="close">Close</button><button class="btn p" id="toReps">Go to Rep lists</button>');
      $('#toReps').onclick = () => { $('#dlg').close(); show('reps'); }; return; }
    dlg('Give homes to a rep', `<p style="margin:0">${esc(label)}</p><label>Rep<select id="aRep">${repOptions()}</select></label>${count ? '' : '<label>How many (best score first)<select id="aN"><option>10</option><option selected>25</option><option>50</option><option>100</option></select></label>'}
      <p style="margin:0;font-size:12.5px;color:var(--slate)">Homes marked do not contact are skipped.</p>`, '<button class="btn" data-x="close">Cancel</button><button class="btn p" id="aGo">Give to rep</button>');
    $('#aGo').onclick = () => { const rep = $('#aRep').value, n = count || +$('#aN').value;
      RCS.assign(typeof target === 'function' ? target(n) : target, rep, { limit: n }).then(r => { $('#dlg').close(); toast(`${r.assigned} home${r.assigned === 1 ? '' : 's'} on ${r.rep.name}'s list${r.skipped.length ? ', ' + r.skipped.length + ' skipped (do not contact)' : ''}.`); sel.clear(); run(); }).catch(e => toast(e.message)); };
  }
  $('#assignBtn').addEventListener('click', () => {
    if (sel.size) return assignDialog([...sel], `${sel.size} selected home${sel.size > 1 ? 's' : ''}.`, sel.size);
    const q = Object.assign({}, F); delete q._name;
    assignDialog(n => ({ filters: q }), `The best homes in this search (${fmt(last ? last.counts.eligible : 0)} OK to contact).`);
  });
  $('#saveBtn').addEventListener('click', () => {
    dlg('Save this search', `<label>Name<input type="text" id="sName" value="${esc(F._name || suggestName())}" maxlength="60"></label>
      <label class="sw"><input type="checkbox" id="sQ" checked> Make it a daily list (best homes not contacted in 14 days)</label>
      <label class="sw"><input type="checkbox" id="sA"> Tell me when new homes match</label>`, '<button class="btn" data-x="close">Cancel</button><button class="btn p" id="sGo">Save</button>');
    $('#sGo').onclick = () => { const q = Object.assign({}, F); delete q._name; const s = RCS.saveSegment({ name: $('#sName').value, filters: q, queue: $('#sQ').checked, alert: $('#sA').checked });
      if (s.alert && last) RCS.saveSegment({ id: s.id, seen: last.homes.map(h => h.gi) });
      $('#dlg').close(); toast(`Saved "${s.name}". It is in Saved searches.`); };
  });
  function suggestName() { const b = []; if (F.roofAgeMin) b.push(F.roofAgeMin + '+ year roofs'); if (F.hailMin) b.push('after ' + F.hailMin + ' in hail'); if (F.cities) b.push('in ' + F.cities.join(', ')); return b.join(' ') || 'My search'; }

  // ---------- saved searches ----------
  function renderSaved() {
    const S = RCS.segments(), el = $('#vSaved');
    if (!S.length) { el.innerHTML = '<p class="empty">No saved searches yet. Set the filters on Search, then tap Save this search. A saved search becomes a daily list, and it can tell you when new homes match.</p>'; return; }
    el.innerHTML = S.map(s => `<div class="card" data-sg="${s.id}"><div><h4>${esc(s.name)}</h4><p data-cnt="${s.id}">Counting…</p></div>
      <div class="acts"><label class="sw"><input type="checkbox" data-alert ${s.alert ? 'checked' : ''}> Alert</label><button class="btn" data-q>Today's list</button><button class="btn" data-open>Open</button><button class="btn" data-give>Give to a rep</button><button class="btn" data-del aria-label="Delete">Delete</button></div></div>`).join('');
    S.forEach(s => RCS.search(Object.assign({}, s.filters, { limit: 1 })).then(r => {
      const el2 = document.querySelector(`[data-cnt="${s.id}"]`); if (el2) el2.textContent = `${fmt(r.total)} homes match, ${fmt(r.counts.eligible)} OK to contact. ${s.queue ? 'Daily list on.' : ''} Saved ${dshort(s.created.slice(0, 10))}.`; }));
  }
  $('#vSaved').addEventListener('click', e => {
    const c = e.target.closest('[data-sg]'); if (!c) return; const id = c.dataset.sg, s = RCS.segments().find(x => x.id === id); if (!s) return;
    if (e.target.matches('[data-alert]')) { RCS.saveSegment({ id, alert: e.target.checked }); toast(e.target.checked ? 'You will hear about new homes in this search.' : 'Alert off.'); return; }
    if (e.target.matches('[data-del]')) { RCS.deleteSegment(id); renderSaved(); toast('Deleted.'); return; }
    if (e.target.matches('[data-open]')) { F = Object.assign({ _name: s.name }, s.filters); show('search'); changed(); return; }
    if (e.target.matches('[data-give]')) return assignDialog({ segment: id }, `Today's best homes from "${s.name}".`);
    if (e.target.matches('[data-q]')) RCS.segmentQueue(id, 25).then(q => RCS.describe(q.homes.map(h => h.gi)).then(D => {
      dlg(`Today's list: ${s.name}`, q.homes.length ? `<p style="margin:0;color:var(--slate);font-size:13px">The ${q.homes.length} best homes OK to contact and not touched in 14 days.</p>` + q.homes.map((h, i) => `<button type="button" class="btn" style="justify-content:flex-start;text-align:left;height:auto;padding:8px 10px;display:flex;gap:10px" data-home="${h.gi}"><b>${h.score}</b><span>${esc((D[i] && D[i].addr) || h.city)}<br><small style="color:var(--slate)">${esc(line(h))}</small></span></button>`).join('') : '<p>No homes to work today in this search.</p>',
        '<button class="btn" data-x="close">Close</button>' + (q.homes.length ? '<button class="btn p" id="qGive">Give these to a rep</button>' : ''));
      $('#dlgB').onclick = ev => { const b = ev.target.closest('[data-home]'); if (b) { $('#dlg').close(); go(+b.dataset.home); } };
      const g = $('#qGive'); if (g) g.onclick = () => assignDialog(q.homes.map(h => h.gi), `${q.homes.length} homes from today's list.`, q.homes.length);
    }));
  });

  // ---------- best blocks ----------
  let nbMap = null, nbData = [];
  function renderNb() {
    const city = $('#nbCity').value;
    RCS.neighborhoods({ limit: 60, city }).then(L => {
      nbData = L; const max = L.length ? L[0].total : 1;
      $('#nbList').innerHTML = L.length ? L.map((b, i) => `<div class="card blk" data-b="${i}"><div class="rk">${i + 1}</div><div><h4>${esc(b.label)}, ${esc(b.city)}</h4>
        <p>${b.strong} strong home${b.strong > 1 ? 's' : ''} of ${b.homes} · ${b.per100m} per 100 m of street${b.engagement ? ' · ' + b.engagement + ' replied' : ''}${b.ineligible ? ' · ' + b.ineligible + ' do not contact' : ''}</p>
        <div class="bar" title="Block score parts">${[['#1F47C9', b.pts[0]], ['#4C7BF0', b.pts[1]], ['#9DB4F2', b.pts[2]], ['#11734B', b.pts[3]]].map(([c, v]) => `<i style="width:${v}%;background:${c}"></i>`).join('')}</div>
        <div class="parts">Strong homes close together ${b.pts[0]} of 40 · Storm ${b.pts[1]} of 25 · Easy to walk (homes per 100 m) ${b.pts[2]} of 25 · Replies ${b.pts[3]} of 10. Strong = score ${RCS.meta().config.strong}+.
          <div class="acts" style="margin-top:8px"><button type="button" class="btn" data-bh>See the homes</button><button type="button" class="btn" data-bg>Give this block to a rep</button></div><div data-bl></div></div></div>
        <div class="sc${b.total >= 50 ? ' hi' : ''}">${Math.round(b.total)}<small>block</small></div></div>`).join('') : '<p class="empty">No blocks with strong homes in this city yet.</p>';
      nbDraw();
    });
  }
  function nbDraw() {
    const data = { type: 'FeatureCollection', features: nbData.map((b, i) => ({ type: 'Feature', properties: { i, s: b.total, n: b.strong, r: i + 1 }, geometry: { type: 'Point', coordinates: [b.lon, b.lat] } })) };
    if (!nbMap) { nbMap = ensureMap('nbMap', m => {
      m.addSource('nb', { type: 'geojson', data });
      m.addLayer({ id: 'nb', type: 'circle', source: 'nb', paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'n'], 1, 6, 12, 16], 'circle-color': ['interpolate', ['linear'], ['get', 's'], 30, '#9DB4F2', 60, '#1F47C9', 85, '#0B1E66'], 'circle-opacity': 0.85, 'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff' } });
      m.addLayer({ id: 'nb-l', type: 'symbol', source: 'nb', filter: ['<=', ['get', 'r'], 10], layout: { 'text-field': ['to-string', ['get', 'r']], 'text-size': 11, 'text-font': ['Noto Sans Bold'] }, paint: { 'text-color': '#fff' } });
      m.on('click', 'nb', ev => { const i = ev.features[0].properties.i, c = document.querySelector(`[data-b="${i}"]`); if (c) { c.classList.add('open'); c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } });
      nbDraw(); }); return; }
    if (!nbMap.getSource('nb')) return; nbMap.getSource('nb').setData(data);
    if (nbData.length) { const b = nbData.reduce((a, x) => [Math.min(a[0], x.lon), Math.min(a[1], x.lat), Math.max(a[2], x.lon), Math.max(a[3], x.lat)], [180, 90, -180, -90]); nbMap.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 40, maxZoom: 15, duration: 0 }); }
  }
  $('#nbList').addEventListener('click', e => {
    const c = e.target.closest('[data-b]'); if (!c) return; const b = nbData[+c.dataset.b];
    if (e.target.matches('[data-bh]')) { RCS.describe(b.gis).then(D => { c.querySelector('[data-bl]').innerHTML = D.map(d => { const h = RCS.row(d.gi);
      return `<div class="h${h.eligible ? '' : ' ineligible'}" data-home="${d.gi}" style="grid-template-columns:48px 1fr;padding:8px 0"><div class="sc">${h.score}</div><div class="ad"><b>${esc(d.addr || '')}</b><p>${esc(line(h))}</p>${h.eligible ? '' : `<span class="no">Do not contact: ${esc(h.why)}</span>`}</div></div>`; }).join(''); }); return; }
    if (e.target.matches('[data-bg]')) return assignDialog(b.gis, `${b.gis.length} strong homes on the ${b.label}, ${b.city}.`, b.gis.length);
    const hm = e.target.closest('[data-home]'); if (hm) return go(+hm.dataset.home);
    c.classList.toggle('open'); if (nbMap) nbMap.flyTo({ center: [b.lon, b.lat], zoom: 15.5 });
  });
  $('#nbCity').addEventListener('change', renderNb);

  // ---------- reps + My list ----------
  let repSel = null;
  function renderReps() {
    const R = RCS.reps(); if (!repSel || !R.find(r => r.id === repSel)) repSel = R[0] ? R[0].id : null;
    const A = RC.__get('assign', {}) || {}, cnt = id => Object.values(A).filter(a => a.rep === id).length;
    $('#repList').innerHTML = R.length ? R.map(r => `<div class="card" style="padding:9px 0" data-rep="${r.id}"><div><h4 style="font-size:14px">${esc(r.name)}${r.id === repSel ? ' <span class="rep">showing</span>' : ''}</h4><p>${cnt(r.id)} home${cnt(r.id) === 1 ? '' : 's'} on their list</p></div>
      <div class="acts"><button type="button" class="btn" data-show>My list</button><button type="button" class="btn" data-rm aria-label="Remove ${esc(r.name)}">Remove</button></div></div>`).join('') : '<p style="margin:0;font-size:13px;color:var(--slate)">No reps yet.</p>';
    const r = R.find(x => x.id === repSel);
    $('#mlTitle').textContent = r ? `${r.name}'s list` : 'My list';
    if (!r) { $('#mlSub').textContent = ''; $('#myList').innerHTML = '<p class="empty">Add a rep on the left. Then give them homes from Search, a saved search or a block, or tap Prepare assignments.</p>'; return; }
    RCS.myList(r.id).then(L => RCS.describe(L.map(h => h.gi)).then(D => {
      $('#mlSub').textContent = L.length ? `${L.length} homes, best score first. ${L.filter(h => !h.eligible).length ? L.filter(h => !h.eligible).length + ' now do not contact.' : ''}` : '';
      $('#myList').innerHTML = L.length ? L.map((h, i) => `<div class="h ml${h.eligible ? '' : ' ineligible'}" data-gi="${h.gi}"><div class="sc${h.score >= 50 ? ' hi' : ''}">${h.score}<small>score</small></div>
        <div class="ad"><b>${esc((D[i] && D[i].addr) || h.city)}</b><span style="color:var(--slate)">, ${esc(h.city)}</span><p>${esc(line(h))}</p>${h.eligible ? '' : `<span class="no">Do not contact: ${esc(h.why)}</span>`}</div>
        <span class="cf ${h.conf}">${CONFW[h.conf]}</span><button type="button" class="btn" data-un>Take off</button></div>`).join('') : `<p class="empty">Nothing on ${esc(r.name)}'s list yet. Tap Prepare assignments.</p>`;
    }));
  }
  $('#repForm').addEventListener('submit', e => { e.preventDefault(); const r = RCS.addRep($('#repName').value); if (r) { repSel = r.id; $('#repName').value = ''; toast(r.name + ' is on the rep list.'); renderReps(); renderFilters(); } });
  $('#repList').addEventListener('click', e => { const c = e.target.closest('[data-rep]'); if (!c) return;
    if (e.target.matches('[data-rm]')) { RCS.removeRep(c.dataset.rep); renderReps(); renderFilters(); return; } repSel = c.dataset.rep; renderReps(); });
  $('#myList').addEventListener('click', e => { const h = e.target.closest('[data-gi]'); if (!h) return; if (e.target.matches('[data-un]')) { RCS.unassign([+h.dataset.gi]); renderReps(); return; } go(+h.dataset.gi); });
  $('#prepBtn').addEventListener('click', () => {
    const S = RCS.segments();
    if (!RCS.reps().length) return assignDialog([], '');
    dlg('Prepare assignments', `<label>Rep<select id="pRep">${repOptions(repSel)}</select></label>
      <label>From<select id="pFrom"><option value="search">The current search</option>${S.map(s => `<option value="${s.id}">Saved: ${esc(s.name)}</option>`).join('')}</select></label>
      <label>How many (best score first)<select id="pN"><option>10</option><option selected>25</option><option>50</option></select></label>
      <p style="margin:0;font-size:12.5px;color:var(--slate)">Only homes OK to contact. From a saved search: homes not touched in 14 days.</p>`, '<button class="btn" data-x="close">Cancel</button><button class="btn p" id="pGo">Prepare</button>');
    $('#pGo').onclick = () => { const from = $('#pFrom').value, q = Object.assign({}, F); delete q._name;
      RCS.assign(from === 'search' ? { filters: Object.assign(q, { eligible: 'only' }) } : { segment: from }, $('#pRep').value, { limit: +$('#pN').value })
        .then(r => { $('#dlg').close(); repSel = r.rep.id; toast(`${r.assigned} homes on ${r.rep.name}'s list.`); renderReps(); }).catch(e => toast(e.message)); };
  });

  // ---------- views ----------
  function show(v) {
    view = v; document.querySelectorAll('.seg button').forEach(b => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    $('#vSearch').hidden = v !== 'search'; $('#vSaved').hidden = v !== 'saved'; $('#vNb').hidden = v !== 'nb'; $('#vReps').hidden = v !== 'reps';
    if (v === 'saved') renderSaved(); if (v === 'nb') renderNb(); if (v === 'reps') renderReps();
    if (v === 'search' && map) map.resize();
    try { history.replaceState(null, '', location.pathname + location.search.replace(/([?&])view=[^&]*&?/, '$1').replace(/[?&]$/, '') + (v === 'search' ? '' : (location.search ? '&' : '?') + 'view=' + v)); } catch (e) { }
  }
  document.querySelector('.seg').addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (b) show(b.dataset.v); });
  RCS.ready().then(() => {
    const M = RCS.meta(); $('#nbCity').innerHTML = '<option value="">All cities</option>' + M.cities.filter(Boolean).sort().map(c => `<option>${esc(c)}</option>`).join('');
    renderFilters(); run();
    const v = new URLSearchParams(location.search).get('view'); if (v && v !== 'search') show(v);
  }).catch(e => { $('#count').textContent = e.message; });
  RC.on(d => { if (d && ['assign', 'segments', 'settings', 'optout', 'suppress', 'pipe'].includes(d.key) && d.remote) { if (view === 'search') run(); if (view === 'reps') renderReps(); } });
  window.FIND = { show, run, get filters() { return F; } };
})();
