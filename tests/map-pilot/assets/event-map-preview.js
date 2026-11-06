/* Draft pilot: legacy Google Maps endpoint; not a contracted Maps Embed API.
 * The caller must supply the same public, validated destination used by directions.
 * Never pass buyer data, private-event locations or visitor coordinates. */
(function () {
  'use strict';
  var current = null;
  function t(value) {
    return window.CTEventI18n && typeof window.CTEventI18n.text === 'function' ? window.CTEventI18n.text(value) : value;
  }
  function clear() {
    if (!current) return;
    clearTimeout(current.timer);
    if (current.observer) current.observer.disconnect();
    current.frame.onload = current.frame.onerror = null;
    current.host.replaceChildren();
    current.host.hidden = true;
    current = null;
  }
  function render(host, destination) {
    clear();
    if (!host) return;
    host.hidden = true;
    // Defense in depth; this does not geocode or establish that an event is public.
    if (typeof destination !== 'string' || destination.length < 3 || destination.length > 1500 ||
        /[<>\r\n]|https?:|www\.|@/i.test(destination)) return;
    var url;
    try { url = 'https://maps.google.com/maps?output=embed&q=' + encodeURIComponent(destination); }
    catch (_) { return; }
    if (url.length > 2048) return;
    var frame = document.createElement('iframe');
    var viewport = document.createElement('div');
    viewport.className = 'event-map-viewport';
    var notice = document.createElement('p');
    var status = document.createElement('p');
    var privacy = document.createElement('a');
    frame.loading = 'lazy';
    frame.referrerPolicy = 'no-referrer';
    frame.setAttribute('allow', "geolocation 'none'; camera 'none'; microphone 'none'");
    frame.className = 'event-map-frame';
    status.setAttribute('role', 'status');
    privacy.href = 'https://policies.google.com/privacy';
    privacy.target = '_blank';
    privacy.rel = 'noopener noreferrer';
    host.classList.add('event-map-preview');
    host.replaceChildren(notice, viewport, status, privacy);
    host.hidden = false;
    var state = current = { host: host, frame: frame, notice: notice, status: status, privacy: privacy,
      message: 'O mapa será carregado ao chegar a esta seção.', timer: null, observer: null, started: false };
    function fail() {
      if (current !== state) return;
      clearTimeout(state.timer);
      state.message = 'Não foi possível carregar o mapa. Use Abrir no Google Maps ou Copiar endereço.';
      frame.hidden = true;
      viewport.hidden = true;
      translate();
    }
    frame.onerror = fail;
    frame.onload = function () {
      if (current !== state || !state.started) return;
      clearTimeout(state.timer);
      // A cross-origin iframe load cannot prove map success or pin accuracy.
      state.message = 'Se o mapa não aparecer, use Abrir no Google Maps ou Copiar endereço. Confira o endereço com a organização.';
      translate();
    };
    function start() {
      if (current !== state || state.started) return;
      state.started = true;
      if (state.observer) state.observer.disconnect();
      state.message = 'Carregando mapa do Google…';
      translate();
      state.timer = setTimeout(function () {
        if (current !== state) return;
        state.message = 'O mapa está demorando. Use Abrir no Google Maps ou Copiar endereço.';
        translate();
      }, 15000);
      frame.src = url;
      // Set src while detached, avoiding an initial about:blank load race.
      viewport.replaceChildren(frame);
    }
    translate();
    if (typeof IntersectionObserver === 'function') {
      state.observer = new IntersectionObserver(function (entries) {
        if (entries.some(function (entry) { return entry.isIntersecting; })) start();
      }, { rootMargin: '0px' });
      state.observer.observe(host);
    } else {
      // Native lazy loading remains the fallback; timer is advisory only.
      start();
    }
  }
  function translate() {
    if (!current) return;
    current.frame.title = t('Mapa do endereço do evento no Google Maps');
    current.notice.textContent = t('Mapa fornecido pelo Google. Ao carregar, o Google recebe seu IP e dados do navegador e pode usar cookies. Não solicitamos sua localização.');
    current.status.textContent = t(current.message);
    current.privacy.textContent = t('Privacidade do Google');
  }
  document.addEventListener('ct:public-language', translate);
  window.CTEventMapPreview = { render: render, clear: clear };
}());
