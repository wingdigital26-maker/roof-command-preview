/* hail-report.js: the one-page Hail report for one address (hail-report.html?id=m<home index>). Reads the same data every
   screen reads: lib/rc-hail.js (radar hail per storm at the house, neighbors on the same storm) and lib/st-meta.js (county
   address, year built, reroof permit). Owner names are never loaded here. Print or save PDF via window.print. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s), esc = RC.esc;
  const Q = new URLSearchParams(location.search), rawId = Q.get('id') || '', mm = /^m(\d+)$/.exec(rawId), gi = mm ? +mm[1] : null;
  // NWS hail size words (the comparison a homeowner knows)
  const SIZE = [[2.5, 'tennis ball'], [2, 'hen egg'], [1.75, 'golf ball'], [1.5, 'ping pong ball'], [1.25, 'half dollar'], [1, 'quarter'], [0.88, 'nickel'], [0.75, 'penny'], [0.5, 'marble'], [0.25, 'pea']];
  const like = v => { const s = SIZE.find(([a]) => v >= a); return s ? s[1] : ''; };
  const short = iso => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+iso.slice(5, 7) - 1] + ' ’' + iso.slice(2, 4);

  $('#bPrint').addEventListener('click', () => window.print());
  if (rawId) { const b = $('#bBack'); b.href = '../product.html' + (Q.get('dev') === '1' ? '?dev=1&nointro=1' : '') + '#/crm/home/' + encodeURIComponent(rawId); b.hidden = false; }
  if (gi == null) { $('#loading').textContent = 'Open a home first: this page needs ?id=m<home number>.'; return; }

  Promise.all([STM.facts(gi), RCH.history(gi)]).then(([f, h]) => {
    if (!h.length) { $('#loading').textContent = 'No storm radar on file for this home.'; return; }
    const addr = f && f.addr ? f.addr + (f.place ? ', ' + f.place : '') : 'Address not on file';
    $('#dAddr').textContent = addr; document.title = 'Hail report, ' + addr;
    $('#dDate').textContent = 'Prepared ' + new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const big = h.filter(x => x.inches >= 1).sort((a, b) => b.inches - a.inches || (a.iso < b.iso ? 1 : -1))[0];
    const top = h.slice().sort((a, b) => b.inches - a.inches)[0], hits = h.filter(x => x.inches >= 1).length;
    const c = big ? RCH.claimLine(big.iso) : null;
    const kp = (a, v, s) => `<div><span>${esc(a)}</span><b>${esc(v)}</b>${s ? `<small>${esc(s)}</small>` : ''}</div>`;
    const paintKpis = nbTotal => {
      $('#kpis').innerHTML = [
        kp('Biggest hail here', top && top.inches > 0 ? top.inches.toFixed(2) + ' in' : 'None', top && top.inches > 0 ? top.date + (like(top.inches) ? ', about ' + like(top.inches) + ' size' : '') : ''),
        kp('Storms with 1 in+ here', hits + ' of ' + h.length, 'storms on file since ' + h[h.length - 1].date),
        kp('Roof on file', f && f.year ? 'Built ' + f.year : 'Year not on file', f && f.roofAge ? f.roofAge.replace(/^Built \d+, /, '') : ''),
        kp('Neighbors, same storm', nbTotal == null ? '…' : big ? RC.fmt(nbTotal) : 'None', big ? 'homes within a quarter mile with 1 in+ on ' + big.date : 'no 1 in+ storm here')
      ].join('');
    };
    paintKpis(null);
    // the chart, oldest left
    const L = h.slice().reverse(), MAX = Math.max(2, ...L.map(x => x.inches)), TOP = Math.max(...L.map(x => x.inches));
    // labels: every 1 in+ storm, plus the biggest one even when it stayed under 1 in (dataviz: selective direct labels, 10-24)
    $('#chart').innerHTML = `<div class="bars">${L.map(x => { const big1 = x.inches >= 1, p = x.inches > 0 ? Math.max(x.inches / MAX * 100, 2) : 0, lab = big1 || (x.inches > 0 && x.inches === TOP);
      return `<div class="b${big1 ? ' big' : ''}" title="${esc(x.date)}: ${x.inches > 0 ? x.inches.toFixed(2) + ' in' : 'no hail here'}">${lab ? `<em>${x.inches.toFixed(2)}</em>` : ''}<i style="height:${p}%"></i></div>`; }).join('')}
      <span class="one" style="top:${100 - 100 / MAX}%"><b>1 in</b></span></div><div class="lab">${L.map(x => `<span>${short(x.iso)}</span>`).join('')}</div>`;
    // the table, newest first
    $('#tbl').innerHTML = `<h3>Every storm on file</h3><table class="t"><thead><tr><th>Storm</th><th class="n">Hail here</th><th>About the size of</th></tr></thead><tbody>${
      h.map(x => `<tr><td>${esc(x.date)}</td><td class="n ${x.inches >= 1 ? 'big' : x.inches > 0 ? '' : 'z'}">${x.inches > 0 ? x.inches.toFixed(2) + ' in' : 'none'}</td><td class="${x.inches >= 0.25 ? '' : 'z'}">${x.inches >= 0.25 ? like(x.inches) : ''}</td></tr>`).join('')}</tbody></table>`;
    $('#roofBlk').innerHTML = `<h3>This roof</h3><table class="t"><tbody>
      <tr><td>Year built</td><td class="n">${f && f.year ? f.year : 'not on file'}</td></tr>
      <tr><td>Roof age</td><td class="n">${esc(f && f.roofAge || 'not on file')}</td></tr>
      ${f && f.roof && f.roof.sq ? `<tr><td>Roof size</td><td class="n">about ${(Math.round(f.roof.sq * 10) / 10)} squares</td></tr>` : ''}
      ${f && f.subdivision ? `<tr><td>Neighborhood</td><td class="n">${esc(f.subdivision)}</td></tr>` : ''}
      ${c ? `<tr><td>Biggest storm was</td><td class="n">${esc(c.ago)}</td></tr><tr><td>One year from it</td><td class="n">${esc(c.oneYear)}</td></tr>` : ''}
      </tbody></table>`;
    $('#mean').innerHTML = [
      ['Size', big ? `${big.inches.toFixed(2)} in is about ${like(big.inches)} size. Hail 1 in and up is the size roofers and adjusters look at for shingle damage.` : 'No storm on file put 1 in+ hail on this house. Smaller hail rarely damages shingles.'],
      ['Next step', 'A roof inspection: photos of every slope that faced the storm, and an honest answer on whether there is damage.'],
      ['Timing', c ? `The biggest storm here was ${c.ago}. Filing windows differ by policy; check the policy for its deadline.` : 'Nothing time sensitive on file.']
    ].map(([a, t]) => `<div><b>${a}</b>${esc(t)}</div>`).join('');
    $('#srcLine').textContent = `Home facts: ${f && f.county ? f.county + ' appraisal roll' : 'county appraisal roll'}${f && f.roofAge && /permit/i.test(f.roofAge) ? ' and city reroof permits' : ''}. Radar: NOAA MRMS hail size per storm, ${h.length} storms on file.`;
    $('#loading').hidden = true; $('#doc').hidden = false;
    RCH.neighbors(gi, { radius: 402, limit: 1 }).then(r => paintKpis(r && r.total != null ? r.total : 0)).catch(() => paintKpis(0));
    // the street on the biggest storm: every home within 1,000 ft, coloured by its radar hail (addresses never shown)
    if (big) RCH.area(gi, { radius: 305, iso: big.iso }).then(A => { if (!A) return;
      const others = A.homes.filter(h => !h.self), hit = others.filter(h => h.inches >= 1 && !h.reroofed).length;
      $('#streetH').textContent = 'Your street on ' + A.date;
      $('#streetMap').innerHTML = RCH.areaSVG(A, 300);
      $('#streetKey').innerHTML = `<b class="n">${RC.fmt(hit)} of ${RC.fmt(others.length)}</b><p>homes within 1,000 ft of this house took 1 in+ hail on ${esc(A.date)}, by radar. Each dot is a home; this house is ringed.</p>
        <ul>${RCH.LEGEND.map(([l, c]) => `<li><i style="background:${c}"></i>${esc(l)}</li>`).join('')}<li><i style="background:#fff;border:1px solid #9AA3B2"></i>reroofed since</li></ul>`;
      $('#streetBlk').hidden = false; }).catch(() => {});
  }).catch(err => { console.warn(err); $('#loading').textContent = 'The radar data did not load. Reload the page.'; });
})();
