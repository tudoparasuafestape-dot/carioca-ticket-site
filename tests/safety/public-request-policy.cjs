'use strict';

// Review prototype only: no existing runner or workflow imports this module.
// A method name is not proof of purity. These candidates were inspected at
// backend 02eefbed5b168c390291b91744e1bfbbde8c4f98; deployment attestation and
// backend no-write contracts are prerequisites for production integration.
const READ_CANDIDATES = Object.freeze({
  ctEventosPublicosListarPROD: 'publicRpc',
  ctCentralAcessoObterCapacidadesPROD: 'portalRpc',
  ctCentralAcessoObterFirebaseConfigPROD: 'portalRpc',
  ctCentralAcessoBootstrapPROD: 'portalRpc'
});
const TELEMETRY = new Set([
  'ctAnalyticsMasterRegistrarLotePublicoPROD',
  'ctCuponsPublicoRegistrarAcessoSeguroPROD'
]);

function createRequestPolicy({ siteOrigin, staticPaths = [], rpcEndpoint, approvedReads = [], telemetry = 'deny' }) {
  const site = new URL(siteOrigin);
  const endpoint = new URL(rpcEndpoint);
  if (site.origin !== siteOrigin || endpoint.search || endpoint.hash || endpoint.username || endpoint.password) {
    throw new Error('Explicit origin and query-free RPC endpoint required');
  }
  if (![site, endpoint].every(u => u.protocol === 'https:' ||
      (u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)))) {
    throw new Error('HTTPS or explicit loopback required');
  }
  if (!['deny', 'capture'].includes(telemetry)) throw new Error('Invalid telemetry policy');
  for (const method of approvedReads) {
    if (!Object.hasOwn(READ_CANDIDATES, method)) throw new Error('Unreviewed RPC: ' + method);
  }
  const reads = new Set(approvedReads);
  const paths = new Set(staticPaths);
  if ([...paths].some(p => !p.startsWith('/') || p.includes('?') || p.includes('#'))) {
    throw new Error('Static paths must be exact pathnames');
  }
  return function classify({ url, method = 'GET', contentType = '', body = '' }) {
    const deny = reason => ({ decision: 'deny', category: 'unapproved', reason });
    let target;
    try { target = new URL(url); } catch { return deny('invalid-url'); }
    if (target.username || target.password) return deny('url-credentials');
    method = String(method).toUpperCase();
    if (target.origin === endpoint.origin && target.pathname === endpoint.pathname) {
      if (target.search || target.hash || method !== 'POST') return deny('rpc-transport');
      if (contentType.split(';')[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded') {
        return deny('rpc-content-type');
      }
      if (typeof body !== 'string' || body.length > 32768) return deny('rpc-body');
      const params = new URLSearchParams(body);
      const keys = ['ctMinhaCariocaAction', 'ctMinhaCariocaRequestId', 'metodo', 'argsJson'];
      if ([...params.keys()].some(k => !keys.includes(k)) ||
          keys.some(k => params.getAll(k).length !== 1)) return deny('rpc-envelope');
      const rpcMethod = params.get('metodo');
      const action = params.get('ctMinhaCariocaAction');
      let args;
      try { args = JSON.parse(params.get('argsJson')); } catch { return deny('rpc-json'); }
      if (!Array.isArray(args)) return deny('rpc-arguments');
      if (TELEMETRY.has(rpcMethod) && action === 'publicRpc') {
        return { decision: telemetry === 'capture' ? 'capture' : 'deny', category: 'telemetry',
          reason: 'never-forward-telemetry', rpcMethod };
      }
      if (!reads.has(rpcMethod) || READ_CANDIDATES[rpcMethod] !== action || args.length !== 0) {
        return deny('rpc-not-approved');
      }
      return { decision: 'allow', category: 'reviewed-read', rpcMethod };
    }
    if (target.origin === site.origin && paths.has(target.pathname) && ['GET', 'HEAD'].includes(method)) {
      return { decision: 'allow', category: 'static' };
    }
    return deny('network-not-approved');
  };
}

// Fail before calling transport. Capture is an explicit local test sink and
// never synthesizes a successful business RPC response. Do not use this alone
// as a browser guard: redirects, service workers, popups and all transports must
// also be contained by the runner, then integration-tested on loopback first.
function gateRequest(policy, request, { forward, capture }) {
  const verdict = policy(request);
  if (verdict.decision === 'allow') return forward(request);
  if (verdict.decision === 'capture') {
    if (typeof capture !== 'function') throw new Error('Explicit local telemetry sink required');
    return capture({ rpcMethod: verdict.rpcMethod, category: verdict.category });
  }
  const error = new Error('CT_TEST_NETWORK_DENIED: ' + verdict.reason);
  error.code = 'CT_TEST_NETWORK_DENIED';
  throw error;
}

module.exports = { createRequestPolicy, gateRequest, READ_CANDIDATES };
