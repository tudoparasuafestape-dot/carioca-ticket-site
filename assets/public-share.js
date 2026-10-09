(function () {
  'use strict';
  var destinations = {
    home: { url:'https://cariocaticket.com.br/', title:'Carioca Ticket', label:'shareSite' },
    program: { url:'https://cariocaticket.com.br/parceiro/programa/', title:'Programa Parceiro Carioca Ticket', label:'shareProgram' }
  };
  var fallback = { shareSite:'Compartilhar site', shareProgram:'Compartilhar apresentação', shareCopied:'Link copiado.', shareFailed:'Não foi possível copiar. Selecione o link abaixo para copiar.', shareLink:'Link público para compartilhar' };
  function text(key) { return window.CTHome ? window.CTHome.t(key) : fallback[key]; }
  document.querySelectorAll('[data-public-share]').forEach(function (host) {
    var destination = destinations[host.dataset.publicShare];
    if (!destination) return;
    var button = host.querySelector('button'), label = host.querySelector('[data-share-label]');
    var feedback = host.querySelector('[role="status"]'), input = host.querySelector('input');
    var pending = false, message = '';
    function labels() {
      label.textContent = text(destination.label);
      input.setAttribute('aria-label', text('shareLink'));
      feedback.textContent = message ? text(message) : '';
      host.classList.toggle('has-feedback', !!message);
    }
    input.value = destination.url;
    input.addEventListener('focus', function () { input.select(); });
    button.addEventListener('click', async function () {
      if (pending) return;
      pending = true; button.disabled = true; button.setAttribute('aria-busy', 'true');
      message = ''; feedback.textContent = ''; input.hidden = true;
      // Never derive a payload from location.href, query parameters, event IDs or session data.
      var payload = { title:destination.title, url:destination.url };
      try {
        var supported = false;
        try { supported = typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare(payload)); } catch (_) {}
        if (supported) {
          try { await navigator.share(payload); return; }
          catch (error) { if (error && error.name === 'AbortError') return; }
        }
        try { await navigator.clipboard.writeText(destination.url); message = 'shareCopied'; }
        catch (_) { message = 'shareFailed'; input.hidden = false; }
      } finally {
        pending = false; button.disabled = false; button.removeAttribute('aria-busy'); labels();
      }
    });
    document.addEventListener('ct:language', labels);
    labels(); host.hidden = false;
  });
}());
