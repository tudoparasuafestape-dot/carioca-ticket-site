import fs from 'node:fs';

function read(path){
  if(!fs.existsSync(path)) throw new Error('Arquivo ausente: '+path);
  return fs.readFileSync(path,'utf8');
}
function requireAll(path,items){
  const c=read(path);
  for(const item of items){
    if(!c.includes(item)) throw new Error(path+' incompleto: '+item);
  }
  if(/window\.(?:alert|confirm|prompt)\s*\(/i.test(c)){
    throw new Error(path+' usa dialogo nativo');
  }
  return c;
}

const master=requireAll('backoffice/politicas-comerciais/index.html',[
  '<title>Políticas Comerciais | Backoffice Master</title>',
  '10% é o padrão da plataforma',
  'COMPRADOR','PRODUTOR','DIVIDIDA',
  'PARCEIRO_CT','PROMOTOR','INFLUENCIADOR','AGENCIA','VENDEDOR','OUTRO',
  'MARGEM_CT','PERCENTUAL_INGRESSOS','PERCENTUAL_TAXA_CT','FIXO_POR_INGRESSO',
  'ctPoliticaComercialMasterListarPROD',
  'ctPoliticaComercialMasterSalvarPROD',
  'ctPoliticaComercialMasterDesativarPROD',
  'ctPoliticaComercialMasterConfigurarAtivacaoPROD',
  'ctPoliticaComercialSimularPROD',
  'movimentouDinheiro===true',
  'validFrom','validUntil','Usar como base','Desativar',
  'APP_DEV',
  'AKfycbyhx6mnGJMsgpGmx-C1r6ZUXbrE66-X6Rkusp1ulVOGcDfJfIs-jgysWp1PfkqB1UC3hg'
]);


for(const s of [
  'id="activation"',
  'id="activationStatus"',
  'state.activation',
  'toggleActivation',
  'Cobrança comercial desligada',
  'preços legados preservados'
]){
  if(!master.includes(s))throw new Error('Backoffice sem rollout comercial seguro: '+s);
}

const producer=requireAll('produtor/politica-comercial/index.html',[
  '<title>Política Comercial | Portal do Produtor</title>',
  'Somente leitura',
  'ctPortalProdutorRestaurarSessaoIsoladaPROD',
  'ctPoliticaComercialProdutorResumoPROD',
  'ctPoliticaComercialSimularPROD',
  'movimentouDinheiro===true',
  'APP_DEV'
]);

const backoffice=read('backoffice/index.html');
if(!backoffice.includes('href="/backoffice/politicas-comerciais/"'))throw new Error('Backoffice sem acesso a politicas comerciais');

const portal=read('produtor/index.html');
for(const s of ['id="commercialPolicyLink"','href="/produtor/politica-comercial/"','el.commercialPolicyLink.classList.toggle']){
  if(!portal.includes(s))throw new Error('Portal produtor sem politica comercial: '+s);
}


const checkout=read('checkout-v2/index.html');
for(const s of [
  'feeReady:false',
  'politicaComercialAtiva:false',
  'if(!state.politicaComercialAtiva)',
  'state.feeReady=false;',
  'state.feeReady=true;',
  'state.feeBusy||',
  'state.feeReady!==true',
  'Confirmando o total',
  'ctPoliticaComercialPreviewPublicoPROD',
  'feeRevision',
  'feeQuotedAt',
  'state.politicaComercialAtiva&&',
  '(Date.now()-state.feeQuotedAt)>30000',
  "state.feeRevision='';",
  'state.feeQuotedAt=0;',
  'politicaRevisaoVista:state.feeRevision',
  'tipoIngressoId:state.type?state.type.id',
  'loteId:state.lot?state.lot.id',
  'campanhaId:',
  'feeAdditionalRow',
  'Encargos comerciais adicionais',
  "el.feePlatform.textContent=money(taxaComprador)"
]){
  if(!checkout.includes(s))throw new Error('Checkout sem gate de transparencia comercial: '+s);
}

// Regressão P0: cotação pendente não pode parecer preço final nem permitir cobrança.
for(const token of [
  'id="feeRetry"',
  "checkoutUiWrite(el.summaryPrice,'Calculando total...')",
  "checkoutUiWrite(el.feeTotal,'Calculando total...')",
  "checkoutUiWrite(el.summaryPrice,'Total indisponível')",
  "checkoutUiWrite(el.feeTotal,'Total indisponível')",
  "el.payButton.disabled=true;",
  "el.payButton.disabled=!catalogLease.isFresh()||(state.politicaComercialAtiva&&state.feeReady!==true)",
  "payload.politicaSubtotalVisto=feeConsent.subtotal",
  "payload.politicaTotalVisto=feeConsent.total",
  "el.feeRetry.onclick=function()"
]){
  if(!checkout.includes(token))throw new Error('Checkout P0 fee UX sem trava: '+token);
}
const eventPage=read('evento-v2/index.html');
for(const token of [
  'function retryInitialHerminho()',
  'initialRetryCount>=1',
  "if(retryInitialHerminho())return;",
  'if(!retryInitialHerminho())showError(',
  'staleMaxAgeMs:600000',
  "eventRpc.ctCheckoutPublicoCarregarEventoPROD(state.eventoId)",
  "precoInicial=String(precoInicial)+' + taxas'",
  "eventRpc.ctEventoPublicoCarregarPROD(state.eventoId)"
]){
  if(!eventPage.includes(token))throw new Error('Evento P0 sem recuperacao/aviso: '+token);
}

const finance=read('produtor/financeiro/index.html');
if(!finance.includes('href="/produtor/politica-comercial/"'))throw new Error('Financeiro produtor sem acesso a politica comercial');

if(master.includes('/transfers')||producer.includes('/transfers'))throw new Error('Politica comercial nao pode transferir dinheiro');
if(master.includes('ctAsaasProvider')||producer.includes('ctAsaasProvider'))throw new Error('UI comercial nao pode acionar provider');


// Regressão offline da retomada do evento após troca de aba: sem tráfego real.
const H='EVT-07112026-TBT-DO-ASTRO-ANIVERSARIO-DE-HERMINHO-F103E26A';
const start=eventPage.indexOf('      function canNavigateHerminhoCheckout(){');
const end=eventPage.indexOf('      function load(availabilityOnly){',start);
if(start<0||end<0)throw new Error('Funções temporais da página não encontradas');
const vm=await import('node:vm');
const assert=await import('node:assert/strict');
function resumeFixture(id){
  const events={window:{},document:{}},timer=[],nodes={};
  for(const name of ['buyHero','buySide','buyMobile','buyClosing']){
    nodes[name]={href:'/checkout-v2/',attributes:{href:'/checkout-v2/'},removeAttribute(k){delete this.attributes[k];if(k==='href')delete this.href;},setAttribute(k,v){this.attributes[k]=v}};
  }
  nodes.startingPrice={textContent:'R$ 20,00 + taxas'};
  nodes.tickets={textContent:'Individual — Antecipado'};
  const doc={visibilityState:'visible',addEventListener(name,fn){events.document[name]=fn}};
  let fresh=true,invalidations=0,loads=0;
  const sandbox={
    state:{eventoId:id,temporalInitialRendered:true,data:{sucesso:true,tipos:[{lotes:[{id:'LOT-LOCAL'}]}]}},
    document:doc, window:{CTAdvanceSales:null,addEventListener(name,fn){events.window[name]=fn}},
    eventLease:{isFresh:()=>fresh,invalidate(){fresh=false;invalidations++}},
    eventNotice:{textContent:''},eventRetry:{hidden:false},
    $:name=>nodes[name],tr:x=>x,queryCampanha:()=>'',
    loadRunning:false,eventRefreshWanted:false,eventRefreshTimer:null,eventRequestStarted:0,
    performance:{now:()=>1000},
    setTimeout(fn,ms){const t={fn,ms};timer.push(t);return t},
    clearTimeout(t){const i=timer.indexOf(t);if(i>=0)timer.splice(i,1)},
    load(availabilityOnly){assert.equal(availabilityOnly,true);loads++}
  };
  vm.runInNewContext(eventPage.slice(start,end),sandbox,{timeout:1000});
  return{sandbox,nodes,doc,events,timer,setFresh(v){fresh=v},stats(){return{loads,invalidations}}};
}
const fx=resumeFixture(H);
fx.doc.visibilityState='hidden';fx.events.document.visibilitychange();
assert.equal(fx.stats().invalidations,1,'a primeira suspensão invalida a autorização');
assert.equal(fx.nodes.startingPrice.textContent,'R$ 20,00 + taxas','a vitrine informativa não vira Consulte');
assert.equal(fx.nodes.tickets.textContent,'Individual — Antecipado');
for(const name of ['buyHero','buySide','buyMobile','buyClosing']){
  assert.equal(fx.nodes[name].attributes['aria-disabled'],undefined,'navegação ao checkout não é venda');
  assert.equal(fx.nodes[name].href,'/checkout-v2/?evento='+encodeURIComponent(H),'checkout continua com gate de oferta e preço');
}
assert.match(fx.sandbox.eventNotice.textContent,/confirmados no checkout seguro/);
assert(eventPage.includes('if(canNavigateHerminhoCheckout()){scheduleEventRefresh();return;}'),
  'guarda de eventos permite somente a navegação quando há um catálogo previamente válido');
fx.doc.visibilityState='visible';fx.events.document.visibilitychange();fx.events.window.focus();
assert.equal(fx.stats().invalidations,1,'focus duplicado não invalida novamente');
assert.equal(fx.timer.length,1,'um único refresco pendente');
assert.equal(fx.timer[0].ms,50,'sem espera artificial de 5 segundos');
fx.timer.shift().fn();assert.equal(fx.stats().loads,1,'reconsulta catálogo ao retornar');
fx.setFresh(true);fx.events.window.focus();
assert.equal(fx.stats().invalidations,1,'oferta recém validada preservada no focus');
assert.equal(fx.timer.length,0,'sem segunda consulta em foco duplicado');

const noTickets=resumeFixture(H);
noTickets.sandbox.state.data={sucesso:true,tipos:[]};
noTickets.doc.visibilityState='hidden';noTickets.events.document.visibilitychange();
for(const name of ['buyHero','buySide','buyMobile','buyClosing']){
  assert.equal(noTickets.nodes[name].attributes['aria-disabled'],'true','sem lotes a página não deve oferecer navegação');
  assert.equal(noTickets.nodes[name].href,undefined,'sem lote nenhum CTA de compra deve existir');
}
const notValidated=resumeFixture(H);
notValidated.sandbox.state.temporalInitialRendered=false;
notValidated.doc.visibilityState='hidden';notValidated.events.document.visibilitychange();
for(const name of ['buyHero','buySide','buyMobile','buyClosing']){
  assert.equal(notValidated.nodes[name].href,undefined,'a primeira leitura não autorizada não abre checkout');
}
assert(eventPage.includes("event.preventDefault();staleEventOffer();scheduleEventRefresh();"),
  'outros eventos e contexto sem lote mantêm bloqueio temporal');
assert(!eventPage.includes('ctCheckoutPixPublicoIniciarPROD('),
  'página de evento nunca cria pagamento');

const legacy=resumeFixture('EVT-SYNTHETIC-LEGACY');
legacy.events.window.focus();
assert.equal(legacy.stats().invalidations,1,'outras páginas preservam revalidação anterior');
assert.equal(legacy.timer.length,1);
assert.equal(legacy.timer[0].ms,4000,'intervalo legado preservado fora de Herminho');

console.log('CT_SITE_POLITICA_COMERCIAL_CONTRACT_OK');
