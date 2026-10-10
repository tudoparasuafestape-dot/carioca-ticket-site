// Diagnostic-only init script. Inject before navigation; do not publish.
// Stores durations/counts locally. No payload, URL, ID, storage or beacon export.
(function () {
  'use strict';
  var times = {}, observedId = null, outcome = 'pending', count = null;
  var firstImage = null, decoded = false;
  function mark(name) { if (!(name in times)) times[name] = performance.now(); }
  mark('probeInstalled');
  document.addEventListener('DOMContentLoaded', function () { mark('domContentLoaded'); }, { once: true });
  window.addEventListener('load', function () { mark('windowLoad'); }, { once: true });

  var nativeSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    var fields = this.elements;
    if (!observedId && this.method.toUpperCase() === 'POST' &&
        /^https:\/\/script\.google\.com\//.test(this.action) &&
        fields.metodo && fields.metodo.value === 'ctEventosPublicosListarPROD' &&
        fields.argsJson && fields.argsJson.value === '[]' &&
        fields.ctMinhaCariocaRequestId) {
      observedId = fields.ctMinhaCariocaRequestId.value;
      mark('catalogRequestSubmitted');
    }
    return nativeSubmit.apply(this, arguments);
  };
  window.addEventListener('message', function (event) {
    if (!observedId || (event.origin !== 'https://script.google.com' &&
        !/^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/.test(event.origin))) return;
    var payload = event.data;
    if (!payload || payload.ctMinhaCariocaPost !== true || payload.id !== observedId) return;
    mark('catalogMessageReceived');
    var result = payload.resultado;
    outcome = payload.ok === true && result && result.sucesso === true && Array.isArray(result.eventos) ? 'success' : 'error';
    if (outcome === 'success') count = result.eventos.length;
  });

  function coverReady() {
    if (!firstImage || !firstImage.complete || firstImage.naturalWidth <= 0 || decoded) return;
    decoded = true;
    mark('firstCoverLoaded');
    Promise.resolve(typeof firstImage.decode === 'function' ? firstImage.decode() : null).then(function () {
      mark('firstCoverDecoded');
      requestAnimationFrame(function () { requestAnimationFrame(function () { mark('firstCoverFrameCheckpoint'); }); });
    }).catch(function () { mark('firstCoverDecodeFailed'); });
  }
  new MutationObserver(function () {
    var grid = document.getElementById('events-grid');
    if (!grid) return;
    var firstCard = grid.querySelector('.catalog-card');
    if (firstCard) mark('firstCardInDom');
    if (observedId && grid.getAttribute('aria-busy') === 'false') mark('catalogUiSettled');
    if (!firstImage && firstCard) {
      firstImage = firstCard.querySelector('.catalog-photo img');
      if (firstImage) {
        firstImage.addEventListener('load', coverReady, { once: true });
        firstImage.addEventListener('error', function () { mark('firstCoverFailed'); }, { once: true });
      }
    }
    coverReady();
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-busy', 'src'] });

  function difference(end, start) { return times[end] == null || times[start] == null ? null : times[end] - times[start]; }
  window.__ctCatalogLatencySnapshot = function () {
    return {
      version: 1, outcome: outcome, publicEventCount: count,
      checkpointsMsFromNavigation: Object.assign({}, times),
      requestToMessageMs: difference('catalogMessageReceived', 'catalogRequestSubmitted'),
      messageToCardMs: difference('firstCardInDom', 'catalogMessageReceived'),
      cardToCoverLoadMs: difference('firstCoverLoaded', 'firstCardInDom'),
      cardToCoverFrameMs: difference('firstCoverFrameCheckpoint', 'firstCardInDom'),
      limits: 'requestToMessage includes network, redirects, server execution and iframe bridge; frame checkpoint is not a paint metric'
    };
  };
}());
