'use strict';
// Offline rendering and action regression tests. Executes the production inline
// script with a tiny DOM and mocked RPC; no HTTP, account, or production calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../produtor/ingressos/index.html'), 'utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('function renderLots()'));
assert.ok(script, 'producer inline script exists');
new vm.Script(script); // Parse the complete, unmodified production script.

function harness() {
  const elements = new Map();
  function element(id) {
    if (elements.has(id)) return elements.get(id);
    const classes = new Set();
    const el = {
      id, value: '', textContent: '', innerHTML: '', disabled: false, required: false,
      dataset: {}, attributes: {}, listeners: {}, options: [], open: false,
      classList: {
        add(v) { classes.add(v); }, remove(v) { classes.delete(v); },
        contains(v) { return classes.has(v); },
        toggle(v, force) { const on = force === undefined ? !classes.has(v) : force; on ? classes.add(v) : classes.delete(v); }
      },
      setAttribute(k, v) { this.attributes[k] = String(v); },
      removeAttribute(k) { delete this.attributes[k]; delete this[k]; },
      addEventListener(k, fn) { this.listeners[k] = fn; },
      showModal() { this.open = true; }, close() { this.open = false; },
      querySelector() { return element(id + 'Submit'); },
      querySelectorAll() { return [...elements.values()].filter(e => e.id.startsWith(id === 'lotForm' ? 'lot' : 'type')); }
    };
    elements.set(id, el);
    return el;
  }
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) element(match[1]);
  element('lotStatus').options = ['ATIVO', 'INATIVO', 'ENCERRADO'].map(value => ({value, disabled: false}));
  const document = {
    getElementById: element,
    addEventListener() {},
    createElement() { throw new Error('Unexpected real RPC/DOM transport'); }
  };
  const context = vm.createContext({
    document, location: { search: '?evento=EV-1', replace() { throw new Error('Unexpected redirect'); } },
    URLSearchParams, console, setTimeout() { return 1; }, clearTimeout() {},
    window: { addEventListener() {} },
    sessionStorage: { getItem() { return null; } }, localStorage: { getItem() { return null; } }
  });
  // Expose existing functions at the bootstrap boundary without modifying them.
  const hook = `globalThis.testAPI={render,load,openLot,saveLot,toggleLot,lotEffectiveState,lotToggleAction,lotCanReactivate,lotStatusChangeError,ctLoteErroPeriodo_,humanError,
    setData(value){data=value;configReady=true;},setRPC(fn){rpc=fn;}};return;\nvar s=readSession();`;
  assert.equal(script.split('var s=readSession();').length, 2);
  vm.runInContext(script.replace('var s=readSession();', hook), context);
  return { api: context.testAPI, el: element, card: () => element('lotCards').innerHTML };
}
const temporal = {
  contratoTemporal: 'TEMPORAL_V1', fusoHorarioVista: 'America/Sao_Paulo', revisaoTemporalVista: 'revision-1',
  dataInicioFormulario: '2026-10-20T15:00:00', dataFimFormulario: '2026-10-22T18:00:00'
};
function legacyLot(extra = {}) {
  return { id: 'L-1', tipoId: 'T-1', tipoNome: 'Individual', nome: 'Primeiro lote', status: 'ATIVO',
    quantidade: 120, disponiveis: 99, precoNumero: 40, ordem: 1, ...temporal, ...extra };
}
function projectedLot(extra = {}) {
  return legacyLot({ estadoEfetivo: 'ATIVO', disponibilidadeConfirmada: true, encerramentoDuravel: false,
    encerramentoMotivo: null, disponiveisEfetivos: 7, podeReativar: false,
    motivoIndisponibilidadeEfetiva: null, antecipadoEfetivo: false, ...extra });
}
function config(lotes, resumo = {}) {
  return { sucesso: true, evento: { id: 'EV-1', nome: 'Evento teste', ...temporal },
    tipos: [{ id: 'T-1', nome: 'Individual', status: 'ATIVO', quantidade: 120, precoNumero: 40 }], lotes,
    resumo: { tipos: 1, tiposAtivos: 1, lotes: lotes.length, lotesAtivos: 77, ...resumo } };
}
function projectedConfig(lotes, resumo = {}) {
  return config(lotes, { disponibilidadeConfirmada: true, lotesAtivosEfetivos: lotes.filter(l => l.estadoEfetivo === 'ATIVO').length, ...resumo });
}
function render(data) { const h = harness(); h.api.setData(data); h.api.render(); return h; }
const cases = [];
function test(name, run) { cases.push({name, run}); }
function actionButton(h) { return h.card().match(/<button[^>]+data-toggle-lot="L-1"[^>]*>[\s\S]*?<\/button>/)[0]; }
function assertNoCurrent(h) { assert.doesNotMatch(h.card(), /class="badge active"/); assert.doesNotMatch(h.card(), />ATUAL</); }
function rpcRecorder(h, response) {
  const calls = [];
  h.api.setRPC(async (method, args) => {
    calls.push({method, args});
    return method === 'ctIngressosConfigCarregarPROD' ? response : {sucesso: true};
  });
  return calls;
}

