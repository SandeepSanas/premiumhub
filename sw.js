/* PremiumHub service worker — keeps the app itself openable without a signal.
   Data is handled by Firestore's own offline cache, not here. */
const SHELL = 'premiumhub-shell-v1';
const FILES = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
// the Firebase library itself, so a signed-in session still opens with no signal
const V = '12.9.0';
const LIB = ['app', 'auth', 'firestore'].map(n => `https://www.gstatic.com/firebasejs/${V}/firebase-${n}.js`);

self.addEventListener('install', e => {
  // cached one by one, so one missing file cannot stop the rest
  e.waitUntil(caches.open(SHELL)
    .then(c => Promise.allSettled([...FILES, ...LIB].map(f => c.add(f))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                    // never touch writes
  const url = new URL(req.url);
  // the Firebase library: cached copy first, refreshed quietly in the background
  if (url.href.includes('gstatic.com/firebasejs')) {
    e.respondWith(caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)).catch(() => {}); }
        return res;
      }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  // live data and sign-in must always go to the network
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('firebase') ||
      url.hostname.includes('google.com') || url.hostname.includes('gstatic.com')) return;

  // the page itself: fresh copy when online, cached copy when not
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(SHELL).then(c => c.put('./index.html', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // icons and the manifest: cached copy first, refreshed in the background
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(SHELL).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }))
    );
  }
});

// lets a new version take over as soon as it is installed
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
