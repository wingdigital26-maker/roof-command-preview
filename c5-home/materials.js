/* Materials tab (upgrade 10-19): a starting material order from the roof the record measured (home.js -> HOME.measure:
   squares, waste, roof area and the edge lengths of the drawn roof). Common coverage figures, labelled as such: every
   brand prints its own, so the roofer checks them against the supplier before ordering. Copy puts the list on the
   clipboard for the supplier email or text the roofer writes. Nothing is ordered or sent from here. */
(function () {
  'use strict';
  const RC = window.RC, esc = RC.esc, $ = s => document.querySelector(s);
  const host = $('#mat'); if (!host) return;
  // common coverage (brand sheets vary): 3 bundles a square; starter about 100 ft a bundle; hip and ridge cap about 25 ft a
  // bundle; synthetic underlayment 10 squares a roll; valley ice and water 66 ft a roll; drip edge 10 ft a piece;
  // coil nails about 320 a square, 7,200 a box
  const CEIL = x => Math.ceil(x - 1e-9);
  const N = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  function list(m) {
    const E = m.edges || {}, sq = +m.squares || 0, waste = +m.waste || 10;
    const order = Math.ceil(sq * (1 + waste / 100) * 3) / 3;   // whole bundles: thirds of a square
    const eaves = E.eave || 0, rakes = E.rake || 0, ridge = (E.ridge || 0) + (E.hip || 0), valley = E.valley || 0;
    const rows = [
      ['Shingles', N(CEIL(order * 3), 'bundle', 'bundles'), `${order.toFixed(1)} sq to order: ${sq} sq measured plus ${waste}% waste, 3 bundles a square`],
      ['Starter strip', eaves + rakes ? N(CEIL((eaves + rakes) / 100), 'bundle', 'bundles') : 'Measure on site', eaves + rakes ? `${Math.round(eaves + rakes)} ft of eaves and rakes, about 100 ft a bundle` : 'No eave or rake lengths on this drawing'],
      ['Hip and ridge cap', ridge ? N(CEIL(ridge / 25), 'bundle', 'bundles') : 'None drawn', ridge ? `${Math.round(ridge)} ft of hips and ridges, about 25 ft a bundle` : ''],
      ['Underlayment', N(CEIL(sq * 1.1 / 10), 'roll', 'rolls'), 'Synthetic, 10 squares a roll, 10% for laps'],
      ['Ice and water, valleys', valley ? N(CEIL(valley / 66), 'roll', 'rolls') : 'None drawn', valley ? `${Math.round(valley)} ft of valleys, 66 ft a roll` : 'No valleys on this drawing'],
      ['Drip edge', eaves + rakes ? N(CEIL((eaves + rakes) * 1.05 / 10), 'piece', 'pieces') : 'Measure on site', eaves + rakes ? '10 ft pieces, 5% for laps' : ''],
      ['Coil nails', N(Math.max(1, CEIL(order * 320 / 7200)), 'box', 'boxes'), 'About 320 a square, 7,200 a box'],
      ['Pipe boots, vents, flashing', 'Count on site', 'Not visible in aerial data']
    ];
    return { order, rows };
  }
  let lastKey = '';
  function render() {
    const H = window.HOME, m = H && H.measure;
    const key = m ? [H.rawId, m.squares, m.waste, JSON.stringify(m.edges || {})].join('|') : 'none|' + (H && H.rawId);
    if (key === lastKey) return; lastKey = key;
    if (!m || !m.squares) { host.innerHTML = `<p class="mnote">No measured roof for this home yet. Measure it on site, or draw it, and the starting order shows here.</p>`; return; }
    // roof shape being checked: only the LiDAR squares are known; waste, edges and caps depend on the shape, so they wait for the site visit
    if (m.checking) { const sq = +m.squares, rows = [['Shingles', N(CEIL(sq * 3), 'bundle', 'bundles') + ' before waste', `~${sq} sq estimated from ${m.lidarYear} LiDAR, 3 bundles a square; add waste once the roof is walked`],
        ['Underlayment', N(CEIL(sq * 1.1 / 10), 'roll', 'rolls'), 'Synthetic, 10 squares a roll, 10% for laps'],
        ['Starter, drip edge, hip and ridge cap, valleys', 'Measure on site', 'Edge lengths show once this roof shape passes its checks'], ['Pipe boots, vents, flashing', 'Count on site', 'Not visible in aerial data']];
      host.innerHTML = `<div class="mh"><div><b>~${sq} squares before waste</b><span>Estimated from ${m.lidarYear} LiDAR, pitch ${esc(m.pitch || '')}</span></div></div>
        <table class="mt"><tbody>${rows.map(([a, q, w]) => `<tr><td><b>${esc(a)}</b><small>${esc(w)}</small></td><td class="q">${esc(q)}</td></tr>`).join('')}</tbody></table>
        <p class="mnote">A starting point, not an order. Check the roof on site before you order.</p>`; return; }
    const L = list(m), addr = (H.rec && H.rec.addr) || '';
    host.innerHTML = `<div class="mh"><div><b>${L.order.toFixed(1)} squares to order</b><span>${m.facet ? 'Measured from LiDAR roof facets' : 'Estimated from the outline and LiDAR'}, pitch ${esc(m.pitch || '')}</span></div>
        <button type="button" id="matCopy">Copy list</button></div>
      <table class="mt"><tbody>${L.rows.map(([a, q, w]) => `<tr><td><b>${esc(a)}</b>${w ? `<small>${esc(w)}</small>` : ''}</td><td class="q">${esc(q)}</td></tr>`).join('')}</tbody></table>
      <p class="mnote">A starting order, not a supplier quote. Coverage differs by brand: check your shingle and accessory sheets, and the roof on site, before you order.</p>`;
    $('#matCopy').onclick = () => {
      const txt = `Material order${addr ? ' for ' + addr : ''}\n` + L.rows.map(([a, q]) => `${a}: ${q}`).join('\n');
      try { navigator.clipboard.writeText(txt); } catch (e) { }
      if (window.homeSay) homeSay('Material list copied. Paste it into your supplier email or text.');
    };
  }
  const prev = window.renderRecord; window.renderRecord = function () { if (prev) prev.apply(this, arguments); render(); };
  RC.on(render); setInterval(render, 1500); render();
})();
