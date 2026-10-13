'use strict';

// Derived from the PR220 dependency-free DOM harness. LOCAL ONLY.
// No browser fidelity, real RPC transport, actual order or provider is exercised.
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
  constructor() { this.now = START; this.elapsed = 0; this.nextId = 1; this.jobs = new Map(); }
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
      this.elapsed += Math.max(0, job.at - this.now);
      this.now = job.at;
      this.jobs.delete(job.id);
      if (job.interval) this.jobs.set(job.id, { ...job, at: job.at + job.interval });
      job.fn(...job.args);
    }
    this.elapsed += Math.max(0, end - this.now);
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
    this.children = []; this.parentNode = null; this.attributes = {}; this.style = {}; this.dataset = {};
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
  get firstChild() { return this.children[0] || null; }
  insertBefore(child, reference) {
    if (reference == null) return this.appendChild(child);
    const index = this.children.indexOf(reference);
    assert(index >= 0, 'insertBefore requires an existing reference child');
    if (child.parentNode) child.remove();
    child.parentNode = this; this.children.splice(this.children.indexOf(reference), 0, child); return child;
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
    event.target ||= this; event.preventDefault ||= () => { event.defaultPrevented = true; };
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
    this.body = this.querySelector('body');
    assert(this.body, 'Actual checkout body was parsed');
  }
  createElement(tag) { return new Element(tag, this); }
  getElementById(id) { return this.querySelector('#' + id); }
  execCommand() { return false; }
}

