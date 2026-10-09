'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp' };
const RPC_ENDPOINT = 'https://script.google.com/macros/s/AKfycbz28keO65PIIElB8dWMBt8nnEBw9CzBxWnc6nOhAKKGNDkMZnYbWjrhTtr_v-lEI2IAJA/exec';
const CHECKOUT_V2_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyhx6mnGJMsgpGmx-C1r6ZUXbrE66-X6Rkusp1ulVOGcDfJfIs-jgysWp1PfkqB1UC3hg/exec';

async function installIsolatedNetwork(context, { root, origin, handlers = {}, resources = {} }) {
  const base = new URL(origin);
  assert(['127.0.0.1', 'localhost'].includes(base.hostname), 'Fixtures require explicit loopback origin');
  root = fs.realpathSync(root);
  const state = { mode: 'isolated-fixtures', forwarded: 0, static: 0, rpc: [], telemetry: [], unexpected: [] };
  const deny = (kind, request) => {
    // No query, payload, request id, session or full URL is logged.
    let host = ''; try { host = new URL(request.url()).hostname; } catch (_) {}
    state.unexpected.push({ kind, host, verb: request.method() });
  };
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    try {
      if (['GET', 'HEAD'].includes(request.method()) && url.origin === base.origin) {
        const pathname = decodeURIComponent(url.pathname);
        if (pathname.includes('\\') || pathname.includes('\0')) throw new Error('invalid-path');
        let file = path.resolve(root, '.' + pathname);
        if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error('unknown-static-resource');
        if (!fs.realpathSync(file).startsWith(root + path.sep)) throw new Error('static-path-escape');
        state.static++;
        return route.fulfill({ status: 200, contentType: MIME[path.extname(file)] || 'application/octet-stream',
          body: request.method() === 'HEAD' ? '' : fs.readFileSync(file) });
      }
      if (request.method() === 'GET' && Object.hasOwn(resources, request.url())) {
        return route.fulfill({ status: 200, ...resources[request.url()] });
      }
      if (![RPC_ENDPOINT, CHECKOUT_V2_ENDPOINT].includes(request.url()) || request.method() !== 'POST') throw new Error('unexpected-destination');
      if (!(request.headers()['content-type'] || '').startsWith('application/x-www-form-urlencoded')) throw new Error('invalid-rpc-encoding');
      const fields = new URLSearchParams(request.postData() || '');
      const required = ['ctMinhaCariocaAction', 'ctMinhaCariocaRequestId', 'metodo', 'argsJson'];
      if ([...fields.keys()].some(key => !required.includes(key)) || required.some(key => fields.getAll(key).length !== 1)) throw new Error('invalid-rpc-envelope');
      const action = fields.get('ctMinhaCariocaAction'), method = fields.get('metodo');
      const args = JSON.parse(fields.get('argsJson'));
      if (!Array.isArray(args)) throw new Error('invalid-rpc-args');
      const key = action + ':' + method;
      if (!Object.hasOwn(handlers, key)) throw new Error('unexpected-rpc');
      const result = await handlers[key](args, state);
      state.rpc.push({ action, method, fixtureEndpoint: request.url() === RPC_ENDPOINT ? 'main' : 'checkout-v2' });
      const payload = JSON.stringify({ ctMinhaCariocaPost: true, id: fields.get('ctMinhaCariocaRequestId'), ok: true, resultado: result }).replace(/</g, '\\u003c');
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><script>window.top.postMessage(' + payload + ',"*")</script>' });
    } catch (error) {
      deny(error.message && /^[a-z-]+$/.test(error.message) ? error.message : 'fixture-contract-failed', request);
      await route.abort('blockedbyclient');
    }
  });
  assert.equal(typeof context.routeWebSocket, 'function', 'WebSocket interception is required');
  await context.routeWebSocket('**/*', socket => {
    state.unexpected.push({ kind: 'unexpected-websocket' });
    socket.close(); // Never connectToServer().
  });
  return { state, assertClean() {
    assert.deepEqual(state.unexpected, [], 'Unexpected network/RPC attempt; test must fail');
    assert.equal(state.forwarded, 0);
  } };
}
module.exports = { installIsolatedNetwork, RPC_ENDPOINT };
