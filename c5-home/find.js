/* CRM: what the shell's header search found (lib/rc-find.js). A street, subdivision, ZIP or city opens the Pipeline with
   the board search filled in, and this panel lists every home there from the county roll (not only the board's), each one
   a click from its record. The shell sends {type:'crm-find', kind, title, sub, q, ids | ranges, count}; window.__crmFind
   takes the same object (the shell calls it directly when the frame is up, the message covers a cold load). */
(function () {
  if (window.__crmFind) return;
  const $ = s => document.querySelector(s), esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MAX = 400;   // rows drawn; the count line always says how many homes are there
  const css = document.createElement('style');
  css.textContent = `
.cfind{margin:0 0 12px;border:1px solid var(--c-line,#D5D9E0);border-radius:6px;background:#fff;overflow:hidden}
.cfind[hidden]{display:none}
.cfind .cfh{display:flex;align-items:center;gap:12px;padding:10px 12px;border-bottom:1px solid var(--c-line-2,#E6E8ED);background:var(--c-tint,#F1F5FA)}
.cfind .cfk{font-family:var(--c-mono,monospace);font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--c-slate,#5A6378);flex:none}
.cfind .cft{min-width:0;flex:1}
.cfind .cft b{display:block;font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cfind .cft small{display:block;font-size:12px;color:var(--c-slate,#5A6378);margin-top:1px}
.cfind .cft small i{font-style:normal;font-family:var(--c-mono,monospace);font-variant-numeric:tabular-nums;color:var(--c-ink,#0B1020)}
.cfind .cfx{flex:none;height:32px;padding:0 12px;border-radius:6px;border:1px solid var(--c-line,#D5D9E0);background:#fff;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.cfind .cfx:hover{background:var(--c-canvas,#EEF0F3)}
.cfind .cfl{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:0;max-height:208px;overflow-y:auto;overscroll-behavior:contain}
.cfind .cfl button{display:flex;flex-direction:column;align-items:flex-start;gap:1px;text-align:left;border:0;border-bottom:1px solid var(--c-line-2,#E6E8ED);border-right:1px solid var(--c-line-2,#E6E8ED);background:#fff;padding:8px 12px;min-height:48px;font:inherit;cursor:pointer;color:var(--c-ink,#0B1020)}
.cfind .cfl button:hover,.cfind .cfl button:focus-visible{background:var(--c-tint,#F1F5FA)}
.cfind .cfl button b{font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.cfind .cfl button span{font-size:11.5px;color:var(--c-slate,#5A6378)}
.cfind .cfl button span em{font-style:normal;color:var(--c-blue,#2757E6);font-weight:600}
.cfind .cfm{padding:8px 12px;font-size:12px;color:var(--c-slate,#5A6378)}
@media (max-width:640px){.cfind .cfl{grid-template-columns:1fr;max-height:46vh}.cfind .cfl button{min-height:52px;border-right:0}}`;
  document.head.appendChild(css);
  const box = document.createElement('section'); box.className = 'cfind'; box.id = 'cfind'; box.hidden = true; box.setAttribute('aria-label', 'Search results');
  let cur = null, pend = null;
  function place() {
    if (box.isConnected) return true;
    const sh = document.querySelector('#pipePane .pshow') || document.querySelector('#pipePane #pcount'); if (!sh) return false;
    sh.after(box); return true;
  }
  const KIND = { street: 'Street', subdivision: 'Subdivision', zip: 'ZIP', city: 'City' };
  function idsOf(f) {
    if (f.ids) return f.ids.slice();
    const out = []; (f.ranges || []).slice().sort((a, b) => a[0] - b[0]).forEach(([a, n]) => { for (let j = 0; j < n; j++) out.push(a + j); }); return out;
  }
  function boardIds() { return new Set([...document.querySelectorAll('#pcols .pc[data-id]')].map(e => e.dataset.id)); }
  function paint() {
    const f = cur; if (!f) { box.hidden = true; return; }
    const ids = idsOf(f), n = ids.length, on = boardIds(), onN = ids.filter(i => on.has('m' + i)).length;
    box.innerHTML = `<div class="cfh"><span class="cfk">${esc(KIND[f.kind] || 'Found')}</span><div class="cft"><b>${esc(f.title)}</b><small>${esc(f.sub ? f.sub + '. ' : '')}<i>${n.toLocaleString()}</i> ${n === 1 ? 'home' : 'homes'} on the county roll, <i>${onN}</i> on your board</small></div><button type="button" class="cfx" data-x="1">Clear search</button></div>
      <div class="cfl" role="list"></div>${n > MAX ? `<p class="cfm">Showing the first ${MAX} in street order. Search a house number to go straight to one.</p>` : ''}`;
    box.hidden = false;
    const list = box.querySelector('.cfl'), show = ids.slice(0, MAX);
    const draw = () => { list.innerHTML = show.map(i => { const m = (window.STM && STM.metaNow(i)) || {};
      return `<button type="button" role="listitem" data-id="m${i}"><b>${esc(m.addr || 'Home ' + i)}</b><span>${esc([m.city, m.zip].filter(Boolean).join(' '))}${on.has('m' + i) ? ' · <em>On your board</em>' : ''}</span></button>`; }).join(''); };
    draw();
    if (window.STM && show.length && !STM.metaNow(show[0])) Promise.all([...new Set(show.map(i => i))].slice(0, 1).map(i => STM.meta(i))).then(() => { if (cur === f) draw(); });
  }
  function run(f) {
    if (!f) return;
    if (!place() || !$('#pq')) { pend = f; return; }
    cur = f; pend = null;
    if (window.crmSetView) window.crmSetView('pipeline', true);
    const q = $('#pq'); q.value = f.q || ''; q.dispatchEvent(new Event('input', { bubbles: true }));
    paint(); setTimeout(paint, 300);   // the board redraws after its 120 ms search debounce: count "on your board" again
    box.scrollIntoView({ block: 'nearest' });
  }
  box.addEventListener('click', e => {
    if (e.target.closest('[data-x]')) { cur = null; box.hidden = true; const q = $('#pq'); if (q) { q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); } return; }
    const b = e.target.closest('button[data-id]'); if (!b) return;
    const id = b.dataset.id, gi = +id.slice(1), m = (window.STM && STM.metaNow(gi)) || null;
    if (m && window.RC && RC.remember) RC.remember({ id, gi, addr: m.addr, city: m.city, zip: m.zip, place: m.place, full: m.full, subdivision: m.subdivision || '', state: m.state });
    if (window.crmOpenHome) window.crmOpenHome(id); else if (window.switchHome) { window.switchHome(id); if (window.crmSetView) window.crmSetView('home', false, id); }
  });
  window.__crmFind = run;
  addEventListener('message', e => { if (e.origin !== location.origin) return; const d = e.data || {}; if (d.type === 'crm-find') run(d.find); });
  const tick = setInterval(() => { if (pend && place() && $('#pq')) run(pend); if (!pend && box.isConnected) clearInterval(tick); }, 250);
  setTimeout(() => clearInterval(tick), 30000);
})();
