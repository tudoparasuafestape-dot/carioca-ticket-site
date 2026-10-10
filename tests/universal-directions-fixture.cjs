// Synthetic-only fixture bridge. This module performs no network requests and
// never writes candidate files. Both public templates and their assets stay real.
'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const siteRoot = path.resolve(process.env.CT_UNIVERSAL_SITE_ROOT || path.join(__dirname, '..'));
const origin = 'http://127.0.0.1:42983';
const routes = ['evento', 'evento-v2'];
const templates = routes.map(route => `/${route}/`);
const assetNames = [
  'public-i18n.js', 'event-i18n.js', 'home-theme.js', 'waze-mark.svg',
  'event-accessibility.css', 'event-directions.css', 'event-i18n.css',
  'event-directions.js', 'event-uber.css', 'event-ride-destinations.js',
  'event-uber.js', 'event-map-preview.css', 'event-map-preview.js',
  'event-description-speech.js', 'public-share.js',
  'public-privacy.css', 'public-privacy.js',
  'carioca-ticket-icon-192.png', 'carioca-ticket-logo.png', 'carioca-ticket-simbolo.png'
];
const assets = new Set(assetNames.map(name => `/assets/${name}`));
const disabled = new Set(['/pwa-register.js', '/assets/ct-analytics.js']);
const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; form-action 'none'; frame-src https://maps.google.com https://www.google.com; object-src 'none'; base-uri 'none'; worker-src 'none'";

function makeEvent(id, point, location) {
  return {
    id, nome: 'Evento inteiramente sintético de QA', data: '20/12/2030', horario: '18h às 22h',
    ...location,
    destinoTransporte: {
      version: 1, eventId: id, confirmed: true, revision: 1,
      latitude: point[0], longitude: point[1], location: {...location}
    }
  };
}
// Neither ID is in the legacy reviewed registry. Names, addresses and event
// content are synthetic; the coordinates are test values, not a verified venue.
const thirdEvent = makeEvent('EVT-SYNTHETIC-UNIVERSAL-THIRD-2030', [-8.1234567, -34.9876543], {
  local: 'Espaço Link de QA Sintético', endereco: 'Rua Exemplo de QA, 123 - Bairro Fictício', cidade: 'Recife', uf: 'PE'
});
const fourthEvent = makeEvent('EVT-SYNTHETIC-UNIVERSAL-FOURTH-2030', [-8.2345678, -34.8765432], {
  local: 'Salão Sintético de QA', endereco: 'Avenida Demonstração, 456 - Bairro Fictício', cidade: 'Recife', uf: 'PE'
});
function payload(event = thirdEvent) {
  return {
    sucesso: true, evento: structuredClone(event),
    visual: {
      capaUrl: '/__fixture/universal-cover.svg', categoria: 'QA sintético',
      realizacao: 'Equipe fictícia', destaque: 'Apenas uma demonstração sintética.',
      descricaoCurta: 'Cenário isolado para testar a página pública.',
      descricaoCompleta: 'Evento inteiramente fictício.\n\nNenhuma venda, pedido, estoque ou pagamento está disponível neste teste.',
      observacoes: 'Todos os dados deste cenário são sintéticos.'
    },
    menorPreco: 'R$ 35,00',
    tipos: [{nome: 'Entrada fictícia', descricao: 'Sem compra disponível', lotes: [{nome: 'Lote de QA', precoNumero: 35, preco: 'R$ 35,00'}]}]
  };
}
const fixturePayloads = Object.fromEntries([thirdEvent, fourthEvent].map(event => [event.id, payload(event)]));

// Intercepts the same form-submit seam as event-uber-preview-server.cjs.
// No original submit is retained or called. Synthetic MessageEvents exercise
// the real public template's RPC response handlers without any actual RPC.
function fixturePrelude() {
  return `<script data-universal-fixture-prelude>
  (function () {
    'use strict';
    var fixtures = ${JSON.stringify(fixturePayloads)};
    var transport = window.__CT_UNIVERSAL_FIXTURE_TRANSPORT__ = {
      mode: 'success', calls: [], blockedMethods: [], held: [], outboundClicks: [],
      release: function (mode) {
        var jobs = transport.held.splice(0); transport.mode = 'success';
        jobs.forEach(function (job) { reply(job, mode || 'success'); });
      }
    };
    function reply(job, mode) {
      setTimeout(function () {
        var result = fixtures[job.eventId];
        if (!result) throw new Error('Unknown synthetic event ID');
        window.dispatchEvent(new MessageEvent('message', {
          origin: 'https://script.google.com',
          data: { ctMinhaCariocaPost: true, id: job.requestId, ok: mode !== 'failure',
            resultado: mode === 'unavailable' ? {sucesso:false,mensagem:'Evento sintético indisponível.'} : JSON.parse(JSON.stringify(result)) }
        }));
      }, 10);
    }
    HTMLFormElement.prototype.submit = function () {
      var fields = new FormData(this), method = fields.get('metodo');
      if (fields.get('ctMinhaCariocaAction') !== 'publicRpc' || method !== 'ctEventoPublicoCarregarPROD') {
        transport.blockedMethods.push(String(method));
        throw new Error('Non-fixture form submission blocked');
      }
      var args = JSON.parse(fields.get('argsJson') || '[]');
      if (!Object.prototype.hasOwnProperty.call(fixtures, args[0])) throw new Error('Only synthetic IDs are permitted');
      var job = { requestId: fields.get('ctMinhaCariocaRequestId'), eventId: args[0] };
      transport.calls.push({method:method,eventId:job.eventId});
      if (transport.mode === 'hold') transport.held.push(job);
      else reply(job, transport.mode);
    };
    HTMLFormElement.prototype.requestSubmit = function () { throw new Error('Native submission blocked'); };
    document.addEventListener('submit', function (event) { event.preventDefault(); }, true);
    document.addEventListener('click', function (event) {
      var link = event.target.closest('a');
      if (!link) return;
      event.preventDefault();
      transport.outboundClicks.push({id:link.id,blocked:true});
    }, true);
    Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{writeText:async function (value) {window.__CT_UNIVERSAL_COPIED__ = value;}}});
  }());
  </script>`;
}

