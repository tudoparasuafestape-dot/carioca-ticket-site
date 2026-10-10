/* Opens visitor-controlled Uber/Waze flows only after a click. No ride/navigation API. */
(function () {
  'use strict';
  var active = null;
  var labels = {
    'pt-BR': ['Ir de Uber', 'Confira o destino no Uber antes de pedir a viagem.', 'Abrir Uber com o destino do evento'],
    'en-US': ['Go with Uber', 'Check the destination in Uber before requesting your ride.', 'Open Uber with the event destination'],
    es: ['Ir con Uber', 'Revisa el destino en Uber antes de solicitar el viaje.', 'Abrir Uber con el destino del evento'],
    'zh-Hans': ['乘坐 Uber', '叫车前，请在 Uber 中确认目的地。', '打开 Uber 并填写活动目的地']
  };
  var wazeLabels = {
    'pt-BR': ['Ir com Waze', 'Confira o destino no Waze antes de iniciar a navegação.'],
    'en-US': ['Go with Waze', 'Check the destination in Waze before starting navigation.'],
    es: ['Ir con Waze', 'Revisa el destino en Waze antes de iniciar la navegación.'],
    'zh-Hans': ['使用 Waze 导航', '开始导航前，请在 Waze 中确认目的地。']
  };
  function text(value) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''; }
  function signature(value) { return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s*,\s*/g, ','); }
  function resolve(event, requestedId) {
    if (!event || typeof event !== 'object') return null;
    var id = text(event.id);
    var records = window.CTEventRideDestinations;
    if (!id || id !== text(requestedId) || !records || !Object.prototype.hasOwnProperty.call(records, id)) return null;
    var point = records[id];
    if (!point || point.approved !== true || !text(point.revision)) return null;
    // The current public payload has no coordinate/veracity fields. Only this
    // reviewed registry is eligible, and a changed venue invalidates the pin.
    if (!['local', 'endereco', 'cidade', 'uf'].every(function (key) {
      return text(event[key]) && signature(event[key]) === signature(point[key]);
    })) return null;
    if (typeof point.latitude !== 'number' || !Number.isFinite(point.latitude) || Math.abs(point.latitude) > 90 ||
        typeof point.longitude !== 'number' || !Number.isFinite(point.longitude) || Math.abs(point.longitude) > 180 ||
        (point.latitude === 0 && point.longitude === 0)) return null;
    if (!text(point.addressLine1) || !text(point.addressLine2) || point.addressLine1.length > 220 || point.addressLine2.length > 500) return null;
    return point;
  }
  function buildUrl(event, requestedId) {
    var point = resolve(event, requestedId);
    if (!point) return '';
    var drop = { latitude: point.latitude, longitude: point.longitude,
      addressLine1: text(point.addressLine1), addressLine2: text(point.addressLine2) };
    return 'https://m.uber.com/looking?pickup=my_location&drop%5B0%5D=' + encodeURIComponent(JSON.stringify(drop));
  }
  function buildWazeUrl(event, requestedId) {
    // Share Uber's reviewed destination policy; never derive coordinates from a map viewport.
    var point = resolve(event, requestedId);
    if (!point) return '';
    return 'https://waze.com/ul?ll=' + encodeURIComponent(point.latitude + ',' + point.longitude) + '&navigate=yes';
  }
  function locale() {
    try {
      var value = window.CTPublicI18n && typeof window.CTPublicI18n.getLocale === 'function' ? window.CTPublicI18n.getLocale() : window.localStorage.getItem('ct-home-locale');
      return Object.prototype.hasOwnProperty.call(labels, value) ? value : 'pt-BR';
    } catch (_) { return 'pt-BR'; }
  }
  function clear() {
    active = null;
    var link = document.getElementById('directions-uber');
    var note = document.getElementById('directions-uber-note');
    if (link) { link.hidden = true; link.removeAttribute('href'); }
    if (note) { note.hidden = true; note.textContent = ''; }
    var waze = document.getElementById('directions-waze');
    var wazeNote = document.getElementById('directions-waze-note');
    if (waze) { waze.hidden = true; waze.removeAttribute('href'); }
    if (wazeNote) { wazeNote.hidden = true; wazeNote.textContent = ''; }
  }
  function refreshLanguage() {
    if (!active) return;
    var link = document.getElementById('directions-uber');
    var label = document.getElementById('directions-uber-label');
    var note = document.getElementById('directions-uber-note');
    if (!link || !label || !note) return;
    var lang = locale(), words = labels[lang];
    link.setAttribute('lang', lang); note.setAttribute('lang', lang);
    label.textContent = words[0]; note.textContent = words[1];
    // Keep the accessible name identical to the visible action (voice control).
    link.removeAttribute('aria-label');
    var waze = document.getElementById('directions-waze');
    var wazeLabel = document.getElementById('directions-waze-label');
    var wazeNote = document.getElementById('directions-waze-note');
    if (waze && wazeLabel && wazeNote) {
      waze.setAttribute('lang', lang); wazeNote.setAttribute('lang', lang);
      wazeLabel.textContent = wazeLabels[lang][0]; wazeNote.textContent = wazeLabels[lang][1];
      waze.removeAttribute('aria-label');
    }
  }
  function render(event, requestedId) {
    clear();
    var link = document.getElementById('directions-uber');
    var note = document.getElementById('directions-uber-note');
    var details = document.getElementById('directions-details');
    if (!link || !note || !details || details.hidden) return;
    var url = buildUrl(event, requestedId);
    if (!url) return;
    active = true;
    link.setAttribute('href', url); link.hidden = false; note.hidden = false;
    var waze = document.getElementById('directions-waze');
    var wazeNote = document.getElementById('directions-waze-note');
    var wazeUrl = buildWazeUrl(event, requestedId);
    if (waze && wazeNote && wazeUrl) {
      waze.setAttribute('href', wazeUrl); waze.hidden = false; wazeNote.hidden = false;
    }
    refreshLanguage();
  }
  document.addEventListener('ct:public-language', refreshLanguage);
  window.addEventListener('storage', function (event) { if (!event.key || event.key === 'ct-home-locale') refreshLanguage(); });
  window.addEventListener('pageshow', refreshLanguage);
  window.CTEventUber = Object.freeze({ render: render, clear: clear, buildUrl: buildUrl, buildWazeUrl: buildWazeUrl });
}());
