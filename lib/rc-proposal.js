/* rc-proposal.js: the roof proposal's measured summary (window.RCPROP). Pure, no DOM, no prices, no material math.
   Input: one home's roof as the app already loads it (lib/rc-roof.js RCROOF.lookup -> row; row.report = the full roof-detail
   JSON when one was rendered, else the facet geometry, else nothing). Output: one plain shape for the proposal page: roof area,
   squares, pitch split, sections and the measured edge lengths. Nothing is invented: a figure that is not on file is left out.
   Jack 10-14: the proposal shows measurements only; each roofer works out materials and price their own way. */
(function () {
  'use strict';
  if (window.RCPROP) return;
  const r1 = v => Math.round(v * 10) / 10;
  const rise = s => { const m = /^(\d+(?:\.\d+)?)/.exec(String(s || '')); return m ? +m[1] : 0; };

  /* row: RCROOF.lookup's record (tile row figures, or the full report's totals); d: row.report (non-enumerable) */
  function measure(row, d) {
    if (!row || !(row.sq > 0)) return null;
    d = d || row.report || null;
    const full = !!(d && d.totals);
    const out = {
      source: full ? 'detail' : (d && d.facets && d.facets.length ? 'geometry' : 'tile'),
      measured: !!row.facets, year: row.year || 2018,
      address: d && d.address ? d.address : '',
      squares: full ? d.totals.squares : row.sq,
      areaSqft: full ? d.totals.roof_area_sqft : (row.area || Math.round(row.sq * 100)),
      planSqft: full ? d.totals.plan_area_sqft : (row.plan || null),
      facetsN: row.nFacets || 0,
      // measured edge lengths, ft (a tile row has one combined flashing figure)
      edges: { ridge: row.ridge || 0, hip: row.hip || 0, valley: row.valley || 0, eave: row.eave || 0, rake: row.rake || 0,
        step: row.detail ? (row.step || 0) : 0, wall: row.detail ? (row.wall || 0) : 0, flashing: row.detail ? 0 : (row.flashing || 0) },
      sections: [], pitches: [], splitKnown: false
    };
    // sections (facets) with a real area; the pitch split comes from them when they cover the roof
    const fs = d && d.facets ? d.facets.filter(f => f.area_sqft > 0) : [];
    if (fs.length) {
      out.sections = fs.map(f => ({ id: f.id, pitch: f.pitch || (Math.round(f.pitch_x12) + '/12'), x12: f.pitch_x12 != null ? f.pitch_x12 : rise(f.pitch),
        faces: f.faces || '', sqft: f.area_sqft }));
      const sum = fs.reduce((a, f) => a + f.area_sqft, 0);
      out.splitKnown = Math.abs(sum - out.areaSqft) <= Math.max(25, out.areaSqft * 0.03);
      if (out.splitKnown) out.facetsN = fs.length;   // a zero-area facet is not a section
    }
    const P = {};
    if (out.splitKnown) out.sections.forEach(s => { const k = Math.round(s.x12) + '/12'; P[k] = (P[k] || 0) + s.sqft; });
    else if (row.mix) Object.keys(row.mix).forEach(k => { P[k] = out.areaSqft * row.mix[k] / 100; });
    else if (row.pitch) P[row.pitch + '/12'] = out.areaSqft;   // tile row: main pitch only (split not on file)
    out.pitches = Object.keys(P).map(k => ({ pitch: k, sqft: Math.round(P[k]), squares: r1(P[k] / 100) })).sort((a, b) => b.sqft - a.sqft);
    return out;
  }

  window.RCPROP = { measure };
})();