const hookMarker = "$('retryEventLoad').addEventListener('click',load);";
const templateHook = `
      // In-memory fixture-only references to this template's original closures.
      window.__CT_UNIVERSAL_TEMPLATE_HOOKS__ = Object.freeze({
        render: function (response, requestedId) {
          state.eventoId = requestedId === undefined ? response.evento.id : requestedId;
          render(response);
        },
        load: load,
        showError: showError
      });
      `;
function template(route) {
  assert(routes.includes(route), 'Only the two public event templates may be rendered');
  const raw = fs.readFileSync(path.join(siteRoot, route, 'index.html'), 'utf8');
  assert.equal(raw.split(hookMarker).length, 2, `${route}: template hook must match exactly once`);
  assert.equal(raw.split('<head>').length, 2, `${route}: head marker must match exactly once`);
  return raw.replace('<head>', '<head>' + fixturePrelude()).replace(hookMarker, templateHook + hookMarker);
}
function response(status, type, body) {
  return {status, headers: {'content-type':type, 'content-security-policy':csp, 'cache-control':'no-store'}, body};
}
function localResponse(requestUrl, method = 'GET') {
  const url = new URL(requestUrl);
  assert.equal(url.origin, origin, 'Only the fixed loopback origin can be fulfilled');
  assert.equal(method, 'GET', 'All writes are blocked');
  if (templates.includes(url.pathname)) return response(200, 'text/html; charset=utf-8', template(url.pathname.slice(1, -1)));
  if (disabled.has(url.pathname)) return response(200, 'text/javascript', '// Disabled in synthetic-only QA: no telemetry or service worker.');
  if (url.pathname === '/__fixture/universal-cover.svg') return response(200, 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700" viewBox="0 0 1200 700"><rect width="1200" height="700" fill="#183349"/><circle cx="950" cy="170" r="230" fill="#daa93e"/><text x="60" y="380" fill="white" font-family="sans-serif" font-size="70">Evento sintético de QA</text></svg>');
  if (url.pathname === '/favicon.ico') return response(204, 'image/x-icon', '');
  if (url.pathname === '/manifest.webmanifest') return response(200, 'application/manifest+json', fs.readFileSync(path.join(siteRoot, 'manifest.webmanifest')));
  assert(assets.has(url.pathname), `Non-allowlisted loopback asset: ${url.pathname}`);
  const file = path.join(siteRoot, url.pathname.slice(1));
  const type = file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'image/png';
  return response(200, type, fs.readFileSync(file));
}
function fingerprint() {
  const files = [...routes.map(route => `${route}/index.html`), ...assetNames.map(name => `assets/${name}`)];
  return Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(siteRoot, file))).digest('hex')]));
}
function staticChecks() {
  const registry = {window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(siteRoot, 'assets/event-ride-destinations.js'), 'utf8'), registry);
  for (const event of [thirdEvent, fourthEvent]) {
    assert(!Object.hasOwn(registry.window.CTEventRideDestinations, event.id), 'Generic fixture must not use the legacy registry');
    assert.equal(event.id, event.destinoTransporte.eventId);
    for (const key of ['local','endereco','cidade','uf']) assert.equal(event[key], event.destinoTransporte.location[key]);
  }
  for (const route of routes) {
    const body = template(route);
    for (const [index, match] of [...body.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].entries()) {
      if (match[1].trim()) new vm.Script(match[1], {filename:`${route}:inline-${index}`});
    }
    for (const match of body.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"[^>]*>/gi)) {
      const url = new URL(match[1], origin);
      if (url.origin === origin) assert.equal(localResponse(url.href).status, 200);
    }
    assert(body.includes('CTEventDirections.render(e,state.eventoId)'));
    assert(body.includes('CTEventUber.render(e,state.eventoId)'));
    assert(body.includes('CTEventMapPreview.renderPublicDirections()'));
  }
  for (const name of assetNames.filter(name => name.endsWith('.js'))) {
    new vm.Script(fs.readFileSync(path.join(siteRoot, 'assets', name), 'utf8'), {filename:name});
  }
  const mark = localResponse(origin + '/assets/waze-mark.svg');
  assert.equal(mark.headers['content-type'], 'image/svg+xml');
  assert.equal(crypto.createHash('sha256').update(mark.body).digest('hex'), '817b77a1d7df3aa57776c18e8f3ba8ee20a298e5ed884395c8c3638b12916c7f');
  assert.throws(() => localResponse(origin + '/assets/other-mark.svg'), /Non-allowlisted/);
  assert.throws(() => localResponse('https://example.invalid/'), /fixed loopback/);
  assert.throws(() => localResponse(origin + '/assets/event-uber.js', 'POST'), /writes/);
  assert.throws(() => localResponse(origin + '/checkout/'), /Non-allowlisted/);
  assert.throws(() => localResponse(origin + '/assets/../../etc/passwd'), /Non-allowlisted/);
  return {staticChecksPassed:true, routes, genericSyntheticIds:[thirdEvent.id,fourthEvent.id], fileHashes:fingerprint()};
}

module.exports = {siteRoot,origin,routes,thirdEvent,fourthEvent,payload,localResponse,fingerprint,staticChecks};
if (require.main === module) console.log(JSON.stringify(staticChecks(), null, 2));
