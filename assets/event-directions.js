/* Public event address only. No geolocation, geocoding, embeds or ride requests. */
(function () {
  'use strict';
  var mapDestination = '';
  function text(source) {
    return window.CTEventI18n && typeof window.CTEventI18n.text === 'function' ? window.CTEventI18n.text(source) : source;
  }
  function setStatus(element, message) {
    element._directionsMessage = message;
    element.textContent = text(message);
  }
  function clean(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  }
  function usable(value) {
    var normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    // Conservatively reject links and unresolved/remote-location descriptions.
    // This is an uncertainty filter, never a claim of physical-location verification.
    return value.length >= 3 && value.length <= 500 &&
      !/(?:[a-z][a-z0-9+.-]*:\/\/|https?:|www\.|@|<|>|\b[a-z0-9-]+\.[a-z]{2,63}\b)/i.test(value) &&
      !/\b(?:confirmar|definir|informar|nao informad[oa]|nao se aplica|em breve|pendente|aguarde|a ser confirmad[oa]|a ser definid[oa]|divulgad[oa]|enviad[oa]|online|on-line|on line|virtual|remot[oa]|zoom|google meet|teams|link|e-?mail)\b/.test(normalized) &&
      !/^(?:n\/a|[-–—.]+)$/.test(normalized);
  }
  function render(event, requestedId) {
    mapDestination = '';
    event = event || {};
    var venue = clean(event.local);
    var address = clean(event.endereco);
    var city = clean(event.cidade);
    var state = clean(event.uf);
    var details = document.getElementById('directions-details');
    var unavailable = document.getElementById('directions-unavailable');
    var input = document.getElementById('directions-address');
    var map = document.getElementById('directions-map');
    var copy = document.getElementById('directions-copy');
    var status = document.getElementById('directions-status');
    var revision = {}; 
    if (!details || !unavailable || !input || !map || !copy || !status) return;
    // Presence checks do not establish event modality or verify a physical location.
    var valid = usable(venue) && usable(address) && usable(city) &&
      /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/i.test(state);
    var destination = [venue, address, city, state.toUpperCase(), 'Brasil'].join(', ');
    // The requested ID comes from the public page, not from an untrusted pin.
    var expectedId = requestedId === undefined ? event.id : requestedId;
    if (requestedId !== undefined && clean(event.id) !== clean(requestedId)) valid = false;
    var point = window.CTEventUber && typeof window.CTEventUber.buildMapsDestination === 'function'
      ? window.CTEventUber.buildMapsDestination(event, expectedId) : '';
    // A confirmed, address-bound pin establishes physical navigation. Legacy
    // keyword guesses (for example a venue named Espaço Link) must not override it.
    if (point) valid = true;
    // Explicit null/invalid contracts revoke all physical navigation, including
    // an old address query. Unknown legacy events retain their existing address fallback.
    if (Object.prototype.hasOwnProperty.call(event, 'destinoTransporte') && !point) valid = false;
    var navigationDestination = point || destination;
    var mapUrl = '';
    if (valid) {
      try {
        mapUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(navigationDestination);
        valid = mapUrl.length <= 2048;
      } catch (_) { valid = false; }
    }
    details.hidden = !valid;
    unavailable.hidden = valid;
    input.value = '';
    map.removeAttribute('href');
    setStatus(status, '');
    copy.onclick = null;
    copy.disabled = false;
    input._directionsRevision = revision;
    if (!valid) return;
    input.value = destination;
    mapDestination = navigationDestination;
    map.href = mapUrl;
    copy.onclick = async function () {
      if (copy.disabled) return;
      copy.disabled = true;
      try {
        if (!navigator.clipboard || !window.isSecureContext) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(destination);
        if (input._directionsRevision === revision) setStatus(status, 'Endereço copiado. Cole no aplicativo de sua preferência.');
      } catch (_) {
        if (input._directionsRevision !== revision) return;
        input.focus();
        input.select();
        input.setSelectionRange(0, input.value.length);
        setStatus(status, 'Não foi possível copiar automaticamente. O endereço está selecionado; use a opção Copiar do seu dispositivo.');
      } finally {
        if (input._directionsRevision === revision) copy.disabled = false;
      }
    };
  }
  document.addEventListener('ct:public-language', function () {
    var status = document.getElementById('directions-status');
    if (status && status._directionsMessage) setStatus(status, status._directionsMessage);
  });
  window.CTEventDirections = { render: render, getMapDestination: function () { return mapDestination; } };
}());

