'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../assets/public-i18n.js'), 'utf8');
function node(attrs = {}, text = 'Original') {
  return {attrs, textContent: text, lang: 'pt-BR', children: [],
    getAttribute(k) { return this.attrs[k] || null; }, setAttribute(k, v) { this.attrs[k] = v; },
    hasAttribute(k) { return Object.hasOwn(this.attrs, k); },
    matches() { return Object.keys(this.attrs).some(k => k.startsWith('data-public-i18n')); },
    querySelectorAll() { return this.children; }};
}
function boot(saved, blocked = false) {
  const values = new Map(saved === undefined ? [] : [['ct-home-locale', saved]]);
  const writes = [], events = [], handlers = {};
  const storage = {getItem(k) { if (blocked) throw Error('blocked'); return values.get(k) || null; },
    setItem(k, v) { if (blocked) throw Error('blocked'); writes.push([k, v]); values.set(k, v); }};
  const document = {documentElement: node(), nodes: [], querySelectorAll() { return this.nodes; }, dispatchEvent(e) { events.push(e); }};
  const window = {localStorage: storage, addEventListener(k, f) { handlers[k] = f; }, CustomEvent: function (type, init) { this.type = type; this.detail = init.detail; }};
  vm.runInNewContext(code, {window, document});
  return {api: window.CTPublicI18n, window, document, values, writes, events, handlers, storage};
}
test('default PT and immutable locale inventory', () => {
  const {api} = boot(); assert.equal(api.getLocale(), 'pt-BR');
  assert.deepEqual(Array.from(api.locales), ['pt-BR', 'en-US', 'es', 'zh-Hans']); assert.ok(Object.isFrozen(api.locales));
});
for (const language of ['pt-BR', 'en-US', 'es', 'zh-Hans']) {
  test(`restores and persists ${language}`, () => {
    const x = boot(language); assert.equal(x.api.getLocale(), language);
    x.api.setLocale(language); assert.equal(x.values.get(x.api.storageKey), language);
    assert.equal(boot(x.values.get(x.api.storageKey)).api.getLocale(), language);
    assert.equal(x.api.message('translationUnavailable').language, language);
  });
}
test('invalid locale never overwrites preference', () => {
  const x = boot('__proto__'); assert.equal(x.api.getLocale(), 'pt-BR');
  for (const bad of ['en', 'zh-CN', null, '__proto__']) assert.equal(x.api.setLocale(bad), false);
  assert.equal(x.writes.length, 0);
});
test('blocked storage still changes in-memory language', () => {
  const x = boot(undefined, true); assert.equal(x.api.setLocale('es'), true); assert.equal(x.api.getLocale(), 'es');
});
test('one event per actual language change', () => {
  const x = boot(); x.api.setLocale('es'); x.api.setLocale('es'); assert.equal(x.events.length, 1);
  assert.equal(x.events[0].type, 'ct:public-language'); assert.equal(x.events[0].detail.locale, 'es');
});
test('storage event sync, removal and no write loop', () => {
  const x = boot(); x.handlers.storage({storageArea: x.storage, key: x.api.storageKey, newValue: 'zh-Hans'});
  assert.equal(x.api.getLocale(), 'zh-Hans'); assert.equal(x.writes.length, 0);
  x.handlers.storage({storageArea: x.storage, key: null, newValue: null}); assert.equal(x.api.getLocale(), 'pt-BR');
});
test('foreign storage, unrelated key and invalid updates ignored', () => {
  const x = boot('es');
  for (const e of [{storageArea: {}, key: x.api.storageKey, newValue: 'en-US'}, {storageArea: x.storage, key: 'other', newValue: 'en-US'}, {storageArea: x.storage, key: x.api.storageKey, newValue: '__proto__'}]) x.handlers.storage(e);
  assert.equal(x.api.getLocale(), 'es');
});
test('fallback message keeps Portuguese language and missing key is explicit', () => {
  const x = boot('en-US'); x.api.register('pt-BR', {hello: 'Olá'});
  assert.equal(x.api.message('hello').language, 'pt-BR'); assert.equal(x.api.message('hello').text, 'Olá');
  assert.equal(x.api.message('unknown').missing, true);
});
test('register rejects unsupported languages and inherited/prototype keys', () => {
  const {api} = boot(); assert.equal(api.register('xx', {a: 'b'}), false);
  api.register('pt-BR', JSON.parse('{"__proto__":"bad","constructor":"bad","empty":" "}'));
  assert.equal(api.message('__proto__').missing, true); assert.equal(api.message('constructor').missing, true); assert.equal(api.message('empty').missing, true);
});
test('single-pass interpolation does not expand inserted tokens', () => {
  const {api} = boot(); api.register('pt-BR', {hello: '{a} / {b}'});
  assert.equal(api.message('hello', {a: '{b}', b: '<img src=x>'}).text, '{b} / <img src=x>');
});
test('explicit DOM labels, placeholder and aria translated with textContent only', () => {
  const x = boot('es'); x.api.register('es', {hello: '<b>Hola</b>'});
  const el = node({'data-public-i18n': 'hello', 'data-public-i18n-placeholder': 'hello', 'data-public-i18n-aria-label': 'hello'});
  x.api.apply(el); assert.equal(el.textContent, '<b>Hola</b>'); assert.equal(el.attrs.placeholder, '<b>Hola</b>'); assert.equal(el.attrs['aria-label'], '<b>Hola</b>'); assert.equal(el.lang, 'es'); assert.equal(el.innerHTML, undefined);
});
test('missing DOM translation preserves authored copy; unmarked elements untouched', () => {
  const x = boot(); const el = node({'data-public-i18n': 'unknown'}); x.api.apply(el); assert.equal(el.textContent, 'Original');
  const plain = node(); x.api.apply(plain); assert.equal(plain.textContent, 'Original');
});
test('legacy document lang stays PT unless page explicitly opts in', () => {
  const x = boot(); x.api.setLocale('en-US'); assert.equal(x.document.documentElement.lang, 'pt-BR');
  x.document.documentElement.attrs['data-public-i18n-root'] = ''; x.api.setLocale('es'); assert.equal(x.document.documentElement.lang, 'es');
});
const entry = {sourceText: 'Descrição 30 R$ 95', sourceLanguage: 'pt-BR', translations: {'en-US': 'Description 30 R$ 95', es: 'Descripción 30 R$ 95', 'zh-Hans': '说明 30 R$ 95'}};
test('exact source contract resolves each supported content language', () => {
  const {api} = boot(); for (const locale of api.locales) {
    const r = api.content({sourceText: entry.sourceText, sourceLanguage: 'pt-BR', entry, locale});
    assert.equal(r.language, locale); assert.equal(r.original, entry.sourceText); assert.equal(r.translated, locale !== 'pt-BR');
  }
});
test('source text or language changes invalidate cached/prestored translations', () => {
  const {api} = boot('en-US'); for (const options of [{sourceText: entry.sourceText + '!', sourceLanguage: 'pt-BR'}, {sourceText: entry.sourceText, sourceLanguage: 'es'}]) {
    const r = api.content({...options, entry}); assert.equal(r.status, 'stale'); assert.equal(r.text, options.sourceText); assert.equal(r.translated, false); assert.ok(r.notice);
  }
});
test('missing, empty and inherited translations return original with notice', () => {
  const {api} = boot('en-US'); for (const e of [undefined, {...entry, translations: {'en-US': ' '}}, {...entry, translations: Object.create({'en-US': 'Wrong'})}]) {
    const r = api.content({sourceText: entry.sourceText, entry: e}); assert.equal(r.status, 'missing'); assert.equal(r.text, entry.sourceText); assert.equal(r.language, 'pt-BR'); assert.ok(r.notice);
  }
});
test('legal/informational mode retains original and announces translation', () => {
  const {api} = boot('es'); const r = api.content({sourceText: entry.sourceText, entry, informative: true});
  assert.equal(r.original, entry.sourceText); assert.equal(r.notice, api.message('informativeTranslation').text);
});
test('no RPC, fetch, credentials, transaction or HTML rendering dependencies', () => {
  assert.doesNotMatch(code, /fetch\s*\(|XMLHttpRequest|innerHTML\s*=|google\.script|https?:\/\//);
});
