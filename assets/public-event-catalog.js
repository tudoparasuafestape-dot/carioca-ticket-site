(function () {
  'use strict';

  // Presentation-only exceptions: ended Samba and ERA moved off this showcase.
  // Direct links, order recovery and sales policy remain unchanged.
  var hiddenCatalogEventIds = new Set([
    'EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD',
    'EVT-23112026-ERA-BEAUTY-EAC4B673'
  ]);

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
    var Clock = window.CTPublicCatalogClock, catalogClock = null, expiryTimer, nextEventEnd = Infinity;
    var suspended = false;
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
    function authorityExpired() {
      if (!catalogClock || catalogClock.expired()) return true;
      if (catalogClock.legacy) return false;
      var current = catalogClock.now();
      return !Number.isFinite(current) || current >= nextEventEnd;
    }
    function clearAuthority() {
      clearTimeout(expiryTimer);
      if (catalogClock) catalogClock.invalidate();
      catalogClock = null; nextEventEnd = Infinity;
      ready = false;
      events = []; cards.clear(); positions.clear(); searchText.clear();
      grid.replaceChildren();
      if (H) H.updateCategories(events);
    }
    function scheduleExpiry() {
      clearTimeout(expiryTimer);
      if (!ready || !catalogClock) return;
      var remaining = catalogClock.remaining();
      if (!catalogClock.legacy) remaining = Math.min(remaining, nextEventEnd - catalogClock.now());
      var current = requestId;
      expiryTimer = setTimeout(function () {
        if (current !== requestId || !ready) return;
        if (authorityExpired()) { if (document.hidden) suspend(); else refresh(); }
        else scheduleExpiry();
      }, Math.max(1, Math.ceil(remaining)));
    }
    function render() {
      if (!ready) return;
      // Timers can be delayed in background tabs. Check again synchronously
      // before any filter, locale change or link activation uses this response.
      if (authorityExpired()) { refresh(); return; }
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
    }
    async function load() {
      var current = ++requestId;
      clearAuthority(); phase = 'loading';
      grid.setAttribute('aria-busy', 'true');
      status.hidden = false;
      retry.hidden = true;
      empty.hidden = true;
      feedback.textContent = '';
      count.textContent = tr('consulting', 'Consultando a agenda…');
      message.textContent = tr('loading', 'Carregando eventos…');
      var timer;
      try {
        var response = await Promise.race([
          Promise.resolve().then(loadCatalog),
          new Promise(function (_, reject) { timer = setTimeout(function () { reject(new Error('CATALOG_TIMEOUT')); }, 20000); })
        ]);
        if (current !== requestId) return;
        var result = response && response.catalog;
        if (!result || result.sucesso !== true || !Array.isArray(result.eventos) || !Clock) throw new Error('CATALOG_INVALID');
        var timing = response.timing || {};
        catalogClock = Clock.create(result, { requestedAt: timing.requestedAt, receivedAt: timing.receivedAt, maxAgeMs: 300000, legacyMaxAgeMs: 300000 });
        if (!catalogClock.valid || catalogClock.expired()) throw new Error('CATALOG_EXPIRED');
        var seen = new Set(), ends = new Map();
        events = result.eventos.map(function (event) {
          if (!event || !text(event.id) || !text(event.nome)) throw new Error('CATALOG_INVALID_EVENT');
          var end = Clock.eventEnd(event);
          if (Number.isNaN(end) || (!catalogClock.legacy && !event.temporal) || (catalogClock.legacy && end !== null)) throw new Error('CATALOG_INVALID_TEMPORAL');
          ends.set(event, end);
          return event;
        }).filter(function (event) {
          if (hiddenCatalogEventIds.has(event.id)) return false;
          var end = ends.get(event);
          if (end !== null && catalogClock.now() >= end) return false;
          if (seen.has(event.id)) return false;
          if (end !== null) nextEventEnd = Math.min(nextEventEnd, end);
          seen.add(event.id);
          return true;
        });
        events.forEach(function (event, index) { positions.set(event.id, index); });
        ready = true; phase = 'ready';
        render();
        scheduleExpiry();
      } catch (_) {
        if (current !== requestId) return;
        clearAuthority(); phase = 'error';
        status.hidden = false;
        empty.hidden = true; feedback.textContent = '';
        count.textContent = tr('unavailable', 'Agenda temporariamente indisponível.');
        message.textContent = tr('loadError', 'Não foi possível carregar os eventos. Tente novamente.');
        retry.hidden = false;
      } finally {
        clearTimeout(timer);
        if (current === requestId) grid.setAttribute('aria-busy', 'false');
      }
    }
    function refresh() {
      if (suspended || document.hidden || phase === 'loading') return;
      load();
    }
    function suspend() {
      suspended = true;
      ++requestId; clearAuthority(); phase = 'stale';
      grid.setAttribute('aria-busy', 'false');
      status.hidden = false; retry.hidden = true; empty.hidden = true;
      count.textContent = tr('consulting', 'Consultando a agenda…');
      message.textContent = tr('loading', 'Carregando eventos…');
      feedback.textContent = '';
    }
    function resume(event) {
      // Initial pageshow/focus can follow either a fast success or an early
      // failure. Preserve its result, including the explicit retry UI. Only a
      // real resume or expired authority triggers another automatic read.
      var needsRefresh = suspended || (event && event.persisted === true) || phase === 'stale' || (ready && authorityExpired());
      suspended = false;
      if (needsRefresh) refresh();
    }
    window.addEventListener('focus', resume);
    window.addEventListener('pageshow', resume);
    window.addEventListener('pagehide', suspend);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { resume(); return; }
      // Old responses have no canonical deadline. Retain a still-fresh legacy
      // rail across a brief tab hide so its own Pause/Resume state stays intact.
      // Unknown, expired and canonical responses lose authority immediately.
      if (ready && catalogClock && catalogClock.legacy && !authorityExpired()) return;
      suspend();
    });
    function guardActivation(event) {
      if (ready && !authorityExpired()) return;
      event.preventDefault(); event.stopImmediatePropagation();
      refresh();
    }
    grid.addEventListener('click', guardActivation, true);
    grid.addEventListener('auxclick', guardActivation, true);
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
    return new Promise(function (resolve, reject) {
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
  }
  // Timing belongs outside the unchanged public transport adapter. The initial
  // promise keeps its original request start even if mounting is delayed.
  function beginLoad() {
    var requestedAt = window.CTPublicCatalogClock ? window.CTPublicCatalogClock.sample() : NaN;
    return loadPublicEvents().then(function (catalog) {
      return { catalog: catalog, timing: { requestedAt: requestedAt, receivedAt: window.CTPublicCatalogClock ? window.CTPublicCatalogClock.sample() : NaN } };
    });
  }
  // After the pure clock helper, start the same public request
  // while optional presentation modules download, then mount once they have
  // initialized. A handled early rejection is still delivered to the normal
  // retry UI; every later load creates a fresh request.
  var initialRequest = beginLoad();
  initialRequest.catch(function () {});
  function initialize() {
    mount(function () {
      var request = initialRequest;
      initialRequest = null;
      return request || beginLoad();
    });
  }
  if (document.readyState === 'complete') initialize();
  else document.addEventListener('DOMContentLoaded', initialize, { once: true });
}());

