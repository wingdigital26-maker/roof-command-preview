/* rc-traced-ui.js: traced phones and emails on a home (from lib/rc-traced.js, written by scripts/leads/tracerfy.py).
   RC.traced(addr, zip) -> { person, mock, phones:[{n,type,dnc}], emails:[] } | null
   RC.tracedRows(addr, zip) -> HTML rows for the facts grid ("Phone", "Email"), with a small "Test data" tag when the
   numbers came from Tracerfy's free sandbox (fabricated). Display only: nothing here sends, and a mock number never
   reaches a Messages/Mail button. Needs lib/rc-state.js first; does nothing when rc-traced.js is absent. */
(function () {
  if (typeof RC === 'undefined') return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pretty = n => /^\d{10}$/.test(n) ? `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}` : n;
  RC.traced = (addr, zip) => {
    const T = window.RC_TRACED;
    if (!T || !T.homes || !addr) return null;
    return T.homes[String(addr).trim().toUpperCase().replace(/\s+/g, ' ') + '|' + String(zip || '').slice(0, 5)] || null;
  };
  RC.tracedRows = (addr, zip) => {
    const t = RC.traced(addr, zip);
    if (!t) return '';
    if (!document.getElementById('rcTracedCss')) {
      const st = document.createElement('style'); st.id = 'rcTracedCss';
      st.textContent = '.ttag{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:999px;font:600 10px/1.5 ui-monospace,Menlo,monospace;letter-spacing:.04em;text-transform:uppercase;color:#8a5a00;background:rgba(255,184,0,.16);border:1px solid rgba(180,120,0,.35);vertical-align:1px}.tmul{display:block}';
      document.head.appendChild(st);
    }
    const tag = t.mock ? '<span class="ttag" title="Fabricated by Tracerfy\'s free sandbox. Not a real homeowner.">Test data</span>' : '';
    const ph = t.phones.length ? t.phones.map(p => `<span class="tmul">${esc(pretty(p.n))}${p.type ? ' <small>' + esc(p.type) + '</small>' : ''}${p.dnc ? ' <small>DNC</small>' : ''}</span>`).join('') : 'None found';
    const em = t.emails.length ? t.emails.map(e => `<span class="tmul">${esc(e)}</span>`).join('') : 'None found';
    return `<div><span>Traced phone${t.phones.length === 1 ? '' : 's'}</span><b>${ph}${tag}</b></div><div><span>Traced email${t.emails.length === 1 ? '' : 's'}</span><b>${em}${tag}</b></div>`;
  };
})();
