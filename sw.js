// Offline support: the whole app, piano included (~3 MB), is stored on the phone at install.
// Each release gets a new VERSION; the new copy downloads in the background and the old one is removed.
const VERSION = 'pitch-piano-1.1.1';
const CORE = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/app.js', 'js/pitch.js', 'js/notes.js', 'js/graph.js', 'js/keyboard.js', 'js/piano-audio.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'samples/index.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })));
    const index = await (await cache.match('samples/index.json')).json();
    await cache.addAll(index.map((s) => new Request(`samples/${s.key}.m4a`, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    const hit = await caches.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(e.request);
    } catch (err) {
      if (e.request.mode === 'navigate') {
        const page = await caches.match('index.html');
        if (page) return page;
      }
      throw err;
    }
  })());
});
