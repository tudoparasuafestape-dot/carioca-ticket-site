(function () {
  'use strict';
  var button = document.querySelector('.ct-home .menu-toggle');
  var menu = document.getElementById('mobile-menu');
  if (!button || !menu) return;
  button.hidden = false;
  function label(open) { return window.CTHome ? CTHome.t(open ? 'closeMenu' : 'openMenu') : (open ? 'Fechar menu' : 'Abrir menu'); }
  function setMenu(open) { button.dataset.i18nAriaLabel = open ? 'closeMenu' : 'openMenu'; button.setAttribute('aria-expanded', String(open)); button.setAttribute('aria-label', label(open)); menu.hidden = !open; }
  button.addEventListener('click', function () { var open = menu.hidden; setMenu(open); if (open) document.dispatchEvent(new CustomEvent('ct:close-accessibility')); });
  button.addEventListener('keydown', function (event) { if (event.key === 'Tab' && !event.shiftKey && !menu.hidden) { event.preventDefault(); menu.querySelector('a').focus(); } });
  // A disclosure, not a modal: Tab can always leave the menu.
  menu.addEventListener('keydown', function (event) {
    if (event.key !== 'Tab') return;
    var links = menu.querySelectorAll('a');
    if (event.shiftKey && event.target === links[0]) { event.preventDefault(); button.focus(); }
    else if (!event.shiftKey && event.target === links[links.length - 1]) {
      event.preventDefault(); setMenu(false); document.querySelector('.ct-home .producer-top-link').focus();
    }
  });
  menu.addEventListener('click', function (event) {
    var link = event.target.closest('a'); if (!link) return;
    setMenu(false);
    if (link.hash && link.origin === location.origin && link.pathname === location.pathname) {
      var target = document.getElementById(link.hash.slice(1));
      if (target) { target.tabIndex = -1; target.focus(); target.scrollIntoView({ block: 'start' }); }
    }
  });
  document.addEventListener('click', function (event) { if (!menu.contains(event.target) && !button.contains(event.target)) setMenu(false); });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !menu.hidden) { setMenu(false); button.focus(); } });
  document.addEventListener('ct:close-menu', function () { setMenu(false); });
  document.addEventListener('ct:language', function () { button.setAttribute('aria-label', label(!menu.hidden)); });
  document.addEventListener('focusin', function (event) { if (!menu.hidden && !menu.contains(event.target) && event.target !== button) setMenu(false); });
  var desktop = window.matchMedia('(min-width: 1201px)');
  function onResize() {
    if (menu.hidden) return;
    var hadFocus = menu.contains(document.activeElement) || document.activeElement === button;
    setMenu(false); if (hadFocus) button.focus();
  }
  if (desktop.addEventListener) desktop.addEventListener('change', onResize);
  function currentLink() { menu.querySelectorAll('a').forEach(function (link) { if (link.getAttribute('href') === (location.hash || '#todos-eventos')) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); }); }
  function onHistoryNavigation() {
    var hadFocus = menu.contains(document.activeElement);
    setMenu(false); currentLink(); if (hadFocus) button.focus();
  }
  window.addEventListener('hashchange', onHistoryNavigation);
  window.addEventListener('popstate', onHistoryNavigation);
  window.addEventListener('pageshow', onHistoryNavigation);
  currentLink();
}());
