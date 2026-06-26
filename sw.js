/* Service worker de la PWA Cobertura (Factiun).
   HTML → NETWORK-FIRST (siempre la última versión cuando hay red; cae a caché sin conexión).
   Resto de assets propios → stale-while-revalidate (rápido + se actualizan en segundo plano).
   Teselas (satélite/DEM, cross-origin) → directas a red (no se cachean). */
var CACHE = 'cobertura-v2';
var SHELL = [
  './', 'index.html', 'terreno.html', 'plano.html', 'crear.html', 'nuevo.html',
  'lib/three.min.js', 'lib/OrbitControls.js', 'lib/GLTFLoader.js',
  'app-icon.svg', 'favicon.svg', 'manifest.webmanifest'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { return k === CACHE ? null : caches.delete(k); }));   // borra cachés viejas (v1) → fuerza recarga limpia
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // teselas/CDN: directo a red
  var isHTML = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  if (isHTML) {   // NETWORK-FIRST: siempre la última versión cuando hay red
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); return res;
      }).catch(function () { return caches.match(req).then(function (h) { return h || caches.match('terreno.html'); }); })
    );
    return;
  }
  // resto de assets propios: stale-while-revalidate
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
