'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { ROUTES, readStatic, runSmoke } = require('./published-static.cjs');
const root = path.resolve(__dirname, '../..');
(async () => {
  let redirect = false, reachedWrite = 0;
  const calls = [];
  const server = http.createServer((req, res) => {
    calls.push({ method: req.method, path: req.url });
    if (req.url === '/write') { reachedWrite++; res.end('MUTATION'); return; }
    if (redirect) { res.writeHead(302, { Location: '/write' }); res.end(); return; }
    const route = new URL(req.url, 'http://127.0.0.1').pathname;
    const file = path.join(root, route.endsWith('/') ? route + 'index.html' : route);
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const result = await runSmoke(base, root);
    assert.equal(result.results.length, ROUTES.length);
    assert(calls.every(call => call.method === 'GET' && ROUTES.includes(call.path)));
    assert.equal(result.rpcCalls, 0); assert.equal(result.javascriptExecuted, false);
    redirect = true;
    await assert.rejects(readStatic(base, '/'), /302/);
    await assert.rejects(runSmoke(base, root), error => {
      assert.equal(error.report.success, false);
      assert.equal(error.report.failure.path, '/');
      assert.deepEqual(error.report.results, []);
      return /302/.test(error.message);
    });
    assert.equal(reachedWrite, 0, 'Redirect target must never be requested');
    assert.throws(() => readStatic(base, '/write'), /Unapproved static path/);
    assert.throws(() => readStatic('https://script.google.com', '/'), /Unapproved static origin/);
    assert.throws(() => readStatic(base + '/?endpoint=write', '/'), /origin/);
    console.log('PASS static smoke: ' + ROUTES.length + ' exact files, GET only, redirect and unapproved destinations denied');
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
