'use strict';
// Offline deterministic controller tests. Executes the shipped controller and
// clock/lot modules in a minimal DOM. No browser or network is used or claimed.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const EPOCH=Date.parse('2030-01-01T00:00:00Z');
const iso=n=>new Date(EPOCH+n).toISOString();
const ids=['buyHero','buySide','buyMobile','buyClosing'];
class Node {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.attributes={};this.children=[];this._text='';this._html='';this.hidden=false;this.disabled=false;this.dataset={};this.listeners={};this.classes=new Set();this.classList={add:(...v)=>v.forEach(x=>this.classes.add(x)),remove:(...v)=>v.forEach(x=>this.classes.delete(x)),contains:v=>this.classes.has(v),toggle:(v,on)=>{on=on===undefined?!this.classes.has(v):!!on;on?this.classes.add(v):this.classes.delete(v);return on;}};}
  set className(value){this.classes=new Set(String(value).split(/\s+/).filter(Boolean));}get className(){return [...this.classes].join(' ');}
  set textContent(v){this._text=String(v);this.children=[];this._html='';}get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
  set innerHTML(v){this._html=String(v);this._text='';this.children=[];}get innerHTML(){return this._html;}
  set href(v){this.attributes.href=String(v);}get href(){return this.attributes.href||'';}
  setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k]??null;}removeAttribute(k){delete this.attributes[k];}
  appendChild(node){node.parentElement=this;this.children.push(node);return node;}replaceChildren(...nodes){this._text='';this._html='';this.children=[];nodes.forEach(n=>this.appendChild(n));}
  addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}dispatch(k){const e={type:k,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;}};for(const fn of this.listeners[k]||[]){fn(e);if(e.stopped)break;}return e;}
  querySelector(){return new Node();}querySelectorAll(){return [];}closest(){return this.parentElement||this;}focus(){}remove(){}select(){}setSelectionRange(){}
}
function setup(route,params={}){
  let mono=0,nextTimer=0,locale='pt-BR';
  const timers=new Map(),calls=[],nodes=new Map(),winListeners={},docListeners={},storage=new Map();
  const html=fs.readFileSync(path.join(root,route,'index.html'),'utf8');
  const controller=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('var state='));
  for(const m of html.matchAll(/id="([^"]+)"/g)){const node=new Node();node.id=m[1];node.parentElement=new Node();node.previousElementSibling=new Node();nodes.set(node.id,node);}
  ['app','mobileBuy','errorBox','retryEventLoad'].forEach(id=>nodes.get(id).classList.add('hidden'));
  const title=new Node('title'),journey=new Node(),guide=new Node();journey.parentElement=guide;
  const document={documentElement:{lang:locale},visibilityState:'visible',title:'',activeElement:null,body:new Node(),
    getElementById:id=>nodes.get(id),createElement:tag=>new Node(tag),
    querySelector:s=>s==='title'?title:s==='.journey'?journey:null,
    addEventListener:(k,fn)=>(docListeners[k]??=[]).push(fn)};
  function runner(success,failure){return {withSuccessHandler:fn=>runner(fn,failure),withFailureHandler:fn=>runner(success,fn),ctEventoPublicoCarregarPROD:id=>calls.push({method:'read',id,success,failure}),ctCuponsPublicoRegistrarAcessoSeguroPROD:args=>calls.push({method:'campaign',args,success,failure})};}
  const context={window:null,document,performance:{now:()=>mono},Date,Intl,Number,Object,Array,String,Math,JSON,Map,Set,Promise,URL,
    console:{warn(){}},navigator:{onLine:true},location:{origin:'https://example.invalid',pathname:'/'+route+'/'},
    setTimeout:(fn,delay)=>{const id=++nextTimer;timers.set(id,{fn,at:mono+delay});return id;},clearTimeout:id=>timers.delete(id),
    addEventListener:(k,fn)=>(winListeners[k]??=[]).push(fn),sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    crypto:{randomUUID:()=> 'synthetic-session'},google:{script:{run:runner(),url:{getLocation:fn=>fn({parameter:{evento:'EVENT-TEST',...params}})}}},
    CTPublicI18n:{getLocale:()=>locale},CTEventI18n:{text:s=>s,has:()=>true,apply(){}}};
  context.window=context;
  vm.createContext(context);
  for(const file of ['public-catalog-clock.js','public-lot-status.js','advance-sales.js'])vm.runInContext(fs.readFileSync(path.join(root,'assets',file),'utf8'),context,{filename:file});
  vm.runInContext(controller,context,{filename:route+'/controller.js'});
  return {nodes,calls,context,timers,reads:()=>calls.filter(c=>c.method==='read'),
    reply(n,data){this.reads()[n].success(data);},fail(n){this.reads()[n].failure({code:'CT_PUBLIC_RPC_TIMEOUT',elapsedMs:45000});},
    dispatch(k){for(const fn of winListeners[k]||[])fn({type:k});},
    language(value){locale=value;document.documentElement.lang=value;for(const fn of docListeners['ct:public-language']||[])fn();},
    advance(ms,run=true){const until=mono+ms;if(run){let count=0;while(true){const due=[...timers].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;assert(++count<100,'no timer churn');timers.delete(due[0]);mono=due[1].at;due[1].fn();}}mono=until;},
    allowed(){for(const id of ids){assert.equal(nodes.get(id).getAttribute('aria-disabled'),null,id+' enabled');assert.match(nodes.get(id).href,/checkout/);assert.equal(nodes.get(id).hidden,false);}},
    blocked(){for(const id of ids){assert.equal(nodes.get(id).getAttribute('aria-disabled'),'true',id+' blocked');assert.equal(nodes.get(id).href,'');}}};
}
function fixture({now=0,ttl=30000,end=3600000,projection=true,purchasable=true,current='L2'}={}){
  const result={sucesso:true,temporalVersion:1,serverNow:iso(now),temporalEvaluatedAt:iso(now),nextTransitionAt:null,validUntil:iso(now+ttl),
    evento:{id:'EVENT-TEST',nome:'Evento de teste',data:'01/01/2030',dataFim:'31/12/1999',temporal:{state:'TEMPORAL_V1',temporalVersion:1,inicioEm:iso(-3600000),fimEm:iso(end),fusoHorario:'America/Recife'}},visual:{descricaoCurta:'Fixture isolada'},menorPreco:'R$ 20,00',
    tipos:purchasable?[{id:'T1',nome:'Individual',lotes:[{id:current,nome:'Lote atual',preco:'R$ 20,00',precoNumero:20}]}]:[]};
  if(projection)result.lotesVenda={versao:1,avaliadoEm:iso(now),tipos:[{tipoId:'T1',tipoNome:'Individual',loteAtualId:current,lotes:[
    {id:'L1',nome:'Primeiro <script>bad()</script>',statusVenda:'ENCERRADO',disponivelParaCompra:false,quantidadeLimitada:true,disponiveis:0,preco:'R$ 10,00'},
    {id:current,nome:'Lote atual',statusVenda:'ATUAL',disponivelParaCompra:purchasable,motivoIndisponibilidade:purchasable?'':'RESERVAS_PENDENTES',antecipado:true,quantidadeLimitada:true,disponiveis:purchasable?12:0,preco:'R$ 20,00'},
    {id:'L3',nome:'Próximo lote',statusVenda:'EM_BREVE',disponivelParaCompra:false,quantidadeLimitada:false,disponiveis:null,preco:'R$ 30,00'},
    {id:'L4',nome:'Lote pausado',statusVenda:'PAUSADO',disponivelParaCompra:false,quantidadeLimitada:false,disponiveis:null,preco:'R$ 40,00'}]}]};
  return result;
}
function legacy(){const data=fixture({projection:false});for(const k of ['temporalVersion','serverNow','temporalEvaluatedAt','nextTransitionAt','validUntil'])delete data[k];delete data.evento.temporal;return data;}
for(const route of ['evento','evento-v2']){
  test(route+': Samba exception survives temporal expiry and failed refresh',()=>{const s=setup(route,{evento:'EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD'});s.reply(0,fixture({ttl:1000}));assert.equal(s.nodes.get('tickets').textContent,'Evento encerrado.');for(const id of ids)assert.equal(s.nodes.get(id).href,'#tickets');s.advance(1000);assert.equal(s.nodes.get('tickets').textContent,'Evento encerrado.');s.fail(1);assert.equal(s.nodes.get('tickets').textContent,'Evento encerrado.');s.language('en-US');assert.equal(s.nodes.get('tickets').textContent,'Evento encerrado.');});
  test(route+': legacy layout and display dates remain unchanged',()=>{const s=setup(route);s.reply(0,legacy());s.allowed();assert.match(s.nodes.get('tickets').innerHTML,/class="ticket"/);s.advance(3600000);s.dispatch('focus');assert.equal(s.reads().length,1);});
  test(route+': complete projected states use safe text and localize',()=>{const s=setup(route);s.reply(0,fixture());s.allowed();const t=s.nodes.get('tickets');assert.match(t.textContent,/<script>bad\(\)<\/script>/);assert.equal(t.innerHTML,'');for(const text of ['Encerrado','Lote atual','Em breve','Pausado','Antecipado'])assert(t.textContent.includes(text));s.language('en-US');for(const text of ['Closed','Current lot','Coming soon','Paused','Opened early'])assert(t.textContent.includes(text));assert.equal(s.reads().length,1);});
  test(route+': current lot reserved and future lot never allow purchase',()=>{const s=setup(route);s.reply(0,fixture({purchasable:false}));s.blocked();assert.match(s.nodes.get('tickets').textContent,/Aguardando liberação de reservas/);assert.equal(s.nodes.get('buyHero').dispatch('click').defaultPrevented,true);assert.equal(s.reads().length,1);});
  test(route+': expiry blocks first, deduplicates refresh and rejects old replies',()=>{const s=setup(route);const first=fixture({ttl:1000});s.reply(0,first);s.allowed();s.advance(1000);s.blocked();assert.equal(s.reads().length,2);s.dispatch('focus');s.dispatch('pageshow');s.reply(0,first);assert.equal(s.reads().length,2);s.blocked();s.reply(1,fixture({now:1000,current:'L5'}));s.allowed();assert(s.nodes.get('tickets').children[0].children.some(n=>n.dataset.lotId==='L5'));});
  test(route+': suspended timer cannot bypass click or pageshow guards',()=>{const s=setup(route);s.reply(0,fixture({ttl:1000}));s.advance(1000,false);assert.equal(s.nodes.get('buyHero').dispatch('click').defaultPrevented,true);s.blocked();s.dispatch('pageshow');assert.equal(s.reads().length,2);});
  test(route+': language rerender cannot extend response lifetime',()=>{const s=setup(route);s.reply(0,fixture({ttl:1000}));s.advance(1000,false);s.language('es');s.blocked();assert.equal(s.reads().length,1);s.dispatch('focus');assert.equal(s.reads().length,2);});
  test(route+': request latency cannot extend an expired reply',()=>{const s=setup(route);s.advance(1001);s.reply(0,fixture({ttl:1000}));s.blocked();assert.equal(s.nodes.get('retryTemporalEventLoad').hidden,false);assert.equal(s.timers.size,0);});
  test(route+': canonical exact end hides purchase UI and translates',()=>{const s=setup(route);s.reply(0,fixture({end:1000}));s.advance(999);s.allowed();s.advance(1);s.blocked();for(const id of ids)assert.equal(s.nodes.get(id).hidden,true);assert.match(s.nodes.get('eventSalesStatus').textContent,/já terminou/);s.language('en-US');assert.equal(s.nodes.get('eventSalesStatus').textContent,'This event has ended.');assert(s.nodes.get('app').classList.contains('ct-temporal-ended'));s.reply(1,fixture({now:1000,end:3600000}));s.allowed();assert(!s.nodes.get('app').classList.contains('ct-temporal-ended'));});
  test(route+': ended gate after canonical cutoff keeps localized reference',()=>{const s=setup(route);s.reply(0,fixture({end:1000}));s.advance(1000);s.reply(1,{sucesso:false,codigo:'EVENTO_ENCERRADO',temporario:false,mensagem:'Evento encerrado.'});s.blocked();assert.equal(s.nodes.get('app').classList.contains('hidden'),false);s.language('es');assert.equal(s.nodes.get('eventSalesStatus').textContent,'Este evento ya terminó.');assert.equal(s.nodes.get('retryTemporalEventLoad').hidden,true);});
  test(route+': partial envelopes and malformed canonical end fail closed',()=>{for(const edit of [r=>delete r.validUntil,r=>r.evento.temporal.fimEm='invalid',r=>{delete r.temporalVersion;delete r.serverNow;delete r.temporalEvaluatedAt;delete r.nextTransitionAt;delete r.validUntil;},r=>r.lotesVenda.versao=99]){const s=setup(route),r=fixture();edit(r);s.reply(0,r);s.blocked();assert.equal(s.nodes.get('retryTemporalEventLoad').hidden,false);}});
  test(route+': temporal envelope supports legacy lot layout',()=>{const s=setup(route);s.reply(0,fixture({projection:false,ttl:1000}));s.allowed();assert.match(s.nodes.get('tickets').innerHTML,/class="ticket"/);s.advance(1000);s.blocked();assert.equal(s.reads().length,2);});
  test(route+': refresh failure retains reference info and offers one retry',()=>{const s=setup(route);s.reply(0,fixture({ttl:1000}));s.advance(1000);s.fail(1);s.blocked();assert.equal(s.nodes.get('app').classList.contains('hidden'),false);assert.equal(s.nodes.get('retryTemporalEventLoad').hidden,false);s.nodes.get('retryTemporalEventLoad').dispatch('click');s.nodes.get('retryTemporalEventLoad').dispatch('click');assert.equal(s.reads().length,3);s.reply(2,fixture({now:1000}));s.allowed();});
  test(route+': server temporario retries but private gate stays terminal',()=>{for(const temporario of [true,false]){const s=setup(route);s.reply(0,{sucesso:false,temporario,mensagem:'Acesse pelo convite individual.'});assert.equal(s.nodes.get('retryEventLoad').classList.contains('hidden'),!temporario);assert.equal(s.nodes.get('app').classList.contains('hidden'),true);}});
  test(route+': terminal gate during refresh cannot be resurrected by language',()=>{const s=setup(route);s.reply(0,fixture({ttl:1000}));s.advance(1000);s.reply(1,{sucesso:false,temporario:false,mensagem:'Acesse pelo convite individual.'});s.language('en-US');assert.equal(s.nodes.get('app').classList.contains('hidden'),true);});
}
test('evento-v2: campaign/seller sessions survive read-only revalidation',()=>{const s=setup('evento-v2',{cupom:'WELCOME',src:'email',seller:'synthetic-seller',refcode:'REF-1'});s.reply(0,fixture({ttl:1000}));const before=s.nodes.get('buyHero').href;assert.match(before,/checkout-v2/);for(const value of ['cupom=WELCOME','src=EMAIL','csid=CS-synthetic-session','seller=synthetic-seller','refcode=REF-1'])assert(before.includes(value));assert.equal(s.calls.filter(c=>c.method==='campaign').length,1);s.advance(1000);s.reply(1,fixture({now:1000}));assert.equal(s.nodes.get('buyHero').href,before);assert.equal(s.calls.filter(c=>c.method==='campaign').length,1);});
