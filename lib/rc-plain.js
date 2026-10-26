/* rc-plain.js (window.RCPLAIN): plain words for the surface of every screen (Jack 10-26: "easy for someone who is terrible
   with technology", a roofer in his 50s on a phone). The surface says "Big roof, about 44 squares", "Steep", "1 inch hail";
   the measured numbers and their sources (LiDAR, radar, 8/12) stay one tap or hover away and on the record's Home facts. */
(function () {
  'use strict';
  if (window.RCPLAIN) return;
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : null; };
  // hail: "1 inch", "1.4 inches", "2 inches" (one decimal at most, never "1.00 in")
  function hail(v) {
    const n = num(v); if (n == null) return '';
    const r = Math.round(n * 10) / 10, s = String(r);
    return s + (r === 1 ? ' inch' : ' inches');
  }
  // roof size: squares rounded, with a size word (25+ squares is a big roof for a house)
  function size(sq) {
    const n = num(sq); if (n == null || n <= 0) return '';
    const r = Math.round(n), w = r >= 25 ? 'Big roof' : r >= 15 ? 'Medium roof' : 'Small roof';
    return w + ', about ' + r + ' squares';
  }
  // slope from a pitch like "8/12", "8/12 + 6/12" or 8: the steepest part decides
  function slope(p) {
    const all = String(p == null ? '' : p).match(/\d+(?:\.\d+)?(?=\s*\/\s*12)|^\s*\d+(?:\.\d+)?\s*$/g); if (!all) return '';
    const m = Math.max(...all.map(parseFloat)); if (!isFinite(m)) return '';
    return m >= 8 ? 'Steep' : m >= 5 ? 'Medium slope' : 'Low slope';
  }
  // a sentence: inch units spelled out, re-roof jargon in plain words
  function words(s) {
    return String(s == null ? '' : s)
      .replace(/(\d+(?:\.\d+)?) in hail/g, (m, n) => hail(n) + ' hail')
      .replace(/(\d+(?:\.\d+)?) in\+/g, (m, n) => hail(n).replace(/es$/, '').replace(/inch$/, 'inch') + '+')
      .replace(/([Nn])o re-roof permit on file/g, '$1o new roof on record')
      .replace(/no re-roof permit on file since/g, 'no new roof on record since')
      .replace(/no re-roof permit since/g, 'no new roof on record since')
      .replace(/re-roofed/g, 'got a new roof').replace(/re-roofs/g, 'new roofs').replace(/re-roof/g, 'new roof')
      .replace(/,? ?pitch est\.? \d+\/12 \(LiDAR estimate\)/g, '');
  }
  /* surface text: words() plus the measuring jargon ("radar", "LiDAR", "pitch 8/12", "1.31 in") in plain words */
  function line(s) {
    return words(s)
      .replace(/\s*\(radar\)/g, '').replace(/,? radar hail\b/g, ' hail').replace(/\bradar hail\b/g, 'hail').replace(/,\s*radar\b/g, '').replace(/ on radar\b/g, '')
      .replace(/\bLiDAR estimate\b/g, 'estimate').replace(/\bLiDAR est\./g, 'est.').replace(/\s*\(LiDAR[^)]*\)/g, '').replace(/,\s*LiDAR\b/g, '')
      .replace(/\b(\d{4}) LiDAR\b/g, '$1 aerial scans').replace(/\bLiDAR\b/g, 'aerial scan')
      .replace(/\b[Pp]itch (?:est\.? )?(\d+\/12(?:\s*\+\s*\d+\/12)*)/g, (m, p) => slope(p).toLowerCase() || m)
      .replace(/\b(\d+\.\d+) in\b(?=\s*$|\s*[,.;:)·]|\s+(?:max|largest|biggest|on|hail|here))/g, (m, n) => hail(n))
      .replace(/\bRe-roof permit\b/g, 'New roof').replace(/\bRe-roofs\b/g, 'New roofs').replace(/\bRe-roofed\b/g, 'New roof');
  }
  /* one pass over a screen's visible text (text nodes only: nothing typed, no drafts that get sent, no dialogs) and again
     whenever the screen redraws. Detail places keep their measured words: Home facts, the measurements tab, [data-plain-skip]. */
  const SKIP = 'script,style,textarea,input,select,option,code,pre,svg,dialog,[contenteditable],[data-plain-skip],#factsPanel,.facts.panel,#report,.ms,.rr,.draft,.dlg,.madlg,.nb-bubble,.wmp';
  function sweep(root) {
    root = root || document.body; if (!root) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => {
      const v = n.nodeValue; if (!v || !/LiDAR|radar|itch|re-roof|Re-roof| in\b| in\+/.test(v)) return NodeFilter.FILTER_REJECT;
      const p = n.parentElement; return p && !p.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; } });
    const todo = []; let n; while ((n = w.nextNode())) todo.push(n);
    todo.forEach(x => { const v = line(x.nodeValue); if (v !== x.nodeValue) x.nodeValue = v; });
  }
  function watch(root) {
    root = root || document.body; if (!root || !window.MutationObserver) return;
    let t = null; sweep(root);
    new MutationObserver(() => { if (!t) t = setTimeout(() => { t = null; sweep(root); }, 250); }).observe(root, { childList: true, subtree: true, characterData: true });
  }
  window.RCPLAIN = { hail, size, slope, words, line, sweep, watch };
})();
