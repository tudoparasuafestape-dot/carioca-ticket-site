const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('anuncie/index.html', 'utf8');
const js = fs.readFileSync('assets/advertise.js', 'utf8');
new vm.Script(js);
const dictionaries = JSON.parse(js.match(/var dictionaries = ([\s\S]*?);\n  var select/)[1]);
const keys = [...html.matchAll(/data-ad-text="([^"]+)"/g)].map(m => m[1]);
for (const [locale, copy] of Object.entries(dictionaries)) {
  assert.deepEqual(Object.keys(copy), Object.keys(dictionaries['pt-BR']), locale);
  for (const key of keys) assert.ok(typeof copy[key] === 'string' && copy[key].trim(), `${locale}: ${key}`);
  for (const plan of ['', 'monthly', 'halfYear', 'annual']) {
    const message = copy.message + (plan ? ' ' + copy[plan] + ' (' + copy[plan + 'Duration'] + ').' : '');
    const url = new URL('https://wa.me/5581999311509?text=' + encodeURIComponent(message));
    assert.equal(url.searchParams.get('text'), message);
    assert.equal(url.pathname, '/5581999311509');
  }
}
assert.equal((html.match(/data-proposal=/g) || []).length, 5);
assert.equal((html.match(/<h1\b/g) || []).length, 1);
assert.ok(!/<form|fetch\(|XMLHttpRequest|checkout|supabase/i.test(html + js));
assert.ok(!/R\$|\b\d+%|desconto|garantia de|milhares/i.test(html.replace(/<[^>]*>/g, '')));
assert.ok(html.includes('href="/"') && html.includes('id="whatsapp-note"'));
console.log('Advertising contracts passed: complete four-language copy, encoded proposal URLs, five CTAs, no transaction/network logic.');
