/* ════════════════════════════════════════════════════════════════════
   LEGADO — Service Worker Unificado  v4.0
   ────────────────────────────────────────────────────────────────────
   Este é o ÚNICO arquivo de Service Worker do app Legado.
   Ele substitui tanto sw.js quanto firebase-messaging-sw.js.

   DEPLOY: colocar na RAIZ do domínio (ex: https://seuapp.com/sw.js)
   Registrar no app via:
     navigator.serviceWorker.register('/sw.js')

   NUNCA registre firebase-messaging-sw.js separadamente — esse arquivo
   foi descontinuado. O FCM agora vive aqui.

   CONFIGURAÇÃO FIREBASE: preencha a seção FIREBASE_CONFIG abaixo.
   ════════════════════════════════════════════════════════════════════ */


/* ── 1. CACHE ────────────────────────────────────────────────────── */
const CACHE = 'legado-v400';
const ASSETS = [
  '/legado-app/',
  '/legado-app/index.html',
  '/legado-app/manifest.json',
  '/legado-app/icon-192.png',
  '/legado-app/icon-512.png',
  '/legado-app/icon-120.png',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
];


/* ── 2. FIREBASE — importar SDKs e inicializar ───────────────────────
   Substitua os valores abaixo pelos do seu projeto:
   Firebase Console → Configurações do projeto → Seus apps → Configuração
   ─────────────────────────────────────────────────────────────────── */
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAPOYgri0V9pitHbu9jEAu4XIaxXQ6M62A",
  authDomain: "legado-bc5fd.firebaseapp.com",
  projectId: "legado-bc5fd",
  storageBucket: "legado-bc5fd.firebasestorage.app",
  messagingSenderId: "76127624410",
  appId: "1:76127624410:web:4b39659e6d8cc5af2c59e3",
  measurementId: "G-425REDVKRP"
};
/* Inicializa apenas uma vez — evita erro "already exists" em reloads */
if (!self.LEGADO_FIREBASE_INIT) {
  firebase.initializeApp(FIREBASE_CONFIG);
  self.LEGADO_FIREBASE_INIT = true;
}

const messaging = firebase.messaging();


/* ── 3. INSTALL ──────────────────────────────────────────────────── */
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(
        ASSETS.map(function (u) { return new Request(u, { mode: 'no-cors' }); })
      ).catch(function () { /* falha de cache não bloqueia o SW */ });
    })
  );
  /* Assume controle imediatamente sem esperar recarregamento */
  self.skipWaiting();
});


/* ── 4. ACTIVATE ─────────────────────────────────────────────────── */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (k) { return k !== CACHE; })
          .map(function (k)    { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});


