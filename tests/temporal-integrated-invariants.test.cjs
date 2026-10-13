'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/temporal-integrated-source-index.json'), 'utf8'));
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const blob = data => crypto.createHash('sha1').update('blob ' + Buffer.byteLength(data) + '\0').update(data).digest('hex');
const inline = html => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m => !/\bsrc\s*=/.test(m[1])).map(m => m[2]);
for (const [file, expected] of Object.entries(index.preserved_base_blobs)) test('exact base preservation: ' + file, () => assert.equal(blob(read(file)), expected));
for (const route of ['evento', 'evento-v2', 'checkout', 'checkout-v2']) {
  test(route + ': unchanged RPC transport, valid scripts and shared current clock before app', () => {
    const html = read(route + '/index.html'), scripts = inline(html);
    assert.equal(hash(scripts[0]), index.transport_sha256[route]);
    for (const script of scripts) new vm.Script(script);
    assert(html.includes('/assets/public-catalog-clock.js?v=' + index.clock_query_version));
    assert(html.indexOf('/assets/public-catalog-clock.js?') < html.indexOf('var state={'));
    assert(!/Date\.now\(\).*validUntil|Date\.parse\([^)]*validUntil/.test(html));
    for (const dep of index.entrypoint_dependencies[route + '/index.html']) assert(fs.existsSync(path.join(ROOT, dep)), dep);
  });
}
for (const [route, functions] of Object.entries(index.frozen_checkout_functions_sha256)) test(route + ': payment TTL, polling, keys, recovery storage and secure ticket URL are frozen', () => {
  const html = read(route + '/index.html');
  for (const [name, expected] of Object.entries(functions)) {
    const match = html.match(new RegExp('^      function ' + name + '\\([^\\n]*\\{(?:[^\\n]*\\}[^\\n]*$|[\\s\\S]*?\\n      \\})', 'm'));
    assert(match, name); assert.equal(hash(match[0]), expected, name);
  }
});
test('shared clock API remains a strict superset of the four page consumers', () => {
  const api = require('../assets/public-catalog-clock.js');
  assert.equal(typeof api.instant, 'function'); const c = api.create({ now: () => 0 });
  for (const method of ['begin', 'accept', 'remaining', 'remainingUntil', 'isFresh', 'invalidate', 'dispose']) assert.equal(typeof c[method], 'function', method);
  c.dispose();
});
test('the runtime change manifest contains only the approved frontend scope', () => {
  assert.deepEqual([...index.runtime_changes].sort(), ['assets/checkout-translations.js', 'checkout-v2/index.html', 'checkout/index.html', 'evento-v2/index.html', 'evento/index.html'].sort());
});
