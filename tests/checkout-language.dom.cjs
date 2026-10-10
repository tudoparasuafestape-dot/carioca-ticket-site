'use strict';

// LOCAL-ONLY, dependency-free regression harness. Run:
//   node tests/checkout-era-beauty.dom.js
// Executes the actual checkout inline scripts and commercial-policy asset in a VM.
// Only google.script.run is replaced, after the real bridge has installed its URL
// parser. Financial RPCs are captured mocks that never create an order or ticket.
// No browser, sockets, network, provider, credentials or production state is used.
// Limits: this minimal DOM does not verify CSS/layout, mobile rendering, native
// navigation, accessibility/focus behavior, browser form/iframe/postMessage RPC
// transport, payment-provider behavior, or server-side charging/idempotency.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, (process.env.CT_LOCALE_ROUTE || 'checkout') + '/index.html'), 'utf8');
const POLICY = fs.readFileSync(path.join(ROOT, 'assets/checkout-commercial-policy.js'), 'utf8');
const ERA = 'EVT-23112026-ERA-BEAUTY-EAC4B673';
const LEGACY = 'EVT-LOCAL-LEGACY';
const PENDING = Symbol('manually controlled mock RPC');
const START = Date.UTC(2026, 9, 8, 12);
const money = n => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const round = n => Math.round(n * 100) / 100;
const clone = value => structuredClone(value);

class Clock {
  constructor() { this.now = START; this.nextId = 1; this.jobs = new Map(); }
  timeout(fn, delay = 0, ...args) {
    const id = this.nextId++;
    this.jobs.set(id, { id, at: this.now + Math.max(0, Number(delay) || 0), fn, args });
    return id;
  }
  interval(fn, delay = 0, ...args) {
    const id = this.timeout(fn, delay, ...args);
    this.jobs.get(id).interval = Math.max(1, Number(delay) || 1);
    return id;
  }
  clear(id) { this.jobs.delete(id); }
  tick(ms = 0) {
    const end = this.now + ms;
    let remaining = 10000;
    while (true) {
      const job = [...this.jobs.values()].filter(j => j.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!job) break;
      assert(remaining-- > 0, 'Timer loop exceeded the harness safety bound');
      this.now = job.at;
      this.jobs.delete(job.id);
      if (job.interval) this.jobs.set(job.id, { ...job, at: job.at + job.interval });
      job.fn(...job.args);
    }
    this.now = end;
  }
}

class Storage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(String(key)) ? this.data.get(String(key)) : null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
  removeItem(key) { this.data.delete(String(key)); }
  clear() { this.data.clear(); }
}

function decode(text) {
  return String(text).replace(/&nbsp;/g, '\u00a0').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}
function attributes(text) {
  const result = {};
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of text.matchAll(pattern)) result[match[1]] = decode(match[2] ?? match[3] ?? match[4] ?? '');
  return result;
}

class Element {
  get isConnected() { var n=this; while(n.parentNode)n=n.parentNode; return n===this.ownerDocument; }
  hasAttribute(name) { return name in this.attributes; }
  matches() { return false; }
  constructor(tag, document) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = document;
    this.children = []; this.parentNode = null; this.attributes = {}; this.style = {};
    this._text = ''; this._value = ''; this._className = ''; this.disabled = false;
    this.checked = false; this.listeners = new Map();
    this.classList = {
      contains: c => this.className.split(/\s+/).includes(c),
      add: (...values) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...values])].join(' '); },
      remove: (...values) => { this.className = this.className.split(/\s+/).filter(c => c && !values.includes(c)).join(' '); },
      toggle: (value, force) => {
        const add = force === undefined ? !this.classList.contains(value) : !!force;
        this.classList[add ? 'add' : 'remove'](value); return add;
      }
    };
  }
  set className(value) { this._className = String(value); }
  get className() { return this._className; }
  set value(value) { this._value = String(value); }
  get value() { return this._value; }
  set textContent(value) { this.children = []; this._text = String(value ?? ''); }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set innerHTML(value) {
    this.children = []; this._text = ''; parse(String(value), this, this.ownerDocument);
    if (this.tagName === 'SELECT') this.value = this.children.find(c => c.tagName === 'OPTION')?.value || '';
  }
  get innerHTML() { throw new Error('Reading innerHTML is outside this minimal DOM contract'); }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = value;
    else if (name === 'value') this.value = value;
    else if (name === 'disabled' || name === 'checked') this[name] = true;
    else if (!name.startsWith('data-') && !name.startsWith('aria-')) this[name] = String(value);
  }
  getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; }
  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'class') this.className = '';
    else if (name === 'value') this.value = '';
    else if (name === 'disabled' || name === 'checked') this[name] = false;
    else if (!name.startsWith('data-') && !name.startsWith('aria-')) delete this[name];
  }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  append(...children) { children.forEach(c => this.appendChild(c)); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this); this.parentNode = null; }
  querySelectorAll(selector) {
    const matches = element => {
      if (selector.startsWith('#')) return element.id === selector.slice(1);
      if (selector.startsWith('.')) return element.classList.contains(selector.slice(1));
      if (/^\[[\w-]+\]$/.test(selector)) return selector.slice(1, -1) in element.attributes;
      if (/^[\w-]+$/.test(selector)) return element.tagName === selector.toUpperCase();
      throw new Error('Unsupported selector in the harness: ' + selector);
    };
    if(selector.includes(','))return [...new Set(selector.split(',').flatMap(s=>this.querySelectorAll(s.trim())))];
    const result = [];
    const visit = element => { for (const child of element.children) { if (matches(child)) result.push(child); visit(child); } };
    visit(this); return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  dispatchEvent(event) {
    event.target ||= this; event.preventDefault ||= () => {};
    if (typeof this['on' + event.type] === 'function') this['on' + event.type](event);
    for (const handler of this.listeners.get(event.type) || []) handler(event);
    return true;
  }
  click() { if (!this.disabled) this.dispatchEvent({ type: 'click' }); }
  focus() { this.ownerDocument.activeElement = this; }
  select() {}
  scrollIntoView() {}
  submit() { this.ownerDocument.forbidden('Real form submission'); }
}

function parse(html, root, document) {
  const stack = [root];
  const voids = new Set(['AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR', 'IMG', 'INPUT', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR']);
  for (const match of html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/([\w-]+)\s*>|<([\w-]+)((?:"[^"]*"|'[^']*'|[^'">])*)>|([^<]+)/g)) {
    if (match[1]) {
      const tag = match[1].toUpperCase();
      const index = stack.findLastIndex(element => element.tagName === tag);
      if (index > 0) stack.length = index;
    } else if (match[2]) {
      const element = new Element(match[2], document);
      for (const [key, value] of Object.entries(attributes(match[3]))) element.setAttribute(key, value);
      stack.at(-1).appendChild(element);
      if (!voids.has(element.tagName) && !/\/\s*$/.test(match[3])) stack.push(element);
    } else if (match[4]) stack.at(-1)._text += decode(match[4]);
  }
}

