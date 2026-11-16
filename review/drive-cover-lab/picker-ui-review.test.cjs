'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'picker-ui-review.js'), 'utf8');
class Element {
  constructor() { this.handlers = {}; this.children = []; this.value = ''; this.open = false; }
  setAttribute() {}
  addEventListener(name, fn) { this.handlers[name] = fn; }
  appendChild(el) { this.children.push(el); }
  append(...els) { this.children.push(...els); }
  replaceChildren() { this.children = []; }
  querySelectorAll() { return []; }
  showModal() { this.open = true; }
  close() { this.open = false; this.handlers.close?.(); }
}
function setup() {
  const els = {}, doc = new Element(), calls = [];
  doc.body = new Element(); doc.createElement = () => new Element();
  doc.getElementById = id => els[id] ||= new Element();
  const run = { withSuccessHandler(fn) { this.ok = fn; return this; }, withFailureHandler(fn) { this.fail = fn; return this; }, ctEventoCapaBibliotecaListarSeguraPROD(id) { calls.push({ id, ok: this.ok, fail: this.fail }); }, ctEventoCapaBibliotecaSalvarSeguraPROD(data) { calls.push({save: data, ok: this.ok, fail: this.fail}); } };
  vm.runInNewContext(source, { document: doc, window: { google: { script: { run } } }, URL });
  function open(id) { doc.handlers.click({ target: { closest: () => ({ focus() {}, dataset: { approvedEventCover: id } }) } }); }
  return { els, calls, open, dialog: doc.body.children[0] };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  for (const [error, expected] of [
    [new Error('Exception: CT_CAPA_ASSET_NAO_AUTORIZADO'), /cadastrada antes/],
    [new Error('CT_CAPA_ACESSO_NEGADO'), /autorizar/],
    [new Error('network failure containing private details'), /agora/],
    [null, /agora/],
    [new Error('CT_CAPA_ASSET_NAO_AUTORIZADO_EXTRA'), /agora/]
  ]) {
    const s = setup(); s.open('EVENT-A'); s.calls[0].fail(error); await tick();
    assert.match(s.els.ctCoverStatus.textContent, expected);
    assert.equal(s.els.ctCoverSave.disabled, true);
    assert.equal(s.calls.length, 1);
    assert(!s.els.ctCoverStatus.textContent.includes('private details'));
  }
  const s = setup(); s.open('EVENT-A');
  s.calls[0].ok({ ok: true, eventId: 'EVENT-A', eventName: 'Test', version: 'version', assets: [] }); await tick();
  assert.match(s.els.ctCoverStatus.textContent, /Nenhuma arte/);
  s.els.ctCoverAssets.children.push(new Element());
  s.els.ctCoverRefresh.handlers.click();
  assert.equal(s.els.ctCoverAssets.children.length, 0);
  s.dialog.close(); s.open('EVENT-B');
  s.calls[1].fail(new Error('CT_CAPA_ACESSO_NEGADO')); await tick();
  assert.equal(s.els.ctCoverStatus.textContent, 'Consultando as artes autorizadas…');
  s.calls[2].ok({ ok: true, eventId: 'EVENT-A', version: 'version', assets: [] }); await tick();
  assert.match(s.els.ctCoverStatus.textContent, /agora/);
  assert.equal(s.els.ctCoverSave.disabled, true);
  const asset={assetId:'cover-a',name:'Test cover',url:'https://cariocaticket.com.br/assets/eventos/test.png',sha256:'a'.repeat(64)};
  for (const code of ['CONFLITO','ACESSO_NEGADO','ARGUMENTOS_INVALIDOS','ASSET_NAO_AUTORIZADO','EVENTO_INVALIDO','UNKNOWN_TIMEOUT','SUCCESS']) {
    const t=setup();t.open('EVENT-A');
    const response={ok:true,eventId:'EVENT-A',version:'v1',currentAssetId:'',assets:[asset]};
    t.calls[0].ok(response);await tick();
    const [input,img]=t.els.ctCoverAssets.children[0].children;
    img.handlers.load();input.handlers.change();t.els.ctCoverReason.value='Test reason';t.els.ctCoverReason.handlers.input();
    assert.equal(t.els.ctCoverSave.disabled,false);
    t.els.ctCoverSave.handlers.click();assert.equal(t.calls[1].save.assetId,'cover-a');
    if(code==='SUCCESS')t.calls[1].ok({ok:true,eventId:'EVENT-A',assetId:'cover-a',version:'v2'});
    else t.calls[1].fail(new Error('CT_CAPA_'+code));
    await tick();assert.equal(t.els.ctCoverSave.disabled,true);
    if(code==='SUCCESS'){assert.match(t.els.ctCoverStatus.textContent,/Capa salva/);continue;}
    t.els.ctCoverRefresh.handlers.click();t.calls[2].ok({...response});await tick();
    const [again,image]=t.els.ctCoverAssets.children[0].children;image.handlers.load();again.handlers.change();
    assert.equal(t.els.ctCoverSave.disabled,code==='UNKNOWN_TIMEOUT');
    if(code==='UNKNOWN_TIMEOUT') {
      t.els.ctCoverRefresh.handlers.click();t.calls[3].ok({...response,version:'v2',currentAssetId:'cover-a'});await tick();
      assert.match(t.els.ctCoverStatus.textContent,/Capa confirmada/);
    }
  }
  for (const [url,allowed] of [
    ['https://drive.usercontent.google.com/download?id=public_fixture_123&export=download',true],
    ['https://drive.usercontent.google.com/download?id=public_fixture_123&export=download&evil=x',false],
    ['https://drive.usercontent.google.com.evil.test/download?id=public_fixture_123&export=download',false],
    ['http://drive.usercontent.google.com/download?id=public_fixture_123&export=download',false]
  ]) {const u=setup();u.open('EVENT-A');u.calls[0].ok({ok:true,eventId:'EVENT-A',version:'v1',assets:[{...asset,url}]});await tick();assert.equal(u.els.ctCoverAssets.children.length,allowed?1:0);}
  for(const count of [21,102,103]) {const u=setup();u.open('EVENT-A');u.calls[0].ok({ok:true,eventId:'EVENT-A',version:'v1',assets:Array.from({length:count},(_,i)=>({...asset,assetId:'a'+i}))});await tick();assert.equal(u.els.ctCoverAssets.children.length,count<=102?count:0);}
  console.log('PASS: 15 scenario groups (error classification, no raw leakage, empty library, stale UI clearing, stale response, wrong event rejection); no external writes.');
})().catch(e => { console.error(e); process.exitCode = 1; });
