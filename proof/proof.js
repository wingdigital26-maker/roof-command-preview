/* proof.js: paints the Homeowner Proof Page (tour/proof/?h=<token>&s=<send id>). Reads the same public data every app
   screen reads: lib/rc-hail.js (MRMS radar hail per storm at the address, the street on that storm, re-roof permits
   after it), the catalog's NWS local storm reports (catalog.lsr), lib/st-meta.js (county address, year built, re-roof
   permit, LiDAR roof). Owner names are never loaded: RC.owner is not called anywhere on this page.
   ?preview=1 = the rep looking at it from the app: no "opened" record, and the form records nothing. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s), esc = RC.esc, R = activeRoofer();
  const Q = new URLSearchParams(location.search), gi = RCP.decode(Q.get('h')), sid = (Q.get('s') || '').replace(/[^0-9a-z]/gi, '').slice(0, 12) || null;
  const preview = Q.get('preview') === '1';
  const SIZE = [[2.5, 'tennis ball'], [2, 'hen egg'], [1.75, 'golf ball'], [1.5, 'ping pong ball'], [1.25, 'half dollar'], [1, 'quarter'], [0.88, 'nickel'], [0.75, 'penny'], [0.5, 'marble'], [0.25, 'pea']];
  const like = v => { const s = SIZE.find(([a]) => v >= a); return s ? s[1] : ''; };
  const inch = v => String(+v.toFixed(2)) + ' in';
  const miles = m => { const x = m / 1609.34; return x < 0.1 ? 'under 0.1 miles' : x < 10 ? x.toFixed(1) + ' miles' : Math.round(x) + ' miles'; };

  if (gi == null) { $('#loading').textContent = 'This link is not complete. Ask the person who sent it for a new one.'; return; }
  if (!preview) RCP.opened(gi, sid);

  RC.factsReady.then(() => Promise.all([STM.facts(gi), RCH.history(gi)])).then(([f, h]) => {
    if (!f || !f.addr || !h.length) { $('#loading').textContent = 'No storm records are on file for this address yet.'; return; }
    const street = f.addr, place = f.place || (f.city ? f.city + ', TX' : '');
    $('#addr').textContent = street + (place ? ', ' + place : '');
    document.title = 'Storm record, ' + street;

    // the storm this page is about: the newest storm with 1 in+ radar hail here, else the biggest hail on file
    const hits = h.filter(x => x.inches >= 1), top = h.slice().sort((a, b) => b.inches - a.inches)[0];
    const S = hits.length ? hits.slice().sort((a, b) => a.iso < b.iso ? 1 : -1)[0] : top;
    const sz = like(S.inches);
    $('#big').innerHTML = S.inches > 0
      // both storms labelled plainly so the newest and the biggest never read as a contradiction (visual check 10-23)
      ? `<p class="k">${hits.length ? 'Most recent 1 in+ hail' : 'Biggest hail on file'}</p><div class="n"><b>${esc(inch(S.inches))}</b><span>hail on ${esc(S.date)}</span></div>
         ${top !== S && top.inches > S.inches ? `<p class="also"><b>Biggest on file:</b> ${esc(top.date)}, ${esc(inch(top.inches))}</p>` : ''}
         <p>Radar estimates of the largest hail at this address on each day.${S.inches < 1 ? ' Hail under 1 inch rarely damages shingles.' : ''}${hits.length > 1 ? ` ${hits.length} storms since ${esc(h[h.length - 1].date)} put 1 inch or bigger hail here.` : ''}</p>${sz ? `<span class="like">About ${esc(sz)} size</span>` : ''}`
      : `<div class="n"><b>No hail</b><span>on radar here</span></div><p>None of the ${h.length} storms on file put hail on this address by radar.</p>`;
    $('#bigSrc').textContent = 'NOAA MRMS radar (Maximum Expected Size of Hail, 1 km grid). An estimate: hail on the ground can be bigger or smaller.';

    // how close the hail came: the National Weather Service's own ground reports that day, nearest first
    const L = (RC.catalog && RC.catalog.lsr && RC.catalog.lsr[S.iso]) || [];
    if (L.length && isFinite(f.lon) && isFinite(f.lat)) {
      const near = L.map(([x, y, s]) => ({ s, d: RCH.metres(f.lon, f.lat, x, y) })).sort((a, b) => a.d - b.d);
      const n = near[0], in5 = near.filter(r => r.d <= 8047);
      $('#near').innerHTML = `<div class="stat"><b>${esc(miles(n.d))}</b><span>to the nearest reported hail</span></div>
        <p>On ${esc(S.date)} a ${esc(inch(n.s))} hailstone${like(n.s) ? ' (about ' + esc(like(n.s)) + ' size)' : ''} was reported to the National Weather Service ${esc(miles(n.d))} from this house.
        ${in5.length > 1 ? `${in5.length} hail reports that day were within 5 miles, the largest ${esc(inch(Math.max(...in5.map(r => r.s))))}.` : ''}</p>
        <p class="src"><span class="chip">Source</span>National Weather Service Fort Worth, local storm reports for ${esc(S.date)}. Spotter and public reports, located to about a mile.</p>`;
      $('#nearCard').hidden = false;
    }

    // facts about the roof (county roll, city permits, LiDAR)
    const rows = [];
    if (f.year) rows.push(['Year built', String(f.year), f.county ? f.county + ' appraisal roll' : 'county appraisal roll']);
    if (f.reroof && !f.reroof.none && f.reroof.date) rows.push(['Last re-roof permit', f.reroof.date, (f.reroof.means ? f.reroof.means + '. ' : '') + (f.reroof.src || 'city permit records')]);
    else if (f.reroof && f.reroof.none) rows.push(['Re-roof permits', 'None on file', f.reroof.text + ' (' + (f.reroof.src || 'city permit records') + ')']);
    if (f.roof && f.roof.sq) rows.push(['Roof size', 'About ' + (Math.round(f.roof.sq * 10) / 10) + ' squares', 'A LiDAR estimate from aerial survey data, typically within about 10% of permit records; a measurement is taken before any final quote. (1 square = 100 sq ft)']);
    if (f.subdivision) rows.push(['Neighborhood', f.subdivision, '']);
    $('#roof').innerHTML = rows.length ? rows.map(([a, b, n]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}${n ? `<span class="note">${esc(n)}</span>` : ''}</dd></div>`).join('')
      : '<div><dt>Roof records</dt><dd>Not on file</dd></div>';

    // every storm on file, newest first (the 1 in+ ones marked)
    const shown = h.filter(x => x.inches > 0).slice(0, 10);
    if (shown.length) {
      $('#hist').innerHTML = `<table class="hist"><tbody>${shown.map(x => `<tr><td>${esc(x.date)}</td><td class="n ${x.inches >= 1 ? 'hit' : 'z'}">${esc(inch(x.inches))}${x.inches >= 1 && like(x.inches) ? ', ' + esc(like(x.inches)) : ''}</td></tr>`).join('')}</tbody></table>
        <p class="src"><span class="chip">Source</span>NOAA MRMS radar, ${h.length} storms on file since ${esc(h[h.length - 1].date)}${h.length > shown.length ? '; storms with no hail here are not listed' : ''}.</p>`;
      $('#histCard').hidden = false;
    }

    $('#mean').innerHTML = [
      '<b>Radar is an estimate.</b> It shows the largest hail likely at this spot, not what landed on your roof.',
      '<b>Nothing here says your roof is damaged.</b> Only an inspection on the roof can tell.',
      S.inches >= 1 ? '<b>1 inch and up</b> is the hail size roofers and insurance adjusters look at for shingle damage.' : '<b>Hail under 1 inch</b> rarely damages shingles.',
      '<b>Insurance questions</b> are between you and your insurer: your policy sets what is covered and the deadlines. A roofer cannot file or negotiate a claim for you in Texas.'
    ].map(x => `<li>${x}</li>`).join('');

    $('#srcs').textContent = `Sources: NOAA MRMS radar hail (${h.length} storms on file); National Weather Service Fort Worth storm reports; ${f.county || 'county'} appraisal roll; city re-roof permit records; USGS 3DEP LiDAR (2018).`;
    $('#loading').hidden = true; $('#doc').hidden = false;
    // the sticky Book bar (phone): shown while the booking card is off screen
    const sticky = $('#sticky'); document.body.classList.add('has-sticky');
    if ('IntersectionObserver' in window) new IntersectionObserver(es => { sticky.hidden = es[0].isIntersecting; }).observe($('#book')); else sticky.hidden = false;
    sticky.onclick = e => { e.preventDefault(); $('#book').scrollIntoView({ behavior: 'smooth', block: 'start' }); if (!$('#bOpen').hidden) $('#bOpen').click(); };

    // the street on that storm (1,000 ft) and the re-roof permits pulled since (a quarter mile). Counts only.
    if (S.inches > 0) RCH.area(gi, { radius: 305, iso: S.iso }).then(A => { if (!A) return;
      const others = A.homes.filter(x => !x.self), hit = others.filter(x => x.inches >= 1).length;
      $('#streetH').textContent = 'Your street on ' + A.date;
      $('#streetMap').innerHTML = RCH.areaSVG(A, 260);
      $('#streetKey').innerHTML = `<div class="stat"><b>${RC.fmt(hit)} of ${RC.fmt(others.length)}</b><span>homes within 1,000 ft</span></div>
        <p>took 1 inch or bigger hail on ${esc(A.date)}, by radar. Each dot is a home, this one is ringed. No addresses are shown.</p>
        <ul>${RCH.LEGEND.slice(0, 4).map(([l, c]) => `<li><i style="background:${c}"></i>${esc(l)} in</li>`).join('')}<li><i style="background:#fff;border:1px solid #9AA3B2"></i>re-roofed since</li></ul>`;
      $('#streetCard').hidden = false; }).catch(() => {});
    // re-roofs nearby, two counts, never addresses: (1) Turnover Radar's own number (meta/turnover.json, the same file and
    // wording Today uses: permits within about a block in the last 90 days), (2) homes within a quarter mile with a re-roof
    // permit dated after the FIRST 1 in+ storm here. A zero from a partial permit list proves nothing, so zeros are not shown.
    const S0 = hits.length ? hits.slice().sort((a, b) => a.iso < b.iso ? -1 : 1)[0] : null;
    const J = u => fetch(RC.dataRoot + u).then(r => r.ok ? r.json() : null).catch(() => null);
    Promise.all([S0 ? RCH.area(gi, { radius: 402, iso: S0.iso }) : null, J('meta/permits.json'), J('meta/turnover.json')]).then(([A, P, T]) => {
      const reg = RC.catalog.regions.find(r => gi >= r.offset && gi < r.offset + r.count), out = [];
      const tr = T && T.rows && reg && reg.id === 'collin-tx' ? T.rows[String(gi - reg.offset)] : null;
      if (tr && tr[0] > 0) out.push(`<div class="stat"><b>${RC.fmt(tr[0])}</b><span>${tr[0] === 1 ? 'neighbor' : 'neighbors'} within about a block</span></div>
        <p>re-roofed in the last ${T.days} days (newest permit ${esc(RCH.fmtDay(String(tr[1]).slice(0, 10)))}).</p>`);
      const keys = P && reg ? Object.keys(P).filter(k => k.indexOf(reg.id + ':') === 0) : [];
      if (A && keys.length) { const others = A.homes.filter(x => !x.self), n = others.filter(x => x.reroofed).length;
        if (n) out.push(`<div class="stat"${out.length ? ' style="margin-top:12px"' : ''}><b>${RC.fmt(n)} of ${RC.fmt(others.length)}</b><span>homes within a quarter mile</span></div>
          <p>have a re-roof permit dated after the ${esc(A.date)} hail, the first storm on file to put 1 inch or bigger hail here.</p>`); }
      if (!out.length) return;
      const thru = T && T.as_of ? RCH.fmtDay(T.as_of).replace(/ \d+,/, '') : '';
      $('#nb').innerHTML = out.join('') + `<p>Permit lists do not catch every job, so the real numbers can be higher.</p>
        <p class="src"><span class="chip">Source</span>${esc(T && T.source ? T.source.split('. Rates')[0] : 'City and county re-roof permit records')}${thru ? ', through ' + esc(thru) : ''}. Counts only, never addresses.</p>`;
      $('#nbCard').hidden = false; }).catch(() => {});

    // who sent this: only what the roofer has on file (brand.js); nothing invented
    const who = [`<div class="row"><div class="mk" data-r2="logo"></div><div><b>${esc(R.name)}</b><br><span class="hint">Serving ${esc(R.area || '')}</span></div></div>`];
    const bits = [R.mailingAddress ? 'Office: ' + R.mailingAddress : '', R.phone ? 'Call or text ' + R.phone : '', R.years ? R.years + ' years in business' : '', R.reviews ? R.reviews : ''].filter(Boolean);
    if (bits.length) who.push(`<p>${bits.map(esc).join('<br>')}</p>`);
    who.push(`<p>${esc(R.owner ? R.owner + ' and the ' + R.name + ' team' : R.name)} put this page together from public records for your address. We will never ask you to pay, waive or rebate an insurance deductible.</p>`);
    $('#who').innerHTML = who.join('');
    rooferMark($('#who [data-r2="logo"]'), R);
  }).catch(err => { console.warn(err); $('#loading').textContent = 'The storm records did not load. Reload the page.'; });

  // ---------- book a free inspection + the consent box ----------
  const WHEN = ['Weekday morning', 'Weekday afternoon', 'Weekday evening', 'Saturday'];
  let when = '';
  $('#when').innerHTML = WHEN.map(w => `<button type="button" aria-pressed="false">${w}</button>`).join('');
  $('#when').onclick = e => { const b = e.target.closest('button'); if (!b) return; when = b.getAttribute('aria-pressed') === 'true' ? '' : b.textContent;
    $('#when').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.textContent === when))); };
  $('#consentText').textContent = RCP.consentText();
  $('#bOpen').onclick = () => { $('#bOpen').hidden = true; $('#form').hidden = false; $('#fPhone').focus(); };
  $('#form').addEventListener('submit', e => {
    e.preventDefault();
    const ph = $('#fPhone').value.replace(/\D/g, ''), em = $('#fEmail').value.trim(), agree = $('#fAgree').checked, why = $('#fWhy');
    const phOk = ph.length === 10 || (ph.length === 11 && ph[0] === '1'), emOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em);
    const fail = m => { why.textContent = m; why.hidden = false; };
    if (ph && !phOk) return fail('Type a 10 digit mobile number.');
    if (em && !emOk) return fail('That email does not look complete.');
    if (!phOk && !emOk) return fail('Add a mobile number or an email so we can reach you.');
    if (agree && !phOk) return fail('Add your mobile number for texts, or untick the box.');
    if (!agree && !emOk) return fail('Tick the box so we can text or call you, or add an email instead.');
    why.hidden = true;
    if (!preview) { RCP.ask(gi, { when, sid }); RCP.consent(gi, { phone: phOk ? ph : '', email: emOk ? em : '', agree, sid, page: location.pathname }); }
    $('#form').hidden = true;
    $('#done').innerHTML = `<b>Thanks, request sent.</b>${esc(R.name)} will ${agree ? 'text or call you' : 'email you'} to confirm a time${when ? ' (' + esc(when.toLowerCase()) + ')' : ''}. ${agree ? 'Reply STOP to any text to stop.' : ''}${preview ? '<br><i>Preview: nothing was recorded.</i>' : ''}`;
    $('#done').hidden = false;
  });
  $('#bStop').onclick = () => {
    if (!confirm(`Stop all texts, calls and emails from ${R.name} about this address?`)) return;
    if (!preview) RCP.optout(gi);
    $('#bStop').outerHTML = `<b>Done. ${esc(R.name)} will not contact you again about this address.</b>`;
  };
})();
