'use strict';

// LOCAL-ONLY: run `node tests/era-finance-summary.runtime.js`.
// Executes the finance page's unmodified inline script against a minimal DOM.
// Form submission is an in-memory RPC mock, including the actual postMessage
// response path. No sockets, provider, real credentials, or real funds are used.
// This does not claim browser layout, accessibility, or production transport QA.
// Compares original nodes and financial request functions to pinned main. Uses
// a preserved local snapshot when available, otherwise git show (CI fetch-depth:0).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const HTML = fs.readFileSync(path.join(__dirname, '../produtor/financeiro/index.html'), 'utf8');
const ERA = 'EVT-23112026-ERA-BEAUTY-EAC4B673';
const BIOCRED = 'PROD-1D96238E910D473CBC159AABCC2EAA94';
const OTHER_EVENT = 'EVT-LOCAL-OTHER';
const OTHER_PRODUCER = 'PROD-LOCAL-OTHER';
const TOKEN = 'LOCAL_MOCK_SESSION_ONLY';
const PENDING = Symbol('pending mock response');
const clone = value => structuredClone(value);
const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
let checks = 0;

class Element {
  constructor(tag, document) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = document;
    this.children = []; this.parentNode = null; this.attributes = {};
    this.style = {}; this.className = ''; this._text = ''; this.value = '';
    this.disabled = false; this.listeners = new Map();
    this.classList = {
      contains: value => this.className.split(/\s+/).includes(value),
      add: (...values) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...values])].join(' '); },
      remove: (...values) => { this.className = this.className.split(/\s+/).filter(value => value && !values.includes(value)).join(' '); },
      toggle: (value, force) => {
        const on = force === undefined ? !this.classList.contains(value) : !!force;
        this.classList[on ? 'add' : 'remove'](value); return on;
      }
    };
  }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.children = []; this._text = String(value ?? ''); }
  set innerHTML(value) { this.children = []; this._text = ''; parse(String(value), this, this.ownerDocument); }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = String(value);
    else if (name === 'disabled') this.disabled = true;
    else if (!name.startsWith('aria-')) this[name] = String(value);
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); }
  querySelectorAll(selector) {
    const result = [];
    function visit(node) {
      for (const child of node.children) {
        if (selector === '[id]' ? !!child.id : selector.startsWith('#') ? child.id === selector.slice(1) : child.tagName === selector.toUpperCase()) result.push(child);
        visit(child);
      }
    }
    visit(this); return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  dispatchEvent(event) {
    event.target ||= this;
    for (const callback of this.listeners.get(event.type) || []) callback.call(this, event);
  }
  click() { if (!this.disabled) this.dispatchEvent({ type: 'click' }); }
  submit() { this.ownerDocument.submitMock(this); }
}
function parse(html, root, document) {
  const stack = [root];
  const voids = new Set(['AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR', 'IMG', 'INPUT', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR']);
  for (const match of html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/([\w-]+)\s*>|<([\w-]+)((?:"[^"]*"|'[^']*'|[^'">])*)>|([^<]+)/g)) {
    if (match[1]) {
      const index = stack.findLastIndex(node => node.tagName === match[1].toUpperCase());
      if (index > 0) stack.length = index;
    } else if (match[2]) {
      const node = new Element(match[2], document);
      for (const attr of match[3].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) node.setAttribute(attr[1], attr[2] ?? attr[3] ?? attr[4] ?? '');
      stack.at(-1).appendChild(node);
      if (!voids.has(node.tagName)) stack.push(node);
    } else if (match[4]) stack.at(-1)._text += match[4];
  }
}
class Document extends Element {
  constructor(html) {
    super('document', null); this.ownerDocument = this;
    parse(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ''), this, this);
    this.body = this.querySelector('body'); assert(this.body);
  }
  createElement(tag) { return new Element(tag, this); }
  getElementById(id) { return this.querySelector('#' + id); }
}
function producer(id = BIOCRED, events = [ERA]) {
  return { id, nomeFantasia: 'LOCAL TEST PRODUCER', eventos: events.map(event => ({ id: event, nome: 'LOCAL TEST EVENT ' + event })) };
}
function summary(produtorId = BIOCRED, eventoId = ERA) {
  return {
    sucesso: true, autorizado: true, produtorId, eventoId, atualizadoEm: 'LOCAL MOCK',
    vendas: { confirmado: 1100, vendasElegiveisAntecipacao: 1000, composicaoEra: {
      brutoConfirmado: 1100, taxaCtConfirmada: 100, liquidoProdutorConfirmado: 1000,
      outrasDeducoesConfirmadas: 0, pagamentosSemComposicao: 0
    } },
    ledger: { saldoOperacional: 137, porOrigem: { VENDAS_PORTARIA: 21, VENDAS_BAR: 22, PATROCINIO: 23, CAPITAL_PROPRIO: 24, ANTECIPACAO: 25 } },
    antecipacao: { percentualMaximo: 80, reservaPercentual: 20, taxaCtPercentual: 3.5, disponivelSolicitar: 800, jaSolicitadoAberto: 0, providerHabilitado: false },
    financeiro: { configurado: true, prontoParaOperar: false, status: 'PENDENTE', movimentacaoRealHabilitada: false, aportePixHabilitado: false },
    saque: { saldoAutoritativoDisponivel: false, saldoDisponivel: 0, minimoSolicitacao: 500, jaSolicitadoAberto: 0 },
    solicitacoes: { pagamentosPlanejados: 26, antecipacoesAbertas: 0, saquesAbertos: 0 }
  };
}
function fixture(options = {}) {
  const document = new Document(options.html || HTML), calls = [], responses = [], redirects = [];
  const windowListeners = new Map(), timers = new Map(); let nextId = 1;
  const producers = options.producers || [producer()];
  const storage = { getItem: () => options.noSession ? null : JSON.stringify({ token: TOKEN }) };
  const forbidden = description => { throw new Error('External action forbidden in local test: ' + description); };
  const sandbox = {
    document, console, sessionStorage: storage, localStorage: storage,
    crypto: { randomUUID: () => 'LOCAL-UUID-' + nextId++ },
    setTimeout: callback => { const id = nextId++; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    location: { replace: url => redirects.push(url) },
    addEventListener(type, callback) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(callback);
    },
    fetch: () => forbidden('fetch'), XMLHttpRequest: function () { forbidden('XHR'); },
    WebSocket: function () { forbidden('WebSocket'); }, open: () => forbidden('open')
  };
  sandbox.window = sandbox;
  document.submitMock = form => {
    assert.equal(form.tagName, 'FORM'); assert.equal(form.method, 'POST');
    const fields = Object.fromEntries(form.children.map(child => [child.name, child.value]));
    assert.equal(fields.ctMinhaCariocaAction, 'portalRpc');
    const method = fields.metodo, args = JSON.parse(fields.argsJson);
    const handlers = {
      ctPortalProdutorRestaurarSessaoIsoladaPROD: () => ({ sucesso: true, autenticado: true, autorizado: true, produtores: producers }),
      ctContaCariocaPayPortalResumoPROD: () => options.summary ? options.summary(args[1]) : summary(producers[0].id, args[1]),
      ctContaCariocaPayPortalSolicitarAntecipacaoPROD: () => options.advance ? options.advance(args) : { sucesso: false },
      ctContaCariocaPayPortalSolicitarSaquePROD: () => options.withdraw ? options.withdraw(args) : { sucesso: false }
    };
    assert(handlers[method], 'Only explicitly mocked RPC methods are permitted: ' + method);
    const call = { method, args, resolved: false,
      respond(result, ok = true, origin = 'https://script.google.com') {
        assert(!call.resolved); if (origin === 'https://script.google.com') call.resolved = true;
        const data = { ctMinhaCariocaPost: true, id: fields.ctMinhaCariocaRequestId, ok, resultado: clone(result), erro: ok ? undefined : String(result) };
        for (const callback of windowListeners.get('message') || []) callback({ origin, data });
      }
    };
    calls.push(call);
    const result = handlers[method]();
    if (result !== PENDING) responses.push(() => call.respond(result));
  };
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  for (const script of (options.html || HTML).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(script[1])) vm.runInContext(script[2], context, { filename: 'produtor/financeiro/index.html', timeout: 1000 });
  }
  const api = {
    document, calls, redirects, timers,
    el: id => { const el = document.getElementById(id); assert(el, 'Actual HTML includes #' + id); return el; },
    async flush() { for (let i = 0; i < 20; i++) { while (responses.length) responses.shift()(); await Promise.resolve(); } },
    async click(id) { api.el(id).click(); await api.flush(); },
    async select(id, value) { api.el(id).value = value; api.el(id).dispatchEvent({ type: 'change' }); await api.flush(); },
    async refresh() { await api.click('refreshButton'); },
    requests: method => calls.filter(call => call.method === method),
  };
  return api;
}
const advanceMethod = 'ctContaCariocaPayPortalSolicitarAntecipacaoPROD';
const withdrawMethod = 'ctContaCariocaPayPortalSolicitarSaquePROD';
function textIs(f, id, value) { assert.equal(f.el(id).textContent, value, id); }
function hiddenIs(f, id, value) { assert.equal(f.el(id).classList.contains('hidden'), value, id); }
function gatesOff(f) {
  textIs(f, 'realMovement', 'Desabilitada'); textIs(f, 'depositPix', 'Desabilitado'); textIs(f, 'providerAdvance', 'Desabilitada');
  for (const id of ['realMovement', 'depositPix', 'providerAdvance']) assert.equal(f.el(id).className, 'off');
}
async function check(name, run) { await run(); checks++; console.log('PASS ' + name); }

