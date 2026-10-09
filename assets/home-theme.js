(function () {
  'use strict';
  // Run before the home stylesheet to avoid flashing the opposite theme.
  var root = document.documentElement;
  var key = 'ct-home-theme';
  var preference = 'system';
  var system = window.matchMedia('(prefers-color-scheme: dark)');
  try {
    var saved = localStorage.getItem(key);
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch (_) { /* Theme switching remains available without storage. */ }

  function apply() {
    var theme = preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
    root.dataset.homeTheme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#171717' : '#f7f7f7';
  }
  apply();
  if (system.addEventListener) system.addEventListener('change', apply);
  else if (system.addListener) system.addListener(apply);

  document.addEventListener('DOMContentLoaded', function () {
    var select = document.getElementById('home-theme');
    if (!select) return;
    select.value = preference;
    select.closest('.theme-control').hidden = false;
    select.addEventListener('change', function () {
      preference = select.value;
      apply();
      try {
        if (preference === 'system') localStorage.removeItem(key);
        else localStorage.setItem(key, preference);
      } catch (_) { /* Keep the explicit choice for this page even when writes fail. */ }
    });
    window.addEventListener('storage', function (event) {
      if (event.key !== key && event.key !== null) return;
      preference = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : 'system';
      select.value = preference;
      apply();
    });
  });
}());
