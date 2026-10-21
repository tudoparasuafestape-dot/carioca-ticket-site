'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,Storage,PENDING,START}=require('./fixtures/checkout-temporal-dom.cjs');
const EVENT='EVT-LOCAL-TEMPORAL';
const iso=ms=>new Date(ms).toISOString();
function response({at=START,delta=15000,end=START+3600000,current='LOT-0',blocked=false,reason=null,closed=false,unlimited=false,legacyLots=false}={}){
 const a={id:'LOT-0',nome:'Lote 1',ordem:1,statusVenda:current==='LOT-0'?'ATUAL':'ENCERRADO',motivoEncerramento:current==='LOT-0'?null:'ESGOTADO',antecipado:false,disponivelParaCompra:current==='LOT-0'&&!blocked,motivoIndisponibilidade:current==='LOT-0'?reason:null,quantidadeLimitada:!unlimited,disponiveis:unlimited?null:(blocked?0:5),precoNumero:25,preco:'R$ 25,00'};
 const b={...a,id:'LOT-1',nome:'Lote 2',ordem:2,statusVenda:current==='LOT-1'?'ATUAL':'EM_BREVE',motivoEncerramento:null,antecipado:current==='LOT-1',disponivelParaCompra:current==='LOT-1'&&!blocked,motivoIndisponibilidade:null,precoNumero:30,preco:'R$ 30,00'};
 const chosen=current==='LOT-0'?a:b;
 const r={sucesso:true,evento:{id:EVENT,nome:'Evento temporal local',temporal:{state:'TEMPORAL_V1',inicioEm:iso(START-1000),fimEm:iso(end),fusoHorario:'America/Recife',temporalVersion:1}},visual:{},identidadeCliente:{emailObrigatorio:false},tipos:blocked||closed?[]:[{id:'TYPE-0',nome:'Individual',capacidadePorVenda:1,lotes:[{...chosen}]}],temporalVersion:1,temporalEvaluatedAt:iso(at),serverNow:iso(at),nextTransitionAt:iso(Math.min(at+delta,end)),validUntil:iso(Math.min(at+delta,end)),lotesVenda:{versao:1,avaliadoEm:iso(at),tipos:[{tipoId:'TYPE-0',tipoNome:'Individual',loteAtualId:closed?null:current,lotes:closed?[{...a,statusVenda:'ENCERRADO',disponivelParaCompra:false}, {...b,statusVenda:'EM_BREVE',disponivelParaCompra:false}]:[a,b]}]}};
 if(legacyLots)delete r.lotesVenda;
 return r;
}
function setup(route,options={}){return fixture({route,eventId:EVENT,catalog:()=>response(),...options});}
for(const route of ['checkout/index.html','checkout-v2/index.html']){
 test(route+': current, closed and upcoming lots are display-only; selection admits current only',()=>{
  const f=setup(route);assert(f.visible('temporalLots'));assert.match(f.element('temporalLotList').textContent,/Lote atual/);assert.match(f.element('temporalLotList').textContent,/Em breve/);
  f.select();assert.equal(f.element('payButton').disabled,false);f.change('lotSelect','LOT-1');f.click('payButton');assert.equal(f.state.payments.length,0);f.finish();
 });
 test(route+': pending reservations block without advertising successor',()=>{
  const f=setup(route,{catalog:()=>response({blocked:true,reason:'RESERVAS_PENDENTES'}),allowClosed:true});assert.match(f.element('temporalLotList').textContent,/Aguardando liberação/);assert.match(f.element('temporalLotList').textContent,/Em breve/);assert(f.element('payButton').disabled);f.click('payButton');assert.equal(f.state.payments.length,0);f.finish();
 });
 test(route+': exact expiry disables immediately; late refresh cannot authorize an old selection',()=>{
  const f=setup(route,{catalog:(_,n)=>n===1?response():PENDING});f.select();f.clock.tick(14999);assert.equal(f.element('payButton').disabled,false);f.clock.tick(1);assert(f.element('payButton').disabled);assert.equal(f.state.catalogs.length,2);f.click('payButton');assert.equal(f.state.payments.length,0);
  f.pending('ctCheckoutPublicoCarregarEventoPROD')[0].resolve(response({at:START+15000,current:'LOT-1'}));assert.equal(f.element('typeSelect').value,'');assert(f.element('payButton').disabled);assert.match(f.element('temporalLotList').textContent,/Antecipado/);f.finish();
 });
 test(route+': unchanged refreshed lot preserves buyer input and never auto-submits',()=>{
  const f=setup(route,{catalog:(_,n)=>response({at:START+(n-1)*15000})});f.select();f.element('buyerName').value='Pessoa Local';f.clock.tick(15000);assert.equal(f.element('buyerName').value,'Pessoa Local');assert.equal(f.element('lotSelect').value,'LOT-0');assert.equal(f.state.payments.length,0);f.finish();
 });
 test(route+': unlimited lot has no zero-stock inference',()=>{
  const f=setup(route,{catalog:()=>response({unlimited:true})});f.select();assert.equal(f.element('payButton').disabled,false);assert.match(f.element('temporalLotList').textContent,/Sem limite/);f.finish();
 });
 test(route+': malformed or partial authority and missing helper fail closed',()=>{
  for(const mutate of [r=>delete r.validUntil,r=>r.lotesVenda.versao=9,r=>r.lotesVenda.tipos[0].lotes[1].disponivelParaCompra=true]){
   const f=setup(route,{catalog:()=>{const r=response();mutate(r);return r;},allowClosed:true});assert(f.visible('closedPanel'));f.click('payButton');assert.equal(f.state.payments.length,0);f.finish();
  }
  const f=setup(route,{missingHelper:true,allowClosed:true});assert(f.visible('closedPanel'));f.click('payButton');assert.equal(f.state.payments.length,0);f.finish();
 });
 test(route+': canonical temporal envelope without activation preserves legacy lot contract',()=>{
  const f=setup(route,{catalog:()=>response({legacyLots:true})});f.select();assert.equal(f.element('payButton').disabled,false);f.finish();
 });
 test(route+': failure at event end blocks new payment; retry cannot reuse stale availability',()=>{
  const f=setup(route,{catalog:(_,n)=>n===1?response({end:START+1000}):{sucesso:false,codigo:'EVENTO_ENCERRADO',temporario:false,mensagem:'Este evento já terminou.'}});f.select();f.clock.tick(1000);assert(f.visible('closedPanel'));assert(f.element('payButton').disabled);f.click('payButton');assert.equal(f.state.payments.length,0);f.finish();
 });
 test(route+': saved paid obligation recovers even when public catalog is ended',()=>{
  const store=new Storage();store.setItem('CT_CHECKOUT_RECOVERY_'+EVENT,JSON.stringify({pedidoId:'PED-LOCAL-PAID',token:'LOCAL-ONLY'}));
  const order={sucesso:true,encontrado:true,pedido:{pedidoId:'PED-LOCAL-PAID',eventoId:EVENT,status:'PAGO',expiraEm:iso(START+600000)},pagamento:{forma:'PIX',pix:{}},ingressoEmitido:false,ingressos:[]};
  const f=setup(route,{localStorage:store,catalog:()=>({sucesso:false,codigo:'EVENTO_ENCERRADO',mensagem:'Este evento já terminou.'}),recover:()=>order,allowClosed:true});
  assert.equal(f.state.consults.length,1);assert(f.visible('pixPanel'));assert(!f.visible('closedPanel'));f.clock.tick(16000);assert.equal(f.state.payments.length,0);assert.equal(f.state.catalogs.length,1);assert(f.state.statuses.length>0);assert(store.getItem('CT_CHECKOUT_RECOVERY_'+EVENT));f.finish();
 });
 test(route+': navigation invalidates pending responses; resume obtains new snapshot',()=>{
  const f=setup(route,{catalog:(_,n)=>n===1?response():PENDING});f.select();f.clock.tick(15000);const old=f.pending('ctCheckoutPublicoCarregarEventoPROD')[0];f.dispatch('pagehide');f.dispatch('pageshow');assert.equal(f.state.catalogs.length,3);old.resolve(response({at:START+15000}));assert(f.element('payButton').disabled);f.finish();
 });
 test(route+': lost first payment response preserves an explicit exact-intent recovery after cutoff',()=>{
  const f=setup(route,{catalog:(_,n)=>n===1?response({end:START+1000}):{sucesso:false,codigo:'EVENTO_ENCERRADO',mensagem:'Este evento já terminou.'},pay:()=>PENDING});
  f.select();f.settle();f.click('payButton');assert.equal(f.state.payments.length,1);const first=structuredClone(f.state.payments[0]);
  f.clock.tick(1000);f.pending('ctCheckoutPixPublicoIniciarPROD')[0].reject(new Error('LOCAL_RESPONSE_LOST'));f.clock.tick(0);
  assert(f.visible('closedPanel'));assert.equal(f.element('temporalRecover').hidden,false);assert(f.element('payButton').disabled);
  f.element('buyerName').value='Changed local form';f.element('quantity').value='3';f.click('temporalRecover');
  assert.equal(f.state.payments.length,2);assert.deepEqual(f.state.payments[1],first,'Retry is frozen payload and same key, never new form values');
  f.click('temporalRecover');assert.equal(f.state.payments.length,2,'Repeated recovery click is deduplicated');f.finish();
 });
 test(route+': first-load pagehide/pageshow obtains a fresh catalog and ignores old response',()=>{
  const f=setup(route,{catalog:()=>PENDING});const first=f.pending('ctCheckoutPublicoCarregarEventoPROD')[0];
  f.dispatch('pagehide');f.dispatch('pageshow');assert.equal(f.state.catalogs.length,2);
  first.resolve(response());assert.equal(f.element('typeSelect').querySelectorAll('option').length,1);
  f.pending('ctCheckoutPublicoCarregarEventoPROD')[0].resolve(response());assert(f.element('typeSelect').querySelectorAll('option').length>1);f.finish();
 });
 test(route+': recovery is deduplicated; invalidated old response cannot downgrade PAGO',()=>{
  const store=new Storage();store.setItem('CT_CHECKOUT_RECOVERY_'+EVENT,JSON.stringify({pedidoId:'PED-LOCAL-PAID',token:'LOCAL-ONLY'}));
  const f=setup(route,{localStorage:store,catalog:()=>response(),recover:()=>PENDING});const first=f.pending('ctCheckoutPixPublicoConsultarPROD')[0];
  f.select();f.click('payButton');assert.equal(f.state.payments.length,0,'Pending recovery blocks a new payment');f.clock.tick(15000);assert.equal(f.state.consults.length,1);assert.equal(f.state.catalogs.length,1);
  f.dispatch('pagehide');f.dispatch('pageshow');f.clock.tick(0);
  // The fixed response in this fixture is expired, so recovery proceeds independently through the closed-catalog path.
  assert.equal(f.state.consults.length,2);
  const order=status=>({sucesso:true,encontrado:true,pedido:{pedidoId:'PED-LOCAL-PAID',eventoId:EVENT,status,expiraEm:iso(START+600000)},pagamento:{forma:'PIX',pix:{}},ingressoEmitido:false,ingressos:[]});
  f.pending('ctCheckoutPixPublicoConsultarPROD')[1].resolve(order('PAGO'));
  assert.match(f.element('pixStatus').textContent,/Pagamento confirmado/);first.resolve(order('AGUARDANDO_PAGAMENTO'));
  assert.match(f.element('pixStatus').textContent,/Pagamento confirmado/);f.finish();
 });
 test(route+': unknown/malformed event temporal blocks cannot masquerade as legacy',()=>{
  for(const temporal of [{state:'TEMPORAL_V2'},{state:'LEGADO_SEM_FIM',fimEm:'2026-01-01T00:00:00Z'}]){
   const f=setup(route,{catalog:()=>{const r=response({legacyLots:true});for(const key of ['temporalVersion','temporalEvaluatedAt','serverNow','nextTransitionAt','validUntil'])delete r[key];r.evento.temporal=temporal;return r;},allowClosed:true});
   assert(f.visible('closedPanel'));f.click('payButton');assert.equal(f.state.payments.length,0);f.finish();
  }
 });

 test(route+': verified pre-commit price rejection permits a newly reviewed temporal ERA quote',()=>{
  const ERA='EVT-23112026-ERA-BEAUTY-EAC4B673';
  const f=fixture({route,eventId:ERA,catalog:()=>{const r=response();r.evento.id=ERA;r.politicaComercial={ativa:true};return r;},
   preview:(p,n)=>({sucesso:true,degradado:false,rolloutAtivo:true,revisao:'LOCAL-REV-'+n,resumo:{subtotalIngressos:p.precoUnitario*p.quantidade,taxaCtPercentual:10,taxaCtTotal:p.precoUnitario*p.quantidade*.1,taxaComprador:p.precoUnitario*p.quantidade*.1,taxaProdutor:0,adicionaisComprador:0,totalComprador:p.precoUnitario*p.quantidade*1.1,pagadorTaxa:'COMPRADOR'}}),
   pay:(_p,n)=>{if(n===1)throw new Error('CT_POLITICA_COMERCIAL_PRECO_ATUALIZADO');return {sucesso:false};}});
  f.select();f.settle();f.click('payButton');assert.equal(f.state.payments.length,1);f.settle();
  assert.equal(f.element('temporalRecover').hidden,true);assert.equal(f.element('payButton').disabled,false);f.closeModal();f.click('payButton');
  assert.equal(f.state.payments.length,2);assert.equal(f.state.payments[1].idempotenciaChave,f.state.payments[0].idempotenciaChave);assert.notEqual(f.state.payments[1].politicaRevisaoVista,f.state.payments[0].politicaRevisaoVista);f.finish();
 });

 test(route+': verified lot admission race allows deliberate successor selection with the same key',()=>{
  const f=setup(route,{catalog:(_,n)=>response({current:n===1?'LOT-0':'LOT-1'}),pay:(_p,n)=>{if(n===1)throw new Error('CT_CHECKOUT_PIX_PUBLICO_LOTE_SEM_DISPONIBILIDADE');return {sucesso:false};}});
  f.select();f.settle();f.click('payButton');assert.equal(f.state.payments.length,1);f.settle();
  assert.equal(f.element('temporalRecover').hidden,true);assert.equal(f.element('typeSelect').value,'');assert(f.element('payButton').disabled);
  f.closeModal();f.change('typeSelect','TYPE-0');f.change('lotSelect','LOT-1');f.settle();assert.equal(f.element('payButton').disabled,false);
  assert.equal(f.state.payments.length,1,'A fresh successor still requires an explicit user payment click');f.click('payButton');
  assert.equal(f.state.payments.length,2);assert.equal(f.state.payments[1].loteId,'LOT-1');assert.equal(f.state.payments[1].idempotenciaChave,f.state.payments[0].idempotenciaChave);f.finish();
 });
 test(route+': audited normalization rejection permits corrected buyer data; unknown error stays frozen',()=>{
  const f=setup(route,{pay:(_p,n)=>{if(n===1)throw new Error('Error: CT_CHECKOUT_PIX_PUBLICO_DOCUMENTO_INVALIDO');throw new Error('UNVERIFIED_PROVIDER_OUTCOME');}});
  f.select();f.settle();f.click('payButton');f.settle();assert.equal(f.element('temporalRecover').hidden,true);assert.equal(f.element('payButton').disabled,false);
  f.closeModal();f.element('buyerName').value='Pessoa Corrigida';f.click('payButton');f.settle();
  assert.equal(f.state.payments.length,2);assert.equal(f.state.payments[1].compradorNome,'Pessoa Corrigida');assert.equal(f.element('temporalRecover').hidden,false);assert(f.element('payButton').disabled);f.finish();
 });

}
