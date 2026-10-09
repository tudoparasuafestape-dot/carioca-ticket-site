/* Public event address only. No geolocation, geocoding, embeds or ride requests. */
(function () {
  'use strict';
  function clean(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  }
  function usable(value) {
    var normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return value.length >= 3 && value.length <= 500 &&
      !/(?:[a-z][a-z0-9+.-]*:\/\/|https?:|www\.|@|<|>|\b[a-z0-9-]+\.(?:com|org|net|app|br)\b)/i.test(value) &&
      !/^(?:a confirmar|a definir|nao informado|nao se aplica|em breve|online|on-line|virtual|remoto|zoom|google meet|teams|[-–—.]+)$/.test(normalized);
  }
  function render(event) {
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
    var mapUrl = '';
    if (valid) {
      try {
        mapUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(destination);
        valid = mapUrl.length <= 2048;
      } catch (_) { valid = false; }
    }
    details.hidden = !valid;
    unavailable.hidden = valid;
    input.value = '';
    map.removeAttribute('href');
    status.textContent = '';
    copy.onclick = null;
    copy.disabled = false;
    input._directionsRevision = revision;
    if (!valid) return;
    input.value = destination;
    map.href = mapUrl;
    copy.onclick = async function () {
      if (copy.disabled) return;
      copy.disabled = true;
      try {
        if (!navigator.clipboard || !window.isSecureContext) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(destination);
        if (input._directionsRevision === revision) status.textContent = 'Endereço copiado. Cole no aplicativo de sua preferência.';
      } catch (_) {
        if (input._directionsRevision !== revision) return;
        input.focus();
        input.select();
        input.setSelectionRange(0, input.value.length);
        status.textContent = 'Não foi possível copiar automaticamente. O endereço está selecionado; use a opção Copiar do seu dispositivo.';
      } finally {
        if (input._directionsRevision === revision) copy.disabled = false;
      }
    };
  }
  window.CTEventDirections = { render: render };
}());
