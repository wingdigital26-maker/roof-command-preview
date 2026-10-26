/* Hail at this address + neighbors who took the same hail (upgrade 10-19). Runs after rec.js on the home record.
   Every storm on file with the radar hail size at this house (lib/rc-hail.js, NOAA MRMS per home), how old the biggest
   storm is and its one-year mark, a Storm report the roofer prints or saves as PDF (hail-report.html), and the closest
   homes that took 1 in+ on that same storm and have no reroof permit since: open one, or add it to today's list.
   Nothing sends. Owner names never show here (addresses only). */
(function () {
  'use strict';
  const RC = window.RC, esc = RC.esc, $ = s => document.querySelector(s);
  const host = $('#hailPanel'); if (!host || !window.RCH) return;
  const dev = /[?&]dev=1/.test(location.search) ? '&dev=1' : '';
  let curGi = null, data = null, nb = null, ar = null, showAll = false;
  const short = iso => { const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+iso.slice(5, 7) - 1]; return m + ' ’' + iso.slice(2, 4); };
  const feet = m => { const f = m * 3.28084; return f < 1000 ? Math.round(f / 10) * 10 + ' ft' : (m / 1609.34).toFixed(1) + ' mi'; };
  const giNow = () => { const H = window.HOME; if (!H || !H.rec) return null; const g = H.rec.gi != null ? +H.rec.gi : /^m(\d+)$/.test(H.rawId || '') ? +H.rawId.slice(1) : null; return g >= 0 ? g : null; };

  // date labels under the bars: every 1 in+ storm, plus the first and last when their neighbor slot is free (no overlap)
  function labels(L) {
    const on = L.map(x => x.inches >= 1);
    if (!on[0] && !on[1]) on[0] = true;
    const n = L.length - 1; if (!on[n] && !on[n - 1]) on[n] = true;
    return L.map((x, k) => on[k] ? short(x.iso) : '');
  }
  // one bar per storm on file, oldest left; 1 in line dashed; 1 in+ bars in the roofer's accent
  function chart(h) {
    const L = h.slice().reverse(), W = 100 / Math.max(L.length, 1), MAX = Math.max(2, ...L.map(x => x.inches));
    const y1 = 100 - 100 / MAX;
    return `<div class="hchart" role="img" aria-label="Radar hail at this house for each storm on file">
      <div class="hbars">${L.map(x => { const p = Math.max(x.inches / MAX * 100, x.inches > 0 ? 2 : 0), big = x.inches >= 1;
        return `<div class="hb${big ? ' big' : ''}" style="width:${W}%" title="${esc(x.date)}: ${x.inches > 0 ? x.inches.toFixed(2) + ' in' : 'no hail'} at this house">
          ${big ? `<em>${x.inches.toFixed(2)}</em>` : ''}<i style="height:${p}%"></i></div>`; }).join('')}
        <span class="h1" style="top:${y1}%"><b>1 in</b></span></div>
      <div class="hlab">${labels(L).map(t => `<span style="width:${W}%">${t}</span>`).join('')}</div></div>`;
  }

  function render() {
    if (!data) { host.innerHTML = `<div class="ph"><h3>Hail at this address</h3></div><p class="hnote">Reading the radar for every storm on file…</p>`; return; }
    const h = data, big = h.filter(x => x.inches >= 1).sort((a, b) => b.inches - a.inches || (a.iso < b.iso ? 1 : -1))[0];
    const hits = h.filter(x => x.inches >= 1).length, c = big ? RCH.claimLine(big.iso) : null;
    const addrOf = n => esc(n.addr) + (n.city ? `<small>${esc(n.city)}</small>` : '');
    const list = nb && nb.list ? (showAll ? nb.list : nb.list.slice(0, 5)) : [];
    host.innerHTML = `<div class="ph"><h3>Hail at this address</h3><span class="pill">${h.length} storms on file</span></div>
      <div class="hbody">
        <p class="hsum">${big ? `<b>${big.inches.toFixed(2)} in</b> on ${esc(big.date)}${hits > 1 ? `, and 1 in+ on ${hits - 1} more storm${hits > 2 ? 's' : ''}` : ''}.` : 'No 1 in+ hail at this house in any storm on file.'}</p>
        ${chart(h)}
        ${c ? `<p class="hclock ${c.left > 0 ? (c.left < 90 ? 'soon' : '') : 'past'}"><span>Storm age</span>${esc(c.ago)}. One year from it: <b>${esc(c.oneYear)}</b>${c.left > 0 ? ` (${c.left} days left)` : ' (passed)'}. Filing windows differ by policy; the homeowner's policy decides.</p>` : ''}
        <div class="hacts"><button type="button" class="pbtn" id="hReport"><span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5v4h4M10 12h5M10 15.5h5"/></svg></span>Storm report</button>
          <small>One page for the homeowner: print it or save it as a PDF.</small></div>
      </div>
      ${big ? `<div class="nbh"><h4>Neighbors who took the same hail</h4>${nb ? `<span>${nb.total ? RC.fmt(nb.total) + ' homes within a quarter mile, 1 in+ on ' + esc(big.date) + ', no reroof permit since' : 'None within a quarter mile'}</span>` : '<span>Finding them…</span>'}</div>
      ${ar ? mapHTML(ar) : ''}
      ${list.length ? `<ul class="nbl">${list.map(n => { const added = RC.isAdded(n.id);
        return `<li><button type="button" class="nbo" data-open="${n.id}">${addrOf(n)}</button><span class="nbd">${feet(n.dist)}</span><span class="nbh2">${n.inches.toFixed(2)} in</span><span class="nby">${n.year ? 'Built ' + n.year : ''}</span>
          <button type="button" class="nba${added ? ' on' : ''}" data-add="${n.id}" aria-pressed="${added}">${added ? 'On today’s list' : 'Add to today'}</button></li>`; }).join('')}</ul>
        <div class="nbf">${nb.list.length > 5 ? `<button type="button" class="nbm" id="nbMore">${showAll ? 'Show fewer' : 'Show ' + (nb.list.length - 5) + ' more nearby'}</button>` : '<span></span>'}<button type="button" class="nbw" id="nbWalk">Print a walk sheet</button></div>` : ''}` : ''}
      <p class="hnote">Radar estimate (NOAA MRMS) at this house's spot, not a certified weather report. An inspection confirms damage.</p>`;
    $('#hReport').onclick = () => window.open('hail-report.html?id=' + encodeURIComponent('m' + curGi) + dev, '_blank');
    const more = $('#nbMore'); if (more) more.onclick = () => { showAll = !showAll; render(); };
    const walk = $('#nbWalk'); if (walk) walk.onclick = () => window.open('walk-sheet.html?id=' + encodeURIComponent('m' + curGi) + dev, '_blank');   // the street, printable (10-19)
    host.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { const n = nb.list.find(x => x.id === b.dataset.open); if (n) RC.remember(home(n)); RC.go('home', { id: b.dataset.open }); });
    host.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
      const n = nb.list.find(x => x.id === b.dataset.add); if (!n) return;
      if (RC.isAdded(n.id)) RC.unadd(n.id); else { RC.remember(home(n)); RC.add(Object.assign(home(n), { from: 'neighbors' })); }
      render();
    });
  }
  // the street on that storm: one dot per home within 1,000 ft, coloured by its radar hail (lib/rc-hail.js areaSVG)
  function mapHTML(A) {
    const others = A.homes.filter(h => !h.self), hit = others.filter(h => h.inches >= 1 && !h.reroofed).length, rr = others.filter(h => h.reroofed).length;
    return `<div class="hmap"><div class="hmsvg">${RCH.areaSVG(A, 300)}</div><div class="hmk"><b>${RC.fmt(hit)} of ${RC.fmt(others.length)}</b><span>homes within 1,000 ft took 1 in+ on ${esc(A.date)}${rr ? `; ${rr} reroofed since` : ''}</span>
      <ul>${RCH.LEGEND.map(([l, c]) => `<li><i style="background:${c}"></i>${l}</li>`).join('')}${rr ? '<li><i style="background:#fff;border:1px solid #9AA3B2"></i>reroofed since</li>' : ''}<li><i class="me"></i>this home</li></ul></div></div>`;
  }
  // the record the rest of the app keeps for a home (same shape the storm map and Nimbus add)
  const home = n => ({ id: n.id, addr: n.addr, city: n.city, zip: n.zip, county: n.county, lon: n.lon, lat: n.lat, hail: n.inches, storm: n.iso, year: n.year || null,
    roofAge: n.permit ? 'Reroof permit ' + String(n.permit).slice(0, 4) : n.year ? 'Built ' + n.year + ', no reroof permit on file' : null });

  function update() {
    const gi = giNow(); if (gi === curGi) return;
    curGi = gi; data = null; nb = null; ar = null; showAll = false;
    host.hidden = gi == null; if (gi == null) return;
    render();
    RCH.history(gi).then(h => { if (gi !== curGi) return; data = h; render();
      return RCH.neighbors(gi, { radius: 402, limit: 12 }).then(r => { if (gi !== curGi) return; nb = r; render();
        if (r && r.storm) return RCH.area(gi, { radius: 305, iso: r.storm.iso }).then(A => { if (gi !== curGi) return; ar = A; render(); }); }); }).catch(() => {});
  }
  const prev = window.renderRecord; window.renderRecord = function () { if (prev) prev.apply(this, arguments); update(); };
  RC.on(() => { update(); if (data && nb) render(); });
  update(); setInterval(update, 1000);   // a home switched in place (rec.js switchTo) without a render call
  if (window.HOME_READY && window.HOME_READY.then) window.HOME_READY.then(update);
})();
