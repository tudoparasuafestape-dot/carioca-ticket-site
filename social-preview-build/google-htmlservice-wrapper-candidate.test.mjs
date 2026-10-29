import assert from 'node:assert/strict';import fs from 'node:fs';import test from 'node:test';
import{decodeGoogleCatalogWrapper as decode}from './google-htmlservice-wrapper-candidate.mjs';
const html=fs.readFileSync(new URL('./results/catalog-read-response.html',import.meta.url),'utf8');
const url='https://script.google.com/macros/s/AKfycbz28keO65PIIElB8dWMBt8nnEBw9CzBxWnc6nOhAKKGNDkMZnYbWjrhTtr_v-lEI2IAJA/exec';
const id='CT_SOCIAL_READ_20261029_VERIFY_01';
test('sanitized captured public payload decodes as data only',()=>{const r=decode(html,id,url);assert.equal(r.total,3);assert.equal(r.serverNow,'2026-10-29T21:40:35.100Z');const h=r.eventos[0];assert.equal(h.horario,'20h00 às 06h00');assert.match(h.visual.capaUrl,/horizontal-905fe9374a491192.png$/);assert.equal(h.temporal.fimEm,'2026-11-08T09:00:00.000Z');assert.equal(h.status,undefined);assert.equal(h.modoAcesso,undefined);assert.equal(r.cacheStale,undefined);});
test('reject duplicates, expression injection, replay, other deployment and oversized body',()=>{for(const changed of [html+'goog.script.init(',html.replace('goog.script.init(', 'goog.script.init(doEvil()+'),html.replace('IFRAME_SANDBOX','UNKNOWN'),'x'.repeat(1000001)])assert.throws(()=>decode(changed,id,url));assert.throws(()=>decode(html,id+'x',url));assert.throws(()=>decode(html,id,url.replace('/s/AK','/s/WRONGAK')));});
