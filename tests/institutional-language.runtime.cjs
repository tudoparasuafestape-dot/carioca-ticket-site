'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/institutional-source-text.json')));
const code = fs.readFileSync(path.join(__dirname, '../assets/institutional-translations.js'), 'utf8');
const window = {}; vm.runInNewContext(code, {window});
const api = window.CTInstitutionalTranslations;
test('102 exact authored sources, unique keys and three complete target dictionaries', () => {
  assert.equal(api.rows.length, 102);assert.equal(new Set(api.rows.map(r=>r.key)).size,102);
  assert.deepEqual(Array.from(api.rows,r=>r.source),source);
  for(const row of api.rows) {
    assert.deepEqual(Object.keys(row.translations),['en-US','es','zh-Hans']);
    for(const text of Object.values(row.translations)) assert.ok(typeof text==='string' && text.trim());
  }
});
test('dates, digits and fixed brand/payment/identity tokens preserved', () => {
  const fixed=['Carioca Ticket','QR Code','PIX','CPF','CNPJ','CVV','WhatsApp','contato@cariocaticket.com.br','@cariocaticketbr','cariocaticket.com.br'];
  for(const row of api.rows) for(const [locale,text] of Object.entries(row.translations)) {
    assert.deepEqual(text.match(/\d+(?:\/\d+)*/g)||[],row.source.match(/\d+(?:\/\d+)*/g)||[],row.key+' '+locale);
    for(const token of fixed) if(row.source.includes(token)) assert.ok(text.includes(token),row.key+' '+locale+' '+token);
  }
});
test('registration supplies four dictionaries; source lookup rejects edited copy', () => {
  const registered={};assert.equal(api.register({register(l,dict){registered[l]=dict;}}),true);
  assert.deepEqual(Object.keys(registered),['pt-BR','en-US','es','zh-Hans']);
  for(const row of api.rows){assert.equal(registered['pt-BR'][row.key],row.source);assert.equal(api.find(row.source).key,row.key);assert.equal(api.find(row.source+' changed'),null);}
  assert.equal(api.register(null),false);
});
test('data immutable and module cannot change DOM, legal originals, URLs or network', () => {
  assert.ok(Object.isFrozen(api));assert.ok(Object.isFrozen(api.rows));
  for(const row of api.rows){assert.ok(Object.isFrozen(row));assert.ok(Object.isFrozen(row.translations));}
  assert.doesNotMatch(code,/document\.|fetch\s*\(|XMLHttpRequest|innerHTML|localStorage|location\./);
});
