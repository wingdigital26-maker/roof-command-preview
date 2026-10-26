/* Roof Command tour service worker (scope: tour/).
   Second visit and every tab switch load from this cache instead of the network.
   - App shell (pages, css, js, fonts, pinned vendor libraries) is precached after the first load goes idle.
   - Pinned vendor files and fonts: cache first (their URLs carry the version, they never change).
   - Pages (HTML), scripts and styles: network first (revalidated, so an edit shows on the very next load with no
     hard refresh), the cached copy only when the network fails or takes over 4 s.
   - Home data, footprint tiles and the real house facts (lib/st-data-dfw/meta: addresses, radar hail, permits,
     LiDAR pitch): stale-while-revalidate (instant from cache, refreshed in the background).
   - A new version takes over at once (skipWaiting + clients.claim), deletes every older cache, and reloads open tabs
     that an older version was serving so nobody keeps looking at the old shell.
   - Basemap tiles, glyphs and sprites from tiles.openfreemap.org: cache first, capped.
   Only GET over http(s) is ever cached; POSTs, Range requests, tel:/sms: links and every other host pass straight through.
   To refresh everything for every visitor: bump CACHE_VERSION. To switch it off for one browser: open any tour page with ?nosw=1. */
const CACHE_VERSION = 'rc-tour-v19-jackson-coplanar-r24-d1793049315';
const SHELL = CACHE_VERSION + '-shell';
const DATA = CACHE_VERSION + '-data';
const TILES = CACHE_VERSION + '-tiles';
const TILE_HOSTS = ['tiles.openfreemap.org'];
const TILE_MAX = 3000;

const PRECACHE = [
  'product.html',
  'lib/nimbus-shell.css', 'lib/rc-physical.css', 'lib/rc-features.js', 'lib/nb-react.js', 'lib/rc-state.js', 'lib/rc-roof.js', 'lib/st-meta.js', 'lib/brand.js', 'lib/wing-mascot.js', 'lib/nimbus-shell.js', 'lib/nimbus-assistant.css', 'lib/nimbus-truck.css', 'lib/nimbus-tools.js', 'lib/nimbus-brain.js', 'lib/nimbus-assistant.js', 'lib/nimbus-truck.js', 'lib/nimbus-kb.json',
  'lib/st-fonts/montserrat-400.woff2', 'lib/st-fonts/montserrat-500.woff2', 'lib/st-fonts/montserrat-600.woff2', 'lib/st-fonts/montserrat-700.woff2', 'lib/st-fonts/ibm-plex-mono-400-latin.woff2',
  // Daily 50
  'c4-command-deck/deck.html', 'c4-command-deck/dk.css', 'c4-command-deck/features.css', 'c4-command-deck/features.js', 'c4-command-deck/dk.js', 'c4-command-deck/reach.js', 'c4-command-deck/data/routes-dfw.js',
  'c4-command-deck/fonts/montserrat-400.woff2', 'c4-command-deck/fonts/montserrat-500.woff2', 'c4-command-deck/fonts/montserrat-600.woff2', 'c4-command-deck/fonts/montserrat-700.woff2', 'c4-command-deck/fonts/ibm-plex-mono-400-latin.woff2',
  'vendor/maplibre-gl@4.7.1/maplibre-gl.js', 'vendor/maplibre-gl@4.7.1/maplibre-gl.css',
  // Storm map (the 4 MB homes file is cached the first time the Storm map opens, not here)
  '1b-storm-theater.html', 'lib/st-common.css', 'lib/st-homes.js', 'lib/st-storm.js', 'lib/st-map.js', 'lib/st-replay.js', 'lib/st-data-dfw/catalog.json',
  'vendor/deck.gl@9.0.38/dist.min.js',
  // Home
  'c5-home/index.html', 'c5-home/home.css', 'c5-home/features.css', 'c5-home/features.js', 'c5-home/rec.js', 'c5-home/home.js',
  'c5-home/proposal.html', 'c5-home/proposal.js', 'c5-home/proposal.css', 'lib/rc-proposal.js',
  'js/roofplan.js', 'lib/real-roof.js', 'c4-command-deck/data/roofs-dfw.js',
  'c5-home/assets/fonts/montserrat-400.woff2', 'c5-home/assets/fonts/montserrat-500.woff2', 'c5-home/assets/fonts/montserrat-600.woff2', 'c5-home/assets/fonts/montserrat-700.woff2', 'c5-home/assets/fonts/ibm-plex-mono-400-latin.woff2',
  'vendor/three@0.170.0/build/three.module.min.js',
  'vendor/three@0.170.0/examples/jsm/controls/OrbitControls.js',
  'vendor/three@0.170.0/examples/jsm/environments/RoomEnvironment.js',
  // Ask Nimbus
  'c2-nimbus/index.html', 'c2-nimbus/streets-real-dfw.json',
  'c2-nimbus/fonts/montserrat-400.woff2', 'c2-nimbus/fonts/montserrat-500.woff2', 'c2-nimbus/fonts/montserrat-600.woff2', 'c2-nimbus/fonts/montserrat-700.woff2', 'c2-nimbus/fonts/ibm-plex-mono-400-latin.woff2'
];

