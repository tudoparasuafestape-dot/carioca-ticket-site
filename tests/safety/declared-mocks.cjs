'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const routeScope = new AsyncLocalStorage();
const audits = new WeakMap(), routeOwners = new WeakMap();
const EXPECTED_ERROR = Symbol('intentional fixture error');
const ENDPOINTS = new Set([
  'https://script.google.com/macros/s/AKfycbz28keO65PIIElB8dWMBt8nnEBw9CzBxWnc6nOhAKKGNDkMZnYbWjrhTtr_v-lEI2IAJA/exec',
  'https://script.google.com/macros/s/AKfycbyhx6mnGJMsgpGmx-C1r6ZUXbrE66-X6Rkusp1ulVOGcDfJfIs-jgysWp1PfkqB1UC3hg/exec'
]);
const canonical = value => { const u = new URL(value); u.hash = ''; return u.href; };

function rpcEnvelope(request) {
  assert(ENDPOINTS.has(request.url()), 'unknown-rpc-endpoint');
  assert.equal(request.method(), 'POST', 'rpc-must-be-post');
  assert((request.headers()['content-type'] || '').startsWith('application/x-www-form-urlencoded'), 'invalid-rpc-encoding');
  const fields = new URLSearchParams(request.postData() || '');
  assert.equal(fields.getAll('ctMinhaCariocaAction').length, 1, 'invalid-rpc-action');
  assert.equal(fields.getAll('ctMinhaCariocaRequestId').length, 1, 'invalid-request-id');
  assert(fields.get('ctMinhaCariocaRequestId'), 'empty-request-id');
  return fields;
}
function matches(request, declaration) {
  const url = new URL(request.url());
  if (['GET', 'HEAD'].includes(request.method())) {
    if ((declaration.resources || []).some(value => canonical(value) === request.url())) return { kind: 'declared-resource' };
    const local = declaration.staticRoot;
    if (local && url.origin === local.origin) {
      const root = fs.realpathSync(local.root), name = decodeURIComponent(url.pathname);
      assert(!name.includes('\\') && !name.includes('\0'), 'invalid-static-path');
      let file = path.resolve(root, '.' + name);
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (file.startsWith(root + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile() && fs.realpathSync(file).startsWith(root + path.sep)) return { kind: 'declared-static-root' };
    }
    return null;
  }
  if (!ENDPOINTS.has(request.url())) return null;
  const fields = rpcEnvelope(request), action = fields.get('ctMinhaCariocaAction');
  if (declaration.rpc && Object.hasOwn(declaration.rpc, action)) {
    assert.deepEqual([...fields.keys()].sort(), ['argsJson', 'ctMinhaCariocaAction', 'ctMinhaCariocaRequestId', 'metodo'], 'invalid-rpc-fields');
    assert(Array.isArray(JSON.parse(fields.get('argsJson'))), 'invalid-rpc-args');
    const method = fields.get('metodo');
    if (declaration.rpc[action].includes(method)) return { kind: 'declared-rpc', action, method };
  }
  if (declaration.actions && Object.hasOwn(declaration.actions, action)) {
    assert.deepEqual([...fields.keys()].sort(), ['ctMinhaCariocaAction', 'ctMinhaCariocaRequestId', ...declaration.actions[action]].sort(), 'invalid-action-fields');
    return { kind: 'declared-action', action };
  }
  return null;
}

function installMockAudit(context, state, deny) {
  const observed = new WeakMap(), natives = new WeakMap(), declarations = [], recordedErrors = new WeakSet();
  state.observed = []; state.simulatedErrors = 0;
  let closing = false;
  function entry(request) {
    if (!observed.has(request)) {
      const item = { index: state.observed.length, host: new URL(request.url()).hostname, verb: request.method(), handling: 'pending' };
      // A known request can be cancelled by context teardown before its route
      // callback runs. Classify it at the independent request event as well.
      for (const {target, declaration} of declarations) {
        try {
          if (target !== context && request.frame().page() !== target) continue;
          const decision = matches(request, declaration);
          if (decision) { Object.assign(item, decision, {handling:'declared-awaiting-handler'}); break; }
        } catch (_) { /* Invalid/unclassified requests remain pending and fail. */ }
      }
      observed.set(request, item); state.observed.push(item);
    }
    return observed.get(request);
  }
  context.on('request', entry); // Runs regardless of page/context route precedence.
  function mark(request, decision) { Object.assign(entry(request), { handling: decision.kind }, decision); }
  function fail(request, kind) { mark(request, { kind: 'rejected' }); deny(kind, request); }
  function mockFailure(route, error) {
    const request = route.request();
    if (error && typeof error === 'object') {
      if (recordedErrors.has(error)) return;
      recordedErrors.add(error);
    }
    if (error && error[EXPECTED_ERROR]) { state.simulatedErrors++; return; }
    fail(request, 'mock-contract-failed'); // Never save assertion text, arguments or tokens.
  }
  function wrapped(handler, declaration) {
    return async route => {
      const request = route.request();
      if (!declaration) { fail(request, 'undeclared-mock-route'); await route.abort('blockedbyclient'); return; }
      let decision;
      try { decision = matches(request, declaration); }
      catch (_) { fail(request, 'invalid-mock-envelope'); await route.abort('blockedbyclient'); return; }
      if (!decision) return route.fallback(); // Another explicit mock or the closed default must decide.
      mark(request, decision);
      const proxy = new Proxy(route, { get(target, key) {
        if (key === 'continue' || key === 'fetch') return async () => { fail(request, 'mock-transport-forbidden'); await route.abort('blockedbyclient'); throw new Error('Mock cannot forward requests'); };
        if (key === 'fallback') return async options => {
          if (options && Object.keys(options).length) { fail(request, 'mock-request-rewrite-forbidden'); return route.abort('blockedbyclient'); }
          return route.fallback();
        };
        const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
      } });
      routeOwners.set(proxy, api);
      try { await routeScope.run({ route: proxy, audit: api }, () => handler(proxy)); }
      catch (error) {
        if (closing && /Target.*closed|has been closed|already handled/i.test(String(error.message))) return;
        mockFailure(proxy, error); await route.abort('blockedbyclient').catch(() => {});
      }
    };
  }
  function decorate(target) {
    if (natives.has(target)) return;
    natives.set(target, target.route.bind(target));
    target.route = (matcher, handler, options) => natives.get(target)(matcher, wrapped(handler, null), options);
    target.routeWebSocket = async () => { state.unexpected.push({ kind: 'undeclared-websocket-mock' }); throw new Error('WebSocket mocks are forbidden'); };
  }
  const api = { mark, mockFailure, beginClose() { closing = true; },
    register(target, declaration, handler) { decorate(target); declarations.push({target, declaration}); return natives.get(target)('**/*', wrapped(handler, declaration)); },
    assertAccounted() { assert(state.observed.every(item => item.handling !== 'pending'), 'Request escaped guard accounting'); }
  };
  audits.set(context, api); decorate(context);
  context.pages().forEach(decorate); context.on('page', decorate);
  return api;
}
function mockRoute(target, declaration, handler) {
  const context = typeof target.context === 'function' ? target.context() : target;
  const audit = audits.get(context); assert(audit, 'Use the real branch-isolated helper before declaring mocks');
  return audit.register(target, declaration, handler);
}
function mockFailure(route, error) { const audit = routeOwners.get(route); assert(audit, 'Unknown mock route'); audit.mockFailure(route, error); }
function fixtureError(message) { const error = new Error(message); error[EXPECTED_ERROR] = true; return error; }
function observedExpect(realExpect) {
  function matchers(value) {
    const scope = routeScope.getStore();
    if (!scope) return value;
    return new Proxy(value, { get(target, key) {
      const member = target[key];
      if (key === 'not' || key === 'resolves' || key === 'rejects') return matchers(member);
      if (typeof member !== 'function') return member;
      return (...args) => {
        try {
          const result = member.apply(target, args);
          if (result && typeof result.then === 'function') return result.catch(error => { scope.audit.mockFailure(scope.route, error); throw error; });
          return result;
        } catch (error) { scope.audit.mockFailure(scope.route, error); throw error; }
      };
    } });
  }
  return new Proxy(realExpect, {
    apply(target, receiver, args) { return matchers(Reflect.apply(target, receiver, args)); },
    get(target, key) {
      if (key === 'poll' || key === 'soft') return (...args) => matchers(target[key](...args));
      return target[key];
    }
  });
}
module.exports = { installMockAudit, mockRoute, mockFailure, fixtureError, observedExpect };
