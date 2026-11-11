// Offline support: the whole app, piano included (~3 MB), is stored on the phone (the chord synth's sounds once used).
// - App files (page, code, icons): fetched fresh when online (so an update or fix shows up the next
//   time you open it), falling back to the stored copy when offline or the network is slow.
// - Piano samples: always from the stored copy (they never change).
// - Chord synth sounds (synth/app/samples, 14 MB): saved the first time the synth loads them, then always
//   from the stored copy, kept across releases in their own store. When they change, give SYNTH_CACHE a
//   new name (tools/sync-synth.mjs prints the fingerprint to use).
// Each release gets a new VERSION; the old stored copy is removed once the new one is in place.
const VERSION = 'pitch-piano-1.10.0';
const SYNTH_CACHE = 'pitch-piano-synth-b090f0a11fd2';
const CORE = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/app.js', 'js/pitch.js', 'js/notes.js', 'js/graph.js', 'js/keyboard.js', 'js/piano-audio.js',
  'js/notation.js', 'js/glyphs.js', 'js/staff.js', 'js/melody.js', 'js/analysis.js', 'js/practice.js',
  'js/drone.js', 'js/recorder.js', 'js/rec-worklet.js', 'js/theory.js',
  'js/rhythm-core.js', 'js/rhythm-view.js', 'js/rhythm.js', 'js/partsing.js', 'js/score-view.js', 'data/chorales.json', 'js/warmup.js', 'js/early.js', 'js/feedback.js', 'js/tips.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/icon-v2-180.png', 'icons/icon-v2-192.png', 'icons/icon-v2-512.png',
  'icons/icon-v3-180.png', 'icons/icon-v3-192.png', 'icons/icon-v3-512.png',
  'samples/index.json',
  'synth/index.html', 'synth/app/hichord.js', 'synth/app/samples/manifest.js',
];
const NETWORK_WAIT_MS = 2500;

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
    for (const k of await caches.keys()) if (k !== VERSION && k !== SYNTH_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const stored = (req) => caches.match(req, { ignoreSearch: true });

async function freshFirst(req) {
  const url = new URL(req.url);
  url.search = '';
  try {
    const res = await Promise.race([
      fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow network')), NETWORK_WAIT_MS)),
    ]);
    if (res.ok) {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(url.href, copy)).catch(() => {});
      return res;
    }
    return (await stored(req)) || res;
  } catch (err) {
    const hit = await stored(req);
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const page = await caches.match('index.html');
      if (page) return page;
    }
    throw err;
  }
}

async function keptSound(req) {
  const cache = await caches.open(SYNTH_CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone()).catch(() => {});
  return res;
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('.m4a')) {
    e.respondWith(stored(e.request).then((hit) => hit || fetch(e.request)));
    return;
  }
  if (url.pathname.includes('/synth/app/samples/') && !url.pathname.endsWith('/manifest.js')) {
    e.respondWith(keptSound(e.request));
    return;
  }
  e.respondWith(freshFirst(e.request));
});
