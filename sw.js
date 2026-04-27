const CACHE = 'legado-v264';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
];

// Install
self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      return c.addAll(ASSETS.map(function(u){
        return new Request(u, {mode:'no-cors'});
      })).catch(function(){});
    })
  );
  self.skipWaiting();
});

// Activate
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE; })
            .map(function(k){ return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Fetch
self.addEventListener('fetch', function(e){
  if(e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function(cached){
      if(cached) return cached;
      return fetch(e.request).then(function(resp){
        if(resp && resp.status === 200 && resp.type === 'basic'){
          var clone = resp.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
        }
        return resp;
      }).catch(function(){
        return cached || new Response('Offline', {status:503});
      });
    })
  );
});

// Push notifications
self.addEventListener('push', function(e){
  var data = {};
  try { data = e.data.json(); } catch(err){ data = {title:'Legado', body: e.data ? e.data.text() : 'Abra o app'}; }
  e.waitUntil(
    self.registration.showNotification(data.title || '📖 Legado', {
      body:  data.body  || 'Confira seu resumo financeiro de hoje.',
      icon:  '/icon.png',
      badge: '/icon.png',
      tag:   'legado-diario',
      renotify: false,
      data:  { url: data.url || '/' }
    })
  );
});

// Notification click — abre o app
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    clients.matchAll({type:'window', includeUncontrolled:true}).then(function(cls){
      var focused = cls.find(function(c){ return c.url.includes(url) && 'focus' in c; });
      if(focused) return focused.focus();
      if(clients.openWindow) return clients.openWindow(url);
    })
  );
});