class Document extends Element {
  constructor(html, forbidden) {
    super('document', null); this.ownerDocument = this; this.forbidden = forbidden;
    this.visibilityState = 'visible';
    parse(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ''), this, this);
    this.body = this.querySelector('body'); this.documentElement=this.querySelector('html');
    assert(this.body, 'Actual checkout body was parsed');
  }
  createElement(tag) { return new Element(tag, this); }
  getElementById(id) { return this.querySelector('#' + id); }
  execCommand() { return false; }
}

function catalog(eventId) {
  return { sucesso: true, evento: { id: eventId, nome: 'ERA BEAUTY | LOCAL TEST FIXTURE' },
    visual: {}, identidadeCliente: { emailObrigatorio: false },
    tipos: [87, 120, 0].map((price, i) => ({ id: 'TYPE-' + i, nome: i === 1 ? 'VIP' : 'Individual', capacidadePorVenda: 1,
      lotes: [{ id: 'LOT-' + i, nome: 'Lote local', preco: money(price), precoNumero: price, quantidadeLimitada: false }] })) };
}
function quote(p, revision = 'LOCAL-POLICY-R1') {
  const subtotal = round(p.precoUnitario * p.quantidade), fee = round(subtotal * .10);
  return { sucesso: true, degradado: false, rolloutAtivo: true, revisao: revision,
    resumo: { subtotalIngressos: subtotal, taxaCtPercentual: 10, taxaCtTotal: fee,
      taxaComprador: fee, taxaProdutor: 0, adicionaisComprador: 0, totalComprador: round(subtotal + fee), pagadorTaxa: 'COMPRADOR' } };
}
function coupon(p) {
  const price = p.tipoId === 'TYPE-1' ? 120 : p.tipoId === 'TYPE-2' ? 0 : 87;
  const discount = p.codigo === 'LOCAL100' ? price : p.codigo === 'LOCAL20' ? 20 : 10;
  return { sucesso: true, valido: true, cupom: { codigo: p.codigo }, calculo: {
    valorOriginalTotal: price * p.quantidade, valorFinalTotal: (price - discount) * p.quantidade,
    descontoTotal: discount * p.quantidade } };
}

