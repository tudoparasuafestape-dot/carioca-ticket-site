'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),fee=require('../assets/fee-transparency.js');
const s={subtotalIngressos:87,taxaComprador:8.7,adicionaisComprador:0,totalComprador:95.7};
assert(fee.summary(s));
for(const key of Object.keys(s))for(const bad of [undefined,null,'0',NaN,Infinity,-1])assert.equal(fee.summary({...s,[key]:bad}),null);
assert.equal(fee.summary({...s,totalComprador:87}),null);
assert(fee.summary({subtotalIngressos:120,taxaComprador:0,adicionaisComprador:6,totalComprador:126,taxaProdutor:12}));
assert.equal(fee.quote({sucesso:true,degradado:true,resumo:s}),null);
assert.equal(fee.quote({sucesso:true,degradado:false,cacheStale:true,resumo:s}),null);
assert.equal(fee.snapshot({...s}),null);
assert(fee.snapshot({...s,comissoes:[]}));
const snap={subtotalIngressos:120,taxaComprador:12,totalComprador:138,comissoes:[{fonteCusteio:'COMPRADOR',valorCalculado:6},{fonteCusteio:'PRODUTOR',valorCalculado:40}]};
assert.equal(fee.snapshot(snap).adicionaisComprador,6);assert.equal(snap.adicionaisComprador,undefined);
assert.equal(fee.snapshot({...snap,comissoes:[{}]}),null);
assert.match(fee.composition(s),/87,00.*8,70.*95,70/);
assert(!/banc|segurança|suporte|reembolso/i.test(fee.text));
assert.match(fee.unit(2,3),/3 pacote.*2 acessos por pacote/);
const helper=fs.readFileSync('assets/fee-transparency.js','utf8');
for(const bad of ['fetch(', 'google.script', 'pushState', 'replaceState', 'localStorage', 'sessionStorage'])assert(!helper.includes(bad),bad);
for(const route of ['checkout','checkout-v2']){
 const html=fs.readFileSync(route+'/index.html','utf8');
 assert(html.includes('/assets/fee-transparency.js'));assert(html.includes('/assets/fee-transparency.css'));
 assert(html.includes("window.CTFeeTransparency.snapshot(res.financeiro)"));
 assert(!/o\.textContent=.*l\.preco/.test(html));
}
console.log('PASS fee-transparency runtime: missing != zero; immutable snapshot; amount conservation; no modal side effects');