/* ── 5. FETCH — cache-first para assets, network-first para API ──── */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;

  /* Não intercepta requests do Firebase / Google APIs */
  const url = e.request.url;
  if (url.includes('firebase')    ||
      url.includes('googleapis')  ||
      url.includes('gstatic')     ||
      url.includes('firebaseio'))  { return; }

  e.respondWith(
    caches.match(e.request).then(function (cached) {
      if (cached) return cached;
      return fetch(e.request).then(function (resp) {
        /* Cacheia somente responses de mesma origem e status 200 */
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, clone); });
        }
        return resp;
      }).catch(function () {
        /* Offline + sem cache → devolve a shell do app para navegação */
        if (e.request.destination === 'document') {
          return caches.match('/legado-app/index.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});


/* ── 6. PUSH FOREGROUND/BACKGROUND via FCM ───────────────────────────
   Disparado pelo Firebase quando o app está FECHADO ou em SEGUNDO PLANO.
   Quando o app está ABERTO, o FCM entrega via onMessage() no cliente;
   este handler não é chamado nesse caso.
   ─────────────────────────────────────────────────────────────────── */
messaging.onBackgroundMessage(function (fcmPayload) {
  /* FCM pode trazer dados em .notification (display) ou .data (custom) */
  const n    = fcmPayload.notification || {};
  const d    = fcmPayload.data         || {};

  const tipo    = d.tipo    || 'geral';
  const titulo  = n.title   || d.titulo  || _emojiTipo(tipo) + ' Legado';
  const corpo   = n.body    || d.corpo   || 'Confira seu painel financeiro.';
  const secao   = d.secao   || 'visao';
  const urlDest = d.url     || self.location.origin;
  const urgente = d.urgente === 'true' || d.urgente === true;

  return self.registration.showNotification(titulo, {
    body:               corpo,
    icon:               '/legado-app/icon-512.png',
    badge:              '/legado-app/icon-120.png',
    tag:                d.tag || ('lgd-fcm-' + tipo),
    renotify:           urgente,
    silent:             !urgente,
    vibrate:            urgente ? [200, 100, 200] : [100],
    requireInteraction: urgente,
    actions:            _buildActions(tipo, d),
    data:               { secao: secao, url: urlDest, tipo: tipo, payload: d },
    timestamp:          Date.now(),
  });
});


/* ── 7. PUSH DIRETO (Web Push sem FCM) ──────────────────────────────
   Disparado por um servidor próprio via Web Push Protocol.
   Útil como fallback ou em ambientes sem Firebase.
   ─────────────────────────────────────────────────────────────────── */
self.addEventListener('push', function (e) {
  let data = {};
  try   { data = e.data.json(); }
  catch { data = { titulo: 'Legado', corpo: e.data ? e.data.text() : '' }; }

  const tipo    = data.tipo    || 'geral';
  const titulo  = data.titulo  || (_emojiTipo(tipo) + ' Legado');
  const corpo   = data.corpo   || 'Confira seu painel financeiro.';
  const urlDest = data.url     || '/';
  const urgente = !!data.urgente;

  e.waitUntil(
    self.registration.showNotification(titulo, {
      body:               corpo,
      icon:               '/legado-app/icon-512.png',
      badge:              '/legado-app/icon-120.png',
      tag:                'legado-push-' + tipo,
      renotify:           urgente,
      silent:             !urgente,
      vibrate:            urgente ? [200, 100, 200] : [100],
      requireInteraction: urgente,
      actions:            _buildActions(tipo, data),
      data:               { url: urlDest, tipo: tipo, payload: data },
      timestamp:          Date.now(),
    })
  );
});


/* ── 8. NOTIFICATION CLICK ───────────────────────────────────────── */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();

  const action  = e.action;
  const payload = e.notification.data || {};
  const tipo    = payload.tipo || 'geral';

  /* Ação "dispensar": encerra sem navegar */
  if (action === 'dispensar') return;

  const destino = _rotearAcao(action, tipo, payload);
  if (!destino.url) return;

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cls) {
      /* Reutiliza janela já aberta se existir */
      const aberta = cls.find(function (c) {
        return c.url.startsWith(self.location.origin);
      });

      if (aberta && 'focus' in aberta) {
        return aberta.focus().then(function () {
          if (destino.secao) {
            aberta.postMessage({ tipo: 'navegar', secao: destino.secao, acao: action });
          }
        });
      }

      /* Abre nova janela */
      if (clients.openWindow) return clients.openWindow(destino.url);
    })
  );
});


/* ── 9. MESSAGE — comandos internos vindos do app ────────────────── */
self.addEventListener('message', function (e) {
  const msg = e.data || {};

  switch (msg.tipo) {
    /* App quer exibir uma notificação local imediata (sem servidor) */
    case 'notif-local':
      _exibirLocal(msg.payload);
      break;

    /* Usuário já viu o alerta — limpar badge do ícone do app */
    case 'limpar-badge':
      if (navigator.clearAppBadge) navigator.clearAppBadge().catch(function () {});
      break;

    /* App manda recarregar o SW após deploy de nova versão */
    case 'skip-waiting':
      self.skipWaiting();
      break;
  }
});


/* ═══════════════════════════════════════════════════════════════════
   FUNÇÕES AUXILIARES — compartilhadas entre push, FCM e local
   ═══════════════════════════════════════════════════════════════════ */

