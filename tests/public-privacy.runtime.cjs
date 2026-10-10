'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function events(obj={}){const listeners={};obj.addEventListener=(t,f)=>(listeners[t]||=[]).push(f);obj.dispatchEvent=e=>(listeners[e.type]||[]).forEach(f=>f(e));return obj;}
function storage(seed={}){const data={...seed};return {data,getItem:k=>Object.hasOwn(data,k)?data[k]:null,setItem:(k,v)=>{data[k]=String(v)},removeItem:k=>{delete data[k]}};}
function element(tag){const n=events({tagName:tag.toUpperCase(),children:[],dataset:{},style:{},hidden:false,attributes:{},textContent:'',isConnected:true});n.classList={add(){},remove(){},contains:()=>false};n.setAttribute=(k,v)=>n.attributes[k]=String(v);n.getAttribute=k=>n.attributes[k]??null;n.removeAttribute=k=>delete n.attributes[k];n.appendChild=c=>{n.children.push(c);c.parentNode=n;return c};n.insertBefore=(child,before)=>{const i=n.children.indexOf(before);if(i<0)n.children.push(child);else n.children.splice(i,0,child);child.parentNode=n;return child};n.append=(...cs)=>cs.forEach(n.appendChild);n.replaceChildren=(...cs)=>{n.children=[];n.append(...cs)};n.remove=()=>{if(n.parentNode)n.parentNode.children=n.parentNode.children.filter(c=>c!==n)};n.focus=()=>{};n.closest=()=>null;n.contains=t=>n===t||n.children.some(c=>c.contains&&c.contains(t));n.querySelector=sel=>n.children.flatMap(c=>[c,...desc(c)]).find(c=>sel==='button'&&c.tagName==='BUTTON');n.showModal=()=>{n.open=true};n.close=()=>{n.open=false;n.dispatchEvent({type:'close'})};return n;}
function desc(n){return n.children.flatMap(c=>[c,...desc(c)])}
function env({choice,pathname='/',explicitRecovery=true,denied=false,complete=true,scoped=true}={}){
 const local=storage(choice?{'ct-public-privacy-v1':JSON.stringify(choice)}:{}),session=storage(),timers=[],sent=[],replaces=[];
 const body=element('body');const document=events({body,readyState:complete?'complete':'loading',documentElement:{clientWidth:390},currentScript:{getAttribute:k=>k==='data-ct-public-privacy'&&scoped?'required':null},referrer:'https://search.example/',createElement:tag=>{const el=element(tag);el.submit=()=>sent.push(el);return el}});
 document.getElementById=id=>desc(body).find(n=>n.id===id)||(id==='retryEventLoad'&&explicitRecovery?{}:id==='errorBox'?{classList:{contains:()=>false}}:id==='errorText'?{textContent:'Não foi possível carregar o evento agora'}:null);
 document.querySelector=()=>null;
 document.querySelectorAll=()=>desc(body).filter(n=>n.dataset.privacyCopy);
 const window=events({localStorage:local,sessionStorage:session,innerWidth:390,setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){},crypto:{randomUUID:()=> 'abcdef123456'},requestIdleCallback:fn=>timers.push(fn),CustomEvent:function(type,args){return {type,...args}}});
 const location={pathname,search:'?evento=FIXTURE&src=CANARIO',hostname:'fixture.local',replace:v=>replaces.push(v)};
 const sandbox={window,document,location,localStorage:local,sessionStorage:session,URL,URLSearchParams,Date,Math,Uint32Array,Array,CustomEvent:window.CustomEvent,setTimeout:window.setTimeout,clearTimeout:window.clearTimeout,IntersectionObserver:class{constructor(fn){this.fn=fn}s=0;observe(){this.fn([{isIntersecting:true}])}disconnect(){}},};
 if(denied){Object.defineProperty(window,'localStorage',{get(){throw Error('blocked')}});Object.defineProperty(sandbox,'localStorage',{get(){throw Error('blocked')}})}
 const context=vm.createContext(sandbox),run=p=>vm.runInContext(read(p),context);const flush=()=>{let limit=50;while(timers.length&&limit--)timers.shift()();assert(limit>0)};
 const button=label=>desc(body).find(n=>n.tagName==='BUTTON'&&n.textContent===label);
 return {context,run,flush,document,window,local,session,timers,sent,replaces,button,body};
}
for(const pathname of ['/','/evento/','/evento-v2/','/checkout/','/checkout-v2/']){
 const e=env({pathname});e.run('assets/public-privacy.js');e.run('assets/ct-analytics.js');e.flush();assert.equal(e.sent.length,0);assert.equal(e.session.getItem('CT_ANALYTICS_SESSION_V1'),null);
 e.button('Continuar sem estas opções').dispatchEvent({type:'click'});e.flush();assert.equal(e.sent.length,0);assert.equal(e.window.CTPrivacy.allowed('analytics'),false);
 e.button('Permitir métricas e mapa').dispatchEvent({type:'click'});e.flush();assert.equal(e.sent.length,1);assert(e.session.getItem('CT_ANALYTICS_SESSION_V1'));
 const payload=JSON.parse(e.sent[0].children.find(n=>n.name==='argsJson').value)[0][0];assert.deepEqual(Object.keys(payload),['pagina','sessaoId','eventoId','origem','referrerHost','dispositivo']);assert.equal(payload.origem,'CANARIO');
 e.button('Continuar sem estas opções').dispatchEvent({type:'click'});assert.equal(e.session.getItem('CT_ANALYTICS_SESSION_V1'),null);e.button('Permitir métricas e mapa').dispatchEvent({type:'click'});e.flush();assert.equal(e.sent.length,1);
 console.log('PASS consent gate, storage cleanup, payload and deduplication '+pathname);
}
{
 const e=env({pathname:'/evento/',explicitRecovery:false});e.run('assets/public-privacy.js');e.run('assets/ct-analytics.js');e.flush();assert.equal(e.replaces.length,1);assert(e.replaces[0].includes('page=evento'));assert.equal(e.sent.length,0);console.log('PASS event recovery independent of denied analytics');
}
{
 const e=env({pathname:'/evento/'});e.run('assets/ct-analytics.js');e.flush();assert.equal(e.sent.length,0);console.log('PASS absent consent controller fails closed for analytics');
}
{
 const e=env({choice:{version:1,analytics:true,maps:true}});e.run('assets/public-privacy.js');e.run('assets/ct-analytics.js');e.button('Continuar sem estas opções').dispatchEvent({type:'click'});e.flush();assert.equal(e.sent.length,0);console.log('PASS revocation before deferred send');
}
{
 const e=env({choice:{version:1,analytics:true,maps:true}});e.run('assets/public-privacy.js');e.local.removeItem('ct-public-privacy-v1');e.window.dispatchEvent({type:'storage',key:'ct-public-privacy-v1',storageArea:e.local});assert.equal(e.window.CTPrivacy.allowed('analytics'),false);
 e.local.setItem('ct-public-privacy-v1',JSON.stringify({version:1,analytics:true,maps:false}));e.window.dispatchEvent({type:'pageshow',persisted:true});assert.equal(e.window.CTPrivacy.allowed('analytics'),true);assert.equal(e.window.CTPrivacy.allowed('maps'),false);console.log('PASS cross-tab deletion and BFCache state reconciliation');
}
for(const denied of [false,true]){
 const e=env({denied,choice:{version:2,analytics:true,maps:true}});e.run('assets/public-privacy.js');assert.equal(e.window.CTPrivacy.allowed('analytics'),false);e.button('Permitir métricas e mapa').dispatchEvent({type:'click'});assert.equal(e.window.CTPrivacy.allowed('analytics'),true);if(denied)assert.equal(e.document.getElementById('ct-privacy-dialog').open,true);console.log('PASS malformed state/storage-denied '+denied);
}
{
 const e=env();e.run('assets/public-privacy.js');e.run('assets/event-map-preview.js');const host=element('div');e.window.CTEventMapPreview.render(host,'Local Sintético, Rua de Teste, Recife, PE');assert.equal(host.children.flatMap(x=>[x,...desc(x)]).filter(n=>n.tagName==='IFRAME').length,0);
 const once=host.children.find(x=>x.className==='event-map-once');once.dispatchEvent({type:'click'});assert.equal(host.children.flatMap(x=>[x,...desc(x)]).filter(n=>n.tagName==='IFRAME').length,1);assert.equal(e.window.CTPrivacy.allowed('maps'),false);
 e.button('Continuar sem estas opções').dispatchEvent({type:'click'});assert.equal(host.children.flatMap(x=>[x,...desc(x)]).filter(n=>n.tagName==='IFRAME').length,0);
 e.button('Permitir métricas e mapa').dispatchEvent({type:'click'});assert.equal(host.children.flatMap(x=>[x,...desc(x)]).filter(n=>n.tagName==='IFRAME').length,1);
 e.window.CTEventMapPreview.clear();assert.equal(host.hidden,true);assert.equal(host.children.length,0);console.log('PASS map default deny, one-time load, revoke, allow, clear');
}
{
 const e=env({pathname:'/eventos-v2/',scoped:false});e.run('assets/ct-analytics.js');e.document.currentScript=null;e.flush();assert.equal(e.sent.length,1);assert(e.session.getItem('CT_ANALYTICS_SESSION_V1'));e.document.dispatchEvent({type:'ct:privacy'});e.flush();assert.equal(e.sent.length,1);console.log('PASS internal legacy analytics preserved without public scope');
}
{
 const e=env();e.run('assets/ct-analytics.js');e.document.currentScript=null;e.window.CTPrivacy={allowed(){throw Error('broken controller')}};e.flush();assert.equal(e.sent.length,0);console.log('PASS public scope captured before callbacks and broken controller fails closed');
}
{
 const e=env({choice:{version:1,analytics:false,maps:true}});e.run('assets/event-map-preview.js');const host=element('div');e.window.CTEventMapPreview.render(host,'Local Sintético, Rua de Teste, Recife, PE');assert.equal(host.children.flatMap(x=>[x,...desc(x)]).filter(n=>n.tagName==='IFRAME').length,0);e.run('assets/public-privacy.js');assert.equal(host.children.flatMap(x=>[x,...desc(x)]).filter(n=>n.tagName==='IFRAME').length,1);console.log('PASS restored map permission after late controller initialization');
}
console.log('All isolated runtime checks passed. These VM checks are not browser/layout validation.');
