(function () {
  'use strict';
  var menu = document.getElementById('workspaceMenu');
  var toggle = document.getElementById('workspaceMenuToggle');
  if (!menu || !toggle) return;

  function close(returnFocus) {
    if (!menu.open) return;
    menu.open = false;
    if (returnFocus) toggle.focus();
  }
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && menu.open) {
      event.preventDefault();
      close(menu.contains(document.activeElement));
    }
  });
  document.addEventListener('click', function (event) {
    if (!menu.contains(event.target)) close(false);
  });
  menu.addEventListener('focusout', function () {
    // Let focus settle before closing this non-modal disclosure.
    setTimeout(function () {
      if (!menu.contains(document.activeElement)) close(false);
    }, 0);
  });
  menu.addEventListener('click', function (event) {
    var action = event.target.closest('a, button');
    if (!action || action.disabled || action.getAttribute('aria-disabled') === 'true') return;
    // Existing handlers retain exclusive ownership of authorization and handoff.
    close(false);
  });
  window.addEventListener('pagehide', function () { close(false); });
  window.addEventListener('pageshow', function () { close(false); });
}());