/** Emoji representativo por tipo de notificação */
function _emojiTipo(tipo) {
  return {
    cartao:      '💳',
    milhas:      '✈️',
    meta:        '🎯',
    divida:      '📉',
    reserva:     '🏦',
    aporte:      '📈',
    aniversario: '🎉',
    premium:     '✨',
    geral:       '📊',
  }[tipo] || '📊';
}

/** Ações rápidas exibidas na notificação por tipo */
function _buildActions(tipo, data) {
  switch (tipo) {
    case 'cartao':
      return [
        { action: 'ver-cartao',    title: '💳 Ver cartão'       },
        { action: 'dispensar',     title: '✕ Dispensar'          },
      ];
    case 'milhas':
      return [
        { action: 'ver-milhas',    title: '✈️ Ver milhas'        },
        { action: 'dispensar',     title: '✕ Dispensar'          },
      ];
    case 'meta':
      return [
        { action: 'aporte-rapido', title: '📈 Registrar aporte'  },
        { action: 'ver-meta',      title: '🎯 Ver metas'         },
      ];
    case 'divida':
      return [
        { action: 'ver-divida',    title: '📉 Ver dívidas'       },
        { action: 'dispensar',     title: '✕ Dispensar'          },
      ];
    case 'reserva':
      return [
        { action: 'ver-reserva',   title: '🏦 Ver reserva'       },
        { action: 'dispensar',     title: '✕ Dispensar'          },
      ];
    case 'premium':
      return [
        { action: 'ver-premium',   title: '✨ Conhecer plano'    },
        { action: 'dispensar',     title: 'Agora não'             },
      ];
    default:
      return [
        { action: 'abrir',         title: '📊 Abrir Legado'      },
        { action: 'dispensar',     title: '✕ Dispensar'          },
      ];
  }
}

/** Mapeia ação clicada → seção e URL de destino */
function _rotearAcao(action, tipo, payload) {
  const mapa = {
    'ver-cartao':    { secao: 'cartoes', url: '/legado-app/#cartoes'  },
    'ver-milhas':    { secao: 'milhas',  url: '/legado-app/#milhas'   },
    'ver-meta':      { secao: 'visao',   url: '/legado-app/#visao'    },
    'ver-divida':    { secao: 'visao',   url: '/legado-app/#visao'    },
    'ver-reserva':   { secao: 'visao',   url: '/legado-app/#visao'    },
    'aporte-rapido': { secao: 'visao',   url: '/legado-app/#visao'    },
    'ver-premium':   { secao: 'config',  url: '/legado-app/#config'   },
    'abrir':         { secao: 'visao',   url: '/legado-app/'        },
    'dispensar':     { secao: null,      url: null         },
  };

  /* Clique no corpo da notificação (sem ação específica) */
  if (!action || action === 'default') {
    const mapaTipo = {
      cartao:  { secao: 'cartoes', url: '/legado-app/#cartoes' },
      milhas:  { secao: 'milhas',  url: '/legado-app/#milhas'  },
      premium: { secao: 'config',  url: '/legado-app/#config'  },
    };
    return mapaTipo[tipo] || { secao: 'visao', url: '/legado-app/' };
  }

  return mapa[action] || { secao: 'visao', url: '/legado-app/' };
}

/** Exibe notificação local imediata (disparada pelo próprio app, sem servidor) */
function _exibirLocal(payload) {
  if (!payload) return;
  const tipo    = payload.tipo    || 'geral';
  const titulo  = payload.titulo  || (_emojiTipo(tipo) + ' Legado');
  const corpo   = payload.corpo   || 'Confira seu painel financeiro.';
  const urgente = !!payload.urgente;

  self.registration.showNotification(titulo, {
    body:               corpo,
    icon:               '/legado-app/icon-512.png',
    badge:              '/legado-app/icon-120.png',
    tag:                'legado-local-' + tipo,
    renotify:           urgente,
    silent:             !urgente,
    vibrate:            urgente ? [200, 100, 200] : [100],
    requireInteraction: urgente,
    actions:            _buildActions(tipo, payload),
    data:               { url: payload.url || '/legado-app/', tipo: tipo, payload: payload },
    timestamp:          Date.now(),
  });
}