const EVENT = 'EVT-LOCAL-TEMPORAL';
function envelope(now = 0, ttl = 60000, patch = {}) {
  return { temporalVersion: 1, serverNow: new Date(START + now).toISOString(), temporalEvaluatedAt: new Date(START + now).toISOString(),
    validUntil: new Date(START + now + ttl).toISOString(), nextTransitionAt: null, ...patch };
}
function catalog(now = 0, ttl = 60000, lot = 'A', eventId = EVENT, patch = {}) {
  return { sucesso: true, ...envelope(now, ttl), evento: { id: eventId, nome: 'Synthetic local event', data: '20/12/2030', local: 'Fixture only' },
    visual: {}, identidadeCliente: { emailObrigatorio: false }, menorPreco: lot === 'NONE' ? '' : 'R$ 25,00',
    tipos: lot === 'NONE' ? [] : [{ id: 'TYPE', nome: 'Individual', capacidadePorVenda: 1,
      lotes: [{ id: lot, nome: 'Lote ' + lot, preco: 'R$ 25,00', precoNumero: 25, quantidadeLimitada: false, disponiveis: 100 }] }], ...patch };
}
function order(method = 'PIX', status = 'AGUARDANDO_PAGAMENTO', expiry = START + 120000) {
  return { sucesso: true, encontrado: true, autorizado: true, consultaToken: 'SYNTHETIC-TOKEN',
    pedido: { pedidoId: 'SYNTHETIC-ORDER', eventoId: EVENT, status, expiraEm: new Date(expiry).toISOString() },
    pagamento: { forma: method, pix: method === 'PIX' ? { copiaECola: 'LOCAL-NOT-PAYABLE' } : null,
      invoiceUrl: method === 'CREDIT_CARD' ? 'https://example.invalid/synthetic-card' : '' },
    ingressoEmitido: status === 'CONCLUIDO', ingressos: status === 'CONCLUIDO'
      ? [{ codigo: 'LOCAL', link: 'https://cariocaticket.com.br/ingresso/?codigo=LOCAL&sig=SYNTHETIC' }] : [] };
}
function fixture(route, options = {}) {
  const HTML = fs.readFileSync(path.join(ROOT, route, 'index.html'), 'utf8');
  const checkout = route.startsWith('checkout'), clock = new Clock();
  const state = { calls: [], catalogs: [], payments: [], polls: [], reconciles: [], recoveries: [], coupons: [], campaigns: [], previews: [], unexpected: [] };
  const forbidden = what => { state.unexpected.push(what); throw Error('NETWORK_OR_UNDECLARED_ACTION: ' + what); };
  const document = new Document(HTML, forbidden), eventId = options.eventId || EVENT;
  const url = new URL('https://offline.invalid/' + route + '/?evento=' + eventId + (options.query || ''));
  const localStorage = options.localStorage || new Storage(), sessionStorage = options.sessionStorage || new Storage();
  if (options.recovery) localStorage.setItem('CT_CHECKOUT_RECOVERY_' + eventId, JSON.stringify({ pedidoId: 'SYNTHETIC-ORDER', token: 'SYNTHETIC-TOKEN' }));
  if (options.savedAttempt) localStorage.setItem('CT_CHECKOUT_IDEMPOTENCY_' + eventId + '_PIX', 'SYNTHETIC-KEY');
  const listeners = new Map(); let next = 0;
  class FakeDate extends Date { constructor(...args) { super(...(args.length ? args : [clock.now])); } static now() { return clock.now; } }
  const sandbox = { document, console, URL, URLSearchParams, Date: FakeDate, performance: { now: () => clock.elapsed }, localStorage, sessionStorage,
    location: { href: url.href, origin: url.origin, search: url.search, hash: '', pathname: url.pathname, assign: () => forbidden('navigation') },
    navigator: { onLine: true, userAgent: 'OFFLINE_SYNTHETIC_TEST' }, crypto: { randomUUID: () => 'SYNTHETIC-' + ++next },
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    setTimeout: clock.timeout.bind(clock), clearTimeout: clock.clear.bind(clock), setInterval: clock.interval.bind(clock), clearInterval: clock.clear.bind(clock),
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    fetch: () => forbidden('fetch'), XMLHttpRequest: function () { forbidden('XHR'); }, WebSocket: function () { forbidden('WebSocket'); }, open: () => forbidden('open') };
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.top = sandbox;
  const context = vm.createContext(sandbox, { name: 'four-public-pages-offline', codeGeneration: { strings: false, wasm: false } });
  function rpc(method, args, success, failure) {
    const mappings = {
      ctEventoPublicoCarregarPROD: ['catalogs', options.catalog || (() => catalog(clock.elapsed, 60000, 'A', eventId))],
      ctCheckoutPublicoCarregarEventoPROD: ['catalogs', options.catalog || (() => catalog(clock.elapsed, 60000, 'A', eventId))],
      ctCheckoutPixPublicoIniciarPROD: ['payments', options.pay || (() => order(options.method))],
      ctCheckoutPixPublicoConsultarPROD: ['recoveries', options.recover || (() => order(options.method))],
      ctCheckoutPixPublicoStatusLocalPROD: ['polls', options.poll || (() => order(options.method))],
      ctCheckoutPixPublicoReconciliarPROD: ['reconciles', options.reconcile || (() => order(options.method))],
      ctCuponsPublicoValidarSeguroPROD: ['coupons', options.coupon || (() => ({ sucesso: true, valido: true, cupom: { codigo: 'LOCAL' }, calculo: { valorOriginalTotal: 25, valorFinalTotal: 20, descontoTotal: 5 } }))],
      ctCuponsPublicoRegistrarAcessoSeguroPROD: ['campaigns', () => ({ sucesso: true })],
      ctPoliticaComercialPreviewPublicoPROD: ['previews', options.preview || (() => ({ sucesso: false }))]
    };
    if (!mappings[method]) return forbidden('RPC ' + method);
    const [collection, handler] = mappings[method];
    const call = { method, args: clone(args), at: clock.elapsed, resolved: false,
      resolve(value) { assert(!call.resolved); call.resolved = true; if (success) success(clone(value)); },
      reject(error) { assert(!call.resolved); call.resolved = true; if (failure) failure(error); } };
    state.calls.push(call); state[collection].push(call);
    clock.timeout(() => { let result; try { result = handler(call, state[collection].length, clock); } catch (error) { call.reject(error); return; }
      if (result !== PENDING) call.resolve(result); }, 0);
  }
  function runner(success, failure) { return new Proxy({}, { get(_target, property) {
    if (property === 'withSuccessHandler') return fn => runner(fn, failure);
    if (property === 'withFailureHandler') return fn => runner(success, fn);
    return (...args) => rpc(String(property), args, success, failure);
  } }); }
  if (!options.missingClock) vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/public-catalog-clock.js'), 'utf8'), context);
  vm.runInContext(POLICY, context);
  const scripts = [...HTML.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m => !/\bsrc\s*=/.test(m[1]));
  assert.equal(scripts.length, 2, 'Review actual script topology if changed');
  scripts.forEach((script, index) => {
    if (script[2].includes('var state={')) { assert(sandbox.google?.script?.run); sandbox.google.script.run = runner(); }
    vm.runInContext(script[2], context, { filename: route + '/index.html:inline-' + index, timeout: 1000 });
  });
  clock.tick(0);
  const element = id => { const el = document.getElementById(id); assert(el, 'DOM #' + id); return el; };
  const f = { route, state, clock, sandbox, document, element,
    signal(type, patch = {}) { const event = { type, ...patch }; for (const fn of listeners.get(type) || []) fn(event); },
    visibility(value) { document.visibilityState = value; document.dispatchEvent({ type: 'visibilitychange' }); },
    dispatch(id, type, patch = {}) { const event = { type, ...patch }; element(id).dispatchEvent(event); return event; },
    click(id) { element(id).click(); clock.tick(0); },
    change(id, value) { element(id).value = value; this.dispatch(id, 'change'); clock.tick(0); },
    select(lot = 'A') { this.change('typeSelect', 'TYPE'); this.change('lotSelect', lot); },
    fill() { this.select(); element('buyerName').value = 'Local synthetic buyer'; element('buyerCpf').value = '00000000000'; element('buyerWhatsapp').value = '81999999999'; },
    visible(id) { return !element(id).classList.contains('hidden') && !element(id).hidden; },
    delay(ms) { clock.elapsed += ms; clock.now += ms; for (const j of clock.jobs.values()) if (j.at < clock.now) j.at = clock.now; },
    finish() { assert.deepEqual(state.unexpected, []); } };
  return f;
}
module.exports = { fixture, envelope, catalog, order, Storage, PENDING, START, EVENT };
