(function () {
  'use strict';

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
    var events = [], query = '', locationQuery = '', ready = false, requestId = 0;

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
    function card(event, index) {
      var visual = event.visual || {};
      var detail = '/evento/?evento=' + encodeURIComponent(event.id);
      var article = node('article', 'catalog-card');
      article.dataset.eventId = event.id;
      var cover = node('a', 'catalog-photo');
      cover.href = detail;
      cover.setAttribute('aria-label', 'Ver evento: ' + event.nome);
      var fallback = node('span', 'catalog-image-fallback', 'Capa indisponível');
      cover.appendChild(fallback);
      var src = imageUrl(visual.capaUrl || visual.posterUrl);
      if (src) {
        var image = node('img', '');
        image.alt = 'Capa de ' + event.nome;
        image.loading = index < 2 ? 'eager' : 'lazy';
        image.decoding = 'async';
        // Keep lazy images measurable so the browser can start loading near the viewport.
        image.style.opacity = '0';
        fallback.textContent = 'Carregando capa…';
        image.onload = function () { image.style.opacity = '1'; fallback.hidden = true; };
        image.onerror = function () { image.hidden = true; fallback.hidden = false; fallback.textContent = 'Capa indisponível'; };
        image.src = src;
        cover.appendChild(image);
      }
      var body = node('div', 'catalog-body');
      if (text(visual.categoria)) body.appendChild(node('span', 'event-kicker', visual.categoria));
      var heading = node('h3', 'catalog-title');
      var titleLink = node('a', '', event.nome);
      titleLink.href = detail;
      heading.appendChild(titleLink);
      body.appendChild(heading);
      var date = [text(event.data), text(event.horario)].filter(Boolean).join(' · ');
      var venue = [text(event.local), [text(event.cidade), text(event.uf)].filter(Boolean).join(' / ')].filter(Boolean).join(' · ');
      body.appendChild(node('p', 'catalog-meta', date || 'Data e horário não informados'));
      body.appendChild(node('p', 'catalog-venue', venue || 'Local não informado'));
      if (text(visual.descricaoCurta)) body.appendChild(node('p', 'catalog-description', visual.descricaoCurta));
      var actions = node('div', 'catalog-actions');
      var buy = node('a', 'btn btn-primary', 'Comprar ingresso');
      buy.href = '/checkout/?evento=' + encodeURIComponent(event.id);
      buy.setAttribute('aria-label', 'Comprar ingresso: ' + event.nome);
      var more = node('a', 'event-secondary', 'Ver evento');
      more.href = detail;
      actions.append(buy, more);
      body.appendChild(actions);
      article.append(cover, body);
      return article;
    }
    function render() {
      if (!ready) return;
      var filtered = events.filter(function (event) {
        var visual = event.visual || {};
        var matchesQuery = !query || normalize([event.nome, event.data, event.horario, event.local, event.cidade, event.uf, visual.categoria, visual.descricaoCurta].filter(Boolean).join(' ')).includes(query);
        var matchesLocation = !locationQuery || normalize([event.local, event.cidade, event.uf].filter(Boolean).join(' ')).includes(locationQuery);
        return matchesQuery && matchesLocation;
      });
      grid.replaceChildren();
      filtered.forEach(function (event, index) { grid.appendChild(card(event, index)); });
      count.textContent = filtered.length + (filtered.length === 1 ? ' evento disponível para compra.' : ' eventos disponíveis para compra.');
      empty.hidden = !events.length || !!filtered.length;
      feedback.textContent = (query || locationQuery) && events.length ? (filtered.length ? filtered.length + (filtered.length === 1 ? ' evento encontrado.' : ' eventos encontrados.') : 'Nenhum evento encontrado para essa pesquisa.') : '';
      status.hidden = !!events.length;
      if (!events.length) message.textContent = 'Nenhum evento disponível no momento. Volte em breve para conferir a agenda.';
    }
    async function load() {
      var current = ++requestId;
      ready = false;
      grid.replaceChildren();
      grid.setAttribute('aria-busy', 'true');
      status.hidden = false;
      retry.hidden = true;
      empty.hidden = true;
      feedback.textContent = '';
      count.textContent = 'Consultando a agenda…';
      message.textContent = 'Carregando eventos…';
      var timer;
      try {
        var result = await Promise.race([
          Promise.resolve().then(loadCatalog),
          new Promise(function (_, reject) { timer = setTimeout(function () { reject(new Error('CATALOG_TIMEOUT')); }, 20000); })
        ]);
        if (current !== requestId) return;
        if (!result || result.sucesso !== true || !Array.isArray(result.eventos)) throw new Error('CATALOG_INVALID');
        var seen = new Set();
        events = result.eventos.map(function (event) {
          if (!event || !text(event.id) || !text(event.nome)) throw new Error('CATALOG_INVALID_EVENT');
          return event;
        }).filter(function (event) {
          if (seen.has(event.id)) return false;
          seen.add(event.id);
          return true;
        });
        ready = true;
        render();
      } catch (_) {
        if (current !== requestId) return;
        count.textContent = 'Agenda temporariamente indisponível.';
        message.textContent = 'Não foi possível carregar os eventos. Tente novamente.';
        retry.hidden = false;
      } finally {
        clearTimeout(timer);
        if (current === requestId) grid.setAttribute('aria-busy', 'false');
      }
    }
    document.getElementById('event-search-form').addEventListener('submit', function (event) {
      event.preventDefault();
      query = normalize(input.value);
      locationQuery = locationInput ? normalize(locationInput.value) : '';
      render();
    });
    document.getElementById('clear-event-search').addEventListener('click', function () {
      input.value = query = '';
      locationQuery = '';
      if (locationInput) locationInput.value = '';
      render();
      input.focus();
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
  mount(loadPublicEvents);
}());
