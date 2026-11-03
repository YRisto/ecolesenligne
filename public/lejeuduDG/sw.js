// Service worker du Jeu du DG : réseau d'abord (toujours la dernière version), cache en secours hors connexion
const CACHE = 'jeudg-v4';
const CORE = ['/lejeuduDG', '/lejeuduDG/manifest.webmanifest', '/lejeuduDG/icon-192.png', '/lejeuduDG/icon-512.png', '/lejeuduDG/icon-180.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.origin !== location.origin || !u.pathname.startsWith('/lejeuduDG')) return;
  if (u.pathname.endsWith('/version.json')) return; // vérification de mise à jour : jamais de cache
  if (u.pathname.endsWith('.mp3')) return; // musique : le navigateur gère le streaming (requêtes partielles) et son propre cache
  const nav = r.mode === 'navigate';
  if (!nav && u.search) return; // requêtes avec paramètres : réseau seulement, rien en cache
  const key = nav ? '/lejeuduDG' : u.pathname;
  const net = new Promise((ok, ko) => { const t = setTimeout(() => ko(new Error('timeout')), 5000); fetch(r).then(res => { clearTimeout(t); ok(res); }, err => { clearTimeout(t); ko(err); }); });
  e.respondWith(net.then(res => { if (res.ok) { const cp = res.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(key, cp))); } return res; })
    .catch(() => caches.match(key).then(m => m || caches.match('/lejeuduDG')).then(m => m || fetch(r))));
});
