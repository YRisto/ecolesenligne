// Le Général déchu : réseau d'abord, copie locale en secours (jeu jouable hors ligne après une première visite).
const C='general-dechu-v34';
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n.startsWith('general-dechu-')&&n!==C).map(n=>caches.delete(n)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin||!u.pathname.toLowerCase().startsWith('/landoflord'))return;
 if(e.request.headers.has('range'))return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok&&r.status===200){const c=r.clone();caches.open(C).then(x=>x.put(e.request,c));}return r;}).catch(()=>caches.match(e.request)));});
