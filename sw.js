/* Service worker de la PWA Cobertura (Factiun).
   App shell cacheada (abre offline / como app); assets propios se cachean al usarlos;
   las teselas (satélite/DEM, cross-origin) pasan directas a red (ya funciona sin ellas). */
var CACHE = 'cobertura-v1';
var SHELL = [
  './', 'index.html', 'terreno.html', 'plano.html', 'crear.html', 'nuevo.html',
  'lib/three.min.js', 'lib/OrbitControls.js', 'lib/GLTFLoader.js',
  'app-icon.svg', 'favicon.svg', 'manifest.webmanifest'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); }));   // tolera fallos sueltos
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // teselas y CDNs: directo a red (no cachear: enormes)
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });   // cachea assets propios al vuelo (layouts, networks, seguidor.js, glb…)
        }
        return res;
      }).catch(function () { return caches.match('terreno.html'); });   // sin red y sin cache → al menos el visor
    })
  );
});
