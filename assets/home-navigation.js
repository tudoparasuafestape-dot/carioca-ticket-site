(function () {
  'use strict';
  var button = document.querySelector('.ct-home .menu-toggle');
  var menu = document.getElementById('mobile-menu');
  if (!button || !menu) return;
  button.hidden = false;
  function setMenu(open) {
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    menu.hidden = !open;
  }
  button.addEventListener('click', function () {
    setMenu(button.getAttribute('aria-expanded') !== 'true');
  });
  menu.addEventListener('click', function (event) {
    var link = event.target.closest('a');
    if (!link) return;
    setMenu(false);
    if (link.hash && link.origin === location.origin && link.pathname === location.pathname) {
      var target = document.getElementById(link.hash.slice(1));
      if (target) {
        target.tabIndex = -1;
        target.focus();
      }
    }
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !menu.hidden) {
      setMenu(false);
      button.focus();
    }
  });
  var desktop = window.matchMedia('(min-width: 901px)');
  function onResize() {
    if (!desktop.matches || menu.hidden) return;
    var hadFocus = menu.contains(document.activeElement) || document.activeElement === button;
    setMenu(false);
    if (hadFocus) document.querySelector('.ct-home .links a').focus();
  }
  if (desktop.addEventListener) desktop.addEventListener('change', onResize);
}());