test('legacy rendering preserves stored status, stock, summary and toggle labels', () => {
  const h = render(config([legacyLot()]));
  assert.match(h.card(), /class="badge active">ATIVO</);
  assert.match(h.card(), /<span>Disponíveis<\/span><strong>99<\/strong>/);
  assert.doesNotMatch(h.card(), /Status cadastrado|Situação efetiva|Saldo do lote/);
  assert.match(actionButton(h), />Desativar</);
  assert.equal(h.el('sumLotesAtivos').textContent, 77);
  assert.equal(h.el('sumLotesAtivosLabel').textContent, 'Lotes ativos');
});
test('confirmed current lot renders effective stock and count, separately from stored ATIVO', () => {
  const h = render(projectedConfig([projectedLot()]));
  assert.match(h.card(), /Status cadastrado: ATIVO/);
  assert.match(h.card(), /Situação efetiva: ATUAL">ATUAL</);
  assert.match(h.card(), /<span>Saldo do lote<\/span><strong>7<\/strong>/);
  assert.doesNotMatch(h.card(), /<strong>99<\/strong>/);
  assert.equal(h.el('sumLotesAtivos').textContent, 1);
  assert.equal(h.el('sumLotesAtivosLabel').textContent, 'Lotes atuais');
});
test('upcoming stored-active lot is not presented as current', () => {
  const h = render(projectedConfig([projectedLot({estadoEfetivo: 'PROXIMO'})]));
  assertNoCurrent(h); assert.match(h.card(), />PRÓXIMO</); assert.match(h.card(), /venda ainda não foi liberada/);
  assert.equal(h.el('sumLotesAtivos').textContent, 0);
});
for (const [name, fields] of [
  ['null state despite confirmation', {estadoEfetivo: null}],
  ['unconfirmed active state', {disponibilidadeConfirmada: false}],
  ['truthy nonboolean confirmation', {disponibilidadeConfirmada: 'true'}],
  ['invalid effective state', {estadoEfetivo: 'ATUAL'}]
]) test('unknown availability: ' + name, () => {
  const h = render(projectedConfig([projectedLot(fields)]));
  assertNoCurrent(h); assert.match(h.card(), />NÃO CONFIRMADO</);
  assert.match(h.card(), /<span>Saldo do lote<\/span><strong>Não confirmado<\/strong>/);
  assert.match(h.card(), /Status cadastrado: ATIVO/);
  assert.match(actionButton(h), / disabled/);
  assert.equal(h.el('sumLotesAtivos').textContent, 'Não confirmado');
});
test('projection envelope with missing lot keys fails closed rather than using legacy ATIVO', () => {
  const h = render(projectedConfig([legacyLot()]));
  assertNoCurrent(h); assert.match(h.card(), />NÃO CONFIRMADO</);
});
test('partial per-lot projection with legacy summary also remains unknown', () => {
  const h = render(config([legacyLot({estadoEfetivo: null})]));
  assertNoCurrent(h); assert.equal(h.el('sumLotesAtivos').textContent, 'Não confirmado');
});
for (const summary of [
  {disponibilidadeConfirmada: false, lotesAtivosEfetivos: null},
  {disponibilidadeConfirmada: true, lotesAtivosEfetivos: null},
  {disponibilidadeConfirmada: true, lotesAtivosEfetivos: '1'},
  {disponibilidadeConfirmada: true, lotesAtivosEfetivos: 0},
  {disponibilidadeConfirmada: true, lotesAtivosEfetivos: -1}
]) test('summary never substitutes stored count for malformed/unconfirmed effective summary ' + JSON.stringify(summary), () => {
  const h = render(projectedConfig([projectedLot()], summary));
  assert.equal(h.el('sumLotesAtivos').textContent, 'Não confirmado');
  assert.equal(h.el('sumLotesAtivos').classList.contains('unknown'), true);
});
test('null effective stock never leaks old stock or coerces to zero', () => {
  const h = render(projectedConfig([projectedLot({disponiveisEfetivos: null})]));
  assert.match(h.card(), /<span>Saldo do lote<\/span><strong>Não informado<\/strong>/);
  assert.doesNotMatch(h.card(), /<strong>99<\/strong>/);
});
for (const [motivo, text] of [['ESGOTADO', 'Encerrado por esgotamento.'], ['PRODUTOR', 'Encerrado pelo produtor.'], ['PERIODO', 'Período de venda encerrado.']]) {
  test('durable closure renders zero and Portuguese reason: ' + motivo, async () => {
    const data = projectedConfig([projectedLot({estadoEfetivo: 'ENCERRADO', encerramentoDuravel: true, encerramentoMotivo: motivo, podeReativar: true})]);
    const h = render(data), calls = rpcRecorder(h, data);
    assertNoCurrent(h); assert.match(h.card(), /Situação efetiva: ENCERRADO/);
    assert.ok(h.card().includes(text)); assert.match(h.card(), /<span>Saldo do lote<\/span><strong>0<\/strong>/);
    assert.match(actionButton(h), /disabled>Encerramento definitivo/);
    await h.api.toggleLot('L-1'); assert.equal(calls.length, 0);
    h.api.openLot('L-1'); assert.equal(h.el('lotStatus').value, 'ENCERRADO'); assert.equal(h.el('lotStatus').disabled, true);
  });
}
test('durable closure remains locked even when effective availability is unknown', async () => {
  const data = projectedConfig([projectedLot({estadoEfetivo: null, disponibilidadeConfirmada: false, encerramentoDuravel: true, podeReativar: true})]);
  const h = render(data), calls = rpcRecorder(h, data);
  assertNoCurrent(h); assert.match(h.card(), />NÃO CONFIRMADO</); assert.match(actionButton(h), /disabled>Encerramento definitivo/);
  await h.api.toggleLot('L-1'); assert.equal(calls.length, 0);
});
for (const [reason, state, text] of [
  ['EVENTO_ENCERRADO','ENCERRADO','O evento já terminou. Vendas encerradas.'],
  ['EVENTO_INATIVO','PAUSADO','O evento está inativo. Vendas pausadas.'],
  ['CAPACIDADE_EVENTO','ATIVO','capacidade disponível do evento'],
  ['CAPACIDADE_TIPO','ATIVO','limite disponível deste tipo'],
  ['RESERVAS_PENDENTES','ATIVO','reservas pendentes'],
  ['VERIFICACAO','ATIVO','disponibilidade é verificada']
]) test('Portuguese effective unavailability reason: ' + reason, () => {
  const h = render(projectedConfig([projectedLot({estadoEfetivo: state, motivoIndisponibilidadeEfetiva: reason})]));
  assert.ok(h.card().includes(text)); assert.ok(!h.card().includes(reason));
  if (state !== 'ATIVO') assertNoCurrent(h);
});
test('early opening is shown only for a confirmed current lot', () => {
  const h = render(projectedConfig([projectedLot({antecipadoEfetivo: true})]));
  assert.match(h.card(), /Lote liberado antecipadamente/);
  h.api.setData(projectedConfig([projectedLot({estadoEfetivo: null, antecipadoEfetivo: true})])); h.api.render();
  assert.doesNotMatch(h.card(), /liberado antecipadamente/);
});
test('verified paused lot can be reactivated by action and editor', async () => {
  const lot = projectedLot({status: 'INATIVO', estadoEfetivo: 'PAUSADO', podeReativar: true}), data = projectedConfig([lot]);
  const h = render(data), calls = rpcRecorder(h, data);
  assert.match(actionButton(h), />Reativar</); assert.doesNotMatch(actionButton(h), /disabled/);
  h.api.openLot('L-1'); assert.equal(h.el('lotStatus').options[0].disabled, false);
  await h.api.toggleLot('L-1');
  assert.equal(calls[0].method, 'ctIngressosConfigAlterarStatusLotePROD'); assert.equal(calls[0].args[3], 'ATIVO');
});
for (const [name, patch] of [
  ['false flag', {podeReativar: false}], ['missing flag', {podeReativar: undefined}],
  ['truthy flag', {podeReativar: 'true'}], ['unknown effective state', {estadoEfetivo: null}],
  ['unconfirmed availability', {disponibilidadeConfirmada: false}], ['closed state', {estadoEfetivo: 'ENCERRADO'}],
  ['durable closure', {encerramentoDuravel: true}], ['inactive event', {motivoIndisponibilidadeEfetiva: 'EVENTO_INATIVO'}]
]) test('no unverified reactivation via button or edited form: ' + name, async () => {
  const data = projectedConfig([projectedLot({status: 'INATIVO', estadoEfetivo: 'PAUSADO', podeReativar: true, ...patch})]);
  const h = render(data), calls = rpcRecorder(h, data);
  assert.match(actionButton(h), /disabled/); await h.api.toggleLot('L-1'); assert.equal(calls.length, 0);
  h.api.openLot('L-1'); assert.equal(h.el('lotStatus').options[0].disabled, true);
  h.el('lotStatus').value = 'ATIVO'; // A programmatic submit cannot bypass disabled controls.
  await h.api.saveLot({preventDefault() {}});
  assert.equal(calls.length, 0); assert.match(h.el('lotFeedback').textContent, /reativa/);
});
test('legacy activation remains available without new permission flag', async () => {
  const data = config([legacyLot({status: 'INATIVO'})]), h = render(data), calls = rpcRecorder(h, data);
  assert.match(actionButton(h), />Ativar</);
  await h.api.toggleLot('L-1'); assert.equal(calls[0].args[3], 'ATIVO');
});
test('current lot can be deactivated without claiming reactivation permission', async () => {
  const data = projectedConfig([projectedLot()]), h = render(data), calls = rpcRecorder(h, data);
  await h.api.toggleLot('L-1'); assert.equal(calls[0].args[3], 'INATIVO');
});
test('successful metadata load with unknown availability remains editable and visibly unknown', async () => {
  const data = projectedConfig([projectedLot({estadoEfetivo: null, disponibilidadeConfirmada: false})], {disponibilidadeConfirmada: false, lotesAtivosEfetivos: null});
  const h = harness(); rpcRecorder(h, data); assert.equal(await h.api.load(), true);
  assert.match(h.el('configStatus').textContent, /Configuração atualizada\. Disponibilidade dos lotes não confirmada/);
  assert.equal(h.el('newType').disabled, false); assert.equal(h.el('newLot').disabled, false);
  h.api.openLot('L-1'); assert.equal(h.el('lotDialog').open, true); assertNoCurrent(h);
});
test('refresh from unconfirmed to confirmed updates count and removes unknown styling', async () => {
  const h = render(projectedConfig([projectedLot({estadoEfetivo: null})]));
  rpcRecorder(h, projectedConfig([projectedLot()])); assert.equal(await h.api.load(), true);
  assert.equal(h.el('sumLotesAtivos').textContent, 1); assert.equal(h.el('sumLotesAtivos').classList.contains('unknown'), false);
  assert.equal(h.el('configStatus').textContent, 'Configuração atualizada.');
});
test('durable editor lock survives failed save and resets for new and legacy lots', async () => {
  const h = render(projectedConfig([projectedLot({estadoEfetivo: 'ENCERRADO', encerramentoDuravel: true})]));
  h.api.openLot('L-1'); h.api.setRPC(async () => {throw new Error('CT_LOTE_VIRADA_HISTORICO_IMUTAVEL');});
  await h.api.saveLot({preventDefault() {}});
  assert.equal(h.el('lotStatus').disabled, true); assert.equal(h.el('lotStatus').value, 'ENCERRADO');
  assert.match(h.el('lotFeedback').textContent, /tipo e a ordem/);
  h.api.openLot(''); assert.equal(h.el('lotStatus').disabled, false); assert.equal(h.el('lotStatus').value, 'ATIVO');
  assert.equal(h.el('lotStateHelp').textContent, ''); assert.ok(h.el('lotStatus').options.every(o => !o.disabled));
  h.api.setData(config([legacyLot({status: 'INATIVO'})])); h.api.openLot('L-1');
  assert.equal(h.el('lotStatus').disabled, false); assert.ok(h.el('lotStatus').options.every(o => !o.disabled));
});
test('explicit date authoring and revision are preserved through an allowed save', async () => {
  const data = projectedConfig([projectedLot()]), h = render(data), calls = rpcRecorder(h, data);
  h.api.openLot('L-1');
  assert.equal(h.el('lotStart').required, true); assert.equal(h.el('lotStart').min, '2000-01-01T00:00:00');
  assert.equal(h.el('lotStart').value, temporal.dataInicioFormulario);
  assert.match(h.el('lotTimeZone').textContent, /America\/Sao_Paulo/);
  await h.api.saveLot({preventDefault() {}});
  const payload = calls.find(c => c.method === 'ctIngressosConfigSalvarLotePROD').args[2];
  assert.equal(payload.dataInicio, temporal.dataInicioFormulario); assert.equal(payload.dataFim, temporal.dataFimFormulario);
  assert.equal(payload.fusoHorarioVista, temporal.fusoHorarioVista); assert.equal(payload.revisaoTemporalVista, temporal.revisaoTemporalVista);
  assert.equal(payload.status, 'ATIVO');
});
test('temporal validation still blocks reversed or missing required dates', async () => {
  const data = projectedConfig([projectedLot()]), h = render(data), calls = rpcRecorder(h, data);
  h.api.openLot('L-1'); h.el('lotEnd').value = '2026-10-19T18:00:00';
  await h.api.saveLot({preventDefault() {}}); assert.equal(calls.length, 0); assert.match(h.el('lotFeedback').textContent, /posterior/);
  h.el('lotStart').value = ''; await h.api.saveLot({preventDefault() {}}); assert.equal(calls.length, 0); assert.match(h.el('lotFeedback').textContent, /início e fim/);
});
test('effective projection text escapes metadata and hides unknown internal reason codes', () => {
  const h = render(projectedConfig([projectedLot({nome: '<script>bad()</script>', status: '<img src=x>', motivoIndisponibilidadeEfetiva: '<private>'})]));
  assert.doesNotMatch(h.card(), /<script>|<img|<private>/); assert.match(h.card(), /&lt;script&gt;/); assert.match(h.card(), /Vendas indisponíveis no momento/);
});
test('unknown inherited-property reason names are treated as unknown codes', () => {
  const h = render(projectedConfig([projectedLot({motivoIndisponibilidadeEfetiva: 'constructor'})]));
  assert.match(h.card(), /Vendas indisponíveis no momento/); assert.doesNotMatch(h.card(), /function Object/);
});
test('durable full edit cannot downgrade to paused status', async () => {
  const data = projectedConfig([projectedLot({estadoEfetivo: 'ENCERRADO', encerramentoDuravel: true})]);
  const h = render(data), calls = rpcRecorder(h, data); h.api.openLot('L-1'); h.el('lotStatus').value = 'INATIVO';
  await h.api.saveLot({preventDefault() {}}); assert.equal(calls.length, 0); assert.match(h.el('lotFeedback').textContent, /encerramento definitivo/);
});
(async () => {
  let passed = 0;
  for (const {name, run} of cases) {
    try { await run(); passed++; console.log('PASS ' + name); }
    catch (err) { console.error('FAIL ' + name); throw err; }
  }
  console.log(`\nProducer effective lots: ${passed}/${cases.length} offline checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
