// Shared brand helpers for the concept frames.
// Wing mark path = the analytic master from creative-tools/wing-logo-3d (same path as the sculpture poster).
window.WING_MARK = (fill) => `<svg viewBox="0 0 63 66" xmlns="http://www.w3.org/2000/svg"><path fill="${fill||'currentColor'}" d="M 0 3 Q 0 0 3 0 L 27 0 Q 30.5 0 30.5 3.5 L 30.5 28.5 Q 30.5 33.5 35.5 33.5 L 60 33.5 Q 63 33.5 63 36.5 L 63 63 Q 63 66 60 66 L 36 66 Q 32.5 66 32.5 62.5 L 32.5 37.5 Q 32.5 32.5 27.5 32.5 L 3 32.5 Q 0 32.5 0 29.5 Z"/></svg>`;
// tour/ root, from this file's own URL, so roofer logo files resolve from any page depth
const BRAND_BASE = (function(){ const s = document.currentScript && document.currentScript.src; return s ? s.replace(/lib\/brand\.js.*$/, '') : ''; })();
/* The roofer registry. This build is Jackson Roofing's own app (Plano, TX): Jackson is the only roofer.
   ?roofer=<key> still picks a key (rc-state keeps it), but any key not listed here falls back to jackson.
   Fields every screen reads: name, area (header line), region (opening hero line), owner (first name), state,
   areaCode (sample phones), licence (licence number; null = no licence line at all), city/zip (home city),
   cities (preferred city order for the header line), accent/soft/ink (white on accent >= 4.5:1), logo (HTML),
   wide + markBg (a wordmark logo on its own plate), center (the map's home camera).
   storm: blank strings mean "use the storm of the data on screen" (rc-state facts). */
window.ROOFERS = {
  // Jackson Roofing, Wing Digital client, based in Plano. Logo = the live site's own file (jacksonroofingco.com logo1.webp, black plate).
  // Colours from the logo cyan #1BC0FF and the rebuilt site's --blue-ink: white on #0D6C99 is 5.8:1, ink on soft 7.4:1.
  // Texas has no state roofing licence, so licence is null and no licence line shows anywhere.
  // Texas calling hours (Tex. Bus. & Com. Code 301.051): 9 am to 8 pm Mon to Sat, noon to 8 pm Sunday.
  // storm stays blank here: the DFW data build (tour/lib/st-data-dfw/) supplies the storm, never this registry.
  // area/region are the fallback; once the catalog lands they are rebuilt from its cities (rooferArea), Plano first.
  jackson: { dataRoot:'lib/st-data-dfw/', name:"Jackson Roofing", area:"Plano, Frisco, Allen, McKinney, Richardson and Rockwall", region:"Plano, Frisco, Allen, McKinney, Richardson and Rockwall, TX", owner:"Chris", state:"TX", callWindow:{monSat:[9,20],sun:[12,20]}, tz:"America/Chicago", areaCode:"972", licence:null, city:"Plano", zip:"",
    cities:["Plano","Frisco","Allen","McKinney","Richardson","Rockwall"],
    // hq: where outreach starts on the Today map. Street address not on file yet, so central Plano, flagged approx.
    hq:{name:"Jackson Roofing, Plano", loc:[-96.75,33.02], approx:true},
    storm:{d:"",n:"",max:""}, shift:[0,0], center:[-96.75,33.02], accent:"#0D6C99", soft:"#E3F6FE", ink:"#07547A", accentHi:"#1388BF",
    wide:true, markBg:"#000000",
    logo:`<img src="${BRAND_BASE}img/roofers/jackson/logo.webp" alt="Jackson Roofing" width="500" height="218" draggable="false">` }
};
const ROOFER_DEFAULT = 'jackson';
// the active roofer's key (rc-state keeps it; ?roofer= sets it), always one that exists here
window.rooferKey = () => { const k = window.RC && RC.rooferKey ? RC.rooferKey() : ROOFER_DEFAULT; return ROOFERS[k] ? k : ROOFER_DEFAULT; };
window.activeRoofer = () => ROOFERS[rooferKey()];
if (window.RC && RC.__fixRoofer) RC.__fixRoofer(rooferKey());
// the active roofer's data folder as an absolute URL (every data reader uses this)
window.rooferDataRoot = () => BRAND_BASE + activeRoofer().dataRoot;
if (window.RC && RC.__dataRoot) RC.__dataRoot(rooferDataRoot(), true);
// the roofer's cities from the data (catalog regions' by_city): home city first (Plano), then the registry's order,
// then any city the data adds, A to Z. No catalog yet = the registry's list.
window.rooferCities = (cat) => {
  const r = activeRoofer(), pref = r.cities || [];
  const have = cat && cat.regions ? [...new Set(cat.regions.flatMap(g => Object.keys(g.by_city || {})))] : [];
  if (!have.length) return pref.slice();
  const rank = c => c === r.city ? -1 : (pref.indexOf(c) >= 0 ? pref.indexOf(c) : 999);
  return have.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
};
window.cityLine = list => list.length < 2 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
window.rooferArea = cat => cityLine(rooferCities(cat)) || activeRoofer().area;
// once the catalog lands, the header line and the opening line name the data's own cities
if (window.RC && RC.factsReady) RC.factsReady.then(() => { if (!RC.catalog) return; const r = activeRoofer(), a = rooferArea(RC.catalog); if (!a) return;
  r.area = a; r.region = a + ', ' + r.state;
  document.querySelectorAll('[data-r="area"],[data-r="region"]').forEach(n => { n.textContent = r[n.dataset.r]; });
  try { window.dispatchEvent(new Event('rc-area')); } catch (e) { } });
// a wordmark logo sits on its own plate and takes the width it needs; square marks keep the page's tile
(function(){ const st = document.createElement('style'); st.textContent =
  '.rc-wide{width:auto!important;aspect-ratio:auto!important;padding:0 7px!important;display:flex!important;align-items:center;justify-content:center;border-radius:9px!important;box-shadow:none!important}' +
  '.rc-wide img{height:76%;width:auto;display:block}';
  (document.head || document.documentElement).appendChild(st); })();
window.rooferMark = (el, r) => {
  if (!el || !r) return; el.innerHTML = r.logo;
  el.classList.toggle('rc-wide', !!r.wide);
  el.style.background = r.markBg || '';
};
window.applyRoofer = (key, root) => {
  const r = ROOFERS[key] || ROOFERS[ROOFER_DEFAULT]; const el = root || document.documentElement;
  el.style.setProperty('--accent', r.accent); el.style.setProperty('--accent-soft', r.soft); el.style.setProperty('--accent-ink', r.ink);
  el.style.setProperty('--roofer', r.accent);
  (root||document).querySelectorAll('[data-r]').forEach(n => { const k=n.dataset.r; if(k==='logo') rooferMark(n, r); else n.textContent = r[k] == null ? '' : r[k]; });
  (root||document).querySelectorAll('[data-wing]').forEach(n => { n.innerHTML = WING_MARK(n.dataset.wing||'currentColor'); });
  return r;
};
