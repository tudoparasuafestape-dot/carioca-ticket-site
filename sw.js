/* Carioca Ticket PWA service worker: mantém navegação em rede sem cache agressivo. */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Intencionalmente não intercepta: produção continua network-first.
});
