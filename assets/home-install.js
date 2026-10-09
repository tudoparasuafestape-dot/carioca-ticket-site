(function () {
  'use strict';
  // Home-only invitation. No service-worker, cache or network changes.
  var key = 'ct-home-install-choice-v1';
  var deferredPrompt = null;
  var stopped = false;
  var busy = false;
  var panel, action, dismiss, help;
  var display = window.matchMedia('(display-mode: standalone)');

  function savedChoice() {
    try { if (window.localStorage.getItem(key)) return true; } catch (_) {}
    try { return !!window.sessionStorage.getItem(key); } catch (_) { return false; }
  }
  function remember(value) {
    stopped = true;
    try { window.localStorage.setItem(key, value); } catch (_) {}
    try { window.sessionStorage.setItem(key, value); } catch (_) {}
  }
  function standalone() { return display.matches || navigator.standalone === true; }
  function hide() {
    if (panel) {
      var ownsFocus = panel.contains(document.activeElement);
      panel.hidden = true;
      // Keep keyboard users on the page after their chosen action removes a button.
      if (ownsFocus) {
        var main = document.getElementById('conteudo');
        if (main) { main.setAttribute('tabindex', '-1'); main.focus({ preventScroll: true }); }
      }
    }
  }
  function canShow() { return !stopped && !savedChoice() && !standalone(); }
  function iosSafari() {
    var ua = navigator.userAgent;
    var ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return ios && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/.test(ua);
  }
  function show() {
    if (!panel || !canShow()) { hide(); return; }
    if (!deferredPrompt && !iosSafari()) return;
    action.setAttribute('data-i18n', deferredPrompt ? 'installAction' : 'installManual');
    action.textContent = deferredPrompt ? 'Instalar' : 'Como instalar';
    if (window.CTHome && window.CTHome.applyTranslations) window.CTHome.applyTranslations(panel);
    action.disabled = false;
    action.hidden = false;
    help.hidden = true;
    if (deferredPrompt) {
      action.removeAttribute('aria-expanded');
      action.removeAttribute('aria-controls');
    } else {
      action.setAttribute('aria-expanded', 'false');
      action.setAttribute('aria-controls', 'home-install-help');
    }
    panel.hidden = false;
  }
  // Capture eligibility early; only the browser can provide a native prompt.
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    if (!canShow() || busy) return;
    deferredPrompt = event;
    show();
  });
  window.addEventListener('appinstalled', function () {
    remember('installed'); deferredPrompt = null; hide();
  });
  function displayChanged() {
    if (standalone()) { remember('installed'); deferredPrompt = null; hide(); }
  }
  if (display.addEventListener) display.addEventListener('change', displayChanged);
  else if (display.addListener) display.addListener(displayChanged);
  window.addEventListener('storage', function (event) { if (event.key === key && event.newValue) { stopped = true; deferredPrompt = null; hide(); } });
  window.addEventListener('pageshow', function () { if (!canShow()) hide(); });

  function init() {
    panel = document.getElementById('home-install');
    if (!panel) return;
    action = document.getElementById('home-install-action');
    dismiss = document.getElementById('home-install-dismiss');
    help = document.getElementById('home-install-help');
    if (standalone()) remember('installed');
    dismiss.addEventListener('click', function () { remember('dismissed'); deferredPrompt = null; hide(); });
    panel.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { event.preventDefault(); remember('dismissed'); deferredPrompt = null; hide(); }
    });
    action.addEventListener('click', function () {
      if (busy || !canShow()) return;
      if (!deferredPrompt) {
        help.hidden = !help.hidden;
        action.setAttribute('aria-expanded', String(!help.hidden));
        return;
      }
      var prompt = deferredPrompt;
      deferredPrompt = null;
      busy = true;
      action.disabled = true;
      // prompt() must run directly in this user gesture, never on page load.
      try {
        Promise.resolve(prompt.prompt()).then(function () { return prompt.userChoice; }).then(function (choice) {
          remember(choice && choice.outcome === 'accepted' ? 'accepted' : 'dismissed');
          hide();
        }).catch(function () {
          // A browser failure must not break navigation or repeatedly prompt.
          stopped = true; hide();
        }).finally(function () { busy = false; });
      } catch (_) { busy = false; stopped = true; hide(); }
    });
    show();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}());
