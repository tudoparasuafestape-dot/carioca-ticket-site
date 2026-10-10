const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('anuncie/index.html', 'utf8');
const js = fs.readFileSync('assets/advertise.js', 'utf8');
new vm.Script(js);
const dictionaries = JSON.parse(js.match(/var dictionaries = ([\s\S]*?);\n  var select/)[1]);
const keys = [...html.matchAll(/data-ad-text="([^"]+)"/g)].map(m => m[1]);
const plans = ['monthly', 'quarterly', 'halfYear', 'annual'];
assert.deepEqual(Object.keys(dictionaries), ['pt-BR', 'en-US', 'es', 'zh-Hans']);
for (const [locale, copy] of Object.entries(dictionaries)) {
  assert.deepEqual(Object.keys(copy), Object.keys(dictionaries['pt-BR']), locale);
  for (const key of keys) assert.ok(typeof copy[key] === 'string' && copy[key].trim(), `${locale}: ${key}`);
  for (const plan of ['', ...plans]) {
    const message = copy.message + (plan ? ' ' + copy[plan] + ' (' + copy[plan + 'Duration'] + ').' : '');
    const url = new URL('https://wa.me/5581999311509?text=' + encodeURIComponent(message));
    assert.equal(url.searchParams.get('text'), message);
    assert.equal(url.pathname, '/5581999311509');
  }
  assert.match(copy.quarterlyDuration, /3/);
  assert.match(copy.annualPrice, /R\$ 150/);
  assert.match(copy.annualBilling, /12/);
  assert.match(copy.annualBilling, /R\$ 1[.,]800/);
  for (const key of Object.keys(copy)) if (!['annualPrice','annualBilling'].includes(key)) assert.ok(!/R\$/.test(copy[key]));
}
assert.equal(dictionaries['pt-BR'].annualBilling, 'Cobrança mensal com compromisso de 12 meses. Total do período: R$ 1.800.');
assert.equal(dictionaries['pt-BR'].annualTerms, 'Condições de cancelamento e renovação a definir na proposta.');
assert.deepEqual([...html.matchAll(/data-proposal="([^"]*)"/g)].map(m=>m[1]), ['', ...plans, '']);
assert.equal((html.match(/<h1\b/g) || []).length, 1);
assert.equal((html.match(/class="ad-plan"/g) || []).length, 4);
assert.equal((html.match(/data-ad-text="inquiry"/g) || []).length, 3);
assert.ok(!/<form|fetch\(|XMLHttpRequest|checkout|supabase/i.test(html + js));
assert.ok(!/\b\d+%|desconto|garantia de|milhares/i.test(html.replace(/<[^>]*>/g, '')));
assert.ok(html.includes('href="/"') && html.includes('id="whatsapp-note"'));
for(const plan of plans) assert.ok(html.includes(`id="ad-tab-${plan}"`) && html.includes(`id="ad-panel-${plan}"`));
console.log('Advertising contracts passed: four localized plans, six commercial CTAs, approved annual monthly billing and commitment, no checkout or network logic.');
