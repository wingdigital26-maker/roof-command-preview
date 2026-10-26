/* cardphoto.js: the Today card's house band shows the real roof from above (Jack 10-26: "I don't think the 3D model is that
   accurate"), the same sharp imagery as the record (lib/rc-imagery.js: Esri live, NAIP fallback, credit line shown). The 3D
   model is one tap away ("Photo | 3D"), remembered on this device (localStorage rc-cardview). The photo is centred on the
   home's recorded position; no outline is drawn on it here (the record has the measured edges). */
(function () {
  'use strict';
  if (!window.RCIMG) return;
  const KEY = 'rc-cardview';
  let view = (() => { try { return localStorage.getItem(KEY) === '3d' ? '3d' : 'photo'; } catch (e) { return 'photo'; } })();
  const css = document.createElement('style');
  css.textContent = `
.ph .phot{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;z-index:1;pointer-events:none;background:#D9DEE6}
.ph .phcred{position:absolute;right:10px;bottom:6px;z-index:3;max-width:60%;font-size:9.5px;line-height:1.25;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.85);text-align:right;pointer-events:none}
.ph .phseg{position:absolute;left:14px;top:14px;z-index:4;display:inline-flex;gap:2px;padding:2px;border-radius:6px;background:rgba(255,255,255,.94);box-shadow:0 1px 3px rgba(11,16,32,.2)}
.ph .phseg button{font:inherit;font-size:12.5px;font-weight:600;border:0;border-radius:4px;min-height:28px;padding:0 10px;background:none;color:#465065;cursor:pointer}
.ph .phseg button[aria-pressed="true"]{background:#0B1020;color:#fff}
html.cardphoto .ph .rlink svg,html.cardphoto .ph .rlink canvas,html.cardphoto .ph .rlink::before,html.cardphoto .ph .rlink::after{visibility:hidden}
html:not(.cardphoto) .ph .phot,html:not(.cardphoto) .ph .phcred{display:none}
html.cardphoto .ph .rlink{z-index:2}
@media (max-width:640px){ .ph .phseg{top:auto;bottom:12px;left:12px} .ph .phseg button{min-height:40px;padding:0 12px;font-size:13px} .ph .phcred{bottom:4px;right:8px;max-width:55%;font-size:8.5px} }`;
  document.head.appendChild(css);

  const homeOf = id => { try { return (typeof HOMES !== 'undefined' ? HOMES : []).find(h => h.id === id) || null; } catch (e) { return null; } };
  function dress(card) {
    const ph = card.querySelector('.ph'); if (!ph || ph.querySelector('.phseg')) return;
    const h = homeOf(card.dataset.id); if (!h || !h.loc) return;
    const r = ph.getBoundingClientRect(), w = Math.max(240, r.width || 480), hh = Math.max(120, r.height || 240);
    const hy = 24, hx = hy * w / hh;   // about 48 m of ground top to bottom: the whole house and its yard
    const p = RCIMG.photo(h.loc[0], h.loc[1], hx, hy);
    const img = document.createElement('img'); img.className = 'phot'; img.alt = 'The roof from above'; img.decoding = 'async'; img.loading = 'lazy';
    img.src = p.src; if (p.fallback) img.onerror = () => { img.onerror = null; img.src = p.fallback; cr.textContent = RCIMG.NAIP_CREDIT; };
    const cr = document.createElement('span'); cr.className = 'phcred'; cr.textContent = p.credit;
    const seg = document.createElement('div'); seg.className = 'phseg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Roof picture');
    seg.innerHTML = '<button type="button" data-cv="photo">Photo</button><button type="button" data-cv="3d">3D</button>';
    ph.prepend(img); ph.append(cr, seg); mark();
  }
  function mark() {
    document.documentElement.classList.toggle('cardphoto', view === 'photo');
    document.querySelectorAll('.ph .phseg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cv === view)));
  }
  document.addEventListener('click', e => { const b = e.target.closest('.ph .phseg [data-cv]'); if (!b) return; e.preventDefault(); e.stopPropagation();
    view = b.dataset.cv; try { localStorage.setItem(KEY, view); } catch (er) { } mark(); if (view === '3d') dispatchEvent(new Event('resize')); }, true);
  let t = null;
  const run = () => { t = null; document.querySelectorAll('#deck .card[data-id]').forEach(c => { if (+c.dataset.d <= 2 || c.dataset.d == null) dress(c); }); };
  const deck = document.getElementById('deck');
  if (deck) new MutationObserver(() => { if (!t) t = setTimeout(run, 120); }).observe(deck, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-d'] });
  mark(); run();
})();
