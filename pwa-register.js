(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {
      // A instalacao do site nao pode quebrar a navegacao se o SW falhar.
    });
  });
}());
