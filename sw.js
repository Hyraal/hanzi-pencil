const CACHE = 'hanzi-v3';
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'lib/hanzi-writer.min.js',
  'data/chars.json', 'data/strokes.json', 'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
// dati e libreria: dalla cache; interfaccia (html/js/css): prima la rete, così gli aggiornamenti arrivano subito
const STATIC = /\/(data|lib)\/|\.png$/;
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== 'hanzi-fonts').map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com') {
    // font: cache al primo uso, così il quaderno resta uguale anche offline
    e.respondWith(caches.open('hanzi-fonts').then(c => c.match(e.request).then(r => r || fetch(e.request).then(res => { c.put(e.request, res.clone()); return res; }))));
    return;
  }
  if (STATIC.test(url.pathname)) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
  } else {
    e.respondWith(fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});
