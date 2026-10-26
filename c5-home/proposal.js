/* proposal.js: the roof proposal page (proposal.html?id=m<home index>). Reads the home's measured roof the way every screen
   does (STM.facts -> RCROOF.lookup) and shows: roofer brand, address, date, the measured summary, the top-down diagram,
   the section table, the measured edge lengths, plus one optional price and one optional note the roofer types (kept per
   house on this device through RC state, key prop.house, blank by default; blank = not shown). Print or save PDF via
   window.print. No materials, no takeoff, no insurance, deductible or claim language. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n1 = v => v == null || isNaN(+v) ? '' : (Math.round(+v * 10) / 10).toLocaleString('en-US');
  const money = v => (+v).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const Q = new URLSearchParams(location.search);
  const rawId = Q.get('id') || Q.get('home') || '';
  // m<index> = a home of the roofer's data (every screen's id, Today's 50 included); the measured roof is read the same way
  // the record and the pipeline read it, so the squares here are the squares there
  const mm = /^m(\d+)$/.exec(rawId), gi = mm ? +mm[1] : null;

  const G = (k, d) => RC.__get ? RC.__get(k, d) : d, S = (k, v) => RC.__set && RC.__set(k, v);
  const mine = () => Object.assign({ price: '', notes: '', sq: '' }, (G('prop.house', {}) || {})[rawId] || {});
  const save = o => { const all = G('prop.house', {}) || {}; if (o.price === '' && !o.notes && o.sq === '') delete all[rawId]; else all[rawId] = o; S('prop.house', all); };
  // the roofer's price per square (10-22): one figure for every proposal on this device
  const rate = () => { const r = G('prop.rate', ''); return r === '' || r == null || !isFinite(+r) || +r <= 0 ? null : +r; };

  let M = null, F = null, D = null, SP = null, PASSED = false;
  // the same 3D model the record draws (lib/real-roof.js modelFor): a gate-passing measured model keeps its own facet diagram
  // and sections; every other home is drawn from its building outline, its sections scaled to the measured total
  function outlineModel(m) {
    if (!m || gi == null || !window.RealRoof || !RealRoof.mapEntry) return Promise.resolve(m);
    return RealRoof.mapEntry(gi).then(e => {
      if (e && RealRoof.modelFor(e) === 'model') PASSED = true;   // the measured model passed its soundness + LiDAR fit gates
      if (!e || RealRoof.modelFor(e) !== 'outline') return m;
      const sp = RealRoof.spec(e, { seed: gi % 9973 }); if (!sp || sp.none || !sp.outlineModel) return m;
      SP = sp;
      const COMP = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      m.sections = sp.planes.map(p => ({ id: p.id, pitch: p.rise + '/12', x12: p.rise, faces: COMP[Math.round(((Math.atan2(p.dir[0], -p.dir[1]) * 180 / Math.PI) + 360) % 360 / 45) % 8], sqft: p.areaFt || 0 }));
      m.facetsN = sp.planes.length;
      // the main pitches only (as the record's title): small LiDAR patches at odd pitches are not sections of this drawing
      m.pitches = m.pitches.filter((p, k) => k === 0 || p.sqft >= 0.15 * (m.areaSqft || 1)).slice(0, 2);
      return m;
    }).catch(() => m);
  }

  function render() {
    const m = M, addr = F && F.addr ? F.addr + (F.place ? ', ' + F.place : '') : (m.address || 'Address not on file');
    $('#dAddr').textContent = addr; document.title = 'Roof proposal, ' + addr;
    $('#dDate').textContent = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const yr = m.year, row = F && F.roof, pitch = row && window.RCROOF ? RCROOF.pitches(row).join(' + ') : m.pitches.map(p => p.pitch).join(' + ');
    $('#roofH').textContent = PASSED ? 'Your roof, from aerial survey data' : 'Your roof size, from aerial survey data';
    // the same words as the record: squares are an estimate from the LiDAR record; a roof drawing, sections and edge lengths
    // only when the measured model passed its checks (never the outline stand-in, Jack 10-22)
    $('#kpis').innerHTML = [
      ['Roof area', '~' + n1(m.areaSqft) + ' sq ft', 'estimate'],
      ['Squares', '~' + n1(m.squares), `LiDAR estimate (${yr}), typically within about 10% of permit records`],
      ['Pitch', pitch || 'not on file', `${yr} LiDAR, to the nearest 12th`]
    ].concat(PASSED ? [['Sections', m.facetsN || 'not on file', '']] : []).map(([a, v, s]) => `<div><span>${esc(a)}</span><b>${esc(v)}</b>${s ? `<small>${esc(s)}</small>` : ''}</div>`).join('');
    $('#kpis').style.gridTemplateColumns = PASSED ? '' : 'repeat(3,1fr)';
    if (!PASSED) {
      $('#diag').innerHTML = ''; $('#edges').innerHTML = '';
      $('#secs').innerHTML = `<p class="muted">The roof is measured section by section when it is inspected in person. Squares here are a LiDAR estimate from aerial survey data, typically within about 10% of permit records; a measurement is taken before the final quote.</p>`;
    } else {
      const svg = D && D.geometry_ft ? RCROOF.diagramSVG(D, 760) : SP ? RealRoof.planSVG(SP, 760) : '';
      $('#diag').innerHTML = svg ? `<figure>${svg}<figcaption>Top-down view, lengths in feet. Each lettered section is one roof plane with its pitch.</figcaption></figure>` : '';
      $('#secs').innerHTML = m.sections.length ? `<h3>Sections</h3><table class="t"><thead><tr><th>Section</th><th>Pitch</th><th>Faces</th><th class="n">Sq ft</th></tr></thead><tbody>${
        m.sections.slice().sort((a, b) => b.sqft - a.sqft).map(s => `<tr><td>${esc(s.id)}</td><td>${esc(s.pitch)}</td><td>${esc(s.faces)}</td><td class="n">${n1(s.sqft)}</td></tr>`).join('')
      }</tbody><tfoot><tr><td colspan="3">Total</td><td class="n">${n1(m.sections.reduce((a, s) => a + s.sqft, 0))}</td></tr></tfoot></table>` : '';
      const E = m.edges, rows = [['Ridges', E.ridge], ['Hips', E.hip], ['Valleys', E.valley], ['Eaves', E.eave], ['Rakes', E.rake]];
      if (m.source === 'detail') { if (E.step) rows.push(['Step flashing', E.step]); rows.push(['Wall flashing', E.wall]); } else rows.push(['Wall flashing', E.flashing]);
      $('#edges').innerHTML = `<h3>Edge lengths</h3><table class="t"><tbody>${rows.map(([a, v]) => `<tr${v > 0 ? '' : ' class="z"'}><td>${a}</td><td class="n">${n1(Math.round(v || 0))} ft</td></tr>`).join('')}</tbody></table>`;
    }
    $('#srcLine').textContent = `Roof size and pitch: estimated from ${yr} LiDAR aerial survey data, not a tape measure, and confirmed when the roof is inspected.`;
    paintEntry();
  }
  // squares to price: the rep's own figure once typed (after the inspection), else the aerial estimate
  function priced() {
    const o = mine(), r = rate(), own = o.sq !== '' && o.sq != null && isFinite(+o.sq) && +o.sq > 0, sq = own ? +o.sq : (M ? M.squares : null);
    if (r && sq) return { total: Math.round(r * sq), how: `${n1(sq)} squares${own ? '' : ' (aerial estimate)'} x ${money(r)} per square` };
    const legacy = o.price === '' || o.price == null || !isFinite(+o.price) ? null : +o.price;   // a total typed before price per square
    return legacy != null ? { total: legacy, how: '' } : null;
  }
  function paintEntry() {
    const o = mine(), p = priced(), t = String(o.notes || '').trim();
    $('#priceBlk').hidden = !p; $('#price').textContent = p ? money(p.total) : ''; $('#priceHow').textContent = p ? p.how : '';
    const ft = $('#fTot'); if (ft) ft.innerHTML = p ? `Total on the proposal: <b>${esc(money(p.total))}</b>` : 'Add your price per square to put a total on the proposal.';
    $('#notesBlk').hidden = !t; $('#notes').textContent = t;
  }
  function wire() {
    const o = mine(), fr = $('#fRate'), fs = $('#fSq'), fn = $('#fNotes');
    fr.value = rate() || ''; fs.value = o.sq !== '' && o.sq != null ? o.sq : (M ? M.squares : ''); fn.value = o.notes || '';
    const put = () => { S('prop.rate', fr.value === '' ? '' : +fr.value);
      const own = fs.value !== '' && M && Math.abs(+fs.value - M.squares) > 0.05 ? +fs.value : '';
      save({ price: mine().price, sq: own, notes: fn.value }); paintEntry(); };
    fr.addEventListener('input', put); fs.addEventListener('input', put); fn.addEventListener('input', put);
  }
  $('#bPrint').addEventListener('click', () => window.print());
  // the proposal went to the homeowner: one tap puts it on the home's record and moves the deal to Proposal (RC.proposalSent).
  // Printing alone does not count, the roofer says when it went out. Nothing is sent from here.
  const bSent = $('#bSent');
  function paintSent() { const at = rawId && RC.proposalSentAt ? RC.proposalSentAt(rawId) : null;
    bSent.textContent = at ? 'Sent ' + new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Mark sent to homeowner'; bSent.disabled = !!at; }
  const showSent = () => { if (rawId && RC.proposalSent) bSent.hidden = false; };
  if (rawId && RC.proposalSent) { paintSent();
    bSent.addEventListener('click', () => { RC.proposalSent(rawId); paintSent(); });
    RC.on(d => { if (d.key === 'pipe') paintSent(); }); }
  // back to this home's record in the app (the proposal opens in its own tab, so the browser's Back has nowhere to go)
  if (rawId) { const b = $('#bBack'); b.href = '../product.html' + (Q.get('dev') === '1' ? '?dev=1&nointro=1' : '') + '#/crm/home/' + encodeURIComponent(rawId); b.hidden = false; }

  (gi == null || !window.STM ? Promise.resolve(null) : STM.facts(gi).then(f => { F = f; const row = f && f.roof; D = row ? row.report || null : null; return row ? outlineModel(RCPROP.measure(row, D)).then(m => (M = m)) : (M = null); }))
    .then(m => {
      if (!m) { $('#loading').textContent = gi == null ? 'Open a home first: this page needs ?id=m<home number>.' : 'No LiDAR roof size on file for this home, so the proposal needs the roof measured on site first.'; return; }
      $('#loading').hidden = true; $('#doc').hidden = false; $('#entry').hidden = false;
      render(); wire(); showSent();
    }).catch(err => { console.warn(err); $('#loading').textContent = 'The roof data did not load. Reload the page.'; });
})();
