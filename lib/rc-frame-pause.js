/* rc-frame-pause.js: a screen the shell has parked stops drawing (perf 10-15).
   The shell (product.html) keeps one frame per screen alive and posts {type:'visibility', hidden} when a screen is
   parked or shown. A parked frame is display:none, but Chrome still runs requestAnimationFrame in a same-origin
   display:none frame: the CRM's three.js roof, Today's and Storms' deck.gl loops kept drawing at 55 to 60 fps behind
   whatever screen was up. This holds every animation-frame callback while the frame is hidden and hands them back on
   the first frame after it is shown, so three.js, MapLibre, deck.gl and every page loop pause and resume exactly where
   they were (state, camera and data untouched). Repeating timers (setInterval: clocks, countdowns, the due-text check,
   the automation poll) skip their ticks while hidden and each one that missed a tick runs once when the frame is shown,
   so a returning screen is current at once. One-shot timers and data loads keep running. Load it first in <head>, before
   any library keeps its own reference to requestAnimationFrame. Outside a frame (a page opened on its own) it does nothing. */
(function () {
  'use strict';
  if (window.__rcPause || window.top === window) return;
  var raf = window.requestAnimationFrame.bind(window), caf = window.cancelAnimationFrame.bind(window);
  var hidden = false, seq = 0, held = new Map(), alias = new Map();
  window.requestAnimationFrame = function (cb) {
    if (!hidden) return raf(cb);
    var id = -(++seq); held.set(id, cb); return id;
  };
  window.cancelAnimationFrame = function (id) {
    if (id < 0) { held.delete(id); if (alias.has(id)) { caf(alias.get(id)); alias.delete(id); } return; }
    caf(id);
  };
  var si = window.setInterval.bind(window), ci = window.clearInterval.bind(window), ct = window.clearTimeout.bind(window), missed = new Map();
  window.setInterval = function (fn, ms) {
    if (typeof fn !== 'function') return si.apply(window, arguments);
    var args = Array.prototype.slice.call(arguments, 2), run = function () { fn.apply(window, args); }, id;
    id = si(function () { if (hidden) { missed.set(id, run); return; } run(); }, ms);
    return id;
  };
  window.clearInterval = function (id) { missed.delete(id); ci(id); };
  window.clearTimeout = function (id) { missed.delete(id); ct(id); };
  function resume() {
    if (!hidden) return; hidden = false;
    var list = Array.from(held.entries()); held.clear();
    list.forEach(function (e) { var id = e[0], cb = e[1]; alias.set(id, raf(function (t) { alias.delete(id); cb(t); })); });
    var due = Array.from(missed.values()); missed.clear();
    if (due.length) setTimeout(function () { due.forEach(function (run) { try { run(); } catch (err) { setTimeout(function () { throw err; }); } }); }, 0);
  }
  window.__rcPause = { hidden: function () { return hidden; }, held: function () { return held.size; }, missed: function () { return missed.size; } };
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin) return;
    var d = e.data || {};
    if (d.type !== 'visibility') return;
    if (d.hidden) hidden = true; else resume();
  });
})();
