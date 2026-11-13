const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../checkout/index.html'),'utf8');
function extract(name){const start=html.indexOf('      function '+name+'(');assert(start>=0);const end=html.indexOf('\n      function ',start+10);return html.slice(start,end);}
const src={assignment:"state.politicaComercialAtiva=state.eventId==='EVT-23112026-ERA-BEAUTY-EAC4B673';",functions:['createPayment','atualizarTaxa','officialPriceValid','officiallyFree','selectionKey','quoteSelectionKey'].map(extract).join('\n')};
const helper=require('../assets/checkout-commercial-policy.js');
const patch=html.match(/state\.politicaComercialAtiva=\[[\s\S]*?\]\.indexOf\(state\.eventId\)>=0;/)?.[0];
assert(patch,'Exact-event quote scope assignment not found');
const IDs=['EVT-23112026-ERA-BEAUTY-EAC4B673','EVT-29112026-ANIVERSARIO-TONY-BURGUER-6-ANOS-4F761E02','EVT-29112026-FABRICA-DE-SAMBA-CE2EF10E'];
let passed=0;function test(n,f){f();passed++;console.log('PASS',n)}
function setup(id,assignment){let sent=[],modals=[],updated=0;const c={state:{eventId:id,busy:false,type:{id:'SYNTH-TYPE'},lot:{id:'SYNTH-LOT',precoNumero:10},feeReady:false},el:{paymentCard:{checked:false},payButton:{disabled:false},buyerName:{value:'SYNTHETIC'},buyerCpf:{value:'00000000000'},buyerEmail:{value:'test@example.invalid'},buyerWhatsapp:{value:'00000000000'},marketing:{checked:false}},catalogLease:{isFresh:()=>true},showRecoveryPending:()=>false,advanceSalesClosed:()=>false,validate:()=>'',updateSummary:()=>updated++,modal:(a,b)=>modals.push([a,b]),quantity:()=>1,setLoading:()=>{},onlyDigits:x=>x,participants:()=>[],getOrCreateIdempotency:()=> 'SYNTH-KEY',Date,google:{script:{run:{withSuccessHandler(){return this},withFailureHandler(){return this},ctCheckoutPixPublicoIniciarPROD:p=>sent.push(p)}}}};vm.createContext(c);vm.runInContext(src.functions,c);vm.runInContext(assignment,c);return {c,sent,modals,updated:()=>updated};}
test('reproduce Tony without fee quote can submit nominal checkout',()=>{const f=setup(IDs[1],src.assignment);f.c.createPayment();assert.equal(f.sent.length,1);assert.equal(f.sent[0].politicaRevisaoVista,undefined)});
for(const id of IDs.slice(0,2)){test('paid event requires authoritative quote '+id,()=>{const f=setup(id,patch);f.c.createPayment();assert.equal(f.sent.length,0);assert.equal(f.updated(),1);assert.equal(f.modals[0][0],'Confirmando o total')});}
test('Fabrica explicitly unchanged',()=>{const f=setup(IDs[2],patch);assert.equal(f.c.state.politicaComercialAtiva,false)});
test('unrelated event scope unchanged',()=>{const f=setup('OTHER',patch);assert.equal(f.c.state.politicaComercialAtiva,false)});
test('officially free requires no paid quote',()=>{const f=setup(IDs[1],patch);f.c.state.lot.precoNumero=0;f.c.createPayment();assert.equal(f.sent.length,1)});
function withQuote(){const f=setup(IDs[1],patch);Object.assign(f.c.state,{feeReady:true,feeRevision:'SYNTH-REV',feeSelection:f.c.quoteSelectionKey(),feeQuotedAt:Date.now(),feePreview:{resumo:{subtotalIngressos:10,totalComprador:12}}});return f;}
test('valid quote sends 10/12 snapshot and revision, not authority',()=>{const f=withQuote();f.c.createPayment();assert.equal(f.sent.length,1);assert.equal(f.sent[0].politicaTotalVisto,12);assert.equal(f.sent[0].politicaSubtotalVisto,10);assert.equal(f.sent[0].politicaRevisaoVista,'SYNTH-REV')});
for(const change of [f=>f.c.state.feeQuotedAt-=31000,f=>f.c.state.feeSelection='OTHER',f=>f.c.state.feeReady=false,f=>f.c.state.feeBusy=true,f=>f.c.state.couponBusy=true])test('stale/changed/unready/busy quote blocked',()=>{const f=withQuote();change(f);f.c.createPayment();assert.equal(f.sent.length,0)});
const quote={sucesso:true,degradado:false,rolloutAtivo:true,revisao:'SYNTH',resumo:{subtotalIngressos:10,taxaCtPercentual:20,taxaCtTotal:2,taxaComprador:2,taxaProdutor:0,adicionaisComprador:0,totalComprador:12,pagadorTaxa:'COMPRADOR'}};
test('helper accepts Tony 10+2=12',()=>assert.equal(helper.validQuote(quote,10),true));
for(const x of [{...quote,degradado:true},{...quote,rolloutAtivo:false},{...quote,resumo:{...quote.resumo,totalComprador:10}}])test('helper rejects fallback inactive or incorrect total',()=>assert.equal(helper.validQuote(x,10),false));
console.log(JSON.stringify({passed,productionWrites:0,networkCalls:0,scope:'frontend quote gate and existing helper; no live/payment proof'}));
