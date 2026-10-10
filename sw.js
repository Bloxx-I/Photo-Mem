const CACHE = 'photo-mem-v5';
const ASSETS = ['./', 'index.html', 'styles.css', 'content.js', 'recall.js', 'ai.js', 'app.js', 'manifest.webmanifest', 'icons/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first, fall back to cache so updates arrive but the app works offline.
// Only same-origin files: the AI model (CDN / Hugging Face) is cached by transformers.js itself.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Skip other origins (AI model, your AI server) and the serve.py proxy.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
