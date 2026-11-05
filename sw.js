/* TerraIncognita Service Worker: App offline, Kartenteile im Cache */
const APP='ti-app-v2';
const TILES='ti-tiles-v1';
const SHELL=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js'];
const MAX_TILES=6000;

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(APP).then(c=>Promise.all(SHELL.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==APP&&k!==TILES).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

async function trimTiles(){
  const c=await caches.open(TILES);const ks=await c.keys();
  if(ks.length>MAX_TILES){for(const k of ks.slice(0,ks.length-MAX_TILES))await c.delete(k);}
}

self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);

  // Kartenteile: erst Cache, sonst Netz und merken
  if(url.hostname.endsWith('basemaps.cartocdn.com')){
    e.respondWith(caches.open(TILES).then(async c=>{
      const hit=await c.match(req.url);if(hit)return hit;
      try{const r=await fetch(req.url,{mode:'no-cors'});c.put(req.url,r.clone());if(Math.random()<0.02)trimTiles();return r;}
      catch(err){return new Response('',{status:504});}
    }));
    return;
  }
  // Seite selbst: Netz zuerst, offline aus dem Cache
  if(req.mode==='navigate'){
    e.respondWith(fetch(req).then(r=>{const cp=r.clone();caches.open(APP).then(c=>c.put('index.html',cp));return r;})
      .catch(()=>caches.match('index.html').then(r=>r||caches.match('./'))));
    return;
  }
  // Bibliotheken, Schriften, eigene Dateien: Cache, im Hintergrund auffrischen
  if(url.origin===location.origin||url.hostname==='cdnjs.cloudflare.com'||url.hostname.endsWith('fonts.googleapis.com')||url.hostname.endsWith('fonts.gstatic.com')){
    e.respondWith(caches.open(APP).then(async c=>{
      const hit=await c.match(req);
      const net=fetch(req).then(r=>{if(r&&(r.ok||r.type==='opaque'))c.put(req,r.clone());return r;}).catch(()=>hit);
      return hit||net;
    }));
  }
  // Alles andere (OpenStreetMap-Dienste, Routing, Wetter) geht direkt ans Netz.
});

self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window'}).then(ws=>{for(const w of ws){if('focus' in w)return w.focus();}return self.clients.openWindow('./');}));
});
