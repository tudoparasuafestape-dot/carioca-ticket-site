'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequestPolicy, gateRequest, READ_CANDIDATES } = require('./public-request-policy.cjs');
const options = { siteOrigin: 'http://127.0.0.1:4173', staticPaths: ['/', '/central/', '/assets/logo.png'],
  rpcEndpoint: 'http://127.0.0.1:4174/rpc' };
const rpc = (method, args = [], action = 'publicRpc') => ({
  url: options.rpcEndpoint, method: 'POST', contentType: 'application/x-www-form-urlencoded;charset=UTF-8',
  body: new URLSearchParams({ ctMinhaCariocaAction: action, ctMinhaCariocaRequestId: 'LOCAL-TEST',
    metodo: method, argsJson: JSON.stringify(args) }).toString()
});
test('default denies every RPC, including named read candidates', () => {
  const policy = createRequestPolicy(options);
  for (const [method, action] of Object.entries(READ_CANDIDATES)) {
    assert.equal(policy(rpc(method, [], action)).decision, 'deny');
  }
});
test('explicit approval permits only the reviewed empty-argument method/action pair', () => {
  const policy = createRequestPolicy({ ...options, approvedReads: Object.keys(READ_CANDIDATES) });
  for (const [method, action] of Object.entries(READ_CANDIDATES)) {
    assert.equal(policy(rpc(method, [], action)).decision, 'allow');
    assert.equal(policy(rpc(method, ['token-not-forwarded'], action)).decision, 'deny');
    assert.equal(policy(rpc(method, [], action === 'publicRpc' ? 'portalRpc' : 'publicRpc')).decision, 'deny');
  }
});
for (const method of ['ctCuponsPublicoValidarSeguroPROD', 'ctEventoPublicoCarregarPROD',
  'ctCheckoutPublicoCarregarEventoPROD', 'ctParceiroOnboardingConfigPublicaPROD',
  'ctParceiroOnboardingConsultarAtivacaoPROD', 'ctCheckoutPixPublicoIniciarPROD',
  'ctCuponsCheckoutPrepararComLockPROD_', 'ctMethodIntroducedTomorrow']) {
  test('refuses unreviewed or effectful method: ' + method, () => {
    assert.equal(createRequestPolicy(options)(rpc(method)).decision, 'deny');
    assert.throws(() => createRequestPolicy({ ...options, approvedReads: [method] }), /Unreviewed RPC/);
  });
}
test('only exact static origin/path and GET/HEAD are allowed', () => {
  const policy = createRequestPolicy(options);
  for (const method of ['GET', 'HEAD']) {
    assert.equal(policy({ url: options.siteOrigin + '/?deploy-check=123', method }).decision, 'allow');
  }
  for (const request of [
    { url: options.siteOrigin + '/', method: 'POST' },
    { url: options.siteOrigin + '/unreviewed/' },
    { url: 'https://script.google.com/macros/s/OTHER/exec?page=checkout' },
    { url: 'http://127.0.0.1.evil.test:4173/' },
    { url: 'http://127.0.0.1:4175/' },
    { url: 'http://user:password@127.0.0.1:4173/' },
    { url: 'not-a-url' }
  ]) assert.equal(policy(request).decision, 'deny');
});
test('malformed envelopes cannot bypass the RPC rule', () => {
  const policy = createRequestPolicy({ ...options, approvedReads: ['ctEventosPublicosListarPROD'] });
  const request = rpc('ctEventosPublicosListarPROD');
  for (const patch of [{ method: 'GET' }, { url: request.url + '?metodo=ctEventosPublicosListarPROD' },
    { contentType: 'application/json' }, { body: request.body + '&metodo=ctCheckoutPixPublicoIniciarPROD' },
    { body: request.body + '&token=secret' }, { body: request.body.replace('argsJson=%5B%5D', 'argsJson=bad') },
    { body: request.body.replace('argsJson=%5B%5D', 'argsJson=%7B%7D') }, { body: 'x'.repeat(32769) }]) {
    assert.equal(policy({ ...request, ...patch }).decision, 'deny');
  }
});
test('telemetry is denied by default; src CANARIO is not treated as authorization', () => {
  for (const method of ['ctAnalyticsMasterRegistrarLotePublicoPROD', 'ctCuponsPublicoRegistrarAcessoSeguroPROD']) {
    assert.equal(createRequestPolicy(options)(rpc(method, [{ origem: 'CANARIO' }])).decision, 'deny');
  }
});
test('explicit telemetry capture never calls transport and emits no payload or token', () => {
  const captures = []; let forwarded = 0;
  const policy = createRequestPolicy({ ...options, telemetry: 'capture' });
  gateRequest(policy, rpc('ctAnalyticsMasterRegistrarLotePublicoPROD', [[{ origem: 'CANARIO', sessaoId: 'DO-NOT-LOG' }]]), {
    forward() { forwarded++; }, capture(metadata) { captures.push(metadata); }
  });
  assert.equal(forwarded, 0);
  assert.deepEqual(captures, [{ rpcMethod: 'ctAnalyticsMasterRegistrarLotePublicoPROD', category: 'telemetry' }]);
  assert.throws(() => gateRequest(policy, rpc('ctAnalyticsMasterRegistrarLotePublicoPROD'), { forward() {} }), /sink/);
});
test('blocked business RPC fails the test before any forward call; static reads still work', () => {
  let forwarded = 0;
  const transport = { forward() { forwarded++; return 'fixture-response'; } };
  const policy = createRequestPolicy(options);
  assert.throws(() => gateRequest(policy, rpc('ctCheckoutPixPublicoIniciarPROD'), transport), { code: 'CT_TEST_NETWORK_DENIED' });
  assert.equal(forwarded, 0);
  assert.equal(gateRequest(policy, { url: options.siteOrigin + '/' }, transport), 'fixture-response');
  assert.equal(forwarded, 1);
});
test('configuration rejects ambiguous or nonlocal cleartext destinations', () => {
  for (const patch of [{ siteOrigin: options.siteOrigin + '/' }, { rpcEndpoint: options.rpcEndpoint + '?x=1' },
    { rpcEndpoint: 'http://production.example/rpc' }, { telemetry: 'ignore' }, { staticPaths: ['/?x=1'] }]) {
    assert.throws(() => createRequestPolicy({ ...options, ...patch }));
  }
});
