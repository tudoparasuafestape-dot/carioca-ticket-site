'use strict';
// Synthetic DOM/RPC only; does not perform HTTP, image requests, browser or production RPC.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../assets/event-cover-picker.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const ids = new Map(), calls = [], listeners = {};
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.attrs = {}; this.dataset = {}; this.value = ''; this.disabled = false; this.open = false; this.textContent = ''; }
    set innerHTML(value) { this.html = value; for (const m of value.matchAll(/<([a-z0-9]+)[^>]*\bid="([^"]+)"[^>]*>/g)) { const e = new Element(m[1]); e.disabled = /\bdisabled\b/.test(m[0]); ids.set(m[2], e); } }
    addEventListener(event, fn) { (this.listeners[event] ||= []).push(fn); }
    emit(event, value = {}) { value.target ||= this; for (const fn of this.listeners[event] || []) fn(value); }
    setAttribute(k,v) { this.attrs[k]=v; }
    append(...elements) { this.children.push(...elements); }
    appendChild(e) { this.append(e); }
    replaceChildren(...elements) { this.children = elements; }
    querySelectorAll(tag) { return this.children.flatMap(e => [...(e.tagName === tag ? [e] : []), ...e.querySelectorAll(tag)]); }
    showModal() { this.open = true; }
    close() { this.open = false; this.emit('close'); }
    focus() { this.focused = true; }
  }
  const body = new Element('body');
  const document = { body, createElement: tag => new Element(tag), getElementById: id => ids.get(id), addEventListener: (e, fn) => { (listeners[e] ||= []).push(fn); } };
  function runner(success, failure) { return new Proxy({}, {get(_, key) { if(key==='withSuccessHandler')return fn=>runner(fn,failure); if(key==='withFailureHandler')return fn=>runner(success,fn); return payload=>calls.push({method:key,payload,success,failure}); }}); }
  vm.runInNewContext(source, {document, window:{google:{script:{run:runner()}}}, URL});
  const el = n => ids.get('ctCover'+n), dialog = body.children[0];
  function open(id='EVENT-A') { const button = new Element('button'); button.dataset.approvedEventCover=id; button.closest=()=>button; for(const fn of listeners.click)fn({target:button}); return button; }
  return {el,dialog,calls,open};
}
const asset = {assetId:'approved-1', name:'Arte aprovada <script>literal</script>', url:'https://cariocaticket.com.br/assets/eventos/test.jpg', sha256:'a'.repeat(64)};
const data = (eventId='EVENT-A', extra={}) => ({ok:true,eventId,eventName:'Evento <img onerror=bad>',version:'a'.repeat(64),currentAssetId:'',assets:[asset],...extra});
async function loaded(f, value=data()) { f.calls.at(-1).success(value); await flush(); }
function select(f, reason='Aplicar arte aprovada') { const input=f.el('Assets').querySelectorAll('input')[0]; input.emit('change'); f.el('Reason').value=reason; f.el('Reason').emit('input'); }
function imageLoad(f) { f.el('Assets').querySelectorAll('img')[0].emit('load'); }
(async()=>{
  let count=0;
  async function test(name, fn) { await fn(); console.log('PASS '+name); count++; }
  await test('read only on open; image readiness and reason gate', async()=>{ const f=fixture();f.open();assert.equal(f.calls.length,1);assert.equal(f.calls[0].method,'ctEventoCapaBibliotecaListarSeguraPROD');await loaded(f);select(f);assert.equal(f.el('Save').disabled,true);imageLoad(f);assert.equal(f.el('Save').disabled,false);assert.equal(f.el('Event').textContent,'Evento <img onerror=bad>');assert.equal(f.el('Assets').children[0].children[2].textContent,asset.name); });
  await test('one save only, allowlisted payload, close blocked while saving', async()=>{const f=fixture();f.open();await loaded(f);select(f);imageLoad(f);f.el('Save').emit('click');f.el('Save').emit('click');assert.equal(f.calls.length,2);assert.deepEqual(JSON.parse(JSON.stringify(f.calls[1].payload)),{eventId:'EVENT-A',assetId:asset.assetId,expectedVersion:'a'.repeat(64),motivo:'Aplicar arte aprovada'});f.el('Close').emit('click');assert.equal(f.dialog.open,true);let prevented=false;f.dialog.emit('cancel',{preventDefault(){prevented=true;}});assert.equal(prevented,true);f.calls[1].success({ok:true,eventId:'EVENT-A',assetId:asset.assetId,version:'b'.repeat(64)});await flush();assert.equal(f.el('Save').disabled,true);assert.match(f.el('Status').textContent,/Capa salva/);});
  await test('cancel and stale response cannot replace newer event', async()=>{const f=fixture();const opener=f.open();f.el('Close').emit('click');assert.equal(opener.focused,true);f.open('EVENT-B');f.calls[0].success(data());await flush();assert.equal(f.el('Assets').children.length,0);await loaded(f,data('EVENT-B'));assert.equal(f.el('Assets').children.length,1);assert.equal(f.calls.length,2);});
  await test('invalid URL schemes, host, path and duplicate IDs fail closed',async()=>{for(const url of ['https://evil.test/assets/eventos/test.jpg','javascript:alert(1)','data:image/png,xxx','https://cariocaticket.com.br/other/test.jpg','https://cariocaticket.com.br/assets/eventos/test.jpg?q=1','https://user:pw@cariocaticket.com.br/assets/eventos/test.jpg']){const f=fixture();f.open();await loaded(f,data('EVENT-A',{assets:[{...asset,url}]}));assert.equal(f.el('Save').disabled,true);assert.equal(f.el('Assets').children.length,0);}const f=fixture();f.open();await loaded(f,data('EVENT-A',{assets:[asset,asset]}));assert.equal(f.el('Save').disabled,true);});
  await test('image failure prevents save',async()=>{const f=fixture();f.open();await loaded(f);select(f);imageLoad(f);f.el('Assets').querySelectorAll('img')[0].emit('error');assert.equal(f.el('Save').disabled,true);});
  await test('uncertain write blocks retry across close/open until read confirmation',async()=>{const f=fixture();f.open();await loaded(f);select(f);imageLoad(f);f.el('Save').emit('click');f.calls[1].failure(new Error('TIMEOUT'));await flush();assert.equal(f.el('Save').disabled,true);f.el('Save').emit('click');assert.equal(f.calls.length,2);f.el('Close').emit('click');f.open();await loaded(f);select(f);imageLoad(f);assert.equal(f.el('Save').disabled,true);f.el('Refresh').emit('click');await loaded(f,data('EVENT-A',{currentAssetId:asset.assetId,version:'b'.repeat(64)}));assert.match(f.el('Status').textContent,/Capa confirmada/);assert.equal(f.calls.filter(c=>/Salvar/.test(c.method)).length,1);});
  await test('empty, denied, mismatch and malformed catalog fail closed',async()=>{for(const value of [data('EVENT-A',{assets:[]}),{ok:false},data('EVENT-B'),data('EVENT-A',{version:''})]){const f=fixture();f.open();await loaded(f,value);assert.equal(f.el('Save').disabled,true);}});
  await test('stale image callback after refresh cannot authorize new image',async()=>{const f=fixture();f.open();await loaded(f);const old=f.el('Assets').querySelectorAll('img')[0];f.el('Refresh').emit('click');await loaded(f);select(f);old.emit('load');assert.equal(f.el('Save').disabled,true);imageLoad(f);assert.equal(f.el('Save').disabled,false);});
  console.log(`${count} synthetic scenarios passed; no visual/browser QA claimed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