// install takes no time (nothing to wait for), so a new version replaces an old one on the very next load
self.addEventListener('install', () => self.skipWaiting());

function precache() {
  // one file failing (renamed, mid-edit) must never stop the rest
  return caches.open(SHELL).then(c => Promise.allSettled(PRECACHE.map(u =>
    fetch(new Request(u, { cache: 'no-cache' })).then(r => { if (r.ok) return c.put(u, r); }))));
}
self.addEventListener('activate', e => {
  const ready = caches.keys().then(keys => {
    const old = keys.filter(k => !k.startsWith(CACHE_VERSION + '-'));
    return Promise.all(old.map(k => caches.delete(k))).then(() => self.clients.claim()).then(() => old.length);
  });
  e.waitUntil(ready);
  // after activation (never inside it: a reload waits for this worker to be active): an older worker was serving
  // these tabs its cached shell, so load them again from this version; then warm the cache in the background
  ready.then(hadOld => setTimeout(() => {
    (hadOld ? self.clients.matchAll({ type: 'window' }) : Promise.resolve([]))
      .then(cs => cs.forEach(c => { if (c.frameType === 'top-level' && c.navigate) c.navigate(c.url).catch(() => {}); }));
    precache();
  }, 0));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

const scopePath = new URL(self.registration.scope).pathname;

function put(cacheName, req, res) {
  if (!res || res.status !== 200 || (res.type !== 'basic' && res.type !== 'cors')) return;
  const copy = res.clone();
  caches.open(cacheName).then(c => c.put(req, copy)).catch(() => {});
}
function cacheFirst(cacheName, req, opts) {
  return caches.open(cacheName).then(c => c.match(req, opts)).then(hit => hit || fetch(req).then(res => { put(cacheName, req, res); return res; }));
}
function staleWhileRevalidate(cacheName, req, e, opts) {
  return caches.match(req, opts).then(hit => {
    const net = fetch(req).then(res => { put(cacheName, req, res); return res; });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  });
}
function networkFirst(cacheName, req, key, opts) {
  const net = fetch(req, { cache: 'no-cache' }).then(res => { put(cacheName, key, res); return res; });
  const slow = new Promise(r => setTimeout(r, 4000)).then(() => caches.match(key, opts)).then(hit => hit || net);
  return Promise.race([net, slow]).catch(() => caches.match(key, opts).then(hit => hit || Promise.reject(new Error('offline'))));
}
let tilePuts = 0;
function trimTiles() {
  caches.open(TILES).then(c => c.keys().then(keys => { const extra = keys.length - TILE_MAX; for (let i = 0; i < extra; i++) c.delete(keys[i]); })).catch(() => {});
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  // owner names are never cached by this worker: the signed-in Storage read and the local private/ files pass straight through
  if (url.pathname.includes('/storage/v1/object/authenticated/') || /\/private\//.test(url.pathname) || req.headers.has('authorization')) return;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  if (TILE_HOSTS.includes(url.hostname)) {
    // the style document can change; tiles, glyphs and sprites are stable
    if (url.pathname.startsWith('/styles/')) { e.respondWith(staleWhileRevalidate(TILES, req, e)); return; }
    e.respondWith(cacheFirst(TILES, req).then(res => { if (++tilePuts % 200 === 0) trimTiles(); return res; }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // the tour also pulls the app's roof solver from outside tour/ (../js/roofplan.js): same origin, so it is cached too
  const path = url.pathname.startsWith(scopePath) ? url.pathname.slice(scopePath.length) : url.pathname;
  if (/(^|\/)(audit\/|_)|\.py$/.test(path) || url.searchParams.get('nosw') === '1') return;

  if (path.startsWith('vendor/') || /\.(woff2?|ttf)$/.test(path)) { e.respondWith(cacheFirst(SHELL, req, { ignoreSearch: true })); return; }
  if (path.startsWith('lib/st-data-dfw/')) { e.respondWith(staleWhileRevalidate(DATA, req, e)); return; }
  // pages carry their screen params in the query (deck.html?n=3, index.html?home=x): one cached copy per page
  const page = req.mode === 'navigate' || /\.html$/.test(path);
  if (page || /\.(js|css)$/.test(path)) {
    e.respondWith(networkFirst(SHELL, req, page ? new Request(url.origin + url.pathname) : req, page ? { ignoreSearch: true } : undefined)
      .catch(() => fetch(req)));
    return;
  }
  e.respondWith(staleWhileRevalidate(SHELL, req, e).catch(() => fetch(req)));
});
