const fs=require('fs'),path=require('path'),assert=require('assert');
const html=fs.readFileSync('como-funciona/index.html','utf8'),js=fs.readFileSync('assets/producer-guide.js','utf8');
const copy=JSON.parse(js.match(/var copy = (.*);\nvar root/)[1]);
assert.deepEqual(Object.keys(copy),['pt-BR','en-US','es','zh-Hans']);
const keys=[...html.matchAll(/data-guide(?:-aria)?="([^"]+)"/g)].map(m=>m[1]);
for(const d of Object.values(copy)){for(const key of keys)assert(d[key]&&d[key].trim(),key);assert.deepEqual(Object.keys(d).sort(),Object.keys(copy['pt-BR']).sort());}
for(const s of ['/produtor/','/produtor/solicitar/','https://wa.me/5581999311509'])assert(html.includes(s));
for(const s of ['fetch(','XMLHttpRequest','portalRpc','ctPoliticaComercial','supabase','form.submit'])assert(!js.includes(s)&&!html.includes(s));
assert(!/\b(?:10%|D\+3|3,5%|R\$|80%)\b/.test(html));
assert(html.includes('rel="noopener noreferrer"'));
console.log('Producer guide static contract: passed');

const home=fs.readFileSync('index.html','utf8');assert(home.includes('<a href="/como-funciona/" class="text-link"><span data-i18n="howWorks">'));assert(home.includes('id="perguntas"'));
for(const route of ['produtor/index.html','produtor/solicitar/index.html','ajuda/index.html','termos/index.html','privacidade/index.html','cancelamento-reembolso/index.html'])assert(fs.existsSync(route),'Missing destination '+route);
