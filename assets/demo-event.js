/* Standalone presentation. No catalog, event IDs, URL parameters, storage or RPC. */
(function () {
  'use strict';
  var address = 'Vevets Recepções, Rua Arenópolis, 82 - Candeias, Jaboatão dos Guararapes, PE, Brasil';
  var mapUrl = 'https://maps.google.com/maps?output=embed&q=' + encodeURIComponent(address);
  var load = document.getElementById('demo-load-map');
  var hide = document.getElementById('demo-hide-map');
  var host = document.getElementById('demo-map-frame');
  var illustration = document.getElementById('demo-map-illustration');
  var status = document.getElementById('demo-map-status');
  var frame = null, timer;
  function clearMap() {
    clearTimeout(timer);
    if (frame) frame.onload = frame.onerror = null;
    frame = null;
    host.replaceChildren(); host.hidden = true;
    illustration.hidden = false; load.hidden = false; hide.hidden = true;
  }
  load.hidden = false;
  load.addEventListener('click', function () {
    if (frame) return;
    frame = document.createElement('iframe');
    frame.title = 'Mapa do local de referência da demonstração';
    frame.referrerPolicy = 'no-referrer';
    frame.setAttribute('allow', "geolocation 'none'; camera 'none'; microphone 'none'");
    frame.onload = function () {
      clearTimeout(timer);
      // An iframe load does not establish map success or destination accuracy.
      status.textContent = 'Se o mapa não aparecer, use o link Google Maps ou copie o endereço. Confira o local antes de navegar.';
    };
    frame.onerror = function () {
      clearMap(); status.textContent = 'Não foi possível carregar o mapa. Use o link Google Maps ou copie o endereço.';
    };
    status.textContent = 'Carregando mapa externo do local de exemplo.';
    timer = setTimeout(function () { status.textContent = 'O mapa está demorando. Use o link Google Maps ou copie o endereço.'; }, 15000);
    frame.src = mapUrl;
    host.replaceChildren(frame); host.hidden = false; illustration.hidden = true;
    load.hidden = true; hide.hidden = false; hide.focus();
  });
  hide.addEventListener('click', function () {
    clearMap(); status.textContent = 'Mapa externo ocultado. A ilustração local está disponível.'; load.focus();
  });
  var copy = document.getElementById('demo-copy-address');
  var copyStatus = document.getElementById('demo-copy-status');
  copy.hidden = false;
  copy.addEventListener('click', async function () {
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(address);
      copyStatus.textContent = 'Endereço de exemplo copiado. Confira o destino no aplicativo escolhido.';
    } catch (_) {
      var range = document.createRange(); range.selectNodeContents(document.getElementById('demo-address'));
      var selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      copyStatus.textContent = 'O endereço está selecionado. Use a opção Copiar do seu dispositivo.';
    }
  });
}());
