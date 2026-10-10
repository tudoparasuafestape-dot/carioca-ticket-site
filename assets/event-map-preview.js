/* Public event map: best-effort legacy Google Maps endpoint, not a contracted API.
 * The caller must supply the same public, validated destination used by directions.
 * Never pass buyer data, private-event locations or visitor coordinates. */
(function () {
  'use strict';
  var current = null;
  var copies = {
  "pt-BR": [
    "Mapa do endereço do evento no Google Maps",
    "Mapa fornecido pelo Google. Ao carregar, o Google recebe seu IP e dados do navegador e pode usar cookies. Não solicitamos sua localização.",
    "Privacidade do Google",
    "O mapa será carregado ao chegar a esta seção.",
    "Não foi possível carregar o mapa. Use Abrir no Google Maps ou Copiar endereço.",
    "Se o mapa não aparecer, use Abrir no Google Maps ou Copiar endereço. Confira o endereço com a organização.",
    "Carregando mapa do Google…",
    "O mapa está demorando. Use Abrir no Google Maps ou Copiar endereço.",
    "Se beber, não dirija. Planeje uma volta segura."
  ],
  "en-US": [
    "Map of the event address on Google Maps",
    "Map provided by Google. When it loads, Google receives your IP address and browser data and may use cookies. We do not request your location.",
    "Google privacy",
    "The map will load when you reach this section.",
    "The map could not load. Use Open in Google Maps or Copy address.",
    "If the map does not appear, use Open in Google Maps or Copy address. Confirm the address with the organizer.",
    "Loading Google map…",
    "The map is taking longer than expected. Use Open in Google Maps or Copy address.",
    "If you drink, do not drive. Plan a safe trip home."
  ],
  "es": [
    "Mapa de la dirección del evento en Google Maps",
    "Mapa proporcionado por Google. Al cargarse, Google recibe tu dirección IP y datos del navegador y puede usar cookies. No solicitamos tu ubicación.",
    "Privacidad de Google",
    "El mapa se cargará cuando llegues a esta sección.",
    "No se pudo cargar el mapa. Usa Abrir en Google Maps o Copiar dirección.",
    "Si el mapa no aparece, usa Abrir en Google Maps o Copiar dirección. Confirma la dirección con la organización.",
    "Cargando mapa de Google…",
    "El mapa está tardando. Usa Abrir en Google Maps o Copiar dirección.",
    "Si bebes, no conduzcas. Planifica un regreso seguro."
  ],
  "zh-Hans": [
    "Google 地图上的活动地址",
    "地图由 Google 提供。加载时，Google 会收到您的 IP 地址和浏览器数据，并可能使用 Cookie。我们不会请求您的位置。",
    "Google 隐私政策",
    "滚动到此区域时将加载地图。",
    "无法加载地图。请使用“在 Google 地图中打开”或“复制地址”。",
    "如果地图未显示，请使用“在 Google 地图中打开”或“复制地址”。请向主办方确认地址。",
    "正在加载 Google 地图…",
    "地图加载较慢。请使用“在 Google 地图中打开”或“复制地址”。",
    "饮酒后请勿驾车。请提前安排安全返程。"
  ]
};
  function locale() {
    var value;
    if (window.CTPublicI18n && typeof window.CTPublicI18n.getLocale === 'function') value = window.CTPublicI18n.getLocale();
    else { try { value = window.localStorage.getItem('ct-home-locale'); } catch (_) {} }
    return Object.prototype.hasOwnProperty.call(copies, value) ? value : 'pt-BR';
  }
  function t(value) {
    var index = copies['pt-BR'].indexOf(value);
    return index < 0 ? value : copies[locale()][index];
  }
  function clear() {
    if (!current) return;
    clearTimeout(current.timer);
    if (current.observer) current.observer.disconnect();
    current.frame.onload = current.frame.onerror = null;
    if (current.link) {
      current.link.classList.remove('event-map-fallback');
      current.linkParent.insertBefore(current.link,
        current.linkNext && current.linkNext.parentNode === current.linkParent ? current.linkNext : null);
    }
    current.host.removeAttribute('data-map-fallback');
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
    var safety = document.createElement('p');
    safety.className = 'event-map-safety';
    frame.loading = 'lazy';
    frame.referrerPolicy = 'no-referrer';
    frame.setAttribute('allow', "geolocation 'none'; camera 'none'; microphone 'none'");
    frame.className = 'event-map-frame';
    status.setAttribute('role', 'status');
    privacy.href = 'https://policies.google.com/privacy';
    privacy.target = '_blank';
    privacy.rel = 'noopener noreferrer';
    host.classList.add('event-map-preview');
    host.replaceChildren(notice, viewport, status, safety, privacy);
    host.hidden = false;
    var state = current = { host: host, frame: frame, notice: notice, status: status, privacy: privacy, safety: safety,
      message: 'O mapa será carregado ao chegar a esta seção.', timer: null, observer: null, started: false };
    function fail() {
      if (current !== state) return;
      clearTimeout(state.timer);
      state.message = 'Não foi possível carregar o mapa. Use Abrir no Google Maps ou Copiar endereço.';
      host.setAttribute('data-map-fallback', 'error');
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
        host.setAttribute('data-map-fallback', 'timeout');
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
    current.host.lang = locale();
    current.frame.title = t('Mapa do endereço do evento no Google Maps');
    current.notice.textContent = t('Mapa fornecido pelo Google. Ao carregar, o Google recebe seu IP e dados do navegador e pode usar cookies. Não solicitamos sua localização.');
    current.status.textContent = t(current.message);
    current.privacy.textContent = t('Privacidade do Google');
    current.safety.textContent = t('Se beber, não dirija. Planeje uma volta segura.');
  }
  document.addEventListener('ct:public-language', translate);
  window.addEventListener('storage', function (event) {
    if (event.key === 'ct-home-locale' || event.key === null) translate();
  });
  window.addEventListener('pageshow', translate);
  function renderPublicDirections() {
    var host = document.getElementById('directions-map-preview');
    var details = document.getElementById('directions-details');
    var address = document.getElementById('directions-address');
    var link = document.getElementById('directions-map');
    var destination = null;
    // Reuse the public directions module's validated destination, never a new guess.
    if (details && !details.hidden && address && link) {
      try {
        var target = new URL(link.href);
        if (target.origin === 'https://www.google.com' && target.pathname === '/maps/dir/' &&
            target.searchParams.get('destination') === address.value) destination = address.value;
      } catch (_) {}
    }
    render(host, destination);
    if (current && link && link.parentNode) {
      // Keep the same accessible, translated link and URL. Move it out of the
      // prominent action row only while a map exists; restore it on teardown.
      current.link = link;
      current.linkParent = link.parentNode;
      current.linkNext = link.nextSibling;
      link.classList.add('event-map-fallback');
      current.status.after(link);
    }
  }
  window.CTEventMapPreview = { render: render, clear: clear, renderPublicDirections: renderPublicDirections };
}());

