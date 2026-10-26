/* rc-imagery.js (window.RCIMG): ONE imagery adapter for every aerial in the app (Jack 10-26: "the aerial is pixelated").
   - Esri World Imagery: about 0.3 m in DFW (Vantor / Maxar WorldView-3, Allen captured 2025-10-08). Shown LIVE only:
     never stored, cached to disk or bulk downloaded (tour/sw.js does not cache this host), always with Esri's credit line.
   - USDA NAIP via USGS The National Map: public domain, about 0.6 m. The fallback when Esri is off or fails to load.
   Key: an ArcGIS Location Platform API key is optional and NEVER in public code. It is read at runtime from ?esrikey=,
   localStorage rc-esri-key or window.RC_MAP_KEYS.esri (a local config file). With a key, requests are authenticated.
   KEYLESS: the local build shows Esri without a key for evaluation. docs/business/DATA-LICENSES.md (Esri E300 clause 89)
   says a resold app needs Esri authentication, so scripts/publish/build_preview.py sets KEYLESS = false for the public
   build: there, with no key, every aerial is NAIP. */
(function () {
  'use strict';
  if (window.RCIMG) return;
  const KEYLESS = false;   // build_preview.py: false in the public build
  const Q = (() => { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(''); } })();
  const key = () => Q.get('esrikey') || (() => { try { return localStorage.getItem('rc-esri-key'); } catch (e) { return null; } })() || (window.RC_MAP_KEYS && window.RC_MAP_KEYS.esri) || '';
  const esriOn = () => !!key() || KEYLESS;
  const ESRI_CREDIT = 'Imagery: Esri, Vantor (Maxar), Earthstar Geographics, and the GIS User Community';
  const NAIP_CREDIT = 'Imagery: USDA NAIP via USGS The National Map (public domain)';
  const ESRI_M = 0.3, NAIP_M = 0.6;   // native metres per pixel
  /* the box is asked for in Web Mercator (EPSG:3857), where a square on the ground is a square in the request. In plain
     lat / long the box is taller in degrees than wide, and Esri's MapServer export silently widens it to fit the square image
     (10-26: 19% more north-south ground at Allen), so the photo came back squashed under the roof outline. */
  function bbox(lon, lat, hx, hy) {
    const R = 6378137, x = lon * Math.PI / 180 * R, y = R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)), k = 1 / Math.cos(lat * Math.PI / 180);
    hy = hy == null ? hx : hy;
    return [x - hx * k, y - hy * k, x + hx * k, y + hy * k].map(v => v.toFixed(2)).join(',');
  }
  // pixels to ask for: the source's native detail, twice over for sharp screens, never more (more = the server upsampling
  // into blur); a wide box keeps its shape (the longer side is capped at 1600)
  function sizeFor(hx, hy, mpp) {
    hy = hy == null ? hx : hy;
    let px = Math.round(2 * hx / mpp * 2), py = Math.round(2 * hy / mpp * 2); const c = 1600 / Math.max(px, py, 1600);
    px = Math.max(128, Math.round(px * c)); py = Math.max(128, Math.round(py * c));
    return px + ',' + py;
  }
  function naip(lon, lat, hx, px, hy) {
    return 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage?bbox=' + bbox(lon, lat, hx, hy) +
      '&bboxSR=3857&imageSR=3857&size=' + (px ? px + ',' + px : sizeFor(hx, hy, NAIP_M)) + '&format=jpgpng&interpolation=RSP_BilinearInterpolation&f=image';
  }
  function esri(lon, lat, hx, px, hy) {
    const k = key();
    return 'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export?bbox=' + bbox(lon, lat, hx, hy) +
      '&bboxSR=3857&imageSR=3857&size=' + (px ? px + ',' + px : sizeFor(hx, hy, ESRI_M)) + '&format=jpg&f=image' + (k ? '&token=' + encodeURIComponent(k) : '');
  }
  /* one photo around a point, hx metres each side east-west and hy north-south (hy defaults to hx: a square):
     { src, fallback, credit, source } (fallback = NAIP, or '' when NAIP is already the src) */
  function photo(lon, lat, hx, hy) {
    return esriOn() ? { src: esri(lon, lat, hx, 0, hy), fallback: naip(lon, lat, hx, 0, hy), credit: ESRI_CREDIT, source: 'esri' }
      : { src: naip(lon, lat, hx, 0, hy), fallback: '', credit: NAIP_CREDIT, source: 'naip' };
  }
  /* an SVG <image> over the full W x H box (H defaults to W) that swaps to NAIP if Esri fails (the credit line swaps too) */
  function svgImage(lon, lat, hx, W, H, hy) {
    H = H || W; const p = photo(lon, lat, hx, hy);
    const swap = p.fallback ? ` onerror="this.onerror=null;this.setAttribute('href','${p.fallback}');var c=this.ownerSVGElement&&this.ownerSVGElement.parentNode&&this.ownerSVGElement.parentNode.querySelector('.img-credit');if(c)c.textContent='${NAIP_CREDIT}'"` : '';
    return `<image href="${p.src}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"${swap}/>`;
  }
  /* MapLibre raster tiles for a satellite basemap */
  function tiles() {
    const k = key();
    if (esriOn()) return { source: 'esri', credit: ESRI_CREDIT, maxzoom: 19,
      tiles: [(k ? 'https://ibasemaps-api.arcgis.com' : 'https://services.arcgisonline.com') + '/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' + (k ? '?token=' + encodeURIComponent(k) : '')] };
    return { source: 'naip', credit: NAIP_CREDIT, maxzoom: 16, tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'] };
  }
  window.RCIMG = { photo, svgImage, tiles, naip, esri, esriOn, hasKey: () => !!key(), credit: () => esriOn() ? ESRI_CREDIT : NAIP_CREDIT, ESRI_CREDIT, NAIP_CREDIT };
})();
