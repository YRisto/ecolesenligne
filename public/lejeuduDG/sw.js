// Service worker du Jeu du DG : réseau d'abord (toujours la dernière version), cache en secours hors connexion
const CACHE = 'jeudg-v1';
const CORE = ['/lejeuduDG', '/lejeuduDG/manifest.webmanifest', '/lejeuduDG/icon-192.png', '/lejeuduDG/icon-512.png', '/lejeuduDG/icon-180.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.origin !== location.origin || !u.pathname.toLowerCase().startsWith('/lejeududg')) return;
  const key = r.mode === 'navigate' ? '/lejeuduDG' : r;
  e.respondWith(fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(key, cp)); } return res; }).catch(() => caches.match(key).then(m => m || caches.match('/lejeuduDG'))));
});
