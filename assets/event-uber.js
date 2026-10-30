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
  var fallbackLabels = {
    'pt-BR': ['Abrir Uber', 'O destino não está preenchido no Uber. Copie o endereço acima e cole no aplicativo antes de pedir a viagem.'],
    'en-US': ['Open Uber', 'The destination is not filled in Uber. Copy the address above and paste it in the app before requesting a ride.'],
    es: ['Abrir Uber', 'El destino no está rellenado en Uber. Copia la dirección de arriba y pégala en la app antes de solicitar el viaje.'],
    'zh-Hans': ['打开 Uber', 'Uber 中尚未填写目的地。请复制上方地址并粘贴到应用中，再叫车。']
  };
  var searchLabels = {
    'pt-BR': ['Abrir Waze', 'Busque o endereço no Waze e confira o resultado antes de iniciar a navegação.'],
    'en-US': ['Open Waze', 'Search for the address in Waze and check the result before starting navigation.'],
    es: ['Abrir Waze', 'Busca la dirección en Waze y revisa el resultado antes de iniciar la navegación.'],
    'zh-Hans': ['打开 Waze', '请在 Waze 中搜索地址并确认结果后再开始导航。']
  };
  function address(event, requestedId) {
    if (!event || !text(event.id) || text(event.id) !== text(requestedId)) return null;
    return window.CTEventDirections && window.CTEventDirections.resolve(event);
  }
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
    if (!address(event, requestedId)) return '';
    if (!point) return 'https://m.uber.com/';
    var drop = { latitude: point.latitude, longitude: point.longitude,
      addressLine1: text(point.addressLine1), addressLine2: text(point.addressLine2) };
    return 'https://m.uber.com/looking?pickup=my_location&drop%5B0%5D=' + encodeURIComponent(JSON.stringify(drop));
  }
  function buildWazeUrl(event, requestedId) {
    var destination = address(event, requestedId);
    if (!destination) return '';
    var point = resolve(event, requestedId);
    return point ? 'https://waze.com/ul?ll=' + encodeURIComponent(point.latitude + ',' + point.longitude) + '&navigate=yes' : destination.wazeUrl;
  }
  function buildMapUrl(event, requestedId) {
    var destination = address(event, requestedId);
    if (!destination) return '';
    var point = resolve(event, requestedId);
    return point ? 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(point.latitude + ',' + point.longitude) : destination.mapUrl;
  }
  // Only the active, address-bound approved destination can authorize a pin preview.
  function mapPreviewDestination(href, canonicalAddress) {
    return active && href === active.mapUrl && canonicalAddress === active.address ? active.preview : null;
  }
  function locale() {
    try {
      var value = window.CTPublicI18n && typeof window.CTPublicI18n.getLocale === 'function' ? window.CTPublicI18n.getLocale() : window.localStorage.getItem('ct-home-locale');
      return Object.prototype.hasOwnProperty.call(labels, value) ? value : 'pt-BR';
    } catch (_) { return 'pt-BR'; }
  }
  function clear() {
    var map = document.getElementById('directions-map');
    if (active && map) map.removeAttribute('href');
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
    var lang = locale(), words = active.prefilled ? labels[lang] : fallbackLabels[lang];
    link.setAttribute('lang', lang); note.setAttribute('lang', lang);
    label.textContent = words[0]; note.textContent = words[1];
    // Keep the accessible name identical to the visible action (voice control).
    link.removeAttribute('aria-label');
    var waze = document.getElementById('directions-waze');
    var wazeLabel = document.getElementById('directions-waze-label');
    var wazeNote = document.getElementById('directions-waze-note');
    if (waze && wazeLabel && wazeNote) {
      waze.setAttribute('lang', lang); wazeNote.setAttribute('lang', lang);
      var wazeWords = active.prefilled ? wazeLabels[lang] : searchLabels[lang];
      wazeLabel.textContent = wazeWords[0]; wazeNote.textContent = wazeWords[1];
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
    var point = resolve(event, requestedId), destination = address(event, requestedId);
    active = { prefilled: !!point, address: destination.destination, mapUrl: buildMapUrl(event, requestedId),
      preview: point ? point.latitude + ',' + point.longitude : destination.destination };
    var map = document.getElementById('directions-map');
    if (map) map.setAttribute('href', buildMapUrl(event, requestedId));
    link.setAttribute('rel', 'noopener noreferrer');
    link.setAttribute('href', url); link.hidden = false; note.hidden = false;
    var waze = document.getElementById('directions-waze');
    var wazeNote = document.getElementById('directions-waze-note');
    var wazeUrl = buildWazeUrl(event, requestedId);
    if (waze && wazeNote && wazeUrl) {
      waze.setAttribute('rel', 'noopener noreferrer');
      waze.setAttribute('href', wazeUrl); waze.hidden = false; wazeNote.hidden = false;
    }
    refreshLanguage();
  }
  document.addEventListener('ct:public-language', refreshLanguage);
  window.addEventListener('storage', function (event) { if (!event.key || event.key === 'ct-home-locale') refreshLanguage(); });
  window.addEventListener('pageshow', refreshLanguage);
  window.CTEventUber = Object.freeze({ render: render, clear: clear, buildUrl: buildUrl, buildWazeUrl: buildWazeUrl, buildMapUrl: buildMapUrl, mapPreviewDestination: mapPreviewDestination });
}());
