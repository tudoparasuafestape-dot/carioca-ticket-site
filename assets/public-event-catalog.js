(function () {
  'use strict';

  // Presentation-only exceptions: ended Samba and ERA moved off this showcase.
  // Direct links, order recovery and sales policy remain unchanged.
  var hiddenCatalogEventIds = new Set([
    'EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD',
    'EVT-23112026-ERA-BEAUTY-EAC4B673'
  ]);

  var Clock = window.CTPublicCatalogClock;
  var expirationHandler = function () {}, resumeHandler = function () {};
  var lease = Clock && Clock.eligibilityContract === 'CT_PUBLIC_ELIGIBILITY_EXCLUSIVE_V1' && Clock.create({ maxAgeMs: 300000, onExpire: function (reason) { expirationHandler(reason); } });

  // The loader must return the server's public, published catalog only.
  // Never derive eligibility from EVENTOS rows or the administrative active flag.
  function mount(loadCatalog) {
    var grid = document.getElementById('events-grid');
    var status = document.getElementById('catalog-status');
    var message = document.getElementById('catalog-status-message');
    var retry = document.getElementById('catalog-retry');
    var input = document.getElementById('event-search-input');
    var locationInput = document.getElementById('event-location-input');
    var feedback = document.getElementById('event-search-feedback');
    var count = document.getElementById('event-count');
    var empty = document.getElementById('no-events');
    var events = [], query = '', locationQuery = '', ready = false, requestId = 0, phase = 'loading';
    var inFlight = null, eventTimer = null, refreshTimer = null, lastAttempt = -Infinity;

    // Reuse presentation nodes only within this authoritative response. Nothing
    // is persisted across page visits, retries, new responses or locale changes.
    var cards = new Map(), positions = new Map(), searchText = new Map();
    var I = window.CTHome;
    var H = I && typeof I.matches === 'function' ? I : null;
    function tr(key, fallback, values) { return I ? I.t(key, values) : fallback; }

    function text(value) { return typeof value === 'string' ? value.trim() : ''; }
    function normalize(value) {
      return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }
    function node(tag, className, content) {
      var element = document.createElement(tag);
      element.className = className;
      if (content) element.textContent = content;
      return element;
    }
    function imageUrl(value) {
      try {
        var url = new URL(text(value), location.origin);
        if (!text(value) || url.username || url.password) return '';
        return url.protocol === 'https:' || (url.origin === location.origin && url.protocol === 'http:') ? url.href : '';
      } catch (_) { return ''; }
    }
    function original(element) {
      element.lang = I ? I.sourceLanguage : (document.documentElement.lang || 'pt-BR');
      element.setAttribute('translate', 'no');
      element.classList.add('catalog-original');
      return element;
    }
    function card(event, index, visibleIndex) {
      var visual = event.visual || {};
      var token = 'catalog-event-' + index;
      var detail = '/evento/?evento=' + encodeURIComponent(event.id);
      var article = node('article', 'catalog-card');
      article.dataset.eventId = event.id;
      // Only public catalog facts, never attribution, invitation or session data.
      article.dataset.shareDate = [text(event.data), text(event.horario)].filter(Boolean).join(' · ');
      article.dataset.shareVenue = [text(event.local), text(event.cidade), text(event.uf)].filter(Boolean).join(' · ');
      var cover = node('a', 'catalog-photo');
      cover.href = detail;
      var coverLabel = node('span', 'sr-only', tr('viewEvent', 'Ver evento') + ':');
      coverLabel.id = token + '-view';
      cover.appendChild(coverLabel);
      cover.setAttribute('aria-labelledby', coverLabel.id + ' ' + token + '-title');
      var fallback = node('span', 'catalog-image-fallback', tr('coverMissing', 'Capa indisponível'));
      cover.appendChild(fallback);
      var src = imageUrl(visual.capaUrl || visual.posterUrl);
      if (src) {
        var image = node('img', '');
        // The enclosing link names the event using separately marked language nodes.
        image.alt = '';
        image.loading = visibleIndex < 2 ? 'eager' : 'lazy';
        image.decoding = 'async';
        // Keep lazy images measurable so the browser can start loading near the viewport.
        image.style.opacity = '0';
        fallback.textContent = tr('coverLoading', 'Carregando capa…');
        image.onload = function () { image.style.opacity = '1'; fallback.hidden = true; };
        image.onerror = function () { image.hidden = true; fallback.hidden = false; fallback.textContent = tr('coverMissing', 'Capa indisponível'); };
        // Overlapped carousel cards are all geometrically near the viewport,
        // so native lazy loading alone can fetch the complete catalog. Only a
        // successfully initialized rail defers URLs beyond its first pair.
        // Without that optional enhancement, retain native lazy-list behavior.
        if (visibleIndex > 1 && grid.dataset.catalogCoverWindow === 'ready') image.dataset.catalogSrc = src;
        else image.src = src;
        cover.appendChild(image);
      }
      var body = node('div', 'catalog-body');
      if (text(visual.categoria)) {
        var category = I && I.categoryLabel ? I.categoryLabel(visual.categoria) : { text: visual.categoria, language: I ? I.sourceLanguage : 'pt-BR' };
        var kicker = node('span', 'event-kicker' + (category.known ? '' : ' catalog-original'), category.text);
        kicker.lang = category.language; kicker.setAttribute('translate', 'no');
        body.appendChild(kicker);
      }
      var heading = node('h3', 'catalog-title');
      var titleLink = original(node('a', '', event.nome));
      titleLink.id = token + '-title';
      titleLink.href = detail;
      heading.appendChild(titleLink);
      body.appendChild(heading);
      var date = [text(event.data), text(event.horario)].filter(Boolean).join(' · ');
      var venue = [text(event.local), [text(event.cidade), text(event.uf)].filter(Boolean).join(' / ')].filter(Boolean).join(' · ');
      body.appendChild(date ? original(node('p', 'catalog-meta', date)) : node('p', 'catalog-meta', tr('dateMissing', 'Data e horário não informados')));
      body.appendChild(venue ? original(node('p', 'catalog-venue', venue)) : node('p', 'catalog-venue', tr('venueMissing', 'Local não informado')));
      if (text(visual.descricaoCurta)) body.appendChild(original(node('p', 'catalog-description', visual.descricaoCurta)));
      var actions = node('div', 'catalog-actions');
      var buy = node('a', 'btn btn-primary');
      buy.href = '/checkout/?evento=' + encodeURIComponent(event.id);
      var buyLabel = node('span', 'sr-only', tr('buy', 'Comprar ingresso') + ':');
      var buyText = node('span', '', tr('buy', 'Comprar ingresso'));
      buyText.dataset.i18n = 'buy';
      buyText.setAttribute('aria-hidden', 'true');
      buy.appendChild(buyText);
      buyLabel.id = token + '-buy';
      buy.appendChild(buyLabel);
      buy.setAttribute('aria-labelledby', buyLabel.id + ' ' + token + '-title');
      var more = node('a', 'event-secondary', tr('viewEvent', 'Ver evento'));
      more.dataset.i18n = 'viewEvent';
      more.href = detail;
      if(window.CTAdvanceSales && window.CTAdvanceSales.closed(event.id)){
        body.appendChild(original(node('p', 'catalog-description', window.CTAdvanceSales.message)));
        actions.append(more);
      }else actions.append(buy, more);
      body.appendChild(actions);
      article.append(cover, body);
      return article;
    }
    function validTemporal(event) {
      var temporal = event.temporal;
      if (!temporal || !Clock) return false;
      if (temporal.state === 'LEGADO_SEM_FIM') {
        return temporal.inicioEm === null && temporal.fimEm === null &&
          temporal.fusoHorario === null && temporal.temporalVersion === null;
      }
      if (temporal.state !== 'TEMPORAL_V1' || temporal.temporalVersion !== 1 ||
          typeof temporal.fusoHorario !== 'string' || (temporal.fusoHorario !== 'UTC' &&
          !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$/.test(temporal.fusoHorario))) return false;
      var start = Clock.instant(temporal.inicioEm), end = Clock.instant(temporal.fimEm);
      return Number.isFinite(start) && Number.isFinite(end) && end > start;
    }
    function survives(event) {
      return validTemporal(event) && (event.temporal.state === 'LEGADO_SEM_FIM' ||
        lease.remainingUntil(event.temporal.fimEm) > 0);
    }
    function clearEventTimer() { clearTimeout(eventTimer); eventTimer = null; }
    function clearView() {
      clearEventTimer(); ready = false;
      events = []; cards.clear(); positions.clear(); searchText.clear();
      grid.replaceChildren();
      empty.hidden = true; feedback.textContent = '';
      if (H) H.updateCategories([]);
    }
    function unavailable() {
      clearView(); phase = 'error';
      status.hidden = false; retry.hidden = false;
      grid.setAttribute('aria-busy', 'false');
      count.textContent = tr('unavailable', 'Agenda temporariamente indisponível.');
      message.textContent = tr('loadError', 'Não foi possível carregar os eventos. Tente novamente.');
    }
    function queueRefresh() {
      if (document.hidden || inFlight || refreshTimer !== null) return;
      // Even a very short successful lease cannot create a busy retry loop.
      var elapsed = performance.now() - lastAttempt;
      var delay = Number.isFinite(elapsed) && elapsed >= 0 ? Math.max(0, 5000 - elapsed) : 5000;
      refreshTimer = setTimeout(function () { refreshTimer = null; if (!document.hidden) load(true); }, delay);
    }
    function prune() {
      if (!ready || !lease || !lease.isFresh()) return false;
      var removed = false;
      events = events.filter(function (event) {
        if (survives(event)) return true;
        cards.delete(event.id); searchText.delete(event.id); removed = true;
        return false;
      });
      if (removed) queueRefresh();
      return ready;
    }
    function armEvents() {
      clearEventTimer();
      if (!ready || !lease.isFresh()) return;
      var next = Infinity;
      events.forEach(function (event) {
        if (event.temporal.state === 'TEMPORAL_V1') next = Math.min(next, lease.remainingUntil(event.temporal.fimEm));
      });
      if (Number.isFinite(next)) eventTimer = setTimeout(function () { eventTimer = null; render(); }, Math.min(Math.max(0, next), 2147483647));
    }
    function render() {
      if (!prune()) return;

      var filtered = events.filter(function (event) {
        var visual = event.visual || {};
        if (query && !searchText.has(event.id)) searchText.set(event.id, normalize([event.nome, event.data, event.horario, event.local, event.cidade, event.uf, visual.categoria, I && I.categoryLabel ? I.categoryLabel(visual.categoria).text : '', visual.descricaoCurta].filter(Boolean).join(' ')));
        var matchesQuery = !query || searchText.get(event.id).includes(query);
        var matchesLocation = !locationQuery || normalize([event.local, event.cidade, event.uf].filter(Boolean).join(' ')).includes(locationQuery);
        return matchesQuery && matchesLocation && (!H || H.matches(event, true));
      });
      var fragment = document.createDocumentFragment();
      filtered.forEach(function (event, index) {
        if (!cards.has(event.id)) cards.set(event.id, card(event, positions.get(event.id), index));
        var element = cards.get(event.id), image = element.querySelector('.catalog-photo img');
        // Stable IDs use response order, while loading priority follows the
        // visible result. Filtering must never make the first cover lazy.
        if (image && index < 2) image.loading = 'eager';
        fragment.appendChild(element);
      });
      grid.replaceChildren(fragment);
      count.textContent = tr(filtered.length === 1 ? 'availableOne' : 'availableMany', filtered.length + (filtered.length === 1 ? ' evento disponível para compra.' : ' eventos disponíveis para compra.'), { n: filtered.length });
      empty.hidden = !events.length || !!filtered.length;
      feedback.textContent = (query || locationQuery || (H && (H.filters.location || H.filters.period !== 'all' || H.filters.category))) && events.length ? (filtered.length ? tr(filtered.length === 1 ? 'foundOne' : 'foundMany', filtered.length + (filtered.length === 1 ? ' evento encontrado.' : ' eventos encontrados.'), { n: filtered.length }) : tr('noMatch', 'Nenhum evento encontrado para essa pesquisa.')) : '';
      status.hidden = !!events.length;
      if (!events.length) message.textContent = tr('emptyCatalog', 'Nenhum evento disponível no momento. Volte em breve para conferir a agenda.');
      if (H) H.updateCategories(events);
      armEvents();
    }
    async function load(preserve) {
      clearTimeout(refreshTimer); refreshTimer = null;
      var current = ++requestId;
      if (inFlight) inFlight.cancel();
      inFlight = null;
      if (!lease) { unavailable(); return; }
      if (document.hidden) { unavailable(); return; }
      var keepView = preserve === true && ready && lease.isFresh();
      if (!keepView) {
        clearView(); phase = 'loading';
        status.hidden = false; retry.hidden = true;
        count.textContent = tr('consulting', 'Consultando a agenda…');
        message.textContent = tr('loading', 'Carregando eventos…');
      }
      grid.setAttribute('aria-busy', 'true');
      var timer, request;
      try {
        lastAttempt = performance.now();
        request = inFlight = loadCatalog();
        var result = await Promise.race([
          request.promise,
          new Promise(function (_, reject) { timer = setTimeout(function () { reject(new Error('CATALOG_TIMEOUT')); }, 20000); })
        ]);
        if (current !== requestId) return;
        if (!result || result.sucesso !== true || !Array.isArray(result.eventos)) throw new Error('CATALOG_INVALID');
        if (!lease.accept(result, request.ticket)) throw new Error('CATALOG_CLOCK_INVALID');
        var seen = new Set();
        var nextEvents = result.eventos.map(function (event) {
          if (!event || !text(event.id) || !text(event.nome)) throw new Error('CATALOG_INVALID_EVENT');
          return event;
        }).filter(function (event) {
          if (hiddenCatalogEventIds.has(event.id)) return false;
          if (seen.has(event.id)) return false;
          seen.add(event.id);
          return survives(event);
        });
        if (!lease.isFresh()) throw new Error('CATALOG_EXPIRED');
        // No persisted catalog or legacy fallback can bypass a fresh envelope.
        events = nextEvents; cards.clear(); positions.clear(); searchText.clear();
        events.forEach(function (event, index) { positions.set(event.id, index); });
        inFlight = null;
        ready = true; phase = 'ready'; retry.hidden = true;
        render();
      } catch (_) {
        if (current !== requestId) return;
        lease.invalidate('request-failed');
        unavailable();
      } finally {
        clearTimeout(timer);
        if (request) request.cancel();
        if (current === requestId) {
          inFlight = null;
          grid.setAttribute('aria-busy', 'false');
        }
      }
    }
    expirationHandler = function (reason) {
      unavailable();
      if (reason === 'expired') queueRefresh();
    };
    resumeHandler = function (reason) {
      // A monotonic clock may pause during device sleep. Never extrapolate a
      // pre-suspension lease, even if performance.now() barely advanced.
      ++requestId;
      if (inFlight) inFlight.cancel();
      inFlight = null;
      clearTimeout(refreshTimer); refreshTimer = null;
      if (initialRequest) initialRequest.cancel();
      initialRequest = null;
      if (lease) lease.invalidate(reason);
      unavailable();
      if (!document.hidden && reason !== 'pagehide') queueRefresh();
    };
    // A delayed timer must not leave an expired detail, checkout or share CTA
    // activatable. Recheck before the default action or bubbling share handler.
    function guardAction(event) {
      var target = event.target && event.target.closest ? event.target.closest('.catalog-card') : null;
      if (!target || !grid.contains(target)) return;
      var id = target.dataset.eventId;
      var allowed = ready && lease && lease.isFresh() && events.some(function (item) { return item.id === id && survives(item); });
      if (!allowed) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (ready) render();
      }
    }
    grid.addEventListener('click', guardAction, true);
    grid.addEventListener('auxclick', guardAction, true);
    grid.addEventListener('contextmenu', guardAction, true);
    grid.addEventListener('dragstart', guardAction, true);
    grid.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') guardAction(event);
    }, true);
    document.getElementById('event-search-form').addEventListener('submit', function (event) {
      event.preventDefault();
      query = normalize(input.value);
      locationQuery = !H && locationInput && !locationInput.readOnly ? normalize(locationInput.value) : '';
      render();
    });
    document.getElementById('clear-event-search').addEventListener('click', function () {
      input.value = query = '';
      locationQuery = '';
      if (H) H.resetFilters(); else if (locationInput) locationInput.value = '';
      render();
      input.focus();
    });
    document.addEventListener('ct:filters', render);
    document.addEventListener('ct:language', function () {
      cards.clear(); searchText.clear();
      if (ready) render();
      else { count.textContent = tr(phase === 'error' ? 'unavailable' : 'consulting', ''); message.textContent = tr(phase === 'error' ? 'loadError' : 'loading', ''); }
    });
    retry.addEventListener('click', load);
    load();
  }
  // Reuse the public POST/iframe bridge used by /evento/ and /checkout/.
  // This adapter exposes one read-only method and sends no session credentials.
  function loadPublicEvents() {
    var abort = function () {};
    var promise = new Promise(function (resolve, reject) {
      var app = 'https://script.google.com/macros/s/AKfycbz28keO65PIIElB8dWMBt8nnEBw9CzBxWnc6nOhAKKGNDkMZnYbWjrhTtr_v-lEI2IAJA/exec';
      var id = 'CTCATALOG-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
      var frame = document.createElement('iframe');
      frame.name = id;
      frame.hidden = true;
      frame.setAttribute('aria-hidden', 'true');
      var form = document.createElement('form');
      form.hidden = true;
      form.method = 'POST';
      form.action = app;
      form.target = frame.name;
      var fields = { ctMinhaCariocaAction: 'publicRpc', ctMinhaCariocaRequestId: id, metodo: 'ctEventosPublicosListarPROD', argsJson: '[]' };
      Object.keys(fields).forEach(function (key) {
        var input = document.createElement('input');
        input.type = 'hidden'; input.name = key; input.value = fields[key];
        form.appendChild(input);
      });
      function cleanup() {
        clearTimeout(timer);
        window.removeEventListener('message', receive);
        frame.remove(); form.remove();
      }
      abort = function () { cleanup(); reject(new Error('CATALOG_CANCELLED')); };
      function receive(event) {
        if (event.origin !== 'https://script.google.com' && !/^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/.test(event.origin)) return;
        // Apps Script may post from its nested sandbox, as in the existing public bridge.
        // Match the trusted origin and this request's unpredictable identifier.
        var payload = event.data;
        if (!payload || payload.ctMinhaCariocaPost !== true || payload.id !== id) return;
        cleanup();
        if (payload.ok === true) resolve(payload.resultado);
        else reject(new Error('CATALOG_RPC_FAILED'));
      }
      var timer = setTimeout(function () { cleanup(); reject(new Error('CATALOG_RPC_TIMEOUT')); }, 18000);
      window.addEventListener('message', receive);
      document.body.append(frame, form);
      try { form.submit(); } catch (error) { cleanup(); reject(error); }
    });
    return { promise: promise, cancel: function () { abort(); } };
  }
  function requestCatalog() {
    var ticket = lease.begin();
    var request = loadPublicEvents();
    request.ticket = ticket;
    return request;
  }
  // Begin after the shared clock, before optional presentation scripts. Capture
  // the ticket before POST so network time AND deferred mounting spend the lease.
  var initialRequest = null;
  resumeHandler = function (reason) {
    if (lease) lease.invalidate(reason);
    if (initialRequest) initialRequest.cancel();
    initialRequest = null;
  };
  window.addEventListener('focus', function () { resumeHandler('focus'); });
  window.addEventListener('pageshow', function (event) { if (event.persisted) resumeHandler('pageshow'); });
  window.addEventListener('pagehide', function () { resumeHandler('pagehide'); });
  document.addEventListener('visibilitychange', function () { resumeHandler(document.hidden ? 'hidden' : 'visible'); });
  if (lease && !document.hidden) {
    initialRequest = requestCatalog();
    initialRequest.promise.catch(function () {});
  }
  function initialize() {
    mount(function () {
      var request = initialRequest;
      initialRequest = null;
      return request || requestCatalog();
    });
  }
  if (document.readyState === 'complete') initialize();
  else document.addEventListener('DOMContentLoaded', initialize, { once: true });
}());
