'use strict';
// Local-only integration of the actual destination resolver, navigation and map modules.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
function events(o={}){const handlers={};o.addEventListener=(k,f)=>(handlers[k]||=[]).push(f);o.dispatchEvent=e=>(handlers[e.type]||[]).forEach(f=>f(e));return o;}
const created=[],ids={},timers=new Map();let seq=0,permission=false,externalCalls=0,language='pt-BR',copied=[];
function node(tag='div'){
 const n=events({tagName:tag.toUpperCase(),attrs:{},children:[],hidden:false,value:'',textContent:'',disabled:false});
 n.classList={add(){},remove(){}};n.setAttribute=(k,v)=>n.attrs[k]=String(v);n.getAttribute=k=>n.attrs[k]??null;n.removeAttribute=k=>delete n.attrs[k];
 for(const key of ['href','src'])Object.defineProperty(n,key,{get(){return n.attrs[key]},set(v){n.attrs[key]=String(v)}});
 n.remove=()=>{if(n.parentNode){n.parentNode.children=n.parentNode.children.filter(c=>c!==n);n.parentNode=null;}};
 n.append=(...children)=>children.forEach(c=>{c.remove();c.parentNode=n;n.children.push(c)});
 n.replaceChildren=(...children)=>{for(const c of n.children)c.parentNode=null;n.children=[];n.append(...children)};
 n.insertBefore=(c,b)=>{c.remove();const i=n.children.indexOf(b);c.parentNode=n;i<0?n.children.push(c):n.children.splice(i,0,c)};
 n.after=c=>{const parent=n.parentNode;if(parent)parent.insertBefore(c,parent.children[parent.children.indexOf(n)+1]||null)};
 n.querySelector=tag=>n.children.find(c=>c.tagName===tag.toUpperCase())||null;
 n.focus=()=>document.activeElement=n;n.select=()=>{};n.setSelectionRange=()=>{};
 created.push(n);return n;
}
for(const id of ['details','unavailable','address','map','copy','status','uber','uber-label','uber-note','waze','waze-label','waze-note','map-preview'])ids['directions-'+id]=node(id==='address'?'textarea':id==='map'?'a':'div');
const actions=node();actions.append(ids['directions-uber'],ids['directions-waze'],ids['directions-map'],ids['directions-copy']);ids['directions-map'].append(node('span'));
const fail=()=>{externalCalls++;throw Error('NETWORK/NAVIGATION FORBIDDEN');};
const document=events({getElementById:id=>ids[id],createElement:node,activeElement:null});
const window=events({CTPrivacy:{allowed:()=>permission},CTPublicI18n:{getLocale:()=>language},isSecureContext:true,open:fail,fetch:fail});
const context=vm.createContext({window,document,URL,fetch:fail,XMLHttpRequest:fail,WebSocket:fail,navigator:{clipboard:{writeText:async s=>copied.push(s)},geolocation:{getCurrentPosition:fail}},setTimeout:f=>{timers.set(++seq,f);return seq},clearTimeout:id=>timers.delete(id)});
for(const asset of ['event-ride-destinations','event-uber','event-directions','event-map-preview'])vm.runInContext(fs.readFileSync(path.join(root,'assets',asset+'.js'),'utf8'),context,{filename:asset});
const ride=window.CTEventUber,directions=window.CTEventDirections,maps=window.CTEventMapPreview,el=s=>ids['directions-'+s];
const location={local:'Local sintético',endereco:'Rua de Teste, 17',cidade:'Recife',uf:'PE'};
function event(id='EVT-THIRD-SYNTHETIC',point={latitude:-8.0123,longitude:-34.9876}){return{id,...location,destinoTransporte:{version:1,eventId:id,revision:1,confirmed:true,...point,location:{...location}}};}
function render(e,id=e.id){directions.render(e,id);ride.render(e,id);maps.renderPublicDirections();}
function frames(){return created.filter(n=>{if(n.tagName!=='IFRAME')return false;for(let p=n.parentNode;p;p=p.parentNode)if(p===el('map-preview'))return true;return false;});}
function absent(){assert.equal(el('details').hidden,true);assert.equal(el('uber').getAttribute('href'),null);assert.equal(el('waze').getAttribute('href'),null);assert.equal(el('map').getAttribute('href'),null);assert.equal(el('map-preview').hidden,true);assert.equal(directions.getMapDestination(),'');assert.equal(frames().length,0);}
let checks=0;function check(f){f();checks++}
const third=event();render(third);
check(()=>{assert.equal(el('details').hidden,false);assert.equal(frames().length,0);assert.equal(created.filter(n=>n.tagName==='IFRAME'&&n.src).length,0)});
const expected='-8.0123,-34.9876';
check(()=>{assert.equal(ride.buildMapsDestination(third,third.id),expected);assert.equal(directions.getMapDestination(),expected);assert.equal(new URL(el('map').href).searchParams.get('destination'),expected);assert.equal(new URL(el('waze').href).searchParams.get('ll'),expected);const drop=JSON.parse(new URL(el('uber').href).searchParams.get('drop[0]'));assert.equal(drop.latitude+','+drop.longitude,expected);assert.match(el('address').value,/Rua de Teste/);assert(!el('address').value.includes(expected));});
const once=el('map-preview').children.find(n=>n.className==='event-map-once');once.dispatchEvent({type:'click'});
check(()=>{assert.equal(frames().length,1);assert.equal(new URL(frames()[0].src).searchParams.get('q'),expected);assert.equal(permission,false);assert.equal(frames()[0].referrerPolicy,'no-referrer');assert.match(frames()[0].getAttribute('allow'),/geolocation 'none'/)});
const oldFrame=frames()[0],oldLoad=oldFrame.onload;
for(const locale of ['pt-BR','en-US','es','zh-Hans'])check(()=>{language=locale;document.dispatchEvent({type:'ct:public-language'});assert.equal(frames()[0],oldFrame);assert.equal(new URL(el('waze').href).searchParams.get('ll'),expected);});
render(event('EVT-FOURTH-SYNTHETIC',{latitude:12.34,longitude:56.78}));
check(()=>{assert.equal(frames().length,0);assert.equal(oldFrame.src,undefined);once.dispatchEvent({type:'click'});oldLoad();assert.equal(frames().length,0);assert.equal(directions.getMapDestination(),'12.34,56.78');});
permission=true;document.dispatchEvent({type:'ct:privacy'});
check(()=>assert.equal(new URL(frames()[0].src).searchParams.get('q'),'12.34,56.78'));
permission=false;document.dispatchEvent({type:'ct:privacy'});
check(()=>{assert.equal(frames().length,0);assert.equal(el('map-preview').hidden,false)});
for(const patch of [null,undefined,{},false,[],{...third.destinoTransporte,version:2},{...third.destinoTransporte,eventId:'EVT-OTHER'},{...third.destinoTransporte,confirmed:false},{...third.destinoTransporte,revision:0},{...third.destinoTransporte,revision:1.2},{...third.destinoTransporte,revision:Number.MAX_SAFE_INTEGER+1},{...third.destinoTransporte,latitude:'-8'},{...third.destinoTransporte,latitude:NaN},{...third.destinoTransporte,longitude:Infinity},{...third.destinoTransporte,latitude:91},{...third.destinoTransporte,longitude:181},{...third.destinoTransporte,latitude:0,longitude:0},{...third.destinoTransporte,location:null}])check(()=>{render(third);render({...third,destinoTransporte:patch});absent();});
for(const key of ['local','endereco','cidade','uf'])check(()=>{render(third);render({...third,[key]:'Alterado'});absent();});
check(()=>{render(third);render(third,'EVT-OTHER');absent()});
for(const [id,point] of Object.entries(window.CTEventRideDestinations)){
 const legacy={id,...Object.fromEntries(['local','endereco','cidade','uf'].map(k=>[k,point[k]]))};
 check(()=>{render(legacy);assert.equal(directions.getMapDestination(),point.latitude+','+point.longitude);render({...legacy,destinoTransporte:null});absent();});
}
check(()=>{const legacy={id:'EVT-LEGACY-UNKNOWN',...location};render(legacy);assert.equal(el('uber').hidden,true);assert.equal(el('waze').hidden,true);assert.equal(directions.getMapDestination(),el('address').value);assert.equal(frames().length,0)});
check(()=>{render(third);el('map').href='https://www.google.com/maps/dir/?api=1&destination=8,9';maps.renderPublicDirections();assert.equal(el('map-preview').hidden,true);assert.equal(frames().length,0)});
check(()=>{render(third);el('map').href='https://untrusted.example/maps/dir/?destination='+expected;maps.renderPublicDirections();assert.equal(el('map-preview').hidden,true)});
check(()=>{const withSecrets={...third,email:'PRIVATE_EMAIL',token:'PRIVATE_TOKEN',comprador:'PRIVATE_BUYER'};render(withSecrets);for(const key of ['map','uber','waze'])assert(!/PRIVATE_|token|email|comprador/.test(el(key).href));assert.equal(externalCalls,0)});
for(const route of ['evento','evento-v2'])check(()=>{const html=fs.readFileSync(path.join(root,route,'index.html'),'utf8');assert.match(html,/CTEventDirections\.render\(e,state\.eventoId\)/);assert.equal((html.match(/CTEventMapPreview\.clear\(\)/g)||[]).length,2);assert.equal((html.match(/CTEventDirections\.render\(\{\},state\.eventoId\)/g)||[]).length,2);assert(html.indexOf('/assets/event-uber.js')<html.indexOf('/assets/event-map-preview.js'));});
console.log(JSON.stringify({passed:true,checks,externalCalls,scope:'Actual resolver + navigation + consent-gated map in a synthetic DOM; both template wiring checks, no browser/remote services'}));