function fixture(options = {}) {
  const clock = new Clock();
  const state = { eventId: options.eventId || ERA, previews: [], coupons: [], payments: [], catalogs: [], polls: [], unexpected: [], calls: [] };
  const forbidden = description => { state.unexpected.push(description); throw new Error('Forbidden external side effect: ' + description); };
  const document = new Document(HTML, forbidden);
  const url = new URL('https://checkout.local.test/checkout/?evento=' + encodeURIComponent(state.eventId));
  let uuids = 0;
  class FakeDate extends Date { constructor(...args) { super(...(args.length ? args : [clock.now])); } static now() { return clock.now; } }
  const windowListeners = new Map();
  const sandbox = {
    document, console, URL, URLSearchParams, Date: FakeDate, CustomEvent: class { constructor(type,options){this.type=type;this.detail=options.detail;} },
    location: { href: url.href, origin: url.origin, search: url.search, hash: '', pathname: url.pathname },
    localStorage: options.localStorage || new Storage(), sessionStorage: new Storage(),
    navigator: { userAgent: 'LOCAL_VM_TEST', clipboard: { writeText: () => forbidden('clipboard write') } },
    crypto: { randomUUID: () => '00000000-0000-4000-8000-' + String(++uuids).padStart(12, '0') },
    setTimeout: clock.timeout.bind(clock), clearTimeout: clock.clear.bind(clock),
    setInterval: clock.interval.bind(clock), clearInterval: clock.clear.bind(clock),
    addEventListener(type, fn) { if (!windowListeners.has(type)) windowListeners.set(type, []); windowListeners.get(type).push(fn); },
    fetch: () => forbidden('fetch'), XMLHttpRequest: function () { forbidden('XMLHttpRequest'); },
    WebSocket: function () { forbidden('WebSocket'); }, open: () => forbidden('window.open'),
  };
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.top = sandbox;
  const context = vm.createContext(sandbox, { name: 'checkout-local-only', codeGeneration: { strings: false, wasm: false } });

  function rpc(method, args, success, failure) {
    const mappings = {
      ctCheckoutPublicoCarregarEventoPROD: ['catalogs', options.catalog || (() => catalog(state.eventId))],
      ctPoliticaComercialPreviewPublicoPROD: ['previews', options.preview || (p => quote(p))],
      ctCuponsPublicoValidarSeguroPROD: ['coupons', options.coupon || coupon],
      ctCheckoutPixPublicoStatusLocalPROD: ['polls', options.consult || (() => ({sucesso:false}))],
      ctCheckoutPixPublicoConsultarPROD: ['polls', options.consult || (() => ({sucesso:false}))],
      ctCheckoutPixPublicoReconciliarPROD: ['polls', options.consult || (() => ({sucesso:false}))],
      ctCheckoutPixPublicoIniciarPROD: ['payments', options.pay || (() => ({ sucesso: false, mensagem: 'LOCAL MOCK: no order or ticket is created.' }))]
    };
    if (!mappings[method]) return forbidden('Unexpected RPC ' + method);
    const [collection, handler] = mappings[method];
    const request = clone(args[0]);
    state[collection].push(request);
    const call = { method, request, args:clone(args), resolved: false,
      resolve(result) {
        assert(!call.resolved, 'A mock RPC resolves at most once'); call.resolved = true;
        // Only the explicitly named synthetic pending-order fixture may exercise presentation polling.
        if(collection==='payments'&&result?.pedido)assert(options.pendingLanguageFixture===true&&result.pedido.pedidoId==='ORDER-LOCAL'&&result.consultaToken==='LOCAL-POLLING-TOKEN','Only fixed synthetic pending order is permitted');
        if (success) success(clone(result));
      },
      reject(error) { assert(!call.resolved, 'A mock RPC resolves at most once'); call.resolved = true; if (failure) failure(error instanceof Error ? error : new Error(String(error))); }
    };
    state.calls.push(call);
    clock.timeout(() => {
      let result;
      try { result = handler(request, state[collection].length, call); }
      catch (error) { call.reject(error); return; }
      assert(!result || typeof result.then !== 'function', 'Use PENDING and captured resolve/reject instead of real asynchronous timers');
      if (result !== PENDING) call.resolve(result);
    }, 0);
  }
  function runner(success, failure) {
    return new Proxy({}, { get(_target, property) {
      if (property === 'withSuccessHandler') return fn => runner(fn, failure);
      if (property === 'withFailureHandler') return fn => runner(success, fn);
      if (property === 'then') return undefined;
      return (...args) => rpc(String(property), args, success, failure);
    } });
  }

  for(const asset of ['public-i18n.js','checkout-translations.js','checkout-language.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,'assets',asset),'utf8'),context);
  if (!options.noPolicy) vm.runInContext(POLICY, context, { filename: 'assets/checkout-commercial-policy.js', timeout: 1000 });
  const scripts = [...HTML.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(match => !/\bsrc\s*=/.test(match[1]));
  assert.equal(scripts.length, 2, 'Revisit harness integration if inline script topology changes');
  let checkoutExecuted = false;
  scripts.forEach((script, index) => {
    if (script[2].includes('var state={')) {
      assert(sandbox.google?.script?.run, 'Real RPC bridge executed before mock injection');
      sandbox.google.script.run = runner(null, null);
      checkoutExecuted = true;
    }
    vm.runInContext(script[2], context, { filename: 'checkout/index.html:inline-' + index, timeout: 1000 });
  });
  assert(checkoutExecuted, 'The actual unmodified checkout inline script executed');
  clock.tick(0);
  const element = id => { const result = document.getElementById(id); assert(result, 'Missing actual DOM element #' + id); return result; };
  assert.equal(element('closedPanel').classList.contains('hidden'), true, 'Catalog rendered without swallowed DOM errors');
  element('buyerName').value = 'Comprador de Teste Local';
  element('buyerCpf').value = '00000000000';
  element('buyerWhatsapp').value = '81999999999';
  const f = { state, clock, document, sandbox, element,
    click(id) { element(id).click(); clock.tick(0); },
    input(id, value) { element(id).value = value; element(id).dispatchEvent({ type: 'input' }); clock.tick(0); },
    change(id, value) { element(id).value = value; element(id).dispatchEvent({ type: 'change' }); clock.tick(0); },
    select(index = 0) { this.change('typeSelect', 'TYPE-' + index); this.change('lotSelect', 'LOT-' + index); },
    method(method) {
      element('paymentCard').checked = method === 'CREDIT_CARD'; element('paymentPix').checked = method === 'PIX';
      element(method === 'CREDIT_CARD' ? 'paymentCard' : 'paymentPix').dispatchEvent({ type: 'change' }); clock.tick(0);
    },
    apply(code = 'LOCAL10') { element('couponCode').value = code; this.click('couponApply'); },
    participants() { document.querySelectorAll('[data-name]').forEach((input, i) => { input.value = 'Participante Local ' + i; }); },
    total(value) { assert.equal(element('summaryPrice').textContent, money(value), 'Exact buyer total'); },
    visible(id) { return !element(id).classList.contains('hidden'); },
    pending(method) { return state.calls.filter(c => c.method === method && !c.resolved); },
    settle() { clock.tick(180); },
    closeModal() { this.click('modalOk'); },
    finish() { assert.deepEqual(state.unexpected, [], 'No unexpected RPC or external side effect'); }
  };
  return f;
}

const PREVIEW = 'ctPoliticaComercialPreviewPublicoPROD';
const COUPON = 'ctCuponsPublicoValidarSeguroPROD';
const PAYMENT = 'ctCheckoutPixPublicoIniciarPROD';
const CATALOG = 'ctCheckoutPublicoCarregarEventoPROD';
const PRICE_CHANGED = 'CT_POLITICA_COMERCIAL_PRECO_ATUALIZADO';
const forbiddenFinancialFields = ['precoUnitario', 'produtorId', 'taxaCtPercentual', 'pagadorTaxa', 'valorTotal', 'totalComprador', 'taxaComprador', 'taxaCtTotal'];
let passed = 0, failed = 0;
function test(name, body) {
  // ERA fee-specific legacy regression expectations do not apply to the v2 facade.
  if(process.env.CT_LOCALE_ROUTE==='checkout-v2'&&!/^(language |new event )/.test(name))return;
  try { body(); passed++; console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); }
}

// All assertions are made through real DOM event handlers and their RPC payloads.
test('87 + 8.70 = 95.70, explicit disclosure, exact revision and backend-only charge authority', () => {
  const f = fixture(); f.select();
  assert.equal(f.element('summaryPrice').textContent, 'Confirmando...');
  assert.equal(f.state.previews.length, 0, 'Preview is debounced'); f.settle(); f.total(95.7);
  assert.equal(f.element('feeBase').textContent, money(87)); assert.equal(f.element('feePlatform').textContent, money(8.7));
  assert.equal(f.element('feeTotal').textContent, money(95.7)); assert.match(f.element('feeLabel').textContent, /10%/);
  assert(f.visible('feeSummary')); assert(!f.visible('feeStatus')); assert(!f.visible('feeAdditionalRow'));
  f.click('feeInfo'); assert.match(f.element('modalText').textContent, /plataforma/); f.closeModal();
  f.click('payButton'); assert.equal(f.state.payments.length, 1);
  const p = f.state.payments[0]; assert.equal(p.politicaRevisaoVista, 'LOCAL-POLICY-R1');
  assert.equal(p.politicaSubtotalVisto, 87); assert.equal(p.politicaTotalVisto, 95.7);
  assert.equal(money(p.politicaSubtotalVisto), f.element('feeBase').textContent);
  assert.equal(money(p.politicaTotalVisto), f.element('feeTotal').textContent);
  for (const field of forbiddenFinancialFields) assert(!(field in p), 'No browser-controlled financial field ' + field);
  assert.equal(p.eventoId, ERA); assert.equal(p.formaPagamento, 'PIX'); f.finish();
});

test('backend-provided percentage and additional charge are displayed without hardcoding 10%', () => {
  const f = fixture({ preview(p) { const response = quote(p); Object.assign(response.resumo, { taxaCtPercentual: 5, taxaCtTotal: 4.35, taxaComprador: 4.35, adicionaisComprador: 2, totalComprador: 93.35 }); return response; } });
  f.select(); f.settle(); f.total(93.35); assert.match(f.element('feeLabel').textContent, /5%/);
  assert.equal(f.element('feePlatform').textContent, money(4.35)); assert(f.visible('feeAdditionalRow'));
  assert.equal(f.element('feeAdditional').textContent, money(2)); f.finish();
});

test('120 + 12 = 132; card and quantity changes invalidate then requote', () => {
  const f = fixture(); f.select(1); f.settle(); f.total(132);
  f.method('CREDIT_CARD'); assert(!f.visible('feeSummary')); f.settle(); f.total(132);
  assert.equal(f.state.previews.at(-1).formaPagamento, 'CREDIT_CARD');
  f.input('quantity', '2'); f.settle(); f.total(264);
  assert.equal(f.element('feeBase').textContent, money(240)); assert.equal(f.element('feePlatform').textContent, money(24));
  assert.equal(f.state.previews.at(-1).quantidade, 2); f.participants(); f.click('payButton');
  assert.equal(f.state.payments.length, 1); assert.equal(f.state.payments[0].formaPagamento, 'CREDIT_CARD');
  assert.equal(f.state.payments[0].quantidadeVendas, 2); assert.equal(f.state.payments[0].participantes.length, 1);
  assert.equal(f.state.payments[0].politicaSubtotalVisto, 240); assert.equal(f.state.payments[0].politicaTotalVisto, 264); f.finish();
});

const unsafe = {
  noResponse: () => null,
  failed: r => { r.sucesso = false; }, degraded: r => { r.degradado = true; },
  absentDegraded: r => { delete r.degradado; }, missingPayer: r => { delete r.resumo.pagadorTaxa; },
  wrongPayer: r => { r.resumo.pagadorTaxa = 'PRODUTOR'; }, mismatchedRate: r => { r.resumo.taxaCtPercentual = 11; },
  rolloutOff: r => { r.rolloutAtivo = false; }, absentRollout: r => { delete r.rolloutAtivo; },
  noRevision: r => { delete r.revisao; }, blankRevision: r => { r.revisao = '  '; }, numericRevision: r => { r.revisao = 1; },
  noSummary: r => { delete r.resumo; }, wrongSubtotal: r => { r.resumo.subtotalIngressos = 120; },
  wrongTotal: r => { r.resumo.totalComprador = 87; }, noBuyerFee: r => { delete r.resumo.taxaComprador; },
  stringFee: r => { r.resumo.taxaComprador = '8.70'; }, negativeFee: r => { r.resumo.taxaComprador = -1; },
  nanFee: r => { r.resumo.taxaComprador = NaN; }, infiniteFee: r => { r.resumo.taxaComprador = Infinity; },
  unbalancedFee: r => { r.resumo.taxaProdutor = 1; },
  zeroFeeOnPaid: r => { Object.assign(r.resumo, { taxaCtTotal: 0, taxaComprador: 0, taxaCtPercentual: 0, totalComprador: 87 }); }
};
for (const [name, mutate] of Object.entries(unsafe)) test('unsafe quote blocks payment: ' + name, () => {
  const f = fixture({ preview(p) { const response = quote(p); return mutate(response) === null ? null : response; } });
  f.select(); f.settle(); assert.equal(f.element('summaryPrice').textContent, 'A confirmar');
  assert(!f.visible('feeSummary')); assert(f.visible('feeRetry'));
  f.click('payButton'); assert.equal(f.state.payments.length, 0); assert(f.element('modalBg').classList.contains('open')); f.finish();
});

test('missing commercial-policy helper fails closed', () => {
  const f = fixture({ noPolicy: true }); f.select(); f.settle();
  assert.equal(f.element('summaryPrice').textContent, 'A confirmar'); f.click('payButton');
  assert.equal(f.state.payments.length, 0); f.finish();
});

test('preview RPC error and explicit retry recover without payment', () => {
  const f = fixture({ preview(p, n) { if (n === 1) throw new Error('LOCAL_OFFLINE'); return quote(p); } });
  f.select(); f.settle(); assert(f.visible('feeRetry')); assert.equal(f.element('summaryPrice').textContent, 'A confirmar');
  f.click('feeRetry'); f.settle(); f.total(95.7); assert.equal(f.state.previews.length, 2); assert.equal(f.state.payments.length, 0); f.finish();
});

test('pending quote blocks payment before and after RPC dispatch', () => {
  const f = fixture({ preview: () => PENDING }); f.select(); f.click('payButton'); assert.equal(f.state.payments.length, 0);
  f.closeModal(); f.settle(); f.click('payButton'); assert.equal(f.state.payments.length, 0); f.closeModal();
  const call = f.pending(PREVIEW)[0]; call.resolve(quote(call.request)); f.total(95.7);
  assert.equal(f.state.payments.length, 0, 'Resolving a quote never auto-submits payment');
  f.click('payButton'); assert.equal(f.state.payments.length, 1); f.finish();
});

test('30-second freshness boundary, stale quote requires explicit payment retry', () => {
  const fresh = fixture(); fresh.select(); fresh.settle(); fresh.clock.tick(30000); fresh.click('payButton');
  assert.equal(fresh.state.payments.length, 1, 'Exactly 30 seconds is still within the contract'); fresh.finish();
  const f = fixture(); f.select(); f.settle(); f.clock.tick(30001); f.click('payButton');
  assert.equal(f.state.payments.length, 0); assert.equal(f.element('summaryPrice').textContent, 'Confirmando...');
  f.closeModal(); f.settle(); f.total(95.7); assert.equal(f.state.previews.length, 2);
  assert.equal(f.state.payments.length, 0); f.click('payButton'); assert.equal(f.state.payments.length, 1); f.finish();
});

test('backwards clock invalidates otherwise fresh quote', () => {
  const f = fixture(); f.select(); f.settle(); f.clock.now -= 1; f.click('payButton');
  assert.equal(f.state.payments.length, 0); f.settle(); f.total(95.7); f.finish();
});

for (const field of ['quantity', 'method']) test('payment catches a ' + field + ' mismatch even before a change event', () => {
  const f = fixture(); f.select(); f.settle();
  if (field === 'quantity') f.element('quantity').value = '2';
  else { f.element('paymentCard').checked = true; f.element('paymentPix').checked = false; }
  f.click('payButton'); assert.equal(f.state.payments.length, 0); f.closeModal(); f.settle();
  f.total(field === 'quantity' ? 191.4 : 95.7); f.participants(); f.click('payButton');
  assert.equal(f.state.payments.length, 1); f.finish();
});

test('rapid edits debounce into the newest quantity and payment method', () => {
  const f = fixture(); f.select(); f.clock.tick(50); f.input('quantity', '2'); f.clock.tick(50);
  f.input('quantity', '3'); f.method('CREDIT_CARD'); f.settle(); f.total(287.1);
  assert.equal(f.state.previews.length, 1); assert.equal(f.state.previews[0].quantidade, 3);
  assert.equal(f.state.previews[0].formaPagamento, 'CREDIT_CARD'); f.finish();
});

for (const late of ['success', 'failure']) test('late quote ' + late + ' cannot overwrite newer quantity', () => {
  const f = fixture({ preview: () => PENDING }); f.select(); f.settle(); const old = f.pending(PREVIEW)[0];
  f.input('quantity', '2'); f.settle(); const latest = f.pending(PREVIEW).at(-1);
  latest.resolve(quote(latest.request, 'LOCAL-NEW')); f.total(191.4);
  if (late === 'success') old.resolve(quote(old.request, 'LOCAL-OLD')); else old.reject('OLD_FAILURE');
  f.total(191.4); assert(!f.visible('feeRetry')); f.participants(); f.click('payButton');
  assert.equal(f.state.payments[0].politicaRevisaoVista, 'LOCAL-NEW'); f.finish();
});

test('late quote cannot restore fee UI after type deselection', () => {
  const f = fixture({ preview: () => PENDING }); f.select(); f.settle(); const old = f.pending(PREVIEW)[0];
  f.change('typeSelect', ''); old.resolve(quote(old.request));
  assert(!f.visible('summary')); assert(!f.visible('feeSummary')); assert(!f.visible('feeStatus'));
  f.click('payButton'); assert.equal(f.state.payments.length, 0); f.finish();
});

test('old paid quote cannot contaminate a newer free catalog selection', () => {
  const f = fixture({ preview: () => PENDING }); f.select(); f.settle(); const old = f.pending(PREVIEW)[0];
  f.select(2); f.total(0); old.resolve(quote(old.request)); f.total(0);
  assert(!f.visible('feeSummary')); f.click('payButton'); assert.equal(f.state.payments.length, 1);
  assert(!('politicaRevisaoVista' in f.state.payments[0]));
  assert(!('politicaSubtotalVisto' in f.state.payments[0])); assert(!('politicaTotalVisto' in f.state.payments[0])); f.finish();
});

test('coupon validation blocks old-total payment; apply and remove requote', () => {
  const f = fixture({ coupon: () => PENDING }); f.select(); f.settle(); f.apply();
  assert.equal(f.element('summaryPrice').textContent, 'Confirmando...'); assert(!f.visible('feeSummary'));
  f.click('payButton'); assert.equal(f.state.payments.length, 0); f.closeModal();
  const call = f.pending(COUPON)[0]; call.resolve(coupon(call.request)); f.settle(); f.total(84.7);
  assert(f.visible('promoSummary')); assert.equal(f.state.previews.at(-1).cupomCodigo, 'LOCAL10');
  assert.equal(f.state.previews.at(-1).precoUnitario, 77); assert.equal(f.element('feePlatform').textContent, money(7.7));
  f.click('couponRemove'); f.settle(); f.total(95.7); assert.equal(f.state.previews.at(-1).cupomCodigo, '');
  assert(!f.visible('promoSummary')); f.finish();
});

test('coupon request suppresses an older in-flight full-price quote', () => {
  const f = fixture({ preview: () => PENDING, coupon: () => PENDING }); f.select(); f.settle();
  const old = f.pending(PREVIEW)[0]; f.apply(); old.resolve(quote(old.request));
  assert(!f.visible('feeSummary')); assert.equal(f.element('summaryPrice').textContent, 'Confirmando...');
  const c = f.pending(COUPON)[0]; c.resolve(coupon(c.request)); f.settle();
  const discounted = f.pending(PREVIEW)[0]; discounted.resolve(quote(discounted.request)); f.total(84.7); f.finish();
});

for (const change of ['quantity', 'method', 'lot', 'type', 'remove']) test('late coupon response ignored after ' + change + ' change', () => {
  const f = fixture({ coupon: () => PENDING }); f.select(); f.settle(); f.apply(); const old = f.pending(COUPON)[0];
  if (change === 'quantity') f.input('quantity', '2');
  if (change === 'method') f.method('CREDIT_CARD');
  if (change === 'lot') f.change('lotSelect', '');
  if (change === 'type') f.change('typeSelect', '');
  if (change === 'remove') f.click('couponRemove');
  old.resolve(coupon(old.request)); f.settle(); assert(!f.visible('promoSummary'));
  assert.equal(f.element('couponApply').disabled, false);
  if (change === 'lot' || change === 'type') assert(!f.visible('feeSummary'));
  else { f.total(change === 'quantity' ? 191.4 : 95.7); assert.equal(f.state.previews.at(-1).cupomCodigo, ''); }
  f.finish();
});

test('late coupon failure cannot erase a newer successful coupon', () => {
  const f = fixture({ coupon: () => PENDING }); f.select(); f.settle(); f.apply('LOCAL10'); const old = f.pending(COUPON)[0];
  f.input('quantity', '2'); f.apply('LOCAL20'); const newer = f.pending(COUPON).at(-1);
  newer.resolve(coupon(newer.request)); f.settle(); f.total(147.4); old.reject('OLD_COUPON_FAILURE');
  f.total(147.4); assert(f.visible('promoSummary')); assert.match(f.element('couponMessage').textContent, /aplicado/);
  assert.equal(f.state.previews.at(-1).cupomCodigo, 'LOCAL20'); f.finish();
});

test('coupon replacement cancel preserves quote; explicit replacement requotes', () => {
  const f = fixture(); f.select(); f.settle(); f.apply('LOCAL10'); f.settle(); f.total(84.7);
  f.apply('LOCAL20'); assert(f.visible('couponReplace')); assert.equal(f.state.coupons.length, 1);
  f.click('couponReplaceNo'); assert.equal(f.element('couponCode').value, 'LOCAL10'); f.total(84.7);
  f.apply('LOCAL20'); f.click('couponReplaceYes'); f.settle(); f.total(73.7);
  assert.equal(f.state.coupons.length, 2); assert.equal(f.state.previews.at(-1).cupomCodigo, 'LOCAL20'); f.finish();
});

for (const failure of ['invalid', 'RPC error']) test('coupon ' + failure + ' restores authoritative full-price quote', () => {
  const f = fixture({ coupon() { if (failure === 'RPC error') throw new Error('LOCAL_COUPON_OFFLINE'); return { sucesso: true, valido: false }; } });
  f.select(); f.settle(); f.apply(); f.settle(); f.total(95.7); assert(!f.visible('promoSummary'));
  assert.equal(f.state.previews.length, 2); assert.equal(f.state.previews.at(-1).cupomCodigo, ''); f.finish();
});

test('100% coupon on a paid catalog lot still requires an authoritative revision', () => {
  const f = fixture({ preview: () => PENDING }); f.select(); f.settle();
  const initial = f.pending(PREVIEW)[0]; initial.resolve(quote(initial.request)); f.apply('LOCAL100');
  f.click('payButton'); assert.equal(f.state.payments.length, 0); f.closeModal(); f.settle();
  const discounted = f.pending(PREVIEW)[0]; assert.equal(discounted.request.precoUnitario, 0);
  discounted.resolve(quote(discounted.request, 'LOCAL-FULL-DISCOUNT')); f.total(0); f.click('payButton');
  assert.equal(f.state.payments[0].politicaRevisaoVista, 'LOCAL-FULL-DISCOUNT');
  assert.equal(f.state.payments[0].politicaSubtotalVisto, 0); assert.equal(f.state.payments[0].politicaTotalVisto, 0);
  assert.equal(f.state.previews.length, 2); f.finish();
});

test('repeated payment handlers deduplicate while pending; failed retry preserves idempotency', () => {
  const f = fixture({ pay: () => PENDING }); f.select(); f.settle();
  // Direct handler invocation checks the state guard in addition to DOM disabled.
  f.element('payButton').onclick(); f.element('payButton').onclick(); f.clock.tick(0);
  assert.equal(f.state.payments.length, 1); assert.equal(f.element('payButton').disabled, true);
  const payment = f.pending(PAYMENT)[0]; payment.reject('CT_PC_REVISAO_DIVERGENTE');
  assert.equal(f.element('payButton').disabled, false); assert.equal(f.element('typeSelect').value, 'TYPE-0');
  assert.equal(f.element('lotSelect').value, 'LOT-0'); assert.equal(f.element('buyerName').value, 'Comprador de Teste Local');
  assert.match(f.element('modalText').textContent, /condição comercial/); f.closeModal(); f.settle(); f.total(95.7);
  f.click('payButton'); assert.equal(f.state.payments.length, 2);
  assert.equal(f.state.payments[0].idempotenciaChave, f.state.payments[1].idempotenciaChave);
  f.pending(PAYMENT)[0].resolve({ sucesso: false }); f.finish();
});

for (const count of [1, 2]) test('PRECO_ATUALIZADO reloads 87 to 120, restores buyer/selection/quantity ' + count + ', and requires explicit retry', () => {
  const f = fixture({
    catalog(eventId, n) { return n === 1 ? catalog(eventId) : PENDING; },
    pay(_request, n) { if (n === 1) throw new Error(PRICE_CHANGED); return { sucesso: false }; }
  });
  f.select(); f.input('quantity', count); f.settle(); f.participants();
  if (count === 2) f.document.querySelector('[data-phone]').value = '81988888888';
  f.element('buyerName').value = 'Nome preservado local'; f.element('buyerCpf').value = '000.000.000-00';
  f.element('buyerWhatsapp').value = '(81) 99999-9999'; f.element('buyerEmail').value = 'fixture@example.invalid';
  f.element('marketing').checked = true;
  f.click('payButton'); assert.equal(f.state.payments.length, 1); assert.equal(f.state.catalogs.length, 2);
  assert.equal(f.state.payments[0].politicaSubtotalVisto, 87 * count); assert.equal(f.state.payments[0].politicaTotalVisto, round(95.7 * count));
  assert(!f.visible('feeSummary')); assert.equal(f.element('summaryPrice').textContent, 'Confirmando...');
  const refreshed = catalog(ERA); Object.assign(refreshed.tipos[0].lotes[0], { precoNumero: 120, preco: money(120) });
  f.pending(CATALOG)[0].resolve(refreshed); f.settle(); f.total(132 * count);
  assert.equal(f.element('typeSelect').value, 'TYPE-0'); assert.equal(f.element('lotSelect').value, 'LOT-0');
  assert.equal(f.element('quantity').value, String(count)); assert.equal(f.element('buyerName').value, 'Nome preservado local');
  assert.equal(f.element('buyerCpf').value, '000.000.000-00'); assert.equal(f.element('buyerWhatsapp').value, '(81) 99999-9999');
  assert.equal(f.element('buyerEmail').value, 'fixture@example.invalid'); assert.equal(f.element('marketing').checked, true);
  assert.equal(f.state.previews.at(-1).precoUnitario, 120); assert.equal(f.state.previews.at(-1).quantidade, count);
  assert.equal(f.state.payments.length, 1, 'Catalog refresh and accepted requote never automatically resubmit payment');
  if (count === 2) {
    assert.equal(f.document.querySelector('[data-name]').value, 'Participante Local 0', 'Additional participant name survives catalog refresh');
    assert.equal(f.document.querySelector('[data-phone]').value, '81988888888', 'Additional participant phone survives catalog refresh');
  }
  f.closeModal(); f.click('payButton'); assert.equal(f.state.payments.length, 2);
  assert.equal(f.state.payments[1].politicaSubtotalVisto, 120 * count); assert.equal(f.state.payments[1].politicaTotalVisto, 132 * count);
  assert.equal(f.state.payments[1].idempotenciaChave, f.state.payments[0].idempotenciaChave); f.finish();
});

test('PRECO_ATUALIZADO revalidates the previous coupon against the refreshed catalog before quoting', () => {
  const f = fixture({
    catalog(eventId, n) { const response = catalog(eventId); if (n > 1) Object.assign(response.tipos[0].lotes[0], { precoNumero: 120, preco: money(120) }); return response; },
    coupon(request, n) { return n === 1 ? coupon(request) : PENDING; },
    pay(_request, n) { if (n === 1) throw new Error(PRICE_CHANGED); return { sucesso: false }; }
  });
  f.select(); f.settle(); f.apply('LOCAL10'); f.settle(); f.total(84.7); f.click('payButton');
  assert.equal(f.state.payments[0].politicaSubtotalVisto, 77); assert.equal(f.state.payments[0].politicaTotalVisto, 84.7);
  assert.equal(f.state.catalogs.length, 2); assert.equal(f.state.coupons.length, 2);
  assert.equal(f.state.coupons[1].codigo, 'LOCAL10'); assert.equal(f.element('couponCode').value, 'LOCAL10');
  f.closeModal(); f.click('payButton'); assert.equal(f.state.payments.length, 1, 'Coupon revalidation blocks a retry using the old coupon amount');
  const updatedCoupon = { sucesso: true, valido: true, cupom: { codigo: 'LOCAL10' }, calculo: { valorOriginalTotal: 120, valorFinalTotal: 100, descontoTotal: 20 } };
  f.pending(COUPON)[0].resolve(updatedCoupon); f.settle(); f.total(110);
  assert.equal(f.element('promoOriginal').textContent, money(120)); assert.equal(f.element('promoDiscount').textContent, '- ' + money(20));
  assert.equal(f.state.previews.at(-1).precoUnitario, 100); assert.equal(f.state.previews.at(-1).cupomCodigo, 'LOCAL10');
  assert.equal(f.state.payments.length, 1, 'New coupon response and quote do not automatically pay');
  f.closeModal(); f.click('payButton'); assert.equal(f.state.payments.length, 2);
  assert.equal(f.state.payments[1].politicaSubtotalVisto, 100); assert.equal(f.state.payments[1].politicaTotalVisto, 110);
  assert.equal(f.state.payments[1].cupomCodigo, 'LOCAL10'); f.finish();
});

for (const failure of ['unsuccessful response', 'RPC error']) test('PRECO_ATUALIZADO catalog refresh ' + failure + ' keeps checkout closed', () => {
  const f = fixture({
    catalog(eventId, n) { if (n === 1) return catalog(eventId); if (failure === 'RPC error') throw new Error('LOCAL_CATALOG_OFFLINE'); return { sucesso: false, mensagem: 'LOCAL_CATALOG_UNAVAILABLE' }; },
    pay() { throw new Error(PRICE_CHANGED); }
  });
  f.select(); f.settle(); f.click('payButton'); f.clock.tick(1000);
  assert.equal(f.state.payments.length, 1); assert.equal(f.state.catalogs.length, 2); assert.equal(f.state.previews.length, 1);
  assert(f.visible('closedPanel')); assert(!f.visible('salePanel')); assert(!f.visible('buyerPanel')); assert(!f.visible('payActionPanel'));
  assert(!f.visible('feeSummary')); assert.notEqual(f.element('summaryPrice').textContent, money(95.7)); f.finish();
});

test('unsuccessful payment response permits explicit retry with same key', () => {
  const f = fixture(); f.select(); f.settle(); f.click('payButton');
  assert.equal(f.element('payButton').disabled, false); f.closeModal(); f.click('payButton');
  assert.equal(f.state.payments.length, 2); assert.equal(f.state.payments[0].idempotenciaChave, f.state.payments[1].idempotenciaChave); f.finish();
});

test('payment method uses a separate persistent idempotency key', () => {
  const f = fixture(); f.select(); f.settle(); f.click('payButton'); f.closeModal();
  const pixKey = f.state.payments[0].idempotenciaChave; f.method('CREDIT_CARD'); f.settle(); f.click('payButton');
  const cardKey = f.state.payments[1].idempotenciaChave; assert.notEqual(pixKey, cardKey);
  f.closeModal(); f.method('PIX'); f.settle(); f.click('payButton'); assert.equal(f.state.payments[2].idempotenciaChave, pixKey); f.finish();
});

test('idempotency key survives reload through mocked local storage', () => {
  const storage = new Storage(); const first = fixture({ localStorage: storage }); first.select(); first.settle(); first.click('payButton'); first.finish();
  const second = fixture({ localStorage: storage }); second.select(); second.settle(); second.click('payButton');
  assert.equal(first.state.payments[0].idempotenciaChave, second.state.payments[0].idempotenciaChave); second.finish();
});

test('ERA catalog policy flag cannot disable the authoritative quote gate', () => {
  const f = fixture({ catalog() { return { ...catalog(ERA), politicaComercialAtiva: false }; }, preview: () => PENDING });
  f.select(); f.settle(); assert.equal(f.state.previews.length, 1); f.click('payButton');
  assert.equal(f.state.payments.length, 0); f.finish();
});

test('non-ERA paid checkout has no preview and no revision, even if catalog advertises policy', () => {
  const f = fixture({ eventId: LEGACY, catalog() { return { ...catalog(LEGACY), politicaComercialAtiva: true }; } });
  f.select(); f.settle(); f.total(87); assert.equal(f.state.previews.length, 0); assert(!f.visible('feeSummary'));
  f.click('payButton'); assert.equal(f.state.payments.length, 1); assert(!('politicaRevisaoVista' in f.state.payments[0]));
  assert(!('politicaSubtotalVisto' in f.state.payments[0])); assert(!('politicaTotalVisto' in f.state.payments[0])); f.finish();
});

test('non-ERA coupon retains legacy direct-render behavior and no revision', () => {
  const f = fixture({ eventId: LEGACY }); f.select(); f.input('quantity', '2'); f.participants();
  const before = f.document.querySelector('[data-name]'); f.apply(); f.total(154);
  assert.strictEqual(f.document.querySelector('[data-name]'), before, 'Legacy coupon response must not call updateSummary/rebuild participants');
  assert(f.visible('promoSummary')); assert(!f.visible('feeSummary')); assert.equal(f.state.previews.length, 0);
  f.click('payButton'); assert.equal(f.state.payments[0].cupomCodigo, 'LOCAL10'); assert(!('politicaRevisaoVista' in f.state.payments[0]));
  assert(!('politicaSubtotalVisto' in f.state.payments[0])); assert(!('politicaTotalVisto' in f.state.payments[0])); f.finish();
});

test('non-ERA delayed coupon keeps its established response behavior', () => {
  const f = fixture({ eventId: LEGACY, coupon: () => PENDING }); f.select(); f.apply(); const old = f.pending(COUPON)[0];
  f.input('quantity', '2'); old.resolve(coupon(old.request)); f.total(77);
  assert(f.visible('promoSummary')); assert.equal(f.state.previews.length, 0); f.finish();
});

test('authentic free catalog lot remains zero, no preview and no revision for PIX or card', () => {
  for (const method of ['PIX', 'CREDIT_CARD']) {
    const f = fixture(); f.select(2); f.method(method); f.settle(); f.total(0);
    assert.equal(f.state.previews.length, 0); assert(!f.visible('feeSummary')); assert(!f.visible('feeStatus'));
    f.click('payButton'); assert.equal(f.state.payments.length, 1); assert(!('politicaRevisaoVista' in f.state.payments[0]));
  assert(!('politicaSubtotalVisto' in f.state.payments[0])); assert(!('politicaTotalVisto' in f.state.payments[0])); f.finish();
  }
});

for (const [label, price] of [['missing', undefined], ['null', null], ['blank', ''], ['numeric string', '87'], ['zero string', '0'], ['NaN', NaN], ['Infinity', Infinity], ['negative', -1]]) test('invalid catalog price fails closed: ' + label, () => {
  const f = fixture({ catalog() { const response = catalog(ERA); response.tipos[0].lotes[0].precoNumero = price; return response; } });
  f.select(); f.settle(); assert.equal(f.element('summaryPrice').textContent, 'A confirmar');
  assert(!f.visible('feeSummary')); assert.equal(f.state.previews.length, 0, 'Do not quote an invalid catalog price');
  f.click('payButton'); assert.equal(f.state.payments.length, 0); f.finish();
});

test('non-ERA unavailable quantity keeps legacy unavailable summary', () => {
  const f = fixture({ eventId: LEGACY, catalog() { const response = catalog(LEGACY); Object.assign(response.tipos[0].lotes[0], { quantidadeLimitada: true, disponiveis: 1 }); return response; } });
  f.select(); f.input('quantity', '2'); f.settle(); assert.equal(f.element('summaryPrice').textContent, '—');
  assert.equal(f.element('summaryTitle').textContent, 'Quantidade indisponível');
  f.participants(); f.click('payButton'); assert.equal(f.state.payments.length, 0); assert.equal(f.state.previews.length, 0); f.finish();
});

test('checkout event-back link stays on the official relative event route', () => {
  for (const eventId of [ERA, LEGACY]) {
    const f = fixture({ eventId }); assert.equal(f.element('eventBack').href, '/evento/?evento=' + encodeURIComponent(eventId));
    assert(!f.element('eventBack').href.includes('script.google.com')); f.finish();
  }
});


for(const locale of ['pt-BR','en-US','es','zh-Hans']) test('language '+locale+' preserves filled fields, selections, timers, calls and payment payload',()=>{
 const baseline=fixture();baseline.select();baseline.settle();const baselineTotal=baseline.element('summaryPrice').textContent;baseline.click('payButton');
 const f=fixture();f.select();f.settle();
 const fields=['buyerName','buyerCpf','buyerWhatsapp','typeSelect','lotSelect','quantity'];
 const values=fields.map(id=>f.element(id).value);
 const calls=structuredClone(f.state.calls.map(c=>({method:c.method,args:c.args,request:c.request})));
 const jobs=[...f.clock.jobs.keys()];
 for(const target of [locale,'pt-BR',locale])f.sandbox.CTPublicI18n.setLocale(target);
 assert.deepEqual(fields.map(id=>f.element(id).value),values);
 assert.deepEqual(f.state.calls.map(c=>({method:c.method,args:c.args,request:c.request})),calls);
 assert.deepEqual([...f.clock.jobs.keys()],jobs,'no restarted timers');
 assert.equal(f.element('payButton').textContent,locale==='pt-BR'?'Gerar PIX e reservar ingresso':f.sandbox.CTCheckoutTranslations['Gerar PIX e reservar ingresso'][locale]);
 assert.equal(f.element('summaryPrice').textContent,baselineTotal);f.click('payButton');
 assert.deepEqual(f.state.payments,baseline.state.payments,'exact payment request is unchanged');
 f.finish();baseline.finish();
});
test('new event document inherits preference without retaining prior event bindings',()=>{
 const first=fixture(); first.sandbox.CTPublicI18n.setLocale('zh-Hans');
 const next=fixture({eventId:LEGACY,localStorage:first.sandbox.localStorage});
 assert.equal(next.sandbox.CTPublicI18n.getLocale(),'zh-Hans');
 assert.equal(next.state.catalogs[0],LEGACY);
 assert.equal(next.element('payButton').textContent,next.sandbox.CTCheckoutTranslations['Gerar PIX e reservar ingresso']['zh-Hans']);
 next.sandbox.CTPublicI18n.setLocale('es'); assert.equal(first.sandbox.CTPublicI18n.getLocale(),'zh-Hans');
 first.finish();next.finish();
});


for(const locale of ['pt-BR','en-US','es','zh-Hans']) for(const method of ['PIX','CREDIT_CARD']) test('language '+locale+' pending '+method+' polling schedule and payload unchanged',()=>{
 const response={sucesso:true,consultaToken:'LOCAL-POLLING-TOKEN',pedido:{pedidoId:'ORDER-LOCAL',status:'AGUARDANDO_PAGAMENTO',expiraEm:'2026-10-08T12:10:00.000Z'},pagamento:{forma:method,invoiceUrl:'https://example.invalid/card',pix:{copiaECola:'NOT-PAYABLE'}},ingressos:[]};
 const setup=()=>{const f=fixture({pendingLanguageFixture:true,pay:()=>structuredClone(response),consult:()=>structuredClone(response)});f.select();f.method(method);f.settle();f.click('payButton');return f};
 const baseline=setup(),f=setup();
 const jobs=[...f.clock.jobs].map(([id,job])=>[id,job.at,job.interval]);
 const calls=structuredClone(f.state.calls.map(c=>({method:c.method,args:c.args,request:c.request})));
 for(const lang of [locale,'pt-BR',locale])f.sandbox.CTPublicI18n.setLocale(lang);
 assert.deepEqual([...f.clock.jobs].map(([id,job])=>[id,job.at,job.interval]),jobs);
 assert.deepEqual(f.state.calls.map(c=>({method:c.method,args:c.args,request:c.request})),calls);
 baseline.clock.tick(16000);f.clock.tick(16000);
 assert.deepEqual(f.state.calls.map(c=>({method:c.method,args:c.args})),baseline.state.calls.map(c=>({method:c.method,args:c.args})));assert.deepEqual(f.state.polls,baseline.state.polls);assert(f.state.polls.length>0,'real application polling was exercised');
 assert.deepEqual(f.state.payments,baseline.state.payments);assert.equal(f.state.payments.length,1);
 baseline.finish();f.finish();
});


test('language templates prefer specific coupon message and preserve replacement values',()=>{
 const f=fixture();f.sandbox.CTPublicI18n.setLocale('en-US');
 assert.equal(f.sandbox.CTCheckoutLanguage.text('Cupom aplicado! Você ganhou {amount} de desconto.',{amount:'R$ 10,00'}),'Coupon applied! You saved R$ 10,00.');
 assert.equal(f.sandbox.CTCheckoutLanguage.text('Cupom {code}',{code:'ABC-LOCAL'}),'Coupon ABC-LOCAL');
 assert.equal(f.sandbox.CTCheckoutLanguage.text('{name} — {price} · {count} acesso(s) disponível(is)',{name:'Nome Original',price:'R$ 20,00',count:2}),'Nome Original — R$ 20,00 · 2 admission(s) available');
 f.finish();
});


for(const name of ['Cupom VIP','Participante Premium','Cupom {code}','Participante {count}'])for(const limited of [true,false])test('language producer lot remains exact '+name+' limited='+limited,()=>{
 const f=fixture({catalog(){const c=catalog(ERA);c.tipos[0].lotes[0].nome=name;c.tipos[0].lotes[0].quantidadeLimitada=limited;return c;}});
 f.select();f.settle();const option=f.element('lotSelect').children.find(n=>n.value==='LOT-0');
 for(const locale of ['en-US','es','zh-Hans','pt-BR']){f.sandbox.CTPublicI18n.setLocale(locale);assert(option.textContent.startsWith(name+' — '+money(87)));}
 f.finish();
});
test('language arbitrary source and producer promotional suffix are never inferred as templates',()=>{
 const f=fixture();f.sandbox.CTPublicI18n.setLocale('en-US');
 for(const source of ['Cupom bloqueado por análise de segurança.','Cupom aplicado! Você ganhou R$ 10,00 de desconto. Benefício exclusivo do produtor.','Participante Premium','Cupom VIP','Cupom {code}','Participante {count}']){
  assert.equal(f.sandbox.CTCheckoutLanguage.text(source),source);
  f.sandbox.CTCheckoutLanguage.write(f.element('couponMessage'),source);
  for(const target of ['es','zh-Hans','pt-BR','en-US']){f.sandbox.CTPublicI18n.setLocale(target);assert.equal(f.element('couponMessage').textContent,source);assert.equal(f.element('couponMessage').lang,'pt-BR');}
 }
 f.finish();
});


if(process.env.CT_LOCALE_ROUTE==='checkout-v2')for(const payer of ['COMPRADOR','PRODUTOR','DIVIDIDA'])for(const additional of [0,3])test('language v2 fee presentation '+payer+' additional='+additional,()=>{
 const f=fixture({catalog(){const c=catalog(ERA);c.politicaComercial={ativa:true};return c;},preview(p){const r=quote(p);r.resumo.pagadorTaxa=payer;r.resumo.taxaComprador=payer==='PRODUTOR'?0:payer==='DIVIDIDA'?r.resumo.taxaCtTotal/2:r.resumo.taxaCtTotal;r.resumo.taxaProdutor=r.resumo.taxaCtTotal-r.resumo.taxaComprador;r.resumo.adicionaisComprador=additional;r.resumo.totalComprador=r.resumo.subtotalIngressos+r.resumo.taxaComprador+additional;return r;}});
 f.select();f.settle();const total=f.element('summaryPrice').textContent,calls=f.state.calls.length;
 for(const locale of ['en-US','es','zh-Hans','pt-BR']){
  f.sandbox.CTPublicI18n.setLocale(locale);
  const label=payer==='COMPRADOR'?'Taxa Carioca Ticket':payer==='PRODUTOR'?'Taxa Carioca Ticket · paga pelo produtor':'Sua parte da taxa Carioca Ticket';
  assert.equal(f.element('feeLabel').textContent,locale==='pt-BR'?label:f.sandbox.CTCheckoutTranslations[label][locale]);
  const note=f.element('feeNote').textContent;assert.equal(f.element('feeNote').lang,locale);
  if(locale==='en-US'){assert(!note.includes('Encargos'));assert(!note.includes('O produtor'));}
  if(payer!=='COMPRADOR')assert(note.includes(money(payer==='PRODUTOR'?8.7:4.35)));
  assert.equal(f.element('summaryPrice').textContent,total);assert.equal(f.state.calls.length,calls);
 }
 f.finish();
});
for(const known of [true,false])test('language actual coupon condition '+(known?'authored':'unknown'),()=>{
 const unknown='Benefício exclusivo do produtor.';
 const f=fixture({coupon(p){const c=coupon(p);if(known)c.cupom.somenteAcesso=true;else c.cupom.observacaoPublica=unknown;return c;}});
 f.select();f.settle();f.sandbox.CTPublicI18n.setLocale('en-US');f.apply();f.settle();
 const actual=f.element('couponMessage').textContent;
 assert.equal(actual,known?'Coupon applied! You saved '+money(10)+'. Promotional ticket: admission only. The official event cup is not included.':'Cupom aplicado! Você ganhou '+money(10)+' de desconto. '+unknown);
 for(const locale of ['zh-Hans','es','en-US']){f.sandbox.CTPublicI18n.setLocale(locale);if(!known)assert.equal(f.element('couponMessage').textContent,actual);}
 f.finish();
});

console.log(`\n${failed ? 'FAIL' : 'PASS'} checkout-era-beauty.dom: ${passed} passed, ${failed} failed; actual inline JS + local DOM/RPC mocks; zero real charges/orders/tickets.`);
console.log('Not verified here: real browser rendering/navigation/accessibility, iframe RPC transport, or backend/payment-provider behavior.');
if (failed) process.exitCode = 1;

