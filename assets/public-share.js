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
  var sharingLabels = { 'pt-BR':'Compartilhar', 'en-US':'Share', es:'Compartir', 'zh-Hans':'分享' };
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
  var catalogDialogs = new Map();
  var dialogSequence = 0;
  var chooserCopy = {
    'pt-BR': ['Compartilhar', 'Compartilhar evento', 'Fechar', 'Compartilhar…', 'WhatsApp, Instagram e outros apps', 'Copiar link', 'Ideal para colar no Story ou em uma mensagem'],
    'en-US': ['Share', 'Share event', 'Close', 'Share…', 'WhatsApp, Instagram and other apps', 'Copy link', 'Paste into a Story or a message'],
    es: ['Compartir', 'Compartir evento', 'Cerrar', 'Compartir…', 'WhatsApp, Instagram y otras apps', 'Copiar enlace', 'Para pegar en una historia o un mensaje'],
    'zh-Hans': ['分享', '分享活动', '关闭', '分享…', 'WhatsApp、Instagram 及其他应用', '复制链接', '粘贴到动态或消息中']
  };
  function mount(host, destination) {
    if (!destination || mounted.has(host)) return;
    var button = host.querySelector('button'), label = host.querySelector('[data-share-label]');
    var feedback = host.querySelector('[role="status"]'), input = host.querySelector('input');
    var pending = false, message = '', resolvedFallback = null;
    var chooserEpoch = 0;
    var chooser = null, opener, chooserTitle, closeButton, copyButton, nativeHelp, copyHelp, openerLabel;
    // Keep the lifecycle target stable even if filters re-render the card while
    // the native share sheet or clipboard promise is still open.
    var activityTarget = host.closest('#event-feature') || host;
    function notify(phase) { activityTarget.dispatchEvent(new CustomEvent('ct:public-share', { bubbles:true, detail:{ phase:phase, host:host } })); }
    var whatsApp = document.createElement('a');
    whatsApp.className = 'ct-whatsapp-share';
    host.insertBefore(whatsApp, feedback);
    function afterWhatsApp() { notify('interaction'); if (chooser && chooser.open) chooser.close(); }
    mountWhatsApp(whatsApp, destination, afterWhatsApp);
    function labels() {
      label.textContent = text(destination.label);
      if (chooser) {
        var words = chooserCopy[locale()];
        openerLabel.textContent = words[0]; chooserTitle.textContent = words[1];
        closeButton.setAttribute('aria-label', words[2]); label.textContent = words[3];
        nativeHelp.textContent = words[4]; copyButton.firstElementChild.textContent = words[5]; copyHelp.textContent = words[6];
      }
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
    async function performShare(event, copyOnly) {
      var epoch = chooserEpoch;
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
      if (host.closest('[inert]') || !host.isConnected || (chooser && (!chooser.open || epoch !== chooserEpoch))) return;
      resolvedFallback = resolvedUrl;
      var deniedEvent = destination.event && resolvedUrl === eventPublicUrl();
      if (deniedEvent) { message = 'shareUnavailable'; return; }
      var payload = { title:deniedEvent ? 'Carioca Ticket' : destination.title, url:resolvedUrl };
      if (destination.event) payload.text = deniedEvent ? 'Carioca Ticket' : eventText(destination);
      var clipboardText = destination.event ? payload.text + ' ' + resolvedUrl : resolvedUrl;
        var supported = false;
        try { supported = typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare(payload)); } catch (_) {}
        if (supported && !copyOnly) {
          try { await navigator.share(payload); return; }
          catch (error) { if (error && error.name === 'AbortError') return; }
        }
        if (host.closest('[inert]') || !host.isConnected || (chooser && (!chooser.open || epoch !== chooserEpoch))) return;
        try { await navigator.clipboard.writeText(clipboardText); message = 'shareCopied'; }
        catch (_) { message = 'shareFailed'; input.hidden = false; }
      } finally {
        pending = false; activeShare = false; button.disabled = false; button.removeAttribute('aria-busy'); labels();
        if (!chooser || !chooser.open) notify('end');
      }
    }
    button.addEventListener('click', function (event) { performShare(event, false); });
    if (destination.event) {
      chooser = document.createElement('dialog');
      chooser.className = 'ct-public-share ct-share-dialog';
      chooser.setAttribute('inert', '');
      var head = document.createElement('div'); head.className = 'ct-share-dialog-head';
      chooserTitle = document.createElement('strong');
      chooserTitle.id = 'ct-share-title-' + (++dialogSequence);
      chooser.setAttribute('aria-labelledby', chooserTitle.id);
      closeButton = document.createElement('button'); closeButton.type = 'button'; closeButton.textContent = '×';
      closeButton.addEventListener('click', function () { chooser.close(); });
      head.appendChild(chooserTitle); head.appendChild(closeButton); chooser.appendChild(head);
      label.classList.remove('sr-only'); label.removeAttribute('data-i18n');
      var nativeText = document.createElement('span'); nativeText.appendChild(label);
      nativeHelp = document.createElement('small'); nativeText.appendChild(nativeHelp); button.appendChild(nativeText);
      button.classList.add('ct-share-dialog-action');
      chooser.appendChild(button); chooser.appendChild(whatsApp.parentElement);
      copyButton = document.createElement('button'); copyButton.type = 'button'; copyButton.className = 'ct-share-dialog-action';
      copyButton.appendChild(document.createElement('span')); copyHelp = document.createElement('small'); copyButton.appendChild(copyHelp);
      copyButton.addEventListener('click', function (event) { performShare(event, true); });
      chooser.appendChild(copyButton); chooser.appendChild(feedback); chooser.appendChild(input);
      // Native dialog top layer avoids carousel clipping while retaining inert-card ancestry.
      host.appendChild(chooser);
      opener = document.createElement('button'); opener.type = 'button'; opener.className = 'ct-event-share-opener';
      opener.setAttribute('aria-haspopup', 'dialog');
      opener.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 16a3 3 0 0 0-2.39 1.19L8.91 13.7a3.14 3.14 0 0 0 0-3.4l6.7-3.49A3 3 0 1 0 15 5a3.2 3.2 0 0 0 .09.7L8.4 9.19a3 3 0 1 0 0 5.62l6.69 3.49A3.2 3.2 0 0 0 15 19a3 3 0 1 0 3-3Z"/></svg><span></span>';
      openerLabel = opener.lastElementChild; host.appendChild(opener);
      opener.addEventListener('click', function (event) {
        event.preventDefault(); event.stopPropagation();
        if (activeShare || host.closest('[inert]') || !host.isConnected || chooser.open) return;
        chooserEpoch++; message = ''; resolvedFallback = null; input.hidden = true;
        mountWhatsApp(whatsApp, destination, afterWhatsApp);
        var previousStatus = whatsApp.parentElement.querySelector('[role="status"]');
        if (previousStatus) previousStatus.textContent = '';
        labels(); chooser.removeAttribute('inert'); chooser.showModal(); notify('start'); closeButton.focus();
      });
      chooser.addEventListener('close', function () {
        chooserEpoch++; chooser.setAttribute('inert', '');
        window.CTPublicShare.clearEventWhatsApp(whatsApp); if (!pending) notify('end');
        if (host.isConnected && !host.closest('[inert]')) opener.focus();
      });
      chooser.addEventListener('click', function (event) { if (event.target === chooser) {
        var rect = chooser.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) chooser.close();
      } });
      catalogDialogs.set(host, chooser);
    }
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
    catalogDialogs.forEach(function (dialog, host) {
      if (!host.isConnected) { if (dialog.open) dialog.close(); dialog.remove(); catalogDialogs.delete(host); }
    });
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
      var photo = card.querySelector('.catalog-photo');
      if (!photo) return;
      card.insertBefore(host, photo.nextSibling);
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




