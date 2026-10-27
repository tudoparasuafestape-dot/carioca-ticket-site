'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..'),index=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/public-eligibility-main-v2-source-index.json')));
const read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const blob=value=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(value)+'\0').update(value).digest('hex');
const inline=html=>[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!/\bsrc\s*=/.test(m[1])).map(m=>m[2]);
const runtime=['assets/checkout-translations.js','assets/home-event-rail.js','assets/public-catalog-clock.js','assets/public-event-catalog.js','checkout/index.html','checkout-v2/index.html','evento/index.html','evento-v2/index.html','index.html'];
test('V2 pins main explicitly, not the historical candidate or runtime deployment',()=>{
 assert.equal(index.base_commit,'5d3a820a63bc2f6784f2296f5b1dda8888e65dc3');assert.equal(index.previous_candidate_base,'1cefedc61514cd85b2434e75b7520a4739bc903e');assert.equal(index.backend_runtime_reconciled,false);assert.equal(index.eligibilityContract,'CT_PUBLIC_ELIGIBILITY_EXCLUSIVE_V1');assert.deepEqual(index.runtime_changes,runtime);assert.equal(Object.keys(index.base_blobs).length,518);
});
test('all declared pinned source inputs are present (partial source snapshot, not deployment)',()=>{
 assert.equal(index.required_materialized_paths.length,190);for(const file of index.required_materialized_paths)assert(fs.existsSync(path.join(ROOT,file)),file);
});
test('all original files present outside the exact public/test allowlist preserve main blobs',()=>{
 const permitted=new Set([...runtime,...index.existing_test_changes]);let checked=0;
 for(const [file,pin]of Object.entries(index.base_blobs))if(!permitted.has(file)&&fs.existsSync(path.join(ROOT,file))){assert.equal(blob(fs.readFileSync(path.join(ROOT,file))),pin.sha,file);checked++;}
 assert(checked>=146,'at least 146 preserved materialized sources, plus any full-checkout files present');
});
test('no unintended new executable runtime surface or unexpected runtime delta',()=>{
 const changed=[];
 const walk=dir=>{for(const e of fs.readdirSync(path.join(ROOT,dir),{withFileTypes:true})){if(e.name==='.git')continue;const p=path.posix.join(dir,e.name);if(e.isDirectory()){if(!['tests','docs','.github','node_modules'].includes(p))walk(p);continue;}if(!/\.(?:html|js|css|svg|webmanifest)$/.test(p))continue;const prior=index.base_blobs[p];if(!prior||blob(fs.readFileSync(path.join(ROOT,p)))!==prior.sha)changed.push(p);}};walk('');assert.deepEqual(changed.sort(),[...runtime].sort());
});
for(const route of ['checkout','checkout-v2','evento','evento-v2'])test(route+': transport, syntax, clock ordering and old dependencies preserved',()=>{
 const html=read(route+'/index.html'),scripts=inline(html);assert.equal(sha(scripts[0]),index.transport_sha256[route]);for(const s of scripts)new vm.Script(s);assert(html.includes('/assets/public-catalog-clock.js?v='+index.clock_query_version));assert(html.indexOf('/assets/public-catalog-clock.js?')<html.indexOf('var state={'));assert(html.includes('/assets/advance-sales.js?v=20261016-encerrado1'));for(const file of index.main_entrypoint_dependencies[route+'/index.html'])assert(fs.existsSync(path.join(ROOT,file)),file);
});
for(const [route,methods]of Object.entries(index.frozen_checkout_functions_sha256))test(route+': payment TTL, polling, recovery storage and idempotency functions byte-preserved from main',()=>{
 const source=read(route+'/index.html');for(const [name,expected]of Object.entries(methods)){const found=source.match(new RegExp('^      function '+name+'\\([^\\n]*\\{(?:[^\\n]*\\}[^\\n]*$|[\\s\\S]*?\\n      \\})','m'));assert(found,name);assert.equal(sha(found[0]),expected,name);}
});
test('translation prerequisite is strictly four added recovery messages; all main entries preserved',()=>{
 const window={};vm.runInNewContext(read('assets/checkout-translations.js'),{window});const entries=window.CTCheckoutTranslations;
 for(const [key,expected]of Object.entries(index.main_checkout_translation_values_sha256))assert.equal(sha(JSON.stringify(entries[key])),expected,key);
 assert.deepEqual(Object.keys(entries).filter(k=>!Object.hasOwn(index.main_checkout_translation_values_sha256,k)).sort(),['Tentar novamente','Minhas compras','Não foi possível recuperar o pedido agora. Tente novamente.','Ainda não foi possível confirmar o resultado da tentativa anterior. Consulte Minhas compras antes de tentar uma nova compra.'].sort());
});
test('PR222 demonstration section remains byte-exact and keeps main asset namespaces',()=>{
 const html=read('index.html');assert.equal(sha(html.match(/    <section id="event-demonstration"[\s\S]*?<\/section>/)[0]),index.main_demo_section_sha256);for(const asset of ['/assets/demo-event.css?v=20261016-demo1','/assets/home-i18n.js?v=20261016-demo1','/assets/advance-sales.js?v=20261016-encerrado1'])assert(html.includes(asset));
});
test('PR225 privacy and PR226 verification bytes are unmodified, including no final newline',()=>{
 for(const file of ['assets/institutional-translations.js','privacidade/index.html','tests/fixtures/institutional-source-text.json','tests/institutional-language.runtime.cjs','google994ee99d62e24f28.html'])assert.equal(blob(read(file)),index.base_blobs[file].sha,file);
 assert.equal(read('google994ee99d62e24f28.html'),'google-site-verification: google994ee99d62e24f28.html');assert.equal(Buffer.byteLength(read('google994ee99d62e24f28.html')),53);
});
test('producer calendar, operational and financial pages, OAuth/workflow definitions are not imported from candidate',()=>{
 for(const file of index.required_materialized_paths.filter(x=>/^(?:eventos-v2\/|produtor\/|produtor-v2\/|central\/|financeiro\/|backoffice\/|vendas\/|relatorios\/|comissoes\/|manifest|package\.json)/.test(x)))assert.equal(blob(fs.readFileSync(path.join(ROOT,file))),index.base_blobs[file].sha,file);
});
test('shared clock exposes the reviewed explicit contract and expected API',()=>{
 const api=require('../assets/public-catalog-clock.js');assert.equal(api.eligibilityContract,index.eligibilityContract);const clock=api.create({now:()=>0});for(const method of ['begin','accept','remaining','remainingUntil','isFresh','invalidate','dispose'])assert.equal(typeof clock[method],'function');clock.dispose();
});
