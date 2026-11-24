(function () {
  'use strict';
  var card = document.getElementById('ct-producer-welcome');
  if (!card || !card.hidden) return;
  var close = card.querySelector('button'), link = card.querySelector('a');
  var title = card.querySelector('h2'), body = card.querySelector('p');
  if (!close || !link || !title || !body) return;
  var key = 'ct-producer-welcome-shown-v1';
  try {
    if (window.sessionStorage.getItem(key) === '1') return;
    window.sessionStorage.setItem(key, '1');
  } catch (_) { /* An unavailable session store never blocks the home. */ }

  var copies = {
    pt: ['Vai produzir um evento?', 'Venda seus ingressos online, acompanhe as vendas e organize o check-in com a Carioca Ticket.', 'Conheça a plataforma', 'Fechar aviso para produtores'],
    en: ['Planning an event?', 'Sell tickets online, track sales, and manage check-in with Carioca Ticket.', 'Explore the platform', 'Close producer notice'],
    es: ['¿Vas a organizar un evento?', 'Vende entradas en línea, sigue tus ventas y organiza el acceso con Carioca Ticket.', 'Conoce la plataforma', 'Cerrar aviso para organizadores'],
    zh: ['准备举办活动？', '使用 Carioca Ticket 在线售票、跟踪销售并管理入场核验。', '了解平台', '关闭主办方提示']
  };
  function localize() {
    var language = document.documentElement.lang.toLowerCase().split('-')[0];
    var copy = copies[language] || copies.pt;
    title.textContent = copy[0]; body.textContent = copy[1];
    link.textContent = copy[2]; close.setAttribute('aria-label', copy[3]);
  }
  function dismiss(restoreFocus) {
    if (card.hidden) return;
    var active = card.contains(document.activeElement);
    card.hidden = true;
    document.removeEventListener('ct:language', localize);
    if (restoreFocus && active) {
      var destination = document.querySelector('.producer-top-link');
      if (destination) destination.focus({preventScroll: true});
    }
  }
  close.addEventListener('click', function () { dismiss(true); });
  card.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && card.contains(document.activeElement)) {
      event.preventDefault(); dismiss(true);
    }
  });
  // The existing in-page producer section, not a sign-in or outside site.
  link.addEventListener('click', function () {
    // Keep native anchor navigation; move focus to the destination on activation.
    var target = document.getElementById('produtores');
    if (target) target.focus({preventScroll:true});
    dismiss(false);
  });
  document.addEventListener('ct:language', localize);
  localize();
  card.hidden = false;
}());