(async function () {
  await check('ERA gross, frozen CT fee, producer net and separate authoritative balances', async () => {
    const f = fixture(); await f.flush();
    textIs(f, 'confirmedSalesLabel', 'Bruto confirmado'); textIs(f, 'confirmedSales', money(1100));
    textIs(f, 'eraCtFee', money(100)); textIs(f, 'eraProducerNet', money(1000));
    assert.match(f.el('eraCtFeeMetric').textContent, /Taxa CT apurada/);
    assert.match(f.el('eraProducerNetMetric').textContent, /Líquido do produtor apurado/);
    for (const id of ['eraCtFeeMetric', 'eraProducerNetMetric', 'eraCompositionNote']) hiddenIs(f, id, false);
    for (const id of ['eraOtherDeductions', 'eraCompositionWarning']) hiddenIs(f, id, true);
    textIs(f, 'ledgerBalance', money(137)); textIs(f, 'originOnline', money(1100));
    textIs(f, 'anticipationAvailable', money(800)); textIs(f, 'withdrawAvailable', 'Indisponível');
    textIs(f, 'policyMax', '80%'); textIs(f, 'policyReserve', '20%'); textIs(f, 'policyFee', '3,50%');
    assert.match(f.el('eraCompositionNote').textContent, /não representa saldo liquidado nem disponível para saque/);
    assert.match(f.el('eraCompositionNote').textContent, /líquido elegível validado pelo servidor/);
    gatesOff(f); assert.equal(f.el('advanceButton').disabled, true); assert.equal(f.el('withdrawButton').disabled, true);
    assert.deepEqual(f.calls.map(c => c.method), ['ctPortalProdutorRestaurarSessaoIsoladaPROD', 'ctContaCariocaPayPortalResumoPROD']);
    assert.equal(f.timers.size, 0, 'Actual RPC timers are cleaned up');
  });

  await check('Incomplete historical composition stays gross and warns about exclusion', async () => {
    const r = summary(); r.vendas.confirmado = 1337; r.vendas.composicaoEra.brutoConfirmado = 1337;
    r.vendas.composicaoEra.pagamentosSemComposicao = 2;
    // Eligibility and available amount must be displayed as supplied by the server.
    r.vendas.vendasElegiveisAntecipacao = 600; r.antecipacao.disponivelSolicitar = 480;
    const f = fixture({ summary: () => r }); await f.flush();
    textIs(f, 'confirmedSales', money(1337)); textIs(f, 'eraProducerNet', money(1000));
    textIs(f, 'eraCtFee', money(100)); textIs(f, 'anticipationAvailable', money(480));
    hiddenIs(f, 'eraCompositionWarning', false);
    assert.match(f.el('eraCompositionWarning').textContent, /2 pagamento\(s\)/);
    assert.match(f.el('eraCompositionWarning').textContent, /incluídos no bruto, mas excluídos do líquido apurado e da base de antecipação/);
  });

  await check('Decimal composition is presented from the server without applying a fee again', async () => {
    const r = summary(); r.vendas.confirmado = 95.7;
    Object.assign(r.vendas.composicaoEra, { brutoConfirmado: 95.7, taxaCtConfirmada: 8.7, liquidoProdutorConfirmado: 87 });
    r.vendas.vendasElegiveisAntecipacao = 87; r.antecipacao.disponivelSolicitar = 0;
    const f = fixture({ summary: () => r }); await f.flush();
    textIs(f, 'confirmedSales', money(95.7)); textIs(f, 'eraCtFee', money(8.7)); textIs(f, 'eraProducerNet', money(87));
    textIs(f, 'anticipationAvailable', money(0)); assert.equal(f.el('advanceButton').disabled, true);
  });

  await check('Optional deductions and zero composition render without guessed amounts', async () => {
    const r = summary(); r.vendas.composicaoEra.outrasDeducoesConfirmadas = 30; r.vendas.composicaoEra.liquidoProdutorConfirmado = 970;
    const f = fixture({ summary: () => r }); await f.flush();
    hiddenIs(f, 'eraOtherDeductions', false); assert.match(f.el('eraOtherDeductions').textContent, /Outras deduções apuradas: R\$\s30,00/);
    textIs(f, 'eraProducerNet', money(970));
    for (const key of Object.keys(r.vendas.composicaoEra)) r.vendas.composicaoEra[key] = 0;
    r.vendas.confirmado = 0; r.antecipacao.disponivelSolicitar = 0;
    await f.refresh();
    for (const id of ['confirmedSales', 'eraCtFee', 'eraProducerNet']) textIs(f, id, money(0));
    hiddenIs(f, 'eraOtherDeductions', true); hiddenIs(f, 'eraCompositionWarning', true);
    assert.equal(f.el('advanceButton').disabled, true);
  });

  await check('Missing or malformed composition never fabricates CT fee or net', async () => {
    const mutations = [r => delete r.vendas.composicaoEra, r => r.vendas.composicaoEra = null];
    for (const key of Object.keys(summary().vendas.composicaoEra)) {
      for (const value of [undefined, null, '10', -1, NaN, Infinity]) mutations.push(r => { r.vendas.composicaoEra[key] = value; });
    }
    mutations.push(r => { r.vendas.composicaoEra.pagamentosSemComposicao = 0.5; });
    for (const mutate of mutations) {
      const r = summary(); mutate(r);
      const f = fixture({ summary: () => r }); await f.flush();
      textIs(f, 'confirmedSales', money(1100)); textIs(f, 'eraCtFee', 'Não apurada'); textIs(f, 'eraProducerNet', 'Não apurado');
      hiddenIs(f, 'eraCompositionWarning', false); assert.match(f.el('eraCompositionWarning').textContent, /Composição financeira indisponível/);
      textIs(f, 'anticipationAvailable', money(800)); gatesOff(f);
    }
  });

  await check('Exact response and selected producer/event are all required for ERA display', async () => {
    for (const [selectedProducer, selectedEvent, responseProducer, responseEvent] of [
      [OTHER_PRODUCER, OTHER_EVENT, OTHER_PRODUCER, OTHER_EVENT],
      [BIOCRED, OTHER_EVENT, BIOCRED, OTHER_EVENT],
      [OTHER_PRODUCER, ERA, OTHER_PRODUCER, ERA],
      [BIOCRED, ERA, OTHER_PRODUCER, ERA],
      [BIOCRED, ERA, BIOCRED, OTHER_EVENT],
      [OTHER_PRODUCER, OTHER_EVENT, BIOCRED, ERA]
    ]) {
      const r = summary(responseProducer, responseEvent);
      // Deliberately present an ERA-shaped object outside its permitted scope.
      r.vendas.composicaoEra.brutoConfirmado = 9999;
      const f = fixture({ producers: [producer(selectedProducer, [selectedEvent])], summary: () => r }); await f.flush();
      textIs(f, 'confirmedSalesLabel', 'Vendas confirmadas'); textIs(f, 'confirmedSales', money(1100));
      textIs(f, 'originOnline', money(1100)); textIs(f, 'ledgerBalance', money(137)); textIs(f, 'plannedPayments', money(26));
      for (const id of ['eraCtFeeMetric', 'eraProducerNetMetric', 'eraCompositionNote']) hiddenIs(f, id, true);
      gatesOff(f); assert.equal(f.el('advanceButton').disabled, true); assert.equal(f.el('withdrawButton').disabled, true);
    }
  });

  await check('Event/producer changes and repeat refresh clear prior ERA data', async () => {
    let incomplete = true;
    const f = fixture({ producers: [producer(BIOCRED, [ERA, OTHER_EVENT]), producer(OTHER_PRODUCER, ['EVT-SECOND-PRODUCER'])], summary: event => {
      const r = summary(event === 'EVT-SECOND-PRODUCER' ? OTHER_PRODUCER : BIOCRED, event);
      if (incomplete) { r.vendas.composicaoEra.pagamentosSemComposicao = 1; r.vendas.composicaoEra.outrasDeducoesConfirmadas = 30; }
      return r;
    } });
    await f.flush(); hiddenIs(f, 'eraCompositionWarning', false);
    await f.select('eventSelect', OTHER_EVENT);
    textIs(f, 'confirmedSalesLabel', 'Vendas confirmadas'); hiddenIs(f, 'eraCompositionNote', true);
    textIs(f, 'eraCompositionWarning', ''); textIs(f, 'eraOtherDeductions', ''); textIs(f, 'eraProducerNet', money(0));
    await f.select('eventSelect', ERA); hiddenIs(f, 'eraCompositionNote', false);
    incomplete = false; await f.refresh(); hiddenIs(f, 'eraCompositionWarning', true); hiddenIs(f, 'eraOtherDeductions', true);
    await f.select('producerSelect', OTHER_PRODUCER); hiddenIs(f, 'eraCompositionNote', true); textIs(f, 'confirmedSalesLabel', 'Vendas confirmadas');
    await f.select('producerSelect', BIOCRED); hiddenIs(f, 'eraCompositionNote', false);
  });

  await check('Disabled financial setup, open requests and unavailable balances preserve gates', async () => {
    const f = fixture(); await f.flush();
    f.el('advanceValue').value = 800; f.el('withdrawValue').value = 500;
    await f.click('advanceButton'); await f.click('withdrawButton');
    // Programmatic dispatch bypasses disabled HTML buttons; function guards must also hold.
    f.el('advanceButton').dispatchEvent({ type: 'click' }); f.el('withdrawButton').dispatchEvent({ type: 'click' }); await f.flush();
    assert.equal(f.requests(advanceMethod).length, 0); assert.equal(f.requests(withdrawMethod).length, 0);
    for (const change of [
      r => { r.antecipacao.jaSolicitadoAberto = 800; r.saque.jaSolicitadoAberto = 500; },
      r => { r.antecipacao.disponivelSolicitar = 0; r.saque.saldoDisponivel = 499; },
      r => { r.antecipacao.disponivelSolicitar = 0; r.saque.saldoAutoritativoDisponivel = false; }
    ]) {
      const r = summary(); r.financeiro.prontoParaOperar = true;
      r.saque.saldoAutoritativoDisponivel = true; r.saque.saldoDisponivel = 700; change(r);
      const g = fixture({ summary: () => r }); await g.flush();
      assert.equal(g.el('advanceButton').disabled, true); assert.equal(g.el('withdrawButton').disabled, true); gatesOff(g);
      g.el('advanceValue').value = 800; g.el('withdrawValue').value = 500;
      g.el('advanceButton').dispatchEvent({ type: 'click' }); g.el('withdrawButton').dispatchEvent({ type: 'click' }); await g.flush();
      assert.equal(g.requests(advanceMethod).length, 0); assert.equal(g.requests(withdrawMethod).length, 0);
    }
  });

  await check('Mock advance request preserves token/event/value/key payload and duplicate guard', async () => {
    const r = summary(); r.financeiro.prontoParaOperar = true;
    const f = fixture({ summary: () => r, advance: () => PENDING }); await f.flush();
    assert.equal(f.el('advanceButton').disabled, false); gatesOff(f);
    f.el('advanceValue').value = 801; await f.click('advanceButton'); assert.equal(f.requests(advanceMethod).length, 0);
    f.el('advanceValue').value = 800; await f.click('advanceButton');
    const call = f.requests(advanceMethod)[0]; assert(call); assert.equal(call.args.length, 4);
    assert.deepEqual(call.args.slice(0, 3), [TOKEN, ERA, 800]); assert.match(call.args[3], /^WEB-ANT-/);
    f.el('advanceButton').dispatchEvent({ type: 'click' }); await f.flush(); assert.equal(f.requests(advanceMethod).length, 1);
    call.respond({ sucesso: true }, true, 'https://untrusted.local.test'); await f.flush(); assert.equal(f.el('advanceButton').disabled, true);
    r.antecipacao.jaSolicitadoAberto = 800; r.antecipacao.disponivelSolicitar = 0;
    call.respond({ sucesso: true }); await f.flush();
    assert.equal(f.el('advanceValue').value, ''); assert.equal(f.el('advanceButton').disabled, true);
    assert.match(f.el('message').textContent, /Nenhuma transferência foi executada/); gatesOff(f);
  });

  await check('Mock withdrawal retains authoritative balance, minimum and request shape', async () => {
    const r = summary(); r.financeiro.prontoParaOperar = true;
    r.saque.saldoAutoritativoDisponivel = true; r.saque.saldoDisponivel = 700;
    const f = fixture({ summary: () => r, withdraw: () => PENDING }); await f.flush();
    textIs(f, 'withdrawAvailable', money(700)); assert.equal(f.el('withdrawButton').disabled, false);
    for (const value of [499, 701]) { f.el('withdrawValue').value = value; await f.click('withdrawButton'); }
    assert.equal(f.requests(withdrawMethod).length, 0);
    f.el('withdrawValue').value = 500; await f.click('withdrawButton');
    const call = f.requests(withdrawMethod)[0]; assert.equal(call.args.length, 4);
    assert.deepEqual(call.args.slice(0, 3), [TOKEN, ERA, 500]); assert.match(call.args[3], /^WEB-SAQ-/);
    f.el('withdrawButton').dispatchEvent({ type: 'click' }); await f.flush(); assert.equal(f.requests(withdrawMethod).length, 1);
    call.respond('LOCAL MOCK FAILURE', false); await f.flush();
    assert.equal(f.el('withdrawButton').disabled, false); assert.match(f.el('message').textContent, /LOCAL MOCK FAILURE/); gatesOff(f);
  });

  await check('Rules, dismissal and unauthenticated redirect remain unchanged', async () => {
    const f = fixture(); await f.flush();
    await f.click('rulesButton'); hiddenIs(f, 'rulesBackdrop', false); assert.equal(f.el('rulesBackdrop').getAttribute('aria-hidden'), 'false');
    assert.match(f.el('rulesBackdrop').textContent, /mínimo de R\$ 500,00 em vendas elegíveis/);
    assert.match(f.el('rulesBackdrop').textContent, /taxa de 3,5% sobre o valor antecipado/);
    await f.click('rulesClose'); hiddenIs(f, 'rulesBackdrop', true);
    await f.click('rulesTopButton'); hiddenIs(f, 'rulesBackdrop', false);
    await f.click('rulesBackdrop'); hiddenIs(f, 'rulesBackdrop', true);
    const g = fixture({ noSession: true }); await g.flush(); assert.deepEqual(g.redirects, ['/produtor/']); assert.equal(g.calls.length, 0);
  });

  await check('Independent original-source comparison: legacy DOM and financial functions unchanged', async () => {
    const baselinePath = process.env.CT_FINANCE_BASELINE || path.resolve(__dirname, '../../finance-evidence/index.main-5be8a646.html');
    const baseline = fs.existsSync(baselinePath)
      ? fs.readFileSync(baselinePath, 'utf8')
      : execFileSync('git', ['show', '5be8a64686f942acbb9c2761dc2786fde161db16:produtor/financeiro/index.html'], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
    const functionSlice = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
    for (const [start, end] of [
      ['async function requestAdvance(){', 'async function requestWithdraw(){'],
      ['async function requestWithdraw(){', 'function openRules(){'],
      ['function rpc(method,args){', 'function money(v)'],
      ['function openRules(){', 'async function init(){']
    ]) assert.equal(functionSlice(HTML, start, end), functionSlice(baseline, start, end), start);
    for (const active of [false, true]) {
      const r = summary(OTHER_PRODUCER, OTHER_EVENT); r.financeiro.prontoParaOperar = active;
      r.saque.saldoAutoritativoDisponivel = active; r.saque.saldoDisponivel = active ? 700 : 0;
      const options = { producers: [producer(OTHER_PRODUCER, [OTHER_EVENT])], summary: () => r };
      const current = fixture(options), original = fixture({ ...options, html: baseline });
      await current.flush(); await original.flush();
      for (const old of original.document.querySelectorAll('[id]')) {
        // Container text includes extra hidden ERA content; compare the actual
        // original leaf fields/controls, not a textContent visibility heuristic.
        if (old.children.length || ['dashboard', 'rulesBackdrop'].includes(old.id)) continue;
        const now = current.el(old.id);
        assert.equal(now.textContent, old.textContent, old.id + ': original text');
        assert.equal(now.disabled, old.disabled, old.id + ': original disabled state');
        assert.equal(now.className, old.className, old.id + ': original class');
        assert.equal(now.value, old.value, old.id + ': original value');
      }
    }
  });
  console.log('PASS era-finance-summary.runtime: ' + checks + ' scenario groups; all RPCs local mocks');
}()).catch(error => { console.error(error); process.exitCode = 1; });
