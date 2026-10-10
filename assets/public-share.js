(function () {
  'use strict';
  var destinations = {
    home: { url:'https://cariocaticket.com.br/', title:'Carioca Ticket', label:'shareSite' },
    program: { url:'https://cariocaticket.com.br/parceiro/programa/', title:'Programa Parceiro Carioca Ticket', label:'shareProgram' }
  };
  var fallback = { shareSite:'Compartilhar site', shareProgram:'Compartilhar apresentação', shareEvent:'Compartilhar evento:', shareCopied:'Link copiado.', shareFailed:'Não foi possível copiar. Selecione o link abaixo para copiar.', shareLink:'Link público para compartilhar' };
  function text(key) { return window.CTHome ? window.CTHome.t(key) : fallback[key]; }
  var eventCopy = {
    'pt-BR': { cta:'Confira este evento na Carioca Ticket.', copied:'Mensagem copiada.', failed:'Não foi possível copiar. Selecione a mensagem abaixo para copiar.', label:'Mensagem do evento para compartilhar' },
    'en-US': { cta:'Check out this event on Carioca Ticket.', copied:'Message copied.', failed:'Could not copy. Select the message below to copy it.', label:'Event message to share' },
    'es': { cta:'Descubre este evento en Carioca Ticket.', copied:'Mensaje copiado.', failed:'No se pudo copiar. Selecciona el mensaje de abajo para copiarlo.', label:'Mensaje del evento para compartir' },
    'zh-Hans': { cta:'在 Carioca Ticket 查看此活动。', copied:'消息已复制。', failed:'无法复制。请选择下方消息进行复制。', label:'用于分享的活动消息' }
  };
  function locale() {
    var value = window.CTHome && window.CTHome.locale;
    if (!value && window.CTPublicI18n && typeof window.CTPublicI18n.getLocale === 'function') value = window.CTPublicI18n.getLocale();
    if (!value) { try { value = window.localStorage.getItem('ct-home-locale'); } catch (_) {} }
    return Object.prototype.hasOwnProperty.call(eventCopy, value) ? value : 'pt-BR';
  }
  function copy() { return eventCopy[locale()]; }
  function eventText(destination) {
    // A single line remains fully selectable in the existing fallback input.
    return [destination.title, destination.date, destination.venue, copy().cta].filter(Boolean).join(' · ');
  }
  var mounted = new WeakMap();
  var whatsAppLinks = new WeakMap();
  var whatsAppBound = new WeakSet();
  var whatsAppLabels = { 'pt-BR':'Compartilhar no WhatsApp', 'en-US':'Share on WhatsApp', es:'Compartir en WhatsApp', 'zh-Hans':'通过 WhatsApp 分享' };
  function updateWhatsApp(link) {
    var entry = whatsAppLinks.get(link);
    if (!entry) return;
    var destination = entry.destination;
    var language = locale();
    var message = destination.event ? eventText(destination) + ' ' + destination.url : destination.title + ' ' + destination.url;
    link.textContent = whatsAppLabels[language];
    link.lang = language;
    link.setAttribute('aria-label', whatsAppLabels[language] + (destination.event ? ': ' + destination.title : ''));
    link.href = 'https://wa.me/?text=' + encodeURIComponent(message);
    link.hidden = false;
  }
  function mountWhatsApp(link, destination, onClick) {
    if (!link) return;
    if (!whatsAppBound.has(link)) {
      whatsAppBound.add(link);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.addEventListener('click', function (event) {
        event.stopPropagation();
        if (activeShare || link.closest('[inert]') || !whatsAppLinks.has(link)) { event.preventDefault(); return; }
        updateWhatsApp(link);
        var callback = whatsAppLinks.get(link).onClick;
        if (callback) callback();
      });
    }
    whatsAppLinks.set(link, { destination:destination, onClick:onClick });
    updateWhatsApp(link);
  }
  // Public data only. No current query string, form fields or recipient number.
  window.CTPublicShare = {
    eventWhatsApp: function (link, event, id, onClick) {
      function clean(value) { return typeof value === 'string' ? value.trim() : ''; }
      if (!link || !event || !clean(id)) return;
      mountWhatsApp(link, { event:true, title:clean(event.nome) || 'Carioca Ticket',
        date:[clean(event.data), clean(event.horario)].filter(Boolean).join(' · '),
        venue:[clean(event.local), clean(event.cidade), clean(event.uf)].filter(Boolean).join(' · '),
        url:'https://cariocaticket.com.br/evento/?evento=' + encodeURIComponent(id) }, onClick);
    },
    clearEventWhatsApp: function (link) {
      if (link) { whatsAppLinks.delete(link); link.hidden = true; link.removeAttribute('href'); }
    }
  };
  var activeShare = false;
  function mount(host, destination) {
    if (!destination || mounted.has(host)) return;
    var button = host.querySelector('button'), label = host.querySelector('[data-share-label]');
    var feedback = host.querySelector('[role="status"]'), input = host.querySelector('input');
    var pending = false, message = '';
    // Keep the lifecycle target stable even if filters re-render the card while
    // the native share sheet or clipboard promise is still open.
    var activityTarget = host.closest('#event-feature') || host;
    function notify(phase) { activityTarget.dispatchEvent(new CustomEvent('ct:public-share', { bubbles:true, detail:{ phase:phase, host:host } })); }
    var whatsApp = document.createElement('a');
    whatsApp.className = 'ct-whatsapp-share';
    host.insertBefore(whatsApp, feedback);
    mountWhatsApp(whatsApp, destination, function () { notify('interaction'); });
    function labels() {
      label.textContent = text(destination.label);
      input.setAttribute('aria-label', destination.event ? copy().label : text('shareLink'));
      feedback.textContent = message ? (destination.event ? copy()[message === 'shareCopied' ? 'copied' : 'failed'] : text(message)) : '';
      input.value = destination.event ? eventText(destination) + ' ' + destination.url : destination.url;
      host.classList.toggle('has-feedback', !!message);
      updateWhatsApp(whatsApp);
    }
    input.value = destination.url;
    input.addEventListener('focus', function () { input.select(); });
    // A share/copy/select gesture must not become a carousel drag or card click.
    host.addEventListener('pointerdown', function (event) { event.stopPropagation(); notify('interaction'); });
    button.addEventListener('click', async function (event) {
      event.preventDefault(); event.stopPropagation();
      if (pending || activeShare || host.closest('[inert]')) return;
      activeShare = true;
      pending = true; button.disabled = true; button.setAttribute('aria-busy', 'true');
      notify('start');
      message = ''; feedback.textContent = ''; input.hidden = true;
      // Only fixed destinations or IDs/titles already in the public catalog.
      // Never forward the current URL, attribution/query parameters or session data.
      var payload = { title:destination.title, url:destination.url };
      if (destination.event) payload.text = eventText(destination);
      var clipboardText = destination.event ? payload.text + ' ' + destination.url : destination.url;
      try {
        var supported = false;
        try { supported = typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare(payload)); } catch (_) {}
        if (supported) {
          try { await navigator.share(payload); return; }
          catch (error) { if (error && error.name === 'AbortError') return; }
        }
        try { await navigator.clipboard.writeText(clipboardText); message = 'shareCopied'; }
        catch (_) { message = 'shareFailed'; input.hidden = false; }
      } finally {
        pending = false; activeShare = false; button.disabled = false; button.removeAttribute('aria-busy'); labels();
        notify('end');
      }
    });
    mounted.set(host, labels);
    labels(); host.hidden = false;
  }
  document.querySelectorAll('[data-public-share]').forEach(function (host) {
    mount(host, destinations[host.dataset.publicShare]);
  });
  // Enhance only original public catalog cards. No cloned nodes or changes to
  // the catalog loader, filtering, event destination or checkout destination.
  var grid = document.getElementById('events-grid');
  function mountCards() {
    grid.querySelectorAll('.catalog-card').forEach(function (card) {
      var title = card.querySelector('.catalog-title a'), actions = card.querySelector('.catalog-actions');
      if (!title || !actions || !card.dataset.eventId || card.querySelector('[data-public-share="event"]')) return;
      var host = document.createElement('div');
      host.className = 'ct-public-share'; host.dataset.publicShare = 'event'; host.hidden = true;
      // This template is static; catalog text is inserted only via textContent.
      host.innerHTML = '<button type="button"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 16V3m-5 5 5-5 5 5M5 13v7h14v-7"/></svg><span class="sr-only" data-share-label data-i18n="shareEvent"></span><span class="sr-only" data-share-event-title></span></button><p role="status"></p><input type="text" readonly hidden>';
      var eventTitle = host.querySelector('[data-share-event-title]');
      eventTitle.textContent = ' ' + title.textContent;
      eventTitle.lang = title.lang || document.documentElement.lang; eventTitle.setAttribute('translate', 'no');
      actions.appendChild(host);
      mount(host, { url:'https://cariocaticket.com.br/evento/?evento=' + encodeURIComponent(card.dataset.eventId), title:title.textContent, date:card.dataset.shareDate || '', venue:card.dataset.shareVenue || '', event:true, label:'shareEvent' });
    });
  }
  if (grid) { new MutationObserver(mountCards).observe(grid, { childList:true }); mountCards(); }
  document.addEventListener('ct:language', function () {
    document.querySelectorAll('[data-public-share]').forEach(function (host) { var labels = mounted.get(host); if (labels) labels(); });
  });
  function refreshWhatsApp() { document.querySelectorAll('.ct-whatsapp-share').forEach(updateWhatsApp); }
  document.addEventListener('ct:public-language', refreshWhatsApp);
  window.addEventListener('storage', function (event) { if (!event.key || event.key === 'ct-home-locale') refreshWhatsApp(); });
}());


