(function () {
  'use strict';
  function eventPublicUrl() { return 'https://cariocaticket.com.br/'; }
  async function resolveShareUrl(id) {
    try { return window.CTPublishedShareIndex ? await window.CTPublishedShareIndex.resolve(id) : eventPublicUrl(); }
    catch (_) { return eventPublicUrl(); }
  }
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
  var sharingLabels = { 'pt-BR':'Compartilhamento', 'en-US':'Sharing', es:'Compartir', 'zh-Hans':'分享' };
  function renderWhatsAppControl(link, language) {
    var control = link.parentElement;
    if (!control || !control.classList.contains('ct-whatsapp-control')) {
      control = document.createElement('span');
      control.className = 'ct-whatsapp-control';
      var heading = document.createElement('span');
      heading.className = 'ct-whatsapp-heading';
      link.parentNode.insertBefore(control, link);
      control.appendChild(heading);
      control.appendChild(link);
      // Local Font Awesome 6.7.2 brand asset; attribution lives with the SVG.
      var icon = document.createElement('img');
      icon.src = '/assets/whatsapp-brand.svg';
      icon.alt = ''; icon.width = 24; icon.height = 24;
      icon.setAttribute('aria-hidden', 'true');
      link.replaceChildren(icon);
    }
    control.firstElementChild.textContent = sharingLabels[language];
    control.firstElementChild.lang = language;
    control.hidden = false;
    link.title = whatsAppLabels[language];
  }
  function unavailableShare() { return { 'pt-BR':'Compartilhamento deste evento indisponível no momento. Atualize e tente novamente.', 'en-US':'Sharing this event is currently unavailable. Refresh and try again.', es:'No se puede compartir este evento ahora. Actualiza e inténtalo de nuevo.', 'zh-Hans':'暂时无法分享此活动。请刷新后重试。' }[locale()]; }
  function shareUnavailable(link) {
    var status = link.parentElement.querySelector('[role="status"]');
    if (!status) { status = document.createElement('span'); status.setAttribute('role', 'status'); link.parentElement.appendChild(status); }
    status.textContent = unavailableShare();
  }
  function updateWhatsApp(link) {
    var entry = whatsAppLinks.get(link);
    if (!entry) return;
    var destination = entry.destination;
    var language = locale();
    var message = destination.event ? 'Carioca Ticket ' + eventPublicUrl() : destination.title + ' ' + destination.url;
    if (destination.url === destinations.program.url) link.textContent = whatsAppLabels[language];
    else renderWhatsAppControl(link, language);
    link.lang = language;
    link.setAttribute('aria-label', whatsAppLabels[language] + (destination.event ? ': ' + destination.title : ''));
    if (destination.event) { link.removeAttribute('href'); link.setAttribute('role', 'button'); link.tabIndex = 0; }
    else link.href = 'https://wa.me/?text=' + encodeURIComponent(message);
    link.hidden = false;
  }
  function mountWhatsApp(link, destination, onClick) {
    if (!link) return;
    if (!whatsAppBound.has(link)) {
      whatsAppBound.add(link);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.addEventListener('keydown', function (event) {
        if (link.getAttribute('role') === 'button' && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); link.click(); }
      });
      link.addEventListener('click', async function (event) {
        event.stopPropagation();
        if (activeShare || link.closest('[inert]') || !whatsAppLinks.has(link)) { event.preventDefault(); return; }
        var entry = whatsAppLinks.get(link);
        if (!entry.destination.event) {
          updateWhatsApp(link);
          if (entry.onClick) entry.onClick();
          return;
        }
        event.preventDefault();
        activeShare = true;
        link.setAttribute('aria-busy', 'true');
        var popup = null;
        try {
          // Existing _blank behavior, reserved inside the user gesture for async validation.
          popup = window.open('about:blank', '_blank');
          if (!popup) {
            var status = link.parentElement.querySelector('[role="status"]');
            if (!status) { status = document.createElement('span'); status.setAttribute('role', 'status'); link.parentElement.appendChild(status); }
            status.textContent = 'Não foi possível abrir o WhatsApp. Permita a abertura de uma nova guia e tente novamente.';
            return;
          }
          popup.opener = null;
          var referrer = popup.document.createElement('meta');
          referrer.name = 'referrer'; referrer.content = 'no-referrer';
          popup.document.head.appendChild(referrer);
          var url = await resolveShareUrl(entry.destination.eventId);
          if (whatsAppLinks.get(link) !== entry || !link.isConnected || link.closest('[inert]')) { popup.close(); return; }
          if (url === eventPublicUrl()) { popup.close(); shareUnavailable(link); return; }
          var message = eventText(entry.destination) + ' ' + url;
          popup.location.replace('https://wa.me/?text=' + encodeURIComponent(message));
          if (entry.onClick) entry.onClick();
        } catch (_) { if (popup) popup.close(); }
        finally { activeShare = false; link.removeAttribute('aria-busy'); }

      });
    }
    whatsAppLinks.set(link, { destination:destination, onClick:onClick });
    updateWhatsApp(link);
  }
  // Public data only. No current query string, form fields or recipient number.
  window.CTPublicShare = {
    resolveEventUrl: resolveShareUrl,
    eventWhatsApp: function (link, event, id, onClick) {
      function clean(value) { return typeof value === 'string' ? value.trim() : ''; }
      if (!link || !event || !clean(id)) return;
      mountWhatsApp(link, { event:true, eventId:clean(id), title:clean(event.nome) || 'Carioca Ticket',
        date:[clean(event.data), clean(event.horario)].filter(Boolean).join(' · '),
        venue:[clean(event.local), clean(event.cidade), clean(event.uf)].filter(Boolean).join(' · '),
        url:eventPublicUrl(id) }, onClick);
    },
    clearEventWhatsApp: function (link) {
      if (link) { whatsAppLinks.delete(link); link.hidden = true; link.removeAttribute('href');
        if (link.parentElement && link.parentElement.classList.contains('ct-whatsapp-control')) link.parentElement.hidden = true;
      }
    }
  };
  var activeShare = false;
  function mount(host, destination) {
    if (!destination || mounted.has(host)) return;
    var button = host.querySelector('button'), label = host.querySelector('[data-share-label]');
    var feedback = host.querySelector('[role="status"]'), input = host.querySelector('input');
    var pending = false, message = '', resolvedFallback = null;
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
      feedback.textContent = message === 'shareUnavailable' ? unavailableShare() : (message ? (destination.event ? copy()[message === 'shareCopied' ? 'copied' : 'failed'] : text(message)) : '');
      input.value = destination.event ? ((resolvedFallback && resolvedFallback !== eventPublicUrl()) ? eventText(destination) + ' ' + resolvedFallback : 'Carioca Ticket ' + eventPublicUrl()) : destination.url;
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
      message = ''; resolvedFallback = null; feedback.textContent = ''; input.hidden = true;
      // Only fixed destinations or IDs/titles already in the public catalog.
      // Never forward the current URL, attribution/query parameters or session data.
      try {
      var resolvedUrl = destination.event ? await resolveShareUrl(destination.eventId) : destination.url;
      if (host.closest('[inert]') || !host.isConnected) return;
      resolvedFallback = resolvedUrl;
      var deniedEvent = destination.event && resolvedUrl === eventPublicUrl();
      if (deniedEvent) { message = 'shareUnavailable'; return; }
      var payload = { title:deniedEvent ? 'Carioca Ticket' : destination.title, url:resolvedUrl };
      if (destination.event) payload.text = deniedEvent ? 'Carioca Ticket' : eventText(destination);
      var clipboardText = destination.event ? payload.text + ' ' + resolvedUrl : resolvedUrl;
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
      mount(host, { eventId:card.dataset.eventId, url:eventPublicUrl(card.dataset.eventId), title:title.textContent, date:card.dataset.shareDate || '', venue:card.dataset.shareVenue || '', event:true, label:'shareEvent' });
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




