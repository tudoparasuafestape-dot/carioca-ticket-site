'use strict';

// Local-only temporal harness, derived from the existing commercial-policy DOM harness.
// Its mocks never submit forms or contact any network. Run the parent test file.
// Original harness command:
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
const ROOT = path.resolve(__dirname, '../..');
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
  constructor(tag, document) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = document;
    this.children = []; this.parentNode = null; this.attributes = {}; this.style = {};
    this._text = ''; this._value = ''; this._className = ''; this.disabled = false;
    this.checked = false; this.dataset = {}; this.listeners = new Map();
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
  replaceChildren(...children) { this.children = []; this._text = ''; this.append(...children); }
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
    this.body = this.querySelector('body');this.documentElement=this.querySelector('html');
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
  const HTML = fs.readFileSync(path.join(ROOT, options.route || 'checkout/index.html'),'utf8');
  const clock = new Clock();
  const state = { eventId: options.eventId || ERA, previews: [], coupons: [], payments: [], catalogs: [], consults: [], statuses: [], reconciles: [], unexpected: [], calls: [] };
  const forbidden = description => { state.unexpected.push(description); throw new Error('Forbidden external side effect: ' + description); };
  const document = new Document(HTML, forbidden);
  const url = new URL('https://checkout.local.test/checkout/?evento=' + encodeURIComponent(state.eventId));
  let uuids = 0;
  class FakeDate extends Date { constructor(...args) { super(...(args.length ? args : [clock.now])); } static now() { return clock.now; } }
  const windowListeners = new Map();
  const sandbox = {
    document, console, URL, URLSearchParams, Date: FakeDate, performance:{now:()=>clock.now-START},
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
      ctCheckoutPixPublicoConsultarPROD: ['consults',options.recover || (()=>({sucesso:false}))],
      ctCheckoutPixPublicoStatusLocalPROD: ['statuses',options.recover || (()=>({sucesso:false}))],
      ctCheckoutPixPublicoReconciliarPROD: ['reconciles',options.recover || (()=>({sucesso:false}))],
      ctCheckoutPublicoCarregarEventoPROD: ['catalogs', options.catalog || (() => catalog(state.eventId))],
      ctPoliticaComercialPreviewPublicoPROD: ['previews', options.preview || (p => quote(p))],
      ctCuponsPublicoValidarSeguroPROD: ['coupons', options.coupon || coupon],
      ctCheckoutPixPublicoIniciarPROD: ['payments', options.pay || (() => ({ sucesso: false, mensagem: 'LOCAL MOCK: no order or ticket is created.' }))]
    };
    if (!mappings[method]) return forbidden('Unexpected RPC ' + method);
    const [collection, handler] = mappings[method];
    const request = clone(args[0]);
    state[collection].push(request);
    const call = { method, request, resolved: false,
      resolve(result) {
        assert(!call.resolved, 'A mock RPC resolves at most once'); call.resolved = true;
        // Never exercise a real financial success path, even in a fixture.
        if (collection === 'payments') assert(!result?.pedido, 'Mock payment cannot create an order');
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

  for(const asset of ['public-catalog-clock.js','public-lot-status.js']) if(!options.missingHelper)vm.runInContext(fs.readFileSync(path.join(ROOT,'assets',asset),'utf8'),context,{filename:asset});
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
  if(!options.allowClosed)assert.equal(element('closedPanel').classList.contains('hidden'), true, 'Catalog rendered without swallowed DOM errors');
  element('buyerName').value = 'Comprador de Teste Local';
  element('buyerCpf').value = '00000000000';
  element('buyerWhatsapp').value = '81999999999';
  const f = { state, clock, document, sandbox, element,
    dispatch(name){for(const fn of windowListeners.get(name)||[])fn({type:name});clock.tick(0);},
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

module.exports={fixture,Storage,PENDING,START};
