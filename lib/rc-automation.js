/* rc-automation.js: the "Automation: on/off" switch in the CRM inbox header (Jack 10-10: sending, replies and follow-up
   automated until the homeowner books or calls Chris). Writes crm_kv 'automation.enabled' for the signed-in user's
   company; RLS (010_automation.sql) lets only owners/admins write it, so members see the state but no switch.
   The engine (supabase/functions/roof-engine) reads this key before every send. Default off. Signed out = hidden. */
(function () {
  'use strict';
  const slot = document.getElementById('autoSlot'); if (!slot) return;
  const URL_ = 'https://preview.invalid';
  const KEY = 'preview-no-key';
  const sess = () => { try { const v = JSON.parse(localStorage.getItem('rc.session') || 'null'); return v && v.access_token && (!v.expires_at || v.expires_at > Date.now() / 1000 + 20) ? v : null; } catch (e) { return null; } };
  const api = (path, opt) => { const s = sess(); if (!s) return Promise.reject(new Error('signed out')); opt = opt || {};
    return fetch(URL_ + '/rest/v1/' + path, { method: opt.method || 'GET', headers: Object.assign({ apikey: KEY, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' }, opt.prefer ? { Prefer: opt.prefer } : {}), body: opt.body ? JSON.stringify(opt.body) : undefined, cache: 'no-store' })
      .then(r => r.text().then(t => { if (!r.ok) throw new Error('HTTP ' + r.status); return t ? JSON.parse(t) : null; })); };
  const css = document.createElement('style');
  css.textContent = '.autosw{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line,#d9dee5);border-radius:999px;padding:5px 11px 5px 8px;background:var(--card,#fff);font-family:inherit;font-size:12px;font-weight:600;line-height:1;white-space:nowrap;color:inherit;cursor:pointer}' +
    '.autosw[disabled]{cursor:default;opacity:.85}.autosw i{width:28px;height:16px;border-radius:9px;background:#c9ced6;position:relative;transition:background .15s}' +
    '.autosw i:after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;transition:left .15s}' +
    '.autosw[aria-checked="true"] i{background:var(--accent,#1f6feb)}.autosw[aria-checked="true"] i:after{left:14px}' +
    '.autoinfo{position:relative;display:inline-block}.autoinfo summary{list-style:none}.autoinfo summary::-webkit-details-marker{display:none}' +
    '.autopop{position:fixed;z-index:30;width:min(340px,80vw);background:var(--card,#fff);border:1px solid var(--line,#d9dee5);border-radius:8px;padding:10px 12px;font-family:inherit;font-size:12.5px;font-weight:400;line-height:1.45;white-space:normal;color:inherit;box-shadow:0 8px 24px rgba(11,16,32,.12)}' +
    '.autopop p{margin:0 0 6px;font-weight:600}.autopop ul{margin:0;padding:0 0 0 16px}.autopop li{margin:0 0 6px}.autopop i{display:block;font-style:normal;opacity:.75}';
  document.head.appendChild(css);
  let company = null, owner = false, on = false;
  function paint() {
    slot.innerHTML = '<button type="button" class="autosw" role="switch" aria-checked="' + on + '"' + (owner ? '' : ' disabled title="Only the company owner can change this"') +
      ' aria-label="Automation ' + (on ? 'on' : 'off') + '"><i></i>Automation: ' + (on ? 'on' : 'off') + '</button>';
    const b = slot.firstChild; if (owner) b.onclick = toggle;
  }
  function toggle() {
    const next = !on;
    if (next && !confirm('Turn automation on?\n\nTexts and emails will go out on their own (day 1 text, then emails on day 3, 7 and 30), and replies get an AI answer that points to booking or calling Chris. Sends only 9am to 8pm Central. Opt-outs and litigator flags are always honored.')) return;
    api('crm_kv?on_conflict=company_id,key', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: [{ company_id: company, key: 'automation.enabled', value: next }] })
      .then(() => { on = next; paint(); }).catch(e => alert('Could not change automation: ' + e.message));
  }
  // signed out (or no company yet): an honest "not connected" state that says what gets connected at onboarding
  // (lib/rc-state.js RC.CONNECT), never a switch that pretends to work
  function notConnected() {
    if (slot.querySelector('.autoinfo')) return;   // keep an open panel open across the 60 s refresh
    const C = (window.RC && RC.CONNECT) || {}, rows = Object.keys(C).map(k => '<li><b>' + k.charAt(0).toUpperCase() + k.slice(1) + '.</b> ' + C[k].now + ' <i>At onboarding: ' + C[k].onboard + '.</i></li>').join('');
    slot.innerHTML = '<details class="autoinfo"><summary class="autosw" aria-label="Sending not connected, what connects at onboarding">Sending not connected</summary><div class="autopop"><p>Nothing sends on its own yet. Today:</p><ul>' + rows + '</ul></div></details>';
    // the inbox pane clips overflow, so the panel is fixed and placed under the button when it opens
    const d = slot.querySelector('.autoinfo'), pop = d.querySelector('.autopop');
    d.addEventListener('toggle', () => { if (!d.open) return; const r = d.querySelector('summary').getBoundingClientRect();
      pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pop.offsetWidth - 8)) + 'px'; pop.style.top = (r.bottom + 6) + 'px'; });
  }
  function load() {
    if (!sess()) { notConnected(); return; }
    const want = window.RC && RC.rooferKey ? RC.rooferKey() : 'jackson';
    api('companies?select=id,slug').then(rows => {
      const c = (rows || []).find(r => r.slug === want) || (rows || [])[0]; if (!c) return notConnected();
      company = c.id;
      return Promise.all([api('memberships?select=role&company_id=eq.' + company), api('crm_kv?select=value&company_id=eq.' + company + '&key=eq.automation.enabled')]).then(([m, kv]) => {
        owner = (m || []).some(x => x.role === 'owner' || x.role === 'admin'); on = !!(kv && kv[0] && kv[0].value === true); paint();
      });
    }).catch(() => notConnected());
  }
  load(); setInterval(() => { if (document.visibilityState !== 'hidden') load(); }, 60000);
})();
